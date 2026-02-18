/**
 * ToolbarButton - Reusable Toolbar Button Component
 * Toolbar gomb komponens a slot editor felső sávjához
 */

interface ToolbarBtnProps {
    active?: boolean;
    children: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
    className?: string;
}

export function ToolbarBtn({ active, children, onClick, disabled, className = '' }: ToolbarBtnProps) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`
                h-9 px-3 flex items-center justify-center border transition-all uppercase tracking-widest text-[10px] font-mono
                ${active
                    ? 'bg-foreground text-background border-foreground'
                    : 'bg-transparent text-foreground/60 border-transparent hover:border-foreground/30 hover:text-foreground'}
                ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
                ${className}
            `}
        >
            {children}
        </button>
    );
}
