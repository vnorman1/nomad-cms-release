<?php
/**
 * NOMAD CMS - Panic Mode Middleware 🚨
 * 
 * Blocks all non-GET requests when panic mode is active.
 * Think of it as the bouncer at the club, but for HTTP methods.
 * 
 * "You shall not POST!" - Gandalf, probably
 */

declare(strict_types=1);

namespace NomadCMS\Middleware;

use NomadCMS\Security\PanicModeService;

final class PanicModeMiddleware
{
    /**
     * Endpoints that are ALWAYS allowed even in panic mode
     * (We need to be able to disable panic mode somehow!)
     */
    private const ALLOWED_ENDPOINTS = [
        '/admin/panic.php',      // Toggle panic mode itself
        '/auth/login.php',       // Let admins log back in
        '/auth/refresh.php',     // Token refresh for existing sessions
        '/auth/logout.php',      // Logout should always work
        '/auth/me.php',          // Check current user
    ];
    
    /**
     * Methods that are ALWAYS allowed
     */
    private const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];
    
    /**
     * Check and enforce panic mode
     * Call this at the beginning of each endpoint (via bootstrap)
     */
    public static function check(): void
    {
        // Skip if panic mode is not active
        if (!PanicModeService::isActive()) {
            return;
        }
        
        // Skip for safe methods (reading is always allowed)
        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
        if (in_array($method, self::SAFE_METHODS, true)) {
            return;
        }
        
        // Skip for allowed endpoints
        $scriptName = $_SERVER['SCRIPT_NAME'] ?? '';
        $requestUri = $_SERVER['REQUEST_URI'] ?? '';
        
        foreach (self::ALLOWED_ENDPOINTS as $allowed) {
            if (str_contains($scriptName, $allowed) || str_contains($requestUri, $allowed)) {
                return;
            }
        }
        
        // 🚫 Block the request!
        self::blockRequest($method);
    }
    
    /**
     * Send panic mode block response
     */
    private static function blockRequest(string $method): never
    {
        http_response_code(503); // Service Unavailable
        header('Content-Type: application/json');
        header('Retry-After: 3600'); // Suggest retry in 1 hour
        
        $funnyMessages = [
            "🚨 PANIC MODE ACTIVE! $method requests are taking a vacation.",
            "🔒 System is in read-only mode. Your $method request has been politely declined.",
            "⚠️ Emergency lockdown! Only GET requests allowed. Come back later!",
            "🛑 HALT! The admin has activated panic mode. Reading only, please.",
            "🆘 System maintenance in progress. $method operations suspended.",
            "🔴 Code Red! Your $method request has been... panic-blocked.",
            "📖 The system is in library mode now. Shh... reading only!",
        ];
        
        echo json_encode([
            'success' => false,
            'error' => 'System is in panic mode. Only read operations are allowed.',
            'code' => 'PANIC_MODE_ACTIVE',
            'method_blocked' => $method,
            'allowed_methods' => self::SAFE_METHODS,
            'funny_message' => $funnyMessages[array_rand($funnyMessages)],
            'suggestion' => 'Contact your administrator to disable panic mode.',
        ]);
        
        exit;
    }
    
    /**
     * Add panic mode header to response (for debugging/info)
     */
    public static function addStatusHeader(): void
    {
        if (PanicModeService::isActive()) {
            header('X-Panic-Mode: active');
            header('X-Allowed-Methods: GET, HEAD, OPTIONS');
        }
    }
}
