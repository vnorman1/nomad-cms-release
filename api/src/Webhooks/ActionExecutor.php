<?php
/**
 * NOMAD CMS - Action Executor
 * 
 * Executes action chains with support for:
 * - Sequential and parallel execution
 * - Conditional branching
 * - Error handling and retry logic
 * - Result aggregation
 */

declare(strict_types=1);

namespace NomadCMS\Webhooks;

use NomadCMS\Webhooks\Actions\ActionInterface;
use NomadCMS\Webhooks\Actions\ActionContext;
use NomadCMS\Webhooks\Actions\ActionResult;
use NomadCMS\Webhooks\Actions\ActionRegistry;

class ActionExecutor
{
    private ActionRegistry $registry;
    private ConditionEvaluator $conditionEvaluator;
    private PayloadMapper $payloadMapper;
    
    private array $executionLog = [];
    private int $maxRetries = 3;
    private int $retryDelayMs = 1000;
    private int $parallelLimit = 10;
    
    public function __construct(
        ActionRegistry $registry,
        ?ConditionEvaluator $conditionEvaluator = null,
        ?PayloadMapper $payloadMapper = null
    ) {
        $this->registry = $registry;
        $this->conditionEvaluator = $conditionEvaluator ?? new ConditionEvaluator();
        $this->payloadMapper = $payloadMapper ?? new PayloadMapper();
    }
    
    /**
     * Execute a single action
     */
    public function executeAction(ActionInterface $action, ActionContext $context): ActionResult
    {
        $actionType = $action->getType();
        $startTime = microtime(true);
        
        $this->log("Executing action: {$actionType}", [
            'action_id' => $context->actionId,
            'webhook_id' => $context->webhookId,
        ]);
        
        try {
            // Validate configuration if action supports it
            if (!$action->validateConfig($context->actionConfig)) {
                return ActionResult::failure("Invalid configuration for action: {$actionType}");
            }
            
            // Apply payload mapping if configured
            if (!empty($context->actionConfig['payload_mapping'])) {
                $context->mappedPayload = $this->payloadMapper->transform(
                    $context->originalPayload,
                    $context->actionConfig['payload_mapping']
                );
            }
            
            // Execute with retry logic
            $result = $this->executeWithRetry($action, $context);
            
            $executionTime = (int)((microtime(true) - $startTime) * 1000);
            
            $this->executionLog[] = [
                'action_type' => $actionType,
                'action_id' => $context->actionId,
                'success' => $result->success,
                'execution_time_ms' => $executionTime,
                'status_code' => $result->statusCode,
                'error' => $result->error,
                'timestamp' => time(),
            ];
            
            return $result;
            
        } catch (\Throwable $e) {
            $this->log("Action execution failed: {$actionType}", [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);
            
            return ActionResult::failure($e->getMessage());
        }
    }
    
    /**
     * Execute action with retry logic
     */
    private function executeWithRetry(ActionInterface $action, ActionContext $context): ActionResult
    {
        $maxRetries = $context->actionConfig['retry_count'] ?? $this->maxRetries;
        $retryDelay = $context->actionConfig['retry_delay_ms'] ?? $this->retryDelayMs;
        $retryOn = $context->actionConfig['retry_on'] ?? ['error', 'timeout'];
        
        $lastResult = null;
        
        for ($attempt = 1; $attempt <= $maxRetries; $attempt++) {
            $context->setVariable('_attempt', $attempt);
            $context->setVariable('_max_attempts', $maxRetries);
            
            $result = $action->execute($context);
            $lastResult = $result;
            
            if ($result->success) {
                return $result;
            }
            
            // Check if we should retry
            $shouldRetry = false;
            
            if (in_array('error', $retryOn) && !$result->success) {
                $shouldRetry = true;
            }
            
            if (in_array('timeout', $retryOn) && $result->statusCode === 408) {
                $shouldRetry = true;
            }
            
            if (in_array('5xx', $retryOn) && $result->statusCode >= 500) {
                $shouldRetry = true;
            }
            
            if ($shouldRetry && $attempt < $maxRetries) {
                $this->log("Retrying action (attempt {$attempt}/{$maxRetries})", [
                    'action' => $action->getType(),
                    'error' => $result->error,
                ]);
                
                // Exponential backoff
                $delay = $retryDelay * pow(2, $attempt - 1);
                usleep($delay * 1000);
            } else {
                break;
            }
        }
        
        return $lastResult ?? ActionResult::failure('No execution result');
    }
    
    /**
     * Execute a chain of actions
     */
    public function executeChain(array $chain, ActionContext $baseContext): ChainExecutionResult
    {
        $startTime = microtime(true);
        $results = [];
        $success = true;
        $context = clone $baseContext;
        $context->chainResults = [];
        
        foreach ($chain as $index => $step) {
            $stepResult = $this->executeChainStep($step, $context, $index);
            $results[] = $stepResult;
            
            // Store result for next steps
            $context->chainResults[$step['id'] ?? $index] = $stepResult;
            
            // Handle step failure
            if (!$stepResult->success) {
                $continueOnError = $step['continue_on_error'] ?? false;
                
                if (!$continueOnError) {
                    $success = false;
                    
                    // Check for fallback action
                    if (!empty($step['fallback_action'])) {
                        $fallbackResult = $this->executeFallback($step['fallback_action'], $context, $stepResult);
                        $results[] = $fallbackResult;
                    }
                    
                    break;
                }
            }
            
            // Check for break condition
            if (!empty($step['break_condition'])) {
                $shouldBreak = $this->conditionEvaluator->evaluate(
                    $step['break_condition'],
                    array_merge($context->mappedPayload, ['_result' => $stepResult->data])
                );
                
                if ($shouldBreak) {
                    break;
                }
            }
        }
        
        $executionTime = (int)((microtime(true) - $startTime) * 1000);
        
        return new ChainExecutionResult(
            success: $success,
            results: $results,
            executionTimeMs: $executionTime,
            totalSteps: count($chain),
            completedSteps: count($results)
        );
    }
    
    /**
     * Execute a single chain step
     */
    private function executeChainStep(array $step, ActionContext $context, int $index): ActionResult
    {
        // Check condition
        if (!empty($step['condition'])) {
            $conditionMet = $this->conditionEvaluator->evaluate(
                $step['condition'],
                array_merge($context->originalPayload, $context->mappedPayload)
            );
            
            if (!$conditionMet) {
                return new ActionResult(
                    success: true,
                    data: ['skipped' => true, 'reason' => 'Condition not met'],
                    statusCode: 200,
                    executionTimeMs: 0
                );
            }
        }
        
        // Handle different step types
        $stepType = $step['type'] ?? 'action';
        
        return match ($stepType) {
            'action' => $this->executeActionStep($step, $context),
            'parallel' => $this->executeParallelStep($step, $context),
            'conditional' => $this->executeConditionalStep($step, $context),
            'loop' => $this->executeLoopStep($step, $context),
            'delay' => $this->executeDelayStep($step, $context),
            'transform' => $this->executeTransformStep($step, $context),
            default => ActionResult::failure("Unknown step type: {$stepType}"),
        };
    }
    
    /**
     * Execute a single action step
     */
    private function executeActionStep(array $step, ActionContext $context): ActionResult
    {
        $actionType = $step['action_type'] ?? $step['action'] ?? null;
        
        if (!$actionType) {
            return ActionResult::failure('No action type specified');
        }
        
        $action = $this->registry->get($actionType);
        
        if (!$action) {
            return ActionResult::failure("Action not found: {$actionType}");
        }
        
        // Create step-specific context
        $stepContext = clone $context;
        $stepContext->actionId = $step['id'] ?? $actionType . '_' . uniqid();
        $stepContext->actionConfig = $step['config'] ?? [];
        
        // Apply step-specific payload mapping
        if (!empty($step['payload_mapping'])) {
            $stepContext->mappedPayload = $this->payloadMapper->transform(
                array_merge($context->originalPayload, $context->mappedPayload),
                $step['payload_mapping']
            );
        }
        
        // Merge provider config
        if (!empty($step['provider_config'])) {
            $stepContext->providerConfig = array_merge(
                $context->providerConfig ?? [],
                $step['provider_config']
            );
        }
        
        return $this->executeAction($action, $stepContext);
    }
    
    /**
     * Execute parallel actions
     */
    private function executeParallelStep(array $step, ActionContext $context): ActionResult
    {
        $actions = $step['actions'] ?? [];
        
        if (empty($actions)) {
            return new ActionResult(
                success: true,
                data: ['parallel_results' => []],
                statusCode: 200,
                executionTimeMs: 0
            );
        }
        
        $startTime = microtime(true);
        $results = [];
        $allSuccess = true;
        
        // Limit parallel execution
        $chunks = array_chunk($actions, $this->parallelLimit);
        
        foreach ($chunks as $chunk) {
            // For true parallelism, we'd use pcntl_fork or similar
            // For now, we execute sequentially but track as parallel
            $chunkResults = [];
            
            foreach ($chunk as $actionStep) {
                $result = $this->executeActionStep($actionStep, $context);
                $chunkResults[$actionStep['id'] ?? $actionStep['action_type']] = $result;
                
                if (!$result->success) {
                    $allSuccess = false;
                    
                    // If fail_fast is enabled, stop on first failure
                    if ($step['fail_fast'] ?? false) {
                        break 2;
                    }
                }
            }
            
            $results = array_merge($results, $chunkResults);
        }
        
        $executionTime = (int)((microtime(true) - $startTime) * 1000);
        
        return new ActionResult(
            success: $allSuccess || ($step['allow_partial_failure'] ?? false),
            data: [
                'parallel_results' => array_map(fn($r) => [
                    'success' => $r->success,
                    'data' => $r->data,
                    'error' => $r->error,
                ], $results),
            ],
            statusCode: $allSuccess ? 200 : 207,
            executionTimeMs: $executionTime
        );
    }
    
    /**
     * Execute conditional branching
     */
    private function executeConditionalStep(array $step, ActionContext $context): ActionResult
    {
        $branches = $step['branches'] ?? [];
        $payload = array_merge($context->originalPayload, $context->mappedPayload);
        
        foreach ($branches as $branch) {
            $condition = $branch['condition'] ?? 'true';
            
            if ($this->conditionEvaluator->evaluate($condition, $payload)) {
                // Execute this branch
                $branchActions = $branch['actions'] ?? [];
                
                if (empty($branchActions)) {
                    return new ActionResult(
                        success: true,
                        data: ['branch' => $branch['name'] ?? 'matched', 'skipped' => true],
                        statusCode: 200,
                        executionTimeMs: 0
                    );
                }
                
                return $this->executeChain($branchActions, $context);
            }
        }
        
        // No branch matched - execute default if exists
        if (!empty($step['default'])) {
            return $this->executeChain($step['default'], $context);
        }
        
        return new ActionResult(
            success: true,
            data: ['no_branch_matched' => true],
            statusCode: 200,
            executionTimeMs: 0
        );
    }
    
    /**
     * Execute loop step
     */
    private function executeLoopStep(array $step, ActionContext $context): ActionResult
    {
        $startTime = microtime(true);
        $iterateOver = $step['iterate_over'] ?? null;
        $maxIterations = $step['max_iterations'] ?? 100;
        $results = [];
        $allSuccess = true;
        
        // Get array to iterate over
        $items = [];
        
        if ($iterateOver) {
            $items = $this->payloadMapper->extractValue(
                array_merge($context->originalPayload, $context->mappedPayload),
                $iterateOver
            );
            
            if (!is_array($items)) {
                $items = [$items];
            }
        } elseif (isset($step['count'])) {
            $items = range(0, (int)$step['count'] - 1);
        }
        
        // Limit iterations
        $items = array_slice($items, 0, $maxIterations);
        
        foreach ($items as $index => $item) {
            // Create iteration context
            $iterContext = clone $context;
            $iterContext->setVariable('_index', $index);
            $iterContext->setVariable('_item', $item);
            $iterContext->setVariable('_total', count($items));
            
            // Merge item into mapped payload
            if (is_array($item)) {
                $iterContext->mappedPayload = array_merge($context->mappedPayload, $item);
            } else {
                $iterContext->mappedPayload['_current'] = $item;
            }
            
            // Execute loop actions
            $loopActions = $step['actions'] ?? [];
            $result = $this->executeChain($loopActions, $iterContext);
            
            $results[] = $result;
            
            if (!$result->success) {
                $allSuccess = false;
                
                if ($step['break_on_error'] ?? false) {
                    break;
                }
            }
        }
        
        $executionTime = (int)((microtime(true) - $startTime) * 1000);
        
        return new ActionResult(
            success: $allSuccess || ($step['allow_partial_failure'] ?? true),
            data: [
                'iterations' => count($results),
                'successful' => count(array_filter($results, fn($r) => $r->success)),
                'results' => array_map(fn($r) => $r->data, $results),
            ],
            statusCode: $allSuccess ? 200 : 207,
            executionTimeMs: $executionTime
        );
    }
    
    /**
     * Execute delay step
     */
    private function executeDelayStep(array $step, ActionContext $context): ActionResult
    {
        $delayMs = $step['delay_ms'] ?? $step['delay'] ?? 0;
        
        if ($delayMs > 0) {
            usleep($delayMs * 1000);
        }
        
        return new ActionResult(
            success: true,
            data: ['delayed_ms' => $delayMs],
            statusCode: 200,
            executionTimeMs: $delayMs
        );
    }
    
    /**
     * Execute transform step
     */
    private function executeTransformStep(array $step, ActionContext $context): ActionResult
    {
        $mapping = $step['mapping'] ?? [];
        
        if (empty($mapping)) {
            return new ActionResult(
                success: true,
                data: ['transformed' => false],
                statusCode: 200,
                executionTimeMs: 0
            );
        }
        
        $context->mappedPayload = $this->payloadMapper->transform(
            array_merge($context->originalPayload, $context->mappedPayload),
            $mapping
        );
        
        return new ActionResult(
            success: true,
            data: [
                'transformed' => true,
                'result' => $context->mappedPayload,
            ],
            statusCode: 200,
            executionTimeMs: 0
        );
    }
    
    /**
     * Execute fallback action on failure
     */
    private function executeFallback(array $fallbackConfig, ActionContext $context, ActionResult $failedResult): ActionResult
    {
        // Add failure info to context
        $context->setVariable('_failed_result', [
            'error' => $failedResult->error,
            'status_code' => $failedResult->statusCode,
            'data' => $failedResult->data,
        ]);
        
        return $this->executeActionStep($fallbackConfig, $context);
    }
    
    /**
     * Get execution log
     */
    public function getExecutionLog(): array
    {
        return $this->executionLog;
    }
    
    /**
     * Clear execution log
     */
    public function clearExecutionLog(): void
    {
        $this->executionLog = [];
    }
    
    /**
     * Set configuration
     */
    public function setConfig(array $config): void
    {
        $this->maxRetries = $config['max_retries'] ?? $this->maxRetries;
        $this->retryDelayMs = $config['retry_delay_ms'] ?? $this->retryDelayMs;
        $this->parallelLimit = $config['parallel_limit'] ?? $this->parallelLimit;
    }
    
    /**
     * Log message
     */
    private function log(string $message, array $context = []): void
    {
        // Could integrate with actual logging service
        error_log("[ActionExecutor] {$message} " . json_encode($context));
    }
}

/**
 * Chain execution result
 */
class ChainExecutionResult
{
    public function __construct(
        public readonly bool $success,
        public readonly array $results,
        public readonly int $executionTimeMs,
        public readonly int $totalSteps,
        public readonly int $completedSteps
    ) {}
    
    public function toArray(): array
    {
        return [
            'success' => $this->success,
            'total_steps' => $this->totalSteps,
            'completed_steps' => $this->completedSteps,
            'execution_time_ms' => $this->executionTimeMs,
            'results' => array_map(fn($r) => [
                'success' => $r->success,
                'status_code' => $r->statusCode,
                'data' => $r->data,
                'error' => $r->error,
                'execution_time_ms' => $r->executionTimeMs,
            ], $this->results),
        ];
    }
}
