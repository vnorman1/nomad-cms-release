/**
 * Updates Tab Component
 * Shows changelogs and announcements from the nomad-updates CDN
 * 
 * Features:
 * - Rich text viewer using Quill for announcements and changelogs
 * - Framer-motion animations (consistent with project patterns)
 * - Accordion-style changelog expansion
 * - Dismissible announcements with fade-out
 */

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Bell, FileText, Loader2, RefreshCw, ExternalLink,
    AlertTriangle, Info, AlertOctagon, X, ChevronRight, Tag,
    Sparkles, Bug, Shield, Zap, CheckCircle2, Clock
} from 'lucide-react';
import { marked } from 'marked';
import { SimpleTabProps } from './types';
import { QuillViewerHTML } from '@/components/ui/QuillViewer';
import {
    getChangelogIndex, getChangelogContent, getAnnouncements, dismissAnnouncement,
    forceRefreshUpdates,
    type ChangelogEntry, type Announcement
} from '@/api/updates';

const TYPE_ICONS: Record<string, typeof Sparkles> = {
    feature: Sparkles,
    bugfix: Bug,
    security: Shield,
    breaking: Zap,
};

const TYPE_LABELS: Record<string, string> = {
    feature: 'Új funkció',
    bugfix: 'Hibajavítás',
    security: 'Biztonság',
    breaking: 'Breaking change',
};

const TYPE_COLORS: Record<string, string> = {
    feature: 'text-emerald-500',
    bugfix: 'text-blue-500',
    security: 'text-red-500',
    breaking: 'text-orange-500',
};

const ANNOUNCEMENT_STYLES: Record<string, { bg: string; border: string; text: string; icon: typeof Info; glow: string }> = {
    info: {
        bg: 'bg-blue-500/10',
        border: 'border-blue-500/30',
        text: 'text-blue-600 dark:text-blue-400',
        icon: Info,
        glow: 'shadow-blue-500/5',
    },
    warning: {
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/30',
        text: 'text-amber-600 dark:text-amber-400',
        icon: AlertTriangle,
        glow: 'shadow-amber-500/5',
    },
    critical: {
        bg: 'bg-red-500/10',
        border: 'border-red-500/30',
        text: 'text-red-600 dark:text-red-400',
        icon: AlertOctagon,
        glow: 'shadow-red-500/10',
    },
};

/** Parse markdown message - use inline for short, block for long */
function renderMessage(message: string): string {
    if (message.includes('\n') || message.length > 200) {
        return marked.parse(message) as string;
    }
    return marked.parseInline(message) as string;
}

/**
 * Strip the auto-generated metadata header from changelog markdown.
 * 
 * The change_maker prepends: title, version, date, type, highlights, ---
 * These are already shown in the changelog card header from index.json,
 * so we strip everything before the first `---` separator.
 * 
 * Falls back to full content if no separator found (legacy format).
 */
function stripChangelogHeader(content: string): string {
    // Look for the --- separator that divides metadata from actual content
    const separatorIndex = content.indexOf('\n---');
    if (separatorIndex === -1) {
        // Legacy format or no separator - return as-is
        return content;
    }

    // Take everything after the ---
    const body = content.substring(separatorIndex + 4).trim(); // +4 for \n---

    // If body is empty after stripping, return full content
    return body || content;
}

/** Format relative time from ISO date string */
function formatRelativeTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Ma';
    if (diffDays === 1) return 'Tegnap';
    if (diffDays < 7) return `${diffDays} napja`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} hete`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} hónapja`;
    return `${Math.floor(diffDays / 365)} éve`;
}

/** Format expiry countdown */
function formatExpiry(expiresAt: string | null): string | null {
    if (!expiresAt) return null;
    const date = new Date(expiresAt);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) return 'Lejárt';
    if (diffDays === 1) return 'Holnap lejár';
    if (diffDays < 7) return `${diffDays} nap múlva lejár`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} hét múlva lejár`;
    return `${Math.floor(diffDays / 30)} hónap múlva lejár`;
}

export function UpdatesTab({ setError }: SimpleTabProps) {
    const [changelogs, setChangelogs] = useState<ChangelogEntry[]>([]);
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [selectedChangelog, setSelectedChangelog] = useState<string | null>(null);
    const [changelogContent, setChangelogContent] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [contentLoading, setContentLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [dismissingId, setDismissingId] = useState<string | null>(null);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            const [changelogRes, announcementRes] = await Promise.all([
                getChangelogIndex(),
                getAnnouncements(),
            ]);

            if (changelogRes.success) {
                setChangelogs(changelogRes.entries);
            }
            if (announcementRes.success) {
                setAnnouncements(announcementRes.announcements);
            }
        } catch {
            setError('Nem sikerült betölteni a frissítéseket');
        } finally {
            setLoading(false);
            // Small delay for staggered entrance
            setTimeout(() => setLoaded(true), 100);
        }
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        try {
            // Step 1: Force refresh backend cache
            // This clears storage/cache/updates, fetches from GitHub raw first,
            // falls back to jsDelivr with purge, and rebuilds all caches
            await forceRefreshUpdates();
        } catch {
            // If force refresh fails, still try to reload data normally
            console.warn('Force refresh failed, loading from existing cache');
        }
        // Step 2: Reload UI data (now from freshly rebuilt cache)
        await loadData();
        setRefreshing(false);
    };

    const handleSelectChangelog = async (entry: ChangelogEntry) => {
        if (selectedChangelog === entry.file) {
            setSelectedChangelog(null);
            setChangelogContent('');
            return;
        }

        try {
            setContentLoading(true);
            setSelectedChangelog(entry.file);
            const response = await getChangelogContent(entry.file);
            if (response.success) {
                // Strip auto-generated header (version, date, type, highlights)
                // since these are already shown in the changelog card header
                setChangelogContent(stripChangelogHeader(response.content));
            } else {
                setChangelogContent('Nem sikerült betölteni a changelog tartalmat.');
            }
        } catch {
            setChangelogContent('Hálózati hiba történt.');
        } finally {
            setContentLoading(false);
        }
    };

    const handleDismiss = async (id: string) => {
        try {
            setDismissingId(id);
            await dismissAnnouncement(id);
            // Small delay for smooth exit animation
            setTimeout(() => {
                setAnnouncements(prev => prev.filter(a => a.id !== id));
                setDismissingId(null);
            }, 300);
        } catch {
            setDismissingId(null);
        }
    };

    // Memoize the total stats
    const stats = useMemo(() => ({
        totalChangelogs: changelogs.length,
        totalAnnouncements: announcements.length,
        latestVersion: changelogs[0]?.version || '—',
        latestDate: changelogs[0]?.date || null,
    }), [changelogs, announcements]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
                <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3 }}
                >
                    <Loader2 className="animate-spin opacity-40" size={32} />
                </motion.div>
                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.4 }}
                    transition={{ delay: 0.2 }}
                    className="text-[10px] font-mono uppercase tracking-wider"
                >
                    Frissítések betöltése...
                </motion.p>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Header with stats */}
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className="flex items-center justify-between"
            >
                <div>
                    <h2 className="text-lg font-mono uppercase tracking-widest mb-1">Frissítések</h2>
                    <div className="flex items-center gap-3">
                        <p className="text-[10px] font-mono opacity-40 uppercase tracking-wider">
                            Nomad CMS changelog és közlemények
                        </p>
                        {stats.latestDate && (
                            <span className="flex items-center gap-1 text-[9px] font-mono opacity-30">
                                <Clock size={8} />
                                {formatRelativeTime(stats.latestDate)}
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {/* Version badge */}
                    <span className="flex items-center gap-1 px-2 py-1 text-[9px] font-mono uppercase bg-foreground/5 border border-border/50 rounded">
                        <Tag size={8} className="opacity-40" />
                        v{stats.latestVersion}
                    </span>
                    {/* Refresh button */}
                    <motion.button
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className="p-2 hover:bg-foreground/5 rounded-sm opacity-40 hover:opacity-100 transition-all border border-transparent hover:border-border/50"
                        title="Frissítés"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                    >
                        <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                    </motion.button>
                </div>
            </motion.div>

            {/* Announcements */}
            <AnimatePresence mode="sync">
                {announcements.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                        className="space-y-3 overflow-hidden"
                    >
                        <h3 className="text-xs font-mono uppercase tracking-widest opacity-60 flex items-center gap-2">
                            <Bell size={12} />
                            Közlemények
                            <span className="flex items-center justify-center w-4 h-4 text-[8px] font-mono font-bold bg-foreground/10 rounded-full">
                                {announcements.length}
                            </span>
                        </h3>

                        <AnimatePresence mode="sync">
                            {announcements.map((announcement, index) => {
                                const style = ANNOUNCEMENT_STYLES[announcement.type] || ANNOUNCEMENT_STYLES.info;
                                const IconComponent = style.icon;
                                const isDismissing = dismissingId === announcement.id;
                                const expiry = formatExpiry(announcement.expires_at);

                                return (
                                    <motion.div
                                        key={announcement.id}
                                        layout
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{
                                            opacity: isDismissing ? 0 : 1,
                                            x: isDismissing ? 20 : 0,
                                            scale: isDismissing ? 0.95 : 1,
                                        }}
                                        exit={{ opacity: 0, x: 20, height: 0, marginBottom: 0 }}
                                        transition={{ duration: 0.3, delay: index * 0.05, ease: 'easeOut' }}
                                        className={`p-4 border rounded-lg shadow-lg ${style.bg} ${style.border} ${style.glow} 
                                            hover:shadow-xl transition-shadow`}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex items-start gap-3 min-w-0">
                                                <motion.div
                                                    className={`mt-0.5 shrink-0 ${style.text}`}
                                                    initial={{ rotate: -10 }}
                                                    animate={{ rotate: 0 }}
                                                    transition={{ type: 'spring', stiffness: 200 }}
                                                >
                                                    <IconComponent size={16} />
                                                </motion.div>
                                                <div className="min-w-0">
                                                    <h4 className={`text-sm font-medium ${style.text}`}>
                                                        {announcement.title}
                                                    </h4>
                                                    {/* Rich text message using Quill viewer */}
                                                    <div className="mt-1.5 [&_.ql-editor]:p-0">
                                                        <QuillViewerHTML
                                                            content={renderMessage(announcement.message)}
                                                            className={`text-xs opacity-80 ${style.text}`}
                                                        />
                                                    </div>
                                                    <div className="flex items-center gap-3 mt-2">
                                                        {announcement.action_url && (
                                                            <a
                                                                href={announcement.action_url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className={`inline-flex items-center gap-1 text-[10px] font-medium underline decoration-dotted underline-offset-2 
                                                                    hover:decoration-solid transition-all ${style.text}`}
                                                            >
                                                                {announcement.action_label || 'Részletek'} <ExternalLink size={9} />
                                                            </a>
                                                        )}
                                                        {expiry && (
                                                            <span className="flex items-center gap-1 text-[9px] font-mono opacity-50">
                                                                <Clock size={8} />
                                                                {expiry}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            {announcement.dismissible && (
                                                <motion.button
                                                    onClick={() => handleDismiss(announcement.id)}
                                                    className="p-1.5 opacity-30 hover:opacity-100 transition-all rounded hover:bg-foreground/5 shrink-0"
                                                    whileHover={{ scale: 1.1 }}
                                                    whileTap={{ scale: 0.9 }}
                                                    title="Elvetés"
                                                >
                                                    <X size={12} />
                                                </motion.button>
                                            )}
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Changelog */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.1, ease: 'easeOut' }}
                className="space-y-3"
            >
                <h3 className="text-xs font-mono uppercase tracking-widest opacity-60 flex items-center gap-2">
                    <FileText size={12} />
                    Changelog
                    {changelogs.length > 0 && (
                        <span className="flex items-center justify-center w-4 h-4 text-[8px] font-mono font-bold bg-foreground/10 rounded-full">
                            {changelogs.length}
                        </span>
                    )}
                </h3>

                {changelogs.length === 0 ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.2 }}
                        className="text-center py-12 opacity-40"
                    >
                        <FileText size={24} className="mx-auto mb-2" />
                        <p className="text-xs font-mono">Nincs elérhető changelog</p>
                    </motion.div>
                ) : (
                    <div className="space-y-2">
                        {changelogs.map((entry, index) => {
                            const TypeIcon = TYPE_ICONS[entry.type] || Sparkles;
                            const typeColor = TYPE_COLORS[entry.type] || 'text-foreground';
                            const isSelected = selectedChangelog === entry.file;

                            return (
                                <motion.div
                                    key={entry.file}
                                    layout
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.3, delay: 0.05 * index, ease: 'easeOut' }}
                                >
                                    <motion.button
                                        onClick={() => handleSelectChangelog(entry)}
                                        className={`w-full text-left border p-4 transition-all rounded-lg
                                            ${isSelected
                                                ? 'border-foreground/40 bg-foreground/5 shadow-md'
                                                : 'border-border hover:border-foreground/20 hover:bg-foreground/[0.02] hover:shadow-sm'
                                            }`}
                                        whileHover={{ scale: 1.005 }}
                                        whileTap={{ scale: 0.995 }}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className={`p-2 rounded-md bg-foreground/5 ${typeColor}`}>
                                                    <TypeIcon size={14} />
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="text-xs font-mono font-bold">
                                                            {entry.title}
                                                        </span>
                                                        <span className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-mono uppercase bg-foreground/10 rounded-md font-semibold">
                                                            <Tag size={8} />
                                                            {entry.version}
                                                        </span>
                                                        <span className={`px-1.5 py-0.5 text-[9px] font-mono uppercase bg-foreground/5 rounded-md ${typeColor}`}>
                                                            {TYPE_LABELS[entry.type] || entry.type}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className="text-[10px] font-mono opacity-40">
                                                            {entry.date}
                                                        </span>
                                                        <span className="text-[10px] font-mono opacity-25">
                                                            {formatRelativeTime(entry.date)}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                            <motion.div
                                                animate={{ rotate: isSelected ? 90 : 0 }}
                                                transition={{ duration: 0.2 }}
                                            >
                                                <ChevronRight size={14} className="opacity-30" />
                                            </motion.div>
                                        </div>

                                        {/* Highlights */}
                                        {entry.highlights.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5 mt-3 pl-11">
                                                {entry.highlights.map((h, i) => (
                                                    <motion.span
                                                        key={i}
                                                        initial={loaded ? false : { opacity: 0, scale: 0.8 }}
                                                        animate={{ opacity: 1, scale: 1 }}
                                                        transition={{ delay: 0.05 * index + 0.03 * i }}
                                                        className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 
                                                            bg-foreground/5 border border-border/50 rounded-md
                                                            hover:bg-foreground/10 hover:border-border transition-colors"
                                                    >
                                                        <CheckCircle2 size={8} className="opacity-30" />
                                                        {h}
                                                    </motion.span>
                                                ))}
                                            </div>
                                        )}
                                    </motion.button>

                                    {/* Expanded Content */}
                                    <AnimatePresence>
                                        {isSelected && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.3, ease: 'easeOut' }}
                                                className="overflow-hidden"
                                            >
                                                <div className="border border-t-0 border-foreground/40 bg-foreground/[0.02] rounded-b-lg p-6">
                                                    {contentLoading ? (
                                                        <div className="flex flex-col items-center justify-center py-8 gap-2">
                                                            <Loader2 size={20} className="animate-spin opacity-40" />
                                                            <span className="text-[10px] font-mono opacity-30">Changelog betöltése...</span>
                                                        </div>
                                                    ) : (
                                                        <motion.div
                                                            initial={{ opacity: 0, y: 5 }}
                                                            animate={{ opacity: 1, y: 0 }}
                                                            transition={{ duration: 0.3, delay: 0.1 }}
                                                            className="text-xs leading-relaxed [&_.ql-editor]:p-0"
                                                        >
                                                            <QuillViewerHTML
                                                                content={marked.parse(changelogContent) as string}
                                                            />
                                                        </motion.div>
                                                    )}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </motion.div>
                            );
                        })}
                    </div>
                )}
            </motion.div>
        </div>
    );
}
