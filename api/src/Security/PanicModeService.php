<?php
/**
 * NOMAD CMS - Panic Mode Service 🚨
 * 
 * "Don't Panic!" - The Hitchhiker's Guide to the Galaxy
 * 
 * Emergency read-only mode for when things get... interesting.
 * When enabled:
 * - Only GET requests are allowed
 * - All active sessions are revoked
 * - The entire system goes into lockdown mode
 * 
 * Perfect for:
 * - Suspected security breaches
 * - Database maintenance
 * - When your coffee hasn't kicked in yet
 * - Mercury retrograde
 */

declare(strict_types=1);

namespace NomadCMS\Security;

use NomadCMS\Database\AuthDatabase;
use PDO;

final class PanicModeService
{
    private const CONFIG_FILE = __DIR__ . '/../../data/panic_mode.json';
    
    /**
     * Check if panic mode is currently active
     */
    public static function isActive(): bool
    {
        $config = self::getConfig();
        return $config['enabled'] ?? false;
    }
    
    /**
     * Get full panic mode status with details
     */
    public static function getStatus(): array
    {
        $config = self::getConfig();
        
        return [
            'enabled' => $config['enabled'] ?? false,
            'activated_at' => $config['activated_at'] ?? null,
            'activated_by' => $config['activated_by'] ?? null,
            'reason' => $config['reason'] ?? null,
            'sessions_revoked' => $config['sessions_revoked'] ?? 0,
            'funny_message' => self::getFunnyMessage($config['enabled'] ?? false),
        ];
    }
    
    /**
     * Enable panic mode - DEFCON 1! 🔴
     * 
     * @param int $adminId The admin user ID enabling panic mode
     * @param string|null $reason Why are we panicking?
     * @return array Result with stats
     */
    public static function enable(int $adminId, ?string $reason = null): array
    {
        // Already panicking? Don't panic more!
        if (self::isActive()) {
            return [
                'success' => false,
                'error' => 'Panic mode is already active. One panic at a time, please! 🙈',
                'already_active' => true,
            ];
        }
        
        // Revoke ALL sessions (nuclear option)
        $revokedCount = self::revokeAllSessions($adminId);
        
        // Save panic state
        $config = [
            'enabled' => true,
            'activated_at' => date('c'),
            'activated_by' => $adminId,
            'reason' => $reason ?? 'No reason specified (probably just paranoid)',
            'sessions_revoked' => $revokedCount,
        ];
        
        self::saveConfig($config);
        
        // Log this important event
        self::logPanicEvent('ENABLED', $adminId, $reason, $revokedCount);
        
        return [
            'success' => true,
            'message' => "🚨 PANIC MODE ACTIVATED! Don't panic, but also... maybe panic a little?",
            'sessions_revoked' => $revokedCount,
            'funny_message' => self::getFunnyMessage(true),
        ];
    }
    
    /**
     * Disable panic mode - All clear! 🟢
     * 
     * @param int $adminId The admin user ID disabling panic mode
     * @return array Result
     */
    public static function disable(int $adminId): array
    {
        if (!self::isActive()) {
            return [
                'success' => false,
                'error' => 'Panic mode is not active. Everything is fine! (or is it? 👀)',
                'already_inactive' => true,
            ];
        }
        
        $previousConfig = self::getConfig();
        
        // Clear panic state
        $config = [
            'enabled' => false,
            'deactivated_at' => date('c'),
            'deactivated_by' => $adminId,
            'previous_activation' => $previousConfig,
        ];
        
        self::saveConfig($config);
        
        // Log the all-clear
        self::logPanicEvent('DISABLED', $adminId);
        
        return [
            'success' => true,
            'message' => "✅ Panic mode deactivated. Crisis averted! Time for a coffee break ☕",
            'funny_message' => self::getFunnyMessage(false),
        ];
    }
    
    /**
     * Revoke all active sessions except none (full nuclear)
     * 
     * @param int $exceptAdminId Keep a note of who triggered this
     * @return int Number of sessions revoked
     */
    private static function revokeAllSessions(int $exceptAdminId): int
    {
        $db = AuthDatabase::getInstance();
        $totalRevoked = 0;
        
        // Revoke all refresh tokens
        $stmt = $db->prepare("
            UPDATE refresh_tokens 
            SET revoked = 1, 
                revoked_at = datetime('now')
            WHERE revoked = 0
        ");
        $stmt->execute();
        $totalRevoked += $stmt->rowCount();
        
        // Delete all active sessions
        $stmt = $db->prepare("DELETE FROM sessions");
        $stmt->execute();
        $totalRevoked += $stmt->rowCount();
        
        return $totalRevoked;
    }
    
    /**
     * Get a funny message based on panic state
     */
    private static function getFunnyMessage(bool $isPanicking): string
    {
        if ($isPanicking) {
            $messages = [
                "🔴 RED ALERT! Only reading allowed. Writing is so last century anyway.",
                "🚨 Panic mode ON! The system is now in witness protection program.",
                "⚠️ Emergency lockdown! Even the database is holding its breath.",
                "🔒 Read-only mode activated. Think of it as a museum - look but don't touch!",
                "🛑 HALT! System frozen like a deer in headlights. Only GET requests allowed.",
                "🆘 Mayday mayday! All write operations have been... written off.",
                "🚫 The 'write' in read/write has left the building. Elvis style.",
            ];
        } else {
            $messages = [
                "✅ All clear! The towel is no longer needed.",
                "🟢 Back to normal! Write operations welcome home.",
                "☀️ Crisis averted! The database is doing a happy dance.",
                "🎉 Panic over! Feel free to CREATE, UPDATE, DELETE with reckless abandon!",
                "👍 Systems nominal. You may now resume your regularly scheduled programming.",
                "🌈 The storm has passed! Full functionality restored.",
                "🦸 Hero admin saved the day! Normal operations resume.",
            ];
        }
        
        return $messages[array_rand($messages)];
    }
    
    /**
     * Get current config from file
     */
    private static function getConfig(): array
    {
        if (!file_exists(self::CONFIG_FILE)) {
            return ['enabled' => false];
        }
        
        $content = file_get_contents(self::CONFIG_FILE);
        $config = json_decode($content, true);
        
        return is_array($config) ? $config : ['enabled' => false];
    }
    
    /**
     * Save config to file
     */
    private static function saveConfig(array $config): void
    {
        $dir = dirname(self::CONFIG_FILE);
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        
        file_put_contents(
            self::CONFIG_FILE,
            json_encode($config, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)
        );
    }
    
    /**
     * Log panic mode events for audit trail
     */
    private static function logPanicEvent(string $action, int $adminId, ?string $reason = null, ?int $sessionsRevoked = null): void
    {
        $logFile = __DIR__ . '/../../logs/panic_mode.log';
        $logDir = dirname($logFile);
        
        if (!is_dir($logDir)) {
            mkdir($logDir, 0755, true);
        }
        
        $logEntry = [
            'timestamp' => date('c'),
            'action' => $action,
            'admin_id' => $adminId,
            'reason' => $reason,
            'sessions_revoked' => $sessionsRevoked,
            'ip' => $_SERVER['REMOTE_ADDR'] ?? 'unknown',
        ];
        
        $logLine = date('[Y-m-d H:i:s]') . ' PANIC_MODE ' . $action . ' | ' . json_encode($logEntry) . PHP_EOL;
        file_put_contents($logFile, $logLine, FILE_APPEND | LOCK_EX);
    }
}
