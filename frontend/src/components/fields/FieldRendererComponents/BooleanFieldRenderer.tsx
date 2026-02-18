import { BaseFieldProps, InputWrapper } from './types';

export default function BooleanFieldRenderer({ field, value, onChange, isDisabled, isReadOnly }: BaseFieldProps) {
    const boolValue = Boolean(value);

    return (
        <InputWrapper className="flex items-center justify-between py-4 border-b border-border">
            <span className="text-sm font-medium tracking-tight uppercase">{field.label}</span>
            <button
                disabled={isDisabled || isReadOnly}
                onClick={() => onChange(!boolValue)}
                className={`flex items-center gap-0 border border-border transition-opacity ${(isDisabled || isReadOnly) ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
                <span className={`px-3 py-1 text-[10px] font-mono transition-colors ${boolValue ? 'bg-foreground text-background' : 'bg-transparent text-foreground/40'}`}>
                    IGEN
                </span>
                <span className={`px-3 py-1 text-[10px] font-mono transition-colors ${!boolValue ? 'bg-secondary text-foreground' : 'bg-transparent text-foreground/40'}`}>
                    NEM
                </span>
            </button>
        </InputWrapper>
    );
}
