import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import {
    Plus,
    Trash2,
    Map,
    Edit2,
    Check,
    X,
} from 'lucide-react';
import * as Icons from 'lucide-react';
import { BuilderSlotConfig, BuilderFieldConfig, SLOT_TYPES } from './types';
import { FieldEditor } from './FieldEditor';
import { MassiveConfigEditor } from './MassiveConfigEditor';

interface SlotEditorProps {
    slotKey: string;
    slot: BuilderSlotConfig;
    onUpdate: (updates: Partial<BuilderSlotConfig>) => void;
    onRename: (newKey: string) => void;
    onDelete: () => void;
    onAddField: (id: string) => void;
    onUpdateField: (index: number, updates: Partial<BuilderFieldConfig>) => void;
    onRemoveField: (index: number) => void;
    onMoveField: (fromIndex: number, toIndex: number) => void;
}

const ICON_OPTIONS = [
    'Settings', 'Rocket', 'User', 'FileText', 'Image', 'Database', 'Layers',
    'Layout', 'Box', 'Shield', 'Briefcase', 'Cpu', 'Wrench', 'Mail',
    'Film', 'Music', 'Map', 'Globe', 'Calendar', 'Clock', 'Tag',
    'Heart', 'Star', 'Bookmark', 'Folder', 'File', 'Lock', 'Key',
];

export function SlotEditor({
    slotKey,
    slot,
    onUpdate,
    onRename,
    onDelete,
    onAddField,
    onUpdateField,
    onRemoveField,
    onMoveField,
}: SlotEditorProps) {
    const [isEditingKey, setIsEditingKey] = useState(false);
    const [newKey, setNewKey] = useState(slotKey);
    const [newFieldId, setNewFieldId] = useState('');
    const [showIconPicker, setShowIconPicker] = useState(false);


    const handleSaveKey = () => {
        if (newKey && newKey !== slotKey) {
            onRename(newKey);
        }
        setIsEditingKey(false);
    };

    const handleAddField = () => {
        if (newFieldId.trim()) {
            onAddField(newFieldId.trim().replace(/\s/g, '_').toLowerCase());
            setNewFieldId('');
        }
    };

    const CurrentIcon = (Icons as any)[slot.icon || 'File'] || Icons.File;

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="h-full flex flex-col"
        >
            {/* Slot Header */}
            <div className="p-6 border-b border-border bg-background sticky top-0 z-10">
                <div className="flex items-start gap-4">
                    {/* Icon */}
                    <div className="relative">
                        <button
                            onClick={() => setShowIconPicker(!showIconPicker)}
                            className="w-12 h-12 border border-border flex items-center justify-center hover:border-foreground transition-colors"
                        >
                            <CurrentIcon size={20} className="opacity-60" />
                        </button>

                        <AnimatePresence>
                            {showIconPicker && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setShowIconPicker(false)} />
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        className="absolute z-50 top-full left-0 mt-2 p-2 bg-background border border-border shadow-xl grid grid-cols-7 gap-1 w-64"
                                    >
                                        {ICON_OPTIONS.map(iconName => {
                                            const IconComp = (Icons as any)[iconName] || Icons.File;
                                            return (
                                                <button
                                                    key={iconName}
                                                    onClick={() => {
                                                        onUpdate({ icon: iconName });
                                                        setShowIconPicker(false);
                                                    }}
                                                    className={`p-2 hover:bg-foreground/10 transition-colors ${slot.icon === iconName ? 'bg-foreground/20' : ''}`}
                                                >
                                                    <IconComp size={14} />
                                                </button>
                                            );
                                        })}
                                    </motion.div>
                                </>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Title & Key */}
                    <div className="flex-1">
                        {isEditingKey ? (
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={newKey}
                                    onChange={(e) => setNewKey(e.target.value.replace(/\s/g, '_').toLowerCase())}
                                    className="flex-1 px-2 py-1 bg-background border border-foreground text-lg font-mono focus:outline-none"
                                    autoFocus
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSaveKey();
                                        if (e.key === 'Escape') { setNewKey(slotKey); setIsEditingKey(false); }
                                    }}
                                />
                                <button onClick={handleSaveKey} className="p-1 text-emerald-500 hover:bg-emerald-500/10">
                                    <Check size={16} />
                                </button>
                                <button onClick={() => { setNewKey(slotKey); setIsEditingKey(false); }} className="p-1 text-red-500 hover:bg-red-500/10">
                                    <X size={16} />
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 group">
                                <h2 className="text-lg font-mono font-bold">{slotKey}</h2>
                                <button
                                    onClick={() => setIsEditingKey(true)}
                                    className="p-1 opacity-0 group-hover:opacity-100 hover:bg-foreground/10 transition-all"
                                >
                                    <Edit2 size={12} />
                                </button>
                            </div>
                        )}
                        <p className="text-xs opacity-50 mt-1">{slot.label || 'Nincs címke'}</p>
                    </div>

                    {/* Delete */}
                    <button
                        onClick={onDelete}
                        className="p-2 text-red-500 border border-red-500/30 hover:bg-red-500 hover:text-white transition-colors"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>

            {/* Slot Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Metadata */}
                <div className="space-y-4">
                    <h3 className="text-[10px] font-mono uppercase tracking-widest opacity-40 border-b border-border pb-2">
                        Alapbeállítások
                    </h3>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-[9px] font-mono uppercase tracking-widest opacity-50 block mb-1">
                                Megjelenített név
                            </label>
                            <input
                                type="text"
                                value={slot.label}
                                onChange={(e) => onUpdate({ label: e.target.value })}
                                className="w-full px-3 py-2 bg-background border border-border text-sm focus:border-foreground outline-none"
                                placeholder="Slot címke"
                            />
                        </div>
                        <div>
                            <label className="text-[9px] font-mono uppercase tracking-widest opacity-50 block mb-1">
                                Típus
                            </label>
                            <select
                                value={slot.type}
                                onChange={(e) => onUpdate({
                                    type: e.target.value as BuilderSlotConfig['type'],
                                    massive: e.target.value === 'massive' ? {} : undefined,
                                })}
                                className="w-full px-3 py-2 bg-background border border-border text-sm font-mono focus:border-foreground outline-none"
                            >
                                {SLOT_TYPES.map(t => (
                                    <option key={t.type} value={t.type}>
                                        {t.label} ({t.type})
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="text-[9px] font-mono uppercase tracking-widest opacity-50 block mb-1">
                            Leírás
                        </label>
                        <textarea
                            value={slot.description || ''}
                            onChange={(e) => onUpdate({ description: e.target.value || undefined })}
                            className="w-full px-3 py-2 bg-background border border-border text-sm focus:border-foreground outline-none resize-none h-20"
                            placeholder="Rövid leírás..."
                        />
                    </div>

                    {/* SEO / Sitemap Configuration */}
                    {(slot.type === 'collection' || slot.type === 'massive') && (
                        <div className={`p-4 border transition-all ${slot.isSitemap ? 'border-emerald-500 bg-emerald-500/5' : 'border-border'}`}>
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    <Map size={14} className={slot.isSitemap ? 'text-emerald-500' : 'opacity-40'} />
                                    <span className={`text-[10px] font-mono uppercase tracking-widest ${slot.isSitemap ? 'text-emerald-500' : 'opacity-60'}`}>
                                        SEO / Sitemap
                                    </span>
                                </div>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={slot.isSitemap || false}
                                        onChange={(e) => onUpdate({ isSitemap: e.target.checked })}
                                        className="sr-only"
                                    />
                                    <div className={`
                                        w-8 h-4 rounded-full transition-colors relative
                                        ${slot.isSitemap ? 'bg-emerald-500' : 'bg-border'}
                                    `}>
                                        <div className={`
                                            absolute top-0.5 w-3 h-3 rounded-full bg-background transition-all
                                            ${slot.isSitemap ? 'left-4' : 'left-0.5'}
                                        `} />
                                    </div>
                                </label>
                            </div>

                            {slot.isSitemap && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="space-y-4"
                                >
                                    <p className="text-[10px] opacity-60 mb-4">
                                        Ezek az elemek megjelennek a sitemap.xml-ben a SEO számára.
                                    </p>

                                    <div className="grid grid-cols-2 gap-4">
                                        {/* Slug Field */}
                                        <div>
                                            <label className="text-[9px] font-mono uppercase tracking-widest opacity-50 block mb-1">
                                                Slug mező (URL)
                                            </label>
                                            <select
                                                value={slot.slugField || ''}
                                                onChange={(e) => onUpdate({ slugField: e.target.value || undefined })}
                                                className="w-full px-3 py-2 bg-background border border-border text-sm font-mono focus:border-emerald-500 outline-none"
                                            >
                                                <option value="">– Válassz mezőt –</option>
                                                {slot.fields
                                                    .filter(f => ['slug', 'text'].includes(f.type))
                                                    .map(f => (
                                                        <option key={f.id} value={f.id}>
                                                            {f.id} ({f.type})
                                                        </option>
                                                    ))}
                                            </select>
                                            <p className="text-[8px] opacity-40 mt-1">
                                                Ez lesz az URL azonosító
                                            </p>
                                        </div>

                                        {/* Published Field */}
                                        <div>
                                            <label className="text-[9px] font-mono uppercase tracking-widest opacity-50 block mb-1">
                                                Publikált mező
                                            </label>
                                            <select
                                                value={slot.publishedField || ''}
                                                onChange={(e) => onUpdate({ publishedField: e.target.value || undefined })}
                                                className="w-full px-3 py-2 bg-background border border-border text-sm font-mono focus:border-emerald-500 outline-none"
                                            >
                                                <option value="">– Nincs (mindig publikus) –</option>
                                                {slot.fields
                                                    .filter(f => f.type === 'boolean')
                                                    .map(f => (
                                                        <option key={f.id} value={f.id}>
                                                            {f.id}
                                                        </option>
                                                    ))}
                                            </select>
                                            <p className="text-[8px] opacity-40 mt-1">
                                                Csak a publikált elemek kerülnek a sitemap-ba
                                            </p>
                                        </div>
                                    </div>

                                    {/* URL Pattern - Optional */}
                                    <div>
                                        <label className="text-[9px] font-mono uppercase tracking-widest opacity-50 block mb-1">
                                            URL Pattern (opcionális)
                                        </label>
                                        <input
                                            type="text"
                                            value={slot.urlPattern || ''}
                                            onChange={(e) => onUpdate({ urlPattern: e.target.value || undefined })}
                                            placeholder={`/${slotKey}/{slug}`}
                                            className="w-full px-3 py-2 bg-background border border-border text-sm font-mono focus:border-emerald-500 outline-none"
                                        />
                                        <p className="text-[8px] opacity-40 mt-1">
                                            Használd a {'{slug}'} placeholder-t. Alapértelmezett: /{slotKey}/{'{slug}'}
                                        </p>
                                    </div>

                                    {/* Preview */}
                                    {slot.slugField && (
                                        <div className="p-2 bg-emerald-500/10 border border-emerald-500/30">
                                            <span className="text-[9px] font-mono text-emerald-600">
                                                Példa URL: {(slot.urlPattern || `/${slotKey}/{slug}`).replace('{slug}', 'pelda-slug')}
                                            </span>
                                        </div>
                                    )}
                                </motion.div>
                            )}
                        </div>
                    )}
                </div>

                {/* Massive Config */}
                {slot.type === 'massive' && (
                    <MassiveConfigEditor
                        config={slot.massive || {}}
                        fields={slot.fields}
                        onChange={(massive) => onUpdate({ massive })}
                    />
                )}

                {/* Fields */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-border pb-2">
                        <h3 className="text-[10px] font-mono uppercase tracking-widest opacity-40">
                            Mezők ({slot.fields.length})
                        </h3>
                    </div>

                    {/* Add Field */}
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={newFieldId}
                            onChange={(e) => setNewFieldId(e.target.value)}
                            placeholder="új_mező_id"
                            className="flex-1 px-3 py-2 bg-background border border-dashed border-border text-sm font-mono focus:border-foreground outline-none"
                            onKeyDown={(e) => e.key === 'Enter' && handleAddField()}
                        />
                        <button
                            onClick={handleAddField}
                            disabled={!newFieldId.trim()}
                            className="px-4 py-2 border border-foreground bg-foreground text-background hover:bg-background hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-mono text-xs uppercase tracking-widest flex items-center gap-2"
                        >
                            <Plus size={12} />
                            Hozzáad
                        </button>
                    </div>

                    {/* Fields List */}
                    <AnimatePresence mode="popLayout">
                        {slot.fields.length === 0 ? (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="py-12 text-center border border-dashed border-border"
                            >
                                <p className="text-xs opacity-40 font-mono uppercase tracking-widest">
                                    Még nincsenek mezők
                                </p>
                            </motion.div>
                        ) : (
                            <div className="space-y-2">
                                {slot.fields.map((field, index) => (
                                    <FieldEditor
                                        key={field.id}
                                        field={field}
                                        index={index}
                                        onChange={(updates) => onUpdateField(index, updates)}
                                        onRemove={() => onRemoveField(index)}
                                        onMoveUp={() => onMoveField(index, index - 1)}
                                        onMoveDown={() => onMoveField(index, index + 1)}
                                        isFirst={index === 0}
                                        isLast={index === slot.fields.length - 1}
                                        availableFields={slot.fields}
                                    />
                                ))}
                            </div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </motion.div>
    );
}
