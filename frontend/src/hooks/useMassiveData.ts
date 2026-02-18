/**
 * useMassiveData Hook
 * 
 * React hook nagy adatmennyiségre optimalizált 'massive' típusú slotok kezeléséhez.
 * Támogatja: pagination, sorting, filtering, search, bulk operations.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import {
    getMassiveList,
    getMassiveStats,
    createMassiveRecord,
    updateMassiveRecord,
    deleteMassiveRecord,
    bulkDeleteMassiveRecords,
    exportMassiveCSV,
    type MassiveRecord,
    type MassiveStats,
    type MassiveListParams,
} from '@/api/massive';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface UseMassiveDataOptions {
    /** Slot kulcs */
    slot: string;
    /** Kezdeti oldalméret */
    initialPageSize?: number;
    /** Kezdeti rendezési mező */
    initialSort?: string;
    /** Kezdeti rendezési irány */
    initialSortDir?: 'asc' | 'desc';
    /** Automatikus betöltés komponens mountolásakor */
    autoFetch?: boolean;
    /** Debounce idő kereséshez (ms) */
    searchDebounce?: number;
}

export interface UseMassiveDataReturn<T = Record<string, unknown>> {
    // State
    items: MassiveRecord<T>[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    sort: string;
    sortDir: 'asc' | 'desc';
    search: string;
    filters: Record<string, string | number | boolean>;
    selectedIds: Set<number>;
    stats: MassiveStats | null;
    isLoading: boolean;
    isCreating: boolean;
    isUpdating: boolean;
    isDeleting: boolean;
    error: string | null;

    // Encryption state
    isEncrypted: boolean;
    isSearchDisabled: boolean;
    isFilterDisabled: boolean;
    isSortDisabled: boolean;
    // Blind indexing state
    blindIndexEnabled: boolean;
    searchableFields: string[];

    // Actions
    fetchData: () => Promise<void>;
    fetchStats: () => Promise<void>;
    setPage: (page: number) => void;
    setPageSize: (size: number) => void;
    setSort: (field: string, dir?: 'asc' | 'desc') => void;
    setSearch: (query: string) => void;
    setFilter: (field: string, value: string | number | boolean | undefined) => void;
    clearFilters: () => void;

    // CRUD
    createRecord: (data: T) => Promise<number | null>;
    updateRecord: (id: number, data: T) => Promise<boolean>;
    deleteRecord: (id: number) => Promise<boolean>;
    bulkDelete: () => Promise<number>;

    // Selection
    selectItem: (id: number) => void;
    deselectItem: (id: number) => void;
    selectAll: () => void;
    deselectAll: () => void;
    toggleSelection: (id: number) => void;
    isSelected: (id: number) => boolean;

    // Export
    exportCSV: () => Promise<void>;
    isExporting: boolean;

    // Import
    importCSV: (file: File) => Promise<{ inserted: number; errors: string[] }>;
    isImporting: boolean;

    // Refresh
    refresh: () => Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════════════════

export function useMassiveData<T = Record<string, unknown>>(
    options: UseMassiveDataOptions
): UseMassiveDataReturn<T> {
    const {
        slot,
        initialPageSize = 50,
        initialSort = 'id',
        initialSortDir = 'desc',
        autoFetch = true,
        searchDebounce = 300,
    } = options;

    // ═══════════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════════

    const [items, setItems] = useState<MassiveRecord<T>[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(initialPageSize);
    const [totalPages, setTotalPages] = useState(0);
    const [sort, setSort] = useState(initialSort);
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>(initialSortDir);
    const [search, setSearchState] = useState('');
    const [filters, setFilters] = useState<Record<string, string | number | boolean>>({});
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [stats, setStats] = useState<MassiveStats | null>(null);

    const [isLoading, setIsLoading] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Encryption state (from API response)
    const [isEncrypted, setIsEncrypted] = useState(false);
    const [isSearchDisabled, setIsSearchDisabled] = useState(false);
    const [isFilterDisabled, setIsFilterDisabled] = useState(false);
    const [isSortDisabled, setIsSortDisabled] = useState(false);
    // Blind indexing state
    const [blindIndexEnabled, setBlindIndexEnabled] = useState(false);
    const [searchableFields, setSearchableFields] = useState<string[]>([]);

    // Refs for debouncing
    const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const debouncedSearch = useRef(search);

    // ═══════════════════════════════════════════════════════════════════════
    // FETCH DATA
    // ═══════════════════════════════════════════════════════════════════════

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            const params: MassiveListParams = {
                page,
                pageSize,
                sort: sort || 'id', // Fallback to ID if neutral
                dir: sort ? sortDir : 'desc', // Fallback to DESC if neutral (usually date desc)
                search: debouncedSearch.current || undefined,
                filters: Object.keys(filters).length > 0 ? filters : undefined,
            };

            const response = await getMassiveList<T>(slot, params);

            setItems(response.items);
            setTotal(response.total);
            setTotalPages(response.totalPages);

            // Update encryption state from API response
            setIsEncrypted(response.isEncrypted ?? false);
            setIsSearchDisabled(response.searchDisabled ?? false);
            setIsFilterDisabled(response.filterDisabled ?? false);
            setIsSortDisabled(response.sortDisabled ?? false);
            // Update blind indexing state
            setBlindIndexEnabled(response.blindIndexEnabled ?? false);
            setSearchableFields(response.searchableFields ?? []);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Hiba történt az adatok betöltésekor');
            setItems([]);
            setTotal(0);
            setTotalPages(0);
        } finally {
            setIsLoading(false);
        }
    }, [slot, page, pageSize, sort, sortDir, filters]);

    const fetchStats = useCallback(async () => {
        try {
            const statsData = await getMassiveStats(slot);
            setStats(statsData);
        } catch {
            // Stats are optional, don't show error
        }
    }, [slot]);

    // ═══════════════════════════════════════════════════════════════════════
    // EFFECTS
    // ═══════════════════════════════════════════════════════════════════════

    // Auto-fetch on mount and when dependencies change
    useEffect(() => {
        if (autoFetch) {
            fetchData();
        }
    }, [fetchData, autoFetch]);

    // Debounced search
    useEffect(() => {
        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
        }

        searchTimeoutRef.current = setTimeout(() => {
            debouncedSearch.current = search;
            setPage(1); // Reset to first page on search
            fetchData();
        }, searchDebounce);

        return () => {
            if (searchTimeoutRef.current) {
                clearTimeout(searchTimeoutRef.current);
            }
        };
    }, [search, searchDebounce]);

    // ═══════════════════════════════════════════════════════════════════════
    // ACTIONS
    // ═══════════════════════════════════════════════════════════════════════

    const handleSetPage = useCallback((newPage: number) => {
        setPage(Math.max(1, newPage));
    }, []);

    const handleSetPageSize = useCallback((size: number) => {
        setPageSize(Math.max(1, Math.min(200, size)));
        setPage(1); // Reset to first page
    }, []);

    const handleSetSort = useCallback((field: string, dir?: 'asc' | 'desc') => {
        if (field === sort && !dir) {
            // Toggle direction: ASC -> DESC -> NEUTRAL (default/id)
            if (sortDir === 'asc') {
                setSortDir('desc');
            } else {
                // If currently DESC, reset to Neutral
                setSort(''); // Empty string signifies "no specific sort" (will fallback to default in fetch)
                setSortDir('asc'); // Reset dir
            }
        } else {
            // New field -> Start with ASC
            setSort(field);
            setSortDir(dir ?? 'asc');
        }
        setPage(1);
    }, [sort, sortDir]);

    const handleSetSearch = useCallback((query: string) => {
        setSearchState(query);
    }, []);

    const handleSetFilter = useCallback((field: string, value: string | number | boolean | undefined) => {
        setFilters(prev => {
            const newFilters = { ...prev };
            if (value === undefined || value === '') {
                delete newFilters[field];
            } else {
                newFilters[field] = value;
            }
            return newFilters;
        });
        setPage(1);
    }, []);

    const clearFilters = useCallback(() => {
        setFilters({});
        setSearchState('');
        debouncedSearch.current = '';
        setPage(1);
    }, []);

    // ═══════════════════════════════════════════════════════════════════════
    // CRUD OPERATIONS
    // ═══════════════════════════════════════════════════════════════════════

    const createRecord = useCallback(async (data: T): Promise<number | null> => {
        setIsCreating(true);
        setError(null);

        try {
            const result = await createMassiveRecord(slot, data);
            if (result) {
                await fetchData(); // Refresh list
                await fetchStats(); // Update stats
                return result.id;
            }
            return null;
        } catch (err: any) {
            if (err?.isPanicMode) {
                setError('Bocsi, a rendszer most pánik módban van! Próbáld meg később.');
            } else {
                setError(err instanceof Error ? err.message : 'Hiba történt a létrehozáskor');
            }
            return null;
        } finally {
            setIsCreating(false);
        }
    }, [slot, fetchData, fetchStats]);

    const updateRecord = useCallback(async (id: number, data: T): Promise<boolean> => {
        setIsUpdating(true);
        setError(null);

        try {
            const success = await updateMassiveRecord(slot, id, data);
            if (success) {
                await fetchData(); // Refresh list
            }
            return success;
        } catch (err: any) {
            if (err?.isPanicMode) {
                setError('Bocsi, a rendszer most pánik módban van! Próbáld meg később.');
            } else {
                setError(err instanceof Error ? err.message : 'Hiba történt a frissítéskor');
            }
            return false;
        } finally {
            setIsUpdating(false);
        }
    }, [slot, fetchData]);

    const deleteRecord = useCallback(async (id: number): Promise<boolean> => {
        setIsDeleting(true);
        setError(null);

        try {
            const success = await deleteMassiveRecord(slot, id);
            if (success) {
                setSelectedIds(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(id);
                    return newSet;
                });
                await fetchData(); // Refresh list
                await fetchStats(); // Update stats
            }
            return success;
        } catch (err: any) {
            if (err?.isPanicMode) {
                setError('Bocsi, a rendszer most pánik módban van! Próbáld meg később.');
            } else {
                setError(err instanceof Error ? err.message : 'Hiba történt a törléskor');
            }
            return false;
        } finally {
            setIsDeleting(false);
        }
    }, [slot, fetchData, fetchStats]);

    const bulkDelete = useCallback(async (): Promise<number> => {
        if (selectedIds.size === 0) return 0;

        setIsDeleting(true);
        setError(null);

        try {
            const result = await bulkDeleteMassiveRecords(slot, Array.from(selectedIds));
            if (result.deleted > 0) {
                setSelectedIds(new Set());
                await fetchData(); // Refresh list
                await fetchStats(); // Update stats
            }
            return result.deleted;
        } catch (err: any) {
            if (err?.isPanicMode) {
                setError('Bocsi, a rendszer most pánik módban van! Próbáld meg később.');
            } else {
                setError(err instanceof Error ? err.message : 'Hiba történt a tömeges törlésnél');
            }
            return 0;
        } finally {
            setIsDeleting(false);
        }
    }, [slot, selectedIds, fetchData, fetchStats]);

    // ═══════════════════════════════════════════════════════════════════════
    // SELECTION
    // ═══════════════════════════════════════════════════════════════════════

    const selectItem = useCallback((id: number) => {
        setSelectedIds(prev => new Set(prev).add(id));
    }, []);

    const deselectItem = useCallback((id: number) => {
        setSelectedIds(prev => {
            const newSet = new Set(prev);
            newSet.delete(id);
            return newSet;
        });
    }, []);

    const selectAll = useCallback(() => {
        setSelectedIds(new Set(items.map(item => item.id)));
    }, [items]);

    const deselectAll = useCallback(() => {
        setSelectedIds(new Set());
    }, []);

    const toggleSelection = useCallback((id: number) => {
        setSelectedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
    }, []);

    const isSelected = useCallback((id: number) => {
        return selectedIds.has(id);
    }, [selectedIds]);

    // ═══════════════════════════════════════════════════════════════════════
    // REFRESH
    // ═══════════════════════════════════════════════════════════════════════

    const refresh = useCallback(async () => {
        await Promise.all([fetchData(), fetchStats()]);
    }, [fetchData, fetchStats]);

    // ═══════════════════════════════════════════════════════════════════════
    // IMPORT / EXPORT
    // ═══════════════════════════════════════════════════════════════════════

    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);

    const exportCSV = useCallback(async () => {
        setIsExporting(true);
        try {
            await exportMassiveCSV(slot, sort, sortDir);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Hiba történt az exportálásnál');
        } finally {
            setIsExporting(false);
        }
    }, [slot, sort, sortDir]);

    const importCSV = useCallback(async (file: File) => {
        setIsImporting(true);
        setError(null);
        try {
            // Dynamically import to avoid circular dependencies if any
            const { importMassiveCSV } = await import('@/api/massive');
            const result = await importMassiveCSV(slot, file);

            await refresh(); // Refresh data and stats after import
            return result;
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Hiba történt az importálásnál');
            return { inserted: 0, errors: [String(err)] };
        } finally {
            setIsImporting(false);
        }
    }, [slot, refresh]);

    // ═══════════════════════════════════════════════════════════════════════
    // RETURN
    // ═══════════════════════════════════════════════════════════════════════

    return {
        // State
        items,
        total,
        page,
        pageSize,
        totalPages,
        sort,
        sortDir,
        search,
        filters,
        selectedIds,
        stats,
        isLoading,
        isCreating,
        isUpdating,
        isDeleting,
        isExporting,
        isImporting,
        error,

        // Encryption state
        isEncrypted,
        isSearchDisabled,
        isFilterDisabled,
        isSortDisabled,
        // Blind indexing state
        blindIndexEnabled,
        searchableFields,

        // Actions
        fetchData,
        fetchStats,
        setPage: handleSetPage,
        setPageSize: handleSetPageSize,
        setSort: handleSetSort,
        setSearch: handleSetSearch,
        setFilter: handleSetFilter,
        clearFilters,

        // CRUD
        createRecord,
        updateRecord,
        deleteRecord,
        bulkDelete,

        // Selection
        selectItem,
        deselectItem,
        selectAll,
        deselectAll,
        toggleSelection,
        isSelected,

        // Import/Export
        exportCSV,
        importCSV,

        // Refresh
        refresh,
    };
}

export default useMassiveData;
