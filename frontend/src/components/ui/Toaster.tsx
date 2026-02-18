import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, AlertTriangle, Info, AlertCircle } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
    id: string;
    type: ToastType;
    title: string;
    message?: string;
}

interface ToasterProps {
    toasts: ToastMessage[];
    removeToast: (id: string) => void;
}

const toastConfig = {
    success: {
        icon: Check,
        label: 'SIKER',
        accentClass: 'bg-emerald-500',
        iconClass: 'text-emerald-500'
    },
    error: {
        icon: AlertCircle,
        label: 'HIBA',
        accentClass: 'bg-destructive',
        iconClass: 'text-destructive'
    },
    warning: {
        icon: AlertTriangle,
        label: 'FIGYELEM',
        accentClass: 'bg-amber-500',
        iconClass: 'text-amber-500'
    },
    info: {
        icon: Info,
        label: 'INFO',
        accentClass: 'bg-foreground/30',
        iconClass: 'text-foreground/60'
    },
};

export function Toaster({ toasts, removeToast }: ToasterProps) {
    return (
        <div className="fixed bottom-0 right-0 z-[100] p-4 flex flex-col gap-2 w-full max-w-sm pointer-events-none">
            <AnimatePresence mode="popLayout">
                {toasts.map((toast) => {
                    const config = toastConfig[toast.type];
                    const Icon = config.icon;

                    return (
                        <motion.div
                            key={toast.id}
                            layout
                            initial={{ opacity: 0, x: 50, scale: 0.95 }}
                            animate={{ opacity: 1, x: 0, scale: 1 }}
                            exit={{ opacity: 0, x: 50, scale: 0.95, transition: { duration: 0.15 } }}
                            className="pointer-events-auto bg-background/95 backdrop-blur-sm border border-border overflow-hidden"
                        >
                            {/* Top accent line */}
                            <div className={`h-0.5 w-full ${config.accentClass}`} />

                            <div className="flex items-start gap-3 p-4">
                                {/* Icon */}
                                <div className="pt-0.5">
                                    <Icon size={14} className={config.iconClass} />
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-[9px] font-mono uppercase tracking-[0.15em] opacity-40">
                                            {config.label}
                                        </span>
                                    </div>
                                    <h4 className="text-sm font-medium tracking-tight truncate">
                                        {toast.title}
                                    </h4>
                                    {toast.message && (
                                        <p className="text-xs opacity-50 mt-1 leading-relaxed line-clamp-2">
                                            {toast.message}
                                        </p>
                                    )}
                                </div>

                                {/* Close button */}
                                <button
                                    onClick={() => removeToast(toast.id)}
                                    className="opacity-30 hover:opacity-100 transition-opacity p-1 -m-1"
                                >
                                    <X size={12} />
                                </button>
                            </div>
                        </motion.div>
                    );
                })}
            </AnimatePresence>
        </div>
    );
}
