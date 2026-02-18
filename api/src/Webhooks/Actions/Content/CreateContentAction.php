<?php
/**
 * NOMAD CMS - Create Content Action
 * 
 * Creates new content in a slot from webhook payload.
 */

declare(strict_types=1);

namespace NomadCMS\Webhooks\Actions\Content;

use NomadCMS\Webhooks\Actions\BaseAction;
use NomadCMS\Webhooks\Actions\ActionContext;
use NomadCMS\Webhooks\Actions\ActionResult;
use NomadCMS\Database\ContentDatabase;
use NomadCMS\Database\MassiveDatabase;

class CreateContentAction extends BaseAction
{
    public function getType(): string
    {
        return 'create_content';
    }
    
    public function getName(): string
    {
        return 'Tartalom Létrehozása';
    }
    
    public function getDescription(): string
    {
        return 'Új tartalom létrehozása egy slot-ban a webhook payload alapján';
    }
    
    public function getCategory(): string
    {
        return 'content';
    }
    
    public function getIcon(): string
    {
        return '📝';
    }
    
    public function getConfigSchema(): array
    {
        return [
            'type' => 'object',
            'required' => ['slot'],
            'properties' => [
                'slot' => [
                    'type' => 'string',
                    'title' => 'Slot',
                    'description' => 'A slot neve ahova a tartalom kerül',
                ],
                'status' => [
                    'type' => 'string',
                    'title' => 'Státusz',
                    'description' => 'Tartalom kezdeti státusza',
                    'enum' => ['draft', 'published'],
                    'default' => 'draft',
                ],
                'locale' => [
                    'type' => 'string',
                    'title' => 'Nyelv',
                    'description' => 'Tartalom nyelve (opcionális)',
                    'default' => '',
                ],
                'author_id' => [
                    'type' => 'integer',
                    'title' => 'Szerző ID',
                    'description' => 'A szerző felhasználói azonosítója',
                ],
                'skip_versioning' => [
                    'type' => 'boolean',
                    'title' => 'Verziókövetés kikapcsolása',
                    'description' => 'Ha igaz, nem készül verzió',
                    'default' => false,
                ],
            ],
        ];
    }
    
    public function getExpectedFields(): array
    {
        return ['title', 'slug', 'body', 'meta', 'status', 'published_at'];
    }
    
    public function execute(ActionContext $context): ActionResult
    {
        $startTime = microtime(true);
        
        try {
            $slot = $context->getConfig('slot');
            if (empty($slot)) {
                return ActionResult::failure('Slot is required');
            }
            
            // Get content data from mapped payload
            $contentData = $context->mappedPayload;
            
            if (empty($contentData)) {
                return ActionResult::failure('No content data provided');
            }
            
            // Apply config overrides
            if ($context->getConfig('status')) {
                $contentData['status'] = $context->getConfig('status');
            }
            
            // Get slot type to determine handler
            $slotType = $this->getSlotType($slot);
            
            // Build save options
            $options = [
                'changed_by' => 'webhook:action:' . ($context->endpoint['name'] ?? 'unknown'),
                'skip_versioning' => (bool)$context->getConfig('skip_versioning', false),
            ];
            
            if ($context->getConfig('locale')) {
                $options['locale'] = $context->getConfig('locale');
            }
            
            // Create content based on slot type
            if ($slotType === 'massive') {
                $result = $this->createMassiveContent($slot, $contentData, $options);
            } else {
                $result = $this->createStandardContent($slot, $contentData, $slotType, $options);
            }
            
            $executionTime = (int)((microtime(true) - $startTime) * 1000);
            
            return new ActionResult(
                success: true,
                data: $result,
                statusCode: 201,
                executionTimeMs: $executionTime,
                metadata: ['slot' => $slot, 'slot_type' => $slotType]
            );
            
        } catch (\Exception $e) {
            $this->log('Create content failed', ['error' => $e->getMessage()]);
            return ActionResult::failure($e->getMessage());
        }
    }
    
    /**
     * Create content in massive slot
     */
    private function createMassiveContent(string $slot, array $data, array $options): array
    {
        $massive = new MassiveDatabase($slot);
        
        // Insert new record
        $id = $massive->insert($data);
        
        return [
            'id' => $id,
            'slot' => $slot,
            'created' => true,
        ];
    }
    
    /**
     * Create content in standard slot (object, list, collection)
     */
    private function createStandardContent(string $slot, array $data, string $slotType, array $options): array
    {
        $contentDb = new ContentDatabase();
        
        // Handle different slot types
        switch ($slotType) {
            case 'object':
                // Object slots store single objects, so we save directly
                $contentDb->saveSlot($slot, $data, $options);
                return [
                    'slot' => $slot,
                    'type' => 'object',
                    'created' => true,
                ];
                
            case 'list':
                // List slots are arrays, append new item
                $existing = $contentDb->loadSlot($slot) ?? [];
                $existing[] = $data;
                $contentDb->saveSlot($slot, $existing, $options);
                return [
                    'slot' => $slot,
                    'type' => 'list',
                    'index' => count($existing) - 1,
                    'created' => true,
                ];
                
            case 'collection':
                // Collection slots are keyed by slug
                $slug = $data['slug'] ?? $this->generateSlug($data);
                $existing = $contentDb->loadSlot($slot) ?? [];
                $existing[$slug] = $data;
                $contentDb->saveSlot($slot, $existing, $options);
                return [
                    'slot' => $slot,
                    'type' => 'collection',
                    'slug' => $slug,
                    'created' => true,
                ];
                
            default:
                // Default: treat as object
                $contentDb->saveSlot($slot, $data, $options);
                return [
                    'slot' => $slot,
                    'created' => true,
                ];
        }
    }
    
    /**
     * Get slot type from schema
     */
    private function getSlotType(string $slot): string
    {
        // Try to load schema
        $schemaPath = $_ENV['SCHEMA_PATH'] ?? (__DIR__ . '/../../../../../nomad/nomad.schema.json');
        
        if (file_exists($schemaPath)) {
            $schema = json_decode(file_get_contents($schemaPath), true);
            
            if (isset($schema['slots'][$slot]['type'])) {
                return $schema['slots'][$slot]['type'];
            }
        }
        
        // Check if it's a massive slot
        $massiveDbPath = ($_ENV['DB_MASSIVE_PATH'] ?? (__DIR__ . '/../../../../../api/databases/massive/')) . $slot . '.sqlite';
        if (file_exists($massiveDbPath)) {
            return 'massive';
        }
        
        return 'object'; // Default to object
    }
    
    /**
     * Generate slug from data
     */
    private function generateSlug(array $data): string
    {
        $base = $data['title'] ?? $data['name'] ?? uniqid('item-');
        
        // Slugify
        $slug = strtolower($base);
        $slug = preg_replace('/[^a-z0-9]+/', '-', $slug);
        $slug = trim($slug, '-');
        
        return $slug ?: uniqid('item-');
    }
}
