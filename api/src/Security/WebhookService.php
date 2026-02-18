<?php
/**
 * NOMAD CMS - Webhook Service
 * 
 * HMAC-secured webhook management for outgoing and incoming webhooks.
 * Uses SHA-256 HMAC for message authentication (compatible with Stripe/GitHub format).
 * 
 * Security Features:
 * - HMAC-SHA256 signatures for authenticity
 * - Timestamp validation for replay attack prevention
 * - Encrypted secret storage using EncryptionService
 * - HTTPS enforcement for outgoing webhooks
 * - Rate limiting support
 * 
 * Signature Format (Stripe-compatible):
 *   X-Nomad-Signature: t=TIMESTAMP,v1=SIGNATURE
 *   SIGNATURE = HMAC-SHA256(TIMESTAMP + "." + PAYLOAD, secret)
 */

declare(strict_types=1);

namespace NomadCMS\Security;

use NomadCMS\Database\AuthDatabase;
use NomadCMS\Security\EncryptionService;
use PDO;
use RuntimeException;

/**
 * Result object for webhook delivery attempts
 */
class WebhookDeliveryResult
{
    public function __construct(
        public readonly bool $success,
        public readonly ?int $statusCode = null,
        public readonly ?string $responseBody = null,
        public readonly ?string $error = null,
        public readonly int $deliveryId = 0,
        public readonly int $attempts = 1
    ) {}

    public function toArray(): array
    {
        return [
            'success' => $this->success,
            'status_code' => $this->statusCode,
            'response_body' => $this->responseBody,
            'error' => $this->error,
            'delivery_id' => $this->deliveryId,
            'attempts' => $this->attempts,
        ];
    }
}

final class WebhookService
{
    // Signature tolerance window in seconds (default: 5 minutes)
    private int $signatureTolerance;
    
    // Maximum retry attempts for failed deliveries
    private int $maxRetries;
    
    // Retry delay multiplier for exponential backoff
    private int $retryDelayMultiplier;
    
    // Default HTTP timeout in seconds
    private int $defaultTimeout;

    // Supported webhook events
    public const EVENTS = [
        'content.created',
        'content.updated',
        'content.deleted',
        'content.published',
        'content.unpublished',
        'media.uploaded',
        'media.deleted',
        'user.created',
        'user.updated',
        'user.deleted',
        'user.login',
        'backup.created',
        'system.panic_enabled',
        'system.panic_disabled',
    ];

    // Available payload fields that can be selected
    // Grouped by category for UI display
    public const PAYLOAD_FIELDS = [
        // Core fields (always included by default)
        'id' => ['label' => 'ID', 'category' => 'core', 'description' => 'Egyedi azonosító'],
        'event' => ['label' => 'Esemény', 'category' => 'core', 'description' => 'Esemény típusa'],
        'timestamp' => ['label' => 'Időbélyeg', 'category' => 'core', 'description' => 'UTC időbélyeg'],
        
        // Content fields
        'title' => ['label' => 'Cím', 'category' => 'content', 'description' => 'Tartalom címe'],
        'slug' => ['label' => 'Slug', 'category' => 'content', 'description' => 'URL slug'],
        'content' => ['label' => 'Tartalom', 'category' => 'content', 'description' => 'Teljes tartalom'],
        'excerpt' => ['label' => 'Kivonat', 'category' => 'content', 'description' => 'Rövid leírás'],
        'status' => ['label' => 'Státusz', 'category' => 'content', 'description' => 'Publikálási státusz'],
        'author' => ['label' => 'Szerző', 'category' => 'content', 'description' => 'Szerző neve'],
        'author_id' => ['label' => 'Szerző ID', 'category' => 'content', 'description' => 'Szerző azonosítója'],
        'category' => ['label' => 'Kategória', 'category' => 'content', 'description' => 'Tartalom kategóriája'],
        'tags' => ['label' => 'Címkék', 'category' => 'content', 'description' => 'Címkék listája'],
        'featured_image' => ['label' => 'Kiemelt kép', 'category' => 'content', 'description' => 'Kiemelt kép URL'],
        
        // Metadata fields
        'created_at' => ['label' => 'Létrehozva', 'category' => 'meta', 'description' => 'Létrehozás dátuma'],
        'updated_at' => ['label' => 'Módosítva', 'category' => 'meta', 'description' => 'Utolsó módosítás'],
        'published_at' => ['label' => 'Publikálva', 'category' => 'meta', 'description' => 'Publikálás dátuma'],
        'version' => ['label' => 'Verzió', 'category' => 'meta', 'description' => 'Tartalom verziószáma'],
        
        // Media fields
        'filename' => ['label' => 'Fájlnév', 'category' => 'media', 'description' => 'Eredeti fájlnév'],
        'mime_type' => ['label' => 'MIME típus', 'category' => 'media', 'description' => 'Fájl típusa'],
        'size' => ['label' => 'Méret', 'category' => 'media', 'description' => 'Fájl mérete bájtban'],
        'url' => ['label' => 'URL', 'category' => 'media', 'description' => 'Publikus URL'],
        'dimensions' => ['label' => 'Méretek', 'category' => 'media', 'description' => 'Szélesség/magasság'],
        
        // User fields
        'user_id' => ['label' => 'Felhasználó ID', 'category' => 'user', 'description' => 'Felhasználó azonosítója'],
        'username' => ['label' => 'Felhasználónév', 'category' => 'user', 'description' => 'Felhasználó neve'],
        'email' => ['label' => 'Email', 'category' => 'user', 'description' => 'Email cím'],
        'role' => ['label' => 'Szerepkör', 'category' => 'user', 'description' => 'Felhasználói szerepkör'],
        'ip_address' => ['label' => 'IP cím', 'category' => 'user', 'description' => 'Kliens IP címe'],
        
        // Custom fields
        'custom_fields' => ['label' => 'Egyéni mezők', 'category' => 'custom', 'description' => 'Összes egyéni mező'],
        'metadata' => ['label' => 'Metaadatok', 'category' => 'custom', 'description' => 'Egyéb metaadatok'],
    ];

    // Default fields to include if none specified
    public const DEFAULT_PAYLOAD_FIELDS = ['id', 'event', 'timestamp', 'title', 'slug', 'status'];
    
    // Maximum payload size in bytes (1MB - prevents DoS attacks via oversized payloads)
    // This is an optimistic guess that balances functionality with security
    // Most webhooks should be <10KB, 1MB is extremely generous
    public const MAX_PAYLOAD_SIZE = 1024 * 1024; // 1 MB
    
    // Maximum incoming webhook body size (512KB - stricter for external sources)
    public const MAX_INCOMING_PAYLOAD_SIZE = 512 * 1024; // 512 KB

    public function __construct()
    {
        $this->signatureTolerance = (int)($_ENV['WEBHOOK_SIGNATURE_TOLERANCE'] ?? 300);
        $this->maxRetries = (int)($_ENV['WEBHOOK_MAX_RETRIES'] ?? 3);
        $this->retryDelayMultiplier = (int)($_ENV['WEBHOOK_RETRY_DELAY_MULTIPLIER'] ?? 2);
        $this->defaultTimeout = 30;
    }


    /**
     * Webhook secret prefix for identification
     * Format: nwh_[64 hex chars] = "Nomad Web Hook"
     */
    public const SECRET_PREFIX = 'nwh_';
    
    /**
     * Expected secret length (prefix + 64 hex chars)
     */
    public const SECRET_LENGTH = 68; // 4 (nwh_) + 64 (32 bytes hex)
    
    /**
     * Generate a cryptographically secure webhook secret
     * Returns nwh_ prefix + 32 bytes (64 hex characters) of random data
     * 
     * Prefix: "nwh_" = Nomad Web Hook
     */
    public function generateSecret(): string
    {
        return self::SECRET_PREFIX . bin2hex(random_bytes(32));
    }
    
    /**
     * Validate secret format (O(1) early reject)
     * 
     * OPTIMIZATION: Quick prefix and length check before expensive operations.
     * This rejects invalid formats immediately without decryption or HMAC computation.
     * 
     * @param string $secret The secret to validate
     * @return bool True if format is valid
     */
    public static function isValidSecretFormat(string $secret): bool
    {
        // O(1) checks: prefix + length + hex validation
        if (!str_starts_with($secret, self::SECRET_PREFIX)) {
            return false;
        }
        
        if (strlen($secret) !== self::SECRET_LENGTH) {
            return false;
        }
        
        // Validate hex portion (after prefix)
        $hexPart = substr($secret, strlen(self::SECRET_PREFIX));
        return ctype_xdigit($hexPart);
    }
    
    /**
     * Check if a secret is legacy format (pre-prefix)
     * Used for migration detection
     * 
     * @param string $secret The secret to check
     * @return bool True if legacy format
     */
    public static function isLegacySecretFormat(string $secret): bool
    {
        // Legacy secrets are 64 hex chars without prefix
        return strlen($secret) === 64 && ctype_xdigit($secret);
    }

    /**
     * Encrypt a secret for database storage
     */
    public function encryptSecret(string $secret): string
    {
        return EncryptionService::encrypt($secret);
    }

    /**
     * Decrypt a secret from database storage
     */
    public function decryptSecret(string $encryptedSecret): string
    {
        return EncryptionService::decrypt($encryptedSecret);
    }

    // =========================================================================
    // HMAC SIGNATURE GENERATION & VALIDATION
    // =========================================================================

    /**
     * Generate HMAC signature for outgoing webhook payload
     * 
     * Format: HMAC-SHA256(timestamp + "." + payload, secret)
     * 
     * @param string $payload JSON payload
     * @param string $secret Webhook secret (plaintext)
     * @param int $timestamp Unix timestamp
     * @return string Hex-encoded HMAC signature
     */
    public function signPayload(string $payload, string $secret, int $timestamp): string
    {
        $signedPayload = $timestamp . '.' . $payload;
        return hash_hmac('sha256', $signedPayload, $secret);
    }

    /**
     * Generate full signature header value (Stripe-compatible format)
     * 
     * @param string $payload JSON payload
     * @param string $secret Webhook secret (plaintext)
     * @param int|null $timestamp Unix timestamp (uses current time if null)
     * @return array{signature: string, timestamp: int, header: string}
     */
    public function generateSignatureHeader(string $payload, string $secret, ?int $timestamp = null): array
    {
        $timestamp = $timestamp ?? time();
        $signature = $this->signPayload($payload, $secret, $timestamp);
        
        return [
            'signature' => $signature,
            'timestamp' => $timestamp,
            'header' => "t={$timestamp},v1={$signature}",
        ];
    }

    /**
     * Verify incoming HMAC signature
     * 
     * Uses timing-safe comparison to prevent timing attacks.
     * Also validates timestamp for replay attack prevention.
     * 
     * OPTIMIZATION: O(1) format check before expensive HMAC computation
     * 
     * @param string $payload Received JSON payload
     * @param string $signature Received signature (hex)
     * @param string $secret Webhook secret (plaintext)
     * @param int $timestamp Received timestamp
     * @return bool True if signature is valid and timestamp is within tolerance
     */
    public function verifySignature(string $payload, string $signature, string $secret, int $timestamp): bool
    {
        // OPTIMIZATION: O(1) early reject for invalid secret formats
        // Skips expensive HMAC computation for obviously invalid secrets
        if (!self::isValidSecretFormat($secret) && !self::isLegacySecretFormat($secret)) {
            error_log("[WEBHOOK] Secret format validation failed - rejecting before HMAC");
            return false;
        }
        
        // Check timestamp for replay attack prevention
        if (!$this->isTimestampValid($timestamp)) {
            return false;
        }

        // Calculate expected signature
        $expectedSignature = $this->signPayload($payload, $secret, $timestamp);

        // Timing-safe comparison to prevent timing attacks
        return hash_equals($expectedSignature, $signature);
    }

    /**
     * Parse signature header (Stripe-compatible format)
     * Supports both "t=TIMESTAMP,v1=SIGNATURE" and legacy "SIGNATURE" formats
     * 
     * @param string $header Raw signature header value
     * @return array{timestamp: int|null, signature: string|null}
     */
    public function parseSignatureHeader(string $header): array
    {
        $result = ['timestamp' => null, 'signature' => null];

        // Try Stripe-compatible format first: t=TIMESTAMP,v1=SIGNATURE
        if (preg_match('/t=(\d+),v1=([a-f0-9]+)/i', $header, $matches)) {
            $result['timestamp'] = (int)$matches[1];
            $result['signature'] = $matches[2];
        } 
        // Legacy format: just the signature
        elseif (preg_match('/^[a-f0-9]{64}$/i', $header)) {
            $result['signature'] = $header;
        }

        return $result;
    }

    /**
     * Parse Stripe signature header
     * Format: t=TIMESTAMP,v1=SIGNATURE (may have multiple v1 entries)
     * 
     * @param string $header Raw Stripe-Signature header value
     * @return array{timestamp: int|null, signature: string|null}
     */
    public function parseStripeSignatureHeader(string $header): array
    {
        $result = ['timestamp' => null, 'signature' => null];
        
        $parts = explode(',', $header);
        foreach ($parts as $part) {
            $part = trim($part);
            if (str_starts_with($part, 't=')) {
                $result['timestamp'] = (int)substr($part, 2);
            } elseif (str_starts_with($part, 'v1=')) {
                // Take the first v1 signature
                if ($result['signature'] === null) {
                    $result['signature'] = substr($part, 3);
                }
            }
        }
        
        return $result;
    }

    /**
     * Verify GitHub webhook signature (X-Hub-Signature-256)
     * 
     * GitHub uses: HMAC-SHA256(payload, secret) without timestamp
     * 
     * @param string $payload Raw request body
     * @param string $signature Signature from header (without sha256= prefix)
     * @param string $secret Webhook secret
     * @return bool True if signature is valid
     */
    public function verifyGithubSignature(string $payload, string $signature, string $secret): bool
    {
        // GitHub doesn't use prefixed secrets, so check both formats
        if (!self::isValidSecretFormat($secret) && !self::isLegacySecretFormat($secret)) {
            // For GitHub webhooks, plain secrets without our prefix are valid
            if (empty($secret) || strlen($secret) < 16) {
                error_log("[WEBHOOK] GitHub secret too short or empty");
                return false;
            }
        }
        
        // GitHub signature: HMAC-SHA256(payload, secret) - no timestamp involved
        $expectedSignature = hash_hmac('sha256', $payload, $secret);
        
        return hash_equals($expectedSignature, $signature);
    }

    /**
     * Verify Stripe webhook signature
     * 
     * Stripe uses: HMAC-SHA256(timestamp + "." + payload, secret)
     * Same format as Nomad signature
     * 
     * @param string $payload Raw request body
     * @param string $signature Signature from header
     * @param string $secret Webhook secret (Stripe whsec_xxx format)
     * @param int $timestamp Timestamp from header
     * @return bool True if signature is valid
     */
    public function verifyStripeSignature(string $payload, string $signature, string $secret, int $timestamp): bool
    {
        // Stripe secrets start with "whsec_" - we need to accept them
        if (!self::isValidSecretFormat($secret) && !self::isLegacySecretFormat($secret)) {
            // Check for Stripe-style secret (whsec_ prefix)
            if (!str_starts_with($secret, 'whsec_') && (empty($secret) || strlen($secret) < 16)) {
                error_log("[WEBHOOK] Stripe secret has invalid format");
                return false;
            }
        }
        
        // Check timestamp tolerance
        if (!$this->isTimestampValid($timestamp)) {
            return false;
        }
        
        // Stripe signature format is identical to Nomad: timestamp.payload
        $signedPayload = $timestamp . '.' . $payload;
        $expectedSignature = hash_hmac('sha256', $signedPayload, $secret);
        
        return hash_equals($expectedSignature, $signature);
    }

    /**
     * Dynamic signature verification - works with ANY webhook provider!
     * 
     * Tries multiple HMAC formats to find a match:
     * 1. Timestamped: HMAC-SHA256(timestamp + "." + payload, secret)
     * 2. Simple: HMAC-SHA256(payload, secret)
     * 3. SHA-1: HMAC-SHA1(payload, secret) for legacy providers
     * 4. SHA-512: HMAC-SHA512(payload, secret) for high-security providers
     * 
     * @param string $payload Raw request body
     * @param string $signature Signature from header (hex)
     * @param string $secret Webhook secret
     * @param int|null $timestamp Optional timestamp
     * @param string $format Detected format hint ('timestamped', 'sha256', 'sha1', 'raw', etc.)
     * @return bool True if any verification method succeeds
     */
    public function verifySignatureDynamic(
        string $payload,
        string $signature,
        string $secret,
        ?int $timestamp,
        string $format = 'unknown'
    ): bool {
        // Normalize signature to lowercase hex
        $signature = strtolower($signature);
        
        // Determine signature length to guess algorithm
        $sigLength = strlen($signature);
        
        // Try verification based on format hint first
        switch ($format) {
            case 'timestamped':
                if ($timestamp !== null) {
                    // Stripe/Nomad format: timestamp.payload
                    $signedPayload = $timestamp . '.' . $payload;
                    $expected = hash_hmac('sha256', $signedPayload, $secret);
                    if (hash_equals($expected, $signature)) {
                        return true;
                    }
                }
                break;
                
            case 'sha1':
                $expected = hash_hmac('sha1', $payload, $secret);
                if (hash_equals($expected, $signature)) {
                    return true;
                }
                break;
                
            case 'sha512':
                $expected = hash_hmac('sha512', $payload, $secret);
                if (hash_equals($expected, $signature)) {
                    return true;
                }
                break;
        }
        
        // Fallback: try all common algorithms based on signature length
        $algorithms = [];
        
        switch ($sigLength) {
            case 40:  // SHA-1 = 20 bytes = 40 hex
                $algorithms = ['sha1'];
                break;
            case 64:  // SHA-256 = 32 bytes = 64 hex
                $algorithms = ['sha256'];
                break;
            case 128: // SHA-512 = 64 bytes = 128 hex
                $algorithms = ['sha512'];
                break;
            case 32:  // MD5 = 16 bytes = 32 hex (legacy)
                $algorithms = ['md5'];
                break;
            default:
                // Unknown length - try common ones
                $algorithms = ['sha256', 'sha1', 'sha512'];
        }
        
        // Try simple HMAC (most common)
        foreach ($algorithms as $algo) {
            $expected = hash_hmac($algo, $payload, $secret);
            if (hash_equals($expected, $signature)) {
                return true;
            }
        }
        
        // Try timestamped formats if timestamp is available
        if ($timestamp !== null) {
            foreach ($algorithms as $algo) {
                // Format: timestamp.payload
                $signedPayload = $timestamp . '.' . $payload;
                $expected = hash_hmac($algo, $signedPayload, $secret);
                if (hash_equals($expected, $signature)) {
                    return true;
                }
                
                // Alternative format: payload.timestamp (some services use this)
                $signedPayload = $payload . '.' . $timestamp;
                $expected = hash_hmac($algo, $signedPayload, $secret);
                if (hash_equals($expected, $signature)) {
                    return true;
                }
            }
        }
        
        // Nothing matched
        error_log("[WEBHOOK] Dynamic signature verification failed - no algorithm matched. Format: {$format}, Length: {$sigLength}");
        return false;
    }

    /**
     * Verify signature with a specific format from user configuration
     * 
     * Uses the endpoint's stored signature_format to verify incoming webhooks.
     * This allows users to configure exactly how their webhook provider sends signatures.
     * 
     * @param string $payload Raw request body
     * @param string $signature Signature from header
     * @param string $secret Webhook secret
     * @param int|null $timestamp Optional timestamp
     * @param string $format One of SIGNATURE_FORMATS (auto, sha256_simple, etc.)
     * @return bool True if verification succeeds
     */
    public function verifySignatureWithFormat(
        string $payload,
        string $signature,
        string $secret,
        ?int $timestamp,
        string $format = 'auto'
    ): bool {
        // Normalize signature
        $signature = strtolower(trim($signature));
        
        // Strip common prefixes if present
        if (str_starts_with($signature, 'sha256=')) {
            $signature = substr($signature, 7);
        } elseif (str_starts_with($signature, 'sha1=')) {
            $signature = substr($signature, 5);
        } elseif (str_starts_with($signature, 'sha512=')) {
            $signature = substr($signature, 7);
        }
        
        switch ($format) {
            case 'auto':
                // Use dynamic detection
                return $this->verifySignatureDynamic($payload, $signature, $secret, $timestamp, 'unknown');
            
            case 'sha256_simple':
                // Simple HMAC-SHA256 of payload
                $expected = hash_hmac('sha256', $payload, $secret);
                return hash_equals($expected, $signature);
            
            case 'sha256_prefixed':
                // HMAC-SHA256 with sha256= prefix (GitHub style)
                $expected = hash_hmac('sha256', $payload, $secret);
                return hash_equals($expected, $signature);
            
            case 'sha256_timestamped':
                // Stripe/Nomad format: HMAC-SHA256(timestamp + "." + payload)
                if ($timestamp === null) {
                    error_log("[WEBHOOK] Timestamped format requires timestamp but none provided");
                    return false;
                }
                if (!$this->isTimestampValid($timestamp)) {
                    error_log("[WEBHOOK] Timestamp validation failed");
                    return false;
                }
                $signedPayload = $timestamp . '.' . $payload;
                $expected = hash_hmac('sha256', $signedPayload, $secret);
                return hash_equals($expected, $signature);
            
            case 'sha1_simple':
                // Simple HMAC-SHA1 (GitHub legacy)
                $expected = hash_hmac('sha1', $payload, $secret);
                return hash_equals($expected, $signature);
            
            case 'sha1_prefixed':
                // HMAC-SHA1 with sha1= prefix
                $expected = hash_hmac('sha1', $payload, $secret);
                return hash_equals($expected, $signature);
            
            case 'sha512_simple':
                // HMAC-SHA512 (high security)
                $expected = hash_hmac('sha512', $payload, $secret);
                return hash_equals($expected, $signature);
            
            case 'base64':
                // Base64-encoded HMAC-SHA256 (some providers use this)
                $expectedRaw = hash_hmac('sha256', $payload, $secret, true);
                $expectedB64 = base64_encode($expectedRaw);
                // Try both original signature and base64-decoded version
                if ($signature === strtolower($expectedB64)) {
                    return true;
                }
                // Also try hex comparison in case signature was already decoded
                $decoded = base64_decode($signature, true);
                if ($decoded !== false) {
                    $decodedHex = bin2hex($decoded);
                    return hash_equals(hash_hmac('sha256', $payload, $secret), $decodedHex);
                }
                return false;
            
            default:
                error_log("[WEBHOOK] Unknown signature format: {$format}, falling back to auto detection");
                return $this->verifySignatureDynamic($payload, $signature, $secret, $timestamp, 'unknown');
        }
    }

    /**
     * Check if timestamp is within acceptable tolerance window
     */
    public function isTimestampValid(int $timestamp): bool
    {
        $currentTime = time();
        $diff = abs($currentTime - $timestamp);
        return $diff <= $this->signatureTolerance;
    }

    // =========================================================================
    // WEBHOOK MANAGEMENT (CRUD)
    // =========================================================================

    /**
     * Create a new outgoing webhook configuration
     * 
     * @param int $userId Owner user ID
     * @param string $name Friendly name
     * @param string $url Target URL (HTTPS required)
     * @param array $events Array of event types to subscribe
     * @param array|null $payloadFields Array of payload fields to include (null = all)
     * @param array|null $slotFilters Array of slot names to filter content events (null = all slots)
     * @param array|null $slotTypeFilters Array of slot types to filter content events (null = all types)
     * @param int $retryCount Max retry attempts (default: 3)
     * @param int $timeoutSeconds HTTP timeout (default: 30)
     * @param array|null $headers Custom headers to send (will be encrypted at rest)
     * @return array Created webhook data with plaintext secret (only shown once!)
     */
    public function createWebhook(
        int $userId,
        string $name,
        string $url,
        array $events,
        ?array $payloadFields = null,
        ?array $slotFilters = null,
        ?array $slotTypeFilters = null,
        int $retryCount = 3,
        int $timeoutSeconds = 30,
        ?array $headers = null
    ): array {
        // Validate URL
        $this->validateWebhookUrl($url);

        // Validate events
        $validEvents = array_intersect($events, self::EVENTS);
        if (empty($validEvents)) {
            throw new RuntimeException('At least one valid event is required');
        }

        // Sanitize payload fields (accept any valid string keys from dynamic fields)
        $validPayloadFields = null;
        if ($payloadFields !== null && !empty($payloadFields)) {
            $validPayloadFields = array_filter(array_map('trim', $payloadFields), fn($s) => !empty($s));
            $validPayloadFields = !empty($validPayloadFields) ? array_values($validPayloadFields) : null;
        }

        // Sanitize slot filters (remove empty strings, trim)
        $validSlotFilters = null;
        if ($slotFilters !== null && !empty($slotFilters)) {
            $validSlotFilters = array_filter(array_map('trim', $slotFilters), fn($s) => !empty($s));
            $validSlotFilters = !empty($validSlotFilters) ? array_values($validSlotFilters) : null;
        }

        // Validate slot type filters (only allow valid types: object, list, collection, massive)
        $validSlotTypes = ['object', 'list', 'collection', 'massive'];
        $validSlotTypeFilters = null;
        if ($slotTypeFilters !== null && !empty($slotTypeFilters)) {
            $validSlotTypeFilters = array_intersect($slotTypeFilters, $validSlotTypes);
            $validSlotTypeFilters = !empty($validSlotTypeFilters) ? array_values($validSlotTypeFilters) : null;
        }

        // Validate and encrypt custom headers
        $encryptedHeaders = null;
        if ($headers !== null && !empty($headers)) {
            $sanitizedHeaders = $this->sanitizeCustomHeaders($headers);
            if (!empty($sanitizedHeaders)) {
                // Encrypt the entire headers JSON blob for security
                $encryptedHeaders = EncryptionService::encrypt(json_encode($sanitizedHeaders));
            }
        }

        // Generate secret
        $plaintextSecret = $this->generateSecret();
        $encryptedSecret = $this->encryptSecret($plaintextSecret);

        $db = AuthDatabase::getInstance();
        $stmt = $db->prepare("
            INSERT INTO webhooks (user_id, name, url, secret, events, payload_fields, slot_filters, slot_type_filters, headers, retry_count, timeout_seconds)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");

        $stmt->execute([
            $userId,
            $name,
            $url,
            $encryptedSecret,
            json_encode($validEvents),
            $validPayloadFields !== null ? json_encode($validPayloadFields) : null,
            $validSlotFilters !== null ? json_encode($validSlotFilters) : null,
            $validSlotTypeFilters !== null ? json_encode($validSlotTypeFilters) : null,
            $encryptedHeaders,
            min($retryCount, 10),
            min($timeoutSeconds, 120),
        ]);

        $id = (int)$db->lastInsertId();

        return [
            'id' => $id,
            'user_id' => $userId,
            'name' => $name,
            'url' => $url,
            'events' => $validEvents,
            'payload_fields' => $validPayloadFields ?? self::DEFAULT_PAYLOAD_FIELDS,
            'slot_filters' => $validSlotFilters,
            'slot_type_filters' => $validSlotTypeFilters,
            'headers' => $headers !== null ? array_keys($sanitizedHeaders ?? []) : [], // Only return header names, not values
            'is_active' => true,
            'retry_count' => $retryCount,
            'timeout_seconds' => $timeoutSeconds,
            'secret' => $plaintextSecret, // Only shown once!
            'created_at' => date('c'),
        ];
    }

    /**
     * Sanitize custom headers - prevent overwriting protected headers
     * 
     * @param array $headers Key-value pairs of custom headers
     * @return array Sanitized headers
     */
    private function sanitizeCustomHeaders(array $headers): array
    {
        // Protected headers that cannot be overwritten
        $protectedHeaders = [
            'x-nomad-signature',
            'x-webhook-signature', 
            'x-webhook-timestamp',
            'x-webhook-event',
            'x-webhook-delivery',
            'content-type',
            'host',
            'user-agent',
            'content-length',
            'transfer-encoding',
            'connection',
        ];
        
        $sanitized = [];
        foreach ($headers as $name => $value) {
            $normalizedName = strtolower(trim($name));
            
            // Skip protected headers
            if (in_array($normalizedName, $protectedHeaders, true)) {
                error_log("[WEBHOOK] Blocked attempt to set protected header: {$name}");
                continue;
            }
            
            // Skip empty names or values
            if (empty($normalizedName) || $value === null || $value === '') {
                continue;
            }
            
            // Sanitize header name (only allow alphanumeric, dash, underscore)
            if (!preg_match('/^[a-zA-Z0-9_-]+$/', $name)) {
                error_log("[WEBHOOK] Blocked invalid header name: {$name}");
                continue;
            }
            
            // Store with original casing
            $sanitized[$name] = (string)$value;
        }
        
        return $sanitized;
    }

    /**
     * Get webhook by ID
     * 
     * @param int $id Webhook ID
     * @param bool $includeSecret Include decrypted secret (use with caution!)
     * @param bool $includeHeaders Include decrypted headers (use with caution!)
     * @return array|null Webhook data or null if not found
     */
    public function getWebhook(int $id, bool $includeSecret = false, bool $includeHeaders = false): ?array
    {
        $db = AuthDatabase::getInstance();
        $stmt = $db->prepare("SELECT * FROM webhooks WHERE id = ?");
        $stmt->execute([$id]);
        $webhook = $stmt->fetch();

        if (!$webhook) {
            return null;
        }

        $webhook['events'] = json_decode($webhook['events'], true);
        $webhook['payload_fields'] = $webhook['payload_fields'] 
            ? json_decode($webhook['payload_fields'], true) 
            : self::DEFAULT_PAYLOAD_FIELDS;
        $webhook['slot_filters'] = $webhook['slot_filters'] 
            ? json_decode($webhook['slot_filters'], true) 
            : null;
        $webhook['slot_type_filters'] = $webhook['slot_type_filters'] 
            ? json_decode($webhook['slot_type_filters'], true) 
            : null;
        $webhook['is_active'] = (bool)$webhook['is_active'];

        if ($includeSecret) {
            $webhook['secret'] = $this->decryptSecret($webhook['secret']);
        } else {
            unset($webhook['secret']);
        }

        // Handle custom headers
        if (isset($webhook['headers']) && $webhook['headers']) {
            if ($includeHeaders) {
                // Decrypt and return full headers
                try {
                    $decryptedHeaders = EncryptionService::decrypt($webhook['headers']);
                    $webhook['headers'] = json_decode($decryptedHeaders, true) ?? [];
                } catch (\Exception $e) {
                    error_log("[WEBHOOK] Failed to decrypt headers for webhook {$id}: " . $e->getMessage());
                    $webhook['headers'] = [];
                }
            } else {
                // Only return header names for security
                try {
                    $decryptedHeaders = EncryptionService::decrypt($webhook['headers']);
                    $headerData = json_decode($decryptedHeaders, true) ?? [];
                    $webhook['headers'] = array_keys($headerData);
                } catch (\Exception $e) {
                    $webhook['headers'] = [];
                }
            }
        } else {
            $webhook['headers'] = [];
        }

        return $webhook;
    }

    /**
     * Get all webhooks for a user
     * 
     * @param int $userId User ID
     * @return array Array of webhook configurations
     */
    public function getWebhooksForUser(int $userId): array
    {
        $db = AuthDatabase::getInstance();
        $stmt = $db->prepare("
            SELECT id, user_id, name, url, events, payload_fields, slot_filters, slot_type_filters, is_active, retry_count, timeout_seconds, created_at, updated_at
            FROM webhooks 
            WHERE user_id = ?
            ORDER BY created_at DESC
        ");
        $stmt->execute([$userId]);
        $webhooks = $stmt->fetchAll();

        return array_map(function($w) {
            $w['events'] = json_decode($w['events'], true);
            $w['payload_fields'] = $w['payload_fields'] 
                ? json_decode($w['payload_fields'], true) 
                : self::DEFAULT_PAYLOAD_FIELDS;
            $w['slot_filters'] = $w['slot_filters'] 
                ? json_decode($w['slot_filters'], true) 
                : null;
            $w['slot_type_filters'] = $w['slot_type_filters'] 
                ? json_decode($w['slot_type_filters'], true) 
                : null;
            $w['is_active'] = (bool)$w['is_active'];
            return $w;
        }, $webhooks);
    }

    /**
     * Get all active webhooks subscribed to a specific event
     * 
     * OPTIMIZED: Uses indexed query with event pre-filtering,
     * minimal memory usage via fetch() instead of fetchAll()
     * 
     * @param string $event Event type
     * @param string|null $slotKey Optional slot key to filter content events
     * @param string|null $slotType Optional slot type (object, list, collection, massive) to filter content events
     * @return array Array of webhook configurations
     */
    public function getWebhooksForEvent(string $event, ?string $slotKey = null, ?string $slotType = null): array
    {
        $db = AuthDatabase::getInstance();
        
        // OPTIMIZATION: Pre-filter by event in SQL using JSON contains (LIKE pattern)
        // This reduces memory usage by not loading webhooks that don't match
        $eventJson = '"' . $event . '"';
        $stmt = $db->prepare("
            SELECT id, url, secret, events, slot_filters, slot_type_filters, payload_fields, headers,
                   retry_count, timeout_seconds
            FROM webhooks 
            WHERE is_active = 1 AND events LIKE ?
            ORDER BY created_at ASC
        ");
        $stmt->execute(['%' . $eventJson . '%']);

        // OPTIMIZATION: Use fetch() loop instead of fetchAll() for memory efficiency
        $filtered = [];
        while ($webhook = $stmt->fetch(\PDO::FETCH_ASSOC)) {
            // Parse JSON fields only when needed
            $events = json_decode($webhook['events'], true);
            if (!in_array($event, $events, true)) {
                continue;
            }
            
            // Check slot type filter for content events
            if (str_starts_with($event, 'content.') && $slotType !== null) {
                $slotTypeFilters = $webhook['slot_type_filters'] ? json_decode($webhook['slot_type_filters'], true) : null;
                if (!empty($slotTypeFilters) && !in_array($slotType, $slotTypeFilters, true)) {
                    continue;
                }
            }
            
            // Check slot name filter for content events
            if (str_starts_with($event, 'content.') && $slotKey !== null) {
                $slotFilters = $webhook['slot_filters'] ? json_decode($webhook['slot_filters'], true) : null;
                if (!empty($slotFilters) && !in_array($slotKey, $slotFilters, true)) {
                    continue;
                }
            }
            
            // OPTIMIZATION: Only decode payload_fields if we pass all filters
            $webhook['events'] = $events;
            $webhook['slot_filters'] = $webhook['slot_filters'] ? json_decode($webhook['slot_filters'], true) : null;
            $webhook['slot_type_filters'] = $webhook['slot_type_filters'] ? json_decode($webhook['slot_type_filters'], true) : null;
            $webhook['payload_fields'] = $webhook['payload_fields'] ? json_decode($webhook['payload_fields'], true) : null;
            $webhook['is_active'] = true;
            $filtered[] = $webhook;
        }

        return $filtered;
    }

    /**
     * Update webhook configuration
     * 
     * @param int $id Webhook ID
     * @param array $data Update data (name, url, events, payload_fields, slot_filters, is_active, retry_count, timeout_seconds, headers)
     * @return bool Success
     */
    public function updateWebhook(int $id, array $data): bool
    {
        $allowedFields = ['name', 'url', 'events', 'payload_fields', 'slot_filters', 'slot_type_filters', 'headers', 'is_active', 'retry_count', 'timeout_seconds'];
        $updates = [];
        $params = [];

        foreach ($allowedFields as $field) {
            if (array_key_exists($field, $data)) {
                $value = $data[$field];

                if ($field === 'url') {
                    $this->validateWebhookUrl($value);
                }

                if ($field === 'events') {
                    $validEvents = array_intersect($value, self::EVENTS);
                    if (empty($validEvents)) {
                        throw new RuntimeException('At least one valid event is required');
                    }
                    $value = json_encode($validEvents);
                }

                if ($field === 'payload_fields') {
                    if ($value !== null && !empty($value)) {
                        // Accept any field keys (dynamic fields from ADMIN_CONFIG + core fields)
                        // Only basic sanitization - remove empty strings
                        $validFields = array_filter(array_map('trim', $value), fn($s) => !empty($s));
                        $value = !empty($validFields) ? json_encode(array_values($validFields)) : null;
                    } else {
                        $value = null;
                    }
                }

                if ($field === 'slot_filters') {
                    if ($value !== null && !empty($value)) {
                        $validFilters = array_filter(array_map('trim', $value), fn($s) => !empty($s));
                        $value = !empty($validFilters) ? json_encode(array_values($validFilters)) : null;
                    } else {
                        $value = null;
                    }
                }

                if ($field === 'slot_type_filters') {
                    $validSlotTypes = ['object', 'list', 'collection', 'massive'];
                    if ($value !== null && !empty($value)) {
                        $validFilters = array_intersect($value, $validSlotTypes);
                        $value = !empty($validFilters) ? json_encode(array_values($validFilters)) : null;
                    } else {
                        $value = null;
                    }
                }

                if ($field === 'headers') {
                    if ($value !== null && !empty($value) && is_array($value)) {
                        $sanitizedHeaders = $this->sanitizeCustomHeaders($value);
                        if (!empty($sanitizedHeaders)) {
                            // Encrypt the entire headers JSON blob
                            $value = EncryptionService::encrypt(json_encode($sanitizedHeaders));
                        } else {
                            $value = null;
                        }
                    } else {
                        $value = null;
                    }
                }

                if ($field === 'is_active') {
                    $value = $value ? 1 : 0;
                }

                $updates[] = "{$field} = ?";
                $params[] = $value;
            }
        }

        if (empty($updates)) {
            return false;
        }

        $updates[] = "updated_at = datetime('now')";
        $params[] = $id;

        $db = AuthDatabase::getInstance();
        $sql = "UPDATE webhooks SET " . implode(', ', $updates) . " WHERE id = ?";
        $stmt = $db->prepare($sql);
        return $stmt->execute($params);
    }

    /**
     * Delete webhook
     */
    public function deleteWebhook(int $id): bool
    {
        $db = AuthDatabase::getInstance();
        $stmt = $db->prepare("DELETE FROM webhooks WHERE id = ?");
        return $stmt->execute([$id]);
    }

    /**
     * Rotate webhook secret (generate new secret)
     * 
     * @param int $id Webhook ID
     * @return string New plaintext secret (only shown once!)
     */
    public function rotateSecret(int $id): string
    {
        $plaintextSecret = $this->generateSecret();
        $encryptedSecret = $this->encryptSecret($plaintextSecret);

        $db = AuthDatabase::getInstance();
        $stmt = $db->prepare("
            UPDATE webhooks 
            SET secret = ?, updated_at = datetime('now')
            WHERE id = ?
        ");
        $stmt->execute([$encryptedSecret, $id]);

        return $plaintextSecret;
    }

    /**
     * Validate webhook URL
     * 
     * @throws RuntimeException if URL is invalid
     */
    private function validateWebhookUrl(string $url): void
    {
        $parsed = parse_url($url);

        if (!$parsed || !isset($parsed['scheme']) || !isset($parsed['host'])) {
            throw new RuntimeException('Invalid URL format');
        }

        // Require HTTPS (except for localhost in development)
        $isLocalhost = in_array($parsed['host'], ['localhost', '127.0.0.1', '::1']);
        $isDevelopment = ($_ENV['APP_ENV'] ?? 'production') === 'development';

        if ($parsed['scheme'] !== 'https' && !($isLocalhost && $isDevelopment)) {
            throw new RuntimeException('HTTPS is required for webhook URLs');
        }

        // Block private IP ranges (SSRF prevention)
        if (!$isDevelopment) {
            $ip = gethostbyname($parsed['host']);
            if ($this->isPrivateIp($ip)) {
                throw new RuntimeException('Private IP addresses are not allowed');
            }
        }
    }

    /**
     * Check if IP is in private range
     */
    private function isPrivateIp(string $ip): bool
    {
        return filter_var(
            $ip,
            FILTER_VALIDATE_IP,
            FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE
        ) === false;
    }

    /**
     * Filter payload data based on selected fields
     * 
     * OPTIMIZED: Early return, efficient array operations
     * 
     * @param array $payload Original payload data
     * @param array|null $selectedFields Fields to include (null = include all)
     * @return array Filtered payload
     */
    private function filterPayload(array $payload, ?array $selectedFields): array
    {
        // OPTIMIZATION: Early return if no filtering needed
        if ($selectedFields === null || empty($selectedFields)) {
            return $payload;
        }

        $filtered = [];
        
        foreach ($selectedFields as $field) {
            // Handle nested fields with dot notation (e.g., 'author.name')
            if (strpos($field, '.') !== false) {
                $parts = explode('.', $field, 3); // OPTIMIZATION: Limit depth to 3
                $value = $payload;
                foreach ($parts as $part) {
                    if (!isset($value[$part])) {
                        $value = null;
                        break;
                    }
                    $value = $value[$part];
                }
                if ($value !== null) {
                    $this->setNestedValue($filtered, $parts, $value);
                }
            } else {
                // OPTIMIZATION: Direct field access with isset check
                if (isset($payload[$field]) || array_key_exists($field, $payload)) {
                    $filtered[$field] = $payload[$field];
                }
            }
        }

        return $filtered;
    }

    /**
     * Set nested value in array using dot notation path
     */
    private function setNestedValue(array &$array, array $path, $value): void
    {
        $current = &$array;
        foreach ($path as $i => $key) {
            if ($i === count($path) - 1) {
                $current[$key] = $value;
            } else {
                if (!isset($current[$key]) || !is_array($current[$key])) {
                    $current[$key] = [];
                }
                $current = &$current[$key];
            }
        }
    }

    /**
     * Get available payload fields with metadata
     * For frontend to display field selection UI
     * 
     * @return array Payload fields grouped by category
     */
    public function getAvailablePayloadFields(): array
    {
        $grouped = [];
        foreach (self::PAYLOAD_FIELDS as $field => $meta) {
            $category = $meta['category'];
            if (!isset($grouped[$category])) {
                $grouped[$category] = [
                    'name' => $this->getCategoryName($category),
                    'fields' => [],
                ];
            }
            $grouped[$category]['fields'][] = [
                'key' => $field,
                'label' => $meta['label'],
                'description' => $meta['description'],
            ];
        }
        return $grouped;
    }

    /**
     * Get human-readable category name
     */
    private function getCategoryName(string $category): string
    {
        return match($category) {
            'core' => 'Alap mezők',
            'content' => 'Tartalom',
            'meta' => 'Metaadatok',
            'media' => 'Média',
            'user' => 'Felhasználó',
            'custom' => 'Egyéni',
            default => ucfirst($category),
        };
    }

    // =========================================================================
    // WEBHOOK DELIVERY
    // =========================================================================

    /**
     * Send webhook to external URL
     * 
     * @param int $webhookId Webhook configuration ID
     * @param string $event Event type
     * @param array $payload Event payload data
     * @param bool $skipFilter Skip payload field filtering (for test pings)
     * @return WebhookDeliveryResult Delivery result
     */
    public function sendWebhook(int $webhookId, string $event, array $payload, bool $skipFilter = false): WebhookDeliveryResult
    {
        $webhook = $this->getWebhook($webhookId, true);

        if (!$webhook) {
            return new WebhookDeliveryResult(false, error: 'Webhook not found');
        }

        if (!$webhook['is_active']) {
            return new WebhookDeliveryResult(false, error: 'Webhook is inactive');
        }

        // Filter payload based on selected fields (unless skipFilter is true)
        $filteredPayload = $skipFilter 
            ? $payload 
            : $this->filterPayload($payload, $webhook['payload_fields'] ?? null);

        // Prepare payload
        $fullPayload = [
            'event' => $event,
            'timestamp' => time(),
            'data' => $filteredPayload,
        ];
        $jsonPayload = json_encode($fullPayload, JSON_UNESCAPED_UNICODE);
        
        // SECURITY: Validate payload size to prevent DoS via oversized payloads
        $payloadSize = strlen($jsonPayload);
        if ($payloadSize > self::MAX_PAYLOAD_SIZE) {
            error_log("[WEBHOOK] Payload too large ({$payloadSize} bytes > " . self::MAX_PAYLOAD_SIZE . " bytes) for webhook {$webhookId}");
            return new WebhookDeliveryResult(
                false, 
                error: "Payload too large ({$payloadSize} bytes exceeds " . (self::MAX_PAYLOAD_SIZE / 1024) . "KB limit)"
            );
        }

        // Generate signature
        $signatureData = $this->generateSignatureHeader($jsonPayload, $webhook['secret']);

        // Create delivery record
        $deliveryId = $this->createDeliveryRecord($webhookId, $event, $jsonPayload);

        // Send HTTP request with event and delivery ID headers
        $result = $this->executeHttpRequest(
            $webhook['url'],
            $jsonPayload,
            $signatureData,
            $webhook['timeout_seconds'],
            $event,
            $deliveryId
        );

        // Update delivery record
        $this->updateDeliveryRecord($deliveryId, $result);

        return new WebhookDeliveryResult(
            $result['success'],
            $result['status_code'],
            $result['response_body'],
            $result['error'],
            $deliveryId,
            1
        );
    }

    /**
     * Retry failed webhook delivery
     * 
     * @param int $deliveryId Delivery record ID
     * @return WebhookDeliveryResult Retry result
     */
    public function retryDelivery(int $deliveryId): WebhookDeliveryResult
    {
        $db = AuthDatabase::getInstance();
        $stmt = $db->prepare("
            SELECT d.*, w.url, w.secret, w.timeout_seconds, w.retry_count, w.is_active
            FROM webhook_deliveries d
            JOIN webhooks w ON d.webhook_id = w.id
            WHERE d.id = ?
        ");
        $stmt->execute([$deliveryId]);
        $delivery = $stmt->fetch();

        if (!$delivery) {
            return new WebhookDeliveryResult(false, error: 'Delivery record not found');
        }

        if ($delivery['delivered_at']) {
            return new WebhookDeliveryResult(false, error: 'Already delivered successfully');
        }

        if ($delivery['attempts'] >= $delivery['retry_count']) {
            return new WebhookDeliveryResult(false, error: 'Max retry attempts exceeded');
        }

        if (!$delivery['is_active']) {
            return new WebhookDeliveryResult(false, error: 'Webhook is inactive');
        }

        // Decrypt secret
        $secret = $this->decryptSecret($delivery['secret']);

        // Generate new signature with current timestamp
        $signatureData = $this->generateSignatureHeader($delivery['payload'], $secret);

        // Execute request with event and delivery ID headers
        $result = $this->executeHttpRequest(
            $delivery['url'],
            $delivery['payload'],
            $signatureData,
            $delivery['timeout_seconds'],
            $delivery['event'],
            $deliveryId
        );

        // Update delivery record
        $attempts = $delivery['attempts'] + 1;
        $this->updateDeliveryRecordWithAttempt($deliveryId, $result, $attempts);

        return new WebhookDeliveryResult(
            $result['success'],
            $result['status_code'],
            $result['response_body'],
            $result['error'],
            $deliveryId,
            $attempts
        );
    }

    /**
     * Dispatch webhooks for an event
     * 
     * OPTIMIZED: Early return if no webhooks, minimal memory footprint
     * 
     * This is the main method to call when an event occurs.
     * It finds all webhooks subscribed to the event and sends them.
     * 
     * @deprecated Use dispatchEventAsync() for non-blocking delivery
     * @param string $event Event type
     * @param array $payload Event data
     * @param string|null $slotKey Optional slot key for content events filtering
     * @param string|null $slotType Optional slot type (object, list, collection, massive) for content events filtering
     * @return array Array of WebhookDeliveryResult objects
     */
    public function dispatchEvent(string $event, array $payload, ?string $slotKey = null, ?string $slotType = null): array
    {
        // OPTIMIZATION: Early return if webhooks are disabled
        if (!$this->isOutgoingEnabled()) {
            return [];
        }
        
        // SECURITY: Early payload size validation to prevent DoS
        $payloadJson = json_encode($payload);
        if (strlen($payloadJson) > self::MAX_PAYLOAD_SIZE) {
            error_log("[WEBHOOK] Dispatch blocked - payload too large for event {$event}");
            return [new WebhookDeliveryResult(false, error: 'Payload too large')];
        }
        
        // OPTIMIZATION: Quick check if any webhooks exist at all
        if (!$this->hasActiveWebhooks()) {
            return [];
        }

        // OPTIMIZATION: Get filtered webhooks (already optimized query)
        $webhooks = $this->getWebhooksForEvent($event, $slotKey, $slotType);
        
        // OPTIMIZATION: Early return if no webhooks match
        if (empty($webhooks)) {
            return [];
        }
        
        $results = [];

        foreach ($webhooks as $webhook) {
            try {
                // Decrypt secret and headers for sendWebhookOptimized
                $webhook['secret'] = $this->decryptSecret($webhook['secret']);
                
                // Decrypt headers if present
                if (isset($webhook['headers']) && $webhook['headers']) {
                    try {
                        $decryptedHeaders = EncryptionService::decrypt($webhook['headers']);
                        $webhook['headers'] = json_decode($decryptedHeaders, true) ?? [];
                    } catch (\Exception $e) {
                        error_log("[WEBHOOK] Failed to decrypt headers: " . $e->getMessage());
                        $webhook['headers'] = [];
                    }
                } else {
                    $webhook['headers'] = [];
                }
                
                // OPTIMIZATION: Send webhook with minimal payload processing
                $results[] = $this->sendWebhookOptimized($webhook, $event, $payload);
            } catch (\Exception $e) {
                error_log("[WEBHOOK ERROR] Dispatch failed: " . $e->getMessage());
                $results[] = new WebhookDeliveryResult(false, error: $e->getMessage());
            }
            
            // OPTIMIZATION: Free memory after each webhook
            unset($webhook);
        }

        return $results;
    }
    
    /**
     * Queue webhook events for async delivery (non-blocking)
     * 
     * This is the RECOMMENDED method for production use.
     * Instead of blocking the request to send webhooks, it queues them
     * for processing via piggyback (shutdown function) or HTTP endpoint.
     * 
     * @param string $event Event type
     * @param array $payload Event data
     * @param string|null $slotKey Optional slot key for content events filtering
     * @param string|null $slotType Optional slot type
     * @return int Number of webhooks queued
     */
    public function dispatchEventAsync(string $event, array $payload, ?string $slotKey = null, ?string $slotType = null): int
    {
        // Early return if webhooks are disabled
        if (!$this->isOutgoingEnabled()) {
            return 0;
        }
        
        // Quick check if any webhooks exist
        if (!$this->hasActiveWebhooks()) {
            return 0;
        }

        // Get filtered webhooks
        $webhooks = $this->getWebhooksForEvent($event, $slotKey, $slotType);
        
        if (empty($webhooks)) {
            return 0;
        }
        
        $queued = 0;
        $db = AuthDatabase::getInstance();
        
        foreach ($webhooks as $webhook) {
            try {
                $this->queueWebhook($db, $webhook['id'], $event, $payload, $slotKey, $slotType);
                $queued++;
            } catch (\Exception $e) {
                error_log("[WEBHOOK QUEUE ERROR] Failed to queue webhook: " . $e->getMessage());
            }
        }
        
        return $queued;
    }
    
    /**
     * Insert webhook into queue table
     */
    private function queueWebhook(\PDO $db, int $webhookId, string $event, array $payload, ?string $slotKey, ?string $slotType): void
    {
        $jsonPayload = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        
        // SECURITY: Validate payload size before queuing
        $payloadSize = strlen($jsonPayload);
        if ($payloadSize > self::MAX_PAYLOAD_SIZE) {
            error_log("[WEBHOOK QUEUE] Payload too large ({$payloadSize} bytes > " . self::MAX_PAYLOAD_SIZE . " bytes) for webhook {$webhookId}, event {$event}");
            throw new \RuntimeException("Payload too large for queuing ({$payloadSize} bytes)");
        }
        
        $stmt = $db->prepare("
            INSERT INTO webhook_queue 
            (webhook_id, event, payload, slot_key, slot_type, created_at, next_attempt_at, max_attempts)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            $webhookId,
            $event,
            $jsonPayload,
            $slotKey,
            $slotType,
            time(),
            time(), // Immediately processable
            $this->maxRetries
        ]);
    }
    
    /**
     * Send webhook directly (for queue processor)
     * Public method for WebhookQueueService to use
     * 
     * @param int $webhookId Webhook configuration ID
     * @param string $event Event type
     * @param array $payload Event payload
     * @return WebhookDeliveryResult Delivery result
     */
    public function sendWebhookDirect(int $webhookId, string $event, array $payload): WebhookDeliveryResult
    {
        // includeSecret=true, includeHeaders=true to get both decrypted
        $webhook = $this->getWebhook($webhookId, true, true);
        
        if (!$webhook || !$webhook['is_active']) {
            return new WebhookDeliveryResult(false, error: 'Webhook inactive or not found');
        }
        
        return $this->sendWebhookOptimized($webhook, $event, $payload);
    }
    
    /**
     * Send webhook optimized - accepts pre-loaded webhook config
     * 
     * OPTIMIZATION: Avoids redundant database lookup, minimal memory usage
     * 
     * @param array $webhook Pre-loaded webhook configuration (secret should already be decrypted)
     * @param string $event Event type
     * @param array $payload Event payload data
     * @return WebhookDeliveryResult Delivery result
     */
    private function sendWebhookOptimized(array $webhook, string $event, array $payload): WebhookDeliveryResult
    {
        // OPTIMIZATION: Filter payload early to reduce memory
        $filteredPayload = $this->filterPayload($payload, $webhook['payload_fields'] ?? null);
        
        // OPTIMIZATION: Clear original payload reference
        unset($payload);

        // Prepare minimal payload structure
        $fullPayload = [
            'event' => $event,
            'timestamp' => time(),
            'data' => $filteredPayload,
        ];
        
        // OPTIMIZATION: Use JSON_UNESCAPED_SLASHES for smaller payload
        $jsonPayload = json_encode($fullPayload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        
        // Free memory
        unset($fullPayload, $filteredPayload);

        // Use secret directly - it should already be decrypted by getWebhook($id, true)
        $secret = $webhook['secret'];
        
        // Generate signature
        $signatureData = $this->generateSignatureHeader($jsonPayload, $secret);
        
        // Free secret from memory
        unset($secret);

        // Create delivery record (with size limit)
        // OPTIMIZATION: Only store first 16KB of payload in delivery record
        $payloadForStorage = strlen($jsonPayload) > 16384 
            ? substr($jsonPayload, 0, 16384) . '...[truncated]'
            : $jsonPayload;
        $deliveryId = $this->createDeliveryRecord($webhook['id'], $event, $payloadForStorage);
        unset($payloadForStorage);

        // Send HTTP request with event, delivery ID, and custom headers
        $result = $this->executeHttpRequest(
            $webhook['url'],
            $jsonPayload,
            $signatureData,
            $webhook['timeout_seconds'] ?? $this->defaultTimeout,
            $event,
            $deliveryId,
            $webhook['headers'] ?? null  // Pass encrypted headers
        );
        
        // Free memory
        unset($jsonPayload, $signatureData);

        // Update delivery record
        $this->updateDeliveryRecord($deliveryId, $result);

        return new WebhookDeliveryResult(
            $result['success'],
            $result['status_code'],
            $result['response_body'],
            $result['error'],
            $deliveryId,
            1
        );
    }

    /**
     * Schedule a debounced webhook dispatch
     * 
     * Used for slot types that save frequently (collection, list).
     * Only the last event within the debounce window will be sent.
     * 
     * @param string $event Event type
     * @param array $payload Event data
     * @param string|null $slotKey Slot key for debounce grouping
     * @param string|null $slotType Slot type for filtering
     * @param int $debounceSeconds Debounce delay in seconds (default: 10)
     */
    public function scheduleDebounced(
        string $event,
        array $payload,
        ?string $slotKey = null,
        ?string $slotType = null,
        int $debounceSeconds = 10
    ): void {
        if (!$this->isOutgoingEnabled()) {
            return;
        }

        $db = AuthDatabase::getInstance();
        $debounceKey = $slotKey ?? 'global';
        $executeAt = time() + $debounceSeconds;
        
        // Delete any existing pending webhook for this slot (debounce - only latest matters)
        $stmt = $db->prepare("
            DELETE FROM webhook_pending 
            WHERE debounce_key = ? AND event = ?
        ");
        $stmt->execute([$debounceKey, $event]);
        
        // Schedule new webhook
        $stmt = $db->prepare("
            INSERT INTO webhook_pending (debounce_key, event, payload, slot_key, slot_type, execute_at)
            VALUES (?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            $debounceKey,
            $event,
            json_encode($payload),
            $slotKey,
            $slotType,
            $executeAt
        ]);
        
        error_log("[WEBHOOK DEBOUNCE] Scheduled {$event} for slot {$slotKey}, will execute at " . date('Y-m-d H:i:s', $executeAt));
    }

    /**
     * Process pending debounced webhooks
     * 
     * This should be called by a cron job or on page load
     */
    public function processPendingWebhooks(): array
    {
        if (!$this->isOutgoingEnabled()) {
            return [];
        }

        $db = AuthDatabase::getInstance();
        $now = time();
        
        // CLEANUP: Delete stale pending webhooks older than 24 hours
        // These are "zombie" entries from failed processing or server crashes
        $staleThreshold = $now - 86400; // 24 hours ago
        $cleanupStmt = $db->prepare("DELETE FROM webhook_pending WHERE execute_at < ?");
        $cleanupStmt->execute([$staleThreshold]);
        $deletedStale = $cleanupStmt->rowCount();
        if ($deletedStale > 0) {
            error_log("[WEBHOOK CLEANUP] Deleted {$deletedStale} stale pending webhooks (older than 24h)");
        }
        
        // Get all pending webhooks that should be executed now
        $stmt = $db->prepare("
            SELECT id, debounce_key, event, payload, slot_key, slot_type
            FROM webhook_pending
            WHERE execute_at <= ?
        ");
        $stmt->execute([$now]);
        $pending = $stmt->fetchAll();
        
        $results = [];
        
        foreach ($pending as $item) {
            try {
                $payload = json_decode($item['payload'], true);
                $dispatchResults = $this->dispatchEvent(
                    $item['event'],
                    $payload,
                    $item['slot_key'],
                    $item['slot_type']
                );
                $results[] = [
                    'debounce_key' => $item['debounce_key'],
                    'event' => $item['event'],
                    'results' => $dispatchResults
                ];
                
                // Delete processed pending webhook
                $delStmt = $db->prepare("DELETE FROM webhook_pending WHERE id = ?");
                $delStmt->execute([$item['id']]);
                
                error_log("[WEBHOOK DEBOUNCE] Processed pending webhook for slot {$item['slot_key']}");
            } catch (\Exception $e) {
                error_log("[WEBHOOK DEBOUNCE ERROR] Failed to process pending webhook: " . $e->getMessage());
            }
        }
        
        return $results;
    }

    /**
     * Execute HTTP request to webhook URL
     * 
     * SECURITY: DNS Rebinding protection via CURLOPT_RESOLVE
     * OPTIMIZED: Low memory footprint, proper resource cleanup
     * 
     * @param string $url Target URL
     * @param string $payload JSON payload
     * @param array $signatureData Signature data with header
     * @param int $timeout Timeout in seconds
     * @param string|null $event Event type for header
     * @param int|null $deliveryId Delivery ID for header
     * @param array|null $customHeaders Custom headers array (already decrypted) - associative array of name => value
     */
    private function executeHttpRequest(
        string $url,
        string $payload,
        array $signatureData,
        int $timeout,
        ?string $event = null,
        ?int $deliveryId = null,
        ?array $customHeaders = null
    ): array {
        $parsed = parse_url($url);
        $host = $parsed['host'] ?? '';
        $port = $parsed['port'] ?? ($parsed['scheme'] === 'https' ? 443 : 80);
        
        // SECURITY: DNS Rebinding Protection
        // Resolve DNS now and pin it for the curl request to prevent TOCTOU attacks
        $isDevelopment = ($_ENV['APP_ENV'] ?? 'production') === 'development';
        $isLocalhost = in_array($host, ['localhost', '127.0.0.1', '::1']);
        $resolvedIp = null;
        
        if (!$isDevelopment || !$isLocalhost) {
            $resolvedIp = gethostbyname($host);
            
            // Defense in depth: Re-validate IP at execution time
            if ($this->isPrivateIp($resolvedIp)) {
                return [
                    'success' => false,
                    'status_code' => 0,
                    'response_body' => null,
                    'error' => 'DNS resolved to private IP (possible DNS rebinding attack)',
                ];
            }
        }
        
        $ch = curl_init($url);
        
        // Build headers array
        $headers = [
            'Content-Type: application/json',
            'X-Nomad-Signature: ' . $signatureData['header'],
            'X-Webhook-Timestamp: ' . $signatureData['timestamp'],
            'X-Webhook-Signature: sha256=' . $signatureData['signature'],
            'User-Agent: NOMAD-CMS-Webhook/1.0',
            'Expect:', // Disable Expect header to avoid 100-continue delay
        ];
        
        // Add optional headers
        if ($event !== null) {
            $headers[] = 'X-Webhook-Event: ' . $event;
        }
        if ($deliveryId !== null) {
            $headers[] = 'X-Webhook-Delivery: ' . $deliveryId;
        }

        // Add custom headers (already decrypted array)
        if ($customHeaders !== null && !empty($customHeaders)) {
            foreach ($customHeaders as $headerName => $headerValue) {
                // Double-check protected headers at execution time
                $normalizedName = strtolower($headerName);
                $protectedHeaders = ['x-nomad-signature', 'x-webhook-signature', 'x-webhook-timestamp', 
                                    'x-webhook-event', 'x-webhook-delivery', 'content-type', 'host', 
                                    'user-agent', 'content-length', 'transfer-encoding', 'connection'];
                
                if (!in_array($normalizedName, $protectedHeaders, true)) {
                    $headers[] = "{$headerName}: {$headerValue}";
                }
            }
        }

        $curlOptions = [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $payload,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => min($timeout, 30), // OPTIMIZATION: Cap timeout at 30s
            CURLOPT_CONNECTTIMEOUT => 5, // OPTIMIZATION: Reduced from 10 to 5
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_FOLLOWLOCATION => false, // Security: don't follow redirects
            CURLOPT_SSL_VERIFYPEER => true,
            // OPTIMIZATION: Low memory buffer
            CURLOPT_BUFFERSIZE => 8192,
        ];
        
        // SECURITY: Pin DNS resolution to prevent rebinding attacks
        // This forces curl to use our resolved IP instead of doing its own DNS lookup
        if ($resolvedIp !== null) {
            $curlOptions[CURLOPT_RESOLVE] = [
                "{$host}:{$port}:{$resolvedIp}"
            ];
        }
        
        curl_setopt_array($ch, $curlOptions);

        $response = curl_exec($ch);
        $statusCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        
        // OPTIMIZATION: Immediately close curl handle to free resources
        curl_close($ch);

        $success = $statusCode >= 200 && $statusCode < 300;

        return [
            'success' => $success && empty($error),
            'status_code' => $statusCode,
            // OPTIMIZATION: Limit response body to 2KB
            'response_body' => substr($response ?: '', 0, 2048),
            'error' => $error ?: null,
        ];
    }

    // =========================================================================
    // DELIVERY RECORDS
    // =========================================================================

    /**
     * Create delivery record
     */
    private function createDeliveryRecord(int $webhookId, string $event, string $payload): int
    {
        $db = AuthDatabase::getInstance();
        $stmt = $db->prepare("
            INSERT INTO webhook_deliveries (webhook_id, event, payload)
            VALUES (?, ?, ?)
        ");
        $stmt->execute([$webhookId, $event, $payload]);
        $newId = (int)$db->lastInsertId();
        
        // Smart cleanup - run more frequently (5% chance, AGGRESSIVE)
        if (rand(1, 100) <= 5) {
            $this->smartCleanupDeliveryRecords($webhookId);
        }
        
        return $newId;
    }

    /**
     * Smart cleanup of delivery records (AGGRESSIVE MODE)
     * 
     * AGGRESSIVE POLICY:
     * - Keep successful deliveries for 3 days max, last 10 per webhook
     * - Keep failed deliveries for 14 days (for debugging)
     * - Run cleanup more frequently (5% of requests)
     * 
     * @param int $webhookId Webhook ID to cleanup
     */
    private function smartCleanupDeliveryRecords(int $webhookId): void
    {
        $db = AuthDatabase::getInstance();
        
        // Policy 1: Delete SUCCESSFUL deliveries older than 3 days, keeping last 10 (AGGRESSIVE)
        $stmt = $db->prepare("
            DELETE FROM webhook_deliveries
            WHERE webhook_id = ?
            AND delivered_at IS NOT NULL
            AND created_at < datetime('now', '-3 days')
            AND id NOT IN (
                SELECT id FROM webhook_deliveries
                WHERE webhook_id = ?
                AND delivered_at IS NOT NULL
                ORDER BY created_at DESC
                LIMIT 10
            )
        ");
        $stmt->execute([$webhookId, $webhookId]);
        
        // Policy 2: Delete FAILED deliveries older than 14 days (AGGRESSIVE)
        $stmt = $db->prepare("
            DELETE FROM webhook_deliveries
            WHERE webhook_id = ?
            AND failed_at IS NOT NULL
            AND created_at < datetime('now', '-14 days')
        ");
        $stmt->execute([$webhookId]);
    }

    /**
     * Global cleanup of all webhook delivery records (AGGRESSIVE MODE)
     * Call this from a scheduled task (e.g., daily cron or piggyback)
     * 
     * @return array{success_deleted: int, failed_deleted: int}
     */
    public function globalCleanupDeliveryRecords(): array
    {
        $db = AuthDatabase::getInstance();
        
        // Delete old successful deliveries (> 3 days, keep 20 per webhook) - AGGRESSIVE
        $stmt = $db->prepare("
            DELETE FROM webhook_deliveries
            WHERE delivered_at IS NOT NULL
            AND created_at < datetime('now', '-3 days')
            AND id NOT IN (
                SELECT id FROM (
                    SELECT id, webhook_id,
                           ROW_NUMBER() OVER (PARTITION BY webhook_id ORDER BY created_at DESC) as rn
                    FROM webhook_deliveries
                    WHERE delivered_at IS NOT NULL
                ) ranked
                WHERE rn <= 20
            )
        ");
        $stmt->execute();
        $successDeleted = $stmt->rowCount();
        
        // Delete old failed deliveries (> 14 days) - AGGRESSIVE
        $stmt = $db->prepare("
            DELETE FROM webhook_deliveries
            WHERE failed_at IS NOT NULL
            AND created_at < datetime('now', '-14 days')
        ");
        $stmt->execute();
        $failedDeleted = $stmt->rowCount();
        
        return [
            'success_deleted' => $successDeleted,
            'failed_deleted' => $failedDeleted,
        ];
    }

    /**
     * Update delivery record after attempt
     */
    private function updateDeliveryRecord(int $id, array $result): void
    {
        $db = AuthDatabase::getInstance();
        
        if ($result['success']) {
            $stmt = $db->prepare("
                UPDATE webhook_deliveries
                SET response_status = ?, response_body = ?, delivered_at = datetime('now')
                WHERE id = ?
            ");
            $stmt->execute([$result['status_code'], $result['response_body'], $id]);
        } else {
            $stmt = $db->prepare("
                UPDATE webhook_deliveries
                SET response_status = ?, response_body = ?, failed_at = datetime('now')
                WHERE id = ?
            ");
            $stmt->execute([$result['status_code'], $result['error'] ?? $result['response_body'], $id]);
        }
    }

    /**
     * Update delivery record with retry attempt
     */
    private function updateDeliveryRecordWithAttempt(int $id, array $result, int $attempts): void
    {
        $db = AuthDatabase::getInstance();
        
        if ($result['success']) {
            $stmt = $db->prepare("
                UPDATE webhook_deliveries
                SET response_status = ?, response_body = ?, delivered_at = datetime('now'), attempts = ?
                WHERE id = ?
            ");
            $stmt->execute([$result['status_code'], $result['response_body'], $attempts, $id]);
        } else {
            // Calculate next retry time with exponential backoff
            $delay = pow($this->retryDelayMultiplier, $attempts) * 60; // minutes
            
            $stmt = $db->prepare("
                UPDATE webhook_deliveries
                SET response_status = ?, response_body = ?, failed_at = datetime('now'), 
                    attempts = ?, next_retry_at = datetime('now', '+' || ? || ' seconds')
                WHERE id = ?
            ");
            $stmt->execute([
                $result['status_code'],
                $result['error'] ?? $result['response_body'],
                $attempts,
                $delay,
                $id
            ]);
        }
    }

    /**
     * Get delivery history for a webhook
     * 
     * @param int $webhookId Webhook ID
     * @param int $limit Maximum records to return
     * @return array Delivery records
     */
    public function getDeliveries(int $webhookId, int $limit = 50): array
    {
        $db = AuthDatabase::getInstance();
        $stmt = $db->prepare("
            SELECT * FROM webhook_deliveries
            WHERE webhook_id = ?
            ORDER BY created_at DESC
            LIMIT ?
        ");
        $stmt->execute([$webhookId, $limit]);
        return $stmt->fetchAll();
    }

    /**
     * Get pending deliveries that need retry
     * 
     * @return array Delivery records ready for retry
     */
    public function getPendingRetries(): array
    {
        $db = AuthDatabase::getInstance();
        $stmt = $db->prepare("
            SELECT d.*, w.retry_count
            FROM webhook_deliveries d
            JOIN webhooks w ON d.webhook_id = w.id
            WHERE d.delivered_at IS NULL
              AND d.attempts < w.retry_count
              AND (d.next_retry_at IS NULL OR d.next_retry_at <= datetime('now'))
              AND w.is_active = 1
            ORDER BY d.created_at ASC
            LIMIT 100
        ");
        $stmt->execute();
        return $stmt->fetchAll();
    }

    /**
     * Process pending retries (call from cron job)
     */
    public function processPendingRetries(): array
    {
        $pending = $this->getPendingRetries();
        $results = [];

        foreach ($pending as $delivery) {
            $results[] = $this->retryDelivery($delivery['id']);
        }

        return $results;
    }

    // =========================================================================
    // INCOMING WEBHOOK ENDPOINTS
    // =========================================================================

    /**
     * Available signature formats for incoming webhooks
     */
    public const SIGNATURE_FORMATS = [
        'auto' => [
            'label' => 'Automatikus felismerés',
            'description' => 'Automatikusan felismeri a signature formátumot',
        ],
        'sha256_simple' => [
            'label' => 'HMAC-SHA256 (egyszerű)',
            'description' => 'HMAC-SHA256(payload, secret) - pl. egyszerű webhookok',
        ],
        'sha256_prefixed' => [
            'label' => 'sha256=SIGNATURE',
            'description' => 'HMAC-SHA256 "sha256=" előtaggal - GitHub stílus',
        ],
        'sha256_timestamped' => [
            'label' => 't=TIMESTAMP,v1=SIGNATURE',
            'description' => 'HMAC-SHA256(timestamp.payload, secret) - Stripe stílus',
        ],
        'sha1_simple' => [
            'label' => 'HMAC-SHA1 (egyszerű)',
            'description' => 'HMAC-SHA1(payload, secret) - legacy rendszerek',
        ],
        'sha1_prefixed' => [
            'label' => 'sha1=SIGNATURE',
            'description' => 'HMAC-SHA1 "sha1=" előtaggal - régi GitHub',
        ],
        'sha512_simple' => [
            'label' => 'HMAC-SHA512 (egyszerű)',
            'description' => 'HMAC-SHA512(payload, secret) - magas biztonság',
        ],
        'base64' => [
            'label' => 'Base64 kódolt signature',
            'description' => 'Base64 kódolt HMAC-SHA256 - egyes API-k',
        ],
    ];

    /**
     * Common signature headers
     */
    public const COMMON_SIGNATURE_HEADERS = [
        'X-Webhook-Signature' => 'Általános webhook signature',
        'X-Hub-Signature-256' => 'GitHub (SHA-256)',
        'X-Hub-Signature' => 'GitHub (legacy SHA-1)',
        'Stripe-Signature' => 'Stripe',
        'X-Signature' => 'Általános signature',
        'X-Hook-Signature' => 'Hook szolgáltatások',
        'X-Payload-Signature' => 'Payload CMS',
        'X-Nomad-Signature' => 'Nomad CMS',
    ];

    /**
     * Common timestamp headers
     */
    public const COMMON_TIMESTAMP_HEADERS = [
        '' => 'Nincs (signature-ben van / nem használ)',
        'X-Webhook-Timestamp' => 'Általános timestamp',
        'X-Timestamp' => 'Egyszerű timestamp',
        'X-Hook-Timestamp' => 'Hook szolgáltatások',
        'X-Request-Timestamp' => 'Request timestamp',
    ];

    /**
     * Create incoming webhook endpoint
     * 
     * @param int $userId Owner user ID
     * @param string $name Friendly name
     * @param string $endpointKey URL path key (unique, alphanumeric with dashes)
     * @param string $handler Handler class/function name
     * @param string $signatureHeader Header name for signature (default: X-Webhook-Signature)
     * @param string|null $timestampHeader Header name for timestamp (null if not used)
     * @param string $signatureFormat Format of signature (default: auto)
     * @return array Created endpoint data with plaintext secret
     */
    public function createEndpoint(
        int $userId,
        string $name,
        string $endpointKey,
        string $handler,
        string $signatureHeader = 'X-Webhook-Signature',
        ?string $timestampHeader = null,
        string $signatureFormat = 'auto'
    ): array {
        // Validate endpoint key
        if (!preg_match('/^[a-z0-9-]{3,64}$/', $endpointKey)) {
            throw new RuntimeException('Endpoint key must be 3-64 lowercase alphanumeric characters or dashes');
        }

        // Validate signature format
        if (!array_key_exists($signatureFormat, self::SIGNATURE_FORMATS)) {
            $signatureFormat = 'auto';
        }

        // Sanitize header names (only allow safe characters)
        $signatureHeader = preg_replace('/[^a-zA-Z0-9_-]/', '', $signatureHeader);
        if (empty($signatureHeader)) {
            $signatureHeader = 'X-Webhook-Signature';
        }
        
        if ($timestampHeader !== null) {
            $timestampHeader = preg_replace('/[^a-zA-Z0-9_-]/', '', $timestampHeader);
            if (empty($timestampHeader)) {
                $timestampHeader = null;
            }
        }

        $plaintextSecret = $this->generateSecret();
        $encryptedSecret = $this->encryptSecret($plaintextSecret);

        $db = AuthDatabase::getInstance();
        $stmt = $db->prepare("
            INSERT INTO webhook_endpoints (user_id, name, endpoint_key, secret, handler, signature_header, timestamp_header, signature_format)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            $userId,
            $name,
            $endpointKey,
            $encryptedSecret,
            $handler,
            $signatureHeader,
            $timestampHeader,
            $signatureFormat
        ]);

        return [
            'id' => (int)$db->lastInsertId(),
            'user_id' => $userId,
            'name' => $name,
            'endpoint_key' => $endpointKey,
            'handler' => $handler,
            'signature_header' => $signatureHeader,
            'timestamp_header' => $timestampHeader,
            'signature_format' => $signatureFormat,
            'is_active' => true,
            'secret' => $plaintextSecret,
            'url' => $this->getEndpointUrl($endpointKey),
            'created_at' => date('c'),
        ];
    }

    /**
     * Get incoming endpoint by key
     */
    public function getEndpointByKey(string $endpointKey): ?array
    {
        $db = AuthDatabase::getInstance();
        $stmt = $db->prepare("SELECT * FROM webhook_endpoints WHERE endpoint_key = ?");
        $stmt->execute([$endpointKey]);
        $endpoint = $stmt->fetch();

        if (!$endpoint) {
            return null;
        }

        $endpoint['is_active'] = (bool)$endpoint['is_active'];
        // Ensure signature config fields have defaults
        $endpoint['signature_header'] = $endpoint['signature_header'] ?? 'X-Webhook-Signature';
        $endpoint['timestamp_header'] = $endpoint['timestamp_header'] ?? null;
        $endpoint['signature_format'] = $endpoint['signature_format'] ?? 'auto';
        
        return $endpoint;
    }

    /**
     * Get all endpoints for user
     */
    public function getEndpointsForUser(int $userId): array
    {
        $db = AuthDatabase::getInstance();
        $stmt = $db->prepare("
            SELECT id, user_id, name, endpoint_key, handler, is_active, 
                   signature_header, timestamp_header, signature_format,
                   last_called_at, created_at
            FROM webhook_endpoints
            WHERE user_id = ?
            ORDER BY created_at DESC
        ");
        $stmt->execute([$userId]);
        
        return array_map(function($e) {
            $e['is_active'] = (bool)$e['is_active'];
            $e['url'] = $this->getEndpointUrl($e['endpoint_key']);
            $e['signature_header'] = $e['signature_header'] ?? 'X-Webhook-Signature';
            $e['timestamp_header'] = $e['timestamp_header'] ?? null;
            $e['signature_format'] = $e['signature_format'] ?? 'auto';
            return $e;
        }, $stmt->fetchAll());
    }

    /**
     * Update endpoint
     */
    public function updateEndpoint(int $id, array $data): bool
    {
        $allowedFields = ['name', 'handler', 'is_active', 'signature_header', 'timestamp_header', 'signature_format'];
        $updates = [];
        $params = [];

        foreach ($allowedFields as $field) {
            if (array_key_exists($field, $data)) {
                $value = $data[$field];
                
                if ($field === 'is_active') {
                    $value = $value ? 1 : 0;
                }
                
                // Validate and sanitize signature header
                if ($field === 'signature_header') {
                    $value = preg_replace('/[^a-zA-Z0-9_-]/', '', $value);
                    if (empty($value)) {
                        $value = 'X-Webhook-Signature';
                    }
                }
                
                // Validate and sanitize timestamp header (can be null/empty)
                if ($field === 'timestamp_header') {
                    if (!empty($value)) {
                        $value = preg_replace('/[^a-zA-Z0-9_-]/', '', $value);
                        if (empty($value)) {
                            $value = null;
                        }
                    } else {
                        $value = null;
                    }
                }
                
                // Validate signature format
                if ($field === 'signature_format') {
                    if (!array_key_exists($value, self::SIGNATURE_FORMATS)) {
                        $value = 'auto';
                    }
                }
                
                $updates[] = "{$field} = ?";
                $params[] = $value;
            }
        }

        if (empty($updates)) {
            return false;
        }

        $params[] = $id;
        $db = AuthDatabase::getInstance();
        $sql = "UPDATE webhook_endpoints SET " . implode(', ', $updates) . " WHERE id = ?";
        $stmt = $db->prepare($sql);
        return $stmt->execute($params);
    }

    /**
     * Delete endpoint
     */
    public function deleteEndpoint(int $id): bool
    {
        $db = AuthDatabase::getInstance();
        $stmt = $db->prepare("DELETE FROM webhook_endpoints WHERE id = ?");
        return $stmt->execute([$id]);
    }

    /**
     * Rotate endpoint secret
     */
    public function rotateEndpointSecret(int $id): string
    {
        $plaintextSecret = $this->generateSecret();
        $encryptedSecret = $this->encryptSecret($plaintextSecret);

        $db = AuthDatabase::getInstance();
        $stmt = $db->prepare("UPDATE webhook_endpoints SET secret = ? WHERE id = ?");
        $stmt->execute([$encryptedSecret, $id]);

        return $plaintextSecret;
    }

    /**
     * Update endpoint last called timestamp
     */
    public function touchEndpoint(int $id): void
    {
        $db = AuthDatabase::getInstance();
        $stmt = $db->prepare("UPDATE webhook_endpoints SET last_called_at = datetime('now') WHERE id = ?");
        $stmt->execute([$id]);
    }

    /**
     * Get full URL for endpoint
     * Note: In production, API is at /api/ subdirectory
     */
    private function getEndpointUrl(string $endpointKey): string
    {
        $baseUrl = rtrim($_ENV['APP_URL'] ?? 'http://localhost:8000', '/');
        return "{$baseUrl}/api/endpoints/webhook-receiver.php?endpoint={$endpointKey}";
    }

    // =========================================================================
    // CONFIGURATION HELPERS
    // =========================================================================

    // OPTIMIZATION: Cache outgoing status for request lifetime
    private ?bool $outgoingEnabledCache = null;
    
    // OPTIMIZATION: Cache for active webhook count
    private ?int $activeWebhookCountCache = null;

    /**
     * Check if outgoing webhooks are enabled
     * 
     * OPTIMIZED: Cached for request lifetime
     */
    public function isOutgoingEnabled(): bool
    {
        if ($this->outgoingEnabledCache === null) {
            $this->outgoingEnabledCache = filter_var($_ENV['WEBHOOKS_OUTGOING_ENABLED'] ?? true, FILTER_VALIDATE_BOOLEAN);
        }
        return $this->outgoingEnabledCache;
    }
    
    /**
     * Quick check if any active webhooks exist
     * 
     * OPTIMIZED: Fast count query, cached for request
     */
    public function hasActiveWebhooks(): bool
    {
        if ($this->activeWebhookCountCache === null) {
            $db = AuthDatabase::getInstance();
            $stmt = $db->prepare("SELECT COUNT(*) FROM webhooks WHERE is_active = 1 LIMIT 1");
            $stmt->execute();
            $this->activeWebhookCountCache = (int)$stmt->fetchColumn();
        }
        return $this->activeWebhookCountCache > 0;
    }

    /**
     * Check if incoming webhooks are enabled
     */
    public function isIncomingEnabled(): bool
    {
        return filter_var($_ENV['WEBHOOKS_INCOMING_ENABLED'] ?? true, FILTER_VALIDATE_BOOLEAN);
    }

    /**
     * Get available webhook events
     */
    public function getAvailableEvents(): array
    {
        return self::EVENTS;
    }

    /**
     * Send a test webhook with sample payload
     */
    public function sendTestWebhook(int $webhookId): WebhookDeliveryResult
    {
        $testPayload = [
            'message' => 'This is a test webhook from NOMAD CMS',
            'webhook_id' => $webhookId,
            'test' => true,
        ];

        // Skip payload filtering for test pings - send full test payload
        return $this->sendWebhook($webhookId, 'test.ping', $testPayload, true);
    }
}
