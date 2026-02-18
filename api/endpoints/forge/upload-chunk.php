<?php
/**
 * Forge Upload Chunk Endpoint
 * Receives encrypted data chunks and stores them temporarily
 * 
 * POST /api/endpoints/forge/upload-chunk.php
 */

declare(strict_types=1);

require_once __DIR__ . '/../../bootstrap.php';

use NomadCMS\Auth\JWTService;
use NomadCMS\Database\AuthDatabase;
use NomadCMS\Database\UserRepository;
use NomadCMS\Security\InputSanitizer;

// CORS
handlePreflight();

// Only POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

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
    
    // Get metadata
    $metadataJson = $_POST['metadata'] ?? null;
    if (!$metadataJson) {
        throw new Exception('Missing metadata');
    }
    
    $metadata = json_decode($metadataJson, true);
    if (!$metadata) {
        throw new Exception('Invalid metadata JSON');
    }
    
    $sessionId = $metadata['sessionId'] ?? null;
    $chunkIndex = $metadata['chunkIndex'] ?? null;
    $totalChunks = $metadata['totalChunks'] ?? null;
    $totalSize = $metadata['totalSize'] ?? null;
    
    if (!$sessionId || $chunkIndex === null || !$totalChunks) {
        throw new Exception('Missing required metadata fields');
    }
    
    // SECURITY: Strict sessionId validation via InputSanitizer
    $sessionId = InputSanitizer::forgeSessionId($sessionId);
    if ($sessionId === null) {
        error_log('[SECURITY] Invalid session ID format in upload-chunk.php');
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Invalid session ID format']);
        exit;
    }
    
    // SECURITY: Validate chunk index
    $chunkIndex = InputSanitizer::forgeChunkIndex($chunkIndex);
    if ($chunkIndex === null) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Invalid chunk index']);
        exit;
    }
    
    // Validate session exists (storage within api folder)
    $cacheDirPath = __DIR__ . '/../../storage/forge-sessions';
    // Ensure directory exists (may not exist on fresh install)
    if (!is_dir($cacheDirPath)) {
        mkdir($cacheDirPath, 0700, true);
    }
    $cacheDir = realpath($cacheDirPath);
    if (!$cacheDir) {
        throw new Exception('Storage directory not found');
    }
    
    $sessionFile = $cacheDir . '/' . $sessionId . '.key';
    
    if (!file_exists($sessionFile)) {
        throw new Exception('Invalid or expired session');
    }
    
    // Get chunk data
    if (!isset($_FILES['chunk']) || $_FILES['chunk']['error'] !== UPLOAD_ERR_OK) {
        throw new Exception('No chunk file received');
    }
    
    $chunkData = file_get_contents($_FILES['chunk']['tmp_name']);
    
    // Store chunk temporarily
    $chunkDir = $cacheDir . '/chunks/' . $sessionId;
    if (!is_dir($chunkDir)) {
        mkdir($chunkDir, 0700, true);
    }
    
    // SECURITY: Final realpath check to ensure we're still in the allowed directory
    $realChunkDir = realpath($chunkDir) ?: $chunkDir;
    if (strpos($realChunkDir, $cacheDir) !== 0) {
        error_log('[SECURITY] Path escape attempt detected: ' . $realChunkDir);
        throw new Exception('Invalid storage path');
    }
    
    $chunkFile = $chunkDir . '/chunk_' . str_pad((string)$chunkIndex, 5, '0', STR_PAD_LEFT);
    file_put_contents($chunkFile, $chunkData);
    
    // Store/update metadata
    $metaFile = $chunkDir . '/meta.json';
    $existingMeta = file_exists($metaFile) ? json_decode(file_get_contents($metaFile), true) : [];
    $existingMeta['totalChunks'] = $totalChunks;
    $existingMeta['totalSize'] = $totalSize;
    $existingMeta['receivedChunks'] = ($existingMeta['receivedChunks'] ?? 0) + 1;
    $existingMeta['lastUpdate'] = time();
    file_put_contents($metaFile, json_encode($existingMeta));
    
    http_response_code(200);
    header('Content-Type: application/json');
    echo json_encode([
        'success' => true,
        'chunkIndex' => $chunkIndex,
        'received' => $existingMeta['receivedChunks'],
        'total' => $totalChunks,
    ]);
    
} catch (Exception $e) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
