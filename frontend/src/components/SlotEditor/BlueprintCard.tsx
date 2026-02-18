/**
 * BlueprintCard - Item Card Component
 * Kártya komponens a lista elemek megjelenítéséhez
 */

import { CheckSquare, Square, Copy, Edit3, Trash2 } from 'lucide-react';
import type { BlueprintCardProps } from './types';
import { FALLBACK_IMAGE, PLACEHOLDER_IMAGE } from '@/utils/fallbackImages';

export function BlueprintCard({
    item,
    index,
    config,
    onEdit,
    onDelete,
    onDuplicate,
    disabled,
    selected,
    onToggleSelect,
    publishedField: _publishedField
}: BlueprintCardProps) {
    const imageField = config.fields.find(f => f.type === 'image')?.id;
    const titleField = config.fields.find(f => f.id === 'title' || f.id === 'name' || f.type === 'text')?.id;

    const image = imageField ? item[imageField] : (item.thumbnail || item.image);
    const title = titleField ? item[titleField] : `Elem #${index + 1}`;

    const displayTitle = typeof title === 'string' || typeof title === 'number' ? String(title) : 'Névtelen';

    return (
        <div className={`
            group relative h-[320px] bg-background border transition-all duration-300 
            ${disabled ? 'opacity-50 pointer-events-none' : ''} 
            ${selected ? 'border-blue-500 ring-2 ring-blue-500/30' : 'border-border hover:border-foreground'}
        `}>
            {/* Selection Checkbox */}
            {onToggleSelect && (
                <button
                    onClick={(e) => { e.stopPropagation(); onToggleSelect(index); }}
                    className="absolute top-3 left-3 z-20 p-1 bg-background/80 backdrop-blur border border-border hover:border-foreground transition-colors"
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    {selected
                        ? <CheckSquare size={16} className="text-blue-500" />
                        : <Square size={16} className="text-muted-foreground" />
                    }
                </button>
            )}

            {/* Header with Index and Actions */}
            <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start z-10 pointer-events-none">
                <span className="text-[9px] font-mono uppercase tracking-widest opacity-60 bg-background/50 backdrop-blur px-1 ml-8">
                    IDX_{index.toString().padStart(3, '0')}
                </span>
                <div
                    className="flex gap-2 pointer-events-auto opacity-0 group-hover:opacity-100 transition-opacity"
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    {onDuplicate && (
                        <button
                            disabled={disabled}
                            onClick={() => onDuplicate(index)}
                            className="p-1.5 bg-background border border-foreground hover:bg-blue-500 hover:border-blue-500 hover:text-white transition-colors cursor-pointer"
                            title="Duplikálás"
                        >
                            <Copy size={12} />
                        </button>
                    )}
                    <button
                        disabled={disabled}
                        onClick={() => onEdit(index)}
                        className="p-1.5 bg-background border border-foreground hover:bg-foreground hover:text-background transition-colors cursor-pointer"
                    >
                        <Edit3 size={12} />
                    </button>
                    <button
                        disabled={disabled}
                        onClick={() => onDelete(index)}
                        className="p-1.5 bg-background border border-foreground hover:bg-destructive hover:border-destructive hover:text-destructive-foreground transition-colors cursor-pointer"
                    >
                        <Trash2 size={12} />
                    </button>
                </div>
            </div>

            <div className="h-full flex flex-col">
                {/* Image Area */}
                <div className="h-2/3 w-full relative overflow-hidden bg-secondary/10 border-b border-border">
                    {image ? (
                        <img
                            src={image as string}
                            className="w-full h-full object-cover transition-all duration-700 pointer-events-none"
                            alt={displayTitle}
                            onError={(e) => {
                                (e.target as HTMLImageElement).src = FALLBACK_IMAGE;
                            }}
                        />
                    ) : (
                        <img
                            src={PLACEHOLDER_IMAGE}
                            className="w-full h-full object-cover opacity-50"
                            alt="Nincs kép"
                        />
                    )}
                </div>

                {/* Title and Tags */}
                <div className="flex-1 p-4 flex flex-col justify-center bg-background select-none">
                    <h4 className="text-lg font-light tracking-tight truncate pr-4" title={displayTitle}>
                        {displayTitle}
                    </h4>
                    <div className="flex gap-2 mt-2 flex-wrap">
                        {config.fields.map((f) => {
                            if (f.type === 'boolean' && item[f.id]) {
                                return (
                                    <span
                                        key={f.id}
                                        className="text-[9px] border border-foreground/20 px-1 uppercase tracking-widest"
                                    >
                                        {f.label}
                                    </span>
                                );
                            }
                            return null;
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
