import { Database, FormInput } from 'lucide-react';
import { ADMIN_CONFIG } from '@/config/admin.config';
import type { FormContext } from './types';

interface SchemaViewerProps {
    formContext?: FormContext;
}

export const SchemaViewer = ({ formContext }: SchemaViewerProps) => (
    <div className="mb-4 pt-2 pb-1 border-b border-border/30">
        <div className="flex items-center gap-1.5 mb-2 opacity-60">
            <Database size={10} className="text-muted-foreground" />
            <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
                {formContext ? 'Active Form Context' : 'Available Schemas'}
            </span>
        </div>
        {formContext ? (
            <div className="flex items-center gap-2">
                <FormInput size={12} className="text-emerald-500" />
                <span className="text-[10px] font-mono text-foreground">{formContext.config.label}</span>
                <span className="text-[9px] text-muted-foreground">({formContext.slotKey})</span>
            </div>
        ) : (
            <div className="flex flex-wrap gap-1">
                {Object.keys(ADMIN_CONFIG).slice(0, 6).map(key => (
                    <span key={key} className="px-1 py-0.5 rounded-[2px] bg-muted/20 text-[8px] font-mono text-muted-foreground uppercase leading-none">
                        {key}
                    </span>
                ))}
                {Object.keys(ADMIN_CONFIG).length > 6 && (
                    <span className="px-1 py-0.5 text-[8px] font-mono text-muted-foreground opacity-50">+ {Object.keys(ADMIN_CONFIG).length - 6}</span>
                )}
            </div>
        )}
    </div>
);
