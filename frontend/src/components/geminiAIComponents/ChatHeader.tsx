import { SmilePlus, Trash2, X } from 'lucide-react';

interface ChatHeaderProps {
    hasApiKey: boolean;
    onClearSession: () => void;
    onClose: () => void;
}

export const ChatHeader = ({ hasApiKey, onClearSession, onClose }: ChatHeaderProps) => (
    <div className="h-14 border-b border-border flex items-center justify-between px-4 bg-muted/20 shrink-0">
        <div className="flex items-center gap-3">
            <div className="p-1.5 bg-foreground/5 rounded-sm border border-border/50">
                <SmilePlus size={16} />
            </div>
            <div>
                <h3 className="text-xs font-bold uppercase tracking-widest text-foreground">Nomi</h3>
                <span className="flex items-center gap-1.5 text-[9px] font-mono text-muted-foreground">
                    {hasApiKey ? (
                        <>
                            <div className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse" />
                            ONLINE • Nomi
                        </>
                    ) : (
                        <>
                            <div className="w-1 h-1 bg-amber-500 rounded-full" />
                            API KULCS SZÜKSÉGES
                        </>
                    )}
                </span>
            </div>
        </div>
        <div className="flex items-center gap-1">
            {/* Clear Chat Button */}
            <button
                onClick={onClearSession}
                title="Chat előzmények törlése"
                className="p-2 hover:bg-muted/30 rounded-full transition-colors"
            >
                <Trash2 size={14} className="text-muted-foreground hover:text-destructive transition-colors" />
            </button>
            {/* Close Button */}
            <button
                onClick={onClose}
                className="p-2 hover:bg-muted/30 rounded-full transition-colors"
            >
                <X size={16} className="text-muted-foreground" />
            </button>
        </div>
    </div>
);
