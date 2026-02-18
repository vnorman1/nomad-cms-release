/**
 * MassiveDataView - Large Dataset View Component
 * 
 * Optimalizált nézet nagy adatmennyiséghez (10,000+ rekord).
 * Funkciók:
 * - Server-side pagination
 * - Server-side sorting
 * - Full-text search
 * - Quick filters
 * - Bulk selection & delete (Floating Action Bar)
 * - CSV export
 * - Modal-based creating & editing
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
import {
    Search,
    Download,
    Upload,
    Trash2,
    Plus,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    ArrowUp,
    ArrowDown,
    RefreshCw,
    Filter,
    Edit2,
    Database,
    Loader2,
    X,
    Check,
    Lock,
    ShieldCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMassiveData } from '@/hooks/useMassiveData';
import type { SlotConfig, FieldConfig } from '@/config/admin.config';
import FieldRenderer from '@/components/fields/FieldRenderer';
import { cn } from '@/lib/utils';

// Helper to check if a value is considered empty
const isFieldEmpty = (value: unknown): boolean => {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string' && value.trim() === '') return true;
    if (Array.isArray(value) && value.length === 0) return true;
    return false;
};

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface MassiveDataViewProps {
    slotKey: string;
    config: SlotConfig;
    onClose?: () => void;
}

type ModalState = {
    type: 'create' | 'edit';
    id?: number;
    data: Record<string, unknown>;
} | null;

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function MassiveDataView({ slotKey, config }: MassiveDataViewProps) {
    // ═══════════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════════

    // Combined modal state for Create & Edit
    const [modalState, setModalState] = useState<ModalState>(null);

    // Validation error field IDs (not labels)
    const [validationErrorIds, setValidationErrorIds] = useState<Set<string>>(new Set());

    const [showFilters, setShowFilters] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState<number | 'bulk' | null>(null);

    // Massive data hook
    const massive = useMassiveData({
        slot: slotKey,
        initialPageSize: config.massive?.pageSize ?? 50,
        initialSort: config.massive?.defaultSort?.field ?? 'id',
        initialSortDir: config.massive?.defaultSort?.direction ?? 'desc',
        autoFetch: true,
    });

    // Responsive column count based on window width
    // ID column (~80px) + Checkbox (~48px) + Actions (~80px) = ~210px reserved
    // Each data column needs approximately 150px minimum
    const [maxColumns, setMaxColumns] = useState(() => {
        if (typeof window === 'undefined') return 4;
        const available = window.innerWidth - 210;
        return Math.max(2, Math.min(5, Math.floor(available / 150)));
    });

    useEffect(() => {
        const handleResize = () => {
            const available = window.innerWidth - 210;
            setMaxColumns(Math.max(2, Math.min(5, Math.floor(available / 150))));
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Columns to display - limited by maxColumns for responsive layout
    const visibleColumns = useMemo(() => {
        const tableFields = config.fields.filter(
            (f, idx) => f.showInTable !== false && (f.showInTable || idx < 5)
        );
        return tableFields.slice(0, maxColumns);
    }, [config.fields, maxColumns]);

    // ═══════════════════════════════════════════════════════════════════════
    // HANDLERS
    // ═══════════════════════════════════════════════════════════════════════

    const openCreateModal = () => {
        const defaults: Record<string, unknown> = {};
        config.fields.forEach(field => {
            if (field.defaultValue !== undefined) {
                defaults[field.id] = field.defaultValue;
            }
        });
        setModalState({ type: 'create', data: defaults });
    };

    const openEditModal = (record: { id: number, data: any }) => {
        setModalState({
            type: 'edit',
            id: record.id,
            data: { ...record.data } // Clone data
        });
    };

    const closeModal = () => {
        setModalState(null);
        setValidationErrorIds(new Set());
    };

    // Validate required fields before save - returns array of field IDs
    const validateRequiredFields = useCallback((): string[] => {
        const errorIds: string[] = [];
        if (!modalState?.data) return errorIds;

        for (const field of config.fields) {
            if (field.required && isFieldEmpty(modalState.data[field.id])) {
                errorIds.push(field.id);
            }
        }
        return errorIds;
    }, [config.fields, modalState?.data]);

    // Check if a specific field has an error
    const hasFieldError = useMemo(() => {
        return (fieldId: string): boolean => validationErrorIds.has(fieldId);
    }, [validationErrorIds]);

    const handleSaveRecord = async () => {
        if (!modalState) return;

        // Validate required fields
        const errorIds = validateRequiredFields();
        setValidationErrorIds(new Set(errorIds));

        if (errorIds.length > 0) {
            // Don't save if there are validation errors
            return;
        }

        if (modalState.type === 'create') {
            const id = await massive.createRecord(modalState.data);
            if (id) closeModal();
        } else if (modalState.type === 'edit' && modalState.id) {
            const success = await massive.updateRecord(modalState.id, modalState.data);
            if (success) closeModal();
        }
    };

    const handleFieldChange = (fieldId: string, value: unknown) => {
        setModalState(prev => prev ? ({
            ...prev,
            data: { ...prev.data, [fieldId]: value }
        }) : null);
    };

    const handleDeleteConfirm = async () => {
        if (confirmDelete === 'bulk') {
            await massive.bulkDelete();
        } else if (typeof confirmDelete === 'number') {
            await massive.deleteRecord(confirmDelete);
        }
        setConfirmDelete(null);
    };

    const formatCellValue = (value: unknown, field: FieldConfig): string => {
        if (value === null || value === undefined) return '—';
        if (typeof value === 'boolean') return value ? '✓' : '✗';
        if (field.type === 'date' || field.type === 'datetime') {
            return new Date(String(value)).toLocaleDateString('hu-HU');
        }
        if (Array.isArray(value)) return `[${value.length}]`;
        if (typeof value === 'object') return '{...}';
        const str = String(value);
        return str.length > 50 ? str.substring(0, 50) + '…' : str;
    };

    // ═══════════════════════════════════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════════════════════════════════

    // We use a clean root div to avoid stacking context issues for fixed children (Modal, FAB)
    // Reverted to standard font-sans, removed brutalist borders
    return (
        <div className="flex flex-col h-full bg-background font-sans text-foreground">

            {/* ─────────────────────────────────────────────────────────────────── */}
            {/* MAIN CONTENT WRAPPER */}
            {/* ─────────────────────────────────────────────────────────────────── */}
            <div className="flex-1 flex flex-col h-full relative overflow-hidden">
                {/* HEADER AREA */}
                <div className="flex-none p-6 pb-2 space-y-6">
                    {/* Title & Stats */}
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center border border-primary/20 shadow-sm">
                                <Database size={20} className="text-primary" />
                            </div>
                            <div>
                                <div className="flex items-center gap-3">
                                    <h2 className="text-2xl font-bold tracking-tight text-foreground/90">{config.label}</h2>
                                    {/* Encryption Badge */}
                                    {massive.isEncrypted && (
                                        <div
                                            className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-lg text-xs font-medium border border-amber-500/20"
                                            title="Titkosított adatok - keresés, szűrés és rendezés nem elérhető"
                                        >
                                            <ShieldCheck size={14} />
                                            <span>Titkosított</span>
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                                    <span className="font-medium bg-muted px-2 py-0.5 rounded-md">{massive.total.toLocaleString()} rekord</span>
                                    <span className="opacity-30">•</span>
                                    <span>{massive.totalPages} oldal</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => massive.refresh()}
                                disabled={massive.isLoading}
                                className="h-9 w-9 flex items-center justify-center rounded-lg border border-border/50 hover:bg-muted transition-all disabled:opacity-50"
                                title="Frissítés"
                            >
                                <RefreshCw size={16} className={massive.isLoading ? 'animate-spin' : ''} />
                            </button>
                            <input
                                type="file"
                                id="csv-upload"
                                accept=".csv"
                                className="hidden"
                                onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                        try {
                                            const result = await massive.importCSV(file); // This now returns { inserted, errors }
                                            if (result.inserted > 0) {
                                                // Success notification could go here if toast was available
                                                // For now, the refresh is automatic inside the hook
                                            }
                                        } catch (error) {
                                            console.error("Import failed", error);
                                        }
                                        // Reset input
                                        e.target.value = '';
                                    }
                                }}
                            />
                            <button
                                onClick={() => document.getElementById('csv-upload')?.click()}
                                disabled={massive.isImporting || massive.isLoading}
                                className="h-9 px-3 flex items-center gap-2 rounded-lg border border-border/50 hover:bg-muted transition-all disabled:opacity-50 text-sm font-medium"
                                title="CSV Import / Feltöltés"
                            >
                                {massive.isImporting ? (
                                    <Loader2 size={16} className="animate-spin" />
                                ) : (
                                    <Download size={16} />
                                )}
                                <span>Import</span>
                            </button>
                            <button
                                onClick={() => massive.exportCSV()}
                                className="h-9 px-3 flex items-center gap-2 rounded-lg border border-border/50 hover:bg-muted transition-all text-sm font-medium"
                                title="CSV Export"
                            >
                                <Upload size={16} />
                                <span>Export</span>
                            </button>
                            <button
                                onClick={openCreateModal}
                                className="h-9 px-4 bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg shadow-lg shadow-primary/20 transition-all flex items-center gap-2 text-sm font-medium"
                            >
                                <Plus size={16} />
                                Új létrehozása
                            </button>
                        </div>
                    </div>

                    {/* Toolbar: Search & Filters */}
                    <div className="flex w-full items-center gap-4">
                        {/* Search - Always visible, disabled state handles non-searchable scenarios */}
                        <div className={cn(
                            "group relative flex-1 max-w-xl transition-all duration-300",
                            !massive.isSearchDisabled && "focus-within:max-w-2xl"
                        )}>
                            {massive.isSearchDisabled ? (
                                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
                            ) : massive.blindIndexEnabled ? (
                                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-amber-500 transition-colors group-focus-within:text-amber-600" />
                            ) : (
                                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 transition-colors group-focus-within:text-primary" />
                            )}
                            <input
                                type="text"
                                placeholder={
                                    massive.isSearchDisabled
                                        ? "Titkosított adatok - a keresés nem elérhető"
                                        : massive.blindIndexEnabled
                                            ? `Titkosított keresés (${massive.searchableFields.join(', ')})...`
                                            : "Keresés..."
                                }
                                value={massive.search}
                                onChange={(e) => massive.setSearch(e.target.value)}
                                disabled={massive.isSearchDisabled}
                                className={cn(
                                    "w-full h-10 pl-10 pr-4 bg-background border border-border/50 rounded-xl text-sm outline-none transition-all shadow-sm",
                                    !massive.isSearchDisabled && "focus:border-primary/50 focus:ring-4 focus:ring-primary/10 placeholder:text-muted-foreground/50",
                                    massive.isSearchDisabled && "cursor-not-allowed opacity-75 bg-muted/20 border-dashed text-muted-foreground placeholder:text-muted-foreground/60",
                                    massive.blindIndexEnabled && "border-amber-500/30 focus:border-amber-500/50 focus:ring-amber-500/10"
                                )}
                            />
                            {massive.blindIndexEnabled && (
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-medium text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded">
                                    Titkosított keresés
                                </span>
                            )}
                        </div>

                        {config.massive?.quickFilters && !massive.isFilterDisabled && (
                            <button
                                onClick={() => setShowFilters(!showFilters)}
                                className={cn(
                                    "h-10 px-4 rounded-xl border flex items-center gap-2 text-sm font-medium transition-all",
                                    showFilters || Object.keys(massive.filters).length > 0
                                        ? "bg-primary/10 border-primary/20 text-primary shadow-sm"
                                        : "bg-background border-border/50 hover:bg-muted/50"
                                )}
                            >
                                <Filter size={15} />
                                <span>Szűrők</span>
                                {Object.keys(massive.filters).length > 0 && (
                                    <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1 text-[10px] text-primary-foreground">
                                        {Object.keys(massive.filters).length}
                                    </span>
                                )}
                            </button>
                        )}
                    </div>

                    {/* Expandable Filters Panel - Improved Animation */}
                    <AnimatePresence>
                        {showFilters && config.massive?.quickFilters && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2, ease: "easeInOut" }}
                                className="overflow-hidden"
                            >
                                <div className="mt-4 p-4 bg-muted/30 border border-border/40 rounded-xl grid grid-cols-2 md:grid-cols-4 gap-4">
                                    {config.massive.quickFilters.map(filter => (
                                        <div key={filter.field} className="space-y-1.5">
                                            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 pl-0.5">
                                                {filter.label}
                                            </label>
                                            <select
                                                value={String(massive.filters[filter.field] ?? '')}
                                                onChange={(e) => massive.setFilter(filter.field, e.target.value || undefined)}
                                                className="w-full h-9 px-2.5 bg-background border border-border/50 rounded-lg text-sm focus:border-primary/50 focus:ring-2 focus:ring-primary/10 outline-none transition-all"
                                            >
                                                <option value="">Összes</option>
                                                {filter.options.map(opt => (
                                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                    ))}
                                    <div className="flex items-end">
                                        <button
                                            onClick={() => massive.clearFilters()}
                                            className="h-9 px-3 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors ml-auto"
                                        >
                                            Szűrők törlése
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* DATA TABLE */}
                <div className="flex-1 overflow-auto px-6 pb-20 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                    <div className="rounded-xl border border-border/40 bg-background/50 shadow-sm overflow-hidden backdrop-blur-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse min-w-max">
                                <thead className="bg-muted/30 border-b border-border/40 sticky top-0 z-10 backdrop-blur-md">
                                    <tr>
                                        {/* Checkbox Header */}
                                        <th className="w-12 h-11 px-4 text-left align-middle">
                                            <input
                                                type="checkbox"
                                                checked={massive.selectedIds.size === massive.items.length && massive.items.length > 0}
                                                onChange={() => massive.selectedIds.size === massive.items.length ? massive.deselectAll() : massive.selectAll()}
                                                className="w-4 h-4 rounded border-muted-foreground/40 bg-transparent text-primary focus:ring-primary/20 transition-all cursor-pointer"
                                            />
                                        </th>
                                        {/* ID Header */}
                                        <th className="w-24 h-11 px-4 text-left align-middle">
                                            <button
                                                onClick={() => massive.setSort('id')}
                                                className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground uppercase tracking-wider transition-colors group w-full"
                                            >
                                                ID
                                                <div className="flex flex-col text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors ml-auto">
                                                    {massive.sort === 'id' && massive.sortDir === 'asc' ? <ArrowUp size={10} className="text-primary" /> : <ArrowUp size={10} />}
                                                    {massive.sort === 'id' && massive.sortDir === 'desc' ? <ArrowDown size={10} className="text-primary" /> : <ArrowDown size={10} />}
                                                </div>
                                            </button>
                                        </th>
                                        {/* Dynamic Columns */}
                                        {visibleColumns.map(field => {
                                            // Disable sorting for encrypted slots (only system fields work)
                                            const isSortable = field.sortable !== false && !massive.isSortDisabled;
                                            return (
                                                <th
                                                    key={field.id}
                                                    className={cn("h-11 px-4 text-left align-middle group", isSortable && "cursor-pointer")}
                                                    onClick={() => isSortable && massive.setSort(field.id)}
                                                    style={{ width: field.columnWidth }}
                                                >
                                                    <div className={cn(
                                                        "flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider transition-colors w-full",
                                                        isSortable ? "text-muted-foreground group-hover:text-foreground" : "text-muted-foreground cursor-default"
                                                    )}>
                                                        {field.label}
                                                        {massive.isSortDisabled && (
                                                            <Lock size={10} className="text-muted-foreground/40 ml-1" />
                                                        )}
                                                        {isSortable && (
                                                            <div className="flex flex-col text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors ml-auto">
                                                                {massive.sort === field.id && massive.sortDir === 'asc' ? <ArrowUp size={10} className="text-primary" /> : <ArrowUp size={10} />}
                                                                {massive.sort === field.id && massive.sortDir === 'desc' ? <ArrowDown size={10} className="text-primary" /> : <ArrowDown size={10} />}
                                                            </div>
                                                        )}
                                                    </div>
                                                </th>
                                            );
                                        })}
                                        {/* Actions Header - Sticky */}
                                        <th className="w-20 h-11 px-2 bg-muted/30 sticky right-0 after:absolute after:left-0 after:top-0 after:bottom-0 after:w-[1px] after:bg-border/40"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/30">
                                    {/* Loading State */}
                                    {massive.isLoading && massive.items.length === 0 && (
                                        <tr>
                                            <td colSpan={visibleColumns.length + 3} className="h-64 text-center">
                                                <div className="flex flex-col items-center justify-center gap-3 text-muted-foreground">
                                                    <Loader2 size={24} className="animate-spin text-primary/50" />
                                                    <span className="text-sm font-medium">Adatok betöltése...</span>
                                                </div>
                                            </td>
                                        </tr>
                                    )}

                                    {/* Empty State */}
                                    {!massive.isLoading && massive.items.length === 0 && (
                                        <tr>
                                            <td colSpan={visibleColumns.length + 3} className="h-64 text-center">
                                                <div className="flex flex-col items-center justify-center gap-3 text-muted-foreground/50">
                                                    <Database size={40} className="opacity-20" />
                                                    <span className="text-sm font-medium">Nincs megjeleníthető adat</span>
                                                </div>
                                            </td>
                                        </tr>
                                    )}

                                    {/* Data Rows */}
                                    <AnimatePresence mode="popLayout">
                                        {massive.items.map((record, index) => (
                                            <motion.tr
                                                key={record.id}
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: index * 0.02 }}
                                                className={cn(
                                                    "group border-b border-border/30 transition-colors hover:bg-muted/20",
                                                    massive.isSelected(record.id) ? "bg-primary/5 hover:bg-primary/10" : "",
                                                    massive.isLoading ? "opacity-50 pointer-events-none" : ""
                                                )}
                                            >
                                                <td className="px-4 py-3 align-middle">
                                                    <input
                                                        type="checkbox"
                                                        checked={massive.isSelected(record.id)}
                                                        onChange={() => massive.toggleSelection(record.id)}
                                                        className="w-4 h-4 rounded border-muted-foreground/40 bg-transparent text-primary focus:ring-primary/20 transition-all cursor-pointer"
                                                    />
                                                </td>
                                                <td className="px-4 py-3 align-middle">
                                                    <span className="font-mono text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                                                        #{record.id}
                                                    </span>
                                                </td>
                                                {visibleColumns.map(field => (
                                                    <td key={field.id} className="px-4 py-3 align-middle">
                                                        <div className="text-sm text-foreground/80 truncate max-w-[200px]" title={String(record.data[field.id])}>
                                                            {formatCellValue(record.data[field.id], field)}
                                                        </div>
                                                    </td>
                                                ))}
                                                <td className="px-2 py-3 align-middle text-right w-20 sticky right-0 bg-inherit group-hover:bg-muted/20">
                                                    <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button
                                                            onClick={() => openEditModal(record)}
                                                            className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all"
                                                            title="Szerkesztés"
                                                        >
                                                            <Edit2 size={14} />
                                                        </button>
                                                        <button
                                                            onClick={() => setConfirmDelete(record.id)}
                                                            className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                                                            title="Törlés"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </motion.tr>
                                        ))}
                                    </AnimatePresence>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* PAGINATION FOOTER */}
                    <div className="flex-none border-t border-border/40 p-4 bg-background z-20">
                        <div className="flex items-center justify-between max-w-full overflow-x-auto gap-4">
                            <div className="flex items-center gap-4 text-sm text-muted-foreground whitespace-nowrap">
                                <span className="font-medium text-foreground">
                                    {((massive.page - 1) * massive.pageSize + 1).toLocaleString()}-{Math.min(massive.page * massive.pageSize, massive.total).toLocaleString()}
                                </span>
                                <span className="opacity-50">/</span>
                                <span>{massive.total.toLocaleString()} összesen</span>

                                <select
                                    value={massive.pageSize}
                                    onChange={(e) => massive.setPageSize(Number(e.target.value))}
                                    className="ml-2 h-8 px-2 bg-transparent border border-border/50 rounded-lg text-xs hover:border-border focus:ring-0 cursor-pointer outline-none"
                                >
                                    <option value={25}>25 / oldal</option>
                                    <option value={50}>50 / oldal</option>
                                    <option value={100}>100 / oldal</option>
                                    <option value={200}>200 / oldal</option>
                                </select>
                            </div>

                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => massive.setPage(1)}
                                    disabled={massive.page === 1 || massive.isLoading}
                                    className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted/50 text-muted-foreground disabled:opacity-30 transition-colors"
                                >
                                    <ChevronsLeft size={16} />
                                </button>
                                <button
                                    onClick={() => massive.setPage(massive.page - 1)}
                                    disabled={massive.page === 1 || massive.isLoading}
                                    className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted/50 text-muted-foreground disabled:opacity-30 transition-colors"
                                >
                                    <ChevronLeft size={16} />
                                </button>

                                <div className="px-3 min-w-[3rem] text-center text-sm font-medium">
                                    {massive.page}
                                </div>

                                <button
                                    onClick={() => massive.setPage(massive.page + 1)}
                                    disabled={massive.page >= massive.totalPages || massive.isLoading}
                                    className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted/50 text-muted-foreground disabled:opacity-30 transition-colors"
                                >
                                    <ChevronRight size={16} />
                                </button>
                                <button
                                    onClick={() => massive.setPage(massive.totalPages)}
                                    disabled={massive.page >= massive.totalPages || massive.isLoading}
                                    className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted/50 text-muted-foreground disabled:opacity-30 transition-colors"
                                >
                                    <ChevronsRight size={16} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ─────────────────────────────────────────────────────────────────── */}
                {/* FLOATING ACTION BAR (BULK) - Rounded & Glassy */}
                {/* ─────────────────────────────────────────────────────────────────── */}
                <AnimatePresence>
                    {massive.selectedIds.size > 0 && (
                        <motion.div
                            initial={{ y: 100, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 100, opacity: 0 }}
                            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[55]"
                        >
                            <div className="flex items-center gap-2 p-2 pl-4 bg-background/80 backdrop-blur-xl shadow-2xl border border-border/50 ring-1 ring-black/5">
                                <span className="text-sm font-medium mr-2">
                                    {massive.selectedIds.size} kiválasztva
                                </span>
                                <div className="w-px h-4 bg-border" />
                                <button
                                    onClick={() => setConfirmDelete('bulk')}
                                    className="h-8 px-3 flex items-center gap-2 hover:bg-destructive/10 text-red-500 hover:text-red-600 transition-colors text-xs font-semibold"
                                >
                                    <Trash2 size={14} />
                                    Törlés
                                </button>
                                <button
                                    onClick={() => massive.deselectAll()}
                                    className="h-8 w-8 flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ─────────────────────────────────────────────────────────────────── */}
                {/* MODAL (CREATE / EDIT) - Rounded & Glassy */}
                {/* ─────────────────────────────────────────────────────────────────── */}
                <AnimatePresence>
                    {modalState && (
                        <div className="fixed inset-0 z-[55] flex items-center justify-center p-4 sm:p-8">
                            {/* Backdrop */}
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={closeModal}
                                className="absolute inset-0 bg-background/80 backdrop-blur-md"
                            />

                            {/* Modal Content */}
                            <motion.div
                                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                                animate={{ scale: 1, opacity: 1, y: 0 }}
                                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                                className="relative w-full max-w-2xl bg-background border border-border/50 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                                onClick={(e) => e.stopPropagation()}
                            >
                                {/* Header */}
                                <div className="flex-none p-5 border-b border-border/50 flex items-center justify-between bg-muted/20">
                                    <div>
                                        <h3 className="text-lg font-bold tracking-tight">
                                            {modalState.type === 'create' ? 'Új rekord létrehozása' : 'Rekord szerkesztése'}
                                        </h3>
                                        {modalState.type === 'edit' && (
                                            <p className="text-xs text-muted-foreground font-mono mt-0.5">#{modalState.id}</p>
                                        )}
                                    </div>
                                    <button
                                        onClick={closeModal}
                                        className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>

                                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                                    {config.fields.map(field => (
                                        <div key={field.id} className="space-y-2">
                                            <FieldRenderer
                                                field={field}
                                                value={modalState.data[field.id]}
                                                onChange={(value) => handleFieldChange(field.id, value)}
                                                hasError={hasFieldError(field.id)}
                                            />
                                        </div>
                                    ))}
                                </div>

                                <div className="flex-none p-5 border-t border-border/50 bg-muted/20 flex items-center justify-end gap-3">
                                    <button
                                        onClick={closeModal}
                                        className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                                    >
                                        Mégse
                                    </button>
                                    <button
                                        onClick={handleSaveRecord}
                                        disabled={massive.isCreating || massive.isUpdating}
                                        className="px-5 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all flex items-center gap-2"
                                    >
                                        {(massive.isCreating || massive.isUpdating) ? (
                                            <Loader2 size={16} className="animate-spin" />
                                        ) : (
                                            <Check size={16} />
                                        )}
                                        {modalState.type === 'create' ? 'Létrehozás' : 'Mentés'}
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* ─────────────────────────────────────────────────────────────────── */}
                {/* DELETE CONFIRM DIALOG - Rounded & Glassy */}
                {/* ─────────────────────────────────────────────────────────────────── */}
                <AnimatePresence>
                    {confirmDelete !== null && (
                        <div className="fixed inset-0 z-[58] flex items-center justify-center p-4">
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setConfirmDelete(null)}
                                className="absolute inset-0 bg-background/80 backdrop-blur-sm"
                            />
                            <motion.div
                                initial={{ scale: 0.95, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.95, opacity: 0 }}
                                className="relative w-full max-w-sm bg-background border border-border/50 shadow-2xl p-6"
                            >
                                <div className="flex flex-col items-center text-center gap-4">
                                    <div className="w-12 h-12 bg-destructive/10 text-destructive rounded-full flex items-center justify-center">
                                        <Trash2 size={24} />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold">Biztosan törlöd?</h3>
                                        <p className="text-sm text-muted-foreground mt-2">
                                            {confirmDelete === 'bulk'
                                                ? `${massive.selectedIds.size} elem kerül végleges törlésre.`
                                                : `#${confirmDelete} azonosítójú elem véglegesen törlődik.`}
                                            <br />
                                            Ez a művelet nem visszavonható.
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-3 w-full mt-2">
                                        <button
                                            onClick={() => setConfirmDelete(null)}
                                            className="flex-1 px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-muted transition-colors"
                                        >
                                            Mégse
                                        </button>
                                        <button
                                            onClick={handleDeleteConfirm}
                                            className="flex-1 px-4 py-2 bg-destructive text-destructive-foreground rounded-lg text-sm font-medium hover:bg-destructive/90 transition-colors"
                                        >
                                            {massive.isDeleting ? 'Törlés...' : 'Törlés'}
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

            </div>
        </div>
    );
}

export default MassiveDataView;
