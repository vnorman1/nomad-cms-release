import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, Copy, Eye, EyeOff, X, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BulkActionsBarProps {
    selectedCount: number;
    isSaving: boolean;
    onClear: () => void;
    onPublish: () => void;
    onUnpublish: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
    hasPublishing: boolean;
}

export function BulkActionsBar({
    selectedCount,
    isSaving,
    onClear,
    onPublish,
    onUnpublish,
    onDuplicate,
    onDelete,
    hasPublishing
}: BulkActionsBarProps) {
    return (
        <AnimatePresence>
            {selectedCount > 0 && (
                <motion.div
                    initial={{ y: 100, opacity: 0, x: '-50%' }}
                    animate={{ y: 0, opacity: 1, x: '-50%' }}
                    exit={{ y: 100, opacity: 0, x: '-50%' }}
                    transition={{
                        type: "spring",
                        stiffness: 300,
                        damping: 25,
                        mass: 0.8
                    }}
                    className="hidden md:block fixed bottom-10 left-1/2 z-[60] pointer-events-auto"
                >
                    {/* Main Architectural Container - Matching EditorToolbar Style */}
                    <div className="flex items-stretch bg-background/95 backdrop-blur-md border border-border shadow-2xl overflow-hidden">

                        {/* LEFT SECTION: Context */}
                        <div className="flex items-center gap-4 pl-4 pr-4 py-3 border-r border-border bg-secondary/5">
                            <div className="flex items-center gap-2 text-foreground">
                                <Layers size={14} className="opacity-50" />
                                <span className="font-mono text-sm font-bold">
                                    {selectedCount}
                                </span>
                                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest leading-none ml-1">
                                    KIVÁLASZTVA
                                </span>
                            </div>

                            <button
                                onClick={onClear}
                                className="group/close p-1.5 hover:bg-secondary rounded-sm transition-colors border border-transparent hover:border-border"
                                title="Kijelölés megszűntetése (ESC)"
                            >
                                <X size={14} className="text-muted-foreground group-hover/close:text-foreground transition-colors" />
                            </button>
                        </div>

                        {/* RIGHT SECTION: Actions */}
                        <div className="flex items-center p-2 gap-2">
                            {hasPublishing && (
                                <div className="flex items-center gap-2 mr-2">
                                    <ActionButton
                                        onClick={onPublish}
                                        disabled={isSaving}
                                        icon={<Eye size={14} />}
                                        label="PUBLIKÁLÁS"
                                        shortcut="P"
                                    />
                                    <ActionButton
                                        onClick={onUnpublish}
                                        disabled={isSaving}
                                        icon={<EyeOff size={14} />}
                                        label="VÁZLAT"
                                        shortcut="U"
                                    />
                                    {/* Vertical Separator */}
                                    <div className="w-px h-6 bg-border mx-1" />
                                </div>
                            )}

                            <ActionButton
                                onClick={onDuplicate}
                                disabled={isSaving}
                                icon={<Copy size={14} />}
                                label="MÁSOLÁS"
                                shortcut="D"
                            />

                            <div className="w-px h-6 bg-border mx-1" />

                            <ActionButton
                                onClick={onDelete}
                                disabled={isSaving}
                                isDestructive
                                icon={<Trash2 size={14} />}
                                label="TÖRLÉS"
                                shortcut="DEL"
                            />
                        </div>

                        {/* Loading Overlay */}
                        {isSaving && (
                            <div className="absolute inset-0 bg-background/80 backdrop-blur-[2px] flex items-center justify-center z-20 cursor-wait">
                                <div className="w-4 h-4 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
                            </div>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

// ----------------------------------------------------------------------
// Sub-components
// ----------------------------------------------------------------------

interface ActionButtonProps {
    onClick: () => void;
    disabled: boolean;
    icon: React.ReactNode;
    label: string;
    isDestructive?: boolean;
    shortcut?: string;
}

function ActionButton({
    onClick,
    disabled,
    icon,
    label,
    isDestructive = false
}: ActionButtonProps) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-sm transition-all duration-200 border border-transparent outline-none group",
                disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer",

                // Default Style (System Button)
                !disabled && !isDestructive && "hover:bg-secondary hover:border-border hover:shadow-sm text-muted-foreground hover:text-foreground",

                // Destructive Style
                !disabled && isDestructive && "hover:bg-destructive/10 hover:border-destructive/20 hover:text-destructive text-muted-foreground",
            )}
        >
            <span className={cn(
                "transition-colors",
                isDestructive ? "group-hover:text-destructive" : "group-hover:text-foreground"
            )}>
                {icon}
            </span>
            <span className="text-[10px] font-mono uppercase tracking-widest font-medium">
                {label}
            </span>
        </button>
    );
}
