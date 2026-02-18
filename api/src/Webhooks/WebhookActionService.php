<?php
/**
 * NOMAD CMS - Webhook Action Service
 * 
 * Main orchestrator that connects webhooks with actions.
 * Handles:
 * - Action CRUD operations
 * - Provider configuration management
 * - Action chain management
 * - Template management
 * - Execution logging
 */

declare(strict_types=1);

namespace NomadCMS\Webhooks;

use NomadCMS\Webhooks\Actions\ActionRegistry;
use NomadCMS\Webhooks\Actions\ActionContext;
use NomadCMS\Webhooks\Actions\ActionResult;
use PDO;

class WebhookActionService
{
    private PDO $db;
    private ActionRegistry $registry;
    private ActionExecutor $executor;
    private PayloadMapper $payloadMapper;
    private ConditionEvaluator $conditionEvaluator;
    private ?object $encryptionService;
    
    public function __construct(
        ?PDO $db = null,
        ?ActionRegistry $registry = null,
        ?object $encryptionService = null
    ) {
        $this->db = $db ?? $this->createDatabase();
        $this->registry = $registry ?? ActionRegistry::getInstance();
        $this->payloadMapper = new PayloadMapper();
        $this->conditionEvaluator = new ConditionEvaluator();
        $this->executor = new ActionExecutor($this->registry, $this->conditionEvaluator, $this->payloadMapper);
        $this->encryptionService = $encryptionService;
    }
    
    /**
     * Create database connection
     */
    private function createDatabase(): PDO
    {
        $dbPath = dirname(__DIR__, 2) . '/databases/system.sqlite';
        $db = new PDO("sqlite:{$dbPath}");
        $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        return $db;
    }
    
    // ==========================================
    // ACTION CRUD
    // ==========================================
    
    /**
     * Create a new action configuration
     */
    public function createAction(array $data): array
    {
        $id = $data['id'] ?? 'action_' . uniqid();
        
        $stmt = $this->db->prepare("
            INSERT INTO webhook_actions (
                name, action_type, endpoint_id, condition_expression,
                payload_mapping, action_config, priority,
                is_active, created_at
            ) VALUES (
                :name, :action_type, :endpoint_id, :condition_expression,
                :payload_mapping, :action_config, :priority,
                :is_active, :created_at
            )
        ");
        
        $stmt->execute([
            ':name' => $data['name'] ?? $data['action_type'],
            ':action_type' => $data['action_type'],
            ':endpoint_id' => $data['endpoint_id'] ?? $data['webhook_id'] ?? null,
            ':condition_expression' => is_array($data['trigger_condition'] ?? null) ? json_encode($data['trigger_condition']) : ($data['trigger_condition'] ?? $data['condition_expression'] ?? null),
            ':payload_mapping' => json_encode($data['payload_mapping'] ?? []),
            ':action_config' => json_encode($data['action_config'] ?? $data['config'] ?? []),
            ':priority' => $data['priority'] ?? 0,
            ':is_active' => ($data['enabled'] ?? $data['is_active'] ?? true) ? 1 : 0,
            ':created_at' => date('c'),
        ]);
        
        $newId = $this->db->lastInsertId();
        return $this->getAction($newId);
    }
    
    /**
     * Get action by ID
     */
    public function getAction(string|int $id): ?array
    {
        $stmt = $this->db->prepare("SELECT * FROM webhook_actions WHERE id = :id");
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$row) {
            return null;
        }
        
        return $this->decodeAction($row);
    }
    
    /**
     * Get actions for a webhook or endpoint
     * Accepts endpoint_id or endpoint_key
     */
    public function getActionsForWebhook(string $webhookId): array
    {
        // Try as endpoint_id first
        $stmt = $this->db->prepare("
            SELECT * FROM webhook_actions 
            WHERE endpoint_id = :endpoint_id AND is_active = 1
            ORDER BY priority DESC, created_at ASC
        ");
        $stmt->execute([
            ':endpoint_id' => is_numeric($webhookId) ? (int)$webhookId : 0
        ]);
        
        $results = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // If no results, this might be an endpoint_key - look it up
        if (empty($results) && !is_numeric($webhookId)) {
            $endpointStmt = $this->db->prepare("
                SELECT id FROM webhook_endpoints WHERE endpoint_key = :key
            ");
            $endpointStmt->execute([':key' => $webhookId]);
            $endpoint = $endpointStmt->fetch(PDO::FETCH_ASSOC);
            
            if ($endpoint) {
                $stmt2 = $this->db->prepare("
                    SELECT * FROM webhook_actions 
                    WHERE endpoint_id = :endpoint_id AND is_active = 1
                    ORDER BY priority DESC, created_at ASC
                ");
                $stmt2->execute([':endpoint_id' => $endpoint['id']]);
                $results = $stmt2->fetchAll(PDO::FETCH_ASSOC);
            }
        }
        
        return array_map([$this, 'decodeAction'], $results);
    }
    
    /**
     * Update action
     */
    public function updateAction(string|int $id, array $data): ?array
    {
        $updates = [];
        $params = [':id' => $id];
        
        // Map old field names to new ones
        $fieldMapping = [
            'webhook_id' => 'endpoint_id',
            'trigger_conditions' => 'condition_expression',
            'config' => 'action_config',
            'enabled' => 'is_active',
        ];
        
        $allowedFields = [
            'name', 'action_type', 'endpoint_id', 'condition_expression',
            'payload_mapping', 'action_config', 'priority', 'is_active'
        ];
        
        foreach ($data as $field => $value) {
            // Map old field names to new
            $actualField = $fieldMapping[$field] ?? $field;
            
            if (!in_array($actualField, $allowedFields)) {
                continue;
            }
            
            if (in_array($actualField, ['condition_expression', 'payload_mapping', 'action_config'])) {
                $value = is_array($value) ? json_encode($value) : $value;
            } elseif ($actualField === 'is_active') {
                $value = $value ? 1 : 0;
            }
            
            $updates[] = "{$actualField} = :{$actualField}";
            $params[":{$actualField}"] = $value;
        }
        
        if (empty($updates)) {
            return $this->getAction($id);
        }
        
        $updates[] = "updated_at = :updated_at";
        $params[':updated_at'] = date('c');
        
        $sql = "UPDATE webhook_actions SET " . implode(', ', $updates) . " WHERE id = :id";
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        
        return $this->getAction($id);
    }
    
    /**
     * Delete action
     */
    public function deleteAction(string|int $id): bool
    {
        $stmt = $this->db->prepare("DELETE FROM webhook_actions WHERE id = :id");
        return $stmt->execute([':id' => $id]);
    }
    
    /**
     * List all actions
     */
    public function listActions(array $filters = []): array
    {
        $where = ['1=1'];
        $params = [];
        
        if (!empty($filters['endpoint_id']) || !empty($filters['webhook_id'])) {
            $where[] = 'endpoint_id = :endpoint_id';
            $params[':endpoint_id'] = $filters['endpoint_id'] ?? $filters['webhook_id'];
        }
        
        if (!empty($filters['action_type'])) {
            $where[] = 'action_type = :action_type';
            $params[':action_type'] = $filters['action_type'];
        }
        
        if (isset($filters['is_active']) || isset($filters['enabled'])) {
            $where[] = 'is_active = :is_active';
            $params[':is_active'] = ($filters['is_active'] ?? $filters['enabled']) ? 1 : 0;
        }
        
        $limit = $filters['limit'] ?? 100;
        $offset = $filters['offset'] ?? 0;
        
        $sql = "
            SELECT * FROM webhook_actions 
            WHERE " . implode(' AND ', $where) . "
            ORDER BY priority DESC, created_at DESC
            LIMIT :limit OFFSET :offset
        ";
        
        $stmt = $this->db->prepare($sql);
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value);
        }
        
        $stmt->execute();
        
        return array_map([$this, 'decodeAction'], $stmt->fetchAll(PDO::FETCH_ASSOC));
    }
    
    // ==========================================
    // PROVIDER CONFIGURATION
    // ==========================================
    
    /**
     * Create provider configuration
     */
    public function createProviderConfig(array $data): array
    {
        $id = $data['id'] ?? 'provider_' . uniqid();
        
        // Encrypt sensitive fields
        $config = $data['config'] ?? [];
        if ($this->encryptionService) {
            $config = $this->encryptSensitiveFields($config, $data['provider_type']);
        }
        
        $stmt = $this->db->prepare("
            INSERT INTO webhook_provider_configs (
                id, name, provider_type, config, is_default, created_at
            ) VALUES (
                :id, :name, :provider_type, :config, :is_default, :created_at
            )
        ");
        
        $stmt->execute([
            ':id' => $id,
            ':name' => $data['name'],
            ':provider_type' => $data['provider_type'],
            ':config' => json_encode($config),
            ':is_default' => ($data['is_default'] ?? false) ? 1 : 0,
            ':created_at' => date('c'),
        ]);
        
        // If this is default, unset other defaults
        if ($data['is_default'] ?? false) {
            $this->db->prepare("
                UPDATE webhook_provider_configs 
                SET is_default = 0 
                WHERE provider_type = :type AND id != :id
            ")->execute([':type' => $data['provider_type'], ':id' => $id]);
        }
        
        return $this->getProviderConfig($id);
    }
    
    /**
     * Get provider configuration
     */
    public function getProviderConfig(string $id): ?array
    {
        $stmt = $this->db->prepare("SELECT * FROM webhook_provider_configs WHERE id = :id");
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$row) {
            return null;
        }
        
        return $this->decodeProviderConfig($row);
    }
    
    /**
     * Get default provider config for a type
     */
    public function getDefaultProviderConfig(string $providerType): ?array
    {
        $stmt = $this->db->prepare("
            SELECT * FROM webhook_provider_configs 
            WHERE provider_type = :type AND is_default = 1
        ");
        $stmt->execute([':type' => $providerType]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$row) {
            return null;
        }
        
        return $this->decodeProviderConfig($row);
    }
    
    /**
     * List provider configurations
     */
    public function listProviderConfigs(?string $type = null): array
    {
        if ($type) {
            $stmt = $this->db->prepare("
                SELECT * FROM webhook_provider_configs 
                WHERE provider_type = :type 
                ORDER BY is_default DESC, name ASC
            ");
            $stmt->execute([':type' => $type]);
        } else {
            $stmt = $this->db->query("
                SELECT * FROM webhook_provider_configs 
                ORDER BY provider_type, is_default DESC, name ASC
            ");
        }
        
        return array_map([$this, 'decodeProviderConfig'], $stmt->fetchAll(PDO::FETCH_ASSOC));
    }
    
    /**
     * Update provider configuration
     */
    public function updateProviderConfig(string $id, array $data): ?array
    {
        $existing = $this->getProviderConfig($id);
        if (!$existing) {
            return null;
        }
        
        $updates = [];
        $params = [':id' => $id];
        
        if (isset($data['name'])) {
            $updates[] = 'name = :name';
            $params[':name'] = $data['name'];
        }
        
        if (isset($data['config'])) {
            $config = $data['config'];
            if ($this->encryptionService) {
                $config = $this->encryptSensitiveFields($config, $existing['provider_type']);
            }
            $updates[] = 'config = :config';
            $params[':config'] = json_encode($config);
        }
        
        if (isset($data['is_default'])) {
            $updates[] = 'is_default = :is_default';
            $params[':is_default'] = $data['is_default'] ? 1 : 0;
            
            if ($data['is_default']) {
                $this->db->prepare("
                    UPDATE webhook_provider_configs 
                    SET is_default = 0 
                    WHERE provider_type = :type AND id != :id
                ")->execute([':type' => $existing['provider_type'], ':id' => $id]);
            }
        }
        
        if (empty($updates)) {
            return $existing;
        }
        
        $updates[] = 'updated_at = :updated_at';
        $params[':updated_at'] = date('c');
        
        $sql = "UPDATE webhook_provider_configs SET " . implode(', ', $updates) . " WHERE id = :id";
        $this->db->prepare($sql)->execute($params);
        
        return $this->getProviderConfig($id);
    }
    
    /**
     * Delete provider configuration
     */
    public function deleteProviderConfig(string $id): bool
    {
        $stmt = $this->db->prepare("DELETE FROM webhook_provider_configs WHERE id = :id");
        return $stmt->execute([':id' => $id]);
    }
    

    
    // ==========================================
    // EXECUTION
    // ==========================================
    
    /**
     * Execute actions for a webhook
     */
    public function executeWebhookActions(
        string $webhookId,
        array $payload,
        array $headers = [],
        ?array $providerConfig = null
    ): array {
        $executionId = 'exec_' . uniqid();
        $startTime = microtime(true);
        
        // Get actions for this webhook
        $actions = $this->getActionsForWebhook($webhookId);
        
        if (empty($actions)) {
            return [
                'execution_id' => $executionId,
                'success' => true,
                'message' => 'No actions configured',
                'results' => [],
            ];
        }
        
        $results = [];
        $allSuccess = true;
        
        foreach ($actions as $actionConfig) {
            // Check trigger conditions
            if (!empty($actionConfig['trigger_conditions'])) {
                $conditions = $actionConfig['trigger_conditions'];
                $conditionMet = true;
                
                foreach ($conditions as $condition) {
                    if (!$this->conditionEvaluator->evaluate($condition, $payload)) {
                        $conditionMet = false;
                        break;
                    }
                }
                
                if (!$conditionMet) {
                    $results[] = [
                        'action_id' => $actionConfig['id'],
                        'action_type' => $actionConfig['action_type'],
                        'success' => true,
                        'skipped' => true,
                        'reason' => 'Trigger condition not met',
                    ];
                    continue;
                }
            }
            
            // Get action instance
            $action = $this->registry->get($actionConfig['action_type']);
            
            if (!$action) {
                $results[] = [
                    'action_id' => $actionConfig['id'],
                    'action_type' => $actionConfig['action_type'],
                    'success' => false,
                    'error' => 'Action type not found',
                ];
                $allSuccess = false;
                continue;
            }
            
            // Build context
            $context = new ActionContext(
                originalPayload: $payload,
                mappedPayload: [],
                headers: $headers,
                webhookId: $webhookId,
                actionId: $actionConfig['id'],
                actionConfig: $actionConfig['config'] ?? [],
                providerConfig: $this->resolveProviderConfig($actionConfig, $providerConfig),
                executionId: $executionId
            );
            
            // Apply payload mapping
            if (!empty($actionConfig['payload_mapping'])) {
                $context->mappedPayload = $this->payloadMapper->transform(
                    $payload,
                    $actionConfig['payload_mapping']
                );
            }
            
            // Execute action
            $result = $this->executor->executeAction($action, $context);
            
            // Log execution
            $this->logExecution($executionId, $actionConfig, $result, $context);
            
            $results[] = [
                'action_id' => $actionConfig['id'],
                'action_type' => $actionConfig['action_type'],
                'success' => $result->success,
                'status_code' => $result->statusCode,
                'data' => $result->data,
                'error' => $result->error,
                'execution_time_ms' => $result->executionTimeMs,
            ];
            
            if (!$result->success) {
                $allSuccess = false;
            }
        }
        
        $totalTime = (int)((microtime(true) - $startTime) * 1000);
        
        return [
            'execution_id' => $executionId,
            'success' => $allSuccess,
            'total_actions' => count($actions),
            'executed' => count(array_filter($results, fn($r) => !($r['skipped'] ?? false))),
            'successful' => count(array_filter($results, fn($r) => $r['success'] && !($r['skipped'] ?? false))),
            'total_time_ms' => $totalTime,
            'results' => $results,
        ];
    }
    
    /**
     * Execute a chain
     */
    public function executeChain(
        string $chainId,
        array $payload,
        array $headers = [],
        ?array $providerConfig = null
    ): array {
        $chain = $this->getChain($chainId);
        
        if (!$chain) {
            throw new \InvalidArgumentException("Chain not found: {$chainId}");
        }
        
        if (!$chain['enabled']) {
            return [
                'success' => true,
                'skipped' => true,
                'reason' => 'Chain is disabled',
            ];
        }
        
        $executionId = 'exec_' . uniqid();
        
        // Build chain steps
        $steps = [];
        foreach ($chain['members'] as $member) {
            $action = $this->getAction($member['action_id']);
            
            if (!$action) {
                continue;
            }
            
            $steps[] = [
                'type' => 'action',
                'id' => $member['id'],
                'action_type' => $action['action_type'],
                'condition' => $member['condition'],
                'continue_on_error' => $member['continue_on_error'],
                'config' => array_merge($action['config'] ?? [], $member['config_override'] ?? []),
                'payload_mapping' => $action['payload_mapping'] ?? [],
                'provider_config' => $this->resolveProviderConfig($action, $providerConfig),
            ];
        }
        
        // Create base context
        $context = new ActionContext(
            originalPayload: $payload,
            mappedPayload: [],
            headers: $headers,
            webhookId: $chain['webhook_id'],
            actionId: $chainId,
            actionConfig: [],
            providerConfig: $providerConfig ?? [],
            executionId: $executionId
        );
        
        // Execute chain
        $result = $this->executor->executeChain($steps, $context);
        
        return array_merge(
            $result->toArray(),
            ['execution_id' => $executionId, 'chain_id' => $chainId]
        );
    }
    
    /**
     * Resolve provider configuration
     */
    private function resolveProviderConfig(array $actionConfig, ?array $override = null): array
    {
        $config = [];
        
        // Get from provider_config_id if set
        if (!empty($actionConfig['provider_config_id'])) {
            $providerConfig = $this->getProviderConfig($actionConfig['provider_config_id']);
            if ($providerConfig) {
                $config = $providerConfig['config'] ?? [];
            }
        }
        
        // Merge with override
        if ($override) {
            $config = array_merge($config, $override);
        }
        
        return $config;
    }
    
    /**
     * Log action execution
     */
    private function logExecution(
        string $executionId,
        array $actionConfig,
        ActionResult $result,
        ActionContext $context
    ): void {
        $stmt = $this->db->prepare("
            INSERT INTO webhook_action_logs (
                id, action_id, webhook_id, execution_id, status,
                request_payload, response_data, error_message,
                execution_time_ms, created_at
            ) VALUES (
                :id, :action_id, :webhook_id, :execution_id, :status,
                :request_payload, :response_data, :error_message,
                :execution_time_ms, :created_at
            )
        ");
        
        $stmt->execute([
            ':id' => 'log_' . uniqid(),
            ':action_id' => $actionConfig['id'],
            ':webhook_id' => $context->webhookId,
            ':execution_id' => $executionId,
            ':status' => $result->success ? 'success' : 'failed',
            ':request_payload' => json_encode([
                'original' => $context->originalPayload,
                'mapped' => $context->mappedPayload,
            ]),
            ':response_data' => json_encode($result->data),
            ':error_message' => $result->error,
            ':execution_time_ms' => $result->executionTimeMs,
            ':created_at' => date('c'),
        ]);
    }
    
    /**
     * Get execution logs
     */
    public function getExecutionLogs(array $filters = []): array
    {
        $where = ['1=1'];
        $params = [];
        
        if (!empty($filters['webhook_id'])) {
            $where[] = 'webhook_id = :webhook_id';
            $params[':webhook_id'] = $filters['webhook_id'];
        }
        
        if (!empty($filters['action_id'])) {
            $where[] = 'action_id = :action_id';
            $params[':action_id'] = $filters['action_id'];
        }
        
        if (!empty($filters['execution_id'])) {
            $where[] = 'execution_id = :execution_id';
            $params[':execution_id'] = $filters['execution_id'];
        }
        
        if (!empty($filters['status'])) {
            $where[] = 'status = :status';
            $params[':status'] = $filters['status'];
        }
        
        $limit = $filters['limit'] ?? 100;
        $offset = $filters['offset'] ?? 0;
        
        $stmt = $this->db->prepare("
            SELECT * FROM webhook_action_logs 
            WHERE " . implode(' AND ', $where) . "
            ORDER BY created_at DESC
            LIMIT :limit OFFSET :offset
        ");
        
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value);
        }
        
        $stmt->execute();
        
        return array_map(function($row) {
            return [
                'id' => $row['id'],
                'action_id' => $row['action_id'],
                'webhook_id' => $row['webhook_id'],
                'execution_id' => $row['execution_id'],
                'status' => $row['status'],
                'request_payload' => json_decode($row['request_payload'], true),
                'response_data' => json_decode($row['response_data'], true),
                'error_message' => $row['error_message'],
                'execution_time_ms' => (int)$row['execution_time_ms'],
                'created_at' => $row['created_at'],
            ];
        }, $stmt->fetchAll(PDO::FETCH_ASSOC));
    }
    
    // ==========================================
    // HELPERS
    // ==========================================
    
    /**
     * Decode action from database row
     */
    private function decodeAction(array $row): array
    {
        return [
            'id' => $row['id'],
            'name' => $row['name'],
            'action_type' => $row['action_type'],
            'webhook_id' => $row['webhook_id'] ?? null,
            'trigger_condition' => $row['trigger_condition'] ?? null,
            'payload_mapping' => json_decode($row['payload_mapping'] ?? '{}', true) ?? [],
            'action_config' => json_decode($row['action_config'] ?? '{}', true) ?? [],
            'provider_config_id' => $row['provider_config_id'] ?? null,
            'priority' => (int)($row['priority'] ?? 0),
            'enabled' => (bool)($row['enabled'] ?? true),
            'created_at' => $row['created_at'] ?? null,
            'updated_at' => $row['updated_at'] ?? null,
        ];
    }
    
    /**
     * Decode provider config from database row
     */
    private function decodeProviderConfig(array $row): array
    {
        $config = json_decode($row['config'], true) ?? [];
        
        // Decrypt sensitive fields if encryption service available
        if ($this->encryptionService) {
            $config = $this->decryptSensitiveFields($config, $row['provider_type']);
        }
        
        return [
            'id' => $row['id'],
            'name' => $row['name'],
            'provider_type' => $row['provider_type'],
            'config' => $config,
            'is_default' => (bool)$row['is_default'],
            'created_at' => $row['created_at'],
            'updated_at' => $row['updated_at'] ?? null,
        ];
    }
    
    /**
     * Decode chain from database row
     */
    private function decodeChain(array $row): array
    {
        return [
            'id' => $row['id'],
            'name' => $row['name'],
            'description' => $row['description'] ?? null,
            'trigger_condition' => $row['trigger_condition'] ?? null,
            'event_filter' => $row['event_filter'] ?? null,
            'execution_mode' => $row['execution_mode'] ?? 'sequential',
            'stop_on_failure' => (bool)($row['stop_on_failure'] ?? true),
            'enabled' => (bool)($row['enabled'] ?? true),
            'created_at' => $row['created_at'] ?? null,
            'updated_at' => $row['updated_at'] ?? null,
        ];
    }
    
    /**
     * Encrypt sensitive configuration fields
     */
    private function encryptSensitiveFields(array $config, string $providerType): array
    {
        $sensitiveFields = $this->getSensitiveFields($providerType);
        
        foreach ($sensitiveFields as $field) {
            if (isset($config[$field]) && !empty($config[$field])) {
                $config[$field] = $this->encryptionService->encrypt($config[$field]);
            }
        }
        
        return $config;
    }
    
    /**
     * Decrypt sensitive configuration fields
     */
    private function decryptSensitiveFields(array $config, string $providerType): array
    {
        $sensitiveFields = $this->getSensitiveFields($providerType);
        
        foreach ($sensitiveFields as $field) {
            if (isset($config[$field]) && !empty($config[$field])) {
                try {
                    $config[$field] = $this->encryptionService->decrypt($config[$field]);
                } catch (\Exception $e) {
                    // Field might not be encrypted
                }
            }
        }
        
        return $config;
    }
    
    /**
     * Get sensitive fields for provider type
     */
    private function getSensitiveFields(string $providerType): array
    {
        return match ($providerType) {
            'discord' => ['webhook_url', 'bot_token'],
            'slack' => ['webhook_url', 'bot_token'],
            'telegram' => ['bot_token'],
            'email' => ['api_key', 'smtp_password'],
            'http' => ['api_key', 'auth_token', 'password'],
            default => ['api_key', 'secret', 'token', 'password'],
        };
    }
    
    /**
     * Get action registry
     */
    public function getRegistry(): ActionRegistry
    {
        return $this->registry;
    }
    
    /**
     * Get available action types
     */
    public function getAvailableActions(): array
    {
        return $this->registry->getAll();
    }
    
    /**
     * Get action schema
     */
    public function getActionSchema(string $actionType): ?array
    {
        $action = $this->registry->get($actionType);
        
        if (!$action) {
            return null;
        }
        
        return [
            'type' => $action->getType(),
            'name' => $action->getName(),
            'description' => $action->getDescription(),
            'category' => $action->getCategory(),
            'icon' => $action->getIcon(),
            'config_schema' => $action->getConfigSchema(),
            'expected_fields' => $action->getExpectedFields(),
        ];
    }
}
