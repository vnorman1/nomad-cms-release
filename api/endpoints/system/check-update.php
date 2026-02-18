<?php
/**
 * Check Update Endpoint
 * 
 * Checks for available updates using delta comparison.
 * Returns the changes between current and target version.
 */

declare(strict_types=1);

require_once __DIR__ . '/../../vendor/autoload.php';
require_once __DIR__ . '/../../bootstrap.php';

use NomadCMS\Config\Version;
use NomadCMS\Services\DeltaUpdateService;
use NomadCMS\Services\UpdateDownloader;
use NomadCMS\Services\SecurityValidator;
use NomadCMS\Services\Auth\JWTService;
use NomadCMS\Middleware\RateLimitMiddleware;

// Auth required for this endpoint
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

// Rate limiting: 5 requests per minute
RateLimitMiddleware::checkSystemUpdateCheck();

try {
    // Verify JWT
    $jwt = JWTService::getInstance();
    $token = $jwt->extractTokenFromHeader();
    if (!$token || !$jwt->validateToken($token)) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        exit;
    }
    
    // Get target version from query (optional - defaults to latest)
    $targetVersion = $_GET['version'] ?? null;
    
    // Initialize services
    $downloader = new UpdateDownloader();
    $deltaService = new DeltaUpdateService(new SecurityValidator(), $downloader);
    
    // If no target specified, get latest from GitHub releases
    if (!$targetVersion) {
        $releases = $downloader->getAvailableReleases();
        if (empty($releases)) {
            echo json_encode([
                'success' => true,
                'available' => false,
                'currentVersion' => Version::VERSION,
                'message' => 'Nem sikerült elérni a release szervert',
            ]);
            exit;
        }
        $targetVersion = $releases[0]['version'] ?? null;
    }
    
    // Check if update is needed
    $currentVersion = Version::VERSION;
    
    if (!$targetVersion || version_compare($currentVersion, $targetVersion, '>=')) {
        echo json_encode([
            'success' => true,
            'available' => false,
            'currentVersion' => $currentVersion,
            'latestVersion' => $targetVersion ?? $currentVersion,
            'message' => 'A rendszer naprakész',
        ]);
        exit;
    }
    
    // Download manifest for target version
    $manifestResult = $downloader->downloadManifest($targetVersion);
    if (!$manifestResult['success']) {
        echo json_encode([
            'success' => true,
            'available' => true,
            'currentVersion' => $currentVersion,
            'latestVersion' => $targetVersion,
            'error' => 'Nem sikerült letölteni a manifest fájlt',
            'source' => null,
        ]);
        exit;
    }
    
    // Build local manifest and compare
    $localManifest = $deltaService->buildLocalManifest();
    $remoteManifest = $manifestResult['manifest'];
    $delta = $deltaService->compareManifests($localManifest, $remoteManifest);
    $downloadSize = $deltaService->calculateDeltaSize($delta, $remoteManifest);
    
    echo json_encode([
        'success' => true,
        'available' => true,
        'currentVersion' => $currentVersion,
        'latestVersion' => $targetVersion,
        'downloadSize' => $downloadSize,
        'changes' => [
            'added' => count($delta['added']),
            'modified' => count($delta['modified']),
            'deleted' => count($delta['deleted']),
            'unchanged' => $delta['unchanged'],
        ],
        'source' => $manifestResult['source'],
    ], JSON_THROW_ON_ERROR);

} catch (Throwable $e) {
    error_log('Check update error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Hiba történt a frissítés ellenőrzésekor',
    ]);
}
