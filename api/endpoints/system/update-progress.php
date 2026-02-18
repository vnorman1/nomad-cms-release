<?php
/**
 * Update Progress SSE Endpoint
 * 
 * Server-Sent Events endpoint for real-time update progress.
 */

declare(strict_types=1);

require_once __DIR__ . '/../../vendor/autoload.php';
require_once __DIR__ . '/../../bootstrap.php';

use NomadCMS\Services\Auth\JWTService;

// SSE headers
header('Content-Type: text/event-stream');
header('Cache-Control: no-cache');
header('Connection: keep-alive');
header('X-Accel-Buffering: no'); // Disable nginx buffering

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Verify JWT (from query param for EventSource compatibility)
$token = $_GET['token'] ?? null;
if (!$token) {
    http_response_code(401);
    echo "data: " . json_encode(['error' => 'Token required']) . "\n\n";
    exit;
}

try {
    $jwt = JWTService::getInstance();
    $payload = $jwt->validateToken($token);
    
    if (!$payload || !($payload['is_admin'] ?? false)) {
        http_response_code(403);
        echo "data: " . json_encode(['error' => 'Admin required']) . "\n\n";
        exit;
    }
} catch (Throwable $e) {
    http_response_code(401);
    echo "data: " . json_encode(['error' => 'Invalid token']) . "\n\n";
    exit;
}

// Progress file path
$progressFile = sys_get_temp_dir() . '/nomad_update_progress.json';

// HMAC secret (must match apply-update.php)
$applyUpdatePath = __DIR__ . '/apply-update.php';
$progressSecret = $_ENV['UPDATE_PROGRESS_SECRET'] ?? hash('sha256', $applyUpdatePath . filemtime($applyUpdatePath));

// Set time limit for long-polling
set_time_limit(300);

// Send initial connection event
echo "event: connected\n";
echo "data: {\"status\":\"connected\"}\n\n";
flush();

$lastModTime = 0;
$timeout = 300; // 5 minutes max
$startTime = time();

while ((time() - $startTime) < $timeout) {
    // Check if client disconnected
    if (connection_aborted()) {
        break;
    }
    
    // Check for progress updates
    if (file_exists($progressFile)) {
        $modTime = filemtime($progressFile);
        
        if ($modTime > $lastModTime) {
            $lastModTime = $modTime;
            $data = file_get_contents($progressFile);
            $progress = json_decode($data, true);
            
            if ($progress) {
                // The progress data must be HMAC-wrapped (data + hmac keys)
                if (isset($progress['data']) && isset($progress['hmac'])) {
                    // Verify HMAC integrity
                    $json = json_encode($progress['data']);
                    $expectedHmac = hash_hmac('sha256', $json, $progressSecret);
                    
                    if (!hash_equals($expectedHmac, $progress['hmac'])) {
                        // Integrity check failed — skip this update
                        error_log('Update progress HMAC verification failed');
                        usleep(500000);
                        continue;
                    }
                    
                    $progressData = $progress['data'];
                } else {
                    // Legacy / unsigned data — reject in production
                    error_log('Update progress data missing HMAC signature');
                    usleep(500000);
                    continue;
                }
                
                echo "event: progress\n";
                echo "data: " . json_encode($progressData) . "\n\n";
                flush();
                
                // If complete or error, close connection
                $stage = $progressData['stage'] ?? '';
                if ($stage === 'complete' || $stage === 'error') {
                    echo "event: done\n";
                    echo "data: {\"finished\":true}\n\n";
                    flush();
                    break;
                }
            }
        }
    }
    
    // Send heartbeat every 15 seconds
    if (time() % 15 === 0) {
        echo ": heartbeat\n\n";
        flush();
    }
    
    // Sleep briefly before checking again
    usleep(500000); // 500ms
}

// Cleanup
if (file_exists($progressFile)) {
    $progress = json_decode(file_get_contents($progressFile), true);
    $stage = $progress['data']['stage'] ?? $progress['stage'] ?? '';
    if ($stage === 'complete' || $stage === 'error') {
        @unlink($progressFile);
    }
}
