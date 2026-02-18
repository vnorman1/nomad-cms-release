/**
 * Versioning Service - Content Version History Management
 * 
 * Enterprise-grade Git-like version history with WASM-based diff engine.
 * 
 * Features:
 * - Lazy loading of version history
 * - WASM-accelerated diff computation
 * - Optimistic locking for race condition prevention
 * - Automatic compression detection
 * 
 * @example
 * // Initialize and compute diff
 * await versioningService.initialize();
 * const diff = await versioningService.computeDiff(oldContent, newContent);
 * 
 * // Get version history
 * const history = await versioningService.getVersionHistory('slot_key');
 * 
 * // Restore to specific version
 * const restored = await versioningService.restoreToVersion('slot_key', 5, currentContent);
 */

import { API_BASE } from '@/api/client';
import { secureTokenStorage } from '@/utils/secureTokenStorage';

/**
 * Get auth headers for fetch requests
 * @security Uses async token retrieval for XSS-protected storage
 */
async function getAuthHeaders(): Promise<HeadersInit> {
    const token = await secureTokenStorage.getAccessToken();
    const headers: HeadersInit = {
        'Content-Type': 'application/json',
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
}

// ═══════════════════════════════════════════════════════════════════════════
// JSON NORMALIZATION (matches backend VersionCreator::normalizeJson)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Recursively sort object keys for consistent JSON serialization.
 * CRITICAL: Must match backend's VersionCreator::normalizeJson() exactly.
 * Without this, hashes computed on frontend won't match backend.
 */
function sortRecursive(data: unknown): unknown {
    if (data === null || data === undefined) return data;

    if (Array.isArray(data)) {
        return data.map(item => sortRecursive(item));
    }

    if (typeof data === 'object') {
        const sorted: Record<string, unknown> = {};
        const keys = Object.keys(data as Record<string, unknown>).sort();
        for (const key of keys) {
            sorted[key] = sortRecursive((data as Record<string, unknown>)[key]);
        }
        return sorted;
    }

    return data;
}

/**
 * Normalize JSON for consistent comparison.
 * Matches backend VersionCreator::normalizeJson().
 */
function normalizeJson(content: unknown): string {
    const normalized = sortRecursive(content);
    return JSON.stringify(normalized);
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface DiffResult {
    success: boolean;
    diff_forward: unknown;
    diff_backward: unknown;
    diff_size: number;
    content_hash: string;
    change_summary: string;
    search_tokens: string;  // Tokenized keywords for search indexing
    operation_id?: bigint;
    error?: string;
}

export interface PatchResult {
    success: boolean;
    data: unknown;
    hash: string;
    operation_id?: bigint;
    error?: string;
}

export interface SmartCompressResult {
    success: boolean;
    data: Uint8Array;
    is_compressed: boolean;
    original_size: number;
    final_size: number;
    compression_ratio: number;
    bytes_saved: number;
    error?: string;
}

export interface VersionMetadata {
    id: number;
    version_number: number;
    diff_size: number;
    is_compressed: number;
    snapshot_hash: string;
    content_size: number;
    change_summary: string;
    changed_by: string | null;
    changed_at: string;
    // Hybrid versioning fields
    version_type: 'shadow' | 'commit' | 'named' | null;
    version_name: string | null;
    expires_at: string | null;
    ttl_seconds: number | null;
}

export interface VersionDetail extends VersionMetadata {
    diff_forward_json: string;
    diff_backward_json: string;
    hmac_signature: string;
}

export interface VersionHistoryResponse {
    success: boolean;
    slot_key: string;
    versions: VersionMetadata[];
    total_count: number;
    limit: number;
    offset: number;
    include_shadows?: boolean;
}

export interface VersioningSettings {
    'versioning.enabled': string;
    'versioning.maxVersions': string;
    'versioning.retentionDays': string;
}

export interface StorageStats {
    total_versions: number;
    slots_with_versions: number;
    total_diff_size: number;
    total_compressed_size: number;
    avg_content_size: number;
    // Hybrid versioning stats
    shadow_count: number;
    commit_count: number;
    named_count: number;
    expired_shadow_count: number;
    oldest_shadow_expires: string | null;
    cleanup_estimate_bytes: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// WASM MODULE TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface WasmModule {
    compute_diff: (oldJson: string, newJson: string) => DiffResult;
    apply_patch: (baseJson: string, patchJson: string) => PatchResult;
    hash_content: (content: string) => string;
    verify_hash: (content: string, expectedHash: string) => boolean;
    json_equals: (jsonA: string, jsonB: string) => boolean;
    get_minified_size: (json: string) => number;
    compress_diff: (json: string) => Uint8Array;
    decompress_diff: (data: Uint8Array) => string;
    smart_compress_auto: (json: string) => SmartCompressResult;
    decompress_smart: (data: Uint8Array, isCompressed: boolean) => string;
    // Tokenization (for search)
    tokenize_content: (content: string) => string;
    tokenize_json: (jsonStr: string) => string;
    tokenize_to_array: (content: string) => string[];
    // Race condition prevention
    acquire_lock: () => boolean;
    release_lock: () => void;
    is_locked: () => boolean;
    get_operation_id: () => bigint;
    next_operation_id: () => bigint;
    validate_operation_id: (expectedId: bigint) => boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const VERSIONS_ENDPOINT = `${API_BASE}/endpoints/versions.php`;

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE STATE
// ═══════════════════════════════════════════════════════════════════════════

let wasmModule: WasmModule | null = null;
let isInitializing = false;
let initPromise: Promise<boolean> | null = null;
let settingsCache: VersioningSettings | null = null;

// ═══════════════════════════════════════════════════════════════════════════
// WASM INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Initialize the WASM module
 * Returns true if successful, false if fallback to JS mode
 */
async function initializeWasm(): Promise<boolean> {
    if (wasmModule) return true;
    if (isInitializing && initPromise) return initPromise;

    isInitializing = true;

    initPromise = (async () => {
        try {
            // Dynamically import the WASM module
            const wasmImport = await import('@/wasm-lib/nomad-versioning/nomad_versioning.js');

            // Initialize WASM
            await wasmImport.default();

            // Store module reference
            wasmModule = wasmImport as unknown as WasmModule;

            console.log('[VersioningService] WASM module loaded successfully');
            return true;
        } catch (error) {
            console.warn('[VersioningService] WASM load failed, using JS fallback:', error);
            return false;
        } finally {
            isInitializing = false;
        }
    })();

    return initPromise;
}

// ═══════════════════════════════════════════════════════════════════════════
// DIFF COMPUTATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compute diff between two content values
 * Uses WASM if available, falls back to API
 * 
 * CRITICAL: Uses normalized JSON (sorted keys) to ensure consistent hashes with backend
 */
async function computeDiff(
    oldContent: unknown,
    newContent: unknown
): Promise<DiffResult> {
    // Use normalized JSON for consistent hashes across frontend/backend
    const oldJson = normalizeJson(oldContent);
    const newJson = normalizeJson(newContent);

    // Skip if identical
    if (oldJson === newJson) {
        return {
            success: true,
            diff_forward: [],
            diff_backward: [],
            diff_size: 0,
            content_hash: await hashContent(newJson),
            change_summary: 'No changes',
            search_tokens: ''
        };
    }

    // Try WASM first
    if (wasmModule) {
        try {
            return wasmModule.compute_diff(oldJson, newJson);
        } catch (error) {
            console.warn('[VersioningService] WASM diff failed, using fallback:', error);
        }
    }

    // Fallback: compute simple diff in JS
    return computeDiffJS(oldJson, newJson);
}

/**
 * JavaScript fallback for diff computation
 */
function computeDiffJS(oldJson: string, newJson: string): DiffResult {
    const old = JSON.parse(oldJson);
    const newVal = JSON.parse(newJson);

    const diff = jsonDiff(old, newVal, '');
    const backDiff = jsonDiff(newVal, old, '');

    const diffStr = JSON.stringify(diff);

    // Simple hash (not cryptographically secure, use WASM for production)
    const hash = simpleHash(newJson);

    const summary = generateChangeSummary(diff);

    return {
        success: true,
        diff_forward: diff,
        diff_backward: backDiff,
        diff_size: diffStr.length,
        content_hash: hash,
        change_summary: summary,
        search_tokens: newJson.toLowerCase().slice(0, 500)  // Fallback: first 500 chars
    };
}

/**
 * Simple JSON diff (RFC 6902 format)
 */
function jsonDiff(from: unknown, to: unknown, path: string): Array<{ op: string; path: string; value?: unknown }> {
    const diff: Array<{ op: string; path: string; value?: unknown }> = [];

    if (typeof from !== typeof to) {
        diff.push({ op: 'replace', path: path || '/', value: to });
        return diff;
    }

    if (Array.isArray(from) && Array.isArray(to)) {
        // Handle arrays
        const maxLen = Math.max(from.length, to.length);
        for (let i = 0; i < maxLen; i++) {
            const newPath = `${path}/${i}`;
            if (i >= from.length) {
                diff.push({ op: 'add', path: newPath, value: to[i] });
            } else if (i >= to.length) {
                diff.push({ op: 'remove', path: newPath });
            } else if (JSON.stringify(from[i]) !== JSON.stringify(to[i])) {
                diff.push(...jsonDiff(from[i], to[i], newPath));
            }
        }
    } else if (typeof from === 'object' && from !== null && typeof to === 'object' && to !== null) {
        // Handle objects
        const fromObj = from as Record<string, unknown>;
        const toObj = to as Record<string, unknown>;

        const allKeys = new Set([...Object.keys(fromObj), ...Object.keys(toObj)]);

        for (const key of allKeys) {
            const newPath = `${path}/${escapeJsonPointer(key)}`;

            if (!(key in fromObj)) {
                diff.push({ op: 'add', path: newPath, value: toObj[key] });
            } else if (!(key in toObj)) {
                diff.push({ op: 'remove', path: newPath });
            } else if (JSON.stringify(fromObj[key]) !== JSON.stringify(toObj[key])) {
                diff.push(...jsonDiff(fromObj[key], toObj[key], newPath));
            }
        }
    } else if (from !== to) {
        diff.push({ op: 'replace', path: path || '/', value: to });
    }

    return diff;
}

function escapeJsonPointer(str: string): string {
    return str.replace(/~/g, '~0').replace(/\//g, '~1');
}

function generateChangeSummary(diff: Array<{ op: string; path: string; value?: unknown }>): string {
    let adds = 0, removes = 0, replaces = 0;

    for (const op of diff) {
        if (op.op === 'add') adds++;
        else if (op.op === 'remove') removes++;
        else if (op.op === 'replace') replaces++;
    }

    const parts: string[] = [];
    if (adds > 0) parts.push(`+${adds} added`);
    if (removes > 0) parts.push(`-${removes} removed`);
    if (replaces > 0) parts.push(`~${replaces} modified`);

    return parts.length > 0 ? parts.join(', ') : 'No changes';
}

function simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(16, '0');
}

// ═══════════════════════════════════════════════════════════════════════════
// HASH FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate SHA-256 hash of content
 */
async function hashContent(content: string): Promise<string> {
    if (wasmModule) {
        try {
            return wasmModule.hash_content(content);
        } catch {
            // Fallback
        }
    }

    // Use Web Crypto API
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verify content hash
 */
async function verifyHash(content: string, expectedHash: string): Promise<boolean> {
    if (wasmModule) {
        try {
            return wasmModule.verify_hash(content, expectedHash);
        } catch {
            // Fallback
        }
    }

    const computed = await hashContent(content);
    return computed === expectedHash;
}

// ═══════════════════════════════════════════════════════════════════════════
// API FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get version history for a slot (lazy loaded metadata)
 * @param includeShadows Include shadow versions (default: false)
 */
async function getVersionHistory(
    slotKey: string,
    limit = 20,
    offset = 0,
    includeShadows = false
): Promise<VersionHistoryResponse> {
    const params = new URLSearchParams({
        action: 'history',
        slot_key: slotKey,
        limit: String(limit),
        offset: String(offset),
        include_shadows: String(includeShadows)
    });
    const url = `${VERSIONS_ENDPOINT}?${params}`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: await getAuthHeaders()
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const text = await response.text();
        if (!text || text.trim() === '') {
            throw new Error('Empty response from server');
        }

        try {
            return JSON.parse(text);
        } catch (parseError) {
            console.error('[versioningService] JSON parse error:', parseError, 'Response text:', text.substring(0, 200));
            throw new Error('Invalid JSON response from server');
        }
    } catch (error) {
        console.error('[versioningService] getVersionHistory error:', error);
        throw error;
    }
}

/**
 * Get specific version with diff data
 */
async function getVersion(
    slotKey: string,
    versionNumber: number
): Promise<{ success: boolean; version: VersionDetail } | { success: false; error: string }> {
    const params = new URLSearchParams({
        action: 'version',
        slot_key: slotKey,
        version: String(versionNumber)
    });
    const url = `${VERSIONS_ENDPOINT}?${params}`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: await getAuthHeaders()
        });

        if (!response.ok) {
            return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
        }

        const text = await response.text();
        if (!text || text.trim() === '') {
            return { success: false, error: 'Empty response from server' };
        }

        try {
            return JSON.parse(text);
        } catch (parseError) {
            console.error('[versioningService] JSON parse error:', parseError, 'Response text:', text.substring(0, 200));
            return { success: false, error: 'Invalid JSON response from server' };
        }
    } catch (networkError) {
        console.error('[versioningService] Network error:', networkError);
        return { success: false, error: `Network error: ${networkError instanceof Error ? networkError.message : 'Unknown error'}` };
    }
}

/**
 * Restore content to a specific version using ATOMIC restore (server-side transaction)
 * This is the recommended method - restore happens entirely on the server
 */
async function restoreToVersion(
    slotKey: string,
    targetVersion: number,
    _currentContent?: unknown  // Kept for backward compatibility, not used in atomic mode
): Promise<{ success: boolean; content?: unknown; new_version?: number; error?: string }> {
    const params = new URLSearchParams({
        action: 'restore',
        slot_key: slotKey
    });
    const url = `${VERSIONS_ENDPOINT}?${params}`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                ...(await getAuthHeaders()),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                version: targetVersion,
                atomic: true  // Use server-side atomic restore (default)
            })
        });

        const text = await response.text();
        if (!text || text.trim() === '') {
            return { success: false, error: 'Empty response from server' };
        }

        try {
            return JSON.parse(text);
        } catch (parseError) {
            console.error('[versioningService] JSON parse error:', parseError, 'Response text:', text.substring(0, 200));
            return { success: false, error: 'Invalid JSON response from server' };
        }
    } catch (networkError) {
        console.error('[versioningService] Network error:', networkError);
        return { success: false, error: `Network error: ${networkError instanceof Error ? networkError.message : 'Unknown error'}` };
    }
}

/**
 * Preview a specific version without restoring (read-only)
 * Use this to show diff view before committing to restore
 */
async function previewVersion(
    slotKey: string,
    targetVersion: number
): Promise<{ success: boolean; content?: unknown; error?: string }> {
    const params = new URLSearchParams({
        action: 'preview',
        slot_key: slotKey,
        version: String(targetVersion)
    });
    const url = `${VERSIONS_ENDPOINT}?${params}`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: await getAuthHeaders()
        });

        const text = await response.text();
        if (!text || text.trim() === '') {
            return { success: false, error: 'Empty response from server' };
        }

        try {
            return JSON.parse(text);
        } catch (parseError) {
            console.error('[versioningService] JSON parse error:', parseError);
            return { success: false, error: 'Invalid JSON response from server' };
        }
    } catch (networkError) {
        console.error('[versioningService] Network error:', networkError);
        return { success: false, error: `Network error: ${networkError instanceof Error ? networkError.message : 'Unknown error'}` };
    }
}

/**
 * Delete all versions for a slot
 */
async function deleteAllVersions(slotKey: string): Promise<{ success: boolean }> {
    const params = new URLSearchParams({
        action: 'delete',
        slot_key: slotKey
    });
    const url = `${VERSIONS_ENDPOINT}?${params}`;

    const response = await fetch(url, {
        method: 'DELETE',
        headers: await getAuthHeaders()
    });

    return response.json();
}

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get versioning settings
 */
async function getSettings(): Promise<VersioningSettings> {
    if (settingsCache) return settingsCache;

    const response = await fetch(`${VERSIONS_ENDPOINT}?action=settings`, {
        method: 'GET',
        headers: await getAuthHeaders()
    });

    const data = await response.json();
    if (data.success) {
        settingsCache = data.settings;
        return data.settings;
    }

    throw new Error(data.error || 'Failed to load settings');
}

/**
 * Update versioning settings
 */
async function updateSettings(settings: Partial<VersioningSettings>): Promise<boolean> {
    const response = await fetch(`${VERSIONS_ENDPOINT}?action=settings`, {
        method: 'POST',
        headers: {
            ...(await getAuthHeaders()),
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(settings)
    });

    const data = await response.json();
    if (data.success) {
        settingsCache = null; // Invalidate cache
        return true;
    }

    throw new Error(data.error || 'Failed to update settings');
}

/**
 * Check if versioning is enabled
 */
async function isEnabled(): Promise<boolean> {
    const settings = await getSettings();
    return settings['versioning.enabled'] === 'true';
}

// ═══════════════════════════════════════════════════════════════════════════
// STORAGE STATS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get storage statistics
 */
async function getStorageStats(): Promise<StorageStats> {
    const response = await fetch(`${VERSIONS_ENDPOINT}?action=stats`, {
        method: 'GET',
        headers: await getAuthHeaders()
    });

    const data = await response.json();
    if (data.success) {
        return data.stats;
    }

    throw new Error(data.error || 'Failed to load stats');
}

/**
 * Run cleanup task - deletes old versions based on retention policy and maxVersions limit
 */
async function runCleanup(): Promise<{
    deleted: number;
    deleted_by_retention: number;
    deleted_by_max_versions: number;
    preserved: number;
    slots_processed: number;
    retention_days: number;
    max_versions: number;
}> {
    const response = await fetch(`${VERSIONS_ENDPOINT}?action=cleanup`, {
        method: 'POST',
        headers: await getAuthHeaders()
    });

    const data = await response.json();
    if (data.success) {
        return data.result;
    }

    throw new Error(data.error || 'Cleanup failed');
}

// ═══════════════════════════════════════════════════════════════════════════
// PRECOMPUTED VERSION DATA - CLIENT-SIDE WASM OPTIMIZATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Precomputed version data structure
 * Frontend computes diff + hash, sends to backend for storage-only
 */
export interface PrecomputedVersionData {
    /** SHA-256 hash of new content (for deduplication) */
    content_hash: string;
    /** Compressed forward diff (old → new) as base64 */
    diff_forward_b64: string;
    /** Original diff size before compression */
    diff_size: number;
    /** Human-readable change summary */
    change_summary: string;
    /** Whether diff was compressed */
    is_compressed: boolean;
}

/**
 * Precompute version data using WASM (client-side)
 * This offloads diff computation and compression from server
 * 
 * @param oldContent - Previous content (null for first version)
 * @param newContent - New content to save
 * @returns Precomputed data or null if WASM not available
 */
async function precomputeVersionData(
    oldContent: unknown,
    newContent: unknown
): Promise<PrecomputedVersionData | null> {
    // Ensure WASM is initialized
    const wasmReady = await initializeWasm();
    if (!wasmReady || !wasmModule) {
        console.log('[VersioningService] WASM not available, server will compute diff');
        return null;
    }

    try {
        // CRITICAL: Use normalized JSON (sorted keys) to match backend hash calculation
        const oldJson = normalizeJson(oldContent ?? null);
        const newJson = normalizeJson(newContent);

        // DEBUG: Log if old and new are identical (indicates mutation bug)
        if (oldJson === newJson) {
            console.error('[VersioningService] BUG: oldJson === newJson! Object mutation detected.', {
                oldContentRef: oldContent,
                newContentRef: newContent,
                areSameReference: oldContent === newContent,
                oldJsonSample: oldJson.substring(0, 200),
                newJsonSample: newJson.substring(0, 200),
            });
            return null; // No need to compute diff
        }

        // Skip if content identical
        if (oldJson === newJson) {
            return null; // Server will detect and skip
        }

        // Compute diff using WASM
        const diffResult = wasmModule.compute_diff(oldJson, newJson);

        // DEBUG: Log exact WASM input and output
        console.log('[VersioningService] WASM compute_diff DEBUG:', {
            oldJsonLength: oldJson.length,
            newJsonLength: newJson.length,
            oldJsonSample: oldJson.substring(oldJson.length - 100), // Last 100 chars (where diff likely is)
            newJsonSample: newJson.substring(newJson.length - 100),
            diffResultSuccess: diffResult.success,
            diffForward: diffResult.diff_forward,
            diffForwardType: typeof diffResult.diff_forward,
            diffForwardLength: Array.isArray(diffResult.diff_forward) ? diffResult.diff_forward.length : 'N/A',
            changeSummary: diffResult.change_summary,
        });

        if (!diffResult.success) {
            console.warn('[VersioningService] WASM diff failed:', diffResult.error);
            return null;
        }

        // diff_forward is now a pre-serialized JSON string from WASM (not Value)
        const diffJson = diffResult.diff_forward as string;

        // Use NOMAD LZ4 unified format for compression (compatible with PHP)
        // smart_compress_auto uses 10% minimum savings threshold
        const compressResult = wasmModule.smart_compress_auto(diffJson);
        const diffData = compressResult.data;
        const isCompressed = compressResult.is_compressed;

        if (isCompressed) {
            console.log('[VersioningService] NOMAD LZ4 compression applied:', {
                originalSize: compressResult.original_size,
                compressedSize: compressResult.final_size,
                ratio: compressResult.compression_ratio.toFixed(2),
                bytesSaved: compressResult.bytes_saved
            });
        }

        // Convert to base64 for JSON transport
        const diffB64 = btoa(String.fromCharCode(...diffData));

        return {
            content_hash: diffResult.content_hash,
            diff_forward_b64: diffB64,
            diff_size: diffJson.length,
            change_summary: diffResult.change_summary,
            is_compressed: isCompressed
        };
    } catch (error) {
        console.error('[VersioningService] Precompute failed:', error);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// RACE CONDITION PREVENTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Acquire lock for critical operations
 */
function acquireLock(): boolean {
    if (wasmModule) {
        return wasmModule.acquire_lock();
    }
    return true; // Always succeed in JS mode
}

/**
 * Release lock after critical operations
 */
function releaseLock(): void {
    if (wasmModule) {
        wasmModule.release_lock();
    }
}

/**
 * Get current operation ID for optimistic locking
 */
function getOperationId(): bigint {
    if (wasmModule) {
        return wasmModule.get_operation_id();
    }
    return BigInt(Date.now());
}

/**
 * Validate operation ID hasn't changed
 */
function validateOperationId(expectedId: bigint): boolean {
    if (wasmModule) {
        return wasmModule.validate_operation_id(expectedId);
    }
    return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// TOKENIZATION (for search)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Tokenize content using WASM (for search)
 * Strips HTML, normalizes text, removes stop words (HU/EN)
 */
function tokenizeContent(content: string): string {
    if (!wasmModule) {
        // Fallback: simple lowercase tokenization
        return content.toLowerCase();
    }

    try {
        return wasmModule.tokenize_content(content);
    } catch (error) {
        console.warn('[VersioningService] Tokenize failed:', error);
        return content.toLowerCase();
    }
}

/**
 * Tokenize JSON content (extracts all string values recursively)
 */
function tokenizeJson(json: string): string {
    if (!wasmModule) {
        return json.toLowerCase();
    }

    try {
        return wasmModule.tokenize_json(json);
    } catch (error) {
        console.warn('[VersioningService] TokenizeJson failed:', error);
        return json.toLowerCase();
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// HYBRID VERSIONING (Shadow/Commit/Named)
// ═══════════════════════════════════════════════════════════════════════════

export type VersionType = 'shadow' | 'commit' | 'named';

/**
 * Promote a shadow version to commit or named
 */
async function promoteVersion(
    versionId: number,
    targetType: 'commit' | 'named' = 'commit',
    name?: string
): Promise<{ success: boolean; error?: string }> {
    const params = new URLSearchParams({
        action: 'promote',
        version_id: String(versionId)
    });
    const url = `${VERSIONS_ENDPOINT}?${params}`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: await getAuthHeaders(),
            body: JSON.stringify({
                type: targetType,
                name: name || undefined
            })
        });

        const result = await response.json();
        return result;
    } catch (error) {
        console.error('[versioningService] promoteVersion error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Rename a commit or named version
 */
async function renameVersion(
    versionId: number,
    name: string
): Promise<{ success: boolean; error?: string }> {
    const params = new URLSearchParams({
        action: 'rename',
        version_id: String(versionId)
    });
    const url = `${VERSIONS_ENDPOINT}?${params}`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: await getAuthHeaders(),
            body: JSON.stringify({ name })
        });

        const result = await response.json();
        return result;
    } catch (error) {
        console.error('[versioningService] renameVersion error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Delete a specific version
 */
async function deleteVersion(
    versionId: number,
    forceNamed = false
): Promise<{ success: boolean; error?: string; requires_confirmation?: boolean }> {
    const params = new URLSearchParams({
        action: 'delete_version',
        version_id: String(versionId)
    });

    if (forceNamed) {
        params.append('force', 'true');
    }

    const url = `${VERSIONS_ENDPOINT}?${params}`;

    try {
        const response = await fetch(url, {
            method: 'DELETE',
            headers: await getAuthHeaders()
        });

        const result = await response.json();
        return result;
    } catch (error) {
        console.error('[versioningService] deleteVersion error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Get version by ID (instead of by slot_key + version_number)
 */
async function getVersionById(
    versionId: number
): Promise<{ success: boolean; version?: VersionMetadata; error?: string }> {
    const params = new URLSearchParams({
        action: 'version_by_id',
        version_id: String(versionId)
    });
    const url = `${VERSIONS_ENDPOINT}?${params}`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: await getAuthHeaders()
        });

        const result = await response.json();
        return result;
    } catch (error) {
        console.error('[versioningService] getVersionById error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Cleanup expired shadow versions
 */
async function cleanupShadows(
    slotKey?: string
): Promise<{ success: boolean; deleted_count?: number; error?: string }> {
    const params = new URLSearchParams({
        action: 'cleanup_shadows'
    });
    const url = `${VERSIONS_ENDPOINT}?${params}`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: await getAuthHeaders(),
            body: JSON.stringify({ slot_key: slotKey || undefined })
        });

        const result = await response.json();
        return result;
    } catch (error) {
        console.error('[versioningService] cleanupShadows error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Format TTL for display (e.g., "23h 45m left")
 */
function formatTTL(ttlSeconds: number | null): string {
    if (ttlSeconds === null || ttlSeconds <= 0) return 'Lejárt';

    const hours = Math.floor(ttlSeconds / 3600);
    const minutes = Math.floor((ttlSeconds % 3600) / 60);

    if (hours > 0) {
        return `${hours}ó ${minutes}p`;
    }
    return `${minutes} perc`;
}

/**
 * Get version type icon/badge info - Hungarian user-friendly labels
 */
function getVersionTypeInfo(type: VersionType | null): { icon: string; label: string; color: string; description: string } {
    switch (type) {
        case 'shadow':
            return { icon: '~', label: 'Piszkozat', color: 'text-purple-500', description: 'Automatikus mentés, lejár 24 óra múlva' };
        case 'commit':
            return { icon: '#', label: 'Mentés', color: 'text-emerald-500', description: 'Végleges mentés, nem jár le' };
        case 'named':
            return { icon: '*', label: 'Elnevezett', color: 'text-amber-500', description: 'Fontos verzió egyedi névvel' };
        default:
            return { icon: 'v', label: 'Verzió', color: 'text-foreground', description: 'Korábbi verzió' };
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT SERVICE
// ═══════════════════════════════════════════════════════════════════════════

export const versioningService = {
    // Initialization
    initialize: initializeWasm,

    // Diff computation
    computeDiff,
    hashContent,
    verifyHash,

    // WASM Precomputation (for server offload)
    precomputeVersionData,

    // Version history (API)
    getVersionHistory,
    getVersion,
    restoreToVersion,
    previewVersion,  // NEW: Preview before restore
    deleteAllVersions,

    // Hybrid versioning (NEW)
    promoteVersion,
    renameVersion,
    deleteVersion,
    getVersionById,
    cleanupShadows,
    formatTTL,
    getVersionTypeInfo,

    // Settings
    getSettings,
    updateSettings,
    isEnabled,

    // Storage
    getStorageStats,
    runCleanup,

    // Race condition prevention
    acquireLock,
    releaseLock,
    getOperationId,
    validateOperationId,

    // Tokenization (for search)
    tokenizeContent,
    tokenizeJson,

    // WASM status
    isWasmLoaded: () => wasmModule !== null
};

export default versioningService;
