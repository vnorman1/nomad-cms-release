/**
 * VersionPanel - Version History Sidebar Component
 * 
 * Shows version history with lazy loading and allows restore operations.
 * Integrates with the SlotEditor for content versioning.
 * 
 * Features:
 * - Lazy loading of version list
 * - On-demand diff preview
 * - One-click restore
 * - Change summary display
 * - WASM-powered search through version content
 * - Git Tree Style Layout (Single Column)
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
    History,
    RotateCcw,
    Clock,
    User,
    ChevronDown,
    AlertCircle,
    CheckCircle,
    Loader2,
    Eye,
    X,
    Trash2,
    CloudDownload,
    Search,
    NotepadTextDashed,
    Pencil,
    Check,
    ShieldCheck,
    Timer,
    Tag
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { VersionMetadata } from '@/services/versioningService';
import { useVersioning } from '@/hooks/useVersioning';
import { DiffViewer } from './DiffViewer.js';
import { useUI } from '@/context/UIContext';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface VersionPanelProps {
    slotKey: string;
    currentContent: unknown;
    /** Called after atomic restore with restored content and new version number */
    onRestore: (content: unknown, newVersion?: number) => void;
    isOpen: boolean;
    onClose: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════
// HIGHLIGHT HELPER
// ═══════════════════════════════════════════════════════════════════════════

function highlightText(text: string, tokens: string[]): React.ReactNode {
    if (!tokens || tokens.length === 0) return text;

    // Create regex pattern from tokens
    const pattern = tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const regex = new RegExp(`(${pattern})`, 'gi');

    const parts = text.split(regex);
    return parts.map((part, i) => {
        const isMatch = tokens.some(t => t.toLowerCase() === part.toLowerCase());
        return isMatch ? (
            <mark key={i} className="bg-yellow-300/50 text-inherit rounded px-0.5">{part}</mark>
        ) : part;
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function VersionPanel({
    slotKey,
    currentContent,
    onRestore,
    isOpen,
    onClose
}: VersionPanelProps) {
    const { confirm, prompt } = useUI();
    const {
        versions,
        selectedVersion,
        totalCount,
        loading,
        loadingMore,
        error,
        isEnabled,
        wasmReady: _wasmReady,
        includeShadows,
        loadMore,
        loadAllVersions,
        loadVersionDetail,
        restoreVersion,
        deleteAllVersions,
        tokenizeContent,
        refresh,
        // Hybrid versioning
        setIncludeShadows,
        promoteVersion,
        deleteVersion,
        renameVersion,
        formatTTL,
        getVersionTypeInfo
    } = useVersioning(slotKey, { autoLoad: isOpen });

    const [selectedVersionNumber, setSelectedVersionNumber] = useState<number | null>(null);
    const [showDiffViewer, setShowDiffViewer] = useState(false);
    const [restoring, setRestoring] = useState(false);
    const [restoreSuccess, setRestoreSuccess] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Force refresh version list every time panel opens to sync with database
    // This prevents showing stale versions that were deleted by cleanup
    const prevIsOpenRef = useRef(isOpen);
    useEffect(() => {
        if (isOpen && !prevIsOpenRef.current) {
            // Panel just opened - refresh to get latest data
            refresh();
        }
        prevIsOpenRef.current = isOpen;
    }, [isOpen, refresh]);

    // Scroll to version logic
    const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());

    const handleScrollToVersion = (versionNumber: number) => {
        const element = itemRefs.current.get(versionNumber);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    };

    // Tokenize search query for matching
    const searchTokens = useMemo(() => {
        if (!searchQuery.trim() || searchQuery.length < 2) return [];
        // Use WASM tokenizer if available, otherwise simple split
        if (tokenizeContent) {
            return tokenizeContent(searchQuery).split(' ').filter(t => t.length > 0);
        }
        return searchQuery.toLowerCase().split(/\s+/).filter(t => t.length >= 2);
    }, [searchQuery, tokenizeContent]);

    // Filter versions by search query
    const filteredVersions = useMemo(() => {
        if (searchTokens.length === 0) return versions;

        return versions.filter(version => {
            const summary = (version.change_summary || '').toLowerCase();
            const changedBy = (version.changed_by || '').toLowerCase();
            const versionNum = `#${version.version_number}`;
            const versionName = (version.version_name || '').toLowerCase();

            // Match if any search token is found in summary, changed_by, version number, or custom name
            return searchTokens.some(token =>
                summary.includes(token) ||
                changedBy.includes(token) ||
                versionNum.includes(token) ||
                versionName.includes(token)
            );
        });
    }, [versions, searchTokens]);

    // Clear search
    const handleClearSearch = useCallback(() => {
        setSearchQuery('');
    }, []);

    // Handle version select
    const handleVersionSelect = async (version: VersionMetadata) => {
        setSelectedVersionNumber(version.version_number);
        await loadVersionDetail(version.version_number);
    };

    // Handle restore (now uses atomic server-side restore)
    const handleRestore = async (versionNumber: number) => {
        if (restoring) return;

        confirm({
            title: `Verzió visszaállítása (#${versionNumber})`,
            message: "Biztosan visszaállítod ezt a verziót? Ez felülírja a jelenlegi tartalmat egy új verzióval.",
            confirmLabel: "Visszaállítás",
            isDestructive: false,
            onConfirm: async () => {
                setRestoring(true);
                setRestoreSuccess(false);

                try {
                    // Atomic restore - server handles save in transaction
                    const result = await restoreVersion(versionNumber);

                    if (result !== null) {
                        // Pass restored content and new version number to parent
                        onRestore(result.content, result.newVersion);
                        setRestoreSuccess(true);
                        setTimeout(() => setRestoreSuccess(false), 2000);
                    }
                } finally {
                    setRestoring(false);
                }
            }
        });
    };

    // Handle show diff
    const handleShowDiff = async (versionNumber: number) => {
        await loadVersionDetail(versionNumber);
        setShowDiffViewer(true);
    };

    // Handle load all versions
    const handleLoadAll = async () => {
        await loadAllVersions();
    };

    // Handle delete all versions
    const handleDeleteAll = async () => {
        confirm({
            title: "Előzmények törlése",
            message: `Biztosan TÖRÖLNI szeretnéd MINDEN verziót (${totalCount} db)? Ez a művelet VÉGLEGES és nem visszavonható!`,
            confirmLabel: "Végleges törlés",
            isDestructive: true,
            onConfirm: async () => {
                setDeleting(true);
                try {
                    const success = await deleteAllVersions();
                    if (success) {
                        setRestoreSuccess(true);
                        setTimeout(() => setRestoreSuccess(false), 2000);
                    }
                } finally {
                    setDeleting(false);
                }
            }
        });
    };

    // Format relative time (e.g. "2 hours ago")
    const getRelativeTime = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

        if (diffInSeconds < 60) return 'épp most';
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} perce`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} órája`;
        if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)} napja`;
        return date.toLocaleDateString('hu-HU');
    };

    return (
        <>
            <AnimatePresence>
                {isOpen && (
                    <>
                        {/* Overlay */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[75]"
                            onClick={onClose}
                        />

                        {/* Panel */}
                        <motion.div
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            className="fixed right-0 top-0 h-full w-full max-w-md bg-background/95 backdrop-blur-xl border-l border-border/50 shadow-2xl z-[80] flex flex-col"
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between p-6 border-b border-border/40 bg-gradient-to-br from-background via-background/50 to-primary/5">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-primary/10 rounded-lg text-primary ring-1 ring-primary/20">
                                        <History size={24} />
                                    </div>
                                    <div>
                                        <h2 className="font-bold text-xl tracking-tight">Előzmények</h2>
                                        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground/80 mt-0.5">
                                            <span className="bg-muted px-2 py-0.5 rounded-full">{totalCount} verzió</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    {/* Shadow Toggle - Compact icon button */}
                                    <button
                                        onClick={() => setIncludeShadows(!includeShadows)}
                                        className={`p-2 rounded-lg transition-all active:scale-95 ${includeShadows
                                            ? 'bg-sky-500/15 text-sky-500 ring-1 ring-sky-500/30'
                                            : 'hover:bg-muted/80 text-muted-foreground hover:text-foreground'
                                            }`}
                                        title={includeShadows ? "Piszkozatok elrejtése" : "Piszkozatok mutatása (automatikus mentések)"}
                                    >
                                        <NotepadTextDashed size={16} />
                                    </button>
                                    {versions.length < totalCount && (
                                        <button
                                            onClick={handleLoadAll}
                                            disabled={loading}
                                            className="p-2 hover:bg-muted/80 rounded-lg transition-all text-muted-foreground hover:text-foreground active:scale-95"
                                            title="Összes betöltése"
                                        >
                                            <CloudDownload size={16} />
                                        </button>
                                    )}
                                    {totalCount > 0 && (
                                        <button
                                            onClick={handleDeleteAll}
                                            className="p-2 hover:bg-red-500/10 text-muted-foreground hover:text-red-500 rounded-lg transition-all active:scale-95"
                                            title="Előzmények törlése"
                                        >
                                            {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                                        </button>
                                    )}
                                    <button
                                        onClick={onClose}
                                        className="p-2 hover:bg-muted/80 rounded-lg transition-all active:scale-95"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>
                            </div>

                            {/* Search */}
                            <div className="px-6 py-4">
                                <div className="relative group">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Search size={16} className="text-muted-foreground/70 group-focus-within:text-primary transition-colors" />
                                    </div>
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder="Keresés..."
                                        className="block w-full pl-10 pr-3 py-3 bg-muted/40 border-0 ring-1 ring-border/50 rounded-lg text-sm placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-primary/50 focus:bg-background transition-all"
                                    />
                                    {searchQuery && (
                                        <button
                                            onClick={handleClearSearch}
                                            className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-foreground"
                                        >
                                            <X size={14} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Messages */}
                            <AnimatePresence>
                                {!isEnabled && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0 }}
                                        className="px-6 pb-4"
                                    >
                                        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-center gap-3 text-sm text-amber-600">
                                            <AlertCircle size={18} />
                                            <span className="font-medium">Verziókezelés inaktív</span>
                                        </div>
                                    </motion.div>
                                )}
                                {restoreSuccess && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                                        className="px-6 pb-4"
                                    >
                                        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-3 text-sm text-emerald-600 font-medium shadow-sm">
                                            <CheckCircle size={18} />
                                            <span>Sikeres visszaállítás!</span>
                                        </div>
                                    </motion.div>
                                )}
                                {error && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0 }}
                                        className="px-6 pb-4"
                                    >
                                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-3 text-sm text-red-600 font-medium">
                                            <AlertCircle size={18} />
                                            <span>{error}</span>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Versions List */}
                            <div className="flex-1 overflow-y-auto custom-scrollbar">
                                <div className="p-4 space-y-6 pb-[25vh]">
                                    {loading && versions.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-20 gap-4">
                                            <Loader2 size={32} className="animate-spin text-primary" />
                                            <p className="text-sm text-muted-foreground animate-pulse">Előzmények betöltése...</p>
                                        </div>
                                    ) : filteredVersions.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground opacity-60">
                                            <History size={48} className="mb-4 stroke-1" />
                                            <p>Nincs találat</p>
                                        </div>
                                    ) : (
                                        <div className="relative pl-4 space-y-0">
                                            {/* Vertical Timeline Line */}
                                            <div className="absolute left-[23px] top-6 bottom-6 w-px bg-border/60" />

                                            {filteredVersions.map((version, i) => {
                                                const isSelected = selectedVersionNumber === version.version_number;
                                                const isLatest = i === 0;
                                                const isLast = i === filteredVersions.length - 1;

                                                // Smart Restore Logic - match is computed below in restoredFromVersion

                                                // Check if this version is the "Source" of the currently selected version
                                                const isRestoreSource = selectedVersion?.change_summary?.includes(`Restored from v${version.version_number}`);

                                                // Determine active restore path (Source -> Target)
                                                // We want to draw a line from the Selected Version (Target) down to its Source
                                                // Support English "Restored from vX" and potential localized/variants
                                                let activeRestoredFromStr = selectedVersion?.change_summary?.match(/Restored from v(\d+)/)?.[1];

                                                // Fallback: Check for Hungarian "Visszaállítva vX-ről" or other formats if needed
                                                // Also fallback to the local item's parsed version if this is the selected item
                                                if (!activeRestoredFromStr && selectedVersion?.change_summary) {
                                                    const genericMatch = selectedVersion.change_summary.match(/v(\d+)/);
                                                    if (genericMatch) activeRestoredFromStr = genericMatch[1];
                                                }

                                                const activeRestoredFrom = activeRestoredFromStr ? parseInt(activeRestoredFromStr, 10) : null;
                                                const isRestorePathActive = activeRestoredFrom !== null && Number.isInteger(activeRestoredFrom);

                                                const currentVerNum = Number(version.version_number);
                                                const selectedVerNum = selectedVersion ? Number(selectedVersion.version_number) : -1;

                                                // Check if current version is part of this path
                                                // Assumes descending order: Selected (High) -> ... -> Source (Low)
                                                // Start: The Selected Version (Target)
                                                const isRestorePathStart = isRestorePathActive && currentVerNum === selectedVerNum;
                                                // End: The Restored From Version (Source)
                                                const isRestorePathEnd = isRestorePathActive && currentVerNum === activeRestoredFrom;

                                                // Middle: Everything strictly between
                                                // CRITICAL FIX: Ensure full bridge connection across any gap
                                                // Check strictly: activeRestoredFrom < current < selectedVerNum
                                                const isRestorePathMiddle = isRestorePathActive &&
                                                    activeRestoredFrom !== null &&
                                                    selectedVersion &&
                                                    currentVerNum < selectedVerNum &&
                                                    currentVerNum > activeRestoredFrom;

                                                // Update the local variable used for the LINK to match this global logic
                                                // This ensures what we SEE in the link is what drives the LINE
                                                const restoredFromVersion = (version.id === selectedVersion?.id) ? activeRestoredFrom : (version.change_summary?.match(/Restored from v(\d+)/) ? parseInt(version.change_summary.match(/Restored from v(\d+)/)![1]) : null);

                                                // Calculate sequential animation delays based on distance from start (Selected Version)
                                                // Flow: Start Horizontal -> Vertical Stream Down -> End Horizontal
                                                const pathDist = selectedVerNum - currentVerNum; // 0 for start, increasing downwards
                                                const baseDelay = 0.2;
                                                const stepDelay = 0.05; // Fast flow per item
                                                const vertDelay = baseDelay + 0.2 + (pathDist * stepDelay);

                                                return (
                                                    <motion.div
                                                        key={version.id}
                                                        ref={(el) => {
                                                            if (el) itemRefs.current.set(version.version_number, el);
                                                            else itemRefs.current.delete(version.version_number);
                                                        }}
                                                        initial={{ opacity: 0, x: -20 }}
                                                        animate={{ opacity: 1, x: 0 }}
                                                        transition={{ delay: i * 0.05 }} // Stagger list appearance independently
                                                        onClick={() => handleVersionSelect(version)}
                                                        className={`
                                                        relative pl-8 py-2 cursor-pointer group
                                                        transition-colors duration-200
                                                    `}
                                                    >
                                                        {/* Timeline Node/Dot */}
                                                        <div className={`
                                                        absolute left-[19px] top-[24px] w-2.5 h-2.5 rounded-full z-10 
                                                        ring-[3px] ring-background transition-all duration-300
                                                        ${isSelected
                                                                ? 'bg-amber-500 scale-110 ring-amber-500/20'
                                                                : isRestoreSource
                                                                    ? 'bg-emerald-500 ring-emerald-500/20 scale-100'
                                                                    : isLatest
                                                                        ? 'bg-foreground border border-background'
                                                                        : 'bg-border group-hover:bg-foreground/50'
                                                            }
                                                    `} />

                                                        {/* Connector line for selected intent (Jump From) - ONLY if not last */}
                                                        {isSelected && !isLast && (
                                                            <motion.div
                                                                initial={{ height: 0 }} animate={{ height: '100%' }}
                                                                className="absolute left-[23px] top-[24px] w-[2px] bg-amber-500/40 h-full z-0 pointer-events-none"
                                                            />
                                                        )}

                                                        {/* RESTORE PATH LINE (Emerald) - Left Side Circuit */}
                                                        {(isRestorePathStart || isRestorePathMiddle || isRestorePathEnd) && (
                                                            <>
                                                                {/* Horizontal Connector to Dot (Start) - First Step */}
                                                                {isRestorePathStart && (
                                                                    <motion.div
                                                                        initial={{ scaleX: 0, opacity: 0 }}
                                                                        animate={{ scaleX: 1, opacity: 1 }}
                                                                        transition={{ duration: 0.2, delay: baseDelay, ease: "easeOut" }}
                                                                        className="absolute left-[6px] top-[24px] w-[15px] h-[2px] bg-emerald-500/50 rounded-r-full pointer-events-none origin-right"
                                                                    />
                                                                )}

                                                                {/* Vertical Line Segment (Left Side) - Flowing Down */}
                                                                <motion.div
                                                                    initial={{ scaleY: 0, opacity: 0 }}
                                                                    animate={{ scaleY: 1, opacity: 1 }}
                                                                    transition={{ duration: 0.2, delay: vertDelay, ease: "linear" }}
                                                                    className={`absolute left-[5px] w-[4px] pointer-events-none z-0 origin-top overflow-visible
                                                                    ${isRestorePathStart ? 'top-[24px] bottom-[-10px]' : ''}
                                                                    ${isRestorePathMiddle ? 'top-[-10px] bottom-[-10px]' : ''} 
                                                                    ${isRestorePathEnd ? 'top-[-10px] h-[34px]' : ''}
                                                                `}
                                                                >
                                                                    <svg width="4" height="100%" className="overflow-visible">
                                                                        <motion.line
                                                                            x1="2" y1="0" x2="2" y2="100%"
                                                                            stroke="rgb(16 185 129 / 0.5)" // emerald-500/50
                                                                            strokeWidth="2"
                                                                            strokeLinecap="round"
                                                                            strokeDasharray="4 6"
                                                                            animate={{ strokeDashoffset: [0, -10] }}
                                                                            transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                                                                        />
                                                                    </svg>
                                                                </motion.div>

                                                                {/* Horizontal Connector to Dot (End) - Final Step */}
                                                                {isRestorePathEnd && (
                                                                    <motion.div
                                                                        initial={{ scaleX: 0, opacity: 0 }}
                                                                        animate={{ scaleX: 1, opacity: 1 }}
                                                                        transition={{ duration: 0.2, delay: vertDelay + 0.15, ease: "easeOut" }}
                                                                        className="absolute left-[6px] top-[24px] w-[15px] h-[2px] bg-emerald-500/50 rounded-r-full pointer-events-none origin-left"
                                                                    />
                                                                )}
                                                            </>
                                                        )}

                                                        {/* Card Content */}
                                                        <div className={`
                                                        p-3 rounded-lg border transition-all duration-200
                                                        ${isSelected
                                                                ? 'bg-amber-500/5 border-amber-500/30'
                                                                : isRestoreSource
                                                                    ? 'bg-emerald-500/5 border-emerald-500/30 ring-1 ring-emerald-500/20'
                                                                    : 'bg-card/50 border-transparent hover:bg-accent/40 hover:border-border/60'
                                                            }
                                                    `}>
                                                            {/* Version Header Row */}
                                                            <div className="flex flex-wrap items-center gap-2 mb-2">
                                                                {/* Version Number */}
                                                                <span className={`
                                                                    font-mono text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0
                                                                    ${isSelected
                                                                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                                                        : isRestoreSource
                                                                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                                                            : 'bg-muted text-muted-foreground'
                                                                    }
                                                                `}>
                                                                    #{version.version_number}
                                                                </span>

                                                                {/* Version Type Badge with Hungarian labels */}
                                                                {(() => {
                                                                    const typeInfo = getVersionTypeInfo(version.version_type as 'shadow' | 'commit' | 'named');
                                                                    const bgClass = version.version_type === 'shadow'
                                                                        ? 'bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400'
                                                                        : version.version_type === 'named'
                                                                            ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
                                                                            : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400';
                                                                    return (
                                                                        <span
                                                                            className={`text-[9px] font-medium px-1.5 py-0.5 rounded inline-flex items-center gap-1 cursor-help shrink-0 ${bgClass}`}
                                                                            title={typeInfo.description}
                                                                        >
                                                                            {version.version_type === 'shadow' && <NotepadTextDashed size={10} />}
                                                                            {version.version_type === 'commit' && <Check size={10} />}
                                                                            {version.version_type === 'named' && <Tag size={10} />}
                                                                            {!version.version_type && <Check size={10} />}
                                                                            <span className="truncate max-w-[80px]">
                                                                                {version.version_name || typeInfo.label}
                                                                            </span>
                                                                        </span>
                                                                    );
                                                                })()}

                                                                {/* TTL for Shadow versions */}
                                                                {version.version_type === 'shadow' && version.expires_at && (() => {
                                                                    const expiresAt = new Date(version.expires_at).getTime();
                                                                    const now = Date.now();
                                                                    const ttlSeconds = Math.floor((expiresAt - now) / 1000);
                                                                    return (
                                                                        <span className="text-[9px] text-sky-500/70 inline-flex items-center gap-1 shrink-0" title="Lejárat">
                                                                            <Timer size={10} />
                                                                            {formatTTL(ttlSeconds > 0 ? ttlSeconds : 0)}
                                                                        </span>
                                                                    );
                                                                })()}

                                                                {/* Restore Source indicator */}
                                                                {isRestoreSource && (
                                                                    <span className="text-[9px] font-bold text-emerald-600 bg-emerald-500/10 px-1.5 py-0.5 rounded inline-flex items-center gap-1 shrink-0">
                                                                        Forrás
                                                                    </span>
                                                                )}

                                                                {/* Compressed indicator */}
                                                                {!!version.is_compressed && (
                                                                    <span className="text-[9px] font-mono text-muted-foreground/60 border border-border px-1 rounded shrink-0">
                                                                        LZ4
                                                                    </span>
                                                                )}

                                                                {/* Spacer to push time to right */}
                                                                <span className="flex-1" />

                                                                {/* Time */}
                                                                <span className="text-[10px] text-muted-foreground/60 shrink-0">
                                                                    {getRelativeTime(version.changed_at)}
                                                                </span>
                                                            </div>

                                                            {/* Action Buttons Row */}
                                                            <div className="flex items-center justify-end gap-1 mb-1">
                                                                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                                                                    {/* Rename version (for commit/named/legacy) */}
                                                                    {(version.version_type === 'commit' || version.version_type === 'named' || !version.version_type) && (
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                prompt({
                                                                                    title: 'Verzió elnevezése',
                                                                                    message: `Add meg a #${version.version_number} verzió egyedi nevét`,
                                                                                    placeholder: 'pl. "Fontos változtatás", "Előtte állapot"',
                                                                                    defaultValue: version.version_name || `v${version.version_number}`,
                                                                                    confirmLabel: 'Elnevezés',
                                                                                    onConfirm: (newName) => {
                                                                                        renameVersion(version.id, newName);
                                                                                    }
                                                                                });
                                                                            }}
                                                                            className="p-1.5 hover:bg-amber-500/10 text-muted-foreground hover:text-amber-500 rounded transition-all"
                                                                            title="Verzió elnevezése"
                                                                        >
                                                                            <Pencil size={12} />
                                                                        </button>
                                                                    )}
                                                                    {/* Promote Shadow to Commit */}
                                                                    {version.version_type === 'shadow' && (
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                promoteVersion(version.id, 'commit');
                                                                            }}
                                                                            className="p-1.5 hover:bg-emerald-500/10 text-muted-foreground hover:text-emerald-500 rounded transition-all"
                                                                            title="Megtartás (piszkozat → mentés)"
                                                                        >
                                                                            <ShieldCheck size={12} />
                                                                        </button>
                                                                    )}
                                                                    {/* Delete version */}
                                                                    {version.version_type !== 'named' && (
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                confirm({
                                                                                    title: 'Verzió törlése',
                                                                                    message: `Biztosan törlöd a #${version.version_number} verziót?`,
                                                                                    confirmLabel: 'Törlés',
                                                                                    isDestructive: true,
                                                                                    onConfirm: () => deleteVersion(version.id)
                                                                                });
                                                                            }}
                                                                            className="p-1.5 hover:bg-red-500/10 text-muted-foreground hover:text-red-500 rounded transition-all"
                                                                            title="Verzió törlése"
                                                                        >
                                                                            <Trash2 size={12} />
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            <div className={`text-sm leading-relaxed ${isSelected ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                                                                {highlightText(version.change_summary || 'Nincs leírás', searchTokens)}

                                                                {/* Restored From Link */}
                                                                {restoredFromVersion && (
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleScrollToVersion(restoredFromVersion);
                                                                            const target = versions.find(v => v.version_number === restoredFromVersion);
                                                                            if (target) handleVersionSelect(target);
                                                                        }}
                                                                        className="mt-1 flex items-center gap-1.5 text-xs text-amber-600 hover:text-amber-500 hover:underline decoration-amber-500/30 underline-offset-2 transition-all"
                                                                    >
                                                                        <div className="w-1.5 h-1.5 border-b border-l border-amber-500/50 rotate-[-45deg] transform translate-y-[-1px]" />
                                                                        <span>Eredeti forrás: #{restoredFromVersion}</span>
                                                                    </button>
                                                                )}
                                                            </div>

                                                            <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground/60">
                                                                <div className="flex items-center gap-1">
                                                                    <User size={10} />
                                                                    <span>{version.changed_by?.split(' ')[0] || 'User'}</span>
                                                                </div>
                                                                <span className="mx-1 opacity-30">•</span>
                                                                <span>{formatBytes(version.diff_size)}</span>
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                );
                                            })}

                                            {/* Load More Trigger */}
                                            {versions.length < totalCount && (
                                                <div className="relative pl-8 pt-4">
                                                    <div className="absolute left-[23px] top-0 h-8 w-px bg-gradient-to-b from-border/60 to-transparent" />
                                                    <button
                                                        onClick={loadMore}
                                                        disabled={loadingMore}
                                                        className="w-full py-2 rounded-lg border border-dashed border-border hover:border-primary/50 text-xs font-medium text-muted-foreground hover:text-primary transition-all flex items-center justify-center gap-2"
                                                    >
                                                        {loadingMore ? <Loader2 size={14} className="animate-spin" /> : <ChevronDown size={14} />}
                                                        <span>Korábbi verziók betöltése</span>
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Selected Version Action Bar (Floating) */}
                            <AnimatePresence>
                                {selectedVersion && (
                                    <motion.div
                                        initial={{ y: '100%' }}
                                        animate={{ y: 0 }}
                                        exit={{ y: '100%' }}
                                        className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-background via-background/90 to-transparent pt-12 pointer-events-none z-[999]"
                                    >
                                        <div className="bg-background/95 backdrop-blur-xl border border-border shadow-2xl p-4 rounded-lg pointer-events-auto space-y-3 ring-1 ring-white/10">
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="font-medium text-foreground">
                                                    Kiválasztva: <span className="text-primary">#{selectedVersion.version_number}</span>
                                                </span>
                                                <div className="flex items-center gap-2">
                                                    {selectedVersion.is_compressed ? (
                                                        <span className="text-[10px] font-mono text-muted-foreground/60 border border-border px-1 rounded flex items-center gap-1">
                                                            LZ4
                                                        </span>
                                                    ) : null}
                                                    <span className="text-xs text-muted-foreground">
                                                        {new Date(selectedVersion.changed_at).toLocaleString('hu-HU')}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-3">
                                                <button
                                                    onClick={() => handleShowDiff(selectedVersion.version_number)}
                                                    className="flex items-center justify-center gap-2 py-2.5 px-4 bg-muted/50 hover:bg-muted text-foreground/80 hover:text-foreground font-medium rounded-lg border border-border/50 transition-all active:scale-95"
                                                >
                                                    <Eye size={16} />
                                                    <span>Megtekintés</span>
                                                </button>
                                                <button
                                                    onClick={() => handleRestore(selectedVersion.version_number)}
                                                    disabled={restoring}
                                                    className="flex items-center justify-center gap-2 py-2.5 px-4 bg-background hover:bg-amber-500/10 text-amber-600 border border-amber-200/50 hover:border-amber-500/50 font-medium rounded-lg transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none group shadow-sm"
                                                >
                                                    {restoring ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} className="group-hover:-rotate-180 transition-transform duration-500" />}
                                                    <span>Visszaállítás</span>
                                                </button>
                                            </div>

                                            <div className="text-[10px] text-center text-muted-foreground/40 font-mono pt-2 flex items-center justify-center gap-1.5">
                                                <Clock size={10} />
                                                <span>A VISSZAÁLLÍTÁS ÚJ VERZIÓT GENERÁL</span>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>

                        {/* Diff Viewer */}
                        {showDiffViewer && selectedVersion && (
                            <DiffViewer
                                versionDetail={selectedVersion}
                                currentContent={currentContent}
                                onClose={() => setShowDiffViewer(false)}
                            />
                        )}
                    </>
                )}
            </AnimatePresence>
        </>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default VersionPanel;
