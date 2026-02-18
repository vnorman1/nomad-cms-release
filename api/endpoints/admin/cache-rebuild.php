<?php
/**
 * NOMAD CMS - Cache Rebuild Endpoint
 * 
 * Admin-only endpoint to rebuild all static cache files.
 * Useful after database restore, migration, or manual data changes.
 * 
 * POST /api/endpoints/admin/cache-rebuild.php
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Rebuilt 42 cache files",
 *   "count": 42,
 *   "errors": 0,
 *   "stats": { ... }
 * }
 */

declare(strict_types=1);

require_once __DIR__ . '/../../bootstrap.php';

use NomadCMS\Middleware\AuthMiddleware;
use NomadCMS\Middleware\CSRFMiddleware;
use NomadCMS\Services\StaticCacheService;

// Handle CORS preflight
handlePreflight();

header('Content-Type: application/json');

// Only POST allowed
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

// Require admin authentication
try {
    CSRFMiddleware::validateForSession();
    AuthMiddleware::requireAuth();
    AuthMiddleware::requirePermission('admin');
} catch (\Exception $e) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Unauthorized']);
    exit;
}

// Check for optional clear parameter
$clearFirst = ($_GET['clear'] ?? '') === '1';

try {
    // Optionally clear all cache first
    if ($clearFirst) {
        $cleared = StaticCacheService::clearAll();
        error_log("[CacheRebuild] Cleared {$cleared} cache files");
    }
    
    // Rebuild all caches
    $result = StaticCacheService::rebuildAll();
    
    // Get updated stats
    $stats = StaticCacheService::getStats();
    
    echo json_encode([
        'success' => true,
        'message' => "Rebuilt {$result['count']} cache files",
        'count' => $result['count'],
        'errors' => $result['errors'],
        'cleared' => $clearFirst ? ($cleared ?? 0) : null,
        'stats' => $stats,
    ], JSON_UNESCAPED_UNICODE);
    
} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => ($_ENV['APP_DEBUG'] ?? 'false') === 'true' 
            ? $e->getMessage() 
            : 'Cache rebuild failed',
    ]);
}
