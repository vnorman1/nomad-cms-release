import { BaseFieldProps, Label, InputWrapper } from './types';

export default function TextareaFieldRenderer({ field, onChange, isDisabled, isReadOnly, safeValue, hasError }: BaseFieldProps) {
    const displayValue = field.type === 'json' && typeof safeValue === 'object'
        ? JSON.stringify(safeValue, null, 2)
        : String(safeValue);

    return (
        <InputWrapper className="space-y-2">
            <Label required={field.required}>{field.label}</Label>
            <textarea
                disabled={isDisabled || isReadOnly}
                value={displayValue}
                onChange={(e) => {
                    try {
                        const val = e.target.value;
                        onChange(field.type === 'json' ? JSON.parse(val) : val);
                    } catch (err) {
                        if (field.type !== 'json') onChange(e.target.value);
                    }
                }}
                className={`w-full min-h-[120px] bg-secondary/5 border p-4 text-sm font-mono focus:outline-none transition-all resize-y placeholder:text-muted-foreground/30 rounded-none leading-relaxed
                    ${hasError ? 'border-destructive border-2 animate-pulse' : 'border-border focus:border-foreground'}
                    ${(isDisabled || isReadOnly) ? 'opacity-50 cursor-not-allowed bg-secondary/10' : ''}`}
                placeholder={`// Írjon be ${field.label.toLowerCase()} tartalmat...`}
                readOnly={isReadOnly}
            />
            {field.type === 'json' && <div className="text-[9px] font-mono opacity-40 text-right">JSON FORMATUM KÖTELEZŐ</div>}
        </InputWrapper>
    );
}
