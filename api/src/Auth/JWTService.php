<?php
/**
 * NOMAD CMS - JWT Service
 * Token generation, validation, and refresh handling
 */

declare(strict_types=1);

namespace NomadCMS\Auth;

use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Firebase\JWT\ExpiredException;
use Firebase\JWT\SignatureInvalidException;
use NomadCMS\Config\Security;
use Ramsey\Uuid\Uuid;

final class JWTService
{
    /**
     * Generate access token for authenticated user
     */
    public static function generateAccessToken(array $user): string
    {
        $now = time();
        $ttl = (int) ($_ENV['JWT_ACCESS_TOKEN_TTL'] ?? Security::JWT_ACCESS_TTL);
        
        // Determine role - use explicit role if set, otherwise derive from is_admin
        $role = $user['role'] ?? ($user['is_admin'] ? 'admin' : 'viewer');
        
        $payload = [
            'iss' => $_ENV['JWT_ISSUER'] ?? 'nomad-cms',
            'aud' => $_ENV['JWT_AUDIENCE'] ?? 'nomad-cms-frontend',
            'iat' => $now,
            'nbf' => $now,
            'exp' => $now + $ttl,
            'sub' => $user['uuid'],
            'jti' => Uuid::uuid4()->toString(),
            'ip_hash' => \NomadCMS\Security\IpHashService::hash($_SERVER['REMOTE_ADDR'] ?? ''),
            'user' => [
                'id' => $user['id'],
                'uuid' => $user['uuid'],
                'email' => $user['email'],
                'role' => $role,  // RBAC: admin, editor, viewer
                'is_admin' => (bool) ($user['is_admin'] ?? false),
                'is_new_user' => (bool) ($user['is_new_user'] ?? false),
            ],
        ];
        
        return JWT::encode(
            $payload,
            Security::getJwtSigningKey(),
            Security::getJwtAlgorithm()
        );
    }
    
    /**
     * Generate refresh token
     * 
     * Returns both the plain token (to send to client) and its hash (to store in DB)
     * 
     * SECURITY NOTES:
     * - plain_token: Cryptographically secure random (512 bits entropy)
     * - token_hash: SHA-256 hash stored in DB (token never stored in plaintext)
     * - Even if DB is compromised, hashes cannot be reversed to get tokens
     * - Client stores token in:
     *   1. httpOnly cookie (PRIMARY - XSS immune)
     *   2. AES-256-GCM encrypted localStorage (FALLBACK)
     * 
     * @return array{plain_token: string, token_hash: string, family: string, expires_at: string, user_id: int}
     */
    public static function generateRefreshToken(int $userId): array
    {
        // Generate 64 bytes (512 bits) of cryptographically secure random data
        $plainToken = bin2hex(random_bytes(Security::REFRESH_TOKEN_LENGTH));
        
        // Only the hash is stored in DB - never the plain token
        $tokenHash = hash('sha256', $plainToken);
        
        // Token family for refresh rotation tracking
        $family = Uuid::uuid4()->toString();
        
        $ttl = (int) ($_ENV['JWT_REFRESH_TOKEN_TTL'] ?? Security::JWT_REFRESH_TTL);
        $expiresAt = date('Y-m-d H:i:s', time() + $ttl);
        
        return [
            'plain_token' => $plainToken,
            'token_hash' => $tokenHash,
            'family' => $family,
            'expires_at' => $expiresAt,
            'user_id' => $userId,
        ];
    }
    
    /**
     * Validate access token and return payload
     * 
     * @throws \Exception on invalid token
     */
    public static function validateAccessToken(string $token): object
    {
        // SECURITY: Pre-validate token structure to prevent algorithm attacks
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            throw new \Exception('Invalid token format', 401);
        }
        
        // Decode header to check algorithm BEFORE verification
        $headerJson = base64_decode(strtr($parts[0], '-_', '+/'));
        if ($headerJson === false) {
            throw new \Exception('Invalid token header encoding', 401);
        }
        
        $header = json_decode($headerJson, true);
        if (!$header || !isset($header['alg'])) {
            throw new \Exception('Invalid token header', 401);
        }
        
        // CRITICAL: Reject "none" algorithm and any algorithm mismatch
        $allowedAlgorithm = Security::getJwtAlgorithm();
        $tokenAlgorithm = strtoupper($header['alg']);
        
        if ($tokenAlgorithm === 'NONE' || $tokenAlgorithm === '') {
            throw new \Exception('Algorithm "none" is not allowed', 401);
        }
        
        if ($tokenAlgorithm !== strtoupper($allowedAlgorithm)) {
            throw new \Exception('Algorithm mismatch: expected ' . $allowedAlgorithm, 401);
        }
        
        try {
            $decoded = JWT::decode(
                $token,
                new Key(Security::getJwtVerificationKey(), $allowedAlgorithm)
            );
            
            // SECURITY: Additional expiry check (defense in depth)
            if (!isset($decoded->exp) || $decoded->exp < time()) {
                throw new \Exception('Token expired', 401);
            }
            
            // Verify required claims exist
            if (!isset($decoded->sub) || !isset($decoded->user)) {
                throw new \Exception('Token missing required claims', 401);
            }
            
            return $decoded;
            
        } catch (ExpiredException $e) {
            throw new \Exception('Token expired', 401);
        } catch (SignatureInvalidException $e) {
            throw new \Exception('Invalid token signature', 401);
        } catch (\Exception $e) {
            // Re-throw our own exceptions
            if ($e->getCode() === 401) {
                throw $e;
            }
            throw new \Exception('Invalid token: ' . $e->getMessage(), 401);
        }
    }
    
    /**
     * Extract token from Authorization header
     */
    public static function extractBearerToken(): ?string
    {
        // Get headers - use global function with fallback for different PHP SAPIs
        $headers = [];
        
        if (\function_exists('getallheaders')) {
            $headers = \getallheaders();
        }
        
        // Also check $_SERVER for HTTP_AUTHORIZATION (works in all environments)
        // This is the most reliable method for PHP built-in server and proxies
        if (isset($_SERVER['HTTP_AUTHORIZATION'])) {
            $authHeader = $_SERVER['HTTP_AUTHORIZATION'];
        } elseif (isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
            // Apache with mod_rewrite sometimes uses this
            $authHeader = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
        } else {
            // Fallback to getallheaders result (case-insensitive search)
            $authHeader = '';
            foreach ($headers as $key => $value) {
                if (strtolower($key) === 'authorization') {
                    $authHeader = $value;
                    break;
                }
            }
        }
        
        if (preg_match('/^Bearer\s+(.+)$/i', $authHeader, $matches)) {
            return $matches[1];
        }
        
        return null;
    }
    
    /**
     * Verify refresh token hash
     */
    public static function verifyRefreshToken(string $plainToken, string $storedHash): bool
    {
        return hash_equals($storedHash, hash('sha256', $plainToken));
    }
    
    /**
     * Get remaining time until token expires (in seconds)
     */
    public static function getTokenRemainingTime(object $decoded): int
    {
        return max(0, $decoded->exp - time());
    }
    
    /**
     * Check if token needs refresh (less than 5 minutes remaining)
     */
    public static function shouldRefreshToken(object $decoded): bool
    {
        return self::getTokenRemainingTime($decoded) < 300;
    }
}
