<?php
/**
 * NOMAD CMS - Updates Changelog Endpoint
 * 
 * GET  /api/updates/changelog           - Get changelog index
 * GET  /api/updates/changelog?file=...  - Get specific changelog content
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
    $file = $_GET['file'] ?? null;

    if ($file) {
        // Get specific changelog markdown
        $content = UpdateService::getChangelog($file);

        if ($content === null) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Changelog not found']);
            exit;
        }

        echo json_encode([
            'success' => true,
            'content' => $content,
            'file' => basename($file),
        ]);
    } else {
        // Get changelog index
        $index = UpdateService::getChangelogIndex();

        if ($index === null) {
            echo json_encode([
                'success' => true,
                'entries' => [],
                'error' => 'Could not fetch changelog index',
            ]);
            exit;
        }

        echo json_encode([
            'success' => true,
            'latest_version' => $index['latest_version'] ?? null,
            'entries' => $index['entries'] ?? [],
        ]);
    }

} catch (\Exception $e) {
    error_log('Changelog endpoint error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $_ENV['APP_DEBUG'] === 'true' ? $e->getMessage() : 'Internal server error',
    ]);
}
