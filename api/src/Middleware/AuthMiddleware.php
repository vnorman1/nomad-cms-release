<?php
/**
 * NOMAD CMS - Auth Middleware
 * JWT Bearer token validation and user context injection
 */

declare(strict_types=1);

namespace NomadCMS\Middleware;

use NomadCMS\Auth\JWTService;
use NomadCMS\Security\ApiKeyService;

final class AuthMiddleware
{
    private static ?object $currentUser = null;
    private static ?array $apiKeyData = null;
    
    /**
     * Require authenticated user
     * Call at the beginning of protected endpoints
     *
     * @param bool $allowForcedPasswordChange If true, allows users who must change password to access this endpoint
     * @throws \Exception if not authenticated
     */
    public static function requireAuth(bool $allowForcedPasswordChange = false): object
    {
        $token = JWTService::extractBearerToken();
        $errors = [];
        
        // 1. Try JWT first (preferred for user sessions)
        if ($token) {
            try {
                $decoded = JWTService::validateAccessToken($token);
                
                // SECURITY: Validate IP binding if present in token
                if (isset($decoded->ip_hash)) {
                    $currentIpHash = \NomadCMS\Security\IpHashService::hash($_SERVER['REMOTE_ADDR'] ?? '');
                    
                    // Use constant-time comparison
                    if (!hash_equals($decoded->ip_hash, $currentIpHash)) {
                        self::sendUnauthorized('Session IP mismatch. Please login again.');
                    }
                }
                
                self::$currentUser = $decoded->user;
                
                // SECURITY: Check if Panic Mode is active (read-only mode)
                // Non-GET requests from non-admins are blocked during panic
                if (self::isPanicModeBlockingRequest()) {
                    self::sendServiceUnavailable('System is in emergency read-only mode');
                }
                
                // Check if user is forced to change password
                if (!self::checkForcedPasswordChange($allowForcedPasswordChange)) {
                     self::sendForbidden('Password change required', 'FORCE_PASSWORD_CHANGE');
                }

                return self::$currentUser;
            } catch (\Exception $e) {
                $errors[] = "JWT: " . $e->getMessage();
            }
        }
        
        // 2. Try API Key (for external integrations)
        $apiKey = $_SERVER['HTTP_X_API_KEY'] ?? null;
        
        if ($apiKey) {
            try {
                $apiKeyService = new ApiKeyService();
                $keyData = $apiKeyService->validateKey($apiKey);
                
                if ($keyData) {
                    // Store API key data for permission checks
                    self::$apiKeyData = $keyData;
                    
                    // Construct synthetic user object for compatibility
                    self::$currentUser = (object) [
                        'id' => $keyData['user_id'],
                        'uuid' => $keyData['user_uuid'],
                        'email' => $keyData['user_email'],
                        'role' => $keyData['is_admin'] ? 'admin' : 'editor',
                        'is_admin' => $keyData['is_admin'] || $keyData['user_is_admin'],
                        'source' => 'api_key',
                        'key_id' => $keyData['key_id'],
                        'permissions' => $keyData['permissions'],
                        'can_read' => $keyData['can_read'],
                        'can_write' => $keyData['can_write'],
                    ];
                    
                    return self::$currentUser;
                } else {
                    $errors[] = "API Key: Invalid or expired key";
                }
            } catch (\Exception $e) {
                $errors[] = "API Key: " . $e->getMessage();
            }
        }
        
        // 3. Failed - no valid authentication
        $msg = 'Unauthorized';
        if (!empty($errors)) {
            $msg .= ' (' . implode(', ', $errors) . ')';
        } else {
            $msg .= ' (No token or API key provided)';
        }
        
        self::sendUnauthorized($msg);
    }
    
    /**
     * Check if user needs to change password and if it's allowed for current context
     */
    private static function checkForcedPasswordChange(bool $allowForcedPasswordChange): bool 
    {
        if (!self::$currentUser) return false;
        
        // If it's an API Key, we generally assume it's a service account or programmatic access, 
        // which might not be subject to interactive password reset, BUT if the underlying user 
        // is new, maybe we should block? For now, let's assume API keys are fine or handled separately.
        // Actually, let's enforce it for consistency if we have the user data.
        // However, the `is_new_user` flag might strictly be for the interactive UI flow. 
        // Let's check the flag on the user object.
        
        $isNewUser = isset(self::$currentUser->is_new_user) && (
            self::$currentUser->is_new_user === true || 
            self::$currentUser->is_new_user === 1 ||
            self::$currentUser->is_new_user === '1'
        );
        
        if ($isNewUser && !$allowForcedPasswordChange) {
            return false;
        }
        
        return true;
    }
    
    /**
     * Require admin role
     * Must be called after requireAuth()
     */
    public static function requireAdmin(): void
    {
        if (!self::$currentUser) {
            self::requireAuth();
        }
        
        if (!self::$currentUser->is_admin) {
            self::sendForbidden('Admin access required');
        }
    }
    
    /**
     * Require specific API key permission
     * Only applies to API key authentication
     */
    public static function requirePermission(string $permission): void
    {
        if (!self::$currentUser) {
            self::requireAuth();
        }
        
        // JWT users have full access (permission controlled by role)
        if (!isset(self::$currentUser->source) || self::$currentUser->source !== 'api_key') {
            return;
        }
        
        // Check API key permissions
        $allowed = match($permission) {
            'read' => self::$currentUser->can_read ?? false,
            'write' => self::$currentUser->can_write ?? false,
            'admin' => self::$currentUser->is_admin ?? false,
            default => false,
        };
        
        if (!$allowed) {
            self::sendForbidden("API key does not have '{$permission}' permission");
        }
    }
    
    /**
     * Check if current auth is via API key
     */
    public static function isApiKeyAuth(): bool
    {
        return isset(self::$currentUser->source) && self::$currentUser->source === 'api_key';
    }
    
    /**
     * Get API key data (only available for API key auth)
     */
    public static function getApiKeyData(): ?array
    {
        return self::$apiKeyData;
    }
    
    /**
     * Optional authentication
     * Returns user if token present and valid, null otherwise
     */
    public static function optionalAuth(): ?object
    {
        $token = JWTService::extractBearerToken();
        $apiKey = $_SERVER['HTTP_X_API_KEY'] ?? null;
        
        // Try JWT first
        if ($token) {
            try {
                $decoded = JWTService::validateAccessToken($token);
                self::$currentUser = $decoded->user;
                return self::$currentUser;
            } catch (\Exception $e) {
                // Continue to try API key
            }
        }
        
        // Try API key
        if ($apiKey) {
            try {
                $apiKeyService = new ApiKeyService();
                $keyData = $apiKeyService->validateKey($apiKey);
                
                if ($keyData) {
                    self::$apiKeyData = $keyData;
                    self::$currentUser = (object) [
                        'id' => $keyData['user_id'],
                        'uuid' => $keyData['user_uuid'],
                        'email' => $keyData['user_email'],
                        'role' => $keyData['is_admin'] ? 'admin' : 'editor',
                        'is_admin' => $keyData['is_admin'] || $keyData['user_is_admin'],
                        'source' => 'api_key',
                        'key_id' => $keyData['key_id'],
                        'permissions' => $keyData['permissions'],
                        'can_read' => $keyData['can_read'],
                        'can_write' => $keyData['can_write'],
                    ];
                    return self::$currentUser;
                }
            } catch (\Exception $e) {
                // Continue
            }
        }
        
        return null;
    }
    
    /**
     * Get current authenticated user
     */
    public static function getCurrentUser(): ?object
    {
        return self::$currentUser;
    }
    
    /**
     * Check if current user has specific permission
     */
    public static function hasPermission(string $permission): bool
    {
        if (!self::$currentUser) {
            return false;
        }
        
        // Admin has all permissions
        if (self::$currentUser->is_admin) {
            return true;
        }
        
        // TODO: Implement granular permissions system
        return false;
    }
    
    /**
     * Send 401 Unauthorized response and exit
     */
    private static function sendUnauthorized(string $message): never
    {
        http_response_code(401);
        header('Content-Type: application/json');
        header('WWW-Authenticate: Bearer');
        
        echo json_encode([
            'success' => false,
            'error' => $message,
            'code' => 'UNAUTHORIZED',
        ]);
        
        exit;
    }
    
    /**
     * Send 403 Forbidden response and exit
     */
    private static function sendForbidden(string $message, string $code = 'FORBIDDEN'): never
    {
        http_response_code(403);
        header('Content-Type: application/json');
        
        echo json_encode([
            'success' => false,
            'error' => $message,
            'code' => $code,
        ]);
        
        exit;
    }
    
    /**
     * Check if Panic Mode should block the current request
     * Only non-GET requests from non-admins are blocked
     * 
     * @return bool True if request should be blocked
     */
    private static function isPanicModeBlockingRequest(): bool
    {
        // Only check for write operations
        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
        if (in_array($method, ['GET', 'HEAD', 'OPTIONS'], true)) {
            return false;
        }
        
        // Admins can still perform write operations during panic
        if (self::$currentUser && self::$currentUser->is_admin) {
            return false;
        }
        
        // Check panic mode status (cached for performance)
        static $isPanicActive = null;
        if ($isPanicActive === null) {
            // Lazy load PanicModeService only when needed
            if (!class_exists('\\NomadCMS\\Security\\PanicModeService')) {
                require_once __DIR__ . '/../Security/PanicModeService.php';
            }
            $isPanicActive = \NomadCMS\Security\PanicModeService::isActive();
        }
        
        return $isPanicActive;
    }
    
    /**
     * Send 503 Service Unavailable response and exit (for Panic Mode)
     */
    private static function sendServiceUnavailable(string $message): never
    {
        http_response_code(503);
        header('Content-Type: application/json');
        header('Retry-After: 300'); // Suggest retry after 5 minutes
        
        echo json_encode([
            'success' => false,
            'error' => $message,
            'code' => 'PANIC_MODE_ACTIVE',
            'message' => '🚨 A rendszer jelenleg vészhelyzeti üzemmódban van. Írási műveletek ideiglenesen letiltva.',
        ]);
        
        exit;
    }
}
