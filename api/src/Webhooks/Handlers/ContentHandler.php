<?php
/**
 * Content Handler for Incoming Webhooks
 * 
 * Processes content modification events from external services.
 * 
 * ARCHITECTURE (2026-01-05):
 * - All saves now go through ContentDatabase::saveSlot() with versioning options
 * - Versioning is AUTOMATIC at the database layer
 * - Webhook source is tracked in version history via 'changed_by' option
 * 
 * Supported Events:
 * 
 * === MASSIVE SLOTS (paginated, large datasets) ===
 * - massive.update  - Update by ID or filter
 * - massive.create  - Create new record
 * - massive.delete  - Delete by ID
 * 
 * === STANDARD SLOTS (object, list, collection) ===
 * - content.update  - Update slot data
 * - content.create  - Create/overwrite slot data
 * - content.delete  - Delete slot data
 * 
 * Payload Formats:
 * 
 * Massive Update by ID:
 * { "event": "massive.update", "data": { "slot": "products", "id": 1, "data": { ... } } }
 * 
 * Massive Update by Filter (e.g., SKU):
 * { "event": "massive.update", "data": { "slot": "products", "filter": { "sku": "PROD-001" }, "data": { "price": 999 } } }
 * 
 * Standard Slot Update:
 * { "event": "content.update", "data": { "slot": "site_settings", "data": { "site_title": "..." } } }
 * 
 * List/Collection Item Update:
 * { "event": "content.update", "data": { "slot": "team", "index": 0, "data": { "name": "..." } } }
 * { "event": "content.update", "data": { "slot": "blog", "slug": "my-post", "data": { "title": "..." } } }
 */

declare(strict_types=1);

namespace NomadCMS\Webhooks\Handlers;

use NomadCMS\Database\MassiveDatabase;
use NomadCMS\Database\ContentDatabase;

class ContentHandler
{
    /**
     * Webhook source identifier for version history
     */
    private string $webhookSource = 'webhook';
    
    /**
     * Handle incoming webhook payload
     */
    public function handle(array $payload, array $endpoint): array
    {
        $event = $payload['event'] ?? 'unknown';
        $data = $payload['data'] ?? [];
        $slot = $data['slot'] ?? null;
        
        // Track webhook source for versioning
        $this->webhookSource = 'webhook:' . ($endpoint['name'] ?? $endpoint['id'] ?? 'unknown');
        
        if (empty($slot)) {
            throw new \RuntimeException('Missing slot in payload data');
        }
        
        // Route to appropriate handler based on event prefix
        if (str_starts_with($event, 'massive.')) {
            return $this->handleMassiveEvent($event, $slot, $data);
        } elseif (str_starts_with($event, 'content.')) {
            return $this->handleContentEvent($event, $slot, $data);
        }
        
        throw new \RuntimeException("Unknown event: $event");
    }
    
    /**
     * Save slot with versioning metadata
     * Centralizes all saves to ensure versioning is tracked
     */
    private function saveWithVersioning(string $slot, mixed $data, string $action = 'update'): bool
    {
        return ContentDatabase::saveSlot($slot, $data, [
            'changed_by' => $this->webhookSource,
            'slot_type' => 'webhook',  // Webhook saves are always versioned
            'force_version' => true,   // Force versioning for webhook operations
        ]);
    }
    
    // =========================================================================
    // MASSIVE SLOTS (massive type - paginated, large datasets)
    // =========================================================================
    
    private function handleMassiveEvent(string $event, string $slot, array $data): array
    {
        // Ensure table exists
        MassiveDatabase::ensureTable($slot);
        
        return match($event) {
            'massive.update' => $this->handleMassiveUpdate($slot, $data),
            'massive.create' => $this->handleMassiveCreate($slot, $data),
            'massive.delete' => $this->handleMassiveDelete($slot, $data),
            default => throw new \RuntimeException("Unknown massive event: $event"),
        };
    }
    
    private function handleMassiveUpdate(string $slot, array $data): array
    {
        $updateData = $data['data'] ?? [];
        
        if (empty($updateData)) {
            throw new \RuntimeException('Missing data for update');
        }
        
        // Update by ID
        if (isset($data['id'])) {
            $id = (int) $data['id'];
            $success = MassiveDatabase::update($slot, $id, $updateData);
            
            if (!$success) {
                throw new \RuntimeException("Failed to update record ID: $id");
            }
            
            return [
                'handler' => 'content',
                'action' => 'massive.update',
                'slot' => $slot,
                'id' => $id,
                'success' => true,
            ];
        }
        
        // Update by filter (e.g., SKU)
        if (isset($data['filter']) && is_array($data['filter'])) {
            $conditions = [];
            foreach ($data['filter'] as $field => $value) {
                $conditions[] = [
                    'field' => $field,
                    'op' => 'eq',
                    'value' => $value,
                ];
            }
            
            $count = MassiveDatabase::bulkUpdate($slot, $updateData, $conditions);
            
            return [
                'handler' => 'content',
                'action' => 'massive.update_by_filter',
                'slot' => $slot,
                'filter' => $data['filter'],
                'updated' => $count,
                'success' => true,
            ];
        }
        
        throw new \RuntimeException('Missing id or filter for update');
    }
    
    private function handleMassiveCreate(string $slot, array $data): array
    {
        $createData = $data['data'] ?? [];
        
        if (empty($createData)) {
            throw new \RuntimeException('Missing data for create');
        }
        
        $id = MassiveDatabase::insert($slot, $createData);
        
        return [
            'handler' => 'content',
            'action' => 'massive.create',
            'slot' => $slot,
            'id' => $id,
            'success' => true,
        ];
    }
    
    private function handleMassiveDelete(string $slot, array $data): array
    {
        if (!isset($data['id'])) {
            throw new \RuntimeException('Missing id for delete');
        }
        
        $id = (int) $data['id'];
        $success = MassiveDatabase::delete($slot, $id);
        
        if (!$success) {
            throw new \RuntimeException("Failed to delete record ID: $id");
        }
        
        return [
            'handler' => 'content',
            'action' => 'massive.delete',
            'slot' => $slot,
            'id' => $id,
            'success' => true,
        ];
    }
    
    // =========================================================================
    // STANDARD SLOTS (object, list, collection types)
    // =========================================================================
    
    private function handleContentEvent(string $event, string $slot, array $data): array
    {
        return match($event) {
            'content.update' => $this->handleContentUpdate($slot, $data),
            'content.create' => $this->handleContentCreate($slot, $data),
            'content.delete' => $this->handleContentDelete($slot, $data),
            default => throw new \RuntimeException("Unknown content event: $event"),
        };
    }
    
    /**
     * Update slot content
     * 
     * For object slots: replaces entire data
     * For list/collection: can update by index or slug
     */
    private function handleContentUpdate(string $slot, array $data): array
    {
        $updateData = $data['data'] ?? [];
        
        if (empty($updateData)) {
            throw new \RuntimeException('Missing data for update');
        }
        
        // Get existing slot data
        $existing = ContentDatabase::getSlot($slot);
        
        // Update by index (for list/collection items)
        if (isset($data['index'])) {
            $index = (int) $data['index'];
            
            if (!is_array($existing)) {
                throw new \RuntimeException("Slot $slot is not a list/collection");
            }
            
            if (!isset($existing[$index])) {
                throw new \RuntimeException("Index $index not found in slot $slot");
            }
            
            // Merge update data into existing item
            $existing[$index] = array_merge($existing[$index], $updateData);
            $this->saveWithVersioning($slot, $existing, 'update_by_index');
            
            return [
                'handler' => 'content',
                'action' => 'content.update_by_index',
                'slot' => $slot,
                'index' => $index,
                'success' => true,
            ];
        }
        
        // Update by slug (for collection items)
        if (isset($data['slug'])) {
            $slug = $data['slug'];
            
            if (!is_array($existing)) {
                throw new \RuntimeException("Slot $slot is not a collection");
            }
            
            $found = false;
            foreach ($existing as $i => $item) {
                if (($item['slug'] ?? '') === $slug) {
                    $existing[$i] = array_merge($item, $updateData);
                    $found = true;
                    break;
                }
            }
            
            if (!$found) {
                throw new \RuntimeException("Slug '$slug' not found in slot $slot");
            }
            
            $this->saveWithVersioning($slot, $existing, 'update_by_slug');
            
            return [
                'handler' => 'content',
                'action' => 'content.update_by_slug',
                'slot' => $slot,
                'slug' => $slug,
                'success' => true,
            ];
        }
        
        // Update by any field (e.g., sku, id, name - for collection items)
        // Check for any field that could be used as lookup (except 'slot', 'data', 'index', 'slug')
        $reservedKeys = ['slot', 'data', 'index', 'slug', 'append'];
        $lookupField = null;
        $lookupValue = null;
        
        foreach ($data as $key => $value) {
            if (!in_array($key, $reservedKeys) && is_string($value)) {
                $lookupField = $key;
                $lookupValue = $value;
                break;
            }
        }
        
        if ($lookupField !== null && is_array($existing)) {
            $found = false;
            foreach ($existing as $i => $item) {
                if (($item[$lookupField] ?? '') === $lookupValue) {
                    $existing[$i] = array_merge($item, $updateData);
                    $found = true;
                    break;
                }
            }
            
            if ($found) {
                $this->saveWithVersioning($slot, $existing, 'update_by_field');
                
                return [
                    'handler' => 'content',
                    'action' => 'content.update_by_field',
                    'slot' => $slot,
                    'field' => $lookupField,
                    'value' => $lookupValue,
                    'success' => true,
                ];
            }
            
            throw new \RuntimeException("$lookupField '$lookupValue' not found in slot $slot");
        }
        
        // Update/merge entire slot (object type or full replacement)
        if ($existing !== null && is_array($existing) && is_array($updateData)) {
            // Merge with existing data
            $newData = array_merge($existing, $updateData);
        } else {
            $newData = $updateData;
        }
        
        $this->saveWithVersioning($slot, $newData, 'update');
        
        return [
            'handler' => 'content',
            'action' => 'content.update',
            'slot' => $slot,
            'success' => true,
        ];
    }
    
    /**
     * Create/overwrite slot content
     */
    private function handleContentCreate(string $slot, array $data): array
    {
        $createData = $data['data'] ?? [];
        
        if (empty($createData)) {
            throw new \RuntimeException('Missing data for create');
        }
        
        // For list/collection: append new item
        if (isset($data['append']) && $data['append'] === true) {
            $existing = ContentDatabase::getSlot($slot) ?? [];
            
            if (!is_array($existing)) {
                $existing = [];
            }
            
            $existing[] = $createData;
            $this->saveWithVersioning($slot, $existing, 'append');
            
            return [
                'handler' => 'content',
                'action' => 'content.append',
                'slot' => $slot,
                'index' => count($existing) - 1,
                'success' => true,
            ];
        }
        
        // Create/overwrite entire slot
        $this->saveWithVersioning($slot, $createData, 'create');
        
        return [
            'handler' => 'content',
            'action' => 'content.create',
            'slot' => $slot,
            'success' => true,
        ];
    }
    
    /**
     * Delete slot content
     */
    private function handleContentDelete(string $slot, array $data): array
    {
        // Delete by index (for list/collection items)
        if (isset($data['index'])) {
            $index = (int) $data['index'];
            $existing = ContentDatabase::getSlot($slot);
            
            if (!is_array($existing) || !isset($existing[$index])) {
                throw new \RuntimeException("Index $index not found in slot $slot");
            }
            
            array_splice($existing, $index, 1);
            $this->saveWithVersioning($slot, $existing, 'delete_by_index');
            
            return [
                'handler' => 'content',
                'action' => 'content.delete_by_index',
                'slot' => $slot,
                'index' => $index,
                'success' => true,
            ];
        }
        
        // Delete by slug (for collection items)
        if (isset($data['slug'])) {
            $slug = $data['slug'];
            $existing = ContentDatabase::getSlot($slot);
            
            if (!is_array($existing)) {
                throw new \RuntimeException("Slot $slot is not a collection");
            }
            
            $found = false;
            foreach ($existing as $i => $item) {
                if (($item['slug'] ?? '') === $slug) {
                    array_splice($existing, $i, 1);
                    $found = true;
                    break;
                }
            }
            
            if (!$found) {
                throw new \RuntimeException("Slug '$slug' not found in slot $slot");
            }
            
            $this->saveWithVersioning($slot, $existing, 'delete_by_slug');
            
            return [
                'handler' => 'content',
                'action' => 'content.delete_by_slug',
                'slot' => $slot,
                'slug' => $slug,
                'success' => true,
            ];
        }
        
        // Delete by any field (e.g., sku, id, name - for collection items)
        $reservedKeys = ['slot', 'data', 'index', 'slug', 'append'];
        $lookupField = null;
        $lookupValue = null;
        
        foreach ($data as $key => $value) {
            if (!in_array($key, $reservedKeys) && is_string($value)) {
                $lookupField = $key;
                $lookupValue = $value;
                break;
            }
        }
        
        if ($lookupField !== null) {
            $existing = ContentDatabase::getSlot($slot);
            
            if (is_array($existing)) {
                $found = false;
                foreach ($existing as $i => $item) {
                    if (($item[$lookupField] ?? '') === $lookupValue) {
                        array_splice($existing, $i, 1);
                        $found = true;
                        break;
                    }
                }
                
                if ($found) {
                    $this->saveWithVersioning($slot, $existing, 'delete_by_field');
                    
                    return [
                        'handler' => 'content',
                        'action' => 'content.delete_by_field',
                        'slot' => $slot,
                        'field' => $lookupField,
                        'value' => $lookupValue,
                        'success' => true,
                    ];
                }
                
                throw new \RuntimeException("$lookupField '$lookupValue' not found in slot $slot");
            }
        }
        
        // Delete entire slot
        $success = ContentDatabase::deleteSlot($slot);
        
        if (!$success) {
            throw new \RuntimeException("Failed to delete slot: $slot");
        }
        
        return [
            'handler' => 'content',
            'action' => 'content.delete',
            'slot' => $slot,
            'success' => true,
        ];
    }
}
