<?php
/**
 * NOMAD CMS - System Logs API
 * Admin-only endpoint for viewing and managing logs
 */

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';
handlePreflight();

require_once dirname(__DIR__, 2) . '/src/Middleware/AuthMiddleware.php';
require_once dirname(__DIR__, 2) . '/src/Services/LoggerService.php';

use NomadCMS\Middleware\AuthMiddleware;
use NomadCMS\Services\LoggerService;

header('Content-Type: application/json');

// Authenticate - require admin
$user = AuthMiddleware::requireAuth();
AuthMiddleware::requireAdmin();

$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        // Get logs with optional filters
        $level = $_GET['level'] ?? null;
        $search = $_GET['search'] ?? null;
        $limit = (int) ($_GET['limit'] ?? 100);
        $offset = (int) ($_GET['offset'] ?? 0);
        
        $result = LoggerService::readLogs($level, $search, $limit, $offset);
        $stats = LoggerService::getStats();
        
        echo json_encode([
            'success' => true,
            'logs' => $result['logs'],
            'total' => $result['total'],
            'hasMore' => $result['hasMore'],
            'stats' => $stats,
        ]);
        break;

    case 'DELETE':
        // Clear logs (admin only - already verified)
        try {
            $success = LoggerService::clearLogs();
            
            // Note: We don't log immediately after clearing to avoid handler issues
            // The next request will log the cleared state naturally
            
            echo json_encode([
                'success' => $success,
                'message' => $success ? 'Napló törölve' : 'Hiba a napló törlésénél',
            ]);
        } catch (\Throwable $e) {
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => 'Hiba a napló törlésénél: ' . $e->getMessage(),
            ]);
        }
        break;

    default:
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Method not allowed']);
}
