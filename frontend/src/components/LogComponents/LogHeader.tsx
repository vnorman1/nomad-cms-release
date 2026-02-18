import { FileText, RefreshCw, Trash2 } from 'lucide-react';
import type { LogStats } from '@/api/logs';

interface LogHeaderProps {
    stats: LogStats | null;
    logsCount: number;
    totalCount?: number;
    loading: boolean;
    onRefresh: () => void;
    onClear: () => void;
}

export function LogHeader({ stats, logsCount, totalCount, loading, onRefresh, onClear }: LogHeaderProps) {
    return (
        <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center border border-primary/20 shadow-sm">
                    <FileText size={20} className="text-primary" />
                </div>
                <div>
                    <div className="flex items-center gap-3">
                        <h2 className="text-2xl font-bold tracking-tight text-foreground/90">Rendszer Naplók</h2>
                        {stats && (
                            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-foreground/5 text-foreground/60 rounded-lg text-xs font-medium border border-foreground/10">
                                <span>{stats.sizeMB.toFixed(2)} MB / {stats.maxSizeMB} MB</span>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                        <span className="font-medium bg-muted px-2 py-0.5 rounded-md">
                            {logsCount} {totalCount && totalCount > logsCount ? `/ ${totalCount}` : ''} bejegyzés
                        </span>
                        {loading && <span className="opacity-50 italic">Frissítés...</span>}
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-3">
                <button
                    onClick={onRefresh}
                    disabled={loading}
                    className="h-9 w-9 flex items-center justify-center rounded-lg border border-border/50 hover:bg-muted transition-all disabled:opacity-50"
                    title="Frissítés"
                >
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                </button>
                <button
                    onClick={onClear}
                    className="h-9 px-4 bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-lg shadow-lg shadow-destructive/20 transition-all flex items-center gap-2 text-sm font-medium"
                >
                    <Trash2 size={16} />
                    Törlés
                </button>
            </div>
        </div>
    );
}
