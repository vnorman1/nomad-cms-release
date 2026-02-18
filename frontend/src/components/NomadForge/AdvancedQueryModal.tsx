/**
 * AdvancedQueryModal - Fullscreen Power Query Editor
 * Professional data transformation interface
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
    X, Play, Undo, Redo,
    Type, Hash, Calendar, ToggleLeft, Link2, Phone, Mail,
    Filter, Search, Eye, Check, Zap, Wand2, Code,
    Columns, Sparkles
} from 'lucide-react';
import { ProcessResult, MappingRule, TargetField, TransformType } from './types';

interface AdvancedQueryModalProps {
    isOpen: boolean;
    onClose: () => void;
    processResult: ProcessResult;
    targetFields: TargetField[];
    mappings: MappingRule[];
    onMappingsChange: (mappings: MappingRule[]) => void;
    onExecute: () => void;
    wasmApplyTransform?: (value: string, transform: string) => string;
}

// Extended transforms for advanced mode
const TRANSFORM_CATEGORIES = [
    {
        label: 'Szöveg',
        transforms: [
            { id: 'none', label: 'Nincs', icon: Zap, description: 'Eredeti érték megtartása' },
            { id: 'uppercase', label: 'NAGYBETŰ', icon: Type, description: 'Teljes szöveg nagybetűssé' },
            { id: 'lowercase', label: 'kisbetű', icon: Type, description: 'Teljes szöveg kisbetűssé' },
            { id: 'capitalize', label: 'Kapitalizálás', icon: Type, description: 'Első betű nagy' },
            { id: 'trim', label: 'Trim', icon: Filter, description: 'Szóközök eltávolítása' },
            { id: 'slug', label: 'Slug', icon: Link2, description: 'URL-barát formátum' },
        ]
    },
    {
        label: 'Típus Konverzió',
        transforms: [
            { id: 'number', label: 'Szám', icon: Hash, description: 'Szám formátumra alakítás' },
            { id: 'date', label: 'Dátum', icon: Calendar, description: 'ISO dátum formátum' },
            { id: 'boolean', label: 'Boolean', icon: ToggleLeft, description: 'true/false értékké' },
            { id: 'json', label: 'JSON', icon: Code, description: 'JSON escape' },
        ]
    },
    {
        label: 'Speciális',
        transforms: [
            { id: 'email', label: 'Email', icon: Mail, description: 'Email normalizálás' },
            { id: 'phone', label: 'Telefon', icon: Phone, description: 'Telefonszám tisztítás' },
            { id: 'url', label: 'URL', icon: Link2, description: 'HTTP prefix hozzáadása' },
        ]
    }
];

// Transforms are accessed through TRANSFORM_CATEGORIES directly

export function AdvancedQueryModal({
    isOpen,
    onClose,
    processResult,
    targetFields,
    mappings,
    onMappingsChange,
    onExecute,
    wasmApplyTransform,
}: AdvancedQueryModalProps) {
    const [selectedColumn, setSelectedColumn] = useState<string | null>(null);
    const [previewMode, setPreviewMode] = useState<'source' | 'transformed'>('transformed');
    const [history, setHistory] = useState<MappingRule[][]>([mappings]);
    const [historyIndex, setHistoryIndex] = useState(0);

    // Update history when mappings change externally
    useEffect(() => {
        if (JSON.stringify(mappings) !== JSON.stringify(history[historyIndex])) {
            const newHistory = [...history.slice(0, historyIndex + 1), mappings];
            setHistory(newHistory);
            setHistoryIndex(newHistory.length - 1);
        }
    }, [mappings]);

    const canUndo = historyIndex > 0;
    const canRedo = historyIndex < history.length - 1;

    const handleUndo = () => {
        if (canUndo) {
            setHistoryIndex(historyIndex - 1);
            onMappingsChange(history[historyIndex - 1]);
        }
    };

    const handleRedo = () => {
        if (canRedo) {
            setHistoryIndex(historyIndex + 1);
            onMappingsChange(history[historyIndex + 1]);
        }
    };

    const updateMapping = (source: string, updates: Partial<MappingRule>) => {
        const newMappings = mappings.map(m =>
            m.source === source ? { ...m, ...updates } : m
        );
        onMappingsChange(newMappings);
    };

    const selectedMapping = selectedColumn
        ? mappings.find(m => m.source === selectedColumn)
        : null;

    const getColumnSamples = (column: string): string[] => {
        const colIndex = processResult.headers.indexOf(column);
        if (colIndex === -1) return [];
        return processResult.preview.map(row => row[colIndex] || '').slice(0, 5);
    };

    const applyTransform = (value: string, transform: string): string => {
        if (wasmApplyTransform) {
            return wasmApplyTransform(value, transform);
        }
        // Fallback JS implementation
        switch (transform) {
            case 'uppercase': return value.toUpperCase();
            case 'lowercase': return value.toLowerCase();
            case 'trim': return value.trim();
            default: return value;
        }
    };

    const mappedCount = mappings.filter(m => m.target).length;

    if (!isOpen) return null;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-background flex flex-col"
        >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-foreground/[0.02]">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
                        <Wand2 size={20} className="text-amber-500" />
                    </div>
                    <div>
                        <h2 className="font-mono font-medium flex items-center gap-2">
                            Advanced Query Builder
                            <span className="text-xs px-2 py-0.5 bg-foreground/10 rounded opacity-60">
                                {processResult.total_rows.toLocaleString()} sor
                            </span>
                        </h2>
                        <p className="text-xs opacity-50">
                            Profi adatátalakítás és oszlop párosítás
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {/* Undo/Redo */}
                    <div className="flex items-center border border-border rounded">
                        <button
                            onClick={handleUndo}
                            disabled={!canUndo}
                            className="p-2 hover:bg-foreground/5 disabled:opacity-30 transition-colors"
                            title="Visszavonás"
                        >
                            <Undo size={16} />
                        </button>
                        <div className="w-px h-6 bg-border" />
                        <button
                            onClick={handleRedo}
                            disabled={!canRedo}
                            className="p-2 hover:bg-foreground/5 disabled:opacity-30 transition-colors"
                            title="Újra"
                        >
                            <Redo size={16} />
                        </button>
                    </div>

                    {/* Stats */}
                    <div className="px-3 py-1.5 bg-foreground/5 rounded text-xs font-mono">
                        {mappedCount}/{processResult.headers.length} párosítva
                    </div>

                    {/* Execute */}
                    <button
                        onClick={onExecute}
                        disabled={mappedCount === 0}
                        className="
                            px-4 py-2 bg-emerald-500 text-white rounded
                            font-mono text-xs uppercase tracking-wider
                            disabled:opacity-30 hover:bg-emerald-600 transition-colors
                            flex items-center gap-2
                        "
                    >
                        <Play size={14} />
                        Futtatás
                    </button>

                    {/* Close */}
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-foreground/10 rounded transition-colors ml-2"
                    >
                        <X size={20} />
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex overflow-hidden">
                {/* Column List - Left Panel */}
                <div className="w-72 border-r border-border flex flex-col bg-foreground/[0.01]">
                    <div className="p-3 border-b border-border">
                        <div className="text-xs font-mono uppercase tracking-wider opacity-50 mb-2">
                            Forrás Oszlopok
                        </div>
                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-30" />
                            <input
                                type="text"
                                placeholder="Keresés..."
                                className="w-full pl-9 pr-3 py-2 text-sm bg-foreground/5 rounded focus:outline-none focus:ring-1 focus:ring-foreground border-0"
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                        {processResult.headers.map((header, i) => {
                            const mapping = mappings.find(m => m.source === header);
                            const isMapped = !!mapping?.target;
                            const isSelected = selectedColumn === header;

                            return (
                                <button
                                    key={header}
                                    onClick={() => setSelectedColumn(header)}
                                    className={`
                                        w-full flex items-center gap-2 p-2.5 rounded text-left
                                        transition-all
                                        ${isSelected
                                            ? 'bg-foreground text-background'
                                            : isMapped
                                                ? 'bg-emerald-500/10 hover:bg-emerald-500/20'
                                                : 'hover:bg-foreground/5'
                                        }
                                    `}
                                >
                                    <div className={`
                                        w-6 h-6 rounded flex items-center justify-center text-xs
                                        ${isSelected
                                            ? 'bg-background text-foreground'
                                            : isMapped
                                                ? 'bg-emerald-500 text-white'
                                                : 'bg-foreground/10'
                                        }
                                    `}>
                                        {isMapped ? <Check size={12} /> : i + 1}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-mono text-sm truncate">{header}</div>
                                        {mapping?.target && (
                                            <div className={`text-[10px] truncate ${isSelected ? 'opacity-70' : 'opacity-50'}`}>
                                                → {targetFields.find(f => f.id === mapping.target)?.label}
                                            </div>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Column Editor - Center Panel */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    {selectedColumn && selectedMapping ? (
                        <>
                            {/* Column Header */}
                            <div className="p-4 border-b border-border">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="font-mono text-lg font-medium">{selectedColumn}</h3>
                                        <p className="text-xs opacity-50 mt-1">
                                            Minta: {getColumnSamples(selectedColumn)[0] || '(üres)'}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setPreviewMode(previewMode === 'source' ? 'transformed' : 'source')}
                                            className="flex items-center gap-2 px-3 py-1.5 border border-border rounded text-xs hover:bg-foreground/5"
                                        >
                                            {previewMode === 'source' ? <Eye size={12} /> : <Sparkles size={12} />}
                                            {previewMode === 'source' ? 'Forrás' : 'Transzformált'}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Target Field Selection */}
                            <div className="p-4 border-b border-border">
                                <label className="text-xs font-mono uppercase tracking-wider opacity-50 block mb-3">
                                    Cél Mező
                                </label>
                                <div className="grid grid-cols-3 gap-2">
                                    <button
                                        onClick={() => updateMapping(selectedColumn, { target: '' })}
                                        className={`
                                            px-3 py-2 text-xs font-mono rounded border text-left
                                            ${!selectedMapping.target
                                                ? 'border-foreground bg-foreground/10'
                                                : 'border-border hover:border-foreground/50'
                                            }
                                        `}
                                    >
                                        <span className="opacity-50">— Skip —</span>
                                    </button>
                                    {targetFields.map(field => {
                                        const isUsed = mappings.some(m => m.target === field.id && m.source !== selectedColumn);
                                        return (
                                            <button
                                                key={field.id}
                                                onClick={() => !isUsed && updateMapping(selectedColumn, { target: field.id })}
                                                disabled={isUsed}
                                                className={`
                                                    px-3 py-2 text-xs font-mono rounded border text-left
                                                    transition-all
                                                    ${selectedMapping.target === field.id
                                                        ? 'border-emerald-500 bg-emerald-500/10'
                                                        : isUsed
                                                            ? 'border-border opacity-30 cursor-not-allowed'
                                                            : 'border-border hover:border-foreground/50'
                                                    }
                                                `}
                                            >
                                                {field.label}
                                                {field.required && <span className="text-red-500 ml-1">*</span>}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Transforms */}
                            <div className="p-4 flex-1 overflow-y-auto">
                                <label className="text-xs font-mono uppercase tracking-wider opacity-50 block mb-3">
                                    Transzformációk
                                </label>
                                <div className="space-y-4">
                                    {TRANSFORM_CATEGORIES.map(category => (
                                        <div key={category.label}>
                                            <div className="text-xs opacity-40 mb-2">{category.label}</div>
                                            <div className="grid grid-cols-3 gap-2">
                                                {category.transforms.map(t => (
                                                    <button
                                                        key={t.id}
                                                        onClick={() => updateMapping(selectedColumn, { transform: t.id as TransformType })}
                                                        className={`
                                                            flex items-center gap-2 px-3 py-2 rounded border text-left
                                                            transition-all
                                                            ${selectedMapping.transform === t.id
                                                                ? 'border-amber-500 bg-amber-500/10'
                                                                : 'border-border hover:border-foreground/50'
                                                            }
                                                        `}
                                                    >
                                                        <t.icon size={14} className={selectedMapping.transform === t.id ? 'text-amber-500' : 'opacity-40'} />
                                                        <div>
                                                            <div className="text-xs font-mono">{t.label}</div>
                                                            <div className="text-[10px] opacity-40">{t.description}</div>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-center">
                            <div>
                                <Columns size={48} className="mx-auto mb-4 opacity-20" />
                                <p className="text-sm opacity-50">Válassz egy oszlopot a bal oldali listából</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Preview Panel - Right */}
                <div className="w-80 border-l border-border flex flex-col">
                    <div className="p-3 border-b border-border">
                        <div className="text-xs font-mono uppercase tracking-wider opacity-50">
                            Élő Előnézet
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3">
                        {selectedColumn && selectedMapping ? (
                            <div className="space-y-2">
                                {getColumnSamples(selectedColumn).map((sample, i) => {
                                    const transformed = selectedMapping.transform
                                        ? applyTransform(sample, selectedMapping.transform)
                                        : sample;
                                    const hasChange = sample !== transformed;

                                    return (
                                        <div key={i} className="p-3 bg-foreground/[0.02] rounded border border-border">
                                            <div className="flex items-start gap-2">
                                                <span className="text-xs opacity-30 font-mono w-4">{i + 1}</span>
                                                <div className="flex-1 min-w-0 space-y-1">
                                                    {previewMode === 'source' || !hasChange ? (
                                                        <div className="text-sm font-mono truncate">{sample || '(üres)'}</div>
                                                    ) : (
                                                        <>
                                                            <div className="text-xs opacity-40 line-through truncate">{sample}</div>
                                                            <div className="text-sm font-mono text-emerald-500 truncate">{transformed}</div>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="flex items-center justify-center h-full text-sm opacity-30">
                                Válassz oszlopot
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
