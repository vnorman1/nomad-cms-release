<?php
/**
 * NOMAD CMS - AI Model Registry
 * 
 * Fetches and caches AI model definitions from the nomad-updates CDN.
 * Provides fallback to bundled defaults when CDN is unavailable.
 * 
 * Architecture:
 *   1. Cache-first: Always serve from local cache if available and fresh
 *   2. Background refresh: Update cache from CDN asynchronously
 *   3. Bundled fallback: If no cache exists, use bundled defaults
 * 
 * CDN Source: https://cdn.jsdelivr.net/gh/vnorman1/nomad-updates@main/ai/models.json
 * 
 * @package NomadCMS\Ai
 * @since 2.4.0
 */

declare(strict_types=1);

namespace NomadCMS\Ai;

class AIModelRegistry
{
    /**
     * CDN base URL for nomad-updates repo (12h branch cache)
     */
    private const CDN_BASE = 'https://cdn.jsdelivr.net/gh/vnorman1/nomad-updates@main';

    /**
     * Raw GitHub URL (no cache, always latest) - fallback
     */
    private const RAW_GITHUB_BASE = 'https://raw.githubusercontent.com/vnorman1/nomad-updates/main';

    /**
     * Purge API base URL
     */
    private const PURGE_BASE = 'https://purge.jsdelivr.net/gh/vnorman1/nomad-updates@main';

    /**
     * Cache TTL in seconds (24 hours)
     */
    private const CACHE_TTL = 86400;

    /**
     * HTTP timeout for CDN requests (seconds)
     */
    private const HTTP_TIMEOUT = 5;

    /**
     * Cache directory path
     */
    private static ?string $cacheDir = null;

    /**
     * In-memory cache for current request
     */
    private static ?array $memoryCache = null;

    /**
     * Initialize cache directory
     */
    private static function getCacheDir(): string
    {
        if (self::$cacheDir === null) {
            self::$cacheDir = dirname(__DIR__, 2) . '/storage/cache/updates';
            if (!is_dir(self::$cacheDir)) {
                mkdir(self::$cacheDir, 0755, true);
            }
        }
        return self::$cacheDir;
    }

    /**
     * Get the full model registry data
     * 
     * Priority:
     * 1. Memory cache (same request)
     * 2. File cache (if fresh)
     * 3. CDN fetch (if cache stale/missing)
     * 4. Stale cache (if CDN fails)
     * 5. Bundled defaults (last resort)
     */
    public static function getRegistry(): array
    {
        // 1. Memory cache
        if (self::$memoryCache !== null) {
            return self::$memoryCache;
        }

        // 2. Check file cache
        $cacheFile = self::getCacheDir() . '/ai-models.json';
        $cacheMetaFile = self::getCacheDir() . '/ai-models.meta';

        if (file_exists($cacheFile) && file_exists($cacheMetaFile)) {
            $meta = json_decode(file_get_contents($cacheMetaFile), true);
            $cachedAt = $meta['cached_at'] ?? 0;

            if ((time() - $cachedAt) < self::CACHE_TTL) {
                // Cache is fresh
                $data = json_decode(file_get_contents($cacheFile), true);
                if ($data) {
                    self::$memoryCache = $data;
                    return $data;
                }
            }
        }

        // 3. Try CDN fetch
        $remoteData = self::fetchFromCDN();

        if ($remoteData !== null) {
            // Save to cache
            self::saveToCache($cacheFile, $cacheMetaFile, $remoteData);
            self::$memoryCache = $remoteData;
            return $remoteData;
        }

        // 4. Use stale cache if available
        if (file_exists($cacheFile)) {
            $data = json_decode(file_get_contents($cacheFile), true);
            if ($data) {
                self::$memoryCache = $data;
                return $data;
            }
        }

        // 5. Bundled defaults (last resort)
        $bundled = self::getBundledDefaults();
        self::$memoryCache = $bundled;
        return $bundled;
    }

    /**
     * Get all available models (flat list)
     */
    public static function getModels(): array
    {
        $registry = self::getRegistry();
        $models = [];

        foreach ($registry['providers'] ?? [] as $provider) {
            foreach ($provider['models'] ?? [] as $model) {
                $model['provider_id'] = $provider['id'];
                $model['provider_name'] = $provider['name'];
                $models[] = $model;
            }
        }

        return $models;
    }

    /**
     * Get only active (non-deprecated) models
     */
    public static function getActiveModels(): array
    {
        return array_values(array_filter(
            self::getModels(),
            fn($m) => !in_array($m['status'], ['deprecated', 'sunset'])
        ));
    }

    /**
     * Get the default model ID
     */
    public static function getDefaultModel(): string
    {
        $registry = self::getRegistry();

        // 1. From registry
        if (!empty($registry['default_model'])) {
            return $registry['default_model'];
        }

        // 2. From env
        $envModel = $_ENV['GEMINI_DEFAULT_MODEL'] ?? null;
        if ($envModel) {
            return $envModel;
        }

        // 3. Hardcoded fallback
        return 'gemini-3-flash-preview';
    }

    /**
     * Get a specific model by ID
     */
    public static function getModel(string $modelId): ?array
    {
        foreach (self::getModels() as $model) {
            if ($model['id'] === $modelId) {
                return $model;
            }
        }
        return null;
    }

    /**
     * Validate a model ID exists
     */
    public static function isValidModel(string $modelId): bool
    {
        return self::getModel($modelId) !== null;
    }

    /**
     * Check if a model is deprecated
     */
    public static function isDeprecated(string $modelId): bool
    {
        $model = self::getModel($modelId);
        return $model && in_array($model['status'], ['deprecated', 'sunset']);
    }

    /**
     * Get replacement suggestion for deprecated model
     */
    public static function getReplacement(string $modelId): ?string
    {
        $model = self::getModel($modelId);
        return $model['replacement'] ?? null;
    }

    /**
     * Get all providers
     */
    public static function getProviders(): array
    {
        $registry = self::getRegistry();
        return $registry['providers'] ?? [];
    }

    /**
     * Get the API base URL for a provider
     */
    public static function getProviderApiBase(string $providerId): ?string
    {
        foreach (self::getProviders() as $provider) {
            if ($provider['id'] === $providerId) {
                return $provider['api_base'] ?? null;
            }
        }
        return null;
    }

    /**
     * Get provider for a specific model
     */
    public static function getProviderForModel(string $modelId): ?array
    {
        $model = self::getModel($modelId);
        if (!$model) return null;

        foreach (self::getProviders() as $provider) {
            if ($provider['id'] === $model['provider_id']) {
                return $provider;
            }
        }
        return null;
    }

    /**
     * Build the full API URL for a model request
     */
    public static function buildApiUrl(string $modelId, string $apiKey): string
    {
        $provider = self::getProviderForModel($modelId);
        $apiBase = $provider['api_base'] ?? 'https://generativelanguage.googleapis.com/v1beta';

        return "{$apiBase}/models/{$modelId}:generateContent?key=" . urlencode($apiKey);
    }

    /**
     * Force refresh from CDN (for admin use)
     * Also purges CDN cache to ensure latest version
     */
    public static function forceRefresh(): array
    {
        self::$memoryCache = null;

        // Purge CDN cache first for maximum freshness
        $purgeResult = self::purgeCdnCache();

        $remoteData = self::fetchFromCDN();

        if ($remoteData !== null) {
            $cacheFile = self::getCacheDir() . '/ai-models.json';
            $cacheMetaFile = self::getCacheDir() . '/ai-models.meta';
            self::saveToCache($cacheFile, $cacheMetaFile, $remoteData);
            self::$memoryCache = $remoteData;

            return [
                'success' => true,
                'source' => 'cdn',
                'cdn_purge' => $purgeResult,
                'models_count' => count(self::getModels()),
                'updated_at' => $remoteData['updated_at'] ?? date('c'),
            ];
        }

        return [
            'success' => false,
            'error' => 'CDN not reachable, using cached data',
            'source' => 'cache',
            'cdn_purge_attempted' => $purgeResult,
        ];
    }

    /**
     * Get cache status info
     */
    public static function getCacheStatus(): array
    {
        $cacheFile = self::getCacheDir() . '/ai-models.json';
        $cacheMetaFile = self::getCacheDir() . '/ai-models.meta';

        $status = [
            'cache_exists' => file_exists($cacheFile),
            'cache_fresh' => false,
            'cached_at' => null,
            'age_seconds' => null,
            'ttl_seconds' => self::CACHE_TTL,
            'source' => 'none',
        ];

        if (file_exists($cacheMetaFile)) {
            $meta = json_decode(file_get_contents($cacheMetaFile), true);
            $cachedAt = $meta['cached_at'] ?? 0;
            $age = time() - $cachedAt;

            $status['cached_at'] = date('c', $cachedAt);
            $status['age_seconds'] = $age;
            $status['cache_fresh'] = $age < self::CACHE_TTL;
            $status['source'] = $meta['source'] ?? 'unknown';
        }

        return $status;
    }

    // ================================================================
    // PRIVATE METHODS
    // ================================================================

    /**
     * Fetch models from CDN, with raw GitHub fallback
     * 
     * Strategy:
     * 1. Try jsDelivr CDN (fast, edge-cached)
     * 2. If CDN fails, try raw.githubusercontent.com (always fresh)
     */
    private static function fetchFromCDN(): ?array
    {
        // Try CDN first
        $data = self::tryFetchModels(self::CDN_BASE . '/ai/models.json');
        if ($data !== null) {
            return $data;
        }

        // Fallback: raw GitHub (no caching, always latest)
        $data = self::tryFetchModels(self::RAW_GITHUB_BASE . '/ai/models.json');
        if ($data !== null) {
            error_log("AIModelRegistry: CDN miss, served from raw GitHub");
        }

        return $data;
    }

    /**
     * Try to fetch and parse models from a URL
     */
    private static function tryFetchModels(string $url): ?array
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => self::HTTP_TIMEOUT,
            CURLOPT_CONNECTTIMEOUT => 3,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_HTTPHEADER => [
                'Accept: application/json',
                'User-Agent: NomadCMS/2.4',
            ],
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        if ($error || $httpCode !== 200) {
            return null;
        }

        $data = json_decode($response, true);

        if (!$data || !isset($data['providers'])) {
            return null;
        }

        return $data;
    }

    /**
     * Purge AI models from jsDelivr CDN cache
     * Call this after updating models to force immediate propagation
     * Includes retry logic and detailed error reporting
     * 
     * @param int $maxRetries Maximum retry attempts
     * @return array Result with status, attempts, and error details
     */
    public static function purgeCdnCache(int $maxRetries = 3): array
    {
        $url = self::PURGE_BASE . '/ai/models.json';
        $lastError = null;
        $lastHttpCode = 0;

        for ($attempt = 1; $attempt <= $maxRetries + 1; $attempt++) {
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 12,
                CURLOPT_CONNECTTIMEOUT => 4,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_FAILONERROR => false,
                CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
                CURLOPT_HTTPHEADER => [
                    'User-Agent: NomadCMS/2.4',
                    'Accept: */*',
                    'Connection: close',
                ],
            ]);

            $response = curl_exec($ch);
            $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $lastError = curl_error($ch);
            $connectError = curl_errno($ch);
            curl_close($ch);

            $lastHttpCode = $httpCode;

            // Success
            if ($httpCode === 200) {
                error_log("AIModelRegistry: CDN purge SUCCESS on attempt {$attempt}");
                return [
                    'success' => true,
                    'status' => 'purged',
                    'attempts' => $attempt,
                    'http_code' => $httpCode,
                ];
            }

            // Retry on failure (except last attempt)
            if ($attempt < $maxRetries + 1) {
                error_log("AIModelRegistry: CDN purge RETRY attempt {$attempt} (HTTP {$httpCode}, error: {$lastError})");
                usleep(300000); // 300ms delay
            }
        }

        // All retries failed
        error_log("AIModelRegistry: CDN purge FAILED after {$maxRetries} retries (HTTP {$lastHttpCode}, error: {$lastError})");
        return [
            'success' => false,
            'status' => 'failed',
            'attempts' => $maxRetries + 1,
            'http_code' => $lastHttpCode,
            'error' => $lastError ?: "HTTP {$lastHttpCode}",
        ];
    }

    /**
     * Save data to cache files
     */
    private static function saveToCache(string $cacheFile, string $metaFile, array $data): void
    {
        file_put_contents($cacheFile, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        file_put_contents($metaFile, json_encode([
            'cached_at' => time(),
            'source' => 'cdn',
            'version' => $data['version'] ?? 'unknown',
        ]));
    }

    /**
     * Bundled default models (used when no cache and no CDN)
     * This is the absolute last resort fallback
     */
    private static function getBundledDefaults(): array
    {
        return [
            'version' => 'bundled-1.0.0',
            'updated_at' => '2026-02-08T00:00:00Z',
            'default_model' => 'gemini-3-flash-preview',
            'providers' => [
                [
                    'id' => 'gemini',
                    'name' => 'Google Gemini',
                    'icon' => 'sparkles',
                    'api_base' => 'https://generativelanguage.googleapis.com/v1beta',
                    'key_url' => 'https://makersuite.google.com/app/apikey',
                    'models' => [
                        [
                            'id' => 'gemini-3-flash-preview',
                            'label' => 'Gemini 3 Flash (Preview)',
                            'description' => 'Leggyorsabb és legújabb modell',
                            'status' => 'preview',
                            'speed' => 'fast',
                            'quality' => 'excellent',
                            'max_tokens' => 32768,
                            'context_window' => 1048576,
                            'supports_streaming' => true,
                            'pricing_tier' => 'free',
                        ],
                        [
                            'id' => 'gemini-2.5-flash',
                            'label' => 'Gemini 2.5 Flash',
                            'description' => 'Gyors és megbízható',
                            'status' => 'stable',
                            'speed' => 'fast',
                            'quality' => 'good',
                            'max_tokens' => 8192,
                            'context_window' => 1048576,
                            'supports_streaming' => true,
                            'pricing_tier' => 'free',
                        ],
                    ],
                ],
            ],
            'status_descriptions' => [
                'stable' => 'Teljesen támogatott',
                'preview' => 'Előzetes verzió',
                'deprecated' => 'Elavult, váltás ajánlott',
                'sunset' => 'Megszűnt',
            ],
        ];
    }
}
