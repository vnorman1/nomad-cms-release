<?php
/**
 * NOMAD CMS - Application Bootstrap
 * Autoloader, environment loader, error handling
 */

declare(strict_types=1);

// Composer autoloader
require_once __DIR__ . '/vendor/autoload.php';

use Dotenv\Dotenv;

// Load environment variables
$dotenv = Dotenv::createImmutable(__DIR__);
$dotenv->load();

// Required environment variables validation
$dotenv->required([
    'APP_ENV',
    'JWT_SECRET',
    'JWT_ALGORITHM',
    'ENCRYPTION_KEY',
    'PASSWORD_PEPPER',
])->notEmpty();

// Error reporting based on environment
// Exclude E_DEPRECATED to prevent library warnings from breaking JSON responses
if ($_ENV['APP_DEBUG'] === 'true') {
    error_reporting(E_ALL & ~E_DEPRECATED);
    ini_set('display_errors', '0'); // Don't display, log instead in API
} else {
    error_reporting(0);
    ini_set('display_errors', '0');
}

// Set timezone
date_default_timezone_set('Europe/Budapest');

// Session security settings
if (session_status() === PHP_SESSION_NONE) {
    ini_set('session.cookie_httponly', '1');
    ini_set('session.cookie_samesite', $_ENV['SESSION_SAME_SITE'] ?? 'Lax');
    ini_set('session.use_strict_mode', '1');
    
    if ($_ENV['SESSION_SECURE_COOKIE'] === 'true') {
        ini_set('session.cookie_secure', '1');
    }
}

// Global CORS headers
header('Access-Control-Allow-Credentials: true');

// Content Security Policy - Prevent XSS and other attacks
$cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // May need unsafe for some React features
    "style-src 'self' 'unsafe-inline'",  // Tailwind/inline styles
    "img-src 'self' data: https: blob:",
    "font-src 'self' data:",
    "connect-src 'self' ws: wss:",  // WebSocket for dev tools
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
];
header('Content-Security-Policy: ' . implode('; ', $cspDirectives));

// Other security headers
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('Permissions-Policy: geolocation=(), microphone=(), camera=()');

// Initialize request logging (captures the entire request/response cycle)
require_once __DIR__ . '/src/Middleware/RequestLoggerMiddleware.php';
\NomadCMS\Middleware\RequestLoggerMiddleware::start();

// Define getJsonBody if not already defined (response.php may define it later)
if (!function_exists('getJsonBody')) {
    /**
     * Get JSON body from request
     * @return array|null Decoded JSON or null
     */
    function getJsonBody(): ?array {
        $input = file_get_contents('php://input');
        if (empty($input)) {
            return null;
        }
        return json_decode($input, true);
    }
}

/**
 * Set a secure HttpOnly cookie for refresh token
 * 
 * SECURITY NOTES:
 * - HttpOnly: JavaScript cannot access the cookie (XSS protection)
 * - Secure: Cookie only sent over HTTPS (in production)
 * - SameSite: CSRF protection (Lax or Strict)
 * - Path restricted to auth endpoints only
 * 
 * @param string $name Cookie name
 * @param string $value Cookie value (refresh token)
 * @param int $maxAge Max age in seconds
 * @param bool $clear If true, clears the cookie
 */
function setSecureRefreshCookie(string $name, string $value, int $maxAge = 604800, bool $clear = false): void {
    // Determine environment
    $isDev = ($_ENV['APP_DEBUG'] ?? 'false') === 'true';
    $isProduction = ($_ENV['APP_ENV'] ?? 'development') === 'production';
    
    // SECURITY: In production, ALWAYS enforce Secure flag
    // In development, allow non-secure for local proxy setups
    $secure = $isProduction || (($_ENV['SESSION_SECURE_COOKIE'] ?? 'false') === 'true');
    if ($isDev && !$isProduction) {
        $secure = false; // Allow HTTP in dev only
    }
    
    // SameSite: Strict is more secure but may break some flows
    $sameSite = $_ENV['SESSION_SAME_SITE'] ?? 'Lax';
    
    $domain = $_ENV['COOKIE_DOMAIN'] ?? '';
    
    $options = [
        'expires' => $clear ? 1 : time() + $maxAge, // 1 for past = delete
        'path' => '/api/endpoints/auth/',  // Only sent to auth endpoints
        'domain' => $domain,
        'secure' => $secure,
        'httponly' => true,  // CRITICAL: Not accessible from JavaScript
        'samesite' => $sameSite,
    ];
    
    setcookie($name, $clear ? '' : $value, $options);
}

/**
 * Check and enforce Panic Mode
 * Must be called early in request lifecycle
 */
function checkPanicMode(): void {
    // Only load if needed (lazy load to avoid overhead)
    if ($_SERVER['REQUEST_METHOD'] !== 'GET' && 
        $_SERVER['REQUEST_METHOD'] !== 'HEAD' && 
        $_SERVER['REQUEST_METHOD'] !== 'OPTIONS') {
        
        require_once __DIR__ . '/src/Security/PanicModeService.php';
        require_once __DIR__ . '/src/Middleware/PanicModeMiddleware.php';
        
        \NomadCMS\Middleware\PanicModeMiddleware::check();
    }
}

// Check panic mode early (after CORS but before any processing)
checkPanicMode();

/**
 * Handle CORS preflight requests globally
 */
function handlePreflight(): void {
    $allowedOrigins = array_map('trim', explode(',', $_ENV['CORS_ALLOWED_ORIGINS'] ?? ''));
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    
    // Always set CORS headers for allowed origins
    // SECURITY: With credentials, we MUST specify exact origin (not *)
    if (in_array($origin, $allowedOrigins, true)) {
        header("Access-Control-Allow-Origin: $origin");
        // Allow credentials (cookies) to be sent
        header('Access-Control-Allow-Credentials: true');
    } elseif (empty($origin)) {
        // Same-origin request (no Origin header) - allow but no credentials header needed
        // This happens for non-CORS requests
    } elseif (in_array('*', $allowedOrigins, true)) {
        // Wildcard mode - but cannot use with credentials!
        header("Access-Control-Allow-Origin: *");
        // Note: Cannot set Allow-Credentials with wildcard origin
    }
    
    header('Access-Control-Allow-Methods: ' . ($_ENV['CORS_ALLOWED_METHODS'] ?? 'GET, POST, PUT, DELETE, OPTIONS'));
    header('Access-Control-Allow-Headers: ' . ($_ENV['CORS_ALLOWED_HEADERS'] ?? 'Content-Type, Authorization, X-ADMIN-TOKEN, X-CSRF-TOKEN'));
    header('Access-Control-Max-Age: ' . ($_ENV['CORS_MAX_AGE'] ?? '86400'));
    
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PIGGYBACK QUEUE PROCESSING (No cron/daemon required!)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * On shared web hosting without cron access, we process queued images
 * by "piggybacking" on regular HTTP requests. Each request processes
 * 1-2 queue items after sending the response (via shutdown handler).
 * 
 * This is invisible to users - they get their response immediately,
 * then the server processes queue items in the background.
 * 
 * Enable/disable via: FORGE_PIGGYBACK_PROCESSING=true (default: true)
 */
function registerPiggybackProcessing(): void {
    // Only enable if configured (default: true for shared hosting)
    $enabled = ($_ENV['FORGE_PIGGYBACK_PROCESSING'] ?? 'true') === 'true';
    if (!$enabled) {
        return;
    }
    
    // Skip for certain request types
    $skipPaths = [
        '/api/endpoints/forge/',  // Don't slow down Forge imports
        '/api/endpoints/system/queue-process.php',  // Dedicated endpoint
    ];
    
    $requestUri = $_SERVER['REQUEST_URI'] ?? '';
    foreach ($skipPaths as $skip) {
        if (str_contains($requestUri, $skip)) {
            return;
        }
    }
    
    // Register shutdown handler to process queue after response
    register_shutdown_function(function() {
        // Flush output to client first (response sent immediately)
        if (function_exists('fastcgi_finish_request')) {
            fastcgi_finish_request();
        } else {
            // Fallback for non-FPM environments
            if (ob_get_level() > 0) {
                ob_end_flush();
            }
            flush();
        }
        
        // Now process queue items in the background
        try {
            // 1. Forge Image Queue (SmartIngest handles this)
            require_once __DIR__ . '/src/Services/SmartIngestService.php';
            \NomadCMS\Services\SmartIngestService::processPendingQueue(2);
            
            // 2. Webhook Queue (async webhook delivery)
            if (($_ENV['WEBHOOK_PIGGYBACK_PROCESSING'] ?? 'true') === 'true') {
                require_once __DIR__ . '/src/Services/WebhookQueueService.php';
                $webhookQueue = \NomadCMS\Services\WebhookQueueService::getInstance();
                
                // Only process if there are pending items (quick check)
                if ($webhookQueue->getPendingCount() > 0) {
                    $webhookQueue->processQueue();
                    
                    // Aggressive cleanup (5% of requests)
                    if (mt_rand(1, 100) <= 5) {
                        $webhookQueue->cleanup(3); // 3 days retention
                        $webhookQueue->cleanupStaleProcessing(5); // 5 min stale timeout
                    }
                }
            }
        } catch (\Throwable $e) {
            // Silent fail - don't break user experience
            error_log("[Piggyback] Queue processing error: " . $e->getMessage());
        }
    });
}

// Register piggyback processing for every request
registerPiggybackProcessing();
