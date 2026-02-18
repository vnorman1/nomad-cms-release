<?php
/**
 * Video Upload Endpoint
 * Handles video uploads with optional WebM conversion
 * 
 * If FFmpeg is available: converts to WebM
 * If FFmpeg not available: saves original format
 */

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../lib/video.php';

use NomadCMS\Middleware\AuthMiddleware;
use NomadCMS\Middleware\CSRFMiddleware;
use NomadCMS\Security\WebhookService;

// Handle CORS preflight
handlePreflight();

header('Content-Type: application/json');

try {
    // 1. Ensure only POST requests
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        throw new Exception('Method not allowed');
    }

    // 2. SECURITY: Validate CSRF token for session-based requests
    CSRFMiddleware::validateForSession();

    // 3. Authenticate and check Admin role
    AuthMiddleware::requireAdmin();

    // 4. Check if file was uploaded
    if (!isset($_FILES['video']) || $_FILES['video']['error'] !== UPLOAD_ERR_OK) {
        $errorCode = $_FILES['video']['error'] ?? UPLOAD_ERR_NO_FILE;
        $errorMessages = [
            UPLOAD_ERR_INI_SIZE => 'File exceeds upload_max_filesize',
            UPLOAD_ERR_FORM_SIZE => 'File exceeds MAX_FILE_SIZE',
            UPLOAD_ERR_PARTIAL => 'File was only partially uploaded',
            UPLOAD_ERR_NO_FILE => 'No video file was uploaded',
            UPLOAD_ERR_NO_TMP_DIR => 'Missing temporary folder',
            UPLOAD_ERR_CANT_WRITE => 'Failed to write file to disk',
            UPLOAD_ERR_EXTENSION => 'File upload stopped by extension',
        ];
        throw new Exception($errorMessages[$errorCode] ?? 'Unknown upload error');
    }

    // 5. Process the video
    $result = processVideo($_FILES['video']);
    
    // 6. Dispatch webhook event for video uploaded
    try {
        $webhookService = new WebhookService();
        $currentUser = AuthMiddleware::getCurrentUser();
        $webhookService->dispatchEventAsync('media.video_uploaded', [
            'id' => $result['filename'],
            'filename' => $_FILES['video']['name'],
            'original_mime_type' => $_FILES['video']['type'],
            'original_size' => $_FILES['video']['size'],
            'url' => '/api/uploads/' . $result['filename'],
            'converted' => $result['converted'],
            'author_id' => $currentUser->uuid ?? null,
            'timestamp' => date('c'),
        ]);
    } catch (\Exception $e) {
        error_log("Webhook dispatch failed for media.video_uploaded: " . $e->getMessage());
    }
    
    // 7. Return success response
    $response = [
        'success' => true,
        'url' => '/api/uploads/' . $result['filename'],
        'filename' => $result['filename'],
        'converted' => $result['converted'],
    ];
    
    // Include warning if conversion failed but original was saved
    if (isset($result['warning'])) {
        $response['warning'] = $result['warning'];
    }
    
    echo json_encode($response);

} catch (Exception $e) {
    $message = $e->getMessage();
    
    // Check for resolution too high error
    if (str_starts_with($message, 'RESOLUTION_TOO_HIGH:')) {
        $resolution = substr($message, strlen('RESOLUTION_TOO_HIGH:'));
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'error' => 'resolution_too_high',
            'resolution' => $resolution,
            'max_resolution' => '7680x4320 (8K)',
            'message' => "A videó felbontása ({$resolution}) meghaladja a maximális 8K (7680x4320) felbontást."
        ]);
        exit;
    }
    
    // Set appropriate error code
    if (http_response_code() === 200) {
        http_response_code(400);
    }
    
    echo json_encode([
        'success' => false,
        'error' => $message
    ]);
}
