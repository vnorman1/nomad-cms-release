// Request History - Clean Vercel-inspired design

import { useState } from 'react';
import { motion } from 'framer-motion';
import { History, X, Trash2, RotateCcw, Clock, ChevronRight, Search } from 'lucide-react';
import { RequestHistoryItem } from './customTypes';
import { METHOD_THEMES, HttpMethod } from './types';
import { highlightJSON } from './utils';

interface RequestHistoryProps {
    history: RequestHistoryItem[];
    onReplay: (item: RequestHistoryItem) => void;
    onClear: () => void;
    onDeleteItem: (id: string) => void;
    onClose: () => void;
}

export function RequestHistory({ 
    history, 
    onReplay, 
    onClear, 
    onDeleteItem, 
    onClose 
}: RequestHistoryProps) {
    const [selectedItem, setSelectedItem] = useState<RequestHistoryItem | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterMethod, setFilterMethod] = useState<string | null>(null);

    const filteredHistory = history.filter(item => {
        const matchesSearch = searchQuery === '' || 
            item.endpointName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.url.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesMethod = !filterMethod || item.method === filterMethod;
        return matchesSearch && matchesMethod;
    });

    const formatTimestamp = (timestamp: string) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        
        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        return date.toLocaleDateString();
    };

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
                className="w-full max-w-5xl h-[80vh] bg-card border border-border rounded-xl shadow-2xl flex overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Left Panel - History List */}
                <div className="w-80 border-r border-border flex flex-col">
                    {/* Header */}
                    <div className="p-4 border-b border-border">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <History size={16} />
                                <span className="font-semibold text-sm">History</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">
                                    {history.length} items
                                </span>
                                {history.length > 0 && (
                                    <button
                                        onClick={onClear}
                                        className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                                        title="Clear all"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                )}
                            </div>
                        </div>
                        
                        {/* Search */}
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search..."
                                className="w-full h-9 bg-muted/30 rounded-lg pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                        </div>

                        {/* Method Filter */}
                        <div className="flex gap-1 mt-3">
                            <button
                                onClick={() => setFilterMethod(null)}
                                className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-all ${
                                    !filterMethod 
                                        ? 'bg-foreground text-background' 
                                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                                }`}
                            >
                                All
                            </button>
                            {(['GET', 'POST', 'PUT', 'DELETE'] as const).map((m) => {
                                const theme = METHOD_THEMES[m];
                                return (
                                    <button
                                        key={m}
                                        onClick={() => setFilterMethod(filterMethod === m ? null : m)}
                                        className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-all ${
                                            filterMethod === m 
                                                ? `${theme.bg} ${theme.text}` 
                                                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                                        }`}
                                    >
                                        {m}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* History List */}
                    <div className="flex-1 overflow-y-auto">
                        {filteredHistory.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                                <History size={32} className="opacity-30 mb-2" />
                                <p className="text-sm">No history yet</p>
                            </div>
                        ) : (
                            <div className="p-2 space-y-1">
                                {filteredHistory.map((item) => {
                                    const theme = METHOD_THEMES[item.method as HttpMethod];
                                    const isSelected = selectedItem?.id === item.id;
                                    const statusOk = item.status >= 200 && item.status < 300;
                                    
                                    return (
                                        <button
                                            key={item.id}
                                            onClick={() => setSelectedItem(item)}
                                            className={`w-full p-3 text-left rounded-lg transition-all ${
                                                isSelected 
                                                    ? 'bg-muted' 
                                                    : 'hover:bg-muted/50'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between mb-1">
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-[10px] font-bold font-mono ${theme.text}`}>
                                                        {item.method}
                                                    </span>
                                                    <span className={`text-[10px] font-mono font-semibold ${
                                                        statusOk ? 'text-emerald-500' : 'text-red-500'
                                                    }`}>
                                                        {item.status}
                                                    </span>
                                                </div>
                                                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                    <Clock size={10} />
                                                    {formatTimestamp(item.timestamp)}
                                                </span>
                                            </div>
                                            <p className="text-xs font-medium truncate">
                                                {item.endpointName}
                                            </p>
                                            <p className="text-[10px] font-mono text-muted-foreground truncate mt-0.5">
                                                {item.url}
                                            </p>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Panel - Detail View */}
                <div className="flex-1 flex flex-col">
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b border-border">
                        <h4 className="text-sm font-medium text-muted-foreground">
                            Request Details
                        </h4>
                        <button 
                            onClick={onClose}
                            className="p-2 hover:bg-muted rounded-lg transition-colors"
                        >
                            <X size={18} />
                        </button>
                    </div>

                    {/* Content */}
                    {selectedItem ? (
                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                            {/* Actions */}
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => onReplay(selectedItem)}
                                    className="px-4 py-2 bg-foreground text-background text-sm font-medium rounded-lg hover:bg-foreground/90 transition-all flex items-center gap-2"
                                >
                                    <RotateCcw size={14} />
                                    Replay
                                </button>
                                <button
                                    onClick={() => {
                                        onDeleteItem(selectedItem.id);
                                        setSelectedItem(null);
                                    }}
                                    className="px-4 py-2 text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all flex items-center gap-2"
                                >
                                    <Trash2 size={14} />
                                    Delete
                                </button>
                            </div>

                            {/* Request Info */}
                            <div className="space-y-2">
                                <h5 className="text-xs font-medium text-muted-foreground">Request</h5>
                                <div className="p-4 bg-muted/20 rounded-lg">
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded ${METHOD_THEMES[selectedItem.method as HttpMethod].bg} ${METHOD_THEMES[selectedItem.method as HttpMethod].text}`}>
                                            {selectedItem.method}
                                        </span>
                                        <span className="text-sm font-mono truncate">
                                            {selectedItem.url}
                                        </span>
                                    </div>
                                    
                                    {Object.keys(selectedItem.headers).length > 0 && (
                                        <div className="pt-3 border-t border-border/50">
                                            <span className="text-xs text-muted-foreground">Headers</span>
                                            <pre className="text-xs font-mono text-muted-foreground mt-2 whitespace-pre-wrap">
                                                {JSON.stringify(selectedItem.headers, null, 2)}
                                            </pre>
                                        </div>
                                    )}
                                    
                                    {selectedItem.body && (
                                        <div className="pt-3 border-t border-border/50 mt-3">
                                            <span className="text-xs text-muted-foreground">Body</span>
                                            <pre className="text-xs font-mono text-muted-foreground mt-2 whitespace-pre-wrap">
                                                {selectedItem.body}
                                            </pre>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Response */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <h5 className="text-xs font-medium text-muted-foreground">Response</h5>
                                    <div className="flex items-center gap-3">
                                        <span className={`text-xs font-mono font-semibold ${
                                            selectedItem.status >= 200 && selectedItem.status < 300 
                                                ? 'text-emerald-500' 
                                                : 'text-red-500'
                                        }`}>
                                            {selectedItem.status}
                                        </span>
                                        <span className="text-xs font-mono text-muted-foreground">
                                            {selectedItem.duration}ms
                                        </span>
                                    </div>
                                </div>
                                <div className="p-4 bg-muted/20 rounded-lg max-h-80 overflow-auto">
                                    <pre className="font-mono text-xs whitespace-pre-wrap break-all text-muted-foreground leading-relaxed">
                                        <code dangerouslySetInnerHTML={{ 
                                            __html: highlightJSON(JSON.stringify(selectedItem.response, null, 2)) 
                                        }} />
                                    </pre>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                            <ChevronRight size={32} className="opacity-30 mb-2" />
                            <p className="text-sm">Select a request to view details</p>
                        </div>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
}
