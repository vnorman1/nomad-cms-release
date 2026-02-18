<?php
/**
 * NOMAD CMS - Cache Settings Service
 * Database-backed settings for static cache configuration
 * 
 * Follows the same pattern as VersioningService for consistency.
 * Settings are persisted in cache_settings table, with .env fallback.
 * 
 * @see StaticCacheService for cache generation logic
 */

declare(strict_types=1);

namespace NomadCMS\Services;

use NomadCMS\Database\ContentDatabase;
use PDO;

final class CacheSettingsService
{
    /**
     * Configuration keys
     */
    private const CONFIG_ENABLED_KEY = 'cache.enabled';
    private const CONFIG_MAX_SIZE_KEY = 'cache.maxSize';
    private const CONFIG_BUNDLE_MAX_SLOT_SIZE_KEY = 'cache.bundleMaxSlotSize';
    private const CONFIG_BUNDLE_MAX_TOTAL_SIZE_KEY = 'cache.bundleMaxTotalSize';
    private const CONFIG_DEBOUNCE_SECONDS_KEY = 'cache.debounceSeconds';
    private const CONFIG_GENERATE_BUNDLE_KEY = 'cache.generateBundle';
    private const CONFIG_GENERATE_SLOT_FILES_KEY = 'cache.generateSlotFiles';
    
    /**
     * Default values
     */
    private const DEFAULT_MAX_SIZE = 2 * 1024 * 1024; // 2MB
    private const DEFAULT_BUNDLE_MAX_SLOT_SIZE = 10 * 1024; // 10KB (increased for scaling)
    private const DEFAULT_BUNDLE_MAX_TOTAL_SIZE = 200 * 1024; // 200KB (increased for scaling)
    private const DEFAULT_DEBOUNCE_SECONDS = 2.0;
    
    /**
     * Singleton instance
     */
    private static ?self $instance = null;
    
    /**
     * Database instance
     */
    private PDO $db;
    
    /**
     * Settings cache
     */
    private ?array $settingsCache = null;
    
    /**
     * Private constructor for singleton
     */
    private function __construct()
    {
        $this->db = ContentDatabase::getInstance();
        $this->initializeSchema();
    }
    
    /**
     * Get singleton instance
     */
    public static function getInstance(): self
    {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    /**
     * Initialize cache settings schema
     */
    private function initializeSchema(): void
    {
        // Create cache_settings table
        $this->db->exec("
            CREATE TABLE IF NOT EXISTS cache_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT DEFAULT (datetime('now'))
            )
        ");
        
        // Insert default settings if not exists
        $this->initializeDefaultSettings();
    }
    
    /**
     * Initialize default cache settings
     */
    private function initializeDefaultSettings(): void
    {
        $defaults = [
            self::CONFIG_ENABLED_KEY => 'true',
            self::CONFIG_MAX_SIZE_KEY => (string) self::DEFAULT_MAX_SIZE,
            self::CONFIG_BUNDLE_MAX_SLOT_SIZE_KEY => (string) self::DEFAULT_BUNDLE_MAX_SLOT_SIZE,
            self::CONFIG_BUNDLE_MAX_TOTAL_SIZE_KEY => (string) self::DEFAULT_BUNDLE_MAX_TOTAL_SIZE,
            self::CONFIG_DEBOUNCE_SECONDS_KEY => (string) self::DEFAULT_DEBOUNCE_SECONDS,
            self::CONFIG_GENERATE_BUNDLE_KEY => 'true',
            self::CONFIG_GENERATE_SLOT_FILES_KEY => 'true',
        ];
        
        $stmt = $this->db->prepare("
            INSERT OR IGNORE INTO cache_settings (key, value) VALUES (?, ?)
        ");
        
        foreach ($defaults as $key => $value) {
            $stmt->execute([$key, $value]);
        }
    }
    
    /**
     * Check if static cache is enabled
     * Priority: DB setting > .env > default true
     */
    public function isEnabled(): bool
    {
        $dbSetting = $this->getSetting(self::CONFIG_ENABLED_KEY);
        
        if ($dbSetting !== null) {
            return $dbSetting === 'true';
        }
        
        // Fallback to .env
        return ($_ENV['STATIC_CACHE_ENABLED'] ?? 'true') === 'true';
    }
    
    /**
     * Get max cache file size
     */
    public function getMaxSize(): int
    {
        $dbSetting = $this->getSetting(self::CONFIG_MAX_SIZE_KEY);
        
        if ($dbSetting !== null) {
            return (int) $dbSetting;
        }
        
        // Fallback to .env
        return (int) ($_ENV['STATIC_CACHE_MAX_SIZE'] ?? self::DEFAULT_MAX_SIZE);
    }
    
    /**
     * Get maximum slot size for bundle inclusion
     */
    public function getBundleMaxSlotSize(): int
    {
        $dbSetting = $this->getSetting(self::CONFIG_BUNDLE_MAX_SLOT_SIZE_KEY);
        return $dbSetting !== null ? (int) $dbSetting : self::DEFAULT_BUNDLE_MAX_SLOT_SIZE;
    }
    
    /**
     * Get maximum total bundle size
     */
    public function getBundleMaxTotalSize(): int
    {
        $dbSetting = $this->getSetting(self::CONFIG_BUNDLE_MAX_TOTAL_SIZE_KEY);
        return $dbSetting !== null ? (int) $dbSetting : self::DEFAULT_BUNDLE_MAX_TOTAL_SIZE;
    }
    
    /**
     * Get debounce seconds for meta regeneration
     */
    public function getDebounceSeconds(): float
    {
        $dbSetting = $this->getSetting(self::CONFIG_DEBOUNCE_SECONDS_KEY);
        return $dbSetting !== null ? (float) $dbSetting : self::DEFAULT_DEBOUNCE_SECONDS;
    }
    
    /**
     * Check if bundle generation is enabled
     */
    public function isGenerateBundleEnabled(): bool
    {
        $dbSetting = $this->getSetting(self::CONFIG_GENERATE_BUNDLE_KEY);
        return $dbSetting !== 'false';
    }
    
    /**
     * Check if individual slot file generation is enabled
     */
    public function isGenerateSlotFilesEnabled(): bool
    {
        $dbSetting = $this->getSetting(self::CONFIG_GENERATE_SLOT_FILES_KEY);
        return $dbSetting !== 'false';
    }
    
    /**
     * Get a setting value
     */
    public function getSetting(string $key): ?string
    {
        if ($this->settingsCache === null) {
            $this->loadSettingsCache();
        }
        return $this->settingsCache[$key] ?? null;
    }
    
    /**
     * Set a setting value
     */
    public function setSetting(string $key, string $value): bool
    {
        $stmt = $this->db->prepare("
            INSERT OR REPLACE INTO cache_settings (key, value, updated_at)
            VALUES (?, ?, datetime('now'))
        ");
        $result = $stmt->execute([$key, $value]);
        
        // Invalidate cache
        $this->settingsCache = null;
        
        return $result;
    }
    
    /**
     * Get all settings
     */
    public function getAllSettings(): array
    {
        if ($this->settingsCache === null) {
            $this->loadSettingsCache();
        }
        return $this->settingsCache;
    }
    
    /**
     * Load settings into cache
     */
    private function loadSettingsCache(): void
    {
        $stmt = $this->db->query("SELECT key, value FROM cache_settings");
        $this->settingsCache = [];
        while ($row = $stmt->fetch()) {
            $this->settingsCache[$row['key']] = $row['value'];
        }
    }
    
    /**
     * Reset singleton (for testing)
     */
    public static function resetInstance(): void
    {
        self::$instance = null;
    }
}
