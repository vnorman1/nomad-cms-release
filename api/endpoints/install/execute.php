<?php
/**
 * NOMAD CMS - Installation Execute Endpoint
 * Execute installation (protected by rate limiting)
 * 
 * POST /api/endpoints/install/execute.php
 * 
 * Request:
 * { "email": "admin@example.com", "password": "SecurePassword123!" }
 * 
 * Success Response:
 * { "success": true, "message": "Installation complete", "redirect": "/login" }
 * 
 * Error Response:
 * { "success": false, "error": "Installation already completed" }
 */

declare(strict_types=1);

// Load autoloader and helpers
require_once __DIR__ . '/../../vendor/autoload.php';
require_once __DIR__ . '/../../lib/response.php';

use NomadCMS\Installer\InstallerService;
use NomadCMS\Middleware\InstallationMiddleware;

// Handle CORS preflight
setCorsHeaders();
handlePreflight();

// Only allow POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendError('Method not allowed', 405);
}

try {
    // Rate limit installation attempts (5 attempts per 5 minutes)
    InstallationMiddleware::rateLimit(5, 300);
    
    // Block if already installed
    InstallationMiddleware::requireNotInstalled();
    
    // Get request body
    $body = getJsonBody();
    
    if (!$body) {
        sendError('Invalid request body', 400);
    }
    
    // Validate required fields
    if (empty($body['email'])) {
        sendError('Email is required', 400);
    }
    
    if (empty($body['password'])) {
        sendError('Password is required', 400);
    }
    
    $email = trim($body['email']);
    $password = $body['password'];
    
    // Validate email format
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        sendError('Invalid email format', 400);
    }
    
    // Optional config overrides
    $config = [];
    
    if (!empty($body['app_url'])) {
        $config['app_url'] = $body['app_url'];
    }
    
    // User entropy - already SHA-256 hashed client-side
    $userEntropy = null;
    if (!empty($body['user_entropy']) && is_string($body['user_entropy'])) {
        // Validate it looks like a hex hash (64 chars for SHA-256)
        if (preg_match('/^[a-f0-9]{64}$/i', $body['user_entropy'])) {
            $userEntropy = $body['user_entropy'];
        }
    }
    
    // Execute installation with optional user entropy
    $result = InstallerService::install($email, $password, $config, $userEntropy);
    
    // Log successful installation
    error_log('[Install] Installation completed successfully for: ' . $email);
    
    sendResponse($result);
    
} catch (\InvalidArgumentException $e) {
    // Validation errors (password strength, email format)
    sendError($e->getMessage(), 400);
    
} catch (\RuntimeException $e) {
    // Runtime errors (already installed, file write failures)
    error_log('[Install] Runtime error: ' . $e->getMessage());
    sendError($e->getMessage(), 409);
    
} catch (\Exception $e) {
    // Unexpected errors
    error_log('[Install] Unexpected error: ' . $e->getMessage());
    sendError('Installation failed. Please check server logs.', 500);
}
