<?php
/**
 * BlindIndexService - Searchable Encryption via Blind Indexing
 * 
 * Implements blind indexing for encrypted data, allowing search functionality
 * without exposing plaintext. Uses HMAC-SHA256 to create deterministic,
 * one-way tokens that can be matched without decryption.
 * 
 * Security Model:
 * - Uses a dedicated blind index key (separate from encryption key)
 * - Deterministic: same plaintext always produces same token
 * - One-way: cannot recover plaintext from token
 * - Key-dependent: tokens are useless without the key
 * 
 * Best Practices Implemented:
 * - Separate key from encryption key (defense in depth)
 * - Case-insensitive search support (lowercasing before hashing)
 * - Token truncation to prevent rainbow tables while maintaining uniqueness
 * - Collision resistance balanced with search performance
 * 
 * Usage:
 * - Mark fields as 'searchable: true' in encrypted massive slots
 * - Blind index tokens are stored alongside encrypted data
 * - Search queries are tokenized and matched against stored tokens
 * 
 * @see https://paragonie.com/blog/2017/05/building-searchable-encrypted-databases-with-php-and-sql
 */

declare(strict_types=1);

namespace NomadCMS\Security;

use RuntimeException;

final class BlindIndexService
{
    /**
     * Token length in bytes (before hex encoding)
     * 16 bytes = 32 hex chars = 2^128 combinations
     * Provides good collision resistance while keeping tokens compact
     */
    private const TOKEN_BYTES = 16;
    
    /**
     * Minimum input length for indexing (skip very short values)
     */
    private const MIN_INPUT_LENGTH = 1;
    
    /**
     * Get the blind index key from environment
     * Uses separate key from encryption for defense in depth
     * Falls back to ENCRYPTION_KEY if BLIND_INDEX_KEY not set
     */
    private static function getKey(): string
    {
        $key = $_ENV['BLIND_INDEX_KEY'] ?? $_ENV['ENCRYPTION_KEY'] ?? null;
        
        if (empty($key)) {
            throw new RuntimeException(
                'BLIND_INDEX_KEY (or ENCRYPTION_KEY) not configured. ' .
                'Generate with: openssl rand -hex 32'
            );
        }
        
        return $key;
    }
    
    /**
     * Generate a blind index token for a single value
     * 
     * The token is deterministic - same input always produces same output.
     * This allows exact match searching without revealing the plaintext.
     * 
     * @param string $value The plaintext value to index
     * @param string $context Optional context to namespace the token (e.g., field name)
     * @param bool $caseInsensitive Whether to lowercase before hashing (default: true)
     * @return string Hex-encoded blind index token
     */
    public static function createToken(
        string $value,
        string $context = '',
        bool $caseInsensitive = true
    ): string {
        if (strlen($value) < self::MIN_INPUT_LENGTH) {
            return '';
        }
        
        // Normalize input
        $normalized = $caseInsensitive ? mb_strtolower($value, 'UTF-8') : $value;
        
        // Add context to prevent cross-field token matching
        $input = $context ? "{$context}:{$normalized}" : $normalized;
        
        // Generate HMAC and truncate
        $hash = hash_hmac('sha256', $input, self::getKey(), true);
        $truncated = substr($hash, 0, self::TOKEN_BYTES);
        
        return bin2hex($truncated);
    }
    
    /**
     * Generate blind index tokens for multiple values
     * Useful for indexing multiple fields at once
     * 
     * @param array<string, string|array> $fieldValues Map of field name => value(s)
     * @param bool $caseInsensitive Whether to lowercase before hashing
     * @return array<string, string|array> Map of field name => token(s)
     */
    public static function createTokensForFields(
        array $fieldValues,
        bool $caseInsensitive = true
    ): array {
        $tokens = [];
        
        foreach ($fieldValues as $field => $value) {
            if (is_array($value)) {
                // Handle array values (e.g., tags)
                $tokens[$field] = array_map(
                    fn($v) => is_string($v) ? self::createToken($v, $field, $caseInsensitive) : '',
                    $value
                );
            } elseif (is_string($value)) {
                $tokens[$field] = self::createToken($value, $field, $caseInsensitive);
            }
        }
        
        return $tokens;
    }
    
    /**
     * Generate prefix tokens for partial matching (starts-with search)
     * Creates tokens for progressively longer prefixes of the input
     * 
     * @param string $value The plaintext value
     * @param string $context Field name context
     * @param int $minLength Minimum prefix length to index (default: 3)
     * @param int $maxPrefixes Maximum number of prefix tokens (default: 10)
     * @return array Array of prefix tokens
     */
    public static function createPrefixTokens(
        string $value,
        string $context = '',
        int $minLength = 3,
        int $maxPrefixes = 10
    ): array {
        $normalized = mb_strtolower($value, 'UTF-8');
        $length = mb_strlen($normalized, 'UTF-8');
        $tokens = [];
        
        for ($i = $minLength; $i <= $length && count($tokens) < $maxPrefixes; $i++) {
            $prefix = mb_substr($normalized, 0, $i, 'UTF-8');
            $tokens[] = self::createToken($prefix, $context . ':prefix', true);
        }
        
        return $tokens;
    }
    
    /**
     * Create a searchable token from a search query
     * Used when searching - creates the same token format as stored tokens
     * 
     * @param string $query The search query
     * @param string $context Field name context
     * @param bool $caseInsensitive Whether to lowercase (default: true)
     * @return string The search token
     */
    public static function createSearchToken(
        string $query,
        string $context = '',
        bool $caseInsensitive = true
    ): string {
        return self::createToken($query, $context, $caseInsensitive);
    }
    
    /**
     * Create search tokens for multiple fields
     * Used when searching across multiple searchable fields
     * 
     * @param string $query The search query
     * @param array $fields List of field names to search
     * @param bool $caseInsensitive Whether to lowercase
     * @return array<string, string> Map of field => search token
     */
    public static function createSearchTokensForFields(
        string $query,
        array $fields,
        bool $caseInsensitive = true
    ): array {
        $tokens = [];
        
        foreach ($fields as $field) {
            $tokens[$field] = self::createSearchToken($query, $field, $caseInsensitive);
        }
        
        return $tokens;
    }
    
    /**
     * Build concatenated index string for FTS-style storage
     * Combines all searchable field tokens into a single string
     * 
     * @param array<string, string> $tokens Field tokens
     * @return string Space-separated tokens for FTS storage
     */
    public static function buildSearchableContent(array $tokens): string
    {
        $parts = [];
        
        foreach ($tokens as $field => $token) {
            if (is_array($token)) {
                foreach ($token as $t) {
                    if (!empty($t)) {
                        $parts[] = $t;
                    }
                }
            } elseif (!empty($token)) {
                $parts[] = $token;
            }
        }
        
        return implode(' ', $parts);
    }
    
    /**
     * Check if blind indexing is available (key configured)
     */
    public static function isConfigured(): bool
    {
        try {
            self::getKey();
            return true;
        } catch (\Exception $e) {
            return false;
        }
    }
    
    /**
     * Validate that a token looks correct (for debugging)
     */
    public static function isValidToken(string $token): bool
    {
        // Token should be hex encoded and exactly TOKEN_BYTES * 2 chars
        return strlen($token) === self::TOKEN_BYTES * 2 
            && ctype_xdigit($token);
    }
}
