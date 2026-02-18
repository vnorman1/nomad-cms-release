import { motion } from 'framer-motion';
// NOMAD STYLE APPLIED
import { Sparkles } from 'lucide-react';
import type { FormContext } from './types';

interface ChatToggleButtonProps {
    formContext?: FormContext;
    onClick: () => void;
}

export const ChatToggleButton = ({ formContext, onClick }: ChatToggleButtonProps) => (
    <motion.button
        key="toggle-button"
        initial={{ opacity: 0, scale: 0.9, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 10 }}
        transition={{ duration: 0.2, ease: "easeInOut" }}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={onClick}
        className="group flex items-center gap-3 pl-3 pr-4 py-2.5 bg-background/80 backdrop-blur-md border border-border/50 hover:border-foreground/50 hover:bg-background/90 transition-all z-50 shadow-2xl"
    >
        <div className="w-5 h-5 bg-foreground text-background flex items-center justify-center rounded-sm">
            <Sparkles size={10} />
        </div>
        <div className="flex flex-col items-start gap-0.5">
            <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] leading-none">
                Nomi AI
            </span>
            <span className="text-[8px] font-mono text-muted-foreground uppercase tracking-widest leading-none opacity-60 group-hover:opacity-100 transition-opacity">
                Assistant
            </span>
        </div>

        {formContext && (
            <div className="ml-2 w-1.5 h-1.5 bg-emerald-500 rounded-sm animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" title="Context Active" />
        )}
    </motion.button>
);
