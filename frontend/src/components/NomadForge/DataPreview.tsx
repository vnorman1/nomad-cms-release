/**
 * DataPreview - Compact data preview table
 */

import { motion } from 'framer-motion';
import { Table, Rows, Columns, ArrowRight, X } from 'lucide-react';
import { ProcessResult } from './types';

interface DataPreviewProps {
    processResult: ProcessResult;
    fileName: string;
    onContinue: () => void;
    onCancel: () => void;
}

export function DataPreview({ processResult, fileName, onContinue, onCancel }: DataPreviewProps) {
    const maxCols = 6;
    const displayHeaders = processResult.headers.slice(0, maxCols);
    const hasMoreCols = processResult.headers.length > maxCols;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="border border-border rounded-lg overflow-hidden"
        >
            {/* Header */}
            <div className="flex items-center justify-between p-4 bg-foreground/[0.02] border-b border-border">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-foreground/10 flex items-center justify-center">
                        <Table size={18} className="opacity-60" />
                    </div>
                    <div>
                        <h4 className="font-mono text-sm font-medium truncate max-w-[200px]" title={fileName}>
                            {fileName}
                        </h4>
                        <div className="flex items-center gap-3 text-xs opacity-50 mt-0.5">
                            <span className="flex items-center gap-1">
                                <Rows size={10} />
                                {processResult.total_rows.toLocaleString()} sor
                            </span>
                            <span className="flex items-center gap-1">
                                <Columns size={10} />
                                {processResult.headers.length} oszlop
                            </span>
                        </div>
                    </div>
                </div>
                <button
                    onClick={onCancel}
                    className="p-2 hover:bg-foreground/10 rounded transition-colors"
                >
                    <X size={16} className="opacity-50" />
                </button>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-foreground/[0.03]">
                            {displayHeaders.map((h, i) => (
                                <th
                                    key={i}
                                    className="px-4 py-3 text-left font-mono text-xs uppercase tracking-wider opacity-60 border-b border-border whitespace-nowrap"
                                >
                                    {h}
                                </th>
                            ))}
                            {hasMoreCols && (
                                <th className="px-4 py-3 text-center font-mono text-xs uppercase tracking-wider opacity-30 border-b border-border">
                                    +{processResult.headers.length - maxCols}
                                </th>
                            )}
                        </tr>
                    </thead>
                    <tbody>
                        {processResult.preview.slice(0, 5).map((row, ri) => (
                            <motion.tr
                                key={ri}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: ri * 0.05 }}
                                className="border-b border-border/50 last:border-0 hover:bg-foreground/[0.02]"
                            >
                                {row.slice(0, maxCols).map((cell, ci) => (
                                    <td
                                        key={ci}
                                        className="px-4 py-2.5 truncate max-w-[150px]"
                                        title={cell}
                                    >
                                        {cell || <span className="opacity-20">—</span>}
                                    </td>
                                ))}
                                {hasMoreCols && (
                                    <td className="px-4 py-2.5 text-center text-xs opacity-30">
                                        ...
                                    </td>
                                )}
                            </motion.tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between p-4 bg-foreground/[0.02] border-t border-border">
                <span className="text-xs opacity-40">
                    Előnézet: első 5 sor
                </span>
                <button
                    onClick={onContinue}
                    className="
                        px-6 py-2 bg-foreground text-background rounded
                        font-mono text-xs uppercase tracking-widest
                        hover:opacity-90 transition-opacity
                        flex items-center gap-2
                    "
                >
                    Query Builder
                    <ArrowRight size={12} />
                </button>
            </div>
        </motion.div>
    );
}
