// Response Panel Component for API Playground

import { Activity, Send, Zap } from 'lucide-react';
import { highlightJSON } from './utils';

interface ResponsePanelProps {
    loading: boolean;
    response: any;  // eslint-disable-line @typescript-eslint/no-explicit-any
    status: number | null;
    duration: number | null;
    copied: string | null;
    onExecute: () => void;
    onCopy: (text: string, key: string) => void;
}

export function ResponsePanel({
    loading,
    response,
    status,
    duration,
    copied,
    onExecute,
    onCopy
}: ResponsePanelProps) {
    return (
        <div className="w-[440px] border-l border-border bg-card flex flex-col shrink-0">
            {/* Execute Button & Stats */}
            <div className="p-4 border-b border-border flex flex-col gap-4">
                <button
                    onClick={onExecute}
                    disabled={loading}
                    className={`w-full h-12 flex items-center justify-center gap-2 text-sm font-bold uppercase tracking-widest transition-all ${
                        loading
                            ? 'bg-muted text-muted-foreground cursor-wait'
                            : 'bg-foreground text-background hover:bg-background hover:text-foreground border border-transparent hover:border-foreground'
                    }`}
                >
                    {loading ? <Activity size={16} className="animate-spin" /> : <Send size={16} />}
                    {loading ? 'EXECUTING...' : 'RUN REQUEST'}
                </button>

                {/* Stats Box */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="p-2 border border-border/50 bg-muted/20">
                        <span className="block text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
                            Status
                        </span>
                        <span className={`text-sm font-mono font-bold ${
                            status === null
                                ? 'text-muted-foreground'
                                : status >= 200 && status < 300
                                    ? 'text-emerald-500'
                                    : 'text-red-500'
                        }`}>
                            {status || '---'}
                        </span>
                    </div>
                    <div className="p-2 border border-border/50 bg-muted/20">
                        <span className="block text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
                            Time
                        </span>
                        <span className="text-sm font-mono font-bold text-foreground">
                            {duration ? `${duration}ms` : '---'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Response Content */}
            <div className="flex-1 overflow-hidden relative bg-muted/5">
                {!response && !loading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center opacity-20">
                        <Zap size={48} />
                        <span className="mt-4 font-mono text-xs uppercase tracking-widest">Ready to Send</span>
                    </div>
                )}

                {response && (
                    <div className="absolute inset-0 overflow-auto p-4 custom-scrollbar">
                        <button
                            onClick={() => onCopy(JSON.stringify(response, null, 2), 'resp')}
                            className="absolute top-2 right-2 p-1 bg-background border border-border text-xs z-10 opacity-50 hover:opacity-100 transition-opacity"
                        >
                            {copied === 'resp' ? 'COPIED' : 'COPY JSON'}
                        </button>
                        <pre className="font-mono text-[10px] sm:text-xs leading-relaxed whitespace-pre-wrap break-all text-muted-foreground">
                            <code dangerouslySetInnerHTML={{ __html: highlightJSON(JSON.stringify(response, null, 2)) }} />
                        </pre>
                    </div>
                )}
            </div>
        </div>
    );
}
