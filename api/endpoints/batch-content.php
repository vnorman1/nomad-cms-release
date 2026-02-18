<?php
/**
 * Batch Content Endpoint
 * Optimized endpoint for fetching multiple slot data in a single request
 * 
 * POST only - reduces ~80 requests to 1 during login
 * 
 * Security & Performance:
 * - Max 25 keys per batch (configurable)
 * - 10s timeout
 * - Rate limiting: 5 requests/minute per user (with APCu)
 * - Memory-efficient processing
 * - Input validation and sanitization
 */

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

use NomadCMS\Database\ContentDatabase;
use NomadCMS\Security\InputSanitizer;

// Handle CORS preflight
handlePreflight();

// Set JSON content type
header('Content-Type: application/json');

// Only POST allowed
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

// Configuration
const MAX_KEYS_PER_BATCH = 25;
const RATE_LIMIT_REQUESTS = 5;
const RATE_LIMIT_WINDOW = 60; // seconds
const MAX_EXECUTION_TIME = 10; // seconds

// Set execution timeout
set_time_limit(MAX_EXECUTION_TIME);

try {
    // Parse request body with error handling
    $input = file_get_contents('php://input');
    
    if (empty($input)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Empty request body']);
        exit;
    }
    
    $body = json_decode($input, true);
    
    // Check for JSON parse errors
    if (json_last_error() !== JSON_ERROR_NONE) {
        http_response_code(400);
        echo json_encode([
            'success' => false, 
            'error' => 'Invalid JSON: ' . json_last_error_msg()
        ]);
        exit;
    }
    
    if (!is_array($body) || !isset($body['keys']) || !is_array($body['keys'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Missing or invalid keys array']);
        exit;
    }
    
    $keys = $body['keys'];
    
    // Handle empty keys array
    if (count($keys) === 0) {
        echo json_encode(['success' => true, 'data' => new \stdClass(), 'count' => 0]);
        exit;
    }
    
    // Validate keys count
    if (count($keys) > MAX_KEYS_PER_BATCH) {
        http_response_code(400);
        echo json_encode([
            'success' => false, 
            'error' => "Maximum " . MAX_KEYS_PER_BATCH . " keys per batch allowed",
            'received' => count($keys),
            'max' => MAX_KEYS_PER_BATCH
        ]);
        exit;
    }
    
    // Rate limiting (using APCu if available)
    $clientIp = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $rateLimitKey = 'batch_rate_' . md5($clientIp);
    
    if (function_exists('apcu_enabled') && apcu_enabled()) {
        $currentCount = apcu_fetch($rateLimitKey) ?: 0;
        
        if ($currentCount >= RATE_LIMIT_REQUESTS) {
            http_response_code(429);
            echo json_encode([
                'success' => false, 
                'error' => 'Rate limit exceeded. Please wait before making more batch requests.',
                'retry_after' => RATE_LIMIT_WINDOW
            ]);
            exit;
        }
        
        // Increment counter
        if ($currentCount === 0) {
            apcu_store($rateLimitKey, 1, RATE_LIMIT_WINDOW);
        } else {
            apcu_inc($rateLimitKey);
        }
    }
    
    // Deduplicate and sanitize keys
    $processedKeys = [];
    foreach ($keys as $key) {
        // Skip non-string keys
        if (!is_string($key)) {
            continue;
        }
        
        // Sanitize key
        $sanitizedKey = InputSanitizer::slotKey($key);
        
        // Skip empty or already processed keys (deduplication)
        if (empty($sanitizedKey) || isset($processedKeys[$sanitizedKey])) {
            continue;
        }
        
        $processedKeys[$sanitizedKey] = true;
    }
    
    // Fetch all unique keys
    $results = [];
    foreach ($processedKeys as $key => $_) {
        try {
            $data = ContentDatabase::getSlot($key);
            $results[$key] = $data; // null if not found
        } catch (\Exception $e) {
            // Log error but continue with other keys
            error_log("Batch content error for key '$key': " . $e->getMessage());
            $results[$key] = null;
        }
    }
    
    // Return all results in a single response
    echo json_encode([
        'success' => true,
        'data' => !empty($results) ? $results : new \stdClass(),
        'count' => count($results)
    ], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    
} catch (\JsonException $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'JSON encoding error'
    ]);
} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => ($_ENV['APP_DEBUG'] ?? 'false') === 'true' ? $e->getMessage() : 'Internal server error'
    ]);
}

