import { Search, X, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useRef, useEffect } from 'react';

interface LogToolbarProps {
    search: string;
    onSearchChange: (value: string) => void;
    levelFilter: string;
    onLevelFilterChange: (value: string) => void;
    authTypeFilter: string;
    onAuthTypeFilterChange: (value: string) => void;
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

    // Close on click outside
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
                    "h-10 px-3 flex items-center gap-2 rounded-xl text-sm font-medium transition-all border",
                    value
                        ? "bg-primary/10 text-primary border-primary/30"
                        : "bg-background border-border/50 text-muted-foreground hover:border-border"
                )}
            >
                <span className="text-xs text-muted-foreground">{label}:</span>
                <span className={value ? "text-foreground" : ""}>{selectedOption.label}</span>
                <ChevronDown size={14} className={cn("transition-transform", isOpen && "rotate-180")} />
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 mt-1 w-48 bg-background border border-border rounded-xl shadow-xl z-50 overflow-y-auto max-h-[300px] animate-in fade-in slide-in-from-top-2 duration-200">
                    {options.map(option => (
                        <button
                            key={option.value}
                            onClick={() => {
                                onChange(option.value);
                                setIsOpen(false);
                            }}
                            className={cn(
                                "w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors",
                                value === option.value
                                    ? "bg-primary/10 text-primary"
                                    : "hover:bg-muted text-foreground"
                            )}
                        >
                            {option.color && (
                                <span className={cn("w-2 h-2 rounded-full", option.color)} />
                            )}
                            {option.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

export function LogToolbar({
    search,
    onSearchChange,
    levelFilter,
    onLevelFilterChange,
    authTypeFilter,
    onAuthTypeFilterChange
}: LogToolbarProps) {
    const levelOptions = [
        { value: '', label: 'Minden szint' },
        { value: 'DEBUG', label: 'DEBUG', color: 'bg-gray-500' },
        { value: 'INFO', label: 'INFO', color: 'bg-blue-500' },
        { value: 'WARNING', label: 'WARNING', color: 'bg-amber-500' },
        { value: 'ERROR', label: 'ERROR', color: 'bg-red-500' },
        { value: 'CRITICAL', label: 'CRITICAL', color: 'bg-rose-600' },
    ];

    const authOptions = [
        { value: '', label: 'Mind' },
        { value: 'jwt', label: 'JWT', color: 'bg-blue-500' },
        { value: 'api_key', label: 'API Key', color: 'bg-purple-500' },
        { value: 'none', label: 'Nincs auth', color: 'bg-gray-400' },
        { value: 'error', label: 'Csak hibák', color: 'bg-red-500' },
    ];

    const hasActiveFilters = levelFilter || authTypeFilter || search;

    return (
        <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="group relative flex-1 min-w-[200px] max-w-md transition-all duration-300 focus-within:max-w-lg">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 transition-colors group-focus-within:text-primary" />
                <input
                    type="text"
                    placeholder="Keresés üzenetekben..."
                    value={search}
                    onChange={e => onSearchChange(e.target.value)}
                    className="w-full h-10 pl-10 pr-10 bg-background border border-border/50 rounded-xl text-sm outline-none transition-all shadow-sm focus:border-primary/50 focus:ring-4 focus:ring-primary/10 placeholder:text-muted-foreground/50"
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

            {/* Level Filter Dropdown */}
            <FilterDropdown
                label="Szint"
                value={levelFilter}
                options={levelOptions}
                onChange={onLevelFilterChange}
            />

            {/* Auth Type Filter Dropdown */}
            <FilterDropdown
                label="Auth"
                value={authTypeFilter}
                options={authOptions}
                onChange={onAuthTypeFilterChange}
            />

            {/* Clear All Filters */}
            {hasActiveFilters && (
                <button
                    onClick={() => {
                        onSearchChange('');
                        onLevelFilterChange('');
                        onAuthTypeFilterChange('');
                    }}
                    className="h-10 px-3 flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground border border-border/50 hover:border-destructive/50 hover:text-destructive rounded-xl transition-all"
                >
                    <X size={14} />
                    Törlés
                </button>
            )}
        </div>
    );
}
