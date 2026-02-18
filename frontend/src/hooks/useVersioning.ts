/**
 * useVersioning Hook - Content Version History Management
 * 
 * React hook for integrating version history into slot editors.
 * 
 * Features:
 * - Lazy loading of version list
 * - On-demand diff data loading
 * - Optimistic locking for save operations
 * - Auto-versioning on save
 * 
 * @example
 * const { versions, loading, createVersion, restoreVersion } = useVersioning(slotKey);
 * 
 * // Create version on save
 * await createVersion(oldData, newData);
 * 
 * // Restore to previous version
 * const restored = await restoreVersion(5);
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { versioningService, type VersionMetadata, type VersionDetail } from '@/services/versioningService';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface UseVersioningOptions {
    /** Auto-load version history on mount */
    autoLoad?: boolean;
    /** Page size for lazy loading */
    pageSize?: number;
    /** Enable optimistic locking */
    optimisticLocking?: boolean;
    /** Include shadow versions in history */
    includeShadows?: boolean;
}

export interface UseVersioningReturn {
    /** Version metadata list (lazy loaded) */
    versions: VersionMetadata[];
    /** Currently selected version detail */
    selectedVersion: VersionDetail | null;
    /** Total version count */
    totalCount: number;
    /** Loading state */
    loading: boolean;
    /** Loading more versions */
    loadingMore: boolean;
    /** Error message */
    error: string | null;
    /** Whether versioning is enabled */
    isEnabled: boolean;
    /** WASM module loaded */
    wasmReady: boolean;
    /** Include shadow versions in history */
    includeShadows: boolean;

    /** Load version history */
    loadVersions: () => Promise<void>;
    /** Load more versions (pagination) */
    loadMore: () => Promise<void>;
    /** Load all versions at once */
    loadAllVersions: () => Promise<void>;
    /** Load specific version detail */
    loadVersionDetail: (versionNumber: number) => Promise<VersionDetail | null>;
    /** Create new version */
    createVersion: (oldContent: unknown, newContent: unknown) => Promise<boolean>;
    /** Restore to specific version (atomic server-side restore) */
    restoreVersion: (versionNumber: number, currentContent?: unknown) => Promise<{ content: unknown; newVersion?: number } | null>;
    /** Delete all versions for this slot */
    deleteAllVersions: () => Promise<boolean>;
    /** Clear selected version */
    clearSelection: () => void;
    /** Refresh version list */
    refresh: () => Promise<void>;
    /** Tokenize content using WASM (for search) */
    tokenizeContent: ((content: string) => string) | null;
    
    // Hybrid versioning functions
    /** Toggle shadow versions visibility */
    setIncludeShadows: (include: boolean) => void;
    /** Promote shadow to commit/named */
    promoteVersion: (versionId: number, targetType: 'commit' | 'named', name?: string) => Promise<boolean>;
    /** Delete specific version */
    deleteVersion: (versionId: number, forceNamed?: boolean) => Promise<boolean>;
    /** Rename version */
    renameVersion: (versionId: number, name: string) => Promise<boolean>;
    /** Format TTL for display */
    formatTTL: (ttlSeconds: number | null) => string;
    /** Get version type info */
    getVersionTypeInfo: (type: 'shadow' | 'commit' | 'named' | null) => { icon: string; label: string; color: string; description: string };
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOK IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════

export function useVersioning(
    slotKey: string,
    options: UseVersioningOptions = {}
): UseVersioningReturn {
    const {
        autoLoad = true,
        pageSize = 20,
        optimisticLocking = true,
        includeShadows: initialIncludeShadows = false
    } = options;

    // State
    const [versions, setVersions] = useState<VersionMetadata[]>([]);
    const [selectedVersion, setSelectedVersion] = useState<VersionDetail | null>(null);
    const [totalCount, setTotalCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isEnabled, setIsEnabled] = useState(true);
    const [wasmReady, setWasmReady] = useState(false);
    const [includeShadows, setIncludeShadows] = useState(initialIncludeShadows);

    // Refs for optimistic locking
    const operationIdRef = useRef<bigint>(BigInt(0));
    const mountedRef = useRef(true);

    // Initialize WASM module
    useEffect(() => {
        let cancelled = false;

        const initWasm = async () => {
            const success = await versioningService.initialize();
            if (!cancelled) {
                setWasmReady(success);
            }
        };

        initWasm();

        return () => {
            cancelled = true;
        };
    }, []);

    // Check if versioning is enabled
    useEffect(() => {
        let cancelled = false;

        const checkEnabled = async () => {
            try {
                const enabled = await versioningService.isEnabled();
                if (!cancelled) {
                    setIsEnabled(enabled);
                }
            } catch {
                // Default to enabled if check fails
            }
        };

        checkEnabled();

        return () => {
            cancelled = true;
        };
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    // Load version history
    const loadVersions = useCallback(async () => {
        if (!slotKey || !isEnabled) return;

        setLoading(true);
        setError(null);

        try {
            const response = await versioningService.getVersionHistory(slotKey, pageSize, 0, includeShadows);

            if (mountedRef.current) {
                setVersions(response.versions);
                setTotalCount(response.total_count);
            }
        } catch (err) {
            if (mountedRef.current) {
                setError(err instanceof Error ? err.message : 'Failed to load versions');
            }
        } finally {
            if (mountedRef.current) {
                setLoading(false);
            }
        }
    }, [slotKey, pageSize, isEnabled, includeShadows]);

    // Load more versions (pagination)
    const loadMore = useCallback(async () => {
        if (!slotKey || loadingMore || versions.length >= totalCount) return;

        setLoadingMore(true);

        try {
            const response = await versioningService.getVersionHistory(
                slotKey,
                pageSize,
                versions.length,
                includeShadows
            );

            if (mountedRef.current) {
                setVersions(prev => [...prev, ...response.versions]);
            }
        } catch (err) {
            if (mountedRef.current) {
                setError(err instanceof Error ? err.message : 'Failed to load more versions');
            }
        } finally {
            if (mountedRef.current) {
                setLoadingMore(false);
            }
        }
    }, [slotKey, pageSize, versions.length, totalCount, loadingMore, includeShadows]);

    // Load specific version detail
    const loadVersionDetail = useCallback(async (versionNumber: number): Promise<VersionDetail | null> => {
        if (!slotKey) return null;

        try {
            const response = await versioningService.getVersion(slotKey, versionNumber);

            if (response.success && 'version' in response) {
                if (mountedRef.current) {
                    setSelectedVersion(response.version);
                }
                return response.version;
            }

            // Version not found - might have been deleted by cleanup
            // Auto-refresh the list to sync with database
            const errorMsg = 'error' in response ? response.error : '';
            if (errorMsg.includes('not found') || errorMsg.includes('not exist')) {
                console.warn(`[useVersioning] Version ${versionNumber} not found, refreshing list...`);
                if (mountedRef.current) {
                    setError(`A(z) ${versionNumber}. verzió már nem létezik. Lista frissítve.`);
                    // Trigger refresh after a short delay to show error first
                    setTimeout(() => {
                        if (mountedRef.current) {
                            loadVersions();
                        }
                    }, 100);
                }
            }

            return null;
        } catch (err) {
            if (mountedRef.current) {
                const errorMsg = err instanceof Error ? err.message : 'Failed to load version';
                setError(errorMsg);

                // If it's a "not found" error, refresh the list
                if (errorMsg.includes('not found') || errorMsg.includes('404')) {
                    setTimeout(() => {
                        if (mountedRef.current) {
                            loadVersions();
                        }
                    }, 100);
                }
            }
            return null;
        }
    }, [slotKey, loadVersions]);

    // Create new version
    const createVersion = useCallback(async (
        oldContent: unknown,
        newContent: unknown
    ): Promise<boolean> => {
        if (!isEnabled) return true; // Skip if disabled

        // Optimistic locking
        if (optimisticLocking) {
            const acquired = versioningService.acquireLock();
            if (!acquired) {
                setError('Another operation is in progress');
                return false;
            }

            operationIdRef.current = versioningService.getOperationId();
        }

        try {
            // Compute diff using WASM or fallback
            const diff = await versioningService.computeDiff(oldContent, newContent);

            if (!diff.success) {
                setError(diff.error || 'Diff computation failed');
                return false;
            }

            // Skip if no changes
            if (diff.change_summary === 'No changes') {
                return true;
            }

            // Version is created server-side when saving content
            // This hook just prepares the diff data

            // Refresh version list
            await loadVersions();

            return true;
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Version creation failed');
            return false;
        } finally {
            if (optimisticLocking) {
                versioningService.releaseLock();
            }
        }
    }, [isEnabled, optimisticLocking, loadVersions]);

    // Restore to specific version (now uses ATOMIC server-side restore)
    const restoreVersion = useCallback(async (
        versionNumber: number,
        currentContent?: unknown  // Optional - not needed for atomic restore
    ): Promise<{ content: unknown; newVersion?: number } | null> => {
        if (!slotKey) return null;

        // Optimistic locking
        if (optimisticLocking) {
            const acquired = versioningService.acquireLock();
            if (!acquired) {
                setError('Another operation is in progress');
                return null;
            }
        }

        try {
            // Use atomic restore - server handles everything in a transaction
            const result = await versioningService.restoreToVersion(
                slotKey,
                versionNumber,
                currentContent  // Optional for atomic restore
            );

            if (result.success && result.content !== undefined) {
                // Clear any previous error
                setError(null);
                // Refresh version list after restore
                await loadVersions();
                return {
                    content: result.content,
                    newVersion: result.new_version
                };
            }

            // Check if version was deleted (cleanup happened)
            const errorMsg = result.error || 'Restore failed';
            setError(errorMsg);

            // Auto-refresh list if version not found
            if (errorMsg.includes('not found') || errorMsg.includes('not exist')) {
                console.warn(`[useVersioning] Version ${versionNumber} not found during restore, refreshing list...`);
                setTimeout(() => {
                    if (mountedRef.current) {
                        loadVersions();
                    }
                }, 100);
            }

            return null;
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Restore failed';
            setError(errorMsg);

            // Auto-refresh list if version not found
            if (errorMsg.includes('not found') || errorMsg.includes('404')) {
                setTimeout(() => {
                    if (mountedRef.current) {
                        loadVersions();
                    }
                }, 100);
            }

            return null;
        } finally {
            if (optimisticLocking) {
                versioningService.releaseLock();
            }
        }
    }, [slotKey, optimisticLocking, loadVersions]);

    // Clear selected version
    const clearSelection = useCallback(() => {
        setSelectedVersion(null);
    }, []);

    // Delete all versions for this slot
    const deleteAllVersions = useCallback(async (): Promise<boolean> => {
        if (!slotKey) return false;

        try {
            const result = await versioningService.deleteAllVersions(slotKey);
            if (result.success) {
                setVersions([]);
                setTotalCount(0);
                setSelectedVersion(null);
                return true;
            }
            return false;
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete versions');
            return false;
        }
    }, [slotKey]);

    // Refresh version list
    const refresh = useCallback(async () => {
        setVersions([]);
        setTotalCount(0);
        await loadVersions();
    }, [loadVersions]);

    // Load ALL versions at once (for viewing all)
    const loadAllVersions = useCallback(async () => {
        if (!slotKey || !isEnabled) return;

        setLoading(true);
        setError(null);

        try {
            // Load in batches of 50 until all loaded
            let allVersions: VersionMetadata[] = [];
            let offset = 0;
            const batchSize = 50;
            let hasMore = true;

            while (hasMore) {
                const response = await versioningService.getVersionHistory(slotKey, batchSize, offset, includeShadows);
                allVersions = [...allVersions, ...response.versions];
                offset += batchSize;
                hasMore = allVersions.length < response.total_count;
            }

            if (mountedRef.current) {
                setVersions(allVersions);
                setTotalCount(allVersions.length);
            }
        } catch (err) {
            if (mountedRef.current) {
                setError(err instanceof Error ? err.message : 'Failed to load all versions');
            }
        } finally {
            if (mountedRef.current) {
                setLoading(false);
            }
        }
    }, [slotKey, isEnabled, includeShadows]);

    // Auto-load on mount
    useEffect(() => {
        if (autoLoad && slotKey && isEnabled) {
            loadVersions();
        }
    }, [autoLoad, slotKey, isEnabled, loadVersions]);

    // Tokenize content using WASM (for search)
    const tokenizeContent = useCallback((content: string): string => {
        if (!wasmReady) return content.toLowerCase();
        return versioningService.tokenizeContent(content);
    }, [wasmReady]);

    // =========================================================================
    // HYBRID VERSIONING FUNCTIONS
    // =========================================================================
    
    // Promote shadow to commit/named
    const promoteVersion = useCallback(async (
        versionId: number,
        targetType: 'commit' | 'named',
        name?: string
    ): Promise<boolean> => {
        try {
            const result = await versioningService.promoteVersion(versionId, targetType, name);
            if (result.success) {
                // Refresh list to show updated version type
                await loadVersions();
                return true;
            }
            setError(result.error || 'Promote failed');
            return false;
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Promote failed');
            return false;
        }
    }, [loadVersions]);
    
    // Delete specific version
    const deleteVersionFunc = useCallback(async (
        versionId: number,
        forceNamed = false
    ): Promise<boolean> => {
        try {
            const result = await versioningService.deleteVersion(versionId, forceNamed);
            if (result.success) {
                // Refresh list
                await loadVersions();
                return true;
            }
            if (result.requires_confirmation) {
                setError('Named verzió törléséhez megerősítés szükséges');
                return false;
            }
            setError(result.error || 'Delete failed');
            return false;
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Delete failed');
            return false;
        }
    }, [loadVersions]);
    
    // Rename version
    const renameVersionFunc = useCallback(async (
        versionId: number,
        name: string
    ): Promise<boolean> => {
        try {
            const result = await versioningService.renameVersion(versionId, name);
            if (result.success) {
                // Refresh list to show new name
                await loadVersions();
                return true;
            }
            setError(result.error || 'Rename failed');
            return false;
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Rename failed');
            return false;
        }
    }, [loadVersions]);
    
    // Reload when includeShadows changes
    useEffect(() => {
        if (slotKey && isEnabled) {
            loadVersions();
        }
    }, [includeShadows]); // Only trigger on includeShadows change

    return {
        versions,
        selectedVersion,
        totalCount,
        loading,
        loadingMore,
        error,
        isEnabled,
        wasmReady,
        includeShadows,
        loadVersions,
        loadMore,
        loadAllVersions,
        loadVersionDetail,
        createVersion,
        restoreVersion,
        deleteAllVersions,
        clearSelection,
        refresh,
        tokenizeContent: wasmReady ? tokenizeContent : null,
        // Hybrid versioning
        setIncludeShadows,
        promoteVersion,
        deleteVersion: deleteVersionFunc,
        renameVersion: renameVersionFunc,
        formatTTL: versioningService.formatTTL,
        getVersionTypeInfo: versioningService.getVersionTypeInfo
    };
}

export default useVersioning;
