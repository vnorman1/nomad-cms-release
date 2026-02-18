<?php
/**
 * NOMAD CMS - File Download Endpoint
 * Handles file downloads including decryption of secure files
 * 
 * Routes:
 * - GET /file-download.php?file=filename&type=public   - Download public file
 * - GET /file-download.php?file=filename&type=secure  - Download secure file (requires auth)
 * - DELETE /file-download.php - Delete a file
 */

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../lib/file.php';

use NomadCMS\Middleware\AuthMiddleware;
use NomadCMS\Middleware\CSRFMiddleware;

// Handle CORS preflight
handlePreflight();

$method = $_SERVER['REQUEST_METHOD'];

try {
    switch ($method) {
        case 'GET':
            handleDownload();
            break;
            
        case 'POST':
        case 'DELETE':
            handleDelete();
            break;
            
        default:
            http_response_code(405);
            header('Content-Type: application/json');
            echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    }
} catch (Exception $e) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode([
        'success' => false,
        'error' => ($_ENV['APP_DEBUG'] ?? 'false') === 'true' ? $e->getMessage() : 'Internal server error',
    ]);
}

/**
 * Handle file download (GET)
 * Uses STREAMING for secure files - memory safe for large files
 */
function handleDownload(): void {
    $filename = $_GET['file'] ?? '';
    $type = $_GET['type'] ?? 'public';
    
    if (empty($filename)) {
        http_response_code(400);
        header('Content-Type: application/json');
        echo json_encode(['success' => false, 'error' => 'No filename provided']);
        return;
    }
    
    // Security: prevent path traversal
    if (strpos($filename, '..') !== false || strpos($filename, '/') !== false) {
        http_response_code(400);
        header('Content-Type: application/json');
        echo json_encode(['success' => false, 'error' => 'Invalid filename']);
        return;
    }
    
    $dirs = getFileDirectories();
    
    if ($type === 'secure') {
        // Secure files require signed URL OR session auth
        $signature = $_GET['sig'] ?? '';
        $expires = intval($_GET['exp'] ?? 0);
        
        // Try signed URL first (stateless)
        if (!empty($signature) && $expires > 0) {
            if (!verifySignedUrl($filename, $signature, $expires)) {
                http_response_code(403);
                header('Content-Type: application/json');
                echo json_encode(['success' => false, 'error' => 'Invalid or expired signature']);
                return;
            }
            // Signature valid - proceed to download
        } else {
            // Fall back to session auth
            AuthMiddleware::requireAuth();
        }
        
        // Get decrypted file using STREAMING (memory-safe)
        // This returns a temp file path instead of content in RAM
        $result = getSecureFile($filename, true); // streamMode = true
        
        $metadata = $result['metadata'];
        $mimeType = $metadata['mimeType'] ?? 'application/octet-stream';
        $originalName = $metadata['originalName'] ?? $filename;
        
        if ($result['isStreamed'] && isset($result['tempPath'])) {
            // STREAMING MODE: Serve from temp file
            $tempPath = $result['tempPath'];
            $fileSize = filesize($tempPath);
            
            // Send file headers
            header('Content-Type: ' . $mimeType);
            header('Content-Disposition: attachment; filename="' . $originalName . '"');
            header('Content-Length: ' . $fileSize);
            header('Cache-Control: no-store, no-cache, must-revalidate');
            header('Pragma: no-cache');
            
            // Stream file content (memory-safe)
            readfile($tempPath);
            
            // Cleanup temp file
            @unlink($tempPath);
        } else {
            // LEGACY MODE: Content in memory (backward compat)
            $content = $result['content'];
            
            // Send file headers
            header('Content-Type: ' . $mimeType);
            header('Content-Disposition: attachment; filename="' . $originalName . '"');
            header('Content-Length: ' . strlen($content));
            header('Cache-Control: no-store, no-cache, must-revalidate');
            header('Pragma: no-cache');
            
            echo $content;
        }
    } else {
        // Public files - serve directly
        $filePath = $dirs['public'] . $filename;
        
        if (!file_exists($filePath)) {
            http_response_code(404);
            header('Content-Type: application/json');
            echo json_encode(['success' => false, 'error' => 'File not found']);
            return;
        }
        
        $mimeType = mime_content_type($filePath) ?: 'application/octet-stream';
        
        // Send file headers
        header('Content-Type: ' . $mimeType);
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header('Content-Length: ' . filesize($filePath));
        header('Cache-Control: public, max-age=31536000');
        
        readfile($filePath);
    }
}

/**
 * Handle file deletion (POST/DELETE)
 */
function handleDelete(): void {
    header('Content-Type: application/json');
    
    // SECURITY: Validate CSRF token for session-based requests
    CSRFMiddleware::validateForSession();
    
    // Require admin for file deletion
    AuthMiddleware::requireAdmin();
    
    // Get the URL to delete from request body
    $input = file_get_contents('php://input');
    $body = !empty($input) ? json_decode($input, true) : [];
    $url = $body['url'] ?? '';
    
    if (empty($url)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'No URL provided']);
        return;
    }
    
    // Delete the file
    $success = deleteFile($url);
    
    echo json_encode([
        'success' => $success,
        'message' => $success ? 'File deleted successfully' : 'File not found or already deleted',
    ]);
}
