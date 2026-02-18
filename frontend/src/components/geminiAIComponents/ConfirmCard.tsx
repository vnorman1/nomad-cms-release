import { Plus, X, Loader2, Trash2, AlertTriangle } from 'lucide-react';
import type { PendingAction } from '@/context/AiContext';

interface ConfirmCardProps {
    pendingAction: PendingAction;
    onConfirm: (action: PendingAction) => void;
    onCancel: () => void;
    isNavigating: boolean;
}

export const ConfirmCard = ({ pendingAction, onConfirm, onCancel, isNavigating }: ConfirmCardProps) => {
    const isDelete = pendingAction.type === 'delete_item' || pendingAction.type === 'bulk_delete';
    const isBulkDelete = pendingAction.type === 'bulk_delete';

    return (
        <div className={`mt-2 w-full border rounded-lg overflow-hidden max-w-[90%] ${isDelete
                ? 'border-red-500/30 bg-red-500/5'
                : 'border-emerald-500/30 bg-emerald-500/5'
            }`}>
            <div className={`px-3 py-2 border-b flex items-center justify-between ${isDelete
                    ? 'bg-red-500/10 border-red-500/20'
                    : 'bg-emerald-500/10 border-emerald-500/20'
                }`}>
                <span className={`text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 ${isDelete ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
                    }`}>
                    {isDelete ? (
                        <>
                            <AlertTriangle size={12} />
                            {isBulkDelete ? 'Tömeges törlés' : 'Törlés megerősítése'}
                        </>
                    ) : (
                        <>
                            <Plus size={12} />
                            Új elem létrehozása
                        </>
                    )}
                </span>
                <span className={`text-[9px] font-mono ${isDelete ? 'text-red-600/70 dark:text-red-400/70' : 'text-emerald-600/70 dark:text-emerald-400/70'
                    }`}>
                    {pendingAction.slotLabel}
                </span>
            </div>
            <div className="p-3 flex gap-2">
                <button
                    onClick={() => onConfirm(pendingAction)}
                    disabled={isNavigating}
                    className={`flex-1 py-2 text-white text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 rounded ${isNavigating
                            ? 'opacity-50 cursor-not-allowed'
                            : ''
                        } ${isDelete
                            ? 'bg-red-500 hover:bg-red-600'
                            : 'bg-emerald-500 hover:bg-emerald-600'
                        }`}
                >
                    {isNavigating ? (
                        <>
                            <Loader2 size={12} className="animate-spin" />
                            Folyamatban...
                        </>
                    ) : isDelete ? (
                        <>
                            <Trash2 size={12} />
                            Igen, törlöm
                        </>
                    ) : (
                        <>
                            <Plus size={12} />
                            Igen, létrehozom
                        </>
                    )}
                </button>
                <button
                    onClick={onCancel}
                    className="px-3 py-2 bg-muted text-foreground text-[10px] font-bold uppercase tracking-widest hover:bg-muted/80 transition-all flex items-center justify-center gap-2 rounded"
                >
                    <X size={12} />
                    Mégse
                </button>
            </div>
        </div>
    );
};
