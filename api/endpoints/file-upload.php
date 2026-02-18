<?php
/**
 * NOMAD CMS - File Upload Endpoint
 * Handles document file uploads (PDF, DOCX, etc.)
 * Supports both regular and AES-256 encrypted file storage
 */

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../lib/file.php';

use NomadCMS\Middleware\AuthMiddleware;
use NomadCMS\Middleware\CSRFMiddleware;

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
    // This automatically handles Bearer token exemption
    CSRFMiddleware::validateForSession();

    // 3. Authenticate and check Admin role
    AuthMiddleware::requireAdmin();

    // 4. Check if file was uploaded
    if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
        $errorCode = $_FILES['file']['error'] ?? UPLOAD_ERR_NO_FILE;
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

    // 5. Parse file configuration from request
    $secure = filter_var($_POST['secure'] ?? 'false', FILTER_VALIDATE_BOOLEAN);
    $allowedTypes = [];
    $maxSizeMB = DEFAULT_MAX_SIZE_MB;

    // Parse allowedTypes from JSON string or array
    if (!empty($_POST['allowedTypes'])) {
        $types = is_string($_POST['allowedTypes']) 
            ? json_decode($_POST['allowedTypes'], true) 
            : $_POST['allowedTypes'];
        if (is_array($types)) {
            $allowedTypes = array_map('strtolower', $types);
        }
    }

    // Parse maxSizeMB
    if (!empty($_POST['maxSizeMB'])) {
        $maxSizeMB = intval($_POST['maxSizeMB']);
        if ($maxSizeMB <= 0 || $maxSizeMB > 100) {
            $maxSizeMB = DEFAULT_MAX_SIZE_MB;
        }
    }

    // 6. Process the file
    if ($secure) {
        $result = processSecureFile($_FILES['file'], $allowedTypes, $maxSizeMB);
    } else {
        $result = processFile($_FILES['file'], $allowedTypes, $maxSizeMB);
    }

    // 7. Return success response
    echo json_encode([
        'success' => true,
        'file' => $result,
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
