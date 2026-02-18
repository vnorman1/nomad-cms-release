<?php
/**
 * NOMAD CMS - Run Script Action
 * 
 * Executes custom scripts (PHP, Shell, Node.js) with safety controls
 */

declare(strict_types=1);

namespace NomadCMS\Webhooks\Actions\System;

use NomadCMS\Webhooks\Actions\BaseAction;
use NomadCMS\Webhooks\Actions\ActionContext;
use NomadCMS\Webhooks\Actions\ActionResult;

class RunScriptAction extends BaseAction
{
    protected bool $requiresProvider = false;
    protected int $defaultTimeout = 30;
    
    // Allowed script directories (relative to project root)
    private const ALLOWED_DIRS = [
        'scripts',
        'bin',
        'api/bin',
        'api/scripts',
    ];
    
    // Blocked commands for shell scripts
    private const BLOCKED_COMMANDS = [
        'rm -rf /',
        'rm -rf /*',
        'mkfs',
        'dd if=',
        ':(){:|:&};:',
        '> /dev/sd',
        'chmod -R 777 /',
        'wget', // Block by default, allow in whitelist
        'curl.*|.*sh', // Pipe to shell
    ];
    
    public function getType(): string
    {
        return 'run_script';
    }
    
    public function getName(): string
    {
        return 'Script Futtatás';
    }
    
    public function getDescription(): string
    {
        return 'Egyedi scriptek futtatása (PHP, Shell, Node.js) biztonsági kontrollokkal';
    }
    
    public function getCategory(): string
    {
        return 'system';
    }
    
    public function getIcon(): string
    {
        return '⚙️';
    }
    
    public function getConfigSchema(): array
    {
        return [
            'type' => 'object',
            'required' => ['script_type'],
            'properties' => [
                'script_type' => [
                    'type' => 'string',
                    'title' => 'Script típus',
                    'enum' => ['php', 'shell', 'node', 'python', 'inline_php'],
                ],
                'script_path' => [
                    'type' => 'string',
                    'title' => 'Script útvonal',
                    'description' => 'Relatív útvonal az engedélyezett könyvtárakból',
                ],
                'inline_code' => [
                    'type' => 'string',
                    'title' => 'Inline kód',
                    'description' => 'Csak inline_php típushoz - biztonságos PHP kód',
                ],
                'arguments' => [
                    'type' => 'array',
                    'title' => 'Argumentumok',
                    'items' => ['type' => 'string'],
                ],
                'environment' => [
                    'type' => 'object',
                    'title' => 'Környezeti változók',
                    'additionalProperties' => ['type' => 'string'],
                ],
                'working_directory' => [
                    'type' => 'string',
                    'title' => 'Munkakönyvtár',
                ],
                'timeout' => [
                    'type' => 'integer',
                    'title' => 'Időkorlát (mp)',
                    'default' => 30,
                    'minimum' => 1,
                    'maximum' => 300,
                ],
                'capture_output' => [
                    'type' => 'boolean',
                    'title' => 'Kimenet rögzítése',
                    'default' => true,
                ],
                'pass_payload' => [
                    'type' => 'boolean',
                    'title' => 'Payload átadása',
                    'description' => 'Payload átadása stdin-en vagy környezeti változóként',
                    'default' => true,
                ],
                'payload_format' => [
                    'type' => 'string',
                    'title' => 'Payload formátum',
                    'enum' => ['json', 'env', 'args'],
                    'default' => 'json',
                ],
                'output_variable' => [
                    'type' => 'string',
                    'title' => 'Kimenet változó',
                    'description' => 'A script kimenetét ebbe a változóba menti',
                ],
                'allowed_exit_codes' => [
                    'type' => 'array',
                    'title' => 'Engedélyezett kilépési kódok',
                    'items' => ['type' => 'integer'],
                    'default' => [0],
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
            $config = $this->replaceConfigVariables($context->actionConfig, $context);
            
            $scriptType = $config['script_type'] ?? 'php';
            $timeout = min($config['timeout'] ?? 30, 300); // Max 5 minutes
            
            // Validate and get script
            if ($scriptType === 'inline_php') {
                $result = $this->executeInlinePhp($config, $context);
            } else {
                $scriptPath = $this->validateScriptPath($config['script_path'] ?? '');
                
                if (!$scriptPath) {
                    return ActionResult::failure('Invalid or blocked script path');
                }
                
                $result = $this->executeScript($scriptType, $scriptPath, $config, $context, $timeout);
            }
            
            // Store output in variable if specified
            if (!empty($config['output_variable']) && isset($result['output'])) {
                $context->setVariable($config['output_variable'], $result['output']);
            }
            
            $executionTime = (int)((microtime(true) - $startTime) * 1000);
            
            // Check exit code
            $allowedExitCodes = $config['allowed_exit_codes'] ?? [0];
            $exitCode = $result['exit_code'] ?? 0;
            $success = in_array($exitCode, $allowedExitCodes);
            
            return new ActionResult(
                success: $success,
                data: [
                    'script_type' => $scriptType,
                    'exit_code' => $exitCode,
                    'output' => $result['output'] ?? null,
                    'error_output' => $result['error'] ?? null,
                ],
                statusCode: $success ? 200 : 500,
                executionTimeMs: $executionTime,
                error: !$success ? "Script exited with code {$exitCode}" : null
            );
            
        } catch (\Exception $e) {
            $this->log('Script execution failed', ['error' => $e->getMessage()]);
            return ActionResult::failure($e->getMessage());
        }
    }
    
    /**
     * Validate script path is within allowed directories
     */
    private function validateScriptPath(?string $path): ?string
    {
        if (empty($path)) {
            return null;
        }
        
        // Prevent path traversal
        $path = str_replace(['../', '..\\', "\0"], '', $path);
        
        $projectRoot = dirname(__DIR__, 5);
        
        foreach (self::ALLOWED_DIRS as $dir) {
            $fullDir = $projectRoot . '/' . $dir;
            $fullPath = $fullDir . '/' . ltrim($path, '/');
            
            // Resolve to real path
            $realPath = realpath($fullPath);
            $realDir = realpath($fullDir);
            
            if ($realPath && $realDir && str_starts_with($realPath, $realDir)) {
                if (file_exists($realPath) && is_file($realPath)) {
                    return $realPath;
                }
            }
        }
        
        return null;
    }
    
    /**
     * Execute a script file
     */
    private function executeScript(
        string $type,
        string $scriptPath,
        array $config,
        ActionContext $context,
        int $timeout
    ): array {
        $arguments = $config['arguments'] ?? [];
        $environment = $config['environment'] ?? [];
        $passPayload = $config['pass_payload'] ?? true;
        $payloadFormat = $config['payload_format'] ?? 'json';
        $captureOutput = $config['capture_output'] ?? true;
        
        // Build command based on type
        $command = match ($type) {
            'php' => 'php ' . escapeshellarg($scriptPath),
            'shell' => 'bash ' . escapeshellarg($scriptPath),
            'node' => 'node ' . escapeshellarg($scriptPath),
            'python' => 'python3 ' . escapeshellarg($scriptPath),
            default => throw new \InvalidArgumentException("Unknown script type: {$type}"),
        };
        
        // Add arguments
        foreach ($arguments as $arg) {
            $command .= ' ' . escapeshellarg($arg);
        }
        
        // Security check for shell scripts
        if ($type === 'shell') {
            $scriptContent = file_get_contents($scriptPath);
            foreach (self::BLOCKED_COMMANDS as $blocked) {
                if (preg_match('/' . $blocked . '/i', $scriptContent)) {
                    return [
                        'exit_code' => 1,
                        'output' => '',
                        'error' => "Blocked command detected in script: {$blocked}",
                    ];
                }
            }
        }
        
        // Prepare environment
        $env = $_ENV;
        foreach ($environment as $key => $value) {
            $env[$key] = $value;
        }
        
        // Add webhook context to environment
        $env['WEBHOOK_ID'] = $context->webhookId ?? '';
        $env['ACTION_ID'] = $context->actionId ?? '';
        $env['EXECUTION_ID'] = $context->executionId ?? '';
        
        // Handle payload passing
        $stdin = null;
        if ($passPayload) {
            $payload = array_merge($context->originalPayload, $context->mappedPayload);
            
            switch ($payloadFormat) {
                case 'json':
                    $stdin = json_encode($payload);
                    $env['WEBHOOK_PAYLOAD'] = $stdin;
                    break;
                    
                case 'env':
                    foreach ($this->flattenArray($payload) as $key => $value) {
                        $envKey = 'PAYLOAD_' . strtoupper(preg_replace('/[^a-zA-Z0-9_]/', '_', $key));
                        $env[$envKey] = is_scalar($value) ? (string)$value : json_encode($value);
                    }
                    break;
                    
                case 'args':
                    foreach ($this->flattenArray($payload) as $key => $value) {
                        if (is_scalar($value)) {
                            $command .= ' --' . escapeshellarg($key) . '=' . escapeshellarg((string)$value);
                        }
                    }
                    break;
            }
        }
        
        // Set working directory
        $cwd = $config['working_directory'] ?? dirname($scriptPath);
        
        // Execute with proc_open for better control
        $descriptorspec = [
            0 => $stdin !== null ? ['pipe', 'r'] : ['file', '/dev/null', 'r'],
            1 => ['pipe', 'w'],
            2 => ['pipe', 'w'],
        ];
        
        $process = proc_open($command, $descriptorspec, $pipes, $cwd, $env);
        
        if (!is_resource($process)) {
            return [
                'exit_code' => 1,
                'output' => '',
                'error' => 'Failed to start process',
            ];
        }
        
        // Write stdin if needed
        if ($stdin !== null && isset($pipes[0])) {
            fwrite($pipes[0], $stdin);
            fclose($pipes[0]);
        }
        
        // Set timeout
        $startTime = time();
        stream_set_blocking($pipes[1], false);
        stream_set_blocking($pipes[2], false);
        
        $stdout = '';
        $stderr = '';
        
        while (true) {
            $status = proc_get_status($process);
            
            if (!$status['running']) {
                break;
            }
            
            if (time() - $startTime > $timeout) {
                proc_terminate($process, 9);
                return [
                    'exit_code' => 124,
                    'output' => $stdout,
                    'error' => 'Script execution timeout',
                ];
            }
            
            if ($captureOutput) {
                $stdout .= stream_get_contents($pipes[1]);
                $stderr .= stream_get_contents($pipes[2]);
            }
            
            usleep(10000); // 10ms
        }
        
        // Get remaining output
        if ($captureOutput) {
            $stdout .= stream_get_contents($pipes[1]);
            $stderr .= stream_get_contents($pipes[2]);
        }
        
        fclose($pipes[1]);
        fclose($pipes[2]);
        
        $exitCode = proc_close($process);
        
        // Try to parse JSON output
        $output = trim($stdout);
        $decoded = json_decode($output, true);
        if (json_last_error() === JSON_ERROR_NONE) {
            $output = $decoded;
        }
        
        return [
            'exit_code' => $exitCode,
            'output' => $output,
            'error' => trim($stderr),
        ];
    }
    
    /**
     * Execute inline PHP code (sandboxed)
     */
    private function executeInlinePhp(array $config, ActionContext $context): array
    {
        $code = $config['inline_code'] ?? '';
        
        if (empty($code)) {
            return [
                'exit_code' => 1,
                'output' => '',
                'error' => 'No inline code provided',
            ];
        }
        
        // Security: Block dangerous functions
        $blockedFunctions = [
            'exec', 'shell_exec', 'system', 'passthru', 'popen', 'proc_open',
            'pcntl_exec', 'eval', 'assert', 'create_function',
            'file_put_contents', 'file_get_contents', 'fopen', 'fwrite', 'unlink', 'rmdir',
            'include', 'include_once', 'require', 'require_once',
            'mail', 'header', 'setcookie',
            'curl_init', 'curl_exec',
            'mysqli_', 'PDO',
        ];
        
        foreach ($blockedFunctions as $func) {
            if (stripos($code, $func) !== false) {
                return [
                    'exit_code' => 1,
                    'output' => '',
                    'error' => "Blocked function detected: {$func}",
                ];
            }
        }
        
        // Prepare variables for the sandbox
        $payload = array_merge($context->originalPayload, $context->mappedPayload);
        $variables = $context->variables ?? [];
        
        // Create a closure to execute the code in isolation
        try {
            ob_start();
            
            // Create sandbox with limited scope
            $sandbox = function($__code, $payload, $variables, $context) {
                // Make payload and variables available
                extract(['payload' => $payload, 'variables' => $variables]);
                
                // Helper functions available in sandbox
                $json_encode = 'json_encode';
                $json_decode = 'json_decode';
                $array_map = 'array_map';
                $array_filter = 'array_filter';
                $array_merge = 'array_merge';
                $implode = 'implode';
                $explode = 'explode';
                $str_replace = 'str_replace';
                $preg_match = 'preg_match';
                $preg_replace = 'preg_replace';
                $date = 'date';
                $time = 'time';
                $strtotime = 'strtotime';
                
                // Execute the code
                return eval('return (function() use ($payload, $variables) { ' . $__code . ' })();');
            };
            
            $result = $sandbox($code, $payload, $variables, $context);
            $output = ob_get_clean();
            
            // Combine output and return value
            if ($result !== null) {
                $output = $result;
            }
            
            return [
                'exit_code' => 0,
                'output' => $output,
                'error' => '',
            ];
            
        } catch (\Throwable $e) {
            ob_end_clean();
            return [
                'exit_code' => 1,
                'output' => '',
                'error' => $e->getMessage(),
            ];
        }
    }
    
    /**
     * Flatten nested array to dot notation
     */
    private function flattenArray(array $array, string $prefix = ''): array
    {
        $result = [];
        
        foreach ($array as $key => $value) {
            $newKey = $prefix ? "{$prefix}.{$key}" : $key;
            
            if (is_array($value) && !empty($value) && array_keys($value) !== range(0, count($value) - 1)) {
                // Associative array - recurse
                $result = array_merge($result, $this->flattenArray($value, $newKey));
            } else {
                $result[$newKey] = $value;
            }
        }
        
        return $result;
    }
    
    /**
     * Get list of available scripts
     */
    public static function getAvailableScripts(): array
    {
        $scripts = [];
        $projectRoot = dirname(__DIR__, 5);
        
        foreach (self::ALLOWED_DIRS as $dir) {
            $fullDir = $projectRoot . '/' . $dir;
            
            if (!is_dir($fullDir)) {
                continue;
            }
            
            $iterator = new \RecursiveIteratorIterator(
                new \RecursiveDirectoryIterator($fullDir, \RecursiveDirectoryIterator::SKIP_DOTS)
            );
            
            foreach ($iterator as $file) {
                if (!$file->isFile()) {
                    continue;
                }
                
                $ext = $file->getExtension();
                $type = match ($ext) {
                    'php' => 'php',
                    'sh', 'bash' => 'shell',
                    'js', 'mjs' => 'node',
                    'py' => 'python',
                    default => null,
                };
                
                if ($type) {
                    $relativePath = str_replace($fullDir . '/', '', $file->getPathname());
                    $scripts[] = [
                        'path' => $relativePath,
                        'type' => $type,
                        'directory' => $dir,
                        'size' => $file->getSize(),
                        'modified' => $file->getMTime(),
                    ];
                }
            }
        }
        
        return $scripts;
    }
}
