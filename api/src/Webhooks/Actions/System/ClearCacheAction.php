<?php
/**
 * NOMAD CMS - Clear Cache Action
 * 
 * Clears various caches (CDN, application, database, etc.)
 */

declare(strict_types=1);

namespace NomadCMS\Webhooks\Actions\System;

use NomadCMS\Webhooks\Actions\BaseAction;
use NomadCMS\Webhooks\Actions\ActionContext;
use NomadCMS\Webhooks\Actions\ActionResult;

class ClearCacheAction extends BaseAction
{
    protected bool $requiresProvider = false;
    protected int $defaultTimeout = 30;
    
    public function getType(): string
    {
        return 'clear_cache';
    }
    
    public function getName(): string
    {
        return 'Cache Törlés';
    }
    
    public function getDescription(): string
    {
        return 'Különböző cache-ek törlése (CDN, alkalmazás, adatbázis)';
    }
    
    public function getCategory(): string
    {
        return 'system';
    }
    
    public function getIcon(): string
    {
        return '🧹';
    }
    
    public function getConfigSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'cache_types' => [
                    'type' => 'array',
                    'title' => 'Cache típusok',
                    'items' => [
                        'type' => 'string',
                        'enum' => ['all', 'cdn', 'opcache', 'apcu', 'file', 'database', 'static', 'api'],
                    ],
                    'default' => ['all'],
                ],
                'cdn_provider' => [
                    'type' => 'string',
                    'title' => 'CDN szolgáltató',
                    'enum' => ['cloudflare', 'fastly', 'bunny', 'keycdn', 'cloudfront', 'custom'],
                ],
                'cdn_zone_id' => [
                    'type' => 'string',
                    'title' => 'CDN Zone ID',
                ],
                'cdn_api_key' => [
                    'type' => 'string',
                    'title' => 'CDN API kulcs',
                    'encrypted' => true,
                ],
                'urls' => [
                    'type' => 'array',
                    'title' => 'Specifikus URL-ek',
                    'description' => 'Ha üres, teljes purge',
                    'items' => ['type' => 'string'],
                ],
                'tags' => [
                    'type' => 'array',
                    'title' => 'Cache tagek',
                    'description' => 'Tag alapú invalidálás',
                    'items' => ['type' => 'string'],
                ],
                'prefixes' => [
                    'type' => 'array',
                    'title' => 'Prefix-ek',
                    'description' => 'URL prefix alapú törlés',
                    'items' => ['type' => 'string'],
                ],
                'soft_purge' => [
                    'type' => 'boolean',
                    'title' => 'Soft purge',
                    'description' => 'Lejárat jelölés azonnali törlés helyett',
                    'default' => false,
                ],
            ],
        ];
    }
    
    public function getExpectedFields(): array
    {
        return ['urls', 'tags', 'slug'];
    }
    
    public function execute(ActionContext $context): ActionResult
    {
        $startTime = microtime(true);
        
        try {
            $config = $this->replaceConfigVariables($context->actionConfig, $context);
            
            $cacheTypes = $config['cache_types'] ?? ['all'];
            $results = [];
            
            // Handle 'all' type
            if (in_array('all', $cacheTypes)) {
                $cacheTypes = ['cdn', 'opcache', 'apcu', 'file', 'static', 'api'];
            }
            
            foreach ($cacheTypes as $type) {
                $result = match ($type) {
                    'cdn' => $this->clearCdn($config, $context),
                    'opcache' => $this->clearOpcache(),
                    'apcu' => $this->clearApcu(),
                    'file' => $this->clearFileCache(),
                    'database' => $this->clearDatabaseCache(),
                    'static' => $this->clearStaticCache($config, $context),
                    'api' => $this->clearApiCache($config, $context),
                    default => ['success' => false, 'error' => "Unknown cache type: {$type}"],
                };
                
                $results[$type] = $result;
            }
            
            // Check if all were successful
            $allSuccess = !in_array(false, array_column($results, 'success'));
            
            $executionTime = (int)((microtime(true) - $startTime) * 1000);
            
            return new ActionResult(
                success: $allSuccess,
                data: [
                    'results' => $results,
                    'cleared_types' => array_keys(array_filter($results, fn($r) => $r['success'])),
                ],
                statusCode: $allSuccess ? 200 : 207,
                executionTimeMs: $executionTime
            );
            
        } catch (\Exception $e) {
            $this->log('Cache clear failed', ['error' => $e->getMessage()]);
            return ActionResult::failure($e->getMessage());
        }
    }
    
    /**
     * Clear CDN cache
     */
    private function clearCdn(array $config, ActionContext $context): array
    {
        $provider = $config['cdn_provider'] ?? $context->getProviderConfig('cdn_provider');
        
        if (!$provider) {
            return ['success' => true, 'skipped' => true, 'message' => 'No CDN configured'];
        }
        
        $urls = $config['urls'] ?? [];
        $tags = $config['tags'] ?? [];
        $prefixes = $config['prefixes'] ?? [];
        
        // Auto-detect URLs from payload
        if (empty($urls) && empty($tags)) {
            if (!empty($context->mappedPayload['slug'])) {
                $baseUrl = getenv('SITE_URL') ?? 'https://example.com';
                $urls[] = $baseUrl . '/' . ltrim($context->mappedPayload['slug'], '/');
            }
            if (!empty($context->mappedPayload['urls'])) {
                $urls = array_merge($urls, (array)$context->mappedPayload['urls']);
            }
        }
        
        return match ($provider) {
            'cloudflare' => $this->clearCloudflare($config, $context, $urls, $tags),
            'fastly' => $this->clearFastly($config, $context, $urls, $tags),
            'bunny' => $this->clearBunny($config, $context, $urls),
            'keycdn' => $this->clearKeycdn($config, $context, $urls, $tags),
            'cloudfront' => $this->clearCloudfront($config, $context, $urls),
            'custom' => $this->clearCustomCdn($config, $context, $urls),
            default => ['success' => false, 'error' => "Unknown CDN provider: {$provider}"],
        };
    }
    
    /**
     * Clear Cloudflare cache with retry logic and batching
     */
    private function clearCloudflare(array $config, ActionContext $context, array $urls, array $tags): array
    {
        $zoneId = $config['cdn_zone_id'] ?? $context->getProviderConfig('cloudflare_zone_id');
        $apiKey = $config['cdn_api_key'] ?? $context->getProviderConfig('cloudflare_api_key');
        $email = $context->getProviderConfig('cloudflare_email');
        
        if (!$zoneId || !$apiKey) {
            return ['success' => false, 'error' => 'Cloudflare zone ID and API key required'];
        }
        
        $headers = [
            'Content-Type' => 'application/json',
        ];
        
        // API token or Global API key
        if ($email) {
            $headers['X-Auth-Email'] = $email;
            $headers['X-Auth-Key'] = $apiKey;
        } else {
            $headers['Authorization'] = "Bearer {$apiKey}";
        }
        
        $url = "https://api.cloudflare.com/client/v4/zones/{$zoneId}/purge_cache";
        
        // Build purge request
        if (!empty($urls)) {
            // Cloudflare allows max 30 URLs per request - batch them
            $urlBatches = array_chunk($urls, 30);
            $allSuccess = true;
            $allErrors = [];
            
            foreach ($urlBatches as $batch) {
                $payload = ['files' => $batch];
                $result = $this->httpRequestWithRetry('POST', $url, $headers, $payload, $this->defaultTimeout, 2);
                $response = json_decode($result['body'] ?? '', true);
                
                if (empty($response['success'])) {
                    $allSuccess = false;
                    if (!empty($response['errors'])) {
                        $allErrors = array_merge($allErrors, $response['errors']);
                    }
                }
            }
            
            return [
                'success' => $allSuccess,
                'error' => !empty($allErrors) ? json_encode($allErrors) : null,
            ];
        } elseif (!empty($tags)) {
            $payload = ['tags' => $tags];
        } else {
            $payload = ['purge_everything' => true];
        }
        
        $result = $this->httpRequestWithRetry('POST', $url, $headers, $payload ?? [], $this->defaultTimeout, 2);
        $response = json_decode($result['body'] ?? '', true);
        
        return [
            'success' => !empty($response['success']),
            'error' => !empty($response['errors']) ? json_encode($response['errors']) : null,
        ];
    }
    
    /**
     * Clear Fastly cache with retry logic
     */
    private function clearFastly(array $config, ActionContext $context, array $urls, array $tags): array
    {
        $serviceId = $config['cdn_zone_id'] ?? $context->getProviderConfig('fastly_service_id');
        $apiKey = $config['cdn_api_key'] ?? $context->getProviderConfig('fastly_api_key');
        $softPurge = $config['soft_purge'] ?? false;
        
        if (!$serviceId || !$apiKey) {
            return ['success' => false, 'error' => 'Fastly service ID and API key required'];
        }
        
        $headers = [
            'Fastly-Key' => $apiKey,
            'Accept' => 'application/json',
        ];
        
        if ($softPurge) {
            $headers['Fastly-Soft-Purge'] = '1';
        }
        
        // Purge by surrogate key (tags)
        if (!empty($tags)) {
            $url = "https://api.fastly.com/service/{$serviceId}/purge";
            $results = [];
            $failures = [];
            
            foreach ($tags as $tag) {
                $result = $this->httpRequestWithRetry('POST', "{$url}/{$tag}", $headers, null, $this->defaultTimeout, 2);
                $success = $result['status_code'] >= 200 && $result['status_code'] < 300;
                $results[] = $success;
                if (!$success) {
                    $failures[] = "Tag {$tag}: HTTP {$result['status_code']}";
                }
            }
            
            return [
                'success' => !in_array(false, $results),
                'error' => !empty($failures) ? json_encode($failures) : null,
            ];
        }
        
        // Purge by URL
        if (!empty($urls)) {
            $results = [];
            $failures = [];
            
            foreach ($urls as $purgeUrl) {
                $result = $this->httpRequestWithRetry('PURGE', $purgeUrl, $headers, null, $this->defaultTimeout, 2);
                $success = $result['status_code'] >= 200 && $result['status_code'] < 300;
                $results[] = $success;
                if (!$success) {
                    $failures[] = "URL {$purgeUrl}: HTTP {$result['status_code']}";
                }
            }
            
            return [
                'success' => !in_array(false, $results),
                'error' => !empty($failures) ? json_encode($failures) : null,
            ];
        }
        
        // Purge all
        $url = "https://api.fastly.com/service/{$serviceId}/purge_all";
        $result = $this->httpRequestWithRetry('POST', $url, $headers, null, $this->defaultTimeout, 2);
        
        return ['success' => $result['status_code'] >= 200 && $result['status_code'] < 300];
    }
    
    /**
     * Clear BunnyCDN cache with retry logic
     */
    private function clearBunny(array $config, ActionContext $context, array $urls): array
    {
        $pullZoneId = $config['cdn_zone_id'] ?? $context->getProviderConfig('bunny_pullzone_id');
        $apiKey = $config['cdn_api_key'] ?? $context->getProviderConfig('bunny_api_key');
        
        if (!$pullZoneId || !$apiKey) {
            return ['success' => false, 'error' => 'Bunny pullzone ID and API key required'];
        }
        
        $headers = [
            'AccessKey' => $apiKey,
            'Content-Type' => 'application/json',
        ];
        
        if (!empty($urls)) {
            // Purge specific URLs with retry
            $results = [];
            $failures = [];
            
            foreach ($urls as $url) {
                $purgeUrl = "https://api.bunny.net/purge?url=" . urlencode($url);
                $result = $this->httpRequestWithRetry('POST', $purgeUrl, $headers, null, $this->defaultTimeout, 2);
                $success = $result['status_code'] >= 200 && $result['status_code'] < 300;
                $results[] = $success;
                if (!$success) {
                    $failures[] = "URL {$url}: HTTP {$result['status_code']}";
                }
            }
            
            return [
                'success' => !in_array(false, $results),
                'error' => !empty($failures) ? json_encode($failures) : null,
            ];
        }
        
        // Purge entire pull zone with retry
        $url = "https://api.bunny.net/pullzone/{$pullZoneId}/purgeCache";
        $result = $this->httpRequestWithRetry('POST', $url, $headers, null, $this->defaultTimeout, 2);
        
        return ['success' => $result['status_code'] >= 200 && $result['status_code'] < 300];
    }
    
    /**
     * Clear KeyCDN cache with retry logic
     */
    private function clearKeycdn(array $config, ActionContext $context, array $urls, array $tags): array
    {
        $zoneId = $config['cdn_zone_id'] ?? $context->getProviderConfig('keycdn_zone_id');
        $apiKey = $config['cdn_api_key'] ?? $context->getProviderConfig('keycdn_api_key');
        
        if (!$zoneId || !$apiKey) {
            return ['success' => false, 'error' => 'KeyCDN zone ID and API key required'];
        }
        
        $headers = [
            'Content-Type' => 'application/json',
        ];
        
        // KeyCDN uses HTTP Basic Auth
        $auth = base64_encode("{$apiKey}:");
        $headers['Authorization'] = "Basic {$auth}";
        
        if (!empty($urls)) {
            $url = "https://api.keycdn.com/zones/purgeurl/{$zoneId}.json";
            $result = $this->httpRequestWithRetry('DELETE', $url, $headers, ['urls' => $urls], $this->defaultTimeout, 2);
        } elseif (!empty($tags)) {
            $url = "https://api.keycdn.com/zones/purgetag/{$zoneId}.json";
            $result = $this->httpRequestWithRetry('DELETE', $url, $headers, ['tags' => $tags], $this->defaultTimeout, 2);
        } else {
            $url = "https://api.keycdn.com/zones/purge/{$zoneId}.json";
            $result = $this->httpRequestWithRetry('GET', $url, $headers, null, $this->defaultTimeout, 2);
        }
        
        return ['success' => $result['status_code'] >= 200 && $result['status_code'] < 300];
    }
    
    /**
     * Clear CloudFront cache
     */
    private function clearCloudfront(array $config, ActionContext $context, array $urls): array
    {
        // CloudFront requires AWS SDK
        $this->log('CloudFront purge attempted but not yet implemented', ['reason' => 'Requires AWS SDK']);
        return ['success' => false, 'error' => 'CloudFront requires AWS SDK - implement when needed'];
    }
    
    /**
     * Clear custom CDN cache with retry logic
     */
    private function clearCustomCdn(array $config, ActionContext $context, array $urls): array
    {
        $purgeEndpoint = $context->getProviderConfig('cdn_purge_endpoint');
        
        if (!$purgeEndpoint) {
            return ['success' => false, 'error' => 'Custom CDN purge endpoint not configured'];
        }
        
        $result = $this->httpRequestWithRetry('POST', $purgeEndpoint, [
            'Content-Type' => 'application/json',
        ], [
            'urls' => $urls,
        ], $this->defaultTimeout, 2);
        
        return ['success' => $result['status_code'] >= 200 && $result['status_code'] < 300];
    }
    
    /**
     * Clear OPcache
     */
    private function clearOpcache(): array
    {
        if (!function_exists('opcache_reset')) {
            return ['success' => true, 'skipped' => true, 'message' => 'OPcache not available'];
        }
        
        $result = opcache_reset();
        return ['success' => $result];
    }
    
    /**
     * Clear APCu cache
     */
    private function clearApcu(): array
    {
        if (!function_exists('apcu_clear_cache')) {
            return ['success' => true, 'skipped' => true, 'message' => 'APCu not available'];
        }
        
        $result = apcu_clear_cache();
        return ['success' => $result];
    }
    
    /**
     * Clear file-based cache
     */
    private function clearFileCache(): array
    {
        $cacheDirs = [
            dirname(__DIR__, 4) . '/storage/cache',
            dirname(__DIR__, 4) . '/storage/webhook_cache',
            dirname(__DIR__, 4) . '/data/cache',
        ];
        
        $cleared = 0;
        
        foreach ($cacheDirs as $dir) {
            if (is_dir($dir)) {
                $files = glob("{$dir}/*");
                foreach ($files as $file) {
                    if (is_file($file)) {
                        @unlink($file);
                        $cleared++;
                    }
                }
            }
        }
        
        return ['success' => true, 'cleared_files' => $cleared];
    }
    
    /**
     * Clear database cache tables
     */
    private function clearDatabaseCache(): array
    {
        try {
            $dbPath = dirname(__DIR__, 4) . '/databases/system.sqlite';
            $db = new \PDO("sqlite:{$dbPath}");
            $db->setAttribute(\PDO::ATTR_ERRMODE, \PDO::ERRMODE_EXCEPTION);
            
            // Clear key-value store expired entries - use prepared statement
            $stmt = $db->prepare("DELETE FROM webhook_key_value_store WHERE expires_at IS NOT NULL AND expires_at < :now");
            $stmt->execute([':now' => time()]);
            
            return ['success' => true];
        } catch (\Exception $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
    
    /**
     * Clear static cache
     */
    private function clearStaticCache(array $config, ActionContext $context): array
    {
        $staticDir = dirname(__DIR__, 4) . '/static';
        
        if (!is_dir($staticDir)) {
            return ['success' => true, 'skipped' => true, 'message' => 'No static directory'];
        }
        
        $urls = $config['urls'] ?? [];
        
        if (!empty($urls)) {
            // Clear specific files
            $cleared = 0;
            foreach ($urls as $url) {
                $path = parse_url($url, PHP_URL_PATH);
                $filePath = $staticDir . $path;
                
                if (file_exists($filePath) && is_file($filePath)) {
                    @unlink($filePath);
                    $cleared++;
                }
                
                // Also try .html extension
                if (file_exists("{$filePath}.html")) {
                    @unlink("{$filePath}.html");
                    $cleared++;
                }
            }
            
            return ['success' => true, 'cleared_files' => $cleared];
        }
        
        // Clear all - dangerous, be careful!
        return ['success' => true, 'skipped' => true, 'message' => 'Full static clear skipped - specify URLs'];
    }
    
    /**
     * Clear API response cache
     */
    private function clearApiCache(array $config, ActionContext $context): array
    {
        $cacheDir = dirname(__DIR__, 4) . '/storage/api_cache';
        
        if (!is_dir($cacheDir)) {
            return ['success' => true, 'skipped' => true, 'message' => 'No API cache directory'];
        }
        
        $cleared = 0;
        $files = glob("{$cacheDir}/*.json");
        
        foreach ($files as $file) {
            @unlink($file);
            $cleared++;
        }
        
        return ['success' => true, 'cleared_files' => $cleared];
    }
    
    /**
     * HTTP request with automatic retry logic
     * Retries on network errors, timeouts, and 5xx errors
     * 
     * @param string $method HTTP method
     * @param string $url Target URL
     * @param array $headers HTTP headers
     * @param mixed $body Request body
     * @param int $timeout Timeout in seconds
     * @param int $maxRetries Maximum retry attempts
     * @return array Result with status_code and body
     */
    private function httpRequestWithRetry(string $method, string $url, array $headers, $body, int $timeout, int $maxRetries = 2): array
    {
        $lastResult = null;
        
        for ($attempt = 1; $attempt <= $maxRetries + 1; $attempt++) {
            $lastResult = $this->httpRequest($method, $url, $headers, $body, $timeout);
            $statusCode = $lastResult['status_code'] ?? 0;
            
            // Success
            if ($statusCode >= 200 && $statusCode < 300) {
                if ($attempt > 1) {
                    $this->log("CDN request succeeded after {$attempt} attempts", ['url' => $url]);
                }
                return $lastResult;
            }
            
            // Retry on network errors (0) or 5xx server errors
            $shouldRetry = ($statusCode === 0 || $statusCode >= 500) && $attempt < $maxRetries + 1;
            
            if ($shouldRetry) {
                $this->log("CDN request failed (HTTP {$statusCode}), retrying...", ['url' => $url, 'attempt' => $attempt]);
                usleep(500000 * $attempt); // Progressive backoff: 500ms, 1s, 1.5s...
            }
        }
        
        $this->log("CDN request failed after {$maxRetries} retries", ['url' => $url, 'final_status' => $lastResult['status_code'] ?? 0]);
        return $lastResult ?? ['status_code' => 0, 'body' => null];
    }
}
