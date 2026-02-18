/**
 * QueryBuilder - Power Query Style Data Transformation UI
 * Visual column mapping with drag & drop and transformations
 */

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowRight, Check, Trash2,
    ChevronDown, Zap, Type, Hash, Calendar, ToggleLeft,
    Link2, Eye, EyeOff, GripVertical, Filter, FolderOpen, Sparkles
} from 'lucide-react';
import { ProcessResult, MappingRule, TargetField, TransformType } from './types';

// FileSystem Access API type declaration (Chrome/Edge only)
declare global {
    interface Window {
        showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
    }
}

interface QueryBuilderProps {
    processResult: ProcessResult;
    targetFields: TargetField[];
    mappings: MappingRule[];
    onMappingsChange: (mappings: MappingRule[]) => void;
    onBack: () => void;
    onExecute: () => void;
    executing: boolean;
    // Image settings
    imageSourceDir?: string;
    imageBaseUrl?: string;
    onImageSourceDirChange?: (dir: string) => void;
    onImageBaseUrlChange?: (url: string) => void;
}

const TRANSFORMS: { id: TransformType; label: string; icon: typeof Type }[] = [
    { id: 'none', label: 'Nincs', icon: Zap },
    { id: 'uppercase', label: 'NAGYBETŰ', icon: Type },
    { id: 'lowercase', label: 'kisbetű', icon: Type },
    { id: 'trim', label: 'Trim', icon: Filter },
    { id: 'number', label: 'Szám', icon: Hash },
    { id: 'date', label: 'Dátum', icon: Calendar },
    { id: 'boolean', label: 'Bool', icon: ToggleLeft },
    { id: 'slug', label: 'Slug', icon: Link2 },
];

interface ColumnCardProps {
    column: string;
    sampleValue: string;
    mapping: MappingRule | undefined;
    targetFields: TargetField[];
    usedTargets: string[];
    onMap: (target: string, transform: TransformType) => void;
    onRemove: () => void;
    // Image settings (shared across all image fields)
    imageSourceDir?: string;
    imageBaseUrl?: string;
    onImageSourceDirChange?: (dir: string) => void;
    onImageBaseUrlChange?: (url: string) => void;
    // Local folder browsing
    localFolderName?: string;
    onBrowseLocalFolder?: () => void;
}

function ColumnCard({
    column,
    sampleValue,
    mapping,
    targetFields,
    usedTargets,
    onMap,
    onRemove,
    imageSourceDir,
    imageBaseUrl,
    onImageSourceDirChange,
    onImageBaseUrlChange,
    localFolderName,
    onBrowseLocalFolder,
}: ColumnCardProps) {
    const [expanded, setExpanded] = useState(false);
    const [selectedTarget, setSelectedTarget] = useState(mapping?.target || '');
    const [selectedTransform, setSelectedTransform] = useState<TransformType>(mapping?.transform || 'none');
    const [showImageSettings, setShowImageSettings] = useState(false);

    const isMapped = !!mapping?.target;
    const availableTargets = targetFields.filter(
        f => !usedTargets.includes(f.id) || f.id === mapping?.target
    );

    // Check if selected target is an image type field
    const selectedTargetField = targetFields.find(f => f.id === selectedTarget);
    const isImageTarget = selectedTargetField?.type && ['image', 'gif', 'gallery'].includes(selectedTargetField.type);

    const handleApply = () => {
        if (selectedTarget) {
            onMap(selectedTarget, selectedTransform);
            setExpanded(false);
        }
    };

    const getTransformPreview = (value: string, transform: TransformType): string => {
        switch (transform) {
            case 'uppercase': return value.toUpperCase();
            case 'lowercase': return value.toLowerCase();
            case 'trim': return value.trim();
            case 'number': {
                const num = parseFloat(value);
                return !isNaN(num) ? num.toLocaleString('hu-HU') : value;
            }
            case 'slug': return value.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
            default: return value;
        }
    };

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className={`
                border rounded-lg overflow-hidden transition-all
                ${isMapped ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-border'}
            `}
        >
            {/* Header */}
            <div
                className="flex items-center gap-3 p-4 cursor-pointer hover:bg-foreground/[0.02]"
                onClick={() => setExpanded(!expanded)}
            >
                <GripVertical size={14} className="opacity-30 cursor-grab" />

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium truncate">{column}</span>
                        {isMapped && (
                            <motion.span
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center"
                            >
                                <Check size={10} className="text-white" />
                            </motion.span>
                        )}
                    </div>
                    <div className="text-xs opacity-50 truncate mt-0.5 font-mono">
                        {sampleValue || '(üres)'}
                    </div>
                </div>

                {isMapped && (
                    <div className="flex items-center gap-2 text-xs">
                        <ArrowRight size={12} className="opacity-30" />
                        <span className="px-2 py-1 bg-foreground/10 rounded font-mono">
                            {targetFields.find(f => f.id === mapping.target)?.label || mapping.target}
                        </span>
                        {mapping.transform && mapping.transform !== 'none' && (
                            <span className="px-2 py-0.5 bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded text-[10px] uppercase">
                                {mapping.transform}
                            </span>
                        )}
                    </div>
                )}

                <motion.div
                    animate={{ rotate: expanded ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                >
                    <ChevronDown size={16} className="opacity-40" />
                </motion.div>
            </div>

            {/* Expanded Panel */}
            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="border-t border-border overflow-hidden"
                    >
                        <div className="p-4 space-y-4 bg-foreground/[0.02]">
                            {/* Target Field Selection */}
                            <div>
                                <label className="text-xs opacity-50 uppercase tracking-wider block mb-2">
                                    Cél Mező
                                </label>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    {availableTargets.map(field => (
                                        <button
                                            key={field.id}
                                            onClick={() => setSelectedTarget(field.id)}
                                            className={`
                                                px-3 py-2 text-xs font-mono rounded border text-left
                                                transition-all
                                                ${selectedTarget === field.id
                                                    ? 'border-foreground bg-foreground text-background'
                                                    : 'border-border hover:border-foreground/50'}
                                            `}
                                        >
                                            {field.label}
                                            {field.required && <span className="text-red-500 ml-1">*</span>}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Transform Selection */}
                            <div>
                                <label className="text-xs opacity-50 uppercase tracking-wider block mb-2">
                                    Transzformáció
                                </label>
                                <div className="flex flex-wrap gap-1">
                                    {TRANSFORMS.map(t => (
                                        <button
                                            key={t.id}
                                            onClick={() => setSelectedTransform(t.id)}
                                            className={`
                                                px-2 py-1 text-xs rounded flex items-center gap-1
                                                transition-all
                                                ${selectedTransform === t.id
                                                    ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                                                    : 'bg-foreground/5 hover:bg-foreground/10'}
                                            `}
                                        >
                                            <t.icon size={10} />
                                            {t.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Preview */}
                            {selectedTarget && (
                                <div className="p-3 bg-background rounded border border-border">
                                    <div className="text-xs opacity-50 mb-2">Előnézet:</div>
                                    <div className="flex items-center gap-3 text-sm font-mono">
                                        <span className="opacity-50 line-through">{sampleValue}</span>
                                        <ArrowRight size={12} className="opacity-30" />
                                        <span className="text-emerald-500">
                                            {getTransformPreview(sampleValue, selectedTransform)}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* Image Settings - Only for image type targets */}
                            {isImageTarget && (
                                <div className="border border-purple-500/30 rounded-lg overflow-hidden">
                                    <button
                                        onClick={() => setShowImageSettings(!showImageSettings)}
                                        className="w-full px-3 py-2 flex items-center justify-between bg-purple-500/10 hover:bg-purple-500/20 transition-colors"
                                    >
                                        <span className="text-xs font-medium text-purple-700 dark:text-purple-400">Kép Forrás Beállítások</span>
                                        <span className="text-[10px] opacity-60">
                                            {showImageSettings ? '▲' : '▼'}
                                        </span>
                                    </button>

                                    {showImageSettings && (
                                        <div className="p-3 space-y-3 bg-purple-500/5 dark:bg-black/20">
                                            {/* Remote URL - Primary method */}
                                            <div>
                                                <label className="block text-[10px] opacity-70 mb-1 flex items-center gap-1">
                                                    <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                                                    Távoli Szerver URL (ajánlott)
                                                </label>
                                                <input
                                                    type="text"
                                                    value={imageBaseUrl || ''}
                                                    onChange={(e) => onImageBaseUrlChange?.(e.target.value)}
                                                    placeholder="https://valami.hu/wp-content/uploads/"
                                                    className="w-full px-2 py-1.5 bg-white dark:bg-black/30 border border-purple-200 dark:border-white/10 rounded text-xs placeholder:opacity-40 focus:border-purple-500 focus:outline-none text-foreground transition-colors shadow-sm"
                                                />
                                                <p className="text-[9px] opacity-40 mt-1">
                                                    <strong>FONTOS:</strong> A teljes mappa URL-t add meg!
                                                    A kód hozzáadja a fájlnevet: baseUrl + "/IMG_2202.webp"
                                                </p>
                                            </div>

                                            {/* Local Folder Browser - Modern File System Access API */}
                                            {typeof window !== 'undefined' && 'showDirectoryPicker' in window && (
                                                <div className="pt-2 border-t border-white/10">
                                                    <label className="block text-[10px] opacity-70 mb-1 flex items-center gap-1">
                                                        <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                                        Lokális Mappa (böngészőből)
                                                    </label>
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={onBrowseLocalFolder}
                                                            className="flex-1 px-3 py-2 bg-green-500/10 hover:bg-green-500/20 border border-green-500/20 dark:border-green-500/30 rounded text-xs font-medium text-green-700 dark:text-green-400 flex items-center justify-center gap-2 transition-colors"
                                                        >
                                                            <FolderOpen size={14} />
                                                            {localFolderName || 'Mappa tallózása...'}
                                                        </button>
                                                    </div>
                                                    <p className="text-[9px] opacity-40 mt-1">
                                                        Chrome/Edge: Válassz mappát a saját gépedről. A képeket közvetlenül innen tölti fel.
                                                    </p>
                                                </div>
                                            )}

                                            {/* Local Folder Path - Server-side fallback */}
                                            <div className="pt-2 border-t border-white/10">
                                                <label className="block text-[10px] opacity-70 mb-1">
                                                    Lokális Mappa (Beta)
                                                </label>
                                                <input
                                                    type="text"
                                                    value={imageSourceDir || ''}
                                                    onChange={(e) => onImageSourceDirChange?.(e.target.value)}
                                                    placeholder="/var/www/regi-oldal/wp-content/uploads"
                                                    className="w-full px-2 py-1.5 bg-white dark:bg-black/30 border border-purple-200 dark:border-white/10 rounded text-xs placeholder:opacity-40 focus:border-purple-500 focus:outline-none font-mono text-foreground transition-colors shadow-sm"
                                                />
                                                <p className="text-[9px] opacity-40 mt-1">
                                                    Ha a képek a CMS szerverén lokálisan elérhetők (backend).
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex items-center gap-2 pt-2">
                                <button
                                    onClick={handleApply}
                                    disabled={!selectedTarget}
                                    className="
                                        flex-1 px-4 py-2 bg-foreground text-background 
                                        font-mono text-xs uppercase tracking-widest
                                        disabled:opacity-30 hover:opacity-90 transition-opacity
                                        flex items-center justify-center gap-2
                                    "
                                >
                                    <Check size={12} />
                                    Alkalmaz
                                </button>
                                {isMapped && (
                                    <button
                                        onClick={() => {
                                            onRemove();
                                            setExpanded(false);
                                            setSelectedTarget('');
                                        }}
                                        className="
                                            px-4 py-2 border border-red-500/50 text-red-500
                                            font-mono text-xs uppercase tracking-widest
                                            hover:bg-red-500/10 transition-colors
                                            flex items-center gap-2
                                        "
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

// Local folder handle for File System Access API (self-contained state)
let _localFolderHandle: FileSystemDirectoryHandle | null = null;

/**
 * Export the current local folder handle for use in ForgeTab
 * Returns null if no folder has been selected
 */
export function getLocalFolderHandle(): FileSystemDirectoryHandle | null {
    return _localFolderHandle;
}

/**
 * Clear the stored local folder handle (called after migration completes)
 */
export function clearLocalFolderHandle(): void {
    _localFolderHandle = null;
}

export function QueryBuilder({
    processResult,
    targetFields,
    mappings,
    onMappingsChange,
    onBack,
    onExecute,
    executing,
    imageSourceDir,
    imageBaseUrl,
    onImageSourceDirChange,
    onImageBaseUrlChange,
}: QueryBuilderProps) {
    const [showUnmapped, setShowUnmapped] = useState(true);
    const [showMapped, setShowMapped] = useState(true);
    const [localFolderName, setLocalFolderName] = useState<string>('');

    // Handle local folder browsing via File System Access API
    const handleBrowseLocalFolder = async () => {
        if (!window.showDirectoryPicker) {
            alert('A böngésződ nem támogatja a mappa tallózást. Használj Chrome-ot vagy Edge-et!');
            return;
        }

        try {
            const handle = await window.showDirectoryPicker();
            _localFolderHandle = handle; // Store for later use in image upload
            setLocalFolderName(handle.name);
        } catch (err) {
            // User cancelled the picker
            if ((err as Error).name !== 'AbortError') {
                console.error('Folder picker error:', err);
            }
        }
    };

    const usedTargets = useMemo(
        () => mappings.filter(m => m.target).map(m => m.target),
        [mappings]
    );

    const mappedCount = mappings.filter(m => m.target).length;
    const unmappedColumns = processResult.headers.filter(
        h => !mappings.find(m => m.source === h)?.target
    );
    const mappedColumns = processResult.headers.filter(
        h => mappings.find(m => m.source === h)?.target
    );

    const handleMap = (source: string, target: string, transform: TransformType) => {
        const newMappings = mappings.map(m =>
            m.source === source ? { ...m, target, transform } : m
        );
        onMappingsChange(newMappings);
    };

    const handleRemove = (source: string) => {
        const newMappings = mappings.map(m =>
            m.source === source ? { ...m, target: '', transform: 'none' as TransformType } : m
        );
        onMappingsChange(newMappings);
    };

    const handleAutoMap = () => {
        const newMappings = mappings.map(m => {
            // Try exact match
            const exactMatch = targetFields.find(
                f => f.id.toLowerCase() === m.source.toLowerCase()
            );
            if (exactMatch && !usedTargets.includes(exactMatch.id)) {
                return { ...m, target: exactMatch.id, transform: 'none' as TransformType };
            }
            return m;
        });
        onMappingsChange(newMappings);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-mono font-medium flex items-center gap-2">
                        <Sparkles size={18} className="text-amber-500" />
                        Query Builder
                    </h3>
                    <p className="text-xs opacity-50 mt-1">
                        {processResult.total_rows.toLocaleString()} sor • {processResult.headers.length} oszlop
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleAutoMap}
                        className="
                            px-3 py-1.5 border border-border rounded
                            text-xs font-mono uppercase tracking-wider
                            hover:border-foreground hover:bg-foreground hover:text-background
                            transition-all flex items-center gap-2
                        "
                    >
                        <Zap size={12} />
                        Auto-Map
                    </button>
                </div>
            </div>

            {/* Stats Bar */}
            <div className="flex items-center gap-4 p-4 bg-foreground/[0.02] border border-border rounded-lg">
                <div className="flex-1">
                    <div className="text-xs opacity-50 mb-1">Párosítva</div>
                    <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-border rounded-full overflow-hidden">
                            <motion.div
                                className="h-full bg-emerald-500"
                                initial={{ width: 0 }}
                                animate={{ width: `${(mappedCount / processResult.headers.length) * 100}%` }}
                            />
                        </div>
                        <span className="text-sm font-mono">
                            {mappedCount}/{processResult.headers.length}
                        </span>
                    </div>
                </div>
                <div className="h-8 w-px bg-border" />
                <div className="text-center">
                    <div className="text-2xl font-mono font-bold text-emerald-500">{mappedCount}</div>
                    <div className="text-[10px] opacity-50 uppercase">Aktív</div>
                </div>
            </div>

            {/* Column Lists */}
            <div className="space-y-4">
                {/* Unmapped Section */}
                {unmappedColumns.length > 0 && (
                    <div>
                        <button
                            onClick={() => setShowUnmapped(!showUnmapped)}
                            className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider opacity-50 hover:opacity-100 mb-3"
                        >
                            {showUnmapped ? <EyeOff size={12} /> : <Eye size={12} />}
                            Párosítatlan ({unmappedColumns.length})
                            <motion.div animate={{ rotate: showUnmapped ? 0 : -90 }}>
                                <ChevronDown size={12} />
                            </motion.div>
                        </button>
                        <AnimatePresence>
                            {showUnmapped && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="space-y-2"
                                >
                                    {unmappedColumns.map((col) => (
                                        <ColumnCard
                                            key={col}
                                            column={col}
                                            sampleValue={processResult.preview[0]?.[processResult.headers.indexOf(col)] || ''}
                                            mapping={mappings.find(m => m.source === col)}
                                            targetFields={targetFields}
                                            usedTargets={usedTargets}
                                            onMap={(target, transform) => handleMap(col, target, transform)}
                                            onRemove={() => handleRemove(col)}
                                            imageSourceDir={imageSourceDir}
                                            imageBaseUrl={imageBaseUrl}
                                            onImageSourceDirChange={onImageSourceDirChange}
                                            onImageBaseUrlChange={onImageBaseUrlChange}
                                            localFolderName={localFolderName}
                                            onBrowseLocalFolder={handleBrowseLocalFolder}
                                        />
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                )}

                {/* Mapped Section */}
                {mappedColumns.length > 0 && (
                    <div>
                        <button
                            onClick={() => setShowMapped(!showMapped)}
                            className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-emerald-500 hover:opacity-80 mb-3"
                        >
                            <Check size={12} />
                            Párosítva ({mappedColumns.length})
                            <motion.div animate={{ rotate: showMapped ? 0 : -90 }}>
                                <ChevronDown size={12} />
                            </motion.div>
                        </button>
                        <AnimatePresence>
                            {showMapped && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="space-y-2"
                                >
                                    {mappedColumns.map((col) => (
                                        <ColumnCard
                                            key={col}
                                            column={col}
                                            sampleValue={processResult.preview[0]?.[processResult.headers.indexOf(col)] || ''}
                                            mapping={mappings.find(m => m.source === col)}
                                            targetFields={targetFields}
                                            usedTargets={usedTargets}
                                            onMap={(target, transform) => handleMap(col, target, transform)}
                                            onRemove={() => handleRemove(col)}
                                            imageSourceDir={imageSourceDir}
                                            imageBaseUrl={imageBaseUrl}
                                            onImageSourceDirChange={onImageSourceDirChange}
                                            onImageBaseUrlChange={onImageBaseUrlChange}
                                            localFolderName={localFolderName}
                                            onBrowseLocalFolder={handleBrowseLocalFolder}
                                        />
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-4 border-t border-border">
                <button
                    onClick={onBack}
                    disabled={executing}
                    className="
                        px-6 py-3 border border-border rounded
                        font-mono text-xs uppercase tracking-widest
                        hover:bg-foreground/5 transition-colors
                        disabled:opacity-30
                    "
                >
                    Vissza
                </button>
                <button
                    onClick={onExecute}
                    disabled={mappedCount === 0 || executing}
                    className="
                        flex-1 px-6 py-3 bg-foreground text-background rounded
                        font-mono text-xs uppercase tracking-widest
                        disabled:opacity-30 hover:opacity-90 transition-opacity
                        flex items-center justify-center gap-2
                    "
                >
                    {executing ? (
                        <>
                            <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                            >
                                <Sparkles size={14} />
                            </motion.div>
                            Feldolgozás...
                        </>
                    ) : (
                        <>
                            <Sparkles size={14} />
                            Migráció Indítása ({mappedCount} oszlop)
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
