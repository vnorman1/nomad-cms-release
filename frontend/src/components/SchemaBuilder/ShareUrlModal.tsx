/**
 * ShareUrlModal Component
 * 
 * Modal for generating and sharing URL with compressed schema.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import {
    Link,
    Copy,
    Check,
    X,
    AlertTriangle,
    ExternalLink,
} from 'lucide-react';

interface ShareUrlModalProps {
    isOpen: boolean;
    onClose: () => void;
    shareUrl: string;
    urlLength: number;
    isUrlSafe: boolean;
}

export function ShareUrlModal({
    isOpen,
    onClose,
    shareUrl,
    urlLength,
    isUrlSafe,
}: ShareUrlModalProps) {
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (copied) {
            const timer = setTimeout(() => setCopied(false), 2000);
            return () => clearTimeout(timer);
        }
    }, [copied]);

    const handleCopy = async () => {
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
    };

    const handleOpen = () => {
        window.open(shareUrl, '_blank');
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

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="fixed inset-0 flex items-center justify-center z-50 p-4"
                    >
                        <div className="w-full max-w-xl bg-background border border-border shadow-2xl">
                            {/* Header */}
                            <div className="flex items-center justify-between p-4 border-b border-border">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 border border-border flex items-center justify-center">
                                        <Link size={16} />
                                    </div>
                                    <div>
                                        <h2 className="font-mono text-sm font-bold uppercase tracking-wider">
                                            Megosztás URL-ben
                                        </h2>
                                        <p className="text-[10px] opacity-50 mt-0.5">
                                            A séma tömörítve van az URL-ben
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-2 hover:bg-foreground/10 transition-colors"
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            {/* Content */}
                            <div className="p-6 space-y-4">
                                {/* URL Warning */}
                                {!isUrlSafe && (
                                    <div className="p-3 border border-amber-500/50 bg-amber-500/10 flex items-start gap-3">
                                        <AlertTriangle size={16} className="text-amber-500 mt-0.5" />
                                        <div>
                                            <p className="text-xs text-amber-500 font-medium">
                                                Hosszú URL figyelmeztetés
                                            </p>
                                            <p className="text-[10px] opacity-70 mt-1">
                                                Az URL {urlLength.toLocaleString()} karakter.
                                                Egyes böngészők 2000-8000 karakternél hosszabb URL-eket nem kezelnek megfelelően.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* URL Display */}
                                <div className="space-y-2">
                                    <label className="text-[9px] font-mono uppercase tracking-widest opacity-50">
                                        Megosztható link
                                    </label>
                                    <div className="relative group">
                                        <input
                                            type="text"
                                            value={shareUrl}
                                            readOnly
                                            className="w-full px-3 py-3 pr-24 bg-foreground/5 border border-border text-xs font-mono truncate focus:outline-none"
                                            onClick={(e) => (e.target as HTMLInputElement).select()}
                                        />
                                        <div className="absolute right-1 top-1 bottom-1 flex gap-1">
                                            <button
                                                onClick={handleOpen}
                                                className="px-2 bg-background border border-border hover:border-foreground transition-colors flex items-center gap-1"
                                                title="Megnyitás új ablakban"
                                            >
                                                <ExternalLink size={12} />
                                            </button>
                                            <button
                                                onClick={handleCopy}
                                                className={`
                                                    px-3 transition-all flex items-center gap-1
                                                    ${copied
                                                        ? 'bg-emerald-500 text-white'
                                                        : 'bg-foreground text-background hover:bg-foreground/90'
                                                    }
                                                `}
                                            >
                                                {copied ? <Check size={12} /> : <Copy size={12} />}
                                                <span className="text-[9px] uppercase tracking-wider">
                                                    {copied ? 'Másolva!' : 'Másolás'}
                                                </span>
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Stats */}
                                <div className="flex items-center gap-4 pt-2">
                                    <div className="text-center">
                                        <div className="text-lg font-mono font-bold">{urlLength.toLocaleString()}</div>
                                        <div className="text-[8px] uppercase tracking-widest opacity-40">Karakter</div>
                                    </div>
                                    <div className="h-8 w-px bg-border" />
                                    <div className="flex-1">
                                        <div className="h-2 bg-border rounded-full overflow-hidden">
                                            <div
                                                className={`h-full transition-all ${isUrlSafe ? 'bg-emerald-500' : 'bg-amber-500'}`}
                                                style={{ width: `${Math.min(100, (urlLength / 8000) * 100)}%` }}
                                            />
                                        </div>
                                        <div className="flex justify-between mt-1 text-[8px] opacity-40">
                                            <span>0</span>
                                            <span className={isUrlSafe ? 'text-emerald-500' : 'text-amber-500'}>
                                                {isUrlSafe ? '✓ Biztonságos' : 'Túl hosszú lehet'}
                                            </span>
                                            <span>8000</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="p-4 border-t border-border bg-foreground/5">
                                <p className="text-[10px] opacity-50 text-center">
                                    Tipp: A link tartalmazza a teljes sémát LZString tömörítéssel.
                                    Bárhol megnyitható, nem igényel bejelentkezést.
                                </p>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
