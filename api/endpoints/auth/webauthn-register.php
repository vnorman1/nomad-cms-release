<?php
/**
 * NOMAD CMS - WebAuthn Register Endpoint
 * Passkey registration flow
 */

declare(strict_types=1);

// Suppress deprecation warnings from lbuchs/webauthn library to prevent HTML output
error_reporting(E_ALL & ~E_DEPRECATED);

// Fatal error handler to catch crashes
register_shutdown_function(function() {
    $error = error_get_last();
    if ($error && in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR])) {
        http_response_code(500);
        header('Content-Type: application/json');
        echo json_encode([
            'success' => false,
            'error' => 'Fatal error: ' . $error['message'],
            'debug' => [
                'file' => $error['file'],
                'line' => $error['line'],
            ],
        ]);
    }
});

require_once __DIR__ . '/../../bootstrap.php';

use NomadCMS\Auth\WebAuthnService;
use NomadCMS\Config\Security;
use NomadCMS\Database\AuthDatabase;
use NomadCMS\Database\UserRepository;
use NomadCMS\Middleware\AuthMiddleware;
use NomadCMS\Middleware\CSRFMiddleware;
use NomadCMS\Middleware\RateLimitMiddleware;

// CORS
handlePreflight();

// Check if WebAuthn is enabled globally
if (!Security::isFeatureEnabled('webauthn')) {
    http_response_code(403);
    header('Content-Type: application/json');
    echo json_encode([
        'success' => false,
        'error' => 'WebAuthn/Passkey is disabled on this server',
        'code' => 'WEBAUTHN_DISABLED',
    ]);
    exit;
}

// Rate limit
RateLimitMiddleware::check();

// Require authentication
session_start();
$currentUser = AuthMiddleware::requireAuth();

$method = $_SERVER['REQUEST_METHOD'];

try {
    $db = AuthDatabase::getInstance();
    $user = UserRepository::findByUuid($currentUser->uuid);
    
    if (!$user) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'User not found']);
        exit;
    }
    
    switch ($method) {
        case 'GET':
            // Get registration options (credential creation)
            $existingCredentials = WebAuthnService::getUserCredentials($user['id']);
            $excludeIds = array_column($existingCredentials, 'credential_id');
            
            $options = WebAuthnService::getRegistrationOptions($user, $excludeIds);
            
            http_response_code(200);
            header('Content-Type: application/json');
            echo json_encode([
                'success' => true,
                'options' => $options['options'],
                'message' => 'Use these options with navigator.credentials.create()',
            ]);
            break;
            
        case 'POST':
            // SECURITY: Validate CSRF token for session-based requests
            CSRFMiddleware::validateForSession();
            
            // Verify registration response and store credential
            $body = json_decode(file_get_contents('php://input'), true);
            
            $clientDataJSON = $body['clientDataJSON'] ?? '';
            $attestationObject = $body['attestationObject'] ?? '';
            $friendlyName = $body['friendly_name'] ?? null;
            
            if (empty($clientDataJSON) || empty($attestationObject)) {
                http_response_code(400);
                echo json_encode([
                    'success' => false,
                    'error' => 'clientDataJSON and attestationObject are required',
                ]);
                exit;
            }
            
            try {
                $result = WebAuthnService::verifyRegistration(
                    $clientDataJSON,
                    $attestationObject,
                    $friendlyName
                );
                
                http_response_code(201);
                header('Content-Type: application/json');
                echo json_encode([
                    'success' => true,
                    'credential_id' => $result['credential_id'],
                    'message' => $result['message'],
                ]);
            } catch (\Exception $e) {
                http_response_code(400);
                header('Content-Type: application/json');
                echo json_encode([
                    'success' => false,
                    'error' => $e->getMessage(),
                    'debug' => $_ENV['APP_DEBUG'] === 'true' ? [
                        'file' => $e->getFile(),
                        'line' => $e->getLine(),
                        'trace' => $e->getTraceAsString(),
                    ] : null,
                ]);
            }
            break;
            
        case 'DELETE':
            // SECURITY: Validate CSRF token for session-based requests
            CSRFMiddleware::validateForSession();
            
            // Delete a passkey with edge case handling
            $credentialDbId = (int) ($_GET['id'] ?? 0);
            $forceDelete = ($_GET['force'] ?? '') === 'true';
            
            if ($credentialDbId <= 0) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Credential ID is required']);
                exit;
            }
            
            $credentials = WebAuthnService::getUserCredentials($user['id']);
            $isPasswordEnabled = Security::isFeatureEnabled('password');
            $hasPasswordSet = !empty($user['password_hash']);
            $hasTotpEnabled = (bool) $user['totp_enabled'];
            
            // Edge case: Last passkey deletion
            if (count($credentials) <= 1) {
                // Allow if password auth is available
                if ($isPasswordEnabled && $hasPasswordSet) {
                    // Safe to delete - user can still login with password
                } elseif (!$forceDelete) {
                    http_response_code(400);
                    echo json_encode([
                        'success' => false,
                        'error' => 'Cannot delete last passkey. No other login method available.',
                        'code' => 'LAST_PASSKEY',
                        'recovery_options' => [
                            'password_enabled' => $isPasswordEnabled,
                            'has_password' => $hasPasswordSet,
                            'totp_enabled' => $hasTotpEnabled,
                        ],
                        'force_hint' => 'Add ?force=true to delete anyway (DANGEROUS - may lock you out!)',
                    ]);
                    exit;
                }
            }
            
            $deleted = WebAuthnService::deleteCredential($user['id'], $credentialDbId);
            
            if ($deleted) {
                $remaining = count($credentials) - 1;
                http_response_code(200);
                echo json_encode([
                    'success' => true,
                    'message' => 'Passkey deleted',
                    'remaining_passkeys' => $remaining,
                    'warning' => $remaining === 0 ? 'No passkeys remaining. Use password to login.' : null,
                ]);
            } else {
                http_response_code(404);
                echo json_encode(['success' => false, 'error' => 'Passkey not found']);
            }
            break;
            
        default:
            http_response_code(405);
            echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    }
    
} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => ($_ENV['APP_DEBUG'] ?? 'false') === 'true' ? $e->getMessage() : 'Internal server error',
    ]);
}

