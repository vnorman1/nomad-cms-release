<?php
/**
 * NOMAD CMS - Update Audit Logger
 * 
 * Logs all update-related actions for security auditing.
 * Immutable append-only log format.
 */

declare(strict_types=1);

namespace NomadCMS\Services;

use NomadCMS\Config\Version;

final class UpdateAuditLogger
{
    private string $logPath;
    
    public function __construct()
    {
        $this->logPath = Version::getAuditLogPath();
        $this->ensureLogDirectory();
    }
    
    /**
     * Log an update check
     */
    public function logCheck(string $userId, string $targetVersion, bool $updateAvailable): void
    {
        $this->log('CHECK', [
            'user_id' => $userId,
            'target_version' => $targetVersion,
            'update_available' => $updateAvailable,
        ]);
    }
    
    /**
     * Log an update attempt (start)
     */
    public function logUpdateStart(string $userId, string $fromVersion, string $toVersion): void
    {
        $this->log('UPDATE_START', [
            'user_id' => $userId,
            'from_version' => $fromVersion,
            'to_version' => $toVersion,
        ]);
    }
    
    /**
     * Log an update completion (success)
     */
    public function logUpdateSuccess(
        string $userId,
        string $fromVersion,
        string $toVersion,
        int $filesAdded,
        int $filesModified,
        int $filesDeleted,
        ?string $backupId = null
    ): void {
        $this->log('UPDATE_SUCCESS', [
            'user_id' => $userId,
            'from_version' => $fromVersion,
            'to_version' => $toVersion,
            'files_added' => $filesAdded,
            'files_modified' => $filesModified,
            'files_deleted' => $filesDeleted,
            'backup_id' => $backupId,
        ]);
    }
    
    /**
     * Log an update failure
     */
    public function logUpdateFailure(
        string $userId,
        string $fromVersion,
        string $toVersion,
        string $error,
        bool $rollbackPerformed
    ): void {
        $this->log('UPDATE_FAILURE', [
            'user_id' => $userId,
            'from_version' => $fromVersion,
            'to_version' => $toVersion,
            'error' => $error,
            'rollback_performed' => $rollbackPerformed,
        ]);
    }
    
    /**
     * Log a rollback attempt
     */
    public function logRollbackStart(string $userId, string $backupId): void
    {
        $this->log('ROLLBACK_START', [
            'user_id' => $userId,
            'backup_id' => $backupId,
        ]);
    }
    
    /**
     * Log a rollback completion
     */
    public function logRollbackSuccess(string $userId, string $backupId, string $restoredVersion): void
    {
        $this->log('ROLLBACK_SUCCESS', [
            'user_id' => $userId,
            'backup_id' => $backupId,
            'restored_version' => $restoredVersion,
        ]);
    }
    
    /**
     * Log a rollback failure
     */
    public function logRollbackFailure(string $userId, string $backupId, string $error): void
    {
        $this->log('ROLLBACK_FAILURE', [
            'user_id' => $userId,
            'backup_id' => $backupId,
            'error' => $error,
        ]);
    }
    
    /**
     * Log GPG signature verification
     */
    public function logGPGVerification(string $version, bool $valid, ?string $fingerprint = null): void
    {
        $this->log('GPG_VERIFY', [
            'version' => $version,
            'valid' => $valid,
            'fingerprint' => $fingerprint,
        ]);
    }
    
    /**
     * Core logging function
     * Format: [ISO8601] [ACTION] [IP] [JSON_DATA]
     */
    private function log(string $action, array $data): void
    {
        $timestamp = date('c');
        $ip = $this->getClientIp();
        
        $entry = sprintf(
            "[%s] [%s] [%s] %s\n",
            $timestamp,
            $action,
            $ip,
            json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
        );
        
        // Append-only with file locking
        $fp = fopen($this->logPath, 'a');
        if ($fp) {
            flock($fp, LOCK_EX);
            fwrite($fp, $entry);
            fflush($fp);
            flock($fp, LOCK_UN);
            fclose($fp);
        }
    }
    
    /**
     * Ensure log directory exists
     */
    private function ensureLogDirectory(): void
    {
        $dir = dirname($this->logPath);
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
    }
    
    /**
     * Get client IP address (trusted proxy aware)
     */
    private function getClientIp(): string
    {
        $remoteAddr = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
        
        // Only trust proxy headers if REMOTE_ADDR is a trusted proxy
        $trustedProxies = array_filter(
            array_map('trim', explode(',', $_ENV['TRUSTED_PROXIES'] ?? '127.0.0.1,::1'))
        );
        
        if (in_array($remoteAddr, $trustedProxies, true)) {
            // Check X-Forwarded-For (take first untrusted IP)
            if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
                $ips = array_map('trim', explode(',', $_SERVER['HTTP_X_FORWARDED_FOR']));
                foreach ($ips as $ip) {
                    if (!in_array($ip, $trustedProxies, true) && filter_var($ip, FILTER_VALIDATE_IP)) {
                        return $ip;
                    }
                }
            }
            
            // Check X-Real-IP
            if (!empty($_SERVER['HTTP_X_REAL_IP']) && filter_var($_SERVER['HTTP_X_REAL_IP'], FILTER_VALIDATE_IP)) {
                return $_SERVER['HTTP_X_REAL_IP'];
            }
        }
        
        return $remoteAddr;
    }
    
    /**
     * Get recent log entries (for admin dashboard)
     */
    public function getRecentEntries(int $limit = 50): array
    {
        if (!file_exists($this->logPath)) {
            return [];
        }
        
        $lines = file($this->logPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        $lines = array_slice(array_reverse($lines), 0, $limit);
        
        return array_map(function($line) {
            // Parse: [timestamp] [action] [ip] {json}
            if (preg_match('/^\[([^\]]+)\] \[([^\]]+)\] \[([^\]]+)\] (.+)$/', $line, $matches)) {
                return [
                    'timestamp' => $matches[1],
                    'action' => $matches[2],
                    'ip' => $matches[3],
                    'data' => json_decode($matches[4], true),
                ];
            }
            return null;
        }, $lines);
    }
}
