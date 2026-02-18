<?php
/**
 * NOMAD CMS - Encryption Service
 * Provides at-rest encryption for sensitive data stored in database.
 * Uses Defuse Crypto for authenticated symmetric encryption (AES-256-CTR + HMAC).
 * 
 * Key Management:
 * - Master key stored in .env as ENCRYPTION_KEY
 * - Generate with: php vendor/bin/generate-defuse-key
 * - Never commit .env to version control!
 * 
 * File Encryption (v2):
 * - Uses Defuse File::encryptFile() for streaming encryption
 * - Memory-safe: never loads full file into RAM
 * - Binary .nomad format for efficient storage
 */

declare(strict_types=1);

namespace NomadCMS\Security;

use Defuse\Crypto\Crypto;
use Defuse\Crypto\File;
use Defuse\Crypto\Key;
use RuntimeException;

final class EncryptionService
{
    private static ?Key $masterKey = null;
    
    /**
     * Clear cached master key
     * MUST be called after .env is reloaded (e.g., after disaster recovery)
     * Otherwise the old key remains cached and decryption fails
     */
    public static function clearKeyCache(): void
    {
        self::$masterKey = null;
    }
    
    /**
     * Get master encryption key from environment
     */
    private static function getMasterKey(): Key
    {
        if (self::$masterKey === null) {
            $keyAscii = $_ENV['ENCRYPTION_KEY'] ?? null;
            
            if (empty($keyAscii)) {
                throw new RuntimeException(
                    'ENCRYPTION_KEY not configured. Generate with: php vendor/bin/generate-defuse-key'
                );
            }
            
            try {
                self::$masterKey = Key::loadFromAsciiSafeString($keyAscii);
            } catch (\Exception $e) {
                throw new RuntimeException('Invalid ENCRYPTION_KEY format: ' . $e->getMessage());
            }
        }
        
        return self::$masterKey;
    }
    
    /**
     * Encrypt sensitive data for at-rest storage
     * Returns base64-encoded ciphertext with authentication tag
     */
    public static function encrypt(string $plaintext): string
    {
        if (empty($plaintext)) {
            return '';
        }
        
        try {
            $ciphertext = Crypto::encrypt($plaintext, self::getMasterKey());
            return $ciphertext; // Already safe ASCII format
        } catch (\Exception $e) {
            throw new RuntimeException('Encryption failed: ' . $e->getMessage());
        }
    }
    
    /**
     * Decrypt data from storage
     */
    public static function decrypt(string $ciphertext): string
    {
        if (empty($ciphertext)) {
            return '';
        }
        
        try {
            return Crypto::decrypt($ciphertext, self::getMasterKey());
        } catch (\Exception $e) {
            throw new RuntimeException('Decryption failed - data may be corrupted or key mismatch');
        }
    }
    
    /**
     * Check if encryption is properly configured
     */
    public static function isConfigured(): bool
    {
        try {
            self::getMasterKey();
            return true;
        } catch (\Exception $e) {
            return false;
        }
    }
    
    /**
     * Check if a string appears to be encrypted (Defuse format)
     * Defuse ciphertext starts with "def" prefix
     */
    public static function isEncrypted(string $data): bool
    {
        return str_starts_with($data, 'def');
    }
    
    /**
     * Migrate plaintext to encrypted format (safe to call multiple times)
     * Returns null if data was already encrypted
     */
    public static function migrateToEncrypted(string $data): ?string
    {
        if (empty($data)) {
            return null;
        }
        
        // Already encrypted?
        if (self::isEncrypted($data)) {
            return null;
        }
        
        return self::encrypt($data);
    }
    
    // =========================================================================
    // STREAMING FILE ENCRYPTION (Memory-Safe)
    // =========================================================================
    
    /**
     * Binary .nomad file format constants (v3 - minimal header)
     * 
     * SECURITY: Header contains ONLY the type identifier.
     * All sensitive metadata (filename, mimeType, size) is stored INSIDE the encrypted payload.
     * This prevents information leakage from the cleartext header.
     * 
     * Format:
     * [HEADER - 10 bytes]
     *   - Magic Bytes: "NOMAD" (5 bytes)
     *   - Version: 0x03 (1 byte) - v3 = minimal header, encrypted metadata
     *   - Type Length: uint16 big-endian (2 bytes)
     *   - Reserved: 2 bytes (for future use)
     * [TYPE - variable, max 64 bytes]
     *   - Type string: "secure_file", "backup", etc.
     * [PAYLOAD - variable]
     *   - Defuse-encrypted content (includes metadata JSON at start)
     *   - Encrypted format: [4-byte metadata length][metadata JSON][original file content]
     */
    public const NOMAD_MAGIC = "NOMAD";
    public const NOMAD_VERSION_BINARY = 0x03;  // v3 = minimal header
    public const NOMAD_VERSION_V2 = 0x02;      // v2 = legacy with cleartext metadata
    public const NOMAD_VERSION_JSON = 0x01;    // v1 = legacy JSON format
    public const NOMAD_HEADER_SIZE = 10;       // 5 + 1 + 2 + 2
    public const NOMAD_MAX_TYPE_LENGTH = 64;
    
    // Known .nomad types
    public const NOMAD_TYPE_SECURE_FILE = 'secure_file';
    public const NOMAD_TYPE_BACKUP = 'backup';
    
    /**
     * Encrypt a file using streaming (memory-safe) - v3 format
     * Creates a binary .nomad file with MINIMAL header (only type)
     * Sensitive metadata is encrypted inside the payload
     * 
     * @param string $sourcePath Path to source file (e.g., uploaded tmp file)
     * @param string $destPath Destination .nomad file path
     * @param array $metadata File metadata (originalName, mimeType, originalSize)
     * @param string $type Type identifier (default: 'secure_file')
     * @throws RuntimeException on failure
     */
    public static function encryptFileStreaming(string $sourcePath, string $destPath, array $metadata, string $type = self::NOMAD_TYPE_SECURE_FILE): void
    {
        if (!file_exists($sourcePath)) {
            throw new RuntimeException('Source file does not exist');
        }
        
        if (strlen($type) > self::NOMAD_MAX_TYPE_LENGTH) {
            throw new RuntimeException('Type identifier too long (max 64 bytes)');
        }
        
        $key = self::getMasterKey();
        
        // Prepare sensitive metadata (will be encrypted inside payload)
        $sensitiveMetadata = json_encode([
            'originalName' => $metadata['originalName'] ?? basename($sourcePath),
            'mimeType' => $metadata['mimeType'] ?? 'application/octet-stream',
            'originalSize' => $metadata['originalSize'] ?? filesize($sourcePath),
            'encryptedAt' => date('c'),
        ], JSON_UNESCAPED_SLASHES);
        
        if ($sensitiveMetadata === false) {
            throw new RuntimeException('Failed to encode metadata');
        }
        
        // Create temp file with metadata prefix + original content
        $tempWithMeta = sys_get_temp_dir() . '/nomad_meta_' . bin2hex(random_bytes(8));
        $tempEncrypted = sys_get_temp_dir() . '/nomad_enc_' . bin2hex(random_bytes(8));
        
        try {
            // Step 1: Create temp file with [metadata length][metadata][original content]
            $metaHandle = fopen($tempWithMeta, 'wb');
            if ($metaHandle === false) {
                throw new RuntimeException('Failed to create temp metadata file');
            }
            
            // Write metadata length (4 bytes) + metadata
            fwrite($metaHandle, pack('N', strlen($sensitiveMetadata)));
            fwrite($metaHandle, $sensitiveMetadata);
            
            // Stream original file content after metadata
            $sourceHandle = fopen($sourcePath, 'rb');
            if ($sourceHandle === false) {
                fclose($metaHandle);
                throw new RuntimeException('Failed to read source file');
            }
            stream_copy_to_stream($sourceHandle, $metaHandle);
            fclose($sourceHandle);
            fclose($metaHandle);
            
            // Step 2: Encrypt the combined content (metadata + file)
            File::encryptFile($tempWithMeta, $tempEncrypted, $key);
            
            // Step 3: Write final .nomad file with minimal header
            $outHandle = fopen($destPath, 'wb');
            if ($outHandle === false) {
                throw new RuntimeException('Failed to create destination file');
            }
            
            try {
                // Write header
                fwrite($outHandle, self::NOMAD_MAGIC);                      // 5 bytes
                fwrite($outHandle, chr(self::NOMAD_VERSION_BINARY));        // 1 byte (v3)
                fwrite($outHandle, pack('n', strlen($type)));               // 2 bytes (type length, big-endian uint16)
                fwrite($outHandle, "\x00\x00");                             // 2 bytes reserved
                
                // Write type string
                fwrite($outHandle, $type);
                
                // Stream encrypted content
                $encHandle = fopen($tempEncrypted, 'rb');
                if ($encHandle === false) {
                    throw new RuntimeException('Failed to read encrypted temp file');
                }
                
                stream_copy_to_stream($encHandle, $outHandle);
                fclose($encHandle);
                fclose($outHandle);
                
            } catch (\Throwable $e) {
                fclose($outHandle);
                @unlink($destPath);
                throw $e;
            }
            
        } finally {
            // Always cleanup temp files
            @unlink($tempWithMeta);
            @unlink($tempEncrypted);
        }
    }
    
    /**
     * Decrypt a .nomad file using streaming (memory-safe) - supports v2 and v3 formats
     * Returns metadata and streams decrypted content to destination
     * 
     * @param string $nomadPath Path to .nomad file
     * @param string $destPath Destination for decrypted content (temp file)
     * @return array Metadata from the .nomad file (includes 'type' from header)
     * @throws RuntimeException on failure
     */
    public static function decryptFileStreaming(string $nomadPath, string $destPath, ?Key $decryptionKey = null): array
    {
        if (!file_exists($nomadPath)) {
            throw new RuntimeException('Nomad file does not exist');
        }
        
        $key = $decryptionKey ?? self::getMasterKey();
        
        $handle = fopen($nomadPath, 'rb');
        if ($handle === false) {
            throw new RuntimeException('Failed to open nomad file');
        }
        
        try {
            // Check magic bytes
            $magic = fread($handle, 5);
            
            if ($magic !== self::NOMAD_MAGIC) {
                // Likely legacy JSON format - let caller handle it
                fclose($handle);
                throw new RuntimeException('LEGACY_JSON_FORMAT');
            }
            
            // Read version
            $version = ord(fread($handle, 1));
            
            if ($version === self::NOMAD_VERSION_BINARY) {
                // v3 format: minimal header, encrypted metadata
                return self::decryptV3Format($handle, $destPath, $key);
            } elseif ($version === self::NOMAD_VERSION_V2) {
                // v2 format: cleartext metadata (legacy)
                return self::decryptV2Format($handle, $destPath, $key);
            } else {
                throw new RuntimeException('Unsupported .nomad version: ' . $version);
            }
            
        } catch (\Throwable $e) {
            if (is_resource($handle)) {
                fclose($handle);
            }
            throw $e;
        }
    }
    
    /**
     * Decrypt v3 format .nomad (minimal header, encrypted metadata)
     */
    private static function decryptV3Format($handle, string $destPath, Key $key): array
    {
        // Read type length (2 bytes) + reserved (2 bytes)
        $typeHeader = fread($handle, 4);
        $typeLength = unpack('n', substr($typeHeader, 0, 2))[1];
        
        if ($typeLength > self::NOMAD_MAX_TYPE_LENGTH) {
            fclose($handle);
            throw new RuntimeException('Invalid type length in .nomad header');
        }
        
        // Read type string
        $type = fread($handle, $typeLength);
        
        // Stream encrypted payload to temp file
        $tempEncrypted = sys_get_temp_dir() . '/nomad_dec_enc_' . bin2hex(random_bytes(8));
        $tempDecrypted = sys_get_temp_dir() . '/nomad_dec_raw_' . bin2hex(random_bytes(8));
        
        try {
            $tempHandle = fopen($tempEncrypted, 'wb');
            if ($tempHandle === false) {
                throw new RuntimeException('Failed to create temp file');
            }
            
            stream_copy_to_stream($handle, $tempHandle);
            fclose($tempHandle);
            fclose($handle);
            $handle = null;
            
            // Decrypt to get metadata + content
            File::decryptFile($tempEncrypted, $tempDecrypted, $key);
            
            // Read metadata from decrypted content
            $decHandle = fopen($tempDecrypted, 'rb');
            if ($decHandle === false) {
                throw new RuntimeException('Failed to read decrypted content');
            }
            
            // Read metadata length (4 bytes)
            $metaLengthBytes = fread($decHandle, 4);
            if (strlen($metaLengthBytes) < 4) {
                fclose($decHandle);
                throw new RuntimeException('Invalid decrypted content structure');
            }
            $metaLength = unpack('N', $metaLengthBytes)[1];
            
            if ($metaLength > 1024 * 1024) { // Max 1MB metadata
                fclose($decHandle);
                throw new RuntimeException('Invalid metadata length');
            }
            
            // Read metadata JSON
            $metadataJson = fread($decHandle, $metaLength);
            $metadata = json_decode($metadataJson, true);
            if ($metadata === null) {
                fclose($decHandle);
                throw new RuntimeException('Invalid metadata JSON');
            }
            
            // Add type from header
            $metadata['type'] = $type;
            
            // Stream remaining content (original file) to destination
            $destHandle = fopen($destPath, 'wb');
            if ($destHandle === false) {
                fclose($decHandle);
                throw new RuntimeException('Failed to create destination file');
            }
            
            stream_copy_to_stream($decHandle, $destHandle);
            fclose($decHandle);
            fclose($destHandle);
            
            return $metadata;
            
        } finally {
            @unlink($tempEncrypted);
            @unlink($tempDecrypted);
        }
    }
    
    /**
     * Decrypt v2 format .nomad (cleartext metadata - legacy support)
     */
    private static function decryptV2Format($handle, string $destPath, Key $key): array
    {
        // Read metadata length (4 bytes)
        $metaLengthBytes = fread($handle, 4);
        $metadataLength = unpack('N', $metaLengthBytes)[1];
        
        if ($metadataLength > 1024 * 1024) { // Max 1MB metadata
            fclose($handle);
            throw new RuntimeException('Invalid metadata length');
        }
        
        // Read cleartext metadata
        $metadataJson = fread($handle, $metadataLength);
        $metadata = json_decode($metadataJson, true);
        if ($metadata === null) {
            fclose($handle);
            throw new RuntimeException('Invalid metadata JSON');
        }
        
        // Stream encrypted payload to temp file
        $tempEncrypted = sys_get_temp_dir() . '/nomad_dec_' . bin2hex(random_bytes(8));
        
        try {
            $tempHandle = fopen($tempEncrypted, 'wb');
            if ($tempHandle === false) {
                throw new RuntimeException('Failed to create temp file');
            }
            
            stream_copy_to_stream($handle, $tempHandle);
            fclose($tempHandle);
            fclose($handle);
            
            // Decrypt to destination (streaming)
            File::decryptFile($tempEncrypted, $destPath, $key);
            
            return $metadata;
            
        } finally {
            @unlink($tempEncrypted);
        }
    }
    
    /**
     * Read only the type from a .nomad file header (without decrypting)
     * For v3 format, only type is available in cleartext
     * For v2 format, full metadata is in cleartext (legacy)
     * 
     * Useful for type checking without decryption
     * 
     * @param string $nomadPath Path to .nomad file
     * @return array|null ['type' => string, 'version' => int] or null if invalid/legacy JSON
     */
    public static function readNomadHeader(string $nomadPath): ?array
    {
        if (!file_exists($nomadPath)) {
            return null;
        }
        
        $handle = fopen($nomadPath, 'rb');
        if ($handle === false) {
            return null;
        }
        
        try {
            // Check magic
            $magic = fread($handle, 5);
            if ($magic !== self::NOMAD_MAGIC) {
                // Legacy JSON format
                fclose($handle);
                return null;
            }
            
            // Read version
            $version = ord(fread($handle, 1));
            
            if ($version === self::NOMAD_VERSION_BINARY) {
                // v3: Read type from header
                $typeHeader = fread($handle, 4);
                $typeLength = unpack('n', substr($typeHeader, 0, 2))[1];
                
                if ($typeLength > self::NOMAD_MAX_TYPE_LENGTH) {
                    fclose($handle);
                    return null;
                }
                
                $type = fread($handle, $typeLength);
                fclose($handle);
                
                return [
                    'type' => $type,
                    'version' => $version,
                ];
                
            } elseif ($version === self::NOMAD_VERSION_V2) {
                // v2: Read full metadata from header
                $metaLengthPacked = fread($handle, 4);
                $metadataLength = unpack('N', $metaLengthPacked)[1];
                
                if ($metadataLength > 1024 * 1024) {
                    fclose($handle);
                    return null;
                }
                
                $metadataJson = fread($handle, $metadataLength);
                fclose($handle);
                
                $metadata = json_decode($metadataJson, true);
                if ($metadata === null) {
                    return null;
                }
                
                $metadata['version'] = $version;
                return $metadata;
            }
            
            fclose($handle);
            return null;
            
        } catch (\Throwable $e) {
            if (is_resource($handle)) {
                fclose($handle);
            }
            return null;
        }
    }
    
    /**
     * @deprecated Use readNomadHeader() instead
     * Read only the metadata from a .nomad file (without decrypting content)
     * NOTE: For v3 format, this only returns type (sensitive metadata is encrypted)
     */
    public static function readNomadMetadata(string $nomadPath): ?array
    {
        return self::readNomadHeader($nomadPath);
    }
    
    /**
     * Check if a .nomad file uses the binary format (v2 or v3)
     * 
     * @param string $nomadPath Path to .nomad file
     * @return bool True if binary format, false if legacy JSON
     */
    public static function isNomadBinaryFormat(string $nomadPath): bool
    {
        if (!file_exists($nomadPath)) {
            return false;
        }
        
        $handle = fopen($nomadPath, 'rb');
        if ($handle === false) {
            return false;
        }
        
        $magic = fread($handle, 5);
        fclose($handle);
        
        return $magic === self::NOMAD_MAGIC;
    }
    
    /**
     * Get the type of a .nomad file without decrypting
     * 
     * @param string $nomadPath Path to .nomad file
     * @return string|null Type string or null if cannot determine
     */
    public static function getNomadType(string $nomadPath): ?string
    {
        $header = self::readNomadHeader($nomadPath);
        return $header['type'] ?? null;
    }
}
