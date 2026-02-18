import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    isDestructive?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

export function ConfirmDialog({
    isOpen,
    title,
    message,
    confirmLabel = 'Igen',
    cancelLabel = 'Mégse',
    isDestructive = false,
    onConfirm,
    onCancel
}: ConfirmDialogProps) {
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
                        <div className={`h-px w-full ${isDestructive ? 'bg-destructive' : 'bg-foreground/20'}`} />

                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-border/30">
                            <div className="flex items-center gap-3">
                                <div className={`w-1.5 h-1.5 rounded-full ${isDestructive ? 'bg-destructive animate-pulse' : 'bg-foreground/40'}`} />
                                <span className="text-[10px] font-mono uppercase tracking-[0.2em] opacity-60">
                                    {isDestructive ? 'FIGYELMEZTETÉS' : 'MEGERŐSÍTÉS'}
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
                        <div className="px-6 py-8 space-y-3">
                            <h3 className="text-lg font-light tracking-tight">
                                {title}
                            </h3>
                            <p className="text-sm opacity-50 leading-relaxed">
                                {message}
                            </p>
                        </div>

                        {/* Actions */}
                        <div className="px-6 py-4 border-t border-border/30 flex justify-end gap-3 bg-secondary/5">
                            <button
                                onClick={onCancel}
                                className="px-5 py-2 text-[10px] font-mono uppercase tracking-[0.15em] opacity-60 hover:opacity-100 transition-opacity"
                            >
                                {cancelLabel}
                            </button>
                            <button
                                onClick={onConfirm}
                                className={`
                                    px-5 py-2 text-[10px] font-mono uppercase tracking-[0.15em] transition-all flex items-center gap-2
                                    ${isDestructive
                                        ? 'bg-destructive/10 text-destructive border border-destructive/30 hover:bg-destructive/20'
                                        : 'bg-foreground text-background hover:opacity-80'}
                                `}
                            >
                                {isDestructive && <AlertTriangle size={10} />}
                                <span>{confirmLabel}</span>
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
