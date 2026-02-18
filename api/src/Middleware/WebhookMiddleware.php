<?php
/**
 * NOMAD CMS - Webhook Middleware
 * 
 * Validates incoming webhook requests using HMAC signatures.
 * Provides replay attack protection via timestamp validation.
 * Provides idempotency protection via processed events tracking.
 * 
 * Usage:
 *   $result = WebhookMiddleware::validateIncoming($endpointKey);
 *   if (!$result['valid']) {
 *       http_response_code(401);
 *       exit(json_encode(['error' => $result['error']]));
 *   }
 *   $payload = $result['payload'];
 * 
 * Expected Headers:
 *   X-Nomad-Signature: t=TIMESTAMP,v1=SIGNATURE (preferred)
 *   - OR -
 *   X-Webhook-Signature: SIGNATURE
 *   X-Webhook-Timestamp: TIMESTAMP
 *   X-Idempotency-Key: UNIQUE_KEY (optional, for deduplication)
 */

declare(strict_types=1);

namespace NomadCMS\Middleware;

use NomadCMS\Security\WebhookService;
use NomadCMS\Security\EncryptionService;
use NomadCMS\Database\AuthDatabase;

final class WebhookMiddleware
{
    // Signature tolerance window (seconds)
    private static int $tolerance = 300; // 5 minutes
    
    // Rate limiting configuration
    // Very generous defaults - can handle high-volume integrations like Stripe bulk events
    private const RATE_LIMIT_WINDOW = 60; // 1 minute window
    private const RATE_LIMIT_MAX_REQUESTS = 500; // Max 500 requests per minute per endpoint (generous!)
    
    // JSON decode depth - generous to support complex payloads from Stripe, Shopify, etc.
    // Stripe events can be 10-15 levels deep, Shopify even deeper
    private const JSON_MAX_DEPTH = 64; // Very generous - supports any realistic payload

    /**
     * Validate incoming webhook request
     * 
     * Checks:
     * 1. Endpoint exists and is active
     * 2. Rate limit check
     * 3. HMAC signature is valid
     * 4. Timestamp is within tolerance (replay protection)
     * 
     * @param string $endpointKey The endpoint identifier from URL
     * @return array{valid: bool, error?: string, payload?: array, endpoint?: array}
     */
    public static function validateIncoming(string $endpointKey): array
    {
        // Load tolerance from env if set
        self::$tolerance = (int)($_ENV['WEBHOOK_SIGNATURE_TOLERANCE'] ?? 300);

        // Check if incoming webhooks are enabled
        $incomingEnabled = filter_var($_ENV['WEBHOOKS_INCOMING_ENABLED'] ?? true, FILTER_VALIDATE_BOOLEAN);
        if (!$incomingEnabled) {
            return ['valid' => false, 'error' => 'Incoming webhooks are disabled'];
        }

        // 1. Get endpoint configuration
        $webhookService = new WebhookService();
        $endpoint = $webhookService->getEndpointByKey($endpointKey);

        if (!$endpoint) {
            return ['valid' => false, 'error' => 'Unknown endpoint'];
        }

        if (!$endpoint['is_active']) {
            return ['valid' => false, 'error' => 'Endpoint is inactive'];
        }
        
        // RATE LIMITING: Check request rate before expensive operations
        $rateLimitResult = self::checkRateLimit($endpointKey);
        if (!$rateLimitResult['allowed']) {
            error_log("[WEBHOOK RATE LIMIT] Endpoint {$endpointKey} exceeded rate limit: {$rateLimitResult['current']}/{$rateLimitResult['max']} requests");
            return [
                'valid' => false, 
                'error' => 'Rate limit exceeded. Try again later.',
                'retry_after' => $rateLimitResult['retry_after'] ?? 60
            ];
        }

        // 2. Get request body
        $rawPayload = file_get_contents('php://input');
        if (empty($rawPayload)) {
            return ['valid' => false, 'error' => 'Empty request body'];
        }
        
        // SECURITY: Validate incoming payload size to prevent DoS attacks
        $payloadSize = strlen($rawPayload);
        if ($payloadSize > WebhookService::MAX_INCOMING_PAYLOAD_SIZE) {
            error_log("[WEBHOOK] Incoming payload too large ({$payloadSize} bytes > " . WebhookService::MAX_INCOMING_PAYLOAD_SIZE . " bytes) for endpoint {$endpointKey}");
            return ['valid' => false, 'error' => 'Payload too large'];
        }

        // 3. Extract signature and timestamp using endpoint-specific configuration
        $signatureData = self::extractSignatureFromHeaders(
            $endpoint['signature_header'] ?? 'X-Webhook-Signature',
            $endpoint['timestamp_header'] ?? null
        );

        if (!$signatureData['signature']) {
            return ['valid' => false, 'error' => 'Missing signature header: ' . ($endpoint['signature_header'] ?? 'X-Webhook-Signature')];
        }

        // Dynamic timestamp validation:
        // - If timestamp is provided: validate it
        // - If signature format includes no timestamp (simple HMAC): skip timestamp validation
        $hasTimestamp = $signatureData['timestamp'] !== null;
        
        if ($hasTimestamp && !self::isTimestampValid($signatureData['timestamp'])) {
            return ['valid' => false, 'error' => 'Request timestamp too old or too far in future'];
        }

        // 4. Decrypt endpoint secret
        $secret = EncryptionService::decrypt($endpoint['secret']);
        
        // Allow any secret format for flexibility with external providers
        // Only reject if secret is completely empty or too short
        if (empty($secret) || strlen($secret) < 8) {
            error_log("[WEBHOOK] Secret too short or empty for endpoint: {$endpointKey}");
            return ['valid' => false, 'error' => 'Invalid endpoint configuration'];
        }

        // 5. Verify HMAC signature using endpoint-specific format
        $signatureFormat = $endpoint['signature_format'] ?? 'auto';
        $webhookService = new WebhookService();
        $isValid = $webhookService->verifySignatureWithFormat(
            $rawPayload,
            $signatureData['signature'],
            $secret,
            $signatureData['timestamp'],
            $signatureFormat
        );

        if (!$isValid) {
            return ['valid' => false, 'error' => 'Invalid signature'];
        }

        // 7. Parse JSON payload with generous depth limit
        // Note: PHP 7.3+ default is 512, but we explicitly set 64 for safety
        // This is generous enough for any real-world webhook (Stripe, Shopify, etc.)
        $payload = json_decode($rawPayload, true, self::JSON_MAX_DEPTH);
        if (json_last_error() !== JSON_ERROR_NONE) {
            $jsonError = json_last_error_msg();
            error_log("[WEBHOOK] JSON parse error for endpoint {$endpointKey}: {$jsonError}");
            return ['valid' => false, 'error' => 'Invalid JSON payload: ' . $jsonError];
        }

        // 8. Update last_called_at timestamp
        $webhookService->touchEndpoint($endpoint['id']);

        return [
            'valid' => true,
            'payload' => $payload,
            'endpoint' => [
                'id' => $endpoint['id'],
                'name' => $endpoint['name'],
                'handler' => $endpoint['handler'],
            ],
        ];
    }

    /**
     * Extract signature and timestamp from HTTP headers
     * 
     * Uses endpoint-specific header configuration for maximum flexibility.
     * 
     * @param string $signatureHeader The header name configured for this endpoint
     * @param string|null $timestampHeader The timestamp header name (null if embedded in signature or not used)
     * @return array{signature: ?string, timestamp: ?int, format: string}
     */
    private static function extractSignatureFromHeaders(
        string $signatureHeader = 'X-Webhook-Signature',
        ?string $timestampHeader = null
    ): array {
        $result = ['signature' => null, 'timestamp' => null, 'format' => 'unknown'];

        // Convert header name to PHP server variable format
        // X-Webhook-Signature -> HTTP_X_WEBHOOK_SIGNATURE
        $phpHeaderName = 'HTTP_' . strtoupper(str_replace('-', '_', $signatureHeader));
        
        // Get signature from configured header
        $rawSignature = $_SERVER[$phpHeaderName] ?? null;
        
        // If not found with configured header, try common fallbacks
        if (!$rawSignature) {
            $fallbackHeaders = [
                'HTTP_X_NOMAD_SIGNATURE',
                'HTTP_X_HUB_SIGNATURE_256',
                'HTTP_X_HUB_SIGNATURE',
                'HTTP_STRIPE_SIGNATURE',
                'HTTP_X_WEBHOOK_SIGNATURE',
                'HTTP_X_SIGNATURE',
            ];
            
            foreach ($fallbackHeaders as $header) {
                if (isset($_SERVER[$header]) && !empty($_SERVER[$header])) {
                    $rawSignature = $_SERVER[$header];
                    break;
                }
            }
        }

        if (!$rawSignature) {
            return $result;
        }

        // Get timestamp from dedicated header if configured
        if ($timestampHeader) {
            $phpTimestampHeader = 'HTTP_' . strtoupper(str_replace('-', '_', $timestampHeader));
            if (isset($_SERVER[$phpTimestampHeader]) && !empty($_SERVER[$phpTimestampHeader])) {
                $result['timestamp'] = (int)$_SERVER[$phpTimestampHeader];
            }
        }
        
        // If no dedicated timestamp header, try common ones
        if ($result['timestamp'] === null) {
            $timestampHeaders = [
                'HTTP_X_WEBHOOK_TIMESTAMP',
                'HTTP_X_TIMESTAMP',
                'HTTP_X_HOOK_TIMESTAMP',
            ];
            
            foreach ($timestampHeaders as $tsHeader) {
                if (isset($_SERVER[$tsHeader]) && !empty($_SERVER[$tsHeader])) {
                    $result['timestamp'] = (int)$_SERVER[$tsHeader];
                    break;
                }
            }
        }

        // Parse signature based on format
        $result = self::parseSignatureValue($rawSignature, $result);
        
        return $result;
    }

    /**
     * Parse signature value - auto-detect format
     * 
     * Handles:
     * - t=TIMESTAMP,v1=SIGNATURE (Stripe/Nomad timestamped)
     * - sha256=SIGNATURE (GitHub style)
     * - sha1=SIGNATURE (Legacy GitHub)
     * - Raw hex signature
     * 
     * @param string $rawSignature Raw signature header value
     * @param array $result Current result array
     * @return array Updated result array
     */
    private static function parseSignatureValue(string $rawSignature, array $result): array
    {
        $rawSignature = trim($rawSignature);
        
        // Format 1: Timestamped format (t=TIMESTAMP,v1=SIGNATURE or similar)
        if (preg_match('/t=(\d+)/', $rawSignature, $tsMatch)) {
            $result['timestamp'] = (int)$tsMatch[1];
            
            // Extract signature from v1=, v2=, etc.
            if (preg_match('/v\d+=([a-f0-9]+)/i', $rawSignature, $sigMatch)) {
                $result['signature'] = $sigMatch[1];
                $result['format'] = 'timestamped';
                return $result;
            }
        }
        
        // Format 2: Algorithm-prefixed (sha256=SIGNATURE, sha1=SIGNATURE)
        if (preg_match('/^(sha256|sha1|sha512)=([a-f0-9]+)$/i', $rawSignature, $matches)) {
            $result['signature'] = $matches[2];
            $result['format'] = strtolower($matches[1]);  // 'sha256', 'sha1', 'sha512'
            return $result;
        }
        
        // Format 3: Raw hex signature (32, 64, or 128 chars for MD5, SHA256, SHA512)
        if (preg_match('/^[a-f0-9]{32,128}$/i', $rawSignature)) {
            $result['signature'] = $rawSignature;
            $result['format'] = 'raw';
            return $result;
        }
        
        // Format 4: Base64 encoded signature (some APIs use this)
        if (preg_match('/^[A-Za-z0-9+\/=]+$/', $rawSignature) && strlen($rawSignature) >= 20) {
            // Decode and convert to hex if it looks like Base64
            $decoded = base64_decode($rawSignature, true);
            if ($decoded !== false && strlen($decoded) >= 16) {
                $result['signature'] = bin2hex($decoded);
                $result['format'] = 'base64';
                return $result;
            }
        }
        
        // Fallback: use as-is
        $result['signature'] = $rawSignature;
        $result['format'] = 'unknown';
        return $result;
    }

    /**
     * Check if timestamp is within acceptable tolerance window
     * 
     * @param int $timestamp Unix timestamp from request
     * @return bool True if timestamp is valid
     */
    private static function isTimestampValid(int $timestamp): bool
    {
        $currentTime = time();
        $diff = abs($currentTime - $timestamp);
        return $diff <= self::$tolerance;
    }

    /**
     * Generate signature for testing/debugging
     * 
     * @param string $payload JSON payload
     * @param string $secret Webhook secret
     * @param int|null $timestamp Unix timestamp (uses current time if null)
     * @return array{signature: string, timestamp: int, headers: array}
     */
    public static function generateTestSignature(string $payload, string $secret, ?int $timestamp = null): array
    {
        $webhookService = new WebhookService();
        $signatureData = $webhookService->generateSignatureHeader($payload, $secret, $timestamp);

        return [
            'signature' => $signatureData['signature'],
            'timestamp' => $signatureData['timestamp'],
            'headers' => [
                'X-Nomad-Signature' => $signatureData['header'],
                'X-Webhook-Signature' => $signatureData['signature'],
                'X-Webhook-Timestamp' => (string)$signatureData['timestamp'],
                'Content-Type' => 'application/json',
            ],
        ];
    }

    /**
     * Quick validation without loading endpoint (for rate limiting checks)
     * Only validates that required headers are present
     * 
     * @return bool True if request has required webhook headers
     */
    public static function hasWebhookHeaders(): bool
    {
        return isset($_SERVER['HTTP_X_NOMAD_SIGNATURE']) ||
               (isset($_SERVER['HTTP_X_WEBHOOK_SIGNATURE']) && isset($_SERVER['HTTP_X_WEBHOOK_TIMESTAMP']));
    }

    /**
     * Get client IP for logging
     * 
     * @return string Client IP address
     */
    public static function getClientIp(): string
    {
        // Check for forwarded IP (if behind proxy)
        $trustedProxies = array_filter(explode(',', $_ENV['TRUSTED_PROXIES'] ?? ''));
        $remoteAddr = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';

        if (!empty($trustedProxies)) {
            // Check if request is from trusted proxy
            foreach ($trustedProxies as $proxy) {
                $proxy = trim($proxy);
                if (self::ipInRange($remoteAddr, $proxy)) {
                    // Get forwarded IP
                    if (isset($_SERVER['HTTP_X_FORWARDED_FOR'])) {
                        $ips = array_map('trim', explode(',', $_SERVER['HTTP_X_FORWARDED_FOR']));
                        return $ips[0];
                    }
                    if (isset($_SERVER['HTTP_X_REAL_IP'])) {
                        return $_SERVER['HTTP_X_REAL_IP'];
                    }
                    break;
                }
            }
        }

        return $remoteAddr;
    }

    /**
     * Check if IP is in CIDR range
     */
    private static function ipInRange(string $ip, string $range): bool
    {
        if (strpos($range, '/') === false) {
            return $ip === $range;
        }

        [$subnet, $bits] = explode('/', $range);
        $subnet = ip2long($subnet);
        $ip = ip2long($ip);
        $mask = -1 << (32 - (int)$bits);

        return ($ip & $mask) === ($subnet & $mask);
    }

    // =========================================================================
    // IDEMPOTENCY PROTECTION
    // =========================================================================

    /**
     * Check if an event has already been processed (idempotency check)
     * 
     * Uses idempotency key from header or generates from payload hash.
     * Returns early if duplicate detected to prevent double-processing.
     * 
     * @param array $payload The webhook payload
     * @return array{isDuplicate: bool, idempotencyKey: string}
     */
    public static function checkIdempotency(array $payload): array
    {
        // Get idempotency key from header or generate from payload
        $idempotencyKey = $_SERVER['HTTP_X_IDEMPOTENCY_KEY'] 
            ?? $_SERVER['HTTP_X_WEBHOOK_ID'] 
            ?? null;
        
        if (!$idempotencyKey) {
            // Generate from payload hash (event type + event ID + timestamp)
            $eventType = $payload['event'] ?? $payload['type'] ?? 'unknown';
            $eventId = $payload['data']['id'] ?? $payload['id'] ?? '';
            $timestamp = $payload['timestamp'] ?? $payload['created_at'] ?? '';
            
            $idempotencyKey = hash('sha256', "{$eventType}:{$eventId}:{$timestamp}");
        }

        // Check if already processed (using existing schema: event_hash column)
        try {
            $db = AuthDatabase::getInstance();
            $stmt = $db->prepare("
                SELECT 1 FROM webhook_processed_events 
                WHERE event_hash = ? 
                LIMIT 1
            ");
            $stmt->execute([$idempotencyKey]);
            $isDuplicate = $stmt->fetch() !== false;
        } catch (\Exception $e) {
            error_log("[WebhookMiddleware] Idempotency check failed: " . $e->getMessage());
            // On DB error, allow processing (fail-open for availability)
            $isDuplicate = false;
        }

        return [
            'isDuplicate' => $isDuplicate,
            'idempotencyKey' => $idempotencyKey,
        ];
    }

    /**
     * Record a processed event to prevent duplicate processing
     * 
     * Should be called AFTER successful processing of webhook.
     * 
     * @param string $idempotencyKey The unique key for this event
     * @param string $eventType The type of event processed
     * @return bool True if recorded successfully
     */
    public static function recordProcessedEvent(string $idempotencyKey, string $eventType = 'unknown'): bool
    {
        try {
            $db = AuthDatabase::getInstance();
            // Use existing schema: endpoint_key (required), event_id, event_hash
            $stmt = $db->prepare("
                INSERT OR IGNORE INTO webhook_processed_events 
                (endpoint_key, event_id, event_hash, processed_at) 
                VALUES (?, ?, ?, strftime('%s', 'now'))
            ");
            // endpoint_key = event type, event_id = unique part
            $stmt->execute(['incoming', $eventType . ':' . $idempotencyKey, $idempotencyKey]);
            return true;
        } catch (\Exception $e) {
            error_log("[WebhookMiddleware] Record processed event failed: " . $e->getMessage());
            return false;
        }
    }

    /**
     * Validate with full idempotency protection
     * 
     * Combines signature validation + idempotency check in one call.
     * 
     * @param string $endpointKey The endpoint identifier
     * @return array{valid: bool, error?: string, payload?: array, endpoint?: array, isDuplicate?: bool, idempotencyKey?: string}
     */
    public static function validateWithIdempotency(string $endpointKey): array
    {
        // First, do standard validation
        $validation = self::validateIncoming($endpointKey);
        
        if (!$validation['valid']) {
            return $validation;
        }

        // Check idempotency
        $idempotencyCheck = self::checkIdempotency($validation['payload']);
        
        return array_merge($validation, [
            'isDuplicate' => $idempotencyCheck['isDuplicate'],
            'idempotencyKey' => $idempotencyCheck['idempotencyKey'],
        ]);
    }

    /**
     * Cleanup old processed events
     * 
     * Removes events older than specified retention period.
     * Default: 7 days (webhook retry window is typically 24-72 hours)
     * 
     * @param int $retentionDays Number of days to keep records
     * @return int Number of records deleted
     */
    public static function cleanupProcessedEvents(int $retentionDays = 7): int
    {
        try {
            $db = AuthDatabase::getInstance();
            // processed_at is stored as Unix timestamp (INTEGER)
            $cutoffTime = time() - ($retentionDays * 86400);
            $stmt = $db->prepare("
                DELETE FROM webhook_processed_events 
                WHERE processed_at < ?
            ");
            $stmt->execute([$cutoffTime]);
            return $stmt->rowCount();
        } catch (\Exception $e) {
            error_log("[WebhookMiddleware] Cleanup processed events failed: " . $e->getMessage());
            return 0;
        }
    }
    
    /**
     * Check rate limit for incoming webhooks
     * 
     * Uses sliding window rate limiting stored in memory (APCu if available) or SQLite fallback.
     * Very generous defaults: 500 requests per minute per endpoint
     * Can be configured via ENV:
     *   - WEBHOOK_RATE_LIMIT_WINDOW (seconds, default: 60)
     *   - WEBHOOK_RATE_LIMIT_MAX (requests, default: 500)
     * 
     * @param string $endpointKey Endpoint identifier
     * @return array{allowed: bool, current: int, max: int, retry_after?: int}
     */
    private static function checkRateLimit(string $endpointKey): array
    {
        $window = (int)($_ENV['WEBHOOK_RATE_LIMIT_WINDOW'] ?? self::RATE_LIMIT_WINDOW);
        $maxRequests = (int)($_ENV['WEBHOOK_RATE_LIMIT_MAX'] ?? self::RATE_LIMIT_MAX_REQUESTS);
        
        // Allow disabling rate limiting via ENV
        if ($maxRequests <= 0) {
            return ['allowed' => true, 'current' => 0, 'max' => 0];
        }
        
        $cacheKey = "webhook_rate:{$endpointKey}";
        $now = time();
        $windowStart = $now - $window;
        
        // Try APCu first (fastest, in-memory)
        if (function_exists('apcu_fetch')) {
            return self::checkRateLimitApcu($cacheKey, $windowStart, $now, $window, $maxRequests);
        }
        
        // Fallback to SQLite-based rate limiting
        return self::checkRateLimitSqlite($endpointKey, $windowStart, $now, $window, $maxRequests);
    }
    
    /**
     * APCu-based rate limiting (fast, in-memory)
     */
    private static function checkRateLimitApcu(string $key, int $windowStart, int $now, int $window, int $max): array
    {
        $timestamps = apcu_fetch($key) ?: [];
        
        // Filter out old timestamps (outside window)
        $timestamps = array_filter($timestamps, fn($t) => $t > $windowStart);
        
        $current = count($timestamps);
        
        if ($current >= $max) {
            // Calculate when the oldest request will expire
            $oldest = min($timestamps);
            $retryAfter = ($oldest + $window) - $now;
            
            return [
                'allowed' => false,
                'current' => $current,
                'max' => $max,
                'retry_after' => max(1, $retryAfter)
            ];
        }
        
        // Add current request timestamp
        $timestamps[] = $now;
        apcu_store($key, $timestamps, $window + 10); // TTL slightly longer than window
        
        return ['allowed' => true, 'current' => $current + 1, 'max' => $max];
    }
    
    /**
     * SQLite-based rate limiting (fallback when APCu not available)
     */
    private static function checkRateLimitSqlite(string $endpointKey, int $windowStart, int $now, int $window, int $max): array
    {
        try {
            $db = AuthDatabase::getInstance();
            
            // Ensure table exists (lazy creation)
            $db->exec("
                CREATE TABLE IF NOT EXISTS webhook_rate_limits (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    endpoint_key TEXT NOT NULL,
                    request_time INTEGER NOT NULL
                )
            ");
            $db->exec("CREATE INDEX IF NOT EXISTS idx_rate_endpoint_time ON webhook_rate_limits(endpoint_key, request_time)");
            
            // Count requests in window
            $stmt = $db->prepare("
                SELECT COUNT(*) FROM webhook_rate_limits 
                WHERE endpoint_key = ? AND request_time > ?
            ");
            $stmt->execute([$endpointKey, $windowStart]);
            $current = (int)$stmt->fetchColumn();
            
            if ($current >= $max) {
                // Get oldest request in window for retry-after calculation
                $stmt = $db->prepare("
                    SELECT MIN(request_time) FROM webhook_rate_limits 
                    WHERE endpoint_key = ? AND request_time > ?
                ");
                $stmt->execute([$endpointKey, $windowStart]);
                $oldest = (int)$stmt->fetchColumn();
                $retryAfter = ($oldest + $window) - $now;
                
                return [
                    'allowed' => false,
                    'current' => $current,
                    'max' => $max,
                    'retry_after' => max(1, $retryAfter)
                ];
            }
            
            // Record this request
            $stmt = $db->prepare("INSERT INTO webhook_rate_limits (endpoint_key, request_time) VALUES (?, ?)");
            $stmt->execute([$endpointKey, $now]);
            
            // Cleanup old records (async, 1% chance)
            if (mt_rand(1, 100) === 1) {
                $db->prepare("DELETE FROM webhook_rate_limits WHERE request_time < ?")->execute([$windowStart]);
            }
            
            return ['allowed' => true, 'current' => $current + 1, 'max' => $max];
            
        } catch (\Exception $e) {
            error_log("[WebhookMiddleware] Rate limit check failed: " . $e->getMessage());
            // On error, allow the request (fail-open for availability)
            return ['allowed' => true, 'current' => 0, 'max' => $max];
        }
    }
}
