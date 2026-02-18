<?php
/**
 * NOMAD CMS - Webhook Actions API Endpoint
 * 
 * REST API for managing webhook actions, providers, chains, and templates
 */

declare(strict_types=1);

namespace NomadCMS\Endpoints;

use NomadCMS\Webhooks\WebhookActionService;
use NomadCMS\Webhooks\PayloadMapper;

class WebhookActionsEndpoint
{
    private WebhookActionService $service;
    private array $headers = [];
    private array $body = [];
    private string $method = 'GET';
    
    public function __construct(?WebhookActionService $service = null)
    {
        $this->service = $service ?? new WebhookActionService();
        $this->method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
        $this->headers = getallheaders() ?: [];
        
        if (in_array($this->method, ['POST', 'PUT', 'PATCH'])) {
            $this->body = json_decode(file_get_contents('php://input'), true) ?? [];
        }
    }
    
    /**
     * Handle incoming request
     */
    public function handle(string $path, array $params = []): array
    {
        // Remove /api/webhook-actions prefix
        $path = preg_replace('#^/api/webhook-actions/?#', '', $path);
        $segments = array_filter(explode('/', $path));
        
        // Route to appropriate handler
        $resource = array_shift($segments) ?? '';
        
        try {
            return match ($resource) {
                '' => $this->handleRoot(),
                'actions' => $this->handleActions($segments),
                'providers' => $this->handleProviders($segments),
                'types' => $this->handleTypes($segments),
                'logs' => $this->handleLogs($segments),
                'execute' => $this->handleExecute($segments),
                'mapper' => $this->handleMapper($segments),
                default => $this->error('Not found', 404),
            };
        } catch (\Exception $e) {
            return $this->error($e->getMessage(), 500);
        }
    }
    
    private function handleRoot(): array
    {
        return $this->success([
            'version' => '2.0',
            'endpoints' => [
                '/actions' => 'Action configurations CRUD',
                '/providers' => 'Provider configurations CRUD',
                '/types' => 'Available action types',
                '/logs' => 'Execution logs',
                '/execute' => 'Manual execution',
                '/mapper/suggest' => 'Payload mapping suggestions',
            ],
        ]);
    }
    
    // ==========================================
    // ACTIONS
    // ==========================================
    
    private function handleActions(array $segments): array
    {
        $id = $segments[0] ?? null;
        $subResource = $segments[1] ?? null;
        
        return match ($this->method) {
            'GET' => $id ? $this->getAction($id) : $this->listActions(),
            'POST' => $this->createAction(),
            'PUT', 'PATCH' => $id ? $this->updateAction($id) : $this->error('ID required', 400),
            'DELETE' => $id ? $this->deleteAction($id) : $this->error('ID required', 400),
            default => $this->error('Method not allowed', 405),
        };
    }
    
    private function listActions(): array
    {
        $filters = [
            'webhook_id' => $_GET['webhook_id'] ?? null,
            'action_type' => $_GET['action_type'] ?? null,
            'enabled' => isset($_GET['enabled']) ? filter_var($_GET['enabled'], FILTER_VALIDATE_BOOLEAN) : null,
            'limit' => (int)($_GET['limit'] ?? 100),
            'offset' => (int)($_GET['offset'] ?? 0),
        ];
        
        $actions = $this->service->listActions(array_filter($filters, fn($v) => $v !== null));
        
        return $this->success([
            'actions' => $actions,
            'count' => count($actions),
        ]);
    }
    
    private function getAction(string $id): array
    {
        $action = $this->service->getAction($id);
        
        if (!$action) {
            return $this->error('Action not found', 404);
        }
        
        // Include action type schema
        $action['type_schema'] = $this->service->getActionSchema($action['action_type']);
        
        return $this->success($action);
    }
    
    private function createAction(): array
    {
        $required = ['action_type'];
        
        foreach ($required as $field) {
            if (empty($this->body[$field])) {
                return $this->error("Missing required field: {$field}", 400);
            }
        }
        
        // Validate action type exists
        if (!$this->service->getActionSchema($this->body['action_type'])) {
            return $this->error("Unknown action type: {$this->body['action_type']}", 400);
        }
        
        $action = $this->service->createAction($this->body);
        
        return $this->success($action, 201);
    }
    
    private function updateAction(string $id): array
    {
        $action = $this->service->updateAction($id, $this->body);
        
        if (!$action) {
            return $this->error('Action not found', 404);
        }
        
        return $this->success($action);
    }
    
    private function deleteAction(string $id): array
    {
        $result = $this->service->deleteAction($id);
        
        if (!$result) {
            return $this->error('Failed to delete action', 500);
        }
        
        return $this->success(['deleted' => true]);
    }
    
    // ==========================================
    // PROVIDERS
    // ==========================================
    
    private function handleProviders(array $segments): array
    {
        $id = $segments[0] ?? null;
        
        return match ($this->method) {
            'GET' => $id ? $this->getProvider($id) : $this->listProviders(),
            'POST' => $this->createProvider(),
            'PUT', 'PATCH' => $id ? $this->updateProvider($id) : $this->error('ID required', 400),
            'DELETE' => $id ? $this->deleteProvider($id) : $this->error('ID required', 400),
            default => $this->error('Method not allowed', 405),
        };
    }
    
    private function listProviders(): array
    {
        $type = $_GET['type'] ?? null;
        $providers = $this->service->listProviderConfigs($type);
        
        // Mask sensitive fields
        foreach ($providers as &$provider) {
            $provider['config'] = $this->maskSensitiveConfig($provider['config'], $provider['provider_type']);
        }
        
        return $this->success([
            'providers' => $providers,
            'count' => count($providers),
        ]);
    }
    
    private function getProvider(string $id): array
    {
        $provider = $this->service->getProviderConfig($id);
        
        if (!$provider) {
            return $this->error('Provider not found', 404);
        }
        
        // Mask sensitive fields unless reveal=true
        if (!filter_var($_GET['reveal'] ?? false, FILTER_VALIDATE_BOOLEAN)) {
            $provider['config'] = $this->maskSensitiveConfig($provider['config'], $provider['provider_type']);
        }
        
        return $this->success($provider);
    }
    
    private function createProvider(): array
    {
        $required = ['name', 'provider_type'];
        
        foreach ($required as $field) {
            if (empty($this->body[$field])) {
                return $this->error("Missing required field: {$field}", 400);
            }
        }
        
        $provider = $this->service->createProviderConfig($this->body);
        
        // Mask sensitive fields
        $provider['config'] = $this->maskSensitiveConfig($provider['config'], $provider['provider_type']);
        
        return $this->success($provider, 201);
    }
    
    private function updateProvider(string $id): array
    {
        $provider = $this->service->updateProviderConfig($id, $this->body);
        
        if (!$provider) {
            return $this->error('Provider not found', 404);
        }
        
        // Mask sensitive fields
        $provider['config'] = $this->maskSensitiveConfig($provider['config'], $provider['provider_type']);
        
        return $this->success($provider);
    }
    
    private function deleteProvider(string $id): array
    {
        $result = $this->service->deleteProviderConfig($id);
        
        if (!$result) {
            return $this->error('Failed to delete provider', 500);
        }
        
        return $this->success(['deleted' => true]);
    }
    
    private function maskSensitiveConfig(array $config, string $type): array
    {
        $sensitiveFields = match ($type) {
            'discord' => ['webhook_url', 'bot_token'],
            'slack' => ['webhook_url', 'bot_token'],
            'telegram' => ['bot_token'],
            'email' => ['api_key', 'smtp_password'],
            default => ['api_key', 'secret', 'token', 'password'],
        };
        
        foreach ($sensitiveFields as $field) {
            if (isset($config[$field]) && !empty($config[$field])) {
                $value = $config[$field];
                $config[$field] = substr($value, 0, 4) . '****' . substr($value, -4);
            }
        }
        
        return $config;
    }
    

    
    // ==========================================
    // TYPES
    // ==========================================
    
    private function handleTypes(array $segments): array
    {
        $type = $segments[0] ?? null;
        
        if ($this->method !== 'GET') {
            return $this->error('Method not allowed', 405);
        }
        
        if ($type) {
            return $this->getType($type);
        }
        
        return $this->listTypes();
    }
    
    private function listTypes(): array
    {
        $actions = $this->service->getAvailableActions();
        $types = [];
        
        foreach ($actions as $type => $action) {
            $types[] = [
                'type' => $action->getType(),
                'name' => $action->getName(),
                'description' => $action->getDescription(),
                'category' => $action->getCategory(),
                'icon' => $action->getIcon(),
            ];
        }
        
        // Group by category
        $grouped = [];
        foreach ($types as $type) {
            $grouped[$type['category']][] = $type;
        }
        
        return $this->success([
            'types' => $types,
            'by_category' => $grouped,
            'count' => count($types),
        ]);
    }
    
    private function getType(string $type): array
    {
        $schema = $this->service->getActionSchema($type);
        
        if (!$schema) {
            return $this->error('Action type not found', 404);
        }
        
        return $this->success($schema);
    }
    
    // ==========================================
    // LOGS
    // ==========================================
    
    private function handleLogs(array $segments): array
    {
        if ($this->method !== 'GET') {
            return $this->error('Method not allowed', 405);
        }
        
        $filters = [
            'webhook_id' => $_GET['webhook_id'] ?? null,
            'action_id' => $_GET['action_id'] ?? null,
            'execution_id' => $_GET['execution_id'] ?? null,
            'status' => $_GET['status'] ?? null,
            'limit' => (int)($_GET['limit'] ?? 100),
            'offset' => (int)($_GET['offset'] ?? 0),
        ];
        
        $logs = $this->service->getExecutionLogs(array_filter($filters, fn($v) => $v !== null));
        
        return $this->success([
            'logs' => $logs,
            'count' => count($logs),
        ]);
    }
    
    // ==========================================
    // EXECUTE
    // ==========================================
    
    private function handleExecute(array $segments): array
    {
        if ($this->method !== 'POST') {
            return $this->error('Method not allowed', 405);
        }
        
        $type = $segments[0] ?? 'action';
        
        return match ($type) {
            'action' => $this->executeAction(),
            'chain' => $this->executeChain(),
            'webhook' => $this->executeWebhook(),
            'test' => $this->executeTest(),
            default => $this->error('Unknown execute type', 400),
        };
    }
    
    private function executeAction(): array
    {
        if (empty($this->body['action_id'])) {
            return $this->error('action_id is required', 400);
        }
        
        $action = $this->service->getAction($this->body['action_id']);
        
        if (!$action) {
            return $this->error('Action not found', 404);
        }
        
        $payload = $this->body['payload'] ?? [];
        $headers = $this->body['headers'] ?? [];
        
        // Execute through the service
        $result = $this->service->executeWebhookActions(
            $action['webhook_id'] ?? 'manual',
            $payload,
            $headers
        );
        
        return $this->success($result);
    }
    
    private function executeChain(): array
    {
        if (empty($this->body['chain_id'])) {
            return $this->error('chain_id is required', 400);
        }
        
        $payload = $this->body['payload'] ?? [];
        $headers = $this->body['headers'] ?? [];
        
        try {
            $result = $this->service->executeChain(
                $this->body['chain_id'],
                $payload,
                $headers
            );
            
            return $this->success($result);
        } catch (\InvalidArgumentException $e) {
            return $this->error($e->getMessage(), 404);
        }
    }
    
    private function executeWebhook(): array
    {
        if (empty($this->body['webhook_id'])) {
            return $this->error('webhook_id is required', 400);
        }
        
        $payload = $this->body['payload'] ?? [];
        $headers = $this->body['headers'] ?? [];
        
        $result = $this->service->executeWebhookActions(
            $this->body['webhook_id'],
            $payload,
            $headers
        );
        
        return $this->success($result);
    }
    
    private function executeTest(): array
    {
        if (empty($this->body['action_type'])) {
            return $this->error('action_type is required', 400);
        }
        
        $registry = $this->service->getRegistry();
        $action = $registry->get($this->body['action_type']);
        
        if (!$action) {
            return $this->error('Action type not found', 404);
        }
        
        // Create temporary action context
        $context = new \NomadCMS\Webhooks\Actions\ActionContext(
            originalPayload: $this->body['payload'] ?? [],
            mappedPayload: $this->body['mapped_payload'] ?? [],
            headers: $this->body['headers'] ?? [],
            webhookId: 'test',
            actionId: 'test_' . uniqid(),
            actionConfig: $this->body['config'] ?? [],
            providerConfig: $this->body['provider_config'] ?? [],
            executionId: 'test_exec_' . uniqid()
        );
        
        // Dry run if specified
        if ($this->body['dry_run'] ?? false) {
            return $this->success([
                'dry_run' => true,
                'action_type' => $this->body['action_type'],
                'context' => [
                    'original_payload' => $context->originalPayload,
                    'mapped_payload' => $context->mappedPayload,
                    'action_config' => $context->actionConfig,
                ],
                'config_valid' => $action->validateConfig($context->actionConfig),
            ]);
        }
        
        // Execute
        $result = $action->execute($context);
        
        return $this->success([
            'action_type' => $this->body['action_type'],
            'success' => $result->success,
            'status_code' => $result->statusCode,
            'data' => $result->data,
            'error' => $result->error,
            'execution_time_ms' => $result->executionTimeMs,
        ]);
    }
    
    // ==========================================
    // MAPPER
    // ==========================================
    
    private function handleMapper(array $segments): array
    {
        $action = $segments[0] ?? null;
        
        if ($this->method !== 'POST') {
            return $this->error('Method not allowed', 405);
        }
        
        return match ($action) {
            'suggest' => $this->suggestMapping(),
            'transform' => $this->transformPayload(),
            'validate' => $this->validateMapping(),
            default => $this->error('Unknown mapper action', 400),
        };
    }
    
    private function suggestMapping(): array
    {
        $sourceType = $this->body['source_type'] ?? null;
        $payload = $this->body['payload'] ?? [];
        $targetFields = $this->body['target_fields'] ?? [];
        
        $suggestion = PayloadMapper::suggestMapping($sourceType, $targetFields);
        
        // Also analyze the payload
        $analysis = $this->analyzePayload($payload);
        
        return $this->success([
            'suggestion' => $suggestion,
            'payload_analysis' => $analysis,
        ]);
    }
    
    private function transformPayload(): array
    {
        $payload = $this->body['payload'] ?? [];
        $mapping = $this->body['mapping'] ?? [];
        
        if (empty($mapping)) {
            return $this->error('mapping is required', 400);
        }
        
        $mapper = new PayloadMapper();
        $result = $mapper->transform($payload, $mapping);
        
        return $this->success([
            'original' => $payload,
            'transformed' => $result,
        ]);
    }
    
    private function validateMapping(): array
    {
        $payload = $this->body['payload'] ?? [];
        $mapping = $this->body['mapping'] ?? [];
        
        $mapper = new PayloadMapper();
        $errors = [];
        $valid = [];
        
        foreach ($mapping as $target => $source) {
            try {
                $value = $mapper->transform($payload, [$target => $source]);
                $valid[$target] = [
                    'source' => $source,
                    'resolved_value' => $value[$target] ?? null,
                ];
            } catch (\Exception $e) {
                $errors[$target] = [
                    'source' => $source,
                    'error' => $e->getMessage(),
                ];
            }
        }
        
        return $this->success([
            'valid' => empty($errors),
            'mappings' => $valid,
            'errors' => $errors,
        ]);
    }
    
    private function analyzePayload(array $payload): array
    {
        $paths = [];
        $this->extractPaths($payload, '', $paths);
        
        return [
            'paths' => $paths,
            'root_keys' => array_keys($payload),
            'depth' => $this->calculateDepth($payload),
        ];
    }
    
    private function extractPaths(array $data, string $prefix, array &$paths): void
    {
        foreach ($data as $key => $value) {
            $path = $prefix ? "{$prefix}.{$key}" : $key;
            
            if (is_array($value)) {
                if (array_keys($value) === range(0, count($value) - 1)) {
                    // Indexed array
                    $paths[] = [
                        'path' => "$.{$path}[*]",
                        'type' => 'array',
                        'sample' => $value[0] ?? null,
                    ];
                    
                    if (!empty($value) && is_array($value[0])) {
                        $this->extractPaths($value[0], "{$path}[*]", $paths);
                    }
                } else {
                    // Object
                    $this->extractPaths($value, $path, $paths);
                }
            } else {
                $paths[] = [
                    'path' => "$.{$path}",
                    'type' => gettype($value),
                    'sample' => $value,
                ];
            }
        }
    }
    
    private function calculateDepth(array $data, int $level = 0): int
    {
        $maxDepth = $level;
        
        foreach ($data as $value) {
            if (is_array($value)) {
                $depth = $this->calculateDepth($value, $level + 1);
                $maxDepth = max($maxDepth, $depth);
            }
        }
        
        return $maxDepth;
    }
    
    // ==========================================
    // RESPONSE HELPERS
    // ==========================================
    
    private function success(array $data, int $code = 200): array
    {
        http_response_code($code);
        return [
            'success' => true,
            'data' => $data,
        ];
    }
    
    private function error(string $message, int $code = 400): array
    {
        http_response_code($code);
        return [
            'success' => false,
            'error' => $message,
            'code' => $code,
        ];
    }
}
