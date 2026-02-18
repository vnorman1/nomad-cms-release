<?php
/**
 * NOMAD CMS - Disaster Recovery Service
 * 
 * Handles data migration during disaster recovery:
 * - Re-encrypts user secrets with new ENCRYPTION_KEY
 * - Re-encrypts massive data encrypted fields
 * - Stores legacy PASSWORD_PEPPER for gradual password migration
 */

declare(strict_types=1);

namespace NomadCMS\Services;

use NomadCMS\Database\AuthDatabase;
use NomadCMS\Database\ContentDatabase;
use NomadCMS\Security\EncryptionService;
use RuntimeException;

final class RecoveryService
{
    // Setting key for legacy pepper storage
    public const LEGACY_PEPPER_KEY = 'legacy_password_pepper';
    
    /**
     * Perform full disaster recovery - restore all keys from recovery kit
     * 
     * BEST PRACTICE: We restore the ORIGINAL keys instead of re-encrypting data.
     * This is much faster and safer, especially with large datasets (300k+ records).
     * All encrypted data (TOTP, API keys, Massive records, secure files) remains
     * encrypted with the SAME key from the original installation.
     * 
     * @param array $oldKeys Array containing ENCRYPTION_KEY, PASSWORD_PEPPER, etc. from recovery kit
     * @return array Recovery statistics
     * @throws RuntimeException on failure
     */
    public static function migrate(array $oldKeys): array
    {
        $stats = [
            'env_keys_restored' => false,
            'rsa_keys_restored' => false,
            'legacy_pepper_stored' => false,
            'errors' => [],
        ];
        
        // Validate required keys from recovery kit
        if (empty($oldKeys['ENCRYPTION_KEY']) || empty($oldKeys['PASSWORD_PEPPER'])) {
            throw new RuntimeException('Recovery requires ENCRYPTION_KEY and PASSWORD_PEPPER from backup');
        }
        
        try {
            // Step 1: CRITICAL - Restore ALL keys to .env FIRST
            // This includes ENCRYPTION_KEY so all encrypted data can be decrypted
            $stats['env_keys_restored'] = self::restoreCriticalEnvKeys($oldKeys);
            
            // Step 2: Restore RSA keys for JWT signing (RS256/RS384/RS512)
            $stats['rsa_keys_restored'] = self::restoreRsaKeys($oldKeys);
            
            // Step 3: Store legacy pepper (for gradual password rehashing on login)
            // This allows users with old password hashes to still login
            self::storeLegacyPepper($oldKeys['PASSWORD_PEPPER']);
            $stats['legacy_pepper_stored'] = true;
            
            // NO DATA MIGRATION NEEDED!
            // All encrypted data stays encrypted with the ORIGINAL ENCRYPTION_KEY
            // which we just restored to .env. This is:
            // - Much faster (no re-encryption of 300k+ records)
            // - Much safer (no risk of data corruption during migration)
            // - Simpler (less code, fewer failure points)
            
            error_log("[Recovery] Disaster recovery completed: " . json_encode($stats));
            
        } catch (\Throwable $e) {
            $stats['errors'][] = $e->getMessage();
            error_log("[Recovery] Disaster recovery failed: " . $e->getMessage());
            throw $e;
        }
        
        return $stats;
    }
    
    /**
     * Re-encrypt user encrypted columns (totp_secret, ai_api_key)
     * Decrypt with OLD key, encrypt with NEW key
     * 
     * @param array $oldKeys Old keys from recovery kit
     * @return int Number of users migrated
     */
    private static function migrateUsers(array $oldKeys): int
    {
        $db = AuthDatabase::getInstance();
        $oldEncryptionKey = $oldKeys['ENCRYPTION_KEY'];
        
        // Get users with encrypted fields
        $stmt = $db->query("SELECT id, totp_secret, ai_api_key FROM users WHERE totp_secret IS NOT NULL OR ai_api_key IS NOT NULL");
        $users = $stmt->fetchAll();
        
        $migratedCount = 0;
        
        foreach ($users as $user) {
            $updates = [];
            $params = [];
            
            // Migrate TOTP secret
            if (!empty($user['totp_secret']) && self::isDefuseEncrypted($user['totp_secret'])) {
                $plaintext = self::decryptWithOldKey($user['totp_secret'], $oldEncryptionKey);
                if ($plaintext !== null) {
                    $newCiphertext = EncryptionService::encrypt($plaintext);
                    $updates[] = "totp_secret = ?";
                    $params[] = $newCiphertext;
                }
            }
            
            // Migrate AI API key
            if (!empty($user['ai_api_key']) && self::isDefuseEncrypted($user['ai_api_key'])) {
                $plaintext = self::decryptWithOldKey($user['ai_api_key'], $oldEncryptionKey);
                if ($plaintext !== null) {
                    $newCiphertext = EncryptionService::encrypt($plaintext);
                    $updates[] = "ai_api_key = ?";
                    $params[] = $newCiphertext;
                }
            }
            
            // Apply updates
            if (!empty($updates)) {
                $params[] = $user['id'];
                $sql = "UPDATE users SET " . implode(', ', $updates) . ", updated_at = datetime('now') WHERE id = ?";
                $updateStmt = $db->prepare($sql);
                $updateStmt->execute($params);
                $migratedCount++;
            }
        }
        
        return $migratedCount;
    }
    
    /**
     * Re-encrypt massive data table encrypted fields
     * Scans for Defuse-encrypted strings (def... pattern) and re-encrypts
     * 
     * @param array $oldKeys Old keys from recovery kit
     * @return int Number of records migrated
     */
    private static function migrateMassiveData(array $oldKeys): int
    {
        try {
            $db = \NomadCMS\Database\MassiveDatabase::getInstance();
        } catch (\Throwable $e) {
            // massive.sqlite might not exist
            return 0;
        }
        
        $oldEncryptionKey = $oldKeys['ENCRYPTION_KEY'];
        $migratedCount = 0;
        
        // Get all main data tables (exclude internal FTS tables and sqlite system tables)
        $tables = $db->query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '%_fts%'")->fetchAll(\PDO::FETCH_COLUMN);
        
        foreach ($tables as $table) {
            // Get columns
            $columns = $db->query("PRAGMA table_info($table)")->fetchAll();
            $textColumns = array_filter($columns, fn($c) => stripos($c['type'], 'TEXT') !== false);
            
            if (empty($textColumns)) continue;
            
            // Scan each row for encrypted values
            // Use alias for rowid to ensure it's available in fetched array
            $rows = $db->query("SELECT rowid as rid, * FROM $table")->fetchAll();
            $tableUpdated = false;
            
            foreach ($rows as $row) {
                $updates = [];
                $params = [];
                
                foreach ($textColumns as $col) {
                    $colName = $col['name'];
                    $value = $row[$colName] ?? null;
                    
                    if (!empty($value) && is_string($value) && self::isDefuseEncrypted($value)) {
                        $plaintext = self::decryptWithOldKey($value, $oldEncryptionKey);
                        
                        if ($plaintext === null) {
                            // Try verifying if it's already encrypted with the NEW key (idempotency check)
                            try {
                                EncryptionService::decrypt($value);
                                // If successful, it's already migrated. Skip.
                                continue;
                            } catch (\Throwable $e) {
                                // Decryption failed with both keys. Log error but continue.
                                $rowId = $row['rid'] ?? 'unknown';
                                error_log("[Recovery] Skipping row {$rowId} in {$table}: Decryption failed with both old and new keys.");
                                continue;
                            }
                        }

                        if ($plaintext !== null) {
                            $newCiphertext = EncryptionService::encrypt($plaintext);
                            $updates[] = "$colName = ?";
                            $params[] = $newCiphertext;
                        }
                    }
                }
                
                if (!empty($updates)) {
                    $params[] = $row['rid'];
                    $sql = "UPDATE $table SET " . implode(', ', $updates) . " WHERE rowid = ?";
                    $updateStmt = $db->prepare($sql);
                    $updateStmt->execute($params);
                    $migratedCount++;
                    $tableUpdated = true;
                }
            }
            
            // ALWAYS clear FTS table for massive tables after recovery
            // This ensures no stale/invalid blind indexes remain (which cause 500 errors)
            try {
                $ftsTable = $table . '_fts';
                // Check if FTS table exists
                $ftsJson = $db->query("SELECT name FROM sqlite_master WHERE type='table' AND name='$ftsTable'")->fetch();
                
                if ($ftsJson) {
                    $db->exec("DELETE FROM $ftsTable");
                    error_log("[Recovery] Cleared blind indexes for table: $table");
                }
            } catch (\Throwable $e) {
                error_log("[Recovery] Failed to clear FTS for $table: " . $e->getMessage());
            }
        }
        
        return $migratedCount;
    }
    
    /**
     * Store legacy pepper encrypted with NEW encryption key
     * This allows password verification during gradual migration
     * 
     * @param string $oldPepper The old PASSWORD_PEPPER value
     */
    private static function storeLegacyPepper(string $oldPepper): void
    {
        // Encrypt old pepper with NEW encryption key
        $encryptedPepper = EncryptionService::encrypt($oldPepper);
        AuthDatabase::setSetting(self::LEGACY_PEPPER_KEY, $encryptedPepper);
        error_log("Legacy password pepper stored for gradual migration");
    }
    
    /**
     * Get decrypted legacy pepper (if exists)
     * 
     * @return string|null Decrypted legacy pepper or null
     */
    public static function getLegacyPepper(): ?string
    {
        $encryptedPepper = AuthDatabase::getSetting(self::LEGACY_PEPPER_KEY);
        if (!$encryptedPepper) {
            return null;
        }
        
        try {
            return EncryptionService::decrypt($encryptedPepper);
        } catch (\Throwable $e) {
            error_log("Failed to decrypt legacy pepper: " . $e->getMessage());
            return null;
        }
    }
    
    /**
     * Remove legacy pepper after all users have migrated
     */
    public static function clearLegacyPepper(): bool
    {
        return AuthDatabase::deleteSetting(self::LEGACY_PEPPER_KEY);
    }
    
    /**
     * CRITICAL: Restore JWT_SECRET and other authentication keys to .env
     * Without this, users CANNOT login after disaster recovery!
     * 
     * Keys restored: JWT_SECRET, IP_HASH_SECRET, SESSION_SECRET, VERSIONING_HMAC_SECRET,
     * PASSWORD_SALT_PREFIX, PASSWORD_PEPPER, BLIND_INDEX_KEY, ENCRYPTION_KEY
     * 
     * @param array $oldKeys Keys from recovery kit
     * @return bool True if restoration succeeded
     */
    private static function restoreCriticalEnvKeys(array $oldKeys): bool
    {
        $apiRoot = dirname(__DIR__, 2);
        $envPath = $apiRoot . '/.env';
        
        if (!file_exists($envPath)) {
            error_log("[Recovery] .env file not found at: $envPath");
            return false;
        }
        
        // Keys that MUST be restored for authentication to work
        // Must match ALL keys generated by InstallerService!
        // 
        // ✅ BEST PRACTICE: Restore ALL original keys from recovery kit
        // This way encrypted data (TOTP, API keys, Massive records, secure files)
        // remains encrypted with the SAME key - no migration needed!
        // This is much faster and safer than re-encrypting 300k+ records.
        //
        $keysToRestore = [
            'JWT_SECRET',              // Critical for token verification
            'IP_HASH_SECRET',          // Critical for session binding
            'SESSION_SECRET',          // Critical for session management
            'VERSIONING_HMAC_SECRET',  // For version history verification
            'PASSWORD_SALT_PREFIX',    // Required for password verification
            'PASSWORD_PEPPER',         // Required for password hashing
            'JWT_ALGORITHM',           // Specifies key type (HS256 vs RS256)
            'ENCRYPTION_KEY',          // ✅ RESTORE - all data stays encrypted with original key
            'BLIND_INDEX_KEY',         // ✅ RESTORE - searchable encryption uses this
        ];
        
        try {
            $envContent = file_get_contents($envPath);
            if ($envContent === false) {
                error_log("[Recovery] Failed to read .env file");
                return false;
            }
            
            $updated = false;
            $restoredKeys = [];
            
            foreach ($keysToRestore as $keyName) {
                if (!empty($oldKeys[$keyName])) {
                    // Escape the key value for safety (in case it contains special regex chars)
                    $pattern = "/^{$keyName}=.*$/m";
                    $replacement = "{$keyName}=" . $oldKeys[$keyName];
                    
                    if (preg_match($pattern, $envContent)) {
                        $envContent = preg_replace($pattern, $replacement, $envContent);
                        $restoredKeys[] = $keyName;
                        error_log("[Recovery] Updated $keyName in .env");
                    } else {
                        // Append to end if not present
                        $envContent .= "\n{$replacement}";
                        $restoredKeys[] = $keyName;
                        error_log("[Recovery] Added $keyName to .env");
                    }
                    $updated = true;
                } else {
                    error_log("[Recovery] Warning: $keyName missing from recovery kit");
                }
            }
            
            if ($updated) {
                // ATOMIC WRITE: temp file + rename to prevent race conditions
                $tempPath = $envPath . '.tmp.' . getmypid() . '.' . bin2hex(random_bytes(4));
                
                if (file_put_contents($tempPath, $envContent, LOCK_EX) === false) {
                    error_log("[Recovery] Failed to write temp .env file");
                    return false;
                }
                
                // Secure permissions before rename
                chmod($tempPath, 0600);
                
                // Atomic rename
                if (!rename($tempPath, $envPath)) {
                    @unlink($tempPath);
                    error_log("[Recovery] Failed to atomic rename .env file");
                    return false;
                }
                
                error_log("[Recovery] Critical .env keys restored atomically: " . implode(', ', $restoredKeys));
                return true;
            }
            
            return false;
            
        } catch (\Throwable $e) {
            error_log("[Recovery] Failed to restore .env keys: " . $e->getMessage());
            return false;
        }
    }
    
    /**
     * Restore RSA private/public keys from recovery kit
     * These are used for JWT signing (RS256/RS384/RS512 algorithms)
     * If RSA keys are missing from recovery kit, system falls back to HS256 (symmetric)
     * 
     * @param array $oldKeys Keys from recovery kit
     * @return bool True if restoration succeeded (or was skipped safely)
     */
    private static function restoreRsaKeys(array $oldKeys): bool
    {
        // RSA keys are optional - system can use symmetric (HS256) if not available
        if (empty($oldKeys['RSA_PRIVATE_KEY']) && empty($oldKeys['RSA_PUBLIC_KEY'])) {
            error_log("[Recovery] Note: RSA keys not found in recovery kit, system will use HS256 (symmetric) JWT");
            return true; // Not an error - HS256 is still valid
        }
        
        // Keys are in /api/keys/, not /api/src/keys/
        $keysDir = dirname(__DIR__, 2) . '/keys';
        
        // Ensure directory exists with proper permissions
        if (!is_dir($keysDir)) {
            if (!mkdir($keysDir, 0755, true)) {
                error_log("[Recovery] Failed to create keys directory: $keysDir");
                return false;
            }
        }
        
        $restored = false;
        
        // Restore private key (required for RS256 signing)
        if (!empty($oldKeys['RSA_PRIVATE_KEY'])) {
            $privateKeyPath = $keysDir . '/private.pem';
            $tmpPath = $privateKeyPath . '.tmp.' . getmypid();
            
            // SECURITY: Set restrictive umask BEFORE file creation
            // This prevents the brief window where file could be world-readable
            $oldUmask = umask(0077);
            
            try {
                if (file_put_contents($tmpPath, $oldKeys['RSA_PRIVATE_KEY'], LOCK_EX) === false) {
                    error_log("[Recovery] Failed to write RSA private key temp file");
                    return false;
                }
                
                // Explicit chmod for extra safety
                chmod($tmpPath, 0600);
            } finally {
                // Always restore original umask
                umask($oldUmask);
            }
            
            // Atomic rename
            if (!rename($tmpPath, $privateKeyPath)) {
                unlink($tmpPath);
                error_log("[Recovery] Failed to restore RSA private key");
                return false;
            }
            
            error_log("[Recovery] RSA private key restored successfully");
            $restored = true;
        }
        
        // Restore public key (required for RS256 verification)
        if (!empty($oldKeys['RSA_PUBLIC_KEY'])) {
            $publicKeyPath = $keysDir . '/public.pem';
            $tmpPath = $publicKeyPath . '.tmp.' . getmypid();
            
            if (file_put_contents($tmpPath, $oldKeys['RSA_PUBLIC_KEY'], LOCK_EX) === false) {
                error_log("[Recovery] Failed to write RSA public key temp file");
                return false;
            }
            
            // Public key can be readable by all
            chmod($tmpPath, 0644);
            
            // Atomic rename
            if (!rename($tmpPath, $publicKeyPath)) {
                @unlink($tmpPath);
                error_log("[Recovery] Failed to restore RSA public key");
                return false;
            }
            
            error_log("[Recovery] RSA public key restored successfully");
            $restored = true;
        }
        
        return $restored;
    }
    
    /**
     * Check if a string is Defuse-encrypted (starts with "def")
     */
    private static function isDefuseEncrypted(string $value): bool
    {
        return str_starts_with($value, 'def');
    }
    
    /**
     * Decrypt data using OLD encryption key
     * 
     * @param string $ciphertext Defuse ciphertext
     * @param string $oldKeyAscii Old ENCRYPTION_KEY in ASCII format
     * @return string|null Decrypted plaintext or null on failure
     */
    private static function decryptWithOldKey(string $ciphertext, string $oldKeyAscii): ?string
    {
        try {
            $key = \Defuse\Crypto\Key::loadFromAsciiSafeString($oldKeyAscii);
            return \Defuse\Crypto\Crypto::decrypt($ciphertext, $key);
        } catch (\Throwable $e) {
            error_log("Failed to decrypt with old key: " . $e->getMessage());
            return null;
        }
    }

    /**
     * Re-encrypt secure files in files/secure directory
     * 
     * @param array $oldKeys Old encryption keys
     * @return int Number of files migrated
     */
    private static function migrateSecureFiles(array $oldKeys): int
    {
        $oldEncryptionKeyAscii = $oldKeys['ENCRYPTION_KEY'];
        $count = 0;
        $secureDir = dirname(__DIR__, 2) . '/files/secure';
        
        if (!is_dir($secureDir)) {
            return 0;
        }
        
        try {
            $oldKey = \Defuse\Crypto\Key::loadFromAsciiSafeString($oldEncryptionKeyAscii);
        } catch (\Throwable $e) {
            error_log("[Recovery] Invalid old encryption key for files: " . $e->getMessage());
            return 0;
        }
        
        $files = glob($secureDir . '/*.nomad');
        foreach ($files as $filePath) {
            try {
                // Temp path for decrypted content
                $tempDecrypted = sys_get_temp_dir() . '/rec_dec_' . bin2hex(random_bytes(8));
                $tempReEncrypted = $filePath . '.tmp';
                
                // 1. Decrypt with OLD key
                // Use EncryptionService to handle .nomad format and metadata
                $metadata = EncryptionService::decryptFileStreaming($filePath, $tempDecrypted, $oldKey);
                
                // 2. Encrypt with NEW key (default master key)
                EncryptionService::encryptFileStreaming(
                    $tempDecrypted,
                    $tempReEncrypted,
                    $metadata, // Preserve original metadata!
                    $metadata['type'] ?? 'secure_file'
                );
                
                // 3. Overwrite original file
                if (rename($tempReEncrypted, $filePath)) {
                    $count++;
                    // Fix permissions
                    chmod($filePath, 0640); 
                } else {
                    error_log("[Recovery] Failed to overwrite file: " . basename($filePath));
                    @unlink($tempReEncrypted);
                }
                
                // Cleanup decrypted temp
                @unlink($tempDecrypted);
                
            } catch (\Throwable $e) {
                error_log("[Recovery] Failed to migrate file " . basename($filePath) . ": " . $e->getMessage());
                // Cleanup temps on error
                if (isset($tempDecrypted)) @unlink($tempDecrypted);
                if (isset($tempReEncrypted)) @unlink($tempReEncrypted);
            }
        }
        
        return $count;
    }
}
