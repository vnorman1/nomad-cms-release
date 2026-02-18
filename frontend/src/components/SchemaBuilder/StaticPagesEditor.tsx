/**
 * StaticPagesEditor Component
 * 
 * Editor for configuring static pages in the sitemap.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import {
    Plus,
    Trash2,
    Map,
    Globe,
} from 'lucide-react';
import type { StaticPage } from './types';

interface StaticPagesEditorProps {
    pages: StaticPage[];
    onAdd: (page: StaticPage) => void;
    onRemove: (index: number) => void;
    onUpdate: (index: number, updates: Partial<StaticPage>) => void;
}

const PRIORITY_OPTIONS = [
    { value: '1.0', label: '1.0 (Legmagasabb)' },
    { value: '0.9', label: '0.9' },
    { value: '0.8', label: '0.8 (Magas)' },
    { value: '0.7', label: '0.7' },
    { value: '0.6', label: '0.6' },
    { value: '0.5', label: '0.5 (Közepes)' },
    { value: '0.4', label: '0.4' },
    { value: '0.3', label: '0.3 (Alacsony)' },
    { value: '0.2', label: '0.2' },
    { value: '0.1', label: '0.1 (Legalacsonyabb)' },
];

const CHANGEFREQ_OPTIONS = [
    { value: 'always', label: 'Mindig' },
    { value: 'hourly', label: 'Óránként' },
    { value: 'daily', label: 'Naponta' },
    { value: 'weekly', label: 'Hetente' },
    { value: 'monthly', label: 'Havonta' },
    { value: 'yearly', label: 'Évente' },
    { value: 'never', label: 'Soha' },
];

export function StaticPagesEditor({
    pages,
    onAdd,
    onRemove,
    onUpdate,
}: StaticPagesEditorProps) {
    const [newPath, setNewPath] = useState('');
    const [newLabel, setNewLabel] = useState('');

    const handleAdd = () => {
        if (!newPath.trim()) return;

        // Ensure path starts with /
        const path = newPath.startsWith('/') ? newPath : `/${newPath}`;

        onAdd({
            path: path.trim(),
            label: newLabel.trim() || undefined,
            priority: '0.7',
            changefreq: 'monthly',
        });

        setNewPath('');
        setNewLabel('');
    };

    return (
        <div className="border border-border p-4 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Map size={14} className="text-emerald-500" />
                    <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-500">
                        Statikus oldalak (Sitemap)
                    </span>
                </div>
                <span className="text-[9px] opacity-40 font-mono">
                    {pages.length} oldal
                </span>
            </div>

            <p className="text-[10px] opacity-60">
                Ezek az oldalak fix URL-ként kerülnek a sitemap.xml-be.
                Pl: /about, /contact, /services
            </p>

            {/* Pages List */}
            <div className="space-y-2">
                <AnimatePresence mode="popLayout">
                    {pages.map((page, index) => (
                        <motion.div
                            key={`${page.path}-${index}`}
                            layout
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="grid grid-cols-12 gap-2 p-2 bg-foreground/5 border border-border items-center"
                        >
                            {/* Path */}
                            <div className="col-span-3">
                                <input
                                    type="text"
                                    value={page.path}
                                    onChange={(e) => onUpdate(index, { path: e.target.value })}
                                    className="w-full px-2 py-1 bg-background border border-border text-xs font-mono focus:border-emerald-500 outline-none"
                                    placeholder="/path"
                                />
                            </div>

                            {/* Label */}
                            <div className="col-span-3">
                                <input
                                    type="text"
                                    value={page.label || ''}
                                    onChange={(e) => onUpdate(index, { label: e.target.value || undefined })}
                                    className="w-full px-2 py-1 bg-background border border-border text-xs focus:border-emerald-500 outline-none"
                                    placeholder="Címke"
                                />
                            </div>

                            {/* Priority */}
                            <div className="col-span-2">
                                <select
                                    value={page.priority}
                                    onChange={(e) => onUpdate(index, { priority: e.target.value as StaticPage['priority'] })}
                                    className="w-full px-2 py-1 bg-background border border-border text-[10px] font-mono focus:border-emerald-500 outline-none"
                                >
                                    {PRIORITY_OPTIONS.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.value}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Changefreq */}
                            <div className="col-span-3">
                                <select
                                    value={page.changefreq}
                                    onChange={(e) => onUpdate(index, { changefreq: e.target.value as StaticPage['changefreq'] })}
                                    className="w-full px-2 py-1 bg-background border border-border text-[10px] font-mono focus:border-emerald-500 outline-none"
                                >
                                    {CHANGEFREQ_OPTIONS.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Delete */}
                            <div className="col-span-1 flex justify-end">
                                <button
                                    onClick={() => onRemove(index)}
                                    className="p-1 text-red-500 hover:bg-red-500/10 transition-colors"
                                    title="Törlés"
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {pages.length === 0 && (
                    <div className="py-6 text-center border border-dashed border-border">
                        <Globe size={20} className="mx-auto opacity-20 mb-2" />
                        <p className="text-[10px] font-mono uppercase tracking-widest opacity-40">
                            Még nincsenek statikus oldalak
                        </p>
                    </div>
                )}
            </div>

            {/* Add New */}
            <div className="pt-3 border-t border-border space-y-2">
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={newPath}
                        onChange={(e) => setNewPath(e.target.value)}
                        placeholder="/útvonal"
                        className="flex-1 min-w-0 px-3 py-2 bg-background border border-dashed border-border text-sm font-mono focus:border-emerald-500 outline-none"
                        onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                    />
                    <input
                        type="text"
                        value={newLabel}
                        onChange={(e) => setNewLabel(e.target.value)}
                        placeholder="Címke"
                        className="w-24 px-2 py-2 bg-background border border-dashed border-border text-sm focus:border-emerald-500 outline-none"
                        onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                    />
                </div>
                <button
                    onClick={handleAdd}
                    disabled={!newPath.trim()}
                    className="w-full px-4 py-2 bg-emerald-500 text-white hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                    <Plus size={14} />
                    <span className="text-[10px] font-mono uppercase tracking-widest">Hozzáad</span>
                </button>
            </div>
        </div>
    );
}
