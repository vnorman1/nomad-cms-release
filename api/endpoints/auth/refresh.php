<?php
/**
 * NOMAD CMS - Token Refresh Endpoint
 * Handles access token renewal using refresh token
 */

declare(strict_types=1);

require_once __DIR__ . '/../../bootstrap.php';

use NomadCMS\Auth\JWTService;
use NomadCMS\Database\AuthDatabase;
use NomadCMS\Database\UserRepository;
use NomadCMS\Middleware\RateLimitMiddleware;

// CORS
handlePreflight();

// Rate limit
RateLimitMiddleware::check(
    key: 'refresh:' . ($_SERVER['REMOTE_ADDR'] ?? ''),
    maxRequests: 30,
    windowSeconds: 60
);

// Only accept POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

// Get JSON body
$body = json_decode(file_get_contents('php://input'), true);

// Try to get refresh token from:
// 1. Request body (frontend fallback with encrypted localStorage)
// 2. HttpOnly cookie (primary, XSS-safe)
$refreshToken = '';

if (!empty($body['refresh_token'])) {
    $refreshToken = $body['refresh_token'];
} elseif (!empty($_COOKIE['nomad_refresh_token'])) {
    $refreshToken = $_COOKIE['nomad_refresh_token'];
}

if (empty($refreshToken)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Refresh token is required']);
    exit;
}

try {
    $db = AuthDatabase::getInstance();
    
    // Hash the provided token to find it in DB
    $tokenHash = hash('sha256', $refreshToken);
    
    // Find the refresh token
    $stmt = $db->prepare("
        SELECT rt.*, u.id as user_id, u.uuid, u.email, u.is_admin, u.totp_enabled
        FROM refresh_tokens rt
        JOIN users u ON rt.user_id = u.id
        WHERE rt.token_hash = ?
    ");
    $stmt->execute([$tokenHash]);
    $tokenData = $stmt->fetch();
    
    if (!$tokenData) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'Invalid refresh token']);
        exit;
    }
    
    // Check if revoked
    if ($tokenData['revoked']) {
        // Token reuse detected - revoke entire family (security measure)
        $stmt = $db->prepare("
            UPDATE refresh_tokens 
            SET revoked = 1, revoked_at = datetime('now')
            WHERE family = ?
        ");
        $stmt->execute([$tokenData['family']]);
        
        http_response_code(401);
        echo json_encode([
            'success' => false,
            'error' => 'Token has been revoked. Please login again.',
            'code' => 'TOKEN_REUSE_DETECTED',
        ]);
        exit;
    }
    
    // Check if expired
    if (strtotime($tokenData['expires_at']) < time()) {
        http_response_code(401);
        echo json_encode([
            'success' => false,
            'error' => 'Refresh token expired. Please login again.',
            'code' => 'TOKEN_EXPIRED',
        ]);
        exit;
    }
    
    // SECURITY FIX: Validate IP address and User-Agent to prevent session hijacking
    $currentIp = $_SERVER['REMOTE_ADDR'] ?? '';
    $currentUserAgent = substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 500);
    $storedIp = $tokenData['ip_address'] ?? '';
    $storedUserAgent = $tokenData['user_agent'] ?? '';
    
    // Check if IP or User-Agent has changed (potential hijacking)
    $ipMismatch = !empty($storedIp) && !\NomadCMS\Security\IpHashService::verify($currentIp, $storedIp);
    $uaMismatch = !empty($storedUserAgent) && $storedUserAgent !== $currentUserAgent;
    
    if ($ipMismatch || $uaMismatch) {
        // Suspicious activity - revoke entire token family
        $stmt = $db->prepare("
            UPDATE refresh_tokens 
            SET revoked = 1, revoked_at = datetime('now')
            WHERE family = ?
        ");
        $stmt->execute([$tokenData['family']]);
        
        // Log the suspicious activity
        error_log(sprintf(
            'SECURITY: Refresh token session hijacking attempt detected. ' .
            'User: %s, Original IP: %s, Current IP: %s, IP Match: %s, UA Match: %s',
            $tokenData['email'],
            $storedIp,
            $currentIp,
            $ipMismatch ? 'NO' : 'YES',
            $uaMismatch ? 'NO' : 'YES'
        ));
        
        http_response_code(401);
        echo json_encode([
            'success' => false,
            'error' => 'Session security violation detected. Please login again.',
            'code' => 'SESSION_HIJACK_DETECTED',
        ]);
        exit;
    }
    
    // Generate new tokens
    $user = [
        'id' => $tokenData['user_id'],
        'uuid' => $tokenData['uuid'],
        'email' => $tokenData['email'],
        'is_admin' => $tokenData['is_admin'],
    ];
    
    $accessToken = JWTService::generateAccessToken($user);
    $newRefreshToken = JWTService::generateRefreshToken($user['id']);
    
    // Store new refresh token FIRST (same family for tracking)
    // This prevents lockout if system crashes between operations
    $stmt = $db->prepare("
        INSERT INTO refresh_tokens (user_id, token_hash, family, expires_at, ip_address, user_agent)
        VALUES (?, ?, ?, ?, ?, ?)
    ");
    $stmt->execute([
        $user['id'],
        $newRefreshToken['token_hash'],
        $tokenData['family'], // Keep same family
        $newRefreshToken['expires_at'],
        \NomadCMS\Security\IpHashService::hash($_SERVER['REMOTE_ADDR'] ?? ''),
        substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 500),
    ]);
    
    // THEN revoke old token (rotation)
    $stmt = $db->prepare("
        UPDATE refresh_tokens 
        SET revoked = 1, revoked_at = datetime('now')
        WHERE id = ?
    ");
    $stmt->execute([$tokenData['id']]);

    
    http_response_code(200);
    header('Content-Type: application/json');
    
    // SECURITY: Refresh token ONLY in httpOnly cookie - NEVER in response body
    $refreshTokenTTL = (int) ($_ENV['JWT_REFRESH_TOKEN_TTL'] ?? 604800);
    setSecureRefreshCookie('nomad_refresh_token', $newRefreshToken['plain_token'], $refreshTokenTTL);
    
    echo json_encode([
        'success' => true,
        'message' => 'Token refreshed',
        'access_token' => $accessToken,
        'token_type' => 'Bearer',
        'expires_in' => (int) ($_ENV['JWT_ACCESS_TOKEN_TTL'] ?? 900),
    ]);

    // Garbage Collection (Probabilistic: 2% chance)
    // Run after sending response if possible, or just accept the tiny delay
    if (rand(1, 50) === 1) {
        AuthDatabase::cleanupTokens();
        AuthDatabase::cleanupSessions();
    }
    
} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $_ENV['APP_DEBUG'] === 'true' ? $e->getMessage() : 'Internal server error',
    ]);
}
