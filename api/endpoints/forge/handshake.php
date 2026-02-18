<?php
/**
 * Forge Handshake Endpoint
 * Returns server's X25519 public key for sealed box encryption
 * 
 * GET /api/endpoints/forge/handshake.php
 */

declare(strict_types=1);

require_once __DIR__ . '/../../bootstrap.php';

use NomadCMS\Auth\JWTService;
use NomadCMS\Database\AuthDatabase;
use NomadCMS\Database\UserRepository;

// CORS
handlePreflight();

header('Content-Type: application/json');

// Verify JWT token
$token = JWTService::extractBearerToken();
if (!$token) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'No token provided']);
    exit;
}

try {
    $payload = JWTService::validateAccessToken($token);
    $userId = $payload->user->id ?? null;
    
    if (!$userId) {
        throw new Exception('Invalid token');
    }
    
    // Get user and check admin
    AuthDatabase::getInstance();
    $user = UserRepository::findById($userId);
    
    if (!$user || !$user['is_admin']) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Admin access required']);
        exit;
    }
    
    // Generate session ID
    $sessionId = bin2hex(random_bytes(16));
    
    // Generate X25519 keypair for sealed box
    $keypair = sodium_crypto_box_keypair();
    $publicKey = sodium_crypto_box_publickey($keypair);
    $secretKey = sodium_crypto_box_secretkey($keypair);
    
    // Store secret key in protected directory within api folder
    // Directory is inside api folder with restricted permissions
    $cacheDir = __DIR__ . '/../../storage/forge-sessions';
    if (!is_dir($cacheDir)) {
        mkdir($cacheDir, 0700, true);
    }
    
    // Cleanup expired sessions (older than 1 hour)
    cleanupExpiredSessions($cacheDir, 3600);
    
    // Store session key directly (directory is already protected)
    file_put_contents($cacheDir . '/' . $sessionId . '.key', $secretKey);
    chmod($cacheDir . '/' . $sessionId . '.key', 0600);
    
    echo json_encode([
        'success' => true,
        'publicKey' => base64_encode($publicKey),
        'sessionId' => $sessionId,
        'expiresIn' => 3600,
    ]);
    
} catch (Exception $e) {
    http_response_code(401);
    echo json_encode([
        'success' => false,
        'error' => 'Authentication failed: ' . $e->getMessage()
    ]);
}

/**
 * Clean up expired forge sessions
 * Removes session keys and chunk directories older than maxAge seconds
 */
function cleanupExpiredSessions(string $cacheDir, int $maxAge = 3600): void {
    if (!is_dir($cacheDir)) {
        return;
    }
    
    $now = time();
    
    // Cleanup old .key files
    $keyFiles = glob($cacheDir . '/*.key');
    if ($keyFiles) {
        foreach ($keyFiles as $keyFile) {
            if ($now - filemtime($keyFile) > $maxAge) {
                @unlink($keyFile);
            }
        }
    }
    
    // Cleanup old chunk directories
    $chunksDir = $cacheDir . '/chunks';
    if (is_dir($chunksDir)) {
        $sessionDirs = glob($chunksDir . '/*', GLOB_ONLYDIR);
        if ($sessionDirs) {
            foreach ($sessionDirs as $sessionDir) {
                // Check meta.json for last update time, or use dir mtime
                $metaFile = $sessionDir . '/meta.json';
                $lastUpdate = file_exists($metaFile) 
                    ? (json_decode(file_get_contents($metaFile), true)['lastUpdate'] ?? filemtime($sessionDir))
                    : filemtime($sessionDir);
                
                if ($now - $lastUpdate > $maxAge) {
                    // Remove all files in directory
                    $files = glob($sessionDir . '/*');
                    if ($files) {
                        foreach ($files as $file) {
                            @unlink($file);
                        }
                    }
                    @rmdir($sessionDir);
                }
            }
        }
        
        // Remove chunks directory if empty
        if (count(glob($chunksDir . '/*')) === 0) {
            @rmdir($chunksDir);
        }
    }
}
