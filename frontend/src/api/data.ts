/**
 * Data Operations API
 * CRUD operations for slot data + deep search + batch loading
 * 
 * Includes static cache support for public data:
 * - getPublicData(): Fetches from static cache with ETag support
 * - getData(): Direct API call (for admin operations)
 * 
 * Supports both path-based and legacy query param URLs:
 * - Path-based: /api/data/{slot}, /api/static/{slot}
 * - Legacy: /api/endpoints/data.php?key={slot}
 */
import { apiClient } from './client';
import type { ApiResponse, SlotKey, SearchResponse } from './types';
import { CONTENT_BATCHING_CONFIG } from '@/config/admin.config';
import { API_URL_MODE, ApiPaths, LegacyPaths } from '@/config/api-paths.config';

/**
 * Static cache response structure
 */
interface StaticCacheResponse<T> {
    success: boolean;
    data: T;
    cached_at: string;
    slot: string;
}

/**
 * Get static cache URL for a slot
 */
function getStaticUrl(key: string): string {
    if (API_URL_MODE === 'path') {
        return ApiPaths.static(key);
    }
    return LegacyPaths.static(key);
}

/**
 * Fetch data from static cache with ETag support
 * Falls back to API if cache miss or error
 * 
 * @param key - Slot key
 * @returns Cached data or null
 */
export async function getPublicData<T = unknown>(key: string): Promise<T | null> {
    const cacheKey = `nomad_etag_${key}`;
    const dataKey = `nomad_data_${key}`;
    const storedEtag = localStorage.getItem(cacheKey);

    try {
        const headers: HeadersInit = {};
        if (storedEtag) {
            headers['If-None-Match'] = storedEtag;
        }

        const response = await fetch(getStaticUrl(key), {
            headers,
            cache: 'no-cache', // Force revalidation with If-None-Match
        });

        // 304 Not Modified - use cached data from localStorage
        if (response.status === 304) {
            const cached = localStorage.getItem(dataKey);
            if (cached) {
                return JSON.parse(cached) as T;
            }
            // Edge case: 304 but no local cache - fetch fresh from API
            // This can happen if localStorage was cleared manually
            return getData<T>(key);
        }

        // Success - parse and cache
        if (response.ok) {
            const json = await response.json() as StaticCacheResponse<T>;
            const etag = response.headers.get('ETag');

            // Store in localStorage for next request
            // Limit to 500KB per slot to prevent localStorage overflow
            if (etag && json.data !== undefined) {
                try {
                    const dataString = JSON.stringify(json.data);
                    const MAX_CACHE_SIZE = 500 * 1024; // 500KB

                    if (dataString.length <= MAX_CACHE_SIZE) {
                        localStorage.setItem(cacheKey, etag);
                        localStorage.setItem(dataKey, dataString);
                    } else {
                        console.warn(`[PublicData] Slot "${key}" too large for localStorage cache (${Math.round(dataString.length / 1024)}KB)`);
                    }
                } catch (e) {
                    // localStorage full - clear old cache entries and retry
                    console.warn('[PublicData] localStorage full, clearing old cache');
                    clearPublicDataCache();
                    try {
                        localStorage.setItem(cacheKey, etag);
                        localStorage.setItem(dataKey, JSON.stringify(json.data));
                    } catch {
                        // Still full, give up silently
                    }
                }
            }

            return json.data ?? null;
        }

        // 404 - not in cache, try API
        if (response.status === 404) {
            return getData<T>(key);
        }
    } catch (error) {
        console.warn('[PublicData] Static cache fetch failed, falling back to API:', error);
    }

    // Fallback to direct API
    return getData<T>(key);
}

/**
 * Clear public data cache for a specific key or all keys
 * @param key - Optional slot key (clears all if not provided)
 */
export function clearPublicDataCache(key?: string): void {
    if (key) {
        localStorage.removeItem(`nomad_etag_${key}`);
        localStorage.removeItem(`nomad_data_${key}`);
    } else {
        // Clear all nomad cache entries
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const storageKey = localStorage.key(i);
            if (storageKey?.startsWith('nomad_etag_') || storageKey?.startsWith('nomad_data_')) {
                keysToRemove.push(storageKey);
            }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
    }
}

/**
 * Batch response type from backend
 */
interface BatchContentResponse {
    success: boolean;
    data: Record<string, unknown>;
    count?: number;
    error?: string;
}

/**
 * Fetch data from a slot by key
 */
export async function getData<T = unknown>(key: string): Promise<T | null> {
    try {
        const response = await apiClient.get<ApiResponse<T>>('/endpoints/data.php', {
            params: { key },
        });

        if (response.data.success && response.data.exists) {
            return response.data.data ?? null;
        }

        return null;
    } catch (error) {
        console.error(`Error fetching data for key "${key}":`, error);
        throw error;
    }
}

/**
 * Response type when fetching with version info
 */
export interface DataWithLockInfo<T = unknown> {
    data: T | null;
    version: number;
    hash: string;
}

/**
 * Fetch data from a slot WITH version + hash for optimistic locking
 * 
 * ENTERPRISE OPTIMISTIC LOCKING:
 * Returns hash (SHA-256) and version for use in saveData
 * - hash: TRUE content identity (recommended for locking)
 * - version: Sequential number (simpler but less robust)
 */
export async function getDataWithLockInfo<T = unknown>(key: string): Promise<DataWithLockInfo<T>> {
    try {
        const response = await apiClient.get<ApiResponse<T> & { version: number; hash: string }>('/endpoints/data.php', {
            params: { key, with_version: 'true' },
        });

        return {
            data: response.data.exists ? (response.data.data ?? null) : null,
            version: response.data.version ?? 0,
            hash: response.data.hash ?? '',
        };
    } catch (error) {
        console.error(`Error fetching data with lock info for key "${key}":`, error);
        throw error;
    }
}

/**
 * Save response with new version and hash
 */
export interface SaveResult {
    success: boolean;
    version?: number;
    hash?: string;
    error?: string;
    lockType?: 'hash' | 'version';
    currentVersion?: number;
    currentHash?: string;
}

/**
 * Precomputed version data from WASM (for server offload)
 */
export interface PrecomputedVersionData {
    content_hash: string;
    diff_forward_b64: string;
    diff_size: number;
    change_summary: string;
    is_compressed: boolean;
}

/**
 * Conflict error thrown when optimistic lock fails
 */
export class ConflictError extends Error {
    constructor(
        message: string,
        public readonly lockType: 'hash' | 'version',
        public readonly currentVersion?: number,
        public readonly currentHash?: string
    ) {
        super(message);
        this.name = 'ConflictError';
    }
}

/**
 * Save data to a slot with ENTERPRISE OPTIMISTIC LOCKING
 * 
 * @param key - Slot key
 * @param data - Data to save
 * @param slotType - Optional slot type (object, list, collection, massive) for webhook filtering
 * @param createVersion - Force version creation (useful for object types which skip auto-versioning)
 * @param expectedHash - SHA-256 hash for optimistic locking (RECOMMENDED)
 * @param expectedVersion - Version number for optimistic locking (fallback)
 * @param precomputedVersion - Precomputed version data from WASM (offloads server)
 * @returns SaveResult with new version and hash for next save
 * @throws ConflictError when content was modified by another user
 */
export async function saveData<T = unknown>(
    key: string, 
    data: T, 
    slotType?: string,
    createVersion?: boolean,
    expectedHash?: string,
    expectedVersion?: number,
    precomputedVersion?: PrecomputedVersionData
): Promise<SaveResult> {
    try {
        const payload: Record<string, unknown> = {
            key,
            data,
            slot_type: slotType,
            create_version: createVersion,
            expected_hash: expectedHash,
            expected_version: expectedVersion,
        };
        
        // Add precomputed version data if available (WASM optimization)
        if (precomputedVersion) {
            payload.precomputed_version = precomputedVersion;
        }
        
        const response = await apiClient.post<ApiResponse<null> & { version?: number; hash?: string }>('/endpoints/data.php', payload);

        return {
            success: response.data.success,
            version: response.data.version,
            hash: response.data.hash,
        };
    } catch (error: any) {
        // Check if it's a 409 Conflict response
        if (error?.response?.status === 409) {
            const conflictData = error.response.data;
            throw new ConflictError(
                conflictData.message || 'Content was modified by another user',
                conflictData.lock_type || 'version',
                conflictData.current_version,
                conflictData.current_hash
            );
        }
        console.error(`Error saving data for key "${key}":`, error);
        throw error;
    }
}

/**
 * Delete a slot
 */
export async function deleteData(key: string): Promise<boolean> {
    try {
        const response = await apiClient.delete<ApiResponse<null>>('/endpoints/data.php', {
            params: { key },
        });

        return response.data.success;
    } catch (error) {
        console.error(`Error deleting data for key "${key}":`, error);
        throw error;
    }
}

/**
 * Get all slot keys (admin only)
 */
export async function getAllKeys(): Promise<SlotKey[]> {
    try {
        const response = await apiClient.get<ApiResponse<null> & { keys: SlotKey[] }>('/endpoints/data.php', {
            params: { key: '__all_keys__' },
        });

        return response.data.keys || [];
    } catch (error) {
        console.error('Error fetching all keys:', error);
        throw error;
    }
}

/**
 * Deep search across all content slots
 * @param query - Search query (min 2 characters)
 * @param options - Optional search parameters
 */
export async function deepSearch(
    query: string,
    options?: {
        slot?: string;      // Limit to specific slot
        limit?: number;     // Max results (default 20, max 100)
        offset?: number;    // Pagination offset
    }
): Promise<SearchResponse> {
    try {
        const response = await apiClient.get<SearchResponse>('/endpoints/search.php', {
            params: {
                q: query,
                slot: options?.slot,
                limit: options?.limit || 20,
                offset: options?.offset || 0,
            },
        });

        return response.data;
    } catch (error) {
        console.error('Error performing deep search:', error);
        return {
            success: false,
            query,
            results: [],
            total: 0,
            limit: options?.limit || 20,
            offset: options?.offset || 0,
            hasMore: false,
            error: 'Search failed'
        };
    }
}

/**
 * Fetch multiple slots in a single batch request
 * Falls back to individual requests if batching is disabled
 * 
 * @param keys - Array of slot keys to fetch
 * @returns Object with key-value pairs for each slot
 */
export async function getBatchData<T = unknown>(keys: string[]): Promise<Record<string, T | null>> {
    // Empty array check
    if (keys.length === 0) {
        return {};
    }

    // If batching is disabled, fall back to individual requests
    if (!CONTENT_BATCHING_CONFIG.enabled) {
        const results: Record<string, T | null> = {};
        const promises = keys.map(key => getData<T>(key).catch(() => null));
        const data = await Promise.all(promises);

        keys.forEach((key, index) => {
            results[key] = data[index];
        });

        return results;
    }

    try {
        // Split into chunks if exceeding max batch size
        const { maxKeysPerBatch, timeoutMs } = CONTENT_BATCHING_CONFIG;
        const results: Record<string, T | null> = {};

        // Process in chunks
        for (let i = 0; i < keys.length; i += maxKeysPerBatch) {
            const chunk = keys.slice(i, i + maxKeysPerBatch);

            const response = await apiClient.post<BatchContentResponse>(
                '/endpoints/batch-content.php',
                { keys: chunk },
                { timeout: timeoutMs }
            );

            if (response.data.success && response.data.data) {
                // Merge chunk results
                Object.entries(response.data.data).forEach(([key, value]) => {
                    results[key] = value as T | null;
                });
            }
        }

        // Ensure all requested keys have an entry (null if not found)
        keys.forEach(key => {
            if (!(key in results)) {
                results[key] = null;
            }
        });

        return results;

    } catch (error) {
        console.error('Batch content fetch failed, falling back to individual requests:', error);

        // Fallback: fetch individually on batch failure
        const results: Record<string, T | null> = {};
        const promises = keys.map(key => getData<T>(key).catch(() => null));
        const data = await Promise.all(promises);

        keys.forEach((key, index) => {
            results[key] = data[index];
        });

        return results;
    }
}
