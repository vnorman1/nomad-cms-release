<?php
/**
 * NOMAD CMS - Updates Force Refresh Endpoint
 * 
 * POST /api/updates/refresh - Force refresh all update data
 * 
 * Strategy:
 *   1. Clear local cache (storage/cache/updates)
 *   2. Fetch from raw.githubusercontent.com first (always latest)
 *   3. If GitHub rate-limited → purge jsDelivr + fetch from CDN
 *   4. Rebuild all caches with fresh data
 * 
 * This ensures the user always gets the absolute latest updates,
 * announcements, and changelogs regardless of CDN cache state.
 * 
 * Rate limited to 5 requests per 5 minutes to prevent abuse.
 * 
 * @package NomadCMS
 * @since 2.4.0
 */

declare(strict_types=1);

require_once __DIR__ . '/../../bootstrap.php';

use NomadCMS\Ai\UpdateService;
use NomadCMS\Middleware\AuthMiddleware;
use NomadCMS\Middleware\RateLimitMiddleware;

// CORS
handlePreflight();

// Stricter rate limit for force refresh (5 per 5 minutes)
RateLimitMiddleware::check('updates-refresh', 5, 300);

session_start();
AuthMiddleware::requireAuth();

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed. Use POST.']);
    exit;
}

try {
    error_log('Updates force refresh requested by user');

    $results = UpdateService::forceRefreshAll();

    // Determine overall success
    $allOk = ($results['cache_cleared'] === true)
        && ($results['refetched']['meta'] ?? '') === 'ok'
        && ($results['refetched']['changelog_index'] ?? '') === 'ok';

    echo json_encode([
        'success' => true,
        'message' => $allOk 
            ? 'Frissítések sikeresen újratöltve a forrásból' 
            : 'Frissítés részben sikeres - egyes források nem elérhetőek',
        'details' => [
            'cache_cleared' => $results['cache_cleared'],
            'sources_refreshed' => $results['refetched'],
            'changelog_files_refreshed' => count($results['changelog_files'] ?? []),
            'cdn_purged' => !empty($results['cdn_purged']),
            'duration_ms' => $results['duration_ms'],
        ],
    ]);

} catch (\Exception $e) {
    error_log('Updates force refresh error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $_ENV['APP_DEBUG'] === 'true' ? $e->getMessage() : 'Refresh failed',
    ]);
}
