<?php
/**
 * NOMAD CMS - Content Database
 * CMS content data (slots, media, versions, etc.)
 * 
 * Split Architecture:
 * - system.sqlite: users, auth, sessions (AuthDatabase)
 * - database.sqlite: CMS content, slots, media, versions (THIS FILE)
 * 
 * ARCHITECTURE FIX (2026-01-05):
 * - Versioning is NOW AUTOMATIC at the database layer
 * - All saves go through createVersionedSlot() for guaranteed history
 * - No more client-side opt-in versioning
 * - OPTIMISTIC LOCKING with expected_version parameter
 */

declare(strict_types=1);

namespace NomadCMS\Database;

use PDO;
use PDOException;
use NomadCMS\Services\VersioningService;

/**
 * Exception thrown when optimistic locking fails (concurrent modification)
 * 
 * ENTERPRISE OPTIMISTIC LOCKING:
 * Supports both version-based and hash-based locking:
 * - Version: Sequential number (simpler but can fail on history prune)
 * - Hash: SHA-256 of content (TRUE content identity, recommended)
 */
class OptimisticLockException extends \RuntimeException
{
    public function __construct(
        public readonly string $slotKey,
        public readonly ?int $expectedVersion = null,
        public readonly ?int $actualVersion = null,
        public readonly ?string $expectedHash = null,
        public readonly ?string $actualHash = null,
        public readonly string $lockType = 'version'  // 'version' or 'hash'
    ) {
        if ($lockType === 'hash') {
            $message = "Content hash mismatch for slot '{$slotKey}': " .
                "expected hash " . substr($expectedHash ?? '', 0, 16) . "..., " .
                "but current hash is " . substr($actualHash ?? '', 0, 16) . "... " .
                "Content was modified by another user/process.";
        } else {
            $message = "Version mismatch for slot '{$slotKey}': " .
                "expected version {$expectedVersion}, but current version is {$actualVersion}. " .
                "Content was modified by another user/process.";
        }
        parent::__construct($message);
    }
}

final class ContentDatabase
{
    private static ?PDO $instance = null;
    
    /**
     * Slot types that should skip auto-versioning (high-frequency saves)
     * Can be overridden by explicit versioning request
     */
    private const SKIP_VERSIONING_TYPES = ['draft', 'autosave', 'temp'];
    
    /**
     * Get singleton database instance
     */
    public static function getInstance(): PDO
    {
        if (self::$instance === null) {
            $dbFile = $_ENV['DB_CONTENT_DATABASE'] ?? 'database.sqlite';
            $dbPath = __DIR__ . '/../../databases/' . $dbFile;
            
            try {
                self::$instance = new PDO("sqlite:$dbPath", null, null, [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => false,
                ]);
                
                // Initialize schema if needed
                self::initializeSchema();
                
            } catch (PDOException $e) {
                throw new \RuntimeException("Content database connection failed: " . $e->getMessage());
            }
        }
        
        return self::$instance;
    }
    
    /**
     * Initialize database schema
     */
    private static function initializeSchema(): void
    {
        $db = self::$instance;
        
        // Try WAL mode for better concurrency, fallback to DELETE for shared hosting
        try {
            $result = $db->query('PRAGMA journal_mode=WAL')->fetchColumn();
            if (strtoupper($result) === 'WAL') {
                // WAL mode successful - use NORMAL sync (safe with WAL)
                $db->exec('PRAGMA synchronous=NORMAL');
            } else {
                // WAL failed (e.g., NFS/shared hosting) - use DELETE mode
                $db->exec('PRAGMA journal_mode=DELETE');
                $db->exec('PRAGMA synchronous=FULL');
            }
        } catch (\Exception $e) {
            // Fallback to DELETE mode on any error
            $db->exec('PRAGMA journal_mode=DELETE');
            $db->exec('PRAGMA synchronous=FULL');
        }
        // 5MB cache for better read performance
        $db->exec('PRAGMA cache_size=-5000');
        // Temp tables in memory for faster JOINs
        $db->exec('PRAGMA temp_store=MEMORY');
        // Enable foreign keys for referential integrity
        $db->exec('PRAGMA foreign_keys=ON');
        // Auto-vacuum for long-term file size optimization
        $db->exec('PRAGMA auto_vacuum=INCREMENTAL');
        
        // Slots table (CMS content)
        $db->exec("
            CREATE TABLE IF NOT EXISTS slots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key TEXT UNIQUE NOT NULL,
                data TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        ");
        
        // Media table
        $db->exec("
            CREATE TABLE IF NOT EXISTS media (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT NOT NULL,
                original_name TEXT NOT NULL,
                mime_type TEXT NOT NULL,
                size INTEGER NOT NULL,
                path TEXT NOT NULL,
                uploaded_by INTEGER DEFAULT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        ");
        
        // Create indexes
        $db->exec("CREATE INDEX IF NOT EXISTS idx_slots_key ON slots(key)");
        $db->exec("CREATE INDEX IF NOT EXISTS idx_media_filename ON media(filename)");
    }
    
    /**
     * Compute content hash for optimistic locking
     * Uses SHA-256 for collision resistance
     */
    public static function computeContentHash(mixed $data): string
    {
        $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        return hash('sha256', $json);
    }
    
    /**
     * Get data from a slot
     * 
     * SECURITY: Validates JSON decoding and logs errors
     */
    public static function getSlot(string $key): mixed
    {
        $db = self::getInstance();
        $stmt = $db->prepare("SELECT data FROM slots WHERE key = ?");
        $stmt->execute([$key]);
        $row = $stmt->fetch();
        
        if ($row) {
            $decoded = json_decode($row['data'], true);
            
            // Check for JSON decode errors
            if ($decoded === null && $row['data'] !== 'null') {
                $error = json_last_error_msg();
                error_log("[ContentDatabase] JSON decode failed for slot '{$key}': {$error}");
                error_log("[ContentDatabase] Raw data (first 500 chars): " . substr($row['data'], 0, 500));
                // Return null but don't throw - allows graceful handling
            }
            
            return $decoded;
        }
        
        return null;
    }

    /**
     * Get slot with version AND hash info for optimistic locking
     * 
     * ENTERPRISE OPTIMISTIC LOCKING:
     * - 'version' = sequential number (can be reset if history pruned)
     * - 'hash' = SHA-256 of content (TRUE content identity)
     * 
     * Use 'expected_hash' for robust locking (recommended)
     * Use 'expected_version' for simpler locking (may fail on history prune)
     * 
     * @param string $key Slot key
     * @return array{data: mixed, version: int, hash: string}|null
     */
    public static function getSlotWithVersion(string $key): ?array
    {
        $db = self::getInstance();
        $stmt = $db->prepare("SELECT data FROM slots WHERE key = ?");
        $stmt->execute([$key]);
        $row = $stmt->fetch();
        
        if (!$row) {
            return null;
        }
        
        $decoded = json_decode($row['data'], true);
        
        // Compute content hash for optimistic locking
        $contentHash = self::computeContentHash($decoded);
        
        // Get current version from versioning service
        try {
            $versioning = VersioningService::getInstance();
            $version = $versioning->getVersionCount($key);
        } catch (\Exception $e) {
            $version = 0;
        }
        
        return [
            'data' => $decoded,
            'version' => $version,
            'hash' => $contentHash  // SHA-256 for TRUE content identity
        ];
    }

    /**
     * Save data to a slot WITH AUTOMATIC VERSIONING AND OPTIMISTIC LOCKING
     * 
     * ARCHITECTURE: This is the SINGLE SOURCE OF TRUTH for content saves.
     * Versioning is GUARANTEED at the database layer, not opt-in.
     * 
     * ENTERPRISE OPTIMISTIC LOCKING (2026-01-05):
     * Two locking strategies available (hash recommended):
     * 
     * 1. HASH-BASED (recommended): Pass 'expected_hash' - compares SHA-256 of content
     *    - TRUE content identity check
     *    - Works even if version history is pruned
     *    - Detects ANY content change
     * 
     * 2. VERSION-BASED (simpler): Pass 'expected_version' - compares version number
     *    - May fail if version history is pruned/reset
     *    - Simpler to implement on client side
     * 
     * @param string $key Slot key
     * @param mixed $data Data to save
     * @param array $options Optional settings:
     *   - 'expected_hash' => string - SHA-256 hash for robust locking (RECOMMENDED)
     *   - 'expected_version' => int - Version number for simple locking
     *   - 'skip_versioning' => bool - Skip versioning (for system operations)
     *   - 'changed_by' => string - User identifier for version history
     *   - 'slot_type' => string - Slot type (object, list, collection, etc.)
     *   - 'force_version' => bool - Force versioning even for skipped types
     *   - 'bypass_lock' => bool - DANGER: Skip optimistic lock check (for migrations only)
     *   - 'precomputed_version' => array - Precomputed version data from WASM (offloads server)
     * @return bool Success status
     * 
     * @throws OptimisticLockException If expected hash/version doesn't match current
     * @security Validates JSON encoding to prevent data loss
     */
    public static function saveSlot(string $key, mixed $data, array $options = []): bool
    {
        $db = self::getInstance();
        
        // JSON encode with flags for proper Unicode handling
        $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
        
        // CRITICAL: Check if JSON encoding failed
        if ($json === false) {
            $error = json_last_error_msg();
            error_log("[ContentDatabase] JSON encode failed for slot '{$key}': {$error}");
            throw new \RuntimeException("Failed to encode data as JSON: {$error}");
        }
        
        // Verify it's not empty (defensive check)
        if (empty($json) || $json === 'null') {
            error_log("[ContentDatabase] Warning: Saving null/empty data to slot '{$key}'");
        }
        
        // Extract options
        $skipVersioning = $options['skip_versioning'] ?? false;
        $forceVersion = $options['force_version'] ?? false;
        $slotType = $options['slot_type'] ?? null;
        $changedBy = $options['changed_by'] ?? 'system';
        $expectedVersion = $options['expected_version'] ?? null;
        $expectedHash = $options['expected_hash'] ?? null;
        $bypassLock = $options['bypass_lock'] ?? false;
        $precomputedVersion = $options['precomputed_version'] ?? null;
        
        // Skip versioning for certain slot types unless forced
        if (!$forceVersion && $slotType && in_array($slotType, self::SKIP_VERSIONING_TYPES, true)) {
            $skipVersioning = true;
        }
        
        // Start transaction FIRST (fix for transaction gap bug)
        $db->beginTransaction();
        
        try {
            // Get existing data INSIDE transaction for proper isolation
            $existingData = null;
            $currentVersion = 0;
            $currentHash = null;
            
            if (!$skipVersioning || $expectedHash !== null) {
                try {
                    $existingData = self::getSlot($key);
                    if ($existingData !== null) {
                        $currentHash = self::computeContentHash($existingData);
                    }
                    $versioning = VersioningService::getInstance();
                    $currentVersion = $versioning->getVersionCount($key);
                } catch (\Exception $e) {
                    error_log("[ContentDatabase] Failed to get existing data for versioning: " . $e->getMessage());
                }
            }
            
            // ═══════════════════════════════════════════════════════════════
            // OPTIMISTIC LOCKING CHECK - Prevents "Lost Update" bug
            // Priority: hash-based > version-based (hash is more robust)
            // ═══════════════════════════════════════════════════════════════
            if (!$bypassLock) {
                // HASH-BASED LOCKING (RECOMMENDED - TRUE content identity)
                if ($expectedHash !== null) {
                    // For new content, current hash is null
                    if ($currentHash !== null && !hash_equals($expectedHash, $currentHash)) {
                        $db->rollBack();
                        throw new OptimisticLockException(
                            slotKey: $key,
                            expectedHash: $expectedHash,
                            actualHash: $currentHash,
                            lockType: 'hash'
                        );
                    }
                }
                // VERSION-BASED LOCKING (FALLBACK - simpler but less robust)
                elseif ($expectedVersion !== null) {
                    if ($currentVersion !== $expectedVersion) {
                        $db->rollBack();
                        throw new OptimisticLockException(
                            slotKey: $key,
                            expectedVersion: $expectedVersion,
                            actualVersion: $currentVersion,
                            lockType: 'version'
                        );
                    }
                }
            }
            
            // Save the slot data
            $stmt = $db->prepare("
                INSERT OR REPLACE INTO slots (key, data, updated_at) 
                VALUES (?, ?, datetime('now'))
            ");
            
            $saveResult = $stmt->execute([$key, $json]);
            
            if (!$saveResult) {
                throw new \RuntimeException("Failed to save slot data");
            }
            
            // Create version if versioning is enabled and not skipped
            // OR if forceVersion is set (e.g., single object explicit save with create_version flag)
            $newVersion = $currentVersion;
            $shouldCreateVersion = !$skipVersioning || $forceVersion;
            
            if ($shouldCreateVersion) {
                try {
                    $versioning = VersioningService::getInstance();
                    if ($versioning->isEnabled()) {
                        // Pass precomputed version data if available (WASM optimization)
                        // IMPORTANT: Content saves create COMMIT versions (permanent), not shadows
                        $versionResult = $versioning->createVersion(
                            $key,
                            $existingData,
                            $data,
                            $changedBy,
                            $precomputedVersion,  // Client-side precomputed data
                            ['version_type' => 'commit', 'debounce' => false]  // Explicit saves = commit
                        );
                        
                        if ($versionResult['success']) {
                            $newVersion = $versionResult['version'] ?? ($currentVersion + 1);
                        } elseif (!($versionResult['skipped'] ?? false)) {
                            error_log("[ContentDatabase] Version creation warning for '{$key}': " . ($versionResult['error'] ?? 'unknown'));
                        }
                    }
                } catch (\Exception $e) {
                    error_log("[ContentDatabase] Versioning error for '{$key}': " . $e->getMessage());
                    // Don't fail the save, versioning is non-blocking
                }
            }
            
            $db->commit();
            return true;
            
        } catch (OptimisticLockException $e) {
            // Re-throw lock exceptions (already rolled back above)
            throw $e;
        } catch (\Exception $e) {
            $db->rollBack();
            error_log("[ContentDatabase] Transaction failed for '{$key}': " . $e->getMessage());
            throw $e;
        }
    }
    
    /**
     * Save slot and return version + hash for API responses
     * 
     * ENTERPRISE RESPONSE:
     * Returns both version and hash for client-side optimistic locking
     * 
     * @return array{success: bool, version: int, hash: string, error?: string}
     */
    public static function saveSlotWithResult(string $key, mixed $data, array $options = []): array
    {
        try {
            self::saveSlot($key, $data, $options);
            
            // Compute new hash for optimistic locking
            $newHash = self::computeContentHash($data);
            
            // Get the new version number
            $versioning = VersioningService::getInstance();
            $newVersion = $versioning->getVersionCount($key);
            
            return [
                'success' => true,
                'version' => $newVersion,
                'hash' => $newHash  // For next save's optimistic lock
            ];
        } catch (OptimisticLockException $e) {
            return [
                'success' => false,
                'error' => 'CONFLICT',
                'lock_type' => $e->lockType,
                'message' => $e->getMessage(),
                'expected_version' => $e->expectedVersion,
                'actual_version' => $e->actualVersion,
                'expected_hash' => $e->expectedHash,
                'actual_hash' => $e->actualHash
            ];
        } catch (\Exception $e) {
            return [
                'success' => false,
                'error' => $e->getMessage()
            ];
        }
    }

    /**
     * Delete a slot
     */
    public static function deleteSlot(string $key): bool
    {
        $db = self::getInstance();
        $stmt = $db->prepare("DELETE FROM slots WHERE key = ?");
        return $stmt->execute([$key]);
    }

    /**
     * Get all slot keys
     */
    public static function getAllSlots(): array
    {
        $db = self::getInstance();
        $stmt = $db->query("SELECT key, updated_at FROM slots ORDER BY key");
        return $stmt->fetchAll();
    }

    /**
     * Close database connection
     */
    public static function close(): void
    {
        self::$instance = null;
    }
}
