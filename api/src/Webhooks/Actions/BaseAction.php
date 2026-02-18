<?php
/**
 * NOMAD CMS - Base Action Class
 * 
 * Abstract base class for all webhook actions.
 * Provides common functionality and utility methods.
 */

declare(strict_types=1);

namespace NomadCMS\Webhooks\Actions;

use NomadCMS\Security\EncryptionService;

abstract class BaseAction implements ActionInterface
{
    protected int $defaultTimeout = 30;
    protected bool $supportsAsync = true;
    protected bool $requiresProvider = false;
    protected ?string $requiredProvider = null;
    
    /**
     * {@inheritdoc}
     */
    public function requiresProvider(): bool
    {
        return $this->requiresProvider;
    }
    
    /**
     * {@inheritdoc}
     */
    public function getRequiredProvider(): ?string
    {
        return $this->requiredProvider;
    }
    
    /**
     * {@inheritdoc}
     */
    public function supportsAsync(): bool
    {
        return $this->supportsAsync;
    }
    
    /**
     * {@inheritdoc}
     */
    public function getDefaultTimeout(): int
    {
        return $this->defaultTimeout;
    }
    
    /**
     * {@inheritdoc}
     */
    public function getExpectedFields(): array
    {
        return [];
    }
    
    /**
     * {@inheritdoc}
     */
    public function validateConfig(array $config): array
    {
        $errors = [];
        $schema = $this->getConfigSchema();
        
        // Check required fields
        $required = $schema['required'] ?? [];
        foreach ($required as $field) {
            if (!isset($config[$field]) || $config[$field] === '' || $config[$field] === null) {
                $errors[] = "Field '{$field}' is required";
            }
        }
        
        // Check field types
        $properties = $schema['properties'] ?? [];
        foreach ($config as $key => $value) {
            if (!isset($properties[$key])) {
                continue; // Allow extra fields
            }
            
            $prop = $properties[$key];
            $type = $prop['type'] ?? 'string';
            
            if (!$this->validateType($value, $type)) {
                $errors[] = "Field '{$key}' must be of type '{$type}'";
            }
            
            // Check enum values
            if (isset($prop['enum']) && !in_array($value, $prop['enum'])) {
                $errors[] = "Field '{$key}' must be one of: " . implode(', ', $prop['enum']);
            }
            
            // Check min/max for numbers
            if ($type === 'integer' || $type === 'number') {
                if (isset($prop['minimum']) && $value < $prop['minimum']) {
                    $errors[] = "Field '{$key}' must be at least {$prop['minimum']}";
                }
                if (isset($prop['maximum']) && $value > $prop['maximum']) {
                    $errors[] = "Field '{$key}' must be at most {$prop['maximum']}";
                }
            }
            
            // Check string length
            if ($type === 'string' && is_string($value)) {
                if (isset($prop['minLength']) && strlen($value) < $prop['minLength']) {
                    $errors[] = "Field '{$key}' must be at least {$prop['minLength']} characters";
                }
                if (isset($prop['maxLength']) && strlen($value) > $prop['maxLength']) {
                    $errors[] = "Field '{$key}' must be at most {$prop['maxLength']} characters";
                }
                if (isset($prop['pattern']) && !preg_match($prop['pattern'], $value)) {
                    $errors[] = "Field '{$key}' has invalid format";
                }
            }
        }
        
        return $errors;
    }
    
    /**
     * Validate value type
     */
    protected function validateType(mixed $value, string $type): bool
    {
        return match ($type) {
            'string' => is_string($value),
            'integer' => is_int($value),
            'number' => is_numeric($value),
            'boolean' => is_bool($value),
            'array' => is_array($value),
            'object' => is_array($value) || is_object($value),
            'null' => is_null($value),
            default => true,
        };
    }
    
    /**
     * Make HTTP request with proper error handling
     */
    protected function httpRequest(
        string $method,
        string $url,
        array $headers = [],
        mixed $body = null,
        int $timeout = 30
    ): array {
        $ch = curl_init();
        
        curl_setopt_array($ch, [
            CURLOPT_URL => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => $timeout,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 3,
            CURLOPT_CUSTOMREQUEST => strtoupper($method),
            CURLOPT_HTTPHEADER => $this->formatHeaders($headers),
        ]);
        
        if ($body !== null) {
            if (is_array($body)) {
                $body = json_encode($body);
                if (!isset($headers['Content-Type'])) {
                    curl_setopt($ch, CURLOPT_HTTPHEADER, array_merge(
                        $this->formatHeaders($headers),
                        ['Content-Type: application/json']
                    ));
                }
            }
            curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        }
        
        $response = curl_exec($ch);
        $statusCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        $totalTime = curl_getinfo($ch, CURLINFO_TOTAL_TIME);
        
        curl_close($ch);
        
        if ($error) {
            return [
                'success' => false,
                'error' => $error,
                'status_code' => 0,
                'body' => null,
                'time_ms' => (int)($totalTime * 1000),
            ];
        }
        
        $success = $statusCode >= 200 && $statusCode < 300;
        
        return [
            'success' => $success,
            'error' => $success ? null : "HTTP {$statusCode}",
            'status_code' => $statusCode,
            'body' => $response,
            'time_ms' => (int)($totalTime * 1000),
        ];
    }
    
    /**
     * Format headers array for cURL
     */
    protected function formatHeaders(array $headers): array
    {
        $formatted = [];
        foreach ($headers as $key => $value) {
            if (is_numeric($key)) {
                $formatted[] = $value;
            } else {
                $formatted[] = "{$key}: {$value}";
            }
        }
        return $formatted;
    }
    
    /**
     * Replace variables in string
     * 
     * Supports:
     * - ${VAR_NAME} - Environment variables
     * - {{field.path}} - Payload fields
     */
    protected function replaceVariables(string $template, ActionContext $context): string
    {
        // Replace environment variables: ${VAR_NAME}
        $template = preg_replace_callback('/\$\{([A-Z_][A-Z0-9_]*)\}/', function($matches) use ($context) {
            return $context->getVariable($matches[1], $matches[0]);
        }, $template);
        
        // Replace payload variables: {{field.path}}
        $template = preg_replace_callback('/\{\{([a-z0-9_.]+)\}\}/i', function($matches) use ($context) {
            $value = $context->get($matches[1]);
            if ($value === null) {
                $value = $context->getOriginal($matches[1]);
            }
            if (is_array($value)) {
                return json_encode($value);
            }
            return (string)($value ?? $matches[0]);
        }, $template);
        
        return $template;
    }
    
    /**
     * Recursively replace variables in config
     */
    protected function replaceConfigVariables(array $config, ActionContext $context): array
    {
        $result = [];
        foreach ($config as $key => $value) {
            if (is_string($value)) {
                $result[$key] = $this->replaceVariables($value, $context);
            } elseif (is_array($value)) {
                $result[$key] = $this->replaceConfigVariables($value, $context);
            } else {
                $result[$key] = $value;
            }
        }
        return $result;
    }
    
    /**
     * Sanitize string for safe output
     */
    protected function sanitize(string $value, int $maxLength = 1000): string
    {
        $value = strip_tags($value);
        $value = htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
        if (strlen($value) > $maxLength) {
            $value = substr($value, 0, $maxLength) . '...';
        }
        return $value;
    }
    
    /**
     * Log action execution
     */
    protected function log(string $message, array $context = []): void
    {
        error_log(sprintf(
            "[WebhookAction][%s] %s %s",
            $this->getType(),
            $message,
            $context ? json_encode($context) : ''
        ));
    }
}
