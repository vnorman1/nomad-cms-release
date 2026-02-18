<?php
/**
 * NOMAD CMS - Version Restorer
 * 
 * Handles version restoration with atomic transactions.
 * Extracted from VersioningService for modularity.
 */

declare(strict_types=1);

namespace NomadCMS\Services\Versioning;

use NomadCMS\Services\LoggerService;
use NomadCMS\Database\ContentDatabase;
use PDO;
use Exception;

class VersionRestorer
{
    /** Full snapshot every N versions */
    private const SNAPSHOT_INTERVAL = 10;
    
    private PDO $db;
    private CompressionService $compression;
    private DiffEngine $diffEngine;
    private VersionRepository $repository;
    private VersioningSettings $settings;
    private SnapshotManager $snapshotManager;
    
    public function __construct(
        PDO $db,
        CompressionService $compression,
        DiffEngine $diffEngine,
        VersionRepository $repository,
        VersioningSettings $settings,
        SnapshotManager $snapshotManager
    ) {
        $this->db = $db;
        $this->compression = $compression;
        $this->diffEngine = $diffEngine;
        $this->repository = $repository;
        $this->settings = $settings;
        $this->snapshotManager = $snapshotManager;
    }
    
    /**
     * ATOMIC RESTORE: Restore content to a specific version AND persist to database
     * 
     * This is a TRUE database-level restore with full ACID guarantees:
     * 1. Reconstructs content from snapshots + diffs
     * 2. Saves restored content to slots table
     * 3. Creates a new version entry for the restore operation
     * All within a single transaction.
     */
    public function atomicRestore(
        string $slotKey,
        int $targetVersion,
        ?string $restoredBy = null
    ): array {
        try {
            // Get current content for reference
            $currentContent = ContentDatabase::getSlot($slotKey);
            
            // Reconstruct the target version content
            $reconstructResult = $this->snapshotManager->reconstructVersion($slotKey, $targetVersion);
            
            if (!$reconstructResult['success']) {
                return $reconstructResult;
            }
            
            $restoredContent = $reconstructResult['content'];
            $restoredJson = json_encode($restoredContent, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            $restoredHash = hash('sha256', $restoredJson);
            
            // Skip if content is identical to current
            if (json_encode($currentContent) === $restoredJson) {
                return [
                    'success' => true,
                    'content' => $restoredContent,
                    'message' => 'Content already at target version',
                    'skipped' => true
                ];
            }
            
            // SMART DEDUPLICATION: Check if last version has same content
            $lastVersion = $this->repository->getLastVersionEntry($slotKey);
            
            if ($lastVersion !== null && $lastVersion['snapshot_hash'] === $restoredHash) {
                // Just update slot data without creating new version entry
                $stmt = $this->db->prepare("
                    INSERT OR REPLACE INTO slots (key, data, updated_at) 
                    VALUES (?, ?, datetime('now'))
                ");
                $stmt->execute([$slotKey, $restoredJson]);
                
                LoggerService::info('VersionRestorer: Restore deduped - same as last version', [
                    'slot_key' => $slotKey,
                    'target_version' => $targetVersion
                ]);
                
                return [
                    'success' => true,
                    'content' => $restoredContent,
                    'restored_version' => $targetVersion,
                    'message' => 'Content restored (deduped)',
                    'deduped' => true
                ];
            }
            
            // Start atomic transaction
            $this->db->beginTransaction();
            
            try {
                // 1. Save restored content to slots table
                $stmt = $this->db->prepare("
                    INSERT OR REPLACE INTO slots (key, data, updated_at) 
                    VALUES (?, ?, datetime('now'))
                ");
                $stmt->execute([$slotKey, $restoredJson]);
                
                // 2. Create version entry for the restore operation
                $nextVersion = $this->repository->getNextVersionNumber($slotKey);
                
                // Compute diff from current to restored
                $currentJson = json_encode($currentContent, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: 'null';
                $diffResult = $this->diffEngine->computeDiff($currentJson, $restoredJson);
                
                if (!$diffResult['success']) {
                    throw new \RuntimeException('Diff computation failed: ' . ($diffResult['error'] ?? 'unknown'));
                }
                
                // Compress diffs
                $diffForwardJson = json_encode($diffResult['diff_forward']);
                $diffBackwardJson = json_encode($diffResult['diff_backward']);
                $compressedForward = $this->compression->compress($diffForwardJson);
                $compressedBackward = $this->compression->compress($diffBackwardJson);
                
                // Determine if snapshot needed
                $isSnapshot = ($nextVersion % self::SNAPSHOT_INTERVAL === 0) ? 1 : 0;
                $compressedSnapshot = null;
                if ($isSnapshot) {
                    $snapshotResult = $this->compression->compress($restoredJson);
                    $compressedSnapshot = $snapshotResult['data'];
                }
                
                // Calculate HMAC
                $dataToSign = $slotKey . $nextVersion . $diffResult['content_hash'];
                $hmacSignature = hash_hmac('sha256', $dataToSign, VersionRepository::getHmacSecret());
                
                // Insert version record
                $stmt = $this->db->prepare("
                    INSERT INTO slot_versions (
                        slot_key, version_number, 
                        diff_forward, diff_backward, diff_size, is_compressed,
                        is_snapshot, snapshot_data,
                        snapshot_hash, content_size, hmac_signature,
                        change_summary, changed_by, changed_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                ");
                
                $changeSummary = "⟲ Restored from v{$targetVersion}";
                
                $stmt->execute([
                    $slotKey,
                    $nextVersion,
                    $compressedForward['data'],
                    $compressedBackward['data'],
                    strlen($diffForwardJson),
                    $compressedForward['is_compressed'] ? 1 : 0,
                    $isSnapshot,
                    $compressedSnapshot,
                    $diffResult['content_hash'],
                    strlen($restoredJson),
                    $hmacSignature,
                    $changeSummary,
                    $restoredBy ?? 'system'
                ]);
                
                // Enforce version limit
                $this->snapshotManager->enforceVersionLimit($slotKey);
                
                $this->db->commit();
                
                LoggerService::info('VersionRestorer: Atomic restore completed', [
                    'slot_key' => $slotKey,
                    'target_version' => $targetVersion,
                    'new_version' => $nextVersion
                ]);
                
                return [
                    'success' => true,
                    'content' => $restoredContent,
                    'restored_version' => $targetVersion,
                    'new_version' => $nextVersion,
                    'strategy' => $reconstructResult['strategy'] ?? 'hybrid'
                ];
                
            } catch (Exception $e) {
                $this->db->rollBack();
                throw $e;
            }
            
        } catch (Exception $e) {
            LoggerService::error('VersionRestorer: Atomic restore failed', [
                'slot_key' => $slotKey,
                'target_version' => $targetVersion,
                'error' => $e->getMessage()
            ]);
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
    
    /**
     * Legacy restore method - kept for backward compatibility
     * @deprecated Use atomicRestore() for database-level restore with transaction
     */
    public function restoreToVersion(
        string $slotKey, 
        int $targetVersion, 
        mixed $currentContent
    ): array {
        try {
            if ($targetVersion < 1) {
                return ['success' => false, 'error' => 'Invalid version number'];
            }
            
            if (!$this->repository->versionExists($slotKey, $targetVersion)) {
                return ['success' => false, 'error' => 'Version not found'];
            }
            
            $maxVersion = $this->repository->getMaxVersionNumber($slotKey);
            
            if ($targetVersion === $maxVersion) {
                return ['success' => true, 'content' => $currentContent, 'strategy' => 'current'];
            }
            
            // Use SnapshotManager for reconstruction
            return $this->snapshotManager->reconstructVersion($slotKey, $targetVersion);
            
        } catch (Exception $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
}
