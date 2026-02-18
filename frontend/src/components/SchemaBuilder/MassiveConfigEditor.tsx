/**
 * MassiveConfigEditor Component
 * 
 * Editor for massive slot configurations including encryption and blind indexing.
 */

import { motion } from 'framer-motion';
import {
    Lock,
    Search,
    Database,
    SortAsc,
    FileDown,
    FileUp,
    Plus,
    X,
} from 'lucide-react';
import { BuilderMassiveConfig, BuilderFieldConfig } from './types';

interface MassiveConfigEditorProps {
    config: BuilderMassiveConfig;
    fields: BuilderFieldConfig[];
    onChange: (config: BuilderMassiveConfig) => void;
}

export function MassiveConfigEditor({ config, fields, onChange }: MassiveConfigEditorProps) {
    const isEncrypted = config.encrypted || false;
    const searchableFields = config.searchableFields || [];

    const handleToggleEncryption = (enabled: boolean) => {
        onChange({
            ...config,
            encrypted: enabled,
            // Clear blind index fields if encryption is disabled
            searchableFields: enabled ? config.searchableFields : undefined,
        });
    };

    const handleToggleSearchableField = (fieldId: string) => {
        const current = new Set(searchableFields);
        if (current.has(fieldId)) {
            current.delete(fieldId);
        } else {
            current.add(fieldId);
        }
        onChange({
            ...config,
            searchableFields: current.size > 0 ? Array.from(current) : undefined,
        });
    };

    return (
        <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="border border-foreground/20 bg-foreground/5"
        >
            <div className="p-4 border-b border-foreground/10 flex items-center gap-3">
                <Database size={16} className="opacity-60" />
                <span className="text-[10px] font-mono uppercase tracking-widest">
                    Massive Konfiguráció
                </span>
            </div>

            <div className="p-4 space-y-6">
                {/* Basic Settings */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-[9px] font-mono uppercase tracking-widest opacity-50 block mb-1">
                            Oldal méret
                        </label>
                        <input
                            type="number"
                            value={config.pageSize || 50}
                            onChange={(e) => onChange({ ...config, pageSize: parseInt(e.target.value) || 50 })}
                            className="w-full px-3 py-2 bg-background border border-border text-sm font-mono focus:border-foreground outline-none"
                            min={1}
                            max={500}
                        />
                    </div>
                    <div>
                        <label className="text-[9px] font-mono uppercase tracking-widest opacity-50 block mb-1">
                            Alapértelmezett rendezés
                        </label>
                        <div className="flex gap-2">
                            <select
                                value={config.defaultSort?.field || ''}
                                onChange={(e) => onChange({
                                    ...config,
                                    defaultSort: e.target.value
                                        ? { field: e.target.value, direction: config.defaultSort?.direction || 'desc' }
                                        : undefined,
                                })}
                                className="flex-1 px-3 py-2 bg-background border border-border text-sm font-mono focus:border-foreground outline-none"
                            >
                                <option value="">– Nincs –</option>
                                <option value="created_at">created_at</option>
                                <option value="updated_at">updated_at</option>
                                {fields.map(f => (
                                    <option key={f.id} value={f.id}>{f.id}</option>
                                ))}
                            </select>
                            <select
                                value={config.defaultSort?.direction || 'desc'}
                                onChange={(e) => onChange({
                                    ...config,
                                    defaultSort: config.defaultSort
                                        ? { ...config.defaultSort, direction: e.target.value as 'asc' | 'desc' }
                                        : undefined,
                                })}
                                className="px-3 py-2 bg-background border border-border text-sm font-mono focus:border-foreground outline-none"
                            >
                                <option value="asc">↑ ASC</option>
                                <option value="desc">↓ DESC</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Feature Toggles */}
                <div className="flex flex-wrap gap-4">
                    <ToggleSwitch
                        label="Tömeges műveletek"
                        checked={config.bulkActions !== false}
                        onChange={(v) => onChange({ ...config, bulkActions: v })}
                    />
                    <ToggleSwitch
                        label="CSV Export"
                        icon={<FileDown size={10} />}
                        checked={config.exportEnabled !== false}
                        onChange={(v) => onChange({ ...config, exportEnabled: v })}
                    />
                    <ToggleSwitch
                        label="CSV Import"
                        icon={<FileUp size={10} />}
                        checked={config.importEnabled || false}
                        onChange={(v) => onChange({ ...config, importEnabled: v })}
                    />
                </div>

                {/* Encryption Section */}
                <div className={`
                    p-4 border transition-all
                    ${isEncrypted ? 'border-amber-500 bg-amber-500/10' : 'border-border'}
                `}>
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <Lock size={14} className={isEncrypted ? 'text-amber-500' : 'opacity-40'} />
                            <span className={`text-xs font-mono uppercase tracking-widest ${isEncrypted ? 'text-amber-500' : 'opacity-60'}`}>
                                Titkosítás
                            </span>
                        </div>
                        <ToggleSwitch
                            checked={isEncrypted}
                            onChange={handleToggleEncryption}
                        />
                    </div>

                    {isEncrypted && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="space-y-3"
                        >
                            <p className="text-[10px] opacity-60">
                                A titkosított adatok AES-256-tal vannak védve.
                                A blind indexelt mezők kereshetők maradnak.
                            </p>

                            {/* Blind Index Fields */}
                            <div className="p-3 border border-blue-500/30 bg-blue-500/5">
                                <div className="flex items-center gap-2 mb-3">
                                    <Search size={12} className="text-blue-500" />
                                    <span className="text-[9px] font-mono uppercase tracking-widest text-blue-500">
                                        Kereshető mezők (Blind Index)
                                    </span>
                                </div>

                                {fields.length === 0 ? (
                                    <p className="text-[10px] opacity-40">
                                        Adj hozzá mezőket a slothoz a blind indexeléshez.
                                    </p>
                                ) : (
                                    <div className="flex flex-wrap gap-2">
                                        {fields.map(field => {
                                            const isSearchable = searchableFields.includes(field.id);
                                            return (
                                                <button
                                                    key={field.id}
                                                    onClick={() => handleToggleSearchableField(field.id)}
                                                    className={`
                                                        px-2 py-1 text-[10px] font-mono uppercase tracking-wider 
                                                        border transition-all
                                                        ${isSearchable
                                                            ? 'border-blue-500 bg-blue-500 text-white'
                                                            : 'border-border hover:border-blue-500/50'
                                                        }
                                                    `}
                                                >
                                                    {isSearchable && <span className="mr-1">✓</span>}
                                                    {field.id}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}

                                {searchableFields.length > 0 && (
                                    <p className="mt-3 text-[9px] text-blue-400 opacity-80">
                                        Ezek a mezők HMAC-SHA256 blind indexeléssel kereshetők lesznek titkosítva is.
                                    </p>
                                )}
                            </div>
                        </motion.div>
                    )}
                </div>

                {/* Quick Filters */}
                <QuickFiltersEditor
                    filters={config.quickFilters || []}
                    fields={fields}
                    onChange={(quickFilters) => onChange({ ...config, quickFilters })}
                />
            </div>
        </motion.div>
    );
}

/**
 * Toggle Switch Component
 */
function ToggleSwitch({
    label,
    icon,
    checked,
    onChange
}: {
    label?: string;
    icon?: React.ReactNode;
    checked: boolean;
    onChange: (checked: boolean) => void;
}) {
    return (
        <label className="flex items-center gap-2 cursor-pointer group">
            <input
                type="checkbox"
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
                className="sr-only"
            />
            <div className={`
                w-8 h-4 rounded-full transition-colors relative
                ${checked ? 'bg-foreground' : 'bg-border'}
            `}>
                <div className={`
                    absolute top-0.5 w-3 h-3 rounded-full bg-background transition-all
                    ${checked ? 'left-4' : 'left-0.5'}
                `} />
            </div>
            {(label || icon) && (
                <span className="text-[10px] font-mono flex items-center gap-1">
                    {icon}
                    {label}
                </span>
            )}
        </label>
    );
}

/**
 * Quick Filters Editor
 */
function QuickFiltersEditor({
    filters,
    fields,
    onChange,
}: {
    filters: BuilderMassiveConfig['quickFilters'];
    fields: BuilderFieldConfig[];
    onChange: (filters: BuilderMassiveConfig['quickFilters']) => void;
}) {
    const addFilter = () => {
        onChange([
            ...(filters || []),
            { field: '', label: '', options: [] },
        ]);
    };

    const updateFilter = (index: number, updates: Partial<NonNullable<BuilderMassiveConfig['quickFilters']>[0]>) => {
        if (!filters) return;
        const newFilters = [...filters];
        newFilters[index] = { ...newFilters[index], ...updates };
        onChange(newFilters);
    };

    const removeFilter = (index: number) => {
        if (!filters) return;
        onChange(filters.filter((_, i) => i !== index));
    };

    return (
        <div className="space-y-3">
            <label className="text-[9px] font-mono uppercase tracking-widest opacity-50 flex items-center gap-2">
                <SortAsc size={10} />
                Gyors szűrők
            </label>

            {(filters || []).map((filter, i) => (
                <div key={i} className="p-3 border border-border bg-background space-y-2">
                    <div className="flex gap-2">
                        <select
                            value={filter.field}
                            onChange={(e) => updateFilter(i, { field: e.target.value })}
                            className="flex-1 px-2 py-1.5 bg-background border border-border text-xs font-mono focus:border-foreground outline-none"
                        >
                            <option value="">– Mező –</option>
                            {fields.filter(f => f.type === 'select').map(f => (
                                <option key={f.id} value={f.id}>{f.id}</option>
                            ))}
                        </select>
                        <input
                            type="text"
                            value={filter.label}
                            onChange={(e) => updateFilter(i, { label: e.target.value })}
                            placeholder="Szűrő név"
                            className="flex-1 px-2 py-1.5 bg-background border border-border text-xs focus:border-foreground outline-none"
                        />
                        <button
                            onClick={() => removeFilter(i)}
                            className="p-1.5 text-red-500 hover:bg-red-500/10"
                        >
                            <X size={12} />
                        </button>
                    </div>
                </div>
            ))}

            <button
                onClick={addFilter}
                className="flex items-center gap-2 px-3 py-1.5 border border-dashed border-border hover:border-foreground text-xs font-mono transition-colors"
            >
                <Plus size={12} />
                Új szűrő
            </button>
        </div>
    );
}
