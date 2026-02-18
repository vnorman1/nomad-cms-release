<?php
/**
 * NOMAD CMS - Register Endpoint
 * Handles new user registration
 */

declare(strict_types=1);

require_once __DIR__ . '/../../bootstrap.php';

use NomadCMS\Auth\JWTService;
use NomadCMS\Config\Security;
use NomadCMS\Database\AuthDatabase;
use NomadCMS\Database\UserRepository;
use NomadCMS\Middleware\RateLimitMiddleware;

// CORS
handlePreflight();

// Check if registration is enabled
if (!Security::isFeatureEnabled('registration')) {
    http_response_code(403);
    header('Content-Type: application/json');
    echo json_encode([
        'success' => false,
        'error' => 'Registration is currently disabled',
        'code' => 'REGISTRATION_DISABLED',
    ]);
    exit;
}

// Rate limit (uses dynamic settings)
RateLimitMiddleware::checkRegistration();

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

$email = trim($body['email'] ?? '');
$password = $body['password'] ?? '';
$confirmPassword = $body['confirm_password'] ?? '';

// Validate input
$errors = [];

if (empty($email)) {
    $errors[] = 'Email is required';
} elseif (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $errors[] = 'Invalid email format';
}

if (empty($password)) {
    $errors[] = 'Password is required';
} elseif (strlen($password) < 8) {
    $errors[] = 'Password must be at least 8 characters';
} elseif (!preg_match('/[A-Z]/', $password)) {
    $errors[] = 'Password must contain at least one uppercase letter';
} elseif (!preg_match('/[a-z]/', $password)) {
    $errors[] = 'Password must contain at least one lowercase letter';
} elseif (!preg_match('/[0-9]/', $password)) {
    $errors[] = 'Password must contain at least one number';
}

if ($password !== $confirmPassword) {
    $errors[] = 'Passwords do not match';
}

if (!empty($errors)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'errors' => $errors]);
    exit;
}

try {
    // Initialize database
    $db = AuthDatabase::getInstance();
    
    // SECURITY FIX: Use transaction to prevent race condition attacks
    // This ensures atomic check-and-create operation
    $db->beginTransaction();
    
    try {
        // Check if email exists (inside transaction with EXCLUSIVE lock)
        $existing = UserRepository::findByEmail($email);
        if ($existing) {
            $db->rollBack();
            // SECURITY FIX: Generic error message to prevent user enumeration
            // Don't reveal whether email exists - attackers could use this
            // to harvest valid email addresses for phishing or credential stuffing
            http_response_code(400);
            echo json_encode([
                'success' => false, 
                'error' => 'Registration failed. Please try again or contact support.',
                // Log the real reason for debugging (not exposed to user)
            ]);
            error_log('[SECURITY] Registration attempt for existing email: ' . hash('sha256', $email));
            exit;
        }
        
        // Create user (first user is admin)
        $userCount = $db->query("SELECT COUNT(*) FROM users")->fetchColumn();
        $isAdmin = $userCount === 0;
        
        $user = UserRepository::create($email, $password, $isAdmin);
        
        if (!$user) {
            $db->rollBack();
            throw new \Exception('Failed to create user');
        }
        
        // Generate tokens
        $accessToken = JWTService::generateAccessToken($user);
        $refreshTokenData = JWTService::generateRefreshToken($user['id']);
        
        // Store refresh token
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
        
        $db->commit();
        
    } catch (\PDOException $e) {
        $db->rollBack();
        
        // Handle unique constraint violation (race condition fallback)
        if (strpos($e->getMessage(), 'UNIQUE constraint failed') !== false ||
            strpos($e->getMessage(), 'users.email') !== false) {
            http_response_code(400);
            echo json_encode([
                'success' => false, 
                'error' => 'Registration failed. Please try again or contact support.',
            ]);
            error_log('[SECURITY] Race condition in registration for email hash: ' . hash('sha256', $email));
            exit;
        }
        
        throw $e;
    }
    
    // Log registration
    UserRepository::logLoginAttempt($email, true, 'registration');
    
    // SECURITY: Start session and regenerate ID to prevent session fixation attacks
    session_start();
    session_regenerate_id(true);
    
    http_response_code(201);
    header('Content-Type: application/json');
    
    // SECURITY: Refresh token ONLY in httpOnly cookie - NEVER in response body
    $refreshTokenTTL = (int) ($_ENV['JWT_REFRESH_TOKEN_TTL'] ?? 604800);
    setSecureRefreshCookie('nomad_refresh_token', $refreshTokenData['plain_token'], $refreshTokenTTL);
    
    echo json_encode([
        'success' => true,
        'message' => 'Registration successful' . ($isAdmin ? ' (Admin account created)' : ''),
        'access_token' => $accessToken,
        'token_type' => 'Bearer',
        'expires_in' => (int) ($_ENV['JWT_ACCESS_TOKEN_TTL'] ?? 900),
        'user' => [
            'uuid' => $user['uuid'],
            'email' => $user['email'],
            'is_admin' => (bool) $user['is_admin'],
        ],
    ]);
    
} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $_ENV['APP_DEBUG'] === 'true' ? $e->getMessage() : 'Internal server error',
    ]);
}
