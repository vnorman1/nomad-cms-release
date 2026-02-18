<?php
/**
 * NOMAD CMS - Action Registry
 * 
 * Central registry for all available webhook actions.
 * Handles action discovery, registration, and instantiation.
 */

declare(strict_types=1);

namespace NomadCMS\Webhooks\Actions;

use RuntimeException;

final class ActionRegistry
{
    private static ?self $instance = null;
    
    /** @var array<string, ActionInterface> */
    private array $actions = [];
    
    /** @var array<string, string> Action type => Class name */
    private array $actionClasses = [];
    
    /** @var bool */
    private bool $initialized = false;
    
    private function __construct() {}
    
    /**
     * Get singleton instance
     */
    public static function getInstance(): self
    {
        if (self::$instance === null) {
            self::$instance = new self();
            self::$instance->initialize();
        }
        return self::$instance;
    }
    
    /**
     * Initialize with built-in actions
     */
    private function initialize(): void
    {
        if ($this->initialized) {
            return;
        }
        
        // Register built-in actions
        $builtInActions = [
            // Content Actions
            \NomadCMS\Webhooks\Actions\Content\CreateContentAction::class,
            \NomadCMS\Webhooks\Actions\Content\UpdateContentAction::class,
            \NomadCMS\Webhooks\Actions\Content\DeleteContentAction::class,
            \NomadCMS\Webhooks\Actions\Content\PublishContentAction::class,
            
            // Notification Actions
            \NomadCMS\Webhooks\Actions\Notification\DiscordAction::class,
            \NomadCMS\Webhooks\Actions\Notification\SlackAction::class,
            \NomadCMS\Webhooks\Actions\Notification\EmailAction::class,
            \NomadCMS\Webhooks\Actions\Notification\TelegramAction::class,
            
            // HTTP Actions
            \NomadCMS\Webhooks\Actions\Http\HttpRequestAction::class,
            \NomadCMS\Webhooks\Actions\Http\ForwardWebhookAction::class,
            
            // Data Actions
            \NomadCMS\Webhooks\Actions\Data\TransformDataAction::class,
            \NomadCMS\Webhooks\Actions\Data\StoreValueAction::class,
            \NomadCMS\Webhooks\Actions\Data\LogEntryAction::class,
            
            // System Actions
            \NomadCMS\Webhooks\Actions\System\TriggerSsgAction::class,
            \NomadCMS\Webhooks\Actions\System\ClearCacheAction::class,
            \NomadCMS\Webhooks\Actions\System\RunScriptAction::class,
        ];
        
        foreach ($builtInActions as $className) {
            if (class_exists($className)) {
                $this->registerClass($className);
            }
        }
        
        $this->initialized = true;
    }
    
    /**
     * Register an action class
     * 
     * @param string $className Fully qualified class name
     */
    public function registerClass(string $className): void
    {
        if (!class_exists($className)) {
            throw new RuntimeException("Action class not found: {$className}");
        }
        
        $interfaces = class_implements($className);
        if (!isset($interfaces[ActionInterface::class])) {
            throw new RuntimeException("Action class must implement ActionInterface: {$className}");
        }
        
        $instance = new $className();
        $type = $instance->getType();
        
        $this->actions[$type] = $instance;
        $this->actionClasses[$type] = $className;
    }
    
    /**
     * Register an action instance
     * 
     * @param ActionInterface $action Action instance
     */
    public function register(ActionInterface $action): void
    {
        $type = $action->getType();
        $this->actions[$type] = $action;
        $this->actionClasses[$type] = get_class($action);
    }
    
    /**
     * Get action by type
     * 
     * @param string $type Action type identifier
     * @return ActionInterface
     * @throws RuntimeException If action not found
     */
    public function get(string $type): ActionInterface
    {
        if (!isset($this->actions[$type])) {
            throw new RuntimeException("Unknown action type: {$type}");
        }
        return $this->actions[$type];
    }
    
    /**
     * Check if action type exists
     * 
     * @param string $type Action type identifier
     * @return bool
     */
    public function has(string $type): bool
    {
        return isset($this->actions[$type]);
    }
    
    /**
     * Get all registered actions
     * 
     * @return array<string, ActionInterface>
     */
    public function getAll(): array
    {
        return $this->actions;
    }
    
    /**
     * Get all action types
     * 
     * @return array<string>
     */
    public function getTypes(): array
    {
        return array_keys($this->actions);
    }
    
    /**
     * Get actions by category
     * 
     * @param string $category Category name
     * @return array<string, ActionInterface>
     */
    public function getByCategory(string $category): array
    {
        return array_filter($this->actions, fn($action) => $action->getCategory() === $category);
    }
    
    /**
     * Get actions that require a specific provider
     * 
     * @param string $provider Provider name
     * @return array<string, ActionInterface>
     */
    public function getByProvider(string $provider): array
    {
        return array_filter($this->actions, fn($action) => $action->getRequiredProvider() === $provider);
    }
    
    /**
     * Get action metadata for UI
     * 
     * @return array Action metadata grouped by category
     */
    public function getMetadata(): array
    {
        $metadata = [];
        
        foreach ($this->actions as $type => $action) {
            $category = $action->getCategory();
            
            if (!isset($metadata[$category])) {
                $metadata[$category] = [
                    'name' => $this->getCategoryName($category),
                    'icon' => $this->getCategoryIcon($category),
                    'actions' => [],
                ];
            }
            
            $metadata[$category]['actions'][] = [
                'type' => $type,
                'name' => $action->getName(),
                'description' => $action->getDescription(),
                'icon' => $action->getIcon(),
                'config_schema' => $action->getConfigSchema(),
                'expected_fields' => $action->getExpectedFields(),
                'requires_provider' => $action->requiresProvider(),
                'required_provider' => $action->getRequiredProvider(),
                'supports_async' => $action->supportsAsync(),
                'default_timeout' => $action->getDefaultTimeout(),
            ];
        }
        
        // Sort categories
        $categoryOrder = ['content', 'notification', 'http', 'data', 'system'];
        uksort($metadata, function($a, $b) use ($categoryOrder) {
            $posA = array_search($a, $categoryOrder);
            $posB = array_search($b, $categoryOrder);
            if ($posA === false) $posA = 999;
            if ($posB === false) $posB = 999;
            return $posA <=> $posB;
        });
        
        return $metadata;
    }
    
    /**
     * Get human-readable category name
     */
    private function getCategoryName(string $category): string
    {
        return match ($category) {
            'content' => 'Tartalom',
            'notification' => 'Értesítések',
            'http' => 'HTTP',
            'data' => 'Adatok',
            'system' => 'Rendszer',
            default => ucfirst($category),
        };
    }
    
    /**
     * Get category icon
     */
    private function getCategoryIcon(string $category): string
    {
        return match ($category) {
            'content' => '📝',
            'notification' => '🔔',
            'http' => '🌐',
            'data' => '💾',
            'system' => '🔧',
            default => '📦',
        };
    }
    
    /**
     * Create new instance of an action
     * 
     * Useful when you need a fresh instance with no state
     * 
     * @param string $type Action type
     * @return ActionInterface
     */
    public function createInstance(string $type): ActionInterface
    {
        if (!isset($this->actionClasses[$type])) {
            throw new RuntimeException("Unknown action type: {$type}");
        }
        
        $className = $this->actionClasses[$type];
        return new $className();
    }
}
