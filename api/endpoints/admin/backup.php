<?php
/**
 * NOMAD CMS - Secure Backup Endpoint
 * Zero-Knowledge backup and restore operations
 * 
 * GET  /backup?totp_code=XXXXXX     → Download encrypted backup (.nomad + .pem bundle)
 * POST /backup (restore)            → Restore from .nomad file with private key
 */

declare(strict_types=1);

require_once __DIR__ . '/../../bootstrap.php';

use NomadCMS\Security\BackupService;
use NomadCMS\Database\AuthDatabase;
use NomadCMS\Database\UserRepository;
use NomadCMS\Middleware\AuthMiddleware;
use NomadCMS\Middleware\CSRFMiddleware;
use NomadCMS\Security\WebhookService;

// CORS
handlePreflight();

header('Content-Type: application/json');

try {
    // Require authentication for all backup operations
    $currentUser = AuthMiddleware::requireAuth();
    
    // Only admins can perform backup operations
    AuthDatabase::getInstance();
    $user = UserRepository::findByUuid($currentUser->uuid);
    
    if (!$user || !$user['is_admin']) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Admin access required']);
        exit;
    }
    
    $backupService = new BackupService();
    
    // =========================================================================
    // POST with action=download: Download Backup (REQUIRES 2FA)
    // SECURITY: Uses POST to keep TOTP and recovery password out of logs/URLs
    // =========================================================================
    if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_GET['action'] ?? '') === 'download') {
        // Check if TOTP is enabled for this user - ONLY for backup creation
        if (!$user['totp_enabled'] || empty($user['totp_secret'])) {
            http_response_code(400);
            echo json_encode([
                'success' => false, 
                'error' => '2FA must be enabled to create backups'
            ]);
            exit;
        }
        
        // Get decrypted TOTP secret
        $totpSecret = UserRepository::getTotpSecret($user);
        if (!$totpSecret) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'TOTP configuration error']);
            exit;
        }
        
        // SECURITY: Read credentials from JSON body, NOT query params
        $input = json_decode(file_get_contents('php://input'), true) ?? [];
        $totpCode = $input['totp_code'] ?? '';
        $recoveryPassword = $input['recovery_password'] ?? null;
        
        if (empty($totpCode)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'TOTP code required']);
            exit;
        }
        
        // Create encrypted backup (with optional disaster recovery kit)
        $result = $backupService->createSecureBackup(
            $user['uuid'],
            $totpCode,
            $totpSecret,
            $recoveryPassword
        );
        
        // Dispatch webhook event for backup created (async)
        try {
            $webhookService = new WebhookService();
            $webhookService->dispatchEventAsync('backup.created', [
                'id' => $result['filename'] ?? 'backup',
                'filename' => $result['filename'] ?? 'unknown',
                'author_id' => $user['uuid'],
                'author' => $user['email'],
                'timestamp' => date('c'),
            ]);
        } catch (\Exception $e) {
            error_log("Webhook dispatch failed for backup.created: " . $e->getMessage());
        }
        
        // Stream the bundle ZIP to browser
        $backupService->streamBackupDownload($result['zipPath'], $result['filename']);
        // streamBackupDownload calls exit() after streaming
    }
    
    // =========================================================================
    // POST: Restore Backup (NO TOTP REQUIRED - already have .pem key)
    // =========================================================================
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        // SECURITY: Validate CSRF token for session-based requests
        CSRFMiddleware::validateForSession();
        
        // Get POST data
        $privateKey = $_POST['private_key'] ?? '';
        
        if (empty($privateKey)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Private key (.pem) required']);
            exit;
        }
        
        // Check for uploaded .nomad file
        if (!isset($_FILES['backup_file']) || $_FILES['backup_file']['error'] !== UPLOAD_ERR_OK) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Backup file (.nomad) required']);
            exit;
        }
        
        $uploadedFile = $_FILES['backup_file']['tmp_name'];
        $originalName = $_FILES['backup_file']['name'] ?? '';
        
        // Validate file extension
        if (!str_ends_with(strtolower($originalName), '.nomad')) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'File must have .nomad extension']);
            exit;
        }
        
        // Disaster Recovery: Check for recovery password and file
        $recoveryPassword = $_POST['recovery_password'] ?? null;
        $recoveryFilePath = null;
        
        if (!empty($recoveryPassword) && isset($_FILES['recovery_file']) && $_FILES['recovery_file']['error'] === UPLOAD_ERR_OK) {
            $recoveryFilePath = $_FILES['recovery_file']['tmp_name'];
            $recoveryFileName = $_FILES['recovery_file']['name'] ?? '';
            
            if (!str_ends_with(strtolower($recoveryFileName), '.nms')) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Recovery file must have .nms extension']);
                exit;
            }
        }
        
        // Perform restore (no TOTP required - .pem key is sufficient)
        $result = $backupService->restoreFromBackup(
            $user['uuid'],
            $uploadedFile,
            $privateKey,
            $recoveryPassword,
            $recoveryFilePath
        );
        
        http_response_code(200);
        echo json_encode([
            'success' => true,
            'message' => $result['message'],
            'disaster_recovery' => $result['disaster_recovery'] ?? false,
            'migration_stats' => $result['migration_stats'] ?? null,
        ]);
        exit;
    }
    
    // Method not allowed
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    
} catch (\RuntimeException $e) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage(),
    ]);
} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $_ENV['APP_DEBUG'] === 'true' ? $e->getMessage() : 'Internal server error',
    ]);
}
