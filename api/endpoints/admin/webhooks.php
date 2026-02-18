<?php
/**
 * Admin API - Webhooks Management
 * 
 * RESTful webhook management for outgoing and incoming webhooks.
 * Requires admin authentication.
 * 
 * Endpoints:
 *   GET    /admin/webhooks.php              - List all webhooks
 *   POST   /admin/webhooks.php              - Create webhook
 *   GET    /admin/webhooks.php?id=X         - Get webhook details
 *   PUT    /admin/webhooks.php              - Update webhook
 *   DELETE /admin/webhooks.php?id=X         - Delete webhook
 *   POST   /admin/webhooks.php?action=test  - Send test webhook
 *   POST   /admin/webhooks.php?action=rotate-secret - Rotate secret
 *   GET    /admin/webhooks.php?action=deliveries&id=X - Get delivery log
 *   GET    /admin/webhooks.php?action=events - Get available events
 *   
 *   Incoming Endpoints:
 *   GET    /admin/webhooks.php?type=endpoints           - List endpoints
 *   POST   /admin/webhooks.php?type=endpoints           - Create endpoint
 *   PUT    /admin/webhooks.php?type=endpoints           - Update endpoint
 *   DELETE /admin/webhooks.php?type=endpoints&id=X     - Delete endpoint
 */

require_once __DIR__ . '/../../bootstrap.php';

use NomadCMS\Middleware\AuthMiddleware;
use NomadCMS\Middleware\CSRFMiddleware;
use NomadCMS\Security\WebhookService;
use NomadCMS\Security\InputSanitizer;

header('Content-Type: application/json');

try {
    // 1. Authenticate and check Admin role
    $user = AuthMiddleware::requireAuth();
    
    if (empty($user->is_admin)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Unauthorized: Admin access required']);
        exit;
    }

    $method = $_SERVER['REQUEST_METHOD'];
    $webhookService = new WebhookService();
    
    // Determine request type (webhooks or endpoints)
    $type = $_GET['type'] ?? 'webhooks';
    $action = $_GET['action'] ?? null;
    $id = isset($_GET['id']) ? (int)$_GET['id'] : null;

    // =========================================================================
    // OUTGOING WEBHOOKS
    // =========================================================================
    if ($type === 'webhooks') {
        
        // GET: List or Get Single
        if ($method === 'GET') {
            
            // Get available events
            if ($action === 'events') {
                echo json_encode([
                    'success' => true,
                    'events' => $webhookService->getAvailableEvents(),
                    'payload_fields' => $webhookService->getAvailablePayloadFields()
                ]);
                exit;
            }
            
            // Get delivery history
            if ($action === 'deliveries' && $id) {
                $webhook = $webhookService->getWebhook($id);
                if (!$webhook || $webhook['user_id'] !== $user->id) {
                    http_response_code(404);
                    echo json_encode(['success' => false, 'error' => 'Webhook not found']);
                    exit;
                }
                
                $limit = min((int)($_GET['limit'] ?? 50), 100);
                $deliveries = $webhookService->getDeliveries($id, $limit);
                
                echo json_encode([
                    'success' => true,
                    'deliveries' => $deliveries
                ]);
                exit;
            }
            
            // Get single webhook
            if ($id) {
                $webhook = $webhookService->getWebhook($id);
                if (!$webhook || $webhook['user_id'] !== $user->id) {
                    http_response_code(404);
                    echo json_encode(['success' => false, 'error' => 'Webhook not found']);
                    exit;
                }
                
                echo json_encode(['success' => true, 'webhook' => $webhook]);
                exit;
            }
            
            // List all webhooks
            $webhooks = $webhookService->getWebhooksForUser($user->id);
            echo json_encode(['success' => true, 'webhooks' => $webhooks]);
            exit;
        }
        
        // POST: Create or Action
        if ($method === 'POST') {
            CSRFMiddleware::validateForSession();
            
            // Test webhook
            if ($action === 'test' && $id) {
                $webhook = $webhookService->getWebhook($id);
                if (!$webhook || $webhook['user_id'] !== $user->id) {
                    http_response_code(404);
                    echo json_encode(['success' => false, 'error' => 'Webhook not found']);
                    exit;
                }
                
                $result = $webhookService->sendTestWebhook($id);
                echo json_encode([
                    'success' => $result->success,
                    'delivery' => $result->toArray()
                ]);
                exit;
            }
            
            // Rotate secret
            if ($action === 'rotate-secret' && $id) {
                $webhook = $webhookService->getWebhook($id);
                if (!$webhook || $webhook['user_id'] !== $user->id) {
                    http_response_code(404);
                    echo json_encode(['success' => false, 'error' => 'Webhook not found']);
                    exit;
                }
                
                $newSecret = $webhookService->rotateSecret($id);
                echo json_encode([
                    'success' => true,
                    'message' => 'Secret rotated successfully',
                    'secret' => $newSecret // Only shown once!
                ]);
                exit;
            }
            
            // Retry delivery
            if ($action === 'retry' && $id) {
                $result = $webhookService->retryDelivery($id);
                echo json_encode([
                    'success' => $result->success,
                    'delivery' => $result->toArray()
                ]);
                exit;
            }
            
            // Create webhook
            $data = json_decode(file_get_contents('php://input'), true);
            if (!$data) {
                throw new \Exception('Invalid JSON body');
            }
            
            $name = trim($data['name'] ?? '');
            $url = trim($data['url'] ?? '');
            $events = $data['events'] ?? [];
            $payloadFields = $data['payload_fields'] ?? null;
            $slotFilters = $data['slot_filters'] ?? null;
            $slotTypeFilters = $data['slot_type_filters'] ?? null;
            $retryCount = (int)($data['retry_count'] ?? 3);
            $timeoutSeconds = (int)($data['timeout_seconds'] ?? 30);
            
            if (empty($name)) {
                throw new \Exception('Name is required');
            }
            if (empty($url)) {
                throw new \Exception('URL is required');
            }
            if (empty($events) || !is_array($events)) {
                throw new \Exception('At least one event is required');
            }
            
            $webhook = $webhookService->createWebhook(
                $user->id,
                $name,
                $url,
                $events,
                $payloadFields,
                $slotFilters,
                $slotTypeFilters,
                $retryCount,
                $timeoutSeconds
            );
            
            echo json_encode([
                'success' => true,
                'message' => 'Webhook created successfully',
                'webhook' => $webhook
            ]);
            exit;
        }
        
        // PUT: Update
        if ($method === 'PUT') {
            CSRFMiddleware::validateForSession();
            
            $data = json_decode(file_get_contents('php://input'), true);
            if (!$data || !isset($data['id'])) {
                throw new \Exception('Invalid JSON body or missing ID');
            }
            
            $webhookId = (int)$data['id'];
            $webhook = $webhookService->getWebhook($webhookId);
            
            if (!$webhook || $webhook['user_id'] !== $user->id) {
                http_response_code(404);
                echo json_encode(['success' => false, 'error' => 'Webhook not found']);
                exit;
            }
            
            $updateData = [];
            if (isset($data['name'])) $updateData['name'] = trim($data['name']);
            if (isset($data['url'])) $updateData['url'] = trim($data['url']);
            if (isset($data['events'])) $updateData['events'] = $data['events'];
            if (array_key_exists('payload_fields', $data)) $updateData['payload_fields'] = $data['payload_fields'];
            if (array_key_exists('slot_filters', $data)) $updateData['slot_filters'] = $data['slot_filters'];
            if (array_key_exists('slot_type_filters', $data)) $updateData['slot_type_filters'] = $data['slot_type_filters'];
            if (isset($data['is_active'])) $updateData['is_active'] = (bool)$data['is_active'];
            if (isset($data['retry_count'])) $updateData['retry_count'] = (int)$data['retry_count'];
            if (isset($data['timeout_seconds'])) $updateData['timeout_seconds'] = (int)$data['timeout_seconds'];
            
            $webhookService->updateWebhook($webhookId, $updateData);
            
            echo json_encode([
                'success' => true,
                'message' => 'Webhook updated successfully'
            ]);
            exit;
        }
        
        // DELETE: Remove
        if ($method === 'DELETE') {
            if (!$id) {
                throw new \Exception('Webhook ID is required');
            }
            
            $webhook = $webhookService->getWebhook($id);
            if (!$webhook || $webhook['user_id'] !== $user->id) {
                http_response_code(404);
                echo json_encode(['success' => false, 'error' => 'Webhook not found']);
                exit;
            }
            
            $webhookService->deleteWebhook($id);
            
            echo json_encode([
                'success' => true,
                'message' => 'Webhook deleted successfully'
            ]);
            exit;
        }
    }
    
    // =========================================================================
    // INCOMING WEBHOOK ENDPOINTS
    // =========================================================================
    if ($type === 'endpoints') {
        
        // GET: List or Get Single
        if ($method === 'GET') {
            if ($id) {
                $endpoints = $webhookService->getEndpointsForUser($user->id);
                $endpoint = array_filter($endpoints, fn($e) => $e['id'] === $id);
                $endpoint = reset($endpoint);
                
                if (!$endpoint) {
                    http_response_code(404);
                    echo json_encode(['success' => false, 'error' => 'Endpoint not found']);
                    exit;
                }
                
                echo json_encode(['success' => true, 'endpoint' => $endpoint]);
                exit;
            }
            
            $endpoints = $webhookService->getEndpointsForUser($user->id);
            echo json_encode(['success' => true, 'endpoints' => $endpoints]);
            exit;
        }
        
        // POST: Create
        if ($method === 'POST') {
            CSRFMiddleware::validateForSession();
            
            // Rotate secret
            if ($action === 'rotate-secret' && $id) {
                $endpoints = $webhookService->getEndpointsForUser($user->id);
                $endpoint = array_filter($endpoints, fn($e) => $e['id'] === $id);
                
                if (empty($endpoint)) {
                    http_response_code(404);
                    echo json_encode(['success' => false, 'error' => 'Endpoint not found']);
                    exit;
                }
                
                $newSecret = $webhookService->rotateEndpointSecret($id);
                echo json_encode([
                    'success' => true,
                    'message' => 'Secret rotated successfully',
                    'secret' => $newSecret
                ]);
                exit;
            }
            
            $data = json_decode(file_get_contents('php://input'), true);
            if (!$data) {
                throw new \Exception('Invalid JSON body');
            }
            
            $name = trim($data['name'] ?? '');
            $endpointKey = trim($data['endpoint_key'] ?? '');
            $handler = trim($data['handler'] ?? 'default');
            $signatureHeader = trim($data['signature_header'] ?? 'X-Webhook-Signature');
            $timestampHeader = trim($data['timestamp_header'] ?? '');
            $signatureFormat = trim($data['signature_format'] ?? 'auto');
            
            if (empty($name)) {
                throw new \Exception('Name is required');
            }
            if (empty($endpointKey)) {
                throw new \Exception('Endpoint key is required');
            }
            
            $endpoint = $webhookService->createEndpoint(
                $user->id,
                $name,
                $endpointKey,
                $handler,
                $signatureHeader,
                $timestampHeader,
                $signatureFormat
            );
            
            echo json_encode([
                'success' => true,
                'message' => 'Endpoint created successfully',
                'endpoint' => $endpoint
            ]);
            exit;
        }
        
        // PUT: Update
        if ($method === 'PUT') {
            CSRFMiddleware::validateForSession();
            
            $data = json_decode(file_get_contents('php://input'), true);
            if (!$data || !isset($data['id'])) {
                throw new \Exception('Invalid JSON body or missing ID');
            }
            
            $endpointId = (int)$data['id'];
            $endpoints = $webhookService->getEndpointsForUser($user->id);
            $endpoint = array_filter($endpoints, fn($e) => $e['id'] === $endpointId);
            
            if (empty($endpoint)) {
                http_response_code(404);
                echo json_encode(['success' => false, 'error' => 'Endpoint not found']);
                exit;
            }
            
            $updateData = [];
            if (isset($data['name'])) $updateData['name'] = trim($data['name']);
            if (isset($data['handler'])) $updateData['handler'] = trim($data['handler']);
            if (isset($data['is_active'])) $updateData['is_active'] = (bool)$data['is_active'];
            if (isset($data['signature_header'])) $updateData['signature_header'] = trim($data['signature_header']);
            if (isset($data['timestamp_header'])) $updateData['timestamp_header'] = trim($data['timestamp_header']);
            if (isset($data['signature_format'])) $updateData['signature_format'] = trim($data['signature_format']);
            
            $webhookService->updateEndpoint($endpointId, $updateData);
            
            echo json_encode([
                'success' => true,
                'message' => 'Endpoint updated successfully'
            ]);
            exit;
        }
        
        // DELETE: Remove
        if ($method === 'DELETE') {
            if (!$id) {
                throw new \Exception('Endpoint ID is required');
            }
            
            $endpoints = $webhookService->getEndpointsForUser($user->id);
            $endpoint = array_filter($endpoints, fn($e) => $e['id'] === $id);
            
            if (empty($endpoint)) {
                http_response_code(404);
                echo json_encode(['success' => false, 'error' => 'Endpoint not found']);
                exit;
            }
            
            $webhookService->deleteEndpoint($id);
            
            echo json_encode([
                'success' => true,
                'message' => 'Endpoint deleted successfully'
            ]);
            exit;
        }
    }
    
    // Method not allowed
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);

} catch (\Exception $e) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
