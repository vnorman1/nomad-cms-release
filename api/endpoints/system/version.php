<?php
/**
 * System Version Endpoint
 * 
 * Returns the current CMS version - single source of truth for all UI components.
 * This endpoint is PUBLIC (no auth required) so the login page can show version.
 */

declare(strict_types=1);

require_once __DIR__ . '/../../vendor/autoload.php';

use NomadCMS\Config\Version;

// CORS headers
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

try {
    // Return version info
    echo json_encode([
        'success' => true,
        'version' => Version::VERSION,
        'buildDate' => Version::BUILD_DATE,
        'codename' => Version::CODENAME,
        'details' => Version::getInfo(),
    ], JSON_THROW_ON_ERROR);

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Failed to get version info',
    ]);
}
