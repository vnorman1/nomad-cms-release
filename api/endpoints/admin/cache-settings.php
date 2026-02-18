<?php
/**
 * NOMAD CMS - Cache Settings Endpoint
 * 
 * Admin-only endpoint to manage static cache settings.
 * 
 * GET  /api/endpoints/admin/cache-settings.php - Get current settings
 * POST /api/endpoints/admin/cache-settings.php - Update settings
 *      Body: { "cache.enabled": "true", ... }
 * 
 * Response:
 * {
 *   "success": true,
 *   "settings": { "cache.enabled": "true", ... }
 * }
 */

declare(strict_types=1);

require_once __DIR__ . '/../../bootstrap.php';

use NomadCMS\Middleware\AuthMiddleware;
use NomadCMS\Middleware\CSRFMiddleware;
use NomadCMS\Services\CacheSettingsService;

// Handle CORS preflight
handlePreflight();

header('Content-Type: application/json');

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

$method = $_SERVER['REQUEST_METHOD'];

try {
    $cacheSettings = CacheSettingsService::getInstance();
    
    switch ($method) {
        case 'GET':
            // Return current settings
            $settings = $cacheSettings->getAllSettings();
            
            echo json_encode([
                'success' => true,
                'settings' => $settings,
            ], JSON_UNESCAPED_UNICODE);
            break;
            
        case 'POST':
            // Update settings
            $body = json_decode(file_get_contents('php://input'), true);
            
            if (!is_array($body)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Invalid request body']);
                exit;
            }
            
            // Allowed setting keys
            $allowedKeys = [
                'cache.enabled',
                'cache.maxSize',
                'cache.bundleMaxSlotSize',
                'cache.bundleMaxTotalSize',
                'cache.debounceSeconds',
                'cache.generateBundle',
                'cache.generateSlotFiles',
            ];
            
            $updated = [];
            
            foreach ($body as $key => $value) {
                if (!in_array($key, $allowedKeys, true)) {
                    continue; // Skip unknown keys
                }
                
                // Validate values
                if (in_array($key, ['cache.enabled', 'cache.generateBundle', 'cache.generateSlotFiles'])) {
                    $value = ($value === 'true' || $value === true) ? 'true' : 'false';
                } elseif (in_array($key, ['cache.maxSize', 'cache.bundleMaxSlotSize', 'cache.bundleMaxTotalSize'])) {
                    $value = (string) max(0, (int) $value);
                } elseif ($key === 'cache.debounceSeconds') {
                    $value = (string) max(0, (float) $value);
                }
                
                $cacheSettings->setSetting($key, (string) $value);
                $updated[$key] = $value;
            }
            
            echo json_encode([
                'success' => true,
                'updated' => $updated,
                'settings' => $cacheSettings->getAllSettings(),
            ], JSON_UNESCAPED_UNICODE);
            break;
            
        default:
            http_response_code(405);
            echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    }
    
} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => ($_ENV['APP_DEBUG'] ?? 'false') === 'true' 
            ? $e->getMessage() 
            : 'Internal server error',
    ]);
}
