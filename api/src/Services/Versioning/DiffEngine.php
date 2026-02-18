<?php
/**
 * NOMAD CMS - Diff Engine
 * 
 * JSON Patch RFC 6902 implementation for computing and applying diffs.
 * Extracted from VersioningService for modularity.
 */

declare(strict_types=1);

namespace NomadCMS\Services\Versioning;

use Exception;
use RuntimeException;

class DiffEngine
{
    /**
     * Compute diff between two JSON values
     * 
     * @param string $oldJson Source JSON
     * @param string $newJson Target JSON
     * @return array{success: bool, diff_forward: array, content_hash: string, change_summary: string, error?: string}
     */
    public function computeDiff(string $oldJson, string $newJson): array
    {
        try {
            $old = json_decode($oldJson, true);
            $new = json_decode($newJson, true);
            
            if (json_last_error() !== JSON_ERROR_NONE) {
                return ['success' => false, 'error' => 'Invalid JSON'];
            }
            
            // Compute forward diff only (old → new)
            $diffForward = $this->jsonDiff($old, $new, '');
            
            // Calculate SHA-256 hash of new content
            $contentHash = hash('sha256', $newJson);
            
            // Generate change summary
            $changeSummary = $this->generateChangeSummary($diffForward);
            
            return [
                'success' => true,
                'diff_forward' => $diffForward,
                'diff_backward' => [], // Computed on-demand when needed
                'content_hash' => $contentHash,
                'change_summary' => $changeSummary
            ];
            
        } catch (Exception $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
    
    /**
     * Apply JSON patch (RFC 6902)
     */
    public function applyPatch(string $baseJson, array $patch): array
    {
        try {
            $data = json_decode($baseJson, true);
            
            // Handle JSON decode error (except for valid null)
            if ($data === null && $baseJson !== 'null' && json_last_error() !== JSON_ERROR_NONE) {
                return ['success' => false, 'error' => 'Invalid base JSON: ' . json_last_error_msg()];
            }
            
            // Handle null base
            if ($data === null && json_last_error() === JSON_ERROR_NONE) {
                foreach ($patch as $operation) {
                    if (($operation['op'] ?? '') === 'replace' && ($operation['path'] ?? '') === '/') {
                        $value = $operation['value'] ?? null;
                        return [
                            'success' => true,
                            'data' => $value,
                            'hash' => hash('sha256', json_encode($value, JSON_UNESCAPED_UNICODE))
                        ];
                    }
                }
                $data = [];
            }
            
            foreach ($patch as $operation) {
                $op = $operation['op'] ?? '';
                $path = $operation['path'] ?? '';
                $value = $operation['value'] ?? null;
                
                if ($op === 'replace' && $path === '/' && ($data === null || $data === [])) {
                    $data = $value;
                    continue;
                }
                
                switch ($op) {
                    case 'add':
                        $this->patchAdd($data, $path, $value);
                        break;
                    case 'remove':
                        if ($data !== null && is_array($data)) {
                            $this->patchRemove($data, $path);
                        }
                        break;
                    case 'replace':
                        $this->patchReplace($data, $path, $value);
                        break;
                    case 'move':
                        $this->patchMove($data, $operation['from'] ?? '', $path);
                        break;
                    case 'copy':
                        $this->patchCopy($data, $operation['from'] ?? '', $path);
                        break;
                    case 'test':
                        if (!$this->patchTest($data, $path, $value)) {
                            return ['success' => false, 'error' => 'Test operation failed'];
                        }
                        break;
                }
            }
            
            return [
                'success' => true,
                'data' => $data,
                'hash' => hash('sha256', json_encode($data, JSON_UNESCAPED_UNICODE))
            ];
            
        } catch (Exception $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
    
    /**
     * Compute backward diff on-demand by inverting forward diff operations
     */
    public function computeBackwardDiff(string $forwardDiffJson): string
    {
        try {
            $forwardOps = json_decode($forwardDiffJson, true);
            if (!is_array($forwardOps)) {
                return '[]';
            }
            
            $backwardOps = [];
            
            foreach (array_reverse($forwardOps) as $op) {
                $path = $op['path'] ?? '';
                
                switch ($op['op'] ?? '') {
                    case 'add':
                        $backwardOps[] = ['op' => 'remove', 'path' => $path, 'value' => $op['value'] ?? null];
                        break;
                    case 'remove':
                        $backwardOps[] = ['op' => 'add', 'path' => $path, 'value' => $op['value'] ?? null];
                        break;
                    case 'replace':
                        $backwardOps[] = ['op' => 'replace', 'path' => $path, 'value' => $op['old_value'] ?? '[előző érték]'];
                        break;
                    case 'move':
                        $backwardOps[] = ['op' => 'move', 'from' => $path, 'path' => $op['from'] ?? ''];
                        break;
                    case 'copy':
                        $backwardOps[] = ['op' => 'remove', 'path' => $path];
                        break;
                }
            }
            
            return json_encode($backwardOps, JSON_UNESCAPED_UNICODE);
            
        } catch (Exception $e) {
            return '[]';
        }
    }
    
    /**
     * Generate human-readable change summary
     */
    public function generateChangeSummary(array $diff): string
    {
        $counts = ['add' => 0, 'remove' => 0, 'replace' => 0, 'move' => 0, 'copy' => 0];
        
        foreach ($diff as $op) {
            $opType = $op['op'] ?? '';
            if (isset($counts[$opType])) {
                $counts[$opType]++;
            }
        }
        
        $parts = [];
        if ($counts['add'] > 0) $parts[] = "+{$counts['add']} added";
        if ($counts['remove'] > 0) $parts[] = "-{$counts['remove']} removed";
        if ($counts['replace'] > 0) $parts[] = "~{$counts['replace']} modified";
        if ($counts['move'] > 0) $parts[] = "↔{$counts['move']} moved";
        if ($counts['copy'] > 0) $parts[] = "⊕{$counts['copy']} copied";
        
        return empty($parts) ? 'No changes' : implode(', ', $parts);
    }
    
    // =========================================================================
    // PRIVATE HELPERS
    // =========================================================================
    
    /**
     * Compute JSON diff (RFC 6902 format)
     */
    private function jsonDiff(mixed $from, mixed $to, string $path): array
    {
        $diff = [];
        
        if (gettype($from) !== gettype($to)) {
            return [['op' => 'replace', 'path' => $path ?: '/', 'value' => $to, 'old_value' => $from]];
        }
        
        if (is_array($from) && is_array($to)) {
            $isFromAssoc = $this->isAssociativeArray($from);
            $isToAssoc = $this->isAssociativeArray($to);
            
            if ($isFromAssoc || $isToAssoc) {
                // Associative array (object)
                foreach ($to as $key => $value) {
                    $newPath = $path . '/' . $this->escapeJsonPointer((string)$key);
                    if (!array_key_exists($key, $from)) {
                        $diff[] = ['op' => 'add', 'path' => $newPath, 'value' => $value];
                    } elseif ($from[$key] !== $value) {
                        $diff = array_merge($diff, $this->jsonDiff($from[$key], $value, $newPath));
                    }
                }
                foreach ($from as $key => $value) {
                    if (!array_key_exists($key, $to)) {
                        $diff[] = ['op' => 'remove', 'path' => $path . '/' . $this->escapeJsonPointer((string)$key), 'value' => $value];
                    }
                }
            } else {
                // Sequential array - use ID-based diff if available
                $fromById = $this->indexArrayById($from);
                $toById = $this->indexArrayById($to);
                
                if ($fromById !== null && $toById !== null) {
                    $allIds = array_unique(array_merge(array_keys($fromById), array_keys($toById)));
                    foreach ($allIds as $id) {
                        $inFrom = isset($fromById[$id]);
                        $inTo = isset($toById[$id]);
                        
                        if (!$inFrom && $inTo) {
                            $toIndex = $toById[$id]['_index'];
                            $diff[] = ['op' => 'add', 'path' => $path . '/' . $toIndex, 'value' => $to[$toIndex]];
                        } elseif ($inFrom && !$inTo) {
                            $fromIndex = $fromById[$id]['_index'];
                            $diff[] = ['op' => 'remove', 'path' => $path . '/' . $fromIndex, 'value' => $from[$fromIndex]];
                        } elseif ($inFrom && $inTo) {
                            $fromIndex = $fromById[$id]['_index'];
                            $toIndex = $toById[$id]['_index'];
                            if ($from[$fromIndex] !== $to[$toIndex]) {
                                $diff = array_merge($diff, $this->jsonDiff($from[$fromIndex], $to[$toIndex], $path . '/' . $toIndex));
                            }
                        }
                    }
                } else {
                    // Fallback: index-based diff
                    $maxLen = max(count($from), count($to));
                    for ($i = 0; $i < $maxLen; $i++) {
                        $newPath = $path . '/' . $i;
                        if (!isset($from[$i])) {
                            $diff[] = ['op' => 'add', 'path' => $newPath, 'value' => $to[$i]];
                        } elseif (!isset($to[$i])) {
                            $diff[] = ['op' => 'remove', 'path' => $newPath, 'value' => $from[$i]];
                        } elseif ($from[$i] !== $to[$i]) {
                            $diff = array_merge($diff, $this->jsonDiff($from[$i], $to[$i], $newPath));
                        }
                    }
                }
            }
        } elseif ($from !== $to) {
            $diff[] = ['op' => 'replace', 'path' => $path ?: '/', 'value' => $to, 'old_value' => $from];
        }
        
        return $diff;
    }
    
    private function getPointerParts(string $path): array
    {
        if ($path === '' || $path === '/') return [];
        return array_map(fn($p) => $this->unescapeJsonPointer($p), explode('/', ltrim($path, '/')));
    }
    
    private function escapeJsonPointer(string $str): string
    {
        return str_replace(['~', '/'], ['~0', '~1'], $str);
    }
    
    private function unescapeJsonPointer(string $str): string
    {
        return str_replace(['~1', '~0'], ['/', '~'], $str);
    }
    
    private function &getRef(array &$data, array $parts): mixed
    {
        $ref = &$data;
        foreach ($parts as $part) {
            if (is_array($ref)) {
                $key = is_numeric($part) ? (int)$part : $part;
                if (!array_key_exists($key, $ref)) {
                    throw new RuntimeException("Path not found: $part");
                }
                $ref = &$ref[$key];
            } else {
                throw new RuntimeException("Cannot traverse non-array");
            }
        }
        return $ref;
    }
    
    private function patchAdd(array &$data, string $path, mixed $value): void
    {
        $parts = $this->getPointerParts($path);
        if (empty($parts)) { $data = $value; return; }
        
        $last = array_pop($parts);
        $ref = &$data;
        foreach ($parts as $part) {
            $ref = &$ref[is_numeric($part) ? (int)$part : $part];
        }
        
        $key = is_numeric($last) ? (int)$last : $last;
        if ($last === '-' && is_array($ref) && !$this->isAssociativeArray($ref)) {
            $ref[] = $value;
        } else {
            $ref[$key] = $value;
        }
    }
    
    private function patchRemove(array|null &$data, string $path): void
    {
        if ($data === null) return;
        $parts = $this->getPointerParts($path);
        if (empty($parts)) throw new RuntimeException("Cannot remove root");
        
        $last = array_pop($parts);
        $ref = &$data;
        foreach ($parts as $part) {
            $key = is_numeric($part) ? (int)$part : $part;
            if (!isset($ref[$key])) return;
            $ref = &$ref[$key];
        }
        unset($ref[is_numeric($last) ? (int)$last : $last]);
    }
    
    private function patchReplace(array|null &$data, string $path, mixed $value): void
    {
        $parts = $this->getPointerParts($path);
        if (empty($parts)) { $data = $value; return; }
        if ($data === null) $data = [];
        
        $last = array_pop($parts);
        $ref = &$data;
        foreach ($parts as $part) {
            $key = is_numeric($part) ? (int)$part : $part;
            if (!isset($ref[$key])) $ref[$key] = [];
            $ref = &$ref[$key];
        }
        $ref[is_numeric($last) ? (int)$last : $last] = $value;
    }
    
    private function patchMove(array &$data, string $from, string $to): void
    {
        $value = $this->getRef($data, $this->getPointerParts($from));
        $this->patchRemove($data, $from);
        $this->patchAdd($data, $to, $value);
    }
    
    private function patchCopy(array &$data, string $from, string $to): void
    {
        $value = $this->getRef($data, $this->getPointerParts($from));
        $this->patchAdd($data, $to, $value);
    }
    
    private function patchTest(array $data, string $path, mixed $value): bool
    {
        return $this->getRef($data, $this->getPointerParts($path)) === $value;
    }
    
    private function isAssociativeArray(array $arr): bool
    {
        return !empty($arr) && array_keys($arr) !== range(0, count($arr) - 1);
    }
    
    private function indexArrayById(array $arr): ?array
    {
        if (empty($arr)) return [];
        $first = $arr[0];
        if (!is_array($first)) return null;
        
        $idField = null;
        foreach (['_dndId', 'id', '_id'] as $field) {
            if (isset($first[$field]) && $first[$field] !== '') {
                $idField = $field;
                break;
            }
        }
        if ($idField === null) return null;
        
        $indexed = [];
        foreach ($arr as $index => $item) {
            if (!is_array($item) || !isset($item[$idField]) || $item[$idField] === '') return null;
            $id = (string) $item[$idField];
            if (isset($indexed[$id])) return null;
            $indexed[$id] = ['_index' => $index, 'item' => $item];
        }
        return $indexed;
    }
}
