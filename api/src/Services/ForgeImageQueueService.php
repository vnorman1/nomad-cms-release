<?php
/**
 * NOMAD CMS - Forge Image Queue Service
 * 
 * Queues image downloads for Forge imports instead of synchronous processing.
 * This solves the Gateway Timeout issue when importing many images.
 * 
 * Uses the same media_queue infrastructure as SmartIngestService, so the
 * existing background worker (process-media-queue.php) handles all downloads.
 * 
 * FLOW:
 * 1. Forge finalize.php calls queueImageFields()
 * 2. Image URLs are replaced with placeholder local paths
 * 3. Download jobs are added to media_queue table
 * 4. Background worker downloads images asynchronously
 * 5. Records are saved immediately (fast response)
 * 
 * @see /api/bin/process-media-queue.php - Background worker
 * @see /api/src/Services/SmartIngestService.php - Similar pattern
 */

declare(strict_types=1);

namespace NomadCMS\Services;

use NomadCMS\Database\ContentDatabase;
use PDO;

final class ForgeImageQueueService
{
    /**
     * Allowed image extensions for processing
     */
    private const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'tiff', 'svg'];
    
    /**
     * Queue table initialization flag
     */
    private static bool $tableInitialized = false;
    
    /**
     * Get database connection and ensure queue table exists
     */
    private static function getQueueDb(): PDO
    {
        $db = ContentDatabase::getInstance();
        
        if (!self::$tableInitialized) {
            // Ensure media_queue table exists (same as SmartIngestService)
            $db->exec("
                CREATE TABLE IF NOT EXISTS media_queue (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    job_id TEXT NOT NULL,
                    source_type TEXT NOT NULL,
                    source_value TEXT NOT NULL,
                    target_path TEXT NOT NULL,
                    status TEXT DEFAULT 'pending',
                    error TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    processed_at TEXT
                )
            ");
            $db->exec("CREATE INDEX IF NOT EXISTS idx_media_queue_status ON media_queue(status)");
            $db->exec("CREATE INDEX IF NOT EXISTS idx_media_queue_job ON media_queue(job_id)");
            self::$tableInitialized = true;
        }
        
        return $db;
    }
    
    /**
     * Process records and queue images for async download
     * 
     * Scans records for image fields and:
     * - For local file paths: tries to copy immediately
     * - For remote URLs: queues for background download
     * 
     * Returns records with local paths (either copied or placeholder).
     * 
     * @param array $records Records to process
     * @param array $imageFields List of field IDs that contain images
     * @param string $jobId Unique job ID for tracking (use sessionId)
     * @param string|null $imageSourceDir Custom local directory to search for images
     * @param string|null $imageBaseUrl Base URL for remote images (e.g., https://old-site.com)
     * @return array Records with updated image paths
     */
    public static function queueImageFields(
        array $records,
        array $imageFields,
        string $jobId,
        ?string $imageSourceDir = null,
        ?string $imageBaseUrl = null
    ): array {
        $uploadDir = $_ENV['UPLOAD_DIR'] ?? dirname(__DIR__, 2) . '/uploads/';
        $defaultSearchDir = dirname(__DIR__, 2) . '/';
        
        $queuedCount = 0;
        $copiedCount = 0;
        
        foreach ($records as &$record) {
            foreach ($imageFields as $fieldId) {
                // Skip null, empty, or "null" string values
                if (!isset($record[$fieldId]) || $record[$fieldId] === null || $record[$fieldId] === '' || $record[$fieldId] === 'null') {
                    continue;
                }
                
                $imageUrl = (string)$record[$fieldId];
                
                // Skip already local images (already in /api/uploads/)
                if (str_starts_with($imageUrl, '/api/uploads/')) {
                    continue;
                }
                
                // Handle different image source types
                $result = self::processImageField($imageUrl, $jobId, $imageSourceDir, $imageBaseUrl, $uploadDir, $defaultSearchDir);
                
                if ($result !== null) {
                    $record[$fieldId] = $result['path'];
                    if ($result['queued']) {
                        $queuedCount++;
                    } else {
                        $copiedCount++;
                    }
                }
            }
        }
        
        error_log("[ForgeImageQueue] Processed images: {$copiedCount} copied immediately, {$queuedCount} queued for download");
        
        return $records;
    }
    
    /**
     * Process a single image field value
     * 
     * @return array{path: string, queued: bool}|null Path info or null on failure
     */
    private static function processImageField(
        string $imageUrl,
        string $jobId,
        ?string $imageSourceDir,
        ?string $imageBaseUrl,
        string $uploadDir,
        string $defaultSearchDir
    ): ?array {
        // Skip null or empty values
        if (empty($imageUrl) || $imageUrl === 'null') {
            return null;
        }
        
        // Case 1: Full URL - queue for download
        if (str_starts_with($imageUrl, 'http://') || str_starts_with($imageUrl, 'https://')) {
            return self::queueRemoteUrl($imageUrl, $jobId);
        }
        
        // Case 2: Try to find locally first (if imageSourceDir provided)
        $localPath = self::resolveLocalImage($imageUrl, $imageSourceDir, $defaultSearchDir);
        if ($localPath !== null) {
            $newPath = self::copyToUploads($localPath, $uploadDir);
            if ($newPath !== null) {
                return ['path' => $newPath, 'queued' => false];
            }
        }
        
        // Case 3: If imageBaseUrl provided, combine with filename only
        // This handles relative paths like "../../assets/images/products/IMG_2202.webp"
        // We extract just the filename and append to baseUrl
        if ($imageBaseUrl !== null) {
            $filename = basename($imageUrl);
            $fullUrl = rtrim($imageBaseUrl, '/') . '/' . $filename;
            error_log("[ForgeImageQueue] Constructed URL: {$fullUrl} (from: {$imageUrl})");
            return self::queueRemoteUrl($fullUrl, $jobId);
        }
        
        // Image couldn't be resolved
        error_log("[ForgeImageQueue] Could not resolve image: {$imageUrl}");
        return null;
    }
    
    /**
     * Queue a remote URL for background download
     */
    private static function queueRemoteUrl(string $url, string $jobId): array
    {
        // Generate placeholder path
        $extension = self::getExtensionFromUrl($url);
        $targetPath = self::generatePlaceholderPath($extension);
        
        // Queue for download
        $db = self::getQueueDb();
        $stmt = $db->prepare("
            INSERT INTO media_queue (job_id, source_type, source_value, target_path, status)
            VALUES (?, ?, ?, ?, 'pending')
        ");
        $stmt->execute([$jobId, 'forge_url', $url, $targetPath]);
        
        error_log("[ForgeImageQueue] Queued for download: {$url} -> {$targetPath}");
        
        return ['path' => $targetPath, 'queued' => true];
    }
    
    /**
     * Generate a placeholder path for queued images
     * Uses flat structure (no year/month subdirs) for better frontend compatibility
     * Path includes /api prefix for URL consistency with frontend
     */
    private static function generatePlaceholderPath(string $extension): string
    {
        $timestamp = time();
        $random = bin2hex(random_bytes(4));
        
        // Always convert to WebP for consistency
        // Return path with /api prefix for frontend URL compatibility
        return "/api/uploads/forge-{$timestamp}-{$random}.webp";
    }
    
    /**
     * Extract extension from URL
     */
    private static function getExtensionFromUrl(string $url): string
    {
        $path = parse_url($url, PHP_URL_PATH);
        if ($path === null) {
            return 'webp';
        }
        
        $extension = strtolower(pathinfo($path, PATHINFO_EXTENSION));
        if (!in_array($extension, self::ALLOWED_EXTENSIONS)) {
            return 'webp';
        }
        
        return $extension;
    }
    
    /**
     * Try to resolve image from local filesystem
     */
    private static function resolveLocalImage(
        string $imageUrl,
        ?string $customSourceDir,
        string $defaultDir
    ): ?string {
        $filename = basename($imageUrl);
        $relativePath = ltrim($imageUrl, '/');
        
        // Strategy 1: Custom source directory
        if ($customSourceDir !== null) {
            $exactPath = $customSourceDir . '/' . $relativePath;
            if (file_exists($exactPath) && is_file($exactPath)) {
                return $exactPath;
            }
            
            // Try recursive search
            $found = self::findFileRecursively($customSourceDir, $filename);
            if ($found !== null) {
                return $found;
            }
        }
        
        // Strategy 2: Default directory  
        $defaultPath = $defaultDir . $relativePath;
        if (file_exists($defaultPath) && is_file($defaultPath)) {
            return $defaultPath;
        }
        
        return null;
    }
    
    /**
     * Find file recursively in directory (max 5 levels deep)
     */
    private static function findFileRecursively(string $directory, string $filename, int $maxDepth = 5): ?string
    {
        if ($maxDepth <= 0) {
            return null;
        }
        
        $directPath = $directory . '/' . $filename;
        if (file_exists($directPath) && is_file($directPath)) {
            return $directPath;
        }
        
        $items = @scandir($directory);
        if ($items === false) {
            return null;
        }
        
        foreach ($items as $item) {
            if ($item === '.' || $item === '..') {
                continue;
            }
            
            $itemPath = $directory . '/' . $item;
            if (is_dir($itemPath)) {
                $found = self::findFileRecursively($itemPath, $filename, $maxDepth - 1);
                if ($found !== null) {
                    return $found;
                }
            }
        }
        
        return null;
    }
    
    /**
     * Copy local image to uploads directory
     */
    private static function copyToUploads(string $sourcePath, string $uploadDir): ?string
    {
        $extension = strtolower(pathinfo($sourcePath, PATHINFO_EXTENSION));
        
        // Validate extension
        if (!in_array($extension, self::ALLOWED_EXTENSIONS)) {
            error_log("[ForgeImageQueue] Skipping non-image file: {$sourcePath}");
            return null;
        }
        
        // Generate unique filename (flat structure, no year/month subdirs)
        $timestamp = time();
        $uniqueId = bin2hex(random_bytes(4));
        $newFilename = "forge-{$timestamp}-{$uniqueId}.{$extension}";
        
        // Ensure upload directory exists
        if (!is_dir($uploadDir)) {
            if (!mkdir($uploadDir, 0755, true)) {
                error_log("[ForgeImageQueue] Failed to create directory: {$uploadDir}");
                return null;
            }
        }
        
        $newPath = rtrim($uploadDir, '/') . '/' . $newFilename;
        if (copy($sourcePath, $newPath)) {
            return '/api/uploads/' . $newFilename;
        }
        
        error_log("[ForgeImageQueue] Failed to copy image: {$sourcePath} -> {$newPath}");
        return null;
    }
    
    /**
     * Get status of queued images for a specific job
     * 
     * @param string $jobId The job ID (sessionId from Forge import)
     * @return array{pending: int, completed: int, failed: int, total: int}
     */
    public static function getJobStatus(string $jobId): array
    {
        $db = self::getQueueDb();
        
        $stmt = $db->prepare("
            SELECT 
                status,
                COUNT(*) as count
            FROM media_queue
            WHERE job_id = ?
            GROUP BY status
        ");
        $stmt->execute([$jobId]);
        
        $status = [
            'pending' => 0,
            'completed' => 0,
            'failed' => 0,
            'total' => 0,
        ];
        
        while ($row = $stmt->fetch()) {
            $status[$row['status']] = (int)$row['count'];
            $status['total'] += (int)$row['count'];
        }
        
        return $status;
    }
    
    /**
     * Get all queue statistics
     */
    public static function getQueueStats(): array
    {
        $db = self::getQueueDb();
        
        $stmt = $db->query("
            SELECT 
                status,
                COUNT(*) as count
            FROM media_queue
            WHERE source_type = 'forge_url'
            GROUP BY status
        ");
        
        $stats = [
            'pending' => 0,
            'completed' => 0,
            'failed' => 0,
        ];
        
        while ($row = $stmt->fetch()) {
            $stats[$row['status']] = (int)$row['count'];
        }
        
        return $stats;
    }
}
