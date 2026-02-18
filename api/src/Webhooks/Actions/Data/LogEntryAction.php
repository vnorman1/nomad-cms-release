<?php
/**
 * NOMAD CMS - Log Entry Action
 * 
 * Creates structured log entries for debugging and audit purposes
 */

declare(strict_types=1);

namespace NomadCMS\Webhooks\Actions\Data;

use NomadCMS\Webhooks\Actions\BaseAction;
use NomadCMS\Webhooks\Actions\ActionContext;
use NomadCMS\Webhooks\Actions\ActionResult;

class LogEntryAction extends BaseAction
{
    protected bool $requiresProvider = false;
    
    private const LOG_TABLE = 'webhook_custom_logs';
    
    public function getType(): string
    {
        return 'log_entry';
    }
    
    public function getName(): string
    {
        return 'Napló Bejegyzés';
    }
    
    public function getDescription(): string
    {
        return 'Strukturált napló bejegyzés létrehozása hibakereséshez és auditáláshoz';
    }
    
    public function getCategory(): string
    {
        return 'data';
    }
    
    public function getIcon(): string
    {
        return '📝';
    }
    
    public function getConfigSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'level' => [
                    'type' => 'string',
                    'title' => 'Szint',
                    'enum' => ['debug', 'info', 'notice', 'warning', 'error', 'critical', 'alert', 'emergency'],
                    'default' => 'info',
                ],
                'message' => [
                    'type' => 'string',
                    'title' => 'Üzenet',
                    'description' => 'Támogatja a változókat: {{payload.field}}',
                ],
                'channel' => [
                    'type' => 'string',
                    'title' => 'Csatorna',
                    'description' => 'Log csatorna neve (pl: orders, users)',
                    'default' => 'webhook',
                ],
                'context' => [
                    'type' => 'object',
                    'title' => 'Kontextus',
                    'description' => 'Extra adat a log bejegyzéshez',
                    'additionalProperties' => true,
                ],
                'include_payload' => [
                    'type' => 'boolean',
                    'title' => 'Payload csatolása',
                    'default' => false,
                ],
                'include_headers' => [
                    'type' => 'boolean',
                    'title' => 'Headers csatolása',
                    'default' => false,
                ],
                'output' => [
                    'type' => 'string',
                    'title' => 'Kimenet',
                    'enum' => ['file', 'database', 'both', 'stdout'],
                    'default' => 'both',
                ],
                'tags' => [
                    'type' => 'array',
                    'title' => 'Címkék',
                    'items' => ['type' => 'string'],
                ],
            ],
        ];
    }
    
    public function getExpectedFields(): array
    {
        return ['message', 'level', 'data'];
    }
    
    public function execute(ActionContext $context): ActionResult
    {
        $startTime = microtime(true);
        
        try {
            $config = $this->replaceConfigVariables($context->actionConfig, $context);
            
            $level = $config['level'] ?? 'info';
            $message = $config['message'] ?? $context->mappedPayload['message'] ?? 'Webhook log entry';
            $channel = $config['channel'] ?? 'webhook';
            $output = $config['output'] ?? 'both';
            $tags = $config['tags'] ?? [];
            
            // Build context data
            $contextData = $config['context'] ?? [];
            
            if (!empty($config['include_payload'])) {
                $contextData['payload'] = $context->originalPayload;
                $contextData['mapped_payload'] = $context->mappedPayload;
            }
            
            if (!empty($config['include_headers'])) {
                $contextData['headers'] = $context->headers;
            }
            
            // Add standard context
            $contextData['webhook_id'] = $context->webhookId;
            $contextData['action_id'] = $context->actionId;
            $contextData['execution_id'] = $context->executionId ?? uniqid('exec_');
            
            // Create log entry
            $logEntry = [
                'timestamp' => date('c'),
                'timestamp_unix' => time(),
                'level' => $level,
                'channel' => $channel,
                'message' => $message,
                'context' => $contextData,
                'tags' => $tags,
            ];
            
            // Write to outputs
            $results = [];
            
            if ($output === 'file' || $output === 'both') {
                $results['file'] = $this->writeToFile($logEntry, $channel);
            }
            
            if ($output === 'database' || $output === 'both') {
                $results['database'] = $this->writeToDatabase($logEntry);
            }
            
            if ($output === 'stdout') {
                $results['stdout'] = $this->writeToStdout($logEntry);
            }
            
            $executionTime = (int)((microtime(true) - $startTime) * 1000);
            
            return new ActionResult(
                success: true,
                data: [
                    'log_id' => $logEntry['context']['execution_id'],
                    'level' => $level,
                    'channel' => $channel,
                    'outputs' => $results,
                ],
                statusCode: 200,
                executionTimeMs: $executionTime
            );
            
        } catch (\Exception $e) {
            $this->log('Log entry failed', ['error' => $e->getMessage()]);
            return ActionResult::failure($e->getMessage());
        }
    }
    
    /**
     * Write log entry to file
     */
    private function writeToFile(array $entry, string $channel): bool
    {
        $logDir = dirname(__DIR__, 4) . '/logs/webhook';
        
        if (!is_dir($logDir)) {
            mkdir($logDir, 0755, true);
        }
        
        $date = date('Y-m-d');
        $filename = "{$logDir}/{$channel}_{$date}.log";
        
        // Format log line
        $line = sprintf(
            "[%s] %s.%s: %s %s\n",
            $entry['timestamp'],
            strtoupper($entry['channel']),
            strtoupper($entry['level']),
            $entry['message'],
            json_encode($entry['context'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
        );
        
        return file_put_contents($filename, $line, FILE_APPEND | LOCK_EX) !== false;
    }
    
    /**
     * Write log entry to database
     */
    private function writeToDatabase(array $entry): bool
    {
        try {
            $dbPath = dirname(__DIR__, 4) . '/databases/system.sqlite';
            $db = new \PDO("sqlite:{$dbPath}");
            $db->setAttribute(\PDO::ATTR_ERRMODE, \PDO::ERRMODE_EXCEPTION);
            
            // Ensure table exists
            $db->exec("
                CREATE TABLE IF NOT EXISTS " . self::LOG_TABLE . " (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp INTEGER NOT NULL,
                    level TEXT NOT NULL,
                    channel TEXT NOT NULL,
                    message TEXT NOT NULL,
                    context TEXT,
                    tags TEXT,
                    webhook_id TEXT,
                    action_id TEXT,
                    execution_id TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            ");
            
            $db->exec("CREATE INDEX IF NOT EXISTS idx_custom_logs_timestamp ON " . self::LOG_TABLE . "(timestamp)");
            $db->exec("CREATE INDEX IF NOT EXISTS idx_custom_logs_level ON " . self::LOG_TABLE . "(level)");
            $db->exec("CREATE INDEX IF NOT EXISTS idx_custom_logs_channel ON " . self::LOG_TABLE . "(channel)");
            $db->exec("CREATE INDEX IF NOT EXISTS idx_custom_logs_webhook ON " . self::LOG_TABLE . "(webhook_id)");
            
            $stmt = $db->prepare("
                INSERT INTO " . self::LOG_TABLE . " 
                (timestamp, level, channel, message, context, tags, webhook_id, action_id, execution_id)
                VALUES (:timestamp, :level, :channel, :message, :context, :tags, :webhook_id, :action_id, :execution_id)
            ");
            
            $stmt->execute([
                ':timestamp' => $entry['timestamp_unix'],
                ':level' => $entry['level'],
                ':channel' => $entry['channel'],
                ':message' => $entry['message'],
                ':context' => json_encode($entry['context']),
                ':tags' => json_encode($entry['tags']),
                ':webhook_id' => $entry['context']['webhook_id'] ?? null,
                ':action_id' => $entry['context']['action_id'] ?? null,
                ':execution_id' => $entry['context']['execution_id'] ?? null,
            ]);
            
            return true;
        } catch (\Exception $e) {
            error_log("Failed to write log to database: " . $e->getMessage());
            return false;
        }
    }
    
    /**
     * Write log entry to stdout (for CLI/debugging)
     */
    private function writeToStdout(array $entry): bool
    {
        $colors = [
            'debug' => "\033[90m",     // Gray
            'info' => "\033[36m",      // Cyan
            'notice' => "\033[32m",    // Green
            'warning' => "\033[33m",   // Yellow
            'error' => "\033[31m",     // Red
            'critical' => "\033[35m",  // Magenta
            'alert' => "\033[91m",     // Bright Red
            'emergency' => "\033[97;41m", // White on Red
        ];
        
        $reset = "\033[0m";
        $color = $colors[$entry['level']] ?? '';
        
        $output = sprintf(
            "%s[%s] [%s] %s%s: %s\n",
            $color,
            $entry['timestamp'],
            strtoupper($entry['level']),
            $entry['channel'],
            $reset,
            $entry['message']
        );
        
        if (php_sapi_name() === 'cli') {
            echo $output;
        } else {
            error_log(strip_tags($output));
        }
        
        return true;
    }
    
    /**
     * Query logs from database
     */
    public static function queryLogs(array $filters = []): array
    {
        try {
            $dbPath = dirname(__DIR__, 4) . '/databases/system.sqlite';
            $db = new \PDO("sqlite:{$dbPath}");
            $db->setAttribute(\PDO::ATTR_ERRMODE, \PDO::ERRMODE_EXCEPTION);
            
            $where = ['1=1'];
            $params = [];
            
            if (!empty($filters['channel'])) {
                $where[] = 'channel = :channel';
                $params[':channel'] = $filters['channel'];
            }
            
            if (!empty($filters['level'])) {
                $levels = is_array($filters['level']) ? $filters['level'] : [$filters['level']];
                $placeholders = [];
                foreach ($levels as $i => $level) {
                    $placeholders[] = ":level{$i}";
                    $params[":level{$i}"] = $level;
                }
                $where[] = 'level IN (' . implode(',', $placeholders) . ')';
            }
            
            if (!empty($filters['webhook_id'])) {
                $where[] = 'webhook_id = :webhook_id';
                $params[':webhook_id'] = $filters['webhook_id'];
            }
            
            if (!empty($filters['from'])) {
                $where[] = 'timestamp >= :from';
                $params[':from'] = is_numeric($filters['from']) ? $filters['from'] : strtotime($filters['from']);
            }
            
            if (!empty($filters['to'])) {
                $where[] = 'timestamp <= :to';
                $params[':to'] = is_numeric($filters['to']) ? $filters['to'] : strtotime($filters['to']);
            }
            
            if (!empty($filters['search'])) {
                $where[] = '(message LIKE :search OR context LIKE :search)';
                $params[':search'] = '%' . $filters['search'] . '%';
            }
            
            $limit = $filters['limit'] ?? 100;
            $offset = $filters['offset'] ?? 0;
            $order = $filters['order'] ?? 'DESC';
            
            $sql = "
                SELECT * FROM " . self::LOG_TABLE . "
                WHERE " . implode(' AND ', $where) . "
                ORDER BY timestamp {$order}
                LIMIT :limit OFFSET :offset
            ";
            
            $stmt = $db->prepare($sql);
            $stmt->bindValue(':limit', $limit, \PDO::PARAM_INT);
            $stmt->bindValue(':offset', $offset, \PDO::PARAM_INT);
            
            foreach ($params as $key => $value) {
                $stmt->bindValue($key, $value);
            }
            
            $stmt->execute();
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            
            // Decode JSON fields
            foreach ($rows as &$row) {
                $row['context'] = json_decode($row['context'], true);
                $row['tags'] = json_decode($row['tags'], true);
            }
            
            // Get total count
            $countSql = "SELECT COUNT(*) FROM " . self::LOG_TABLE . " WHERE " . implode(' AND ', $where);
            $countStmt = $db->prepare($countSql);
            foreach ($params as $key => $value) {
                $countStmt->bindValue($key, $value);
            }
            $countStmt->execute();
            $total = $countStmt->fetchColumn();
            
            return [
                'logs' => $rows,
                'total' => (int)$total,
                'limit' => $limit,
                'offset' => $offset,
            ];
            
        } catch (\Exception $e) {
            return [
                'logs' => [],
                'total' => 0,
                'error' => $e->getMessage(),
            ];
        }
    }
    
    /**
     * Clean old logs
     */
    public static function cleanup(int $olderThanDays = 30): int
    {
        try {
            $dbPath = dirname(__DIR__, 4) . '/databases/system.sqlite';
            $db = new \PDO("sqlite:{$dbPath}");
            $db->setAttribute(\PDO::ATTR_ERRMODE, \PDO::ERRMODE_EXCEPTION);
            
            $cutoff = time() - ($olderThanDays * 86400);
            
            $stmt = $db->prepare("DELETE FROM " . self::LOG_TABLE . " WHERE timestamp < :cutoff");
            $stmt->execute([':cutoff' => $cutoff]);
            
            return $stmt->rowCount();
        } catch (\Exception $e) {
            return 0;
        }
    }
}
