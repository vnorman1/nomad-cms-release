/**
 * ArrayField - Tag/chip lista a Smart JSON Editorhoz
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FieldWrapper } from './FieldWrapper';
// Unused import removed


interface ArrayFieldProps {
    fieldKey: string;
    label: string;
    value: (string | number)[];
    onChange: (value: (string | number)[]) => void;
    depth: number;
    disabled?: boolean;
}

export function ArrayField({ label, value, onChange, depth, disabled }: ArrayFieldProps) {
    const [newItem, setNewItem] = useState('');
    const [isAdding, setIsAdding] = useState(false);

    // Using SVGs instead of lucide imports if not sure about availability
    const CloseIcon = () => (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
    );
    const PlusIcon = () => (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="M12 5v14" /></svg>
    );

    const handleAdd = () => {
        if (newItem.trim()) {
            const numValue = parseFloat(newItem);
            const valueToAdd = !isNaN(numValue) && newItem.trim() === numValue.toString()
                ? numValue
                : newItem.trim();

            onChange([...value, valueToAdd]);
            setNewItem('');
            setIsAdding(false);
        }
    };

    const handleRemove = (index: number) => {
        const newArray = [...value];
        newArray.splice(index, 1);
        onChange(newArray);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAdd();
        } else if (e.key === 'Escape') {
            setIsAdding(false);
            setNewItem('');
        }
    };

    return (
        <FieldWrapper label={label} depth={depth}>
            <div className={`
                flex flex-wrap gap-2 items-center min-h-[40px] p-2 
                bg-background/50 border border-border/50 rounded-md
                focus-within:border-primary/30 focus-within:bg-accent/5 transition-all
            `}>
                <AnimatePresence mode="popLayout">
                    {value.map((item, index) => (
                        <motion.span
                            key={`${item}-${index}`}
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            className={`
                                inline-flex items-center gap-1.5 px-2.5 py-1
                                bg-secondary text-secondary-foreground rounded-full
                                text-xs font-medium border border-border/50
                            `}
                        >
                            {String(item)}
                            {!disabled && (
                                <button
                                    onClick={() => handleRemove(index)}
                                    className="p-0.5 hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors opacity-60 hover:opacity-100"
                                >
                                    <CloseIcon />
                                </button>
                            )}
                        </motion.span>
                    ))}
                </AnimatePresence>

                {!disabled && (
                    <>
                        {isAdding ? (
                            <input
                                type="text"
                                value={newItem}
                                onChange={(e) => setNewItem(e.target.value)}
                                onKeyDown={handleKeyDown}
                                onBlur={() => {
                                    if (newItem.trim()) handleAdd();
                                    else setIsAdding(false);
                                }}
                                autoFocus
                                className="h-6 min-w-[80px] w-auto bg-transparent border-none outline-none text-xs placeholder:text-muted-foreground/50"
                                placeholder="Add item..."
                            />
                        ) : (
                            <button
                                onClick={() => setIsAdding(true)}
                                className={`
                                    flex items-center gap-1.5 px-2.5 py-1
                                    border border-dashed border-border rounded-full
                                    text-xs text-muted-foreground hover:text-foreground
                                    hover:bg-accent/50 hover:border-primary/50 transition-all
                                `}
                            >
                                <PlusIcon />
                                <span className="text-[10px] uppercase font-semibold tracking-wider">Add</span>
                            </button>
                        )}
                    </>
                )}

                {value.length === 0 && !isAdding && (
                    <span className="text-xs text-muted-foreground/30 italic px-1 select-none">
                        Empty list
                    </span>
                )}
            </div>
        </FieldWrapper>
    );
}
