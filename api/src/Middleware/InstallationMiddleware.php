<?php
/**
 * NOMAD CMS - Installation Middleware
 * Protects installation endpoint and enforces installation status
 */

declare(strict_types=1);

namespace NomadCMS\Middleware;

use NomadCMS\Installer\InstallerService;

final class InstallationMiddleware
{
    /**
     * Check installation status and handle routing
     * Call this at the start of protected endpoints
     */
    public static function check(): void
    {
        // If not installed, allow access to install endpoints only
        if (!InstallerService::isInstalled()) {
            // Check if this is NOT an install endpoint
            $requestUri = $_SERVER['REQUEST_URI'] ?? '';
            
            if (!self::isInstallEndpoint($requestUri)) {
                // Redirect to install or return error for API calls
                if (self::isApiRequest()) {
                    http_response_code(503);
                    header('Content-Type: application/json');
                    echo json_encode([
                        'success' => false,
                        'error' => 'System not installed',
                        'redirect' => '/nomad/install',
                    ], JSON_UNESCAPED_UNICODE);
                    exit;
                }
            }
        }
    }

    /**
     * Block access to /install if already installed
     * Returns 403 Forbidden
     */
    public static function requireNotInstalled(): void
    {
        if (InstallerService::isInstalled()) {
            http_response_code(403);
            header('Content-Type: application/json');
            echo json_encode([
                'success' => false,
                'error' => 'Installation already completed',
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }
    }

    /**
     * Ensure system is installed before allowing access
     * Use for all protected API endpoints
     */
    public static function requireInstalled(): void
    {
        if (!InstallerService::isInstalled()) {
            http_response_code(503);
            header('Content-Type: application/json');
            echo json_encode([
                'success' => false,
                'error' => 'System not installed',
                'redirect' => '/nomad/install',
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }
    }

    /**
     * Check if current request is to an install endpoint
     */
    private static function isInstallEndpoint(string $uri): bool
    {
        // Normalize URI
        $path = parse_url($uri, PHP_URL_PATH) ?? '';
        $path = strtolower(trim($path, '/'));
        
        // Match install endpoints
        return str_starts_with($path, 'api/endpoints/install') ||
               str_starts_with($path, 'endpoints/install') ||
               $path === 'install';
    }

    /**
     * Check if this is an API request (vs browser request)
     */
    private static function isApiRequest(): bool
    {
        $accept = $_SERVER['HTTP_ACCEPT'] ?? '';
        $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
        $requestUri = $_SERVER['REQUEST_URI'] ?? '';
        
        return str_contains($accept, 'application/json') ||
               str_contains($contentType, 'application/json') ||
               str_contains($requestUri, '/api/') ||
               str_contains($requestUri, '.php');
    }

    /**
     * Rate limit installation attempts
     * Simple file-based rate limiting
     */
    public static function rateLimit(int $maxAttempts = 5, int $windowSeconds = 300): void
    {
        $rateLimitFile = dirname(__DIR__, 2) . '/data/install_attempts.json';
        $clientIp = self::getClientIp();
        
        $attempts = [];
        
        // Load existing attempts
        if (file_exists($rateLimitFile)) {
            $content = file_get_contents($rateLimitFile);
            $attempts = json_decode($content, true) ?? [];
        }
        
        // Clean old attempts
        $cutoffTime = time() - $windowSeconds;
        foreach ($attempts as $ip => $timestamps) {
            $attempts[$ip] = array_filter($timestamps, fn($t) => $t > $cutoffTime);
            if (empty($attempts[$ip])) {
                unset($attempts[$ip]);
            }
        }
        
        // Check rate limit
        $clientAttempts = $attempts[$clientIp] ?? [];
        if (count($clientAttempts) >= $maxAttempts) {
            http_response_code(429);
            header('Content-Type: application/json');
            header('Retry-After: ' . $windowSeconds);
            echo json_encode([
                'success' => false,
                'error' => 'Too many installation attempts. Please try again later.',
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }
        
        // Record this attempt
        $attempts[$clientIp][] = time();
        
        // Save attempts
        $dir = dirname($rateLimitFile);
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        file_put_contents($rateLimitFile, json_encode($attempts));
    }

    /**
     * Get client IP address
     */
    private static function getClientIp(): string
    {
        $headers = [
            'HTTP_CF_CONNECTING_IP',
            'HTTP_X_FORWARDED_FOR',
            'HTTP_X_REAL_IP',
            'REMOTE_ADDR',
        ];
        
        foreach ($headers as $header) {
            if (!empty($_SERVER[$header])) {
                $ip = $_SERVER[$header];
                // Handle comma-separated IPs (X-Forwarded-For)
                if (str_contains($ip, ',')) {
                    $ip = trim(explode(',', $ip)[0]);
                }
                if (filter_var($ip, FILTER_VALIDATE_IP)) {
                    return $ip;
                }
            }
        }
        
        return '127.0.0.1';
    }
}
