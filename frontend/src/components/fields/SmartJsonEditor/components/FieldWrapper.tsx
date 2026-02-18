/**
 * FieldWrapper - Közös wrapper komponens a Smart JSON Editor mezőihez
 */

import React from 'react';

interface FieldWrapperProps {
    label: string;
    unit?: string;
    depth: number;
    children: React.ReactNode;
    className?: string;
}

export function FieldWrapper({ label, unit, depth, children, className = '' }: FieldWrapperProps) {
    // Ensure label is a string for rendering safety
    const safeLabel = typeof label === 'string' ? label : String(label ?? '');

    // Depth-aware font size
    const labelSize = depth <= 2 ? 'text-[10px]' : depth <= 4 ? 'text-[9px]' : 'text-[8px]';
    const unitSize = depth <= 2 ? 'text-[10px]' : 'text-[8px]';

    return (
        <div className={`group ${className}`}>
            <div className="flex items-center justify-between mb-1">
                <label className={`${labelSize} font-mono uppercase tracking-[0.15em] opacity-60`}>
                    {safeLabel}
                </label>
                {unit && (
                    <span className={`${unitSize} font-mono opacity-40`}>
                        {unit}
                    </span>
                )}
            </div>
            {children}
        </div>
    );
}
