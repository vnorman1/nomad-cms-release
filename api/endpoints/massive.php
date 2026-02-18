<?php
/**
 * Massive Data Endpoint
 * 
 * Handles paginated CRUD operations for 'massive' type slots.
 * Optimized for large datasets (10,000+ records).
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 * ROUTES
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * GET    /massive.php?slot=<key>                          - List paginated
 * GET    /massive.php?slot=<key>&id=<id>                  - Get single
 * GET    /massive.php?slot=<key>&stats=1                  - Get statistics
 * GET    /massive.php?slot=<key>&export=csv               - Export CSV
 * GET    /massive.php?slot=<key>&groupby=<field>          - Group by field
 * GET    /massive.php?slot=<key>&aggregate=<func>&field=<f> - Aggregate (count/sum/avg/min/max)
 * GET    /massive.php?slot=<key>&distinct=<field>         - Distinct values
 * GET    /massive.php?slot=<key>&query=<json>             - Advanced query
 * POST   /massive.php                                     - Create new
 * POST   /massive.php { _action: "query", ... }           - Advanced query via POST
 * POST   /massive.php { _action: "aggregate", ... }       - Aggregate via POST
 * POST   /massive.php { _action: "groupby", ... }         - Group by via POST
 * POST   /massive.php { _action: "distinct", ... }        - Distinct via POST
 * POST   /massive.php { _action: "bulkUpdate", ... }      - Bulk update with conditions
 * PUT    /massive.php                                     - Update existing
 * DELETE /massive.php?slot=<key>&id=<id>                  - Delete single
 * DELETE /massive.php?slot=<key>&ids=1,2,3               - Bulk delete
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 * QUERY PARAMETERS
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Standard pagination:
 * - page: Page number (default: 1)
 * - pageSize: Items per page (default: 50, max: 200)
 * - sort: Field to sort by
 * - dir: Sort direction (asc/desc)
 * - search: Full-text search query
 * - filter[field]=value: Filter by field value
 * 
 * Advanced query operators (via JSON):
 * - eq: Equal
 * - ne: Not equal
 * - gt/gte: Greater than / Greater than or equal
 * - lt/lte: Less than / Less than or equal
 * - like: SQL LIKE pattern
 * - in/notin: Value in array / not in array
 * - between: Value between two values [min, max]
 * - isnull/isnotnull: Check for null
 * - startswith/endswith/contains: String matching
 * - logic: 'AND' or 'OR' for combining conditions
 * 
 * Example advanced query via POST:
 * {
 *   "_action": "query",
 *   "slot": "emailSubscribers",
 *   "conditions": [
 *     {"field": "status", "op": "eq", "value": "active"},
 *     {"field": "created_at", "op": "gte", "value": "2025-01-01"}
 *   ],
 *   "sort": [{"field": "created_at", "dir": "desc"}],
 *   "page": 1,
 *   "pageSize": 50,
 *   "logic": "AND"
 * }
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 * AUTH REQUIREMENTS
 * ═══════════════════════════════════════════════════════════════════════════════
 * - GET (all read ops): Auth required (JWT or API Key)
 * - POST, PUT, DELETE: Auth + write permission
 */

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

use NomadCMS\Database\MassiveDatabase;
use NomadCMS\Security\SlotConfigSigning;
use NomadCMS\Security\WebhookService;
use NomadCMS\Middleware\AuthMiddleware;
use NomadCMS\Middleware\CSRFMiddleware;
use NomadCMS\Middleware\RateLimitMiddleware;
use NomadCMS\Security\InputSanitizer;

// OPTIMIZATION: Lazy-loaded webhook service singleton for this request
$webhookServiceInstance = null;

/**
 * Get or create WebhookService instance (lazy singleton per request)
 * OPTIMIZATION: Avoids creating multiple instances
 */
function getWebhookService(): WebhookService {
    global $webhookServiceInstance;
    if ($webhookServiceInstance === null) {
        $webhookServiceInstance = new WebhookService();
    }
    return $webhookServiceInstance;
}

/**
 * Dispatch webhook with minimal overhead
 * OPTIMIZATION: Skips dispatch if no webhooks configured
 */
function dispatchMassiveWebhook(string $event, array $payload, string $slot): void {
    try {
        $webhookService = getWebhookService();
        // OPTIMIZATION: Early return if no active webhooks
        if (!$webhookService->hasActiveWebhooks()) {
            return;
        }
        // Use async dispatch for non-blocking delivery
        $webhookService->dispatchEventAsync($event, $payload, $slot, 'massive');
    } catch (\Exception $e) {
        error_log("[WEBHOOK ERROR] Failed to dispatch {$event} for massive/{$slot}: " . $e->getMessage());
    }
}

// Handle CORS preflight
handlePreflight();

// Set JSON content type
header('Content-Type: application/json');

$method = $_SERVER['REQUEST_METHOD'];

try {
    // All operations require authentication
    AuthMiddleware::requireAuth();
    
    // Rate limiting for massive operations
    RateLimitMiddleware::check('massive', 100, 60); // 100 requests per minute
    
    switch ($method) {
        // ═══════════════════════════════════════════════════════════════════════════
        // GET - Read operations
        // ═══════════════════════════════════════════════════════════════════════════
        case 'GET':
            $slot = InputSanitizer::slotKey($_GET['slot'] ?? '');
            
            if (empty($slot)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Missing slot parameter']);
                exit;
            }
            
            // Check if slot is encrypted (from signed headers sent by frontend)
            // This eliminates the need to manually sync slot configs between frontend and backend
            $slotConfig = SlotConfigSigning::extractFromRequest($slot);
            $isEncrypted = $slotConfig['encrypted'] ?? false;
            
            // Ensure table exists
            MassiveDatabase::ensureTable($slot);
            
            // Get single record by ID
            if (isset($_GET['id'])) {
                $id = (int) $_GET['id'];
                $record = MassiveDatabase::getById($slot, $id, $isEncrypted);
                
                if ($record === null) {
                    http_response_code(404);
                    echo json_encode(['success' => false, 'error' => 'Record not found']);
                    exit;
                }
                
                echo json_encode([
                    'success' => true, 
                    'record' => $record,
                    'isEncrypted' => $isEncrypted
                ]);
                exit;
            }
            
            // Get statistics
            if (isset($_GET['stats'])) {
                $stats = MassiveDatabase::getStats($slot);
                echo json_encode([
                    'success' => true, 
                    'stats' => $stats,
                    'isEncrypted' => $isEncrypted
                ]);
                exit;
            }
            
            // Export as CSV
            if (isset($_GET['export']) && $_GET['export'] === 'csv') {
                $sort = InputSanitizer::string($_GET['sort'] ?? 'id');
                $dir = InputSanitizer::string($_GET['dir'] ?? 'desc');
                
                $records = MassiveDatabase::exportAll($slot, $sort, $dir, $isEncrypted);
                
                // Generate CSV - sanitize filename to prevent header injection
                $safeSlot = preg_replace('/[^a-zA-Z0-9_-]/', '', $slot);
                header('Content-Type: text/csv; charset=utf-8');
                header('Content-Disposition: attachment; filename="' . $safeSlot . '_export_' . date('Y-m-d_His') . '.csv"');
                
                $output = fopen('php://output', 'w');
                
                // Write BOM for Excel UTF-8 compatibility
                fprintf($output, chr(0xEF).chr(0xBB).chr(0xBF));
                
                if (!empty($records)) {
                    // Get headers from first record
                    $firstData = $records[0]['data'];
                    $headers = array_merge(['id', 'created_at', 'updated_at'], array_keys($firstData));
                    fputcsv($output, $headers);
                    
                    // Write data rows
                    foreach ($records as $record) {
                        $row = [
                            $record['id'],
                            $record['created_at'],
                            $record['updated_at'],
                        ];
                        
                        foreach (array_keys($firstData) as $key) {
                            $value = $record['data'][$key] ?? '';
                            // Handle arrays/objects
                            if (is_array($value) || is_object($value)) {
                                $value = json_encode($value, JSON_UNESCAPED_UNICODE);
                            }
                            $row[] = $value;
                        }
                        
                        fputcsv($output, $row);
                    }
                }
                
                fclose($output);
                exit;
            }
            
            // ───────────────────────────────────────────────────────────────────────
            // Advanced Query Mode (query parameter present)
            // ───────────────────────────────────────────────────────────────────────
            if (isset($_GET['query'])) {
                // Parse JSON query from query parameter or request body
                $queryJson = $_GET['query'] ?? '';
                $query = json_decode($queryJson, true) ?? [];
                
                $conditions = $query['conditions'] ?? [];
                $page = max(1, (int) ($query['page'] ?? $_GET['page'] ?? 1));
                $pageSize = max(1, min(200, (int) ($query['pageSize'] ?? $_GET['pageSize'] ?? 50)));
                $sort = $query['sort'] ?? null; // Array of {field, dir}
                $search = InputSanitizer::string($query['search'] ?? '');
                $logic = strtoupper($query['logic'] ?? 'AND') === 'OR' ? 'OR' : 'AND';
                
                $result = MassiveDatabase::advancedQuery(
                    $slot,
                    $conditions,
                    $page,
                    $pageSize,
                    $sort,
                    !empty($search) ? $search : null,
                    $logic
                );
                
                echo json_encode(['success' => true, ...$result]);
                exit;
            }
            
            // ───────────────────────────────────────────────────────────────────────
            // Aggregate Query (?aggregate=count&field=status)
            // ───────────────────────────────────────────────────────────────────────
            if (isset($_GET['aggregate'])) {
                $function = InputSanitizer::string($_GET['aggregate'] ?? 'count');
                $field = InputSanitizer::string($_GET['field'] ?? 'id');
                
                // Parse conditions from JSON
                $conditionsJson = $_GET['conditions'] ?? '[]';
                $conditions = json_decode($conditionsJson, true) ?? [];
                
                $result = MassiveDatabase::aggregate($slot, $field, $function, $conditions);
                
                echo json_encode([
                    'success' => true,
                    'function' => $function,
                    'field' => $field,
                    'result' => $result
                ]);
                exit;
            }
            
            // ───────────────────────────────────────────────────────────────────────
            // Group By Query (?groupby=status)
            // ───────────────────────────────────────────────────────────────────────
            if (isset($_GET['groupby'])) {
                $field = InputSanitizer::string($_GET['groupby']);
                $limit = max(1, min(1000, (int) ($_GET['limit'] ?? 100)));
                
                // Parse conditions from JSON
                $conditionsJson = $_GET['conditions'] ?? '[]';
                $conditions = json_decode($conditionsJson, true) ?? [];
                
                $result = MassiveDatabase::groupBy($slot, $field, $conditions, $limit);
                
                echo json_encode([
                    'success' => true,
                    'field' => $field,
                    'groups' => $result
                ]);
                exit;
            }
            
            // ───────────────────────────────────────────────────────────────────────
            // Distinct Values (?distinct=status)
            // ───────────────────────────────────────────────────────────────────────
            if (isset($_GET['distinct'])) {
                $field = InputSanitizer::string($_GET['distinct']);
                $limit = max(1, min(1000, (int) ($_GET['limit'] ?? 1000)));
                
                $result = MassiveDatabase::distinct($slot, $field, $limit);
                
                echo json_encode([
                    'success' => true,
                    'field' => $field,
                    'values' => $result
                ]);
                exit;
            }
            
            // ───────────────────────────────────────────────────────────────────────
            // Standard Paginated List
            // ───────────────────────────────────────────────────────────────────────
            $page = max(1, (int) ($_GET['page'] ?? 1));
            $pageSize = max(1, min(200, (int) ($_GET['pageSize'] ?? 50)));
            $sort = InputSanitizer::string($_GET['sort'] ?? '');
            $dir = InputSanitizer::string($_GET['dir'] ?? 'desc');
            $search = InputSanitizer::string($_GET['search'] ?? '');
            
            // Parse filters from query params (filter[status]=active)
            // Parse filters from query params
            // PHP automatically parses filter[key]=value into $_GET['filter'] array
            $filters = [];
            if (isset($_GET['filter']) && is_array($_GET['filter'])) {
                foreach ($_GET['filter'] as $key => $value) {
                    $filters[InputSanitizer::string($key)] = InputSanitizer::string($value);
                }
            } else {
                // Fallback for manual parsing (if needed)
                foreach ($_GET as $key => $value) {
                    if (preg_match('/^filter\[(.+)\]$/', $key, $matches)) {
                        $filterField = InputSanitizer::string($matches[1]);
                        $filters[$filterField] = InputSanitizer::string($value);
                    }
                }
            }
            
            // Get searchable fields from slot config (for blind indexing)
            $searchableFields = $slotConfig['searchableFields'] ?? [];
            
            $result = MassiveDatabase::getPaginated(
                $slot,
                $page,
                $pageSize,
                !empty($sort) ? $sort : null,
                $dir,
                !empty($search) ? $search : null,
                $filters,
                $isEncrypted,
                $searchableFields
            );
            
            // Add encryption info to response
            $response = [
                'success' => true, 
                ...$result,
                'isEncrypted' => $isEncrypted,
            ];
            
            // If encrypted, inform frontend about feature availability
            if ($isEncrypted) {
                $hasSearchableFields = !empty($searchableFields);
                $response['blindIndexEnabled'] = $hasSearchableFields;
                $response['searchDisabled'] = !$hasSearchableFields; // Search enabled if has searchable fields
                $response['filterDisabled'] = true; // JSON filters still disabled for encrypted
                $response['sortDisabled'] = true; // Only for JSON fields, system fields still work
                
                if ($hasSearchableFields) {
                    $response['searchableFields'] = $searchableFields;
                }
            }
            
            echo json_encode($response);
            break;
            
        // ═══════════════════════════════════════════════════════════════════════════
        // POST - Create new record OR Advanced Queries via POST body
        // ═══════════════════════════════════════════════════════════════════════════
        case 'POST':
            $input = file_get_contents('php://input');
            $body = !empty($input) ? json_decode($input, true) : null;
            
            // Check if this is a query request (read operation via POST for complex queries)
            if (isset($body['_action'])) {
                $action = $body['_action'];
                $slot = InputSanitizer::slotKey($body['slot'] ?? '');
                
                if (empty($slot)) {
                    http_response_code(400);
                    echo json_encode(['success' => false, 'error' => 'Missing slot parameter']);
                    exit;
                }
                
                MassiveDatabase::ensureTable($slot);
                
                switch ($action) {
                    case 'query':
                        // Advanced query via POST body
                        $result = MassiveDatabase::advancedQuery(
                            $slot,
                            $body['conditions'] ?? [],
                            (int) ($body['page'] ?? 1),
                            (int) ($body['pageSize'] ?? 50),
                            $body['sort'] ?? null,
                            $body['search'] ?? null,
                            $body['logic'] ?? 'AND'
                        );
                        echo json_encode(['success' => true, ...$result]);
                        exit;
                        
                    case 'aggregate':
                        $result = MassiveDatabase::aggregate(
                            $slot,
                            $body['field'] ?? 'id',
                            $body['function'] ?? 'count',
                            $body['conditions'] ?? []
                        );
                        echo json_encode(['success' => true, 'result' => $result]);
                        exit;
                        
                    case 'groupby':
                        $result = MassiveDatabase::groupBy(
                            $slot,
                            $body['field'] ?? '',
                            $body['conditions'] ?? [],
                            (int) ($body['limit'] ?? 100)
                        );
                        echo json_encode(['success' => true, 'groups' => $result]);
                        exit;
                        
                    case 'distinct':
                        $result = MassiveDatabase::distinct(
                            $slot,
                            $body['field'] ?? '',
                            (int) ($body['limit'] ?? 1000)
                        );
                        echo json_encode(['success' => true, 'values' => $result]);
                        exit;
                        
                    case 'bulkUpdate':
                        CSRFMiddleware::validateForSession();
                        AuthMiddleware::requirePermission('write');
                        
                        $count = MassiveDatabase::bulkUpdate(
                            $slot,
                            $body['updates'] ?? [],
                            $body['conditions'] ?? []
                        );
                        echo json_encode(['success' => true, 'updated' => $count]);
                        exit;
                }
            }
            
            // Standard create operation
            CSRFMiddleware::validateForSession();
            AuthMiddleware::requirePermission('write');
            
            $input = file_get_contents('php://input');
            $body = !empty($input) ? json_decode($input, true) : null;
            
            if (!$body || !is_array($body)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Invalid JSON body']);
                exit;
            }
            
            $slot = InputSanitizer::slotKey($body['slot'] ?? '');
            $data = $body['data'] ?? null;
            
            if (empty($slot)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Missing slot parameter']);
                exit;
            }
            
            if (!is_array($data)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Missing or invalid data']);
                exit;
            }
            
            // Check if slot is encrypted (from signed headers)
            $slotConfig = SlotConfigSigning::extractFromRequest($slot);
            $isEncrypted = $slotConfig['encrypted'] ?? false;
            $searchableFields = $slotConfig['searchableFields'] ?? [];
            
            // Ensure table exists
            MassiveDatabase::ensureTable($slot);
            
            // Bulk insert
            if (isset($body['bulk']) && is_array($body['bulk'])) {
                $count = MassiveDatabase::bulkInsert($slot, $body['bulk'], $isEncrypted, $searchableFields);
                
                // OPTIMIZED: Dispatch webhook using helper
                $currentUser = AuthMiddleware::getCurrentUser();
                dispatchMassiveWebhook('content.created', [
                    'id' => $slot,
                    'slot' => $slot,
                    'slot_type' => 'massive',
                    'count' => $count,
                    'operation' => 'bulk_insert',
                    'timestamp' => date('c'),
                    'author_id' => $currentUser->uuid ?? null,
                ], $slot);
                
                echo json_encode(['success' => true, 'inserted' => $count, 'message' => "{$count} records inserted"]);
                exit;
            }
            
            // Single insert
            $id = MassiveDatabase::insert($slot, $data, $isEncrypted, $searchableFields);
            
            // Dispatch webhook (optimized - early return if no active webhooks)
            $currentUser = AuthMiddleware::getCurrentUser();
            dispatchMassiveWebhook('content.created', [
                'id' => $id,
                'slot' => $slot,
                'slot_type' => 'massive',
                'timestamp' => date('c'),
                'author_id' => $currentUser->uuid ?? null,
                'title' => $data['title'] ?? null,
                'name' => $data['name'] ?? null,
                'email' => $data['email'] ?? null,
                'status' => $data['status'] ?? null,
                'content' => $data,
            ], $slot);
            
            echo json_encode([
                'success' => true,
                'id' => $id,
                'message' => 'Record created successfully'
            ]);
            break;
            
        // ═══════════════════════════════════════════════════════════════════════════
        // PUT - Update existing record
        // ═══════════════════════════════════════════════════════════════════════════
        case 'PUT':
            CSRFMiddleware::validateForSession();
            AuthMiddleware::requirePermission('write');
            
            $input = file_get_contents('php://input');
            $body = !empty($input) ? json_decode($input, true) : null;
            
            if (!$body || !is_array($body)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Invalid JSON body']);
                exit;
            }
            
            $slot = InputSanitizer::slotKey($body['slot'] ?? '');
            $id = (int) ($body['id'] ?? 0);
            $data = $body['data'] ?? null;
            
            if (empty($slot)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Missing slot parameter']);
                exit;
            }
            
            if ($id <= 0) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Missing or invalid id']);
                exit;
            }
            
            if (!is_array($data)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Missing or invalid data']);
                exit;
            }
            
            // Check if slot is encrypted (from signed headers)
            $slotConfig = SlotConfigSigning::extractFromRequest($slot);
            $isEncrypted = $slotConfig['encrypted'] ?? false;
            $searchableFields = $slotConfig['searchableFields'] ?? [];
            
            // Ensure table exists
            MassiveDatabase::ensureTable($slot);
            
            $success = MassiveDatabase::update($slot, $id, $data, $isEncrypted, $searchableFields);
            
            if (!$success) {
                http_response_code(404);
                echo json_encode(['success' => false, 'error' => 'Record not found or update failed']);
                exit;
            }
            
            // Dispatch webhook (optimized - early return if no active webhooks)
            $currentUser = AuthMiddleware::getCurrentUser();
            dispatchMassiveWebhook('content.updated', [
                'id' => $id,
                'slot' => $slot,
                'slot_type' => 'massive',
                'timestamp' => date('c'),
                'author_id' => $currentUser->uuid ?? null,
                'title' => $data['title'] ?? null,
                'name' => $data['name'] ?? null,
                'email' => $data['email'] ?? null,
                'status' => $data['status'] ?? null,
                'content' => $data,
            ], $slot);
            
            echo json_encode([
                'success' => true,
                'id' => $id,
                'message' => 'Record updated successfully'
            ]);
            break;
            
        // ═══════════════════════════════════════════════════════════════════════════
        // DELETE - Delete records
        // ═══════════════════════════════════════════════════════════════════════════
        case 'DELETE':
            CSRFMiddleware::validateForSession();
            AuthMiddleware::requirePermission('write');
            
            $slot = InputSanitizer::slotKey($_GET['slot'] ?? '');
            
            if (empty($slot)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Missing slot parameter']);
                exit;
            }
            
            // Ensure table exists
            MassiveDatabase::ensureTable($slot);
            
            // Bulk delete
            if (isset($_GET['ids'])) {
                $ids = array_map('intval', explode(',', $_GET['ids']));
                $ids = array_filter($ids, fn($id) => $id > 0);
                
                if (empty($ids)) {
                    http_response_code(400);
                    echo json_encode(['success' => false, 'error' => 'No valid ids provided']);
                    exit;
                }
                
                $deleted = MassiveDatabase::bulkDelete($slot, $ids);
                
                // Dispatch webhook (optimized - early return if no active webhooks)
                $currentUser = AuthMiddleware::getCurrentUser();
                dispatchMassiveWebhook('content.deleted', [
                    'slot' => $slot,
                    'slot_type' => 'massive',
                    'count' => $deleted,
                    'deleted_ids' => $ids,
                    'operation' => 'bulk_delete',
                    'timestamp' => date('c'),
                    'author_id' => $currentUser->uuid ?? null,
                ], $slot);
                
                echo json_encode([
                    'success' => true,
                    'deleted' => $deleted,
                    'message' => "{$deleted} records deleted"
                ]);
                exit;
            }
            
            // Single delete
            $id = (int) ($_GET['id'] ?? 0);
            
            if ($id <= 0) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Missing or invalid id']);
                exit;
            }
            
            $success = MassiveDatabase::delete($slot, $id);
            
            if (!$success) {
                http_response_code(404);
                echo json_encode(['success' => false, 'error' => 'Record not found or delete failed']);
                exit;
            }
            
            // Dispatch webhook (optimized - early return if no active webhooks)
            $currentUser = AuthMiddleware::getCurrentUser();
            dispatchMassiveWebhook('content.deleted', [
                'id' => $id,
                'slot' => $slot,
                'slot_type' => 'massive',
                'timestamp' => date('c'),
                'author_id' => $currentUser->uuid ?? null,
            ], $slot);
            
            echo json_encode([
                'success' => true,
                'id' => $id,
                'message' => 'Record deleted successfully'
            ]);
            break;
            
        default:
            http_response_code(405);
            echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    }
    
} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => ($_ENV['APP_DEBUG'] ?? 'false') === 'true' ? $e->getMessage() : 'Internal server error',
    ]);
}
