<?php
/**
 * NOMAD CMS - Logout Endpoint
 * Revokes refresh tokens and clears session
 */

declare(strict_types=1);

require_once __DIR__ . '/../../bootstrap.php';

use NomadCMS\Database\AuthDatabase;
use NomadCMS\Middleware\AuthMiddleware;

// CORS
handlePreflight();

// Only accept POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

session_start();

try {
    $db = AuthDatabase::getInstance();
    
    // Get refresh token from body OR cookie
    $body = json_decode(file_get_contents('php://input'), true) ?? [];
    $refreshToken = $body['refresh_token'] ?? $_COOKIE['nomad_refresh_token'] ?? '';
    
    if (!empty($refreshToken)) {
        $tokenHash = hash('sha256', $refreshToken);
        
        // Revoke the specific token and its family
        $stmt = $db->prepare("SELECT family FROM refresh_tokens WHERE token_hash = ?");
        $stmt->execute([$tokenHash]);
        $tokenData = $stmt->fetch();
        
        if ($tokenData) {
            // Revoke entire family
            $stmt = $db->prepare("
                UPDATE refresh_tokens 
                SET revoked = 1, revoked_at = datetime('now')
                WHERE family = ?
            ");
            $stmt->execute([$tokenData['family']]);
        }
    }
    
    // Try to get current user to revoke all their tokens (optional)
    $user = AuthMiddleware::optionalAuth();
    
    if ($user && isset($body['logout_all']) && $body['logout_all'] === true) {
        // Revoke ALL refresh tokens for this user
        $stmt = $db->prepare("
            UPDATE refresh_tokens 
            SET revoked = 1, revoked_at = datetime('now')
            WHERE user_id = (SELECT id FROM users WHERE uuid = ?)
        ");
        $stmt->execute([$user->uuid]);
        
        // Delete all sessions
        $stmt = $db->prepare("
            DELETE FROM sessions
            WHERE user_id = (SELECT id FROM users WHERE uuid = ?)
        ");
        $stmt->execute([$user->uuid]);
    }
    
    // Clear session
    $_SESSION = [];
    
    if (session_id()) {
        session_destroy();
    }
    
    // Clear CSRF cookie
    setcookie('XSRF-TOKEN', '', [
        'expires' => time() - 3600,
        'path' => '/',
        'samesite' => 'Lax',
    ]);
    
    // Clear refresh token cookie
    setSecureRefreshCookie('nomad_refresh_token', '', 0, true);
    
    http_response_code(200);
    header('Content-Type: application/json');
    echo json_encode([
        'success' => true,
        'message' => 'Logged out successfully',
    ]);
    
} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $_ENV['APP_DEBUG'] === 'true' ? $e->getMessage() : 'Internal server error',
    ]);
}
