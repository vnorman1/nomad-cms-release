// Endpoint Sidebar Component for API Playground
// Enhanced with better grouping - slots are grouped together

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Shield, Database, Cloud, LayoutGrid, ChevronRight, Star, FolderOpen } from 'lucide-react';
import { EndpointDef, METHOD_THEMES } from './types';

interface EndpointSidebarProps {
    endpoints: EndpointDef[];
    searchQuery: string;
    selectedEndpoint: EndpointDef;
    expandedCategory: string | null;
    onSearchChange: (query: string) => void;
    onSelectEndpoint: (endpoint: EndpointDef) => void;
    onToggleCategory: (category: string | null) => void;
}

const CATEGORY_ICONS = {
    custom: Star,
    content: Database,
    media: Cloud,
    auth: Shield,
    admin: LayoutGrid
} as const;

const CATEGORY_LABELS = {
    custom: 'Custom',
    content: 'Content Slots',
    media: 'Media',
    auth: 'Authentication',
    admin: 'Administration'
} as const;

interface SlotGroup {
    slot: string;
    label: string;
    endpoints: EndpointDef[];
}

export function EndpointSidebar({
    endpoints,
    searchQuery,
    selectedEndpoint,
    expandedCategory,
    onSearchChange,
    onSelectEndpoint,
    onToggleCategory
}: EndpointSidebarProps) {
    const [expandedSlots, setExpandedSlots] = useState<Set<string>>(new Set());

    // Group endpoints by category and by slot within content
    const { groupedEndpoints, slotGroups, customEndpoints } = useMemo(() => {
        const lowerQ = searchQuery.toLowerCase();
        const filtered = endpoints.filter(e =>
            e.name.toLowerCase().includes(lowerQ) ||
            e.path.toLowerCase().includes(lowerQ) ||
            e.slot?.toLowerCase().includes(lowerQ)
        );

        // Separate custom endpoints (id starts with 'custom-')
        const custom = filtered.filter(e => e.id.startsWith('custom-'));
        
        // Content endpoints grouped by slot
        const contentEndpoints = filtered.filter(e => e.category === 'content' && !e.id.startsWith('custom-'));
        
        // Group content by slot
        const slotMap = new Map<string, EndpointDef[]>();
        const noSlotEndpoints: EndpointDef[] = [];
        
        contentEndpoints.forEach(ep => {
            if (ep.slot) {
                const existing = slotMap.get(ep.slot) || [];
                existing.push(ep);
                slotMap.set(ep.slot, existing);
            } else {
                noSlotEndpoints.push(ep);
            }
        });

        // Convert to slot groups array
        const slots: SlotGroup[] = Array.from(slotMap.entries()).map(([slot, eps]) => ({
            slot,
            label: eps[0]?.slotConfig?.label || slot,
            endpoints: eps.sort((a, b) => {
                // Sort by method: GET, POST, PUT, PATCH, DELETE
                const methodOrder = { GET: 0, POST: 1, PUT: 2, PATCH: 3, DELETE: 4 };
                return (methodOrder[a.method] || 5) - (methodOrder[b.method] || 5);
            })
        })).sort((a, b) => a.label.localeCompare(b.label));

        // Add "Other" group for endpoints without slots
        if (noSlotEndpoints.length > 0) {
            slots.push({
                slot: '__other__',
                label: 'Other',
                endpoints: noSlotEndpoints
            });
        }

        return {
            groupedEndpoints: {
                custom: custom,
                content: contentEndpoints,
                media: filtered.filter(e => e.category === 'media'),
                auth: filtered.filter(e => e.category === 'auth'),
                admin: filtered.filter(e => e.category === 'admin')
            },
            slotGroups: slots,
            customEndpoints: custom
        };
    }, [endpoints, searchQuery]);

    const toggleSlot = (slot: string) => {
        setExpandedSlots(prev => {
            const newSet = new Set(prev);
            if (newSet.has(slot)) {
                newSet.delete(slot);
            } else {
                newSet.add(slot);
            }
            return newSet;
        });
    };

    const renderEndpointButton = (ep: EndpointDef) => {
        const isSelected = selectedEndpoint.id === ep.id;
        const epTheme = METHOD_THEMES[ep.method];
        
        return (
            <button
                key={ep.id}
                onClick={() => onSelectEndpoint(ep)}
                className={`w-full text-left px-3 py-2 rounded-sm text-[11px] font-medium transition-all border border-transparent ${
                    isSelected
                        ? 'bg-background border-border shadow-sm text-foreground'
                        : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground'
                }`}
            >
                <div className="flex items-center gap-2">
                    <span className={`text-[9px] font-bold font-mono w-10 shrink-0 ${epTheme.text}`}>
                        {ep.method}
                    </span>
                    <span className="truncate">{ep.name}</span>
                </div>
            </button>
        );
    };

    // Categories to show (with custom first if has items)
    const categories = customEndpoints.length > 0 
        ? (['custom', 'content', 'media', 'auth', 'admin'] as const)
        : (['content', 'media', 'auth', 'admin'] as const);

    return (
        <aside className="w-72 border-r border-border flex flex-col bg-muted/10 shrink-0">
            {/* Search */}
            <div className="p-4 border-b border-border">
                <div className="relative group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={e => onSearchChange(e.target.value)}
                        placeholder="FIND ENDPOINT..."
                        className="w-full bg-background border border-border px-3 py-2 pl-9 text-xs font-mono focus:outline-none focus:border-foreground transition-all placeholder:text-muted-foreground/50 uppercase"
                    />
                </div>
            </div>

            {/* Endpoint List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {categories.map(category => {
                    const categoryEndpoints = groupedEndpoints[category];
                    if (!categoryEndpoints?.length && category !== 'content') return null;
                    if (category === 'content' && slotGroups.length === 0) return null;
                    
                    const isExpanded = expandedCategory === category;
                    const Icon = CATEGORY_ICONS[category];
                    const label = CATEGORY_LABELS[category];
                    const count = category === 'content' ? slotGroups.reduce((acc, g) => acc + g.endpoints.length, 0) : categoryEndpoints.length;

                    return (
                        <div key={category} className="mb-2">
                            {/* Category Header */}
                            <button
                                onClick={() => onToggleCategory(isExpanded ? null : category)}
                                className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
                            >
                                <span className="flex items-center gap-2">
                                    <Icon size={12} />
                                    {label}
                                </span>
                                <span className="font-mono text-[9px] opacity-50">{count}</span>
                            </button>

                            <AnimatePresence>
                                {isExpanded && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: "auto", opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        className="overflow-hidden"
                                    >
                                        {/* Content category with slot groups */}
                                        {category === 'content' ? (
                                            <div className="pl-2 pr-2 py-1 space-y-1">
                                                {slotGroups.map(group => {
                                                    const isSlotExpanded = expandedSlots.has(group.slot);
                                                    
                                                    return (
                                                        <div key={group.slot} className="border-l border-border/30 ml-4">
                                                            {/* Slot Group Header */}
                                                            <button
                                                                onClick={() => toggleSlot(group.slot)}
                                                                className="w-full flex items-center justify-between px-2 py-1.5 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                                                            >
                                                                <span className="flex items-center gap-1.5">
                                                                    <ChevronRight 
                                                                        size={10} 
                                                                        className={`transition-transform ${isSlotExpanded ? 'rotate-90' : ''}`}
                                                                    />
                                                                    <FolderOpen size={10} className="opacity-50" />
                                                                    {group.label}
                                                                </span>
                                                                <span className="font-mono text-[8px] opacity-40">
                                                                    {group.endpoints.length}
                                                                </span>
                                                            </button>

                                                            {/* Slot Endpoints */}
                                                            <AnimatePresence>
                                                                {isSlotExpanded && (
                                                                    <motion.div
                                                                        initial={{ height: 0, opacity: 0 }}
                                                                        animate={{ height: "auto", opacity: 1 }}
                                                                        exit={{ height: 0, opacity: 0 }}
                                                                        className="overflow-hidden"
                                                                    >
                                                                        <div className="pl-4 pr-1 py-0.5 space-y-0.5">
                                                                            {group.endpoints.map(renderEndpointButton)}
                                                                        </div>
                                                                    </motion.div>
                                                                )}
                                                            </AnimatePresence>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            /* Other categories - flat list */
                                            <div className="pl-4 pr-2 py-1 space-y-0.5 border-l border-border/50 ml-6">
                                                {categoryEndpoints.map(renderEndpointButton)}
                                            </div>
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    );
                })}
            </div>
        </aside>
    );
}
