/**
 * ProcessingOverlay - Full-screen processing animation
 */

import { motion } from 'framer-motion';
import { Shield, Upload, Database } from 'lucide-react';

interface ProcessingOverlayProps {
    progress: number;
    stage: 'transform' | 'encrypt' | 'upload' | 'complete';
}

const STAGES = [
    { id: 'transform', label: 'Transzformálás', icon: Database },
    { id: 'encrypt', label: 'Titkosítás', icon: Shield },
    { id: 'upload', label: 'Feltöltés', icon: Upload },
];

export function ProcessingOverlay({ progress, stage }: ProcessingOverlayProps) {
    const currentStageIndex = STAGES.findIndex(s => s.id === stage);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/95 backdrop-blur-sm z-50 flex items-center justify-center"
        >
            <div className="max-w-md w-full mx-4 text-center">
                {/* Spinner */}
                <div className="relative w-24 h-24 mx-auto mb-8">
                    <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                        className="absolute inset-0 rounded-full border-2 border-border"
                    />
                    <motion.div
                        className="absolute inset-0 rounded-full border-2 border-t-foreground"
                       animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    />
                    <div className="absolute inset-4 rounded-full bg-foreground/5 flex items-center justify-center">
                        <span className="text-xl font-mono font-bold">{progress}%</span>
                    </div>
                </div>

                {/* Stage Indicator */}
                <div className="flex items-center justify-center gap-4 mb-8">
                    {STAGES.map((s, i) => (
                        <div key={s.id} className="flex items-center gap-2">
                            <motion.div
                                animate={{
                                    scale: i === currentStageIndex ? 1.1 : 1,
                                    opacity: i <= currentStageIndex ? 1 : 0.3,
                                }}
                                className={`
                                    w-8 h-8 rounded-full flex items-center justify-center
                                    ${i < currentStageIndex
                                        ? 'bg-emerald-500 text-white'
                                        : i === currentStageIndex
                                            ? 'bg-foreground text-background'
                                            : 'bg-border'
                                    }
                                `}
                            >
                                <s.icon size={14} />
                            </motion.div>
                            {i < STAGES.length - 1 && (
                                <div className={`w-8 h-px ${i < currentStageIndex ? 'bg-emerald-500' : 'bg-border'}`} />
                            )}
                        </div>
                    ))}
                </div>

                {/* Current Stage Label */}
                <motion.div
                    key={stage}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-sm font-mono uppercase tracking-widest opacity-60"
                >
                    {STAGES[currentStageIndex]?.label || 'Feldolgozás'}...
                </motion.div>

                {/* Progress Bar */}
                <div className="mt-6 mx-auto max-w-xs">
                    <div className="h-1 bg-border rounded-full overflow-hidden">
                        <motion.div
                            className="h-full"
                            style={{ backgroundColor: 'currentColor' }}
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                            transition={{ ease: 'easeOut', duration: 0.3 }}
                        />
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
