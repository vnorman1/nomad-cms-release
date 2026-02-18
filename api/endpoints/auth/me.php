<?php
/**
 * NOMAD CMS - Current User Endpoint
 * Get current authenticated user info
 */

declare(strict_types=1);

require_once __DIR__ . '/../../bootstrap.php';

use NomadCMS\Auth\WebAuthnService;
use NomadCMS\Database\AuthDatabase;
use NomadCMS\Database\UserRepository;
use NomadCMS\Middleware\AuthMiddleware;

// CORS
handlePreflight();

// Only accept GET
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

try {
    $currentUser = AuthMiddleware::requireAuth(true);
    
    AuthDatabase::getInstance();
    $user = UserRepository::findByUuid($currentUser->uuid);
    
    if (!$user) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'User not found']);
        exit;
    }
    
    // Get passkey count
    $passkeys = WebAuthnService::getUserCredentials($user['id']);
    
    http_response_code(200);
    header('Content-Type: application/json');
    echo json_encode([
        'success' => true,
        'user' => [
            'uuid' => $user['uuid'],
            'email' => $user['email'],
            'is_admin' => (bool) $user['is_admin'],
            'is_new_user' => (bool) ($user['is_new_user'] ?? false),
            'email_verified' => (bool) $user['email_verified'],
            'totp_enabled' => (bool) $user['totp_enabled'],
            'passkey_count' => count($passkeys),
            'created_at' => $user['created_at'],
            'last_login_at' => $user['last_login_at'],
        ],
        'passkeys' => array_map(fn($p) => [
            'id' => $p['id'],
            'friendly_name' => $p['friendly_name'],
            'created_at' => $p['created_at'],
            'last_used_at' => $p['last_used_at'],
        ], $passkeys),
    ]);
    
} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $_ENV['APP_DEBUG'] === 'true' ? $e->getMessage() : 'Internal server error',
    ]);
}
