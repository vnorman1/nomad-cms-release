<?php
/**
 * NOMAD CMS - Zero-Knowledge Backup Service
 * 
 * Implements secure backup/restore with envelope encryption.
 * The server never stores backup files - acts only as a cryptographic processor.
 * 
 * Encryption Flow:
 * 1. Generate fresh RSA-2048 keypair per backup
 * 2. Create ZIP of system.sqlite + content.sqlite + /uploads
 * 3. Generate random AES Key (via Defuse Crypto)
 * 4. Encrypt ZIP with Defuse File::encryptFile (Streaming)
 * 5. Encrypt Defuse Key with RSA public key
 * 6. Package as .nomad binary format
 * 7. Return .nomad + .pem (private key) bundled in ZIP
 */

declare(strict_types=1);

namespace NomadCMS\Security;

use NomadCMS\Auth\TOTPService;
use NomadCMS\Database\AuthDatabase;
use NomadCMS\Database\ContentDatabase;
use NomadCMS\Services\RecoveryService;
use ZipArchive;
use RuntimeException;
use Defuse\Crypto\File;
use Defuse\Crypto\Key;

final class BackupService
{
    // Encryption constants
    private const RSA_KEY_BITS = 2048;
    
    // Backup file format constants
    private const BACKUP_SIGNATURE_SIZE = 32; // HMAC-SHA256 output size
    private const BACKUP_ALGO = 'sha256';
    
    // File paths
    private string $apiRoot;
    private string $systemDbPath;
    private string $massiveDbPath;
    private string $contentDbPath;
    private string $uploadsPath;
    private string $storagePath;
    private string $filesPath;
    private string $tempPath;
    
    // Database filenames for consistent archive naming
    private const ARCHIVE_SYSTEM_DB = 'system.sqlite';
    private const ARCHIVE_MASSIVE_DB = 'massive.sqlite';
    private const ARCHIVE_CONTENT_DB = 'database.sqlite';
    
    public function __construct()
    {
        $this->apiRoot = dirname(__DIR__, 2);
        
        $resolvePath = function (?string $envValue, string $defaultPath): string {
            if (empty($envValue)) {
                return $defaultPath;
            }
            if (str_starts_with($envValue, '/')) {
                return $envValue;
            }
            if (str_contains($envValue, '/')) {
                // If contains slash and not absolute, assume relative to api root
                return $this->apiRoot . '/' . ltrim($envValue, '/');
            }
            // Just filename, use default directory
            return dirname($defaultPath) . '/' . $envValue;
        };
        
        // system.sqlite
        $this->systemDbPath = $resolvePath(
            $_ENV['DB_SYSTEM_DATABASE'] ?? null, 
            $this->apiRoot . '/databases/system.sqlite'
        );
        
        // massive.sqlite
        $this->massiveDbPath = $resolvePath(
            $_ENV['DB_MASSIVE_DATABASE'] ?? null,
            $this->apiRoot . '/databases/massive.sqlite'
        );
        
        // database.sqlite
        $this->contentDbPath = $resolvePath(
            $_ENV['DB_CONTENT_DATABASE'] ?? null,
            $this->apiRoot . '/databases/database.sqlite'
        );
        
        // Fallback for legacy naming
        if (!file_exists($this->contentDbPath)) {
            $legacyPath = $this->apiRoot . '/databases/content.sqlite';
            if (file_exists($legacyPath)) {
                $this->contentDbPath = $legacyPath;
            }
        }
        
        $this->uploadsPath = $resolvePath($_ENV['UPLOAD_DIR'] ?? null, $this->apiRoot . '/uploads/');
        $this->storagePath = $this->apiRoot . '/storage';
        $this->filesPath = $resolvePath($_ENV['FILE_UPLOAD_DIR'] ?? null, $this->apiRoot . '/files/');
        $this->tempPath = sys_get_temp_dir();
    }
    
    /**
     * Create encrypted backup with fresh RSA keypair
     * Returns path to ZIP containing .nomad + .pem files
     * 
     * INCLUDES: system.sqlite, massive.sqlite, database.sqlite, /uploads
     * 
     * @param string $userId User UUID for audit
     * @param string $totpCode TOTP verification code
     * @param string $totpSecret User's TOTP secret for verification
     * @param string|null $recoveryPassword Optional password to create disaster recovery kit
     * @return array{zipPath: string, filename: string, timestamp: string}
     * @throws RuntimeException on failure
     */
    public function createSecureBackup(string $userId, string $totpCode, string $totpSecret, ?string $recoveryPassword = null): array
    {
        // Step 1: Verify TOTP
        if (!TOTPService::verifyCode($totpSecret, $totpCode)) {
            throw new RuntimeException('Invalid TOTP code');
        }
        
        // Generate timestamp for matching filenames
        $timestamp = date('Y-m-d_H-i-s');
        $baseFilename = "backup_{$timestamp}";
        
        // Temporary file paths
        $tempZipData = $this->tempPath . "/{$baseFilename}_data.zip";
        $tempEncryptedData = $this->tempPath . "/{$baseFilename}.enc"; // Defuse encrypted
        $tempNomad = $this->tempPath . "/{$baseFilename}.nomad";
        $tempPem = $this->tempPath . "/{$baseFilename}.pem";
        $tempRecovery = $this->tempPath . "/{$baseFilename}_recovery.nms";
        $tempBundle = $this->tempPath . "/{$baseFilename}_bundle.zip";
        
        try {
            // Step 2: Generate fresh RSA keypair for this backup
            $keypair = $this->generateRsaKeyPair();
            
            // Save private key to temp .pem file
            file_put_contents($tempPem, $keypair['privateKey']);
            
            // Step 3: Create ZIP archive of databases and uploads
            $this->createDataArchive($tempZipData);
            
            // Step 4: Generate random Defuse Key
            $key = Key::createNewRandomKey();
            $keyAscii = $key->saveToAsciiSafeString();
            
            // Step 5: Streaming Encrypt ZIP with Defuse
            File::encryptFile($tempZipData, $tempEncryptedData, $key);
            
            // Step 6: Encrypt Defuse Key with RSA public key
            $encryptedKey = '';
            if (!openssl_public_encrypt($keyAscii, $encryptedKey, $keypair['publicKey'], OPENSSL_PKCS1_OAEP_PADDING)) {
                throw new RuntimeException('RSA encryption failed: ' . openssl_error_string());
            }
            
            // Step 7: Package as .nomad binary format with SIGNATURE (Streamed)
            // Format: [32-byte HMAC signature][4-byte key length][Encrypted Key][Defuse Encrypted Payload]
            // The signature covers everything AFTER the first 32 bytes (stateless verification)
            
            // First, write the payload (without signature) to temp file
            $tempPayload = $this->tempPath . "/{$baseFilename}_payload.tmp";
            $fpPayload = fopen($tempPayload, 'wb');
            if ($fpPayload === false) {
                throw new RuntimeException('Failed to create temp payload file');
            }
            
            fwrite($fpPayload, pack('N', strlen($encryptedKey)));
            fwrite($fpPayload, $encryptedKey);
            
            // Stream the encrypted content to payload
            $inFunc = fopen($tempEncryptedData, 'rb');
            stream_copy_to_stream($inFunc, $fpPayload);
            fclose($inFunc);
            fclose($fpPayload);
            
            // Step 8: Calculate HMAC signature of the payload
            $signature = $this->calculateFileSignature($tempPayload);
            
            // Step 9: Write final .nomad file with signature prepended
            $fp = fopen($tempNomad, 'wb');
            if ($fp === false) {
                throw new RuntimeException('Failed to open temp nomad file for writing');
            }
            
            fwrite($fp, $signature); // 32 bytes HMAC-SHA256
            
            // Stream the payload after signature
            $payloadIn = fopen($tempPayload, 'rb');
            stream_copy_to_stream($payloadIn, $fp);
            fclose($payloadIn);
            fclose($fp);
            
            // Cleanup payload temp
            @unlink($tempPayload);
            
            // Step 10: Create Disaster Recovery Kit (if password provided)
            $recoveryPath = null;
            if (!empty($recoveryPassword)) {
                $this->createRecoveryKit($tempRecovery, $recoveryPassword);
                $recoveryPath = $tempRecovery;
            }
            
            // Step 11: Bundle .nomad + .pem (+ recovery.nms) in final ZIP
            $this->createBundleZip($tempBundle, $tempNomad, $tempPem, $baseFilename, $recoveryPath);
            
            // Cleanup intermediate files
            @unlink($tempZipData);
            @unlink($tempEncryptedData);
            @unlink($tempNomad);
            @unlink($tempPem);
            if ($recoveryPath) @unlink($recoveryPath);
            
            return [
                'zipPath' => $tempBundle,
                'filename' => "{$baseFilename}.zip",
                'timestamp' => $timestamp,
            ];
            
        } catch (\Throwable $e) {
            // Cleanup on failure
            @unlink($tempZipData);
            @unlink($tempEncryptedData);
            @unlink($tempNomad);
            @unlink($tempPem);
            @unlink($tempRecovery);
            @unlink($tempBundle);
            
            throw new RuntimeException('Backup creation failed: ' . $e->getMessage());
        }
    }
    
    /**
     * Restore from encrypted .nomad backup
     * Memory safe implementation using streaming
     * 
     * SECURITY: Validates that the .nomad file is a BACKUP type, not a secure_file
     * 
     * DISASTER RECOVERY: If recoveryPassword is provided, uses old keys from recovery.nms
     * to verify signature and performs data migration after restore
     * 
     * NOTE: TOTP is NOT required for restore - the .pem private key serves as authentication
     * 
     * @param string $userId User UUID
     * @param string $nomadFilePath Path to .nomad file
     * @param string $privateKeyPem RSA private key PEM
     * @param string|null $recoveryPassword Optional recovery password for disaster recovery
     * @param string|null $recoveryFilePath Optional path to recovery.nms file
     */
    public function restoreFromBackup(
        string $userId,
        string $nomadFilePath,
        string $privateKeyPem,
        ?string $recoveryPassword = null,
        ?string $recoveryFilePath = null
    ): array {
        // Validate private key format
        $privateKey = openssl_pkey_get_private($privateKeyPem);
        if ($privateKey === false) {
            throw new RuntimeException('Invalid private key format');
        }
        
        // SECURITY: Validate this is NOT a secure_file .nomad (wrong type)
        $this->validateBackupFileType($nomadFilePath);
        
        // Disaster Recovery Mode: Use old keys for signature verification
        $oldKeys = null;
        $isDisasterRecovery = false;
        
        if ($recoveryPassword && $recoveryFilePath && file_exists($recoveryFilePath)) {
            try {
                $oldKeys = $this->decryptRecoveryKit($recoveryFilePath, $recoveryPassword);
                // Verify signature using OLD encryption key
                $this->verifyBackupSignatureWithKey($nomadFilePath, $oldKeys['ENCRYPTION_KEY']);
                $isDisasterRecovery = true;
                error_log('Disaster recovery mode: Backup signature verified with old key');
            } catch (\Throwable $e) {
                throw new RuntimeException('Disaster recovery failed: ' . $e->getMessage());
            }
        } else {
            // Standard verification with current ENCRYPTION_KEY
            $this->verifyBackupSignature($nomadFilePath);
        }
        
        $timestamp = date('Y-m-d_H-i-s');
        $tempEncryptedPayload = $this->tempPath . "/restore_payload_{$timestamp}.enc";
        $tempExtractedZip = $this->tempPath . "/restore_{$timestamp}.zip";
        $tempExtractDir = $this->tempPath . "/restore_{$timestamp}";
        
        try {
            // Step 2: Read Header from .nomad file (skip 32-byte signature)
            $fp = fopen($nomadFilePath, 'rb');
            if ($fp === false) {
                throw new RuntimeException('Cannot open .nomad file');
            }
            
            // Skip signature (32 bytes)
            fseek($fp, self::BACKUP_SIGNATURE_SIZE);
            
            // Read key length (4 bytes)
            $header = fread($fp, 4);
            if (strlen($header) < 4) {
                 throw new RuntimeException('Invalid .nomad file');
            }
            $keyLength = unpack('N', $header)[1];
            
            // Read Encrypted Key
            $encryptedKey = fread($fp, $keyLength);
            
            // Decrypt Key
            $keyAscii = '';
            if (!openssl_private_decrypt($encryptedKey, $keyAscii, $privateKey, OPENSSL_PKCS1_OAEP_PADDING)) {
                throw new RuntimeException('Decryption failed: Invalid private key');
            }
            $key = Key::loadFromAsciiSafeString($keyAscii);
            
            // Stream the rest (Defuse Payload) to a temp file
            $outFunc = fopen($tempEncryptedPayload, 'wb');
            stream_copy_to_stream($fp, $outFunc);
            fclose($outFunc);
            fclose($fp);
            
            // Step 3: Decrypt using Defuse (Streaming)
            File::decryptFile($tempEncryptedPayload, $tempExtractedZip, $key);
            
            // Step 4: Extract and deploy
            mkdir($tempExtractDir, 0755, true);
            
            $zip = new ZipArchive();
            if ($zip->open($tempExtractedZip) !== true) {
                throw new RuntimeException('Cannot open decrypted archive');
            }
            $zip->extractTo($tempExtractDir);
            $zip->close();
            
            // Step 5: Verify extracted contents (Sanity Check)
            // At least one database should exist
            $extractedSystem = $tempExtractDir . '/' . self::ARCHIVE_SYSTEM_DB;
            $extractedMassive = $tempExtractDir . '/' . self::ARCHIVE_MASSIVE_DB;
            $extractedContent = $tempExtractDir . '/' . self::ARCHIVE_CONTENT_DB;
            
            $hasContent = file_exists($extractedSystem) || file_exists($extractedMassive) || file_exists($extractedContent);
            if (!$hasContent) {
                throw new RuntimeException('Missing databases in backup (expected system.sqlite, massive.sqlite or database.sqlite)');
            }
            
            // Step 6: Close existing DB connections
            AuthDatabase::close();
            ContentDatabase::close();
            
            // Step 7: Atomic replacement (Backup current to pre_restore)
            $preRestoreDir = $this->apiRoot . '/.pre_restore_backups/' . $timestamp;
            if (!is_dir($preRestoreDir)) {
                mkdir($preRestoreDir, 0755, true);
            }
            
            // Backup current databases before restore
            if (file_exists($this->systemDbPath)) {
                copy($this->systemDbPath, $preRestoreDir . '/system.sqlite');
            }
            if (file_exists($this->massiveDbPath)) {
                copy($this->massiveDbPath, $preRestoreDir . '/massive.sqlite');
            }
            if (file_exists($this->contentDbPath)) {
                copy($this->contentDbPath, $preRestoreDir . '/database.sqlite');
            }
            
            // Replace DBs (only if they exist in backup)
            if (file_exists($extractedSystem)) {
                copy($extractedSystem, $this->systemDbPath);
            }
            if (file_exists($extractedMassive)) {
                copy($extractedMassive, $this->massiveDbPath);
            }
            if (file_exists($extractedContent)) {
                copy($extractedContent, $this->contentDbPath);
            }
            
            // Restore Uploads (Sync)
            $extractedUploads = $tempExtractDir . '/uploads';
            if (is_dir($extractedUploads)) {
                $this->syncDirectory($extractedUploads, $this->uploadsPath);
            }
            
            // Restore Storage (Sync)
            $extractedStorage = $tempExtractDir . '/storage';
            if (is_dir($extractedStorage)) {
                $this->syncDirectory($extractedStorage, $this->storagePath);
            }
            
            // Restore Files (Sync)
            $extractedFiles = $tempExtractDir . '/files';
            if (is_dir($extractedFiles)) {
                $this->syncDirectory($extractedFiles, $this->filesPath);
            }
            
            // Cleanup
            $this->recursiveDelete($tempExtractDir);
            @unlink($tempExtractedZip);
            @unlink($tempEncryptedPayload);
            
            // DISASTER RECOVERY: Migrate data with new keys
            $migrationStats = null;
            if ($isDisasterRecovery && $oldKeys) {
                $migrationStats = RecoveryService::migrate($oldKeys);
                error_log('Disaster recovery migration completed: ' . json_encode($migrationStats));
                
                // CRITICAL: Reload .env after disaster recovery migration
                // The migration updated .env with new JWT_SECRET, RSA keys, etc.
                // But PHP has already loaded the OLD values into $_ENV
                // We MUST reload to make new keys available
                $this->reloadEnvironment();
            }
            
            return [
                'success' => true,
                'message' => $isDisasterRecovery 
                    ? 'Backup restored successfully (Disaster Recovery: data migrated to new keys)' 
                    : 'Backup restored successfully',
                'disaster_recovery' => $isDisasterRecovery,
                'migration_stats' => $migrationStats,
            ];
            
        } catch (\Throwable $e) {
            // Cleanup
            @unlink($tempExtractedZip);
            @unlink($tempEncryptedPayload);
            if (is_dir($tempExtractDir)) {
                $this->recursiveDelete($tempExtractDir);
            }
            throw new RuntimeException('Restore failed: ' . $e->getMessage());
        }
    }

    /**
     * Create backup for automated/scheduled backups (no TOTP required)
     * Returns separate .nomad and .pem file paths for cloud upload
     */
    public function createAutoBackup(): array
    {
        $timestamp = date('Y-m-d_H-i-s');
        $baseFilename = "backup_{$timestamp}";
        
        $tempZipData = $this->tempPath . "/{$baseFilename}_data.zip";
        $tempEncryptedData = $this->tempPath . "/{$baseFilename}.enc";
        $tempNomad = $this->tempPath . "/{$baseFilename}.nomad";
        $tempPem = $this->tempPath . "/{$baseFilename}.pem";
        
        try {
            // Generate RSA keypair
            $keypair = $this->generateRsaKeyPair();
            file_put_contents($tempPem, $keypair['privateKey']);
            
            // Create ZIP
            $this->createDataArchive($tempZipData);
            
            // Generate Defuse Key
            $key = Key::createNewRandomKey();
            $keyAscii = $key->saveToAsciiSafeString();
            
            // Encrypt ZIP
            File::encryptFile($tempZipData, $tempEncryptedData, $key);
            
            // Encrypt Key
            $encryptedKey = '';
            if (!openssl_public_encrypt($keyAscii, $encryptedKey, $keypair['publicKey'], OPENSSL_PKCS1_OAEP_PADDING)) {
                throw new RuntimeException('RSA encryption failed');
            }
            
            // Package with signature (same format as createSecureBackup)
            // Format: [32-byte HMAC signature][4-byte key length][Encrypted Key][Defuse Encrypted Payload]
            $tempPayload = $this->tempPath . "/{$baseFilename}_payload.tmp";
            $fpPayload = fopen($tempPayload, 'wb');
            fwrite($fpPayload, pack('N', strlen($encryptedKey)));
            fwrite($fpPayload, $encryptedKey);
            $inFunc = fopen($tempEncryptedData, 'rb');
            stream_copy_to_stream($inFunc, $fpPayload);
            fclose($inFunc);
            fclose($fpPayload);
            
            // Calculate signature
            $signature = $this->calculateFileSignature($tempPayload);
            
            // Write final .nomad with signature
            $fp = fopen($tempNomad, 'wb');
            fwrite($fp, $signature); // 32 bytes
            $payloadIn = fopen($tempPayload, 'rb');
            stream_copy_to_stream($payloadIn, $fp);
            fclose($payloadIn);
            fclose($fp);
            
            // Cleanup
            @unlink($tempZipData);
            @unlink($tempEncryptedData);
            @unlink($tempPayload);
            
            return [
                'nomadPath' => $tempNomad,
                'pemPath' => $tempPem,
                'timestamp' => $timestamp,
            ];
            
        } catch (\Throwable $e) {
            @unlink($tempZipData);
            @unlink($tempEncryptedData);
            @unlink($tempNomad);
            @unlink($tempPem);
            throw new RuntimeException('Auto backup failed: ' . $e->getMessage());
        }
    }
    
    /**
     * Stream the backup ZIP directly to browser
     */
    public function streamBackupDownload(string $zipPath, string $filename): void
    {
        if (!file_exists($zipPath)) {
            throw new RuntimeException('Backup file not found');
        }
        
        $filesize = filesize($zipPath);
        
        // CRITICAL: Clear any output buffers and previous headers
        // This is required for Apache production compatibility where
        // bootstrap.php and endpoint set Content-Type: application/json early
        while (ob_get_level() > 0) {
            ob_end_clean();
        }
        
        // Remove any previously set headers (especially Content-Type: application/json)
        header_remove('Content-Type');
        header_remove('Content-Security-Policy');
        header_remove('X-Content-Type-Options');
        
        // Set headers for binary download
        header('Content-Type: application/zip');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header('Content-Length: ' . $filesize);
        header('Cache-Control: no-cache, must-revalidate');
        header('Pragma: no-cache');
        header('X-Content-Type-Options: nosniff');
        
        // Stream file
        readfile($zipPath);
        
        // Cleanup after streaming
        @unlink($zipPath);
        
        exit;
    }

    // =========================================================================
    // Private Helper Methods
    // =========================================================================
    
    // ... [Reuse existing helper methods like generateRsaKeyPair, createDataArchive, addDirectoryToZip, recursiveDelete from original file] ...
    // Note: I will copy them back in full to ensure integrity, assuming I need to write the whole file.
    
    /**
     * Generate fresh RSA-2048 keypair
     */
    private function generateRsaKeyPair(): array
    {
        $config = [
            'private_key_bits' => self::RSA_KEY_BITS,
            'private_key_type' => OPENSSL_KEYTYPE_RSA,
        ];
        
        $resource = openssl_pkey_new($config);
        if ($resource === false) {
            throw new RuntimeException('RSA key generation failed: ' . openssl_error_string());
        }
        
        $privateKey = '';
        openssl_pkey_export($resource, $privateKey);
        $details = openssl_pkey_get_details($resource);
        
        return [
            'privateKey' => $privateKey,
            'publicKey' => $details['key'],
        ];
    }
    
    /**
     * Calculate HMAC-SHA256 signature for a file (streaming, memory-safe)
     * Uses ENCRYPTION_KEY as the HMAC secret for stateless verification
     * 
     * @param string $filePath Path to file to sign
     * @return string 32-byte raw HMAC signature
     */
    private function calculateFileSignature(string $filePath): string
    {
        $secret = $_ENV['ENCRYPTION_KEY'] ?? '';
        if (empty($secret)) {
            throw new RuntimeException('ENCRYPTION_KEY not configured for backup signing');
        }
        
        // Use streaming hash for memory efficiency
        $ctx = hash_init(self::BACKUP_ALGO, HASH_HMAC, $secret);
        
        $handle = fopen($filePath, 'rb');
        if ($handle === false) {
            throw new RuntimeException('Cannot read file for signing');
        }
        
        while (!feof($handle)) {
            $chunk = fread($handle, 8192); // 8KB chunks
            hash_update($ctx, $chunk);
        }
        fclose($handle);
        
        return hash_final($ctx, true); // Return raw binary (32 bytes)
    }
    
    /**
     * Verify HMAC signature of a backup .nomad file (stateless)
     * 
     * @param string $nomadFilePath Path to .nomad file
     * @throws RuntimeException If signature is invalid
     */
    private function verifyBackupSignature(string $nomadFilePath): void
    {
        $secret = $_ENV['ENCRYPTION_KEY'] ?? '';
        if (empty($secret)) {
            throw new RuntimeException('ENCRYPTION_KEY not configured for signature verification');
        }
        
        $fileSize = filesize($nomadFilePath);
        if ($fileSize < self::BACKUP_SIGNATURE_SIZE + 4) {
            throw new RuntimeException('Backup file too small to contain valid signature');
        }
        
        $handle = fopen($nomadFilePath, 'rb');
        if ($handle === false) {
            throw new RuntimeException('Cannot read backup file for verification');
        }
        
        // Read stored signature (first 32 bytes)
        $storedSignature = fread($handle, self::BACKUP_SIGNATURE_SIZE);
        
        // Calculate signature of remaining content (streaming)
        $ctx = hash_init(self::BACKUP_ALGO, HASH_HMAC, $secret);
        
        while (!feof($handle)) {
            $chunk = fread($handle, 8192);
            hash_update($ctx, $chunk);
        }
        fclose($handle);
        
        $calculatedSignature = hash_final($ctx, true);
        
        // Constant-time comparison to prevent timing attacks
        if (!hash_equals($storedSignature, $calculatedSignature)) {
            throw new RuntimeException(
                'Backup signature verification FAILED. ' .
                'The file may have been tampered with, corrupted, or was created with a different ENCRYPTION_KEY. ' .
                'Do NOT proceed with restore.'
            );
        }
    }
    
    /**
     * Verify HMAC signature of a backup .nomad file using a provided key
     * Used for disaster recovery when verifying with OLD encryption key
     * 
     * @param string $nomadFilePath Path to .nomad file
     * @param string $encryptionKey Encryption key to use for verification
     * @throws RuntimeException If signature is invalid
     */
    private function verifyBackupSignatureWithKey(string $nomadFilePath, string $encryptionKey): void
    {
        if (empty($encryptionKey)) {
            throw new RuntimeException('Encryption key not provided for signature verification');
        }
        
        $fileSize = filesize($nomadFilePath);
        if ($fileSize < self::BACKUP_SIGNATURE_SIZE + 4) {
            throw new RuntimeException('Backup file too small to contain valid signature');
        }
        
        $handle = fopen($nomadFilePath, 'rb');
        if ($handle === false) {
            throw new RuntimeException('Cannot read backup file for verification');
        }
        
        // Read stored signature (first 32 bytes)
        $storedSignature = fread($handle, self::BACKUP_SIGNATURE_SIZE);
        
        // Calculate signature of remaining content (streaming)
        $ctx = hash_init(self::BACKUP_ALGO, HASH_HMAC, $encryptionKey);
        
        while (!feof($handle)) {
            $chunk = fread($handle, 8192);
            hash_update($ctx, $chunk);
        }
        fclose($handle);
        
        $calculatedSignature = hash_final($ctx, true);
        
        // Constant-time comparison to prevent timing attacks
        if (!hash_equals($storedSignature, $calculatedSignature)) {
            throw new RuntimeException(
                'Backup signature verification FAILED with provided key. ' .
                'The recovery password may be incorrect, or the backup was created with different keys.'
            );
        }
    }

    private function createDataArchive(string $archivePath): void
    {
        $zip = new ZipArchive();
        if ($zip->open($archivePath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            throw new RuntimeException('Cannot create data archive');
        }
        
        // Include: system.sqlite (auth/users)
        if (file_exists($this->systemDbPath)) {
            $zip->addFile($this->systemDbPath, self::ARCHIVE_SYSTEM_DB);
        }
        
        // Include: massive.sqlite (main content)
        if (file_exists($this->massiveDbPath)) {
            $zip->addFile($this->massiveDbPath, self::ARCHIVE_MASSIVE_DB);
        }
        
        // Include: database.sqlite (secondary content)
        if (file_exists($this->contentDbPath)) {
            $zip->addFile($this->contentDbPath, self::ARCHIVE_CONTENT_DB);
        }
        
        // Include: uploads directory
        if (is_dir($this->uploadsPath)) {
            $count = $this->addDirectoryToZip($zip, $this->uploadsPath, 'uploads');
            if ($count === 0) $zip->addEmptyDir('uploads');
        } else {
            $zip->addEmptyDir('uploads');
        }
        
        // Include: storage directory
        if (is_dir($this->storagePath)) {
            $count = $this->addDirectoryToZip($zip, $this->storagePath, 'storage');
            if ($count === 0) $zip->addEmptyDir('storage');
        } else {
            $zip->addEmptyDir('storage');
        }
        
        // Include: files directory
        if (is_dir($this->filesPath)) {
            $count = $this->addDirectoryToZip($zip, $this->filesPath, 'files');
            if ($count === 0) $zip->addEmptyDir('files');
        } else {
            $zip->addEmptyDir('files');
        }
        
        $zip->close();
    }

    /**
     * Directories to exclude from backups (caches, temp files)
     * These are regenerable and should not bloat backup files
     */
    private const EXCLUDED_DIRECTORY_PATTERNS = [
        'cache',
        '.cache',
        'static',
        'temp',
        '.tmp',
        'node_modules',
        'vendor',  // Composer can reinstall
    ];
    
    private function addDirectoryToZip(ZipArchive $zip, string $source, string $prefix): int
    {
        $count = 0;
        $sourceReal = realpath($source);
        if ($sourceReal === false) return 0;
        $sourceRealLen = strlen($sourceReal);

        $iterator = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($sourceReal, \RecursiveDirectoryIterator::SKIP_DOTS),
            \RecursiveIteratorIterator::SELF_FIRST
        );
        
        foreach ($iterator as $file) {
            $realPath = $file->getRealPath();
            if ($realPath === false) continue;
            
            // Check if file is within source directory (case-insensitive for safety on various FS)
            if (stripos($realPath, $sourceReal) !== 0) continue;
            
            // Calculate relative path safely
            // +1 for trailing slash
            $relativePath = $prefix . '/' . substr($realPath, $sourceRealLen + 1);
            // Replace backslashes for Windows compatibility (ZIP standard uses forward slashes)
            $relativePath = str_replace('\\', '/', $relativePath);
            
            // EXCLUSION CHECK: Skip cache/static/temp directories
            if ($this->shouldExcludeFromBackup($relativePath)) {
                continue;
            }
            
            try {
                if ($file->isDir()) {
                    // Skip adding excluded directories entirely
                    $dirName = basename($relativePath);
                    if (in_array(strtolower($dirName), array_map('strtolower', self::EXCLUDED_DIRECTORY_PATTERNS))) {
                        continue;
                    }
                    $zip->addEmptyDir($relativePath);
                } else {
                    if ($file->isReadable()) {
                        $zip->addFile($realPath, $relativePath);
                        $count++;
                    }
                }
            } catch (\Throwable $e) {
                // Ignore specific file errors, continue with rest
                continue;
            }
        }
        return $count;
    }
    
    /**
     * Check if a path should be excluded from backup
     * Matches against directory patterns in path segments
     */
    private function shouldExcludeFromBackup(string $relativePath): bool
    {
        $pathParts = explode('/', strtolower($relativePath));
        
        foreach ($pathParts as $part) {
            if (in_array($part, array_map('strtolower', self::EXCLUDED_DIRECTORY_PATTERNS))) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Create Disaster Recovery Kit
     * Encrypts critical server keys with a password-derived key (PBKDF2 + AES-256-GCM)
     * 
     * Format: [16-byte salt][12-byte nonce][ciphertext][16-byte tag]
     * 
     * @param string $outputPath Path to write recovery.nms file
     * @param string $password Password to derive encryption key from
     * @throws RuntimeException on failure
     */
    private function createRecoveryKit(string $outputPath, string $password): void
    {
        // SECURITY: Validate recovery password strength
        $this->validateRecoveryPassword($password);
        
        // CRITICAL: Collect ALL keys generated by InstallerService
        // These MUST be restored after disaster recovery for authentication to work
        // Missing any key will cause "session expired" or "invalid token" errors
        $keys = [
            // Core encryption - REQUIRED for data decryption
            'ENCRYPTION_KEY' => $_ENV['ENCRYPTION_KEY'] ?? '',
            'BLIND_INDEX_KEY' => $_ENV['BLIND_INDEX_KEY'] ?? $_ENV['ENCRYPTION_KEY'] ?? '',
            
            // Password authentication - REQUIRED for user login
            'PASSWORD_PEPPER' => $_ENV['PASSWORD_PEPPER'] ?? '',
            'PASSWORD_SALT_PREFIX' => $_ENV['PASSWORD_SALT_PREFIX'] ?? '',
            
            // JWT authentication - CRITICAL! Without this, tokens cannot be verified
            'JWT_SECRET' => $_ENV['JWT_SECRET'] ?? '',
            
            // Session security - REQUIRED for session binding
            'IP_HASH_SECRET' => $_ENV['IP_HASH_SECRET'] ?? '',
            'SESSION_SECRET' => $_ENV['SESSION_SECRET'] ?? '',
            
            // Versioning integrity - REQUIRED for version history verification
            'VERSIONING_HMAC_SECRET' => $_ENV['VERSIONING_HMAC_SECRET'] ?? '',
            
            // JWT Algorithm for proper key usage
            'JWT_ALGORITHM' => $_ENV['JWT_ALGORITHM'] ?? 'RS256',
        ];
        
        // Include RSA keys if they exist (required for RS256/RS384/RS512)
        // Keys are in /api/keys/, not /api/src/keys/
        $keysDir = dirname(__DIR__, 2) . '/keys';
        $privateKeyPath = $keysDir . '/private.pem';
        $publicKeyPath = $keysDir . '/public.pem';
        
        if (file_exists($privateKeyPath)) {
            $content = file_get_contents($privateKeyPath);
            if ($content !== false) {
                $keys['RSA_PRIVATE_KEY'] = $content;
            }
        }
        if (file_exists($publicKeyPath)) {
            $content = file_get_contents($publicKeyPath);
            if ($content !== false) {
                $keys['RSA_PUBLIC_KEY'] = $content;
            }
        }
        
        // CRITICAL: Validate ALL keys are present
        $requiredKeys = [
            'ENCRYPTION_KEY',
            'PASSWORD_PEPPER',
            'PASSWORD_SALT_PREFIX',
            'JWT_SECRET',
        ];
        
        $missingKeys = [];
        foreach ($requiredKeys as $key) {
            if (empty($keys[$key])) {
                $missingKeys[] = $key;
            }
        }
        
        if (!empty($missingKeys)) {
            throw new RuntimeException('Recovery kit creation failed - missing keys: ' . implode(', ', $missingKeys));
        }
        
        $plaintext = json_encode($keys, JSON_THROW_ON_ERROR);
        
        // Generate random salt for PBKDF2
        $salt = random_bytes(16);
        
        // Derive key from password using PBKDF2 (100,000 iterations, SHA-256)
        $derivedKey = hash_pbkdf2('sha256', $password, $salt, 100000, 32, true);
        
        // Generate random nonce for AES-GCM
        $nonce = random_bytes(12);
        
        // Encrypt with AES-256-GCM
        $ciphertext = openssl_encrypt(
            $plaintext,
            'aes-256-gcm',
            $derivedKey,
            OPENSSL_RAW_DATA,
            $nonce,
            $tag,
            '',
            16
        );
        
        if ($ciphertext === false) {
            throw new RuntimeException('Recovery kit encryption failed: ' . openssl_error_string());
        }
        
        // Write: [salt 16][nonce 12][ciphertext][tag 16]
        $fp = fopen($outputPath, 'wb');
        if ($fp === false) {
            throw new RuntimeException('Cannot create recovery kit file');
        }
        
        fwrite($fp, $salt);
        fwrite($fp, $nonce);
        fwrite($fp, $ciphertext);
        fwrite($fp, $tag);
        fclose($fp);
    }
    
    /**
     * Decrypt Disaster Recovery Kit
     * 
     * @param string $recoveryPath Path to recovery.nms file
     * @param string $password Password to decrypt
     * @return array Decrypted keys array
     * @throws RuntimeException on failure
     */
    public function decryptRecoveryKit(string $recoveryPath, string $password): array
    {
        if (!file_exists($recoveryPath)) {
            throw new RuntimeException('Recovery kit file not found');
        }
        
        $data = file_get_contents($recoveryPath);
        if ($data === false || strlen($data) < 44) { // 16 + 12 + 16 minimum
            throw new RuntimeException('Invalid recovery kit file');
        }
        
        // Parse: [salt 16][nonce 12][ciphertext][tag 16]
        $salt = substr($data, 0, 16);
        $nonce = substr($data, 16, 12);
        $tag = substr($data, -16);
        $ciphertext = substr($data, 28, -16);
        
        // Derive key from password
        $derivedKey = hash_pbkdf2('sha256', $password, $salt, 100000, 32, true);
        
        // Decrypt with AES-256-GCM
        $plaintext = openssl_decrypt(
            $ciphertext,
            'aes-256-gcm',
            $derivedKey,
            OPENSSL_RAW_DATA,
            $nonce,
            $tag
        );
        
        if ($plaintext === false) {
            throw new RuntimeException('Recovery kit decryption failed: Invalid password or corrupted file');
        }
        
        $keys = json_decode($plaintext, true);
        if (!is_array($keys)) {
            throw new RuntimeException('Recovery kit contains invalid data');
        }
        
        return $keys;
    }

    private function createBundleZip(string $bundlePath, string $nomadPath, string $pemPath, string $baseFilename, ?string $recoveryPath = null): void
    {
        $zip = new ZipArchive();
        if ($zip->open($bundlePath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            throw new RuntimeException('Cannot create bundle ZIP');
        }
        $zip->addFile($nomadPath, "{$baseFilename}.nomad");
        $zip->addFile($pemPath, "{$baseFilename}.pem");
        
        // Include disaster recovery kit if provided
        if ($recoveryPath && file_exists($recoveryPath)) {
            $zip->addFile($recoveryPath, "recovery.nms");
        }
        
        $zip->close();
    }
    
    private function syncDirectory(string $source, string $destination): void
    {
        if (!is_dir($destination)) mkdir($destination, 0755, true);
        $iterator = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($source, \RecursiveDirectoryIterator::SKIP_DOTS),
            \RecursiveIteratorIterator::SELF_FIRST
        );
        foreach ($iterator as $file) {
            $destPath = $destination . '/' . $iterator->getSubPathName();
            if ($file->isDir()) {
                if (!is_dir($destPath)) mkdir($destPath, 0755, true);
            } else {
                copy($file->getRealPath(), $destPath);
            }
        }
    }
    
    private function recursiveDelete(string $dir): void
    {
        if (!is_dir($dir)) return;
        $files = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($dir, \RecursiveDirectoryIterator::SKIP_DOTS),
            \RecursiveIteratorIterator::CHILD_FIRST
        );
        foreach ($files as $fileinfo) {
            $todo = ($fileinfo->isDir() ? 'rmdir' : 'unlink');
            $todo($fileinfo->getRealPath());
        }
        rmdir($dir);
    }
    
    /**
     * SECURITY: Validate that a .nomad file is a BACKUP, not a secure_file
     * 
     * New backup format (with signature):
     * - [32-byte HMAC signature][4-byte key length][RSA Encrypted Key][Defuse Payload]
     * 
     * File format detection (reads bytes at offset 32, after signature):
     * - Backup .nomad: Bytes 32-35 are uint32 key length (typically 256 = 0x00000100)
     * - Secure file .nomad (v2): Starts with "NOMAD" magic bytes
     * - Secure file .nomad (v1): Starts with "{" (JSON format)
     * 
     * @param string $filePath Path to .nomad file
     * @throws RuntimeException If file is not a valid backup format
     */
    private function validateBackupFileType(string $filePath): void
    {
        if (!file_exists($filePath)) {
            throw new RuntimeException('Backup file not found');
        }
        
        $fileSize = filesize($filePath);
        $minSize = self::BACKUP_SIGNATURE_SIZE + 4 + 64; // signature + key_length + min encrypted key
        
        if ($fileSize < $minSize) {
            throw new RuntimeException('Invalid backup file: file too small (min ' . $minSize . ' bytes required)');
        }
        
        $handle = fopen($filePath, 'rb');
        if ($handle === false) {
            throw new RuntimeException('Cannot read backup file');
        }
        
        // Check first bytes for secure_file format detection
        $firstBytes = fread($handle, 5);
        
        // Check for secure_file binary format (NOMAD magic)
        if ($firstBytes === 'NOMAD') {
            fclose($handle);
            throw new RuntimeException(
                'Invalid file type: This appears to be an encrypted secure file (.nomad), not a backup. ' .
                'Please upload the backup .nomad file that was generated with createSecureBackup.'
            );
        }
        
        // Check for secure_file JSON format (starts with "{")
        if ($firstBytes[0] === '{') {
            fclose($handle);
            throw new RuntimeException(
                'Invalid file type: This appears to be a legacy encrypted file (JSON format), not a backup. ' .
                'Please upload the backup .nomad file that was generated with createSecureBackup.'
            );
        }
        
        // For backup format: Skip signature (32 bytes) and read key length
        fseek($handle, self::BACKUP_SIGNATURE_SIZE);
        $keyLengthBytes = fread($handle, 4);
        fclose($handle);
        
        if (strlen($keyLengthBytes) < 4) {
            throw new RuntimeException('Invalid backup file: cannot read key length');
        }
        
        $keyLength = unpack('N', $keyLengthBytes)[1];
        
        // RSA-2048 encrypted output is exactly 256 bytes, RSA-4096 is 512 bytes
        // Allow reasonable range: 64 to 1024 bytes
        if ($keyLength < 64 || $keyLength > 1024) {
            throw new RuntimeException(
                'Invalid backup file format: Unexpected key length (' . $keyLength . '). ' .
                'Expected RSA-encrypted key (64-1024 bytes). File may be corrupted or incompatible.'
            );
        }
        
        // File appears to be a valid backup format
    }
    
    /**
     * Reload .env environment variables into $_ENV
     * CRITICAL for disaster recovery: After updating .env with restored keys,
     * PHP has already loaded the FRESH INSTALL values into $_ENV. 
     * This reloads the ORIGINAL values from the recovery kit.
     * 
     * Also clears EncryptionService key cache to use the restored ENCRYPTION_KEY.
     */
    private function reloadEnvironment(): void
    {
        $apiRoot = $this->apiRoot;
        $envPath = $apiRoot . '/.env';
        
        if (!file_exists($envPath)) {
            error_log("[BackupService] Cannot reload .env: file not found at $envPath");
            return;
        }
        
        try {
            // Use Dotenv to properly load the environment
            $dotenv = \Dotenv\Dotenv::createImmutable($apiRoot, '.env');
            $dotenv->load();
            error_log("[BackupService] Environment reloaded from .env file using Dotenv");
        } catch (\Throwable $e) {
            // Fallback: Manual parsing
            error_log("[BackupService] Dotenv load failed, using fallback parser: " . $e->getMessage());
            $this->reloadEnvironmentFallback($envPath);
        }
        
        // CRITICAL: Clear EncryptionService key cache!
        // The old (fresh install) ENCRYPTION_KEY is cached in static $masterKey
        // We need to clear it so the restored key from recovery kit is used
        EncryptionService::clearKeyCache();
        error_log("[BackupService] EncryptionService key cache cleared");
    }
    
    /**
     * Fallback environment loader if Dotenv fails
     * Parses .env file manually and updates $_ENV
     */
    private function reloadEnvironmentFallback(string $envPath): void
    {
        $envContent = file_get_contents($envPath);
        if ($envContent === false) {
            error_log("[BackupService] Cannot reload .env: read failed");
            return;
        }
        
        // Parse .env file and update $_ENV
        $lines = explode("\n", $envContent);
        foreach ($lines as $line) {
            $line = trim($line);
            
            // Skip empty lines and comments
            if (empty($line) || str_starts_with($line, '#')) {
                continue;
            }
            
            // Parse KEY=VALUE
            if (str_contains($line, '=')) {
                [$key, $value] = explode('=', $line, 2);
                $key = trim($key);
                $value = trim($value);
                
                // Remove quotes if present
                if ((str_starts_with($value, '"') && str_ends_with($value, '"')) ||
                    (str_starts_with($value, "'") && str_ends_with($value, "'"))) {
                    $value = substr($value, 1, -1);
                }
                
                $_ENV[$key] = $value;
            }
        }
        
        error_log("[BackupService] Environment reloaded from .env file (fallback parser)");
    }
    
    /**
     * Validate recovery kit password strength
     * 
     * Requirements:
     * - Minimum 16 characters
     * - At least 1 lowercase letter
     * - At least 1 uppercase letter
     * - At least 1 number
     * - At least 1 special character
     * 
     * @param string $password Password to validate
     * @throws RuntimeException if password doesn't meet requirements
     */
    private function validateRecoveryPassword(string $password): void
    {
        $errors = [];
        
        // Length check
        if (strlen($password) < 16) {
            $errors[] = 'minimum 16 characters required';
        }
        
        // Character type checks
        if (!preg_match('/[a-z]/', $password)) {
            $errors[] = 'at least one lowercase letter required';
        }
        if (!preg_match('/[A-Z]/', $password)) {
            $errors[] = 'at least one uppercase letter required';
        }
        if (!preg_match('/[0-9]/', $password)) {
            $errors[] = 'at least one number required';
        }
        if (!preg_match('/[^a-zA-Z0-9]/', $password)) {
            $errors[] = 'at least one special character required';
        }
        
        // Common password patterns check
        $lowerPassword = strtolower($password);
        $commonPatterns = ['password', '12345678', 'qwertyui', 'letmein', 'admin123', 'recovery'];
        foreach ($commonPatterns as $pattern) {
            if (str_contains($lowerPassword, $pattern)) {
                $errors[] = 'password contains common pattern';
                break;
            }
        }
        
        if (!empty($errors)) {
            throw new RuntimeException(
                'Recovery password does not meet security requirements: ' . 
                implode(', ', $errors)
            );
        }
    }
}

