import { motion } from 'framer-motion';

interface TechToggleProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
    label?: string;
    description?: string;
    className?: string;
}

export function TechToggle({ checked, onChange, disabled = false, label, description, className = '' }: TechToggleProps) {
    return (
        <button
            onClick={() => !disabled && onChange(!checked)}
            disabled={disabled}
            className={`group flex items-center gap-3 text-left focus:outline-none ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${className}`}
            role="switch"
            aria-checked={checked}
        >
            {/* Toggle Track */}
            <div className={`
                relative h-5 w-9 flex-shrink-0 border transition-colors duration-200 ease-in-out
                ${checked
                    ? 'bg-foreground border-foreground'
                    : 'bg-transparent border-input hover:border-foreground/50'
                }
            `}>
                {/* Square Thumb */}
                <motion.div
                    className={`h-3 w-3 shadow-sm absolute top-0.5 left-0.5 pointer-events-none transition-colors duration-200 ${checked ? 'bg-background' : 'bg-foreground/50'}`}
                    initial={false}
                    animate={{
                        x: checked ? 18 : 0
                    }}
                    transition={{
                        type: "spring",
                        stiffness: 600,
                        damping: 35,
                        mass: 0.8
                    }}
                />
            </div>

            {/* Label Content */}
            {(label || description) && (
                <div className="flex flex-col select-none">
                    {label && (
                        <span className={`text-[10px] font-mono uppercase tracking-widest transition-colors ${checked ? 'text-foreground' : 'text-foreground/60'}`}>
                            {label}
                        </span>
                    )}
                    {description && (
                        <span className="text-[10px] opacity-40 font-mono hidden sm:inline-block">
                            {description}
                        </span>
                    )}
                </div>
            )}
        </button>
    );
}
