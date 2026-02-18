import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Image, Search, X, Check, Grid3X3, List, Loader2 } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { apiClient } from '@/api/client';

interface MediaItem {
    name: string;
    url: string;
    size: number;
    size_human: string;
    mime_type: string;
    type: 'image' | 'video' | 'audio' | 'document' | 'other';
    modified_at: string;
}

interface MediaPickerProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (url: string) => void;
    onUpload?: (file: File) => Promise<string>;
    allowedTypes?: ('image' | 'video' | 'audio' | 'document')[];
    title?: string;
}

export function MediaPicker({
    isOpen,
    onClose,
    onSelect,
    onUpload,
    allowedTypes = ['image'],
    title = 'Média kiválasztása'
}: MediaPickerProps) {
    const [activeTab, setActiveTab] = useState<'upload' | 'library'>('library');
    const [items, setItems] = useState<MediaItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [selectedItem, setSelectedItem] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [uploading, setUploading] = useState(false);
    const [debouncedSearch, setDebouncedSearch] = useState('');

    const observerRef = useRef<IntersectionObserver | null>(null);
    const loadMoreRef = useRef<HTMLDivElement>(null);
    const fetchedRef = useRef(false);

    // Memoize allowedTypes to prevent unnecessary re-renders
    const allowedTypesKey = useMemo(() => allowedTypes.sort().join(','), [allowedTypes]);

    // Debounce search input
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search);
        }, 300);
        return () => clearTimeout(timer);
    }, [search]);

    // Fetch media items using apiClient with proper authentication
    const fetchMedia = useCallback(async (pageNum: number, searchQuery: string, append = false) => {
        setLoading(true);
        try {
            // Use apiClient which automatically includes JWT Authorization header
            const response = await apiClient.get('/endpoints/media.php');
            const data = response.data;

            // Transform response to match our component's expected format
            // media.php returns { success, files, total, totalSize }
            const mediaItems: MediaItem[] = (data.files || []).map((file: any) => {
                const ext = file.extension?.toLowerCase();
                const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif'];
                const videoExts = ['mp4', 'webm', 'mov', 'avi', 'mkv'];
                const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'webm'];

                let type: 'image' | 'video' | 'audio' | 'document' | 'other' = 'other';
                if (imageExts.includes(ext)) type = 'image';
                else if (videoExts.includes(ext)) type = 'video';
                else if (audioExts.includes(ext)) type = 'audio';

                return {
                    name: file.filename,
                    url: file.url,
                    size: file.size,
                    size_human: file.sizeFormatted,
                    mime_type: file.mimeType,
                    type,
                    modified_at: file.modifiedAt,
                };
            });

            // Client-side filtering (since media.php doesn't have server-side filter)
            let filtered = mediaItems;
            if (searchQuery) {
                filtered = mediaItems.filter(item =>
                    item.name.toLowerCase().includes(searchQuery.toLowerCase())
                );
            }
            // Use the stable key for filtering
            const typesToFilter = allowedTypesKey.split(',').filter(Boolean);
            if (typesToFilter.length > 0) {
                filtered = filtered.filter(item =>
                    typesToFilter.includes(item.type)
                );
            }

            // Client-side pagination
            const limit = 30;
            const offset = (pageNum - 1) * limit;
            const paginatedItems = filtered.slice(offset, offset + limit);

            setItems(prev => append ? [...prev, ...paginatedItems] : paginatedItems);
            setTotalPages(Math.ceil(filtered.length / limit));
            setPage(pageNum);
        } catch (err) {
            console.error('Failed to fetch media:', err);
        } finally {
            setLoading(false);
        }
    }, [allowedTypesKey]);

    // Load initial data when modal opens
    useEffect(() => {
        if (isOpen && activeTab === 'library' && !fetchedRef.current) {
            fetchedRef.current = true;
            setItems([]);
            setPage(1);
            fetchMedia(1, debouncedSearch);
        }
        
        // Reset fetch flag when modal closes
        if (!isOpen) {
            fetchedRef.current = false;
        }
    }, [isOpen, activeTab]);

    // Re-fetch when search changes (debounced)
    useEffect(() => {
        if (isOpen && activeTab === 'library' && fetchedRef.current) {
            setItems([]);
            setPage(1);
            fetchMedia(1, debouncedSearch);
        }
    }, [debouncedSearch, fetchMedia]);

    // Infinite scroll observer
    useEffect(() => {
        if (observerRef.current) observerRef.current.disconnect();

        observerRef.current = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && page < totalPages && !loading) {
                fetchMedia(page + 1, debouncedSearch, true);
            }
        });

        if (loadMoreRef.current) {
            observerRef.current.observe(loadMoreRef.current);
        }

        return () => observerRef.current?.disconnect();
    }, [page, totalPages, loading, fetchMedia, debouncedSearch]);

    // Handle file upload
    const handleUpload = useCallback(async (files: File[]) => {
        if (!onUpload || files.length === 0) return;

        setUploading(true);
        try {
            const url = await onUpload(files[0]);
            onSelect(url);
            onClose();
        } catch (err) {
            console.error('Upload failed:', err);
        } finally {
            setUploading(false);
        }
    }, [onUpload, onSelect, onClose]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop: handleUpload,
        accept: allowedTypes.includes('video')
            ? {
                'image/*': ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif'],
                'video/*': ['.mp4', '.webm', '.mov', '.avi', '.mkv']
            }
            : {
                'image/*': ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif']
            },
        maxFiles: 1,
        disabled: uploading
    });

    // Handle selection confirm
    const handleConfirm = () => {
        if (selectedItem) {
            onSelect(selectedItem);
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    className="relative w-full max-w-5xl h-[85vh] bg-background border border-border shadow-2xl flex flex-col overflow-hidden"
                    onClick={e => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-8 py-6 border-b border-border">
                        <div className="flex items-center gap-4">
                            <div className="w-2 h-2 bg-foreground" />
                            <h2 className="text-xl font-bold tracking-tight uppercase">{title}</h2>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* Tabs */}
                    <div className="flex border-b border-border bg-background/50">
                        <button
                            onClick={() => setActiveTab('library')}
                            className={`flex items-center gap-3 px-8 py-4 text-xs font-mono uppercase tracking-widest transition-colors border-r border-border ${activeTab === 'library'
                                ? 'bg-foreground text-background'
                                : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
                                }`}
                        >
                            <Image size={14} />
                            Könyvtár
                        </button>
                        <button
                            onClick={() => setActiveTab('upload')}
                            className={`flex items-center gap-3 px-8 py-4 text-xs font-mono uppercase tracking-widest transition-colors border-r border-border ${activeTab === 'upload'
                                ? 'bg-foreground text-background'
                                : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
                                }`}
                        >
                            <Upload size={14} />
                            Feltöltés
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-hidden flex flex-col bg-muted/10 relative">
                        {/* Architectural Grid Background */}
                        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{
                            backgroundImage: `radial-gradient(circle, currentColor 1px, transparent 1px)`,
                            backgroundSize: '24px 24px'
                        }} />

                        {activeTab === 'library' ? (
                            <>
                                {/* Search and filters */}
                                <div className="flex items-center gap-6 px-8 py-4 border-b border-border bg-background/80 backdrop-blur-sm z-10">
                                    <div className="relative flex-1 max-w-md">
                                        <Search className="absolute left-0 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                                        <input
                                            type="text"
                                            placeholder="KERESÉS..."
                                            value={search}
                                            onChange={e => setSearch(e.target.value)}
                                            className="input-field pl-8 font-mono text-sm uppercase"
                                        />
                                    </div>
                                    <div className="flex border border-border">
                                        <button
                                            onClick={() => setViewMode('grid')}
                                            className={`p-2 transition-colors ${viewMode === 'grid' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'}`}
                                        >
                                            <Grid3X3 size={16} />
                                        </button>
                                        <div className="w-px bg-border" />
                                        <button
                                            onClick={() => setViewMode('list')}
                                            className={`p-2 transition-colors ${viewMode === 'list' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'}`}
                                        >
                                            <List size={16} />
                                        </button>
                                    </div>
                                </div>

                                {/* Media grid/list */}
                                <div className="flex-1 overflow-y-auto p-8 relative z-0">
                                    {loading && items.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center h-full gap-4">
                                            <Loader2 className="animate-spin text-muted-foreground" size={32} />
                                            <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Betöltés...</span>
                                        </div>
                                    ) : items.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-4">
                                            <div className="p-6 border border-border border-dashed">
                                                <Image size={48} className="opacity-20" />
                                            </div>
                                            <p className="font-mono text-xs uppercase tracking-widest">Nincs média a könyvtárban</p>
                                        </div>
                                    ) : viewMode === 'grid' ? (
                                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
                                            {items.map(item => (
                                                <button
                                                    key={item.url}
                                                    onClick={() => setSelectedItem(item.url)}
                                                    className={`group relative aspect-square border bg-background overflow-hidden transition-all duration-300 ${selectedItem === item.url
                                                        ? 'border-foreground ring-1 ring-foreground'
                                                        : 'border-border hover:border-foreground/50'
                                                        }`}
                                                >
                                                    {item.type === 'image' ? (
                                                        <div className="w-full h-full p-2">
                                                            <div className="w-full h-full relative overflow-hidden bg-muted/20 border border-border/50">
                                                                <img
                                                                    src={item.url}
                                                                    alt={item.name}
                                                                    className={`w-full h-full object-cover transition-all duration-500 ${selectedItem === item.url ? 'scale-105' : 'group-hover:scale-105'}`}
                                                                    loading="lazy"
                                                                />
                                                            </div>
                                                        </div>
                                                    ) : item.type === 'video' ? (
                                                        <div className="w-full h-full p-2 relative">
                                                            <div className="w-full h-full relative overflow-hidden bg-muted/30 border border-border/50 flex items-center justify-center">
                                                                <video
                                                                    src={item.url}
                                                                    className="w-full h-full object-cover"
                                                                    muted
                                                                    preload="metadata"
                                                                />
                                                                {/* Video play icon overlay */}
                                                                <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/20 transition-colors">
                                                                    <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center">
                                                                        <svg className="w-5 h-5 text-black ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                                                                            <path d="M8 5v14l11-7z" />
                                                                        </svg>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center bg-muted/10">
                                                            <span className="font-mono text-xs text-muted-foreground uppercase tracking-widest group-hover:text-foreground transition-colors">
                                                                {item.name.split('.').pop()}
                                                            </span>
                                                        </div>
                                                    )}

                                                    {/* Selection Indicator */}
                                                    <AnimatePresence>
                                                        {selectedItem === item.url && (
                                                            <motion.div
                                                                initial={{ opacity: 0 }}
                                                                animate={{ opacity: 1 }}
                                                                exit={{ opacity: 0 }}
                                                                className="absolute top-3 right-3 z-10"
                                                            >
                                                                <div className="w-5 h-5 bg-foreground text-background flex items-center justify-center">
                                                                    <Check size={12} strokeWidth={3} />
                                                                </div>
                                                            </motion.div>
                                                        )}
                                                    </AnimatePresence>

                                                    {/* Info Overlay */}
                                                    <div className="absolute inset-x-0 bottom-0 p-3 bg-background/90 backdrop-blur-sm border-t border-border translate-y-full group-hover:translate-y-0 transition-transform duration-300">
                                                        <p className="font-mono text-[10px] uppercase truncate text-foreground">{item.name}</p>
                                                        <p className="font-mono text-[9px] text-muted-foreground mt-0.5">{item.size_human}</p>
                                                    </div>
                                                </button>
                                            ))}
                                            <div ref={loadMoreRef} className="col-span-full h-12" />
                                        </div>
                                    ) : (
                                        <div className="space-y-px bg-border border border-border">
                                            {items.map(item => (
                                                <button
                                                    key={item.url}
                                                    onClick={() => setSelectedItem(item.url)}
                                                    className={`w-full flex items-center gap-6 p-4 bg-background transition-colors hover:bg-muted/30 ${selectedItem === item.url
                                                        ? 'bg-muted/50'
                                                        : ''
                                                        }`}
                                                >
                                                    <div className="w-10 h-10 border border-border bg-muted/10 flex-shrink-0 flex items-center justify-center overflow-hidden">
                                                        {item.type === 'image' ? (
                                                            <img src={item.url} alt={item.name} className="w-full h-full object-cover" />
                                                        ) : item.type === 'video' ? (
                                                            <div className="relative w-full h-full bg-black/20 flex items-center justify-center">
                                                                <svg className="w-4 h-4 text-foreground" fill="currentColor" viewBox="0 0 24 24">
                                                                    <path d="M8 5v14l11-7z" />
                                                                </svg>
                                                            </div>
                                                        ) : (
                                                            <span className="font-mono text-[9px] uppercase">{item.name.split('.').pop()}</span>
                                                        )}
                                                    </div>
                                                    <div className="flex-1 text-left min-w-0">
                                                        <p className="font-mono text-xs uppercase tracking-wide truncate text-foreground">{item.name}</p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="font-mono text-[10px] text-muted-foreground">{item.size_human}</p>
                                                    </div>
                                                    <div className="w-6 flex justify-end">
                                                        {selectedItem === item.url && <Check size={14} className="text-foreground" />}
                                                    </div>
                                                </button>
                                            ))}
                                            <div ref={loadMoreRef} className="h-4" />
                                        </div>
                                    )}
                                </div>
                            </>
                        ) : (
                            /* Upload tab */
                            <div className="flex-1 flex flex-col items-center justify-center p-12 bg-muted/5">
                                <div
                                    {...getRootProps()}
                                    className={`w-full max-w-xl aspect-video flex flex-col items-center justify-center border border-dashed transition-all cursor-pointer group relative overflow-hidden ${isDragActive
                                        ? 'border-foreground bg-foreground/5'
                                        : 'border-border hover:border-foreground/50'
                                        }`}
                                >
                                    <input {...getInputProps()} />

                                    {/* Crosshairs */}
                                    <div className="absolute top-0 left-0 w-3 h-3 border-t border-l border-foreground opacity-20 pointer-events-none group-hover:opacity-100 transition-opacity" />
                                    <div className="absolute top-0 right-0 w-3 h-3 border-t border-r border-foreground opacity-20 pointer-events-none group-hover:opacity-100 transition-opacity" />
                                    <div className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-foreground opacity-20 pointer-events-none group-hover:opacity-100 transition-opacity" />
                                    <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-foreground opacity-20 pointer-events-none group-hover:opacity-100 transition-opacity" />

                                    {uploading ? (
                                        <div className="flex flex-col items-center gap-4">
                                            <Loader2 className="animate-spin text-foreground" size={32} />
                                            <p className="font-mono text-xs uppercase tracking-widest animate-pulse">Feltöltés folyamatban...</p>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="mb-6 p-4 border border-border rounded-full group-hover:border-foreground group-hover:scale-110 transition-all duration-500">
                                                <Upload className="text-muted-foreground group-hover:text-foreground transition-colors" size={32} strokeWidth={1.5} />
                                            </div>
                                            <p className="font-bold tracking-tight text-lg mb-2">
                                                {isDragActive ? 'EJTSD IDE A FÁJLT' : 'FÁJL FELTÖLTÉSE'}
                                            </p>
                                            <p className="font-mono text-xs text-muted-foreground uppercase tracking-widest">
                                                Húzd ide vagy kattints a tallózáshoz
                                            </p>
                                        </>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between px-8 py-6 border-t border-border bg-background">
                        <div className="flex items-center gap-2">
                            {selectedItem && (
                                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                                    Kiválasztva: <span className="text-foreground">{selectedItem.split('/').pop()}</span>
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-4">
                            <button
                                onClick={onClose}
                                className="btn btn-secondary"
                            >
                                Mégse
                            </button>
                            <button
                                onClick={handleConfirm}
                                disabled={!selectedItem}
                                className="btn btn-primary"
                            >
                                Kiválasztás
                            </button>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );

}

export default MediaPicker;
