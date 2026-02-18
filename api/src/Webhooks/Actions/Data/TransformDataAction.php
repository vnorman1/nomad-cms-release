<?php
/**
 * NOMAD CMS - Transform Data Action
 * 
 * Transforms, filters, and manipulates data in the pipeline
 */

declare(strict_types=1);

namespace NomadCMS\Webhooks\Actions\Data;

use NomadCMS\Webhooks\Actions\BaseAction;
use NomadCMS\Webhooks\Actions\ActionContext;
use NomadCMS\Webhooks\Actions\ActionResult;

class TransformDataAction extends BaseAction
{
    protected bool $requiresProvider = false;
    
    public function getType(): string
    {
        return 'transform_data';
    }
    
    public function getName(): string
    {
        return 'Adat Transzformálás';
    }
    
    public function getDescription(): string
    {
        return 'Adat átalakítása, szűrése és manipulálása a pipeline-ban';
    }
    
    public function getCategory(): string
    {
        return 'data';
    }
    
    public function getIcon(): string
    {
        return '🔄';
    }
    
    public function getConfigSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'operations' => [
                    'type' => 'array',
                    'title' => 'Műveletek',
                    'items' => [
                        'type' => 'object',
                        'properties' => [
                            'type' => [
                                'type' => 'string',
                                'enum' => [
                                    'set', 'unset', 'rename', 'copy', 'move',
                                    'uppercase', 'lowercase', 'trim', 'replace',
                                    'split', 'join', 'slice', 'concat',
                                    'to_int', 'to_float', 'to_string', 'to_bool', 'to_array', 'to_json',
                                    'add', 'subtract', 'multiply', 'divide', 'modulo', 'round',
                                    'date_format', 'date_parse', 'timestamp',
                                    'filter', 'map', 'reduce', 'sort', 'unique', 'flatten',
                                    'merge', 'extract', 'template',
                                ],
                            ],
                            'field' => ['type' => 'string', 'description' => 'Target field (JSONPath)'],
                            'source' => ['type' => 'string', 'description' => 'Source field (JSONPath)'],
                            'value' => ['type' => ['string', 'number', 'boolean', 'object', 'array']],
                            'pattern' => ['type' => 'string', 'description' => 'Regex pattern for replace'],
                            'replacement' => ['type' => 'string'],
                            'delimiter' => ['type' => 'string'],
                            'format' => ['type' => 'string', 'description' => 'Date format string'],
                            'condition' => ['type' => 'string', 'description' => 'Condition for filter operations'],
                        ],
                        'required' => ['type'],
                    ],
                ],
                'output_field' => [
                    'type' => 'string',
                    'title' => 'Kimenet mező',
                    'description' => 'Hova mentse az eredményt (alapértelmezett: felülírja a mappedPayload-ot)',
                ],
                'preserve_original' => [
                    'type' => 'boolean',
                    'title' => 'Eredeti megtartása',
                    'default' => false,
                ],
            ],
        ];
    }
    
    public function getExpectedFields(): array
    {
        return [];
    }
    
    public function execute(ActionContext $context): ActionResult
    {
        $startTime = microtime(true);
        
        try {
            $config = $context->actionConfig;
            $operations = $config['operations'] ?? [];
            
            // Work on a copy of the data
            $data = $config['preserve_original'] 
                ? $context->mappedPayload 
                : array_merge($context->originalPayload, $context->mappedPayload);
            
            // Apply each operation
            foreach ($operations as $index => $operation) {
                try {
                    $data = $this->applyOperation($data, $operation, $context);
                } catch (\Exception $e) {
                    $this->log("Operation {$index} failed", [
                        'operation' => $operation,
                        'error' => $e->getMessage(),
                    ]);
                    // Continue with other operations
                }
            }
            
            // Store result
            if (!empty($config['output_field'])) {
                $context->setVariable($config['output_field'], $data);
            } else {
                // Update mapped payload with transformed data
                $context->mappedPayload = array_merge($context->mappedPayload, $data);
            }
            
            $executionTime = (int)((microtime(true) - $startTime) * 1000);
            
            return new ActionResult(
                success: true,
                data: [
                    'operations_applied' => count($operations),
                    'transformed_data' => $data,
                ],
                statusCode: 200,
                executionTimeMs: $executionTime
            );
            
        } catch (\Exception $e) {
            $this->log('Transform failed', ['error' => $e->getMessage()]);
            return ActionResult::failure($e->getMessage());
        }
    }
    
    /**
     * Apply a single transformation operation
     */
    private function applyOperation(array $data, array $operation, ActionContext $context): array
    {
        $type = $operation['type'];
        $field = $operation['field'] ?? null;
        $source = $operation['source'] ?? $field;
        $value = $operation['value'] ?? null;
        
        // Get source value using JSONPath
        $sourceValue = $source ? $this->getValueByPath($data, $source) : null;
        
        $result = match ($type) {
            // Value operations
            'set' => $this->opSet($data, $field, $this->resolveValue($value, $context)),
            'unset' => $this->opUnset($data, $field),
            'rename' => $this->opRename($data, $source, $field),
            'copy' => $this->opCopy($data, $source, $field),
            'move' => $this->opMove($data, $source, $field),
            
            // String operations
            'uppercase' => $this->opTransform($data, $field, $sourceValue, fn($v) => strtoupper((string)$v)),
            'lowercase' => $this->opTransform($data, $field, $sourceValue, fn($v) => strtolower((string)$v)),
            'trim' => $this->opTransform($data, $field, $sourceValue, fn($v) => trim((string)$v)),
            'replace' => $this->opReplace($data, $field, $sourceValue, $operation),
            'split' => $this->opSplit($data, $field, $sourceValue, $operation['delimiter'] ?? ','),
            'join' => $this->opJoin($data, $field, $sourceValue, $operation['delimiter'] ?? ','),
            'slice' => $this->opSlice($data, $field, $sourceValue, $operation),
            'concat' => $this->opConcat($data, $field, $operation),
            
            // Type conversions
            'to_int' => $this->opTransform($data, $field, $sourceValue, fn($v) => (int)$v),
            'to_float' => $this->opTransform($data, $field, $sourceValue, fn($v) => (float)$v),
            'to_string' => $this->opTransform($data, $field, $sourceValue, fn($v) => is_array($v) ? json_encode($v) : (string)$v),
            'to_bool' => $this->opTransform($data, $field, $sourceValue, fn($v) => filter_var($v, FILTER_VALIDATE_BOOLEAN)),
            'to_array' => $this->opTransform($data, $field, $sourceValue, fn($v) => (array)$v),
            'to_json' => $this->opTransform($data, $field, $sourceValue, fn($v) => json_encode($v)),
            
            // Math operations
            'add' => $this->opMath($data, $field, $sourceValue, $value, fn($a, $b) => $a + $b),
            'subtract' => $this->opMath($data, $field, $sourceValue, $value, fn($a, $b) => $a - $b),
            'multiply' => $this->opMath($data, $field, $sourceValue, $value, fn($a, $b) => $a * $b),
            'divide' => $this->opMath($data, $field, $sourceValue, $value, fn($a, $b) => $b != 0 ? $a / $b : 0),
            'modulo' => $this->opMath($data, $field, $sourceValue, $value, fn($a, $b) => $b != 0 ? $a % $b : 0),
            'round' => $this->opTransform($data, $field, $sourceValue, fn($v) => round((float)$v, (int)($value ?? 0))),
            
            // Date operations
            'date_format' => $this->opDateFormat($data, $field, $sourceValue, $operation['format'] ?? 'Y-m-d H:i:s'),
            'date_parse' => $this->opDateParse($data, $field, $sourceValue, $operation['format'] ?? null),
            'timestamp' => $this->opTimestamp($data, $field, $sourceValue),
            
            // Array operations
            'filter' => $this->opFilter($data, $field, $sourceValue, $operation['condition'] ?? null),
            'map' => $this->opMap($data, $field, $sourceValue, $operation),
            'reduce' => $this->opReduce($data, $field, $sourceValue, $operation),
            'sort' => $this->opSort($data, $field, $sourceValue, $operation),
            'unique' => $this->opTransform($data, $field, $sourceValue, fn($v) => array_values(array_unique((array)$v))),
            'flatten' => $this->opFlatten($data, $field, $sourceValue),
            
            // Object operations
            'merge' => $this->opMerge($data, $field, $operation),
            'extract' => $this->opExtract($data, $field, $sourceValue, $operation),
            'template' => $this->opTemplate($data, $field, $operation['value'] ?? '', $context),
            
            default => $data,
        };
        
        return $result;
    }
    
    // Basic operations
    
    private function opSet(array $data, ?string $field, mixed $value): array
    {
        if ($field === null) return $data;
        return $this->setValueByPath($data, $field, $value);
    }
    
    private function opUnset(array $data, ?string $field): array
    {
        if ($field === null) return $data;
        return $this->unsetByPath($data, $field);
    }
    
    private function opRename(array $data, ?string $from, ?string $to): array
    {
        if ($from === null || $to === null) return $data;
        $value = $this->getValueByPath($data, $from);
        $data = $this->unsetByPath($data, $from);
        return $this->setValueByPath($data, $to, $value);
    }
    
    private function opCopy(array $data, ?string $from, ?string $to): array
    {
        if ($from === null || $to === null) return $data;
        $value = $this->getValueByPath($data, $from);
        return $this->setValueByPath($data, $to, $value);
    }
    
    private function opMove(array $data, ?string $from, ?string $to): array
    {
        return $this->opRename($data, $from, $to);
    }
    
    private function opTransform(array $data, ?string $field, mixed $sourceValue, callable $transform): array
    {
        if ($field === null) return $data;
        return $this->setValueByPath($data, $field, $transform($sourceValue));
    }
    
    // String operations
    
    private function opReplace(array $data, ?string $field, mixed $value, array $operation): array
    {
        if ($field === null) return $data;
        
        $pattern = $operation['pattern'] ?? '';
        $replacement = $operation['replacement'] ?? '';
        
        if (str_starts_with($pattern, '/') && preg_match('/^\/.*\/[a-z]*$/i', $pattern)) {
            // Regex pattern
            $result = preg_replace($pattern, $replacement, (string)$value);
        } else {
            // Simple string replace
            $result = str_replace($pattern, $replacement, (string)$value);
        }
        
        return $this->setValueByPath($data, $field, $result);
    }
    
    private function opSplit(array $data, ?string $field, mixed $value, string $delimiter): array
    {
        if ($field === null) return $data;
        $result = explode($delimiter, (string)$value);
        return $this->setValueByPath($data, $field, $result);
    }
    
    private function opJoin(array $data, ?string $field, mixed $value, string $delimiter): array
    {
        if ($field === null || !is_array($value)) return $data;
        $result = implode($delimiter, $value);
        return $this->setValueByPath($data, $field, $result);
    }
    
    private function opSlice(array $data, ?string $field, mixed $value, array $operation): array
    {
        if ($field === null) return $data;
        
        $start = $operation['start'] ?? 0;
        $length = $operation['length'] ?? null;
        
        if (is_array($value)) {
            $result = array_slice($value, $start, $length);
        } else {
            $result = $length !== null 
                ? substr((string)$value, $start, $length)
                : substr((string)$value, $start);
        }
        
        return $this->setValueByPath($data, $field, $result);
    }
    
    private function opConcat(array $data, ?string $field, array $operation): array
    {
        if ($field === null) return $data;
        
        $sources = $operation['sources'] ?? [];
        $delimiter = $operation['delimiter'] ?? '';
        
        $parts = [];
        foreach ($sources as $source) {
            if (str_starts_with($source, '$.')) {
                $parts[] = $this->getValueByPath($data, $source);
            } else {
                $parts[] = $source;
            }
        }
        
        $result = implode($delimiter, array_filter($parts, fn($p) => $p !== null));
        return $this->setValueByPath($data, $field, $result);
    }
    
    // Math operations
    
    private function opMath(array $data, ?string $field, mixed $sourceValue, mixed $operand, callable $operation): array
    {
        if ($field === null) return $data;
        $result = $operation((float)$sourceValue, (float)$operand);
        return $this->setValueByPath($data, $field, $result);
    }
    
    // Date operations
    
    private function opDateFormat(array $data, ?string $field, mixed $value, string $format): array
    {
        if ($field === null) return $data;
        
        $timestamp = is_numeric($value) ? (int)$value : strtotime((string)$value);
        $result = date($format, $timestamp ?: time());
        
        return $this->setValueByPath($data, $field, $result);
    }
    
    private function opDateParse(array $data, ?string $field, mixed $value, ?string $format): array
    {
        if ($field === null) return $data;
        
        if ($format) {
            $date = \DateTime::createFromFormat($format, (string)$value);
            $result = $date ? $date->getTimestamp() : null;
        } else {
            $result = strtotime((string)$value) ?: null;
        }
        
        return $this->setValueByPath($data, $field, $result);
    }
    
    private function opTimestamp(array $data, ?string $field, mixed $value): array
    {
        if ($field === null) return $data;
        
        if ($value === null || $value === 'now') {
            $result = time();
        } elseif (is_numeric($value)) {
            $result = (int)$value;
        } else {
            $result = strtotime((string)$value) ?: time();
        }
        
        return $this->setValueByPath($data, $field, $result);
    }
    
    // Array operations
    
    private function opFilter(array $data, ?string $field, mixed $value, ?string $condition): array
    {
        if ($field === null || !is_array($value)) return $data;
        
        if ($condition === null) {
            // Filter out falsy values
            $result = array_values(array_filter($value));
        } else {
            // Simple condition parsing: field operator value
            $result = array_values(array_filter($value, function($item) use ($condition) {
                return $this->evaluateSimpleCondition($item, $condition);
            }));
        }
        
        return $this->setValueByPath($data, $field, $result);
    }
    
    private function opMap(array $data, ?string $field, mixed $value, array $operation): array
    {
        if ($field === null || !is_array($value)) return $data;
        
        $extractField = $operation['extract'] ?? null;
        $template = $operation['template'] ?? null;
        
        $result = array_map(function($item) use ($extractField, $template) {
            if ($extractField && is_array($item)) {
                return $item[$extractField] ?? null;
            }
            if ($template) {
                return $this->replaceVariablesSimple($template, is_array($item) ? $item : ['value' => $item]);
            }
            return $item;
        }, $value);
        
        return $this->setValueByPath($data, $field, $result);
    }
    
    private function opReduce(array $data, ?string $field, mixed $value, array $operation): array
    {
        if ($field === null || !is_array($value)) return $data;
        
        $reduceType = $operation['reduce_type'] ?? 'sum';
        $initial = $operation['initial'] ?? 0;
        
        $result = match ($reduceType) {
            'sum' => array_sum($value),
            'count' => count($value),
            'avg' => count($value) > 0 ? array_sum($value) / count($value) : 0,
            'min' => !empty($value) ? min($value) : null,
            'max' => !empty($value) ? max($value) : null,
            'first' => $value[0] ?? null,
            'last' => !empty($value) ? $value[count($value) - 1] : null,
            'concat' => implode('', $value),
            default => array_reduce($value, fn($carry, $item) => $carry + $item, $initial),
        };
        
        return $this->setValueByPath($data, $field, $result);
    }
    
    private function opSort(array $data, ?string $field, mixed $value, array $operation): array
    {
        if ($field === null || !is_array($value)) return $data;
        
        $sortField = $operation['sort_field'] ?? null;
        $direction = strtolower($operation['direction'] ?? 'asc');
        
        if ($sortField) {
            usort($value, function($a, $b) use ($sortField, $direction) {
                $aVal = is_array($a) ? ($a[$sortField] ?? null) : null;
                $bVal = is_array($b) ? ($b[$sortField] ?? null) : null;
                $cmp = $aVal <=> $bVal;
                return $direction === 'desc' ? -$cmp : $cmp;
            });
        } else {
            $direction === 'desc' ? rsort($value) : sort($value);
        }
        
        return $this->setValueByPath($data, $field, $value);
    }
    
    private function opFlatten(array $data, ?string $field, mixed $value): array
    {
        if ($field === null || !is_array($value)) return $data;
        
        $result = [];
        array_walk_recursive($value, function($item) use (&$result) {
            $result[] = $item;
        });
        
        return $this->setValueByPath($data, $field, $result);
    }
    
    // Object operations
    
    private function opMerge(array $data, ?string $field, array $operation): array
    {
        if ($field === null) return $data;
        
        $sources = $operation['sources'] ?? [];
        $result = [];
        
        foreach ($sources as $source) {
            $sourceData = $this->getValueByPath($data, $source);
            if (is_array($sourceData)) {
                $result = array_merge($result, $sourceData);
            }
        }
        
        return $this->setValueByPath($data, $field, $result);
    }
    
    private function opExtract(array $data, ?string $field, mixed $value, array $operation): array
    {
        if ($field === null || !is_array($value)) return $data;
        
        $keys = $operation['keys'] ?? [];
        $result = [];
        
        foreach ($keys as $key) {
            if (isset($value[$key])) {
                $result[$key] = $value[$key];
            }
        }
        
        return $this->setValueByPath($data, $field, $result);
    }
    
    private function opTemplate(array $data, ?string $field, string $template, ActionContext $context): array
    {
        if ($field === null) return $data;
        
        $result = $this->replaceVariables($template, $context);
        return $this->setValueByPath($data, $field, $result);
    }
    
    // Helper methods
    
    private function getValueByPath(array $data, string $path): mixed
    {
        // Remove $. prefix if present
        $path = preg_replace('/^\$\./', '', $path);
        
        $keys = explode('.', $path);
        $current = $data;
        
        foreach ($keys as $key) {
            // Handle array index notation [0]
            if (preg_match('/^(.+)\[(\d+)\]$/', $key, $matches)) {
                $current = $current[$matches[1]][$matches[2]] ?? null;
            } else {
                $current = $current[$key] ?? null;
            }
            
            if ($current === null) {
                return null;
            }
        }
        
        return $current;
    }
    
    private function setValueByPath(array $data, string $path, mixed $value): array
    {
        // Remove $. prefix if present
        $path = preg_replace('/^\$\./', '', $path);
        
        $keys = explode('.', $path);
        $current = &$data;
        
        foreach ($keys as $i => $key) {
            // Last key - set the value
            if ($i === count($keys) - 1) {
                $current[$key] = $value;
                break;
            }
            
            // Create intermediate arrays if needed
            if (!isset($current[$key]) || !is_array($current[$key])) {
                $current[$key] = [];
            }
            
            $current = &$current[$key];
        }
        
        return $data;
    }
    
    private function unsetByPath(array $data, string $path): array
    {
        $path = preg_replace('/^\$\./', '', $path);
        $keys = explode('.', $path);
        
        if (count($keys) === 1) {
            unset($data[$keys[0]]);
            return $data;
        }
        
        $lastKey = array_pop($keys);
        $current = &$data;
        
        foreach ($keys as $key) {
            if (!isset($current[$key]) || !is_array($current[$key])) {
                return $data;
            }
            $current = &$current[$key];
        }
        
        unset($current[$lastKey]);
        return $data;
    }
    
    private function evaluateSimpleCondition(mixed $item, string $condition): bool
    {
        // Parse: field operator value (e.g., "status == active")
        if (preg_match('/^(\w+)\s*(==|!=|>|<|>=|<=|contains)\s*(.+)$/', $condition, $matches)) {
            $field = $matches[1];
            $operator = $matches[2];
            $expected = trim($matches[3], '"\'');
            
            $actual = is_array($item) ? ($item[$field] ?? null) : $item;
            
            return match ($operator) {
                '==' => $actual == $expected,
                '!=' => $actual != $expected,
                '>' => $actual > $expected,
                '<' => $actual < $expected,
                '>=' => $actual >= $expected,
                '<=' => $actual <= $expected,
                'contains' => str_contains((string)$actual, $expected),
                default => true,
            };
        }
        
        return true;
    }
    
    private function replaceVariablesSimple(string $template, array $data): string
    {
        return preg_replace_callback('/\{\{(\w+)\}\}/', function($matches) use ($data) {
            return $data[$matches[1]] ?? '';
        }, $template);
    }
    
    private function resolveValue(mixed $value, ActionContext $context): mixed
    {
        if (is_string($value) && str_starts_with($value, '$.')) {
            return $this->getValueByPath($context->mappedPayload, $value);
        }
        return $value;
    }
}
