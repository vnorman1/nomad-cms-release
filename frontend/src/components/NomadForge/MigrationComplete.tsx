/**
 * MigrationComplete - Success state component
 */

import { motion } from 'framer-motion';
import { CheckCircle, RefreshCw } from 'lucide-react';

interface MigrationCompleteProps {
    recordCount: number;
    onReset: () => void;
}

export function MigrationComplete({ recordCount, onReset }: MigrationCompleteProps) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-12"
        >
            {/* Success Icon */}
            <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', damping: 10, delay: 0.1 }}
                className="relative inline-block mb-6"
            >
                <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center">
                    <CheckCircle size={40} className="text-emerald-500" />
                </div>
                <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.3 }}
                    className="absolute -top-1 -right-1 w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center text-white text-xs font-bold"
                >
                    ✓
                </motion.div>
            </motion.div>

            {/* Title */}
            <motion.h3
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-xl font-mono font-medium mb-2"
            >
                Migráció Sikeres!
            </motion.h3>

            {/* Stats */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="inline-flex items-center gap-4 px-6 py-3 bg-emerald-500/10 rounded-lg mb-8"
            >
                <div className="text-center">
                    <div className="text-2xl font-mono font-bold text-emerald-500">
                        {recordCount.toLocaleString()}
                    </div>
                    <div className="text-xs opacity-60">rekord importálva</div>
                </div>
            </motion.div>

            {/* Actions */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="flex items-center justify-center gap-3"
            >
                <button
                    onClick={onReset}
                    className="
                        px-6 py-3 border border-border rounded-lg
                        font-mono text-xs uppercase tracking-widest
                        hover:bg-foreground hover:text-background
                        transition-all flex items-center gap-2
                    "
                >
                    <RefreshCw size={12} />
                    Új Migráció
                </button>
            </motion.div>
        </motion.div>
    );
}
