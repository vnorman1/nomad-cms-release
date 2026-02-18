<?php
/**
 * NOMAD CMS - Webhook Action Interface
 * 
 * Interface for all webhook actions.
 * Actions are the building blocks of the Webhook 2.0 system.
 * 
 * Each action can:
 * - Transform incoming payload using JSONPath mappings
 * - Execute any operation (HTTP, content creation, notifications, etc.)
 * - Return results that can be chained to other actions
 */

declare(strict_types=1);

namespace NomadCMS\Webhooks\Actions;

/**
 * Result object for action execution
 */
class ActionResult
{
    public function __construct(
        public readonly bool $success,
        public readonly mixed $data = null,
        public readonly ?string $error = null,
        public readonly ?int $statusCode = null,
        public readonly int $executionTimeMs = 0,
        public readonly array $metadata = []
    ) {}
    
    public function toArray(): array
    {
        return [
            'success' => $this->success,
            'data' => $this->data,
            'error' => $this->error,
            'status_code' => $this->statusCode,
            'execution_time_ms' => $this->executionTimeMs,
            'metadata' => $this->metadata,
        ];
    }
    
    public static function success(mixed $data = null, array $metadata = []): self
    {
        return new self(true, $data, null, 200, 0, $metadata);
    }
    
    public static function failure(string $error, ?int $statusCode = null, array $metadata = []): self
    {
        return new self(false, null, $error, $statusCode, 0, $metadata);
    }
}

/**
 * Context object passed to actions
 */
class ActionContext
{
    public function __construct(
        public readonly array $originalPayload,
        public readonly array $mappedPayload,
        public readonly array $endpoint,
        public readonly array $actionConfig,
        public readonly ?array $previousResult = null,
        public readonly string $triggerEvent = '',
        public readonly ?string $clientIp = null,
        public readonly array $providerConfig = [],
        public readonly array $variables = []
    ) {}
    
    /**
     * Get a value from mapped payload with dot notation support
     */
    public function get(string $key, mixed $default = null): mixed
    {
        return $this->getNestedValue($this->mappedPayload, $key, $default);
    }
    
    /**
     * Get a value from original payload
     */
    public function getOriginal(string $key, mixed $default = null): mixed
    {
        return $this->getNestedValue($this->originalPayload, $key, $default);
    }
    
    /**
     * Get action config value
     */
    public function getConfig(string $key, mixed $default = null): mixed
    {
        return $this->getNestedValue($this->actionConfig, $key, $default);
    }
    
    /**
     * Get provider config value
     */
    public function getProviderConfig(string $key, mixed $default = null): mixed
    {
        return $this->getNestedValue($this->providerConfig, $key, $default);
    }
    
    /**
     * Get variable (from environment or runtime)
     */
    public function getVariable(string $key, mixed $default = null): mixed
    {
        return $this->variables[$key] ?? $_ENV[$key] ?? $default;
    }
    
    /**
     * Helper to get nested array values
     */
    private function getNestedValue(array $data, string $key, mixed $default = null): mixed
    {
        if (isset($data[$key])) {
            return $data[$key];
        }
        
        $keys = explode('.', $key);
        $value = $data;
        
        foreach ($keys as $k) {
            if (!is_array($value) || !array_key_exists($k, $value)) {
                return $default;
            }
            $value = $value[$k];
        }
        
        return $value;
    }
}

/**
 * Interface that all webhook actions must implement
 */
interface ActionInterface
{
    /**
     * Get action type identifier
     * 
     * @return string Unique action type (e.g., 'create_content', 'send_discord')
     */
    public function getType(): string;
    
    /**
     * Get human-readable action name
     * 
     * @return string Action name for display
     */
    public function getName(): string;
    
    /**
     * Get action description
     * 
     * @return string Description of what this action does
     */
    public function getDescription(): string;
    
    /**
     * Get action category
     * 
     * @return string Category (content, notification, http, data, system)
     */
    public function getCategory(): string;
    
    /**
     * Get action icon (emoji or icon class)
     * 
     * @return string Icon for UI display
     */
    public function getIcon(): string;
    
    /**
     * Get configuration schema
     * 
     * Returns JSON Schema for action configuration validation.
     * Used by UI to generate configuration forms.
     * 
     * @return array JSON Schema array
     */
    public function getConfigSchema(): array;
    
    /**
     * Get payload mapping suggestions
     * 
     * Returns suggested field mappings based on the action type.
     * 
     * @return array Array of field names this action expects
     */
    public function getExpectedFields(): array;
    
    /**
     * Validate action configuration
     * 
     * @param array $config Action configuration to validate
     * @return array Validation errors (empty if valid)
     */
    public function validateConfig(array $config): array;
    
    /**
     * Execute the action
     * 
     * @param ActionContext $context Execution context with payload and config
     * @return ActionResult Result of action execution
     */
    public function execute(ActionContext $context): ActionResult;
    
    /**
     * Check if action requires provider configuration
     * 
     * @return bool True if provider config is required
     */
    public function requiresProvider(): bool;
    
    /**
     * Get required provider type
     * 
     * @return string|null Provider type (discord, slack, etc.) or null
     */
    public function getRequiredProvider(): ?string;
    
    /**
     * Check if action supports async execution
     * 
     * @return bool True if action can run asynchronously
     */
    public function supportsAsync(): bool;
    
    /**
     * Get default timeout in seconds
     * 
     * @return int Timeout in seconds
     */
    public function getDefaultTimeout(): int;
}
