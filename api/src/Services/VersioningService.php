<?php
/**
 * NOMAD CMS - Versioning Service (Refactored Facade)
 * Enterprise-grade Git-like Version History with WASM-based Diff Engine
 * 
 * This is a FACADE class that delegates to specialized components:
 * - VersionCreator: Version creation with WASM support
 * - VersionRestorer: Atomic restore operations
 * - SnapshotManager: Snapshot-based reconstruction
 * - VersionRepository: Database operations
 * - DiffEngine: JSON Patch RFC 6902 implementation
 * - CompressionService: LZ4/gzip compression
 * - VersioningSettings: Configuration management
 * 
 * Features:
 * - Delta diff storage (80-95% size savings)
 * - LZ4 compression for additional savings
 * - HMAC-SHA256 integrity verification
 * - Bidirectional diffs (forward + backward for rollback)
 * - Lazy loading support for large histories
 * - Race condition prevention with optimistic locking
 * 
 * Storage: slot_versions table in database.sqlite (via ContentDatabase)
 * 
 * @see content-versioning-implementation.md
 */

declare(strict_types=1);

namespace NomadCMS\Services;

use NomadCMS\Database\ContentDatabase;
use NomadCMS\Services\Versioning\CompressionService;
use NomadCMS\Services\Versioning\DiffEngine;
use NomadCMS\Services\Versioning\SnapshotManager;
use NomadCMS\Services\Versioning\VersionCreator;
use NomadCMS\Services\Versioning\VersioningSettings;
use NomadCMS\Services\Versioning\VersionRepository;
use NomadCMS\Services\Versioning\VersionRestorer;
use PDO;
use Exception;

final class VersioningService
{
    /** Singleton instance */
    private static ?self $instance = null;
    
    /** Database instance */
    private PDO $db;
    
    /** Component instances */
    private CompressionService $compression;
    private DiffEngine $diffEngine;
    private VersioningSettings $settings;
    private VersionRepository $repository;
    private SnapshotManager $snapshotManager;
    private VersionCreator $versionCreator;
    private VersionRestorer $versionRestorer;
    
    /**
     * Private constructor for singleton
     */
    /**
     * Constructor with dependency injection support
     */
    public function __construct(?PDO $db = null)
    {
        $this->db = $db ?? ContentDatabase::getInstance();
        $this->initializeComponents();
        $this->initializeSchema();
    }
    
    /**
     * Initialize all component instances
     */
    private function initializeComponents(): void
    {
        // Core services (no dependencies)
        $this->compression = new CompressionService();
        $this->diffEngine = new DiffEngine();
        $this->settings = new VersioningSettings($this->db);
        
        // Repository (depends on compression, diffEngine)
        $this->repository = new VersionRepository($this->db, $this->compression, $this->diffEngine);
        
        // SnapshotManager (depends on repository, settings, compression, diffEngine)
        $this->snapshotManager = new SnapshotManager(
            $this->db,
            $this->compression,
            $this->diffEngine,
            $this->repository,
            $this->settings
        );
        
        // VersionCreator (depends on all services)
        $this->versionCreator = new VersionCreator(
            $this->db,
            $this->compression,
            $this->diffEngine,
            $this->repository,
            $this->settings,
            $this->snapshotManager
        );
        
        // VersionRestorer (depends on all services)
        $this->versionRestorer = new VersionRestorer(
            $this->db,
            $this->compression,
            $this->diffEngine,
            $this->repository,
            $this->settings,
            $this->snapshotManager
        );
    }
    
    /**
     * Get singleton instance
     */
    public static function getInstance(): self
    {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    /**
     * Initialize versioning schema
     */
    private function initializeSchema(): void
    {
        // Create slot_versions table with snapshot support
        $this->db->exec("
            CREATE TABLE IF NOT EXISTS slot_versions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                slot_key TEXT NOT NULL,
                version_number INTEGER NOT NULL,
                
                diff_forward BLOB NOT NULL,
                diff_backward BLOB NOT NULL,
                diff_size INTEGER NOT NULL,
                is_compressed INTEGER DEFAULT 1,
                
                is_snapshot INTEGER DEFAULT 0,
                snapshot_data BLOB,
                
                snapshot_hash TEXT NOT NULL,
                content_size INTEGER NOT NULL,
                hmac_signature TEXT NOT NULL,
                
                change_summary TEXT,
                changed_by TEXT,
                changed_at TEXT DEFAULT (datetime('now')),
                
                UNIQUE(slot_key, version_number)
            )
        ");
        
        // Migration for existing tables
        try {
            $this->db->exec("ALTER TABLE slot_versions ADD COLUMN is_snapshot INTEGER DEFAULT 0");
        } catch (Exception $e) {}
        try {
            $this->db->exec("ALTER TABLE slot_versions ADD COLUMN snapshot_data BLOB");
        } catch (Exception $e) {}
        
        // HYBRID VERSIONING: Add version_type, version_name, expires_at columns
        try {
            $this->db->exec("ALTER TABLE slot_versions ADD COLUMN version_type TEXT DEFAULT 'shadow'");
        } catch (Exception $e) {}
        try {
            $this->db->exec("ALTER TABLE slot_versions ADD COLUMN version_name TEXT DEFAULT NULL");
        } catch (Exception $e) {}
        try {
            $this->db->exec("ALTER TABLE slot_versions ADD COLUMN expires_at TEXT DEFAULT NULL");
        } catch (Exception $e) {}
        
        // Create indexes
        $this->db->exec("CREATE INDEX IF NOT EXISTS idx_sv_slot_key ON slot_versions(slot_key)");
        $this->db->exec("CREATE INDEX IF NOT EXISTS idx_sv_changed_at ON slot_versions(changed_at)");
        $this->db->exec("CREATE INDEX IF NOT EXISTS idx_sv_slot_version ON slot_versions(slot_key, version_number DESC)");
        $this->db->exec("CREATE INDEX IF NOT EXISTS idx_sv_snapshots ON slot_versions(slot_key, is_snapshot, version_number)");
        
        // HYBRID VERSIONING: Index for expires_at (TTL queries)
        $this->db->exec("CREATE INDEX IF NOT EXISTS idx_sv_expires ON slot_versions(expires_at)");
        $this->db->exec("CREATE INDEX IF NOT EXISTS idx_sv_version_type ON slot_versions(version_type)");
        
        // Create versioning_settings table
        $this->db->exec("
            CREATE TABLE IF NOT EXISTS versioning_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT DEFAULT (datetime('now'))
            )
        ");
        
        // Initialize default settings
        $this->settings->initializeDefaults();
    }
    
    // =========================================================================
    // SETTINGS (Delegated to VersioningSettings)
    // =========================================================================
    
    public function isEnabled(): bool
    {
        return $this->settings->isEnabled();
    }
    
    public function getSetting(string $key): ?string
    {
        return $this->settings->get($key);
    }
    
    public function setSetting(string $key, string $value): bool
    {
        return $this->settings->set($key, $value);
    }
    
    public function getAllSettings(): array
    {
        return $this->settings->getAll();
    }
    
    // =========================================================================
    // VERSION CREATION (Delegated to VersionCreator)
    // =========================================================================
    
    /**
     * Create a new version for a slot
     * @param array $options Version options: version_type, version_name, debounce, debounce_window
     */
    public function createVersion(
        string $slotKey, 
        mixed $oldContent, 
        mixed $newContent,
        ?string $changedBy = null,
        ?array $precomputed = null,
        array $options = []
    ): array {
        return $this->versionCreator->createVersion(
            $slotKey, 
            $oldContent, 
            $newContent, 
            $changedBy, 
            $precomputed,
            $options
        );
    }
    
    // =========================================================================
    // VERSION RETRIEVAL (Delegated to VersionRepository)
    // =========================================================================
    
    public function getVersionHistory(
        string $slotKey, 
        int $limit = 20, 
        int $offset = 0,
        bool $includeShadows = false,
        bool $includeExpired = false
    ): array {
        return $this->repository->getVersionHistory($slotKey, $limit, $offset, $includeShadows, $includeExpired);
    }
    
    public function getVersionCount(string $slotKey, bool $includeShadows = false, bool $includeExpired = false): int
    {
        return $this->repository->getVersionCount($slotKey, $includeShadows, $includeExpired);
    }
    
    public function getMaxVersionNumber(string $slotKey): int
    {
        return $this->repository->getMaxVersionNumber($slotKey);
    }
    
    public function versionExists(string $slotKey, int $versionNumber): bool
    {
        return $this->repository->versionExists($slotKey, $versionNumber);
    }
    
    public function findVersionByHash(string $slotKey, string $contentHash): ?array
    {
        return $this->repository->findVersionByHash($slotKey, $contentHash);
    }
    
    public function getVersion(string $slotKey, int $versionNumber): ?array
    {
        return $this->repository->getVersion($slotKey, $versionNumber);
    }
    
    // =========================================================================
    // VERSION RESTORATION (Delegated to VersionRestorer/SnapshotManager)
    // =========================================================================
    
    /**
     * ATOMIC RESTORE: Restore content with full ACID guarantees
     */
    public function atomicRestore(
        string $slotKey,
        int $targetVersion,
        ?string $restoredBy = null
    ): array {
        return $this->versionRestorer->atomicRestore($slotKey, $targetVersion, $restoredBy);
    }
    
    /**
     * Reconstruct version content (read-only, no persistence)
     */
    public function reconstructVersion(string $slotKey, int $targetVersion): array
    {
        return $this->snapshotManager->reconstructVersion($slotKey, $targetVersion);
    }
    
    /**
     * Legacy restore method
     * @deprecated Use atomicRestore() for database-level restore with transaction
     */
    public function restoreToVersion(
        string $slotKey, 
        int $targetVersion, 
        mixed $currentContent
    ): array {
        return $this->versionRestorer->restoreToVersion($slotKey, $targetVersion, $currentContent);
    }
    
    // =========================================================================
    // DIFF COMPUTATION (Delegated to DiffEngine)
    // =========================================================================
    
    public function computeDiff(string $oldJson, string $newJson): array
    {
        return $this->diffEngine->computeDiff($oldJson, $newJson);
    }
    
    public function applyPatch(string $baseJson, array $patch): array
    {
        return $this->diffEngine->applyPatch($baseJson, $patch);
    }
    
    // =========================================================================
    // CLEANUP & MAINTENANCE (Delegated to SnapshotManager/VersionRepository)
    // =========================================================================
    
    public function cleanupOldVersions(): array
    {
        return $this->snapshotManager->cleanupOldVersions();
    }
    
    public function deleteAllVersions(string $slotKey): bool
    {
        return $this->repository->deleteAllVersions($slotKey);
    }
    
    public function getStorageStats(): array
    {
        return $this->repository->getStorageStats();
    }
    
    // =========================================================================
    // HYBRID VERSIONING - Shadow/Commit/Named Operations
    // =========================================================================
    
    /**
     * Create a commit version (permanent, visible in history)
     */
    public function createCommitVersion(
        string $slotKey,
        mixed $oldContent,
        mixed $newContent,
        ?string $changedBy = null,
        ?string $name = null,
        ?array $precomputed = null
    ): array {
        return $this->versionCreator->createVersion(
            $slotKey, $oldContent, $newContent, $changedBy, $precomputed,
            [
                'version_type' => VersionRepository::TYPE_COMMIT,
                'version_name' => $name,
                'debounce' => false
            ]
        );
    }
    
    /**
     * Create a named version (protected, requires confirmation to delete)
     */
    public function createNamedVersion(
        string $slotKey,
        mixed $oldContent,
        mixed $newContent,
        string $name,
        ?string $changedBy = null,
        ?array $precomputed = null
    ): array {
        return $this->versionCreator->createVersion(
            $slotKey, $oldContent, $newContent, $changedBy, $precomputed,
            [
                'version_type' => VersionRepository::TYPE_NAMED,
                'version_name' => $name,
                'debounce' => false
            ]
        );
    }
    
    /**
     * Promote a shadow version to commit or named
     */
    public function promoteVersion(int $versionId, string $targetType = VersionRepository::TYPE_COMMIT, ?string $name = null): array
    {
        return $this->repository->promoteVersion($versionId, $targetType, $name);
    }
    
    /**
     * Delete a specific version (with safety checks)
     */
    public function deleteVersion(int $versionId, bool $forceNamedDelete = false): array
    {
        return $this->repository->deleteVersion($versionId, $forceNamedDelete);
    }
    
    /**
     * Rename a version
     */
    public function renameVersion(int $versionId, string $name): array
    {
        return $this->repository->renameVersion($versionId, $name);
    }
    
    /**
     * Get version by ID
     */
    public function getVersionById(int $versionId): ?array
    {
        return $this->repository->getVersionById($versionId);
    }
    
    /**
     * Trigger lazy cleanup of expired shadow versions
     */
    public function cleanupExpiredShadows(?string $slotKey = null): int
    {
        return $this->repository->lazyCleanupExpiredShadows($slotKey);
    }
    
    // =========================================================================
    // COMPONENT ACCESS (For advanced usage)
    // =========================================================================
    
    public function getCompression(): CompressionService
    {
        return $this->compression;
    }
    
    public function getDiffEngine(): DiffEngine
    {
        return $this->diffEngine;
    }
    
    public function getSettings(): VersioningSettings
    {
        return $this->settings;
    }
    
    public function getRepository(): VersionRepository
    {
        return $this->repository;
    }
    
    public function getSnapshotManager(): SnapshotManager
    {
        return $this->snapshotManager;
    }
    
    public function getVersionCreator(): VersionCreator
    {
        return $this->versionCreator;
    }
    
    public function getVersionRestorer(): VersionRestorer
    {
        return $this->versionRestorer;
    }
}
