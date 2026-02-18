<?php
/**
 * NOMAD CMS - User Repository
 * Database operations for users
 */

declare(strict_types=1);

namespace NomadCMS\Database;

use NomadCMS\Config\Security;
use NomadCMS\Security\EncryptionService;
use Ramsey\Uuid\Uuid;

final class UserRepository
{
    // RBAC Role constants
    public const ROLE_ADMIN = 'admin';
    public const ROLE_EDITOR = 'editor';
    public const ROLE_VIEWER = 'viewer';
    
    /**
     * Create new user
     * @param string $role Role: admin, editor, or viewer (default: viewer, or admin if isAdmin)
     */
    public static function create(string $email, string $password, bool $isAdmin = false, bool $isNewUser = true, ?string $role = null): ?array
    {
        $db = AuthDatabase::getInstance();
        
        // Check if email already exists
        $stmt = $db->prepare("SELECT id FROM users WHERE email = ?");
        $stmt->execute([$email]);
        
        if ($stmt->fetch()) {
            throw new \Exception('Email already registered');
        }
        
        // Determine role - explicit role takes precedence, otherwise derive from isAdmin
        $userRole = $role ?? ($isAdmin ? self::ROLE_ADMIN : self::ROLE_VIEWER);
        
        // Generate UUID and hash password with pepper
        $uuid = str_replace('-', '', Uuid::uuid4()->toString());
        $passwordHash = self::hashPassword($password);
        
        $stmt = $db->prepare("
            INSERT INTO users (uuid, email, password_hash, is_admin, is_new_user, role)
            VALUES (?, ?, ?, ?, ?, ?)
        ");
        
        if ($stmt->execute([$uuid, $email, $passwordHash, $isAdmin ? 1 : 0, $isNewUser ? 1 : 0, $userRole])) {
            return self::findById((int) $db->lastInsertId());
        }
        
        return null;
    }
    
    /**
     * Hash password with pepper
     */
    public static function hashPassword(string $password): string
    {
        $pepper = Security::getPasswordPepper();
        $saltPrefix = Security::getSaltPrefix();
        
        // Combine password with pepper before hashing
        $pepperedPassword = hash_hmac('sha256', $password, $pepper);
        
        return password_hash(
            $saltPrefix . $pepperedPassword,
            PASSWORD_ARGON2ID,
            Security::getPasswordOptions()
        );
    }
    
    /**
     * Verify user password with pepper
     * 
     * DISASTER RECOVERY: If standard verification fails, tries legacy pepper
     * and auto-migrates password to new pepper on successful legacy verification
     */
    public static function verifyPassword(array $user, string $password): bool
    {
        $pepper = Security::getPasswordPepper();
        $saltPrefix = Security::getSaltPrefix();
        
        // Apply same pepper transformation
        $pepperedPassword = hash_hmac('sha256', $password, $pepper);
        
        // Try standard verification first
        if (password_verify($saltPrefix . $pepperedPassword, $user['password_hash'])) {
            return true;
        }
        
        // DISASTER RECOVERY: Try legacy pepper if exists
        $legacyPepper = \NomadCMS\Services\RecoveryService::getLegacyPepper();
        if ($legacyPepper) {
            $legacyPepperedPassword = hash_hmac('sha256', $password, $legacyPepper);
            
            if (password_verify($saltPrefix . $legacyPepperedPassword, $user['password_hash'])) {
                // Auto-migrate: Rehash with new pepper
                $newHash = self::hashPassword($password);
                $db = AuthDatabase::getInstance();
                $stmt = $db->prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?");
                $stmt->execute([$newHash, $user['id']]);
                
                error_log("Password migrated for user ID: {$user['id']} (legacy pepper to current)");
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * Find user by ID
     */
    public static function findById(int $id): ?array
    {
        $db = AuthDatabase::getInstance();
        $stmt = $db->prepare("SELECT * FROM users WHERE id = ?");
        $stmt->execute([$id]);
        
        return $stmt->fetch() ?: null;
    }
    
    /**
     * Find user by UUID
     */
    public static function findByUuid(string $uuid): ?array
    {
        $db = AuthDatabase::getInstance();
        $stmt = $db->prepare("SELECT * FROM users WHERE uuid = ?");
        $stmt->execute([$uuid]);
        
        return $stmt->fetch() ?: null;
    }
    
    /**
     * Find user by email
     */
    public static function findByEmail(string $email): ?array
    {
        $db = AuthDatabase::getInstance();
        $stmt = $db->prepare("SELECT * FROM users WHERE email = ?");
        $stmt->execute([$email]);
        
        return $stmt->fetch() ?: null;
    }
    
    /**
     * Get decrypted TOTP secret for a user
     * Returns null if TOTP is not enabled or decryption fails
     */
    public static function getTotpSecret(array $user): ?string
    {
        if (empty($user['totp_secret']) || !$user['totp_enabled']) {
            return null;
        }
        
        $secret = $user['totp_secret'];
        
        // Check if already encrypted (Defuse format starts with "def")
        if (EncryptionService::isEncrypted($secret)) {
            try {
                return EncryptionService::decrypt($secret);
            } catch (\Exception $e) {
                // Log error but don't expose details
                error_log('TOTP decryption failed for user ID: ' . ($user['id'] ?? 'unknown'));
                return null;
            }
        }
        
        // Legacy: plaintext secret (migrate on next enable)
        return $secret;
    }
    
    /**
     * Update password
     */
    public static function updatePassword(int $userId, string $newPassword): bool
    {
        $db = AuthDatabase::getInstance();
        $hash = self::hashPassword($newPassword);
        
        $stmt = $db->prepare("UPDATE users SET password_hash = ?, is_new_user = 0, updated_at = datetime('now') WHERE id = ?");
        return $stmt->execute([$hash, $userId]);
    }
    
    /**
     * Enable TOTP for user
     * Secret is encrypted at rest using ENCRYPTION_KEY
     */
    public static function enableTotp(int $userId, string $secret): bool
    {
        $db = AuthDatabase::getInstance();
        
        // Encrypt TOTP secret at rest
        $encryptedSecret = EncryptionService::encrypt($secret);
        
        $stmt = $db->prepare("
            UPDATE users 
            SET totp_secret = ?, totp_enabled = 1, updated_at = datetime('now')
            WHERE id = ?
        ");
        
        return $stmt->execute([$encryptedSecret, $userId]);
    }
    
    /**
     * Disable TOTP for user
     */
    public static function disableTotp(int $userId): bool
    {
        $db = AuthDatabase::getInstance();
        
        $stmt = $db->prepare("
            UPDATE users 
            SET totp_secret = NULL, totp_enabled = 0, backup_codes = NULL, updated_at = datetime('now')
            WHERE id = ?
        ");
        
        return $stmt->execute([$userId]);
    }
    
    /**
     * Record failed login attempt with dynamic lock settings
     */
    public static function recordFailedLogin(int $userId): void
    {
        $db = AuthDatabase::getInstance();
        $lockSettings = Security::getAccountLockSettings();
        
        $stmt = $db->prepare("
            UPDATE users 
            SET failed_login_attempts = failed_login_attempts + 1
            WHERE id = ?
        ");
        $stmt->execute([$userId]);
        
        // Check if should lock account
        $user = self::findById($userId);
        if ($user && $user['failed_login_attempts'] >= $lockSettings['max_attempts']) {
            $lockUntil = date('Y-m-d H:i:s', time() + $lockSettings['lock_duration']);
            $stmt = $db->prepare("UPDATE users SET locked_until = ? WHERE id = ?");
            $stmt->execute([$lockUntil, $userId]);
        }
    }
    
    /**
     * Reset failed login attempts (on successful login)
     */
    public static function resetFailedLogins(int $userId): void
    {
        $db = AuthDatabase::getInstance();
        
        $stmt = $db->prepare("
            UPDATE users 
            SET failed_login_attempts = 0, locked_until = NULL, last_login_at = datetime('now')
            WHERE id = ?
        ");
        $stmt->execute([$userId]);
    }
    
    /**
     * Check if account is locked
     */
    public static function isLocked(array $user): bool
    {
        if (empty($user['locked_until'])) {
            return false;
        }
        
        return strtotime($user['locked_until']) > time();
    }
    
    /**
     * Get remaining lockout time in seconds
     * Returns 0 if not locked
     */
    public static function getLockoutRemaining(array $user): int
    {
        if (empty($user['locked_until'])) {
            return 0;
        }
        
        $lockUntil = strtotime($user['locked_until']);
        $remaining = $lockUntil - time();
        
        return max(0, $remaining);
    }
    
    /**
     * Log login attempt (for security audit)
     */
    public static function logLoginAttempt(string $email, bool $success, ?string $reason = null): void
    {
        $db = AuthDatabase::getInstance();
        
        $stmt = $db->prepare("
            INSERT INTO login_attempts (email, ip_address, user_agent, success, failure_reason)
            VALUES (?, ?, ?, ?, ?)
        ");
        
        $stmt->execute([
            $email,
            $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0',
            substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 500),
            $success ? 1 : 0,
            $reason,
        ]);
    }
    
    // ==========================================
    // USER-LEVEL AUTH SETTINGS
    // ==========================================
    
    /**
     * Update user's auth method preferences
     * Allows each user to enable/disable their own auth methods
     */
    public static function updateAuthSettings(int $userId, array $settings): bool
    {
        $db = AuthDatabase::getInstance();
        
        $allowed = ['totp_allowed', 'webauthn_allowed', 'password_allowed'];
        $updates = [];
        $params = [];
        
        foreach ($allowed as $field) {
            if (isset($settings[$field])) {
                $updates[] = "$field = ?";
                $params[] = $settings[$field] ? 1 : 0;
            }
        }
        
        if (empty($updates)) {
            return false;
        }
        
        $params[] = $userId;
        $sql = "UPDATE users SET " . implode(', ', $updates) . ", updated_at = datetime('now') WHERE id = ?";
        
        return $db->prepare($sql)->execute($params);
    }
    
    /**
     * Save backup codes for user (hashed)
     */
    public static function setBackupCodes(int $userId, array $hashedCodes): bool
    {
        $db = AuthDatabase::getInstance();
        
        $codesJson = json_encode($hashedCodes);
        
        $stmt = $db->prepare("UPDATE users SET backup_codes = ?, updated_at = datetime('now') WHERE id = ?");
        return $stmt->execute([$codesJson, $userId]);
    }
    
    /**
     * Get user's backup codes
     */
    public static function getBackupCodes(int $userId): array
    {
        $user = self::findById($userId);
        
        if (!$user || empty($user['backup_codes'])) {
            return [];
        }
        
        return json_decode($user['backup_codes'], true) ?? [];
    }
    
    /**
     * Verify and consume a backup code
     */
    public static function verifyBackupCode(int $userId, string $code): bool
    {
        $codes = self::getBackupCodes($userId);
        
        foreach ($codes as $index => $hashedCode) {
            if (password_verify($code, $hashedCode)) {
                // Remove used code
                unset($codes[$index]);
                self::setBackupCodes($userId, array_values($codes));
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * Update user's email address
     */
    public static function updateEmail(int $userId, string $newEmail): bool
    {
        $db = AuthDatabase::getInstance();
        
        $stmt = $db->prepare("UPDATE users SET email = ?, updated_at = datetime('now') WHERE id = ?");
        return $stmt->execute([$newEmail, $userId]);
    }
    
    /**
     * Set recovery email for user
     */
    public static function setRecoveryEmail(int $userId, ?string $email): bool
    {
        $db = AuthDatabase::getInstance();
        
        $stmt = $db->prepare("UPDATE users SET recovery_email = ?, updated_at = datetime('now') WHERE id = ?");
        return $stmt->execute([$email, $userId]);
    }
    
    /**
     * Check if user can use TOTP (respects user-level AND global settings)
     */
    public static function canUseTotp(array $user): bool
    {
        // Check global setting first
        if (!Security::isFeatureEnabled('totp')) {
            return false;
        }
        
        // Then check user-level permission
        return (bool) ($user['totp_allowed'] ?? true);
    }
    
    /**
     * Check if user can use WebAuthn (respects user-level AND global settings)
     */
    public static function canUseWebAuthn(array $user): bool
    {
        // Check global setting first
        if (!Security::isFeatureEnabled('webauthn')) {
            return false;
        }
        
        // Then check user-level permission
        return (bool) ($user['webauthn_allowed'] ?? true);
    }
    
    /**
     * Check if user can use password auth (respects user-level AND global settings)
     */
    public static function canUsePassword(array $user): bool
    {
        // Check global setting first
        if (!Security::isFeatureEnabled('password')) {
            return false;
        }
        
        // Then check user-level permission
        return (bool) ($user['password_allowed'] ?? true);
    }
    
    /**
     * Get available auth methods for a user
     */
    public static function getAvailableAuthMethods(array $user): array
    {
        $methods = [];
        
        if (self::canUsePassword($user) && !empty($user['password_hash'])) {
            $methods[] = 'password';
        }
        
        if (self::canUseTotp($user) && !empty($user['totp_enabled'])) {
            $methods[] = 'totp';
        }
        
        if (self::canUseWebAuthn($user)) {
            // Check if user has any webauthn credentials
            $db = AuthDatabase::getInstance();
            $stmt = $db->prepare("SELECT COUNT(*) FROM webauthn_credentials WHERE user_id = ?");
            $stmt->execute([$user['id']]);
            
            if ($stmt->fetchColumn() > 0) {
                $methods[] = 'webauthn';
            }
        }
        
        return $methods;
    }
    
    /**
     * Count total registered users
     */
    public static function count(): int
    {
        $db = AuthDatabase::getInstance();
        return (int) $db->query("SELECT COUNT(*) FROM users")->fetchColumn();
    }

    /**
     * Find ALL users (for Admin dashboard)
     */
    public static function findAll(): array
    {
        $db = AuthDatabase::getInstance();
        $stmt = $db->query("
            SELECT 
                id, uuid, email, is_admin, 
                created_at, updated_at, last_login_at,
                failed_login_attempts, locked_until,
                totp_enabled, is_new_user
            FROM users 
            ORDER BY created_at DESC
        ");
        
        return $stmt->fetchAll();
    }

    /**
     * Update user details
     * 
     * Uses strict whitelist approach for SQL injection prevention:
     * - Only predefined field names are allowed
     * - All values go through prepared statements
     * - Input is pre-sanitized by InputSanitizer
     */
    public static function update(int $id, array $data): bool
    {
        $db = AuthDatabase::getInstance();
        
        // WHITELIST: Only these fields can be updated
        // This prevents any SQL injection through field names
        $allowedFields = [
            'email' => 'email = ?',
            'is_admin' => 'is_admin = ?',
            'password' => 'password_hash = ?',
        ];
        
        $fields = [];
        $params = [];
        
        foreach ($allowedFields as $dataKey => $sqlFragment) {
            if (!isset($data[$dataKey])) {
                continue;
            }
            
            switch ($dataKey) {
                case 'email':
                    // Email should already be sanitized, but double-check
                    $email = filter_var($data['email'], FILTER_VALIDATE_EMAIL);
                    if ($email) {
                        $fields[] = $sqlFragment;
                        $params[] = $email;
                    }
                    break;
                    
                case 'is_admin':
                    $fields[] = $sqlFragment;
                    $params[] = $data['is_admin'] ? 1 : 0;
                    break;
                    
                case 'password':
                    if (!empty($data['password']) && is_string($data['password'])) {
                        $fields[] = $sqlFragment;
                        $params[] = self::hashPassword($data['password']);
                    }
                    break;
            }
        }
        
        if (empty($fields)) {
            return false;
        }
        
        // Add updated_at - this is safe as it's hardcoded
        $fields[] = "updated_at = datetime('now')";
        
        // Build SQL with only whitelisted field names
        $sql = "UPDATE users SET " . implode(', ', $fields) . " WHERE id = ?";
        $params[] = $id;
        
        return $db->prepare($sql)->execute($params);
    }

    /**
     * Delete user
     */
    public static function delete(int $id): bool
    {
        $db = AuthDatabase::getInstance();
        $stmt = $db->prepare("DELETE FROM users WHERE id = ?");
        return $stmt->execute([$id]);
    }

    /**
     * Lock or Unlock user (Deactivate/Activate)
     */
    public static function toggleLock(int $id, bool $lock): bool
    {
        $db = AuthDatabase::getInstance();
        
        if ($lock) {
            // Lock for 100 years (effectively permanent)
            $lockedUntil = date('Y-m-d H:i:s', strtotime('+100 years'));
            $sql = "UPDATE users SET locked_until = ? WHERE id = ?";
            return $db->prepare($sql)->execute([$lockedUntil, $id]);
        } else {
            // Unlock
            $sql = "UPDATE users SET locked_until = NULL, failed_login_attempts = 0 WHERE id = ?";
            return $db->prepare($sql)->execute([$id]);
        }
    }

    // ==========================================
    // AI ASSISTANT SETTINGS (PER-USER)
    // ==========================================

    /**
     * Get AI settings for a user (API key is NOT returned for security)
     */
    public static function getAiSettings(int $userId): array
    {
        $user = self::findById($userId);
        
        if (!$user) {
            return [
                'ai_enabled' => false,
                'has_api_key' => false,
                'ai_system_prompt' => null,
                'ai_max_tokens' => 4096,
                'ai_selected_model' => null,
            ];
        }
        
        return [
            'ai_enabled' => (bool) ($user['ai_enabled'] ?? false),
            'has_api_key' => !empty($user['ai_api_key']),
            'ai_system_prompt' => $user['ai_system_prompt'] ?? null,
            'ai_max_tokens' => (int) ($user['ai_max_tokens'] ?? 4096),
            'ai_selected_model' => $user['ai_selected_model'] ?? null,
        ];
    }

    /**
     * Update AI enabled status
     */
    public static function setAiEnabled(int $userId, bool $enabled): bool
    {
        $db = AuthDatabase::getInstance();
        
        $stmt = $db->prepare("UPDATE users SET ai_enabled = ?, updated_at = datetime('now') WHERE id = ?");
        return $stmt->execute([$enabled ? 1 : 0, $userId]);
    }

    /**
     * Set AI API key (encrypted at rest)
     */
    public static function setAiApiKey(int $userId, ?string $apiKey): bool
    {
        $db = AuthDatabase::getInstance();
        
        // Encrypt the API key before storing
        $encryptedKey = null;
        if (!empty($apiKey)) {
            $encryptedKey = EncryptionService::encrypt($apiKey);
        }
        
        $stmt = $db->prepare("UPDATE users SET ai_api_key = ?, updated_at = datetime('now') WHERE id = ?");
        return $stmt->execute([$encryptedKey, $userId]);
    }

    /**
     * Get decrypted AI API key for a user (INTERNAL USE ONLY - for API calls)
     * Returns null if not set or decryption fails
     */
    public static function getAiApiKey(int $userId): ?string
    {
        $user = self::findById($userId);
        
        if (!$user || empty($user['ai_api_key'])) {
            return null;
        }
        
        $encryptedKey = $user['ai_api_key'];
        
        // Check if encrypted
        if (EncryptionService::isEncrypted($encryptedKey)) {
            try {
                return EncryptionService::decrypt($encryptedKey);
            } catch (\Exception $e) {
                error_log('AI API key decryption failed for user ID: ' . $userId);
                return null;
            }
        }
        
        // Legacy: plaintext key (shouldn't happen, but handle gracefully)
        return $encryptedKey;
    }

    /**
     * Set AI system prompt
     */
    public static function setAiSystemPrompt(int $userId, ?string $prompt): bool
    {
        $db = AuthDatabase::getInstance();
        
        $stmt = $db->prepare("UPDATE users SET ai_system_prompt = ?, updated_at = datetime('now') WHERE id = ?");
        return $stmt->execute([$prompt, $userId]);
    }

    /**
     * Update all AI settings at once
     */
    public static function updateAiSettings(int $userId, array $settings): bool
    {
        $db = AuthDatabase::getInstance();
        
        $updates = [];
        $params = [];
        
        if (isset($settings['ai_enabled'])) {
            $updates[] = "ai_enabled = ?";
            $params[] = $settings['ai_enabled'] ? 1 : 0;
        }
        
        if (array_key_exists('ai_api_key', $settings)) {
            $updates[] = "ai_api_key = ?";
            if (!empty($settings['ai_api_key'])) {
                $params[] = EncryptionService::encrypt($settings['ai_api_key']);
            } else {
                $params[] = null;
            }
        }
        
        if (array_key_exists('ai_system_prompt', $settings)) {
            $updates[] = "ai_system_prompt = ?";
            $params[] = $settings['ai_system_prompt'];
        }
        
        if (isset($settings['ai_max_tokens'])) {
            // Validate range: 1024 to 32768
            $maxTokens = max(1024, min(32768, (int) $settings['ai_max_tokens']));
            $updates[] = "ai_max_tokens = ?";
            $params[] = $maxTokens;
        }
        
        if (array_key_exists('ai_selected_model', $settings)) {
            $updates[] = "ai_selected_model = ?";
            $params[] = $settings['ai_selected_model'];
        }
        
        if (empty($updates)) {
            return false;
        }
        
        $updates[] = "updated_at = datetime('now')";
        $params[] = $userId;
        
        $sql = "UPDATE users SET " . implode(', ', $updates) . " WHERE id = ?";
        
        return $db->prepare($sql)->execute($params);
    }

    /**
     * Check if user has AI enabled and configured
     */
    public static function isAiReady(int $userId): bool
    {
        $user = self::findById($userId);
        
        if (!$user) {
            return false;
        }
        
        return (bool) $user['ai_enabled'] && !empty($user['ai_api_key']);
    }
}

