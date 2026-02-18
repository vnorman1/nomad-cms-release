<?php
/**
 * NOMAD CMS - Pretty URL File Server
 * Serves files via pretty URLs: /{ext}/{hash}/{name}.{ext}
 * 
 * Examples:
 * - GET /pdf/a1b2c3d4e5f6/my-document.pdf -> serves public PDF
 * - GET /secure-pdf/a1b2c3d4e5f6/my-document.pdf -> serves encrypted PDF (with signed URL)
 */

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../lib/file.php';

use NomadCMS\Middleware\AuthMiddleware;

// Handle CORS preflight
handlePreflight();

// Get the pretty URL path from request
$requestUri = $_SERVER['REQUEST_URI'] ?? '';
$path = parse_url($requestUri, PHP_URL_PATH);

// Remove /api/endpoints/file-serve.php prefix if present
$path = preg_replace('#^/api/endpoints/file-serve\.php#', '', $path);

// Also handle if called directly via query param
if (empty($path) || $path === '/') {
    $path = $_GET['path'] ?? '';
}

if (empty($path)) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'error' => 'No path provided']);
    exit;
}

try {
    // Resolve the pretty URL to actual file
    $mapping = resolveUrlMapping($path);
    
    if (!$mapping) {
        http_response_code(404);
        header('Content-Type: application/json');
        echo json_encode(['success' => false, 'error' => 'File not found']);
        exit;
    }
    
    $filename = $mapping['filename'];
    $type = $mapping['type'];
    $metadata = $mapping['metadata'] ?? [];
    $dirs = getFileDirectories();
    
    if ($type === 'secure') {
        // Secure files require signed URL OR session auth
        $signature = $_GET['sig'] ?? '';
        $expires = intval($_GET['exp'] ?? 0);
        
        if (!empty($signature) && $expires > 0) {
            if (!verifySignedUrl($filename, $signature, $expires)) {
                http_response_code(403);
                header('Content-Type: application/json');
                echo json_encode(['success' => false, 'error' => 'Invalid or expired signature']);
                exit;
            }
        } else {
            AuthMiddleware::requireAuth();
        }
        
        // Get decrypted file using STREAMING (memory-safe)
        $result = getSecureFile($filename, true); // streamMode = true
        $fileMeta = $result['metadata'];
        
        $mimeType = $fileMeta['mimeType'] ?? $metadata['mimeType'] ?? 'application/octet-stream';
        $originalName = $fileMeta['originalName'] ?? $metadata['originalName'] ?? $filename;
        
        if ($result['isStreamed'] && isset($result['tempPath'])) {
            // STREAMING MODE: Serve from temp file
            $tempPath = $result['tempPath'];
            $fileSize = filesize($tempPath);
            
            header('Content-Type: ' . $mimeType);
            header('Content-Disposition: attachment; filename="' . $originalName . '"');
            header('Content-Length: ' . $fileSize);
            header('Cache-Control: no-store, no-cache, must-revalidate');
            header('Pragma: no-cache');
            
            readfile($tempPath);
            @unlink($tempPath); // Cleanup
        } else {
            // LEGACY MODE: Content in memory
            $content = $result['content'];
            
            header('Content-Type: ' . $mimeType);
            header('Content-Disposition: attachment; filename="' . $originalName . '"');
            header('Content-Length: ' . strlen($content));
            header('Cache-Control: no-store, no-cache, must-revalidate');
            header('Pragma: no-cache');
            
            echo $content;
        }
    } else {
        // Public file - serve directly
        $filePath = $dirs['public'] . $filename;
        
        if (!file_exists($filePath)) {
            http_response_code(404);
            header('Content-Type: application/json');
            echo json_encode(['success' => false, 'error' => 'File not found on disk']);
            exit;
        }
        
        $mimeType = $metadata['mimeType'] ?? mime_content_type($filePath) ?: 'application/octet-stream';
        $originalName = $metadata['originalName'] ?? $filename;
        
        header('Content-Type: ' . $mimeType);
        header('Content-Disposition: inline; filename="' . $originalName . '"');
        header('Content-Length: ' . filesize($filePath));
        header('Cache-Control: public, max-age=31536000');
        
        readfile($filePath);
    }
    
} catch (Exception $e) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode([
        'success' => false,
        'error' => ($_ENV['APP_DEBUG'] ?? 'false') === 'true' ? $e->getMessage() : 'Internal server error',
    ]);
}
