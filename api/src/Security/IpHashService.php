<?php
/**
 * NOMAD CMS - IP Hash Service
 * Handles secure HMAC-SHA256 hashing of IP addresses for storage and binding
 */

declare(strict_types=1);

namespace NomadCMS\Security;

use NomadCMS\Config\Security;

final class IpHashService
{
    /**
     * Generate a secure hash of an IP address
     * Uses HMAC-SHA256 with a secret key
     * 
     * @throws \RuntimeException if IP_HASH_SECRET is not configured
     */
    public static function hash(string $ip): string
    {
        $secret = $_ENV['IP_HASH_SECRET'] ?? null;
        
        if (empty($secret)) {
            throw new \RuntimeException(
                'IP_HASH_SECRET not configured. Generate with: php -r "echo bin2hex(random_bytes(32));"'
            );
        }
        
        return hash_hmac('sha256', $ip, $secret);
    }
    
    /**
     * Verify if an IP address matches a stored hash
     */
    public static function verify(string $ip, string $storedHash): bool
    {
        return hash_equals($storedHash, self::hash($ip));
    }
}
