<?php
/**
 * Forge Finalize Endpoint
 * Assembles chunks, decrypts, and imports data to target slot
 * 
 * SUPPORTS ALL SLOT TYPES:
 * - massive: Large datasets (MassiveDatabase)
 * - list: List items (ContentDatabase)
 * - collection: Collection items (ContentDatabase)
 * - object: Single object (ContentDatabase)
 * 
 * Also handles image URL migration (downloads external images to local storage)
 * 
 * POST /api/endpoints/forge/finalize.php
 */

declare(strict_types=1);

require_once __DIR__ . '/../../bootstrap.php';

use NomadCMS\Auth\JWTService;
use NomadCMS\Database\AuthDatabase;
use NomadCMS\Database\UserRepository;
use NomadCMS\Database\MassiveDatabase;
use NomadCMS\Database\ContentDatabase;
use NomadCMS\Database\OptimisticLockException;
use NomadCMS\Security\InputSanitizer;
use NomadCMS\Services\ForgeImageQueueService;

// ═══════════════════════════════════════════════════════════════════════════
// FEATURE FLAGS - For rollback if issues arise in production
// ═══════════════════════════════════════════════════════════════════════════
$GLOBALS['FORGE_USE_ASYNC_IMAGES'] = $_ENV['FORGE_ASYNC_IMAGES'] ?? true;
$GLOBALS['FORGE_USE_OPTIMISTIC_LOCKING'] = $_ENV['FORGE_OPTIMISTIC_LOCKING'] ?? true;

// CORS
handlePreflight();

header('Content-Type: application/json');

// Only POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

// Verify JWT token
$token = JWTService::extractBearerToken();
if (!$token) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'No token provided']);
    exit;
}

try {
    $payload = JWTService::validateAccessToken($token);
    $userId = $payload->user->id ?? null;
    
    if (!$userId) {
        throw new Exception('Invalid token');
    }
    
    // Get user and check admin
    AuthDatabase::getInstance();
    $user = UserRepository::findById($userId);
    
    if (!$user || !$user['is_admin']) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Admin access required']);
        exit;
    }
    
    // Get request body
    $input = json_decode(file_get_contents('php://input'), true);
    
    $sessionId = InputSanitizer::forgeSessionId($input['sessionId'] ?? null);
    $targetSlot = InputSanitizer::forgeTargetSlot($input['targetSlot'] ?? null);
    $expectedChunks = $input['totalChunks'] ?? null;
    
    // Optional: Custom image source directory for relative path resolution
    // This allows selecting a local folder from which to search for images
    $imageSourceDir = $input['imageSourceDir'] ?? null;
    if ($imageSourceDir !== null) {
        // Sanitize and validate the path
        $imageSourceDir = realpath($imageSourceDir);
        if ($imageSourceDir === false) {
            $imageSourceDir = null; // Invalid path, fall back to default
            error_log("[Forge] Invalid imageSourceDir provided, using default");
        } else {
            error_log("[Forge] Using custom image source directory: {$imageSourceDir}");
        }
    }
    
    // Optional: Base URL prefix for remote images
    // Example: "https://regi-oldal.hu" - will prepend to relative paths like /uploads/image.jpg
    // making them https://regi-oldal.hu/uploads/image.jpg for download
    $imageBaseUrl = $input['imageBaseUrl'] ?? null;
    error_log("[Forge] Raw imageBaseUrl from input: " . ($imageBaseUrl ?? 'NULL'));
    if ($imageBaseUrl !== null && !empty($imageBaseUrl)) {
        // Validate it's a proper URL
        $imageBaseUrl = rtrim($imageBaseUrl, '/'); // Remove trailing slash
        if (!filter_var($imageBaseUrl, FILTER_VALIDATE_URL)) {
            error_log("[Forge] Invalid imageBaseUrl provided: {$imageBaseUrl}");
            $imageBaseUrl = null;
        } else {
            error_log("[Forge] Using image base URL: {$imageBaseUrl}");
        }
    } else {
        error_log("[Forge] No imageBaseUrl provided - remote image download disabled");
        $imageBaseUrl = null;
    }
    
    // SECURITY: Validate inputs using InputSanitizer
    if ($sessionId === null) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Invalid session ID format']);
        exit;
    }
    
    if ($targetSlot === null) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Invalid target slot format']);
        exit;
    }
    
    $cacheDir = __DIR__ . '/../../storage/forge-sessions';
    
    // Ensure directory exists (may not exist on fresh install)
    if (!is_dir($cacheDir)) {
        mkdir($cacheDir, 0700, true);
    }
    
    $chunkDir = $cacheDir . '/chunks/' . $sessionId;
    
    // SECURITY: Verify paths don't escape the intended directory
    $realCacheDir = realpath($cacheDir);
    
    // Debug logging for path issues
    error_log("[Forge] cacheDir: {$cacheDir}");
    error_log("[Forge] realCacheDir: " . ($realCacheDir ?: 'false'));
    error_log("[Forge] chunkDir: {$chunkDir}");
    
    // Check if chunk directory exists - if not, session is invalid
    if (!is_dir($chunkDir)) {
        error_log("[Forge] chunkDir does not exist");
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Session not found or expired']);
        exit;
    }
    
    $realChunkDir = realpath($chunkDir);
    error_log("[Forge] realChunkDir: " . ($realChunkDir ?: 'false'));
    
    // Debug path safety check
    $pathSafeResult = InputSanitizer::isPathSafe($realChunkDir, $realCacheDir);
    error_log("[Forge] isPathSafe result: " . ($pathSafeResult ? 'true' : 'false'));
    
    if ($realChunkDir === false || !$pathSafeResult) {
        error_log("[Forge] Path validation failed - realChunkDir: " . ($realChunkDir ?: 'false') . ", pathSafe: " . ($pathSafeResult ? 'true' : 'false'));
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Invalid session path']);
        exit;
    }
    
    // Verify all chunks received
    $metaFile = $chunkDir . '/meta.json';
    if (!file_exists($metaFile)) {
        throw new Exception('No chunks found for session');
    }
    
    $meta = json_decode(file_get_contents($metaFile), true);
    if ($meta['receivedChunks'] !== $meta['totalChunks']) {
        throw new Exception(sprintf(
            'Incomplete upload: %d/%d chunks received',
            $meta['receivedChunks'],
            $meta['totalChunks']
        ));
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // STREAMING CHUNK ASSEMBLY (Memory-Efficient)
    // Instead of loading all chunks into RAM, we stream them to a temp file.
    // This prevents memory exhaustion on large imports (50MB file → 300MB+ RAM).
    // ═══════════════════════════════════════════════════════════════════════════
    
    $assembledFile = $chunkDir . '/assembled.bin';
    $outHandle = fopen($assembledFile, 'wb');
    if ($outHandle === false) {
        throw new Exception('Failed to create assembly file');
    }
    
    try {
        for ($i = 0; $i < $meta['totalChunks']; $i++) {
            $chunkPath = $chunkDir . '/chunk_' . str_pad((string)$i, 5, '0', STR_PAD_LEFT);
            if (!file_exists($chunkPath)) {
                fclose($outHandle);
                throw new Exception("Missing chunk $i");
            }
            
            // Stream chunk directly to output file (no RAM accumulation)
            $chunkHandle = fopen($chunkPath, 'rb');
            if ($chunkHandle === false) {
                throw new Exception("Failed to read chunk $i");
            }
            stream_copy_to_stream($chunkHandle, $outHandle);
            fclose($chunkHandle);
        }
    } finally {
        fclose($outHandle);
    }
    
    error_log("[Forge] Assembled " . $meta['totalChunks'] . " chunks to file (" . filesize($assembledFile) . " bytes)");
    
    // Get secret key for decryption
    $sessionFile = $cacheDir . '/' . $sessionId . '.key';
    
    // SECURITY: Verify session key file path is within allowed directory
    if (!InputSanitizer::isPathSafe($sessionFile, $cacheDir)) {
        @unlink($assembledFile);
        throw new Exception('Invalid session key path');
    }
    
    if (!file_exists($sessionFile)) {
        @unlink($assembledFile);
        throw new Exception('Session key not found');
    }
    
    $secretKey = file_get_contents($sessionFile);
    
    // ═══════════════════════════════════════════════════════════════════════════
    // STREAMING BASE64 DECODE (Memory-Efficient)
    // Decode base64 from file to file using PHP stream filters.
    // This avoids holding both base64 AND decoded data in memory simultaneously.
    // ═══════════════════════════════════════════════════════════════════════════
    
    $ciphertextFile = $chunkDir . '/ciphertext.bin';
    decodeBase64FileToFile($assembledFile, $ciphertextFile);
    
    // Clean up assembled file immediately (no longer needed)
    @unlink($assembledFile);
    
    // Load ciphertext for decryption (sodium requires full buffer, but base64 overhead is gone)
    $ciphertext = file_get_contents($ciphertextFile);
    @unlink($ciphertextFile);
    
    if ($ciphertext === false) {
        throw new Exception('Failed to read ciphertext');
    }
    
    error_log("[Forge] Ciphertext size: " . strlen($ciphertext) . " bytes");
    
    // Reconstruct keypair from secret key
    $publicKey = sodium_crypto_box_publickey_from_secretkey($secretKey);
    $keypair = sodium_crypto_box_keypair_from_secretkey_and_publickey($secretKey, $publicKey);
    
    $plaintext = sodium_crypto_box_seal_open($ciphertext, $keypair);
    
    // Free ciphertext memory immediately
    unset($ciphertext);
    
    if ($plaintext === false) {
        throw new Exception('Decryption failed');
    }
    
    // Parse JSON data
    $records = json_decode($plaintext, true);
    if (!is_array($records)) {
        throw new Exception('Invalid JSON data after decryption');
    }
    
    // Debug: Log first record to verify data structure
    if (!empty($records)) {
        error_log('[Forge] First record structure: ' . json_encode($records[0] ?? 'empty'));
        error_log('[Forge] Total records to import: ' . count($records));
    }
    
    // Get slot configuration from schema to determine type
    $slotConfig = getSlotConfig($targetSlot);
    $slotType = $slotConfig['type'] ?? 'massive';
    $imageFields = getImageFields($slotConfig);
    $slugFields = getSlugFields($slotConfig);
    
    error_log("[Forge] Target slot: {$targetSlot}, Type: {$slotType}, Image fields: " . json_encode($imageFields) . ", Slug fields: " . json_encode($slugFields));
    
    // ═══════════════════════════════════════════════════════════════════════════
    // AUTOMATIC SLUG GENERATION
    // ═══════════════════════════════════════════════════════════════════════════
    // If there are slug fields with slugSource defined, auto-generate slugs
    // for records where the slug is empty but the source field has a value
    if (!empty($slugFields)) {
        $records = generateSlugsForRecords($records, $slugFields);
        error_log("[Forge] Auto-generated slugs for " . count($records) . " records");
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // SMART IMAGE PROCESSING (Optimized for shared web hosting)
    // ═══════════════════════════════════════════════════════════════════════════
    // - Small batches (≤10 images): Process synchronously (fast, no queue needed)
    // - Large batches (>10 images): Queue for background processing via piggyback
    // - Threshold configurable via FORGE_SYNC_IMAGE_THRESHOLD (default: 10)
    // ═══════════════════════════════════════════════════════════════════════════
    $imageQueueInfo = null;
    if (!empty($imageFields)) {
        // Count total images in records
        $totalImages = countImagesInRecords($records, $imageFields);
        $syncThreshold = (int)($_ENV['FORGE_SYNC_IMAGE_THRESHOLD'] ?? 10);
        
        error_log("[Forge] Found {$totalImages} images, sync threshold: {$syncThreshold}");
        
        if ($totalImages <= $syncThreshold || !$GLOBALS['FORGE_USE_ASYNC_IMAGES']) {
            // SYNC: Small batch or async disabled - process immediately
            // This is fast enough for ≤10 images (typically < 5 seconds)
            $records = processImageUrls($records, $imageFields, $imageSourceDir, $imageBaseUrl);
            error_log("[Forge] Processed {$totalImages} images synchronously");
        } else {
            // ASYNC: Large batch - queue for background processing
            // Images will be processed via piggyback on subsequent requests
            // or via explicit calls to /api/endpoints/system/queue-process.php
            $records = ForgeImageQueueService::queueImageFields(
                $records,
                $imageFields,
                $sessionId,  // Used as job ID for tracking
                $imageSourceDir,
                $imageBaseUrl
            );
            $imageQueueInfo = ForgeImageQueueService::getJobStatus($sessionId);
            error_log("[Forge] Queued {$totalImages} images for background processing (job: {$sessionId})");
        }
    }
    
    // Route import based on slot type
    switch ($slotType) {
        case 'massive':
            $importedCount = importToMassive($records, $targetSlot);
            break;
        case 'list':
            $importedCount = importToList($records, $targetSlot);
            break;
        case 'collection':
            $importedCount = importToCollection($records, $targetSlot);
            break;
        case 'object':
            $importedCount = importToObject($records, $targetSlot);
            break;
        default:
            throw new Exception("Unknown slot type: {$slotType}");
    }
    
    // Cleanup session files
    cleanupSession($sessionId, $cacheDir);
    
    // Build response with optional queue status
    $response = [
        'success' => true,
        'recordCount' => $importedCount,
        'totalRecords' => count($records),
        'slotType' => $slotType,
    ];
    
    // Add image queue info if images were queued for background processing
    if ($imageQueueInfo !== null) {
        $response['imageQueue'] = [
            'jobId' => $sessionId,
            'status' => $imageQueueInfo,
            'processUrl' => '/api/endpoints/system/queue-process.php',
            'note' => 'Images queued for background processing. They will be processed automatically on subsequent requests, or call processUrl to speed up.',
        ];
    }
    
    echo json_encode($response);
    
} catch (OptimisticLockException $e) {
    // RACE CONDITION DETECTED - Concurrent modification to target slot
    // This is NOT a bug - it's the locking system working correctly!
    // The client should retry the import (data was not lost)
    http_response_code(409); // 409 Conflict
    echo json_encode([
        'success' => false,
        'error' => 'Concurrent modification detected. Another process modified this slot during import.',
        'errorCode' => 'OPTIMISTIC_LOCK_CONFLICT',
        'details' => [
            'slotKey' => $e->slotKey,
            'lockType' => $e->lockType,
            'message' => 'Please retry the import. No data was lost.',
        ],
        'retryable' => true,
    ]);
} catch (Exception $e) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}

/**
 * Clean up session files after import
 */
function cleanupSession(string $sessionId, string $cacheDir): void {
    // Remove chunks
    $chunkDir = $cacheDir . '/chunks/' . $sessionId;
    if (is_dir($chunkDir)) {
        $files = glob($chunkDir . '/*');
        if ($files) {
            foreach ($files as $file) {
                unlink($file);
            }
        }
        rmdir($chunkDir);
    }
    
    // Remove session key
    $sessionFile = $cacheDir . '/' . $sessionId . '.key';
    if (file_exists($sessionFile)) {
        unlink($sessionFile);
    }
}

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
 * Get slug fields with their source fields from slot config
 * Returns array of ['id' => slugFieldId, 'source' => sourceFieldId]
 */
function getSlugFields(array $slotConfig): array {
    $slugFields = [];
    
    if (!isset($slotConfig['fields'])) {
        return $slugFields;
    }
    
    foreach ($slotConfig['fields'] as $field) {
        if (isset($field['type']) && $field['type'] === 'slug' && isset($field['slugSource'])) {
            $slugFields[] = [
                'id' => $field['id'],
                'source' => $field['slugSource']
            ];
        }
    }
    
    return $slugFields;
}

/**
 * Generate URL-friendly slug from text
 * Converts accented characters and spaces to ASCII-safe slug
 * Example: "A klímaváltozás veszélyei" → "a-klimavaltozas-veszelyei"
 * 
 * @param string $text Input text
 * @return string URL-friendly slug
 */
function generateSlug(string $text): string {
    if (empty($text)) {
        return '';
    }
    
    // Accent map for Hungarian and common European characters
    $accentMap = [
        // Hungarian accented letters
        'á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ö' => 'o', 'ő' => 'o', 'ú' => 'u', 'ü' => 'u', 'ű' => 'u',
        'Á' => 'a', 'É' => 'e', 'Í' => 'i', 'Ó' => 'o', 'Ö' => 'o', 'Ő' => 'o', 'Ú' => 'u', 'Ü' => 'u', 'Ű' => 'u',
        // Other accented characters
        'à' => 'a', 'â' => 'a', 'ã' => 'a', 'ä' => 'a', 'å' => 'a', 'æ' => 'ae',
        'ç' => 'c', 'è' => 'e', 'ê' => 'e', 'ë' => 'e', 'ì' => 'i', 'î' => 'i', 'ï' => 'i',
        'ñ' => 'n', 'ò' => 'o', 'ô' => 'o', 'õ' => 'o', 'ø' => 'o', 'œ' => 'oe',
        'ß' => 'ss', 'ù' => 'u', 'û' => 'u', 'ý' => 'y', 'ÿ' => 'y',
        'À' => 'a', 'Â' => 'a', 'Ã' => 'a', 'Ä' => 'a', 'Å' => 'a', 'Æ' => 'ae',
        'Ç' => 'c', 'È' => 'e', 'Ê' => 'e', 'Ë' => 'e', 'Ì' => 'i', 'Î' => 'i', 'Ï' => 'i',
        'Ñ' => 'n', 'Ò' => 'o', 'Ô' => 'o', 'Õ' => 'o', 'Ø' => 'o', 'Œ' => 'oe',
        'Ù' => 'u', 'Û' => 'u', 'Ý' => 'y',
    ];
    
    // Replace accented characters
    $slug = strtr($text, $accentMap);
    
    // Convert to lowercase
    $slug = mb_strtolower($slug, 'UTF-8');
    
    // Remove special characters, keep only alphanumeric, spaces, and hyphens
    $slug = preg_replace('/[^\w\s-]/u', '', $slug);
    
    // Replace spaces and underscores with hyphens
    $slug = preg_replace('/[\s_]+/', '-', $slug);
    
    // Remove leading/trailing hyphens
    $slug = trim($slug, '-');
    
    // Collapse multiple hyphens
    $slug = preg_replace('/-+/', '-', $slug);
    
    return $slug;
}

/**
 * Generate slugs for records where slug field is empty but source field has value
 * 
 * @param array $records Records to process
 * @param array $slugFields Array of ['id' => slugFieldId, 'source' => sourceFieldId]
 * @return array Records with generated slugs
 */
function generateSlugsForRecords(array $records, array $slugFields): array {
    foreach ($records as &$record) {
        foreach ($slugFields as $slugField) {
            $slugId = $slugField['id'];
            $sourceId = $slugField['source'];
            
            // Check if slug is empty/null and source has a value
            $slugEmpty = !isset($record[$slugId]) || $record[$slugId] === null || $record[$slugId] === '';
            $sourceHasValue = isset($record[$sourceId]) && is_string($record[$sourceId]) && $record[$sourceId] !== '';
            
            if ($slugEmpty && $sourceHasValue) {
                $record[$slugId] = generateSlug($record[$sourceId]);
                error_log("[Forge] Generated slug '{$record[$slugId]}' from '{$record[$sourceId]}'");
            }
        }
    }
    
    return $records;
}

/**
 * Count total images in records for threshold decision
 * 
 * @param array $records Records to scan
 * @param array $imageFields List of image field IDs
 * @return int Total count of non-empty image values
 */
function countImagesInRecords(array $records, array $imageFields): int {
    $count = 0;
    
    foreach ($records as $record) {
        foreach ($imageFields as $fieldId) {
            // Skip null, empty, or "null" string values
            if (!isset($record[$fieldId]) || $record[$fieldId] === null || $record[$fieldId] === '' || $record[$fieldId] === 'null') {
                continue;
            }
            
            $imageUrl = (string)$record[$fieldId];
            
            // Skip already local images
            if (!str_starts_with($imageUrl, '/api/uploads/')) {
                $count++;
            }
        }
    }
    
    return $count;
}

/**
 * Process image URLs in records
 * Downloads external images and re-uploads to local storage
 * Handles URL-based images like /uploads/wp-content/04/valami.webp
 * 
 * @param array $records Records to process
 * @param array $imageFields List of field IDs that contain images
 * @param string|null $imageSourceDir Optional custom directory to search for images
 * @return array Processed records with updated image paths
 */
function processImageUrls(array $records, array $imageFields, ?string $imageSourceDir = null, ?string $imageBaseUrl = null): array {
    $uploadDir = $_ENV['UPLOAD_DIR'] ?? __DIR__ . '/../../uploads/';
    $defaultSearchDir = __DIR__ . '/../../';
    
    foreach ($records as &$record) {
        foreach ($imageFields as $fieldId) {
            // Skip null, empty, or "null" string values  
            if (!isset($record[$fieldId]) || $record[$fieldId] === null || $record[$fieldId] === '' || $record[$fieldId] === 'null') {
                // Ensure null is properly set for empty image fields
                $record[$fieldId] = null;
                continue;
            }
            
            $imageUrl = (string)$record[$fieldId];
            
            // Double-check for null-like values after string cast
            if (empty($imageUrl) || $imageUrl === 'null') {
                $record[$fieldId] = null;
                continue;
            }
            
            // Debug: Log what image value we're processing
            error_log("[Forge] Processing image field '{$fieldId}' with value: {$imageUrl}");
            
            // Skip already local images (already in /api/uploads/)
            if (str_starts_with($imageUrl, '/api/uploads/')) {
                continue;
            }
            
            // Try to resolve and copy the image from various locations
            $resolvedPath = resolveImagePath($imageUrl, $imageSourceDir, $defaultSearchDir);
            
            if ($resolvedPath !== null && file_exists($resolvedPath)) {
                $newPath = copyImageToUploads($resolvedPath, $uploadDir);
                if ($newPath !== null) {
                    $record[$fieldId] = $newPath;
                    error_log("[Forge] Migrated image: {$imageUrl} -> {$newPath}");
                    continue;
                }
            }
            
            // Handle external URLs (https://...)
            if (str_starts_with($imageUrl, 'http://') || str_starts_with($imageUrl, 'https://')) {
                $downloaded = downloadExternalImage($imageUrl, $uploadDir);
                if ($downloaded) {
                    $record[$fieldId] = $downloaded;
                    error_log("[Forge] Downloaded external image: {$imageUrl} -> {$downloaded}");
                }
                continue;
            }
            
            // Handle relative paths with imageBaseUrl
            // E.g., "../../assets/images/products/IMG_2202.webp" with baseUrl "https://stellapekseg.hu/assets/images/products/"
            if ($imageBaseUrl !== null && !empty($imageUrl)) {
                // Extract just the filename from relative path
                $filename = basename($imageUrl);
                
                // Build full URL: baseUrl + filename
                $fullUrl = rtrim($imageBaseUrl, '/') . '/' . $filename;
                
                error_log("[Forge] Trying remote URL from baseUrl: {$fullUrl}");
                
                $downloaded = downloadExternalImage($fullUrl, $uploadDir);
                if ($downloaded) {
                    $record[$fieldId] = $downloaded;
                    error_log("[Forge] Downloaded remote image: {$fullUrl} -> {$downloaded}");
                    continue;
                }
            }
            
            // If we couldn't process the image, log a warning
            error_log("[Forge] WARNING: Could not process image: {$imageUrl}");
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
    
    // Generate unique filename with original name for readability
    $timestamp = time();
    $uniqueId = bin2hex(random_bytes(4)); // 8 char hex
    $cleanBasename = preg_replace('/[^a-zA-Z0-9._-]/', '', basename($sourcePath));
    $newFilename = "forge-{$timestamp}-{$uniqueId}.{$extension}";
    
    // Ensure upload directory exists (no year/month subdirs - flat structure)
    if (!is_dir($uploadDir)) {
        if (!mkdir($uploadDir, 0755, true)) {
            error_log("[Forge] Failed to create directory: {$uploadDir}");
            return null;
        }
    }
    
    $newPath = rtrim($uploadDir, '/') . '/' . $newFilename;
    if (copy($sourcePath, $newPath)) {
        return '/api/uploads/' . $newFilename;
    }
    
    error_log("[Forge] Failed to copy image: {$sourcePath} -> {$newPath}");
    return null;
}

/**
 * Download external image and save to uploads
 */
function downloadExternalImage(string $url, string $uploadDir): ?string {
    // Log the attempt
    error_log("[Forge] Attempting to download: {$url}");
    
    // Check if allow_url_fopen is enabled
    if (!ini_get('allow_url_fopen')) {
        error_log("[Forge] ERROR: allow_url_fopen is disabled in PHP - cannot download remote images");
        return null;
    }
    
    $context = stream_context_create([
        'http' => [
            'timeout' => 30, // Increased timeout for slower servers
            'user_agent' => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'follow_location' => true,
            'max_redirects' => 5,
            'header' => [
                'Accept: image/*,*/*;q=0.9',
                'Accept-Language: hu-HU,hu;q=0.9,en;q=0.8',
            ],
        ],
        'ssl' => [
            'verify_peer' => false, // Some old sites have bad certificates
            'verify_peer_name' => false,
        ],
    ]);
    
    $imageData = @file_get_contents($url, false, $context);
    if ($imageData === false) {
        // Get more error details
        $error = error_get_last();
        error_log("[Forge] Failed to download image: {$url}");
        if ($error) {
            error_log("[Forge] PHP Error: " . $error['message']);
        }
        // Check HTTP response headers if available
        if (isset($http_response_header)) {
            error_log("[Forge] HTTP Response: " . implode(', ', $http_response_header));
        }
        return null;
    }
    
    error_log("[Forge] Downloaded {$url}: " . strlen($imageData) . " bytes");
    
    // Detect extension from URL or content-type
    $parsedUrl = parse_url($url);
    $extension = pathinfo($parsedUrl['path'] ?? '', PATHINFO_EXTENSION);
    $extension = strtolower($extension) ?: 'webp';
    
    // Validate extension
    $allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif'];
    if (!in_array($extension, $allowedExtensions)) {
        $extension = 'webp'; // Default
    }
    
    // Generate unique filename (flat structure, no year/month subdirs)
    $timestamp = time();
    $uniqueId = bin2hex(random_bytes(4));
    $filename = "forge-{$timestamp}-{$uniqueId}.{$extension}";
    
    // Ensure upload directory exists
    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0755, true);
    }
    
    $filePath = rtrim($uploadDir, '/') . '/' . $filename;
    if (file_put_contents($filePath, $imageData)) {
        error_log("[Forge] Downloaded image: {$url} -> {$filePath} (" . strlen($imageData) . " bytes)");
        return '/api/uploads/' . $filename;
    }
    
    error_log("[Forge] Failed to save downloaded image: {$filePath}");
    return null;
}

/**
 * Import records to Massive slot (large datasets)
 */
function importToMassive(array $records, string $targetSlot): int {
    MassiveDatabase::ensureTable($targetSlot);
    
    $db = MassiveDatabase::getInstance();
    $tableName = 'massive_' . preg_replace('/[^a-zA-Z0-9_]/', '', $targetSlot);
    
    $db->beginTransaction();
    $importedCount = 0;
    
    try {
        $stmt = $db->prepare("INSERT OR REPLACE INTO {$tableName} (id, data) VALUES (?, ?)");
        
        foreach ($records as $record) {
            $sourceId = null;
            if (isset($record['id']) && is_numeric($record['id'])) {
                $sourceId = (int) $record['id'];
                unset($record['id']);
            }
            
            $jsonData = json_encode($record, JSON_UNESCAPED_UNICODE);
            
            if ($sourceId !== null) {
                $stmt->execute([$sourceId, $jsonData]);
            } else {
                $stmtAuto = $db->prepare("INSERT INTO {$tableName} (data) VALUES (?)");
                $stmtAuto->execute([$jsonData]);
            }
            
            $importedCount++;
        }
        
        $db->commit();
    } catch (Exception $e) {
        $db->rollBack();
        throw new Exception('Massive import failed: ' . $e->getMessage());
    }
    
    return $importedCount;
}

/**
 * Import records to List slot
 * Appends items to existing list array
 * 
 * RACE CONDITION FIX (2026-01-07):
 * Uses optimistic locking via content hash to prevent "last write wins" bug.
 * If concurrent import modifies the list, throws OptimisticLockException.
 * 
 * @throws OptimisticLockException If concurrent modification detected
 */
function importToList(array $records, string $targetSlot): int {
    global $GLOBALS;
    $useOptimisticLocking = $GLOBALS['FORGE_USE_OPTIMISTIC_LOCKING'] ?? true;
    
    // Get current data WITH version hash for optimistic locking
    $slotInfo = ContentDatabase::getSlotWithVersion($targetSlot);
    $existingData = $slotInfo['data'] ?? [];
    $expectedHash = $slotInfo['hash'] ?? null;
    
    // Ensure it's an array
    if (!is_array($existingData)) {
        $existingData = [];
    }
    
    // Find max ID in existing data
    $maxId = 0;
    foreach ($existingData as $item) {
        if (isset($item['id']) && is_numeric($item['id'])) {
            $maxId = max($maxId, (int) $item['id']);
        }
    }
    
    // Assign new IDs to imported records and append
    foreach ($records as $record) {
        if (!isset($record['id']) || !is_numeric($record['id'])) {
            $maxId++;
            $record['id'] = $maxId;
        } else {
            $maxId = max($maxId, (int) $record['id']);
        }
        $existingData[] = $record;
    }
    
    // Save with optimistic locking - throws if concurrent modification
    $saveOptions = [
        'slot_type' => 'list',
        'changed_by' => 'forge-import',
    ];
    
    if ($useOptimisticLocking && $expectedHash !== null) {
        $saveOptions['expected_hash'] = $expectedHash;
    }
    
    ContentDatabase::saveSlot($targetSlot, $existingData, $saveOptions);
    
    return count($records);
}

/**
 * Import records to Collection slot
 * Similar to list but for collection-type items
 * 
 * RACE CONDITION FIX (2026-01-07):
 * Uses optimistic locking via content hash to prevent "last write wins" bug.
 * 
 * @throws OptimisticLockException If concurrent modification detected
 */
function importToCollection(array $records, string $targetSlot): int {
    global $GLOBALS;
    $useOptimisticLocking = $GLOBALS['FORGE_USE_OPTIMISTIC_LOCKING'] ?? true;
    
    // Get current data WITH version hash for optimistic locking
    $slotInfo = ContentDatabase::getSlotWithVersion($targetSlot);
    $existingData = $slotInfo['data'] ?? [];
    $expectedHash = $slotInfo['hash'] ?? null;
    
    if (!is_array($existingData)) {
        $existingData = [];
    }
    
    // Find max ID
    $maxId = 0;
    foreach ($existingData as $item) {
        if (isset($item['id']) && is_numeric($item['id'])) {
            $maxId = max($maxId, (int) $item['id']);
        }
    }
    
    // Append records with proper IDs
    foreach ($records as $record) {
        if (!isset($record['id']) || !is_numeric($record['id'])) {
            $maxId++;
            $record['id'] = $maxId;
        } else {
            $maxId = max($maxId, (int) $record['id']);
        }
        $existingData[] = $record;
    }
    
    // Save with optimistic locking - throws if concurrent modification
    $saveOptions = [
        'slot_type' => 'collection',
        'changed_by' => 'forge-import',
    ];
    
    if ($useOptimisticLocking && $expectedHash !== null) {
        $saveOptions['expected_hash'] = $expectedHash;
    }
    
    ContentDatabase::saveSlot($targetSlot, $existingData, $saveOptions);
    
    return count($records);
}

/**
 * Import to Object slot
 * For single object, we merge/replace the entire object
 * 
 * RACE CONDITION FIX (2026-01-07):
 * Uses optimistic locking via content hash to prevent "last write wins" bug.
 * 
 * @throws OptimisticLockException If concurrent modification detected
 */
function importToObject(array $records, string $targetSlot): int {
    global $GLOBALS;
    $useOptimisticLocking = $GLOBALS['FORGE_USE_OPTIMISTIC_LOCKING'] ?? true;
    
    // For object import, take the first record only (or merge all)
    if (empty($records)) {
        return 0;
    }
    
    // Get current data WITH version hash for optimistic locking
    $slotInfo = ContentDatabase::getSlotWithVersion($targetSlot);
    $expectedHash = $slotInfo['hash'] ?? null;
    
    // If single record, use it directly
    // If multiple records, merge them (later records override earlier)
    $objectData = [];
    foreach ($records as $record) {
        $objectData = array_merge($objectData, $record);
    }
    
    // Save with optimistic locking - throws if concurrent modification
    $saveOptions = [
        'slot_type' => 'object',
        'changed_by' => 'forge-import',
    ];
    
    if ($useOptimisticLocking && $expectedHash !== null) {
        $saveOptions['expected_hash'] = $expectedHash;
    }
    
    ContentDatabase::saveSlot($targetSlot, $objectData, $saveOptions);
    
    return 1; // Object counts as one item
}

/**
 * Decode base64 from file to file (memory-efficient)
 * 
 * Uses PHP stream filters to decode base64 content without loading
 * the entire file into memory. This is critical for large imports
 * where the base64 data can be 100MB+.
 * 
 * @param string $inputFile Path to base64-encoded file
 * @param string $outputFile Path to write decoded binary data
 * @throws Exception If file operations fail
 */
function decodeBase64FileToFile(string $inputFile, string $outputFile): void {
    $inHandle = fopen($inputFile, 'rb');
    if ($inHandle === false) {
        throw new Exception('Failed to open input file for base64 decode');
    }
    
    $outHandle = fopen($outputFile, 'wb');
    if ($outHandle === false) {
        fclose($inHandle);
        throw new Exception('Failed to create output file for base64 decode');
    }
    
    try {
        // Add base64 decode filter to the input stream
        // This automatically decodes as we read, avoiding memory accumulation
        $filter = stream_filter_append($inHandle, 'convert.base64-decode', STREAM_FILTER_READ);
        if ($filter === false) {
            throw new Exception('Failed to attach base64 decode filter');
        }
        
        // Process in chunks (64KB is a good balance)
        $chunkSize = 65536;
        
        while (!feof($inHandle)) {
            $chunk = fread($inHandle, $chunkSize);
            if ($chunk === false) {
                break;
            }
            if (fwrite($outHandle, $chunk) === false) {
                throw new Exception('Failed to write decoded data');
            }
        }
        
    } finally {
        fclose($inHandle);
        fclose($outHandle);
    }
}
