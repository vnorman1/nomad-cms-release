import { Command } from 'lucide-react';
import { BaseFieldProps, Label, InputWrapper } from './types';

export default function SelectFieldRenderer({ field, onChange, isDisabled, isReadOnly, safeValue, hasError }: BaseFieldProps) {
    return (
        <InputWrapper className={`space-y-2 ${(isDisabled || isReadOnly) ? 'opacity-60' : ''}`}>
            <Label required={field.required}>{field.label}</Label>
            <div className="relative">
                <select
                    value={String(safeValue)}
                    onChange={(e) => onChange(e.target.value)}
                    disabled={isDisabled || isReadOnly}
                    className={`w-full appearance-none bg-transparent border-b py-2 pr-8 text-sm font-mono uppercase tracking-widest focus:outline-none rounded-none cursor-pointer disabled:cursor-not-allowed
                        ${hasError ? 'border-destructive border-b-2 animate-pulse' : 'border-border focus:border-foreground'}`}
                >
                    <option value="">// VÁLASSZON</option>
                    {field.options?.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                </select>
                <div className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none opacity-50">
                    <Command size={12} />
                </div>
            </div>
        </InputWrapper>
    );
}
