/**
 * DraftRecoveryBanner - Draft Recovery Notification Banner
 * Mentetlen változások visszaállítására szolgáló banner
 */

import { motion } from 'framer-motion';
import { Clock, RotateCcw } from 'lucide-react';
import type { DraftRecoveryBannerProps } from './types';

export function DraftRecoveryBanner({ 
    show, 
    hasPendingDraft, 
    pendingDraft, 
    onRestore, 
    onDiscard 
}: DraftRecoveryBannerProps) {
    if (!show || !hasPendingDraft || !pendingDraft) {
        return null;
    }

    return (
        <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-blue-500/10 border-b border-blue-500/30"
        >
            <div className="px-8 py-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-500/20 rounded">
                        <Clock size={18} className="text-blue-400" />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-blue-300">
                            Mentetlen változások találhatók
                        </p>
                        <p className="text-[10px] font-mono text-blue-400/70">
                            Utolsó mentés: {pendingDraft.updatedAt 
                                ? new Date(pendingDraft.updatedAt).toLocaleString('hu-HU') 
                                : 'ismeretlen'
                            }
                        </p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={onDiscard}
                        className="px-4 py-1.5 text-[10px] font-mono uppercase tracking-widest border border-border hover:border-red-500 hover:text-red-400 transition-colors"
                    >
                        Elvetés
                    </button>
                    <button
                        onClick={onRestore}
                        className="px-4 py-1.5 text-[10px] font-mono uppercase tracking-widest bg-blue-500 text-white hover:bg-blue-600 transition-colors flex items-center gap-2"
                    >
                        <RotateCcw size={12} />
                        Visszaállítás
                    </button>
                </div>
            </div>
        </motion.div>
    );
}
