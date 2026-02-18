<?php
/**
 * MassiveEncryption - Helper for encrypting/decrypting massive slot data
 * 
 * Provides encryption/decryption for massive slot JSON data using
 * the existing EncryptionService (AES-256 via Defuse Crypto).
 * 
 * When a slot is marked as encrypted:
 * - Data is encrypted before storage
 * - Data is decrypted on retrieval
 * - Server-side filtering/sorting cannot operate on encrypted JSON fields
 * 
 * Blind Indexing Support:
 * - Fields marked as 'searchable: true' get blind index tokens
 * - Tokens are deterministic HMAC hashes enabling exact-match search
 * - Searchable tokens stored in FTS index for encrypted records
 * - Search works on tokens without decrypting data
 */

declare(strict_types=1);

namespace NomadCMS\Database;

use NomadCMS\Security\EncryptionService;
use NomadCMS\Security\BlindIndexService;

final class MassiveEncryption
{
    /**
     * Encrypt the data array for storage
     * Converts array to JSON, then encrypts the JSON string
     * 
     * @param array $data The data to encrypt
     * @return string Encrypted ciphertext (Defuse format, starts with 'def')
     */
    public static function encryptData(array $data): string
    {
        $jsonData = json_encode($data, JSON_UNESCAPED_UNICODE);
        return EncryptionService::encrypt($jsonData);
    }
    
    /**
     * Decrypt the stored ciphertext back to data array
     * 
     * @param string $encrypted The encrypted ciphertext
     * @return array The decrypted data
     * @throws \RuntimeException If decryption fails
     */
    public static function decryptData(string $encrypted): array
    {
        if (empty($encrypted)) {
            return [];
        }
        
        $jsonData = EncryptionService::decrypt($encrypted);
        $data = json_decode($jsonData, true);
        
        return is_array($data) ? $data : [];
    }
    
    /**
     * Check if encryption is available (key configured)
     */
    public static function isAvailable(): bool
    {
        return EncryptionService::isConfigured();
    }
    
    /**
     * Check if data appears to be encrypted
     * Defuse ciphertext starts with "def" prefix
     */
    public static function isEncrypted(string $data): bool
    {
        return EncryptionService::isEncrypted($data);
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // BLIND INDEXING SUPPORT
    // ═══════════════════════════════════════════════════════════════════════════
    
    /**
     * Generate blind index tokens for searchable fields
     * 
     * Creates deterministic HMAC tokens that can be searched without
     * exposing the plaintext. Only specified fields are indexed.
     * 
     * @param array $data The plaintext data before encryption
     * @param array $searchableFields List of field names to index
     * @return string Space-separated tokens for FTS storage
     */
    public static function generateBlindIndex(array $data, array $searchableFields): string
    {
        if (empty($searchableFields) || !BlindIndexService::isConfigured()) {
            return '';
        }
        
        // Extract only searchable fields from data
        $fieldValues = [];
        foreach ($searchableFields as $field) {
            if (isset($data[$field]) && $data[$field] !== '' && $data[$field] !== null) {
                $value = $data[$field];
                
                // Handle different value types
                if (is_string($value)) {
                    $fieldValues[$field] = $value;
                } elseif (is_numeric($value)) {
                    $fieldValues[$field] = (string) $value;
                } elseif (is_array($value)) {
                    // For arrays (e.g., tags), flatten to string values
                    $stringValues = array_filter($value, 'is_string');
                    if (!empty($stringValues)) {
                        $fieldValues[$field] = $stringValues;
                    }
                }
            }
        }
        
        if (empty($fieldValues)) {
            return '';
        }
        
        // Generate tokens for each field
        $tokens = BlindIndexService::createTokensForFields($fieldValues);
        
        // Build searchable content string
        return BlindIndexService::buildSearchableContent($tokens);
    }
    
    /**
     * Generate search tokens from a search query
     * 
     * Creates tokens for the search query that can match stored blind indexes.
     * Returns tokens for all searchable fields.
     * 
     * @param string $query The search query
     * @param array $searchableFields List of field names to search in
     * @return array Array of search tokens (one per field)
     */
    public static function generateSearchTokens(string $query, array $searchableFields): array
    {
        if (empty($query) || empty($searchableFields) || !BlindIndexService::isConfigured()) {
            return [];
        }
        
        return BlindIndexService::createSearchTokensForFields($query, $searchableFields);
    }
    
    /**
     * Build FTS match query for blind index search
     * 
     * Creates an OR query that matches any of the field tokens.
     * This allows searching across multiple searchable fields.
     * 
     * @param string $query The search query
     * @param array $searchableFields List of field names to search
     * @return string|null FTS MATCH query string or null if invalid
     */
    public static function buildBlindSearchQuery(string $query, array $searchableFields): ?string
    {
        $tokens = self::generateSearchTokens($query, $searchableFields);
        
        if (empty($tokens)) {
            return null;
        }
        
        // For FTS5, we search for any of the tokens
        // Each token is the hashed value for the query in that field's context
        $tokenValues = array_values($tokens);
        
        // Return first token for exact match (all tokens hash to same value)
        // In a multi-field search, we check if ANY token matches
        return implode(' OR ', $tokenValues);
    }
    
    /**
     * Check if blind indexing is available
     */
    public static function isBlindIndexAvailable(): bool
    {
        return BlindIndexService::isConfigured();
    }
}
