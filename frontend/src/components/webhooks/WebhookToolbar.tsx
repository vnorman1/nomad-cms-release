/**
 * Webhook Toolbar Component
 * 
 * Search and filter toolbar for WebhooksPage matching LogsPage style.
 * Updated with ArrowUpRight/ArrowDownLeft icons for consistency.
 */

import { useState, useRef, useEffect } from 'react';
import { Search, X, ChevronDown, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WebhookToolbarProps {
    search: string;
    onSearchChange: (value: string) => void;
    activeTab: 'outgoing' | 'incoming';
    onTabChange: (tab: 'outgoing' | 'incoming') => void;
    statusFilter: string;
    onStatusFilterChange: (value: string) => void;
    webhookCount: number;
    endpointCount: number;
}

// Dropdown menu component
function FilterDropdown({
    label,
    value,
    options,
    onChange
}: {
    label: string;
    value: string;
    options: { value: string; label: string; color?: string }[];
    onChange: (value: string) => void;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selectedOption = options.find(o => o.value === value) || options[0];

    return (
        <div ref={dropdownRef} className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "h-10 px-3 flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest transition-all border",
                    value
                        ? "bg-foreground text-background border-foreground"
                        : "bg-background border-border text-muted-foreground hover:border-foreground hover:text-foreground"
                )}
            >
                <span className="text-muted-foreground/60">{label}:</span>
                <span className={value ? "text-background" : ""}>{selectedOption.label}</span>
                <ChevronDown size={12} className={cn("transition-transform", isOpen && "rotate-180")} />
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 mt-1 w-40 bg-background border border-border shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    {options.map(option => (
                        <button
                            key={option.value}
                            onClick={() => {
                                onChange(option.value);
                                setIsOpen(false);
                            }}
                            className={cn(
                                "w-full px-3 py-2 text-left text-[10px] font-mono uppercase tracking-widest flex items-center gap-2 transition-colors",
                                value === option.value
                                    ? "bg-foreground text-background"
                                    : "hover:bg-foreground/5 text-foreground"
                            )}
                        >
                            {option.color && (
                                <span className={cn("w-1.5 h-1.5 rounded-full", option.color)} />
                            )}
                            {option.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

export function WebhookToolbar({
    search,
    onSearchChange,
    activeTab,
    onTabChange,
    statusFilter,
    onStatusFilterChange,
    webhookCount,
    endpointCount
}: WebhookToolbarProps) {
    const statusOptions = [
        { value: '', label: 'Mind' },
        { value: 'active', label: 'Aktív', color: 'bg-green-500' },
        { value: 'inactive', label: 'Inaktív', color: 'bg-gray-400' },
    ];

    const hasActiveFilters = statusFilter || search;

    return (
        <div className="flex flex-wrap items-center gap-3">
            {/* Tab Buttons */}
            <div className="flex items-center gap-[-1px]">
                <button
                    onClick={() => onTabChange('outgoing')}
                    className={cn(
                        "flex items-center gap-2 px-4 py-2.5 text-[10px] font-mono uppercase tracking-widest transition-all border",
                        activeTab === 'outgoing'
                            ? "bg-foreground text-background border-foreground z-10"
                            : "bg-background text-muted-foreground border-border hover:border-foreground/50 hover:text-foreground"
                    )}
                >
                    <ArrowUpRight size={12} />
                    Kimenő
                    <span className={cn(
                        "ml-1 px-1.5 py-0.5 text-[9px] border",
                        activeTab === 'outgoing' 
                            ? "border-background/30 text-background" 
                            : "border-border text-muted-foreground"
                    )}>
                        {webhookCount}
                    </span>
                </button>
                <button
                    onClick={() => onTabChange('incoming')}
                    className={cn(
                        "flex items-center gap-2 px-4 py-2.5 text-[10px] font-mono uppercase tracking-widest transition-all border -ml-px",
                        activeTab === 'incoming'
                            ? "bg-foreground text-background border-foreground z-10"
                            : "bg-background text-muted-foreground border-border hover:border-foreground/50 hover:text-foreground"
                    )}
                >
                    <ArrowDownLeft size={12} />
                    Bejövő
                    <span className={cn(
                        "ml-1 px-1.5 py-0.5 text-[9px] border",
                        activeTab === 'incoming' 
                            ? "border-background/30 text-background" 
                            : "border-border text-muted-foreground"
                    )}>
                        {endpointCount}
                    </span>
                </button>
            </div>

            {/* Search */}
            <div className="group relative flex-1 min-w-[200px] max-w-md transition-all duration-300 focus-within:max-w-lg">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 transition-colors group-focus-within:text-foreground" />
                <input
                    type="text"
                    placeholder={activeTab === 'outgoing' ? "KERESÉS NÉV, URL..." : "KERESÉS NÉV, KULCS..."}
                    value={search}
                    onChange={e => onSearchChange(e.target.value)}
                    className="w-full h-10 pl-10 pr-10 bg-background border border-border text-xs font-mono focus:outline-none transition-all focus:border-foreground placeholder:text-muted-foreground/50 uppercase tracking-wider"
                />
                {search && (
                    <button
                        onClick={() => onSearchChange('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <X size={14} />
                    </button>
                )}
            </div>

            {/* Status Filter Dropdown */}
            <FilterDropdown
                label="STÁTUSZ"
                value={statusFilter}
                options={statusOptions}
                onChange={onStatusFilterChange}
            />

            {/* Clear Filters */}
            {hasActiveFilters && (
                <button
                    onClick={() => {
                        onSearchChange('');
                        onStatusFilterChange('');
                    }}
                    className="h-10 px-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors border border-transparent hover:border-border"
                >
                    Szűrők törlése
                </button>
            )}
        </div>
    );
}
