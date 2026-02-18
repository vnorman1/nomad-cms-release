import { FileJson, CheckCircle2, Wand2 } from 'lucide-react';
import type { FormContext } from './types';

interface ActionCardProps {
    generatedData: Record<string, unknown> | Record<string, unknown>[];
    formContext: FormContext;
    onFillForm: (data: unknown) => void;
}

// Helper: format value for display
const formatValue = (value: unknown): string => {
    if (value === undefined || value === null) return '-';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return `[${value.length} elem]`;
    if (typeof value === 'object') return JSON.stringify(value).slice(0, 50);
    return String(value);
};

// Helper: truncate string
const truncate = (str: string, max: number): string =>
    str.length > max ? str.slice(0, max) + '...' : str;

export const ActionCard = ({ generatedData, formContext, onFillForm }: ActionCardProps) => {
    // Get entries from generated data (not from form fields!)
    const entries = Object.entries(generatedData);
    const fieldCount = entries.length;

    // Find label for field id from config
    const getFieldLabel = (id: string): string => {
        const field = formContext.config.fields.find(f => f.id === id);
        return field?.label || id;
    };

    return (
        <div className="mt-2 w-full border border-border bg-background rounded-lg overflow-hidden max-w-[90%]">
            <div className="bg-muted/30 px-3 py-2 border-b border-border flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
                    <FileJson size={12} />
                    Generált Tartalom
                </span>
                <span className="text-[9px] font-mono text-muted-foreground">
                    {fieldCount} MEZŐ
                </span>
            </div>
            <div className="p-3">
                <div className="space-y-2 mb-4">
                    {entries.slice(0, 4).map(([key, value]) => {
                        const displayValue = formatValue(value);
                        const truncatedValue = truncate(displayValue, 35);
                        const label = getFieldLabel(key);

                        return (
                            <div key={key} className="flex items-start gap-2 text-[10px] bg-muted/20 border border-border p-1.5 rounded-sm">
                                <CheckCircle2 size={10} className="text-emerald-500 shrink-0 mt-0.5" />
                                <div className="flex-1 min-w-0">
                                    <span className="font-mono text-muted-foreground text-[9px]">{label}</span>
                                    <p className="font-medium text-foreground truncate" title={displayValue}>
                                        {truncatedValue}
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                    {fieldCount > 4 && (
                        <div className="text-[9px] text-center text-muted-foreground italic">
                            + {fieldCount - 4} további mező
                        </div>
                    )}
                </div>

                <button
                    onClick={() => onFillForm(generatedData)}
                    className="w-full py-2 bg-foreground text-background text-[10px] font-bold uppercase tracking-widest hover:opacity-90 transition-all flex items-center justify-center gap-2"
                >
                    <Wand2 size={12} />
                    Űrlap Kitöltése
                </button>
            </div>
        </div>
    );
};
