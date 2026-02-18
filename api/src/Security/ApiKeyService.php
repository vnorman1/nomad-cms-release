<?php
/**
 * NOMAD CMS - API Key Service
 * 
 * Manages API keys for external integrations (webhooks, email services, etc.)
 * Keys are only viewable once on creation (zero-knowledge principle).
 * 
 * Permissions:
 * - read: Can read content data
 * - write: Can create/update content data
 * - admin: Full access (rarely granted)
 */

declare(strict_types=1);

namespace NomadCMS\Security;

use NomadCMS\Database\AuthDatabase;
use PDO;
use RuntimeException;

final class ApiKeyService
{
    private PDO $db;
    
    // Key prefix for easy identification
    private const KEY_PREFIX = 'nmk_';
    
    // Enhanced key prefix (longer for identification)
    private const ENHANCED_KEY_PREFIX = 'nmk_pro_';
    
    // Permissions bitmask
    public const PERM_READ = 1;
    public const PERM_WRITE = 2;
    public const PERM_ADMIN = 4;
    
    // New permissions for encrypted data
    public const PERM_ENCRYPTED_READ = 8;   // Can read encrypted slot data
    public const PERM_ENCRYPTED_WRITE = 16; // Can write encrypted slot data
    
    public function __construct()
    {
        $this->db = AuthDatabase::getInstance();
        $this->ensureTable();
    }
    
    /**
     * Ensure api_keys table exists
     */
    private function ensureTable(): void
    {
        $this->db->exec("
            CREATE TABLE IF NOT EXISTS api_keys (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                key_hash TEXT NOT NULL,
                key_prefix TEXT NOT NULL,
                permissions INTEGER NOT NULL DEFAULT 1,
                last_used_at TEXT DEFAULT NULL,
                usage_count INTEGER DEFAULT 0,
                expires_at TEXT DEFAULT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                revoked_at TEXT DEFAULT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        ");
        
        // Add usage_count column if it doesn't exist (migration for existing tables)
        try {
            $this->db->exec("ALTER TABLE api_keys ADD COLUMN usage_count INTEGER DEFAULT 0");
        } catch (\PDOException $e) {
            // Column already exists, ignore
        }
        
        // Add key_type column for enhanced keys (migration for existing tables)
        try {
            $this->db->exec("ALTER TABLE api_keys ADD COLUMN key_type TEXT DEFAULT 'standard'");
        } catch (\PDOException $e) {
            // Column already exists, ignore
        }
        
        $this->db->exec("CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id)");
        $this->db->exec("CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash)");
    }
    
    /**
     * Create a new API key
     * Returns the full key (only viewable once!)
     * 
     * Note: Input should be pre-sanitized by InputSanitizer at the endpoint level.
     * This method performs additional validation as a safety net.
     */
    public function createKey(
        int $userId,
        string $name,
        array $permissions = ['read'],
        ?string $expiresAt = null
    ): array {
        // Final validation (input should already be sanitized)
        $name = trim($name);
        if (empty($name) || strlen($name) > 100) {
            throw new RuntimeException('Key name must be 1-100 characters');
        }
        
        // Whitelist permissions
        $validPermissions = ['read', 'write', 'admin'];
        $permissions = array_values(array_intersect($permissions, $validPermissions));
        if (empty($permissions)) {
            $permissions = ['read'];
        }
        
        // Rate limit: max 10 active keys per user
        $stmt = $this->db->prepare("
            SELECT COUNT(*) FROM api_keys 
            WHERE user_id = ? AND revoked_at IS NULL
        ");
        $stmt->execute([$userId]);
        $activeCount = (int) $stmt->fetchColumn();
        
        if ($activeCount >= 10) {
            throw new RuntimeException('Maximum 10 active API keys allowed per user');
        }
        
        // Calculate permissions bitmask
        $permBits = 0;
        foreach ($permissions as $perm) {
            $permBits |= match($perm) {
                'read' => self::PERM_READ,
                'write' => self::PERM_WRITE,
                'admin' => self::PERM_ADMIN,
                default => 0,
            };
        }
        
        if ($permBits === 0) {
            $permBits = self::PERM_READ; // Default to read-only
        }
        
        // Generate secure random key with additional entropy
        $rawKey = bin2hex(random_bytes(32)); // 64 chars
        $fullKey = self::KEY_PREFIX . $rawKey;
        
        // Store only the hash (zero-knowledge) using password_hash for extra security
        $keyHash = hash('sha256', $fullKey);
        $keyPrefix = substr($fullKey, 0, 12); // nmk_xxxxxxxx visible prefix
        
        $stmt = $this->db->prepare("
            INSERT INTO api_keys (user_id, name, key_hash, key_prefix, permissions, expires_at, key_type)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ");
        
        $stmt->execute([
            $userId,
            $name,
            $keyHash,
            $keyPrefix,
            $permBits,
            $expiresAt,
            'standard',
        ]);
        
        $keyId = (int) $this->db->lastInsertId();
        
        return [
            'id' => $keyId,
            'name' => $name,
            'key' => $fullKey, // Only returned once!
            'key_prefix' => $keyPrefix,
            'permissions' => $this->permissionsToArray($permBits),
            'expires_at' => $expiresAt,
            'created_at' => date('c'),
            'key_type' => 'standard',
        ];
    }
    
    /**
     * Create a new Enhanced (PRO) API key with extra security
     * Returns the full key (only viewable once!)
     * Enhanced keys are 3x longer (96 bytes = 192 hex chars)
     * 
     * Note: Input should be pre-sanitized by InputSanitizer at the endpoint level.
     */
    public function createEnhancedKey(
        int $userId,
        string $name,
        array $permissions = ['read'],
        array $encryptedPermissions = [],
        ?string $expiresAt = null
    ): array {
        // Final validation (input should already be sanitized)
        $name = trim($name);
        if (empty($name) || strlen($name) > 100) {
            throw new RuntimeException('Key name must be 1-100 characters');
        }
        
        // Whitelist standard permissions
        $validPermissions = ['read', 'write', 'admin'];
        $permissions = array_values(array_intersect($permissions, $validPermissions));
        if (empty($permissions)) {
            $permissions = ['read'];
        }
        
        // Whitelist encrypted permissions
        $validEncryptedPerms = ['encrypted_read', 'encrypted_write'];
        $encryptedPermissions = array_values(array_intersect($encryptedPermissions, $validEncryptedPerms));
        
        // Rate limit: max 10 active keys per user
        $stmt = $this->db->prepare("
            SELECT COUNT(*) FROM api_keys 
            WHERE user_id = ? AND revoked_at IS NULL
        ");
        $stmt->execute([$userId]);
        $activeCount = (int) $stmt->fetchColumn();
        
        if ($activeCount >= 10) {
            throw new RuntimeException('Maximum 10 active API keys allowed per user');
        }
        
        // Calculate permissions bitmask (standard permissions)
        $permBits = 0;
        foreach ($permissions as $perm) {
            $permBits |= match($perm) {
                'read' => self::PERM_READ,
                'write' => self::PERM_WRITE,
                'admin' => self::PERM_ADMIN,
                default => 0,
            };
        }
        
        // Add encrypted permissions
        foreach ($encryptedPermissions as $perm) {
            $permBits |= match($perm) {
                'encrypted_read' => self::PERM_ENCRYPTED_READ,
                'encrypted_write' => self::PERM_ENCRYPTED_WRITE,
                default => 0,
            };
        }
        
        if ($permBits === 0) {
            $permBits = self::PERM_READ; // Default to read-only
        }
        
        // Generate enhanced secure random key (3x longer: 96 bytes = 192 hex chars)
        $rawKey = bin2hex(random_bytes(96)); // 192 hex chars
        $fullKey = self::ENHANCED_KEY_PREFIX . $rawKey; // nmk_pro_ + 192 = 200 chars
        
        // Store only the hash (zero-knowledge) using SHA-256
        $keyHash = hash('sha256', $fullKey);
        $keyPrefix = substr($fullKey, 0, 16); // nmk_pro_xxxxxxxx visible prefix
        
        $stmt = $this->db->prepare("
            INSERT INTO api_keys (user_id, name, key_hash, key_prefix, permissions, expires_at, key_type)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ");
        
        $stmt->execute([
            $userId,
            $name,
            $keyHash,
            $keyPrefix,
            $permBits,
            $expiresAt,
            'enhanced',
        ]);
        
        $keyId = (int) $this->db->lastInsertId();
        
        return [
            'id' => $keyId,
            'name' => $name,
            'key' => $fullKey, // Only returned once! 200 chars total
            'key_prefix' => $keyPrefix,
            'permissions' => $this->permissionsToArray($permBits),
            'encrypted_permissions' => $this->encryptedPermissionsToArray($permBits),
            'expires_at' => $expiresAt,
            'created_at' => date('c'),
            'key_type' => 'enhanced',
        ];
    }
    
    /**
     * List all API keys for a user (without full key)
     */
    public function listKeys(int $userId): array
    {
        // Cleanup old revoked keys first
        $this->cleanupRevokedKeys();
        
        $stmt = $this->db->prepare("
            SELECT id, name, key_prefix, permissions, last_used_at, usage_count, expires_at, created_at, revoked_at, key_type
            FROM api_keys
            WHERE user_id = ?
            ORDER BY created_at DESC
        ");
        $stmt->execute([$userId]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        return array_map(function($row) {
            $permBits = (int) $row['permissions'];
            $keyType = $row['key_type'] ?? 'standard';
            
            $result = [
                'id' => (int) $row['id'],
                'name' => $row['name'],
                'key_prefix' => $row['key_prefix'],
                'permissions' => $this->permissionsToArray($permBits),
                'last_used_at' => $row['last_used_at'],
                'usage_count' => (int) ($row['usage_count'] ?? 0),
                'expires_at' => $row['expires_at'],
                'created_at' => $row['created_at'],
                'is_active' => $row['revoked_at'] === null && !$this->isExpired($row['expires_at']),
                'key_type' => $keyType,
            ];
            
            // Add encrypted permissions for enhanced keys
            if ($keyType === 'enhanced') {
                $result['encrypted_permissions'] = $this->encryptedPermissionsToArray($permBits);
            }
            
            return $result;
        }, $rows);
    }
    
    /**
     * Revoke an API key
     */
    public function revokeKey(int $userId, int $keyId): bool
    {
        $stmt = $this->db->prepare("
            UPDATE api_keys 
            SET revoked_at = datetime('now')
            WHERE id = ? AND user_id = ? AND revoked_at IS NULL
        ");
        $stmt->execute([$keyId, $userId]);
        
        // Cleanup old revoked keys
        $this->cleanupRevokedKeys();
        
        return $stmt->rowCount() > 0;
    }
    
    /**
     * Delete revoked keys older than 12 hours
     */
    public function cleanupRevokedKeys(): int
    {
        $stmt = $this->db->prepare("
            DELETE FROM api_keys 
            WHERE revoked_at IS NOT NULL 
            AND datetime(revoked_at, '+12 hours') < datetime('now')
        ");
        $stmt->execute();
        
        return $stmt->rowCount();
    }
    
    /**
     * Validate an API key and return associated data
     */
    public function validateKey(string $key): ?array
    {
        // Check format (standard or enhanced)
        $isEnhanced = str_starts_with($key, self::ENHANCED_KEY_PREFIX);
        $isStandard = !$isEnhanced && str_starts_with($key, self::KEY_PREFIX);
        
        if (!$isStandard && !$isEnhanced) {
            return null;
        }
        
        $keyHash = hash('sha256', $key);
        
        $stmt = $this->db->prepare("
            SELECT ak.id, ak.user_id, ak.name, ak.permissions, ak.expires_at, ak.revoked_at, ak.key_type,
                   u.uuid, u.email, u.is_admin
            FROM api_keys ak
            JOIN users u ON ak.user_id = u.id
            WHERE ak.key_hash = ?
        ");
        $stmt->execute([$keyHash]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$row) {
            return null;
        }
        
        // Check if revoked
        if ($row['revoked_at'] !== null) {
            return null;
        }
        
        // Check if expired
        if ($this->isExpired($row['expires_at'])) {
            return null;
        }
        
        // Update last used timestamp and increment usage count
        $this->db->prepare("
            UPDATE api_keys 
            SET last_used_at = datetime('now'), usage_count = COALESCE(usage_count, 0) + 1 
            WHERE id = ?
        ")->execute([$row['id']]);
        
        $permBits = (int) $row['permissions'];
        $keyType = $row['key_type'] ?? 'standard';
        
        $result = [
            'key_id' => (int) $row['id'],
            'user_id' => (int) $row['user_id'],
            'user_uuid' => $row['uuid'],
            'user_email' => $row['email'],
            'user_is_admin' => (bool) $row['is_admin'],
            'permissions' => $this->permissionsToArray($permBits),
            'can_read' => ($permBits & self::PERM_READ) !== 0,
            'can_write' => ($permBits & self::PERM_WRITE) !== 0,
            'is_admin' => ($permBits & self::PERM_ADMIN) !== 0,
            'key_type' => $keyType,
        ];
        
        // Add encrypted permissions for enhanced keys
        if ($keyType === 'enhanced') {
            $result['can_encrypted_read'] = ($permBits & self::PERM_ENCRYPTED_READ) !== 0;
            $result['can_encrypted_write'] = ($permBits & self::PERM_ENCRYPTED_WRITE) !== 0;
            $result['encrypted_permissions'] = $this->encryptedPermissionsToArray($permBits);
        }
        
        return $result;
    }
    
    /**
     * Check if key has specific permission
     */
    public function hasPermission(array $keyData, string $permission): bool
    {
        return match($permission) {
            'read' => $keyData['can_read'] ?? false,
            'write' => $keyData['can_write'] ?? false,
            'admin' => $keyData['is_admin'] ?? false,
            'encrypted_read' => $keyData['can_encrypted_read'] ?? false,
            'encrypted_write' => $keyData['can_encrypted_write'] ?? false,
            default => false,
        };
    }
    
    /**
     * Convert permissions bitmask to array
     */
    private function permissionsToArray(int $bits): array
    {
        $perms = [];
        if ($bits & self::PERM_READ) $perms[] = 'read';
        if ($bits & self::PERM_WRITE) $perms[] = 'write';
        if ($bits & self::PERM_ADMIN) $perms[] = 'admin';
        return $perms;
    }
    
    /**
     * Convert encrypted permissions bitmask to array
     */
    private function encryptedPermissionsToArray(int $bits): array
    {
        $perms = [];
        if ($bits & self::PERM_ENCRYPTED_READ) $perms[] = 'encrypted_read';
        if ($bits & self::PERM_ENCRYPTED_WRITE) $perms[] = 'encrypted_write';
        return $perms;
    }
    
    /**
     * Check if a date is expired
     */
    private function isExpired(?string $expiresAt): bool
    {
        if ($expiresAt === null) return false;
        return strtotime($expiresAt) < time();
    }
}
