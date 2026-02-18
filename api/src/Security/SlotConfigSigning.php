<?php
/**
 * SlotConfigSigning - Nomad Request Signing for Slot Configuration
 * 
 * Verifies signed slot configurations sent from the frontend with timestamp validation.
 * Uses the user's JWT token as the signing key - no separate secret needed!
 * 
 * Security Model:
 * - Frontend generates HMAC-SHA256 signatures using the JWT token as key
 * - Signature = HMAC(jwt_token, "slot:{slotKey}:encrypted:{true|false}:ts:{timestamp}:v2")
 * - Backend verifies signatures using the same JWT from Authorization header
 * - Validates timestamp freshness (within 5 min window) to prevent replay attacks
 * - Invalid/missing signatures or expired timestamps default to unencrypted (safe fallback)
 */

declare(strict_types=1);

namespace NomadCMS\Security;

final class SlotConfigSigning
{
    private const SIGNATURE_VERSION = 'v2';
    
    /**
     * Maximum allowed time difference in seconds (5 minutes)
     * This window accounts for network latency and clock skew
     */
    private const MAX_TIMESTAMP_DRIFT_SECONDS = 300;
    
    /**
     * Get current server timestamp in UTC (Unix timestamp)
     */
    public static function getCurrentTimestamp(): int
    {
        return time();
    }
    
    /**
     * Validate if a timestamp is within acceptable drift window
     * 
     * @param int $timestamp Unix timestamp from client
     * @return bool True if timestamp is valid (within window)
     */
    public static function isTimestampValid(int $timestamp): bool
    {
        $now = self::getCurrentTimestamp();
        $diff = abs($now - $timestamp);
        
        return $diff <= self::MAX_TIMESTAMP_DRIFT_SECONDS;
    }
    
    /**
     * Verify a signed slot configuration with timestamp
     * 
     * @param string $slotKey The slot identifier
     * @param bool $encrypted Whether encryption is claimed by the request
     * @param int $timestamp Unix timestamp from request
     * @param string $signature The HMAC signature from frontend
     * @return bool True if signature is valid and timestamp is fresh
     */
    public static function verify(string $slotKey, bool $encrypted, int $timestamp, string $signature): bool
    {
        if (empty($slotKey) || empty($signature)) {
            return false;
        }
        
        // Validate timestamp freshness first
        if (!self::isTimestampValid($timestamp)) {
            error_log(sprintf(
                'SlotConfigSigning: Timestamp expired or invalid for slot "%s" (received: %d, now: %d, diff: %d seconds)',
                $slotKey,
                $timestamp,
                self::getCurrentTimestamp(),
                abs(self::getCurrentTimestamp() - $timestamp)
            ));
            return false;
        }
        
        $secret = self::getSigningSecret();
        if (empty($secret)) {
            // No secret configured - cannot verify, fail closed
            error_log('SlotConfigSigning: NOMAD_SIGNING_SECRET not configured');
            return false;
        }
        
        $expected = self::generateSignature($slotKey, $encrypted, $timestamp, $secret);
        
        // Constant-time comparison to prevent timing attacks
        return hash_equals($expected, $signature);
    }
    
    /**
     * Generate a signature for a slot config with current timestamp
     * Primarily for testing and reference - frontend generates these per-request
     * 
     * @param string $slotKey The slot identifier
     * @param bool $encrypted Whether encryption is enabled
     * @param int|null $timestamp Optional timestamp (uses current if not provided)
     * @return array{signature: string, timestamp: int} The HMAC-SHA256 signature and timestamp
     */
    public static function sign(string $slotKey, bool $encrypted, ?int $timestamp = null): array
    {
        $secret = self::getSigningSecret();
        if (empty($secret)) {
            throw new \RuntimeException('NOMAD_SIGNING_SECRET not configured');
        }
        
        $ts = $timestamp ?? self::getCurrentTimestamp();
        
        return [
            'signature' => self::generateSignature($slotKey, $encrypted, $ts, $secret),
            'timestamp' => $ts
        ];
    }
    
    /**
     * Generate signature from components including timestamp
     */
    private static function generateSignature(string $slotKey, bool $encrypted, int $timestamp, string $secret): string
    {
        // Payload format: "slot:slotKey:encrypted:true:ts:1234567890:v2"
        $payload = sprintf(
            'slot:%s:encrypted:%s:ts:%d:%s',
            $slotKey,
            $encrypted ? 'true' : 'false',
            $timestamp,
            self::SIGNATURE_VERSION
        );
        
        return hash_hmac('sha256', $payload, $secret);
    }
    
    /**
     * Get JWT token from Authorization header
     * This is used as the signing key
     */
    private static function getSigningSecret(): string
    {
        $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        
        // Extract Bearer token
        if (preg_match('/^Bearer\s+(.+)$/i', $authHeader, $matches)) {
            return $matches[1];
        }
        
        return '';
    }
    
    /**
     * Extract slot config from request headers
     * Returns null if headers are missing, signature is invalid, or timestamp expired
     * 
     * @param string $slotKey The slot being accessed
     * @return array{encrypted: bool, searchableFields: array, timestamp: int}|null Config if valid, null otherwise
     */
    public static function extractFromRequest(string $slotKey): ?array
    {
        // Get headers (case-insensitive)
        $encryptedHeader = $_SERVER['HTTP_X_NOMAD_SLOT_ENCRYPTED'] ?? null;
        $signatureHeader = $_SERVER['HTTP_X_NOMAD_SLOT_SIGNATURE'] ?? null;
        $timestampHeader = $_SERVER['HTTP_X_NOMAD_SLOT_TIMESTAMP'] ?? null;
        $searchableFieldsHeader = $_SERVER['HTTP_X_NOMAD_SLOT_SEARCHABLE_FIELDS'] ?? '';
        
        // If no signed config sent, return null (caller should use default)
        if ($encryptedHeader === null || $signatureHeader === null || $timestampHeader === null) {
            return null;
        }
        
        // Parse headers
        $encrypted = strtolower($encryptedHeader) === 'true';
        $timestamp = (int) $timestampHeader;
        
        // Parse searchable fields (comma-separated list)
        $searchableFields = [];
        if (!empty($searchableFieldsHeader)) {
            $searchableFields = array_filter(
                array_map('trim', explode(',', $searchableFieldsHeader)),
                fn($field) => !empty($field) && preg_match('/^[a-zA-Z0-9_]+$/', $field)
            );
        }
        
        // Validate timestamp is a reasonable Unix timestamp (after year 2020)
        if ($timestamp < 1577836800) { // Jan 1, 2020
            error_log(sprintf(
                'SlotConfigSigning: Invalid timestamp format for slot "%s" (received: %d)',
                $slotKey,
                $timestamp
            ));
            return null;
        }
        
        // Verify signature (includes timestamp validation)
        if (!self::verify($slotKey, $encrypted, $timestamp, $signatureHeader)) {
            // Invalid signature or expired timestamp - already logged in verify()
            return null;
        }
        
        // Valid signature and fresh timestamp - trust the config
        return [
            'encrypted' => $encrypted,
            'searchableFields' => $searchableFields,
            'timestamp' => $timestamp
        ];
    }
    
    /**
     * Check if signing is possible (has JWT token in request)
     */
    public static function isConfigured(): bool
    {
        return !empty(self::getSigningSecret());
    }
    
    /**
     * Get the current time drift window in seconds
     */
    public static function getMaxTimestampDrift(): int
    {
        return self::MAX_TIMESTAMP_DRIFT_SECONDS;
    }
    
    /**
     * Detailed timestamp validation result for debugging
     * 
     * @param int $timestamp Unix timestamp to validate
     * @return array{valid: bool, now: int, received: int, diff: int, maxDrift: int}
     */
    public static function debugTimestamp(int $timestamp): array
    {
        $now = self::getCurrentTimestamp();
        $diff = abs($now - $timestamp);
        
        return [
            'valid' => $diff <= self::MAX_TIMESTAMP_DRIFT_SECONDS,
            'now' => $now,
            'received' => $timestamp,
            'diff' => $diff,
            'maxDrift' => self::MAX_TIMESTAMP_DRIFT_SECONDS
        ];
    }
}
