<?php
/**
 * Upload Endpoint Logic
 * Handles file uploads - Secured with Modern Auth
 */

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../lib/image.php';

use NomadCMS\Middleware\AuthMiddleware;
use NomadCMS\Middleware\CSRFMiddleware;
use NomadCMS\Middleware\RateLimitMiddleware;
use NomadCMS\Security\WebhookService;

// Handle CORS preflight (from bootstrap.php)
handlePreflight();

header('Content-Type: application/json');

try {
    // 1. Ensure only POST requests
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        throw new Exception('Method not allowed');
    }
    
    // SECURITY: Rate limit uploads - 30/min per IP
    // Prevents upload flooding
    RateLimitMiddleware::check(
        key: 'upload:' . ($_SERVER['REMOTE_ADDR'] ?? 'unknown'),
        maxRequests: 120,
        windowSeconds: 60
    );

    // 2. SECURITY: Validate CSRF token for session-based requests
    CSRFMiddleware::validateForSession();

    // 3. Authenticate and check Admin role (Modern Auth)
    // This will automatically handle 401/403 and exit if not authorized
    AuthMiddleware::requireAdmin();

    // 3. Check if file was uploaded
    if (!isset($_FILES['image']) || $_FILES['image']['error'] !== UPLOAD_ERR_OK) {
        $errorCode = $_FILES['image']['error'] ?? UPLOAD_ERR_NO_FILE;
        $errorMessages = [
            UPLOAD_ERR_INI_SIZE => 'File exceeds upload_max_filesize',
            UPLOAD_ERR_FORM_SIZE => 'File exceeds MAX_FILE_SIZE',
            UPLOAD_ERR_PARTIAL => 'File was only partially uploaded',
            UPLOAD_ERR_NO_FILE => 'No file was uploaded',
            UPLOAD_ERR_NO_TMP_DIR => 'Missing temporary folder',
            UPLOAD_ERR_CANT_WRITE => 'Failed to write file to disk',
            UPLOAD_ERR_EXTENSION => 'File upload stopped by extension',
        ];
        throw new Exception($errorMessages[$errorCode] ?? 'Unknown upload error');
    }

    // 4. Ensure upload directory exists
    // (Relies on constants from config.php)
    ensureUploadDir();

    // 5. Process the image
    // (Resizes and converts to WebP)
    $filename = processImage($_FILES['image']);
    
    // Dispatch webhook event for media uploaded (async - non-blocking)
    try {
        $webhookService = new WebhookService();
        $currentUser = AuthMiddleware::getCurrentUser();
        $webhookService->dispatchEventAsync('media.uploaded', [
            'id' => $filename,
            'filename' => $_FILES['image']['name'],
            'mime_type' => $_FILES['image']['type'],
            'size' => $_FILES['image']['size'],
            'url' => '/api/uploads/' . $filename,
            'author_id' => $currentUser->uuid ?? null,
            'timestamp' => date('c'),
        ]);
    } catch (\Exception $e) {
        error_log("Webhook dispatch failed for media.uploaded: " . $e->getMessage());
    }
    
    // 6. Return success response
    echo json_encode([
        'success' => true,
        'url' => '/api/uploads/' . $filename,
        'filename' => $filename
    ]);

} catch (Exception $e) {
    // If it's a 405, we already set the code. For others, default to 400.
    if (http_response_code() === 200) {
        http_response_code(400);
    }
    
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage() // In production, might want to hide internal errors
    ]);
}
