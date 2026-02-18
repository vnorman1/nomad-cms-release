/**
 * NullField - Null érték placeholder a Smart JSON Editorhoz
 */

import { useState } from 'react';
import { FieldWrapper } from './FieldWrapper';

interface NullFieldProps {
    fieldKey: string;
    label: string;
    onChange: (value: string | number | boolean) => void;
    depth: number;
    disabled?: boolean;
}

export function NullField({ label, onChange, depth, disabled }: NullFieldProps) {
    const [showMenu, setShowMenu] = useState(false);

    // Using a more unified font size
    const fontSize = depth <= 2 ? 'text-xs' : 'text-[10px]';

    const handleTypeSelect = (type: 'string' | 'number' | 'boolean') => {
        setShowMenu(false);
        switch (type) {
            case 'string':
                onChange('');
                break;
            case 'number':
                onChange(0);
                break;
            case 'boolean':
                onChange(false);
                break;
        }
    };

    return (
        <FieldWrapper label={label} depth={depth}>
            <div className="relative group">
                <button
                    onClick={() => !disabled && setShowMenu(!showMenu)}
                    disabled={disabled}
                    className={`
                        w-full flex items-center justify-between
                        bg-muted/30 border border-dashed border-border 
                        ${fontSize} px-3 py-2 rounded-md
                        text-muted-foreground/60 font-medium
                        hover:border-primary/40 hover:text-primary/80 hover:bg-primary/5
                        focus:outline-none transition-all duration-200
                        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                    `}
                >
                    <span className="italic">null</span>
                    <span className="text-[10px] uppercase tracking-wider font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                        Define Value
                    </span>
                </button>

                {showMenu && (
                    <>
                        <div
                            className="fixed inset-0 z-10"
                            onClick={() => setShowMenu(false)}
                        />
                        <div className="absolute top-full left-0 mt-1 z-20 w-32 bg-popover border border-border rounded-md shadow-md overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                            <div className="px-2 py-1.5 text-[10px] uppercase font-semibold text-muted-foreground bg-accent/20 border-b border-border/50">
                                Select Type
                            </div>
                            <button
                                onClick={() => handleTypeSelect('string')}
                                className="block w-full px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground transition-colors"
                            >
                                Text
                            </button>
                            <button
                                onClick={() => handleTypeSelect('number')}
                                className="block w-full px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground transition-colors"
                            >
                                Number
                            </button>
                            <button
                                onClick={() => handleTypeSelect('boolean')}
                                className="block w-full px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground transition-colors"
                            >
                                Boolean
                            </button>
                        </div>
                    </>
                )}
            </div>
        </FieldWrapper>
    );
}
