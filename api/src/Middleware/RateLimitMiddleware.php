<?php
/**
 * NOMAD CMS - Rate Limit Middleware
 * IP and user-based rate limiting for brute-force protection
 */

declare(strict_types=1);

namespace NomadCMS\Middleware;

use NomadCMS\Config\Security;
use RateLimit\Rate;
use RateLimit\RedisRateLimiter;
use RateLimit\InMemoryRateLimiter;

final class RateLimitMiddleware
{
    private static array $requestCounts = [];
    private static ?string $cacheDir = null;
    
    /**
     * Check rate limit for current request
     * Uses file-based storage for SQLite compatibility
     * 
     * @param string $key Unique identifier (IP, user ID, endpoint)
     * @param int $maxRequests Maximum requests allowed
     * @param int $windowSeconds Time window in seconds
     */
    public static function check(
        ?string $key = null,
        ?int $maxRequests = null,
        ?int $windowSeconds = null
    ): void {
        if (($_ENV['RATE_LIMIT_ENABLED'] ?? 'true') !== 'true') {
            return;
        }
        
        $settings = Security::getRateLimitSettings()['general'];
        $key = $key ?? self::getDefaultKey();
        $maxRequests = $maxRequests ?? $settings['max'];
        $windowSeconds = $windowSeconds ?? $settings['window'];
        
        $current = self::getCurrentCount($key, $windowSeconds);
        
        if ($current >= $maxRequests) {
            self::sendRateLimitError($maxRequests, $windowSeconds);
        }
        
        self::incrementCount($key, $windowSeconds);
    }
    
    /**
     * Special rate limit for authentication endpoints
     * Uses dynamic settings from .env
     */
    public static function checkAuth(): void
    {
        $settings = Security::getRateLimitSettings()['login'];
        self::check(
            key: 'auth:' . self::getClientIp(),
            maxRequests: $settings['max'],
            windowSeconds: $settings['window']
        );
    }
    
    /**
     * Very strict limit for password reset
     */
    public static function checkPasswordReset(): void
    {
        $settings = Security::getRateLimitSettings()['password_reset'];
        self::check(
            key: 'reset:' . self::getClientIp(),
            maxRequests: $settings['max'],
            windowSeconds: $settings['window']
        );
    }
    
    /**
     * Limit for TOTP verification
     */
    public static function checkTOTP(): void
    {
        $settings = Security::getRateLimitSettings()['totp'];
        self::check(
            key: 'totp:' . self::getClientIp(),
            maxRequests: $settings['max'],
            windowSeconds: $settings['window']
        );
    }
    
    /**
     * Limit for registration
     */
    public static function checkRegistration(): void
    {
        $settings = Security::getRateLimitSettings()['registration'];
        self::check(
            key: 'register:' . self::getClientIp(),
            maxRequests: $settings['max'],
            windowSeconds: $settings['window']
        );
    }
    
    /**
     * Rate limit for system update checks
     * Strict limits: 5 requests per minute
     */
    public static function checkSystemUpdateCheck(): void
    {
        self::check(
            key: 'update_check:' . self::getClientIp(),
            maxRequests: 5,
            windowSeconds: 60
        );
    }
    
    /**
     * Rate limit for applying system updates
     * Very strict: 2 requests per hour (prevents abuse)
     */
    public static function checkSystemUpdateApply(): void
    {
        self::check(
            key: 'update_apply:' . self::getClientIp(),
            maxRequests: 2,
            windowSeconds: 3600
        );
    }
    
    /**
     * Rate limit for fetching releases list
     * Moderate: 10 requests per minute
     */
    public static function checkSystemReleases(): void
    {
        self::check(
            key: 'releases:' . self::getClientIp(),
            maxRequests: 10,
            windowSeconds: 60
        );
    }
    
    /**
     * Get current count for key
     * Uses file locking to prevent race conditions
     */
    private static function getCurrentCount(string $key, int $windowSeconds): int
    {
        $cacheFile = self::getCacheFile($key);
        
        if (!file_exists($cacheFile)) {
            return 0;
        }
        
        // Use exclusive lock to prevent race condition
        $fp = fopen($cacheFile, 'r');
        if (!$fp) {
            return 0;
        }
        
        flock($fp, LOCK_SH); // Shared lock for reading
        $content = stream_get_contents($fp);
        flock($fp, LOCK_UN);
        fclose($fp);
        
        $data = json_decode($content, true);
        
        if (!$data || !isset($data['expires_at']) || $data['expires_at'] < time()) {
            @unlink($cacheFile);
            return 0;
        }
        
        return $data['count'] ?? 0;
    }
    
    /**
     * Increment request count
     * Uses exclusive file locking to prevent race conditions
     */
    private static function incrementCount(string $key, int $windowSeconds): void
    {
        $cacheFile = self::getCacheFile($key);
        $now = time();
        
        // Use exclusive lock for atomic read-modify-write
        $fp = fopen($cacheFile, 'c+');
        if (!$fp) {
            return;
        }
        
        flock($fp, LOCK_EX); // Exclusive lock
        
        $content = stream_get_contents($fp);
        $data = $content ? json_decode($content, true) : null;
        
        if ($data && isset($data['expires_at']) && $data['expires_at'] >= $now) {
            $data['count'] = ($data['count'] ?? 0) + 1;
        } else {
            $data = [
                'count' => 1,
                'expires_at' => $now + $windowSeconds,
            ];
        }
        
        // Rewind and truncate before writing
        ftruncate($fp, 0);
        rewind($fp);
        fwrite($fp, json_encode($data));
        fflush($fp);
        
        flock($fp, LOCK_UN);
        fclose($fp);
    }
    
    /**
     * Get cache file path for key
     */
    private static function getCacheFile(string $key): string
    {
        if (!self::$cacheDir) {
            self::$cacheDir = sys_get_temp_dir() . '/nomad_ratelimit';
            
            if (!is_dir(self::$cacheDir)) {
                mkdir(self::$cacheDir, 0755, true);
            }
        }
        
        $hash = md5($key);
        return self::$cacheDir . '/' . $hash . '.json';
    }
    
    /**
     * Get default rate limit key (IP + endpoint)
     */
    private static function getDefaultKey(): string
    {
        $ip = self::getClientIp();
        $endpoint = $_SERVER['REQUEST_URI'] ?? '/';
        
        return "ip:{$ip}:endpoint:{$endpoint}";
    }
    
    /**
     * Get client IP address
     * SECURITY: Only trusts proxy headers when connection is from a trusted proxy
     */
    private static function getClientIp(): string
    {
        $directIp = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
        
        // Get trusted proxies from environment (comma-separated IPs or CIDR ranges)
        // Example: TRUSTED_PROXIES=127.0.0.1,10.0.0.0/8,172.16.0.0/12
        $trustedProxies = array_filter(
            array_map('trim', explode(',', $_ENV['TRUSTED_PROXIES'] ?? ''))
        );
        
        // If no trusted proxies configured or direct IP is not trusted, use REMOTE_ADDR
        if (empty($trustedProxies) || !self::isIpInRanges($directIp, $trustedProxies)) {
            return $directIp;
        }
        
        // Direct IP is from a trusted proxy - check forwarded headers
        $headers = [
            'HTTP_CF_CONNECTING_IP',     // Cloudflare (highest priority)
            'HTTP_X_FORWARDED_FOR',      // Standard proxy
            'HTTP_X_REAL_IP',            // Nginx
        ];
        
        foreach ($headers as $header) {
            if (!empty($_SERVER[$header])) {
                // X-Forwarded-For may contain multiple IPs, get the first (original client)
                $ip = explode(',', $_SERVER[$header])[0];
                $ip = trim($ip);
                
                if (filter_var($ip, FILTER_VALIDATE_IP)) {
                    return $ip;
                }
            }
        }
        
        return $directIp;
    }
    
    /**
     * Check if an IP is within any of the given CIDR ranges
     */
    private static function isIpInRanges(string $ip, array $ranges): bool
    {
        foreach ($ranges as $range) {
            if (self::isIpInCidr($ip, $range)) {
                return true;
            }
        }
        return false;
    }
    
    /**
     * Check if an IP is within a CIDR range
     */
    private static function isIpInCidr(string $ip, string $cidr): bool
    {
        // Handle single IP (no CIDR notation)
        if (strpos($cidr, '/') === false) {
            return $ip === $cidr;
        }
        
        list($subnet, $bits) = explode('/', $cidr);
        $bits = (int) $bits;
        
        $ipLong = ip2long($ip);
        $subnetLong = ip2long($subnet);
        
        if ($ipLong === false || $subnetLong === false) {
            return false;
        }
        
        $mask = -1 << (32 - $bits);
        return ($ipLong & $mask) === ($subnetLong & $mask);
    }
    
    /**
     * Reset rate limit for key
     * Use after successful authentication
     */
    public static function reset(string $key): void
    {
        $cacheFile = self::getCacheFile($key);
        
        if (file_exists($cacheFile)) {
            @unlink($cacheFile);
        }
    }
    
    /**
     * Get remaining requests for current client
     */
    public static function getRemaining(?string $key = null): int
    {
        $key = $key ?? self::getDefaultKey();
        $settings = Security::getRateLimitSettings()['general'];
        
        $current = self::getCurrentCount($key, $settings['window']);
        
        return max(0, $settings['max'] - $current);
    }
    
    /**
     * Send rate limit exceeded error
     */
    private static function sendRateLimitError(int $limit, int $window): never
    {
        http_response_code(429);
        header('Content-Type: application/json');
        header("Retry-After: $window");
        header("X-RateLimit-Limit: $limit");
        header('X-RateLimit-Remaining: 0');
        
        echo json_encode([
            'success' => false,
            'error' => 'Too many requests. Please try again later.',
            'code' => 'RATE_LIMIT_EXCEEDED',
            'retry_after' => $window,
        ]);
        
        exit;
    }
    
    /**
     * Cleanup old cache files (call periodically)
     */
    public static function cleanup(): int
    {
        if (!self::$cacheDir || !is_dir(self::$cacheDir)) {
            return 0;
        }
        
        $cleaned = 0;
        $now = time();
        
        foreach (glob(self::$cacheDir . '/*.json') as $file) {
            $data = json_decode(file_get_contents($file), true);
            
            if (!$data || !isset($data['expires_at']) || $data['expires_at'] < $now) {
                @unlink($file);
                $cleaned++;
            }
        }
        
        return $cleaned;
    }
}
