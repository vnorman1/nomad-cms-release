<?php
/**
 * NOMAD CMS - Version Creator
 * 
 * Handles version creation logic with WASM precomputation support.
 * Extracted from VersioningService for modularity.
 */

declare(strict_types=1);

namespace NomadCMS\Services\Versioning;

use NomadCMS\Services\LoggerService;
use PDO;
use Exception;

class VersionCreator
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
     * Normalize JSON for consistent comparison
     * Sorts array keys recursively to ensure {a:1,b:2} equals {b:2,a:1}
     */
    public static function normalizeJson(mixed $content): string|false
    {
        $normalized = self::sortRecursive($content);
        return json_encode($normalized, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
    
    /**
     * Recursively sort arrays by key for consistent serialization
     */
    private static function sortRecursive(mixed $data): mixed
    {
        if (is_array($data)) {
            $isAssoc = array_keys($data) !== range(0, count($data) - 1);
            if ($isAssoc) {
                ksort($data);
            }
            foreach ($data as $key => $value) {
                $data[$key] = self::sortRecursive($value);
            }
        }
        return $data;
    }
    
    /**
     * Create a new version for a slot
     * 
     * @param string $slotKey The slot key
     * @param mixed $oldContent Previous content (JSON-serializable)
     * @param mixed $newContent New content (JSON-serializable)
     * @param string|null $changedBy User identifier
     * @param array|null $precomputed Precomputed version data from WASM
     * @param array $options Version options:
     *   - version_type: 'shadow'|'commit'|'named' (default: 'shadow')
     *   - version_name: string|null (for commit/named)
     *   - debounce: bool (default: true for shadow)
     *   - debounce_window: int (seconds, default: 300)
     * @return array{success: bool, version?: int, error?: string}
     */
    public function createVersion(
        string $slotKey, 
        mixed $oldContent, 
        mixed $newContent,
        ?string $changedBy = null,
        ?array $precomputed = null,
        array $options = []
    ): array {
        if (!$this->settings->isEnabled()) {
            return ['success' => false, 'error' => 'Versioning is disabled'];
        }
        
        // Parse options
        $versionType = $options['version_type'] ?? VersionRepository::TYPE_SHADOW;
        $versionName = $options['version_name'] ?? null;
        $useDebounce = $options['debounce'] ?? ($versionType === VersionRepository::TYPE_SHADOW);
        $debounceWindow = $options['debounce_window'] ?? 300;
        
        try {
            // Convert to JSON strings with sorted keys
            $oldJson = self::normalizeJson($oldContent);
            $newJson = self::normalizeJson($newContent);
            
            if ($oldJson === false || $newJson === false) {
                return ['success' => false, 'error' => 'Failed to encode content as JSON'];
            }
            
            // Skip if content is identical
            if ($oldJson === $newJson) {
                return ['success' => true, 'version' => null, 'skipped' => true];
            }
            
            $oldHash = hash('sha256', $oldJson);
            $newHash = hash('sha256', $newJson);
            if ($oldHash === $newHash) {
                return ['success' => true, 'version' => null, 'skipped' => true];
            }
            
            // Process precomputed or compute diff
            $diffData = $this->processDiffData($oldJson, $newJson, $newHash, $slotKey, $precomputed);
            
            if (!$diffData['success']) {
                return $diffData;
            }
            
            // Handle transaction (support nested via savepoints)
            $isNestedTransaction = $this->db->inTransaction();
            $savepointName = 'version_create_' . uniqid();
            
            if ($isNestedTransaction) {
                $this->db->exec("SAVEPOINT {$savepointName}");
            } else {
                $this->db->beginTransaction();
            }
            
            try {
                // Check debounce for shadow versions
                $debounceVersionId = null;
                if ($useDebounce && $versionType === VersionRepository::TYPE_SHADOW) {
                    $debounceVersionId = $this->repository->checkDebounce($slotKey, $debounceWindow);
                }
                
                if ($debounceVersionId !== null) {
                    // Update existing shadow version instead of creating new
                    $result = $this->updateExistingShadowVersion(
                        $debounceVersionId, $slotKey, $diffData, $changedBy, $newJson, $oldJson
                    );
                } else {
                    // Insert new version record
                    $result = $this->insertVersionRecord(
                        $slotKey, $diffData, $changedBy, $newJson, $versionType, $versionName
                    );
                }
                
                // Enforce version limit
                $this->snapshotManager->enforceVersionLimit($slotKey);
                
                if ($isNestedTransaction) {
                    $this->db->exec("RELEASE SAVEPOINT {$savepointName}");
                } else {
                    $this->db->commit();
                }
                
                return $result;
                
            } catch (Exception $e) {
                if ($isNestedTransaction) {
                    $this->db->exec("ROLLBACK TO SAVEPOINT {$savepointName}");
                } else {
                    $this->db->rollBack();
                }
                throw $e;
            }
            
        } catch (Exception $e) {
            LoggerService::error('VersionCreator: Version creation failed', [
                'slot_key' => $slotKey,
                'error' => $e->getMessage()
            ]);
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
    
    /**
     * Process diff data from precomputed or compute server-side
     */
    private function processDiffData(
        string $oldJson, 
        string $newJson, 
        string $newHash, 
        string $slotKey,
        ?array $precomputed
    ): array {
        $usePrecomputed = false;
        $diffForwardData = null;
        $diffSize = 0;
        $changeSummary = '';
        $contentHash = $newHash;
        $isCompressed = false;
        
        // Try to use precomputed data with Apply & Verify security
        if ($precomputed !== null && 
            isset($precomputed['content_hash']) && 
            isset($precomputed['diff_forward_b64'])) {
            
            try {
                $rawDiffData = base64_decode($precomputed['diff_forward_b64'], true);
                if ($rawDiffData === false) {
                    throw new Exception('Invalid base64 encoding');
                }
                
                $preIsCompressed = (bool) ($precomputed['is_compressed'] ?? false);
                
                // DEBUG: Log decompression attempt
                LoggerService::debug('VersionCreator: Decompression attempt', [
                    'slot_key' => $slotKey,
                    'is_compressed' => $preIsCompressed,
                    'raw_data_len' => strlen($rawDiffData),
                    'raw_data_hex_start' => bin2hex(substr($rawDiffData, 0, 16)),
                    'is_nomad_lz4' => $this->compression->isNomadLz4Format($rawDiffData),
                ]);
                
                $diffJson = $preIsCompressed 
                    ? $this->compression->decompress($rawDiffData, true)
                    : $rawDiffData;
                
                // DEBUG: Log decompression result
                LoggerService::debug('VersionCreator: Decompression result', [
                    'slot_key' => $slotKey,
                    'diff_json_len' => strlen($diffJson),
                    'diff_json_sample' => substr($diffJson, 0, 200),
                    'looks_like_json' => str_starts_with(trim($diffJson), '[') || str_starts_with(trim($diffJson), '{'),
                ]);
                
                $diffPatch = json_decode($diffJson, true);
                if ($diffPatch === null && json_last_error() !== JSON_ERROR_NONE) {
                    // Log detailed JSON error for debugging
                    LoggerService::error('VersionCreator: JSON decode failed', [
                        'slot_key' => $slotKey,
                        'json_error' => json_last_error_msg(),
                        'json_error_code' => json_last_error(),
                        'diff_json_len' => strlen($diffJson),
                        'diff_json_sample' => substr($diffJson, 0, 500),
                        'diff_json_hex_start' => bin2hex(substr($diffJson, 0, 32)),
                        'is_compressed' => $preIsCompressed,
                        'raw_was_nomad_lz4' => $this->compression->isNomadLz4Format($rawDiffData),
                    ]);
                    throw new Exception('Invalid JSON in diff');
                }
                
                // DEBUG: Log received diff operations and old content
                LoggerService::warning('VersionCreator: DEBUG - Precomputed diff received', [
                    'slot_key' => $slotKey,
                    'diff_ops_count' => count($diffPatch),
                    'diff_ops' => array_slice($diffPatch, 0, 5), // First 5 ops
                    'old_json_sample' => substr($oldJson, 0, 200),
                    'new_json_sample' => substr($newJson, 0, 200),
                    'old_hash' => substr(hash('sha256', $oldJson), 0, 16),
                    'new_hash_expected' => substr($newHash, 0, 16),
                ]);
                
                // APPLY & VERIFY: Apply diff to OLD content and verify result
                $applyResult = $this->diffEngine->applyPatch($oldJson, $diffPatch);
                if (!$applyResult['success']) {
                    throw new Exception('Apply patch failed: ' . ($applyResult['error'] ?? 'unknown'));
                }
                
                $appliedJson = self::normalizeJson($applyResult['data']);
                if ($appliedJson === false) {
                    throw new Exception('Failed to normalize applied result');
                }
                
                $appliedHash = hash('sha256', $appliedJson);
                
                if (!hash_equals($appliedHash, $newHash)) {
                    LoggerService::warning('VersionCreator: APPLY & VERIFY FAILED - HASH MISMATCH', [
                        'slot_key' => $slotKey,
                        'applied_hash' => $appliedHash,
                        'expected_hash' => $newHash,
                        'applied_json_sample' => substr($appliedJson, 0, 200),
                        'new_json_sample' => substr($newJson, 0, 200),
                        'applied_len' => strlen($appliedJson),
                        'new_len' => strlen($newJson),
                    ]);
                    throw new Exception('Diff verification failed');
                }
                
                $diffForwardData = $rawDiffData;
                $usePrecomputed = true;
                $diffSize = (int) ($precomputed['diff_size'] ?? strlen($diffJson));
                $changeSummary = $precomputed['change_summary'] ?? 'Modified content';
                $isCompressed = $preIsCompressed;
                
                LoggerService::info('VersionCreator: WASM precomputed diff verified', [
                    'slot_key' => $slotKey,
                    'diff_size' => $diffSize
                ]);
                
            } catch (Exception $e) {
                LoggerService::debug('VersionCreator: Precomputed diff rejected', [
                    'slot_key' => $slotKey,
                    'error' => $e->getMessage()
                ]);
                $usePrecomputed = false;
            }
        }
        
        // Compute diffs server-side if not using precomputed
        if (!$usePrecomputed) {
            $diffResult = $this->diffEngine->computeDiff($oldJson, $newJson);
            
            if (!$diffResult['success']) {
                return ['success' => false, 'error' => $diffResult['error'] ?? 'Diff computation failed'];
            }
            
            if (empty($diffResult['diff_forward'])) {
                return ['success' => true, 'version' => null, 'skipped' => true, 'reason' => 'empty_diff'];
            }
            
            $contentHash = $diffResult['content_hash'];
            $changeSummary = $diffResult['change_summary'];
            $diffForwardJson = json_encode($diffResult['diff_forward']);
            $compressedForward = $this->compression->compress($diffForwardJson);
            $diffForwardData = $compressedForward['data'];
            $diffSize = strlen($diffForwardJson);
            $isCompressed = $compressedForward['is_compressed'];
        }
        
        return [
            'success' => true,
            'diff_forward_data' => $diffForwardData,
            'diff_size' => $diffSize,
            'is_compressed' => $isCompressed,
            'content_hash' => $contentHash,
            'change_summary' => $changeSummary,
            'precomputed' => $usePrecomputed
        ];
    }
    
    /**
     * Insert version record into database
     */
    private function insertVersionRecord(
        string $slotKey, 
        array $diffData, 
        ?string $changedBy,
        string $newJson,
        string $versionType = VersionRepository::TYPE_SHADOW,
        ?string $versionName = null
    ): array {
        $nextVersion = $this->repository->getNextVersionNumber($slotKey);
        
        // Empty backward diff - computed on-demand
        $emptyBackward = $this->compression->compress('[]');
        
        // Determine if snapshot needed
        $isSnapshot = ($nextVersion === 1 || $nextVersion % self::SNAPSHOT_INTERVAL === 0) ? 1 : 0;
        $compressedSnapshot = null;
        
        if ($isSnapshot) {
            $snapshotResult = $this->compression->compress($newJson);
            $compressedSnapshot = $snapshotResult['data'];
        }
        
        // Calculate HMAC
        $dataToSign = $slotKey . $nextVersion . $diffData['content_hash'];
        $hmacSignature = hash_hmac('sha256', $dataToSign, VersionRepository::getHmacSecret());
        
        // Calculate expires_at for shadow versions
        $expiresAt = ($versionType === VersionRepository::TYPE_SHADOW) 
            ? VersionRepository::calculateExpiresAt() 
            : null;
        
        // Use repository's insertVersion method
        $this->repository->insertVersion([
            'slot_key' => $slotKey,
            'version_number' => $nextVersion,
            'diff_forward' => $diffData['diff_forward_data'],
            'diff_backward' => $emptyBackward['data'],
            'diff_size' => $diffData['diff_size'],
            'is_compressed' => $diffData['is_compressed'] ? 1 : 0,
            'is_snapshot' => $isSnapshot,
            'snapshot_data' => $compressedSnapshot,
            'snapshot_hash' => $diffData['content_hash'],
            'content_size' => strlen($newJson),
            'hmac_signature' => $hmacSignature,
            'change_summary' => $diffData['change_summary'],
            'changed_by' => $changedBy,
            'version_type' => $versionType,
            'version_name' => $versionName,
            'expires_at' => $expiresAt
        ]);
        
        return [
            'success' => true,
            'version' => $nextVersion,
            'hash' => $diffData['content_hash'],
            'diff_size' => $diffData['diff_size'],
            'compressed_size' => strlen($diffData['diff_forward_data']),
            'change_summary' => $diffData['change_summary'],
            'precomputed' => $diffData['precomputed'],
            'version_type' => $versionType,
            'expires_at' => $expiresAt
        ];
    }
    
    /**
     * Update existing shadow version (for debounce)
     * Instead of creating new version, updates existing within debounce window
     * 
     * CRITICAL: Must recompute diff from the ORIGINAL base version, not the current diff!
     * Example: If v1 was A→B and we debounce to A→C, we need full A→C diff, not B→C
     */
    private function updateExistingShadowVersion(
        int $versionId,
        string $slotKey,
        array $diffData,
        ?string $changedBy,
        string $newJson,
        string $oldJson
    ): array {
        // Get the original version to determine its base content
        $existingVersion = $this->repository->getVersionById($versionId);
        if (!$existingVersion) {
            // Fallback to creating new version
            return $this->insertVersionRecord($slotKey, $diffData, $changedBy, $newJson);
        }
        
        // CRITICAL FIX: Reconstruct what the OLD content was when this version was created
        // This is the content BEFORE this shadow version's diff was applied
        // We need to find the previous version's content (or initial state if v1)
        $versionNumber = (int) $existingVersion['version_number'];
        $originalBaseJson = 'null';
        
        if ($versionNumber > 1) {
            // Get the content at the previous version
            $prevReconstructResult = $this->snapshotManager->reconstructVersion($slotKey, $versionNumber - 1);
            if ($prevReconstructResult['success'] && isset($prevReconstructResult['content'])) {
                $originalBaseJson = json_encode($prevReconstructResult['content'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            } else {
                LoggerService::warning('VersionCreator: Could not reconstruct previous version for debounce', [
                    'slot_key' => $slotKey,
                    'version' => $versionNumber,
                ]);
                // Fallback: use passed oldJson (may cause chain inconsistency but better than failing)
                $originalBaseJson = $oldJson;
            }
        }
        
        // Recompute diff from ORIGINAL base to NEW content (not current old to new)
        $recomputedDiff = $this->diffEngine->computeDiff($originalBaseJson, $newJson);
        
        if (!$recomputedDiff['success']) {
            LoggerService::warning('VersionCreator: Diff recomputation failed for debounce', [
                'slot_key' => $slotKey,
                'error' => $recomputedDiff['error'] ?? 'unknown',
            ]);
            // Fallback to creating new version instead of corrupting the chain
            return $this->insertVersionRecord($slotKey, $diffData, $changedBy, $newJson);
        }
        
        // Compress the recomputed diff
        $recomputedDiffJson = json_encode($recomputedDiff['diff_forward']);
        $compressedForward = $this->compression->compress($recomputedDiffJson);
        
        // Empty backward diff - computed on-demand
        $emptyBackward = $this->compression->compress('[]');
        
        // CRITICAL: Update snapshot_data if this version is a snapshot (e.g., v1)
        // This prevents stale snapshots after debounce
        $snapshotData = null;
        if ($existingVersion['is_snapshot']) {
            $snapshotResult = $this->compression->compress($newJson);
            $snapshotData = $snapshotResult['data'];
        }
        
        // Calculate HMAC with the new content hash
        $dataToSign = $slotKey . $versionNumber . $recomputedDiff['content_hash'];
        $hmacSignature = hash_hmac('sha256', $dataToSign, VersionRepository::getHmacSecret());
        
        // Update the shadow version with the CORRECT diff
        // Also updates snapshot_data if this was a snapshot version
        $updated = $this->repository->updateShadowVersion($versionId, [
            'diff_forward' => $compressedForward['data'],
            'diff_backward' => $emptyBackward['data'],
            'diff_size' => strlen($recomputedDiffJson),
            'is_compressed' => $compressedForward['is_compressed'] ? 1 : 0,
            'snapshot_hash' => $recomputedDiff['content_hash'],
            'content_size' => strlen($newJson),
            'hmac_signature' => $hmacSignature,
            'change_summary' => $recomputedDiff['change_summary'],
            'expires_at' => VersionRepository::calculateExpiresAt(),
            'snapshot_data' => $snapshotData // null if not a snapshot
        ]);
        
        if (!$updated) {
            // Fallback to creating new version
            return $this->insertVersionRecord($slotKey, $diffData, $changedBy, $newJson);
        }
        
        LoggerService::debug('VersionCreator: Shadow version debounced with recomputed diff', [
            'slot_key' => $slotKey,
            'version' => $versionNumber,
            'original_base_len' => strlen($originalBaseJson),
            'new_diff_size' => strlen($recomputedDiffJson),
        ]);
        
        return [
            'success' => true,
            'version' => $versionNumber,
            'hash' => $recomputedDiff['content_hash'],
            'diff_size' => strlen($recomputedDiffJson),
            'compressed_size' => strlen($compressedForward['data']),
            'change_summary' => $recomputedDiff['change_summary'],
            'precomputed' => false, // Recomputed on server
            'version_type' => VersionRepository::TYPE_SHADOW,
            'debounced' => true,
            'expires_at' => VersionRepository::calculateExpiresAt()
        ];
    }
}
