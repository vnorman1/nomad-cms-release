/**
 * JsonPreview Component
 * 
 * Live JSON preview with syntax highlighting and copy functionality.
 * 
 * @security XSS-SAFE - Uses tokenization instead of dangerouslySetInnerHTML
 */

import { motion } from 'framer-motion';
import { useState, useMemo } from 'react';
import { Copy, Check, Download, ChevronDown, ChevronUp } from 'lucide-react';
import { BuilderSchema } from './types';
import { tokenizeJSON, getTokenClass } from '@/utils/sanitize';

interface JsonPreviewProps {
    schema: BuilderSchema;
    isCollapsed?: boolean;
    onToggleCollapse?: () => void;
}

export function JsonPreview({ schema, isCollapsed = false, onToggleCollapse }: JsonPreviewProps) {
    const [copied, setCopied] = useState(false);

    const jsonString = JSON.stringify(schema, null, 2);
    const lineCount = jsonString.split('\n').length;

    const handleCopy = async () => {
        await navigator.clipboard.writeText(jsonString);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleDownload = () => {
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'nomad.schema.json';
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <motion.div
            layout
            className="border border-border bg-zinc-950 text-zinc-50 font-mono text-xs"
        >
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-zinc-800 bg-zinc-900/50">
                <button
                    onClick={onToggleCollapse}
                    className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                >
                    <span className="text-[9px] uppercase tracking-widest text-zinc-400">
                        JSON Előnézet
                    </span>
                    <span className="text-[9px] text-zinc-600">
                        {lineCount} sor
                    </span>
                    {onToggleCollapse && (
                        isCollapsed ? <ChevronUp size={12} className="text-zinc-500" /> : <ChevronDown size={12} className="text-zinc-500" />
                    )}
                </button>

                <div className="flex items-center gap-2">
                    <button
                        onClick={handleDownload}
                        className="px-2 py-1 text-[9px] uppercase tracking-widest border border-zinc-700 hover:border-zinc-500 transition-colors flex items-center gap-1"
                    >
                        <Download size={10} />
                        Letöltés
                    </button>
                    <button
                        onClick={handleCopy}
                        className={`
                            px-2 py-1 text-[9px] uppercase tracking-widest border transition-all flex items-center gap-1
                            ${copied
                                ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                                : 'border-zinc-700 hover:border-zinc-500'
                            }
                        `}
                    >
                        {copied ? <Check size={10} /> : <Copy size={10} />}
                        {copied ? 'Másolva!' : 'Másolás'}
                    </button>
                </div>
            </div>

            {/* Content */}
            {!isCollapsed && (
                <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="max-h-80 overflow-auto"
                >
                    <pre className="p-4 text-[11px] leading-relaxed">
                        <JsonSyntaxHighlightSafe json={jsonString} />
                    </pre>
                </motion.div>
            )}
        </motion.div>
    );
}

/**
 * XSS-SAFE JSON syntax highlighting
 * Uses tokenization instead of regex + innerHTML
 * 
 * @security This component is XSS-safe - no dangerouslySetInnerHTML
 */
function JsonSyntaxHighlightSafe({ json }: { json: string }) {
    // Memoize tokenization for performance
    const tokens = useMemo(() => tokenizeJSON(json), [json]);
    
    return (
        <code>
            {tokens.map((token, index) => (
                <span key={index} className={getTokenClass(token.type)}>
                    {token.value}
                </span>
            ))}
        </code>
    );
}

/**
 * Compact inline JSON preview for sidebar
 */
interface CompactJsonBadgeProps {
    schema: BuilderSchema;
}

export function CompactJsonBadge({ schema }: CompactJsonBadgeProps) {
    const slotCount = Object.keys(schema.slots).length;
    const fieldCount = Object.values(schema.slots).reduce(
        (acc, slot) => acc + slot.fields.length, 0
    );

    return (
        <div className="flex items-center gap-2 text-[9px] font-mono text-zinc-400">
            <span>{slotCount} slot</span>
            <span className="opacity-40">•</span>
            <span>{fieldCount} mező</span>
        </div>
    );
}
