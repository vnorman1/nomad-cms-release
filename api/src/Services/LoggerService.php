<?php
/**
 * NOMAD CMS - Logger Service
 * Centralized logging using Monolog with automatic rotation
 */

declare(strict_types=1);

namespace NomadCMS\Services;

use Monolog\Logger;
use Monolog\Handler\StreamHandler;
use Monolog\Formatter\LineFormatter;

class LoggerService
{
    private static ?Logger $logger = null;
    private static ?string $logPath = null;

    /**
     * Initialize the logger instance
     */
    private static function init(): Logger
    {
        if (self::$logger !== null) {
            return self::$logger;
        }

        // Use LOG_PATH from ENV or default to data/logs/app.log
        $envPath = $_ENV['LOG_PATH'] ?? 'data/logs/app.log';
        if (str_starts_with($envPath, '/')) {
            self::$logPath = $envPath;
            $logDir = dirname(self::$logPath);
        } else {
            // Resolve relative path from project root (api directory)
            $rootPath = dirname(__DIR__, 2);
            self::$logPath = $rootPath . '/' . ltrim($envPath, '/');
            $logDir = dirname(self::$logPath);
        }

        if (!is_dir($logDir)) {
            mkdir($logDir, 0755, true);
        }
        
        // Trim log if over size limit
        self::trimLogIfNeeded();

        self::$logger = new Logger('nomad');
        
        $handler = new StreamHandler(self::$logPath, Logger::DEBUG);
        $formatter = new LineFormatter(
            "[%datetime%] %level_name%: %message% %context%\n",
            'Y-m-d H:i:s',
            true,
            true
        );
        $handler->setFormatter($formatter);
        
        self::$logger->pushHandler($handler);

        return self::$logger;
    }

    /**
     * Trim log file if it exceeds LOG_MAX_SIZE (in MB)
     */
    private static function trimLogIfNeeded(): void
    {
        if (!file_exists(self::$logPath)) {
            return;
        }

        $maxSizeMB = (int) ($_ENV['LOG_MAX_SIZE'] ?? 3);
        $maxSizeBytes = $maxSizeMB * 1024 * 1024;
        $currentSize = filesize(self::$logPath);

        if ($currentSize <= $maxSizeBytes) {
            return;
        }

        // Read file and keep only recent entries
        $content = file_get_contents(self::$logPath);
        $lines = explode("\n", $content);
        
        // Keep last 75% of max size worth of lines
        $targetSize = (int) ($maxSizeBytes * 0.75);
        $keptLines = [];
        $keptSize = 0;
        
        // Work backwards from end
        for ($i = count($lines) - 1; $i >= 0; $i--) {
            $lineSize = strlen($lines[$i]) + 1;
            if ($keptSize + $lineSize > $targetSize) {
                break;
            }
            array_unshift($keptLines, $lines[$i]);
            $keptSize += $lineSize;
        }

        file_put_contents(self::$logPath, implode("\n", $keptLines));
    }

    /**
     * Log at DEBUG level
     */
    public static function debug(string $message, array $context = []): void
    {
        self::init()->debug($message, $context);
    }

    /**
     * Log at INFO level
     */
    public static function info(string $message, array $context = []): void
    {
        self::init()->info($message, $context);
    }

    /**
     * Log at WARNING level
     */
    public static function warning(string $message, array $context = []): void
    {
        self::init()->warning($message, $context);
    }

    /**
     * Log at ERROR level
     */
    public static function error(string $message, array $context = []): void
    {
        self::init()->error($message, $context);
    }

    /**
     * Log at CRITICAL level
     */
    public static function critical(string $message, array $context = []): void
    {
        self::init()->critical($message, $context);
    }

    /**
     * Get log file path
     */
    public static function getLogPath(): string
    {
        if (self::$logPath !== null) {
            return self::$logPath;
        }

        // Use logic similar to init() if not initialized
        $envPath = $_ENV['LOG_PATH'] ?? 'data/logs/app.log';
        if (str_starts_with($envPath, '/')) {
            return $envPath;
        } else {
            return dirname(__DIR__, 2) . '/' . ltrim($envPath, '/');
        }
    }

    /**
     * Read logs with optional filtering and pagination
     */
    public static function readLogs(?string $level = null, ?string $search = null, int $limit = 100, int $offset = 0): array
    {
        $logPath = self::getLogPath();
        
        if (!file_exists($logPath)) {
            return ['logs' => [], 'total' => 0, 'hasMore' => false];
        }

        $content = file_get_contents($logPath);
        $lines = array_filter(explode("\n", $content), fn($l) => trim($l) !== '');
        
        // Parse lines into structured logs
        $logs = [];
        $pattern = '/^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\] (\w+): (.*)$/';
        
        foreach ($lines as $line) {
            if (preg_match($pattern, $line, $matches)) {
                $logEntry = [
                    'timestamp' => $matches[1],
                    'level' => $matches[2],
                    'message' => trim($matches[3]),
                ];

                // Filter by level
                if ($level && strtoupper($level) !== $logEntry['level']) {
                    continue;
                }

                // Filter by search
                if ($search && stripos($logEntry['message'], $search) === false) {
                    continue;
                }

                $logs[] = $logEntry;
            }
        }

        // Reverse to get most recent first
        $logs = array_reverse($logs);
        $total = count($logs);
        
        // Apply pagination
        $paginatedLogs = array_slice($logs, $offset, $limit);
        $hasMore = ($offset + $limit) < $total;
        
        return [
            'logs' => $paginatedLogs,
            'total' => $total,
            'hasMore' => $hasMore,
        ];
    }

    /**
     * Get log statistics
     */
    public static function getStats(): array
    {
        $logPath = self::getLogPath();
        
        if (!file_exists($logPath)) {
            return [
                'sizeBytes' => 0,
                'sizeKB' => 0,
                'sizeMB' => 0,
                'lineCount' => 0,
                'maxSizeMB' => (int) ($_ENV['LOG_MAX_SIZE'] ?? 3),
            ];
        }

        $size = filesize($logPath);
        $content = file_get_contents($logPath);
        $lineCount = substr_count($content, "\n");

        return [
            'sizeBytes' => $size,
            'sizeKB' => round($size / 1024, 2),
            'sizeMB' => round($size / (1024 * 1024), 2),
            'lineCount' => $lineCount,
            'maxSizeMB' => (int) ($_ENV['LOG_MAX_SIZE'] ?? 3),
        ];
    }

    /**
     * Clear all logs
     */
    public static function clearLogs(): bool
    {
        $logPath = self::getLogPath();
        
        if (file_exists($logPath)) {
            return file_put_contents($logPath, '') !== false;
        }
        
        return true;
    }
}
