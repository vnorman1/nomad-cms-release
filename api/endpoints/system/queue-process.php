<?php
/**
 * NOMAD CMS - Queue Processing Endpoint
 * 
 * HTTP endpoint for processing media queue items.
 * Designed for shared web hosting without cron/daemon access.
 * 
 * USAGE:
 * 1. Frontend calls this endpoint after Forge import completes
 * 2. Can be called repeatedly until queue is empty
 * 3. Returns progress info for UI feedback
 * 
 * POST /api/endpoints/system/queue-process.php
 * 
 * Request body (optional):
 * {
 *   "limit": 10,        // Max items to process (default: 10, max: 50)
 *   "jobId": "abc123"   // Only process items for specific job
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "processed": 5,
 *   "failed": 0,
 *   "remaining": 15,
 *   "stats": { "pending": 15, "completed": 85, "failed": 0 }
 * }
 */

declare(strict_types=1);

require_once __DIR__ . '/../../bootstrap.php';

use NomadCMS\Auth\JWTService;
use NomadCMS\Services\SmartIngestService;

// CORS
handlePreflight();

header('Content-Type: application/json');

// Allow both GET (for simple polling) and POST (for options)
if (!in_array($_SERVER['REQUEST_METHOD'], ['GET', 'POST'], true)) {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

// Verify JWT token (require authentication)
$token = JWTService::extractBearerToken();
if (!$token) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Authentication required']);
    exit;
}

try {
    $payload = JWTService::validateAccessToken($token);
    if (!isset($payload->user->id)) {
        throw new Exception('Invalid token');
    }
    
    // Parse request options
    $input = [];
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $input = json_decode(file_get_contents('php://input'), true) ?? [];
    }
    
    // Limit: default 10, max 50 (prevent timeout)
    $limit = min((int)($input['limit'] ?? 10), 50);
    $limit = max($limit, 1);
    
    // Optional: filter by job ID
    $jobId = $input['jobId'] ?? null;
    
    error_log("[QueueProcess] Called with limit={$limit}, jobId=" . ($jobId ?? 'null'));
    
    // Get stats before processing
    $statsBefore = SmartIngestService::getQueueStats();
    $pendingBefore = $statsBefore['pending'] ?? 0;
    
    error_log("[QueueProcess] Before: pending={$pendingBefore}");
    
    // Process queue items
    if ($pendingBefore > 0) {
        $results = SmartIngestService::processPendingQueue($limit);
        error_log("[QueueProcess] Processed: {$results['processed']}, Failed: {$results['failed']}");
        if (!empty($results['errors'])) {
            error_log("[QueueProcess] Errors: " . json_encode($results['errors']));
        }
    } else {
        error_log("[QueueProcess] No pending items to process");
        $results = ['processed' => 0, 'failed' => 0, 'errors' => []];
    }
    
    // Get stats after processing
    $statsAfter = SmartIngestService::getQueueStats();
    $remaining = $statsAfter['pending'] ?? 0;
    
    error_log("[QueueProcess] After: pending={$remaining}");
    
    echo json_encode([
        'success' => true,
        'processed' => $results['processed'],
        'failed' => $results['failed'],
        'remaining' => $remaining,
        'stats' => $statsAfter,
        'complete' => $remaining === 0,
    ]);
    
} catch (Exception $e) {
    error_log("[QueueProcess] ERROR: " . $e->getMessage());
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
