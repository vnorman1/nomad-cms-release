/**
 * Webhook Form Component (v2)
 * 
 * Modal form for creating and editing outgoing webhooks.
 * Nomad Design System: Clean, minimalist, uppercase mono fonts.
 */

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle, Loader2, Check, ChevronDown, Database, Layout, Layers, Filter, Zap, ArrowUpRight, Settings, Info, Plus, Trash2, Eye, EyeOff, Clock } from 'lucide-react';
import { WebhookFormData, PayloadFieldsResponse, groupEventsByCategory, formatEventName } from '@/api/webhooks';
import { cn } from '@/lib/utils';
import { ADMIN_CONFIG } from '@/config/admin.config';

// Slot type definitions (now including object type with debouncing note)
const SLOT_TYPES = [
    { value: 'object', label: 'OBJECT', icon: Settings, debounced: true },
    { value: 'list', label: 'LISTA', icon: Layout, debounced: false },
    { value: 'collection', label: 'GYŰJTEMÉNY', icon: Layers, debounced: false },
    { value: 'massive', label: 'MASSIVE', icon: Database, debounced: false }
] as const;

interface SlotInfo {
    key: string;
    type: string;
    label: string;
}

interface WebhookFormProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: WebhookFormData) => Promise<void>;
    initialData?: Partial<WebhookFormData & { payload_fields?: string[], slot_filters?: string[], slot_type_filters?: string[], headers?: Record<string, string> | string[] }>;
    availableEvents: string[];
    payloadFields: PayloadFieldsResponse;
    availableSlots?: SlotInfo[];
    title: string;
    isEdit?: boolean;
}

// Custom header interface
interface CustomHeader {
    id: string;
    name: string;
    value: string;
    isVisible: boolean;
}

// Core/system fields that are always available
const CORE_PAYLOAD_FIELDS = [
    { key: 'id', label: 'ID', description: 'Rekord azonosító' },
    { key: 'slot', label: 'SLOT', description: 'Slot neve' },
    { key: 'slot_type', label: 'SLOT TÍPUS', description: 'object/list/collection/massive' },
    { key: 'timestamp', label: 'IDŐBÉLYEG', description: 'UTC időbélyeg' },
    { key: 'author_id', label: 'SZERZŐ ID', description: 'Felhasználó azonosító' },
    { key: 'content', label: 'TELJES TARTALOM', description: 'Az összes mező (JSON)' },
];

// Helper: ensure value is always an array (handles JSON strings from DB)
const ensureArray = (value: unknown): string[] => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }
    return [];
};

// Helper: convert headers from various formats to CustomHeader[]
const parseHeaders = (headers: unknown): CustomHeader[] => {
    if (!headers) return [];
    
    // If it's an array of strings (header names only from edit mode)
    if (Array.isArray(headers)) {
        return headers.map((name, index) => ({
            id: `header-${index}`,
            name: typeof name === 'string' ? name : '',
            value: '', // Values are encrypted, user needs to re-enter
            isVisible: false
        }));
    }
    
    // If it's an object (key-value pairs)
    if (typeof headers === 'object') {
        return Object.entries(headers as Record<string, string>).map(([name, value], index) => ({
            id: `header-${index}`,
            name,
            value: value || '',
            isVisible: false
        }));
    }
    
    return [];
};

export function WebhookForm({
    isOpen,
    onClose,
    onSubmit,
    initialData,
    availableEvents,
    // payloadFields - using dynamic fields from ADMIN_CONFIG instead
    availableSlots = [],
    title,
    isEdit = false
}: WebhookFormProps) {
    const [formData, setFormData] = useState<WebhookFormData>({
        name: initialData?.name || '',
        url: initialData?.url || '',
        events: ensureArray(initialData?.events),
        payload_fields: ensureArray(initialData?.payload_fields),
        slot_filters: ensureArray(initialData?.slot_filters),
        slot_type_filters: ensureArray(initialData?.slot_type_filters),
        retry_count: initialData?.retry_count ?? 3,
        timeout_seconds: initialData?.timeout_seconds ?? 30
    });
    const [customHeaders, setCustomHeaders] = useState<CustomHeader[]>(
        parseHeaders(initialData?.headers)
    );
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Start with filters tab
    const [activeSection, setActiveSection] = useState<'filters' | 'events' | 'payload' | 'headers'>('filters');

    // Group events by category
    const eventsByCategory = groupEventsByCategory(availableEvents);

    // Group slots by type (include all types now)
    const slotsByType = useMemo(() => {
        const grouped: Record<string, SlotInfo[]> = {};
        for (const slot of availableSlots) {
            if (!grouped[slot.type]) {
                grouped[slot.type] = [];
            }
            grouped[slot.type].push(slot);
        }
        return grouped;
    }, [availableSlots]);

    // Generate dynamic payload fields based on selected slots/types
    const dynamicPayloadFields = useMemo(() => {
        const fields: Array<{ key: string; label: string; description: string; source: string }> = [];
        const addedKeys = new Set<string>();

        // Determine which slots to check
        let slotsToCheck: string[] = [];

        if (formData.slot_filters && formData.slot_filters.length > 0) {
            // Specific slots selected
            slotsToCheck = formData.slot_filters;
        } else if (formData.slot_type_filters && formData.slot_type_filters.length > 0) {
            // Slot types selected - get all slots of those types
            slotsToCheck = availableSlots
                .filter(s => formData.slot_type_filters?.includes(s.type))
                .map(s => s.key);
        } else {
            // No filters - get all non-object slots
            slotsToCheck = availableSlots
                .filter(s => s.type !== 'object')
                .map(s => s.key);
        }

        // Extract fields from ADMIN_CONFIG for selected slots
        for (const slotKey of slotsToCheck) {
            const config = ADMIN_CONFIG[slotKey];
            if (!config?.fields) continue;

            for (const field of config.fields) {
                if (!addedKeys.has(field.id)) {
                    addedKeys.add(field.id);
                    fields.push({
                        key: field.id,
                        label: field.label,
                        description: `${field.type} mező`,
                        source: config.label
                    });
                }
            }
        }

        return fields;
    }, [formData.slot_filters, formData.slot_type_filters, availableSlots]);

    // Get selected slots info for display
    const selectedSlotsInfo = useMemo(() => {
        if (formData.slot_filters && formData.slot_filters.length > 0) {
            return formData.slot_filters.map(key => {
                const slot = availableSlots.find(s => s.key === key);
                return slot?.label || key;
            });
        }
        if (formData.slot_type_filters && formData.slot_type_filters.length > 0) {
            return formData.slot_type_filters.map(type => {
                const typeInfo = SLOT_TYPES.find(t => t.value === type);
                return typeInfo?.label || type;
            });
        }
        return ['ÖSSZES SLOT'];
    }, [formData.slot_filters, formData.slot_type_filters, availableSlots]);

    useEffect(() => {
        if (isOpen) {
            setFormData({
                name: initialData?.name || '',
                url: initialData?.url || '',
                events: ensureArray(initialData?.events),
                payload_fields: ensureArray(initialData?.payload_fields),
                slot_filters: ensureArray(initialData?.slot_filters),
                slot_type_filters: ensureArray(initialData?.slot_type_filters),
                retry_count: initialData?.retry_count ?? 3,
                timeout_seconds: initialData?.timeout_seconds ?? 30
            });
            setCustomHeaders(parseHeaders(initialData?.headers));
            setError(null);
            setActiveSection('filters');
        }
    }, [isOpen, initialData]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.name.trim()) {
            setError('Név megadása kötelező');
            return;
        }
        if (!formData.url.trim()) {
            setError('URL megadása kötelező');
            return;
        }
        if (!formData.url.startsWith('https://') && !formData.url.startsWith('http://localhost')) {
            setError('HTTPS URL kötelező (kivéve localhost)');
            return;
        }
        if (formData.events.length === 0) {
            setError('Legalább egy esemény kiválasztása kötelező');
            return;
        }

        // Validate custom headers
        const validHeaders: Record<string, string> = {};
        for (const header of customHeaders) {
            if (header.name.trim() && header.value.trim()) {
                validHeaders[header.name.trim()] = header.value;
            }
        }

        setLoading(true);
        setError(null);

        try {
            // Include headers in the submission
            const submitData = {
                ...formData,
                headers: Object.keys(validHeaders).length > 0 ? validHeaders : undefined
            };
            await onSubmit(submitData as WebhookFormData);
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Ismeretlen hiba');
        } finally {
            setLoading(false);
        }
    };

    const toggleEvent = (event: string) => {
        setFormData(prev => ({
            ...prev,
            events: prev.events.includes(event)
                ? prev.events.filter(e => e !== event)
                : [...prev.events, event]
        }));
    };

    const toggleCategory = (category: string) => {
        const categoryEvents = eventsByCategory[category] || [];
        const allSelected = categoryEvents.every(e => formData.events.includes(e));

        setFormData(prev => ({
            ...prev,
            events: allSelected
                ? prev.events.filter(e => !categoryEvents.includes(e))
                : [...new Set([...prev.events, ...categoryEvents])]
        }));
    };

    const togglePayloadField = (field: string) => {
        setFormData(prev => ({
            ...prev,
            payload_fields: prev.payload_fields?.includes(field)
                ? prev.payload_fields.filter(f => f !== field)
                : [...(prev.payload_fields || []), field]
        }));
    };

    const selectAllDynamicFields = () => {
        const allKeys = [...CORE_PAYLOAD_FIELDS.map(f => f.key), ...dynamicPayloadFields.map(f => f.key)];
        setFormData(prev => ({
            ...prev,
            payload_fields: [...new Set(allKeys)]
        }));
    };

    const clearPayloadFields = () => {
        setFormData(prev => ({
            ...prev,
            payload_fields: []
        }));
    };

    // Slot Type filter functions
    const toggleSlotTypeFilter = (type: string) => {
        setFormData(prev => ({
            ...prev,
            slot_type_filters: prev.slot_type_filters?.includes(type)
                ? prev.slot_type_filters.filter(t => t !== type)
                : [...(prev.slot_type_filters || []), type],
            // Clear individual slot filters when type filter changes
            slot_filters: []
        }));
    };

    const selectAllSlotTypes = () => {
        setFormData(prev => ({
            ...prev,
            slot_type_filters: SLOT_TYPES.map(t => t.value),
            slot_filters: []
        }));
    };

    const clearSlotTypeFilters = () => {
        setFormData(prev => ({
            ...prev,
            slot_type_filters: [],
            slot_filters: []
        }));
    };

    // Slot filter functions
    const toggleSlotFilter = (slot: string) => {
        setFormData(prev => ({
            ...prev,
            slot_filters: prev.slot_filters?.includes(slot)
                ? prev.slot_filters.filter(s => s !== slot)
                : [...(prev.slot_filters || []), slot],
            // Clear type filters when specific slots are selected
            slot_type_filters: []
        }));
    };

    const selectAllSlots = () => {
        setFormData(prev => ({
            ...prev,
            slot_filters: availableSlots.map(s => s.key),
            slot_type_filters: []
        }));
    };

    const clearSlotFilters = () => {
        setFormData(prev => ({
            ...prev,
            slot_filters: []
        }));
    };

    const getSlotCountByType = (type: string) => {
        return availableSlots.filter(s => s.type === type).length;
    };

    // Custom header management functions
    const addCustomHeader = () => {
        setCustomHeaders(prev => [
            ...prev,
            { id: `header-${Date.now()}`, name: '', value: '', isVisible: false }
        ]);
    };

    const updateCustomHeader = (id: string, field: 'name' | 'value', value: string) => {
        setCustomHeaders(prev =>
            prev.map(h => h.id === id ? { ...h, [field]: value } : h)
        );
    };

    const toggleHeaderVisibility = (id: string) => {
        setCustomHeaders(prev =>
            prev.map(h => h.id === id ? { ...h, isVisible: !h.isVisible } : h)
        );
    };

    const removeCustomHeader = (id: string) => {
        setCustomHeaders(prev => prev.filter(h => h.id !== id));
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-background border border-border w-full max-w-3xl shadow-2xl flex flex-col"
                >
                    {/* Header */}
                    <div className="p-6 border-b border-border flex justify-between items-center shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 border border-foreground/20 flex items-center justify-center">
                                <ArrowUpRight strokeWidth={1} size={16} />
                            </div>
                            <h3 className="text-xl font-light tracking-tight uppercase">{title}</h3>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-foreground hover:text-background transition-colors"
                        >
                            <X strokeWidth={1} size={20} />
                        </button>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="flex-1 overflow-auto max-h-[70vh]">
                        <div className="p-6 space-y-8">
                            {error && (
                                <div className="p-4 border border-red-500/50 bg-red-500/5 text-red-500 text-xs font-mono uppercase tracking-widest flex items-center gap-3">
                                    <AlertTriangle size={14} />
                                    {error}
                                </div>
                            )}

                            {/* Basic Info */}
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
                                        Webhook Neve
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="PL. ÉRTESÍTÉSEK SLACK-RE"
                                        value={formData.name}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        className="w-full h-10 px-4 bg-background border border-border text-sm focus:outline-none focus:border-foreground transition-all placeholder:text-muted-foreground/30"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
                                        Cél URL
                                    </label>
                                    <input
                                        type="url"
                                        required
                                        placeholder="HTTPS://EXAMPLE.COM/WEBHOOK"
                                        value={formData.url}
                                        onChange={e => setFormData({ ...formData, url: e.target.value })}
                                        className="w-full h-10 px-4 bg-background border border-border text-sm font-mono focus:outline-none focus:border-foreground transition-all placeholder:text-muted-foreground/30"
                                    />
                                </div>
                            </div>

                            {/* Section Tabs - Filters first! */}
                            <div className="flex items-center gap-1 border-b border-border">
                                {availableSlots.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setActiveSection('filters')}
                                        className={cn(
                                            "px-6 py-3 text-[10px] font-mono uppercase tracking-widest transition-all border-b-2 -mb-px flex items-center gap-2",
                                            activeSection === 'filters'
                                                ? "text-foreground border-foreground"
                                                : "text-muted-foreground border-transparent hover:text-foreground"
                                        )}
                                    >
                                        <Filter size={12} />
                                        Szűrők ({(formData.slot_type_filters?.length || 0) + (formData.slot_filters?.length || 0)})
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setActiveSection('events')}
                                    className={cn(
                                        "px-6 py-3 text-[10px] font-mono uppercase tracking-widest transition-all border-b-2 -mb-px flex items-center gap-2",
                                        activeSection === 'events'
                                            ? "text-foreground border-foreground"
                                            : "text-muted-foreground border-transparent hover:text-foreground"
                                    )}
                                >
                                    <Zap size={12} />
                                    Események ({formData.events.length})
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveSection('payload')}
                                    className={cn(
                                        "px-6 py-3 text-[10px] font-mono uppercase tracking-widest transition-all border-b-2 -mb-px flex items-center gap-2",
                                        activeSection === 'payload'
                                            ? "text-foreground border-foreground"
                                            : "text-muted-foreground border-transparent hover:text-foreground"
                                    )}
                                >
                                    <Database size={12} />
                                    Payload ({formData.payload_fields?.length || 0})
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveSection('headers')}
                                    className={cn(
                                        "px-6 py-3 text-[10px] font-mono uppercase tracking-widest transition-all border-b-2 -mb-px flex items-center gap-2",
                                        activeSection === 'headers'
                                            ? "text-foreground border-foreground"
                                            : "text-muted-foreground border-transparent hover:text-foreground"
                                    )}
                                >
                                    <Settings size={12} />
                                    Headers ({customHeaders.filter(h => h.name.trim()).length})
                                </button>
                            </div>

                            {/* Filters Section (FIRST) */}
                            {activeSection === 'filters' && availableSlots.length > 0 && (
                                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                    {/* Debouncing info for Object types */}
                                    <div className="p-4 border border-blue-500/20 bg-blue-500/5 flex items-start gap-3">
                                        <Clock size={14} className="text-blue-500 mt-0.5 shrink-0" />
                                        <div>
                                            <p className="text-[10px] font-mono uppercase tracking-widest text-blue-600 dark:text-blue-500 font-bold mb-1">
                                                Object típusú slotok támogatva
                                            </p>
                                            <p className="text-[10px] text-muted-foreground">
                                                Az Object típusú slotok webhookjai 10 másodperces késleltetéssel kerülnek kiküldésre (debouncing), 
                                                hogy a gyakori mentések ne generáljanak túl sok kérést.
                                            </p>
                                        </div>
                                    </div>

                                    {/* Slot Type Filters */}
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between border-b border-border pb-2">
                                            <div>
                                                <h4 className="text-xs font-bold uppercase tracking-widest">Slot Típus Szűrő</h4>
                                            </div>
                                            <div className="flex items-center gap-3 text-[10px] font-mono uppercase tracking-widest">
                                                <button type="button" onClick={selectAllSlotTypes} className="hover:text-foreground text-muted-foreground transition-colors">Összes</button>
                                                <span className="text-border">/</span>
                                                <button type="button" onClick={clearSlotTypeFilters} className="hover:text-foreground text-muted-foreground transition-colors">Törlés</button>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            {SLOT_TYPES.map(({ value, label, icon: Icon, debounced }) => {
                                                const count = getSlotCountByType(value);
                                                const isSelected = formData.slot_type_filters?.includes(value);

                                                return (
                                                    <button
                                                        key={value}
                                                        type="button"
                                                        onClick={() => toggleSlotTypeFilter(value)}
                                                        disabled={count === 0}
                                                        className={cn(
                                                            "flex items-center gap-3 px-4 py-3 text-left transition-all border group",
                                                            count === 0 ? "opacity-40 cursor-not-allowed border-border" : "",
                                                            isSelected
                                                                ? "bg-foreground text-background border-foreground"
                                                                : "bg-background hover:bg-foreground/5 border-border hover:border-foreground"
                                                        )}
                                                    >
                                                        <div className={cn(
                                                            "w-3 h-3 border flex items-center justify-center transition-colors shrink-0",
                                                            isSelected ? "border-background bg-background" : "border-foreground"
                                                        )}>
                                                            {isSelected && <Check size={8} className="text-foreground" />}
                                                        </div>
                                                        <Icon strokeWidth={1} size={14} className="shrink-0" />
                                                        <span className="text-[10px] font-mono uppercase tracking-widest">{label}</span>
                                                        {debounced && (
                                                            <span className={cn(
                                                                "text-[8px] font-mono uppercase px-1.5 py-0.5 rounded-sm flex items-center gap-1",
                                                                isSelected ? "bg-background/20 text-background" : "bg-blue-500/10 text-blue-500"
                                                            )}>
                                                                <Clock size={8} />
                                                                10s
                                                            </span>
                                                        )}
                                                        <span className="text-[10px] font-mono ml-auto opacity-60">({count})</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Individual Slot Filters */}
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between border-b border-border pb-2">
                                            <div>
                                                <h4 className="text-xs font-bold uppercase tracking-widest">Egyedi Slot Szűrő</h4>
                                            </div>
                                            <div className="flex items-center gap-3 text-[10px] font-mono uppercase tracking-widest">
                                                <button type="button" onClick={selectAllSlots} className="hover:text-foreground text-muted-foreground transition-colors">Összes</button>
                                                <span className="text-border">/</span>
                                                <button type="button" onClick={clearSlotFilters} className="hover:text-foreground text-muted-foreground transition-colors">Törlés</button>
                                            </div>
                                        </div>

                                        <div className="space-y-6 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                                            {Object.entries(slotsByType).map(([type, slots]) => {
                                                const typeInfo = SLOT_TYPES.find(t => t.value === type);
                                                if (!typeInfo) return null;
                                                const TypeIcon = typeInfo.icon;

                                                return (
                                                    <div key={type}>
                                                        <div className="flex items-center gap-2 mb-3 opacity-60">
                                                            <TypeIcon strokeWidth={1} size={12} />
                                                            <span className="text-[10px] font-mono uppercase tracking-widest">
                                                                {typeInfo.label}
                                                            </span>
                                                        </div>
                                                        <div className="flex flex-wrap gap-2">
                                                            {slots.map(slot => {
                                                                const isSelected = formData.slot_filters?.includes(slot.key);
                                                                return (
                                                                    <button
                                                                        key={slot.key}
                                                                        type="button"
                                                                        onClick={() => toggleSlotFilter(slot.key)}
                                                                        className={cn(
                                                                            "flex items-center gap-2 px-3 py-1.5 border text-[10px] font-mono uppercase tracking-widest transition-all",
                                                                            isSelected
                                                                                ? "bg-foreground text-background border-foreground"
                                                                                : "bg-background hover:bg-foreground/5 border-border hover:border-foreground"
                                                                        )}
                                                                    >
                                                                        <div className={cn(
                                                                            "w-2 h-2 border flex items-center justify-center transition-colors shrink-0",
                                                                            isSelected ? "border-background bg-background" : "border-foreground"
                                                                        )}>
                                                                            {isSelected && <Check size={6} className="text-foreground" />}
                                                                        </div>
                                                                        <span>{slot.label}</span>
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Events Section */}
                            {activeSection === 'events' && (
                                <div className="space-y-6 max-h-96 overflow-y-auto pr-2 custom-scrollbar animate-in fade-in slide-in-from-bottom-2 duration-300">
                                    {Object.entries(eventsByCategory).map(([category, events]) => {
                                        const allSelected = events.every(e => formData.events.includes(e));

                                        return (
                                            <div key={category} className="space-y-3">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleCategory(category)}
                                                    className="flex items-center gap-3 text-xs font-bold uppercase tracking-widest hover:text-foreground/80 transition-colors w-full border-b border-border pb-2"
                                                >
                                                    <div className={cn(
                                                        "w-3 h-3 border flex items-center justify-center transition-colors",
                                                        allSelected ? "bg-foreground border-foreground" : "border-foreground"
                                                    )}>
                                                        {allSelected && <Check size={8} className="text-background" />}
                                                    </div>
                                                    {category}
                                                </button>
                                                <div className="grid grid-cols-2 gap-2 pl-6">
                                                    {events.map(event => (
                                                        <button
                                                            key={event}
                                                            type="button"
                                                            onClick={() => toggleEvent(event)}
                                                            className={cn(
                                                                "flex items-center gap-3 px-3 py-2 text-[10px] font-mono uppercase tracking-widest text-left transition-all border",
                                                                formData.events.includes(event)
                                                                    ? "bg-foreground text-background border-foreground"
                                                                    : "bg-background text-muted-foreground hover:text-foreground border-border hover:border-foreground"
                                                            )}
                                                        >
                                                            <div className={cn(
                                                                "w-2 h-2 border flex items-center justify-center transition-colors shrink-0",
                                                                formData.events.includes(event)
                                                                    ? "bg-background border-background"
                                                                    : "border-foreground"
                                                            )}>
                                                                {formData.events.includes(event) && <Check size={6} className="text-foreground" />}
                                                            </div>
                                                            <span className="truncate">{formatEventName(event)}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Payload Fields Section (Dynamic based on filters) */}
                            {activeSection === 'payload' && (
                                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                    <div className="flex items-center justify-between border-b border-border pb-2">
                                        <div>
                                            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                                                Szűrő alapján: {selectedSlotsInfo.join(', ')}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-3 text-[10px] font-mono uppercase tracking-widest">
                                            <button type="button" onClick={selectAllDynamicFields} className="hover:text-foreground text-muted-foreground transition-colors">Összes</button>
                                            <span className="text-border">/</span>
                                            <button type="button" onClick={clearPayloadFields} className="hover:text-foreground text-muted-foreground transition-colors">Törlés</button>
                                        </div>
                                    </div>

                                    <div className="max-h-96 overflow-y-auto pr-2 custom-scrollbar space-y-6">
                                        {/* Core Fields */}
                                        <div className="space-y-3">
                                            <h5 className="text-xs font-bold uppercase tracking-widest text-blue-500">
                                                Rendszer mezők
                                            </h5>
                                            <div className="grid grid-cols-2 gap-2">
                                                {CORE_PAYLOAD_FIELDS.map(field => (
                                                    <button
                                                        key={field.key}
                                                        type="button"
                                                        onClick={() => togglePayloadField(field.key)}
                                                        className={cn(
                                                            "flex flex-col gap-1 px-3 py-2 text-left transition-all border",
                                                            formData.payload_fields?.includes(field.key)
                                                                ? "bg-blue-500/5 border-blue-500/50 text-blue-600"
                                                                : "bg-background border-border hover:border-foreground"
                                                        )}
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <div className={cn(
                                                                "w-2 h-2 border flex items-center justify-center transition-colors shrink-0",
                                                                formData.payload_fields?.includes(field.key)
                                                                    ? "bg-blue-500 border-blue-500"
                                                                    : "border-foreground"
                                                            )}>
                                                                {formData.payload_fields?.includes(field.key) && <Check size={6} className="text-white" />}
                                                            </div>
                                                            <span className="text-[10px] font-mono uppercase tracking-widest font-bold">
                                                                {field.label}
                                                            </span>
                                                        </div>
                                                        <span className="text-[10px] text-muted-foreground pl-4">
                                                            {field.description}
                                                        </span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Dynamic Fields from ADMIN_CONFIG */}
                                        {dynamicPayloadFields.length > 0 && (
                                            <div className="space-y-3">
                                                <h5 className="text-xs font-bold uppercase tracking-widest text-emerald-500">
                                                    Tartalom mezők ({dynamicPayloadFields.length})
                                                </h5>
                                                <div className="grid grid-cols-2 gap-2">
                                                    {dynamicPayloadFields.map(field => (
                                                        <button
                                                            key={field.key}
                                                            type="button"
                                                            onClick={() => togglePayloadField(field.key)}
                                                            className={cn(
                                                                "flex flex-col gap-1 px-3 py-2 text-left transition-all border",
                                                                formData.payload_fields?.includes(field.key)
                                                                    ? "bg-emerald-500/5 border-emerald-500/50 text-emerald-600"
                                                                    : "bg-background border-border hover:border-foreground"
                                                            )}
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <div className={cn(
                                                                    "w-2 h-2 border flex items-center justify-center transition-colors shrink-0",
                                                                    formData.payload_fields?.includes(field.key)
                                                                        ? "bg-emerald-500 border-emerald-500"
                                                                        : "border-foreground"
                                                                )}>
                                                                    {formData.payload_fields?.includes(field.key) && <Check size={6} className="text-white" />}
                                                                </div>
                                                                <span className="text-[10px] font-mono uppercase tracking-widest font-bold">
                                                                    {field.label}
                                                                </span>
                                                            </div>
                                                            <span className="text-[10px] text-muted-foreground pl-4">
                                                                {field.description} • {field.source}
                                                            </span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {dynamicPayloadFields.length === 0 && (
                                            <div className="text-center py-8 border border-dashed border-border">
                                                <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                                                    Nincs dinamikus mező a kiválasztott szűrőkhöz
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Custom Headers Section */}
                            {activeSection === 'headers' && (
                                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                    {/* Security info */}
                                    <div className="p-4 border border-emerald-500/20 bg-emerald-500/5 flex items-start gap-3">
                                        <Info size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                                        <div>
                                            <p className="text-[10px] font-mono uppercase tracking-widest text-emerald-600 dark:text-emerald-500 font-bold mb-1">
                                                Titkosított tárolás
                                            </p>
                                            <p className="text-[10px] text-muted-foreground">
                                                Az egyéni fejlécek titkosítva kerülnek tárolásra az adatbázisban. 
                                                Szerkesztéskor csak a fejléc nevek láthatók, az értékeket újra meg kell adni.
                                            </p>
                                        </div>
                                    </div>

                                    {/* Protected headers warning */}
                                    <div className="p-3 border border-amber-500/20 bg-amber-500/5">
                                        <p className="text-[10px] font-mono uppercase tracking-widest text-amber-600 dark:text-amber-500">
                                            Védett fejlécek (nem állíthatók): Content-Type, Host, X-Nomad-Signature, X-Webhook-*
                                        </p>
                                    </div>

                                    {/* Headers list */}
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between border-b border-border pb-2">
                                            <h4 className="text-xs font-bold uppercase tracking-widest">Egyéni HTTP Fejlécek</h4>
                                            <button
                                                type="button"
                                                onClick={addCustomHeader}
                                                className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest hover:text-foreground text-muted-foreground transition-colors"
                                            >
                                                <Plus size={12} />
                                                Új fejléc
                                            </button>
                                        </div>

                                        {customHeaders.length === 0 ? (
                                            <div className="text-center py-8 border border-dashed border-border">
                                                <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                                                    Nincs egyéni fejléc. Kattints az "Új fejléc" gombra.
                                                </span>
                                            </div>
                                        ) : (
                                            <div className="space-y-3 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                                                {customHeaders.map((header) => (
                                                    <div key={header.id} className="flex items-center gap-3 p-3 border border-border bg-background/50">
                                                        <div className="flex-1 space-y-2">
                                                            <input
                                                                type="text"
                                                                placeholder="HEADER-NAME"
                                                                value={header.name}
                                                                onChange={e => updateCustomHeader(header.id, 'name', e.target.value)}
                                                                className="w-full h-8 px-3 bg-background border border-border text-[10px] font-mono uppercase tracking-widest focus:outline-none focus:border-foreground transition-all placeholder:text-muted-foreground/30"
                                                            />
                                                            <div className="relative">
                                                                <input
                                                                    type={header.isVisible ? "text" : "password"}
                                                                    placeholder="Érték (pl. Bearer token)"
                                                                    value={header.value}
                                                                    onChange={e => updateCustomHeader(header.id, 'value', e.target.value)}
                                                                    className="w-full h-8 px-3 pr-10 bg-background border border-border text-xs focus:outline-none focus:border-foreground transition-all placeholder:text-muted-foreground/30"
                                                                />
                                                                <button
                                                                    type="button"
                                                                    onClick={() => toggleHeaderVisibility(header.id)}
                                                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                                                >
                                                                    {header.isVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                                                                </button>
                                                            </div>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => removeCustomHeader(header.id)}
                                                            className="p-2 text-red-500 hover:bg-red-500/10 transition-colors shrink-0"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Common headers quick-add */}
                                        <div className="pt-4 border-t border-border">
                                            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-3">
                                                Gyakori fejlécek:
                                            </p>
                                            <div className="flex flex-wrap gap-2">
                                                {['Authorization', 'X-API-Key', 'X-Custom-Token'].map(headerName => (
                                                    <button
                                                        key={headerName}
                                                        type="button"
                                                        onClick={() => {
                                                            const exists = customHeaders.some(h => h.name.toLowerCase() === headerName.toLowerCase());
                                                            if (!exists) {
                                                                setCustomHeaders(prev => [
                                                                    ...prev,
                                                                    { id: `header-${Date.now()}`, name: headerName, value: '', isVisible: false }
                                                                ]);
                                                            }
                                                        }}
                                                        disabled={customHeaders.some(h => h.name.toLowerCase() === headerName.toLowerCase())}
                                                        className={cn(
                                                            "px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest border transition-all",
                                                            customHeaders.some(h => h.name.toLowerCase() === headerName.toLowerCase())
                                                                ? "opacity-40 cursor-not-allowed border-border"
                                                                : "border-border hover:border-foreground hover:bg-foreground/5"
                                                        )}
                                                    >
                                                        + {headerName}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Advanced Settings */}
                            <details className="group border-t border-border pt-4">
                                <summary className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                                    <ChevronDown size={12} className="group-open:rotate-180 transition-transform" />
                                    Speciális Beállítások
                                </summary>
                                <div className="mt-6 grid grid-cols-2 gap-6 animate-in fade-in slide-in-from-top-2">
                                    <div>
                                        <label className="block text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
                                            Újrapróbálkozások (max)
                                        </label>
                                        <input
                                            type="number"
                                            min={1}
                                            max={10}
                                            value={formData.retry_count}
                                            onChange={e => {
                                                const val = parseInt(e.target.value) || 1;
                                                setFormData({ ...formData, retry_count: Math.min(Math.max(val, 1), 10) });
                                            }}
                                            className="w-full h-10 px-3 bg-background border border-border text-sm focus:outline-none focus:border-foreground transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
                                            Timeout (másodperc)
                                        </label>
                                        <input
                                            type="number"
                                            min={5}
                                            max={120}
                                            value={formData.timeout_seconds}
                                            onChange={e => {
                                                const val = parseInt(e.target.value) || 30;
                                                setFormData({ ...formData, timeout_seconds: Math.min(Math.max(val, 5), 120) });
                                            }}
                                            className="w-full h-10 px-3 bg-background border border-border text-sm focus:outline-none focus:border-foreground transition-all"
                                        />
                                    </div>
                                </div>
                            </details>
                        </div>

                        {/* Footer */}
                        <div className="p-6 border-t border-border flex justify-end gap-4 shrink-0 bg-background">
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={loading}
                                className="px-6 py-3 border border-border hover:bg-foreground hover:text-background text-[10px] font-mono uppercase tracking-widest transition-all disabled:opacity-50"
                            >
                                Mégse
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                className="px-8 py-3 bg-foreground text-background hover:bg-foreground/90 text-[10px] font-mono uppercase tracking-widest transition-all flex items-center gap-2 disabled:opacity-50"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 size={12} className="animate-spin" />
                                        MENTÉS...
                                    </>
                                ) : (
                                    isEdit ? 'MENTÉS' : 'LÉTREHOZÁS'
                                )}
                            </button>
                        </div>
                    </form>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
