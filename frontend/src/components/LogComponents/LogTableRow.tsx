import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { LogEntry } from '@/api/logs';
import { LEVEL_CONFIG } from './constants';

interface LogTableRowProps {
    log: LogEntry;
    index: number;
    isSelected: boolean;
    onSelect: () => void;
}

export function LogTableRow({ log, index, isSelected, onSelect }: LogTableRowProps) {
    const levelCfg = LEVEL_CONFIG[log.level as keyof typeof LEVEL_CONFIG] || LEVEL_CONFIG.INFO;
    const Icon = levelCfg.icon;

    // Parse to get short message (without JSON)
    const jsonMatch = log.message.match(/\{.*\}$/s);
    const shortMessage = jsonMatch ? log.message.replace(jsonMatch[0], '').trim() : log.message;

    return (
        <motion.tr
            key={`${log.timestamp}-${index}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ delay: Math.min(index * 0.02, 0.3) }}
            onClick={onSelect}
            className={cn(
                "group border-b border-border/30 transition-colors cursor-pointer",
                isSelected ? "bg-primary/5" : "hover:bg-muted/20"
            )}
        >
            <td className="px-4 py-3 align-middle">
                <span className="font-mono text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                    {log.timestamp}
                </span>
            </td>
            <td className="px-4 py-3 align-middle text-center">
                <span className={cn(
                    "inline-flex items-center gap-1.5 px-2 py-1 text-xs font-mono uppercase tracking-wider rounded border",
                    levelCfg.color, levelCfg.bg, levelCfg.border
                )}>
                    <Icon size={10} />
                    {log.level}
                </span>
            </td>
            <td className="px-4 py-3 align-middle">
                <span className="text-sm text-foreground/90 font-mono truncate block max-w-xl">
                    {shortMessage || log.message.substring(0, 100)}
                </span>
            </td>
        </motion.tr>
    );
}
