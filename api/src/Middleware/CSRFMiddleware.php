<?php
/**
 * NOMAD CMS - CSRF Middleware
 * Cross-Site Request Forgery protection using double submit cookie pattern
 */

declare(strict_types=1);

namespace NomadCMS\Middleware;

use NomadCMS\Config\Security;
use Symfony\Component\Security\Csrf\CsrfToken;
use Symfony\Component\Security\Csrf\CsrfTokenManager;

final class CSRFMiddleware
{
    private static ?string $currentToken = null;
    
    private const TOKEN_NAME = 'csrf_token';
    private const COOKIE_NAME = 'XSRF-TOKEN';
    private const HEADER_NAME = 'X-CSRF-TOKEN';
    
    /**
     * Initialize CSRF protection
     * Call this early in request lifecycle to set cookie
     */
    public static function initialize(): void
    {
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }
        
        // Generate token if not exists
        if (empty($_SESSION[self::TOKEN_NAME])) {
            $_SESSION[self::TOKEN_NAME] = self::generateToken();
        }
        
        self::$currentToken = $_SESSION[self::TOKEN_NAME];
        
        // Set cookie for JavaScript access (double submit pattern)
        if (!isset($_COOKIE[self::COOKIE_NAME]) || $_COOKIE[self::COOKIE_NAME] !== self::$currentToken) {
            setcookie(
                self::COOKIE_NAME,
                self::$currentToken,
                [
                    'expires' => 0, // Session cookie
                    'path' => '/',
                    'domain' => '',
                    'secure' => $_ENV['SESSION_SECURE_COOKIE'] === 'true',
                    'httponly' => false, // JavaScript needs to read this
                    'samesite' => $_ENV['SESSION_SAME_SITE'] ?? 'Lax',
                ]
            );
        }
    }
    
    /**
     * Validate CSRF token for state-changing requests
     * Call this for POST, PUT, DELETE, PATCH requests
     * 
     * @throws \Exception if CSRF validation fails
     */
    public static function validate(): void
    {
        $method = $_SERVER['REQUEST_METHOD'];
        
        // Skip validation for safe methods
        if (in_array($method, ['GET', 'HEAD', 'OPTIONS'], true)) {
            return;
        }
        
        // Get token from header or body
        $token = self::extractToken();
        
        if (!$token) {
            self::sendCSRFError('CSRF token missing');
        }
        
        // Validate using constant-time comparison
        if (!hash_equals($_SESSION[self::TOKEN_NAME] ?? '', $token)) {
            self::sendCSRFError('CSRF token invalid');
        }
    }
    
    /**
     * Get current CSRF token
     * Use this to send token to frontend
     */
    public static function getToken(): string
    {
        if (!self::$currentToken) {
            self::initialize();
        }
        
        return self::$currentToken;
    }
    
    /**
     * Regenerate CSRF token
     * Call after authentication state changes
     */
    public static function regenerate(): string
    {
        $_SESSION[self::TOKEN_NAME] = self::generateToken();
        self::$currentToken = $_SESSION[self::TOKEN_NAME];
        
        // Update cookie
        setcookie(
            self::COOKIE_NAME,
            self::$currentToken,
            [
                'expires' => 0,
                'path' => '/',
                'secure' => $_ENV['SESSION_SECURE_COOKIE'] === 'true',
                'httponly' => false,
                'samesite' => $_ENV['SESSION_SAME_SITE'] ?? 'Lax',
            ]
        );
        
        return self::$currentToken;
    }
    
    /**
     * Skip CSRF validation for current request
     * Use sparingly - only for trusted API endpoints
     */
    public static function skip(): void
    {
        // This is intentionally a no-op marker
        // The endpoint should simply not call validate()
    }
    
    /**
     * Validate CSRF for session-based requests only
     * 
     * SECURITY: JWT Bearer token requests are inherently CSRF-safe because:
     * - The token must be manually added to headers via JavaScript
     * - Browsers don't automatically send custom Authorization headers
     * 
     * This method only enforces CSRF for cookie/session based authentication.
     */
    public static function validateForSession(): void
    {
        $method = $_SERVER['REQUEST_METHOD'];
        
        // Skip validation for safe methods
        if (in_array($method, ['GET', 'HEAD', 'OPTIONS'], true)) {
            return;
        }
        
        // Check for Bearer token - if present, CSRF protection is not needed
        // Try multiple sources for Authorization header (compatibility across PHP environments)
        $authHeader = '';
        
        // Method 1: getallheaders() (most common, but not available in all SAPI)
        if (function_exists('getallheaders')) {
            $headers = getallheaders();
            $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';
        }
        
        // Method 2: $_SERVER (Apache/nginx with specific config)
        if (empty($authHeader)) {
            $authHeader = $_SERVER['HTTP_AUTHORIZATION'] 
                ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] 
                ?? '';
        }
        
        if (preg_match('/^Bearer\s+.+$/i', $authHeader)) {
            // JWT Bearer auth - inherently CSRF-safe, no validation needed
            return;
        }
        
        // Check for API key - also inherently safe
        if (!empty($_SERVER['HTTP_X_API_KEY'])) {
            return;
        }
        
        // Session-based or no auth - require CSRF token
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }
        
        self::validate();
    }
    
    /**
     * Generate secure random token
     */
    private static function generateToken(): string
    {
        return bin2hex(random_bytes(Security::CSRF_TOKEN_LENGTH));
    }
    
    /**
     * Extract token from request
     */
    private static function extractToken(): ?string
    {
        // Check header first (preferred for AJAX)
        $headers = getallheaders();
        $headerToken = $headers[self::HEADER_NAME] ?? $headers[strtolower(self::HEADER_NAME)] ?? null;
        
        if ($headerToken) {
            return $headerToken;
        }
        
        // Check request body
        $body = json_decode(file_get_contents('php://input'), true);
        if (isset($body['_csrf_token'])) {
            return $body['_csrf_token'];
        }
        
        // Check POST data
        if (isset($_POST['_csrf_token'])) {
            return $_POST['_csrf_token'];
        }
        
        return null;
    }
    
    /**
     * Send CSRF error response
     */
    private static function sendCSRFError(string $message): never
    {
        http_response_code(403);
        header('Content-Type: application/json');
        
        echo json_encode([
            'success' => false,
            'error' => $message,
            'code' => 'CSRF_ERROR',
        ]);
        
        exit;
    }
}
