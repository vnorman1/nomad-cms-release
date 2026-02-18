<?php
/**
 * NOMAD CMS - Delete Content Action
 * 
 * Deletes content from a slot.
 */

declare(strict_types=1);

namespace NomadCMS\Webhooks\Actions\Content;

use NomadCMS\Webhooks\Actions\BaseAction;
use NomadCMS\Webhooks\Actions\ActionContext;
use NomadCMS\Webhooks\Actions\ActionResult;
use NomadCMS\Database\ContentDatabase;
use NomadCMS\Database\MassiveDatabase;

class DeleteContentAction extends BaseAction
{
    public function getType(): string
    {
        return 'delete_content';
    }
    
    public function getName(): string
    {
        return 'Tartalom Törlése';
    }
    
    public function getDescription(): string
    {
        return 'Tartalom törlése slot-ból ID, slug vagy egyéni mező alapján';
    }
    
    public function getCategory(): string
    {
        return 'content';
    }
    
    public function getIcon(): string
    {
        return '🗑️';
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
                    'description' => 'A slot neve ahonnan törlünk',
                ],
                'match_field' => [
                    'type' => 'string',
                    'title' => 'Egyeztetési mező',
                    'description' => 'Melyik mező alapján keressük a tartalmat',
                    'default' => 'id',
                ],
                'match_source' => [
                    'type' => 'string',
                    'title' => 'Egyeztetési érték forrása',
                    'description' => 'JSONPath a payload-ból',
                    'default' => '$.id',
                ],
                'soft_delete' => [
                    'type' => 'boolean',
                    'title' => 'Soft delete',
                    'description' => 'Csak megjelöli töröltként, nem törli fizikailag',
                    'default' => false,
                ],
            ],
        ];
    }
    
    public function getExpectedFields(): array
    {
        return ['id', 'slug'];
    }
    
    public function execute(ActionContext $context): ActionResult
    {
        $startTime = microtime(true);
        
        try {
            $slot = $context->getConfig('slot');
            if (empty($slot)) {
                return ActionResult::failure('Slot is required');
            }
            
            $matchField = $context->getConfig('match_field', 'id');
            $matchSource = $context->getConfig('match_source', '$.id');
            
            $mapper = new \NomadCMS\Webhooks\PayloadMapper();
            $matchValue = $mapper->evaluateJsonPath($matchSource, $context->originalPayload);
            
            if ($matchValue === null) {
                return ActionResult::failure("Match value not found at path: {$matchSource}");
            }
            
            $slotType = $this->getSlotType($slot);
            
            $options = [
                'changed_by' => 'webhook:action:' . ($context->endpoint['name'] ?? 'unknown'),
            ];
            
            if ($slotType === 'massive') {
                $result = $this->deleteMassiveContent($slot, $matchField, $matchValue, $context->getConfig('soft_delete', false));
            } else {
                $result = $this->deleteStandardContent($slot, $matchField, $matchValue, $slotType, $options);
            }
            
            $executionTime = (int)((microtime(true) - $startTime) * 1000);
            
            return new ActionResult(
                success: true,
                data: $result,
                statusCode: 200,
                executionTimeMs: $executionTime,
                metadata: ['slot' => $slot, 'match_field' => $matchField, 'match_value' => $matchValue]
            );
            
        } catch (\Exception $e) {
            $this->log('Delete content failed', ['error' => $e->getMessage()]);
            return ActionResult::failure($e->getMessage());
        }
    }
    
    private function deleteMassiveContent(string $slot, string $matchField, mixed $matchValue, bool $softDelete): array
    {
        $massive = new MassiveDatabase($slot);
        
        if ($matchField === 'id') {
            $id = (int)$matchValue;
        } else {
            $results = $massive->query()
                ->where($matchField, '=', $matchValue)
                ->limit(1)
                ->get();
            
            if (empty($results)) {
                throw new \RuntimeException("No content found matching {$matchField} = {$matchValue}");
            }
            
            $id = $results[0]['id'];
        }
        
        if ($softDelete) {
            $massive->update($id, ['deleted_at' => date('Y-m-d H:i:s')]);
        } else {
            $massive->delete($id);
        }
        
        return [
            'id' => $id,
            'slot' => $slot,
            'deleted' => true,
            'soft_delete' => $softDelete,
        ];
    }
    
    private function deleteStandardContent(string $slot, string $matchField, mixed $matchValue, string $slotType, array $options): array
    {
        $contentDb = new ContentDatabase();
        $existing = $contentDb->loadSlot($slot);
        
        if ($existing === null) {
            throw new \RuntimeException("Slot {$slot} is empty or doesn't exist");
        }
        
        switch ($slotType) {
            case 'object':
                $contentDb->saveSlot($slot, null, $options);
                return ['slot' => $slot, 'type' => 'object', 'deleted' => true];
                
            case 'list':
                $foundIndex = null;
                foreach ($existing as $index => $item) {
                    if ($this->getNestedValue($item, $matchField) == $matchValue) {
                        $foundIndex = $index;
                        break;
                    }
                }
                
                if ($foundIndex === null) {
                    throw new \RuntimeException("No item found matching {$matchField} = {$matchValue}");
                }
                
                array_splice($existing, $foundIndex, 1);
                $contentDb->saveSlot($slot, $existing, $options);
                return ['slot' => $slot, 'type' => 'list', 'deleted_index' => $foundIndex, 'deleted' => true];
                
            case 'collection':
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
                
                if ($foundKey === null) {
                    throw new \RuntimeException("No item found matching {$matchField} = {$matchValue}");
                }
                
                unset($existing[$foundKey]);
                $contentDb->saveSlot($slot, $existing, $options);
                return ['slot' => $slot, 'type' => 'collection', 'deleted_slug' => $foundKey, 'deleted' => true];
                
            default:
                throw new \RuntimeException("Unknown slot type: {$slotType}");
        }
    }
    
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
}
