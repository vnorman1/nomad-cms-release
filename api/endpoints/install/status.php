<?php
/**
 * NOMAD CMS - Installation Status Endpoint
 * Check if CMS needs installation (public endpoint)
 * 
 * GET /api/endpoints/install/status.php
 * 
 * Response when NOT installed:
 * { "installed": false, "requires_setup": true }
 * 
 * Response when installed:
 * { "installed": true, "locked_at": "2024-12-28T14:00:00Z" }
 */

declare(strict_types=1);

// Load autoloader and helpers
require_once __DIR__ . '/../../vendor/autoload.php';
require_once __DIR__ . '/../../lib/response.php';

use NomadCMS\Installer\InstallerService;

// Handle CORS preflight
setCorsHeaders();
handlePreflight();

// Only allow GET requests
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendError('Method not allowed', 405);
}

try {
    // Get installation status
    $status = InstallerService::getStatus();
    
    sendResponse($status);
    
} catch (\Exception $e) {
    // Log error but don't expose details
    error_log('[Install Status] Error: ' . $e->getMessage());
    
    sendError('Failed to check installation status', 500);
}
