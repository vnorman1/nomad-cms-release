<?php
/**
 * NOMAD CMS - Update Service
 * 
 * Fetches changelogs, announcements, and meta information from the
 * nomad-updates CDN. Implements selective caching per resource type.
 * 
 * Cache Policy:
 *   - Changelogs: 1 hour cache
 *   - Announcements: No cache (always fresh)
 *   - Meta: No cache (version checking)
 *   - Changelog MD files: 1 hour cache
 * 
 * @package NomadCMS\Ai
 * @since 2.4.0
 */

declare(strict_types=1);

namespace NomadCMS\Ai;

class UpdateService
{
    /**
     * CDN base URL (branch-based, 12h cache)
     */
    private const CDN_BASE = 'https://cdn.jsdelivr.net/gh/vnorman1/nomad-updates@main';

    /**
     * Raw GitHub URL (no cache, always latest)
     * Used as fallback when CDN returns stale data
     */
    private const RAW_GITHUB_BASE = 'https://raw.githubusercontent.com/vnorman1/nomad-updates/main';

    /**
     * Purge API base URL
     */
    private const PURGE_BASE = 'https://purge.jsdelivr.net/gh/vnorman1/nomad-updates@main';

    /**
     * Cache TTL for changelogs (1 hour)
     */
    private const CHANGELOG_CACHE_TTL = 3600;

    /**
     * HTTP timeout
     */
    private const HTTP_TIMEOUT = 5;

    /**
     * All known CDN resource paths for full cache rebuild
     */
    private const ALL_CDN_PATHS = [
        '/meta.json',
        '/changelog/index.json',
        '/announcements/current.json',
        '/ai/models.json',
    ];

    /**
     * Cache directory
     */
    private static ?string $cacheDir = null;

    /**
     * Force refresh mode - when true, fetches from GitHub first
     */
    private static bool $forceRefresh = false;

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

    // ================================================================
    // META
    // ================================================================

    /**
     * Get repo meta info (always fresh, no cache)
     */
    public static function getMeta(): ?array
    {
        return self::fetchJson('/meta.json');
    }

    /**
     * Check if there's a newer version available
     */
    public static function checkForUpdates(string $currentVersion): array
    {
        $meta = self::getMeta();

        if (!$meta) {
            return [
                'has_update' => false,
                'error' => 'Could not reach update server',
            ];
        }

        $latestVersion = $meta['latest_version'] ?? '0.0.0';
        $hasUpdate = version_compare($latestVersion, $currentVersion, '>');

        return [
            'has_update' => $hasUpdate,
            'current_version' => $currentVersion,
            'latest_version' => $latestVersion,
            'updated_at' => $meta['updated_at'] ?? null,
        ];
    }

    // ================================================================
    // CHANGELOGS
    // ================================================================

    /**
     * Get the changelog index (list of all changelogs)
     * Cached for 1 hour
     */
    public static function getChangelogIndex(): ?array
    {
        $cacheKey = 'changelog-index';
        $cached = self::getFromCache($cacheKey, self::CHANGELOG_CACHE_TTL);

        if ($cached !== null) {
            return $cached;
        }

        $data = self::fetchJson('/changelog/index.json');

        if ($data !== null) {
            self::saveToCache($cacheKey, $data);
        }

        return $data;
    }

    /**
     * Get a specific changelog markdown content
     * Cached for 1 hour
     */
    public static function getChangelog(string $filename): ?string
    {
        // Sanitize filename to prevent path traversal
        $filename = basename($filename);
        if (!preg_match('/^[\w\-\.]+\.md$/', $filename)) {
            return null;
        }

        $cacheKey = 'changelog-' . md5($filename);
        $cacheFile = self::getCacheDir() . "/{$cacheKey}.md";
        $cacheMetaFile = self::getCacheDir() . "/{$cacheKey}.meta";

        // Check cache
        if (file_exists($cacheFile) && file_exists($cacheMetaFile)) {
            $meta = json_decode(file_get_contents($cacheMetaFile), true);
            if ((time() - ($meta['cached_at'] ?? 0)) < self::CHANGELOG_CACHE_TTL) {
                return file_get_contents($cacheFile);
            }
        }

        // Fetch from CDN
        $content = self::fetchRaw("/changelog/{$filename}");

        if ($content !== null) {
            file_put_contents($cacheFile, $content);
            file_put_contents($cacheMetaFile, json_encode([
                'cached_at' => time(),
                'filename' => $filename,
            ]));
        }

        // Return stale cache if fetch failed
        if ($content === null && file_exists($cacheFile)) {
            return file_get_contents($cacheFile);
        }

        return $content;
    }

    // ================================================================
    // ANNOUNCEMENTS
    // ================================================================

    /**
     * Get current announcements (never cached - always fresh)
     * Uses GitHub raw first to bypass jsDelivr CDN cache
     */
    public static function getAnnouncements(): ?array
    {
        $data = self::fetchJson('/announcements/current.json', true);

        if ($data === null) {
            return [
                'active' => false,
                'announcements' => [],
            ];
        }

        // Filter out expired announcements
        $now = time();
        $data['announcements'] = array_values(array_filter(
            $data['announcements'] ?? [],
            function ($a) use ($now) {
                if (isset($a['expires_at'])) {
                    return strtotime($a['expires_at']) > $now;
                }
                return true;
            }
        ));

        $data['active'] = count($data['announcements']) > 0;

        return $data;
    }

    /**
     * Get dismissed announcement IDs for a user (stored by UUID)
     */
    public static function getDismissedAnnouncements(string $userUuid): array
    {
        $file = self::getDismissedFilePath($userUuid);
        if (file_exists($file)) {
            return json_decode(file_get_contents($file), true) ?? [];
        }
        return [];
    }

    /**
     * Dismiss an announcement for a user (by UUID)
     */
    public static function dismissAnnouncement(string $userUuid, string $announcementId): void
    {
        $dismissed = self::getDismissedAnnouncements($userUuid);
        if (!in_array($announcementId, $dismissed)) {
            $dismissed[] = $announcementId;
        }
        file_put_contents(
            self::getDismissedFilePath($userUuid),
            json_encode($dismissed)
        );
    }

    /**
     * Get announcements filtered by user's dismissed list
     */
    public static function getActiveAnnouncementsForUser(string $userUuid): array
    {
        $announcements = self::getAnnouncements();
        if (!$announcements || empty($announcements['announcements'])) {
            // No active announcements — cleanup dismissed file if exists
            self::cleanupDismissedFile($userUuid);
            return ['active' => false, 'announcements' => []];
        }

        $currentIds = array_map(
            fn($a) => $a['id'] ?? '',
            $announcements['announcements']
        );

        // Get dismissed list, clean stale entries inline (no extra CDN call)
        $dismissed = self::getDismissedAnnouncements($userUuid);
        $cleanDismissed = array_values(array_filter(
            $dismissed,
            fn($id) => in_array($id, $currentIds)
        ));

        // If stale entries were removed, persist the cleaned list
        if (count($cleanDismissed) !== count($dismissed)) {
            $file = self::getDismissedFilePath($userUuid);
            if (empty($cleanDismissed)) {
                @unlink($file);
            } else {
                file_put_contents($file, json_encode($cleanDismissed));
            }
        }

        $filtered = array_values(array_filter(
            $announcements['announcements'],
            fn($a) => !in_array($a['id'] ?? '', $cleanDismissed)
        ));

        return [
            'active' => count($filtered) > 0,
            'announcements' => $filtered,
        ];
    }

    /**
     * Remove dismissed file if it exists and there are no current announcements
     */
    private static function cleanupDismissedFile(string $userUuid): void
    {
        $file = self::getDismissedFilePath($userUuid);
        if (file_exists($file)) {
            @unlink($file);
        }
    }

    /**
     * Global cleanup: remove all orphaned dismissed-*.json files
     * that are older than $maxAgeDays days.
     * 
     * Call this periodically (e.g., from a cron job or admin maintenance endpoint).
     * 
     * @param int $maxAgeDays Remove dismissed files not modified in this many days (default: 30)
     * @return int Number of files removed
     */
    public static function cleanupOrphanedDismissedFiles(int $maxAgeDays = 30): int
    {
        $dir = self::getCacheDir();
        if (!is_dir($dir)) return 0;

        $cutoff = time() - ($maxAgeDays * 86400);
        $removed = 0;

        $files = glob($dir . '/dismissed-*.json');
        foreach ($files as $file) {
            if (is_file($file) && filemtime($file) < $cutoff) {
                @unlink($file);
                $removed++;
            }
        }

        return $removed;
    }

    // ================================================================
    // CACHE MANAGEMENT
    // ================================================================

    /**
     * Clear all update caches (preserves per-user dismissed files)
     */
    public static function clearCache(): bool
    {
        $dir = self::getCacheDir();
        if (!is_dir($dir)) return true;

        $files = glob($dir . '/*');
        foreach ($files as $file) {
            if (is_file($file) && !str_contains(basename($file), 'dismissed-')) {
                unlink($file);
            }
        }
        return true;
    }

    /**
     * Force refresh all updates from source
     * 
     * Strategy:
     * 1. Clear entire local cache (storage/cache/updates)
     * 2. Purge jsDelivr CDN cache for all known paths
     * 3. Set forceRefresh mode (GitHub raw first)
     * 4. Re-fetch all resources to rebuild cache
     * 
     * This ensures the user always gets the absolute latest data.
     * Should only be called when user explicitly clicks "Refresh".
     * 
     * @return array Detailed results of the refresh operation
     */
    public static function forceRefreshAll(): array
    {
        $startTime = microtime(true);
        $results = [
            'cache_cleared' => false,
            'cdn_purged' => [],
            'refetched' => [],
            'changelog_files' => [],
            'duration_ms' => 0,
        ];

        // Step 1: Clear local file cache
        $results['cache_cleared'] = self::clearCache();
        error_log('UpdateService forceRefresh: Local cache cleared');

        // Step 2: Enable force refresh mode (GitHub raw first)
        self::$forceRefresh = true;

        // Step 3: Purge jsDelivr CDN cache (async, non-blocking for user)
        // This runs in background so next non-force requests also get fresh data
        try {
            $results['cdn_purged'] = self::purgeCdnCache(self::ALL_CDN_PATHS, 2);
            error_log('UpdateService forceRefresh: CDN purge completed for ' . count(self::ALL_CDN_PATHS) . ' paths');
        } catch (\Throwable $e) {
            error_log('UpdateService forceRefresh: CDN purge error: ' . $e->getMessage());
            $results['cdn_purged'] = ['error' => $e->getMessage()];
        }

        // Step 4: Re-fetch all core resources from GitHub raw → rebuild cache
        // Meta (no cache, but we fetch to validate connectivity)
        $meta = self::getMeta();
        $results['refetched']['meta'] = $meta !== null ? 'ok' : 'failed';

        // Changelog index
        $changelogIndex = self::getChangelogIndex();
        $results['refetched']['changelog_index'] = $changelogIndex !== null ? 'ok' : 'failed';

        // Announcements
        $announcements = self::getAnnouncements();
        $results['refetched']['announcements'] = $announcements !== null ? 'ok' : 'failed';

        // Re-fetch all individual changelog files to populate cache
        if ($changelogIndex !== null && !empty($changelogIndex['entries'])) {
            foreach ($changelogIndex['entries'] as $entry) {
                $filename = $entry['file'] ?? null;
                if ($filename) {
                    $content = self::getChangelog($filename);
                    $results['changelog_files'][$filename] = $content !== null ? 'ok' : 'failed';
                }
            }
        }

        // Step 5: Disable force refresh mode
        self::$forceRefresh = false;

        $results['duration_ms'] = round((microtime(true) - $startTime) * 1000);
        error_log('UpdateService forceRefresh: Complete in ' . $results['duration_ms'] . 'ms');

        return $results;
    }

    /**
     * Check if an announcement ID exists in the current announcements
     */
    public static function isValidAnnouncementId(string $id): bool
    {
        $announcements = self::getAnnouncements();
        if (!$announcements || empty($announcements['announcements'])) {
            return false;
        }

        foreach ($announcements['announcements'] as $a) {
            if (($a['id'] ?? '') === $id) {
                return true;
            }
        }
        return false;
    }

    // ================================================================
    // PRIVATE METHODS
    // ================================================================

    /**
     * Get the file path for a user's dismissed announcements.
     * Uses a SHA-256 hash of the UUID to prevent enumeration and path traversal.
     */
    private static function getDismissedFilePath(string $userUuid): string
    {
        $hash = hash('sha256', $userUuid);
        return self::getCacheDir() . "/dismissed-{$hash}.json";
    }

    /**
     * Fetch JSON from CDN
     * @param bool $preferFresh If true, fetches from GitHub raw first (for time-sensitive data like announcements)
     */
    private static function fetchJson(string $path, bool $preferFresh = false): ?array
    {
        $content = $preferFresh ? self::fetchRawFresh($path) : self::fetchRaw($path);
        if ($content === null) return null;

        $data = json_decode($content, true);
        return is_array($data) ? $data : null;
    }

    /**
     * Fetch raw content from CDN, with intelligent source selection
     * 
     * Normal mode:
     *   1. Try jsDelivr CDN (fast, edge-cached)
     *   2. Fallback to raw.githubusercontent.com (always fresh)
     * 
     * Force refresh mode (user clicked refresh):
     *   1. Try raw.githubusercontent.com FIRST (always latest, no cache)
     *   2. If GitHub rate-limited/fails → purge jsDelivr + fetch from CDN
     */
    private static function fetchRaw(string $path): ?string
    {
        if (self::$forceRefresh) {
            return self::fetchRawForceRefresh($path);
        }

        // Normal mode: CDN first (faster, cached at edge)
        $cdnUrl = self::CDN_BASE . $path;
        $content = self::httpGet($cdnUrl);

        if ($content !== null) {
            return $content;
        }

        // Fallback: raw GitHub (no caching, always latest)
        $rawUrl = self::RAW_GITHUB_BASE . $path;
        $content = self::httpGet($rawUrl);

        if ($content !== null) {
            error_log("UpdateService: CDN miss, served from raw GitHub for {$path}");
        }

        return $content;
    }

    /**
     * Fetch raw content preferring freshness over speed.
     * Always tries GitHub raw first, falls back to CDN.
     * Used for time-sensitive data (announcements) that must always be current,
     * regardless of whether forceRefresh mode is active.
     * 
     * Unlike fetchRaw() which prefers CDN speed, this ensures freshness.
     * Unlike fetchRawForceRefresh() which also purges CDN, this is lightweight.
     */
    private static function fetchRawFresh(string $path): ?string
    {
        // Always try GitHub raw first (no CDN caching, always latest)
        $rawUrl = self::RAW_GITHUB_BASE . $path;
        $content = self::httpGet($rawUrl);

        if ($content !== null) {
            return $content;
        }

        // Fallback to CDN if GitHub is unreachable/rate-limited
        error_log("UpdateService: GitHub raw unavailable for {$path}, falling back to CDN");
        $cdnUrl = self::CDN_BASE . $path;
        return self::httpGet($cdnUrl);
    }

    /**
     * Force refresh fetch strategy:
     * 1. GitHub raw (always latest, bypasses all CDN caches)
     * 2. If GitHub fails (rate limit 403/429) → purge jsDelivr cache for this path → fetch from CDN
     */
    private static function fetchRawForceRefresh(string $path): ?string
    {
        // Step 1: Try raw GitHub first (always has the latest content)
        $rawUrl = self::RAW_GITHUB_BASE . $path;
        $content = self::httpGetWithStatus($rawUrl);

        if ($content['body'] !== null && $content['http_code'] === 200) {
            error_log("UpdateService forceRefresh: Served from raw GitHub for {$path}");
            return $content['body'];
        }

        // GitHub failed - log why
        $reason = match(true) {
            $content['http_code'] === 403 => 'rate-limited (403)',
            $content['http_code'] === 429 => 'rate-limited (429)',
            $content['http_code'] === 404 => 'not found (404)',
            $content['http_code'] === 0   => 'network error',
            default => "HTTP {$content['http_code']}",
        };
        error_log("UpdateService forceRefresh: GitHub failed for {$path}: {$reason}");

        // Step 2: Purge jsDelivr cache for this specific path, then fetch
        $purgeUrl = self::PURGE_BASE . $path;
        $purgeResult = self::httpGet($purgeUrl);

        if ($purgeResult !== null) {
            error_log("UpdateService forceRefresh: jsDelivr purged for {$path}");
        } else {
            error_log("UpdateService forceRefresh: jsDelivr purge failed for {$path}, fetching anyway");
        }

        // Small delay to let purge propagate
        usleep(200000); // 200ms

        // Fetch from CDN (should now be fresh after purge)
        $cdnUrl = self::CDN_BASE . $path;
        $cdnContent = self::httpGet($cdnUrl);

        if ($cdnContent !== null) {
            error_log("UpdateService forceRefresh: Served from jsDelivr (post-purge) for {$path}");
            return $cdnContent;
        }

        error_log("UpdateService forceRefresh: All sources failed for {$path}");
        return null;
    }

    /**
     * HTTP GET with status code - returns both body and HTTP code
     */
    private static function httpGetWithStatus(string $url): array
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => self::HTTP_TIMEOUT,
            CURLOPT_CONNECTTIMEOUT => 3,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_HTTPHEADER => [
                'User-Agent: NomadCMS/2.4',
            ],
        ]);

        $response = curl_exec($ch);
        $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        return [
            'body' => ($error || $httpCode !== 200) ? null : ($response ?: null),
            'http_code' => $httpCode,
            'error' => $error ?: null,
        ];
    }

    /**
     * HTTP GET helper
     */
    private static function httpGet(string $url): ?string
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => self::HTTP_TIMEOUT,
            CURLOPT_CONNECTTIMEOUT => 3,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_HTTPHEADER => [
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

        return $response ?: null;
    }

    /**
     * Purge specific paths from jsDelivr CDN cache
     * Call this after pushing updates to ensure immediate propagation
     * With retry logic and detailed error reporting
     * 
     * @param string[] $paths CDN paths to purge (e.g., ['/meta.json', '/ai/models.json'])
     * @param int $maxRetries Maximum retry attempts per path
     * @return array Purge results per path with status and metadata
     */
    public static function purgeCdnCache(array $paths, int $maxRetries = 3): array
    {
        if (empty($paths)) {
            return [];
        }

        // Validate paths
        $validPaths = array_filter(array_map(function($p) {
            $clean = trim($p);
            if (empty($clean) || !str_starts_with($clean, '/')) {
                error_log("UpdateService CDN purge: Invalid path {$p}");
                return null;
            }
            return $clean;
        }, $paths));

        $results = [];
        $retryQueue = array_fill_keys($validPaths, 0);

        while (!empty($retryQueue)) {
            $mh = curl_multi_init();
            $handles = [];
            $batch = array_slice($retryQueue, 0, 5, true); // Max 5 parallel

            foreach ($batch as $path => $_) {
                $url = self::PURGE_BASE . $path;
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
                curl_multi_add_handle($mh, $ch);
                $handles[$path] = $ch;
            }

            // Execute batch
            $running = null;
            do {
                $status = curl_multi_exec($mh, $running);
                if ($running > 0) {
                    curl_multi_select($mh, 1);
                }
            } while ($running > 0);

            // Process results
            foreach ($batch as $path => $attemptCount) {
                $ch = $handles[$path];
                $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
                $error = curl_error($ch);
                $retryCount = $retryQueue[$path] ?? 0;

                if ($httpCode === 200) {
                    $results[$path] = [
                        'status' => 'purged',
                        'attempts' => $retryCount + 1,
                        'http_code' => $httpCode,
                    ];
                    unset($retryQueue[$path]);
                    error_log("UpdateService: CDN purge SUCCESS {$path}");
                } else {
                    if ($retryCount < $maxRetries) {
                        $retryQueue[$path]++;
                        error_log("UpdateService: CDN purge RETRY {$path} (attempt " . ($retryCount + 1) . " / {$maxRetries}, HTTP {$httpCode})");
                    } else {
                        $results[$path] = [
                            'status' => 'failed',
                            'attempts' => $retryCount + 1,
                            'http_code' => $httpCode,
                            'error' => $error ?: "HTTP {$httpCode}",
                        ];
                        unset($retryQueue[$path]);
                        error_log("UpdateService: CDN purge FAILED {$path} after {$retryCount} retries");
                    }
                }

                curl_multi_remove_handle($mh, $ch);
                curl_close($ch);
            }

            curl_multi_close($mh);

            if (!empty($retryQueue)) {
                usleep(400000); // 400ms delay before retry
            }
        }

        return $results;
    }

    /**
     * Get data from file cache
     */
    private static function getFromCache(string $key, int $ttl): ?array
    {
        $cacheFile = self::getCacheDir() . "/{$key}.json";
        $cacheMetaFile = self::getCacheDir() . "/{$key}.meta";

        if (!file_exists($cacheFile) || !file_exists($cacheMetaFile)) {
            return null;
        }

        $meta = json_decode(file_get_contents($cacheMetaFile), true);
        $cachedAt = $meta['cached_at'] ?? 0;

        if ((time() - $cachedAt) >= $ttl) {
            return null; // Cache expired
        }

        $data = json_decode(file_get_contents($cacheFile), true);
        return is_array($data) ? $data : null;
    }

    /**
     * Save data to file cache
     */
    private static function saveToCache(string $key, array $data): void
    {
        $cacheFile = self::getCacheDir() . "/{$key}.json";
        $cacheMetaFile = self::getCacheDir() . "/{$key}.meta";

        file_put_contents($cacheFile, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        file_put_contents($cacheMetaFile, json_encode([
            'cached_at' => time(),
        ]));
    }
}
