<?php
/**
 * NOMAD CMS - Static Cache Service v2
 * Per-Slot Folder Structure with Dynamic Identifier Detection
 * 
 * Generates static JSON files in a hierarchical folder structure:
 * - Each slot gets its own directory: /static/content/{slot}/
 * - Each slot has a manifest.json with metadata
 * - Collection items are stored as individual {identifier}.json files
 * 
 * Features:
 * - Atomic file writes (temp + rename)
 * - Dynamic identifier detection (slug, id, sku, name, title)
 * - Collection chunking for large datasets
 * - Automatic cleanup of orphaned files
 */

declare(strict_types=1);

namespace NomadCMS\Services;

use NomadCMS\Database\ContentDatabase;

final class StaticCacheService
{
    /**
     * Cache directory path
     */
    private static ?string $cacheDir = null;
    
    /**
     * Slot types that should be cached (public content)
     * Massive types are excluded (API-only)
     */
    private const CACHEABLE_TYPES = ['object', 'list', 'collection'];
    
    /**
     * Allowed status values for published content
     */
    private const ALLOWED_STATUSES = ['stabil', 'mukodo', 'published', 'active'];
    
    /**
     * Default chunk size for large collections
     */
    private const DEFAULT_CHUNK_SIZE = 100;
    
    /**
     * Priority order for identifier detection
     */
    private const SLUG_FIELDS = ['slug', 'url_key', 'permalink', 'handle'];
    private const ID_FIELDS = ['id', '_id', 'uuid', 'sku', 'code', 'product_id'];
    private const NAME_FIELDS = ['name', 'title', 'label'];
    
    /**
     * Debounce tracking for meta regeneration
     */
    private static ?float $lastMetaRegenTime = null;
    
    // =========================================================================
    // INITIALIZATION
    // =========================================================================
    
    /**
     * Check if static cache is enabled
     */
    private static function isEnabled(): bool
    {
        return CacheSettingsService::getInstance()->isEnabled();
    }

    /**
     * Initialize cache directory
     */
    private static function init(): void
    {
        if (self::$cacheDir !== null) {
            return;
        }
        
        self::$cacheDir = dirname(__DIR__, 2) . '/static/content/';
        
        if (!is_dir(self::$cacheDir)) {
            mkdir(self::$cacheDir, 0755, true);
        }
    }
    
    /**
     * Ensure a slot directory exists
     */
    private static function ensureSlotDirectory(string $slotKey): string
    {
        self::init();
        
        $sanitized = self::sanitizeFilename($slotKey);
        
        // Double check for empty directory names
        if (empty($sanitized)) {
            throw new \InvalidArgumentException('Cannot create directory for empty slot key');
        }
        
        $slotDir = self::$cacheDir . $sanitized . '/';
        
        if (!is_dir($slotDir)) {
            mkdir($slotDir, 0755, true);
        }
        
        return $slotDir;
    }
    
    /**
     * Load schema definition
     */
    private static function loadSchema(): ?array
    {
        $schemaPath = dirname(__DIR__, 2) . '/data/nomad.schema.json';
        if (file_exists($schemaPath)) {
            $json = file_get_contents($schemaPath);
            if ($json) {
                return json_decode($json, true);
            }
        }
        return null;
    }
    
    /**
     * Get slot definition from schema
     */
    private static function getSlotDefinition(string $slotKey): ?array
    {
        $schema = self::loadSchema();
        return $schema['slots'][$slotKey] ?? null;
    }
    
    // =========================================================================
    // IDENTIFIER DETECTION
    // =========================================================================
    
    /**
     * Detect the best identifier field for collection items
     * 
     * Priority:
     * 1. Explicit schema setting (slugField)
     * 2. Common slug-like fields
     * 3. Unique identifier fields
     * 4. Name-based fallback
     * 5. Array index
     */
    private static function detectItemIdentifier(?array $slotSchema, array $firstItem): string
    {
        // 1. Explicit schema setting
        if (!empty($slotSchema['slugField'])) {
            return $slotSchema['slugField'];
        }
        
        // 2. Common slug-like fields
        foreach (self::SLUG_FIELDS as $field) {
            if (isset($firstItem[$field]) && !empty($firstItem[$field])) {
                return $field;
            }
        }
        
        // 3. Unique identifier fields
        foreach (self::ID_FIELDS as $field) {
            if (isset($firstItem[$field])) {
                return $field;
            }
        }
        
        // 4. Name-based fallback
        foreach (self::NAME_FIELDS as $field) {
            if (isset($firstItem[$field]) && !empty($firstItem[$field])) {
                return $field;
            }
        }
        
        // 5. Last resort: array index
        return '_index';
    }
    
    /**
     * Get identifier value from item
     */
    private static function getItemIdentifier(array $item, string $identifierField, int $index): string
    {
        if ($identifierField === '_index') {
            return (string) $index;
        }
        
        $value = $item[$identifierField] ?? null;
        
        if ($value === null || $value === '') {
            return (string) $index;
        }
        
        return self::sanitizeForIdentifier($value);
    }
    
    /**
     * Sanitize value for use as filename/identifier
     */
    private static function sanitizeForIdentifier(mixed $value): string
    {
        $str = (string) $value;
        
        // Convert Hungarian/special characters
        $str = strtr($str, [
            'á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ö' => 'o', 'ő' => 'o',
            'ú' => 'u', 'ü' => 'u', 'ű' => 'u',
            'Á' => 'a', 'É' => 'e', 'Í' => 'i', 'Ó' => 'o', 'Ö' => 'o', 'Ő' => 'o',
            'Ú' => 'u', 'Ü' => 'u', 'Ű' => 'u',
            'ä' => 'a', 'ë' => 'e', 'ï' => 'i', 'ô' => 'o', 'û' => 'u',
            'ñ' => 'n', 'ç' => 'c', 'ß' => 'ss',
        ]);
        
        // Lowercase and replace non-alphanumeric
        $str = strtolower($str);
        $str = preg_replace('/[^a-z0-9]+/', '-', $str);
        $str = trim($str, '-');
        
        return $str ?: 'unnamed';
    }
    
    /**
     * Sanitize slot key for use as filename/directory
     */
    private static function sanitizeFilename(string $key): string
    {
        return preg_replace('/[^a-zA-Z0-9_\-]/', '_', $key);
    }
    
    // =========================================================================
    // CONTENT FILTERING & CLEANING
    // =========================================================================
    
    /**
     * Internal fields to remove from cache output
     * These are frontend/CMS internal tracking fields
     */
    private const INTERNAL_FIELDS = [
        '_dndId',        // Drag and drop tracking ID
        '_isPending',    // Pending upload marker
        '_localId',      // Local temporary ID
        '_dirty',        // Dirty tracking flag
        '_selected',     // UI selection state
        '_expanded',     // UI expansion state
        '_temp',         // Temporary data
    ];
    
    /**
     * Clean data for static cache output
     * - Removes internal fields (_dndId, _isPending, etc.)
     * - Filters out empty/null blocks
     * - Recursively cleans nested structures
     * 
     * @param mixed $data Data to clean
     * @return mixed Cleaned data
     */
    private static function cleanDataForCache(mixed $data): mixed
    {
        if (!is_array($data)) {
            return $data;
        }
        
        // Check if this is a blocks array (ContentBlock[])
        // Blocks have structure: [{id, type, data}, ...]
        if (self::isBlocksArray($data)) {
            return self::cleanBlocksArray($data);
        }
        
        // Check if sequential array (list of items)
        if (array_is_list($data)) {
            return array_map([self::class, 'cleanDataForCache'], $data);
        }
        
        // Associative array - clean recursively and remove internal fields
        $cleaned = [];
        foreach ($data as $key => $value) {
            // Skip internal fields
            if (in_array($key, self::INTERNAL_FIELDS, true)) {
                continue;
            }
            
            // Skip fields starting with underscore (convention for internal)
            if (is_string($key) && str_starts_with($key, '_') && strlen($key) > 1) {
                // Allow some underscore fields like '_id' if needed
                $allowedUnderscoreFields = ['_id'];
                if (!in_array($key, $allowedUnderscoreFields, true)) {
                    continue;
                }
            }
            
            // Recursively clean value
            $cleaned[$key] = self::cleanDataForCache($value);
        }
        
        return $cleaned;
    }
    
    /**
     * Check if array is a blocks array (ContentBlock[])
     */
    private static function isBlocksArray(array $data): bool
    {
        if (empty($data) || !array_is_list($data)) {
            return false;
        }
        
        // Check first element for block structure
        $first = $data[0];
        if (!is_array($first)) {
            return false;
        }
        
        // Blocks have 'id', 'type', and 'data' keys
        return isset($first['id']) && isset($first['type']) && array_key_exists('data', $first);
    }
    
    /**
     * Clean blocks array - remove empty blocks and clean data
     */
    private static function cleanBlocksArray(array $blocks): array
    {
        $cleaned = [];
        
        foreach ($blocks as $block) {
            if (!is_array($block)) {
                continue;
            }
            
            // Skip blocks with null/empty data (unfinished blocks)
            $blockData = $block['data'] ?? null;
            if ($blockData === null || $blockData === '' || $blockData === []) {
                continue;
            }
            
            // Clean the block
            $cleanedBlock = [
                'id' => $block['id'],
                'type' => $block['type'],
                'data' => self::cleanDataForCache($blockData),
            ];
            
            $cleaned[] = $cleanedBlock;
        }
        
        return $cleaned;
    }

    /**
     * Filter content to only include published items
     */
    private static function filterPublishedContent(string $slotKey, mixed $data): mixed
    {
        if (!is_array($data)) {
            return $data;
        }

        // Check if associative array (single object) -> skip filtering
        if (array_keys($data) !== range(0, count($data) - 1)) {
           return $data; 
        }

        $slotDef = self::getSlotDefinition($slotKey);
        $publishedField = $slotDef['publishedField'] ?? null;

        return array_values(array_filter($data, function ($item) use ($publishedField) {
            if (!is_array($item)) {
                return true;
            }

            // 1. Explicit Schema Setting
            if ($publishedField) {
                return !empty($item[$publishedField]);
            }

            // 2. Status Field Convention
            if (isset($item['status'])) {
                return in_array($item['status'], self::ALLOWED_STATUSES);
            }

            // 3. Implicit Boolean Fields
            $implicitFields = ['published', 'isPublished', 'active', 'isActive'];
            foreach ($implicitFields as $field) {
                if (isset($item[$field])) {
                    return (bool)$item[$field];
                }
            }

            // Default: Include if no status/published info found
            return true;
        }));
    }
    
    /**
     * Check if data contains large binary content
     */
    private static function containsLargeBinaryData(mixed $data, int $threshold = 50000): bool
    {
        if (!is_array($data)) {
            return false;
        }
        
        $json = json_encode($data);
        if ($json === false) {
            return false;
        }
        
        if (preg_match('/data:[^;]+;base64,[A-Za-z0-9+\/=]{' . $threshold . ',}/', $json)) {
            return true;
        }
        
        return false;
    }
    
    // =========================================================================
    // MAIN GENERATION ENTRY POINT
    // =========================================================================
    
    /**
     * Generate static cache for a slot
     * Routes to appropriate method based on slot type
     * 
     * @param string $key Slot key
     * @param mixed $data Slot data
     * @param string|null $slotType Optional slot type
     * @param bool $skipMetaRegeneration Skip global manifest regeneration
     * @return bool Success
     */
    public static function generateForSlot(string $key, mixed $data, ?string $slotType = null, bool $skipMetaRegeneration = false): bool
    {
        if (!self::isEnabled()) {
            return false;
        }
        
        // Skip empty keys
        if (empty(trim($key))) {
            error_log("[StaticCache] Skipping empty slot key");
            return false;
        }
        
        self::init();
        
        // Get slot type from schema if not provided
        if ($slotType === null) {
            $slotDef = self::getSlotDefinition($key);
            $slotType = $slotDef['type'] ?? 'object';
        }
        
        // Skip massive types (API-only)
        if ($slotType === 'massive') {
            error_log("[StaticCache] Skipping massive slot: {$key} (API-only)");
            return false;
        }
        
        // Skip binary data
        if (self::containsLargeBinaryData($data)) {
            error_log("[StaticCache] Skipping {$key}: contains large binary data");
            return false;
        }
        
        // Filter published content
        $data = self::filterPublishedContent($key, $data);
        
        // Clean data for cache output (remove internal fields, empty blocks, etc.)
        $data = self::cleanDataForCache($data);
        
        // Route to appropriate method
        $result = match($slotType) {
            'object' => self::generateObjectSlot($key, $data),
            'list' => self::generateListSlot($key, $data),
            'collection' => self::generateCollectionSlot($key, $data),
            default => self::generateObjectSlot($key, $data),
        };
        
        // Regenerate global manifest
        if ($result && !$skipMetaRegeneration) {
            self::regenerateMetaFilesDebounced();
        }
        
        return $result;
    }
    
    // =========================================================================
    // SLOT TYPE GENERATORS
    // =========================================================================
    
    /**
     * Generate cache for an object slot
     * Creates: {slot}/manifest.json with data inline
     */
    private static function generateObjectSlot(string $slotKey, mixed $data): bool
    {
        $slotDir = self::ensureSlotDirectory($slotKey);
        
        $manifest = [
            'slot' => $slotKey,
            'type' => 'object',
            'generated_at' => date('c'),
            'data' => $data,
        ];
        
        $success = self::atomicWriteJson($slotDir . 'manifest.json', $manifest);
        
        if ($success) {
            error_log("[StaticCache] Generated object slot: {$slotKey}");
        }
        
        return $success;
    }
    
    /**
     * Generate cache for a list slot
     * Creates: {slot}/manifest.json with items inline
     */
    private static function generateListSlot(string $slotKey, mixed $data): bool
    {
        $slotDir = self::ensureSlotDirectory($slotKey);
        
        $items = is_array($data) ? array_values($data) : [];
        
        $manifest = [
            'slot' => $slotKey,
            'type' => 'list',
            'generated_at' => date('c'),
            'itemCount' => count($items),
            'items' => $items,
        ];
        
        $success = self::atomicWriteJson($slotDir . 'manifest.json', $manifest);
        
        if ($success) {
            error_log("[StaticCache] Generated list slot: {$slotKey} ({$manifest['itemCount']} items)");
        }
        
        return $success;
    }
    
    /**
     * Generate cache for a collection slot
     * Creates: 
     * - {slot}/manifest.json with index
     * - {slot}/{identifier}.json for each item
     * - {slot}/chunk_N.json for large collections
     */
    private static function generateCollectionSlot(string $slotKey, mixed $data): bool
    {
        $slotDir = self::ensureSlotDirectory($slotKey);
        $slotDef = self::getSlotDefinition($slotKey);
        
        $items = is_array($data) ? array_values($data) : [];
        
        if (empty($items)) {
            // Empty collection
            $manifest = [
                'slot' => $slotKey,
                'type' => 'collection',
                'generated_at' => date('c'),
                'itemCount' => 0,
                'identifierField' => null,
                'index' => [],
            ];
            
            return self::atomicWriteJson($slotDir . 'manifest.json', $manifest);
        }
        
        // Detect identifier field
        $identifierField = self::detectItemIdentifier($slotDef, $items[0]);
        
        // Build index and generate item files
        $index = [];
        $validIdentifiers = [];
        $chunkSize = self::getChunkSize();
        $hasChunks = count($items) >= $chunkSize;
        $chunks = [];
        
        foreach ($items as $i => $item) {
            $identifier = self::getItemIdentifier($item, $identifierField, $i);
            $validIdentifiers[] = $identifier;
            
            // Build index entry (meta only)
            $indexEntry = [];
            
            // Always include identifier
            if ($identifierField !== '_index') {
                $indexEntry[$identifierField] = $item[$identifierField] ?? $identifier;
            } else {
                $indexEntry['_index'] = $i;
            }
            
            // Include common meta fields if they exist
            $metaFields = ['title', 'name', 'label', 'updated_at', 'created_at'];
            foreach ($metaFields as $field) {
                if (isset($item[$field]) && $field !== $identifierField) {
                    $indexEntry[$field] = $item[$field];
                }
            }
            
            $index[] = $indexEntry;
            
            // Generate individual item file
            $itemFile = [
                'slot' => $slotKey,
                $identifierField => $identifier,
                'generated_at' => date('c'),
                'data' => $item,
            ];
            
            self::atomicWriteJson($slotDir . $identifier . '.json', $itemFile);
        }
        
        // Generate chunks if needed
        if ($hasChunks) {
            $chunkedItems = array_chunk($items, $chunkSize);
            
            foreach ($chunkedItems as $chunkIndex => $chunkItems) {
                // Create chunk with meta for each item
                $chunkData = [
                    'slot' => $slotKey,
                    'chunk' => $chunkIndex,
                    'generated_at' => date('c'),
                    'identifierField' => $identifierField,
                    'items' => array_map(function($item) use ($identifierField, $slotDef) {
                        // Include basic fields for chunk listing
                        $entry = [];
                        
                        // Include identifier
                        if (isset($item[$identifierField])) {
                            $entry[$identifierField] = $item[$identifierField];
                        }
                        
                        // Include common display fields
                        $displayFields = ['title', 'name', 'label', 'price', 'category', 'status'];
                        foreach ($displayFields as $field) {
                            if (isset($item[$field])) {
                                $entry[$field] = $item[$field];
                            }
                        }
                        
                        return $entry;
                    }, $chunkItems),
                ];
                
                $chunkFilename = "chunk_{$chunkIndex}.json";
                self::atomicWriteJson($slotDir . $chunkFilename, $chunkData);
                
                $chunks[] = [
                    'index' => $chunkIndex,
                    'path' => $chunkFilename,
                    'count' => count($chunkItems),
                ];
            }
        }
        
        // Build manifest
        $manifest = [
            'slot' => $slotKey,
            'type' => 'collection',
            'generated_at' => date('c'),
            'itemCount' => count($items),
            'identifierField' => $identifierField,
            'index' => $index,
        ];
        
        if ($hasChunks) {
            $manifest['hasChunks'] = true;
            $manifest['chunkSize'] = $chunkSize;
            $manifest['chunks'] = $chunks;
        }
        
        $success = self::atomicWriteJson($slotDir . 'manifest.json', $manifest);
        
        // Cleanup orphaned files
        self::cleanupOrphanedItems($slotKey, $validIdentifiers, $hasChunks ? count($chunks) : 0);
        
        if ($success) {
            error_log("[StaticCache] Generated collection slot: {$slotKey} ({$manifest['itemCount']} items, identifier: {$identifierField})");
        }
        
        return $success;
    }
    
    // =========================================================================
    // FILE OPERATIONS
    // =========================================================================
    
    /**
     * Atomic write JSON to file
     */
    private static function atomicWriteJson(string $filepath, array $data): bool
    {
        $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
        
        if ($json === false) {
            error_log("[StaticCache] JSON encode failed for: {$filepath}");
            return false;
        }
        
        $tempPath = $filepath . '.tmp.' . uniqid();
        
        if (file_put_contents($tempPath, $json) === false) {
            error_log("[StaticCache] Failed to write temp file: {$tempPath}");
            return false;
        }
        
        chmod($tempPath, 0644);
        
        if (!rename($tempPath, $filepath)) {
            @unlink($tempPath);
            error_log("[StaticCache] Failed to rename temp file to: {$filepath}");
            return false;
        }
        
        return true;
    }
    
    /**
     * Get chunk size from settings
     */
    private static function getChunkSize(): int
    {
        // For now, use default. Later can add to CacheSettingsService
        return self::DEFAULT_CHUNK_SIZE;
    }
    
    /**
     * Cleanup orphaned item files in a collection
     */
    private static function cleanupOrphanedItems(string $slotKey, array $validIdentifiers, int $validChunkCount): int
    {
        $slotDir = self::$cacheDir . self::sanitizeFilename($slotKey) . '/';
        
        if (!is_dir($slotDir)) {
            return 0;
        }
        
        $deleted = 0;
        $files = glob($slotDir . '*.json');
        
        foreach ($files as $file) {
            $basename = basename($file, '.json');
            
            // Skip manifest
            if ($basename === 'manifest') {
                continue;
            }
            
            // Check if chunk file
            if (preg_match('/^chunk_(\d+)$/', $basename, $matches)) {
                $chunkIndex = (int) $matches[1];
                if ($chunkIndex >= $validChunkCount) {
                    @unlink($file);
                    $deleted++;
                    error_log("[StaticCache] Cleaned up orphaned chunk: {$slotKey}/{$basename}.json");
                }
                continue;
            }
            
            // Item file - check if valid
            if (!in_array($basename, $validIdentifiers)) {
                @unlink($file);
                $deleted++;
                error_log("[StaticCache] Cleaned up orphaned item: {$slotKey}/{$basename}.json");
            }
        }
        
        return $deleted;
    }
    
    // =========================================================================
    // GLOBAL MANIFEST
    // =========================================================================
    
    /**
     * Generate global manifest (_manifest.json)
     * Lists all slot directories and their paths
     */
    public static function generateManifest(): bool
    {
        self::init();
        
        $schema = self::loadSchema();
        $slots = [];
        $excludedSlots = [];
        
        // Scan slot directories
        $dirs = glob(self::$cacheDir . '*', GLOB_ONLYDIR);
        
        foreach ($dirs as $dir) {
            $slotKey = basename($dir);
            $manifestPath = $dir . '/manifest.json';
            
            if (!file_exists($manifestPath)) {
                continue;
            }
            
            $manifest = json_decode(file_get_contents($manifestPath), true);
            if (!$manifest) {
                continue;
            }
            
            $slots[$slotKey] = [
                'type' => $manifest['type'] ?? 'object',
                'path' => $slotKey . '/manifest.json',
            ];
            
            if (isset($manifest['itemCount'])) {
                $slots[$slotKey]['itemCount'] = $manifest['itemCount'];
            }
            
            if (isset($manifest['identifierField'])) {
                $slots[$slotKey]['identifierField'] = $manifest['identifierField'];
            }
        }
        
        // Add excluded (massive) slots
        if ($schema && isset($schema['slots'])) {
            foreach ($schema['slots'] as $key => $slotDef) {
                if (($slotDef['type'] ?? 'object') === 'massive') {
                    $excludedSlots[$key] = [
                        'type' => 'massive',
                        'reason' => 'API-only',
                    ];
                }
            }
        }
        
        $globalManifest = [
            'version' => 2,
            'generated_at' => date('c'),
            'slots' => $slots,
            'excludedSlots' => $excludedSlots,
        ];
        
        $filepath = self::$cacheDir . '_manifest.json';
        $success = self::atomicWriteJson($filepath, $globalManifest);
        
        if ($success) {
            error_log("[StaticCache] Generated global manifest with " . count($slots) . " slots");
        }
        
        return $success;
    }
    
    // =========================================================================
    // REBUILD & INVALIDATION
    // =========================================================================
    
    /**
     * Rebuild all static cache
     */
    public static function rebuildAll(): array
    {
        self::init();
        
        // File-based lock to prevent concurrent rebuilds
        $lockFile = self::$cacheDir . '.rebuild.lock';
        $lockHandle = fopen($lockFile, 'c');
        
        if ($lockHandle === false) {
            return ['count' => 0, 'errors' => 1, 'slots' => []];
        }
        
        if (!flock($lockHandle, LOCK_EX | LOCK_NB)) {
            fclose($lockHandle);
            return ['count' => 0, 'errors' => 0, 'slots' => [], 'skipped' => true];
        }
        
        try {
            // Clear old structure first
            self::clearLegacyFiles();
            
            $slots = ContentDatabase::getAllSlots();
            $schema = self::loadSchema();
            $count = 0;
            $errors = 0;
            $processed = [];
            
            foreach ($slots as $slot) {
                $key = $slot['key'];
                
                // Get slot type
                $slotType = $schema['slots'][$key]['type'] ?? 'object';
                
                try {
                    $data = ContentDatabase::getSlot($key);
                    
                    if (self::generateForSlot($key, $data, $slotType, true)) {
                        $count++;
                        $processed[] = $key;
                    } else {
                        // Skipped (massive, binary, etc) - not an error
                    }
                } catch (\Exception $e) {
                    error_log("[StaticCache] Rebuild error for {$key}: " . $e->getMessage());
                    $errors++;
                }
            }
            
            // Generate global manifest
            self::generateManifest();
            
            return [
                'count' => $count,
                'errors' => $errors,
                'slots' => $processed,
            ];
        } finally {
            flock($lockHandle, LOCK_UN);
            fclose($lockHandle);
            @unlink($lockFile);
        }
    }
    
    /**
     * Clear legacy flat files (from old system)
     */
    private static function clearLegacyFiles(): void
    {
        // Remove old flat JSON files (not in directories)
        $files = glob(self::$cacheDir . '*.json');
        
        foreach ($files as $file) {
            $basename = basename($file);
            
            // Keep global manifest
            if ($basename === '_manifest.json') {
                continue;
            }
            
            // Remove old bundle files
            if (str_starts_with($basename, '_bundle')) {
                @unlink($file);
                continue;
            }
            
            // Remove old flat slot files
            @unlink($file);
        }
        
        // Remove old etag files
        $etagFiles = glob(self::$cacheDir . '*.etag');
        foreach ($etagFiles as $file) {
            @unlink($file);
        }
    }
    
    /**
     * Invalidate cache for a slot
     */
    public static function invalidateSlot(string $key): bool
    {
        self::init();
        
        $slotDir = self::$cacheDir . self::sanitizeFilename($key) . '/';
        
        if (!is_dir($slotDir)) {
            return true; // Nothing to invalidate
        }
        
        // Delete all files in slot directory
        $files = glob($slotDir . '*');
        foreach ($files as $file) {
            if (is_file($file)) {
                @unlink($file);
            }
        }
        
        // Remove directory
        @rmdir($slotDir);
        
        error_log("[StaticCache] Invalidated cache for slot: {$key}");
        
        self::regenerateMetaFilesDebounced();
        
        return true;
    }
    
    /**
     * Get cache path for a slot (directory)
     */
    public static function getCachePath(string $key): ?string
    {
        self::init();
        
        $slotDir = self::$cacheDir . self::sanitizeFilename($key) . '/';
        
        return is_dir($slotDir) ? $slotDir : null;
    }
    
    // =========================================================================
    // STATISTICS
    // =========================================================================
    
    /**
     * Get cache statistics
     */
    public static function getStats(): array
    {
        self::init();
        
        $totalFiles = 0;
        $totalSize = 0;
        $slotCount = 0;
        
        // Count slot directories
        $dirs = glob(self::$cacheDir . '*', GLOB_ONLYDIR);
        $slotCount = count($dirs);
        
        // Count files and sizes
        foreach ($dirs as $dir) {
            $files = glob($dir . '/*.json');
            $totalFiles += count($files);
            
            foreach ($files as $file) {
                $totalSize += filesize($file);
            }
        }
        
        // Add global manifest
        if (file_exists(self::$cacheDir . '_manifest.json')) {
            $totalFiles++;
            $totalSize += filesize(self::$cacheDir . '_manifest.json');
        }
        
        return [
            'total_files' => $totalFiles,
            'total_size' => $totalSize,
            'total_size_human' => self::formatBytes($totalSize),
            'slot_count' => $slotCount,
        ];
    }
    
    /**
     * Format bytes to human readable string
     */
    private static function formatBytes(int $bytes): string
    {
        if ($bytes === 0) return '0 B';
        
        $units = ['B', 'KB', 'MB', 'GB'];
        $i = floor(log($bytes, 1024));
        
        return round($bytes / pow(1024, $i), 2) . ' ' . $units[$i];
    }
    
    /**
     * Clear all cache
     */
    public static function clearAll(): int
    {
        self::init();
        
        $count = 0;
        
        // Helper function to recursively delete directory contents
        $deleteDir = function(string $dir) use (&$deleteDir, &$count): void {
            if (!is_dir($dir)) {
                return;
            }
            
            $items = scandir($dir);
            foreach ($items as $item) {
                if ($item === '.' || $item === '..') {
                    continue;
                }
                
                $path = $dir . '/' . $item;
                
                if (is_dir($path)) {
                    $deleteDir($path);
                    @rmdir($path);
                } else {
                    @unlink($path);
                    $count++;
                }
            }
        };
        
        // Delete all slot directories recursively
        $dirs = glob(self::$cacheDir . '*', GLOB_ONLYDIR);
        foreach ($dirs as $dir) {
            $deleteDir($dir);
            @rmdir($dir);
        }
        
        // Delete global manifest
        if (file_exists(self::$cacheDir . '_manifest.json')) {
            @unlink(self::$cacheDir . '_manifest.json');
            $count++;
        }
        
        // Delete any remaining files in root (legacy, lock files, etc)
        $files = glob(self::$cacheDir . '*');
        foreach ($files as $file) {
            if (is_file($file)) {
                @unlink($file);
                $count++;
            }
        }
        
        error_log("[StaticCache] Cleared all cache: {$count} files deleted");
        
        return $count;
    }
    
    // =========================================================================
    // META REGENERATION (Debounced)
    // =========================================================================
    
    /**
     * Regenerate global manifest
     */
    public static function regenerateMetaFiles(): bool
    {
        if (!self::isEnabled()) {
            return false;
        }
        
        try {
            return self::generateManifest();
        } catch (\Exception $e) {
            error_log("[StaticCache] Failed to regenerate meta files: " . $e->getMessage());
            return false;
        }
    }
    
    /**
     * Regenerate meta files with debouncing
     */
    public static function regenerateMetaFilesDebounced(): bool
    {
        $debounceSeconds = CacheSettingsService::getInstance()->getDebounceSeconds();
        self::init();
        
        $dirtyFlagPath = self::$cacheDir . '.manifest_dirty';
        $lockFile = self::$cacheDir . '.regen_lock';
        $now = time();
        
        // Check shared timestamp
        if (file_exists($lockFile)) {
            $lastRun = filemtime($lockFile);
            
            if ($lastRun !== false && ($now - $lastRun) < $debounceSeconds) {
                touch($dirtyFlagPath);
                return false;
            }
        }
        
        // Acquire exclusive lock
        $lockHandle = fopen($lockFile, 'c');
        if ($lockHandle === false) {
            touch($dirtyFlagPath);
            return false;
        }
        
        if (!flock($lockHandle, LOCK_EX | LOCK_NB)) {
            fclose($lockHandle);
            touch($dirtyFlagPath);
            return false;
        }
        
        try {
            // Double-check timestamp
            clearstatcache(true, $lockFile);
            $lastRun = filemtime($lockFile);
            if ($lastRun !== false && ($now - $lastRun) < $debounceSeconds) {
                touch($dirtyFlagPath);
                return false;
            }
            
            touch($lockFile);
            $wasDirty = file_exists($dirtyFlagPath);
            
            self::$lastMetaRegenTime = microtime(true);
            
            $result = self::regenerateMetaFiles();
            
            if ($result && $wasDirty) {
                @unlink($dirtyFlagPath);
            }
            
            // Tail recovery
            if ($result && file_exists($dirtyFlagPath)) {
                $executionTime = microtime(true) - ($_SERVER["REQUEST_TIME_FLOAT"] ?? microtime(true));
                
                if ($executionTime < 25) {
                    usleep(500000);
                    return self::regenerateMetaFilesDebounced();
                }
            }
            
            return $result;
        } finally {
            flock($lockHandle, LOCK_UN);
            fclose($lockHandle);
        }
    }
    
    /**
     * Force meta regeneration
     */
    public static function forceRegenerateMetaFiles(): bool
    {
        self::init();
        
        $lockFile = self::$cacheDir . '.regen_lock';
        $lockHandle = fopen($lockFile, 'c');
        
        if ($lockHandle === false) {
            return false;
        }
        
        $maxWaitSeconds = 30;
        $waitedSeconds = 0;
        $lockAcquired = false;
        
        while ($waitedSeconds < $maxWaitSeconds) {
            if (flock($lockHandle, LOCK_EX | LOCK_NB)) {
                $lockAcquired = true;
                break;
            }
            usleep(100000);
            $waitedSeconds += 0.1;
        }
        
        if (!$lockAcquired) {
            fclose($lockHandle);
            return false;
        }
        
        try {
            touch($lockFile);
            self::$lastMetaRegenTime = microtime(true);
            
            $dirtyFlagPath = self::$cacheDir . '.manifest_dirty';
            @unlink($dirtyFlagPath);
            
            return self::regenerateMetaFiles();
        } finally {
            flock($lockHandle, LOCK_UN);
            fclose($lockHandle);
        }
    }
    
    /**
     * Process dirty flag
     */
    public static function processDirtyFlag(): bool
    {
        self::init();
        $dirtyFlagPath = self::$cacheDir . '.manifest_dirty';
        
        if (!file_exists($dirtyFlagPath)) {
            return false;
        }
        
        return self::regenerateMetaFilesDebounced();
    }
}
