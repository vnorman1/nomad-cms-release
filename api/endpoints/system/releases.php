<?php
/**
 * Available Releases Endpoint
 * 
 * Lists all available releases from GitHub.
 */

declare(strict_types=1);

require_once __DIR__ . '/../../vendor/autoload.php';
require_once __DIR__ . '/../../bootstrap.php';

use NomadCMS\Config\Version;
use NomadCMS\Services\UpdateDownloader;
use NomadCMS\Services\Auth\JWTService;
use NomadCMS\Middleware\RateLimitMiddleware;

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

// Rate limiting: 10 requests per minute
RateLimitMiddleware::checkSystemReleases();

try {
    // Auth required
    $jwt = JWTService::getInstance();
    $token = $jwt->extractTokenFromHeader();
    if (!$token || !$jwt->validateToken($token)) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        exit;
    }
    
    $downloader = new UpdateDownloader();
    // No explicit params needed - uses Version config defaults
    $releases = $downloader->getAvailableReleases();
    
    // Mark current version
    $currentVersion = Version::VERSION;
    foreach ($releases as &$release) {
        $release['isCurrent'] = ($release['version'] === $currentVersion);
    }
    
    echo json_encode([
        'success' => true,
        'currentVersion' => $currentVersion,
        'releases' => $releases,
    ], JSON_THROW_ON_ERROR);

} catch (Throwable $e) {
    error_log('Get releases error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Nem sikerült lekérdezni a verziókat',
        'releases' => [],
    ]);
}
