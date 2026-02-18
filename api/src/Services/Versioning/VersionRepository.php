<?php
/**
 * NOMAD CMS - Version Repository
 * 
 * Database operations for version storage and retrieval.
 * Extracted from VersioningService for modularity.
 * 
 * Supports hybrid versioning with:
 * - Shadow versions (auto, TTL-based expiry)
 * - Commit versions (manual, permanent)
 * - Named versions (protected, requires confirmation)
 */

declare(strict_types=1);

namespace NomadCMS\Services\Versioning;

use NomadCMS\Services\LoggerService;
use PDO;

class VersionRepository
{
    /** Version types */
    public const TYPE_SHADOW = 'shadow';
    public const TYPE_COMMIT = 'commit';
    public const TYPE_NAMED = 'named';
    
    /** Default TTL for shadow versions (24 hours) */
    private const DEFAULT_SHADOW_TTL = 86400;
    
    private PDO $db;
    private CompressionService $compression;
    private DiffEngine $diffEngine;
    
    public function __construct(PDO $db, CompressionService $compression, DiffEngine $diffEngine)
    {
        $this->db = $db;
        $this->compression = $compression;
        $this->diffEngine = $diffEngine;
    }
    
    /**
     * Get HMAC secret from environment
     */
    public static function getHmacSecret(): string
    {
        return $_ENV['VERSIONING_HMAC_SECRET'] ?? getenv('VERSIONING_HMAC_SECRET') ?: 'nomad-cms-default-hmac-secret-change-in-production';
    }
    
    /**
     * Get version history for a slot (metadata only, lazy loading)
     * Excludes expired shadow versions (lazy TTL cleanup)
     * 
     * @param string $slotKey Slot identifier
     * @param int $limit Max results
     * @param int $offset Pagination offset
     * @param bool $includeShadows Include shadow versions in results
     * @param bool $includeExpired Include expired shadows (for debugging)
     * @return array Version metadata list
     */
    public function getVersionHistory(
        string $slotKey, 
        int $limit = 20, 
        int $offset = 0,
        bool $includeShadows = false,
        bool $includeExpired = false
    ): array {
        // Lazy cleanup: trigger expired shadow cleanup in background
        $this->lazyCleanupExpiredShadows($slotKey);
        
        $sql = "
            SELECT 
                id, version_number, diff_size, is_compressed, snapshot_hash,
                content_size, change_summary, changed_by, changed_at,
                version_type, version_name, expires_at,
                CASE 
                    WHEN expires_at IS NOT NULL 
                    THEN MAX(0, (strftime('%s', expires_at) - strftime('%s', 'now')))
                    ELSE NULL 
                END as ttl_seconds
            FROM slot_versions
            WHERE slot_key = ?
        ";
        
        $params = [$slotKey];
        
        // Filter expired shadows unless requested
        if (!$includeExpired) {
            $sql .= " AND (expires_at IS NULL OR expires_at > datetime('now'))";
        }
        
        // Filter shadows unless requested
        // NULL version_type = legacy versions (treated as commit)
        // Only hide explicit 'shadow' type versions
        if (!$includeShadows) {
            $sql .= " AND (version_type IS NULL OR version_type = 'commit' OR version_type = 'named')";
        }
        
        $sql .= " ORDER BY version_number DESC LIMIT ? OFFSET ?";
        $params[] = $limit;
        $params[] = $offset;
        
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
    
    /**
     * Get total version count for a slot
     * @param bool $includeShadows Include shadow versions
     * @param bool $includeExpired Include expired shadows
     */
    public function getVersionCount(string $slotKey, bool $includeShadows = false, bool $includeExpired = false): int
    {
        $sql = "SELECT COUNT(*) as count FROM slot_versions WHERE slot_key = ?";
        $params = [$slotKey];
        
        if (!$includeExpired) {
            $sql .= " AND (expires_at IS NULL OR expires_at > datetime('now'))";
        }
        
        // NULL version_type = legacy versions (treated as commit)
        if (!$includeShadows) {
            $sql .= " AND (version_type IS NULL OR version_type = 'commit' OR version_type = 'named')";
        }
        
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return (int) $stmt->fetch()['count'];
    }
    
    /**
     * Get the highest version number for a slot
     */
    public function getMaxVersionNumber(string $slotKey): int
    {
        $stmt = $this->db->prepare("SELECT MAX(version_number) as max_version FROM slot_versions WHERE slot_key = ?");
        $stmt->execute([$slotKey]);
        return (int) ($stmt->fetch()['max_version'] ?? 0);
    }
    
    /**
     * Check if a specific version exists
     */
    public function versionExists(string $slotKey, int $versionNumber): bool
    {
        $stmt = $this->db->prepare("SELECT 1 FROM slot_versions WHERE slot_key = ? AND version_number = ? LIMIT 1");
        $stmt->execute([$slotKey, $versionNumber]);
        return $stmt->fetch() !== false;
    }
    
    /**
     * Get all version numbers between two versions (inclusive)
     */
    public function getVersionsBetween(string $slotKey, int $fromVersion, int $toVersion): array
    {
        $stmt = $this->db->prepare("
            SELECT version_number FROM slot_versions
            WHERE slot_key = ? AND version_number >= ? AND version_number <= ?
            ORDER BY version_number ASC
        ");
        $stmt->execute([$slotKey, $fromVersion, $toVersion]);
        return array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
    }
    
    /**
     * Get next version number for a slot
     */
    public function getNextVersionNumber(string $slotKey): int
    {
        return $this->getMaxVersionNumber($slotKey) + 1;
    }
    
    /**
     * Find a version by content hash (for deduplication)
     */
    public function findVersionByHash(string $slotKey, string $contentHash): ?array
    {
        $stmt = $this->db->prepare("
            SELECT version_number, change_summary, changed_at 
            FROM slot_versions 
            WHERE slot_key = ? AND snapshot_hash = ?
            ORDER BY version_number DESC LIMIT 1
        ");
        $stmt->execute([$slotKey, $contentHash]);
        return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    }
    
    /**
     * Get the last (most recent) version entry for a slot
     * Used for smart deduplication during restores
     */
    public function getLastVersionEntry(string $slotKey): ?array
    {
        $stmt = $this->db->prepare("
            SELECT version_number, snapshot_hash, change_summary
            FROM slot_versions WHERE slot_key = ?
            ORDER BY version_number DESC LIMIT 1
        ");
        $stmt->execute([$slotKey]);
        return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    }
    
    /**
     * Insert a new version record
     * Supports version_type and expires_at for hybrid versioning
     */
    public function insertVersion(array $data): int
    {
        $stmt = $this->db->prepare("
            INSERT INTO slot_versions (
                slot_key, version_number, 
                diff_forward, diff_backward, diff_size, is_compressed,
                is_snapshot, snapshot_data,
                snapshot_hash, content_size, hmac_signature,
                change_summary, changed_by, changed_at,
                version_type, version_name, expires_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?)
        ");
        
        $stmt->execute([
            $data['slot_key'],
            $data['version_number'],
            $data['diff_forward'],
            $data['diff_backward'],
            $data['diff_size'],
            $data['is_compressed'],
            $data['is_snapshot'],
            $data['snapshot_data'],
            $data['snapshot_hash'],
            $data['content_size'],
            $data['hmac_signature'],
            $data['change_summary'],
            $data['changed_by'],
            $data['version_type'] ?? self::TYPE_SHADOW,
            $data['version_name'] ?? null,
            $data['expires_at'] ?? null
        ]);
        
        return (int) $this->db->lastInsertId();
    }
    
    /**
     * Update version to be a snapshot
     */
    public function convertToSnapshot(int $id, string $snapshotData, string $hash, bool $isCompressed): bool
    {
        $stmt = $this->db->prepare("
            UPDATE slot_versions 
            SET is_snapshot = 1, snapshot_data = ?, snapshot_hash = ?, is_compressed = ?
            WHERE id = ?
        ");
        return $stmt->execute([$snapshotData, $hash, $isCompressed ? 1 : 0, $id]);
    }
    
    /**
     * Delete versions by IDs
     */
    public function deleteVersionsByIds(array $ids): int
    {
        if (empty($ids)) return 0;
        
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $this->db->prepare("DELETE FROM slot_versions WHERE id IN ($placeholders)");
        $stmt->execute($ids);
        
        return $stmt->rowCount();
    }
    
    /**
     * Get all versions for a slot ordered by version number
     */
    public function getAllVersionsForSlot(string $slotKey): array
    {
        $stmt = $this->db->prepare("
            SELECT id, version_number, is_snapshot, diff_forward, is_compressed
            FROM slot_versions WHERE slot_key = ?
            ORDER BY version_number DESC
        ");
        $stmt->execute([$slotKey]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
    
    /**
     * Get distinct slot keys with versions
     */
    public function getDistinctSlotKeys(): array
    {
        $stmt = $this->db->query("SELECT DISTINCT slot_key FROM slot_versions");
        return $stmt->fetchAll(PDO::FETCH_COLUMN);
    }
    
    /**
     * Get old versions for cleanup
     */
    public function getOldVersionsForCleanup(string $slotKey, int $retentionDays): array
    {
        $stmt = $this->db->prepare("
            SELECT id, version_number, is_snapshot, changed_at,
                   strftime('%Y-%m', changed_at) as year_month
            FROM slot_versions 
            WHERE slot_key = ? AND changed_at < datetime('now', '-' || ? || ' days')
            ORDER BY version_number ASC
        ");
        $stmt->execute([$slotKey, $retentionDays]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
    
    /**
     * Get oldest remaining version after exclusions
     */
    public function getOldestRemainingVersion(string $slotKey, array $excludeIds): ?array
    {
        if (empty($excludeIds)) {
            $stmt = $this->db->prepare("
                SELECT id, version_number, is_snapshot FROM slot_versions
                WHERE slot_key = ? ORDER BY version_number ASC LIMIT 1
            ");
            $stmt->execute([$slotKey]);
        } else {
            $placeholders = implode(',', array_fill(0, count($excludeIds), '?'));
            $stmt = $this->db->prepare("
                SELECT id, version_number, is_snapshot FROM slot_versions
                WHERE slot_key = ? AND id NOT IN ($placeholders)
                ORDER BY version_number ASC LIMIT 1
            ");
            $stmt->execute(array_merge([$slotKey], $excludeIds));
        }
        
        return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    }
    
    /**
     * Vacuum database
     */
    public function vacuum(): void
    {
        try {
            $this->db->exec('VACUUM');
        } catch (\Exception $e) {
            // Vacuum might fail in concurrent access, ignore
        }
    }
    
    /**
     * Get a specific version (includes diff data)
     */
    public function getVersion(string $slotKey, int $versionNumber): ?array
    {
        $stmt = $this->db->prepare("SELECT * FROM slot_versions WHERE slot_key = ? AND version_number = ?");
        $stmt->execute([$slotKey, $versionNumber]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$row) return null;
        
        // Verify HMAC integrity
        $dataToSign = $row['slot_key'] . $row['version_number'] . $row['snapshot_hash'];
        $expectedHmac = hash_hmac('sha256', $dataToSign, self::getHmacSecret());
        
        if (!hash_equals($expectedHmac, $row['hmac_signature'])) {
            LoggerService::warning('VersionRepository: HMAC verification failed', [
                'slot_key' => $slotKey, 'version' => $versionNumber
            ]);
            return null;
        }
        
        // Decompress forward diff with proper error handling
        try {
            $row['diff_forward_json'] = $this->compression->decompress($row['diff_forward'], (bool) $row['is_compressed']);
        } catch (\RuntimeException $e) {
            LoggerService::error('VersionRepository: Failed to decompress diff_forward', [
                'slot_key' => $slotKey,
                'version' => $versionNumber,
                'error' => $e->getMessage(),
            ]);
            return null;
        }
        
        // Compute backward diff on-demand
        $row['diff_backward_json'] = $this->diffEngine->computeBackwardDiff($row['diff_forward_json']);
        
        unset($row['diff_forward'], $row['diff_backward']);
        return $row;
    }
    
    /**
     * Delete all versions for a slot
     */
    public function deleteAllVersions(string $slotKey): bool
    {
        $stmt = $this->db->prepare("DELETE FROM slot_versions WHERE slot_key = ?");
        return $stmt->execute([$slotKey]);
    }
    
    /**
     * Get storage statistics
     * Enhanced with shadow version stats
     */
    public function getStorageStats(): array
    {
        $stmt = $this->db->query("
            SELECT 
                COUNT(*) as total_versions,
                COUNT(DISTINCT slot_key) as slots_with_versions,
                SUM(diff_size) as total_diff_size,
                SUM(LENGTH(diff_forward)) as total_compressed_size,
                AVG(content_size) as avg_content_size,
                SUM(CASE WHEN version_type = 'shadow' THEN 1 ELSE 0 END) as shadow_count,
                SUM(CASE WHEN version_type = 'commit' THEN 1 ELSE 0 END) as commit_count,
                SUM(CASE WHEN version_type = 'named' THEN 1 ELSE 0 END) as named_count,
                SUM(CASE 
                    WHEN version_type = 'shadow' AND expires_at < datetime('now') 
                    THEN 1 ELSE 0 
                END) as expired_shadow_count,
                MIN(CASE WHEN version_type = 'shadow' THEN expires_at ELSE NULL END) as oldest_shadow_expires
            FROM slot_versions
        ");
        
        $stats = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];
        
        // Calculate cleanup estimate
        if (!empty($stats['expired_shadow_count'])) {
            $stmt = $this->db->query("
                SELECT SUM(diff_size) as expired_size
                FROM slot_versions
                WHERE version_type = 'shadow' AND expires_at < datetime('now')
            ");
            $expired = $stmt->fetch(PDO::FETCH_ASSOC);
            $stats['cleanup_estimate_bytes'] = (int) ($expired['expired_size'] ?? 0);
        } else {
            $stats['cleanup_estimate_bytes'] = 0;
        }
        
        return $stats;
    }
    
    // ==========================================
    // HYBRID VERSIONING - Shadow/Commit/Named
    // ==========================================
    
    /**
     * Lazy cleanup expired shadow versions (non-blocking)
     * Called on version reads to avoid cron dependency
     * 
     * @param string|null $slotKey Limit to specific slot, or all if null
     * @param int $batchSize Max records to delete per call
     */
    public function lazyCleanupExpiredShadows(?string $slotKey = null, int $batchSize = 50): int
    {
        try {
            $sql = "
                SELECT id FROM slot_versions 
                WHERE version_type = 'shadow' 
                AND expires_at IS NOT NULL 
                AND expires_at < datetime('now')
            ";
            $params = [];
            
            if ($slotKey !== null) {
                $sql .= " AND slot_key = ?";
                $params[] = $slotKey;
            }
            
            $sql .= " LIMIT ?";
            $params[] = $batchSize;
            
            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            $expiredIds = $stmt->fetchAll(PDO::FETCH_COLUMN);
            
            if (!empty($expiredIds)) {
                // Verify these aren't the last version for any slot
                $safeDeletable = $this->filterSafeToDeletable($expiredIds);
                
                if (!empty($safeDeletable)) {
                    return $this->deleteVersionsByIds($safeDeletable);
                }
            }
            
            return 0;
            
        } catch (\Exception $e) {
            LoggerService::warning('LazyCleanup failed', ['error' => $e->getMessage()]);
            return 0;
        }
    }
    
    /**
     * Filter version IDs that are safe to delete (not the last version)
     */
    private function filterSafeToDeletable(array $ids): array
    {
        if (empty($ids)) return [];
        
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        
        // Get slot_key and version_number for these IDs
        $stmt = $this->db->prepare("
            SELECT id, slot_key, version_number 
            FROM slot_versions 
            WHERE id IN ($placeholders)
        ");
        $stmt->execute($ids);
        $versions = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        $safeDeletable = [];
        
        foreach ($versions as $v) {
            // Check if this is the last (highest) version for the slot
            $stmt = $this->db->prepare("
                SELECT MAX(version_number) as max_version 
                FROM slot_versions 
                WHERE slot_key = ?
            ");
            $stmt->execute([$v['slot_key']]);
            $maxVersion = (int) $stmt->fetch()['max_version'];
            
            // Only delete if not the last version
            if ($v['version_number'] < $maxVersion) {
                $safeDeletable[] = $v['id'];
            }
        }
        
        return $safeDeletable;
    }
    
    /**
     * Promote shadow version to commit/named
     * 
     * @param int $versionId Version ID to promote
     * @param string $newType Target type ('commit' or 'named')
     * @param string|null $name Optional name for named versions
     * @return array{success: bool, error?: string}
     */
    public function promoteVersion(int $versionId, string $newType = self::TYPE_COMMIT, ?string $name = null): array
    {
        if (!in_array($newType, [self::TYPE_COMMIT, self::TYPE_NAMED])) {
            return ['success' => false, 'error' => 'Invalid target type'];
        }
        
        try {
            $stmt = $this->db->prepare("
                UPDATE slot_versions 
                SET version_type = ?, 
                    version_name = ?,
                    expires_at = NULL
                WHERE id = ?
            ");
            $result = $stmt->execute([$newType, $name, $versionId]);
            
            if ($result && $stmt->rowCount() > 0) {
                return ['success' => true];
            }
            
            return ['success' => false, 'error' => 'Version not found'];
            
        } catch (\Exception $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
    
    /**
     * Delete a specific version with safety checks
     * 
     * @param int $versionId Version ID to delete
     * @param bool $forceNamedDelete Allow deleting named versions
     * @return array{success: bool, error?: string}
     */
    public function deleteVersion(int $versionId, bool $forceNamedDelete = false): array
    {
        // Get version info
        $stmt = $this->db->prepare("
            SELECT id, slot_key, version_number, version_type 
            FROM slot_versions WHERE id = ?
        ");
        $stmt->execute([$versionId]);
        $version = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$version) {
            return ['success' => false, 'error' => 'Version not found'];
        }
        
        // Check if named version and force not enabled
        if ($version['version_type'] === self::TYPE_NAMED && !$forceNamedDelete) {
            return [
                'success' => false, 
                'error' => 'Cannot delete named version without confirmation',
                'requires_confirmation' => true
            ];
        }
        
        // Check if this is the last version
        $stmt = $this->db->prepare("
            SELECT COUNT(*) as count FROM slot_versions WHERE slot_key = ?
        ");
        $stmt->execute([$version['slot_key']]);
        $count = (int) $stmt->fetch()['count'];
        
        if ($count <= 1) {
            return ['success' => false, 'error' => 'Cannot delete the last version'];
        }
        
        // Check if highest version number
        $stmt = $this->db->prepare("
            SELECT MAX(version_number) as max_version FROM slot_versions WHERE slot_key = ?
        ");
        $stmt->execute([$version['slot_key']]);
        $maxVersion = (int) $stmt->fetch()['max_version'];
        
        if ($version['version_number'] == $maxVersion) {
            return ['success' => false, 'error' => 'Cannot delete the current (latest) version'];
        }
        
        // Safe to delete
        $deleted = $this->deleteVersionsByIds([$versionId]);
        
        return $deleted > 0 
            ? ['success' => true, 'deleted' => $deleted]
            : ['success' => false, 'error' => 'Delete failed'];
    }
    
    /**
     * Get a version by ID
     */
    public function getVersionById(int $versionId): ?array
    {
        $stmt = $this->db->prepare("
            SELECT *,
                CASE 
                    WHEN expires_at IS NOT NULL 
                    THEN MAX(0, (strftime('%s', expires_at) - strftime('%s', 'now')))
                    ELSE NULL 
                END as ttl_seconds
            FROM slot_versions WHERE id = ?
        ");
        $stmt->execute([$versionId]);
        return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    }
    
    /**
     * Rename a version (for commit/named/legacy types)
     * Legacy versions (NULL type) are also renameable
     */
    public function renameVersion(int $versionId, string $name): array
    {
        try {
            // Allow renaming: commit, named, and NULL (legacy) types
            // Only shadow versions cannot be renamed
            $stmt = $this->db->prepare("
                UPDATE slot_versions 
                SET version_name = ?, version_type = COALESCE(version_type, 'named')
                WHERE id = ? AND (version_type IS NULL OR version_type = 'commit' OR version_type = 'named')
            ");
            $result = $stmt->execute([$name, $versionId]);
            
            if ($result && $stmt->rowCount() > 0) {
                return ['success' => true];
            }
            
            return ['success' => false, 'error' => 'Verzió nem található vagy piszkozat típusú'];
            
        } catch (\Exception $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
    
    /**
     * Calculate shadow TTL expiry datetime
     * 
     * @param int|null $ttlSeconds Custom TTL in seconds, or default 24h
     * @return string SQLite datetime format
     */
    public static function calculateExpiresAt(?int $ttlSeconds = null): string
    {
        $ttl = $ttlSeconds ?? self::DEFAULT_SHADOW_TTL;
        return date('Y-m-d H:i:s', time() + $ttl);
    }
    
    /**
     * Check if debounce should apply (same slot, recent shadow)
     * Returns the shadow version to update, or null if new version needed
     * 
     * @param string $slotKey Slot identifier
     * @param int $debounceWindowSeconds Window in seconds (default 5 min)
     * @return int|null Version ID to update, or null
     */
    public function checkDebounce(string $slotKey, int $debounceWindowSeconds = 300): ?int
    {
        $stmt = $this->db->prepare("
            SELECT id 
            FROM slot_versions 
            WHERE slot_key = ? 
            AND version_type = 'shadow'
            AND changed_at > datetime('now', '-' || ? || ' seconds')
            ORDER BY version_number DESC
            LIMIT 1
        ");
        $stmt->execute([$slotKey, $debounceWindowSeconds]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        
        return $row ? (int) $row['id'] : null;
    }
    
    /**
     * Update existing shadow version (for debounce)
     * Optionally updates snapshot_data if the version is a snapshot
     */
    public function updateShadowVersion(int $versionId, array $data): bool
    {
        // Build dynamic SQL based on whether snapshot_data is provided
        $hasSnapshot = isset($data['snapshot_data']) && $data['snapshot_data'] !== null;
        
        if ($hasSnapshot) {
            $stmt = $this->db->prepare("
                UPDATE slot_versions 
                SET diff_forward = ?,
                    diff_backward = ?,
                    diff_size = ?,
                    is_compressed = ?,
                    snapshot_hash = ?,
                    snapshot_data = ?,
                    content_size = ?,
                    hmac_signature = ?,
                    change_summary = ?,
                    changed_at = datetime('now'),
                    expires_at = ?
                WHERE id = ? AND version_type = 'shadow'
            ");
            
            return $stmt->execute([
                $data['diff_forward'],
                $data['diff_backward'],
                $data['diff_size'],
                $data['is_compressed'],
                $data['snapshot_hash'],
                $data['snapshot_data'],
                $data['content_size'],
                $data['hmac_signature'],
                $data['change_summary'],
                $data['expires_at'] ?? self::calculateExpiresAt(),
                $versionId
            ]);
        }
        
        // Original update without snapshot_data
        $stmt = $this->db->prepare("
            UPDATE slot_versions 
            SET diff_forward = ?,
                diff_backward = ?,
                diff_size = ?,
                is_compressed = ?,
                snapshot_hash = ?,
                content_size = ?,
                hmac_signature = ?,
                change_summary = ?,
                changed_at = datetime('now'),
                expires_at = ?
            WHERE id = ? AND version_type = 'shadow'
        ");
        
        return $stmt->execute([
            $data['diff_forward'],
            $data['diff_backward'],
            $data['diff_size'],
            $data['is_compressed'],
            $data['snapshot_hash'],
            $data['content_size'],
            $data['hmac_signature'],
            $data['change_summary'],
            $data['expires_at'] ?? self::calculateExpiresAt(),
            $versionId
        ]);
    }
    
    /**
     * Get database connection
     */
    public function getDb(): PDO
    {
        return $this->db;
    }
}
