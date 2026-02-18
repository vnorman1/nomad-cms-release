<?php
/**
 * NOMAD CMS - TOTP Setup Endpoint
 * Enable/disable two-factor authentication
 */

declare(strict_types=1);

require_once __DIR__ . '/../../bootstrap.php';

use NomadCMS\Auth\TOTPService;
use NomadCMS\Config\Security;
use NomadCMS\Database\AuthDatabase;
use NomadCMS\Database\UserRepository;
use NomadCMS\Middleware\AuthMiddleware;
use NomadCMS\Middleware\CSRFMiddleware;
use NomadCMS\Middleware\RateLimitMiddleware;

// CORS
handlePreflight();

// Check if TOTP is enabled globally
if (!Security::isFeatureEnabled('totp')) {
    http_response_code(403);
    header('Content-Type: application/json');
    echo json_encode([
        'success' => false,
        'error' => 'TOTP/2FA is disabled on this server',
        'code' => 'TOTP_DISABLED',
    ]);
    exit;
}

// Rate limit
RateLimitMiddleware::check();

// Require authentication
session_start();
$currentUser = AuthMiddleware::requireAuth();

$method = $_SERVER['REQUEST_METHOD'];

// Set JSON content type for all responses
header('Content-Type: application/json');

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
            // Get TOTP status and generate new secret if not enabled
            if ($user['totp_enabled']) {
                http_response_code(200);
                echo json_encode([
                    'success' => true,
                    'totp_enabled' => true,
                    'message' => 'TOTP is already enabled',
                ]);
            } else {
                // Generate new secret
                $totpData = TOTPService::generateSecret($user['email']);
                
                // Store temporarily in session until verified
                $_SESSION['pending_totp_secret'] = $totpData['secret'];
                
                http_response_code(200);
                echo json_encode([
                    'success' => true,
                    'totp_enabled' => false,
                    'provisioning_uri' => $totpData['provisioning_uri'],
                    'qr_code' => $totpData['qr_code_data_uri'], // Local QR, no external request
                    'secret' => $totpData['secret'], // For manual entry
                    'message' => 'Scan QR code with authenticator app, then POST verification code',
                ]);
            }
            break;
            
        case 'POST':
            // SECURITY: Validate CSRF token for session-based requests
            CSRFMiddleware::validateForSession();
            
            // Enable TOTP - verify code first
            $body = json_decode(file_get_contents('php://input'), true);
            $code = $body['code'] ?? '';
            
            if (empty($code)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Verification code is required']);
                exit;
            }
            
            if ($user['totp_enabled']) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'TOTP is already enabled']);
                exit;
            }
            
            $pendingSecret = $_SESSION['pending_totp_secret'] ?? null;
            
            if (!$pendingSecret) {
                http_response_code(400);
                echo json_encode([
                    'success' => false,
                    'error' => 'No pending TOTP setup. GET this endpoint first to generate a secret.',
                ]);
                exit;
            }
            
            // Verify code
            RateLimitMiddleware::checkTOTP();
            
            if (!TOTPService::verifyCode($pendingSecret, $code)) {
                http_response_code(401);
                echo json_encode(['success' => false, 'error' => 'Invalid verification code']);
                exit;
            }
            
            // Enable TOTP
            UserRepository::enableTotp($user['id'], $pendingSecret);
            unset($_SESSION['pending_totp_secret']);
            
            // Generate backup codes (returns plain codes for user + Argon2ID hashes for storage)
            $backupCodes = TOTPService::generateBackupCodes();
            
            // Store ONLY the hashes in database - NEVER store plain text!
            UserRepository::setBackupCodes($user['id'], $backupCodes['hashes']);
            
            http_response_code(200);
            echo json_encode([
                'success' => true,
                'message' => 'TOTP enabled successfully',
                'backup_codes' => $backupCodes['codes'], // Plain codes for user to save
                'warning' => 'Save these backup codes securely. They will not be shown again.',
            ]);
            break;
        
        case 'PATCH':
            // SECURITY: Validate CSRF token for session-based requests
            CSRFMiddleware::validateForSession();
            
            // Regenerate backup codes - require current TOTP code
            $body = json_decode(file_get_contents('php://input'), true);
            $code = $body['code'] ?? '';
            
            if (!$user['totp_enabled']) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'TOTP is not enabled']);
                exit;
            }
            
            if (empty($code)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Current TOTP code is required']);
                exit;
            }
            
            RateLimitMiddleware::checkTOTP();
            
            // Get decrypted secret for verification
            $totpSecret = UserRepository::getTotpSecret($user);
            if (!$totpSecret || !TOTPService::verifyCode($totpSecret, $code)) {
                http_response_code(401);
                echo json_encode(['success' => false, 'error' => 'Invalid TOTP code']);
                exit;
            }
            
            // Generate new backup codes
            $newBackupCodes = TOTPService::generateBackupCodes();
            
            // Store ONLY the hashes
            UserRepository::setBackupCodes($user['id'], $newBackupCodes['hashes']);
            
            http_response_code(200);
            echo json_encode([
                'success' => true,
                'message' => 'Backup codes regenerated successfully',
                'backup_codes' => $newBackupCodes['codes'],
                'warning' => 'Save these backup codes securely. Old codes are now invalid.',
            ]);
            break;
            
        case 'DELETE':
            // SECURITY: Validate CSRF token for session-based requests
            CSRFMiddleware::validateForSession();
            
            // Disable TOTP - require current TOTP code
            $body = json_decode(file_get_contents('php://input'), true);
            $code = $body['code'] ?? '';
            
            if (!$user['totp_enabled']) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'TOTP is not enabled']);
                exit;
            }
            
            if (empty($code)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Current TOTP code is required to disable']);
                exit;
            }
            
            RateLimitMiddleware::checkTOTP();
            
            // Get decrypted secret for verification
            $totpSecret = UserRepository::getTotpSecret($user);
            if (!$totpSecret || !TOTPService::verifyCode($totpSecret, $code)) {
                http_response_code(401);
                echo json_encode(['success' => false, 'error' => 'Invalid TOTP code']);
                exit;
            }
            
            UserRepository::disableTotp($user['id']);
            
            http_response_code(200);
            echo json_encode([
                'success' => true,
                'message' => 'TOTP disabled successfully',
            ]);
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
