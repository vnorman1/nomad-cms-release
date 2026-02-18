<?php
/**
 * NOMAD CMS - Dependency Graph Service
 * 
 * PERMAFROST FIX: Tracks relational dependencies between slots.
 * When a "parent" slot changes, all "child" slots that embed its data
 * are marked for regeneration to prevent stale content.
 * 
 * Example: If `authors` slot is updated, all `posts` slots that embed
 * author data will be touched and their caches regenerated.
 * 
 * CONFIGURATION:
 * Dependencies are defined in the schema via `dependencies` array:
 * {
 *   "posts": {
 *     "type": "collection",
 *     "dependencies": ["authors", "categories"]  // Posts depend on these
 *   }
 * }
 * 
 * USAGE:
 * DependencyGraphService::touchDependents('authors');
 * -> Finds all slots that depend on 'authors' and regenerates them
 */

declare(strict_types=1);

namespace NomadCMS\Services;

use NomadCMS\Database\ContentDatabase;

final class DependencyGraphService
{
    /**
     * Cached dependency graph (inverted for quick lookup)
     * Format: ['authors' => ['posts', 'comments'], ...]
     * Meaning: When 'authors' changes, touch 'posts' and 'comments'
     */
    private static ?array $dependencyGraph = null;
    
    /**
     * Touch all slots that depend on the given parent slot.
     * This triggers cache regeneration for dependent slots.
     * 
     * @param string $parentKey The slot that was just modified
     * @return int Number of dependent slots touched
     */
    public static function touchDependents(string $parentKey): int
    {
        $graph = self::getDependencyGraph();
        
        // Find all slots that depend on this parent
        $dependents = $graph[$parentKey] ?? [];
        
        if (empty($dependents)) {
            return 0;
        }
        
        $touched = 0;
        
        foreach ($dependents as $dependentKey) {
            // Get the dependent slot's data and regenerate its cache
            try {
                $data = ContentDatabase::getSlot($dependentKey);
                
                if ($data !== null) {
                    // Regenerate static cache for this dependent slot
                    // Using skipMetaRegeneration=true to avoid cascade loops
                    StaticCacheService::generateForSlot($dependentKey, $data, null, true);
                    $touched++;
                    
                    error_log("[DependencyGraph] Touched dependent slot '{$dependentKey}' due to change in '{$parentKey}'");
                }
            } catch (\Exception $e) {
                error_log("[DependencyGraph] Failed to touch '{$dependentKey}': " . $e->getMessage());
            }
        }
        
        // Trigger meta regeneration once after all dependents are touched
        if ($touched > 0) {
            StaticCacheService::regenerateMetaFilesDebounced();
        }
        
        return $touched;
    }
    
    /**
     * Build the inverted dependency graph from schema.
     * 
     * Schema format (in slot definition):
     * "dependencies": ["parent_slot_1", "parent_slot_2"]
     * 
     * Inverted graph (what we build):
     * "parent_slot_1" => ["child_slot_that_depends_on_it", ...]
     * 
     * @return array Inverted dependency graph
     */
    private static function getDependencyGraph(): array
    {
        if (self::$dependencyGraph !== null) {
            return self::$dependencyGraph;
        }
        
        self::$dependencyGraph = [];
        
        $schema = self::loadSchema();
        if ($schema === null || !isset($schema['slots'])) {
            return self::$dependencyGraph;
        }
        
        foreach ($schema['slots'] as $slotKey => $slotDef) {
            // Check for explicit dependencies defined in schema
            $dependencies = $slotDef['dependencies'] ?? [];
            
            foreach ($dependencies as $parentSlot) {
                // Build inverted index: parent -> [children]
                if (!isset(self::$dependencyGraph[$parentSlot])) {
                    self::$dependencyGraph[$parentSlot] = [];
                }
                self::$dependencyGraph[$parentSlot][] = $slotKey;
            }
            
            // Also check for field-level references (future enhancement)
            // Fields with 'referenceSlot' or 'embed' properties
            $fields = $slotDef['fields'] ?? [];
            foreach ($fields as $field) {
                $refSlot = $field['referenceSlot'] ?? $field['sourceSlot'] ?? null;
                if ($refSlot !== null) {
                    if (!isset(self::$dependencyGraph[$refSlot])) {
                        self::$dependencyGraph[$refSlot] = [];
                    }
                    if (!in_array($slotKey, self::$dependencyGraph[$refSlot])) {
                        self::$dependencyGraph[$refSlot][] = $slotKey;
                    }
                }
            }
        }
        
        return self::$dependencyGraph;
    }
    
    /**
     * Load schema from file
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
     * Clear cached graph (call when schema changes)
     */
    public static function clearCache(): void
    {
        self::$dependencyGraph = null;
    }
    
    /**
     * Get the current dependency graph for debugging
     * 
     * @return array The inverted dependency graph
     */
    public static function getGraph(): array
    {
        return self::getDependencyGraph();
    }
}
