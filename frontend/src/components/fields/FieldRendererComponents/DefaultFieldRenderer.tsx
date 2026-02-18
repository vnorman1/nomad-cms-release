import { ExternalLink } from 'lucide-react';
import { BaseFieldProps, Label, InputWrapper } from './types';

export default function DefaultFieldRenderer({ field, onChange, isDisabled, isReadOnly, safeValue, hasError }: BaseFieldProps) {
    const inputTypeMap: Record<string, string> = {
        'number': 'number',
        'date': 'date',
        'datetime': 'datetime-local',
        'color': 'color',
        'email': 'email',
        'url': 'url'
    };
    const inputType = inputTypeMap[field.type] || 'text';

    return (
        <InputWrapper className={`space-y-2 ${(isDisabled || isReadOnly) ? 'opacity-60' : ''}`}>
            <Label required={field.required}>{field.label}</Label>
            <div className="relative">
                <input
                    type={inputType}
                    value={safeValue}
                    disabled={isDisabled || isReadOnly}
                    onChange={(e) => {
                        const val = e.target.value;
                        onChange(field.type === 'number' ? (val === '' ? null : parseFloat(val)) : val);
                    }}
                    className={`w-full bg-transparent border-b py-2 focus:outline-none transition-all placeholder:text-muted-foreground/20 rounded-none tracking-tight disabled:cursor-not-allowed
                        ${hasError ? 'border-destructive border-b-2 animate-pulse' : 'border-border focus:border-foreground'}
                        ${field.type === 'color' ? 'h-10 cursor-pointer' : 'text-base md:text-xl font-light'}`}
                    placeholder={field.placeholder || "Adatbevitel..."}
                    min={field.validation?.min}
                    max={field.validation?.max}
                    maxLength={field.validation?.maxLength}
                    required={field.required}
                    readOnly={isReadOnly}
                />

                {field.type === 'url' && safeValue && (
                    <a href={safeValue as string} target="_blank" rel="noopener noreferrer" className="absolute right-0 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-100 z-10">
                        <ExternalLink size={14} />
                    </a>
                )}

                {field.validation && (
                    <div className="absolute right-0 top-0 -mt-6 text-[9px] font-mono opacity-30">
                        {field.validation.maxLength && `MAX: ${field.validation.maxLength}`}
                    </div>
                )}
            </div>
        </InputWrapper>
    );
}
