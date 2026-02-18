<?php
/**
 * NOMAD CMS - Delta Update Service
 * 
 * Intelligent update system that downloads only changed files:
 * - Manifest-based file tracking with SHA-256 hashes
 * - Atomic apply with rollback capability
 * - Protected paths (databases, uploads, keys, etc.)
 * 
 * Optimized for patch/minor updates where changes are small.
 */

declare(strict_types=1);

namespace NomadCMS\Services;

use RuntimeException;

final class DeltaUpdateService
{
    private const LOCAL_MANIFEST = __DIR__ . '/../../manifest.json';
    private const TEMP_DIR = __DIR__ . '/../../temp/delta-update';
    private const BACKUP_DIR = __DIR__ . '/../../backups/updates';

    /**
     * Protected paths that should never be updated/deleted
     * These are installation-specific or contain user data
     */
    private const PROTECTED_PATHS = [
        // Environment & Config
        '.env',
        '.env.local',
        '.env.production',
        'nomad-install.lock',
        
        // Installation-specific schema (different for each site)
        'api/data/nomad.schema.json',
        'nomad.schema.json',
        
        // User data directories
        'databases/',
        'uploads/',
        'files/',
        
        // Security
        'keys/',
        
        // Runtime & Cache
        'logs/',
        'backups/',
        'temp/',
        'storage/',
        'cache/',
        
        // Dependencies (managed by composer/npm)
        'vendor/',
        'node_modules/',
    ];

    private SecurityValidator $security;
    private UpdateDownloader $downloader;
    private string $basePath;

    public function __construct(
        ?SecurityValidator $security = null,
        ?UpdateDownloader $downloader = null,
        ?string $basePath = null
    ) {
        $this->security = $security ?? new SecurityValidator();
        $this->downloader = $downloader ?? new UpdateDownloader();
        $this->basePath = $basePath ?? dirname(__DIR__, 2);
    }

    /**
     * Build local manifest from current files
     * 
     * @return array Manifest structure
     */
    public function buildLocalManifest(): array
    {
        $manifest = [
            'version' => $this->getCurrentVersion(),
            'build_date' => date('c'),
            'files' => [],
        ];

        $directory = new \RecursiveDirectoryIterator($this->basePath, \FilesystemIterator::SKIP_DOTS);
        
        // Filter out protected directories early to avoid traversing vendor/, node_modules/, etc.
        $filter = new \RecursiveCallbackFilterIterator($directory, function ($current, $key, $iterator) {
            if ($current->isDir()) {
                $relativePath = $this->getRelativePath($current->getPathname()) . '/';
                if ($this->isProtected($relativePath)) {
                    return false; // Skip entire directory tree
                }
            }
            return true;
        });
        
        $iterator = new \RecursiveIteratorIterator($filter);

        foreach ($iterator as $file) {
            if ($file->isDir()) {
                continue;
            }

            $relativePath = $this->getRelativePath($file->getPathname());

            // Skip protected files (non-directory paths like .env)
            if ($this->isProtected($relativePath)) {
                continue;
            }

            $manifest['files'][$relativePath] = [
                'hash' => hash_file('sha256', $file->getPathname()),
                'size' => $file->getSize(),
                'modified' => date('c', $file->getMTime()),
            ];
        }

        return $manifest;
    }

    /**
     * Compare local and remote manifests
     * 
     * @param array $local Local manifest
     * @param array $remote Remote manifest
     * @return array Delta information
     */
    public function compareManifests(array $local, array $remote): array
    {
        $delta = [
            'added' => [],
            'modified' => [],
            'deleted' => [],
            'unchanged' => 0,
            'from_version' => $local['version'] ?? 'unknown',
            'to_version' => $remote['version'] ?? 'unknown',
        ];

        $localFiles = $local['files'] ?? [];
        $remoteFiles = $remote['files'] ?? [];

        // Find added and modified files
        foreach ($remoteFiles as $path => $info) {
            // Skip protected paths in remote manifest too
            if ($this->isProtected($path)) {
                continue;
            }

            if (!isset($localFiles[$path])) {
                $delta['added'][] = $path;
            } elseif ($localFiles[$path]['hash'] !== $info['hash']) {
                $delta['modified'][] = $path;
            } else {
                $delta['unchanged']++;
            }
        }

        // Find deleted files
        foreach ($localFiles as $path => $info) {
            if (!isset($remoteFiles[$path]) && !$this->isProtected($path)) {
                $delta['deleted'][] = $path;
            }
        }

        // Also include explicitly deleted files from manifest
        foreach ($remote['deleted'] ?? [] as $path) {
            if (!in_array($path, $delta['deleted']) && !$this->isProtected($path)) {
                $delta['deleted'][] = $path;
            }
        }

        return $delta;
    }

    /**
     * Calculate total download size for delta
     * 
     * @param array $delta Delta information
     * @param array $remoteManifest Remote manifest
     * @return int Size in bytes
     */
    public function calculateDeltaSize(array $delta, array $remoteManifest): int
    {
        $size = 0;
        $files = $remoteManifest['files'] ?? [];

        foreach (array_merge($delta['added'], $delta['modified']) as $path) {
            $size += $files[$path]['size'] ?? 0;
        }

        return $size;
    }

    /**
     * Check for available updates
     * 
     * @param string $targetVersion Version to update to
     * @return array Update information
     */
    public function checkForUpdates(string $targetVersion): array
    {
        // Normalize version tag
        $versionTag = str_starts_with($targetVersion, 'v') ? $targetVersion : "v{$targetVersion}";
        
        // Download remote manifest
        $manifestResult = $this->downloader->download('manifest.json', $versionTag);

        if (!$manifestResult->success) {
            return [
                'available' => false,
                'error' => $manifestResult->getErrorMessage(),
            ];
        }

        $remoteManifest = json_decode($manifestResult->content, true);

        if (json_last_error() !== JSON_ERROR_NONE) {
            return [
                'available' => false,
                'error' => 'Invalid manifest JSON',
            ];
        }

        // Validate manifest paths
        $invalidPaths = $this->security->validateManifestPaths($remoteManifest);
        if (!empty($invalidPaths)) {
            return [
                'available' => false,
                'error' => 'Manifest contains invalid paths: ' . implode(', ', $invalidPaths),
            ];
        }

        // Get local manifest
        $localManifest = $this->getLocalManifest();

        // Compare
        $delta = $this->compareManifests($localManifest, $remoteManifest);
        $downloadSize = $this->calculateDeltaSize($delta, $remoteManifest);

        return [
            'available' => true,
            'from_version' => $delta['from_version'],
            'to_version' => $delta['to_version'],
            'delta' => $delta,
            'download_size' => $downloadSize,
            'source' => $manifestResult->source,
        ];
    }

    /**
     * Apply delta update
     * 
     * @param string $targetVersion Version to update to
     * @param array|null $delta Pre-computed delta (optional)
     * @return array Result
     */
    public function applyDelta(string $targetVersion, ?array $delta = null): array
    {
        // Normalize version: ensure "v" prefix for download tags
        $versionTag = str_starts_with($targetVersion, 'v') ? $targetVersion : "v{$targetVersion}";
        // Clean version without prefix for internal use
        $cleanVersion = ltrim($targetVersion, 'v');
        
        $tempDir = self::TEMP_DIR . '/' . $cleanVersion . '_' . time();
        $backupId = 'update_' . date('Ymd_His');

        try {
            // Step 1: Download and verify manifest
            $manifestResult = $this->downloader->download('manifest.json', $versionTag);
            if (!$manifestResult->success) {
                throw new RuntimeException('Failed to download manifest: ' . $manifestResult->getErrorMessage());
            }

            $remoteManifest = json_decode($manifestResult->content, true);
            if (json_last_error() !== JSON_ERROR_NONE) {
                throw new RuntimeException('Invalid manifest JSON');
            }

            // Step 2: Download and verify checksums
            $checksumResult = $this->downloader->download('checksums.sha256', $versionTag);
            if ($checksumResult->success) {
                if (!$this->security->verifyChecksumFile($checksumResult->content, $manifestResult->content)) {
                    throw new RuntimeException('Manifest checksum verification failed');
                }
            }

            // Step 3: Validate paths
            $invalidPaths = $this->security->validateManifestPaths($remoteManifest);
            if (!empty($invalidPaths)) {
                throw new RuntimeException('Invalid paths in manifest: ' . implode(', ', $invalidPaths));
            }

            // Step 4: Compute delta if not provided
            if ($delta === null) {
                $localManifest = $this->getLocalManifest();
                $delta = $this->compareManifests($localManifest, $remoteManifest);
            }

            // Step 5: Create temp directory
            $this->ensureDirectory($tempDir);

            // Step 6: Download files.zip and extract changed files
            $filesToDownload = array_merge($delta['added'], $delta['modified']);
            
            if (!empty($filesToDownload)) {
                // Download the zip package from release assets
                $zipResult = $this->downloader->download('files.zip', $versionTag);
                
                if ($zipResult->success) {
                    // Extract zip to temp directory
                    $zipPath = $tempDir . '/files.zip';
                    file_put_contents($zipPath, $zipResult->content);
                    
                    $zip = new \ZipArchive();
                    if ($zip->open($zipPath) !== true) {
                        throw new RuntimeException('Failed to open update archive');
                    }
                    $zip->extractTo($tempDir . '/extracted');
                    $zip->close();
                    @unlink($zipPath);
                    
                    // Copy needed files from extracted archive and verify hashes
                    // The zip may contain files with a root prefix (e.g., "nomad-cms/")
                    // Auto-detect the prefix by looking for a single root directory
                    $extractedBase = $tempDir . '/extracted';
                    $extractedContents = @scandir($extractedBase);
                    $rootPrefix = '';
                    if ($extractedContents) {
                        $dirs = array_filter(
                            array_diff($extractedContents, ['.', '..']),
                            fn($item) => is_dir($extractedBase . '/' . $item)
                        );
                        // If there's exactly one directory and no files, it's a prefix
                        $files = array_filter(
                            array_diff($extractedContents, ['.', '..']),
                            fn($item) => is_file($extractedBase . '/' . $item)
                        );
                        if (count($dirs) === 1 && count($files) === 0) {
                            $rootPrefix = reset($dirs) . '/';
                        }
                    }
                    
                    foreach ($filesToDownload as $path) {
                        // Try with prefix first, then without
                        $extractedPath = $extractedBase . '/' . $rootPrefix . $path;
                        if (!file_exists($extractedPath)) {
                            $extractedPath = $extractedBase . '/' . $path;
                        }
                        
                        if (!file_exists($extractedPath)) {
                            throw new RuntimeException("File missing from update package: {$path}");
                        }
                        
                        // Verify hash against manifest
                        $expectedHash = $remoteManifest['files'][$path]['hash'] ?? null;
                        if ($expectedHash && !$this->security->verifyFileHashFromPath($extractedPath, $expectedHash)) {
                            throw new RuntimeException("Hash mismatch for: {$path}");
                        }
                        
                        // Move to final temp location
                        $tempPath = $tempDir . '/' . $path;
                        $this->ensureDirectory(dirname($tempPath));
                        rename($extractedPath, $tempPath);
                    }
                    
                    // Cleanup extracted directory
                    $extractedDir = $tempDir . '/extracted';
                    if (is_dir($extractedDir)) {
                        $this->deleteDirectory($extractedDir);
                    }
                } else {
                    // Fallback: try downloading individual files via jsDelivr CDN (raw repo access)
                    foreach ($filesToDownload as $path) {
                        $result = $this->downloader->download($path, $versionTag);
                        if (!$result->success) {
                            throw new RuntimeException("Failed to download: {$path}");
                        }

                        // Verify hash
                        $expectedHash = $remoteManifest['files'][$path]['hash'] ?? null;
                        if ($expectedHash && !$this->security->verifyFileHash($result->content, $expectedHash)) {
                            throw new RuntimeException("Hash mismatch for: {$path}");
                        }

                        // Save to temp
                        $tempPath = $tempDir . '/' . $path;
                        $this->ensureDirectory(dirname($tempPath));
                        file_put_contents($tempPath, $result->content);
                    }
                }
            }

            // Step 7: Create backup of files that will be modified/deleted
            $backup = $this->createBackup(
                array_merge($delta['modified'], $delta['deleted']),
                $backupId
            );

            // Step 8: Apply changes atomically
            $appliedAdded = []; // Track added files for rollback cleanup
            try {
                // Add new files
                foreach ($delta['added'] as $path) {
                    $targetPath = $this->basePath . '/' . $path;
                    $this->ensureDirectory(dirname($targetPath));
                    rename($tempDir . '/' . $path, $targetPath);
                    $appliedAdded[] = $path;
                }

                // Update modified files
                foreach ($delta['modified'] as $path) {
                    $targetPath = $this->basePath . '/' . $path;
                    rename($tempDir . '/' . $path, $targetPath);
                }

                // Delete removed files
                foreach ($delta['deleted'] as $path) {
                    $targetPath = $this->basePath . '/' . $path;
                    if (file_exists($targetPath)) {
                        unlink($targetPath);
                    }
                }

                // Step 9: Update local manifest
                $this->saveLocalManifest($remoteManifest);

                // Step 10: Cleanup
                $this->deleteDirectory($tempDir);

                return [
                    'success' => true,
                    'from_version' => $delta['from_version'],
                    'to_version' => $delta['to_version'],
                    'files_added' => count($delta['added']),
                    'files_modified' => count($delta['modified']),
                    'files_deleted' => count($delta['deleted']),
                    'backup_id' => $backupId,
                ];

            } catch (\Exception $e) {
                // Rollback: restore modified/deleted files from backup
                $this->restoreBackup($backup);
                
                // Cleanup: remove newly added files that shouldn't exist
                foreach ($appliedAdded as $path) {
                    $addedPath = $this->basePath . '/' . $path;
                    if (file_exists($addedPath)) {
                        @unlink($addedPath);
                    }
                }
                
                throw $e;
            }

        } catch (\Exception $e) {
            // Cleanup temp directory
            if (is_dir($tempDir)) {
                $this->deleteDirectory($tempDir);
            }

            return [
                'success' => false,
                'error' => $e->getMessage(),
            ];
        }
    }

    /**
     * Get local manifest
     */
    public function getLocalManifest(): array
    {
        if (file_exists(self::LOCAL_MANIFEST)) {
            $content = file_get_contents(self::LOCAL_MANIFEST);
            $manifest = json_decode($content, true);
            if (json_last_error() === JSON_ERROR_NONE) {
                return $manifest;
            }
        }

        // Build from current files if no manifest exists
        return $this->buildLocalManifest();
    }

    /**
     * Save local manifest
     */
    private function saveLocalManifest(array $manifest): void
    {
        file_put_contents(
            self::LOCAL_MANIFEST,
            json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
        );
    }

    /**
     * Get current version
     */
    private function getCurrentVersion(): string
    {
        // Try to read from manifest first
        if (file_exists(self::LOCAL_MANIFEST)) {
            $manifest = json_decode(file_get_contents(self::LOCAL_MANIFEST), true);
            if (isset($manifest['version'])) {
                // Always strip 'v' prefix for consistent semver comparison
                return ltrim($manifest['version'], 'v');
            }
        }

        // Fallback to VERSION file or default
        $versionFile = $this->basePath . '/VERSION';
        if (file_exists($versionFile)) {
            return ltrim(trim(file_get_contents($versionFile)), 'v');
        }

        return 'unknown';
    }

    /**
     * Check if path is protected
     */
    private function isProtected(string $path): bool
    {
        foreach (self::PROTECTED_PATHS as $protected) {
            if (str_starts_with($path, $protected)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Get relative path from absolute path
     */
    private function getRelativePath(string $absolutePath): string
    {
        return ltrim(substr($absolutePath, strlen($this->basePath)), '/\\');
    }

    /**
     * Ensure directory exists
     */
    private function ensureDirectory(string $path): void
    {
        if (!is_dir($path)) {
            mkdir($path, 0755, true);
        }
    }

    /**
     * Create backup of files
     */
    private function createBackup(array $paths, string $backupId): array
    {
        $backup = [
            'id' => $backupId,
            'created_at' => date('c'),
            'files' => [],
        ];

        $backupDir = self::BACKUP_DIR . '/' . $backupId;
        $this->ensureDirectory($backupDir);

        foreach ($paths as $path) {
            $sourcePath = $this->basePath . '/' . $path;
            if (file_exists($sourcePath)) {
                $backupPath = $backupDir . '/' . $path;
                $this->ensureDirectory(dirname($backupPath));
                copy($sourcePath, $backupPath);
                $backup['files'][] = $path;
            }
        }

        // Save backup manifest
        file_put_contents(
            $backupDir . '/backup.json',
            json_encode($backup, JSON_PRETTY_PRINT)
        );

        return $backup;
    }

    /**
     * Restore backup
     */
    private function restoreBackup(array $backup): void
    {
        $backupDir = self::BACKUP_DIR . '/' . $backup['id'];

        foreach ($backup['files'] as $path) {
            $backupPath = $backupDir . '/' . $path;
            $targetPath = $this->basePath . '/' . $path;

            if (file_exists($backupPath)) {
                $this->ensureDirectory(dirname($targetPath));
                copy($backupPath, $targetPath);
            }
        }
    }

    /**
     * Restore system from a backup by ID
     * 
     * @param string $backupId Backup ID (format: backup_YYYYMMDD_HHMMSS or update_YYYYMMDD_HHMMSS)
     * @return array{success: bool, version?: string, error?: string}
     */
    public function restoreFromBackup(string $backupId): array
    {
        // Validate backup ID to prevent path traversal
        if (!preg_match('/^[a-zA-Z0-9_-]+$/', $backupId)) {
            return [
                'success' => false,
                'error' => 'Invalid backup ID format',
            ];
        }
        
        $backupDir = self::BACKUP_DIR . '/' . $backupId;
        
        // Double-check resolved path stays within BACKUP_DIR
        $realBackupDir = realpath($backupDir);
        $realBaseDir = realpath(self::BACKUP_DIR);
        if ($realBackupDir === false || $realBaseDir === false || !str_starts_with($realBackupDir, $realBaseDir)) {
            return [
                'success' => false,
                'error' => 'Backup not found',
            ];
        }
        
        $backupManifestPath = $backupDir . '/backup.json';
        if (!file_exists($backupManifestPath)) {
            return [
                'success' => false,
                'error' => 'Backup manifest not found',
            ];
        }
        
        $backup = json_decode(file_get_contents($backupManifestPath), true);
        if (!is_array($backup) || empty($backup['files'])) {
            return [
                'success' => false,
                'error' => 'Invalid or empty backup manifest',
            ];
        }
        
        try {
            $this->restoreBackup($backup);
            
            return [
                'success' => true,
                'version' => $backup['version'] ?? 'unknown',
            ];
        } catch (\Throwable $e) {
            return [
                'success' => false,
                'error' => 'Restore failed: ' . $e->getMessage(),
            ];
        }
    }

    /**
     * Delete directory recursively
     */
    private function deleteDirectory(string $dir): void
    {
        if (!is_dir($dir)) {
            return;
        }

        $iterator = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS),
            \RecursiveIteratorIterator::CHILD_FIRST
        );

        foreach ($iterator as $file) {
            if ($file->isDir()) {
                rmdir($file->getPathname());
            } else {
                unlink($file->getPathname());
            }
        }

        rmdir($dir);
    }
}
