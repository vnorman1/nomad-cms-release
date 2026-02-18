import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, RefreshCw, AlertCircle, ChevronDown, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useUI } from '@/context/UIContext';
import { fetchLogs, clearLogs, LogEntry, LogStats } from '@/api/logs';
import {
    LogDetailPanel,
    LogTableRow,
    LogToolbar,
    LogHeader
} from '@/components/LogComponents';

const PAGE_SIZE = 100;

// Helper to parse JSON from log message
function parseLogData(message: string): Record<string, unknown> | null {
    // 1. Try to parse Webhook Queue logs
    if (message.includes('[WEBHOOK QUEUE]')) {
        const parts = message.split('[WEBHOOK QUEUE]');
        const content = parts[1]?.trim() || '';

        // Extract status message (part before the first colon)
        const [statusMsg, ...rest] = content.split(':');
        const kvPart = rest.join(':').trim(); // Rejoin in case values contain colons

        const data: Record<string, unknown> = {
            type: 'webhook_queue',
            status_message: statusMsg.trim(),
            webhook_queue_detected: true
        };

        // Extract key-value pairs
        if (kvPart) {
            // Regex to match key=value pairs where value can be anything until the next comma-space-key= or end of string
            const regex = /([a-zA-Z0-9_]+)=(.*?)(?:, (?=[a-zA-Z0-9_]+=)|$)/g;
            let match;
            while ((match = regex.exec(kvPart)) !== null) {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const [_, key, value] = match;
                data[key] = value;
            }
        }

        return data;
    }

    // 2. Try to parse JSON
    const jsonMatch = message.match(/\{.*\}$/s);
    if (jsonMatch) {
        try {
            return JSON.parse(jsonMatch[0]);
        } catch {
            return null;
        }
    }
    return null;
}

export default function LogsPage() {
    const { user } = useAuth();
    const { confirm } = useUI();
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [stats, setStats] = useState<LogStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [search, setSearch] = useState('');
    const [levelFilter, setLevelFilter] = useState<string>('');
    const [authTypeFilter, setAuthTypeFilter] = useState<string>('');
    const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
    const [total, setTotal] = useState(0);
    const [hasMore, setHasMore] = useState(false);

    const loadLogs = useCallback(async (append = false) => {
        try {
            if (append) {
                setLoadingMore(true);
            } else {
                setLoading(true);
                setLogs([]);
            }

            const offset = append ? logs.length : 0;

            const response = await fetchLogs({
                level: levelFilter || undefined,
                search: search || undefined,
                limit: PAGE_SIZE,
                offset,
            });

            if (response.success) {
                if (append) {
                    setLogs(prev => [...prev, ...response.logs]);
                } else {
                    setLogs(response.logs);
                }
                setStats(response.stats);
                setTotal(response.total);
                setHasMore(response.hasMore);
            }
        } catch (err) {
            console.error('Failed to load logs:', err);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [levelFilter, search, logs.length]);

    // Initial load and filter changes
    useEffect(() => {
        loadLogs(false);
    }, [levelFilter]);

    // Debounced search
    useEffect(() => {
        const timer = setTimeout(() => {
            loadLogs(false);
        }, 300);
        return () => clearTimeout(timer);
    }, [search]);

    // Filter logs by auth type (client-side)
    const filteredLogs = useMemo(() => {
        if (!authTypeFilter) return logs;

        return logs.filter(log => {
            const data = parseLogData(log.message);
            if (!data) return authTypeFilter === 'none';

            if (authTypeFilter === 'error') {
                const status = data.status as number | undefined;
                return status && status >= 400;
            }

            return data.auth_type === authTypeFilter;
        });
    }, [logs, authTypeFilter]);

    const handleClear = () => {
        confirm({
            title: 'Naplók Törlése',
            message: 'Biztosan törölni szeretnéd az összes naplóbejegyzést? Ez a művelet nem visszavonható.',
            confirmLabel: 'Törlés',
            cancelLabel: 'Mégse',
            isDestructive: true,
            onConfirm: async () => {
                try {
                    const result = await clearLogs();
                    if (result.success) {
                        // Explicitly reset state for immediate UI feedback
                        setLogs([]);
                        setTotal(0);
                        setHasMore(false);
                        setStats(prev => prev ? { ...prev, sizeBytes: 0, sizeKB: 0, sizeMB: 0, lineCount: 0 } : null);
                        // Then reload to get fresh data from server
                        await loadLogs(false);
                    }
                } catch (err) {
                    console.error('Failed to clear logs:', err);
                    // Still try to reload in case logs were cleared but response failed
                    await loadLogs(false);
                }
            }
        });
    };

    const handleLoadMore = () => {
        loadLogs(true);
    };

    // Admin check
    if (!user?.is_admin) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-center text-muted-foreground">
                    <AlertCircle size={48} className="mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium">Hozzáférés megtagadva</p>
                    <p className="text-sm">Admin jogosultság szükséges.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-background font-sans text-foreground">
            <div className="flex-1 flex flex-col h-full relative">
                {/* HEADER */}
                <div className="flex-none p-6 pb-4 space-y-4">
                    <LogHeader
                        stats={stats}
                        logsCount={filteredLogs.length}
                        totalCount={total}
                        loading={loading}
                        onRefresh={() => loadLogs(false)}
                        onClear={handleClear}
                    />
                    <LogToolbar
                        search={search}
                        onSearchChange={setSearch}
                        levelFilter={levelFilter}
                        onLevelFilterChange={setLevelFilter}
                        authTypeFilter={authTypeFilter}
                        onAuthTypeFilterChange={setAuthTypeFilter}
                    />
                </div>

                {/* LOG TABLE */}
                <div className="flex-1 overflow-auto px-6 pb-6 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                    <div className="rounded-xl border border-border/40 bg-background/50 shadow-sm overflow-hidden backdrop-blur-sm">
                        <table className="w-full border-collapse">
                            <thead className="bg-muted/30 border-b border-border/40 sticky top-0 z-10 backdrop-blur-md">
                                <tr>
                                    <th className="w-44 h-11 px-4 text-left align-middle text-xs font-semibold text-muted-foreground uppercase tracking-wider">Időpont</th>
                                    <th className="w-28 h-11 px-4 text-center align-middle text-xs font-semibold text-muted-foreground uppercase tracking-wider">Szint</th>
                                    <th className="h-11 px-4 text-left align-middle text-xs font-semibold text-muted-foreground uppercase tracking-wider">Üzenet</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/30">
                                {loading && logs.length === 0 ? (
                                    <tr>
                                        <td colSpan={3} className="h-64 text-center">
                                            <div className="flex flex-col items-center justify-center gap-3 text-muted-foreground">
                                                <RefreshCw size={24} className="animate-spin text-primary/50" />
                                                <span className="text-sm font-medium">Betöltés...</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : filteredLogs.length === 0 ? (
                                    <tr>
                                        <td colSpan={3} className="h-64 text-center">
                                            <div className="flex flex-col items-center justify-center gap-3 text-muted-foreground/50">
                                                <FileText size={40} className="opacity-20" />
                                                <span className="text-sm font-medium">
                                                    {authTypeFilter || levelFilter ? 'Nincs találat a szűrésre' : 'Nincs naplóbejegyzés'}
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    <AnimatePresence mode="popLayout">
                                        {filteredLogs.map((log, i) => (
                                            <LogTableRow
                                                key={`${log.timestamp}-${i}`}
                                                log={log}
                                                index={i}
                                                isSelected={selectedLog === log}
                                                onSelect={() => setSelectedLog(log)}
                                            />
                                        ))}
                                    </AnimatePresence>
                                )}
                            </tbody>
                        </table>

                        {/* Load More Button */}
                        {hasMore && !loading && filteredLogs.length > 0 && (
                            <div className="p-4 border-t border-border/30 bg-muted/20">
                                <button
                                    onClick={handleLoadMore}
                                    disabled={loadingMore}
                                    className="w-full h-10 flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground bg-background hover:bg-muted border border-border/50 hover:border-border rounded-xl transition-all disabled:opacity-50"
                                >
                                    {loadingMore ? (
                                        <>
                                            <Loader2 size={16} className="animate-spin" />
                                            Betöltés...
                                        </>
                                    ) : (
                                        <>
                                            <ChevronDown size={16} />
                                            Több betöltése ({logs.length} / {total})
                                        </>
                                    )}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Detail Panel */}
            <AnimatePresence>
                {selectedLog && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setSelectedLog(null)}
                            className="fixed inset-0 bg-background/50 backdrop-blur-sm z-40"
                        />
                        <LogDetailPanel
                            log={selectedLog}
                            onClose={() => setSelectedLog(null)}
                        />
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}
