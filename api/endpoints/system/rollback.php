<?php
/**
 * Rollback Endpoint
 * 
 * Admin-only endpoint to restore from a backup after a failed update.
 */

declare(strict_types=1);

require_once __DIR__ . '/../../vendor/autoload.php';
require_once __DIR__ . '/../../bootstrap.php';

use NomadCMS\Services\DeltaUpdateService;
use NomadCMS\Services\UpdateAuditLogger;
use NomadCMS\Services\Auth\JWTService;
use NomadCMS\Middleware\RateLimitMiddleware;

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// Rate limiting
RateLimitMiddleware::checkSystemUpdateApply();

try {
    // Verify JWT and admin status
    $jwt = JWTService::getInstance();
    $token = $jwt->extractTokenFromHeader();
    $payload = $jwt->validateToken($token);
    
    if (!$payload) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        exit;
    }
    
    // Check admin permission
    if (!($payload['is_admin'] ?? false)) {
        http_response_code(403);
        echo json_encode(['error' => 'Admin rights required']);
        exit;
    }
    
    $userId = $payload['user_id'] ?? 'unknown';
    
    // Get request body
    $input = json_decode(file_get_contents('php://input'), true);
    $backupId = $input['backupId'] ?? null;
    
    if (!$backupId) {
        http_response_code(400);
        echo json_encode(['error' => 'Backup ID required']);
        exit;
    }
    
    // Validate backup ID format (prevent path traversal)
    // Format: backup_YYYYMMDD_HHMMSS or update_YYYYMMDD_HHMMSS
    if (!preg_match('/^(backup|update)_\d{8}_\d{6}$/', $backupId)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid backup ID format']);
        exit;
    }
    
    // Additional safety: ensure no path separators
    if (str_contains($backupId, '/') || str_contains($backupId, '\\') || str_contains($backupId, '..')) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid backup ID']);
        exit;
    }
    
    $auditLogger = new UpdateAuditLogger();
    $deltaService = new DeltaUpdateService();
    // Uses default SecurityValidator and UpdateDownloader
    
    // Log rollback attempt
    $auditLogger->logRollbackStart($userId, $backupId);
    
    // Perform rollback
    $result = $deltaService->restoreFromBackup($backupId);
    
    if ($result['success']) {
        $auditLogger->logRollbackSuccess($userId, $backupId, $result['version'] ?? 'unknown');
        
        echo json_encode([
            'success' => true,
            'message' => 'Rendszer visszaállítva a biztonsági mentésből',
            'version' => $result['version'] ?? null,
        ], JSON_THROW_ON_ERROR);
    } else {
        $error = $result['error'] ?? 'Unknown error';
        $auditLogger->logRollbackFailure($userId, $backupId, $error);
        
        throw new RuntimeException($error);
    }

} catch (Throwable $e) {
    error_log('Rollback error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage(),
    ]);
}
