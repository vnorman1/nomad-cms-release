<?php
/**
 * NOMAD CMS - Request Logger Middleware
 * Comprehensive HTTP request/response logging with auth context
 */

declare(strict_types=1);

namespace NomadCMS\Middleware;

require_once dirname(__DIR__) . '/Services/LoggerService.php';

use NomadCMS\Services\LoggerService;

final class RequestLoggerMiddleware
{
    private static float $startTime;
    private static string $requestId;
    private static bool $initialized = false;
    
    /**
     * CRITICAL: Cache for php://input stream
     * The stream can only be read ONCE, so we must cache it at startup
     */
    private static ?string $rawBody = null;
    private static bool $bodyRead = false;
    
    /**
     * Sensitive fields to mask in logs
     */
    private const SENSITIVE_FIELDS = [
        'password', 'password_confirmation', 'current_password', 'new_password',
        'token', 'access_token', 'refresh_token', 'api_key', 'secret',
        'authorization', 'x-api-key', 'cookie', 'set-cookie',
        'private_key', 'encryption_key', 'pepper', 'salt',
    ];
    
    /**
     * Paths to exclude from logging (to prevent recursive logging or reduce noise)
     */
    private const EXCLUDED_PATHS = [
        // System
        '/endpoints/system/logs.php',
        '/system/logs',
        // Public endpoints - GDPR: no logging
        '/endpoints/data.php',
        '/endpoints/schema.php',
        '/endpoints/sitemap.php',
        '/endpoints/batch-content.php',
        // Noisy routine auth endpoints
        '/endpoints/auth/me.php',
        '/endpoints/auth/preferences.php',
        '/endpoints/auth/ai-settings.php',
        '/endpoints/auth/settings.php',
        '/endpoints/auth/refresh.php',
    ];
    
    /**
     * Start request logging
     * Call this early in bootstrap.php
     */
    public static function start(): void
    {
        if (self::$initialized) {
            return;
        }
        
        // Check if this request should be excluded from logging
        $uri = $_SERVER['REQUEST_URI'] ?? '';
        $path = parse_url($uri, PHP_URL_PATH) ?? $uri;
        
        foreach (self::EXCLUDED_PATHS as $excluded) {
            if (str_contains($path, $excluded)) {
                // Don't log this request, but still initialize to prevent double-init
                self::$initialized = true;
                return;
            }
        }
        
        self::$initialized = true;
        self::$startTime = microtime(true);
        self::$requestId = substr(bin2hex(random_bytes(4)), 0, 8);
        
        // CRITICAL: Cache php://input NOW before any other code can consume it
        // This stream can only be read ONCE!
        if (!self::$bodyRead) {
            self::$rawBody = file_get_contents('php://input');
            self::$bodyRead = true;
        }
        
        // Start output buffering to capture response
        ob_start();
        
        // Register shutdown function to log after response is complete
        register_shutdown_function([self::class, 'finish']);
    }
    
    /**
     * Get the cached raw request body
     * 
     * IMPORTANT: Use this instead of file_get_contents('php://input')
     * because the stream can only be read once!
     * 
     * @return string|null The raw body content, or null if not yet captured
     */
    public static function getRawBody(): ?string
    {
        // If not yet read (e.g., logger was disabled), read it now
        if (!self::$bodyRead) {
            self::$rawBody = file_get_contents('php://input');
            self::$bodyRead = true;
        }
        return self::$rawBody;
    }
    
    /**
     * Complete request logging (called on shutdown)
     */
    public static function finish(): void
    {
        if (!self::$initialized) {
            return;
        }
        
        $executionTime = round((microtime(true) - self::$startTime) * 1000);
        $responseBody = ob_get_contents();
        
        // Get response code
        $statusCode = http_response_code();
        if ($statusCode === false) {
            $statusCode = 200;
        }
        
        // Build log entry
        $logData = self::buildLogData($responseBody, $statusCode, $executionTime);
        
        // Determine log level based on status code
        $level = match(true) {
            $statusCode >= 500 => 'error',
            $statusCode >= 400 => 'warning',
            default => 'info',
        };
        
        // Format the message
        $method = $_SERVER['REQUEST_METHOD'] ?? 'UNKNOWN';
        $uri = $_SERVER['REQUEST_URI'] ?? '/';
        $authType = $logData['auth_type'] ?? 'none';
        
        // Dynamic label based on auth type
        $authLabel = match($authType) {
            'api_key' => '[API-KEY]',
            'jwt' => '[ADMIN]',
            default => '[HTTP]',
        };
        
        $message = sprintf(
            '%s %s %s %d (%dms)',
            $authLabel,
            $method,
            parse_url($uri, PHP_URL_PATH) ?? $uri,
            $statusCode,
            $executionTime
        );
        
        // Log it
        LoggerService::$level($message, $logData);
        
        // Flush the buffer
        ob_end_flush();
    }
    
    /**
     * Build structured log data
     */
    private static function buildLogData(string $responseBody, int $statusCode, float $executionTime): array
    {
        $data = [
            'request_id' => self::$requestId,
            'method' => $_SERVER['REQUEST_METHOD'] ?? 'UNKNOWN',
            'uri' => $_SERVER['REQUEST_URI'] ?? '/',
            'status' => $statusCode,
            'time_ms' => $executionTime,
            'ip' => self::getClientIp(),
        ];
        
        // Add auth context
        $authContext = self::getAuthContext();
        if ($authContext) {
            $data = array_merge($data, $authContext);
        }
        
        // Add request data (sanitized)
        $requestData = self::getRequestData();
        if (!empty($requestData)) {
            $data['request'] = $requestData;
        }
        
        // Add response summary (sanitized and truncated)
        $responseSummary = self::getResponseSummary($responseBody);
        if (!empty($responseSummary)) {
            $data['response'] = $responseSummary;
        }
        
        return $data;
    }
    
    /**
     * Get authentication context from AuthMiddleware
     */
    private static function getAuthContext(): ?array
    {
        // Check if AuthMiddleware was used
        if (!class_exists(AuthMiddleware::class)) {
            return null;
        }
        
        $user = AuthMiddleware::getCurrentUser();
        if (!$user) {
            return ['auth_type' => 'none'];
        }
        
        // Check if it's API key auth
        if (isset($user->source) && $user->source === 'api_key') {
            return [
                'auth_type' => 'api_key',
                'key_id' => $user->key_id ?? null,
                'user_id' => $user->id ?? null,
                'email' => self::maskEmail($user->email ?? ''),
                'permissions' => $user->permissions ?? [],
            ];
        }
        
        // JWT auth
        return [
            'auth_type' => 'jwt',
            'user_id' => $user->id ?? null,
            'email' => self::maskEmail($user->email ?? ''),
            'is_admin' => $user->is_admin ?? false,
        ];
    }
    
    /**
     * Mask email address for privacy (e.g. "admin@cms.local" -> "a***@cms.local")
     */
    private static function maskEmail(string $email): string
    {
        if (empty($email) || !str_contains($email, '@')) {
            return $email;
        }
        
        [$local, $domain] = explode('@', $email, 2);
        
        if (strlen($local) <= 1) {
            return $local . '***@' . $domain;
        }
        
        return $local[0] . '***@' . $domain;
    }
    
    /**
     * Get sanitized request data
     */
    private static function getRequestData(): array
    {
        $data = [];
        
        // Query params
        if (!empty($_GET)) {
            $data['query'] = self::sanitize($_GET);
        }
        
        // Request body (using cached version)
        $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
        
        if (str_contains($contentType, 'application/json')) {
            // Use cached body instead of reading php://input again!
            $body = self::$rawBody;
            if ($body) {
                $decoded = json_decode($body, true);
                if (is_array($decoded)) {
                    $data['body'] = self::sanitize($decoded);
                }
            }
        } elseif (!empty($_POST)) {
            $data['body'] = self::sanitize($_POST);
        }
        
        // Limit size
        return self::truncateData($data, 500);
    }
    
    /**
     * Get sanitized response summary
     */
    private static function getResponseSummary(string $responseBody): array
    {
        if (empty($responseBody)) {
            return [];
        }
        
        // Try to parse as JSON
        $decoded = json_decode($responseBody, true);
        
        if (is_array($decoded)) {
            // Sanitize and summarize
            $summary = self::sanitize($decoded);
            
            // Keep only key info
            $result = [];
            
            if (isset($summary['success'])) {
                $result['success'] = $summary['success'];
            }
            if (isset($summary['error'])) {
                $result['error'] = self::truncateString($summary['error'], 100);
            }
            if (isset($summary['message'])) {
                $result['message'] = self::truncateString($summary['message'], 100);
            }
            if (isset($summary['code'])) {
                $result['code'] = $summary['code'];
            }
            
            // Count arrays
            foreach ($decoded as $key => $value) {
                if (is_array($value) && !in_array($key, ['success', 'error', 'message', 'code'])) {
                    $result[$key . '_count'] = count($value);
                }
            }
            
            return $result;
        }
        
        // Non-JSON response
        return [
            'type' => 'raw',
            'size' => strlen($responseBody),
        ];
    }
    
    /**
     * Sanitize data by masking sensitive fields
     */
    private static function sanitize(array $data): array
    {
        $result = [];
        
        foreach ($data as $key => $value) {
            // Cast key to string to handle numeric array keys
            $lowerKey = strtolower((string) $key);
            
            // Check if this is a sensitive field
            $isSensitive = false;
            foreach (self::SENSITIVE_FIELDS as $sensitiveField) {
                if (str_contains($lowerKey, $sensitiveField)) {
                    $isSensitive = true;
                    break;
                }
            }
            
            if ($isSensitive) {
                $result[$key] = '[REDACTED]';
            } elseif (is_array($value)) {
                $result[$key] = self::sanitize($value);
            } elseif (is_string($value) && strlen($value) > 200) {
                $result[$key] = self::truncateString($value, 200);
            } else {
                $result[$key] = $value;
            }
        }
        
        return $result;
    }
    
    /**
     * Truncate data structure to max size
     */
    private static function truncateData(array $data, int $maxChars): array
    {
        $json = json_encode($data);
        if (strlen($json) <= $maxChars) {
            return $data;
        }
        
        // Simplify the data
        return array_map(function($value) {
            if (is_array($value)) {
                $count = count($value);
                return "[array:$count]";
            }
            if (is_string($value) && strlen($value) > 50) {
                return self::truncateString($value, 50);
            }
            return $value;
        }, $data);
    }
    
    /**
     * Truncate string with ellipsis
     */
    private static function truncateString(string $str, int $max): string
    {
        if (strlen($str) <= $max) {
            return $str;
        }
        return substr($str, 0, $max - 3) . '...';
    }
    
    /**
     * Get client IP address
     */
    private static function getClientIp(): string
    {
        $headers = ['HTTP_CF_CONNECTING_IP', 'HTTP_X_FORWARDED_FOR', 'HTTP_X_REAL_IP', 'REMOTE_ADDR'];
        
        foreach ($headers as $header) {
            if (!empty($_SERVER[$header])) {
                $ip = $_SERVER[$header];
                // Handle comma-separated list (X-Forwarded-For)
                if (str_contains($ip, ',')) {
                    $ip = trim(explode(',', $ip)[0]);
                }
                return $ip;
            }
        }
        
        return 'unknown';
    }
}
