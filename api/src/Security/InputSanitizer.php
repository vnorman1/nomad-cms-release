<?php
/**
 * NOMAD CMS - Input Sanitizer Service
 * 
 * Centralized input validation and sanitization.
 * All user input should pass through this service before processing.
 * 
 * Features:
 * - XSS prevention
 * - SQL injection safe output
 * - Type validation
 * - Whitelist-based filtering
 */

declare(strict_types=1);

namespace NomadCMS\Security;

final class InputSanitizer
{
    // ==========================================================================
    // STRING SANITIZATION
    // ==========================================================================
    
    /**
     * Sanitize a string for safe output (XSS prevention)
     * Use for any user-provided text that will be displayed
     */
    public static function string(?string $input, int $maxLength = 1000): ?string
    {
        if ($input === null) {
            return null;
        }
        
        // Trim whitespace
        $input = trim($input);
        
        // Remove null bytes
        $input = str_replace("\0", '', $input);
        
        // Convert special chars to HTML entities
        $input = htmlspecialchars($input, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        
        // Enforce max length
        if (strlen($input) > $maxLength) {
            $input = substr($input, 0, $maxLength);
        }
        
        return $input;
    }
    
    /**
     * Sanitize plain text - no HTML allowed
     * Use for names, titles, descriptions
     */
    public static function plainText(?string $input, int $maxLength = 500): ?string
    {
        if ($input === null) {
            return null;
        }
        
        // Strip all HTML tags
        $input = strip_tags($input);
        
        // Remove dangerous characters
        $input = preg_replace('/[<>"\'&]/', '', $input);
        
        return self::string($input, $maxLength);
    }
    
    /**
     * Sanitize a slug (URL-safe string)
     */
    public static function slug(?string $input, int $maxLength = 100): ?string
    {
        if ($input === null) {
            return null;
        }
        
        // Convert to lowercase
        $input = strtolower(trim($input));
        
        // Replace spaces and underscores with hyphens
        $input = preg_replace('/[\s_]+/', '-', $input);
        
        // Remove all non-alphanumeric except hyphens
        $input = preg_replace('/[^a-z0-9\-]/', '', $input);
        
        // Remove multiple consecutive hyphens
        $input = preg_replace('/-+/', '-', $input);
        
        // Trim hyphens from ends
        $input = trim($input, '-');
        
        return substr($input, 0, $maxLength);
    }
    
    // ==========================================================================
    // EMAIL VALIDATION
    // ==========================================================================
    
    /**
     * Validate and sanitize email address
     * Returns null if invalid
     */
    public static function email(?string $input): ?string
    {
        if ($input === null || $input === '') {
            return null;
        }
        
        $input = strtolower(trim($input));
        
        // Remove null bytes and control chars
        $input = preg_replace('/[\x00-\x1F\x7F]/', '', $input);
        
        $email = filter_var($input, FILTER_VALIDATE_EMAIL);
        
        if ($email === false) {
            return null;
        }
        
        // Additional checks
        if (strlen($email) > 254) {
            return null;
        }
        
        return $email;
    }
    
    // ==========================================================================
    // NUMERIC VALIDATION
    // ==========================================================================
    
    /**
     * Validate and return integer
     * Returns null if invalid or out of range
     */
    public static function integer(
        mixed $input, 
        ?int $min = null, 
        ?int $max = null
    ): ?int {
        if ($input === null || $input === '') {
            return null;
        }
        
        if (is_string($input)) {
            // Only allow numeric strings
            if (!ctype_digit(ltrim($input, '-'))) {
                return null;
            }
        }
        
        $value = filter_var($input, FILTER_VALIDATE_INT);
        
        if ($value === false) {
            return null;
        }
        
        if ($min !== null && $value < $min) {
            return null;
        }
        
        if ($max !== null && $value > $max) {
            return null;
        }
        
        return $value;
    }
    
    /**
     * Validate positive integer (for IDs, counts, etc.)
     */
    public static function positiveInt(mixed $input): ?int
    {
        return self::integer($input, 1);
    }
    
    /**
     * Validate non-negative integer
     */
    public static function nonNegativeInt(mixed $input): ?int
    {
        return self::integer($input, 0);
    }
    
    // ==========================================================================
    // BOOLEAN VALIDATION
    // ==========================================================================
    
    /**
     * Validate and return boolean
     */
    public static function boolean(mixed $input): bool
    {
        if ($input === null) {
            return false;
        }
        
        return filter_var($input, FILTER_VALIDATE_BOOLEAN);
    }
    
    // ==========================================================================
    // ARRAY VALIDATION
    // ==========================================================================
    
    /**
     * Validate array contains only allowed values (whitelist)
     */
    public static function whitelist(mixed $input, array $allowed): mixed
    {
        if ($input === null) {
            return null;
        }
        
        if (is_array($input)) {
            return array_values(array_intersect($input, $allowed));
        }
        
        return in_array($input, $allowed, true) ? $input : null;
    }
    
    /**
     * Sanitize an array of strings
     */
    public static function stringArray(?array $input, int $maxItems = 100): array
    {
        if ($input === null || !is_array($input)) {
            return [];
        }
        
        $result = [];
        $count = 0;
        
        foreach ($input as $item) {
            if ($count >= $maxItems) {
                break;
            }
            
            if (is_string($item)) {
                $sanitized = self::plainText($item);
                if ($sanitized !== null && $sanitized !== '') {
                    $result[] = $sanitized;
                    $count++;
                }
            }
        }
        
        return $result;
    }
    
    // ==========================================================================
    // JSON VALIDATION
    // ==========================================================================
    
    /**
     * Parse and validate JSON input
     * Returns null on invalid JSON
     */
    public static function json(?string $input): ?array
    {
        if ($input === null || $input === '') {
            return null;
        }
        
        $decoded = json_decode($input, true);
        
        if (json_last_error() !== JSON_ERROR_NONE) {
            return null;
        }
        
        return $decoded;
    }
    
    // ==========================================================================
    // KEY/IDENTIFIER VALIDATION
    // ==========================================================================
    
    /**
     * Validate slot key (alphanumeric with underscores/hyphens)
     */
    public static function slotKey(?string $input): ?string
    {
        if ($input === null || $input === '') {
            return null;
        }
        
        $input = trim($input);
        
        // Only allow alphanumeric, underscores, hyphens
        if (!preg_match('/^[a-zA-Z0-9_\-]+$/', $input)) {
            return null;
        }
        
        // Max length 100
        if (strlen($input) > 100) {
            return null;
        }
        
        return $input;
    }
    
    /**
     * Validate UUID format
     */
    public static function uuid(?string $input): ?string
    {
        if ($input === null || $input === '') {
            return null;
        }
        
        $input = strtolower(trim($input));
        
        // Standard UUID format with or without hyphens
        if (preg_match('/^[0-9a-f]{32}$/', $input)) {
            return $input; // Without hyphens
        }
        
        if (preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/', $input)) {
            return str_replace('-', '', $input); // Normalize to without hyphens
        }
        
        return null;
    }
    
    // ==========================================================================
    // FIELD WHITELIST FOR UPDATES
    // ==========================================================================
    
    /**
     * Filter object to only contain allowed fields
     * Use for UPDATE operations to prevent mass assignment
     */
    public static function allowedFields(array $input, array $allowedFields): array
    {
        return array_intersect_key($input, array_flip($allowedFields));
    }
    
    /**
     * Validate user update data with specific field sanitization
     */
    public static function userUpdateData(array $input): array
    {
        $result = [];
        
        // Email
        if (isset($input['email'])) {
            $email = self::email($input['email']);
            if ($email !== null) {
                $result['email'] = $email;
            }
        }
        
        // Is admin (boolean)
        if (isset($input['is_admin'])) {
            $result['is_admin'] = self::boolean($input['is_admin']);
        }
        
        // Password (only if provided and not empty)
        if (isset($input['password']) && is_string($input['password']) && $input['password'] !== '') {
            // Don't sanitize password - just validate length
            if (strlen($input['password']) >= 8 && strlen($input['password']) <= 128) {
                $result['password'] = $input['password'];
            }
        }
        
        return $result;
    }
    
    // ==========================================================================
    // API KEY NAME VALIDATION
    // ==========================================================================
    
    /**
     * Sanitize API key name
     */
    public static function apiKeyName(?string $input): ?string
    {
        if ($input === null || $input === '') {
            return null;
        }
        
        // Remove dangerous characters but allow more for readability
        $input = preg_replace('/[<>"\'&\\\\]/', '', trim($input));
        
        // Max 100 characters
        if (strlen($input) > 100 || strlen($input) < 1) {
            return null;
        }
        
        return $input;
    }

    /**
     * Sanitize filename for media library
     * Prevents directory traversal and unsafe characters
     */
    public static function filename(?string $input): ?string
    {
        if ($input === null || $input === '') {
            return null;
        }
        
        // Remove any null bytes first
        $input = str_replace("\0", '', $input);
        
        // SECURITY: Strip any URL encoding that could bypass checks
        $input = rawurldecode($input);
        
        // SECURITY: Remove path traversal sequences BEFORE basename
        $input = str_replace(['../', '..\\', '..'], '', $input);
        
        // Get basename to prevent directory traversal
        $input = basename(trim($input));
        
        // SECURITY: Check for path traversal again after basename
        if (strpos($input, '..') !== false || strpos($input, '/') !== false || strpos($input, '\\') !== false) {
            return null;
        }
        
        // Only allow safe filename characters (alphanumeric, underscore, hyphen, dot)
        if (!preg_match('/^[a-zA-Z0-9_\-\.]+$/', $input)) {
            // If it contains unsafe chars, reject it
            return null;
        }
        
        // SECURITY: Prevent hidden files (starting with dot)
        if (str_starts_with($input, '.')) {
            return null;
        }
        
        // Prevent double extensions that could be exploits
        if (preg_match('/\.(php|phtml|phar|htaccess|sh|cgi|pl|py|rb|asp|aspx|jsp)\./i', $input)) {
            return null;
        }
        
        // Prevent dangerous extensions at end
        if (preg_match('/\.(php|phtml|phar|htaccess|sh|cgi|pl|py|rb|asp|aspx|jsp)$/i', $input)) {
            return null;
        }
        
        // Max length 255
        if (strlen($input) > 255) {
            return null;
        }
        
        return $input;
    }
    
    // ==========================================================================
    // FORGE SESSION VALIDATION (Added for Forge chunked upload security)
    // ==========================================================================
    
    /**
     * Validate Forge session ID format
     * Session IDs are generated by handshake.php using bin2hex(random_bytes(16))
     * which produces a 32-character lowercase hex string
     * 
     * @param string|null $input The session ID to validate
     * @return string|null Validated session ID or null if invalid
     */
    public static function forgeSessionId(?string $input): ?string
    {
        if ($input === null || $input === '') {
            return null;
        }
        
        $input = trim($input);
        
        // SECURITY: Strict format - exactly 32 lowercase hex characters
        // This prevents path traversal attacks (../, ~, etc.)
        if (!preg_match('/^[a-f0-9]{32}$/', $input)) {
            return null;
        }
        
        return $input;
    }
    
    /**
     * Validate chunk index for Forge uploads
     * 
     * @param mixed $input The chunk index to validate
     * @param int $maxChunks Maximum allowed chunk index (default: 100000)
     * @return int|null Validated chunk index or null if invalid
     */
    public static function forgeChunkIndex(mixed $input, int $maxChunks = 100000): ?int
    {
        $value = self::nonNegativeInt($input);
        
        if ($value === null) {
            return null;
        }
        
        if ($value > $maxChunks) {
            return null;
        }
        
        return $value;
    }
    
    /**
     * Validate target slot name for Forge import
     * Must start with a letter, contain only alphanumeric and underscores
     * 
     * @param string|null $input The slot name to validate
     * @param int $maxLength Maximum allowed length (default: 64)
     * @return string|null Validated slot name or null if invalid
     */
    public static function forgeTargetSlot(?string $input, int $maxLength = 64): ?string
    {
        if ($input === null || $input === '') {
            return null;
        }
        
        $input = trim($input);
        
        // SECURITY: Must start with letter, alphanumeric and underscore only
        // This prevents SQL injection in table names
        if (!preg_match('/^[a-zA-Z][a-zA-Z0-9_]{0,' . ($maxLength - 1) . '}$/', $input)) {
            return null;
        }
        
        return $input;
    }
    
    /**
     * Validate that a file path doesn't escape a base directory
     * 
     * @param string $filePath The file path to check
     * @param string $baseDir The base directory that should contain the file
     * @return bool True if the path is safe, false if it escapes the base
     */
    public static function isPathSafe(string $filePath, string $baseDir): bool
    {
        $realBase = realpath($baseDir);
        $realPath = realpath($filePath);
        
        // If realpath returns false, the path doesn't exist or is invalid
        if ($realBase === false) {
            return false;
        }
        
        // Normalize paths for cross-platform compatibility (Windows uses backslashes)
        $realBase = str_replace('\\', '/', $realBase);
        $separator = '/';
        
        // For files that don't exist yet, check the directory
        if ($realPath === false) {
            $parentDir = dirname($filePath);
            $realParent = realpath($parentDir);
            
            if ($realParent === false) {
                return false;
            }
            
            // Normalize for Windows
            $realParent = str_replace('\\', '/', $realParent);
            
            return strpos($realParent . $separator, $realBase . $separator) === 0;
        }
        
        // Normalize for Windows
        $realPath = str_replace('\\', '/', $realPath);
        
        // File exists - verify it's within the base directory
        return strpos($realPath . $separator, $realBase . $separator) === 0;
    }
}
