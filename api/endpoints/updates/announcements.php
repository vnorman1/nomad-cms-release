<?php
/**
 * NOMAD CMS - Updates Announcements Endpoint
 * 
 * GET  /api/updates/announcements                     - Get active announcements
 * POST /api/updates/announcements/dismiss  {id: "..."} - Dismiss an announcement
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
$currentUser = AuthMiddleware::requireAuth();

header('Content-Type: application/json');

$method = $_SERVER['REQUEST_METHOD'];

try {
    $userUuid = $currentUser->uuid;

    if ($method === 'GET') {
        $announcements = UpdateService::getActiveAnnouncementsForUser($userUuid);

        echo json_encode([
            'success' => true,
            'active' => $announcements['active'],
            'announcements' => $announcements['announcements'],
        ]);

    } elseif ($method === 'POST') {
        $body = json_decode(file_get_contents('php://input'), true);
        $announcementId = $body['id'] ?? null;

        if (!$announcementId || !is_string($announcementId)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Announcement ID required']);
            exit;
        }

        // Validate that the announcement ID actually exists
        if (!UpdateService::isValidAnnouncementId($announcementId)) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Announcement not found']);
            exit;
        }

        UpdateService::dismissAnnouncement($userUuid, $announcementId);

        echo json_encode([
            'success' => true,
            'message' => 'Announcement dismissed',
        ]);

    } else {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    }

} catch (\Exception $e) {
    error_log('Announcements endpoint error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $_ENV['APP_DEBUG'] === 'true' ? $e->getMessage() : 'Internal server error',
    ]);
}
