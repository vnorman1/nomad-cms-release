/**
 * NumberField - Number input a Smart JSON Editorhoz
 */

import { FieldWrapper } from './FieldWrapper';

interface NumberFieldProps {
    fieldKey: string;
    label: string;
    value: number | null;
    onChange: (value: number | null) => void;
    unit?: string;
    depth: number;
    disabled?: boolean;
}

export function NumberField({ label, value, onChange, unit, depth, disabled }: NumberFieldProps) {
    const fontSize = depth <= 2 ? 'text-sm' : 'text-xs';
    const padding = depth <= 2 ? 'px-3 py-2' : 'px-2.5 py-1.5';

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        if (val === '' || val === '-') {
            onChange(null);
        } else {
            const num = parseFloat(val);
            if (!isNaN(num)) {
                onChange(num);
            }
        }
    };

    return (
        <FieldWrapper label={label} unit={unit} depth={depth}>
            <div className="relative flex items-center group">
                <input
                    type="number"
                    value={value ?? ''}
                    onChange={handleChange}
                    disabled={disabled}
                    className={`
                        w-full bg-background border border-input rounded-md ${padding} ${fontSize} font-mono
                        ring-offset-background placeholder:text-muted-foreground/40
                        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 
                        disabled:cursor-not-allowed disabled:opacity-50
                        transition-all duration-200
                        ${unit ? 'pr-10' : ''}
                        [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none
                    `}
                    placeholder="—"
                />
                {unit && (
                    <div className="absolute right-0 top-0 bottom-0 flex items-center pr-3 pointer-events-none">
                        <span className="text-xs font-medium text-muted-foreground/60 bg-accent/30 px-1.5 py-0.5 rounded-sm">
                            {unit}
                        </span>
                    </div>
                )}
            </div>
        </FieldWrapper>
    );
}
