<?php
/**
 * NOMAD CMS - Smart Ingest Service
 * 
 * Automatically detects and processes images within JSON payloads.
 * When receiving data via API or Webhook, scans for image URLs/Base64
 * and queues them for background processing.
 * 
 * SECURITY: SVGs are explicitly excluded from auto-detection to prevent XSS.
 * 
 * Supported formats: jpg, jpeg, png, webp, gif, avif, tiff, bmp
 * 
 * Flow:
 * 1. Parse incoming JSON payload
 * 2. Recursively scan for image-like values
 * 3. Replace with predicted local path
 * 4. Queue original for background download/conversion
 * 5. Return modified payload for immediate storage
 */

declare(strict_types=1);

namespace NomadCMS\Services;

use NomadCMS\Database\ContentDatabase;
use PDO;

final class SmartIngestService
{
    /**
     * Allowed image extensions for auto-detection
     * SVG is EXPLICITLY EXCLUDED for security (XSS risk)
     */
    private const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'tiff', 'bmp'];
    
    /**
     * Regex pattern for matching image URLs
     */
    private const URL_PATTERN = '/^https?:\/\/.+\.(jpg|jpeg|png|webp|gif|avif|tiff|bmp)(\?.*)?$/i';
    
    /**
     * Regex pattern for matching Base64 image data URIs
     */
    private const BASE64_PATTERN = '/^data:image\/(jpeg|png|webp|gif|avif|tiff|bmp);base64,/i';
    
    /**
     * Queue tables are stored in ContentDatabase (database.sqlite)
     * No separate queue.sqlite needed anymore
     */
    private static bool $tableInitialized = false;
    
    /**
     * Get database connection from ContentDatabase
     * Creates media_queue table if it doesn't exist
     */
    private static function getQueueDb(): PDO
    {
        $db = ContentDatabase::getInstance();
        
        if (!self::$tableInitialized) {
            // Initialize queue table in ContentDatabase
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
     * Process JSON payload for image ingestion
     * 
     * Scans the data for image URLs/Base64 and replaces them with
     * predicted local paths, queueing the originals for background processing.
     * 
     * @param mixed $data The data to process (will be modified)
     * @param string $jobId Unique job identifier for tracking
     * @return mixed Modified data with local paths
     */
    public static function processPayload(mixed &$data, string $jobId): mixed
    {
        if (is_array($data)) {
            foreach ($data as $key => &$value) {
                self::processPayload($value, $jobId);
            }
        } elseif (is_string($data)) {
            // Check if this is an image reference
            $imageInfo = self::detectImage($data);
            if ($imageInfo !== null) {
                // Generate predicted local path
                $localPath = self::generateLocalPath($imageInfo['extension']);
                
                // Queue for background processing
                self::queueForProcessing($jobId, $imageInfo['type'], $data, $localPath);
                
                // Replace with local path
                $data = $localPath;
            }
        }
        
        return $data;
    }
    
    /**
     * Detect if a string value is an image reference
     * 
     * @param string $value The value to check
     * @return array|null Image info if detected, null otherwise
     */
    private static function detectImage(string $value): ?array
    {
        // Check for URL
        if (preg_match(self::URL_PATTERN, $value, $matches)) {
            return [
                'type' => 'url',
                'extension' => strtolower($matches[1]),
            ];
        }
        
        // Check for Base64 data URI
        if (preg_match(self::BASE64_PATTERN, $value, $matches)) {
            $mimeToExt = [
                'jpeg' => 'jpg',
                'png' => 'png',
                'webp' => 'webp',
                'gif' => 'gif',
                'avif' => 'avif',
                'tiff' => 'tiff',
                'bmp' => 'bmp',
            ];
            
            return [
                'type' => 'base64',
                'extension' => $mimeToExt[$matches[1]] ?? 'jpg',
            ];
        }
        
        return null;
    }
    
    /**
     * Generate a predicted local path for an image
     * 
     * @param string $extension Original extension (will be converted to webp)
     * @return string Predicted local path (always .webp)
     */
    private static function generateLocalPath(string $extension): string
    {
        $year = date('Y');
        $month = date('m');
        $timestamp = time();
        $random = bin2hex(random_bytes(4));
        
        // All images are converted to WebP
        return "/uploads/{$year}/{$month}/auto-{$timestamp}-{$random}.webp";
    }
    
    /**
     * Queue an image for background processing
     */
    private static function queueForProcessing(
        string $jobId,
        string $sourceType,
        string $sourceValue,
        string $targetPath
    ): void {
        $db = self::getQueueDb();
        
        $stmt = $db->prepare("
            INSERT INTO media_queue (job_id, source_type, source_value, target_path, status)
            VALUES (?, ?, ?, ?, 'pending')
        ");
        $stmt->execute([$jobId, $sourceType, $sourceValue, $targetPath]);
    }
    
    /**
     * Process pending media queue items (called by background worker)
     * 
     * @param int $limit Maximum items to process
     * @return array Processing results
     */
    public static function processPendingQueue(int $limit = 50): array
    {
        $db = self::getQueueDb();
        
        // Get pending items
        $stmt = $db->prepare("
            SELECT id, job_id, source_type, source_value, target_path 
            FROM media_queue 
            WHERE status = 'pending' 
            ORDER BY created_at ASC 
            LIMIT ?
        ");
        $stmt->execute([$limit]);
        $items = $stmt->fetchAll();
        
        $results = [
            'processed' => 0,
            'failed' => 0,
            'errors' => [],
        ];
        
        foreach ($items as $item) {
            try {
                self::processQueueItem($item);
                
                // Mark as completed
                $stmt = $db->prepare("
                    UPDATE media_queue 
                    SET status = 'completed', processed_at = datetime('now') 
                    WHERE id = ?
                ");
                $stmt->execute([$item['id']]);
                
                $results['processed']++;
                
            } catch (\Throwable $e) {
                // Mark as failed
                $stmt = $db->prepare("
                    UPDATE media_queue 
                    SET status = 'failed', error = ?, processed_at = datetime('now') 
                    WHERE id = ?
                ");
                $stmt->execute([$e->getMessage(), $item['id']]);
                
                $results['failed']++;
                $results['errors'][] = [
                    'id' => $item['id'],
                    'error' => $e->getMessage(),
                ];
            }
        }
        
        return $results;
    }
    
    /**
     * Process a single queue item
     */
    private static function processQueueItem(array $item): void
    {
        $targetPath = $item['target_path'];
        
        // Handle paths with /api prefix (from ForgeImageQueueService)
        // ForgeImageQueueService generates: /api/uploads/forge-xxx.webp
        // We need to store at: <api_root>/uploads/forge-xxx.webp
        if (str_starts_with($targetPath, '/api/')) {
            $targetPath = substr($targetPath, 4); // Remove /api prefix
        }
        
        $absolutePath = dirname(__DIR__, 2) . $targetPath;
        
        error_log("[SmartIngest] Target path: {$item['target_path']} -> absolutePath: {$absolutePath}");
        
        // Ensure directory exists
        $directory = dirname($absolutePath);
        if (!is_dir($directory)) {
            mkdir($directory, 0755, true);
        }
        
        // Get image content based on source type
        $tempPath = null;
        
        if ($item['source_type'] === 'url' || $item['source_type'] === 'forge_url') {
            // Download from URL (both 'url' type from SmartIngest and 'forge_url' from Forge)
            error_log("[SmartIngest] Processing {$item['source_type']}: {$item['source_value']}");
            $tempPath = self::downloadImage($item['source_value']);
        } elseif ($item['source_type'] === 'base64') {
            // Decode Base64
            $tempPath = self::decodeBase64Image($item['source_value']);
        }
        
        if ($tempPath === null) {
            throw new \RuntimeException('Failed to retrieve image content');
        }
        
        try {
            // Convert to WebP using existing image processing
            require_once dirname(__DIR__, 2) . '/lib/image.php';
            
            // Use GD to convert to WebP
            $finfo = finfo_open(FILEINFO_MIME_TYPE);
            $mimeType = finfo_file($finfo, $tempPath);
            finfo_close($finfo);
            
            $image = createImageFromFile($tempPath, $mimeType);
            if ($image === false) {
                throw new \RuntimeException('Failed to create image from file');
            }
            
            $quality = (int)($_ENV['WEBP_QUALITY'] ?? 90);
            $success = imagewebp($image, $absolutePath, $quality);
            imagedestroy($image);
            
            if (!$success) {
                throw new \RuntimeException('Failed to save WebP image');
            }
            
        } finally {
            // Clean up temp file
            if ($tempPath && file_exists($tempPath)) {
                @unlink($tempPath);
            }
        }
    }
    
    /**
     * Download image from URL to temp file
     */
    private static function downloadImage(string $url): ?string
    {
        $tempPath = sys_get_temp_dir() . '/smart_ingest_' . bin2hex(random_bytes(8));
        
        $context = stream_context_create([
            'http' => [
                'timeout' => 30,
                'user_agent' => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'header' => [
                    'Accept: image/*,*/*;q=0.9',
                    'Accept-Language: hu-HU,hu;q=0.9,en;q=0.8',
                ],
            ],
            'ssl' => [
                'verify_peer' => false,
                'verify_peer_name' => false,
            ],
        ]);
        
        $content = @file_get_contents($url, false, $context);
        if ($content === false) {
            error_log("[SmartIngest] Failed to download: {$url}");
            return null;
        }
        
        error_log("[SmartIngest] Downloaded {$url}: " . strlen($content) . " bytes");
        
        if (file_put_contents($tempPath, $content) === false) {
            return null;
        }
        
        return $tempPath;
    }
    
    /**
     * Decode Base64 data URI to temp file
     */
    private static function decodeBase64Image(string $dataUri): ?string
    {
        // Extract Base64 content after the header
        $parts = explode(',', $dataUri, 2);
        if (count($parts) !== 2) {
            return null;
        }
        
        $base64 = $parts[1];
        $content = base64_decode($base64, true);
        if ($content === false) {
            return null;
        }
        
        $tempPath = sys_get_temp_dir() . '/smart_ingest_' . bin2hex(random_bytes(8));
        if (file_put_contents($tempPath, $content) === false) {
            return null;
        }
        
        return $tempPath;
    }
    
    /**
     * Get queue statistics
     */
    public static function getQueueStats(): array
    {
        $db = self::getQueueDb();
        
        $stmt = $db->query("
            SELECT 
                status,
                COUNT(*) as count
            FROM media_queue
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
