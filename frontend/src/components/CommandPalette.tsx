import { useState, useEffect, useMemo, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Search, FileText, Layout, Database, Loader2,
    Hash, Text, Clock, ChevronDown, Image, Webhook, Users, ScrollText, Settings,
    CornerDownLeft
} from 'lucide-react';
import { ADMIN_CONFIG } from '@/config/admin.config';
import { deepSearch } from '@/api/data';
import type { SearchResult } from '@/api/types';
import { useAuth } from '@/context/AuthContext';

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState(value);

    useEffect(() => {
        const handler = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(handler);
    }, [value, delay]);

    return debouncedValue;
}

// Result item type
interface NavigationItem {
    id: string;
    label: string;
    description: string;
    path: string;
    type: 'module' | 'content';
    icon: typeof FileText;
    slotType?: string;
    score?: number;
    field?: string;
    context?: string;
}

// Expose methods via ref
export interface CommandPaletteHandle {
    open: (initialQuery?: string) => void;
    close: () => void;
    toggle: () => void;
}

const CommandPalette = forwardRef<CommandPaletteHandle>((_, ref) => {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [isSearching, setIsSearching] = useState(false);
    const [contentResults, setContentResults] = useState<SearchResult[]>([]);
    const [showContentResults, setShowContentResults] = useState(false);
    const navigate = useNavigate();
    const { user } = useAuth();
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const debouncedQuery = useDebounce(query, 300);

    // Expose methods to parent via ref
    useImperativeHandle(ref, () => ({
        open: (initialQuery?: string) => {
            setQuery(initialQuery || '');
            setSelectedIndex(0);
            setContentResults([]);
            setShowContentResults(false);
            setOpen(true);
        },
        close: () => setOpen(false),
        toggle: () => setOpen(prev => !prev)
    }));

    // Toggle on CMD+K / CTRL+K
    useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setOpen((open) => !open);
                setQuery('');
                setSelectedIndex(0);
                setContentResults([]);
                setShowContentResults(false);
            }
        };
        document.addEventListener('keydown', down);
        return () => document.removeEventListener('keydown', down);
    }, []);

    // Navigation Data (Modules + Admin Pages)
    const moduleItems = useMemo<NavigationItem[]>(() => {
        const items: NavigationItem[] = Object.entries(ADMIN_CONFIG).map(([key, config]) => ({
            id: key,
            label: config.label,
            description: config.description || 'Modul kezelése',
            path: `/edit/${key}`,
            type: 'module' as const,
            slotType: config.type,
            icon: config.type === 'collection' ? Database : config.type === 'list' ? Layout : FileText,
            score: 100
        }));

        // Common pages for all users
        items.push({
            id: 'settings',
            label: 'Beállítások',
            description: 'Fiók és alkalmazás beállítások',
            path: '/settings',
            type: 'module' as const,
            icon: Settings,
            score: 100
        });

        if (user?.is_admin) {
            items.push(
                {
                    id: 'media-library',
                    label: 'Médiatár',
                    description: 'Fájlok és képek kezelése',
                    path: '/media',
                    type: 'module' as const,
                    icon: Image,
                    score: 100
                },
                {
                    id: 'users',
                    label: 'Felhasználók',
                    description: 'Felhasználók és jogosultságok',
                    path: '/users',
                    type: 'module' as const,
                    icon: Users,
                    score: 100
                },
                {
                    id: 'webhooks',
                    label: 'Webhookok',
                    description: 'Webhook napló és beállítások',
                    path: '/webhooks',
                    type: 'module' as const,
                    icon: Webhook,
                    score: 100
                },
                {
                    id: 'logs',
                    label: 'Naplók',
                    description: 'Rendszer események megtekintése',
                    path: '/logs',
                    type: 'module' as const,
                    icon: ScrollText,
                    score: 100
                }
            );
        }

        return items;
    }, [user?.is_admin]);

    // Deep search when query changes
    useEffect(() => {
        const performSearch = async () => {
            if (debouncedQuery.length < 2) {
                setContentResults([]);
                setIsSearching(false);
                return;
            }

            // Skip regex patterns for deep search
            if (debouncedQuery.startsWith('/')) {
                setContentResults([]);
                setIsSearching(false);
                return;
            }

            setIsSearching(true);

            try {
                const response = await deepSearch(debouncedQuery, { limit: 15 });
                if (response.success) {
                    setContentResults(response.results);
                }
            } catch (error) {
                console.error('Search failed:', error);
            } finally {
                setIsSearching(false);
            }
        };

        performSearch();
    }, [debouncedQuery]);

    // Filter module items
    const filteredModuleItems = useMemo<NavigationItem[]>(() => {
        if (!query) return moduleItems;

        // Regex Search (/pattern/)
        if (query.startsWith('/') && query.length > 1) {
            try {
                const pattern = query.endsWith('/') ? query.slice(1, -1) : query.slice(1);
                // @ts-ignore
                const re = new RegExp(pattern, 'i');
                return moduleItems.filter(item => re.test(item.label) || re.test(item.description));
            } catch {
                return [];
            }
        }

        // Fuzzy Search
        const lowerQuery = query.toLowerCase();
        return moduleItems
            .filter(item =>
                item.label.toLowerCase().includes(lowerQuery) ||
                item.description.toLowerCase().includes(lowerQuery) ||
                item.id.toLowerCase().includes(lowerQuery)
            )
            .map(item => ({
                ...item,
                score: item.label.toLowerCase().includes(lowerQuery) ? 150 : 100
            }))
            .sort((a, b) => (b.score || 0) - (a.score || 0));
    }, [query, moduleItems]);

    // Convert content results to navigation items
    const contentItems = useMemo<NavigationItem[]>(() => {
        return contentResults.map((result, idx) => {
            const config = ADMIN_CONFIG[result.slot];
            const isCollectionItem = result.type === 'collection_item' && result.index !== undefined;

            return {
                id: `content-${idx}`,
                label: isCollectionItem
                    ? result.itemTitle || `Item #${(result.index ?? 0) + 1}`
                    : config?.label || result.slot,
                description: result.context,
                path: isCollectionItem
                    ? `/edit/${result.slot}?item=${result.index}`
                    : `/edit/${result.slot}`,
                type: 'content' as const,
                icon: Text,
                slotType: config?.type,
                score: result.score,
                field: result.field,
                context: result.context
            };
        });
    }, [contentResults]);

    // Combine all items for keyboard navigation
    const allItems = useMemo(() => {
        const items: NavigationItem[] = [...filteredModuleItems];
        if (showContentResults && contentItems.length > 0) {
            items.push(...contentItems);
        }
        return items;
    }, [filteredModuleItems, contentItems, showContentResults]);

    // Keyboard Navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!open) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex(prev => (prev + 1) % allItems.length);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex(prev => (prev - 1 + allItems.length) % allItems.length);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (allItems[selectedIndex]) {
                    navigate(allItems[selectedIndex].path);
                    setOpen(false);
                }
            } else if (e.key === 'Escape') {
                setOpen(false);
            } else if (e.key === 'Tab' && contentItems.length > 0) {
                e.preventDefault();
                setShowContentResults(prev => !prev);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [open, allItems, selectedIndex, navigate, contentItems.length]);

    // Reset selection when list changes
    useEffect(() => {
        setSelectedIndex(0);
    }, [allItems]);

    // Auto-scroll to selected item
    useEffect(() => {
        if (!listRef.current) return;
        const selectedElement = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
        if (selectedElement) {
            selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }, [selectedIndex]);

    // Navigate to item
    const handleSelect = useCallback((item: NavigationItem) => {
        navigate(item.path);
        setOpen(false);
    }, [navigate]);

    // Highlight match in text
    const highlightMatch = (text: string, query: string) => {
        if (!query || query.length < 2) return text;
        const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        const parts = text.split(regex);
        return parts.map((part, i) =>
            regex.test(part)
                ? <span key={i} className="text-foreground font-semibold bg-foreground/10 px-0.5">{part}</span>
                : part
        );
    };

    return (
        <AnimatePresence>
            {open && (
                <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4">
                    {/* Simplified Backdrop - Sharp & Dark for stronger focus */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 bg-black/60"
                        onClick={() => setOpen(false)}
                    />

                    <motion.div
                        initial={{ scale: 0.98, opacity: 0, y: -10 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.98, opacity: 0, y: -10 }}
                        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }} // Swift/sharp ease
                        className="relative w-full max-w-2xl bg-background border border-border shadow-2xl flex flex-col font-mono rounded-none"
                    >
                        {/* Search Input - Architectural Style */}
                        <div className="flex items-center px-6 py-5 border-b border-border bg-background">
                            <Search className="w-5 h-5 text-muted-foreground mr-4 flex-shrink-0" strokeWidth={1.5} />
                            <input
                                ref={inputRef}
                                type="text"
                                autoFocus
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                placeholder="TYPE A COMMAND OR SEARCH..."
                                className="flex-1 bg-transparent border-none text-lg text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-0 font-sans tracking-tight"
                            />
                            {isSearching && (
                                <Loader2 className="w-4 h-4 text-muted-foreground animate-spin mr-2" />
                            )}
                            <div className="hidden sm:flex items-center gap-2">
                                <span className="text-[10px] font-mono text-muted-foreground border border-border px-1.5 py-0.5">ESC</span>
                            </div>
                        </div>

                        {/* Results List */}
                        <div ref={listRef} className="max-h-[55vh] overflow-y-auto py-2 bg-background">
                            {/* Module Results */}
                            {filteredModuleItems.length > 0 && (
                                <div className="pb-2">
                                    <div className="px-6 py-2 text-[10px] text-muted-foreground font-mono uppercase tracking-widest flex items-center gap-2 opacity-70">
                                        <Hash size={10} />
                                        <span>Modules</span>
                                    </div>
                                    {filteredModuleItems.map((item, index) => {
                                        const Icon = item.icon;
                                        const isSelected = index === selectedIndex;

                                        return (
                                            <button
                                                key={item.id}
                                                data-index={index}
                                                onClick={() => handleSelect(item)}
                                                onMouseEnter={() => setSelectedIndex(index)}
                                                className={`w-full px-6 py-3 flex items-center justify-between group transition-colors duration-100 border-l-2
                                                    ${isSelected
                                                        ? 'bg-secondary/40 border-foreground text-foreground'
                                                        : 'border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground'}
                                                `}
                                            >
                                                <div className="flex items-center gap-4">
                                                    <div className={`p-1.5 transition-colors ${isSelected ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'}`}>
                                                        <Icon size={18} strokeWidth={1.5} />
                                                    </div>
                                                    <div className="text-left">
                                                        <div className={`text-sm tracking-wide font-sans ${isSelected ? 'font-medium' : 'font-normal'}`}>
                                                            {highlightMatch(item.label, query)}
                                                        </div>
                                                        <div className="text-[10px] font-mono uppercase tracking-widest opacity-60">
                                                            {item.description}
                                                        </div>
                                                    </div>
                                                </div>

                                                {isSelected && (
                                                    <CornerDownLeft size={14} className="text-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Content Results Toggle */}
                            {contentItems.length > 0 && (
                                <div className="border-t border-border pt-2 mt-2">
                                    <button
                                        onClick={() => setShowContentResults(prev => !prev)}
                                        className="w-full px-6 py-2 flex items-center justify-between text-muted-foreground hover:text-foreground transition-colors group"
                                    >
                                        <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest">
                                            <div className="w-4 h-4 flex items-center justify-center border border-border group-hover:border-foreground/50 transition-colors">
                                                <Text size={10} />
                                            </div>
                                            <span>Content Results ({contentItems.length})</span>
                                        </div>
                                        <motion.div
                                            animate={{ rotate: showContentResults ? 180 : 0 }}
                                            transition={{ duration: 0.2 }}
                                        >
                                            <ChevronDown size={14} />
                                        </motion.div>
                                    </button>

                                    <AnimatePresence>
                                        {showContentResults && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.2 }}
                                                className="overflow-hidden"
                                            >
                                                {contentItems.map((item, idx) => {
                                                    const absoluteIndex = filteredModuleItems.length + idx;
                                                    const isSelected = absoluteIndex === selectedIndex;

                                                    return (
                                                        <button
                                                            key={item.id}
                                                            data-index={absoluteIndex}
                                                            onClick={() => handleSelect(item)}
                                                            onMouseEnter={() => setSelectedIndex(absoluteIndex)}
                                                            className={`w-full px-6 py-3 flex items-start justify-between group transition-colors duration-100 border-l-2
                                                                ${isSelected
                                                                    ? 'bg-secondary/40 border-foreground text-foreground'
                                                                    : 'border-transparent text-muted-foreground hover:bg-secondary/10 hover:text-foreground'}
                                                            `}
                                                        >
                                                            <div className="flex items-start gap-4 flex-1 min-w-0">
                                                                <div className={`mt-0.5 flex-shrink-0 ${isSelected ? 'text-foreground' : 'text-muted-foreground/60'}`}>
                                                                    <Text size={14} />
                                                                </div>
                                                                <div className="min-w-0 flex-1 text-left">
                                                                    <div className="flex items-center gap-2 mb-0.5">
                                                                        <span className="text-sm font-sans truncate">
                                                                            {highlightMatch(item.label, query)}
                                                                        </span>
                                                                        {item.field && (
                                                                            <span className="text-[9px] border border-border px-1 py-0.5 text-muted-foreground font-mono uppercase">
                                                                                {item.field}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <div className="text-[11px] font-mono text-muted-foreground/70 leading-relaxed line-clamp-2">
                                                                        {highlightMatch(item.context || '', query)}
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {isSelected && (
                                                                <CornerDownLeft size={14} className="text-foreground/50 flex-shrink-0 mt-1" />
                                                            )}
                                                        </button>
                                                    );
                                                })}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            )}

                            {/* No Results */}
                            {filteredModuleItems.length === 0 && contentItems.length === 0 && !isSearching && query.length >= 2 && (
                                <div className="px-6 py-12 text-center text-muted-foreground text-xs font-mono uppercase tracking-widest border-t border-border">
                                    No results found
                                </div>
                            )}

                            {/* Searching indicator */}
                            {isSearching && query.length >= 2 && (
                                <div className="px-6 py-8 text-center border-t border-border md:border-t-0">
                                    <Loader2 className="w-5 h-5 text-muted-foreground animate-spin mx-auto mb-3" />
                                    <div className="text-muted-foreground text-[10px] font-mono uppercase tracking-widest">
                                        Searching content...
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Footer Hints */}
                        <div className="px-6 py-3 border-t border-border bg-secondary/5 flex items-center justify-between text-[10px] text-muted-foreground font-mono uppercase tracking-widest">
                            <div className="flex gap-4">
                                <span className="flex items-center gap-1.5">
                                    <span className="bg-background border border-border px-1 py-0.5 min-w-[18px] text-center">↑↓</span>
                                    <span>Navigate</span>
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <span className="bg-background border border-border px-1 py-0.5 min-w-[18px] text-center">↵</span>
                                    <span>Select</span>
                                </span>
                                {contentItems.length > 0 && (
                                    <span className="flex items-center gap-1.5">
                                        <span className="bg-background border border-border px-1 py-0.5 text-center">TAB</span>
                                        <span>Expand</span>
                                    </span>
                                )}
                            </div>
                            <div className="flex gap-4">
                                <span className="opacity-60">Regex /.../</span>
                                <span className="flex items-center gap-1.5 opacity-60">
                                    <Clock size={10} />
                                    Deep Search
                                </span>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
});

CommandPalette.displayName = 'CommandPalette';

export default CommandPalette;

