import { motion } from 'framer-motion';

export const TypingIndicator = () => (
    <div className="flex items-center gap-1 p-2">
        <motion.div
            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
            className="w-1.5 h-1.5 bg-foreground rounded-full"
        />
        <motion.div
            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
            className="w-1.5 h-1.5 bg-foreground rounded-full"
        />
        <motion.div
            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
            className="w-1.5 h-1.5 bg-foreground rounded-full"
        />
    </div>
);
