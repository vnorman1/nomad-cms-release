/**
 * Schema Builder Page
 * 
 * Comprehensive visual schema builder for NOMAD CMS.
 * Features:
 * - LocalStorage autosave
 * - URL-based sharing with LZString compression
 * - Import/Export JSON
 * - Visual slot and field editing
 * - Massive config with encryption and blind indexing
 */

import { useState, useEffect } from 'react';
import { useUI } from '@/context/UIContext';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Plus,
    Share2,
    FileJson,
    Trash2,
    Sun,
    Moon,
    Box,
    Layers,
    Layout,
    Database,
    ChevronLeft,
    Lock,
    HardDrive,
} from 'lucide-react';

import {
    useSchemaBuilder,
    SlotEditor,
    JsonPreview,
    ShareUrlModal,
    ImportExportPanel,
    StaticPagesEditor,
} from '@/components/SchemaBuilder';

// Animation variants
const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.05, delayChildren: 0.1 },
    },
};

const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
        y: 0,
        opacity: 1,
        transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] },
    },
};

export default function SchemaBuilderPage() {
    const builder = useSchemaBuilder();
    const { confirm } = useUI();

    const [darkMode, setDarkMode] = useState(() => {
        if (typeof window !== 'undefined') {
            return document.documentElement.classList.contains('dark');
        }
        return false;
    });
    const [showShareModal, setShowShareModal] = useState(false);
    const [showImportExport, setShowImportExport] = useState(false);
    const [newSlotKey, setNewSlotKey] = useState('');
    const [jsonCollapsed, setJsonCollapsed] = useState(false);

    // Theme toggle
    useEffect(() => {
        if (darkMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [darkMode]);

    const handleAddSlot = () => {
        if (newSlotKey.trim()) {
            builder.addSlot(newSlotKey.trim().replace(/\s/g, '_').toLowerCase());
            setNewSlotKey('');
        }
    };

    const handleReset = () => {
        confirm({
            title: 'Séma törlése',
            message: 'Biztosan törölni szeretnéd a teljes sémát? Ez a művelet nem visszavonható.',
            confirmLabel: 'Törlés',
            cancelLabel: 'Mégse',
            isDestructive: true,
            onConfirm: () => {
                builder.resetSchema();
                builder.clearLocalStorage();
            },
        });
    };

    const slotKeys = Object.keys(builder.schema.slots);
    const selectedSlot = builder.selectedSlotKey ? builder.schema.slots[builder.selectedSlotKey] : null;

    // Slot icon mapper
    const getSlotIcon = (type: string) => {
        switch (type) {
            case 'massive': return Database;
            case 'collection': return Layers;
            case 'list': return Layout;
            default: return Box;
        }
    };

    return (
        <div className="min-h-screen bg-background text-foreground transition-colors duration-500 font-sans">
            {/* Header */}
            <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border">
                <div className="container mx-auto px-4 md:px-8">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center py-4 gap-4">
                        {/* Title */}
                        <div className="flex items-center gap-4">
                            <h1 className="font-black text-xl md:text-2xl tracking-tighter">
                                SÉMA BUILDER<span className="text-purple-500">.</span>
                            </h1>
                            <div className="hidden md:flex items-center gap-3">
                                <div className="h-4 w-px bg-border" />
                                <span className="font-mono text-[9px] uppercase tracking-widest opacity-50">
                                    v{builder.schema.version || '1.0.0'}
                                </span>
                                <div className="flex items-center gap-1 text-purple-500">
                                    <HardDrive size={10} />
                                    <span className="font-mono text-[9px] uppercase tracking-widest">
                                        AUTOSAVE
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 w-full md:w-auto">
                            <button
                                onClick={() => setShowImportExport(true)}
                                className="px-3 py-2 border border-border hover:border-foreground hover:bg-foreground hover:text-background transition-colors text-[10px] font-mono uppercase tracking-widest flex items-center gap-2"
                            >
                                <FileJson size={12} />
                                <span className="hidden sm:inline">Import/Export</span>
                            </button>
                            <button
                                onClick={() => setShowShareModal(true)}
                                className="px-3 py-2 bg-foreground text-background hover:bg-foreground/90 transition-colors text-[10px] font-mono uppercase tracking-widest flex items-center gap-2"
                            >
                                <Share2 size={12} />
                                <span className="hidden sm:inline">Megosztás</span>
                            </button>
                            <div className="h-6 w-px bg-border" />
                            <button
                                onClick={handleReset}
                                className="p-2 text-red-500 border border-red-500/30 hover:bg-red-500 hover:text-white transition-colors"
                                title="Séma törlése"
                            >
                                <Trash2 size={14} />
                            </button>
                            <button
                                onClick={() => setDarkMode(!darkMode)}
                                className="p-2 hover:bg-foreground hover:text-background transition-colors border border-border"
                            >
                                {darkMode ? <Sun size={14} /> : <Moon size={14} />}
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="container mx-auto px-4 md:px-8 py-8">
                <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                    className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[70vh]"
                >
                    {/* Sidebar - Slot List */}
                    <motion.aside
                        variants={itemVariants}
                        className="lg:col-span-3 space-y-4"
                    >
                        {/* Schema Metadata */}
                        <details className="border border-border bg-background group" open>
                            <summary className="p-3 cursor-pointer flex items-center justify-between text-[9px] font-mono uppercase tracking-widest opacity-50 hover:opacity-100 transition-opacity">
                                <span>Schema Metaadatok</span>
                                <ChevronLeft size={12} className="transform transition-transform group-open:-rotate-90" />
                            </summary>
                            <div className="p-3 pt-0 space-y-3 border-t border-border">
                                {/* $id */}
                                <div>
                                    <label className="text-[8px] font-mono uppercase tracking-widest opacity-40 block mb-1">
                                        Schema ID
                                    </label>
                                    <input
                                        type="text"
                                        value={builder.schema.$id || ''}
                                        onChange={(e) => builder.updateSchemaMetadata({ $id: e.target.value || undefined })}
                                        placeholder="my-project-schema"
                                        className="w-full px-2 py-1.5 bg-background border border-border text-xs font-mono focus:border-purple-500 outline-none"
                                    />
                                </div>
                                {/* Version */}
                                <div>
                                    <label className="text-[8px] font-mono uppercase tracking-widest opacity-40 block mb-1">
                                        Verzió
                                    </label>
                                    <input
                                        type="text"
                                        value={builder.schema.version || '1.0.0'}
                                        onChange={(e) => builder.updateSchemaMetadata({ version: e.target.value })}
                                        placeholder="1.0.0"
                                        className="w-full px-2 py-1.5 bg-background border border-border text-xs font-mono focus:border-purple-500 outline-none"
                                    />
                                </div>
                                {/* Description */}
                                <div>
                                    <label className="text-[8px] font-mono uppercase tracking-widest opacity-40 block mb-1">
                                        Leírás
                                    </label>
                                    <input
                                        type="text"
                                        value={builder.schema.description || ''}
                                        onChange={(e) => builder.updateSchemaMetadata({ description: e.target.value || undefined })}
                                        placeholder="CMS séma leírása"
                                        className="w-full px-2 py-1.5 bg-background border border-border text-xs focus:border-purple-500 outline-none"
                                    />
                                </div>
                                {/* Schema URL (readonly) */}
                                <div className="text-[8px] opacity-30 font-mono truncate">
                                    $schema: json-schema.org/draft/2020-12
                                </div>
                            </div>
                        </details>

                        {/* Add Slot */}
                        <div className="p-4 border border-border bg-background">
                            <label className="text-[9px] font-mono uppercase tracking-widest opacity-50 block mb-2">
                                Új slot
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={newSlotKey}
                                    onChange={(e) => setNewSlotKey(e.target.value)}
                                    placeholder="slot_kulcs"
                                    className="flex-1 px-3 py-2 bg-background border border-dashed border-border text-sm font-mono focus:border-foreground outline-none"
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddSlot()}
                                />
                                <button
                                    onClick={handleAddSlot}
                                    disabled={!newSlotKey.trim()}
                                    className="px-3 py-2 bg-foreground text-background hover:bg-foreground/90 transition-colors disabled:opacity-50"
                                >
                                    <Plus size={16} />
                                </button>
                            </div>
                        </div>

                        {/* Slot List */}
                        <div className="border border-border bg-background">
                            <div className="p-3 border-b border-border flex items-center justify-between">
                                <span className="text-[9px] font-mono uppercase tracking-widest opacity-50">
                                    Slotok ({slotKeys.length})
                                </span>
                            </div>

                            <div className="max-h-[50vh] overflow-y-auto">
                                {slotKeys.length === 0 ? (
                                    <div className="p-8 text-center">
                                        <Box size={24} className="mx-auto opacity-20 mb-3" />
                                        <p className="text-[10px] font-mono uppercase tracking-widest opacity-40">
                                            Még nincsenek slotok
                                        </p>
                                        <p className="text-[9px] opacity-30 mt-1">
                                            Adj hozzá egyet fent
                                        </p>
                                    </div>
                                ) : (
                                    <AnimatePresence mode="popLayout">
                                        {slotKeys.map((key) => {
                                            const slot = builder.schema.slots[key];
                                            const SlotIcon = getSlotIcon(slot.type);
                                            const isSelected = key === builder.selectedSlotKey;
                                            const isEncrypted = slot.massive?.encrypted;

                                            return (
                                                <motion.button
                                                    key={key}
                                                    layout
                                                    initial={{ opacity: 0, x: -10 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    exit={{ opacity: 0, x: -10 }}
                                                    onClick={() => builder.selectSlot(key)}
                                                    className={`
                                                        w-full p-3 text-left transition-all flex items-center gap-3 border-b border-border/50
                                                        ${isSelected
                                                            ? 'bg-foreground text-background'
                                                            : 'hover:bg-foreground/5'
                                                        }
                                                    `}
                                                >
                                                    <SlotIcon size={14} className={isSelected ? '' : 'opacity-40'} />
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-mono text-xs font-medium truncate">
                                                                {key}
                                                            </span>
                                                            {isEncrypted && (
                                                                <Lock size={10} className={isSelected ? '' : 'text-amber-500'} />
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-0.5">
                                                            <span className={`text-[9px] uppercase tracking-wider ${isSelected ? 'opacity-70' : 'opacity-40'}`}>
                                                                {slot.type}
                                                            </span>
                                                            <span className={`text-[9px] ${isSelected ? 'opacity-70' : 'opacity-30'}`}>
                                                                • {slot.fields.length} mező
                                                            </span>
                                                        </div>
                                                    </div>
                                                </motion.button>
                                            );
                                        })}
                                    </AnimatePresence>
                                )}
                            </div>
                        </div>

                        {/* Stats */}
                        <div className="grid grid-cols-3 gap-2">
                            <div className="p-3 border border-border">
                                <div className="text-xl font-mono font-bold">
                                    {slotKeys.length.toString().padStart(2, '0')}
                                </div>
                                <div className="text-[8px] font-mono uppercase tracking-widest opacity-40">
                                    Slotok
                                </div>
                            </div>
                            <div className="p-3 border border-border">
                                <div className="text-xl font-mono font-bold">
                                    {Object.values(builder.schema.slots)
                                        .reduce((acc, s) => acc + s.fields.length, 0)
                                        .toString()
                                        .padStart(3, '0')}
                                </div>
                                <div className="text-[8px] font-mono uppercase tracking-widest opacity-40">
                                    Mezők
                                </div>
                            </div>
                            <div className="p-3 border border-emerald-500/30">
                                <div className="text-xl font-mono font-bold text-emerald-500">
                                    {(builder.schema.staticPages?.length || 0).toString().padStart(2, '0')}
                                </div>
                                <div className="text-[8px] font-mono uppercase tracking-widest opacity-40">
                                    Statikus
                                </div>
                            </div>
                        </div>

                        {/* Static Pages Editor */}
                        <StaticPagesEditor
                            pages={builder.schema.staticPages || []}
                            onAdd={builder.addStaticPage}
                            onRemove={builder.removeStaticPage}
                            onUpdate={builder.updateStaticPage}
                        />
                    </motion.aside>

                    {/* Main Editor */}
                    <motion.div
                        variants={itemVariants}
                        className="lg:col-span-6 border border-border bg-background min-h-[500px]"
                    >
                        <AnimatePresence mode="wait">
                            {selectedSlot && builder.selectedSlotKey ? (
                                <SlotEditor
                                    key={builder.selectedSlotKey}
                                    slotKey={builder.selectedSlotKey}
                                    slot={selectedSlot}
                                    onUpdate={(updates) => builder.updateSlot(builder.selectedSlotKey!, updates)}
                                    onRename={(newKey) => builder.renameSlot(builder.selectedSlotKey!, newKey)}
                                    onDelete={() => {
                                        confirm({
                                            title: 'Slot törlése',
                                            message: `Biztosan törölni szeretnéd a "${builder.selectedSlotKey}" slotot?`,
                                            confirmLabel: 'Törlés',
                                            cancelLabel: 'Mégse',
                                            isDestructive: true,
                                            onConfirm: () => {
                                                builder.removeSlot(builder.selectedSlotKey!);
                                            },
                                        });
                                    }}
                                    onAddField={(id) => builder.addField(builder.selectedSlotKey!, id)}
                                    onUpdateField={(index, updates) => builder.updateField(builder.selectedSlotKey!, index, updates)}
                                    onRemoveField={(index) => {
                                        confirm({
                                            title: 'Mező törlése',
                                            message: 'Biztosan törölni szeretnéd ezt a mezőt?',
                                            confirmLabel: 'Törlés',
                                            cancelLabel: 'Mégse',
                                            isDestructive: true,
                                            onConfirm: () => {
                                                builder.removeField(builder.selectedSlotKey!, index);
                                            },
                                        });
                                    }}
                                    onMoveField={(from, to) => builder.moveField(builder.selectedSlotKey!, from, to)}
                                />
                            ) : (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="h-full flex flex-col items-center justify-center p-8"
                                >
                                    <div className="w-16 h-16 border-2 border-dashed border-border flex items-center justify-center mb-4">
                                        <ChevronLeft size={24} className="opacity-20" />
                                    </div>
                                    <h3 className="font-mono text-sm uppercase tracking-widest opacity-40 mb-2">
                                        Válassz egy slotot
                                    </h3>
                                    <p className="text-[10px] opacity-30 text-center max-w-xs">
                                        Válassz ki egy slotot a bal oldali listából a szerkesztéshez,
                                        vagy adj hozzá egy újat.
                                    </p>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>

                    {/* JSON Preview */}
                    <motion.div
                        variants={itemVariants}
                        className="lg:col-span-3"
                    >
                        <JsonPreview
                            schema={builder.schema}
                            isCollapsed={jsonCollapsed}
                            onToggleCollapse={() => setJsonCollapsed(!jsonCollapsed)}
                        />

                        {/* URL Info */}
                        <div className="mt-4 p-4 border border-border">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[9px] font-mono uppercase tracking-widest opacity-50">
                                    URL hossz
                                </span>
                                <span className={`text-xs font-mono ${builder.isUrlSafe ? 'text-emerald-500' : 'text-amber-500'}`}>
                                    {builder.urlLength.toLocaleString()} kar
                                </span>
                            </div>
                            <div className="h-1.5 bg-border rounded-full overflow-hidden">
                                <div
                                    className={`h-full transition-all ${builder.isUrlSafe ? 'bg-emerald-500' : 'bg-amber-500'}`}
                                    style={{ width: `${Math.min(100, (builder.urlLength / 8000) * 100)}%` }}
                                />
                            </div>
                            <p className="text-[8px] opacity-40 mt-2">
                                {builder.isUrlSafe
                                    ? '✓ Az URL biztonságos hosszúságú'
                                    : 'Egyes böngészők nem támogatják ezt a hosszt'
                                }
                            </p>
                        </div>
                    </motion.div>
                </motion.div>
            </main >

            {/* Modals */}
            < ShareUrlModal
                isOpen={showShareModal}
                onClose={() => setShowShareModal(false)
                }
                shareUrl={builder.getShareUrl()}
                urlLength={builder.urlLength}
                isUrlSafe={builder.isUrlSafe}
            />

            <ImportExportPanel
                isOpen={showImportExport}
                onClose={() => setShowImportExport(false)}
                onImport={builder.importSchema}
                onImportSlot={(slotKey, slotConfig) => {
                    // Add the new slot from JSON data conversion
                    builder.addSlot(slotKey, slotConfig);
                }}
                exportJson={builder.exportSchema()}
            />
        </div >
    );
}
