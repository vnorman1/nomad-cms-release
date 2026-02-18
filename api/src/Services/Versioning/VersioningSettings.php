<?php
/**
 * NOMAD CMS - Versioning Settings Service
 * 
 * Manages versioning configuration settings.
 * Extracted from VersioningService for modularity.
 */

declare(strict_types=1);

namespace NomadCMS\Services\Versioning;

use PDO;

class VersioningSettings
{
    /** Configuration keys */
    public const CONFIG_ENABLED_KEY = 'versioning.enabled';
    public const CONFIG_MAX_VERSIONS_KEY = 'versioning.maxVersions';
    public const CONFIG_RETENTION_DAYS_KEY = 'versioning.retentionDays';
    
    /** Default values */
    public const DEFAULT_MAX_VERSIONS = 50;
    public const DEFAULT_RETENTION_DAYS = 90;
    
    private PDO $db;
    private ?array $cache = null;
    
    public function __construct(PDO $db)
    {
        $this->db = $db;
    }
    
    /**
     * Initialize default versioning settings
     */
    public function initializeDefaults(): void
    {
        $defaults = [
            self::CONFIG_ENABLED_KEY => 'true',
            self::CONFIG_MAX_VERSIONS_KEY => (string) self::DEFAULT_MAX_VERSIONS,
            self::CONFIG_RETENTION_DAYS_KEY => (string) self::DEFAULT_RETENTION_DAYS,
        ];
        
        $stmt = $this->db->prepare("
            INSERT OR IGNORE INTO versioning_settings (key, value) VALUES (?, ?)
        ");
        
        foreach ($defaults as $key => $value) {
            $stmt->execute([$key, $value]);
        }
    }
    
    /**
     * Check if versioning is enabled
     */
    public function isEnabled(): bool
    {
        return $this->get(self::CONFIG_ENABLED_KEY) === 'true';
    }
    
    /**
     * Get a versioning setting
     */
    public function get(string $key): ?string
    {
        if ($this->cache === null) {
            $this->loadCache();
        }
        return $this->cache[$key] ?? null;
    }
    
    /**
     * Set a versioning setting
     */
    public function set(string $key, string $value): bool
    {
        $stmt = $this->db->prepare("
            INSERT OR REPLACE INTO versioning_settings (key, value, updated_at)
            VALUES (?, ?, datetime('now'))
        ");
        $result = $stmt->execute([$key, $value]);
        
        // Invalidate cache
        $this->cache = null;
        
        return $result;
    }
    
    /**
     * Get all versioning settings
     */
    public function getAll(): array
    {
        if ($this->cache === null) {
            $this->loadCache();
        }
        return $this->cache;
    }
    
    /**
     * Load settings into cache
     */
    private function loadCache(): void
    {
        $stmt = $this->db->query("SELECT key, value FROM versioning_settings");
        $this->cache = [];
        while ($row = $stmt->fetch()) {
            $this->cache[$row['key']] = $row['value'];
        }
    }
    
    /**
     * Get max versions setting
     */
    public function getMaxVersions(): int
    {
        return (int) ($this->get(self::CONFIG_MAX_VERSIONS_KEY) ?? self::DEFAULT_MAX_VERSIONS);
    }
    
    /**
     * Get retention days setting
     */
    public function getRetentionDays(): int
    {
        return (int) ($this->get(self::CONFIG_RETENTION_DAYS_KEY) ?? self::DEFAULT_RETENTION_DAYS);
    }
}
