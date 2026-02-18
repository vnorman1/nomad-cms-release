<?php
/**
 * NOMAD CMS - Static Content Server with ETag Support
 * 
 * Lightweight endpoint for serving cached static content
 * with ETag validation for efficient cache revalidation.
 * 
 * Routes (via Router):
 *   GET /api/static/{slot}           → Full slot data (all items combined)
 *   GET /api/static/{slot}/{item}    → Single item from slot
 * 
 * Legacy:
 *   GET /api/endpoints/static-serve.php?slot={slot}&item={item}
 * 
 * Cache Structure (per-slot folders):
 *   /static/content/{slot}/manifest.json    - Slot metadata
 *   /static/content/{slot}/{identifier}.json - Individual items
 * 
 * Response headers:
 * - ETag: Content hash for cache validation
 * - Cache-Control: public, max-age=3600, must-revalidate
 * 
 * Returns 304 Not Modified if client ETag matches
 */

declare(strict_types=1);

// Handle CORS preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, OPTIONS');
    header('Access-Control-Allow-Headers: If-None-Match');
    header('Access-Control-Max-Age: 86400');
    http_response_code(204);
    exit;
}

// Set CORS headers for all responses
header('Access-Control-Allow-Origin: *');
header('Access-Control-Expose-Headers: ETag, Last-Modified, X-Cache-Status');

// Load bootstrap for rate limiting (minimal overhead)
require_once __DIR__ . '/../bootstrap.php';

use NomadCMS\Middleware\RateLimitMiddleware;
use NomadCMS\Config\Security;

// Apply rate limiting: 300 requests per minute per IP (generous for static content)
$settings = Security::getRateLimitSettings()['static_serve'];
RateLimitMiddleware::check(
    key: 'static:' . ($_SERVER['REMOTE_ADDR'] ?? 'unknown'),
    maxRequests: $settings['max'],
    windowSeconds: $settings['window']
);

// Get parameters
$slot = $_GET['slot'] ?? '';
$item = $_GET['item'] ?? null;  // Optional: specific item identifier

// Validate slot name (alphanumeric, underscore, dash only)
if (empty($slot) || 
    !preg_match('/^[a-zA-Z0-9_\-]+$/', $slot) ||
    str_contains($slot, '..') ||
    str_contains($slot, '/') ||
    str_contains($slot, '\\')) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode([
        'success' => false, 
        'error' => 'Invalid or missing slot parameter'
    ]);
    exit;
}

// Validate item name if provided
if ($item !== null && (
    !preg_match('/^[a-zA-Z0-9_\-\.]+$/', $item) ||
    str_contains($item, '..'))
) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode([
        'success' => false, 
        'error' => 'Invalid item parameter'
    ]);
    exit;
}

// Cache paths - NEW folder structure
$cacheDir = __DIR__ . '/../static/content/';
$slotDir = $cacheDir . $slot . '/';
$manifestPath = $slotDir . 'manifest.json';

// Check if slot directory exists
if (!is_dir($slotDir)) {
    http_response_code(404);
    header('Content-Type: application/json');
    echo json_encode([
        'success' => false, 
        'error' => 'Content not found in cache',
        'slot' => $slot
    ]);
    exit;
}

// Determine what to serve
if ($item !== null) {
    // Serve specific item
    $filepath = $slotDir . $item . '.json';
    
    if (!file_exists($filepath)) {
        http_response_code(404);
        header('Content-Type: application/json');
        echo json_encode([
            'success' => false, 
            'error' => 'Item not found in cache',
            'slot' => $slot,
            'item' => $item
        ]);
        exit;
    }
} else {
    // Serve full slot data - combine all items
    $filepath = null;
    $allData = [];
    
    // Read manifest first
    $manifest = null;
    if (file_exists($manifestPath)) {
        $manifestContent = file_get_contents($manifestPath);
        $manifest = json_decode($manifestContent, true);
    }
    
    // Get all JSON files in the slot directory (except manifest)
    $files = glob($slotDir . '*.json');
    $latestMtime = 0;
    
    foreach ($files as $file) {
        $filename = basename($file, '.json');
        
        // Skip manifest
        if ($filename === 'manifest') {
            continue;
        }
        
        $content = file_get_contents($file);
        $data = json_decode($content, true);
        
        if ($data !== null) {
            $allData[$filename] = $data;
        }
        
        // Track latest modification time
        $mtime = filemtime($file);
        if ($mtime > $latestMtime) {
            $latestMtime = $mtime;
        }
    }
    
    // If no items found, check if it's an object type slot
    if (empty($allData) && $manifest) {
        http_response_code(404);
        header('Content-Type: application/json');
        echo json_encode([
            'success' => false, 
            'error' => 'No cached content available',
            'slot' => $slot
        ]);
        exit;
    }
    
    // Determine slot type from manifest
    $slotType = $manifest['type'] ?? 'collection';
    
    // Prepare response based on slot type
    if ($slotType === 'object' && count($allData) === 1) {
        // Object type: return single item directly
        $responseData = reset($allData);
    } else {
        // Collection/list type: return all items as array
        $responseData = array_values($allData);
    }
    
    // Generate ETag from combined data
    $etag = '"' . md5(json_encode($responseData)) . '"';
    
    // Check If-None-Match header
    $clientEtag = $_SERVER['HTTP_IF_NONE_MATCH'] ?? '';
    if ($clientEtag === $etag) {
        http_response_code(304);
        header('Cache-Control: public, max-age=3600, must-revalidate');
        header('ETag: ' . $etag);
        exit;
    }
    
    // Serve combined content
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: public, max-age=3600, must-revalidate');
    header('X-Content-Type-Options: nosniff');
    header('X-Cache-Status: HIT');
    header('ETag: ' . $etag);
    
    if ($latestMtime > 0) {
        header('Last-Modified: ' . gmdate('D, d M Y H:i:s', $latestMtime) . ' GMT');
    }
    
    echo json_encode([
        'success' => true,
        'data' => $responseData,
        'cached_at' => $manifest['updated_at'] ?? date('c'),
        'slot' => $slot,
        'item_count' => count($allData)
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// Serving single item file
$mtime = filemtime($filepath);
$content = file_get_contents($filepath);
$etag = '"' . md5($content) . '"';

// Check If-None-Match header
$clientEtag = $_SERVER['HTTP_IF_NONE_MATCH'] ?? '';
if ($clientEtag === $etag) {
    http_response_code(304);
    header('Cache-Control: public, max-age=3600, must-revalidate');
    header('ETag: ' . $etag);
    exit;
}

// Serve the cached content
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=3600, must-revalidate');
header('X-Content-Type-Options: nosniff');
header('X-Cache-Status: HIT');
header('ETag: ' . $etag);

if ($mtime) {
    header('Last-Modified: ' . gmdate('D, d M Y H:i:s', $mtime) . ' GMT');
}

// Wrap in standard response format
$data = json_decode($content, true);
echo json_encode([
    'success' => true,
    'data' => $data,
    'cached_at' => date('c', $mtime),
    'slot' => $slot,
    'item' => $item
], JSON_UNESCAPED_UNICODE);
