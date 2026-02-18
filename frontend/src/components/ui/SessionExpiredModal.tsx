/**
 * SessionExpiredModal - Displays when user session has expired
 * Redesigned with premium glassmorphism aesthetic
 */
import { motion, AnimatePresence } from 'framer-motion';
import { LogIn, Lock, Clock } from 'lucide-react';

interface SessionExpiredModalProps {
    isOpen: boolean;
    onLogin: () => void;
}

export function SessionExpiredModal({ isOpen, onLogin }: SessionExpiredModalProps) {
    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                    {/* Backdrop with blur and noise */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.5 }}
                        className="absolute inset-0 bg-background/80 backdrop-blur-md"
                    >
                        <div
                            className="absolute inset-0 opacity-[0.03] pointer-events-none"
                            style={{
                                backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
                                backgroundSize: '40px 40px',
                            }}
                        />
                    </motion.div>

                    {/* Modal Container */}
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.95, opacity: 0, y: 20 }}
                        transition={{
                            type: 'spring',
                            damping: 25,
                            stiffness: 300,
                            mass: 0.8
                        }}
                        className="relative w-full max-w-sm overflow-hidden"
                    >
                        {/* Glass Card */}
                        <div className="relative bg-background/60 backdrop-blur-xl border border-foreground/10 shadow-2xl overflow-hidden">
                            {/* Decorative corners */}
                            <div className="absolute top-0 left-0 w-3 h-3 border-t border-l border-foreground/30 z-10" />
                            <div className="absolute top-0 right-0 w-3 h-3 border-t border-r border-foreground/30 z-10" />
                            <div className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-foreground/30 z-10" />
                            <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-foreground/30 z-10" />

                            <div className="p-8 flex flex-col items-center text-center relative z-0">
                                {/* Icon container with pulse effect */}
                                <div className="mb-6 relative">
                                    <div className="absolute inset-0 bg-amber-500/20 blur-xl rounded-full animate-pulse" />
                                    <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/20 flex items-center justify-center relative backdrop-blur-sm">
                                        <Lock size={24} className="text-amber-500" />
                                        <div className="absolute -bottom-1 -right-1 bg-background border border-foreground/10 p-1">
                                            <Clock size={12} className="text-foreground/60" />
                                        </div>
                                    </div>
                                </div>

                                {/* Title */}
                                <div className="space-y-1 mb-2">
                                    <h2 className="text-xl font-bold tracking-tight">
                                        MUNKAMENET LEJÁRT
                                    </h2>
                                    <div className="h-0.5 w-12 bg-foreground/20 mx-auto" />
                                </div>

                                {/* Message */}
                                <p className="text-xs font-mono text-foreground/60 uppercase tracking-wide leading-relaxed mb-8 max-w-[240px]">
                                    Biztonsági okokból a munkameneted lejárt. Kérlek, azonosítsd magad újra.
                                </p>

                                {/* Action Button */}
                                <button
                                    onClick={onLogin}
                                    className="
                                        group relative w-full h-12 
                                        bg-foreground text-background 
                                        font-mono uppercase tracking-[0.2em] text-xs font-bold
                                        flex items-center justify-center gap-3
                                        hover:translate-y-[-1px] active:translate-y-[1px]
                                        transition-all duration-200
                                        overflow-hidden
                                    "
                                >
                                    {/* Hover shine effect */}
                                    <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500 ease-in-out skew-x-[-20deg]" />

                                    <LogIn size={14} className="group-hover:scale-110 transition-transform duration-300" />
                                    <span>Bejelentkezés</span>
                                </button>

                                {/* Bottom decorative lines */}
                                <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-foreground/10 to-transparent" />
                            </div>

                            {/* Stripe decoration */}
                            <div className="h-1 w-full bg-foreground/5 bg-[linear-gradient(45deg,transparent_25%,rgba(0,0,0,0.1)_25%,rgba(0,0,0,0.1)_50%,transparent_50%,transparent_75%,rgba(0,0,0,0.1)_75%,rgba(0,0,0,0.1)_100%)] bg-[length:10px_10px] opacity-20" />
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
