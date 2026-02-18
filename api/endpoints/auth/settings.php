<?php
/**
 * NOMAD CMS - User Settings Endpoint
 * Update email, password, and auth method preferences
 */

declare(strict_types=1);

require_once __DIR__ . '/../../bootstrap.php';

use NomadCMS\Auth\TOTPService;
use NomadCMS\Database\UserRepository;
use NomadCMS\Middleware\AuthMiddleware;
use NomadCMS\Middleware\CSRFMiddleware;
use NomadCMS\Middleware\RateLimitMiddleware;

// CORS
handlePreflight();

// Rate limit
RateLimitMiddleware::check();

// Require authentication
session_start();
$currentUser = AuthMiddleware::requireAuth(true);

$method = $_SERVER['REQUEST_METHOD'];

// Set JSON content type
header('Content-Type: application/json');

try {
    $user = UserRepository::findByUuid($currentUser->uuid);
    
    if (!$user) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'User not found']);
        exit;
    }
    
    switch ($method) {
        case 'GET':
            // Get current user settings
            http_response_code(200);
            echo json_encode([
                'success' => true,
                'settings' => [
                    'email' => $user['email'],
                    'totp_enabled' => (bool) $user['totp_enabled'],
                    'totp_allowed' => (bool) ($user['totp_allowed'] ?? true),
                    'webauthn_allowed' => (bool) ($user['webauthn_allowed'] ?? true),
                    'password_allowed' => (bool) ($user['password_allowed'] ?? true),
                    'has_password' => !empty($user['password_hash']),
                    'recovery_email' => $user['recovery_email'] ?? null,
                ],
            ]);
            break;
            
        case 'PATCH':
        case 'PUT':
            // SECURITY: Validate CSRF token for session-based requests
            CSRFMiddleware::validateForSession();
            
            $body = json_decode(file_get_contents('php://input'), true);
            
            // Check if TOTP is required for sensitive changes
            $sensitiveChange = isset($body['email']) || isset($body['new_password']);
            
            if ($sensitiveChange && $user['totp_enabled']) {
                $totpCode = $body['totp_code'] ?? '';
                if (empty($totpCode)) {
                    http_response_code(400);
                    echo json_encode([
                        'success' => false,
                        'error' => 'TOTP code required for this operation',
                        'requires_totp' => true,
                    ]);
                    exit;
                }
                
                RateLimitMiddleware::checkTOTP();
                
                if (!TOTPService::verifyCode($user['totp_secret'], $totpCode)) {
                    http_response_code(401);
                    echo json_encode(['success' => false, 'error' => 'Invalid TOTP code']);
                    exit;
                }
            }
            
            $updated = [];
            $response = [];
            
            // Update email
            if (isset($body['email']) && $body['email'] !== $user['email']) {
                $newEmail = filter_var($body['email'], FILTER_VALIDATE_EMAIL);
                if (!$newEmail) {
                    http_response_code(400);
                    echo json_encode(['success' => false, 'error' => 'Invalid email format']);
                    exit;
                }
                
                // Check if email already taken
                if (UserRepository::findByEmail($newEmail)) {
                    http_response_code(409);
                    echo json_encode(['success' => false, 'error' => 'Email already in use']);
                    exit;
                }
                
                UserRepository::updateEmail($user['id'], $newEmail);
                $updated[] = 'email';
            }
            
            // Update password
            if (isset($body['new_password']) && !empty($body['new_password'])) {
                $currentPassword = $body['current_password'] ?? '';
                $newPassword = $body['new_password'];
                $confirmPassword = $body['confirm_password'] ?? '';
                
                // Verify current password (if user has one AND is not a new user)
                if (!empty($user['password_hash']) && empty($user['is_new_user'])) {
                    if (empty($currentPassword)) {
                        http_response_code(400);
                        echo json_encode(['success' => false, 'error' => 'Current password is required']);
                        exit;
                    }
                    
                    if (!UserRepository::verifyPassword($user, $currentPassword)) {
                        http_response_code(401);
                        echo json_encode(['success' => false, 'error' => 'Current password is incorrect']);
                        exit;
                    }
                }
                
                // Validate new password
                if (strlen($newPassword) < 8) {
                    http_response_code(400);
                    echo json_encode(['success' => false, 'error' => 'Password must be at least 8 characters']);
                    exit;
                }
                
                if ($newPassword !== $confirmPassword) {
                    http_response_code(400);
                    echo json_encode(['success' => false, 'error' => 'Passwords do not match']);
                    exit;
                }
                
                // Update password
                UserRepository::updatePassword($user['id'], $newPassword);
                $updated[] = 'password';

                // Regenerate token to reflect is_new_user = false
                $user['is_new_user'] = 0; // Update local user array
                $newToken = \NomadCMS\Auth\JWTService::generateAccessToken($user);
                $response['access_token'] = $newToken;
                $response['token_update'] = true;
            }
            
            // Update auth method toggles
            $authSettings = [];
            if (isset($body['totp_allowed'])) {
                $authSettings['totp_allowed'] = (bool) $body['totp_allowed'];
            }
            if (isset($body['webauthn_allowed'])) {
                $authSettings['webauthn_allowed'] = (bool) $body['webauthn_allowed'];
            }
            if (isset($body['password_allowed'])) {
                $authSettings['password_allowed'] = (bool) $body['password_allowed'];
            }
            
            if (!empty($authSettings)) {
                UserRepository::updateAuthSettings($user['id'], $authSettings);
                $updated[] = 'auth_settings';
            }
            
            // Update recovery email
            if (isset($body['recovery_email'])) {
                $recoveryEmail = $body['recovery_email'] ? filter_var($body['recovery_email'], FILTER_VALIDATE_EMAIL) : null;
                UserRepository::setRecoveryEmail($user['id'], $recoveryEmail ?: null);
                $updated[] = 'recovery_email';
            }
            
            http_response_code(200);
            echo json_encode(array_merge([
                'success' => true,
                'message' => 'Settings updated',
                'updated_fields' => $updated,
            ], $response));
            break;
            
        default:
            http_response_code(405);
            echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    }
    
} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $_ENV['APP_DEBUG'] === 'true' ? $e->getMessage() : 'Internal server error',
    ]);
}
