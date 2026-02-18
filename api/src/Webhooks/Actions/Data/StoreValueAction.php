<?php
/**
 * NOMAD CMS - Store Value Action
 * 
 * Stores values in cache/database for later use across webhooks
 */

declare(strict_types=1);

namespace NomadCMS\Webhooks\Actions\Data;

use NomadCMS\Webhooks\Actions\BaseAction;
use NomadCMS\Webhooks\Actions\ActionContext;
use NomadCMS\Webhooks\Actions\ActionResult;

class StoreValueAction extends BaseAction
{
    protected bool $requiresProvider = false;
    
    private const STORAGE_TABLE = 'webhook_key_value_store';
    
    public function getType(): string
    {
        return 'store_value';
    }
    
    public function getName(): string
    {
        return 'Érték Tárolása';
    }
    
    public function getDescription(): string
    {
        return 'Értékek tárolása cache-ben vagy adatbázisban későbbi használatra';
    }
    
    public function getCategory(): string
    {
        return 'data';
    }
    
    public function getIcon(): string
    {
        return '💾';
    }
    
    public function getConfigSchema(): array
    {
        return [
            'type' => 'object',
            'required' => ['operation'],
            'properties' => [
                'operation' => [
                    'type' => 'string',
                    'title' => 'Művelet',
                    'enum' => ['set', 'get', 'delete', 'increment', 'decrement', 'append', 'exists', 'list'],
                ],
                'storage_type' => [
                    'type' => 'string',
                    'title' => 'Tárolási típus',
                    'enum' => ['memory', 'file', 'database'],
                    'default' => 'database',
                ],
                'key' => [
                    'type' => 'string',
                    'title' => 'Kulcs',
                    'description' => 'Támogatja a változókat: {{payload.field}}',
                ],
                'value' => [
                    'type' => ['string', 'number', 'boolean', 'object', 'array'],
                    'title' => 'Érték',
                    'description' => 'set/append műveletekhez',
                ],
                'default_value' => [
                    'type' => ['string', 'number', 'boolean', 'object', 'array'],
                    'title' => 'Alapértelmezett érték',
                    'description' => 'get művelethez ha a kulcs nem létezik',
                ],
                'ttl' => [
                    'type' => 'integer',
                    'title' => 'TTL (másodperc)',
                    'description' => 'Lejárati idő (0 = soha)',
                    'default' => 0,
                ],
                'namespace' => [
                    'type' => 'string',
                    'title' => 'Névtér',
                    'description' => 'Kulcsok csoportosítására',
                    'default' => 'default',
                ],
                'output_variable' => [
                    'type' => 'string',
                    'title' => 'Kimenet változó',
                    'description' => 'Hova mentse az eredményt a context-be',
                ],
                'key_pattern' => [
                    'type' => 'string',
                    'title' => 'Kulcs minta',
                    'description' => 'list művelethez (glob pattern)',
                ],
            ],
        ];
    }
    
    public function getExpectedFields(): array
    {
        return ['key', 'value'];
    }
    
    public function execute(ActionContext $context): ActionResult
    {
        $startTime = microtime(true);
        
        try {
            $config = $this->replaceConfigVariables($context->actionConfig, $context);
            
            $operation = $config['operation'] ?? 'get';
            $storageType = $config['storage_type'] ?? 'database';
            $namespace = $config['namespace'] ?? 'default';
            $key = $config['key'] ?? $context->mappedPayload['key'] ?? null;
            $ttl = (int)($config['ttl'] ?? 0);
            
            // Build full key with namespace
            $fullKey = $key ? "{$namespace}:{$key}" : null;
            
            $result = match ($operation) {
                'set' => $this->opSet($storageType, $fullKey, $config['value'] ?? $context->mappedPayload['value'] ?? null, $ttl),
                'get' => $this->opGet($storageType, $fullKey, $config['default_value'] ?? null),
                'delete' => $this->opDelete($storageType, $fullKey),
                'increment' => $this->opIncrement($storageType, $fullKey, (int)($config['value'] ?? 1)),
                'decrement' => $this->opDecrement($storageType, $fullKey, (int)($config['value'] ?? 1)),
                'append' => $this->opAppend($storageType, $fullKey, $config['value'] ?? $context->mappedPayload['value'] ?? null),
                'exists' => $this->opExists($storageType, $fullKey),
                'list' => $this->opList($storageType, $namespace, $config['key_pattern'] ?? '*'),
                default => ['success' => false, 'error' => "Unknown operation: {$operation}"],
            };
            
            // Store result in context if output variable specified
            if (!empty($config['output_variable']) && isset($result['value'])) {
                $context->setVariable($config['output_variable'], $result['value']);
            }
            
            $executionTime = (int)((microtime(true) - $startTime) * 1000);
            
            if ($result['success']) {
                return new ActionResult(
                    success: true,
                    data: [
                        'operation' => $operation,
                        'key' => $key,
                        'value' => $result['value'] ?? null,
                        'exists' => $result['exists'] ?? null,
                    ],
                    statusCode: 200,
                    executionTimeMs: $executionTime
                );
            }
            
            return ActionResult::failure($result['error'] ?? 'Storage operation failed');
            
        } catch (\Exception $e) {
            $this->log('Store value failed', ['error' => $e->getMessage()]);
            return ActionResult::failure($e->getMessage());
        }
    }
    
    /**
     * Set a value
     */
    private function opSet(string $type, ?string $key, mixed $value, int $ttl): array
    {
        if ($key === null) {
            return ['success' => false, 'error' => 'Key is required'];
        }
        
        $expiresAt = $ttl > 0 ? time() + $ttl : null;
        $serialized = is_string($value) ? $value : json_encode($value);
        
        return match ($type) {
            'memory' => $this->setMemory($key, $serialized, $expiresAt),
            'file' => $this->setFile($key, $serialized, $expiresAt),
            default => $this->setDatabase($key, $serialized, $expiresAt),
        };
    }
    
    /**
     * Get a value
     */
    private function opGet(string $type, ?string $key, mixed $default): array
    {
        if ($key === null) {
            return ['success' => false, 'error' => 'Key is required'];
        }
        
        $result = match ($type) {
            'memory' => $this->getMemory($key),
            'file' => $this->getFile($key),
            default => $this->getDatabase($key),
        };
        
        if (!$result['success'] || $result['value'] === null) {
            $result['value'] = $default;
        } else {
            // Try to decode JSON
            $decoded = json_decode($result['value'], true);
            if (json_last_error() === JSON_ERROR_NONE) {
                $result['value'] = $decoded;
            }
        }
        
        return $result;
    }
    
    /**
     * Delete a value
     */
    private function opDelete(string $type, ?string $key): array
    {
        if ($key === null) {
            return ['success' => false, 'error' => 'Key is required'];
        }
        
        return match ($type) {
            'memory' => $this->deleteMemory($key),
            'file' => $this->deleteFile($key),
            default => $this->deleteDatabase($key),
        };
    }
    
    /**
     * Increment a value
     */
    private function opIncrement(string $type, ?string $key, int $amount): array
    {
        $current = $this->opGet($type, $key, 0);
        $newValue = (int)($current['value'] ?? 0) + $amount;
        $result = $this->opSet($type, $key, $newValue, 0);
        $result['value'] = $newValue;
        return $result;
    }
    
    /**
     * Decrement a value
     */
    private function opDecrement(string $type, ?string $key, int $amount): array
    {
        return $this->opIncrement($type, $key, -$amount);
    }
    
    /**
     * Append to an array value
     */
    private function opAppend(string $type, ?string $key, mixed $value): array
    {
        $current = $this->opGet($type, $key, []);
        $array = is_array($current['value']) ? $current['value'] : [$current['value']];
        $array[] = $value;
        return $this->opSet($type, $key, $array, 0);
    }
    
    /**
     * Check if key exists
     */
    private function opExists(string $type, ?string $key): array
    {
        $result = $this->opGet($type, $key, null);
        return [
            'success' => true,
            'exists' => $result['value'] !== null,
            'value' => $result['value'] !== null,
        ];
    }
    
    /**
     * List keys matching pattern
     */
    private function opList(string $type, string $namespace, string $pattern): array
    {
        $fullPattern = "{$namespace}:{$pattern}";
        
        return match ($type) {
            'memory' => $this->listMemory($fullPattern),
            'file' => $this->listFile($fullPattern),
            default => $this->listDatabase($fullPattern),
        };
    }
    
    // Memory storage (APCu if available, otherwise static)
    
    private static array $memoryStore = [];
    
    private function setMemory(string $key, string $value, ?int $expiresAt): array
    {
        if (function_exists('apcu_store')) {
            $ttl = $expiresAt ? $expiresAt - time() : 0;
            $success = apcu_store($key, $value, $ttl);
            return ['success' => $success];
        }
        
        self::$memoryStore[$key] = [
            'value' => $value,
            'expires_at' => $expiresAt,
        ];
        
        return ['success' => true];
    }
    
    private function getMemory(string $key): array
    {
        if (function_exists('apcu_fetch')) {
            $success = false;
            $value = apcu_fetch($key, $success);
            return ['success' => true, 'value' => $success ? $value : null];
        }
        
        if (!isset(self::$memoryStore[$key])) {
            return ['success' => true, 'value' => null];
        }
        
        $entry = self::$memoryStore[$key];
        
        // Check expiration
        if ($entry['expires_at'] !== null && $entry['expires_at'] < time()) {
            unset(self::$memoryStore[$key]);
            return ['success' => true, 'value' => null];
        }
        
        return ['success' => true, 'value' => $entry['value']];
    }
    
    private function deleteMemory(string $key): array
    {
        if (function_exists('apcu_delete')) {
            apcu_delete($key);
        }
        unset(self::$memoryStore[$key]);
        return ['success' => true];
    }
    
    private function listMemory(string $pattern): array
    {
        $regex = '/^' . str_replace(['*', '?'], ['.*', '.'], preg_quote($pattern, '/')) . '$/';
        $keys = [];
        
        if (function_exists('apcu_cache_info')) {
            $info = apcu_cache_info();
            foreach ($info['cache_list'] ?? [] as $entry) {
                if (preg_match($regex, $entry['info'])) {
                    $keys[] = $entry['info'];
                }
            }
        } else {
            foreach (array_keys(self::$memoryStore) as $key) {
                if (preg_match($regex, $key)) {
                    $keys[] = $key;
                }
            }
        }
        
        return ['success' => true, 'value' => $keys];
    }
    
    // File storage
    
    private function getStoragePath(): string
    {
        $path = dirname(__DIR__, 4) . '/storage/webhook_cache';
        if (!is_dir($path)) {
            mkdir($path, 0755, true);
        }
        return $path;
    }
    
    private function keyToFilename(string $key): string
    {
        return $this->getStoragePath() . '/' . md5($key) . '.cache';
    }
    
    private function setFile(string $key, string $value, ?int $expiresAt): array
    {
        $data = json_encode([
            'key' => $key,
            'value' => $value,
            'expires_at' => $expiresAt,
            'created_at' => time(),
        ]);
        
        $success = file_put_contents($this->keyToFilename($key), $data, LOCK_EX) !== false;
        return ['success' => $success];
    }
    
    private function getFile(string $key): array
    {
        $filename = $this->keyToFilename($key);
        
        if (!file_exists($filename)) {
            return ['success' => true, 'value' => null];
        }
        
        $data = json_decode(file_get_contents($filename), true);
        
        if (!$data) {
            return ['success' => true, 'value' => null];
        }
        
        // Check expiration
        if ($data['expires_at'] !== null && $data['expires_at'] < time()) {
            @unlink($filename);
            return ['success' => true, 'value' => null];
        }
        
        return ['success' => true, 'value' => $data['value']];
    }
    
    private function deleteFile(string $key): array
    {
        $filename = $this->keyToFilename($key);
        if (file_exists($filename)) {
            @unlink($filename);
        }
        return ['success' => true];
    }
    
    private function listFile(string $pattern): array
    {
        $regex = '/^' . str_replace(['*', '?'], ['.*', '.'], preg_quote($pattern, '/')) . '$/';
        $keys = [];
        
        foreach (glob($this->getStoragePath() . '/*.cache') as $file) {
            $data = json_decode(file_get_contents($file), true);
            if ($data && isset($data['key']) && preg_match($regex, $data['key'])) {
                // Check expiration
                if ($data['expires_at'] === null || $data['expires_at'] >= time()) {
                    $keys[] = $data['key'];
                }
            }
        }
        
        return ['success' => true, 'value' => $keys];
    }
    
    // Database storage
    
    private function getDb(): \PDO
    {
        static $db = null;
        
        if ($db === null) {
            $dbPath = dirname(__DIR__, 4) . '/databases/system.sqlite';
            $db = new \PDO("sqlite:{$dbPath}");
            $db->setAttribute(\PDO::ATTR_ERRMODE, \PDO::ERRMODE_EXCEPTION);
            
            // Ensure table exists
            $db->exec("
                CREATE TABLE IF NOT EXISTS " . self::STORAGE_TABLE . " (
                    key TEXT PRIMARY KEY,
                    value TEXT,
                    expires_at INTEGER,
                    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
                    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
                )
            ");
            
            $db->exec("CREATE INDEX IF NOT EXISTS idx_kv_expires ON " . self::STORAGE_TABLE . "(expires_at)");
        }
        
        return $db;
    }
    
    private function setDatabase(string $key, string $value, ?int $expiresAt): array
    {
        try {
            $db = $this->getDb();
            
            $stmt = $db->prepare("
                INSERT OR REPLACE INTO " . self::STORAGE_TABLE . " (key, value, expires_at, updated_at)
                VALUES (:key, :value, :expires_at, :updated_at)
            ");
            
            $stmt->execute([
                ':key' => $key,
                ':value' => $value,
                ':expires_at' => $expiresAt,
                ':updated_at' => time(),
            ]);
            
            return ['success' => true];
        } catch (\Exception $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
    
    private function getDatabase(string $key): array
    {
        try {
            $db = $this->getDb();
            
            $stmt = $db->prepare("
                SELECT value, expires_at FROM " . self::STORAGE_TABLE . "
                WHERE key = :key
            ");
            $stmt->execute([':key' => $key]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            
            if (!$row) {
                return ['success' => true, 'value' => null];
            }
            
            // Check expiration
            if ($row['expires_at'] !== null && (int)$row['expires_at'] < time()) {
                $this->deleteDatabase($key);
                return ['success' => true, 'value' => null];
            }
            
            return ['success' => true, 'value' => $row['value']];
        } catch (\Exception $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
    
    private function deleteDatabase(string $key): array
    {
        try {
            $db = $this->getDb();
            $stmt = $db->prepare("DELETE FROM " . self::STORAGE_TABLE . " WHERE key = :key");
            $stmt->execute([':key' => $key]);
            return ['success' => true];
        } catch (\Exception $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
    
    private function listDatabase(string $pattern): array
    {
        try {
            $db = $this->getDb();
            
            // Convert glob pattern to SQL LIKE
            $sqlPattern = str_replace(['*', '?'], ['%', '_'], $pattern);
            
            $stmt = $db->prepare("
                SELECT key FROM " . self::STORAGE_TABLE . "
                WHERE key LIKE :pattern
                AND (expires_at IS NULL OR expires_at >= :now)
            ");
            $stmt->execute([
                ':pattern' => $sqlPattern,
                ':now' => time(),
            ]);
            
            $keys = $stmt->fetchAll(\PDO::FETCH_COLUMN);
            
            return ['success' => true, 'value' => $keys];
        } catch (\Exception $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
}
