import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Pencil } from 'lucide-react';

interface InputDialogProps {
    isOpen: boolean;
    title: string;
    message?: string;
    placeholder?: string;
    defaultValue?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: (value: string) => void;
    onCancel: () => void;
}

export function InputDialog({
    isOpen,
    title,
    message,
    placeholder = '',
    defaultValue = '',
    confirmLabel = 'Mentés',
    cancelLabel = 'Mégse',
    onConfirm,
    onCancel
}: InputDialogProps) {
    const [value, setValue] = useState(defaultValue);
    const inputRef = useRef<HTMLInputElement>(null);

    // Reset value when dialog opens with new defaultValue
    useEffect(() => {
        if (isOpen) {
            setValue(defaultValue);
            // Focus input after animation
            setTimeout(() => {
                inputRef.current?.focus();
                inputRef.current?.select();
            }, 100);
        }
    }, [isOpen, defaultValue]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (value.trim()) {
            onConfirm(value.trim());
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            onCancel();
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-background/90 backdrop-blur-md"
                        onClick={onCancel}
                    />

                    {/* Dialog */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.98, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.98, y: 10 }}
                        transition={{ duration: 0.15, ease: 'easeOut' }}
                        className="relative w-full max-w-md bg-background border border-border"
                    >
                        {/* Top accent line */}
                        <div className="h-px w-full bg-primary/50" />

                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-border/30">
                            <div className="flex items-center gap-3">
                                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                                <span className="text-[10px] font-mono uppercase tracking-[0.2em] opacity-60">
                                    SZERKESZTÉS
                                </span>
                            </div>
                            <button
                                onClick={onCancel}
                                className="w-6 h-6 flex items-center justify-center opacity-30 hover:opacity-100 transition-opacity"
                            >
                                <X size={12} />
                            </button>
                        </div>

                        {/* Content */}
                        <form onSubmit={handleSubmit}>
                            <div className="px-6 py-6 space-y-4">
                                <h3 className="text-lg font-light tracking-tight flex items-center gap-2">
                                    <Pencil size={16} className="text-primary" />
                                    {title}
                                </h3>
                                {message && (
                                    <p className="text-sm opacity-50 leading-relaxed">
                                        {message}
                                    </p>
                                )}
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={value}
                                    onChange={(e) => setValue(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder={placeholder}
                                    className="w-full px-4 py-3 bg-secondary/30 border border-border/50 rounded-lg 
                                               text-sm placeholder:text-muted-foreground/50
                                               focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50
                                               transition-all"
                                />
                            </div>

                            {/* Actions */}
                            <div className="px-6 py-4 border-t border-border/30 flex justify-end gap-3 bg-secondary/5">
                                <button
                                    type="button"
                                    onClick={onCancel}
                                    className="px-5 py-2 text-[10px] font-mono uppercase tracking-[0.15em] opacity-60 hover:opacity-100 transition-opacity"
                                >
                                    {cancelLabel}
                                </button>
                                <button
                                    type="submit"
                                    disabled={!value.trim()}
                                    className="px-5 py-2 text-[10px] font-mono uppercase tracking-[0.15em] transition-all
                                               bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20
                                               disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                    {confirmLabel}
                                </button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
