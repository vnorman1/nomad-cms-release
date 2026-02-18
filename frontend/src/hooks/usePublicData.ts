/**
 * NOMAD CMS - usePublicData Hook
 * React hook for fetching public data from static cache
 * 
 * Uses getPublicData() which automatically:
 * - Fetches from static cache (fast, no PHP)
 * - Validates with ETag (304 Not Modified)
 * - Falls back to API if cache miss
 */

import { useState, useEffect, useCallback } from 'react';
import { getPublicData, clearPublicDataCache } from '@/api/data';

interface UsePublicDataResult<T> {
    /** The fetched data */
    data: T | null;
    /** Loading state */
    loading: boolean;
    /** Error if fetch failed */
    error: Error | null;
    /** Manually refresh the data */
    refresh: () => void;
    /** Clear cache and refresh */
    invalidate: () => void;
}

interface UsePublicDataOptions {
    /** Skip the initial fetch */
    skip?: boolean;
    /** Refetch interval in milliseconds (0 = disabled) */
    refetchInterval?: number;
}

/**
 * Hook for fetching public slot data with caching
 * 
 * @example
 * ```tsx
 * const { data, loading, error } = usePublicData<HeroContent>('hero');
 * 
 * if (loading) return <Spinner />;
 * if (error) return <Error message={error.message} />;
 * return <Hero content={data} />;
 * ```
 */
export function usePublicData<T>(
    key: string,
    options: UsePublicDataOptions = {}
): UsePublicDataResult<T> {
    const { skip = false, refetchInterval = 0 } = options;

    const [data, setData] = useState<T | null>(null);
    const [loading, setLoading] = useState(!skip);
    const [error, setError] = useState<Error | null>(null);

    const fetchData = useCallback(async () => {
        if (skip) return;

        setLoading(true);
        setError(null);

        try {
            const result = await getPublicData<T>(key);
            setData(result);
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Fetch failed'));
        } finally {
            setLoading(false);
        }
    }, [key, skip]);

    // Initial fetch
    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Optional refetch interval
    useEffect(() => {
        if (refetchInterval <= 0 || skip) return;

        const interval = setInterval(fetchData, refetchInterval);
        return () => clearInterval(interval);
    }, [fetchData, refetchInterval, skip]);

    const refresh = useCallback(() => {
        fetchData();
    }, [fetchData]);

    const invalidate = useCallback(() => {
        clearPublicDataCache(key);
        fetchData();
    }, [key, fetchData]);

    return { data, loading, error, refresh, invalidate };
}

/**
 * Prefetch multiple slots into cache
 * Useful for preloading before navigation
 * 
 * @param keys - Array of slot keys to prefetch
 */
export async function prefetchPublicData(keys: string[]): Promise<void> {
    await Promise.allSettled(keys.map(key => getPublicData(key)));
}

export default usePublicData;
