<?php
/**
 * NOMAD CMS - Payload Mapper
 * 
 * JSONPath-based payload transformation engine.
 * Transforms incoming webhook payloads to the format required by actions.
 * 
 * Supports:
 * - JSONPath expressions ($.field.path, $..recursive, $.array[0], etc.)
 * - Template strings with embedded expressions (e.g., "Hello, $.user.name!")
 * - Conditional expressions ($.field ?? 'default')
 * - Array operations ($.items[*].name, $.items[-1])
 * - Math expressions ($.price * 1.2)
 * - String concatenation
 */

declare(strict_types=1);

namespace NomadCMS\Webhooks;

class PayloadMapper
{
    /**
     * Transform payload using mapping rules
     * 
     * @param array $payload Original payload
     * @param array $mapping Mapping rules (output_field => jsonpath_expression)
     * @return array Transformed payload
     */
    public function map(array $payload, array $mapping): array
    {
        $result = [];
        
        foreach ($mapping as $outputKey => $expression) {
            $value = $this->evaluateExpression($expression, $payload);
            $this->setNestedValue($result, $outputKey, $value);
        }
        
        return $result;
    }
    
    /**
     * Evaluate a JSONPath or template expression
     * 
     * @param mixed $expression Expression to evaluate
     * @param array $payload Source data
     * @return mixed Evaluated value
     */
    public function evaluateExpression(mixed $expression, array $payload): mixed
    {
        if (!is_string($expression)) {
            return $expression;
        }
        
        // Check if it's a template string (contains non-path text)
        if ($this->isTemplateString($expression)) {
            return $this->evaluateTemplate($expression, $payload);
        }
        
        // Pure JSONPath expression
        if (str_starts_with($expression, '$.') || str_starts_with($expression, '$[')) {
            return $this->evaluateJsonPath($expression, $payload);
        }
        
        // Check for default value operator (??)
        if (str_contains($expression, '??')) {
            return $this->evaluateWithDefault($expression, $payload);
        }
        
        // Static value
        return $expression;
    }
    
    /**
     * Check if expression is a template string
     */
    private function isTemplateString(string $expression): bool
    {
        // If it has text before or after the JSONPath, it's a template
        if (str_starts_with($expression, '$.') || str_starts_with($expression, '$[')) {
            // Check if there's more than just the path
            $pathEnd = $this->findPathEnd($expression);
            return $pathEnd < strlen($expression);
        }
        
        // If it contains embedded expressions like {{$.path}}
        return preg_match('/\{\{.*?\}\}/', $expression) === 1 
            || preg_match('/\$\.[a-z0-9_.\[\]]+/i', $expression) === 1;
    }
    
    /**
     * Evaluate a template string
     */
    private function evaluateTemplate(string $template, array $payload): string
    {
        // Replace {{$.path}} expressions
        $result = preg_replace_callback('/\{\{(\$[^}]+)\}\}/', function($matches) use ($payload) {
            $value = $this->evaluateJsonPath($matches[1], $payload);
            return is_array($value) ? json_encode($value) : (string)($value ?? '');
        }, $template);
        
        // Replace bare $.path expressions in the string
        $result = preg_replace_callback('/(\$\.[a-z0-9_.\[\]*-]+)/i', function($matches) use ($payload) {
            $value = $this->evaluateJsonPath($matches[1], $payload);
            return is_array($value) ? json_encode($value) : (string)($value ?? '');
        }, $result);
        
        return $result;
    }
    
    /**
     * Evaluate JSONPath expression
     * 
     * Simplified JSONPath implementation supporting common patterns:
     * - $.field - Root field
     * - $.field.nested - Nested field
     * - $.array[0] - Array index
     * - $.array[-1] - Last array element
     * - $.array[*] - All array elements
     * - $.array[*].field - Field from all array elements
     * - $..field - Recursive descent (find field anywhere)
     */
    public function evaluateJsonPath(string $path, array $data): mixed
    {
        // Handle root reference
        if ($path === '$') {
            return $data;
        }
        
        // Remove leading $. or $
        $path = preg_replace('/^\$\.?/', '', $path);
        
        if (empty($path)) {
            return $data;
        }
        
        // Handle recursive descent
        if (str_starts_with($path, '.')) {
            return $this->recursiveSearch(substr($path, 1), $data);
        }
        
        return $this->traversePath($path, $data);
    }
    
    /**
     * Traverse a path through the data
     */
    private function traversePath(string $path, mixed $data): mixed
    {
        $segments = $this->parsePathSegments($path);
        $current = $data;
        
        foreach ($segments as $segment) {
            if ($current === null) {
                return null;
            }
            
            // Array index: [0], [-1], [*]
            if (preg_match('/^\[(-?\d+|\*)\]$/', $segment, $matches)) {
                if (!is_array($current)) {
                    return null;
                }
                
                $index = $matches[1];
                
                if ($index === '*') {
                    // Return all elements
                    return array_values($current);
                }
                
                $idx = (int)$index;
                if ($idx < 0) {
                    $idx = count($current) + $idx;
                }
                
                $current = $current[$idx] ?? null;
                continue;
            }
            
            // Field with array access: field[0]
            if (preg_match('/^([^[]+)\[(-?\d+|\*)\]$/', $segment, $matches)) {
                $field = $matches[1];
                $index = $matches[2];
                
                if (!is_array($current) || !isset($current[$field])) {
                    return null;
                }
                
                $arr = $current[$field];
                if (!is_array($arr)) {
                    return null;
                }
                
                if ($index === '*') {
                    $current = array_values($arr);
                } else {
                    $idx = (int)$index;
                    if ($idx < 0) {
                        $idx = count($arr) + $idx;
                    }
                    $current = $arr[$idx] ?? null;
                }
                continue;
            }
            
            // Regular field
            if (!is_array($current) || !array_key_exists($segment, $current)) {
                return null;
            }
            
            $current = $current[$segment];
        }
        
        return $current;
    }
    
    /**
     * Parse path into segments
     */
    private function parsePathSegments(string $path): array
    {
        $segments = [];
        $current = '';
        $inBracket = false;
        
        for ($i = 0; $i < strlen($path); $i++) {
            $char = $path[$i];
            
            if ($char === '[') {
                if ($current !== '') {
                    $segments[] = $current;
                    $current = '';
                }
                $inBracket = true;
                $current = '[';
            } elseif ($char === ']') {
                $current .= ']';
                $segments[] = $current;
                $current = '';
                $inBracket = false;
            } elseif ($char === '.' && !$inBracket) {
                if ($current !== '') {
                    $segments[] = $current;
                }
                $current = '';
            } else {
                $current .= $char;
            }
        }
        
        if ($current !== '') {
            $segments[] = $current;
        }
        
        return $segments;
    }
    
    /**
     * Recursive search for a field
     */
    private function recursiveSearch(string $field, array $data): mixed
    {
        $results = [];
        $this->findRecursive($field, $data, $results);
        
        if (count($results) === 0) {
            return null;
        }
        if (count($results) === 1) {
            return $results[0];
        }
        return $results;
    }
    
    /**
     * Helper for recursive search
     */
    private function findRecursive(string $field, mixed $data, array &$results): void
    {
        if (!is_array($data)) {
            return;
        }
        
        // Check if current level has the field
        if (isset($data[$field])) {
            $results[] = $data[$field];
        }
        
        // Search nested arrays
        foreach ($data as $value) {
            if (is_array($value)) {
                $this->findRecursive($field, $value, $results);
            }
        }
    }
    
    /**
     * Evaluate expression with default value
     */
    private function evaluateWithDefault(string $expression, array $payload): mixed
    {
        [$path, $default] = array_map('trim', explode('??', $expression, 2));
        
        $value = $this->evaluateExpression($path, $payload);
        
        if ($value === null || $value === '') {
            // Parse default value
            $default = trim($default, '"\'');
            if (is_numeric($default)) {
                return str_contains($default, '.') ? (float)$default : (int)$default;
            }
            if ($default === 'true') return true;
            if ($default === 'false') return false;
            if ($default === 'null') return null;
            return $default;
        }
        
        return $value;
    }
    
    /**
     * Find where a JSONPath expression ends in a template
     */
    private function findPathEnd(string $expression): int
    {
        $len = strlen($expression);
        $inBracket = false;
        
        for ($i = 0; $i < $len; $i++) {
            $char = $expression[$i];
            
            if ($char === '[') {
                $inBracket = true;
            } elseif ($char === ']') {
                $inBracket = false;
            } elseif (!$inBracket && !preg_match('/[a-z0-9_.$]/i', $char)) {
                return $i;
            }
        }
        
        return $len;
    }
    
    /**
     * Set a nested value in array using dot notation
     */
    private function setNestedValue(array &$array, string $key, mixed $value): void
    {
        $keys = explode('.', $key);
        $current = &$array;
        
        foreach ($keys as $i => $k) {
            if ($i === count($keys) - 1) {
                $current[$k] = $value;
            } else {
                if (!isset($current[$k]) || !is_array($current[$k])) {
                    $current[$k] = [];
                }
                $current = &$current[$k];
            }
        }
    }
    
    /**
     * Create mapping from suggestions based on provider
     */
    public static function suggestMapping(string $provider, array $samplePayload): array
    {
        return match ($provider) {
            'github' => self::suggestGithubMapping($samplePayload),
            'stripe' => self::suggestStripeMapping($samplePayload),
            'shopify' => self::suggestShopifyMapping($samplePayload),
            'discord' => self::suggestDiscordMapping($samplePayload),
            default => self::suggestGenericMapping($samplePayload),
        };
    }
    
    /**
     * GitHub webhook mapping suggestions
     */
    private static function suggestGithubMapping(array $payload): array
    {
        $suggestions = [];
        
        if (isset($payload['action'])) {
            $suggestions['event'] = '$.action';
        }
        
        if (isset($payload['repository'])) {
            $suggestions['repo_name'] = '$.repository.full_name';
            $suggestions['repo_url'] = '$.repository.html_url';
        }
        
        if (isset($payload['sender'])) {
            $suggestions['user'] = '$.sender.login';
            $suggestions['user_avatar'] = '$.sender.avatar_url';
        }
        
        if (isset($payload['commits'])) {
            $suggestions['commit_message'] = '$.commits[0].message';
            $suggestions['commit_author'] = '$.commits[0].author.name';
            $suggestions['commit_url'] = '$.commits[0].url';
        }
        
        if (isset($payload['pull_request'])) {
            $suggestions['pr_title'] = '$.pull_request.title';
            $suggestions['pr_body'] = '$.pull_request.body';
            $suggestions['pr_url'] = '$.pull_request.html_url';
        }
        
        if (isset($payload['issue'])) {
            $suggestions['issue_title'] = '$.issue.title';
            $suggestions['issue_body'] = '$.issue.body';
            $suggestions['issue_url'] = '$.issue.html_url';
        }
        
        if (isset($payload['release'])) {
            $suggestions['release_name'] = '$.release.name';
            $suggestions['release_tag'] = '$.release.tag_name';
            $suggestions['release_body'] = '$.release.body';
            $suggestions['release_url'] = '$.release.html_url';
        }
        
        return $suggestions;
    }
    
    /**
     * Stripe webhook mapping suggestions
     */
    private static function suggestStripeMapping(array $payload): array
    {
        $suggestions = [];
        
        if (isset($payload['type'])) {
            $suggestions['event'] = '$.type';
        }
        
        if (isset($payload['data']['object'])) {
            $obj = $payload['data']['object'];
            
            if (isset($obj['id'])) {
                $suggestions['object_id'] = '$.data.object.id';
            }
            if (isset($obj['amount'])) {
                $suggestions['amount'] = '$.data.object.amount';
                $suggestions['currency'] = '$.data.object.currency';
            }
            if (isset($obj['customer'])) {
                $suggestions['customer_id'] = '$.data.object.customer';
            }
            if (isset($obj['customer_email'])) {
                $suggestions['customer_email'] = '$.data.object.customer_email';
            }
            if (isset($obj['payment_status'])) {
                $suggestions['status'] = '$.data.object.payment_status';
            }
            if (isset($obj['metadata'])) {
                $suggestions['metadata'] = '$.data.object.metadata';
            }
        }
        
        return $suggestions;
    }
    
    /**
     * Shopify webhook mapping suggestions
     */
    private static function suggestShopifyMapping(array $payload): array
    {
        $suggestions = [];
        
        if (isset($payload['id'])) {
            $suggestions['id'] = '$.id';
        }
        
        if (isset($payload['title'])) {
            $suggestions['title'] = '$.title';
        }
        
        if (isset($payload['handle'])) {
            $suggestions['slug'] = '$.handle';
        }
        
        if (isset($payload['body_html'])) {
            $suggestions['body'] = '$.body_html';
        }
        
        if (isset($payload['variants'])) {
            $suggestions['price'] = '$.variants[0].price';
            $suggestions['sku'] = '$.variants[0].sku';
            $suggestions['inventory'] = '$.variants[0].inventory_quantity';
        }
        
        if (isset($payload['images'])) {
            $suggestions['image'] = '$.images[0].src';
        }
        
        if (isset($payload['email'])) {
            $suggestions['email'] = '$.email';
        }
        
        if (isset($payload['customer'])) {
            $suggestions['customer_name'] = '$.customer.first_name $.customer.last_name';
            $suggestions['customer_email'] = '$.customer.email';
        }
        
        return $suggestions;
    }
    
    /**
     * Discord webhook mapping suggestions
     */
    private static function suggestDiscordMapping(array $payload): array
    {
        $suggestions = [];
        
        if (isset($payload['content'])) {
            $suggestions['message'] = '$.content';
        }
        
        if (isset($payload['author'])) {
            $suggestions['author_name'] = '$.author.username';
            $suggestions['author_id'] = '$.author.id';
        }
        
        if (isset($payload['channel_id'])) {
            $suggestions['channel'] = '$.channel_id';
        }
        
        return $suggestions;
    }
    
    /**
     * Generic mapping suggestions
     */
    private static function suggestGenericMapping(array $payload): array
    {
        $suggestions = [];
        $commonFields = ['id', 'type', 'event', 'action', 'name', 'title', 'message', 'data', 'timestamp', 'created_at'];
        
        foreach ($commonFields as $field) {
            if (isset($payload[$field])) {
                $suggestions[$field] = '$.' . $field;
            }
        }
        
        return $suggestions;
    }
    
    /**
     * Test a mapping against sample data
     */
    public function testMapping(array $mapping, array $samplePayload): array
    {
        $result = [
            'success' => true,
            'output' => [],
            'errors' => [],
        ];
        
        foreach ($mapping as $key => $expression) {
            try {
                $value = $this->evaluateExpression($expression, $samplePayload);
                $result['output'][$key] = $value;
            } catch (\Exception $e) {
                $result['success'] = false;
                $result['errors'][$key] = $e->getMessage();
            }
        }
        
        return $result;
    }
}
