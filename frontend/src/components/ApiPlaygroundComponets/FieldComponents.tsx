// Clean UI components for API Playground - Vercel-inspired design

import { ChevronDown, Check } from 'lucide-react';
import { HttpMethod, METHOD_THEMES } from './types';
import { FieldConfig } from '@/config/admin.config';

// -----------------------------------------------------------------------------
// Method Badge - Clean, minimal design
// -----------------------------------------------------------------------------

interface MethodBadgeProps {
    method: HttpMethod;
    size?: 'sm' | 'md' | 'lg';
}

export function MethodBadge({ method, size = 'md' }: MethodBadgeProps) {
    const theme = METHOD_THEMES[method];
    const sizeClasses = {
        sm: 'px-1.5 py-0.5 text-[9px]',
        md: 'px-2 py-0.5 text-[10px]',
        lg: 'px-2.5 py-1 text-xs'
    };

    return (
        <span className={`font-mono font-bold rounded-md ${sizeClasses[size]} ${theme.text} ${theme.bg}`}>
            {method}
        </span>
    );
}

// -----------------------------------------------------------------------------
// Dynamic Field Input - Modern, clean inputs
// -----------------------------------------------------------------------------

interface DynamicFieldInputProps {
    field: FieldConfig;
    value: unknown;
    onChange: (value: unknown) => void;
}

export function DynamicFieldInput({ field, value, onChange }: DynamicFieldInputProps) {
    const baseInputClass = "w-full h-10 px-3 bg-muted/30 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring transition-all";

    if (field.hidden) return null;

    switch (field.type) {
        case 'boolean':
            return (
                <label className="flex items-center gap-3 cursor-pointer group">
                    <div
                        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${value
                                ? 'bg-foreground border-foreground'
                                : 'border-muted-foreground/30 group-hover:border-foreground/50'
                            }`}
                    >
                        {!!value && <Check size={12} className="text-background" />}
                    </div>
                    <input
                        type="checkbox"
                        checked={!!value}
                        onChange={(e) => onChange(e.target.checked)}
                        disabled={field.disabled}
                        className="hidden"
                    />
                    <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                        {field.label}
                    </span>
                </label>
            );

        case 'select':
            return (
                <div className="relative">
                    <select
                        value={value as string || ''}
                        onChange={(e) => onChange(e.target.value)}
                        disabled={field.disabled}
                        className={`${baseInputClass} appearance-none pr-10 cursor-pointer`}
                    >
                        <option value="">Select...</option>
                        {field.options?.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                    <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                </div>
            );

        case 'textarea':
        case 'richtext':
            return (
                <textarea
                    value={value as string || ''}
                    onChange={(e) => onChange(e.target.value)}
                    disabled={field.disabled}
                    placeholder={field.placeholder}
                    className="w-full h-24 px-3 py-2.5 bg-muted/30 rounded-lg text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                />
            );

        case 'number':
            return (
                <input
                    type="number"
                    value={value as number ?? ''}
                    onChange={(e) => onChange(Number(e.target.value))}
                    disabled={field.disabled}
                    placeholder={field.placeholder}
                    className={baseInputClass}
                />
            );

        default:
            return (
                <input
                    type={field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : 'text'}
                    value={value as string || ''}
                    onChange={(e) => onChange(e.target.value)}
                    disabled={field.disabled}
                    placeholder={field.placeholder}
                    className={baseInputClass}
                />
            );
    }
}
