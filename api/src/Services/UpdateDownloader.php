<?php
/**
 * NOMAD CMS - Update Downloader
 * 
 * Multi-source download service with fallback strategy:
 * - Primary: GitHub Releases CDN
 * - Fallback: jsDelivr CDN
 * 
 * Features:
 * - Automatic fallback on 429 rate limiting
 * - Exponential backoff with jitter
 * - Retry logic for transient failures
 */

declare(strict_types=1);

namespace NomadCMS\Services;

use RuntimeException;

final class UpdateDownloader
{
    /**
     * Download sources in priority order
     */
    private const SOURCES = [
        'github' => 'https://github.com/{owner}/{repo}/releases/download/{version}/{file}',
        'jsdelivr' => 'https://cdn.jsdelivr.net/gh/{owner}/{repo}@{version}/{file}',
    ];

    private const MAX_RETRIES = 3;
    private const RETRY_DELAY_MS = 1000;
    private const MAX_BACKOFF_MS = 30000;

    private string $owner;
    private string $repo;
    private ?string $lastUsedSource = null;
    private array $errors = [];

    public function __construct(?string $owner = null, ?string $repo = null)
    {
        $this->owner = $owner ?? (defined('NomadCMS\Config\Version::GITHUB_OWNER') ? \NomadCMS\Config\Version::GITHUB_OWNER : 'vnorman1');
        $this->repo = $repo ?? (defined('NomadCMS\Config\Version::GITHUB_REPO') ? \NomadCMS\Config\Version::GITHUB_REPO : 'nomad-cms-release');
    }

    /**
     * Download a file from release
     * 
     * @param string $file Filename to download
     * @param string $version Version tag (e.g., "v1.2.0")
     * @return DownloadResult
     */
    public function download(string $file, string $version): DownloadResult
    {
        $this->errors = [];

        foreach (self::SOURCES as $sourceName => $urlTemplate) {
            $url = $this->buildUrl($urlTemplate, $file, $version);

            for ($attempt = 1; $attempt <= self::MAX_RETRIES; $attempt++) {
                try {
                    $response = $this->httpRequest($url);

                    if ($response['status'] === 200) {
                        $this->lastUsedSource = $sourceName;
                        return new DownloadResult(
                            success: true,
                            content: $response['body'],
                            source: $sourceName,
                            url: $url
                        );
                    }

                    if ($response['status'] === 429) {
                        // Rate limited - log and try next source
                        $retryAfter = $response['headers']['retry-after'] ?? 60;
                        $this->errors[] = [
                            'source' => $sourceName,
                            'error' => "Rate limited (429), retry after {$retryAfter}s",
                            'url' => $url,
                        ];
                        break; // Skip to next source
                    }

                    if ($response['status'] === 404) {
                        // File not found - skip to next source
                        $this->errors[] = [
                            'source' => $sourceName,
                            'error' => "File not found (404)",
                            'url' => $url,
                        ];
                        break;
                    }

                    if ($response['status'] >= 500) {
                        // Server error - retry with backoff
                        $this->errors[] = [
                            'source' => $sourceName,
                            'error' => "Server error ({$response['status']}), attempt {$attempt}",
                            'url' => $url,
                        ];
                        usleep($this->calculateBackoff($attempt) * 1000);
                        continue;
                    }

                    // Other error - try next source
                    $this->errors[] = [
                        'source' => $sourceName,
                        'error' => "HTTP {$response['status']}",
                        'url' => $url,
                    ];
                    break;

                } catch (\Exception $e) {
                    $this->errors[] = [
                        'source' => $sourceName,
                        'error' => $e->getMessage(),
                        'url' => $url,
                    ];
                    usleep($this->calculateBackoff($attempt) * 1000);
                }
            }
        }

        // All sources exhausted
        return new DownloadResult(
            success: false,
            content: null,
            source: null,
            url: null,
            errors: $this->errors
        );
    }

    /**
     * Download multiple files
     * 
     * @param array $files List of filenames
     * @param string $version Version tag
     * @return array<string, DownloadResult> Map of filename => result
     */
    public function downloadMultiple(array $files, string $version): array
    {
        $results = [];

        foreach ($files as $file) {
            $results[$file] = $this->download($file, $version);

            // If any download fails, stop immediately
            if (!$results[$file]->success) {
                break;
            }
        }

        return $results;
    }

    /**
     * Get last used source
     */
    public function getLastUsedSource(): ?string
    {
        return $this->lastUsedSource;
    }

    /**
     * Get all errors from last download attempt
     */
    public function getErrors(): array
    {
        return $this->errors;
    }

    /**
     * Download manifest for a specific version
     * 
     * @param string $version Target version (e.g., "1.2.0")
     * @return array{success: bool, manifest?: array, error?: string, source?: string}
     */
    public function downloadManifest(string $version): array
    {
        $tag = "v{$version}";
        $result = $this->download('manifest.json', $tag);
        
        if (!$result->success) {
            return [
                'success' => false,
                'error' => $result->getErrorMessage(),
            ];
        }
        
        $manifest = json_decode($result->content, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            return [
                'success' => false,
                'error' => 'Invalid manifest JSON: ' . json_last_error_msg(),
            ];
        }
        
        return [
            'success' => true,
            'manifest' => $manifest,
            'source' => $result->source,
        ];
    }

    /**
     * Download update files (zip package) for a specific version
     * 
     * @param string $version Target version
     * @return array{success: bool, path?: string, error?: string}
     */
    public function downloadUpdateFiles(string $version): array
    {
        $tag = "v{$version}";
        $result = $this->download('files.zip', $tag);
        
        if (!$result->success) {
            return [
                'success' => false,
                'error' => $result->getErrorMessage(),
            ];
        }
        
        // Extract to temp directory
        $tempDir = sys_get_temp_dir() . '/nomad_update_' . $version . '_' . time();
        if (!is_dir($tempDir)) {
            mkdir($tempDir, 0755, true);
        }
        
        $zipPath = $tempDir . '/files.zip';
        file_put_contents($zipPath, $result->content);
        
        $zip = new \ZipArchive();
        if ($zip->open($zipPath) !== true) {
            // Cleanup - use recursive deletion since extraction may have partially occurred
            @unlink($zipPath);
            $this->recursiveDelete($tempDir);
            return [
                'success' => false,
                'error' => 'Failed to open update archive',
            ];
        }
        
        $zip->extractTo($tempDir);
        $zip->close();
        @unlink($zipPath);
        
        return [
            'success' => true,
            'path' => $tempDir,
        ];
    }

    /**
     * Get list of available releases from GitHub API
     * 
     * @return array List of releases
     */
    public function getAvailableReleases(): array
    {
        $url = sprintf(
            'https://api.github.com/repos/%s/%s/releases',
            $this->owner,
            $this->repo
        );
        
        try {
            $response = $this->httpRequest($url);
            
            if ($response['status'] !== 200) {
                return [];
            }
            
            $releases = json_decode($response['body'], true);
            if (!is_array($releases)) {
                return [];
            }
            
            return array_map(function ($release) {
                $version = ltrim($release['tag_name'] ?? '', 'v');
                return [
                    'version' => $version,
                    'tag' => $release['tag_name'] ?? '',
                    'releaseDate' => $release['published_at'] ?? $release['created_at'] ?? '',
                    'prerelease' => $release['prerelease'] ?? false,
                    'body' => $release['body'] ?? '',
                ];
            }, $releases);
            
        } catch (\Exception $e) {
            error_log('Failed to fetch releases: ' . $e->getMessage());
            return [];
        }
    }

    /**
     * Build URL from template
     */
    private function buildUrl(string $template, string $file, string $version): string
    {
        return str_replace(
            ['{owner}', '{repo}', '{version}', '{file}'],
            [$this->owner, $this->repo, $version, $file],
            $template
        );
    }

    /**
     * Calculate exponential backoff with jitter
     * 
     * @param int $attempt Attempt number (1-based)
     * @return int Delay in milliseconds
     */
    private function calculateBackoff(int $attempt): int
    {
        $baseDelay = (int)pow(2, $attempt - 1) * self::RETRY_DELAY_MS;
        $jitter = random_int(0, 500);
        return min($baseDelay + $jitter, self::MAX_BACKOFF_MS);
    }

    /**
     * Perform HTTP request
     * 
     * @param string $url URL to fetch
     * @return array{status: int, body: string, headers: array}
     */
    private function httpRequest(string $url): array
    {
        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'timeout' => 30,
                'follow_location' => true,
                'max_redirects' => 5,
                'header' => [
                    'User-Agent: NOMAD-CMS-Updater/1.0',
                    'Accept: */*',
                ],
                'ignore_errors' => true,
            ],
            'ssl' => [
                'verify_peer' => true,
                'verify_peer_name' => true,
            ],
        ]);

        $body = @file_get_contents($url, false, $context);

        if ($body === false) {
            throw new RuntimeException("Failed to fetch: {$url}");
        }

        // Parse response headers
        $status = 0;
        $headers = [];

        if (!empty($http_response_header)) {
            foreach ($http_response_header as $header) {
                if (preg_match('/^HTTP\/[\d.]+\s+(\d+)/', $header, $matches)) {
                    $status = (int)$matches[1];
                }
                if (preg_match('/^([^:]+):\s*(.+)$/i', $header, $matches)) {
                    $headers[strtolower($matches[1])] = $matches[2];
                }
            }
        }

        return [
            'status' => $status,
            'body' => $body,
            'headers' => $headers,
        ];
    }

    /**
     * Delete a directory recursively
     */
    private function recursiveDelete(string $dir): void
    {
        if (!is_dir($dir)) {
            return;
        }

        $iterator = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS),
            \RecursiveIteratorIterator::CHILD_FIRST
        );

        foreach ($iterator as $file) {
            if ($file->isDir()) {
                @rmdir($file->getPathname());
            } else {
                @unlink($file->getPathname());
            }
        }

        @rmdir($dir);
    }
}

/**
 * Result of a download operation
 */
final class DownloadResult
{
    public function __construct(
        public readonly bool $success,
        public readonly ?string $content,
        public readonly ?string $source,
        public readonly ?string $url,
        public readonly array $errors = []
    ) {}

    public function getErrorMessage(): string
    {
        if (empty($this->errors)) {
            return 'Unknown error';
        }

        $messages = array_map(
            fn($e) => "{$e['source']}: {$e['error']}",
            $this->errors
        );

        return implode('; ', $messages);
    }
}
