/**
 * ImportExportPanel Component
 * 
 * Side panel for importing and exporting JSON schemas.
 * Also supports converting raw JSON data into a schema slot.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import {
    X,
    Upload,
    Download,
    AlertCircle,
    CheckCircle,
    FileJson,
    Clipboard,
    Braces,
} from 'lucide-react';
import { inferSchemaFromData } from './jsonToSchema';
import type { BuilderSlotConfig } from './types';

interface ImportExportPanelProps {
    isOpen: boolean;
    onClose: () => void;
    onImport: (json: string) => boolean;
    onImportSlot?: (slotKey: string, slotConfig: BuilderSlotConfig) => void;
    exportJson: string;
}

export function ImportExportPanel({
    isOpen,
    onClose,
    onImport,
    onImportSlot,
    exportJson,
}: ImportExportPanelProps) {
    const [activeTab, setActiveTab] = useState<'import' | 'export' | 'data-import'>('import');
    const [importText, setImportText] = useState('');
    const [importError, setImportError] = useState<string | null>(null);
    const [importSuccess, setImportSuccess] = useState(false);
    const [copied, setCopied] = useState(false);

    // Data import state
    const [dataImportText, setDataImportText] = useState('');
    const [dataImportError, setDataImportError] = useState<string | null>(null);
    const [dataImportSuccess, setDataImportSuccess] = useState(false);


    const handleImport = () => {
        setImportError(null);
        setImportSuccess(false);

        if (!importText.trim()) {
            setImportError('Kérlek illessz be egy JSON sémát.');
            return;
        }

        try {
            JSON.parse(importText); // Validate JSON first
            const success = onImport(importText);
            if (success) {
                setImportSuccess(true);
                setImportText('');
                setTimeout(() => {
                    onClose();
                    setImportSuccess(false);
                }, 1500);
            } else {
                setImportError('Érvénytelen séma formátum. A séma-nak tartalmaznia kell "slots" objektumot.');
            }
        } catch (e) {
            setImportError('Érvénytelen JSON formátum. Kérlek ellenőrizd a szintaxist.');
        }
    };

    const handlePaste = async () => {
        try {
            const text = await navigator.clipboard.readText();
            setImportText(text);
        } catch (e) {
            setImportError('Nem sikerült beilleszteni a vágólapról.');
        }
    };

    const handleCopy = async () => {
        await navigator.clipboard.writeText(exportJson);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleDownload = () => {
        const blob = new Blob([exportJson], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'nomad.schema.json';
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleDataImport = () => {
        setDataImportError(null);
        setDataImportSuccess(false);

        if (!dataImportText.trim()) {
            setDataImportError('Kérlek illessz be JSON adatot.');
            return;
        }

        const result = inferSchemaFromData(dataImportText);

        if (!result) {
            setDataImportError('Nem sikerült érvényes JSON objektumot találni a bevitt szövegben.');
            return;
        }

        if (onImportSlot) {
            onImportSlot(result.slotKey, result.slotConfig);
            setDataImportSuccess(true);
            setDataImportText('');
            setTimeout(() => {
                onClose();
                setDataImportSuccess(false);
            }, 1500);
        } else {
            setDataImportError('A slot importálás nem támogatott ebben a kontextusban.');
        }
    };

    const handleDataPaste = async () => {
        try {
            const text = await navigator.clipboard.readText();
            setDataImportText(text);
            setDataImportError(null);
        } catch {
            setDataImportError('Nem sikerült beilleszteni a vágólapról.');
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50"
                    />

                    {/* Panel */}
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="fixed right-0 top-0 bottom-0 w-full max-w-lg bg-background border-l border-border shadow-2xl z-50 flex flex-col"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 border-b border-border">
                            <div className="flex items-center gap-3">
                                <FileJson size={18} />
                                <h2 className="font-mono text-sm font-bold uppercase tracking-wider">
                                    Import / Export
                                </h2>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 hover:bg-foreground/10 transition-colors"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {/* Tabs */}
                        <div className="flex border-b border-border">
                            <button
                                onClick={() => setActiveTab('import')}
                                className={`
                                    flex-1 py-3 text-[10px] font-mono uppercase tracking-widest transition-colors
                                    flex items-center justify-center gap-2
                                    ${activeTab === 'import'
                                        ? 'bg-foreground/10 border-b-2 border-foreground'
                                        : 'opacity-50 hover:opacity-100'
                                    }
                                `}
                            >
                                <Upload size={12} />
                                Import
                            </button>
                            <button
                                onClick={() => setActiveTab('export')}
                                className={`
                                    flex-1 py-3 text-[10px] font-mono uppercase tracking-widest transition-colors
                                    flex items-center justify-center gap-2
                                    ${activeTab === 'export'
                                        ? 'bg-foreground/10 border-b-2 border-foreground'
                                        : 'opacity-50 hover:opacity-100'
                                    }
                                `}
                            >
                                <Download size={12} />
                                Export
                            </button>
                            <button
                                onClick={() => setActiveTab('data-import')}
                                className={`
                                    flex-1 py-3 text-[10px] font-mono uppercase tracking-widest transition-colors
                                    flex items-center justify-center gap-2
                                    ${activeTab === 'data-import'
                                        ? 'bg-foreground/10 border-b-2 border-emerald-500'
                                        : 'opacity-50 hover:opacity-100'
                                    }
                                `}
                            >
                                <Braces size={12} />
                                Adat (JSON)
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-6">
                            <AnimatePresence mode="wait">
                                {activeTab === 'import' && (
                                    <motion.div
                                        key="import"
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 20 }}
                                        className="space-y-4"
                                    >
                                        <div>
                                            <div className="flex items-center justify-between mb-2">
                                                <label className="text-[9px] font-mono uppercase tracking-widest opacity-50">
                                                    JSON Séma
                                                </label>
                                                <button
                                                    onClick={handlePaste}
                                                    className="px-2 py-1 text-[9px] font-mono uppercase tracking-widest border border-border hover:border-foreground transition-colors flex items-center gap-1"
                                                >
                                                    <Clipboard size={10} />
                                                    Beillesztés
                                                </button>
                                            </div>
                                            <textarea
                                                value={importText}
                                                onChange={(e) => {
                                                    setImportText(e.target.value);
                                                    setImportError(null);
                                                }}
                                                placeholder='{"slots": {...}}'
                                                className="w-full h-80 px-3 py-3 bg-foreground/5 border border-border text-xs font-mono focus:border-foreground outline-none resize-none"
                                            />
                                        </div>

                                        {/* Error */}
                                        {importError && (
                                            <motion.div
                                                initial={{ opacity: 0, y: -10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className="p-3 border border-red-500/50 bg-red-500/10 flex items-start gap-2"
                                            >
                                                <AlertCircle size={14} className="text-red-500 mt-0.5" />
                                                <p className="text-xs text-red-400">{importError}</p>
                                            </motion.div>
                                        )}

                                        {/* Success */}
                                        {importSuccess && (
                                            <motion.div
                                                initial={{ opacity: 0, y: -10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className="p-3 border border-emerald-500/50 bg-emerald-500/10 flex items-center gap-2"
                                            >
                                                <CheckCircle size={14} className="text-emerald-500" />
                                                <p className="text-xs text-emerald-400">Séma sikeresen importálva!</p>
                                            </motion.div>
                                        )}

                                        <button
                                            onClick={handleImport}
                                            disabled={!importText.trim()}
                                            className="w-full py-3 bg-foreground text-background hover:bg-foreground/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-mono text-xs uppercase tracking-widest flex items-center justify-center gap-2"
                                        >
                                            <Upload size={14} />
                                            Séma betöltése
                                        </button>

                                        <p className="text-[10px] opacity-40 text-center">
                                            A meglévő séma felülíródik az importált sémával.
                                        </p>
                                    </motion.div>
                                )}

                                {activeTab === 'export' && (
                                    <motion.div
                                        key="export"
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -20 }}
                                        className="space-y-4"
                                    >
                                        <div>
                                            <label className="text-[9px] font-mono uppercase tracking-widest opacity-50 block mb-2">
                                                Aktuális séma
                                            </label>
                                            <pre className="w-full h-80 px-3 py-3 bg-zinc-950 text-zinc-50 border border-border text-[10px] font-mono overflow-auto">
                                                {exportJson}
                                            </pre>
                                        </div>

                                        <div className="flex gap-2">
                                            <button
                                                onClick={handleCopy}
                                                className={`
                                                    flex-1 py-3 transition-all font-mono text-xs uppercase tracking-widest flex items-center justify-center gap-2 border
                                                    ${copied
                                                        ? 'bg-emerald-500 border-emerald-500 text-white'
                                                        : 'bg-foreground border-foreground text-background hover:bg-foreground/90'
                                                    }
                                                `}
                                            >
                                                {copied ? <CheckCircle size={14} /> : <Clipboard size={14} />}
                                                {copied ? 'Másolva!' : 'Másolás'}
                                            </button>
                                            <button
                                                onClick={handleDownload}
                                                className="flex-1 py-3 border border-foreground hover:bg-foreground hover:text-background transition-colors font-mono text-xs uppercase tracking-widest flex items-center justify-center gap-2"
                                            >
                                                <Download size={14} />
                                                Letöltés
                                            </button>
                                        </div>
                                    </motion.div>
                                )}

                                {activeTab === 'data-import' && (
                                    <motion.div
                                        key="data-import"
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -20 }}
                                        className="space-y-4"
                                    >
                                        <div>
                                            <div className="flex items-center justify-between mb-2">
                                                <label className="text-[9px] font-mono uppercase tracking-widest opacity-50">
                                                    JSON Adat (nyers)
                                                </label>
                                                <button
                                                    onClick={handleDataPaste}
                                                    className="px-2 py-1 text-[9px] font-mono uppercase tracking-widest border border-border hover:border-emerald-500 transition-colors flex items-center gap-1"
                                                >
                                                    <Clipboard size={10} />
                                                    Beillesztés
                                                </button>
                                            </div>
                                            <textarea
                                                value={dataImportText}
                                                onChange={(e) => {
                                                    setDataImportText(e.target.value);
                                                    setDataImportError(null);
                                                }}
                                                placeholder='{"id": 1, "title": "...", "description": "...", ...} vagy több JSON objektum'
                                                className="w-full h-80 px-3 py-3 bg-foreground/5 border border-border text-xs font-mono focus:border-emerald-500 outline-none resize-none"
                                            />
                                        </div>

                                        <p className="text-[10px] opacity-60">
                                            Illeszd be a nyers JSON adatokat (egy vagy több objektum), és a rendszer automatikusan felismeri a mezőket és létrehozza a megfelelő sémát.
                                        </p>

                                        {/* Error */}
                                        {dataImportError && (
                                            <motion.div
                                                initial={{ opacity: 0, y: -10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className="p-3 border border-red-500/50 bg-red-500/10 flex items-start gap-2"
                                            >
                                                <AlertCircle size={14} className="text-red-500 mt-0.5" />
                                                <p className="text-xs text-red-400">{dataImportError}</p>
                                            </motion.div>
                                        )}

                                        {/* Success */}
                                        {dataImportSuccess && (
                                            <motion.div
                                                initial={{ opacity: 0, y: -10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className="p-3 border border-emerald-500/50 bg-emerald-500/10 flex items-center gap-2"
                                            >
                                                <CheckCircle size={14} className="text-emerald-500" />
                                                <p className="text-xs text-emerald-400">Slot sikeresen létrehozva a JSON adatból!</p>
                                            </motion.div>
                                        )}

                                        <button
                                            onClick={handleDataImport}
                                            disabled={!dataImportText.trim()}
                                            className="w-full py-3 bg-emerald-500 text-white hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-mono text-xs uppercase tracking-widest flex items-center justify-center gap-2"
                                        >
                                            <Braces size={14} />
                                            Konvertálás sémává
                                        </button>

                                        <p className="text-[10px] opacity-40 text-center">
                                            A generált slot hozzáadódik a meglévő sémához.
                                        </p>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
