<?php
/**
 * Data Endpoint Logic
 * Handles GET, POST, DELETE operations for slot data
 * 
 * Auth requirements by operation:
 * - GET (public data): No auth required
 * - GET (__all_keys__): Admin only
 * - POST (write data): Auth + write permission (with OPTIMISTIC LOCKING)
 * - DELETE: Auth + admin permission
 * 
 * OPTIMISTIC LOCKING (2026-01-05):
 * - POST requests can include 'expected_version' to prevent lost updates
 * - If version mismatch, returns HTTP 409 Conflict with current version
 * - Frontend should prompt user to reload/merge on conflict
 * 
 * SMART MEDIA INGESTION (2026-01-06):
 * - Auto-detects image URLs/Base64 in JSON payloads
 * - Queues for background download and WebP conversion
 * - Replaces with local paths immediately
 * 
 * SNAPSHOT VERSIONING (2026-01-06):
 * - API requests with 'bulk_import' flag skip versioning for performance
 * - Used for mass data imports and webhook sync
 */

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

use NomadCMS\Database\ContentDatabase;
use NomadCMS\Database\OptimisticLockException;
use NomadCMS\Middleware\AuthMiddleware;
use NomadCMS\Middleware\CSRFMiddleware;
use NomadCMS\Middleware\RateLimitMiddleware;
use NomadCMS\Config\Security;
use NomadCMS\Security\InputSanitizer;
use NomadCMS\Security\WebhookService;
use NomadCMS\Services\StaticCacheService;
use NomadCMS\Services\VersioningService;
use NomadCMS\Services\SmartIngestService;
use NomadCMS\Services\DependencyGraphService;

// Handle CORS preflight
handlePreflight();

// Set JSON content type
header('Content-Type: application/json');

$method = $_SERVER['REQUEST_METHOD'];

// Apply rate limiting based on request type
if ($method === 'GET') {
    // Public GET: 200/min per IP - generous for SPA/public sites
    $settings = Security::getRateLimitSettings()['public_api'];
    RateLimitMiddleware::check(
        key: 'public_api:' . ($_SERVER['REMOTE_ADDR'] ?? 'unknown'),
        maxRequests: $settings['max'],
        windowSeconds: $settings['window']
    );
} elseif ($method === 'POST' || $method === 'DELETE') {
    // Write operations: 60/min per IP - stricter limit
    // Prevents abuse while allowing reasonable editing workflows
    RateLimitMiddleware::check(
        key: 'write_api:' . ($_SERVER['REMOTE_ADDR'] ?? 'unknown'),
        maxRequests: 360,
        windowSeconds: 60
    );
}

try {
    switch ($method) {
        case 'GET':
            $key = InputSanitizer::slotKey($_GET['key'] ?? '');
            
            // Special route: get all keys (admin only)
            if ($key === '__all_keys__') {
                AuthMiddleware::requireAuth();
                AuthMiddleware::requirePermission('admin');
                echo json_encode(['success' => true, 'keys' => ContentDatabase::getAllSlots()]);
                exit;
            }
            
            if (empty($key)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Missing key parameter']);
                exit;
            }
            
            // Check if version info requested (for optimistic locking)
            $withVersion = isset($_GET['with_version']) && $_GET['with_version'] === 'true';
            
            if ($withVersion) {
                // Return data with version for optimistic locking
                $result = ContentDatabase::getSlotWithVersion($key);
                if ($result === null) {
                    echo json_encode([
                        'success' => true, 
                        'data' => null, 
                        'version' => 0,
                        'exists' => false
                    ]);
                } else {
                    echo json_encode([
                        'success' => true, 
                        'data' => $result['data'], 
                        'version' => $result['version'],
                        'exists' => true
                    ]);
                }
            } else {
                // Standard GET - no version info
                $data = ContentDatabase::getSlot($key);
                
                if ($data === null) {
                    echo json_encode(['success' => true, 'data' => null, 'exists' => false]);
                } else {
                    echo json_encode(['success' => true, 'data' => $data, 'exists' => true]);
                }
            }
            break;
            
        case 'POST':
            // SECURITY: Validate CSRF token for session-based requests
            CSRFMiddleware::validateForSession();
            
            // Require auth and write permission
            AuthMiddleware::requireAuth();
            AuthMiddleware::requirePermission('write');
            
            $input = file_get_contents('php://input');
            $body = !empty($input) ? json_decode($input, true) : null;

            if (!$body || !is_array($body)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Invalid JSON body']);
                exit;
            }
            
            $key = InputSanitizer::slotKey($body['key'] ?? '');
            $data = $body['data'] ?? null;
            $slotType = $body['slot_type'] ?? null;
            
            // ENTERPRISE OPTIMISTIC LOCKING:
            // 1. expected_hash (recommended) - SHA-256 content hash, TRUE identity check
            // 2. expected_version (fallback) - Version number, simpler but less robust
            $expectedHash = isset($body['expected_hash']) ? (string) $body['expected_hash'] : null;
            $expectedVersion = isset($body['expected_version']) ? (int) $body['expected_version'] : null;
            
            // WASM PRECOMPUTED VERSION DATA:
            // Frontend can compute diff + compress using WASM, sending precomputed data
            // This offloads CPU-intensive work from server
            $precomputedVersion = $body['precomputed_version'] ?? null;
            
            if (empty($key)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Missing or invalid key in request body']);
                exit;
            }
            
            if ($data === null) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Missing data in request body']);
                exit;
            }
            
            // Check if content exists BEFORE saving (for webhook event type)
            $existingData = ContentDatabase::getSlot($key);
            $isNewContent = ($existingData === null);
            
            // Track previous status for content.published detection
            $previousStatus = null;
            if (!$isNewContent && is_array($existingData)) {
                $previousStatus = $existingData['status'] ?? null;
            }
            
            // Get current user for version metadata
            $currentUser = AuthMiddleware::getCurrentUser();
            $changedBy = $currentUser ? ($currentUser->email ?? 'unknown') : 'anonymous';
            
            // SMART MEDIA INGESTION (2026-01-06):
            // Auto-detect and queue images in payload for background processing
            // Replaces URLs/Base64 with predicted local paths immediately
            $enableSmartIngest = ($body['smart_ingest'] ?? true) === true;
            $jobId = null;
            
            if ($enableSmartIngest && is_array($data)) {
                try {
                    $jobId = bin2hex(random_bytes(8));
                    SmartIngestService::processPayload($data, $jobId);
                } catch (\Throwable $e) {
                    error_log("[SmartIngest] Processing failed: " . $e->getMessage());
                    // Non-blocking: continue with original data if ingestion fails
                }
            }
            
            // SNAPSHOT VERSIONING (2026-01-06):
            // Skip versioning for bulk imports to prevent database bloat
            // Used for API imports, webhooks, and mass data sync
            $isBulkImport = ($body['bulk_import'] ?? false) === true;
            
            // Build save options with ENTERPRISE OPTIMISTIC LOCKING support
            // 
            // SIMPLIFIED VERSIONING (2026-01-05):
            // - ALL saves attempt version creation
            // - Backend auto-skips if content hash is identical to last version
            // - No more frontend complexity with create_version flag
            // - Object types with high-frequency saves naturally dedupe via hash
            //
            // WASM PRECOMPUTATION (2026-01-05):
            // - Frontend can compute diff + compress using WASM
            // - Pass precomputed_version to offload server CPU
            //
            $saveOptions = [
                'changed_by' => $changedBy,
                'slot_type' => $slotType,
                'skip_versioning' => $isBulkImport,  // Skip for bulk imports
                'force_version' => false,             // Hash-based dedup handles this
            ];
            
            // Add precomputed version data if provided (WASM optimization)
            if ($precomputedVersion !== null && is_array($precomputedVersion)) {
                $saveOptions['precomputed_version'] = $precomputedVersion;
            }
            
            // Add optimistic locking (hash preferred over version)
            if ($expectedHash !== null) {
                $saveOptions['expected_hash'] = $expectedHash;  // Recommended: TRUE content identity
            } elseif ($expectedVersion !== null) {
                $saveOptions['expected_version'] = $expectedVersion;  // Fallback: simpler but less robust
            }
            
            try {
                $saveResult = ContentDatabase::saveSlotWithResult($key, $data, $saveOptions);
                
                if (!$saveResult['success']) {
                    // Check if it's a conflict error
                    if (($saveResult['error'] ?? '') === 'CONFLICT') {
                        http_response_code(409); // HTTP 409 Conflict
                        $lockType = $saveResult['lock_type'] ?? 'version';
                        echo json_encode([
                            'success' => false,
                            'error' => $lockType === 'hash' ? 'HASH_CONFLICT' : 'VERSION_CONFLICT',
                            'lock_type' => $lockType,
                            'message' => 'Content was modified by another user. Please reload and try again.',
                            'expected_version' => $saveResult['expected_version'] ?? null,
                            'current_version' => $saveResult['actual_version'] ?? null,
                            'expected_hash' => $saveResult['expected_hash'] ?? null,
                            'current_hash' => $saveResult['actual_hash'] ?? null
                        ]);
                        exit;
                    }
                    throw new \RuntimeException($saveResult['error'] ?? 'Save failed');
                }
                
                $newVersion = $saveResult['version'] ?? 0;
                $newHash = $saveResult['hash'] ?? null;
                
                // Dispatch webhook event for content created/updated
                try {
                    // Skip webhooks for draft content (status === 'draft' or isDraft === true)
                    $isDraft = is_array($data) && (($data['status'] ?? '') === 'draft' || ($data['isDraft'] ?? false) === true);
                    $isObjectType = ($slotType === 'object');
                    
                    // Detect status transition to 'published' for content.published event
                    $newStatus = is_array($data) ? ($data['status'] ?? null) : null;
                    $isPublishedTransition = !$isDraft && 
                                             $newStatus === 'published' && 
                                             $previousStatus !== 'published';
                    
                    // Webhooks for all slot types (including object with debouncing)
                    if (!$isDraft) {
                        $webhookService = new WebhookService();
                        $eventType = $isNewContent ? 'content.created' : 'content.updated';
                        
                        error_log("[WEBHOOK DEBUG] Dispatching {$eventType} for {$slotType}: {$key}");
                        
                        // Build payload dynamically - only include fields that exist in the data
                        $webhookPayload = [
                            'id' => $key,
                            'slot' => $key,
                            'slot_type' => $slotType,
                            'version' => $newVersion,
                            'timestamp' => date('c'),
                        ];
                        
                        // Add optional fields only if they exist in data
                        if (is_array($data)) {
                            if (isset($data['title'])) $webhookPayload['title'] = $data['title'];
                            if (isset($data['slug'])) $webhookPayload['slug'] = $data['slug'];
                            if (isset($data['status'])) $webhookPayload['status'] = $data['status'];
                            if (isset($data['name'])) $webhookPayload['name'] = $data['name'];
                            if (isset($data['email'])) $webhookPayload['email'] = $data['email'];
                            // Include full content for collection/list items
                            $webhookPayload['content'] = $data;
                        }
                        
                        if ($currentUser && $currentUser->uuid) {
                            $webhookPayload['author_id'] = $currentUser->uuid;
                        }
                        
                        // Use debounced delivery for Object types (saves frequently)
                        if ($isObjectType) {
                            // Debounced delivery for object types - aggregate rapid saves
                            $webhookService->scheduleDebounced($eventType, $webhookPayload, $key, $slotType, 10);
                            error_log("[WEBHOOK DEBUG] Scheduled debounced webhook for object type: {$key}");
                        } else {
                            // Async webhook dispatch (non-blocking) for list/collection/massive types
                            $queued = $webhookService->dispatchEventAsync($eventType, $webhookPayload, $key, $slotType);
                            error_log("[WEBHOOK DEBUG] Queued {$queued} webhooks for async delivery");
                        }
                        
                        // Dispatch content.published event if status changed to published
                        if ($isPublishedTransition) {
                            error_log("[WEBHOOK DEBUG] Dispatching content.published for {$slotType}: {$key}");
                            if ($isObjectType) {
                                $webhookService->scheduleDebounced('content.published', $webhookPayload, $key, $slotType, 10);
                            } else {
                                $webhookService->dispatchEventAsync('content.published', $webhookPayload, $key, $slotType);
                            }
                        }
                    } else {
                        error_log("[WEBHOOK DEBUG] Skipping webhook - draft: " . ($isDraft ? 'yes' : 'no'));
                    }
                } catch (\Exception $e) {
                    error_log("[WEBHOOK ERROR] Dispatch failed for content: " . $e->getMessage() . "\n" . $e->getTraceAsString());
                }
                
                // Generate static cache for faster public access
                try {
                    StaticCacheService::generateForSlot($key, $data, $slotType);
                    
                    // PERMAFROST FIX: Cascade updates to dependent slots
                    // If this slot is a "parent" (e.g., authors), regenerate all
                    // "child" slots that embed its data (e.g., posts with author info)
                    DependencyGraphService::touchDependents($key);
                } catch (\Exception $e) {
                    error_log("[StaticCache] Generation failed for {$key}: " . $e->getMessage());
                }
                
                // Return success with version + hash for ENTERPRISE optimistic locking
                echo json_encode([
                    'success' => true, 
                    'message' => 'Data saved successfully',
                    'version' => $newVersion,
                    'hash' => $newHash  // For next save's optimistic lock (recommended)
                ]);
                
            } catch (OptimisticLockException $e) {
                http_response_code(409);
                echo json_encode([
                    'success' => false,
                    'error' => 'VERSION_CONFLICT',
                    'message' => $e->getMessage(),
                    'expected_version' => $e->expectedVersion,
                    'current_version' => $e->actualVersion
                ]);
            }
            break;
            
        case 'DELETE':
            // SECURITY: Validate CSRF token for session-based requests
            CSRFMiddleware::validateForSession();
            
            // Require auth and admin permission for deletion
            AuthMiddleware::requireAuth();
            AuthMiddleware::requirePermission('admin');
            
            $key = InputSanitizer::slotKey($_GET['key'] ?? '');
            
            if (empty($key)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Missing key parameter']);
                exit;
            }
            
            if (ContentDatabase::deleteSlot($key)) {
                // Dispatch webhook event for content deleted
                try {
                    $webhookService = new WebhookService();
                    $currentUser = AuthMiddleware::getCurrentUser();
                    
                    $webhookPayload = [
                        'id' => $key,
                        'slot' => $key,
                        'timestamp' => date('c'),
                    ];
                    if ($currentUser && $currentUser->uuid) {
                        $webhookPayload['author_id'] = $currentUser->uuid;
                    }
                    
                    $webhookService->dispatchEventAsync('content.deleted', $webhookPayload, $key);
                } catch (\Exception $e) {
                    error_log("Webhook dispatch failed for content.deleted: " . $e->getMessage());
                }
                
                // Invalidate static cache
                try {
                    StaticCacheService::invalidateSlot($key);
                } catch (\Exception $e) {
                    error_log("[StaticCache] Invalidation failed for {$key}: " . $e->getMessage());
                }
                
                echo json_encode(['success' => true, 'message' => 'Data deleted successfully']);
            } else {
                http_response_code(500);
                echo json_encode(['success' => false, 'error' => 'Failed to delete data']);
            }
            break;
            
        default:
            http_response_code(405);
            echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    }
} catch (\Exception $e) {
    http_response_code(500);
    
    // Only show detailed errors in development mode
    // SECURITY: Never expose stack traces in production
    $isDevMode = (($_ENV['APP_DEBUG'] ?? 'false') === 'true') 
                 && (($_ENV['APP_ENV'] ?? 'production') !== 'production');
    
    echo json_encode([
        'success' => false,
        'error' => $isDevMode ? $e->getMessage() : 'Internal server error',
    ]);
}
