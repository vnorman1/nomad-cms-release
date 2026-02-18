<?php
/**
 * Forge Image Processing Helper Functions
 * 
 * Standalone helper functions for image migration in Forge imports.
 * Extracted from finalize.php for testability.
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ DEPRECATION NOTICE (2026-01-07)
 * ═══════════════════════════════════════════════════════════════════════════
 * The synchronous processImageUrls() function is deprecated.
 * It causes Gateway Timeout on large imports (100+ images × 0.5s = 50s).
 * 
 * RECOMMENDED: Use ForgeImageQueueService for async processing:
 * ```php
 * use NomadCMS\Services\ForgeImageQueueService;
 * $records = ForgeImageQueueService::queueImageFields($records, $imageFields, $jobId);
 * ```
 * 
 * finalize.php now uses async processing by default. To revert to sync:
 * Set environment variable: FORGE_ASYNC_IMAGES=false
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * @see /api/endpoints/forge/finalize.php - Main endpoint that uses these
 * @see /api/src/Services/ForgeImageQueueService.php - Async alternative (RECOMMENDED)
 */

declare(strict_types=1);

/**
 * Get slot configuration from nomad.schema.json
 */
function getSlotConfig(string $slotKey): array {
    $schemaPath = __DIR__ . '/../../data/nomad.schema.json';
    
    if (!file_exists($schemaPath)) {
        error_log("[Forge] Schema file not found at: {$schemaPath}");
        return ['type' => 'massive']; // Default fallback
    }
    
    $schema = json_decode(file_get_contents($schemaPath), true);
    
    if (!isset($schema['slots'][$slotKey])) {
        error_log("[Forge] Slot '{$slotKey}' not found in schema, defaulting to massive");
        return ['type' => 'massive'];
    }
    
    return $schema['slots'][$slotKey];
}

/**
 * Get image field IDs from slot config
 */
function getImageFields(array $slotConfig): array {
    $imageFields = [];
    
    if (!isset($slotConfig['fields'])) {
        return $imageFields;
    }
    
    foreach ($slotConfig['fields'] as $field) {
        if (isset($field['type']) && in_array($field['type'], ['image', 'gif', 'gallery'])) {
            $imageFields[] = $field['id'];
        }
    }
    
    return $imageFields;
}

/**
 * Process image URLs in records (SYNCHRONOUS - LEGACY)
 * 
 * @deprecated 2026-01-07 Use ForgeImageQueueService::queueImageFields() instead
 *             This synchronous approach causes gateway timeouts on large imports.
 *             Enable async mode with: FORGE_ASYNC_IMAGES=true (default)
 * 
 * Downloads external images and re-uploads to local storage
 * Handles URL-based images like /uploads/wp-content/04/valami.webp
 * 
 * ⚠️ WARNING: This function blocks the HTTP request until all images are downloaded.
 * For imports with 100+ images, this can take 50+ seconds, causing 504 Gateway Timeout.
 * 
 * PRODUCTION-SAFE ALTERNATIVE:
 * ```php
 * use NomadCMS\Services\ForgeImageQueueService;
 * $records = ForgeImageQueueService::queueImageFields($records, $imageFields, $jobId);
 * ```
 * Then run: php api/bin/process-media-queue.php --daemon
 * 
 * @param array $records Records to process
 * @param array $imageFields List of field IDs that contain images
 * @param string|null $imageSourceDir Optional custom directory to search for images
 * @param string|null $imageBaseUrl Optional base URL to prepend to relative paths (e.g., https://old-site.com)
 * @return array Processed records with updated image paths
 */
function processImageUrls(array $records, array $imageFields, ?string $imageSourceDir = null, ?string $imageBaseUrl = null): array {
    // Log deprecation warning
    error_log("[Forge] WARNING: Using deprecated synchronous processImageUrls(). Consider enabling FORGE_ASYNC_IMAGES=true");
    
    $uploadDir = $_ENV['UPLOAD_DIR'] ?? __DIR__ . '/../../uploads/';
    $defaultSearchDir = __DIR__ . '/../../';
    
    foreach ($records as &$record) {
        foreach ($imageFields as $fieldId) {
            if (!isset($record[$fieldId]) || empty($record[$fieldId])) {
                continue;
            }
            
            $imageUrl = $record[$fieldId];
            
            // Skip already local images (already in /api/uploads/)
            if (str_starts_with($imageUrl, '/api/uploads/')) {
                continue;
            }
            
            // Already a full URL - download directly
            if (str_starts_with($imageUrl, 'http://') || str_starts_with($imageUrl, 'https://')) {
                $downloaded = downloadExternalImage($imageUrl, $uploadDir);
                if ($downloaded) {
                    $record[$fieldId] = $downloaded;
                    error_log("[Forge] Downloaded external image: {$imageUrl} -> {$downloaded}");
                }
                continue;
            }
            
            // Try to resolve locally first (if imageSourceDir is provided)
            $resolvedPath = resolveImagePath($imageUrl, $imageSourceDir, $defaultSearchDir);
            
            if ($resolvedPath !== null && file_exists($resolvedPath)) {
                $newPath = copyImageToUploads($resolvedPath, $uploadDir);
                if ($newPath !== null) {
                    $record[$fieldId] = $newPath;
                    error_log("[Forge] Migrated local image: {$imageUrl} -> {$newPath}");
                    continue;
                }
            }
            
            // If imageBaseUrl is provided and we have a relative path, try downloading from remote
            if ($imageBaseUrl !== null) {
                $relativeUrl = ltrim($imageUrl, '/');
                $fullUrl = $imageBaseUrl . '/' . $relativeUrl;
                
                $downloaded = downloadExternalImage($fullUrl, $uploadDir);
                if ($downloaded) {
                    $record[$fieldId] = $downloaded;
                    error_log("[Forge] Downloaded from base URL: {$fullUrl} -> {$downloaded}");
                    continue;
                }
            }
            
            // Image couldn't be resolved - leave as-is
            error_log("[Forge] Could not resolve image: {$imageUrl}");
        }
    }
    
    return $records;
}

/**
 * Resolve image path from relative URL to absolute file path
 * Tries multiple search strategies to find the image
 * 
 * @param string $imageUrl The image URL/path from the import data
 * @param string|null $customSourceDir Custom directory to search in
 * @param string $defaultDir Default directory (api root)
 * @return string|null Resolved absolute path or null if not found
 */
function resolveImagePath(string $imageUrl, ?string $customSourceDir, string $defaultDir): ?string {
    // Extract just the filename for basename search
    $filename = basename($imageUrl);
    
    // Clean up the relative path
    $relativePath = ltrim($imageUrl, '/');
    
    // Strategy 1: If custom source directory provided, search there first
    if ($customSourceDir !== null) {
        // Try exact path within custom directory
        $exactPath = $customSourceDir . '/' . $relativePath;
        if (file_exists($exactPath)) {
            return $exactPath;
        }
        
        // Try just the filename in custom directory (recursive search)
        $foundInCustom = findFileRecursively($customSourceDir, $filename);
        if ($foundInCustom !== null) {
            return $foundInCustom;
        }
    }
    
    // Strategy 2: Try exact relative path from default directory
    $defaultPath = $defaultDir . $relativePath;
    if (file_exists($defaultPath)) {
        return $defaultPath;
    }
    
    // Strategy 3: Common WordPress upload pattern variations
    $patterns = [
        // WordPress-style: /uploads/wp-content/uploads/2024/01/image.jpg
        'uploads/wp-content/uploads/' . $filename,
        'wp-content/uploads/' . extractYearMonth($imageUrl) . $filename,
        // Direct uploads folder
        'uploads/' . $filename,
        // Year/month structure
        'uploads/' . date('Y') . '/' . $filename,
        'uploads/' . date('Y') . '/' . date('m') . '/' . $filename,
    ];
    
    foreach ($patterns as $pattern) {
        $tryPath = $defaultDir . $pattern;
        if (file_exists($tryPath)) {
            return $tryPath;
        }
        
        // Also try in custom source directory
        if ($customSourceDir !== null) {
            $tryCustomPath = $customSourceDir . '/' . $pattern;
            if (file_exists($tryCustomPath)) {
                return $tryCustomPath;
            }
        }
    }
    
    return null;
}

/**
 * Extract year/month from image URL if present
 */
function extractYearMonth(string $url): string {
    if (preg_match('/(\d{4})\/(\d{2})\//', $url, $matches)) {
        return $matches[1] . '/' . $matches[2] . '/';
    }
    return '';
}

/**
 * Find a file recursively in a directory
 * 
 * @param string $directory Directory to search in
 * @param string $filename Filename to find
 * @param int $maxDepth Maximum recursion depth (to prevent infinite loops)
 * @return string|null Full path to file or null if not found
 */
function findFileRecursively(string $directory, string $filename, int $maxDepth = 5): ?string {
    if ($maxDepth <= 0) {
        return null;
    }
    
    // Check if file exists directly in this directory
    $directPath = $directory . '/' . $filename;
    if (file_exists($directPath) && is_file($directPath)) {
        return $directPath;
    }
    
    // Search subdirectories
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
            $found = findFileRecursively($itemPath, $filename, $maxDepth - 1);
            if ($found !== null) {
                return $found;
            }
        }
    }
    
    return null;
}

/**
 * Copy image to uploads directory with proper naming
 * 
 * @param string $sourcePath Source file path
 * @param string $uploadDir Upload directory
 * @return string|null New public URL or null on failure
 */
function copyImageToUploads(string $sourcePath, string $uploadDir): ?string {
    $extension = strtolower(pathinfo($sourcePath, PATHINFO_EXTENSION));
    
    // Validate it's an image extension
    $allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif'];
    if (!in_array($extension, $allowedExtensions)) {
        error_log("[Forge] Skipping non-image file: {$sourcePath}");
        return null;
    }
    
    $newFilename = 'forge-' . uniqid() . '-' . preg_replace('/[^a-zA-Z0-9._-]/', '', basename($sourcePath));
    $year = date('Y');
    $month = date('m');
    $newDir = $uploadDir . $year . '/' . $month;
    
    if (!is_dir($newDir)) {
        if (!mkdir($newDir, 0755, true)) {
            error_log("[Forge] Failed to create directory: {$newDir}");
            return null;
        }
    }
    
    $newPath = $newDir . '/' . $newFilename;
    if (copy($sourcePath, $newPath)) {
        return '/api/uploads/' . $year . '/' . $month . '/' . $newFilename;
    }
    
    error_log("[Forge] Failed to copy image: {$sourcePath} -> {$newPath}");
    return null;
}

/**
 * Download external image and save to uploads
 */
function downloadExternalImage(string $url, string $uploadDir): ?string {
    $context = stream_context_create([
        'http' => [
            'timeout' => 10,
            'user_agent' => 'NomadCMS-Forge/1.0'
        ]
    ]);
    
    $imageData = @file_get_contents($url, false, $context);
    if ($imageData === false) {
        error_log("[Forge] Failed to download image: {$url}");
        return null;
    }
    
    // Detect extension from URL or content-type
    $extension = pathinfo(parse_url($url, PHP_URL_PATH), PATHINFO_EXTENSION);
    $extension = strtolower($extension) ?: 'webp';
    
    $filename = 'forge-ext-' . uniqid() . '.' . $extension;
    $year = date('Y');
    $month = date('m');
    $newDir = $uploadDir . $year . '/' . $month;
    
    if (!is_dir($newDir)) {
        mkdir($newDir, 0755, true);
    }
    
    $filePath = $newDir . '/' . $filename;
    if (file_put_contents($filePath, $imageData)) {
        return '/api/uploads/' . $year . '/' . $month . '/' . $filename;
    }
    
    return null;
}
