/**
 * ObjectField - Collapsible card nested objektumokhoz
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getDepthStyle } from '../fieldDetection';

interface ObjectFieldProps {
    fieldKey: string;
    label: string;
    depth: number;
    children: React.ReactNode;
    disabled?: boolean;
    itemCount?: number;
}

export function ObjectField({ label, depth, children, disabled, itemCount }: ObjectFieldProps) {
    const [isOpen, setIsOpen] = useState(depth <= 3); // Auto-expand first 3 levels

    // Validate label for resilience
    const safeLabel = typeof label === 'string' ? label : String(label ?? '');

    const depthStyle = getDepthStyle(depth);

    const headerHeight = depth === 0 ? 'h-9' : 'h-8';
    const fontSize = depth === 0 ? 'text-xs' : 'text-[11px]';

    return (
        <div className={`
            relative overflow-hidden transition-all duration-200
            ${depth === 0 ? 'bg-background/40 border border-border/60 rounded-lg shadow-sm' : ''}
            ${depth > 0 ? 'ml-1' : ''}
        `}>
            {/* Left line guide for nested items */}
            {depth > 0 && (
                <div className={`absolute left-0 top-0 bottom-0 w-px bg-border/40 transition-colors group-hover:bg-border/60`} />
            )}

            {/* Header */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                disabled={disabled}
                className={`
                    w-full flex items-center gap-2 ${headerHeight} pl-1 pr-3
                    hover:bg-accent/5 transition-colors text-left select-none group rounded-md
                    ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}
                `}
            >
                {/* Arrow */}
                <div className={`
                    flex items-center justify-center w-5 h-5 rounded-sm 
                    text-muted-foreground/60 transition-colors group-hover:text-foreground
                `}>
                    <motion.svg
                        className="w-3.5 h-3.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        initial={false}
                        animate={{ rotate: isOpen ? 90 : 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        <polyline points="9,6 15,12 9,18" />
                    </motion.svg>
                </div>

                {/* Label */}
                <span className={`
                    font-medium tracking-wide ${fontSize} text-muted-foreground group-hover:text-foreground transition-colors
                `}>
                    {safeLabel}
                </span>

                {/* Separator line */}
                <div className="flex-1 h-px bg-border/30 mx-3 group-hover:bg-border/50 transition-colors" />

                {/* Item count */}
                {itemCount !== undefined && (
                    <span className="text-[10px] font-mono text-muted-foreground/50">
                        {itemCount} item
                    </span>
                )}
            </button>

            {/* Content */}
            <AnimatePresence initial={false}>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeInOut" }}
                        className="overflow-hidden"
                    >
                        <div className={`
                            ${depthStyle.indentClass} 
                            ${depth === 0 ? 'p-3 pt-1' : 'py-2 pr-1'} 
                            space-y-3
                        `}>
                            {children}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
