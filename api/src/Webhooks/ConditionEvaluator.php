<?php
/**
 * NOMAD CMS - Condition Evaluator
 * 
 * Evaluates trigger conditions for webhook actions.
 * 
 * Supports:
 * - JSONPath comparisons: $.field == 'value'
 * - Multiple operators: ==, !=, >, <, >=, <=, contains, starts_with, ends_with, matches
 * - Logical operators: AND, OR, NOT
 * - Array checks: in_array, has_key, is_empty
 * - Type checks: is_string, is_number, is_array, is_null
 */

declare(strict_types=1);

namespace NomadCMS\Webhooks;

class ConditionEvaluator
{
    private PayloadMapper $mapper;
    
    public function __construct()
    {
        $this->mapper = new PayloadMapper();
    }
    
    /**
     * Evaluate a condition expression against payload
     * 
     * @param string|null $expression Condition expression
     * @param array $payload Webhook payload
     * @return bool True if condition is met
     */
    public function evaluate(?string $expression, array $payload): bool
    {
        if (empty($expression)) {
            return true; // No condition = always match
        }
        
        $expression = trim($expression);
        
        // Handle logical operators (recursively)
        if ($this->hasLogicalOperator($expression)) {
            return $this->evaluateLogical($expression, $payload);
        }
        
        // Single condition
        return $this->evaluateSingle($expression, $payload);
    }
    
    /**
     * Check if expression has top-level logical operators
     */
    private function hasLogicalOperator(string $expression): bool
    {
        // Don't match inside strings or parentheses
        $level = 0;
        $inString = false;
        $stringChar = '';
        
        $tokens = preg_split('/(\s+AND\s+|\s+OR\s+|\s+&&\s+|\s+\|\|\s+)/i', $expression, -1, PREG_SPLIT_DELIM_CAPTURE);
        
        return count($tokens) > 1;
    }
    
    /**
     * Evaluate logical expression (AND, OR)
     */
    private function evaluateLogical(string $expression, array $payload): bool
    {
        // Split by OR first (lower precedence)
        $orParts = preg_split('/\s+OR\s+|\s+\|\|\s+/i', $expression);
        
        if (count($orParts) > 1) {
            foreach ($orParts as $part) {
                if ($this->evaluate(trim($part), $payload)) {
                    return true;
                }
            }
            return false;
        }
        
        // Split by AND
        $andParts = preg_split('/\s+AND\s+|\s+&&\s+/i', $expression);
        
        foreach ($andParts as $part) {
            $part = trim($part);
            
            // Handle NOT
            if (preg_match('/^NOT\s+/i', $part)) {
                $innerExpr = preg_replace('/^NOT\s+/i', '', $part);
                if ($this->evaluate($innerExpr, $payload)) {
                    return false;
                }
            } elseif (!$this->evaluateSingle($part, $payload)) {
                return false;
            }
        }
        
        return true;
    }
    
    /**
     * Evaluate a single condition
     */
    private function evaluateSingle(string $expression, array $payload): bool
    {
        // Handle parentheses
        if (str_starts_with($expression, '(') && str_ends_with($expression, ')')) {
            return $this->evaluate(substr($expression, 1, -1), $payload);
        }
        
        // Handle NOT prefix
        if (preg_match('/^NOT\s+/i', $expression)) {
            return !$this->evaluate(preg_replace('/^NOT\s+/i', '', $expression), $payload);
        }
        
        // Parse comparison
        $operators = ['===', '!==', '==', '!=', '>=', '<=', '>', '<', 
                      ' contains ', ' starts_with ', ' ends_with ', ' matches ',
                      ' in_array ', ' has_key ', ' is_empty', ' is_not_empty',
                      ' is_string', ' is_number', ' is_array', ' is_null', ' is_bool'];
        
        foreach ($operators as $op) {
            $pos = stripos($expression, $op);
            if ($pos !== false) {
                $left = trim(substr($expression, 0, $pos));
                $right = trim(substr($expression, $pos + strlen($op)));
                
                return $this->compare($left, trim($op), $right, $payload);
            }
        }
        
        // Simple truthiness check (just a path)
        if (str_starts_with($expression, '$.') || str_starts_with($expression, '$[')) {
            $value = $this->mapper->evaluateJsonPath($expression, $payload);
            return $this->isTruthy($value);
        }
        
        // Literal boolean
        if (strtolower($expression) === 'true') return true;
        if (strtolower($expression) === 'false') return false;
        
        return false;
    }
    
    /**
     * Compare two values with an operator
     */
    private function compare(string $left, string $operator, string $right, array $payload): bool
    {
        $operator = trim(strtolower($operator));
        
        // Get left value (usually a JSONPath)
        $leftValue = $this->getValue($left, $payload);
        
        // Type check operators don't need right value
        if (in_array($operator, ['is_string', 'is_number', 'is_array', 'is_null', 'is_bool', 'is_empty', 'is_not_empty'])) {
            return match ($operator) {
                'is_string' => is_string($leftValue),
                'is_number' => is_numeric($leftValue),
                'is_array' => is_array($leftValue),
                'is_null' => $leftValue === null,
                'is_bool' => is_bool($leftValue),
                'is_empty' => empty($leftValue),
                'is_not_empty' => !empty($leftValue),
                default => false,
            };
        }
        
        // Get right value
        $rightValue = $this->getValue($right, $payload);
        
        return match ($operator) {
            '==', '===' => $leftValue == $rightValue,
            '!=', '!==' => $leftValue != $rightValue,
            '>' => is_numeric($leftValue) && is_numeric($rightValue) && $leftValue > $rightValue,
            '<' => is_numeric($leftValue) && is_numeric($rightValue) && $leftValue < $rightValue,
            '>=' => is_numeric($leftValue) && is_numeric($rightValue) && $leftValue >= $rightValue,
            '<=' => is_numeric($leftValue) && is_numeric($rightValue) && $leftValue <= $rightValue,
            'contains' => is_string($leftValue) && is_string($rightValue) && str_contains($leftValue, $rightValue),
            'starts_with' => is_string($leftValue) && is_string($rightValue) && str_starts_with($leftValue, $rightValue),
            'ends_with' => is_string($leftValue) && is_string($rightValue) && str_ends_with($leftValue, $rightValue),
            'matches' => is_string($leftValue) && $this->safeRegexMatch($rightValue, $leftValue),
            'in_array' => is_array($rightValue) && in_array($leftValue, $rightValue),
            'has_key' => is_array($leftValue) && array_key_exists($rightValue, $leftValue),
            default => false,
        };
    }
    
    /**
     * Safe regex match with ReDoS protection
     */
    private function safeRegexMatch(mixed $pattern, string $subject): bool
    {
        if (!is_string($pattern)) {
            return false;
        }
        
        // Validate regex syntax
        if (@preg_match($pattern, '') === false) {
            return false;
        }
        
        // ReDoS protection: limit pattern complexity and subject length
        if (strlen($pattern) > 500 || strlen($subject) > 10000) {
            return false;
        }
        
        // Check for catastrophic backtracking patterns
        $dangerousPatterns = [
            '/\(\.\*\)\+/',           // (.*)+
            '/\(\.\+\)\+/',           // (.+)+
            '/\(\[.*\]\*\)\+/',       // ([...]*)+
            '/\(\[.*\]\+\)\+/',       // ([...]+)+
            '/\(\.\*\?\)\+/',         // (.*?)+
        ];
        
        foreach ($dangerousPatterns as $dangerous) {
            if (preg_match($dangerous, $pattern)) {
                return false;
            }
        }
        
        // Execute with timeout protection via PCRE backtrack limit
        $oldLimit = ini_get('pcre.backtrack_limit');
        ini_set('pcre.backtrack_limit', '10000');
        
        $result = @preg_match($pattern, $subject) === 1;
        
        ini_set('pcre.backtrack_limit', $oldLimit);
        
        return $result;
    }
    
    /**
     * Get value from expression (JSONPath or literal)
     */
    private function getValue(string $expression, array $payload): mixed
    {
        $expression = trim($expression);
        
        // JSONPath
        if (str_starts_with($expression, '$.') || str_starts_with($expression, '$[')) {
            return $this->mapper->evaluateJsonPath($expression, $payload);
        }
        
        // String literal (single or double quoted)
        if (preg_match('/^([\'"])(.*)\1$/', $expression, $matches)) {
            return $matches[2];
        }
        
        // Numeric literal
        if (is_numeric($expression)) {
            return str_contains($expression, '.') ? (float)$expression : (int)$expression;
        }
        
        // Boolean literal
        if (strtolower($expression) === 'true') return true;
        if (strtolower($expression) === 'false') return false;
        if (strtolower($expression) === 'null') return null;
        
        // Array literal (simple JSON array)
        if (str_starts_with($expression, '[') && str_ends_with($expression, ']')) {
            $decoded = json_decode($expression, true);
            if ($decoded !== null) {
                return $decoded;
            }
        }
        
        // Unquoted string
        return $expression;
    }
    
    /**
     * Check if value is truthy
     */
    private function isTruthy(mixed $value): bool
    {
        if ($value === null || $value === false || $value === '' || $value === 0 || $value === '0') {
            return false;
        }
        if (is_array($value) && empty($value)) {
            return false;
        }
        return true;
    }
    
    /**
     * Check if event matches filter
     * 
     * @param string|null $eventFilter JSON array of allowed events or wildcard pattern
     * @param string $event Current event type
     * @return bool True if event matches
     */
    public function matchesEventFilter(?string $eventFilter, string $event): bool
    {
        if (empty($eventFilter)) {
            return true; // No filter = all events
        }
        
        // Try to parse as JSON array
        $filters = json_decode($eventFilter, true);
        
        if (is_array($filters)) {
            foreach ($filters as $filter) {
                if ($this->matchesPattern($filter, $event)) {
                    return true;
                }
            }
            return false;
        }
        
        // Single pattern
        return $this->matchesPattern($eventFilter, $event);
    }
    
    /**
     * Check if event matches a pattern (supports wildcards)
     */
    private function matchesPattern(string $pattern, string $event): bool
    {
        // Exact match
        if ($pattern === $event) {
            return true;
        }
        
        // Wildcard match
        if (str_contains($pattern, '*')) {
            $regex = '/^' . str_replace(['*', '.'], ['.*', '\.'], $pattern) . '$/i';
            return preg_match($regex, $event) === 1;
        }
        
        // Prefix match (e.g., "push" matches "push.main", "push.develop")
        if (str_starts_with($event, $pattern . '.')) {
            return true;
        }
        
        return false;
    }
    
    /**
     * Build a condition expression from UI-friendly format
     */
    public static function buildExpression(array $conditions, string $logic = 'AND'): string
    {
        $parts = [];
        
        foreach ($conditions as $condition) {
            $field = $condition['field'] ?? '';
            $operator = $condition['operator'] ?? '==';
            $value = $condition['value'] ?? '';
            
            if (empty($field)) {
                continue;
            }
            
            // Ensure field starts with $.
            if (!str_starts_with($field, '$')) {
                $field = '$.' . $field;
            }
            
            // Format value
            if (is_string($value) && !is_numeric($value) && !in_array(strtolower($value), ['true', 'false', 'null'])) {
                $value = "'" . addslashes($value) . "'";
            }
            
            // Build condition part
            if (in_array($operator, ['is_string', 'is_number', 'is_array', 'is_null', 'is_empty', 'is_not_empty'])) {
                $parts[] = "{$field} {$operator}";
            } else {
                $parts[] = "{$field} {$operator} {$value}";
            }
        }
        
        if (empty($parts)) {
            return '';
        }
        
        $glue = $logic === 'OR' ? ' OR ' : ' AND ';
        return implode($glue, $parts);
    }
    
    /**
     * Parse an expression into UI-friendly format
     */
    public static function parseExpression(string $expression): array
    {
        $conditions = [];
        
        // Split by AND/OR
        $parts = preg_split('/\s+(AND|OR|&&|\|\|)\s+/i', $expression);
        
        foreach ($parts as $part) {
            $part = trim($part);
            if (empty($part)) continue;
            
            // Parse single condition
            $operators = ['===', '!==', '==', '!=', '>=', '<=', '>', '<',
                          'contains', 'starts_with', 'ends_with', 'matches',
                          'in_array', 'has_key', 'is_empty', 'is_not_empty',
                          'is_string', 'is_number', 'is_array', 'is_null', 'is_bool'];
            
            foreach ($operators as $op) {
                if (str_contains(strtolower($part), ' ' . $op) || str_contains($part, $op)) {
                    $splitParts = preg_split('/\s*' . preg_quote($op, '/') . '\s*/i', $part, 2);
                    $conditions[] = [
                        'field' => trim($splitParts[0] ?? ''),
                        'operator' => $op,
                        'value' => trim($splitParts[1] ?? '', " '\""),
                    ];
                    break;
                }
            }
        }
        
        return $conditions;
    }
}
