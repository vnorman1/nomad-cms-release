// Import/Export - Clean Vercel-inspired design

import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Upload, Download, X, FileJson, Copy, Check, AlertCircle } from 'lucide-react';
import { CustomEndpoint, SavedCollection } from './customTypes';

interface ImportExportProps {
    customEndpoints: CustomEndpoint[];
    onImport: (endpoints: CustomEndpoint[]) => void;
    onClose: () => void;
}

export function ImportExport({ customEndpoints, onImport, onClose }: ImportExportProps) {
    const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');
    const [importText, setImportText] = useState('');
    const [importError, setImportError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const exportData: SavedCollection = {
        id: `collection-${Date.now()}`,
        name: 'API Collection',
        description: 'Exported from API Playground',
        endpoints: customEndpoints,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    const exportJson = JSON.stringify(exportData, null, 2);

    const handleCopy = () => {
        navigator.clipboard.writeText(exportJson);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleDownload = () => {
        const blob = new Blob([exportJson], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `api-collection-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleImport = () => {
        try {
            const data = JSON.parse(importText);
            
            if (data.endpoints && Array.isArray(data.endpoints)) {
                const validEndpoints = data.endpoints.filter((ep: CustomEndpoint) => 
                    ep.id && ep.name && ep.method && ep.path
                );
                
                if (validEndpoints.length === 0) {
                    setImportError('No valid endpoints found in the imported data');
                    return;
                }
                
                onImport(validEndpoints);
                onClose();
            } else if (Array.isArray(data)) {
                const validEndpoints = data.filter((ep: CustomEndpoint) => 
                    ep.id && ep.name && ep.method && ep.path
                );
                
                if (validEndpoints.length === 0) {
                    setImportError('No valid endpoints found in the imported data');
                    return;
                }
                
                onImport(validEndpoints);
                onClose();
            } else {
                setImportError('Invalid format. Expected a collection or array of endpoints.');
            }
        } catch {
            setImportError('Invalid JSON format');
        }
    };

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const content = e.target?.result as string;
                setImportText(content);
                setImportError(null);
            };
            reader.readAsText(file);
        }
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
                className="w-full max-w-2xl bg-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                            <FileJson size={16} />
                        </div>
                        <div>
                            <h3 className="font-semibold">Import / Export</h3>
                            <p className="text-xs text-muted-foreground">Save or load endpoint collections</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg transition-colors">
                        <X size={18} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-border">
                    <button
                        onClick={() => setActiveTab('export')}
                        className={`flex-1 px-4 py-3 text-sm font-medium transition-all border-b-2 flex items-center justify-center gap-2 ${
                            activeTab === 'export'
                                ? 'border-foreground text-foreground'
                                : 'border-transparent text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        <Download size={14} />
                        Export
                    </button>
                    <button
                        onClick={() => setActiveTab('import')}
                        className={`flex-1 px-4 py-3 text-sm font-medium transition-all border-b-2 flex items-center justify-center gap-2 ${
                            activeTab === 'import'
                                ? 'border-foreground text-foreground'
                                : 'border-transparent text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        <Upload size={14} />
                        Import
                    </button>
                </div>

                {/* Content */}
                <div className="p-6">
                    {activeTab === 'export' ? (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <p className="text-sm text-muted-foreground">
                                    {customEndpoints.length} custom endpoint{customEndpoints.length !== 1 ? 's' : ''}
                                </p>
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleCopy}
                                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${
                                            copied
                                                ? 'bg-emerald-500/10 text-emerald-500'
                                                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                                        }`}
                                    >
                                        {copied ? <Check size={12} /> : <Copy size={12} />}
                                        {copied ? 'Copied!' : 'Copy'}
                                    </button>
                                    <button
                                        onClick={handleDownload}
                                        className="px-3 py-1.5 text-xs font-medium bg-foreground text-background rounded-lg hover:bg-foreground/90 transition-all flex items-center gap-1.5"
                                    >
                                        <Download size={12} />
                                        Download
                                    </button>
                                </div>
                            </div>
                            
                            <div className="max-h-72 overflow-auto rounded-lg bg-muted/20 p-4">
                                <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap">
                                    {exportJson}
                                </pre>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <p className="text-sm text-muted-foreground">
                                    Paste JSON or upload a file
                                </p>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".json"
                                    onChange={handleFileUpload}
                                    className="hidden"
                                />
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-all flex items-center gap-1.5"
                                >
                                    <Upload size={12} />
                                    Upload File
                                </button>
                            </div>
                            
                            <textarea
                                value={importText}
                                onChange={(e) => {
                                    setImportText(e.target.value);
                                    setImportError(null);
                                }}
                                placeholder='Paste your JSON here...'
                                className="w-full h-56 bg-muted/20 rounded-lg p-4 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                                spellCheck={false}
                            />
                            
                            {importError && (
                                <div className="flex items-center gap-2 p-3 bg-destructive/10 rounded-lg text-destructive text-xs">
                                    <AlertCircle size={14} />
                                    {importError}
                                </div>
                            )}
                            
                            <button
                                onClick={handleImport}
                                disabled={!importText.trim()}
                                className={`w-full py-3 text-sm font-medium rounded-lg transition-all ${
                                    importText.trim()
                                        ? 'bg-foreground text-background hover:bg-foreground/90'
                                        : 'bg-muted text-muted-foreground cursor-not-allowed'
                                }`}
                            >
                                Import Endpoints
                            </button>
                        </div>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
}
