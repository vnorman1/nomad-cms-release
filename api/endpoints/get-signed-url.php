<?php
/**
 * NOMAD CMS - Get Signed URL for Secure File Download
 * Generates a time-limited signed URL for secure file access
 */

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../lib/file.php';

use NomadCMS\Middleware\AuthMiddleware;

// Handle CORS preflight
handlePreflight();

header('Content-Type: application/json');

try {
    // 1. Ensure only GET/POST requests
    if (!in_array($_SERVER['REQUEST_METHOD'], ['GET', 'POST'])) {
        http_response_code(405);
        throw new Exception('Method not allowed');
    }

    // 2. Authenticate - user must be logged in to get signed URL
    AuthMiddleware::requireAuth();

    // Parse input
    $input = [];
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $input = json_decode(file_get_contents('php://input'), true) ?: [];
    }
    
    $filename = $_GET['file'] ?? $input['file'] ?? '';
    $prettyUrl = $input['prettyUrl'] ?? '';

    // Handle pretty URL request
    if (!empty($prettyUrl)) {
        $mapping = resolveUrlMapping($prettyUrl);
        if (!$mapping) {
            http_response_code(404);
            throw new Exception('File not found');
        }
        
        $filename = $mapping['filename'];
        $signedParams = generateSignedUrlParams($filename, 3600);
        
        echo json_encode([
            'success' => true,
            'signedPath' => $prettyUrl . '?' . $signedParams,
            'expiresIn' => 3600,
        ]);
        exit;
    }

    // Handle legacy filename request
    if (empty($filename)) {
        http_response_code(400);
        throw new Exception('No filename provided');
    }

    // Security: prevent path traversal
    if (strpos($filename, '..') !== false || strpos($filename, '/') !== false) {
        http_response_code(400);
        throw new Exception('Invalid filename');
    }

    // Check file exists
    $fileInfo = getFileInfo('/api/files/secure/' . $filename);
    if (!$fileInfo) {
        http_response_code(404);
        throw new Exception('File not found');
    }

    // Generate signed URL (valid for 1 hour)
    $signedUrl = getSecureDownloadUrl($filename, 3600);

    echo json_encode([
        'success' => true,
        'url' => $signedUrl,
        'expiresIn' => 3600,
    ]);

} catch (Exception $e) {
    if (http_response_code() === 200) {
        http_response_code(400);
    }
    
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage(),
    ]);
}
