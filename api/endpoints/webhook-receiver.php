<?php
/**
 * Webhook Receiver Endpoint
 * 
 * Receives incoming webhooks from external services.
 * Validates HMAC signatures and routes to appropriate handlers.
 * 
 * OPTIMIZATION: Uses early response pattern + idempotency protection
 * - Returns 200 OK immediately after validation
 * - Processes webhook in background (after response sent)
 * - Prevents duplicate processing via idempotency keys
 * 
 * URL Format:
 *   POST /endpoints/webhook-receiver.php?endpoint=ENDPOINT_KEY
 * 
 * Required Headers:
 *   X-Nomad-Signature: t=TIMESTAMP,v1=SIGNATURE (preferred)
 *   - OR -
 *   X-Webhook-Signature: SIGNATURE
 *   X-Webhook-Timestamp: TIMESTAMP
 * 
 * Optional Headers:
 *   X-Idempotency-Key: UNIQUE_KEY (for deduplication)
 *   X-Webhook-ID: UNIQUE_ID (alternative idempotency key)
 * 
 * Example:
 *   curl -X POST https://your-cms.com/endpoints/webhook-receiver.php?endpoint=stripe-payments \
 *     -H "Content-Type: application/json" \
 *     -H "X-Nomad-Signature: t=1234567890,v1=abc123..." \
 *     -d '{"event":"payment.completed","data":{...}}'
 */

require_once __DIR__ . '/../bootstrap.php';

use NomadCMS\Middleware\WebhookMiddleware;

header('Content-Type: application/json');

// Only allow POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

// Get endpoint key from URL
$endpointKey = $_GET['endpoint'] ?? null;

if (!$endpointKey) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Missing endpoint parameter']);
    exit;
}

// Validate endpoint key format
if (!preg_match('/^[a-z0-9-]{3,64}$/', $endpointKey)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid endpoint key format']);
    exit;
}

try {
    // Validate incoming webhook WITH idempotency check
    $validation = WebhookMiddleware::validateWithIdempotency($endpointKey);
    
    if (!$validation['valid']) {
        http_response_code(401);
        echo json_encode([
            'success' => false,
            'error' => $validation['error']
        ]);
        exit;
    }
    
    // Check for duplicate (idempotency protection)
    if ($validation['isDuplicate'] ?? false) {
        // Return 200 OK for duplicates - already processed
        http_response_code(200);
        echo json_encode([
            'success' => true,
            'message' => 'Webhook already processed (duplicate)',
            'idempotency_key' => $validation['idempotencyKey']
        ]);
        exit;
    }
    
    $payload = $validation['payload'];
    $endpoint = $validation['endpoint'];
    $idempotencyKey = $validation['idempotencyKey'];
    
    // Log incoming webhook (for debugging)
    $clientIp = WebhookMiddleware::getClientIp();
    error_log(sprintf(
        "[Webhook] Received: endpoint=%s, handler=%s, ip=%s, idempotency=%s",
        $endpointKey,
        $endpoint['handler'],
        $clientIp,
        substr($idempotencyKey, 0, 16) . '...'
    ));
    
    // =========================================================================
    // EARLY RESPONSE PATTERN
    // Return 200 OK immediately, process webhook in background
    // This prevents timeout issues with slow handlers
    // =========================================================================
    
    http_response_code(200);
    echo json_encode([
        'success' => true,
        'message' => 'Webhook accepted for processing',
        'idempotency_key' => $idempotencyKey
    ]);
    
    // Flush output to client immediately
    if (function_exists('fastcgi_finish_request')) {
        fastcgi_finish_request();
    } else {
        // Fallback for non-FPM environments
        if (ob_get_level() > 0) {
            ob_end_flush();
        }
        flush();
    }
    
    // =========================================================================
    // BACKGROUND PROCESSING (after response sent)
    // =========================================================================
    
    // Route to appropriate handler
    $result = handleWebhook($endpoint['handler'], $payload, $endpoint);
    
    // =========================================================================
    // WEBHOOK ACTION SYSTEM INTEGRATION
    // Execute configured actions for this endpoint
    // =========================================================================
    try {
        $actionService = new \NomadCMS\Webhooks\WebhookActionService();
        
        // Execute actions for this endpoint (by endpoint_id or endpoint_key)
        $headers = getallheaders() ?: [];
        $actionResults = $actionService->executeWebhookActions(
            (string)($endpoint['id'] ?? $endpointKey),
            $payload,
            $headers
        );
        
        // Log action results
        if (!empty($actionResults['actions_executed'])) {
            error_log(sprintf(
                "[Webhook] Actions executed: %d, success: %d",
                count($actionResults['actions_executed']),
                count(array_filter($actionResults['actions_executed'], fn($a) => $a['success'] ?? false))
            ));
        }
    } catch (\Exception $e) {
        error_log(sprintf("[Webhook] Action execution error: %s", $e->getMessage()));
    }
    
    // Record as processed (idempotency)
    $eventType = $payload['event'] ?? $payload['type'] ?? 'unknown';
    WebhookMiddleware::recordProcessedEvent($idempotencyKey, $eventType);
    
    // Log successful processing
    error_log(sprintf(
        "[Webhook] Processed: endpoint=%s, handler=%s, result=%s",
        $endpointKey,
        $endpoint['handler'],
        json_encode($result)
    ));

} catch (\Exception $e) {
    // Log error
    error_log(sprintf(
        "[Webhook] Error processing %s: %s",
        $endpointKey,
        $e->getMessage()
    ));
    
    // Only return error if we haven't sent response yet
    if (!headers_sent()) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Internal server error'
        ]);
    }
}

/**
 * Route webhook to appropriate handler
 * 
 * @param string $handler Handler identifier
 * @param array $payload Webhook payload
 * @param array $endpoint Endpoint configuration
 * @return array Handler result
 */
function handleWebhook(string $handler, array $payload, array $endpoint): array
{
    // Built-in handlers
    switch ($handler) {
        case 'default':
            return handleDefaultWebhook($payload, $endpoint);
            
        case 'content':
            // Content handler for CMS CRUD operations
            $contentHandler = new \NomadCMS\Webhooks\Handlers\ContentHandler();
            return $contentHandler->handle($payload, $endpoint);
            
        case 'stripe':
            return handleStripeWebhook($payload, $endpoint);
            
        case 'github':
            return handleGithubWebhook($payload, $endpoint);
            
        case 'zapier':
            return handleZapierWebhook($payload, $endpoint);
            
        case 'custom':
            return handleCustomWebhook($payload, $endpoint);
            
        default:
            // Try to load custom handler class
            $handlerClass = "\\NomadCMS\\Webhooks\\Handlers\\" . ucfirst($handler) . "Handler";
            if (class_exists($handlerClass)) {
                $instance = new $handlerClass();
                return $instance->handle($payload, $endpoint);
            }
            
            // Fall back to default
            return handleDefaultWebhook($payload, $endpoint);
    }
}

/**
 * Default webhook handler - just logs the payload
 */
function handleDefaultWebhook(array $payload, array $endpoint): array
{
    // Log payload for debugging
    error_log(sprintf(
        "[Webhook][Default] Endpoint: %s, Payload: %s",
        $endpoint['name'],
        json_encode($payload)
    ));
    
    return [
        'handler' => 'default',
        'received' => true
    ];
}

/**
 * Stripe webhook handler
 * Processes Stripe events (payments, subscriptions, etc.)
 */
function handleStripeWebhook(array $payload, array $endpoint): array
{
    $eventType = $payload['type'] ?? 'unknown';
    $data = $payload['data']['object'] ?? [];
    
    error_log(sprintf(
        "[Webhook][Stripe] Event: %s",
        $eventType
    ));
    
    // Handle specific Stripe events
    switch ($eventType) {
        case 'payment_intent.succeeded':
            // Handle successful payment
            break;
            
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted':
            // Handle subscription changes
            break;
            
        case 'invoice.paid':
        case 'invoice.payment_failed':
            // Handle invoice events
            break;
    }
    
    return [
        'handler' => 'stripe',
        'event' => $eventType,
        'processed' => true
    ];
}

/**
 * GitHub webhook handler
 * Processes GitHub events (push, pull request, etc.)
 */
function handleGithubWebhook(array $payload, array $endpoint): array
{
    // GitHub sends event type in X-GitHub-Event header
    $eventType = $_SERVER['HTTP_X_GITHUB_EVENT'] ?? 'unknown';
    
    error_log(sprintf(
        "[Webhook][GitHub] Event: %s, Repo: %s",
        $eventType,
        $payload['repository']['full_name'] ?? 'unknown'
    ));
    
    // Handle specific GitHub events
    switch ($eventType) {
        case 'push':
            // Handle push events
            break;
            
        case 'pull_request':
            // Handle PR events
            break;
            
        case 'release':
            // Handle release events
            break;
    }
    
    return [
        'handler' => 'github',
        'event' => $eventType,
        'processed' => true
    ];
}

/**
 * Zapier webhook handler
 */
function handleZapierWebhook(array $payload, array $endpoint): array
{
    error_log(sprintf(
        "[Webhook][Zapier] Received: %s",
        json_encode($payload)
    ));
    
    return [
        'handler' => 'zapier',
        'received' => true
    ];
}

/**
 * Custom webhook handler - can be extended
 */
function handleCustomWebhook(array $payload, array $endpoint): array
{
    // Custom logic can be implemented here
    // Or handlers can be registered dynamically
    
    error_log(sprintf(
        "[Webhook][Custom] Endpoint: %s, Payload: %s",
        $endpoint['name'],
        json_encode($payload)
    ));
    
    return [
        'handler' => 'custom',
        'received' => true
    ];
}
