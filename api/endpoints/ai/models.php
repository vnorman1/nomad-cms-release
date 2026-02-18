<?php
/**
 * NOMAD CMS - AI Models Endpoint
 * 
 * Returns available AI models from the model registry.
 * Supports force refresh for admins.
 * 
 * GET  /api/ai/models          - List all models
 * GET  /api/ai/models?active=1 - List only active models
 * POST /api/ai/models/refresh  - Force refresh from CDN (admin only)
 * 
 * @package NomadCMS
 * @since 2.4.0
 */

declare(strict_types=1);

require_once __DIR__ . '/../../bootstrap.php';

use NomadCMS\Ai\AIModelRegistry;
use NomadCMS\Middleware\AuthMiddleware;
use NomadCMS\Middleware\RateLimitMiddleware;

// CORS
handlePreflight();

// Rate limit
RateLimitMiddleware::check('ai_models', 60, 60); // 60 requests per minute

// Require authentication
session_start();
$currentUser = AuthMiddleware::requireAuth();

header('Content-Type: application/json');

$method = $_SERVER['REQUEST_METHOD'];

try {
    if ($method === 'GET') {
        $activeOnly = isset($_GET['active']) && $_GET['active'] === '1';

        $models = $activeOnly
            ? AIModelRegistry::getActiveModels()
            : AIModelRegistry::getModels();

        $registry = AIModelRegistry::getRegistry();

        echo json_encode([
            'success' => true,
            'models' => $models,
            'default_model' => AIModelRegistry::getDefaultModel(),
            'providers' => AIModelRegistry::getProviders(),
            'version' => $registry['version'] ?? 'unknown',
            'updated_at' => $registry['updated_at'] ?? null,
            'status_descriptions' => $registry['status_descriptions'] ?? [],
            'cache' => AIModelRegistry::getCacheStatus(),
        ]);

    } elseif ($method === 'POST') {
        // Force refresh - admin only
        if (!$currentUser->is_admin) {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'Admin access required']);
            exit;
        }

        $result = AIModelRegistry::forceRefresh();

        echo json_encode([
            'success' => $result['success'],
            'message' => $result['success']
                ? 'Model registry refreshed from CDN'
                : 'CDN not reachable, using cached data',
            'source' => $result['source'] ?? 'unknown',
            'models_count' => $result['models_count'] ?? null,
        ]);

    } else {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    }

} catch (\Exception $e) {
    error_log('AI Models endpoint error: ' . $e->getMessage());

    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $_ENV['APP_DEBUG'] === 'true' ? $e->getMessage() : 'Internal server error',
    ]);
}
