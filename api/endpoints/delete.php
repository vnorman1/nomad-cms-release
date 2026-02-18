<?php
/**
 * Delete Image Endpoint Logic
 * Deletes uploaded images
 */

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

use NomadCMS\Middleware\AuthMiddleware;
use NomadCMS\Middleware\CSRFMiddleware;

// Handle CORS preflight
handlePreflight();

// Set JSON content type
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST' && $_SERVER['REQUEST_METHOD'] !== 'DELETE') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

try {
    // SECURITY: Validate CSRF token for session-based requests
    CSRFMiddleware::validateForSession();
    
    // Validate admin token
    AuthMiddleware::requireAdmin();

    // Get the URL to delete from request body
    $input = file_get_contents('php://input');
    $body = !empty($input) ? json_decode($input, true) : [];
    $url = $body['url'] ?? '';

    if (empty($url)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'No URL provided']);
        exit;
    }

    // Extract filename from URL (e.g., /api/uploads/image.webp -> image.webp)
    $pathPart = parse_url($url, PHP_URL_PATH);
    if ($pathPart === false || $pathPart === null) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Invalid URL format']);
        exit;
    }
    $filename = basename($pathPart);

    if (empty($filename)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Invalid URL format']);
        exit;
    }

    // Security check: ensure filename doesn't contain path traversal
    if (strpos($filename, '..') !== false || strpos($filename, '/') !== false) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Invalid filename']);
        exit;
    }

    $uploadDir = $_ENV['UPLOAD_DIR'] ?? __DIR__ . '/../uploads/';
    $filePath = $uploadDir . $filename;

    // Check if file exists
    if (!file_exists($filePath)) {
        // File doesn't exist, but that's okay - maybe already deleted
        echo json_encode([
            'success' => true,
            'message' => 'File already deleted or does not exist',
            'filename' => $filename
        ]);
        exit;
    }

    // Delete the file
    if (unlink($filePath)) {
        echo json_encode([
            'success' => true,
            'message' => 'File deleted successfully',
            'filename' => $filename
        ]);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Failed to delete file']);
    }

} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $_ENV['APP_DEBUG'] === 'true' ? $e->getMessage() : 'Internal server error',
    ]);
}
