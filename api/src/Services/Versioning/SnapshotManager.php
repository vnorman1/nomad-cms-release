<?php
/**
 * NOMAD CMS - Snapshot Manager
 * 
 * Handles snapshot creation, restoration, and version chain management.
 * Extracted from VersioningService for modularity.
 */

declare(strict_types=1);

namespace NomadCMS\Services\Versioning;

use NomadCMS\Services\LoggerService;
use PDO;

class SnapshotManager
{
    private PDO $db;
    private CompressionService $compression;
    private DiffEngine $diffEngine;
    private VersionRepository $repository;
    private VersioningSettings $settings;
    
    public function __construct(
        PDO $db,
        CompressionService $compression,
        DiffEngine $diffEngine,
        VersionRepository $repository,
        VersioningSettings $settings
    ) {
        $this->db = $db;
        $this->compression = $compression;
        $this->diffEngine = $diffEngine;
        $this->repository = $repository;
        $this->settings = $settings;
    }
    
    /**
     * Find the nearest snapshot version at or before the target version
     */
    public function findNearestSnapshot(string $slotKey, int $targetVersion): ?array
    {
        $stmt = $this->db->prepare("
            SELECT version_number, snapshot_data, is_compressed
            FROM slot_versions
            WHERE slot_key = ? AND is_snapshot = 1 AND version_number <= ?
            ORDER BY version_number DESC LIMIT 1
        ");
        $stmt->execute([$slotKey, $targetVersion]);
        return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    }
    
    /**
     * Reconstruct version content (read-only, no persistence)
     */
    public function reconstructVersion(string $slotKey, int $targetVersion): array
    {
        try {
            if ($targetVersion < 1) {
                return ['success' => false, 'error' => 'Invalid version number'];
            }
            
            if (!$this->repository->versionExists($slotKey, $targetVersion)) {
                return ['success' => false, 'error' => 'Version not found'];
            }
            
            // Find nearest snapshot
            $snapshot = $this->findNearestSnapshot($slotKey, $targetVersion);
            
            $startVersion = 1;
            $contentJson = 'null';
            $strategy = 'full_chain';
            
            if ($snapshot) {
                $startVersion = (int) $snapshot['version_number'];
                
                // Decompress snapshot with proper error handling
                try {
                    $contentJson = $this->compression->decompress(
                        $snapshot['snapshot_data'],
                        (bool) $snapshot['is_compressed']
                    );
                } catch (\RuntimeException $e) {
                    LoggerService::error('SnapshotManager: Failed to decompress snapshot', [
                        'slot_key' => $slotKey,
                        'snapshot_version' => $startVersion,
                        'error' => $e->getMessage(),
                    ]);
                    return ['success' => false, 'error' => 'Snapshot decompression failed at version ' . $startVersion];
                }
                
                $strategy = "snapshot_v{$startVersion}";
                
                if ($startVersion === $targetVersion) {
                    return [
                        'success' => true,
                        'content' => json_decode($contentJson, true),
                        'restored_version' => $targetVersion,
                        'strategy' => 'direct_snapshot'
                    ];
                }
                $startVersion++;
            }
            
            // Apply forward diffs
            $versionNumbers = $this->repository->getVersionsBetween($slotKey, $startVersion, $targetVersion);
            $diffsApplied = 0;
            
            foreach ($versionNumbers as $v) {
                $version = $this->repository->getVersion($slotKey, $v);
                if (!$version) {
                    return ['success' => false, 'error' => "Version $v not found"];
                }
                
                $diffForward = json_decode($version['diff_forward_json'], true);
                $applyResult = $this->diffEngine->applyPatch($contentJson, $diffForward);
                
                if (!$applyResult['success']) {
                    return ['success' => false, 'error' => "Failed to apply diff at version $v"];
                }
                
                $contentJson = json_encode($applyResult['data'], JSON_UNESCAPED_UNICODE);
                $diffsApplied++;
            }
            
            return [
                'success' => true,
                'content' => json_decode($contentJson, true),
                'restored_version' => $targetVersion,
                'strategy' => $strategy,
                'diffs_applied' => $diffsApplied
            ];
            
        } catch (\Exception $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
    
    /**
     * Enforce version limit per slot (delete oldest)
     * Ensures chain integrity by converting oldest kept version to snapshot
     */
    public function enforceVersionLimit(string $slotKey): void
    {
        $maxVersions = $this->settings->getMaxVersions();
        
        $stmt = $this->db->prepare("
            SELECT id, version_number, is_snapshot, diff_forward, is_compressed
            FROM slot_versions WHERE slot_key = ?
            ORDER BY version_number DESC
        ");
        $stmt->execute([$slotKey]);
        $allVersions = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        if (count($allVersions) <= $maxVersions) return;
        
        $toKeepIds = [];
        $toDeleteIds = [];
        $keptCount = 0;
        $oldestKeptVersion = null;
        
        foreach ($allVersions as $version) {
            $isSnapshot = (bool) $version['is_snapshot'];
            if ($keptCount < $maxVersions || $isSnapshot) {
                $toKeepIds[] = $version['id'];
                if ($keptCount < $maxVersions) {
                    $oldestKeptVersion = $version;
                    $keptCount++;
                }
            } else {
                $toDeleteIds[] = $version['id'];
            }
        }
        
        // Convert oldest kept to snapshot if needed
        if ($oldestKeptVersion && !$oldestKeptVersion['is_snapshot'] && !empty($toDeleteIds)) {
            $reconstructed = $this->reconstructVersion($slotKey, (int)$oldestKeptVersion['version_number']);
            
            if ($reconstructed['success'] && isset($reconstructed['content'])) {
                $fullContent = json_encode($reconstructed['content'], JSON_UNESCAPED_UNICODE);
                $compressedContent = $this->compression->compress($fullContent);
                $hash = hash('sha256', $fullContent);
                
                $updateStmt = $this->db->prepare("
                    UPDATE slot_versions 
                    SET is_snapshot = 1, snapshot_data = ?, snapshot_hash = ?, is_compressed = ?
                    WHERE id = ?
                ");
                $updateStmt->execute([
                    $compressedContent['data'],
                    $hash,
                    $compressedContent['is_compressed'] ? 1 : 0,
                    $oldestKeptVersion['id']
                ]);
                
                LoggerService::info('SnapshotManager: Converted oldest kept version to snapshot', [
                    'slot_key' => $slotKey,
                    'version_number' => $oldestKeptVersion['version_number']
                ]);
            } else {
                LoggerService::warning('SnapshotManager: Cannot convert to snapshot, skipping deletion', [
                    'slot_key' => $slotKey
                ]);
                return;
            }
        }
        
        // Delete old versions
        if (!empty($toDeleteIds)) {
            $placeholders = implode(',', array_fill(0, count($toDeleteIds), '?'));
            $deleteStmt = $this->db->prepare("DELETE FROM slot_versions WHERE id IN ($placeholders)");
            $deleteStmt->execute($toDeleteIds);
            
            LoggerService::debug('SnapshotManager: Deleted old versions', [
                'slot_key' => $slotKey,
                'deleted_count' => count($toDeleteIds)
            ]);
        }
    }
    
    /**
     * Clean up old versions based on retention policy
     */
    public function cleanupOldVersions(): array
    {
        $retentionDays = $this->settings->getRetentionDays();
        $minVersionsToKeep = 5;
        
        $deletedCount = 0;
        $preservedCount = 0;
        
        $slotsStmt = $this->db->query("SELECT DISTINCT slot_key FROM slot_versions");
        $slots = $slotsStmt->fetchAll(PDO::FETCH_COLUMN);
        
        foreach ($slots as $slotKey) {
            $countStmt = $this->db->prepare("SELECT COUNT(*) FROM slot_versions WHERE slot_key = ?");
            $countStmt->execute([$slotKey]);
            $totalVersions = (int) $countStmt->fetchColumn();
            
            if ($totalVersions <= $minVersionsToKeep) continue;
            
            $stmt = $this->db->prepare("
                SELECT id, version_number, is_snapshot, changed_at, strftime('%Y-%m', changed_at) as year_month
                FROM slot_versions 
                WHERE slot_key = ? AND changed_at < datetime('now', '-' || ? || ' days')
                ORDER BY version_number ASC
            ");
            $stmt->execute([$slotKey, $retentionDays]);
            $oldVersions = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            $monthsWithPreservedVersion = [];
            $toDelete = [];
            
            foreach ($oldVersions as $version) {
                $yearMonth = $version['year_month'];
                $isSnapshot = (bool) $version['is_snapshot'];
                $shouldPreserve = false;
                
                // Policy: Keep oldest version of each month (long-term history)
                if (!isset($monthsWithPreservedVersion[$yearMonth])) {
                    $shouldPreserve = true;
                    $monthsWithPreservedVersion[$yearMonth] = true;
                }
                // NOTE: We do NOT blindly preserve snapshots anymore.
                // If a snapshot is redundant (e.g. 2nd version in a month), it can be deleted.
                // The cleanup logic below ensures chain integrity by converting the next remaining version to a snapshot.
                
                $remainingAfterDelete = $totalVersions - count($toDelete) - 1;
                if ($remainingAfterDelete < $minVersionsToKeep) {
                    $shouldPreserve = true;
                }
                
                if ($shouldPreserve) {
                    $preservedCount++;
                } else {
                    $toDelete[] = $version['id'];
                }
            }
            
            if (!empty($toDelete)) {
                // Ensure chain integrity
                $remainingStmt = $this->db->prepare("
                    SELECT id, version_number, is_snapshot FROM slot_versions
                    WHERE slot_key = ? AND id NOT IN (" . implode(',', array_fill(0, count($toDelete), '?')) . ")
                    ORDER BY version_number ASC LIMIT 1
                ");
                $remainingStmt->execute(array_merge([$slotKey], $toDelete));
                $oldestRemaining = $remainingStmt->fetch(PDO::FETCH_ASSOC);
                
                if ($oldestRemaining && !$oldestRemaining['is_snapshot']) {
                    $reconstructed = $this->reconstructVersion($slotKey, (int)$oldestRemaining['version_number']);
                    
                    if ($reconstructed['success'] && isset($reconstructed['content'])) {
                        $fullContent = json_encode($reconstructed['content'], JSON_UNESCAPED_UNICODE);
                        $compressedContent = $this->compression->compress($fullContent);
                        $hash = hash('sha256', $fullContent);
                        
                        $updateStmt = $this->db->prepare("
                            UPDATE slot_versions SET is_snapshot = 1, snapshot_data = ?, snapshot_hash = ?, is_compressed = ?
                            WHERE id = ?
                        ");
                        $updateStmt->execute([
                            $compressedContent['data'],
                            $hash,
                            $compressedContent['is_compressed'] ? 1 : 0,
                            $oldestRemaining['id']
                        ]);
                    } else {
                        continue;
                    }
                }
                
                $placeholders = implode(',', array_fill(0, count($toDelete), '?'));
                $deleteStmt = $this->db->prepare("DELETE FROM slot_versions WHERE id IN ($placeholders)");
                $deleteStmt->execute($toDelete);
                $deletedCount += count($toDelete);
            }
        }
        
        // FIX: Also enforce maxVersions limit on all slots
        // This ensures that when the user changes maxVersions to a lower value,
        // the cleanup will actually delete versions exceeding the new limit
        $maxVersionsDeleted = 0;
        $maxVersions = $this->settings->getMaxVersions();
        
        foreach ($slots as $slotKey) {
            // Count versions before enforcing limit
            $countBefore = $this->repository->getVersionCount($slotKey);
            
            // Enforce the maxVersions limit (this handles snapshot conversion too)
            $this->enforceVersionLimit($slotKey);
            
            // Count versions after enforcing limit
            $countAfter = $this->repository->getVersionCount($slotKey);
            
            $maxVersionsDeleted += ($countBefore - $countAfter);
        }
        
        try { $this->db->exec('VACUUM'); } catch (\Exception $e) {}
        
        return [
            'deleted' => $deletedCount + $maxVersionsDeleted,
            'deleted_by_retention' => $deletedCount,
            'deleted_by_max_versions' => $maxVersionsDeleted,
            'preserved' => $preservedCount,
            'slots_processed' => count($slots),
            'retention_days' => $retentionDays,
            'max_versions' => $maxVersions
        ];
    }
}
