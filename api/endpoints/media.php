<?php
/**
 * NOMAD CMS - Media Library Endpoint
 * 
 * Handles media file listing, info retrieval, and usage tracking.
 * 
 * Endpoints:
 * - GET /media.php              - List all media files with metadata
 * - GET /media.php?file=name    - Get single file info with usage locations
 * - DELETE /media.php?file=name - Delete a media file (admin only)
 * 
 * Response includes:
 * - File metadata (name, size, type, dimensions, date)
 * - Usage locations (which slots/fields use this image - recursive search)
 */

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

use NomadCMS\Database\ContentDatabase;
use NomadCMS\Middleware\AuthMiddleware;
use NomadCMS\Middleware\CSRFMiddleware;
use NomadCMS\Security\InputSanitizer;

// Handle CORS preflight
handlePreflight();

header('Content-Type: application/json');

$method = $_SERVER['REQUEST_METHOD'];

try {
    switch ($method) {
        case 'GET':
            // Require auth for media library access
            AuthMiddleware::requireAuth();
            
            $filename = $_GET['file'] ?? null;
            
            if ($filename) {
                // Single file info with usage
                $filename = InputSanitizer::filename($filename);
                echo json_encode(getMediaFileInfo($filename));
            } else {
                // List all media files
                echo json_encode(getAllMediaFiles());
            }
            break;
            
        case 'DELETE':
            // SECURITY: Validate CSRF token for session-based requests
            CSRFMiddleware::validateForSession();
            
            // Admin only for deletion
            AuthMiddleware::requireAdmin();
            
            $filename = $_GET['file'] ?? null;
            
            if (!$filename) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Missing file parameter']);
                exit;
            }
            
            $filename = InputSanitizer::filename($filename);
            echo json_encode(deleteMediaFile($filename));
            break;
            
        default:
            http_response_code(405);
            echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => ($_ENV['APP_DEBUG'] ?? 'false') === 'true' ? $e->getMessage() : 'Internal server error'
    ]);
}

/**
 * Get all media files with metadata and usage counts
 */
function getAllMediaFiles(): array
{
    $uploadDir = $_ENV['UPLOAD_DIR'] ?? __DIR__ . '/../uploads/';
    $files = [];
    
    if (!is_dir($uploadDir)) {
        return ['success' => true, 'files' => [], 'total' => 0, 'totalSize' => 0];
    }
    
    // Pre-load all slot data for usage counting (optimization)
    $allSlotData = preloadAllSlotData();
    
    $iterator = new DirectoryIterator($uploadDir);
    $totalSize = 0;
    
    foreach ($iterator as $fileInfo) {
        if ($fileInfo->isDot() || $fileInfo->isDir()) {
            continue;
        }
        
        $filename = $fileInfo->getFilename();
        
        // Skip hidden files and non-image files
        if (str_starts_with($filename, '.')) {
            continue;
        }
        
        $extension = strtolower($fileInfo->getExtension());
        // Image, video and audio extensions
        $allowedExtensions = [
            // Images
            'webp', 'jpg', 'jpeg', 'png', 'gif', 'svg', 'avif',
            // Videos
            'mp4', 'webm', 'mov', 'avi', 'mkv',
            // Audio
            'mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'aiff'
        ];
        
        if (!in_array($extension, $allowedExtensions)) {
            continue;
        }
        
        $filePath = $fileInfo->getPathname();
        $fileSize = $fileInfo->getSize();
        $totalSize += $fileSize;
        
        // Count usages from preloaded data
        $searchUrl = '/api/uploads/' . $filename;
        $usages = findMediaUsagesFromPreloaded($searchUrl, $allSlotData);
        
        $file = [
            'filename' => $filename,
            'url' => $searchUrl,
            'size' => $fileSize,
            'sizeFormatted' => formatFileSize($fileSize),
            'mimeType' => mime_content_type($filePath) ?: 'application/octet-stream',
            'extension' => $extension,
            'createdAt' => date('c', $fileInfo->getCTime()),
            'modifiedAt' => date('c', $fileInfo->getMTime()),
            'usageCount' => count($usages),
            'usages' => $usages, // Include full usage info
        ];
        
        // Get image dimensions if possible
        $dimensions = @getimagesize($filePath);
        if ($dimensions) {
            $file['width'] = $dimensions[0];
            $file['height'] = $dimensions[1];
        }
        
        $files[] = $file;
    }
    
    // Sort by modified date (newest first)
    usort($files, fn($a, $b) => strtotime($b['modifiedAt']) - strtotime($a['modifiedAt']));
    
    return [
        'success' => true,
        'files' => $files,
        'total' => count($files),
        'totalSize' => $totalSize,
        'totalSizeFormatted' => formatFileSize($totalSize)
    ];
}

/**
 * Get single media file info with usage locations
 */
function getMediaFileInfo(string $filename): array
{
    // SECURITY: Double-check path traversal prevention
    if ($filename === null || $filename === '') {
        http_response_code(400);
        return ['success' => false, 'error' => 'Invalid filename'];
    }
    
    // Additional security: ensure filename doesn't contain path separators
    if (strpos($filename, '/') !== false || strpos($filename, '\\') !== false || strpos($filename, '..') !== false) {
        http_response_code(400);
        return ['success' => false, 'error' => 'Invalid filename'];
    }
    
    $uploadDir = $_ENV['UPLOAD_DIR'] ?? __DIR__ . '/../uploads/';
    $filePath = $uploadDir . $filename;
    
    // SECURITY: Verify the resolved path is within upload directory
    $realUploadDir = realpath($uploadDir);
    $realFilePath = realpath($filePath);
    
    if ($realFilePath === false || $realUploadDir === false) {
        http_response_code(404);
        return ['success' => false, 'error' => 'File not found'];
    }
    
    if (strpos($realFilePath, $realUploadDir) !== 0) {
        // Path traversal attempt detected
        http_response_code(403);
        return ['success' => false, 'error' => 'Access denied'];
    }
    
    if (!is_file($realFilePath)) {
        http_response_code(404);
        return ['success' => false, 'error' => 'File not found'];
    }
    
    $file = [
        'filename' => $filename,
        'url' => '/api/uploads/' . $filename,
        'size' => filesize($realFilePath),
        'sizeFormatted' => formatFileSize(filesize($realFilePath)),
        'mimeType' => mime_content_type($realFilePath) ?: 'application/octet-stream',
        'extension' => strtolower(pathinfo($filename, PATHINFO_EXTENSION)),
        'createdAt' => date('c', filectime($realFilePath)),
        'modifiedAt' => date('c', filemtime($realFilePath)),
    ];
    
    // Get image dimensions
    $dimensions = @getimagesize($realFilePath);
    if ($dimensions) {
        $file['width'] = $dimensions[0];
        $file['height'] = $dimensions[1];
    }
    
    // Find usage locations
    $file['usages'] = findMediaUsages($filename);
    $file['usageCount'] = count($file['usages']);
    
    return [
        'success' => true,
        'file' => $file
    ];
}

/**
 * Find all locations where a media file is used
 * Recursively searches through all slots and their nested content
 */
function findMediaUsages(string $filename): array
{
    $usages = [];
    $searchUrl = '/api/uploads/' . $filename;
    
    // Get all slots from database
    $slots = ContentDatabase::getAllSlots();
    
    foreach ($slots as $slotInfo) {
        $slotKey = $slotInfo['key'];
        $slotData = ContentDatabase::getSlot($slotKey);
        
        if ($slotData === null) {
            continue;
        }
        
        // Recursively search through slot data
        $found = searchForMediaInData($slotData, $searchUrl, $slotKey);
        $usages = array_merge($usages, $found);
    }
    
    return $usages;
}

/**
 * Recursively search for media URL in data structure
 */
function searchForMediaInData($data, string $searchUrl, string $slotKey, string $path = ''): array
{
    $usages = [];
    
    if (is_string($data)) {
        // Check if string contains the URL (for rich text fields, etc.)
        if (strpos($data, $searchUrl) !== false) {
            $usages[] = [
                'slot' => $slotKey,
                'path' => $path,
                'type' => 'text_content',
                'context' => mb_substr($data, 0, 100) . (mb_strlen($data) > 100 ? '...' : '')
            ];
        }
    } elseif (is_array($data)) {
        foreach ($data as $key => $value) {
            $currentPath = $path ? "{$path}.{$key}" : (string)$key;
            
            if (is_string($value)) {
                // Direct URL match
                if ($value === $searchUrl) {
                    $usages[] = [
                        'slot' => $slotKey,
                        'path' => $currentPath,
                        'type' => 'direct_reference',
                        'field' => $key
                    ];
                }
                // URL in text content
                elseif (strpos($value, $searchUrl) !== false) {
                    $usages[] = [
                        'slot' => $slotKey,
                        'path' => $currentPath,
                        'type' => 'embedded_in_text',
                        'field' => $key,
                        'context' => mb_substr($value, max(0, strpos($value, $searchUrl) - 20), 100)
                    ];
                }
            } elseif (is_array($value)) {
                // Recurse into nested arrays
                $nestedUsages = searchForMediaInData($value, $searchUrl, $slotKey, $currentPath);
                $usages = array_merge($usages, $nestedUsages);
            }
        }
    }
    
    return $usages;
}

/**
 * Delete a media file
 */
function deleteMediaFile(string $filename): array
{
    $uploadDir = $_ENV['UPLOAD_DIR'] ?? __DIR__ . '/../uploads/';
    $filePath = $uploadDir . $filename;
    
    if (!file_exists($filePath) || !is_file($filePath)) {
        http_response_code(404);
        return ['success' => false, 'error' => 'File not found'];
    }
    
    // Check for usages before deletion
    $usages = findMediaUsages($filename);
    
    if (!empty($usages)) {
        // Warn about active usages but allow deletion
        // (Admin decision to force delete)
        $forceDelete = isset($_GET['force']) && $_GET['force'] === 'true';
        
        if (!$forceDelete) {
            return [
                'success' => false,
                'error' => 'File is in use',
                'usages' => $usages,
                'usageCount' => count($usages),
                'message' => 'This file is used in ' . count($usages) . ' location(s). Add ?force=true to delete anyway.'
            ];
        }
    }
    
    if (unlink($filePath)) {
        return [
            'success' => true,
            'message' => 'File deleted successfully',
            'deletedUsages' => count($usages)
        ];
    } else {
        http_response_code(500);
        return ['success' => false, 'error' => 'Failed to delete file'];
    }
}

/**
 * Format file size to human readable format
 */
function formatFileSize(int $bytes): string
{
    $units = ['B', 'KB', 'MB', 'GB'];
    $bytes = max($bytes, 0);
    $pow = floor(($bytes ? log($bytes) : 0) / log(1024));
    $pow = min($pow, count($units) - 1);
    $bytes /= pow(1024, $pow);
    
    return round($bytes, 2) . ' ' . $units[$pow];
}

/**
 * Preload all slot data for batch usage counting (optimization)
 * This prevents N+1 database queries when listing all media files
 */
function preloadAllSlotData(): array
{
    $allData = [];
    $slots = ContentDatabase::getAllSlots();
    
    foreach ($slots as $slotInfo) {
        $slotKey = $slotInfo['key'];
        $slotData = ContentDatabase::getSlot($slotKey);
        
        if ($slotData !== null) {
            $allData[$slotKey] = $slotData;
        }
    }
    
    return $allData;
}

/**
 * Find media usages from preloaded slot data
 */
function findMediaUsagesFromPreloaded(string $searchUrl, array $allSlotData): array
{
    $usages = [];
    
    foreach ($allSlotData as $slotKey => $slotData) {
        $found = searchForMediaInData($slotData, $searchUrl, $slotKey);
        $usages = array_merge($usages, $found);
    }
    
    return $usages;
}
