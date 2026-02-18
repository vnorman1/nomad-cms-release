import { X, Plus } from 'lucide-react';
import { BaseFieldProps, Label } from './types';

export default function MultiselectFieldRenderer({ field, onChange, isDisabled, isReadOnly, safeValue, hasError }: BaseFieldProps) {
    const items = Array.isArray(safeValue) ? safeValue : [];
    const options = field.options || [];

    const toggleItem = (itemValue: string) => {
        if (isDisabled || isReadOnly) return;
        if (items.includes(itemValue)) {
            onChange(items.filter((i: string) => i !== itemValue));
        } else {
            onChange([...items, itemValue]);
        }
    };

    return (
        <div className={`space-y-4 ${(isDisabled || isReadOnly) ? 'opacity-60 pointer-events-none' : ''} ${hasError ? 'border-b-2 border-destructive animate-pulse pb-2' : ''}`}>
            <div className="flex justify-between items-center mb-2">
                <Label required={field.required}>{field.label}</Label>
                <span className="text-[9px] font-mono opacity-40">[{items.length}]</span>
            </div>

            {field.type === 'multiselect' ? (
                <div className="flex flex-wrap gap-2 mb-4">
                    {options.map((opt) => (
                        <button
                            key={opt.value}
                            disabled={isDisabled || isReadOnly}
                            onClick={() => toggleItem(opt.value)}
                            className={`
                                px-3 py-1 text-[10px] uppercase tracking-widest border transition-all
                                ${items.includes(opt.value)
                                    ? 'bg-foreground text-background border-foreground'
                                    : 'bg-transparent text-foreground/50 border-border hover:border-foreground/50'}
                            `}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            ) : (
                <div className="space-y-2">
                    {items.map((item: string, idx: number) => (
                        <div key={idx} className="flex items-center gap-2 group">
                            <span className="text-[9px] font-mono opacity-30 w-4">{idx.toString().padStart(2, '0')}</span>
                            <input
                                type="text"
                                value={item}
                                disabled={isDisabled || isReadOnly}
                                onChange={(e) => {
                                    const newItems = [...items];
                                    newItems[idx] = e.target.value;
                                    onChange(newItems);
                                }}
                                className="flex-1 bg-transparent border-b border-border py-1 text-sm font-mono focus:outline-none focus:border-foreground transition-colors disabled:cursor-not-allowed"
                                placeholder="Adat megadása..."
                            />
                            <button
                                onClick={() => !(isDisabled || isReadOnly) && onChange(items.filter((_: any, i: number) => i !== idx))}
                                className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-destructive p-1"
                                disabled={isDisabled || isReadOnly}
                            >
                                <X size={12} />
                            </button>
                        </div>
                    ))}
                    <button
                        disabled={isDisabled || isReadOnly}
                        onClick={() => onChange([...items, ""])}
                        className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest opacity-50 hover:opacity-100 mt-2 disabled:opacity-20"
                    >
                        <Plus size={10} /> Új Bejegyzés
                    </button>
                </div>
            )}
        </div>
    );
}
