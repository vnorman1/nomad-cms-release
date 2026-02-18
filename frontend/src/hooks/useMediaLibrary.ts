/**
 * useMediaLibrary Hook
 * Manages media library state, fetching, filtering, and operations
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
    getMediaLibrary, 
    getMediaFileInfo, 
    deleteMediaFile,
    MediaFile, 
    MediaFileWithUsage,
    MediaUsage 
} from '@/api/media';

export type SortField = 'filename' | 'size' | 'modifiedAt' | 'createdAt';
export type SortDirection = 'asc' | 'desc';
export type ViewMode = 'grid' | 'list';

interface UseMediaLibraryOptions {
    autoFetch?: boolean;
}

interface UseMediaLibraryReturn {
    // Data
    files: MediaFile[];
    total: number;
    totalSize: number;
    totalSizeFormatted: string;
    
    // Loading states
    loading: boolean;
    loadingFile: string | null;
    
    // Selected file
    selectedFile: MediaFileWithUsage | null;
    
    // Filters & sorting
    searchQuery: string;
    sortField: SortField;
    sortDirection: SortDirection;
    viewMode: ViewMode;
    
    // Actions
    refresh: () => Promise<void>;
    selectFile: (filename: string) => Promise<void>;
    clearSelection: () => void;
    deleteFile: (filename: string, force?: boolean) => Promise<{ success: boolean; error?: string; usages?: MediaUsage[] }>;
    setSearchQuery: (query: string) => void;
    setSortField: (field: SortField) => void;
    setSortDirection: (direction: SortDirection) => void;
    toggleSortDirection: () => void;
    setViewMode: (mode: ViewMode) => void;
    
    // Computed
    filteredFiles: MediaFile[];
}

export function useMediaLibrary(options: UseMediaLibraryOptions = {}): UseMediaLibraryReturn {
    const { autoFetch = true } = options;
    
    // Core state
    const [files, setFiles] = useState<MediaFile[]>([]);
    const [total, setTotal] = useState(0);
    const [totalSize, setTotalSize] = useState(0);
    const [totalSizeFormatted, setTotalSizeFormatted] = useState('0 B');
    
    // Loading states
    const [loading, setLoading] = useState(true);
    const [loadingFile, setLoadingFile] = useState<string | null>(null);
    
    // Selected file with usage info
    const [selectedFile, setSelectedFile] = useState<MediaFileWithUsage | null>(null);
    
    // Filters & sorting
    const [searchQuery, setSearchQuery] = useState('');
    const [sortField, setSortField] = useState<SortField>('modifiedAt');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [viewMode, setViewMode] = useState<ViewMode>('grid');
    
    // Fetch all media files
    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const response = await getMediaLibrary();
            if (response.success) {
                setFiles(response.files);
                setTotal(response.total);
                setTotalSize(response.totalSize);
                setTotalSizeFormatted(response.totalSizeFormatted);
            }
        } catch (error) {
            console.error('Failed to fetch media library:', error);
        } finally {
            setLoading(false);
        }
    }, []);
    
    // Select a file - usage info is already included in the list response (optimized)
    const selectFile = useCallback(async (filename: string) => {
        // Try to find in local cache first (already has usage info from getAllMediaFiles)
        const cachedFile = files.find(f => f.filename === filename);
        if (cachedFile) {
            setSelectedFile(cachedFile as MediaFileWithUsage);
            return;
        }
        
        // Fallback to API call if not in cache
        setLoadingFile(filename);
        try {
            const response = await getMediaFileInfo(filename);
            if (response.success && response.file) {
                setSelectedFile(response.file);
            }
        } catch (error) {
            console.error('Failed to fetch file info:', error);
        } finally {
            setLoadingFile(null);
        }
    }, [files]);
    
    // Clear selection
    const clearSelection = useCallback(() => {
        setSelectedFile(null);
    }, []);
    
    // Delete a file
    const deleteFile = useCallback(async (filename: string, force: boolean = false) => {
        try {
            const response = await deleteMediaFile(filename, force);
            if (response.success) {
                // Remove from local state
                setFiles(prev => prev.filter(f => f.filename !== filename));
                setTotal(prev => prev - 1);
                
                // Clear selection if deleted file was selected
                if (selectedFile?.filename === filename) {
                    setSelectedFile(null);
                }
            }
            return response;
        } catch (error: any) {
            return { success: false, error: error?.message || 'Delete failed' };
        }
    }, [selectedFile]);
    
    // Toggle sort direction
    const toggleSortDirection = useCallback(() => {
        setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    }, []);
    
    // Filter and sort files
    const filteredFiles = useMemo(() => {
        let result = [...files];
        
        // Filter by search query
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            result = result.filter(file => 
                file.filename.toLowerCase().includes(query)
            );
        }
        
        // Sort
        result.sort((a, b) => {
            let comparison = 0;
            
            switch (sortField) {
                case 'filename':
                    comparison = a.filename.localeCompare(b.filename);
                    break;
                case 'size':
                    comparison = a.size - b.size;
                    break;
                case 'modifiedAt':
                    comparison = new Date(a.modifiedAt).getTime() - new Date(b.modifiedAt).getTime();
                    break;
                case 'createdAt':
                    comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
                    break;
            }
            
            return sortDirection === 'asc' ? comparison : -comparison;
        });
        
        return result;
    }, [files, searchQuery, sortField, sortDirection]);
    
    // Auto fetch on mount
    useEffect(() => {
        if (autoFetch) {
            refresh();
        }
    }, [autoFetch, refresh]);
    
    return {
        // Data
        files,
        total,
        totalSize,
        totalSizeFormatted,
        
        // Loading states
        loading,
        loadingFile,
        
        // Selected file
        selectedFile,
        
        // Filters & sorting
        searchQuery,
        sortField,
        sortDirection,
        viewMode,
        
        // Actions
        refresh,
        selectFile,
        clearSelection,
        deleteFile,
        setSearchQuery,
        setSortField,
        setSortDirection,
        toggleSortDirection,
        setViewMode,
        
        // Computed
        filteredFiles,
    };
}
