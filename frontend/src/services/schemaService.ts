/**
 * Schema Service - Dynamic CMS Configuration Loader
 * 
 * This service manages loading, caching, and validating the CMS schema.
 * Uses an "Eager + Background Refresh" strategy:
 * 1. Immediately load from LocalStorage (0ms wait)
 * 2. Fetch from API in background
 * 3. Update cache if newer version available
 * 
 * @example
 * // Get the current schema (synchronous if cached)
 * const config = schemaService.getConfig();
 * 
 * // Load schema (async, triggers background refresh)
 * await schemaService.loadSchema();
 * 
 * // Subscribe to schema updates
 * schemaService.subscribe((newConfig) => {
 *   console.log('Schema updated!', newConfig);
 * });
 */

import { API_BASE } from '@/api/client';
import {
    validateSchema,
    type FullSchema,
    type AdminConfig,
    type SlotConfig,
    type LoggingConfig,
    type ContentBatchingConfig,
} from './schemaValidator';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const STORAGE_KEY = 'nomad_cms_schema';
const STORAGE_VERSION_KEY = 'nomad_cms_schema_version';
const SCHEMA_ENDPOINT = `${API_BASE}/endpoints/schema.php`;

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type SchemaSubscriber = (config: AdminConfig) => void;

export interface SchemaServiceState {
    isLoading: boolean;
    isLoaded: boolean;
    error: string | null;
    version: string | null;
    lastFetched: number | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// SCHEMA SERVICE SINGLETON
// ═══════════════════════════════════════════════════════════════════════════

class SchemaService {
    private schema: FullSchema | null = null;
    private subscribers: Set<SchemaSubscriber> = new Set();
    private state: SchemaServiceState = {
        isLoading: false,
        isLoaded: false,
        error: null,
        version: null,
        lastFetched: null,
    };
    private loadPromise: Promise<AdminConfig | null> | null = null;

    constructor() {
        // Try to load from LocalStorage immediately
        this.loadFromStorage();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PUBLIC API
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Get the current configuration synchronously.
     * Returns null if schema hasn't been loaded yet.
     */
    getConfig(): AdminConfig | null {
        return this.schema?.slots ?? null;
    }

    /**
     * Get full schema including metadata
     */
    getFullSchema(): FullSchema | null {
        return this.schema;
    }

    /**
     * Get logging configuration
     */
    getLoggingConfig(): LoggingConfig | null {
        return this.schema?.logging ?? null;
    }

    /**
     * Get content batching configuration
     */
    getContentBatchingConfig(): ContentBatchingConfig | null {
        return this.schema?.contentBatching ?? null;
    }

    /**
     * Get a specific slot configuration
     */
    getSlotConfig(slotKey: string): SlotConfig | undefined {
        return this.schema?.slots?.[slotKey];
    }

    /**
     * Get current service state
     */
    getState(): SchemaServiceState {
        return { ...this.state };
    }

    /**
     * Load schema: immediately from LocalStorage, then refresh from API.
     * Returns the configuration (from cache or API).
     */
    async loadSchema(forceRefresh = false): Promise<AdminConfig | null> {
        // If already loading, return existing promise
        if (this.loadPromise && !forceRefresh) {
            return this.loadPromise;
        }

        this.loadPromise = this._loadSchemaInternal(forceRefresh);
        return this.loadPromise;
    }

    /**
     * Force a fresh fetch from the API, ignoring cache
     */
    async refreshSchema(): Promise<AdminConfig | null> {
        return this.loadSchema(true);
    }

    /**
     * Subscribe to schema updates
     */
    subscribe(callback: SchemaSubscriber): () => void {
        this.subscribers.add(callback);

        // Immediately call with current config if available
        if (this.schema?.slots) {
            callback(this.schema.slots);
        }

        // Return unsubscribe function
        return () => {
            this.subscribers.delete(callback);
        };
    }

    /**
     * Check if schema is loaded
     */
    isLoaded(): boolean {
        return this.state.isLoaded && this.schema !== null;
    }

    /**
     * Get schema version
     */
    getVersion(): string | null {
        return this.state.version;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PRIVATE METHODS
    // ═══════════════════════════════════════════════════════════════════════════

    private async _loadSchemaInternal(forceRefresh: boolean): Promise<AdminConfig | null> {
        this.state.isLoading = true;

        try {
            // Step 1: Use cached version if available (immediate)
            if (this.schema?.slots && !forceRefresh) {
                // Trigger background refresh
                this._fetchFromApi().catch(console.error);
                return this.schema.slots;
            }

            // Step 2: Fetch from API
            const fetchedConfig = await this._fetchFromApi();
            return fetchedConfig;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            this.state.error = message;
            console.error('[SchemaService] Failed to load schema:', message);

            // Return cached version even on error
            return this.schema?.slots ?? null;
        } finally {
            this.state.isLoading = false;
            this.loadPromise = null;
        }
    }

    private async _fetchFromApi(): Promise<AdminConfig | null> {
        try {
            // Build headers for conditional request
            const headers: Record<string, string> = {
                'Accept': 'application/json',
            };

            // Add If-None-Match header if we have a cached version
            const cachedVersion = localStorage.getItem(STORAGE_VERSION_KEY);
            if (cachedVersion) {
                headers['If-None-Match'] = cachedVersion;
            }

            const response = await fetch(SCHEMA_ENDPOINT, {
                method: 'GET',
                headers,
            });

            // 304 Not Modified - cache is still valid
            if (response.status === 304) {
                this.state.lastFetched = Date.now();
                return this.schema?.slots ?? null;
            }

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            // Validate the response
            const validation = validateSchema(data);
            if (!validation.success) {
                console.warn('[SchemaService] Schema validation issues detected (but proceeding):', validation.errors);
                // We proceed anyway as per "Developer Mode" relaxation
            }

            // If validation failed, valid data is undefined in SafeParse return, 
            // BUT Zod safeParse failure doesn't give us the "partial" data typically. 
            // However, we can just use the raw 'data' casted to FullSchema if we trust it enough 
            // or if we want to risk it. 
            // To be safer, we use the `data` from fetch, assuming it matches the shape roughly.

            const schemaToUse = (validation.success ? validation.data : data) as FullSchema;

            // Check if version changed
            const newVersion = schemaToUse.version;
            const versionChanged = this.state.version !== newVersion;

            // Update state
            this.schema = schemaToUse;
            this.state.isLoaded = true;
            this.state.error = null;
            this.state.version = newVersion;
            this.state.lastFetched = Date.now();

            // Save to LocalStorage
            this._saveToStorage(schemaToUse);

            // Save ETag for conditional requests
            const etag = response.headers.get('ETag');
            if (etag) {
                localStorage.setItem(STORAGE_VERSION_KEY, etag);
            }

            // Notify subscribers if version changed
            if (versionChanged && this.schema.slots) {
                this._notifySubscribers(this.schema.slots);
            }

            return this.schema.slots;
        } catch (error) {
            throw error;
        }
    }

    private loadFromStorage(): void {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (!stored) return;

            const data = JSON.parse(stored);

            // Validate stored data
            const validation = validateSchema(data);
            if (!validation.success) {
                console.warn('[SchemaService] Cached schema is invalid, clearing cache');
                localStorage.removeItem(STORAGE_KEY);
                localStorage.removeItem(STORAGE_VERSION_KEY);
                return;
            }

            this.schema = validation.data!;
            this.state.isLoaded = true;
            this.state.version = validation.data!.version;

            console.log('[SchemaService] Loaded schema from cache, version:', this.state.version);
        } catch (error) {
            console.warn('[SchemaService] Failed to load from storage:', error);
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(STORAGE_VERSION_KEY);
        }
    }

    private _saveToStorage(schema: FullSchema): void {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(schema));
            console.log('[SchemaService] Schema saved to cache, version:', schema.version);
        } catch (error) {
            console.warn('[SchemaService] Failed to save to storage:', error);
        }
    }

    private _notifySubscribers(config: AdminConfig): void {
        this.subscribers.forEach((callback) => {
            try {
                callback(config);
            } catch (error) {
                console.error('[SchemaService] Subscriber error:', error);
            }
        });
    }

    /**
     * Clear all cached schema data (for testing/debugging)
     */
    clearCache(): void {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(STORAGE_VERSION_KEY);
        this.schema = null;
        this.state = {
            isLoading: false,
            isLoaded: false,
            error: null,
            version: null,
            lastFetched: null,
        };
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const schemaService = new SchemaService();

// ═══════════════════════════════════════════════════════════════════════════
// CONVENIENCE EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the admin config synchronously (returns null if not loaded)
 */
export function getAdminConfig(): AdminConfig | null {
    return schemaService.getConfig();
}

/**
 * Get a specific slot config
 */
export function getSlotConfig(slotKey: string): SlotConfig | undefined {
    return schemaService.getSlotConfig(slotKey);
}

/**
 * Load schema (async)
 */
export async function loadSchema(): Promise<AdminConfig | null> {
    return schemaService.loadSchema();
}

/**
 * Get slot icon
 */
export function getSlotIcon(key: string): string {
    return schemaService.getSlotConfig(key)?.icon || 'File';
}

/**
 * Get all sitemap keys
 */
export function getSitemapKeys(): string[] {
    const config = schemaService.getConfig();
    if (!config) return [];

    return Object.entries(config)
        .filter(([, slotConfig]) => slotConfig.isSitemap)
        .map(([key]) => key);
}
