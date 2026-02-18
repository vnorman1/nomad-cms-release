<?php
/**
 * NOMAD CMS - WebAuthn Login Endpoint
 * Passkey authentication flow
 */

declare(strict_types=1);

require_once __DIR__ . '/../../bootstrap.php';

use NomadCMS\Auth\JWTService;
use NomadCMS\Auth\WebAuthnService;
use NomadCMS\Database\AuthDatabase;
use NomadCMS\Database\UserRepository;
use NomadCMS\Middleware\RateLimitMiddleware;
use NomadCMS\Middleware\CSRFMiddleware;

// CORS
handlePreflight();

// Rate limit for auth
RateLimitMiddleware::checkAuth();

session_start();

$method = $_SERVER['REQUEST_METHOD'];

try {
    AuthDatabase::getInstance();
    
    switch ($method) {
        case 'GET':
            // Get authentication options (assertion)
            $email = $_GET['email'] ?? null;
            
            $options = WebAuthnService::getAuthenticationOptions($email);
            
            http_response_code(200);
            header('Content-Type: application/json');
            echo json_encode([
                'success' => true,
                'options' => $options['options'],
                'message' => 'Use these options with navigator.credentials.get()',
            ]);
            break;
            
        case 'POST':
            // Verify authentication and login
            $body = json_decode(file_get_contents('php://input'), true);
            
            $credentialId = $body['rawId'] ?? $body['id'] ?? '';
            $clientDataJSON = $body['clientDataJSON'] ?? '';
            $authenticatorData = $body['authenticatorData'] ?? '';
            $signature = $body['signature'] ?? '';
            $userHandle = $body['userHandle'] ?? null;
            
            if (empty($credentialId) || empty($clientDataJSON) || empty($authenticatorData) || empty($signature)) {
                http_response_code(400);
                echo json_encode([
                    'success' => false,
                    'error' => 'Missing required WebAuthn response fields',
                ]);
                exit;
            }
            
            // Verify and get user
            $user = WebAuthnService::verifyAuthentication(
                $credentialId,
                $clientDataJSON,
                $authenticatorData,
                $signature,
                $userHandle
            );
            
            // Generate tokens
            $accessToken = JWTService::generateAccessToken($user);
            $refreshTokenData = JWTService::generateRefreshToken($user['id']);
            
            // Store refresh token
            $db = AuthDatabase::getInstance();
            $stmt = $db->prepare("
                INSERT INTO refresh_tokens (user_id, token_hash, family, expires_at, ip_address, user_agent)
                VALUES (?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $user['id'],
                $refreshTokenData['token_hash'],
                $refreshTokenData['family'],
                $refreshTokenData['expires_at'],
                \NomadCMS\Security\IpHashService::hash($_SERVER['REMOTE_ADDR'] ?? ''),
                substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 500),
            ]);
            
            // Log successful login
            UserRepository::logLoginAttempt($user['email'], true, 'webauthn');
            UserRepository::resetFailedLogins($user['id']);
            
            // SECURITY: Regenerate session ID to prevent session fixation attacks
            session_regenerate_id(true);
            
            // Regenerate CSRF
            CSRFMiddleware::regenerate();
            
            // SECURITY: Set refresh token ONLY in httpOnly cookie (XSS-safe)
            // ZERO TRUST: Refresh token NEVER in response body
            $refreshTokenTTL = (int) ($_ENV['JWT_REFRESH_TOKEN_TTL'] ?? 604800);
            setSecureRefreshCookie('nomad_refresh_token', $refreshTokenData['plain_token'], $refreshTokenTTL);
            
            http_response_code(200);
            header('Content-Type: application/json');
            echo json_encode([
                'success' => true,
                'message' => 'Login successful via passkey',
                'access_token' => $accessToken,
                // ZERO TRUST: refresh_token NEVER in response body - cookie only!
                'token_type' => 'Bearer',
                'expires_in' => (int) ($_ENV['JWT_ACCESS_TOKEN_TTL'] ?? 900),
                'user' => [
                    'uuid' => $user['uuid'],
                    'email' => $user['email'],
                    'is_admin' => (bool) $user['is_admin'],
                ],
            ]);
            break;
            
        default:
            http_response_code(405);
            echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    }
    
} catch (\Exception $e) {
    // Log failed attempt if we can identify email
    if (isset($body['email'])) {
        UserRepository::logLoginAttempt($body['email'], false, 'webauthn_' . $e->getMessage());
    }
    
    http_response_code(401);
    echo json_encode([
        'success' => false,
        'error' => $_ENV['APP_DEBUG'] === 'true' ? $e->getMessage() : 'WebAuthn authentication failed',
    ]);
}
