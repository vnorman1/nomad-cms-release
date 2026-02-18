/**
 * DiffViewer - Intelligent Visual Diff Comparison Component
 * 
 * IMPROVED:
 * - Premium UI with Glassmorphism
 * - Smart detection of list changes
 * - Cleaner Semantic Cards
 * - Side-by-side OLD vs NEW with better typography
 */

import { useState, useMemo } from 'react';
import {
    X,
    GitCompare,
    Plus,
    Minus,
    Edit3,
    ChevronRight,
    Copy,
    Check,
    AlignJustify,
    Package,
    ArrowRight,
    Maximize2,
    Minimize2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { VersionDetail } from '@/services/versioningService';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface DiffViewerProps {
    versionDetail: VersionDetail;
    currentContent?: unknown;
    onClose: () => void;
}

interface DiffOperation {
    op: 'add' | 'remove' | 'replace' | 'move' | 'copy';
    path: string;
    value?: unknown;
    old_value?: unknown;
    from?: string;
}

interface EnrichedDiffOperation extends DiffOperation {
    oldValue?: unknown;
}

interface SemanticChange {
    type: 'item_added' | 'item_removed' | 'item_modified' | 'field_changed' | 'root_replaced';
    description: string;
    icon: React.ReactNode;
    color: string;
    path: string;
    fieldName?: string;
    itemIndex?: number;
    oldValue?: unknown;
    newValue?: unknown;
    operations: EnrichedDiffOperation[];
}

type ViewMode = 'semantic' | 'inline' | 'split';

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function getOperationColor(op: string): string {
    switch (op) {
        case 'add': return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
        case 'remove': return 'text-rose-500 bg-rose-500/10 border-rose-500/20';
        case 'replace': return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
        default: return 'text-slate-500 bg-slate-500/10 border-slate-500/20';
    }
}

function formatFieldName(path: string): string {
    const parts = path.split('/').filter(Boolean);
    const lastPart = parts[parts.length - 1];

    // Common field name translations
    const fieldNames: Record<string, string> = {
        'title': 'Cím',
        'name': 'Név',
        'description': 'Leírás',
        'content': 'Tartalom',
        'slug': 'URL slug',
        'status': 'Státusz',
        'published': 'Publikált',
        'image': 'Kép',
        'email': 'Email',
        'phone': 'Telefon',
        'price': 'Ár',
        'date': 'Dátum',
        'text': 'Szöveg',
        'body': 'Törzs',
        'sections': 'Szekciók',
        'blocks': 'Blokkok',
        'items': 'Elemek',
        'meta': 'Meta adatok'
    };

    return fieldNames[lastPart?.toLowerCase()] || lastPart || path;
}

function formatValue(value: unknown, maxLength = 150): string {
    if (value === undefined) return '(nincs)';
    if (value === null) return 'null';
    if (typeof value === 'string') {
        if (value.length > maxLength) {
            return `"${value.substring(0, maxLength)}..."`;
        }
        return `"${value}"`;
    }
    if (typeof value === 'boolean') return value ? 'Igaz' : 'Hamis';
    if (typeof value === 'number') return String(value);
    if (typeof value === 'object') {
        try {
            const str = JSON.stringify(value, null, 2);
            if (str.length > maxLength) {
                return str.substring(0, maxLength) + '...';
            }
            return str;
        } catch {
            return String(value);
        }
    }
    return String(value);
}

function isArrayIndex(part: string): boolean {
    return /^\d+$/.test(part);
}

// Detect if this is a list item operation
function detectListItemChange(ops: EnrichedDiffOperation[]): { isListItem: boolean; index?: number; itemTitle?: string } {
    for (const op of ops) {
        const parts = op.path.split('/').filter(Boolean);
        if (parts.length >= 1 && isArrayIndex(parts[0])) {
            const index = parseInt(parts[0], 10);
            let itemTitle: string | undefined;
            if (op.value && typeof op.value === 'object') {
                const val = op.value as Record<string, unknown>;
                itemTitle = val.title as string || val.name as string || val.label as string || val.heading as string;
            }
            return { isListItem: true, index, itemTitle };
        }
    }
    return { isListItem: false };
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function SemanticChangeCard({ change }: { change: SemanticChange }) {
    const [expanded, setExpanded] = useState(false);

    // Determine card style based on change type
    const cardStyle = useMemo(() => {
        switch (change.type) {
            case 'item_added': return 'border-l-4 border-l-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/10';
            case 'item_removed': return 'border-l-4 border-l-rose-500 bg-rose-50/50 dark:bg-rose-950/10';
            default: return 'border-l-4 border-l-amber-500 bg-amber-50/50 dark:bg-amber-950/10';
        }
    }, [change.type]);

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`rounded-lg border border-border/50 overflow-hidden mb-3 hover:shadow-md transition-all ${cardStyle}`}
        >
            <div
                className="flex items-center gap-4 p-4 cursor-pointer group"
                onClick={() => setExpanded(!expanded)}
            >
                <div className={`p-2 rounded-lg bg-background shadow-sm ring-1 ring-black/5`}>
                    {change.icon}
                </div>

                <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-foreground/90">{change.description}</div>
                    {change.fieldName && (
                        <div className="text-xs text-muted-foreground mt-0.5 font-mono opacity-80">{change.fieldName}</div>
                    )}
                </div>

                <ChevronRight
                    size={16}
                    className={`text-muted-foreground transition-transform duration-300 ${expanded ? 'rotate-90' : 'group-hover:translate-x-1'}`}
                />
            </div>

            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="border-t border-black/5 dark:border-white/5 p-4 bg-background/50 space-y-4">
                            {/* Comparison View */}
                            {(change.oldValue !== undefined || change.newValue !== undefined) && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* OLD */}
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2 text-xs font-bold text-rose-500 uppercase tracking-wider">
                                            <Minus size={12} />
                                            Régi érték
                                        </div>
                                        <div className="bg-rose-500/5 border border-rose-500/10 rounded-lg p-3 font-mono text-xs text-rose-600/90 dark:text-rose-300 overflow-x-auto">
                                            {change.oldValue !== undefined ? formatValue(change.oldValue, 1000) : <span className="opacity-50 italic">Nincs adat</span>}
                                        </div>
                                    </div>

                                    {/* Arrow for Desktop */}
                                    <div className="hidden md:flex items-center justify-center absolute left-1/2 -translate-x-1/2 mt-8 text-muted-foreground/30 pointer-events-none">
                                        <ArrowRight size={20} />
                                    </div>

                                    {/* NEW */}
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2 text-xs font-bold text-emerald-500 uppercase tracking-wider">
                                            <Plus size={12} />
                                            Új érték
                                        </div>
                                        <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-lg p-3 font-mono text-xs text-emerald-600/90 dark:text-emerald-300 overflow-x-auto">
                                            {change.newValue !== undefined ? formatValue(change.newValue, 1000) : <span className="opacity-50 italic">Nincs adat</span>}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Tech Details Toggle */}
                            {change.operations.length > 0 && (
                                <div className="pt-2">
                                    <details className="text-xs group/tech">
                                        <summary className="text-muted-foreground hover:text-primary cursor-pointer transition-colors list-none flex items-center gap-2">
                                            <ChevronRight size={12} className="group-open/tech:rotate-90 transition-transform" />
                                            Technikai részletek ({change.operations.length} művelet)
                                        </summary>
                                        <div className="mt-2 pl-4 space-y-1 font-mono opacity-70">
                                            {change.operations.map((op, idx) => (
                                                <div key={idx} className="flex items-center gap-2 py-1 border-b border-border/50 last:border-0">
                                                    <span className={`text-[10px] uppercase font-bold px-1.5 rounded ${getOperationColor(op.op)}`}>
                                                        {op.op}
                                                    </span>
                                                    <span className="truncate">{op.path}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </details>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

function DiffOperationItem({ operation, viewMode }: { operation: EnrichedDiffOperation; viewMode: ViewMode }) {
    const [expanded, setExpanded] = useState(false);
    const [copied, setCopied] = useState(false);

    const formattedValue = useMemo(() => operation.value !== undefined ? formatValue(operation.value, 500) : null, [operation.value]);
    const formattedOldValue = useMemo(() => operation.oldValue !== undefined ? formatValue(operation.oldValue, 500) : null, [operation.oldValue]);

    const isLongValue = formattedValue && formattedValue.length > 100;

    const handleCopy = async () => {
        if (!formattedValue) return;
        await navigator.clipboard.writeText(formattedValue);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (viewMode === 'split') {
        return (
            <div className={`p-2 border-b border-border/50 font-mono text-xs ${getOperationColor(operation.op)} bg-opacity-10 opacity-70`}>
                {operation.path}
            </div>
        );
    }

    return (
        <div className="group border border-border/50 rounded-lg mb-2 overflow-hidden hover:border-border transition-colors bg-card">
            <div
                className="flex items-center gap-3 p-2.5 cursor-pointer bg-muted/20"
                onClick={() => setExpanded(!expanded)}
            >
                <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${getOperationColor(operation.op)}`}>
                    {operation.op}
                </span>
                <span className="text-xs font-mono text-muted-foreground flex-1 truncate">
                    {operation.path}
                </span>
                {formattedValue && (
                    <button
                        onClick={(e) => { e.stopPropagation(); handleCopy(); }}
                        className="p-1.5 rounded hover:bg-background text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-all"
                    >
                        {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                    </button>
                )}
            </div>

            {(expanded || !isLongValue) && (formattedValue || formattedOldValue) && (
                <div className="p-3 border-t border-border/50 bg-background/50 grid gap-2">
                    {/* Inline Diff Visualization */}
                    {operation.op === 'replace' ? (
                        <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="bg-rose-500/5 p-2 rounded text-rose-700 dark:text-rose-300 font-mono break-all border border-rose-500/10">
                                {formattedOldValue}
                            </div>
                            <div className="bg-emerald-500/5 p-2 rounded text-emerald-700 dark:text-emerald-300 font-mono break-all border border-emerald-500/10">
                                {formattedValue}
                            </div>
                        </div>
                    ) : (
                        <div className="font-mono text-xs p-2 rounded bg-muted/30 break-all text-muted-foreground">
                            {formattedValue}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function DiffViewer({ versionDetail, onClose }: DiffViewerProps) {
    const [viewMode, setViewMode] = useState<ViewMode>('semantic');
    const [isMaximized, setIsMaximized] = useState(false);

    // Parse diff operations
    const diffOperations = useMemo((): EnrichedDiffOperation[] => {
        try {
            if (!versionDetail.diff_forward_json) return [];
            const parsed = JSON.parse(versionDetail.diff_forward_json);
            if (!Array.isArray(parsed)) return [];

            return parsed.map((op: DiffOperation): EnrichedDiffOperation => {
                if (op.op === 'replace' && op.old_value !== undefined) return { ...op, oldValue: op.old_value };
                if (op.op === 'remove' && op.value !== undefined) return { ...op, oldValue: op.value };
                return op;
            });
        } catch (err) {
            console.error('[DiffViewer] Failed to parse diff:', err);
            return [];
        }
    }, [versionDetail.diff_forward_json]);

    // Semantic grouping
    const semanticChanges = useMemo((): SemanticChange[] => {
        const changes: SemanticChange[] = [];
        const processedPaths = new Set<string>();
        const groupedOps = new Map<string, EnrichedDiffOperation[]>();

        for (const op of diffOperations) {
            const parts = op.path.split('/').filter(Boolean);
            let groupKey = parts[0] || 'root';
            if (isArrayIndex(groupKey) && parts.length > 0) groupKey = `[${groupKey}]`;

            if (!groupedOps.has(groupKey)) groupedOps.set(groupKey, []);
            groupedOps.get(groupKey)!.push(op);
        }

        for (const [_groupKey, ops] of groupedOps.entries()) {
            const listInfo = detectListItemChange(ops);

            if (listInfo.isListItem) {
                const hasAdd = ops.some(op => op.op === 'add' && op.path === `/${listInfo.index}`);
                const hasRemove = ops.some(op => op.op === 'remove' && op.path === `/${listInfo.index}`);

                if (hasAdd) {
                    changes.push({
                        type: 'item_added',
                        description: listInfo.itemTitle ? `Új elem: "${listInfo.itemTitle}"` : `Új elem (#${listInfo.index! + 1})`,
                        icon: <Plus size={18} className="text-emerald-500" />,
                        color: 'emerald',
                        path: `/${listInfo.index}`,
                        itemIndex: listInfo.index,
                        newValue: ops.find(o => o.op === 'add')?.value,
                        operations: ops
                    });
                } else if (hasRemove) {
                    changes.push({
                        type: 'item_removed',
                        description: `Elem törölve (#${listInfo.index! + 1})`,
                        icon: <Minus size={18} className="text-rose-500" />,
                        color: 'rose',
                        path: `/${listInfo.index}`,
                        itemIndex: listInfo.index,
                        oldValue: ops.find(o => o.op === 'remove')?.value,
                        operations: ops
                    });
                } else {
                    changes.push({
                        type: 'item_modified',
                        description: listInfo.itemTitle ? `Módosítva: "${listInfo.itemTitle}"` : `Elem módosítva (#${listInfo.index! + 1})`,
                        icon: <Edit3 size={18} className="text-amber-500" />,
                        color: 'amber',
                        path: `/${listInfo.index}`,
                        itemIndex: listInfo.index,
                        operations: ops
                    });
                }
            } else {
                for (const op of ops) {
                    if (processedPaths.has(op.path)) continue;
                    processedPaths.add(op.path);
                    const fieldName = formatFieldName(op.path);

                    changes.push({
                        type: op.op === 'add' ? 'field_changed' : op.op === 'remove' ? 'field_changed' : 'field_changed',
                        description: `${fieldName} ${op.op === 'add' ? 'hozzáadva' : op.op === 'remove' ? 'törölve' : 'módosítva'}`,
                        icon: op.op === 'add' ? <Plus className="text-emerald-500" /> : op.op === 'remove' ? <Minus className="text-rose-500" /> : <Edit3 className="text-amber-500" />,
                        color: 'slate',
                        path: op.path,
                        fieldName,
                        oldValue: op.oldValue,
                        newValue: op.value,
                        operations: [op]
                    });
                }
            }
        }
        return changes;
    }, [diffOperations]);

    // Stats
    const stats = useMemo(() => {
        let adds = 0, removes = 0, replaces = 0;
        for (const op of diffOperations) {
            if (op.op === 'add') adds++;
            else if (op.op === 'remove') removes++;
            else if (op.op === 'replace') replaces++;
        }
        return { adds, removes, replaces, total: diffOperations.length };
    }, [diffOperations]);

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4 sm:p-6"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    onClick={(e) => e.stopPropagation()}
                    className={`
                        bg-background/95 backdrop-blur-xl border border-white/10 rounded-lg 
                        flex flex-col shadow-2xl overflow-hidden transition-all duration-300
                        ${isMaximized ? 'w-full h-full' : 'w-full max-w-5xl h-[85vh]'}
                    `}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between p-6 border-b border-border/50 bg-gradient-to-r from-background to-accent/5">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-primary/10 rounded-lg text-primary ring-1 ring-primary/20">
                                <GitCompare size={24} />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
                                    Változások
                                    <span className="px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-xs font-mono">
                                        #{versionDetail.version_number}
                                    </span>
                                </h2>
                                <p className="text-sm text-muted-foreground mt-0.5 max-w-[500px] truncate">
                                    {versionDetail.change_summary || new Date(versionDetail.changed_at).toLocaleString()}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="flex bg-muted/50 p-1 rounded-lg border border-border/50">
                                <button
                                    onClick={() => setViewMode('semantic')}
                                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === 'semantic' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                >
                                    <Package size={14} className="inline mr-1.5 mb-0.5" />
                                    Vizuális
                                </button>
                                <button
                                    onClick={() => setViewMode('inline')}
                                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode !== 'semantic' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                >
                                    <AlignJustify size={14} className="inline mr-1.5 mb-0.5" />
                                    Részletes
                                </button>
                            </div>

                            <div className="w-px h-6 bg-border/50 mx-1" />

                            <button
                                onClick={() => setIsMaximized(!isMaximized)}
                                className="p-2 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground"
                            >
                                {isMaximized ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                            </button>
                            <button
                                onClick={onClose}
                                className="p-2 hover:bg-rose-500/10 hover:text-rose-500 rounded-lg transition-colors"
                            >
                                <X size={18} />
                            </button>
                        </div>
                    </div>

                    {/* Stats Bar */}
                    <div className="px-6 py-2 bg-muted/20 border-b border-border/50 text-xs flex gap-4">
                        <span className="font-medium text-foreground/70">{stats.total} változás összesen</span>
                        {stats.adds > 0 && <span className="text-emerald-500 font-medium flex items-center gap-1"><Plus size={10} /> {stats.adds} új</span>}
                        {stats.removes > 0 && <span className="text-rose-500 font-medium flex items-center gap-1"><Minus size={10} /> {stats.removes} törölt</span>}
                        {stats.replaces > 0 && <span className="text-amber-500 font-medium flex items-center gap-1"><Edit3 size={10} /> {stats.replaces} módosított</span>}
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 overflow-y-auto p-6 bg-muted/5 custom-scrollbar">
                        {diffOperations.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full opacity-50">
                                <GitCompare size={48} className="mb-4 text-muted-foreground" />
                                <p className="text-muted-foreground font-medium">Nincs változás ebben a verzióban</p>
                            </div>
                        ) : viewMode === 'semantic' ? (
                            <div className="max-w-4xl mx-auto space-y-4">
                                {semanticChanges.map((change, idx) => (
                                    <SemanticChangeCard key={idx} change={change} />
                                ))}
                            </div>
                        ) : (
                            <div className="max-w-4xl mx-auto space-y-2">
                                {diffOperations.map((op, idx) => (
                                    <DiffOperationItem key={idx} operation={op} viewMode="inline" />
                                ))}
                            </div>
                        )}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

export default DiffViewer;
