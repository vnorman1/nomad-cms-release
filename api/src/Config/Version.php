<?php
/**
 * NOMAD CMS - Version Configuration
 * Centralized version information for the CMS
 * 
 * This is the SINGLE SOURCE OF TRUTH for the CMS version number.
 * All UI components should fetch this from the API.
 */

declare(strict_types=1);

namespace NomadCMS\Config;

final class Version
{
    // Current CMS Version - INCREMENT THIS FOR NEW RELEASES
    public const VERSION = '1.0.1';
    
    // Build information
    public const BUILD_DATE = '2026-02-18';
    public const CODENAME = 'Genesis Patch 1';
    
    // Minimum requirements
    public const MIN_PHP_VERSION = '8.2.0';
    public const MIN_NODE_VERSION = '18.0.0';
    
    // Update sources
    public const GITHUB_OWNER = 'vnorman1';
    public const GITHUB_REPO = 'nomad-cms-release';
    
    // CDN fallback URLs
    public const CDN_JSDELIVR = 'https://cdn.jsdelivr.net/gh/' . self::GITHUB_OWNER . '/' . self::GITHUB_REPO . '@';
    public const CDN_GITHUB_RAW = 'https://raw.githubusercontent.com/' . self::GITHUB_OWNER . '/' . self::GITHUB_REPO . '/';
    
    // Security settings
    public const GPG_PUBLIC_KEY_PATH = 'keys/update-signing.pub';
    
    // Audit log path
    public const AUDIT_LOG_PATH = 'storage/logs/updates.log';
    
    /**
     * Check if GPG signature is required for updates
     * Default: true in production, configurable via env
     */
    public static function requireGPGSignature(): bool
    {
        return ($_ENV['UPDATE_REQUIRE_GPG_SIGNATURE'] ?? 'true') === 'true';
    }
    
    /**
     * Get the GPG public key path
     */
    public static function getGPGPublicKeyPath(): string
    {
        $path = $_ENV['UPDATE_GPG_PUBLIC_KEY'] ?? self::GPG_PUBLIC_KEY_PATH;
        return __DIR__ . '/../../' . $path;
    }
    
    /**
     * Get audit log file path
     */
    public static function getAuditLogPath(): string
    {
        $path = $_ENV['UPDATE_AUDIT_LOG'] ?? self::AUDIT_LOG_PATH;
        return __DIR__ . '/../../' . $path;
    }
    
    /**
     * Get full version information
     */
    public static function getInfo(): array
    {
        return [
            'version' => self::VERSION,
            'buildDate' => self::BUILD_DATE,
            'codename' => self::CODENAME,
            'php' => PHP_VERSION,
            'requirements' => [
                'php' => self::MIN_PHP_VERSION,
                'node' => self::MIN_NODE_VERSION,
            ],
        ];
    }
    
    /**
     * Get version as semver parts
     */
    public static function getParts(): array
    {
        $parts = explode('.', self::VERSION);
        return [
            'major' => (int) ($parts[0] ?? 0),
            'minor' => (int) ($parts[1] ?? 0),
            'patch' => (int) ($parts[2] ?? 0),
        ];
    }
    
    /**
     * Compare version with another (returns -1, 0, or 1)
     */
    public static function compare(string $other): int
    {
        return version_compare(self::VERSION, $other);
    }
    
    /**
     * Check if current version is older than given version
     */
    public static function isOlderThan(string $version): bool
    {
        return self::compare($version) < 0;
    }
    
    /**
     * Get GitHub release URL for a version
     */
    public static function getReleaseUrl(string $version): string
    {
        return sprintf(
            'https://github.com/%s/%s/releases/tag/v%s',
            self::GITHUB_OWNER,
            self::GITHUB_REPO,
            $version
        );
    }
    
    /**
     * Get manifest URL for a version (primary: GitHub, fallback: jsDelivr)
     */
    public static function getManifestUrls(string $version): array
    {
        $tag = "v{$version}";
        return [
            'github' => sprintf(
                'https://github.com/%s/%s/releases/download/%s/manifest.json',
                self::GITHUB_OWNER,
                self::GITHUB_REPO,
                $tag
            ),
            'jsdelivr' => self::CDN_JSDELIVR . $tag . '/manifest.json',
            'raw' => self::CDN_GITHUB_RAW . $tag . '/manifest.json',
        ];
    }
}
