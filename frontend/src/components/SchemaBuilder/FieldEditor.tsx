/**
 * FieldEditor Component
 * 
 * Comprehensive field configuration editor with all options.
 */

import { motion } from 'framer-motion';
import { useState } from 'react';
import {
    Trash2,
    ChevronDown,
    ChevronUp,
    GripVertical,
    Lock,
    Plus,
    X,
    HelpCircle,
} from 'lucide-react';
import { FieldTypeSelector, TypeBadge } from './FieldTypeSelector';
import { BuilderFieldConfig, FIELD_TYPES } from './types';
import type { FieldType } from '@/config/admin.config';

interface FieldEditorProps {
    field: BuilderFieldConfig;
    index: number;
    onChange: (updates: Partial<BuilderFieldConfig>) => void;
    onRemove: () => void;
    onMoveUp?: () => void;
    onMoveDown?: () => void;
    isFirst?: boolean;
    isLast?: boolean;
    availableFields?: BuilderFieldConfig[];  // For slug source dropdown
}

export function FieldEditor({
    field,
    index,
    onChange,
    onRemove,
    onMoveUp,
    onMoveDown,
    isFirst,
    isLast,
    availableFields = [],
}: FieldEditorProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const typeInfo = FIELD_TYPES.find(t => t.type === field.type);

    const handleTypeChange = (type: FieldType) => {
        const updates: Partial<BuilderFieldConfig> = { type };
        // Clear type-specific fields when changing type
        if (!FIELD_TYPES.find(t => t.type === type)?.hasOptions) {
            updates.options = undefined;
        }
        if (!FIELD_TYPES.find(t => t.type === type)?.hasFileConfig) {
            updates.fileConfig = undefined;
        }
        if (!FIELD_TYPES.find(t => t.type === type)?.hasSlugSource) {
            updates.slugSource = undefined;
        }
        onChange(updates);
    };

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`
                border transition-all
                ${isExpanded ? 'border-foreground bg-foreground/5' : 'border-border hover:border-foreground/30'}
            `}
        >
            {/* Collapsed Header */}
            <div
                className="flex items-center gap-3 p-3 cursor-pointer"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                {/* Drag Handle */}
                <div className="cursor-grab opacity-30 hover:opacity-100">
                    <GripVertical size={14} />
                </div>

                {/* Index */}
                <span className="font-mono text-[9px] opacity-40 w-5">
                    {(index + 1).toString().padStart(2, '0')}
                </span>

                {/* Required indicator */}
                <div className={`w-1.5 h-1.5 rounded-full ${field.required ? 'bg-foreground' : 'border border-foreground/30'}`} />

                {/* Field info */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-medium truncate">{field.id}</span>
                        {field.fileConfig?.secure && (
                            <Lock size={10} className="text-amber-500" />
                        )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                        <TypeBadge type={field.type} compact />
                        {field.label !== field.id && (
                            <span className="text-[9px] opacity-40 truncate">— {field.label}</span>
                        )}
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                    <button
                        onClick={(e) => { e.stopPropagation(); onMoveUp?.(); }}
                        disabled={isFirst}
                        className="p-1 opacity-30 hover:opacity-100 disabled:opacity-10 transition-opacity"
                    >
                        <ChevronUp size={12} />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onMoveDown?.(); }}
                        disabled={isLast}
                        className="p-1 opacity-30 hover:opacity-100 disabled:opacity-10 transition-opacity"
                    >
                        <ChevronDown size={12} />
                    </button>
                </div>

                {/* Expand icon */}
                <motion.div animate={{ rotate: isExpanded ? 180 : 0 }}>
                    <ChevronDown size={14} className="opacity-40" />
                </motion.div>
            </div>

            {/* Expanded Content */}
            {isExpanded && (
                <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-t border-border/50"
                >
                    <div className="p-4 space-y-4">
                        {/* Row 1: ID & Label */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-[9px] font-mono uppercase tracking-widest opacity-50 block mb-1">
                                    Azonosító (ID)
                                </label>
                                <input
                                    type="text"
                                    value={field.id}
                                    onChange={(e) => onChange({ id: e.target.value.replace(/\s/g, '_').toLowerCase() })}
                                    className="w-full px-3 py-2 bg-background border border-border text-sm font-mono focus:border-foreground outline-none"
                                    placeholder="field_id"
                                />
                            </div>
                            <div>
                                <label className="text-[9px] font-mono uppercase tracking-widest opacity-50 block mb-1">
                                    Megjelenített név
                                </label>
                                <input
                                    type="text"
                                    value={field.label}
                                    onChange={(e) => onChange({ label: e.target.value })}
                                    className="w-full px-3 py-2 bg-background border border-border text-sm focus:border-foreground outline-none"
                                    placeholder="Mező címke"
                                />
                            </div>
                        </div>

                        {/* Row 2: Type & Required */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-[9px] font-mono uppercase tracking-widest opacity-50 block mb-1">
                                    Típus
                                </label>
                                <FieldTypeSelector
                                    value={field.type}
                                    onChange={handleTypeChange}
                                />
                            </div>
                            <div className="flex items-end gap-4">
                                <label className="flex items-center gap-2 cursor-pointer group">
                                    <input
                                        type="checkbox"
                                        checked={field.required || false}
                                        onChange={(e) => onChange({ required: e.target.checked })}
                                        className="sr-only"
                                    />
                                    <div className={`
                                        w-8 h-4 rounded-full transition-colors relative
                                        ${field.required ? 'bg-foreground' : 'bg-border'}
                                    `}>
                                        <div className={`
                                            absolute top-0.5 w-3 h-3 rounded-full bg-background transition-all
                                            ${field.required ? 'left-4' : 'left-0.5'}
                                        `} />
                                    </div>
                                    <span className="text-xs font-mono">Kötelező</span>
                                </label>
                            </div>
                        </div>

                        {/* Row 3: Placeholder & Help Text */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-[9px] font-mono uppercase tracking-widest opacity-50 block mb-1">
                                    Placeholder
                                </label>
                                <input
                                    type="text"
                                    value={field.placeholder || ''}
                                    onChange={(e) => onChange({ placeholder: e.target.value || undefined })}
                                    className="w-full px-3 py-2 bg-background border border-border text-sm focus:border-foreground outline-none"
                                    placeholder="Segítő szöveg..."
                                />
                            </div>
                            <div>
                                <label className="text-[9px] font-mono uppercase tracking-widest opacity-50 block mb-1">
                                    Súgó szöveg
                                </label>
                                <input
                                    type="text"
                                    value={field.helpText || ''}
                                    onChange={(e) => onChange({ helpText: e.target.value || undefined })}
                                    className="w-full px-3 py-2 bg-background border border-border text-sm focus:border-foreground outline-none"
                                    placeholder="További információ..."
                                />
                            </div>
                        </div>

                        {/* Type-specific: Options (select/multiselect) */}
                        {typeInfo?.hasOptions && (
                            <OptionsEditor
                                options={field.options || []}
                                onChange={(options) => onChange({ options })}
                            />
                        )}

                        {/* Type-specific: File Config */}
                        {typeInfo?.hasFileConfig && (
                            <FileConfigEditor
                                config={field.fileConfig || {}}
                                onChange={(fileConfig) => onChange({ fileConfig })}
                            />
                        )}

                        {/* Type-specific: Slug Source */}
                        {typeInfo?.hasSlugSource && (
                            <div>
                                <label className="text-[9px] font-mono uppercase tracking-widest opacity-50 block mb-1">
                                    Slug forrás mező
                                </label>
                                <select
                                    value={field.slugSource || ''}
                                    onChange={(e) => onChange({ slugSource: e.target.value || undefined })}
                                    className="w-full px-3 py-2 bg-background border border-border text-sm font-mono focus:border-foreground outline-none"
                                >
                                    <option value="">-- Válassz mezőt --</option>
                                    {availableFields
                                        .filter(f => f.id !== field.id && ['text', 'textarea'].includes(f.type))
                                        .map(f => (
                                            <option key={f.id} value={f.id}>
                                                {f.id} ({f.label})
                                            </option>
                                        ))
                                    }
                                </select>
                                <p className="text-[9px] opacity-40 mt-1">
                                    A slug automatikusan generálódik a kiválasztott mező alapján.
                                </p>
                            </div>
                        )}

                        {/* Type-specific: JSON Schema (Template) */}
                        {field.type === 'json' && (
                            <JsonSchemaEditor
                                schema={field.jsonSchema}
                                onChange={(jsonSchema) => onChange({ jsonSchema })}
                            />
                        )}

                        {/* Validation (expandable) */}
                        <ValidationEditor
                            type={field.type}
                            validation={field.validation}
                            onChange={(validation) => onChange({ validation })}
                        />

                        {/* Delete Button */}
                        <div className="pt-4 border-t border-border/50">
                            <button
                                onClick={onRemove}
                                className="flex items-center gap-2 px-3 py-2 text-red-500 border border-red-500/30 hover:bg-red-500 hover:text-white transition-colors text-xs font-mono uppercase tracking-widest"
                            >
                                <Trash2 size={12} />
                                Mező törlése
                            </button>
                        </div>
                    </div>
                </motion.div>
            )}
        </motion.div>
    );
}

/**
 * Options Editor for select/multiselect
 */
function OptionsEditor({
    options,
    onChange
}: {
    options: Array<{ value: string; label: string }>;
    onChange: (options: Array<{ value: string; label: string }>) => void;
}) {
    const addOption = () => {
        onChange([...options, { value: '', label: '' }]);
    };

    const updateOption = (index: number, updates: Partial<{ value: string; label: string }>) => {
        const newOptions = [...options];
        newOptions[index] = { ...newOptions[index], ...updates };
        onChange(newOptions);
    };

    const removeOption = (index: number) => {
        onChange(options.filter((_, i) => i !== index));
    };

    return (
        <div className="space-y-2">
            <label className="text-[9px] font-mono uppercase tracking-widest opacity-50 block">
                Opciók
            </label>
            <div className="space-y-1">
                {options.map((opt, i) => (
                    <div key={i} className="flex gap-2 items-center">
                        <input
                            type="text"
                            value={opt.value}
                            onChange={(e) => updateOption(i, { value: e.target.value })}
                            className="flex-1 px-2 py-1.5 bg-background border border-border text-xs font-mono focus:border-foreground outline-none"
                            placeholder="érték"
                        />
                        <input
                            type="text"
                            value={opt.label}
                            onChange={(e) => updateOption(i, { label: e.target.value })}
                            className="flex-1 px-2 py-1.5 bg-background border border-border text-xs focus:border-foreground outline-none"
                            placeholder="Megjelenített név"
                        />
                        <button
                            onClick={() => removeOption(i)}
                            className="p-1.5 text-red-500 hover:bg-red-500/10 transition-colors"
                        >
                            <X size={12} />
                        </button>
                    </div>
                ))}
            </div>
            <button
                onClick={addOption}
                className="flex items-center gap-2 px-3 py-1.5 border border-dashed border-border hover:border-foreground text-xs font-mono transition-colors"
            >
                <Plus size={12} />
                Új opció
            </button>
        </div>
    );
}

/**
 * File Config Editor
 */
function FileConfigEditor({
    config,
    onChange,
}: {
    config: { allowedTypes?: string[]; maxSizeMB?: number; secure?: boolean };
    onChange: (config: { allowedTypes?: string[]; maxSizeMB?: number; secure?: boolean }) => void;
}) {
    return (
        <div className="p-3 border border-amber-500/30 bg-amber-500/5 space-y-3">
            <div className="flex items-center gap-2 text-amber-500">
                <Lock size={12} />
                <span className="text-[9px] font-mono uppercase tracking-widest">Fájl konfiguráció</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="text-[8px] font-mono uppercase tracking-widest opacity-50 block mb-1">
                        Engedélyezett típusok
                    </label>
                    <input
                        type="text"
                        value={(config.allowedTypes || []).join(', ')}
                        onChange={(e) => onChange({
                            ...config,
                            allowedTypes: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                        })}
                        className="w-full px-2 py-1.5 bg-background border border-border text-xs font-mono focus:border-amber-500 outline-none"
                        placeholder="pdf, docx, txt"
                    />
                </div>
                <div>
                    <label className="text-[8px] font-mono uppercase tracking-widest opacity-50 block mb-1">
                        Max méret (MB)
                    </label>
                    <input
                        type="number"
                        value={config.maxSizeMB || ''}
                        onChange={(e) => onChange({
                            ...config,
                            maxSizeMB: e.target.value ? parseInt(e.target.value) : undefined
                        })}
                        className="w-full px-2 py-1.5 bg-background border border-border text-xs font-mono focus:border-amber-500 outline-none"
                        placeholder="25"
                    />
                </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer group">
                <input
                    type="checkbox"
                    checked={config.secure || false}
                    onChange={(e) => onChange({ ...config, secure: e.target.checked })}
                    className="sr-only"
                />
                <div className={`
                    w-8 h-4 rounded-full transition-colors relative
                    ${config.secure ? 'bg-amber-500' : 'bg-border'}
                `}>
                    <div className={`
                        absolute top-0.5 w-3 h-3 rounded-full bg-background transition-all
                        ${config.secure ? 'left-4' : 'left-0.5'}
                    `} />
                </div>
                <span className="text-xs font-mono text-amber-500">Titkosított tárolás (AES-256)</span>
            </label>
        </div>
    );
}

/**
 * Validation Editor
 */
function ValidationEditor({
    type,
    validation,
    onChange,
}: {
    type: FieldType;
    validation?: BuilderFieldConfig['validation'];
    onChange: (validation: BuilderFieldConfig['validation']) => void;
}) {
    const isTextType = ['text', 'textarea', 'richtext', 'email', 'url'].includes(type);
    const isNumberType = ['number'].includes(type);

    if (!isTextType && !isNumberType) return null;

    return (
        <div className="space-y-2">
            <label className="text-[9px] font-mono uppercase tracking-widest opacity-50 flex items-center gap-2">
                <HelpCircle size={10} />
                Validáció
            </label>
            <div className="grid grid-cols-2 gap-3">
                {isTextType && (
                    <>
                        <div>
                            <label className="text-[8px] font-mono uppercase tracking-widest opacity-40 block mb-1">
                                Min hossz
                            </label>
                            <input
                                type="number"
                                value={validation?.minLength || ''}
                                onChange={(e) => onChange({
                                    ...validation,
                                    minLength: e.target.value ? parseInt(e.target.value) : undefined
                                })}
                                className="w-full px-2 py-1.5 bg-background border border-border text-xs font-mono focus:border-foreground outline-none"
                            />
                        </div>
                        <div>
                            <label className="text-[8px] font-mono uppercase tracking-widest opacity-40 block mb-1">
                                Max hossz
                            </label>
                            <input
                                type="number"
                                value={validation?.maxLength || ''}
                                onChange={(e) => onChange({
                                    ...validation,
                                    maxLength: e.target.value ? parseInt(e.target.value) : undefined
                                })}
                                className="w-full px-2 py-1.5 bg-background border border-border text-xs font-mono focus:border-foreground outline-none"
                            />
                        </div>
                    </>
                )}
                {isNumberType && (
                    <>
                        <div>
                            <label className="text-[8px] font-mono uppercase tracking-widest opacity-40 block mb-1">
                                Minimum
                            </label>
                            <input
                                type="number"
                                value={validation?.min || ''}
                                onChange={(e) => onChange({
                                    ...validation,
                                    min: e.target.value ? parseInt(e.target.value) : undefined
                                })}
                                className="w-full px-2 py-1.5 bg-background border border-border text-xs font-mono focus:border-foreground outline-none"
                            />
                        </div>
                        <div>
                            <label className="text-[8px] font-mono uppercase tracking-widest opacity-40 block mb-1">
                                Maximum
                            </label>
                            <input
                                type="number"
                                value={validation?.max || ''}
                                onChange={(e) => onChange({
                                    ...validation,
                                    max: e.target.value ? parseInt(e.target.value) : undefined
                                })}
                                className="w-full px-2 py-1.5 bg-background border border-border text-xs font-mono focus:border-foreground outline-none"
                            />
                        </div>
                    </>
                )}
            </div>
            {isTextType && (
                <div>
                    <label className="text-[8px] font-mono uppercase tracking-widest opacity-40 block mb-1">
                        Regex pattern
                    </label>
                    <input
                        type="text"
                        value={validation?.pattern || ''}
                        onChange={(e) => onChange({
                            ...validation,
                            pattern: e.target.value || undefined
                        })}
                        className="w-full px-2 py-1.5 bg-background border border-border text-xs font-mono focus:border-foreground outline-none"
                        placeholder="^[a-z]+$"
                    />
                </div>
            )}
        </div>
    );
}

/**
 * JSON Schema Editor for json type fields
 */
function JsonSchemaEditor({
    schema,
    onChange,
}: {
    schema?: Record<string, unknown>;
    onChange: (schema: Record<string, unknown> | undefined) => void;
}) {
    const [localValue, setLocalValue] = useState(() =>
        schema ? JSON.stringify(schema, null, 2) : ''
    );
    const [error, setError] = useState<string | null>(null);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const value = e.target.value;
        setLocalValue(value);

        if (!value.trim()) {
            setError(null);
            onChange(undefined);
            return;
        }

        try {
            const parsed = JSON.parse(value);
            if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
                setError(null);
                onChange(parsed);
            } else {
                setError('Objektum típus szükséges');
            }
        } catch (err) {
            setError((err as Error).message);
        }
    };

    return (
        <div className="p-3 border border-foreground/20 bg-foreground/5 space-y-2">
            <div className="flex items-center justify-between">
                <label className="text-[9px] font-mono uppercase tracking-widest opacity-50">
                    JSON Sablon (ajánlás)
                </label>
                {error && (
                    <span className="text-[8px] text-red-500 font-mono">
                        {error}
                    </span>
                )}
            </div>
            <textarea
                value={localValue}
                onChange={handleChange}
                className={`w-full min-h-[100px] px-3 py-2 bg-background border text-xs font-mono 
                    focus:outline-none resize-y leading-relaxed
                    ${error ? 'border-red-500' : 'border-border focus:border-foreground'}`}
                placeholder={'{\n  "calories": null,\n  "protein": null,\n  "allergens": []\n}'}
                spellCheck={false}
            />
            <p className="text-[9px] opacity-40">
                Struktúra sablon üres mezőkhöz. Nem szigorú validáció, csak ajánlás.
            </p>
        </div>
    );
}
