/**
 * FieldTypeSelector Component
 * 
 * Visual field type selector with icons and descriptions.
 * Matches CMS color scheme.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import * as Icons from 'lucide-react';
import { FIELD_TYPES } from './types';
import type { FieldType } from '@/config/admin.config';

interface FieldTypeSelectorProps {
    value: FieldType;
    onChange: (type: FieldType) => void;
    disabled?: boolean;
}

export function FieldTypeSelector({ value, onChange, disabled }: FieldTypeSelectorProps) {
    const [isOpen, setIsOpen] = useState(false);

    const selectedType = FIELD_TYPES.find(t => t.type === value) || FIELD_TYPES[0];
    const IconComponent = (Icons as any)[selectedType.icon] || Icons.HelpCircle;

    const handleSelect = (type: FieldType) => {
        onChange(type);
        setIsOpen(false);
    };

    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className={`
                    w-full flex items-center gap-3 p-3 border transition-all
                    ${isOpen ? 'border-foreground bg-foreground/5' : 'border-border hover:border-foreground/50'}
                    ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                `}
            >
                <div className={`w-8 h-8 flex items-center justify-center ${selectedType.color}`}>
                    <IconComponent size={16} />
                </div>
                <div className="flex-1 text-left">
                    <div className="font-mono text-xs font-medium">{selectedType.label}</div>
                    <div className="text-[9px] opacity-50 uppercase tracking-widest">{selectedType.type}</div>
                </div>
                <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                    <ChevronDown size={14} className="opacity-40" />
                </motion.div>
            </button>

            <AnimatePresence>
                {isOpen && (
                    <>
                        {/* Backdrop */}
                        <div
                            className="fixed inset-0 z-40"
                            onClick={() => setIsOpen(false)}
                        />

                        {/* Dropdown */}
                        <motion.div
                            initial={{ opacity: 0, y: -10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -10, scale: 0.95 }}
                            transition={{ duration: 0.15 }}
                            className="absolute z-50 top-full left-0 right-0 mt-1 bg-background border border-border shadow-xl max-h-80 overflow-y-auto"
                        >
                            <div className="grid grid-cols-2 gap-px bg-border">
                                {FIELD_TYPES.map((typeInfo) => {
                                    const TypeIcon = (Icons as any)[typeInfo.icon] || Icons.HelpCircle;
                                    const isSelected = typeInfo.type === value;

                                    return (
                                        <button
                                            key={typeInfo.type}
                                            onClick={() => handleSelect(typeInfo.type)}
                                            className={`
                                                flex items-center gap-3 p-3 bg-background transition-colors text-left
                                                ${isSelected ? 'bg-foreground/10' : 'hover:bg-foreground/5'}
                                            `}
                                        >
                                            <div className={`w-6 h-6 flex items-center justify-center ${typeInfo.color}`}>
                                                <TypeIcon size={14} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-mono text-[10px] font-medium truncate">{typeInfo.label}</div>
                                                <div className="text-[8px] opacity-40 uppercase tracking-wider">{typeInfo.type}</div>
                                            </div>
                                            {isSelected && <Check size={12} className="text-emerald-500" />}
                                        </button>
                                    );
                                })}
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}

/**
 * Compact inline type badge
 */
interface TypeBadgeProps {
    type: FieldType;
    compact?: boolean;
}

export function TypeBadge({ type, compact = false }: TypeBadgeProps) {
    const typeInfo = FIELD_TYPES.find(t => t.type === type);
    if (!typeInfo) return null;

    const IconComponent = (Icons as any)[typeInfo.icon] || Icons.HelpCircle;

    if (compact) {
        return (
            <span className={`inline-flex items-center gap-1 ${typeInfo.color}`}>
                <IconComponent size={10} />
                <span className="text-[8px] font-mono uppercase">{type}</span>
            </span>
        );
    }

    return (
        <span className={`inline-flex items-center gap-2 px-2 py-1 border border-current/20 ${typeInfo.color}`}>
            <IconComponent size={12} />
            <span className="text-[9px] font-mono uppercase tracking-wider">{typeInfo.label}</span>
        </span>
    );
}
