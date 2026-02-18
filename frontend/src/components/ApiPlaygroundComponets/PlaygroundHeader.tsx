// Playground Header Component for API Playground

import { Terminal, X, Code } from 'lucide-react';
import { EndpointDef } from './types';
import { MethodBadge } from './FieldComponents';

interface PlaygroundHeaderProps {
    apiBase: string;
    endpointCount: number;
    onClose?: () => void;
}

export function PlaygroundHeader({ apiBase, endpointCount, onClose }: PlaygroundHeaderProps) {
    return (
        <header className="h-16 shrink-0 border-b border-border flex items-center justify-between px-6 bg-muted/20">
            <div className="flex items-center gap-6">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-foreground/5 rounded-sm">
                        <Terminal size={18} className="text-foreground" />
                    </div>
                    <div>
                        <h1 className="text-sm font-bold uppercase tracking-widest">API Playground</h1>
                        <p className="text-[10px] font-mono text-muted-foreground">{apiBase}</p>
                    </div>
                </div>
            </div>
            <div className="flex items-center gap-4">
                <div className="text-[10px] uppercase font-mono tracking-widest text-muted-foreground flex gap-4">
                    <span>{endpointCount} ENDPOINTS</span>
                    <span>v3.3.0 NOMAD</span>
                </div>
                <button onClick={onClose} className="p-2 hover:bg-destructive/10 hover:text-destructive transition-colors">
                    <X size={20} />
                </button>
            </div>
        </header>
    );
}

interface RequestHeaderProps {
    selectedEndpoint: EndpointDef;
    apiBase: string;
    queryParams: Record<string, string>;
    onShowSnippets: () => void;
}

export function RequestHeader({ selectedEndpoint, apiBase, queryParams, onShowSnippets }: RequestHeaderProps) {

    return (
        <div className="p-6 border-b border-border bg-gradient-to-r from-muted/5 to-transparent">
            <div className="flex items-start justify-between mb-4">
                <div className="space-y-1">
                    <h2 className="text-xl font-bold tracking-tight flex items-center gap-3">
                        <MethodBadge method={selectedEndpoint.method} size="lg" />
                        {selectedEndpoint.name}
                    </h2>
                    <p className="text-xs text-muted-foreground pl-1">{selectedEndpoint.description}</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={onShowSnippets}
                        className="btn btn-secondary h-8 text-[10px]"
                    >
                        <Code size={12} className="mr-2" /> Code
                    </button>
                </div>
            </div>

            <div className="flex items-center gap-0 border border-border bg-muted/10 p-1">
                <div className="px-3 py-2 bg-background border-r border-border text-xs font-mono text-muted-foreground">
                    {apiBase}
                </div>
                <div className="flex-1 px-3 py-2 text-xs font-mono text-foreground font-medium truncate">
                    {selectedEndpoint.path}
                </div>
                {Object.keys(queryParams).length > 0 && (
                    <div className="px-3 py-2 text-xs font-mono text-purple-500 bg-purple-500/5 border-l border-border truncate max-w-xs">
                        ?{Object.entries(queryParams).map(([k, v]) => `${k}=${v}`).join('&')}
                    </div>
                )}
            </div>
        </div>
    );
}
