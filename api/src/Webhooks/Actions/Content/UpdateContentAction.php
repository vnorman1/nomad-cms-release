<?php
/**
 * NOMAD CMS - Update Content Action
 * 
 * Updates existing content in a slot from webhook payload.
 * Supports matching by ID, slug, or custom field.
 */

declare(strict_types=1);

namespace NomadCMS\Webhooks\Actions\Content;

use NomadCMS\Webhooks\Actions\BaseAction;
use NomadCMS\Webhooks\Actions\ActionContext;
use NomadCMS\Webhooks\Actions\ActionResult;
use NomadCMS\Database\ContentDatabase;
use NomadCMS\Database\MassiveDatabase;

class UpdateContentAction extends BaseAction
{
    public function getType(): string
    {
        return 'update_content';
    }
    
    public function getName(): string
    {
        return 'Tartalom Módosítása';
    }
    
    public function getDescription(): string
    {
        return 'Meglévő tartalom frissítése ID, slug vagy egyéni mező alapján';
    }
    
    public function getCategory(): string
    {
        return 'content';
    }
    
    public function getIcon(): string
    {
        return '✏️';
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
                    'description' => 'A slot neve ahol a tartalom található',
                ],
                'match_field' => [
                    'type' => 'string',
                    'title' => 'Egyeztetési mező',
                    'description' => 'Melyik mező alapján keressük a tartalmat (pl. id, slug, meta.external_id)',
                    'default' => 'id',
                ],
                'match_source' => [
                    'type' => 'string',
                    'title' => 'Egyeztetési érték forrása',
                    'description' => 'JSONPath a payload-ból az egyeztetési értékhez',
                    'default' => '$.id',
                ],
                'upsert' => [
                    'type' => 'boolean',
                    'title' => 'Upsert (létrehozás ha nincs)',
                    'description' => 'Ha nincs találat, hozza létre új tartalomként',
                    'default' => false,
                ],
                'merge' => [
                    'type' => 'boolean',
                    'title' => 'Összefűzés',
                    'description' => 'Összefűzi a meglévő és új adatokat (rekurzív merge)',
                    'default' => true,
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
        return ['id', 'title', 'slug', 'body', 'meta', 'status'];
    }
    
    public function execute(ActionContext $context): ActionResult
    {
        $startTime = microtime(true);
        
        try {
            $slot = $context->getConfig('slot');
            if (empty($slot)) {
                return ActionResult::failure('Slot is required');
            }
            
            // Get update data from mapped payload
            $updateData = $context->mappedPayload;
            
            if (empty($updateData)) {
                return ActionResult::failure('No update data provided');
            }
            
            // Get match criteria
            $matchField = $context->getConfig('match_field', 'id');
            $matchSource = $context->getConfig('match_source', '$.id');
            
            // Get match value from original payload using JSONPath
            $mapper = new \NomadCMS\Webhooks\PayloadMapper();
            $matchValue = $mapper->evaluateJsonPath($matchSource, $context->originalPayload);
            
            if ($matchValue === null) {
                return ActionResult::failure("Match value not found at path: {$matchSource}");
            }
            
            $upsert = (bool)$context->getConfig('upsert', false);
            $merge = (bool)$context->getConfig('merge', true);
            
            // Build save options
            $options = [
                'changed_by' => 'webhook:action:' . ($context->endpoint['name'] ?? 'unknown'),
                'skip_versioning' => (bool)$context->getConfig('skip_versioning', false),
            ];
            
            // Get slot type
            $slotType = $this->getSlotType($slot);
            
            // Update based on slot type
            if ($slotType === 'massive') {
                $result = $this->updateMassiveContent($slot, $matchField, $matchValue, $updateData, $upsert, $merge, $options);
            } else {
                $result = $this->updateStandardContent($slot, $matchField, $matchValue, $updateData, $slotType, $upsert, $merge, $options);
            }
            
            $executionTime = (int)((microtime(true) - $startTime) * 1000);
            
            return new ActionResult(
                success: true,
                data: $result,
                statusCode: $result['created'] ?? false ? 201 : 200,
                executionTimeMs: $executionTime,
                metadata: ['slot' => $slot, 'match_field' => $matchField, 'match_value' => $matchValue]
            );
            
        } catch (\Exception $e) {
            $this->log('Update content failed', ['error' => $e->getMessage()]);
            return ActionResult::failure($e->getMessage());
        }
    }
    
    /**
     * Update content in massive slot
     */
    private function updateMassiveContent(
        string $slot,
        string $matchField,
        mixed $matchValue,
        array $updateData,
        bool $upsert,
        bool $merge,
        array $options
    ): array {
        $massive = new MassiveDatabase($slot);
        
        // Find record by match field
        if ($matchField === 'id') {
            $existing = $massive->find((int)$matchValue);
        } else {
            // Query by field
            $results = $massive->query()
                ->where($matchField, '=', $matchValue)
                ->limit(1)
                ->get();
            $existing = $results[0] ?? null;
        }
        
        if ($existing) {
            $id = $existing['id'];
            
            // Merge data if requested
            if ($merge) {
                $updateData = array_replace_recursive($existing, $updateData);
            }
            
            // Remove ID from update data
            unset($updateData['id']);
            
            $massive->update($id, $updateData);
            
            return [
                'id' => $id,
                'slot' => $slot,
                'updated' => true,
                'created' => false,
            ];
        }
        
        // No match found
        if ($upsert) {
            $id = $massive->insert($updateData);
            return [
                'id' => $id,
                'slot' => $slot,
                'updated' => false,
                'created' => true,
            ];
        }
        
        throw new \RuntimeException("No content found matching {$matchField} = {$matchValue}");
    }
    
    /**
     * Update content in standard slot
     */
    private function updateStandardContent(
        string $slot,
        string $matchField,
        mixed $matchValue,
        array $updateData,
        string $slotType,
        bool $upsert,
        bool $merge,
        array $options
    ): array {
        $contentDb = new ContentDatabase();
        $existing = $contentDb->loadSlot($slot);
        
        switch ($slotType) {
            case 'object':
                // Object slot: update directly
                if ($merge && is_array($existing)) {
                    $updateData = array_replace_recursive($existing, $updateData);
                }
                $contentDb->saveSlot($slot, $updateData, $options);
                return [
                    'slot' => $slot,
                    'type' => 'object',
                    'updated' => true,
                ];
                
            case 'list':
                // List slot: find by index or field value
                if ($existing === null) {
                    $existing = [];
                }
                
                $foundIndex = null;
                foreach ($existing as $index => $item) {
                    if ($this->getNestedValue($item, $matchField) == $matchValue) {
                        $foundIndex = $index;
                        break;
                    }
                }
                
                if ($foundIndex !== null) {
                    if ($merge) {
                        $existing[$foundIndex] = array_replace_recursive($existing[$foundIndex], $updateData);
                    } else {
                        $existing[$foundIndex] = $updateData;
                    }
                    $contentDb->saveSlot($slot, $existing, $options);
                    return [
                        'slot' => $slot,
                        'type' => 'list',
                        'index' => $foundIndex,
                        'updated' => true,
                        'created' => false,
                    ];
                }
                
                if ($upsert) {
                    $existing[] = $updateData;
                    $contentDb->saveSlot($slot, $existing, $options);
                    return [
                        'slot' => $slot,
                        'type' => 'list',
                        'index' => count($existing) - 1,
                        'updated' => false,
                        'created' => true,
                    ];
                }
                
                throw new \RuntimeException("No item found in list matching {$matchField} = {$matchValue}");
                
            case 'collection':
                // Collection slot: match by slug or field
                if ($existing === null) {
                    $existing = [];
                }
                
                $foundKey = null;
                foreach ($existing as $key => $item) {
                    if ($matchField === 'slug' && $key == $matchValue) {
                        $foundKey = $key;
                        break;
                    }
                    if ($this->getNestedValue($item, $matchField) == $matchValue) {
                        $foundKey = $key;
                        break;
                    }
                }
                
                if ($foundKey !== null) {
                    if ($merge) {
                        $existing[$foundKey] = array_replace_recursive($existing[$foundKey], $updateData);
                    } else {
                        $existing[$foundKey] = $updateData;
                    }
                    $contentDb->saveSlot($slot, $existing, $options);
                    return [
                        'slot' => $slot,
                        'type' => 'collection',
                        'slug' => $foundKey,
                        'updated' => true,
                        'created' => false,
                    ];
                }
                
                if ($upsert) {
                    $slug = $updateData['slug'] ?? $this->generateSlug($updateData);
                    $existing[$slug] = $updateData;
                    $contentDb->saveSlot($slot, $existing, $options);
                    return [
                        'slot' => $slot,
                        'type' => 'collection',
                        'slug' => $slug,
                        'updated' => false,
                        'created' => true,
                    ];
                }
                
                throw new \RuntimeException("No item found in collection matching {$matchField} = {$matchValue}");
                
            default:
                throw new \RuntimeException("Unknown slot type: {$slotType}");
        }
    }
    
    /**
     * Get nested value from array using dot notation
     */
    private function getNestedValue(array $data, string $path): mixed
    {
        $keys = explode('.', $path);
        $value = $data;
        
        foreach ($keys as $key) {
            if (!is_array($value) || !array_key_exists($key, $value)) {
                return null;
            }
            $value = $value[$key];
        }
        
        return $value;
    }
    
    /**
     * Get slot type from schema
     */
    private function getSlotType(string $slot): string
    {
        $schemaPath = $_ENV['SCHEMA_PATH'] ?? (__DIR__ . '/../../../../../nomad/nomad.schema.json');
        
        if (file_exists($schemaPath)) {
            $schema = json_decode(file_get_contents($schemaPath), true);
            if (isset($schema['slots'][$slot]['type'])) {
                return $schema['slots'][$slot]['type'];
            }
        }
        
        $massiveDbPath = ($_ENV['DB_MASSIVE_PATH'] ?? (__DIR__ . '/../../../../../api/databases/massive/')) . $slot . '.sqlite';
        if (file_exists($massiveDbPath)) {
            return 'massive';
        }
        
        return 'object';
    }
    
    /**
     * Generate slug from data
     */
    private function generateSlug(array $data): string
    {
        $base = $data['title'] ?? $data['name'] ?? uniqid('item-');
        $slug = strtolower($base);
        $slug = preg_replace('/[^a-z0-9]+/', '-', $slug);
        return trim($slug, '-') ?: uniqid('item-');
    }
}
