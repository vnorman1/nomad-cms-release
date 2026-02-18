<?php
/**
 * NOMAD CMS - Security Configuration
 * Centralized security constants and settings (all from .env)
 */

declare(strict_types=1);

namespace NomadCMS\Config;

final class Security
{
    // JWT Settings (defaults)
    public const JWT_ALGORITHM = 'HS256';
    public const JWT_ACCESS_TTL = 900;
    public const JWT_REFRESH_TTL = 604800;
    
    // Token lengths
    public const REFRESH_TOKEN_LENGTH = 64;
    public const CSRF_TOKEN_LENGTH = 32;
    
    /**
     * Get JWT secret from environment
     */
    public static function getJwtSecret(): string
    {
        return $_ENV['JWT_SECRET'] ?? throw new \RuntimeException('JWT_SECRET not configured');
    }
    
    /**
     * Get JWT algorithm from environment or default
     */
    public static function getJwtAlgorithm(): string
    {
        return $_ENV['JWT_ALGORITHM'] ?? self::JWT_ALGORITHM;
    }
    
    /**
     * Check if using asymmetric algorithm (RS256, RS384, RS512, ES256, etc.)
     */
    public static function isAsymmetricJwt(): bool
    {
        $algo = self::getJwtAlgorithm();
        return str_starts_with($algo, 'RS') || str_starts_with($algo, 'ES') || str_starts_with($algo, 'PS');
    }
    
    /**
     * Get JWT private key for RS256 signing
     */
    public static function getJwtPrivateKey(): string
    {
        $keyPath = $_ENV['JWT_PRIVATE_KEY_PATH'] ?? 'keys/private.pem';
        $fullPath = __DIR__ . '/../../' . $keyPath;
        
        if (!file_exists($fullPath)) {
            throw new \RuntimeException("JWT private key not found at: $keyPath");
        }
        
        $key = file_get_contents($fullPath);
        if ($key === false) {
            throw new \RuntimeException("Failed to read JWT private key");
        }
        
        return $key;
    }
    
    /**
     * Get JWT public key for RS256 verification
     */
    public static function getJwtPublicKey(): string
    {
        $keyPath = $_ENV['JWT_PUBLIC_KEY_PATH'] ?? 'keys/public.pem';
        $fullPath = __DIR__ . '/../../' . $keyPath;
        
        if (!file_exists($fullPath)) {
            throw new \RuntimeException("JWT public key not found at: $keyPath");
        }
        
        $key = file_get_contents($fullPath);
        if ($key === false) {
            throw new \RuntimeException("Failed to read JWT public key");
        }
        
        return $key;
    }
    
    /**
     * Get the appropriate JWT key for signing (private key for RS256, secret for HS256)
     */
    public static function getJwtSigningKey(): string
    {
        return self::isAsymmetricJwt() ? self::getJwtPrivateKey() : self::getJwtSecret();
    }
    
    /**
     * Get the appropriate JWT key for verification (public key for RS256, secret for HS256)
     */
    public static function getJwtVerificationKey(): string
    {
        return self::isAsymmetricJwt() ? self::getJwtPublicKey() : self::getJwtSecret();
    }
    
    /**
     * Get password pepper (server-side secret)
     */
    public static function getPasswordPepper(): string
    {
        $pepper = $_ENV['PASSWORD_PEPPER'] ?? '';
        if (empty($pepper) || strpos($pepper, 'CHANGE_ME') !== false) {
            throw new \RuntimeException('PASSWORD_PEPPER not configured properly');
        }
        return $pepper;
    }
    
    /**
     * Get password salt prefix
     */
    public static function getSaltPrefix(): string
    {
        return $_ENV['PASSWORD_SALT_PREFIX'] ?? '';
    }
    
    /**
     * Get Argon2ID password hashing options from .env
     */
    public static function getPasswordOptions(): array
    {
        return [
            'memory_cost' => (int) ($_ENV['PASSWORD_MEMORY_COST'] ?? 65536),
            'time_cost' => (int) ($_ENV['PASSWORD_TIME_COST'] ?? 4),
            'threads' => (int) ($_ENV['PASSWORD_THREADS'] ?? 3),
        ];
    }
    
    /**
     * Get account lock settings
     */
    public static function getAccountLockSettings(): array
    {
        return [
            'max_attempts' => (int) ($_ENV['ACCOUNT_MAX_FAILED_ATTEMPTS'] ?? 5),
            'lock_duration' => (int) ($_ENV['ACCOUNT_LOCK_DURATION'] ?? 900),
        ];
    }
    
    /**
     * Get rate limit settings from .env
     */
    public static function getRateLimitSettings(): array
    {
        return [
            'general' => [
                'max' => (int) ($_ENV['RATE_LIMIT_MAX_REQUESTS'] ?? 100),
                'window' => (int) ($_ENV['RATE_LIMIT_WINDOW_SECONDS'] ?? 60),
            ],
            'login' => [
                'max' => (int) ($_ENV['AUTH_RATE_LIMIT_LOGIN'] ?? 10),
                'window' => (int) ($_ENV['AUTH_RATE_LIMIT_LOGIN_WINDOW'] ?? 300),
            ],
            'totp' => [
                'max' => (int) ($_ENV['AUTH_RATE_LIMIT_TOTP'] ?? 5),
                'window' => (int) ($_ENV['AUTH_RATE_LIMIT_TOTP_WINDOW'] ?? 60),
            ],
            'password_reset' => [
                'max' => (int) ($_ENV['AUTH_RATE_LIMIT_PASSWORD_RESET'] ?? 3),
                'window' => (int) ($_ENV['AUTH_RATE_LIMIT_PASSWORD_RESET_WINDOW'] ?? 3600),
            ],
            'registration' => [
                'max' => (int) ($_ENV['AUTH_RATE_LIMIT_REGISTRATION'] ?? 5),
                'window' => (int) ($_ENV['AUTH_RATE_LIMIT_REGISTRATION_WINDOW'] ?? 3600),
            ],
            'public_api' => [
                'max' => (int) ($_ENV['PUBLIC_API_RATE_LIMIT_MAX'] ?? 200),
                'window' => (int) ($_ENV['PUBLIC_API_RATE_LIMIT_WINDOW'] ?? 60),
            ],
            'static_serve' => [
                'max' => (int) ($_ENV['STATIC_SERVE_RATE_LIMIT_MAX'] ?? 300),
                'window' => (int) ($_ENV['STATIC_SERVE_RATE_LIMIT_WINDOW'] ?? 60),
            ],
        ];
    }
    
    /**
     * Get WebAuthn Relying Party configuration
     */
    public static function getWebAuthnConfig(): array
    {
        return [
            'enabled' => ($_ENV['AUTH_WEBAUTHN_ENABLED'] ?? 'true') === 'true',
            'rp_name' => $_ENV['WEBAUTHN_RP_NAME'] ?? 'NOMAD CMS',
            'rp_id' => $_ENV['WEBAUTHN_RP_ID'] ?? 'localhost',
            'rp_origin' => $_ENV['WEBAUTHN_RP_ORIGIN'] ?? 'http://localhost:3000',
            'timeout' => (int) ($_ENV['WEBAUTHN_TIMEOUT'] ?? 60000),
            'user_verification' => $_ENV['WEBAUTHN_USER_VERIFICATION'] ?? 'preferred',
        ];
    }
    
    /**
     * Get TOTP configuration
     */
    public static function getTotpConfig(): array
    {
        return [
            'enabled' => ($_ENV['AUTH_TOTP_ENABLED'] ?? 'true') === 'true',
            'issuer' => $_ENV['TOTP_ISSUER'] ?? 'NOMAD CMS',
            'digits' => (int) ($_ENV['TOTP_DIGITS'] ?? 6),
            'period' => (int) ($_ENV['TOTP_PERIOD'] ?? 30),
            'algorithm' => $_ENV['TOTP_ALGORITHM'] ?? 'sha256',
        ];
    }
    
    /**
     * Check if feature is enabled
     */
    public static function isFeatureEnabled(string $feature): bool
    {
        return match ($feature) {
            'totp' => ($_ENV['AUTH_TOTP_ENABLED'] ?? 'true') === 'true',
            'webauthn' => ($_ENV['AUTH_WEBAUTHN_ENABLED'] ?? 'true') === 'true',
            'password' => ($_ENV['AUTH_PASSWORD_ENABLED'] ?? 'true') === 'true',
            'registration' => ($_ENV['AUTH_REGISTRATION_ENABLED'] ?? 'true') === 'true',
            'email_verification' => ($_ENV['AUTH_REQUIRE_EMAIL_VERIFICATION'] ?? 'false') === 'true',
            default => false,
        };
    }
}

