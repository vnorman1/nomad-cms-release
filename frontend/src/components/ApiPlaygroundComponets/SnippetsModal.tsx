// Code Snippets Modal - Clean Vercel-inspired design

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Code, X, Copy, Check, Terminal, FileCode, Braces } from 'lucide-react';
import { EndpointDef } from './types';
import { generateCurl, generateFetch, generateTypeScript } from './snippetGenerators';

interface SnippetsModalProps {
    selectedEndpoint: EndpointDef;
    buildRequest: () => { url: string; headers: Record<string, string>; body: string };
    copied: string | null;
    onCopy: (text: string, key: string) => void;
    onClose: () => void;
}

const SNIPPET_TABS = [
    { id: 'curl', label: 'cURL', icon: Terminal, gen: generateCurl },
    { id: 'js', label: 'JavaScript', icon: Braces, gen: generateFetch },
    { id: 'ts', label: 'TypeScript', icon: FileCode, gen: generateTypeScript }
] as const;

export function SnippetsModal({
    selectedEndpoint,
    buildRequest,
    copied,
    onCopy,
    onClose
}: SnippetsModalProps) {
    const [activeTab, setActiveTab] = useState<string>('curl');
    const { url, headers, body } = buildRequest();

    const activeSnippet = SNIPPET_TABS.find(s => s.id === activeTab);
    const code = activeSnippet?.gen(selectedEndpoint, url, headers, body) || '';

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, y: 10 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 10 }}
                className="w-full max-w-3xl bg-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                            <Code size={16} />
                        </div>
                        <div>
                            <h3 className="font-semibold">Code Snippets</h3>
                            <p className="text-xs text-muted-foreground">{selectedEndpoint.name}</p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-2 hover:bg-muted rounded-lg transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Language Tabs */}
                <div className="flex border-b border-border">
                    {SNIPPET_TABS.map(tab => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all border-b-2 ${
                                    isActive
                                        ? 'border-foreground text-foreground'
                                        : 'border-transparent text-muted-foreground hover:text-foreground'
                                }`}
                            >
                                <Icon size={14} />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>

                {/* Code Area */}
                <div className="flex-1 overflow-hidden relative">
                    <div className="absolute top-3 right-3 z-10">
                        <button
                            onClick={() => onCopy(code, activeTab)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                                copied === activeTab
                                    ? 'bg-emerald-500/10 text-emerald-500'
                                    : 'bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            {copied === activeTab ? (
                                <>
                                    <Check size={12} />
                                    Copied!
                                </>
                            ) : (
                                <>
                                    <Copy size={12} />
                                    Copy
                                </>
                            )}
                        </button>
                    </div>
                    <div className="p-4 h-80 overflow-auto bg-muted/20">
                        <pre className="font-mono text-sm text-muted-foreground whitespace-pre-wrap break-all leading-relaxed">
                            {code}
                        </pre>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-4 py-3 border-t border-border bg-muted/10">
                    <p className="text-xs text-muted-foreground text-center">
                        Press <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono mx-1">⌘C</kbd> to copy, 
                        <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono mx-1">Esc</kbd> to close
                    </p>
                </div>
            </motion.div>
        </motion.div>
    );
}
