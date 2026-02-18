<?php
/**
 * NOMAD CMS - Publish Content Action
 * 
 * Publishes or unpublishes content.
 */

declare(strict_types=1);

namespace NomadCMS\Webhooks\Actions\Content;

use NomadCMS\Webhooks\Actions\BaseAction;
use NomadCMS\Webhooks\Actions\ActionContext;
use NomadCMS\Webhooks\Actions\ActionResult;
use NomadCMS\Database\ContentDatabase;
use NomadCMS\Database\MassiveDatabase;

class PublishContentAction extends BaseAction
{
    public function getType(): string
    {
        return 'publish_content';
    }
    
    public function getName(): string
    {
        return 'Tartalom Publikálása';
    }
    
    public function getDescription(): string
    {
        return 'Tartalom publikálása vagy visszavonása';
    }
    
    public function getCategory(): string
    {
        return 'content';
    }
    
    public function getIcon(): string
    {
        return '📢';
    }
    
    public function getConfigSchema(): array
    {
        return [
            'type' => 'object',
            'required' => ['slot', 'action'],
            'properties' => [
                'slot' => [
                    'type' => 'string',
                    'title' => 'Slot',
                    'description' => 'A slot neve',
                ],
                'action' => [
                    'type' => 'string',
                    'title' => 'Művelet',
                    'enum' => ['publish', 'unpublish', 'toggle'],
                    'default' => 'publish',
                ],
                'match_field' => [
                    'type' => 'string',
                    'title' => 'Egyeztetési mező',
                    'default' => 'id',
                ],
                'match_source' => [
                    'type' => 'string',
                    'title' => 'Egyeztetési érték forrása',
                    'default' => '$.id',
                ],
                'published_at_field' => [
                    'type' => 'string',
                    'title' => 'Publikálás dátum mező',
                    'default' => 'published_at',
                ],
                'status_field' => [
                    'type' => 'string',
                    'title' => 'Státusz mező',
                    'default' => 'status',
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
            $action = $context->getConfig('action', 'publish');
            $matchField = $context->getConfig('match_field', 'id');
            $matchSource = $context->getConfig('match_source', '$.id');
            $statusField = $context->getConfig('status_field', 'status');
            $publishedAtField = $context->getConfig('published_at_field', 'published_at');
            
            $mapper = new \NomadCMS\Webhooks\PayloadMapper();
            $matchValue = $mapper->evaluateJsonPath($matchSource, $context->originalPayload);
            
            if ($matchValue === null) {
                return ActionResult::failure("Match value not found at path: {$matchSource}");
            }
            
            $slotType = $this->getSlotType($slot);
            $options = [
                'changed_by' => 'webhook:action:' . ($context->endpoint['name'] ?? 'unknown'),
            ];
            
            // Determine new status
            $now = date('Y-m-d H:i:s');
            
            if ($slotType === 'massive') {
                $massive = new MassiveDatabase($slot);
                
                if ($matchField === 'id') {
                    $existing = $massive->find((int)$matchValue);
                } else {
                    $results = $massive->query()->where($matchField, '=', $matchValue)->limit(1)->get();
                    $existing = $results[0] ?? null;
                }
                
                if (!$existing) {
                    return ActionResult::failure("Content not found");
                }
                
                $currentStatus = $existing[$statusField] ?? 'draft';
                $newStatus = $this->determineStatus($action, $currentStatus);
                
                $updateData = [$statusField => $newStatus];
                if ($newStatus === 'published' && empty($existing[$publishedAtField])) {
                    $updateData[$publishedAtField] = $now;
                }
                
                $massive->update($existing['id'], $updateData);
                
                $result = [
                    'id' => $existing['id'],
                    'slot' => $slot,
                    'old_status' => $currentStatus,
                    'new_status' => $newStatus,
                ];
            } else {
                $contentDb = new ContentDatabase();
                $existing = $contentDb->loadSlot($slot);
                
                // For object slots
                if ($slotType === 'object') {
                    $currentStatus = $existing[$statusField] ?? 'draft';
                    $newStatus = $this->determineStatus($action, $currentStatus);
                    
                    $existing[$statusField] = $newStatus;
                    if ($newStatus === 'published' && empty($existing[$publishedAtField])) {
                        $existing[$publishedAtField] = $now;
                    }
                    
                    $contentDb->saveSlot($slot, $existing, $options);
                    
                    $result = [
                        'slot' => $slot,
                        'old_status' => $currentStatus,
                        'new_status' => $newStatus,
                    ];
                } else {
                    // For list/collection slots
                    $found = false;
                    foreach ($existing as $key => &$item) {
                        $itemMatch = ($matchField === 'slug' && $key == $matchValue) ||
                                     ($this->getNestedValue($item, $matchField) == $matchValue);
                        
                        if ($itemMatch) {
                            $currentStatus = $item[$statusField] ?? 'draft';
                            $newStatus = $this->determineStatus($action, $currentStatus);
                            
                            $item[$statusField] = $newStatus;
                            if ($newStatus === 'published' && empty($item[$publishedAtField])) {
                                $item[$publishedAtField] = $now;
                            }
                            
                            $found = true;
                            $result = [
                                'slot' => $slot,
                                'key' => $key,
                                'old_status' => $currentStatus,
                                'new_status' => $newStatus,
                            ];
                            break;
                        }
                    }
                    
                    if (!$found) {
                        return ActionResult::failure("Content not found");
                    }
                    
                    $contentDb->saveSlot($slot, $existing, $options);
                }
            }
            
            $executionTime = (int)((microtime(true) - $startTime) * 1000);
            
            return new ActionResult(
                success: true,
                data: $result,
                statusCode: 200,
                executionTimeMs: $executionTime
            );
            
        } catch (\Exception $e) {
            $this->log('Publish content failed', ['error' => $e->getMessage()]);
            return ActionResult::failure($e->getMessage());
        }
    }
    
    private function determineStatus(string $action, string $currentStatus): string
    {
        return match ($action) {
            'publish' => 'published',
            'unpublish' => 'draft',
            'toggle' => $currentStatus === 'published' ? 'draft' : 'published',
            default => 'published',
        };
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
