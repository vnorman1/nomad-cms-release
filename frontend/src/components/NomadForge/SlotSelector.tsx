/**
 * SlotSelector - Select target data slot from admin.config
 * Supports all slot types: massive, list, collection, object
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Database, ChevronDown, Check, Search, Lock, List, Layers, FileJson } from 'lucide-react';

export type SlotType = 'massive' | 'list' | 'collection' | 'object';

export interface SlotOption {
    id: string;
    label: string;
    description?: string;
    icon?: string;
    fieldCount: number;
    encrypted?: boolean;
    slotType: SlotType;
}

// Slot type specific icons
const SLOT_TYPE_ICONS: Record<SlotType, typeof Database> = {
    massive: Database,
    list: List,
    collection: Layers,
    object: FileJson,
};

// Slot type Hungarian labels
const SLOT_TYPE_LABELS: Record<SlotType, string> = {
    massive: 'Massive',
    list: 'Lista',
    collection: 'Gyűjtemény',
    object: 'Objektum',
};

// Slot type colors for badges
const SLOT_TYPE_COLORS: Record<SlotType, string> = {
    massive: 'bg-purple-500/20 text-purple-600 dark:text-purple-400',
    list: 'bg-blue-500/20 text-blue-600 dark:text-blue-400',
    collection: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400',
    object: 'bg-amber-500/20 text-amber-600 dark:text-amber-400',
};

interface SlotSelectorProps {
    slots: SlotOption[];
    selectedSlot: string | null;
    onSelect: (slotId: string) => void;
}

export function SlotSelector({ slots, selectedSlot, onSelect }: SlotSelectorProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');

    const filteredSlots = slots.filter(slot =>
        slot.label.toLowerCase().includes(search.toLowerCase()) ||
        slot.id.toLowerCase().includes(search.toLowerCase())
    );

    const selectedSlotData = slots.find(s => s.id === selectedSlot);

    return (
        <div className="relative">
            {/* Trigger Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`
                    w-full flex items-center gap-3 p-4 
                    border rounded-lg transition-all
                    ${isOpen ? 'border-foreground bg-foreground/5' : 'border-border hover:border-foreground/50'}
                `}
            >
                <div className="w-10 h-10 rounded-lg bg-foreground/10 flex items-center justify-center">
                    {(() => {
                        const IconComponent = selectedSlotData
                            ? SLOT_TYPE_ICONS[selectedSlotData.slotType]
                            : Database;
                        return <IconComponent size={18} className="opacity-60" />;
                    })()}
                </div>
                <div className="flex-1 text-left">
                    {selectedSlotData ? (
                        <>
                            <div className="font-mono text-sm font-medium flex items-center gap-2">
                                {selectedSlotData.label}
                                <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-semibold ${SLOT_TYPE_COLORS[selectedSlotData.slotType]}`}>
                                    {SLOT_TYPE_LABELS[selectedSlotData.slotType]}
                                </span>
                                {selectedSlotData.encrypted && (
                                    <Lock size={12} className="text-amber-500" />
                                )}
                            </div>
                            <div className="text-xs opacity-50">
                                {selectedSlotData.fieldCount} mező • {selectedSlotData.id}
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="text-sm opacity-60">Válassz cél adatbázist</div>
                            <div className="text-xs opacity-30">Minden slot típus támogatott</div>
                        </>
                    )}
                </div>
                <motion.div
                    animate={{ rotate: isOpen ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                >
                    <ChevronDown size={18} className="opacity-40" />
                </motion.div>
            </button>

            {/* Dropdown */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="absolute z-50 top-full left-0 right-0 mt-2 bg-background border border-border rounded-lg shadow-xl overflow-hidden"
                    >
                        {/* Search */}
                        <div className="p-2 border-b border-border">
                            <div className="relative">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-30" />
                                <input
                                    type="text"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Keresés..."
                                    className="w-full pl-9 pr-3 py-2 text-sm bg-foreground/5 border-0 rounded focus:outline-none focus:ring-1 focus:ring-foreground"
                                    autoFocus
                                    autoComplete="off"
                                />
                            </div>
                        </div>

                        {/* Options */}
                        <div className="max-h-64 overflow-y-auto">
                            {filteredSlots.length === 0 ? (
                                <div className="p-4 text-center text-sm opacity-50">
                                    Nincs találat
                                </div>
                            ) : (
                                filteredSlots.map((slot) => (
                                    <button
                                        key={slot.id}
                                        onClick={() => {
                                            onSelect(slot.id);
                                            setIsOpen(false);
                                            setSearch('');
                                        }}
                                        className={`
                                            w-full flex items-center gap-3 p-3 
                                            hover:bg-foreground/5 transition-colors text-left
                                            ${selectedSlot === slot.id ? 'bg-foreground/10' : ''}
                                        `}
                                    >
                                        <div className={`
                                            w-8 h-8 rounded flex items-center justify-center
                                            ${selectedSlot === slot.id ? 'bg-foreground text-background' : 'bg-foreground/10'}
                                        `}>
                                            {(() => {
                                                const IconComponent = SLOT_TYPE_ICONS[slot.slotType];
                                                return <IconComponent size={14} />;
                                            })()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-mono text-sm truncate flex items-center gap-2">
                                                {slot.label}
                                                <span className={`text-[9px] px-1 py-0.5 rounded uppercase font-semibold ${SLOT_TYPE_COLORS[slot.slotType]}`}>
                                                    {SLOT_TYPE_LABELS[slot.slotType]}
                                                </span>
                                                {slot.encrypted && (
                                                    <Lock size={10} className="text-amber-500" />
                                                )}
                                            </div>
                                            <div className="text-xs opacity-50 truncate">
                                                {slot.fieldCount} mező
                                            </div>
                                        </div>
                                        {selectedSlot === slot.id && (
                                            <Check size={16} className="text-emerald-500" />
                                        )}
                                    </button>
                                ))
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Backdrop */}
            {isOpen && (
                <div
                    className="fixed inset-0 z-40"
                    onClick={() => {
                        setIsOpen(false);
                        setSearch('');
                    }}
                />
            )}
        </div>
    );
}
