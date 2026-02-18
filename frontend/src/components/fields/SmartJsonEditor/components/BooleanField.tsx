/**
 * BooleanField - Toggle switch a Smart JSON Editorhoz
 */

import { motion } from 'framer-motion';
import { FieldWrapper } from './FieldWrapper';

interface BooleanFieldProps {
    fieldKey: string;
    label: string;
    value: boolean;
    onChange: (value: boolean) => void;
    depth: number;
    disabled?: boolean;
}

export function BooleanField({ label, value, onChange, depth, disabled }: BooleanFieldProps) {
    const toggleSize = depth <= 2 ? 'h-5 w-9' : 'h-4 w-7';
    const thumbSize = depth <= 2 ? 'h-3.5 w-3.5' : 'h-2.5 w-2.5';
    const thumbMove = depth <= 2 ? 16 : 12;

    return (
        <FieldWrapper label={label} depth={depth}>
            <button
                onClick={() => !disabled && onChange(!value)}
                disabled={disabled}
                className={`
                    group flex items-center gap-3 focus:outline-none 
                    ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                `}
                role="switch"
                aria-checked={value}
            >
                <div className={`
                    relative ${toggleSize} rounded-full transition-colors duration-200 ease-in-out
                    border
                    ${value
                        ? 'bg-primary border-primary'
                        : 'bg-input border-transparent hover:bg-input/80'
                    }
                `}>
                    <motion.div
                        className={`${thumbSize} rounded-full absolute top-[2px] left-[2px] bg-background shadow-sm pointer-events-none`}
                        initial={false}
                        animate={{ x: value ? thumbMove : 0 }}
                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    />
                </div>
                <span className={`
                    text-xs font-medium tracking-wide transition-colors
                    ${value ? 'text-primary' : 'text-muted-foreground'}
                `}>
                    {value ? 'True' : 'False'}
                </span>
            </button>
        </FieldWrapper>
    );
}
