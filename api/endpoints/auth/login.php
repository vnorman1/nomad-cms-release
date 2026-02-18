<?php
/**
 * NOMAD CMS - Login Endpoint
 * Handles username/password authentication with optional TOTP
 */

declare(strict_types=1);

require_once __DIR__ . '/../../bootstrap.php';

use NomadCMS\Auth\JWTService;
use NomadCMS\Auth\TOTPService;
use NomadCMS\Database\AuthDatabase;
use NomadCMS\Database\UserRepository;
use NomadCMS\Middleware\RateLimitMiddleware;
use NomadCMS\Middleware\CSRFMiddleware;
use NomadCMS\Security\InputSanitizer;
use NomadCMS\Security\WebhookService;

// CORS
handlePreflight();

// Rate limit for auth endpoints
RateLimitMiddleware::checkAuth();

// Only accept POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

// Get JSON body
$body = json_decode(file_get_contents('php://input'), true);

if (!$body) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid JSON body']);
    exit;
}

// Sanitize inputs
$email = InputSanitizer::email($body['email'] ?? null);
$password = $body['password'] ?? '';
$totpCode = isset($body['totp_code']) ? InputSanitizer::plainText($body['totp_code'], 10) : null;

// Validate input
if (!$email || empty($password)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Valid email and password are required']);
    exit;
}

try {
    // Initialize database
    AuthDatabase::getInstance();
    
    // Find user
    $user = UserRepository::findByEmail($email);
    
    if (!$user) {
        // SECURITY: Prevent timing attacks with randomized dummy hash
        // The hash includes random salt and cost parameters matching real hashes
        // This ensures consistent response time regardless of user existence
        $dummyHash = password_hash(
            bin2hex(random_bytes(16)), 
            PASSWORD_ARGON2ID,
            ['memory_cost' => 65536, 'time_cost' => 4, 'threads' => 3]
        );
        password_verify($password, $dummyHash);
        
        // Log attempt (don't reveal if email exists)
        UserRepository::logLoginAttempt($email, false, 'user_not_found');
        
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'Invalid email or password']);
        exit;
    }
    
    // Check if account is locked
    if (UserRepository::isLocked($user)) {
        UserRepository::logLoginAttempt($email, false, 'account_locked');
        
        $remainingSeconds = UserRepository::getLockoutRemaining($user);
        $remainingMinutes = (int) ceil($remainingSeconds / 60);
        
        http_response_code(423);
        echo json_encode([
            'success' => false,
            'error' => "A fiók ideiglenesen zárolva. Próbáld újra {$remainingMinutes} perc múlva.",
            'code' => 'ACCOUNT_LOCKED',
            'lockout_remaining' => $remainingSeconds,
            'lockout_remaining_minutes' => $remainingMinutes,
        ]);
        exit;
    }
    
    // Verify password
    if (!UserRepository::verifyPassword($user, $password)) {
        UserRepository::recordFailedLogin($user['id']);
        UserRepository::logLoginAttempt($email, false, 'wrong_password');
        
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'Invalid email or password']);
        exit;
    }
    
    // Check TOTP if enabled
    if ($user['totp_enabled']) {
        if (empty($totpCode)) {
            http_response_code(200);
            echo json_encode([
                'success' => true,
                'requires_totp' => true,
                'message' => 'TOTP code required',
            ]);
            exit;
        }
        
        // Rate limit TOTP attempts
        RateLimitMiddleware::checkTOTP();
        
        // Get decrypted TOTP secret
        $totpSecret = UserRepository::getTotpSecret($user);
        
        if (!$totpSecret) {
            // TOTP enabled but secret missing/corrupted
            UserRepository::logLoginAttempt($email, false, 'totp_secret_error');
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'TOTP configuration error. Contact admin.']);
            exit;
        }
        
        // First try regular TOTP code (6 digits)
        $isValidTotp = false;
        $usedBackupCode = false;
        
        if (strlen($totpCode) === 6 && ctype_digit($totpCode)) {
            // Standard 6-digit TOTP code
            $isValidTotp = TOTPService::verifyCode($totpSecret, $totpCode);
        } elseif (strlen($totpCode) === 8 && ctype_alnum($totpCode)) {
            // 8-character backup code (alphanumeric)
            $isValidTotp = UserRepository::verifyBackupCode($user['id'], strtoupper($totpCode));
            $usedBackupCode = $isValidTotp;
        }
        
        if (!$isValidTotp) {
            UserRepository::logLoginAttempt($email, false, 'invalid_totp');
            
            http_response_code(401);
            echo json_encode(['success' => false, 'error' => 'Invalid TOTP code or backup code']);
            exit;
        }
        
        // Log if backup code was used (one-time use, already consumed)
        if ($usedBackupCode) {
            UserRepository::logLoginAttempt($email, true, 'backup_code_used');
        }
    }
    
    // Success! Generate tokens
    UserRepository::resetFailedLogins($user['id']);
    UserRepository::logLoginAttempt($email, true);
    
    $accessToken = JWTService::generateAccessToken($user);
    $refreshTokenData = JWTService::generateRefreshToken($user['id']);
    
    // Store refresh token in database
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
    
    // SECURITY: Regenerate session ID to prevent session fixation attacks
    // This ensures any pre-existing session ID is invalidated after login
    session_start();
    session_regenerate_id(true);
    CSRFMiddleware::regenerate();
    
    // Dispatch webhook event for successful login (async - non-blocking)
    try {
        $webhookService = new WebhookService();
        $webhookService->dispatchEventAsync('user.login', [
            'user_id' => $user['uuid'],
            'email' => $user['email'],
            'ip_address' => $_SERVER['REMOTE_ADDR'] ?? 'unknown',
            'user_agent' => substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 500),
            'totp_used' => $user['totp_enabled'] ? true : false,
            'backup_code_used' => $usedBackupCode ?? false,
            'timestamp' => date('c'),
        ]);
    } catch (\Exception $e) {
        // Don't fail login if webhook queue fails - just log it
        error_log("[WEBHOOK ERROR] Queue failed for user.login: " . $e->getMessage());
    }
    
    http_response_code(200);
    header('Content-Type: application/json');
    
    // SECURITY: Refresh token storage strategy:
    // 1. PRIMARY: httpOnly cookie (nomad_refresh_token) - XSS cannot access
    // 2. FALLBACK: Response body - encrypted by frontend in localStorage
    //    This fallback is needed when cookies are blocked (3rd party, incognito)
    // 
    // The plain_token is NEVER stored on the server - only its SHA-256 hash
    // This means even DB breach won't expose tokens
    
    // SECURITY: Set refresh token ONLY in httpOnly cookie (XSS-safe)
    // ZERO TRUST: Refresh token NEVER in response body
    // Cookie valid for 7 days (matches JWT_REFRESH_TOKEN_TTL)
    $refreshTokenTTL = (int) ($_ENV['JWT_REFRESH_TOKEN_TTL'] ?? 604800);
    setSecureRefreshCookie('nomad_refresh_token', $refreshTokenData['plain_token'], $refreshTokenTTL);
    
    echo json_encode([
        'success' => true,
        'message' => 'Login successful',
        'access_token' => $accessToken,
        // ZERO TRUST: refresh_token NEVER in response body - cookie only!
        'token_type' => 'Bearer',
        'expires_in' => (int) ($_ENV['JWT_ACCESS_TOKEN_TTL'] ?? 900),
        'user' => [
            'uuid' => $user['uuid'],
            'email' => $user['email'],
            'is_admin' => (bool) $user['is_admin'],
            'totp_enabled' => (bool) $user['totp_enabled'],
            'is_new_user' => (bool) ($user['is_new_user'] ?? false),
        ],
    ]);
    
} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $_ENV['APP_DEBUG'] === 'true' ? $e->getMessage() : 'Internal server error',
    ]);
}
