<?php
/**
 * NOMAD CMS - Updates Meta Endpoint
 * 
 * GET /api/updates/meta - Get update hub meta info (version check)
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

RateLimitMiddleware::check('updates', 60, 60);

session_start();
AuthMiddleware::requireAuth();

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

try {
    $meta = UpdateService::getMeta();

    echo json_encode([
        'success' => true,
        'meta' => $meta,
    ]);

} catch (\Exception $e) {
    error_log('Updates meta endpoint error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $_ENV['APP_DEBUG'] === 'true' ? $e->getMessage() : 'Internal server error',
    ]);
}
