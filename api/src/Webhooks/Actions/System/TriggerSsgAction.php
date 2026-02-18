<?php
/**
 * NOMAD CMS - Trigger SSG Action
 * 
 * Triggers Static Site Generation (build) for content changes
 */

declare(strict_types=1);

namespace NomadCMS\Webhooks\Actions\System;

use NomadCMS\Webhooks\Actions\BaseAction;
use NomadCMS\Webhooks\Actions\ActionContext;
use NomadCMS\Webhooks\Actions\ActionResult;

class TriggerSsgAction extends BaseAction
{
    protected bool $requiresProvider = false;
    protected int $defaultTimeout = 120;
    
    // Allowed build types - whitelist for security
    private const ALLOWED_BUILD_TYPES = ['full', 'incremental', 'page', 'sitemap', 'rss'];
    private const ALLOWED_TARGETS = ['default', 'preview', 'production', 'staging'];
    private const ALLOWED_PRIORITIES = ['low', 'normal', 'high'];
    
    public function getType(): string
    {
        return 'trigger_ssg';
    }
    
    public function getName(): string
    {
        return 'SSG Build Indítás';
    }
    
    public function getDescription(): string
    {
        return 'Static Site Generation (build) indítása tartalom változáskor';
    }
    
    public function getCategory(): string
    {
        return 'system';
    }
    
    public function getIcon(): string
    {
        return '🏗️';
    }
    
    public function getConfigSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'build_type' => [
                    'type' => 'string',
                    'title' => 'Build típus',
                    'enum' => ['full', 'incremental', 'page', 'sitemap', 'rss'],
                    'default' => 'incremental',
                ],
                'target' => [
                    'type' => 'string',
                    'title' => 'Build target',
                    'description' => 'Melyik SSG target-et használja',
                    'enum' => ['default', 'preview', 'production', 'staging'],
                    'default' => 'default',
                ],
                'pages' => [
                    'type' => 'array',
                    'title' => 'Oldalak',
                    'description' => 'page típusú buildhez - mely oldalakat építse újra',
                    'items' => ['type' => 'string'],
                ],
                'slot_types' => [
                    'type' => 'array',
                    'title' => 'Slot típusok',
                    'description' => 'Mely slot típusokat érintő tartalmakat építse újra',
                    'items' => ['type' => 'string'],
                ],
                'async' => [
                    'type' => 'boolean',
                    'title' => 'Aszinkron',
                    'description' => 'Háttérben fusson-e a build',
                    'default' => true,
                ],
                'priority' => [
                    'type' => 'string',
                    'title' => 'Prioritás',
                    'enum' => ['low', 'normal', 'high'],
                    'default' => 'normal',
                ],
                'webhook_url' => [
                    'type' => 'string',
                    'title' => 'Callback webhook',
                    'description' => 'URL amire értesítést küld a build végén',
                ],
                'deploy_after' => [
                    'type' => 'boolean',
                    'title' => 'Deploy a build után',
                    'default' => false,
                ],
                'deploy_target' => [
                    'type' => 'string',
                    'title' => 'Deploy cél',
                    'enum' => ['netlify', 'vercel', 'cloudflare', 'ftp', 'rsync', 'custom'],
                ],
            ],
        ];
    }
    
    public function getExpectedFields(): array
    {
        return ['slug', 'id', 'slot_type'];
    }
    
    public function execute(ActionContext $context): ActionResult
    {
        $startTime = microtime(true);
        
        try {
            $config = $this->replaceConfigVariables($context->actionConfig, $context);
            
            $buildType = $config['build_type'] ?? 'incremental';
            $target = $config['target'] ?? 'default';
            $async = $config['async'] ?? true;
            $priority = $config['priority'] ?? 'normal';
            
            // SECURITY: Validate all parameters against whitelist
            if (!in_array($buildType, self::ALLOWED_BUILD_TYPES, true)) {
                return ActionResult::failure("Invalid build type: {$buildType}");
            }
            if (!in_array($target, self::ALLOWED_TARGETS, true)) {
                return ActionResult::failure("Invalid target: {$target}");
            }
            if (!in_array($priority, self::ALLOWED_PRIORITIES, true)) {
                return ActionResult::failure("Invalid priority: {$priority}");
            }
            
            // Build parameters
            $buildParams = [
                'type' => $buildType,
                'target' => $target,
                'priority' => $priority,
                'triggered_by' => 'webhook',
                'webhook_id' => $context->webhookId,
                'action_id' => $context->actionId,
                'timestamp' => time(),
            ];
            
            // Add specific pages for page build type
            if ($buildType === 'page') {
                $pages = $config['pages'] ?? [];
                
                // Auto-detect from payload
                if (empty($pages)) {
                    if (!empty($context->mappedPayload['slug'])) {
                        $pages[] = $context->mappedPayload['slug'];
                    }
                    if (!empty($context->originalPayload['slug'])) {
                        $pages[] = $context->originalPayload['slug'];
                    }
                }
                
                $buildParams['pages'] = array_unique($pages);
            }
            
            // Add slot types filter
            if (!empty($config['slot_types'])) {
                $buildParams['slot_types'] = $config['slot_types'];
            } elseif (!empty($context->mappedPayload['slot_type'])) {
                $buildParams['slot_types'] = [$context->mappedPayload['slot_type']];
            }
            
            // Add deploy configuration
            if (!empty($config['deploy_after'])) {
                $buildParams['deploy'] = [
                    'enabled' => true,
                    'target' => $config['deploy_target'] ?? 'default',
                ];
            }
            
            // Callback webhook
            if (!empty($config['webhook_url'])) {
                $buildParams['callback_url'] = $config['webhook_url'];
            }
            
            // Trigger the build
            if ($async) {
                $result = $this->triggerAsyncBuild($buildParams);
            } else {
                $result = $this->triggerSyncBuild($buildParams);
            }
            
            $executionTime = (int)((microtime(true) - $startTime) * 1000);
            
            if ($result['success']) {
                return new ActionResult(
                    success: true,
                    data: [
                        'build_id' => $result['build_id'] ?? null,
                        'build_type' => $buildType,
                        'target' => $target,
                        'async' => $async,
                        'status' => $result['status'] ?? 'queued',
                    ],
                    statusCode: 200,
                    executionTimeMs: $executionTime
                );
            }
            
            return ActionResult::failure($result['error'] ?? 'Failed to trigger SSG build');
            
        } catch (\Exception $e) {
            $this->log('SSG trigger failed', ['error' => $e->getMessage()]);
            return ActionResult::failure($e->getMessage());
        }
    }
    
    /**
     * Trigger async build (queued)
     */
    private function triggerAsyncBuild(array $params): array
    {
        try {
            // Create build job in database
            $dbPath = dirname(__DIR__, 4) . '/databases/system.sqlite';
            $db = new \PDO("sqlite:{$dbPath}");
            $db->setAttribute(\PDO::ATTR_ERRMODE, \PDO::ERRMODE_EXCEPTION);
            
            // Ensure build queue table exists
            $db->exec("
                CREATE TABLE IF NOT EXISTS ssg_build_queue (
                    id TEXT PRIMARY KEY,
                    type TEXT NOT NULL,
                    target TEXT NOT NULL DEFAULT 'default',
                    priority TEXT DEFAULT 'normal',
                    params TEXT,
                    status TEXT DEFAULT 'pending',
                    created_at INTEGER NOT NULL,
                    started_at INTEGER,
                    completed_at INTEGER,
                    error TEXT,
                    result TEXT
                )
            ");
            
            $buildId = 'build_' . uniqid();
            
            $stmt = $db->prepare("
                INSERT INTO ssg_build_queue (id, type, target, priority, params, status, created_at)
                VALUES (:id, :type, :target, :priority, :params, 'pending', :created_at)
            ");
            
            $stmt->execute([
                ':id' => $buildId,
                ':type' => $params['type'],
                ':target' => $params['target'],
                ':priority' => $params['priority'],
                ':params' => json_encode($params),
                ':created_at' => time(),
            ]);
            
            // Try to trigger the build worker
            $this->triggerBuildWorker();
            
            return [
                'success' => true,
                'build_id' => $buildId,
                'status' => 'queued',
            ];
            
        } catch (\Exception $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
    
    /**
     * Trigger sync build (wait for completion)
     */
    private function triggerSyncBuild(array $params): array
    {
        try {
            // Check if SSG endpoint exists
            $ssgEndpoint = $this->getSsgEndpoint();
            
            if ($ssgEndpoint) {
                // Call SSG API
                $result = $this->httpRequest('POST', $ssgEndpoint, [
                    'Content-Type' => 'application/json',
                    'X-Internal-Token' => $this->getInternalToken(),
                ], $params, $this->defaultTimeout);
                
                if ($result['status_code'] >= 200 && $result['status_code'] < 300) {
                    $responseData = json_decode($result['body'] ?? '', true);
                    return [
                        'success' => true,
                        'build_id' => $responseData['build_id'] ?? null,
                        'status' => $responseData['status'] ?? 'completed',
                    ];
                }
                
                return [
                    'success' => false,
                    'error' => 'SSG API error: ' . ($result['body'] ?? 'Unknown error'),
                ];
            }
            
            // Fallback: try to run build command directly
            return $this->runBuildCommand($params);
            
        } catch (\Exception $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
    
    /**
     * Run build command directly
     */
    private function runBuildCommand(array $params): array
    {
        $buildType = $params['type'] ?? 'incremental';
        $projectRoot = dirname(__DIR__, 5); // Assumes api/src/Webhooks/Actions/System
        
        // Look for SSG build script
        $possibleScripts = [
            "{$projectRoot}/SSG_reference/build.sh",
            "{$projectRoot}/nomad-cms/build.sh",
            "{$projectRoot}/build.sh",
        ];
        
        $buildScript = null;
        foreach ($possibleScripts as $script) {
            if (file_exists($script)) {
                $buildScript = $script;
                break;
            }
        }
        
        // Try npm/node based build
        $possiblePackageJsons = [
            "{$projectRoot}/SSG_reference/package.json",
            "{$projectRoot}/frontend/package.json",
        ];
        
        foreach ($possiblePackageJsons as $packageJson) {
            if (file_exists($packageJson)) {
                $dir = dirname($packageJson);
                
                // Determine build command based on type
                $command = match ($buildType) {
                    'full' => "cd {$dir} && npm run build",
                    'incremental' => "cd {$dir} && npm run build:incremental 2>/dev/null || npm run build",
                    'sitemap' => "cd {$dir} && npm run build:sitemap 2>/dev/null || npm run build",
                    default => "cd {$dir} && npm run build",
                };
                
                // Execute build (with timeout)
                $output = [];
                $exitCode = 0;
                exec("{$command} 2>&1", $output, $exitCode);
                
                if ($exitCode === 0) {
                    return [
                        'success' => true,
                        'build_id' => 'sync_' . uniqid(),
                        'status' => 'completed',
                        'output' => implode("\n", $output),
                    ];
                }
                
                return [
                    'success' => false,
                    'error' => 'Build failed: ' . implode("\n", $output),
                ];
            }
        }
        
        if ($buildScript) {
            $output = [];
            $exitCode = 0;
            exec("bash {$buildScript} --type={$buildType} 2>&1", $output, $exitCode);
            
            return [
                'success' => $exitCode === 0,
                'build_id' => 'sync_' . uniqid(),
                'status' => $exitCode === 0 ? 'completed' : 'failed',
                'output' => implode("\n", $output),
                'error' => $exitCode !== 0 ? implode("\n", $output) : null,
            ];
        }
        
        return [
            'success' => false,
            'error' => 'No build script or package.json found',
        ];
    }
    
    /**
     * Trigger the build worker process
     */
    private function triggerBuildWorker(): void
    {
        // Try to spawn background worker if not running
        $projectRoot = dirname(__DIR__, 4);
        $workerScript = "{$projectRoot}/bin/ssg-worker.php";
        
        if (file_exists($workerScript)) {
            // Non-blocking execution
            exec("php {$workerScript} > /dev/null 2>&1 &");
        }
    }
    
    /**
     * Get SSG API endpoint URL
     */
    private function getSsgEndpoint(): ?string
    {
        // Check environment/config for SSG endpoint
        $endpoint = getenv('SSG_API_ENDPOINT');
        if ($endpoint) {
            return $endpoint;
        }
        
        // Try local default
        $localEndpoint = 'http://localhost:3000/api/build';
        
        // Quick check if it's available
        $ch = curl_init($localEndpoint);
        curl_setopt($ch, CURLOPT_NOBODY, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 1);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        
        if ($httpCode > 0) {
            return $localEndpoint;
        }
        
        return null;
    }
    
    /**
     * Get internal authentication token
     */
    private function getInternalToken(): string
    {
        $token = getenv('INTERNAL_API_TOKEN');
        if ($token) {
            return $token;
        }
        
        // Generate a simple hash-based token
        $secret = getenv('APP_SECRET') ?? 'nomad-cms-default-secret';
        return hash('sha256', $secret . date('Y-m-d'));
    }
    
    /**
     * Get build queue status
     */
    public static function getQueueStatus(): array
    {
        try {
            $dbPath = dirname(__DIR__, 4) . '/databases/system.sqlite';
            $db = new \PDO("sqlite:{$dbPath}");
            
            $stmt = $db->query("
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                    SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running,
                    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
                    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
                FROM ssg_build_queue
                WHERE created_at > :cutoff
            ");
            $stmt->execute([':cutoff' => time() - 86400]);
            
            return $stmt->fetch(\PDO::FETCH_ASSOC) ?: [];
        } catch (\Exception $e) {
            return ['error' => $e->getMessage()];
        }
    }
}
