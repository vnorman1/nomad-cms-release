<?php
/**
 * Audio Upload Endpoint
 * Handles audio uploads with optional MP3 conversion
 * 
 * Supported formats: MP3, WAV, OGG, FLAC, AAC, M4A
 * If FFmpeg available and conversion requested: converts to MP3
 * Otherwise: saves original format
 */

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../lib/audio.php';

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
    if (!isset($_FILES['audio']) || $_FILES['audio']['error'] !== UPLOAD_ERR_OK) {
        $errorCode = $_FILES['audio']['error'] ?? UPLOAD_ERR_NO_FILE;
        $errorMessages = [
            UPLOAD_ERR_INI_SIZE => 'A fájl túllépi az upload_max_filesize limitet',
            UPLOAD_ERR_FORM_SIZE => 'A fájl túllépi a MAX_FILE_SIZE limitet',
            UPLOAD_ERR_PARTIAL => 'A fájl csak részben lett feltöltve',
            UPLOAD_ERR_NO_FILE => 'Nem lett audio fájl feltöltve',
            UPLOAD_ERR_NO_TMP_DIR => 'Hiányzó temp könyvtár',
            UPLOAD_ERR_CANT_WRITE => 'Nem sikerült írni a fájlt lemezre',
            UPLOAD_ERR_EXTENSION => 'A fájl feltöltése leállítva kiterjesztés miatt',
        ];
        throw new Exception($errorMessages[$errorCode] ?? 'Ismeretlen feltöltési hiba');
    }

    // 5. Check for optional conversion flag
    $convertToMp3 = isset($_POST['convert']) && $_POST['convert'] === 'true';

    // 6. Process the audio
    $result = processAudio($_FILES['audio'], $convertToMp3);
    
    // 7. Get metadata if available
    $uploadDir = ($_ENV['UPLOAD_DIR'] ?? __DIR__ . '/../uploads/');
    $uploadDir = str_ends_with($uploadDir, '/') ? $uploadDir : $uploadDir . '/';
    $fullPath = $uploadDir . $result['filename'];
    $metadata = file_exists($fullPath) ? getAudioMetadata($fullPath) : null;
    
    // 8. Dispatch webhook event for audio uploaded
    try {
        $webhookService = new WebhookService();
        $currentUser = AuthMiddleware::getCurrentUser();
        $webhookService->dispatchEventAsync('media.audio_uploaded', [
            'id' => $result['filename'],
            'filename' => $_FILES['audio']['name'],
            'original_mime_type' => $_FILES['audio']['type'],
            'original_size' => $_FILES['audio']['size'],
            'url' => '/api/uploads/' . $result['filename'],
            'converted' => $result['converted'],
            'format' => $result['format'] ?? null,
            'duration' => $result['duration'] ?? null,
            'author_id' => $currentUser->uuid ?? null,
            'timestamp' => date('c'),
        ]);
    } catch (\Exception $e) {
        error_log("Webhook dispatch failed for media.audio_uploaded: " . $e->getMessage());
    }
    
    // 9. Return success response
    $response = [
        'success' => true,
        'url' => '/api/uploads/' . $result['filename'],
        'filename' => $result['filename'],
        'converted' => $result['converted'],
        'format' => $result['format'] ?? null,
        'duration' => $result['duration'] ?? null,
        'durationFormatted' => $metadata['durationFormatted'] ?? null,
    ];
    
    if (isset($result['warning'])) {
        $response['warning'] = $result['warning'];
    }
    
    echo json_encode($response);

} catch (Exception $e) {
    $message = $e->getMessage();
    
    // Parse special error formats
    if (str_contains($message, ':')) {
        [$errorType, $errorMsg] = explode(':', $message, 2);
        
        switch ($errorType) {
            case 'FILE_TOO_LARGE':
                http_response_code(413); // Payload Too Large
                break;
            case 'DURATION_TOO_LONG':
                http_response_code(400);
                break;
            case 'INVALID_FILE_TYPE':
                http_response_code(415); // Unsupported Media Type
                break;
            default:
                http_response_code(400);
        }
        
        echo json_encode([
            'success' => false,
            'error' => $errorMsg,
            'errorType' => $errorType,
        ]);
    } else {
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'error' => $message,
        ]);
    }
}
