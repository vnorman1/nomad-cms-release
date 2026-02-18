import { useState, useEffect, useCallback, useRef } from 'react';
import { getDataWithLockInfo, saveData, ConflictError } from '@/api';
import type { PrecomputedVersionData } from '@/api';
import { ADMIN_CONFIG } from '@/config/admin.config';
import { versioningService } from '@/services/versioningService';

/**
 * Save result with conflict info
 */
export interface SlotSaveResult {
    success: boolean;
    conflict?: boolean;
    conflictType?: 'hash' | 'version';
    currentVersion?: number;
    currentHash?: string;
    message?: string;
}

/**
 * Hook for managing slot data with ENTERPRISE OPTIMISTIC LOCKING
 * 
 * Features:
 * - Automatic hash tracking for conflict detection
 * - Throws ConflictError when concurrent modification detected
 * - Returns new hash after save for subsequent saves
 */
export function useSlotData(slotKey: string) {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Track version and hash for optimistic locking
    const lockInfoRef = useRef<{ version: number; hash: string }>({ version: 0, hash: '' });
    
    // RACE CONDITION FIX: Track last saved data for accurate diff computation
    // React state updates are async, so rapid saves can use stale `data` state
    // This ref is updated synchronously after each successful save
    const lastSavedDataRef = useRef<any>(null);

    // Get slot type from config
    const slotConfig = ADMIN_CONFIG[slotKey as keyof typeof ADMIN_CONFIG];
    const slotType = slotConfig?.type || 'object';

    const fetchData = useCallback(async () => {
        if (!slotKey) {
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            // Fetch with lock info for optimistic locking
            const result = await getDataWithLockInfo(slotKey);
            setData(result.data);
            // RACE CONDITION FIX: Initialize lastSavedDataRef with fetched data
            lastSavedDataRef.current = structuredClone(result.data);
            // Store lock info for next save
            lockInfoRef.current = {
                version: result.version,
                hash: result.hash,
            };
        } catch (err) {
            console.error("Fetch error:", err);
            setError('Failed to load data');
        } finally {
            setLoading(false);
        }
    }, [slotKey]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    /**
     * Save with optimistic locking + WASM precomputation
     * 
     * @param newData - Data to save
     * @param createVersion - Force version creation
     * @returns SlotSaveResult with conflict info if applicable
     */
    const save = async (newData: any, createVersion?: boolean): Promise<SlotSaveResult> => {
        try {
            // Precompute version data using WASM (offloads server)
            // RACE CONDITION FIX: Use lastSavedDataRef instead of `data` state
            // React state is async, rapid saves can see stale `data`
            // lastSavedDataRef is synchronously updated after each save
            let precomputedVersion: PrecomputedVersionData | undefined;
            try {
                const oldContent = lastSavedDataRef.current;
                const precomputed = await versioningService.precomputeVersionData(oldContent, newData);
                if (precomputed) {
                    precomputedVersion = precomputed;
                    console.log('[useSlotData] WASM precomputed version data', {
                        diffSize: precomputed.diff_size,
                        compressed: precomputed.is_compressed,
                        summary: precomputed.change_summary,
                        usingRefData: true // Debug: confirm we're using ref, not state
                    });
                }
            } catch (e) {
                console.warn('[useSlotData] WASM precomputation failed, server will compute:', e);
            }

            // Use hash-based locking (recommended for TRUE content identity)
            const result = await saveData(
                slotKey,
                newData,
                slotType,
                createVersion,
                lockInfoRef.current.hash || undefined,  // expected_hash
                undefined,  // Don't use version, hash is more robust
                precomputedVersion  // WASM precomputed data (optional)
            );

            if (result.success) {
                // RACE CONDITION FIX: Update ref SYNCHRONOUSLY before state
                // This ensures next rapid save sees correct "old" content
                lastSavedDataRef.current = structuredClone(newData);
                
                setData(newData);
                // Update lock info for next save
                lockInfoRef.current = {
                    version: result.version ?? lockInfoRef.current.version + 1,
                    hash: result.hash ?? '',
                };
                return { success: true };
            }

            return { success: false, message: result.error };
        } catch (err: any) {
            console.error("Save error:", err);

            // Handle conflict error
            if (err instanceof ConflictError) {
                setError('Content was modified by another user. Please reload and try again.');
                return {
                    success: false,
                    conflict: true,
                    conflictType: err.lockType,
                    currentVersion: err.currentVersion,
                    currentHash: err.currentHash,
                    message: err.message,
                };
            }

            // Check if it's a panic mode error
            if (err?.isPanicMode) {
                setError(err.message);
            } else {
                setError('Failed to save data');
            }
            return { success: false, message: err?.message };
        }
    };

    return {
        data,
        loading,
        error,
        save,
        refetch: fetchData,
        // Expose lock info for advanced use cases
        version: lockInfoRef.current.version,
        hash: lockInfoRef.current.hash,
    };
}
