import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Database,
    Layers,
    RefreshCw,
    Trash2,
    CheckCircle2,
    AlertCircle,
    HardDrive,
    Search,
    X,
    ArrowUpRight,
    Layout,
    Box,
    Sun,
    Moon,
} from 'lucide-react';
import { schemaService } from '@/services/schemaService';
import type { FullSchema as SchemaConfig, SlotConfig } from '@/services/schemaValidator';

// --- ANIMATION VARIANTS ---
const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.05,
            delayChildren: 0.1,
        },
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

// --- TECHNICAL COMPONENTS ---
function TechBadge({ children, variant = 'default' }: { children: React.ReactNode, variant?: 'default' | 'success' | 'error' | 'warning' }) {
    const colors = {
        default: 'border-foreground/20 text-foreground/80',
        success: 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5',
        error: 'border-red-500/50 text-red-600 dark:text-red-400 bg-red-500/5',
        warning: 'border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-500/5',
    };

    return (
        <span className={`px-1.5 py-0.5 border ${colors[variant]} text-[9px] font-mono uppercase tracking-widest transition-colors`}>
            {children}
        </span>
    );
}

function StatBlock({ label, value, sub, icon: Icon, onClick }: { label: string; value: string | number; sub?: string, icon?: any, onClick?: () => void }) {
    const Component = onClick ? 'button' : 'div';
    return (
        <Component
            onClick={onClick}
            className={`text-left w-full group relative flex flex-col justify-between min-h-[140px] p-5 border border-border bg-background hover:bg-foreground hover:text-background transition-colors duration-500 ${onClick ? 'cursor-pointer' : ''}`}
        >
            <div className="flex justify-between items-start w-full">
                <span className="text-[10px] font-mono uppercase tracking-[0.2em] opacity-80 group-hover:opacity-100">{label}</span>
                {Icon && <Icon className="w-4 h-4 opacity-40 group-hover:opacity-100 transition-opacity" />}
            </div>

            <div className="mt-auto">
                <span className="text-4xl md:text-5xl font-bold tracking-tighter leading-none block -ml-0.5">{value}</span>
                {sub && <span className="text-[10px] font-mono tracking-widest opacity-60 mt-2 block border-l border-current/20 pl-2">{sub}</span>}
            </div>
        </Component>
    );
}

function BlueprintRow({ slotKey, config, isExpanded, onToggle }: { slotKey: string, config: SlotConfig, isExpanded: boolean, onToggle: () => void }) {
    const Icon = config.type === 'massive' ? Database : config.type === 'collection' ? Layers : config.type === 'list' ? Layout : Box;
    const fieldCount = config.fields ? Object.keys(config.fields).length : 0;

    return (
        <motion.div
            variants={itemVariants}
            className={`group border border-border bg-background transition-all duration-300 ${isExpanded ? 'ring-1 ring-foreground/20 z-10' : 'hover:border-foreground/50'}`}
        >
            {/* Header / Summary */}
            <div
                onClick={onToggle}
                className="flex flex-col md:flex-row md:items-center p-4 md:p-0 cursor-pointer min-h-[80px]"
            >
                {/* ID Column */}
                <div className="md:w-64 p-4 md:border-r border-border md:h-20 flex flex-col justify-center">
                    <div className="flex items-center gap-3 mb-1">
                        <Icon strokeWidth={1.5} className="w-4 h-4 text-foreground/70" />
                        <span className="font-mono text-xs font-bold uppercase tracking-wider">{slotKey}</span>
                    </div>
                </div>

                {/* Info Column */}
                <div className="flex-1 p-4 md:px-6 flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-light tracking-tight group-hover:pl-2 transition-all duration-300">{config.label}</h3>
                        <p className="text-[10px] font-mono text-muted-foreground mt-1 opacity-60 group-hover:opacity-100 transition-opacity">
                            TÍPUS: {config.type.toUpperCase()} • MEZŐK: {fieldCount.toString().padStart(2, '0')}
                        </p>
                    </div>
                    <ArrowUpRight className={`w-4 h-4 transition-transform duration-300 ${isExpanded ? 'rotate-90' : 'opacity-0 group-hover:opacity-100'}`} />
                </div>
            </div>

            {/* EXPANDED CONTENT */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                        className="overflow-hidden border-t border-border/50 bg-muted/5"
                    >
                        <div className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* Metadata Column */}
                            <div>
                                <h4 className="text-[10px] font-mono uppercase tracking-widest opacity-40 mb-4 border-b border-border pb-2">Konfiguráció</h4>
                                <div className="space-y-4">
                                    <div className="grid grid-cols-[100px_1fr] gap-4 items-baseline">
                                        <span className="text-xs text-muted-foreground font-mono">DESCRIPTION</span>
                                        <p className="text-sm leading-relaxed">{config.description}</p>
                                    </div>
                                    <div className="grid grid-cols-[100px_1fr] gap-4 items-baseline">
                                        <span className="text-xs text-muted-foreground font-mono">ICON</span>
                                        <div className="flex items-center gap-2">
                                            <code className="bg-muted px-1.5 py-0.5 rounded text-xs">{config.icon}</code>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Fields Column */}
                            <div>
                                <h4 className="text-[10px] font-mono uppercase tracking-widest opacity-40 mb-4 border-b border-border pb-2">
                                    Mező Definíciók ({fieldCount})
                                </h4>
                                <div className="space-y-1">
                                    {Object.entries(config.fields || {}).map(([fieldKey, fieldConfig]: [string, any]) => (
                                        <div key={fieldKey} className="group/field flex items-center justify-between py-2 border-b border-border/40 hover:bg-background px-2 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-1.5 h-1.5 rounded-full ${fieldConfig.required ? 'bg-foreground' : 'bg-transparent border border-foreground/30'}`} />
                                                <span className="font-mono text-xs">{fieldKey}</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="text-[10px] uppercase tracking-wider opacity-50">{fieldConfig.type}</span>
                                                <TechBadge variant={fieldConfig.required ? 'default' : 'default'}>
                                                    {fieldConfig.required ? 'REQ' : 'OPT'}
                                                </TechBadge>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

export default function SchemaValidatorPage() {
    const [schema, setSchema] = useState<SchemaConfig | null>(null);
    const [validation, setValidation] = useState<{ success: boolean; errors?: any[] } | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [expandedSlots, setExpandedSlots] = useState<Set<string>>(new Set());
    const [activeView, setActiveView] = useState<'visual' | 'json' | 'validation' | 'cache'>('visual');
    const [cacheInfo, setCacheInfo] = useState<{ hasCache: boolean; cacheSize: string; version?: string }>({ hasCache: false, cacheSize: '0 B' });
    const [searchQuery, setSearchQuery] = useState('');
    const [darkMode, setDarkMode] = useState(() => {
        if (typeof window !== 'undefined') {
            return document.documentElement.classList.contains('dark');
        }
        return false;
    });

    const [isScrolled, setIsScrolled] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            // Hysteresis to prevent flickering:
            // - Activate compact mode when scrolling down past 50px
            // - Deactivate compact mode ONLY when scrolling back up near top (< 20px)
            if (!isScrolled && window.scrollY > 50) {
                setIsScrolled(true);
            } else if (isScrolled && window.scrollY < 20) {
                setIsScrolled(false);
            }
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, [isScrolled]);

    useEffect(() => {
        loadSchema();
    }, []);

    // Theme toggle handler
    useEffect(() => {
        if (darkMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [darkMode]);

    const loadSchema = async () => {
        setIsLoading(true);
        try {
            // Load whatever is available (cache first, then background refresh)
            const config = await schemaService.loadSchema();
            if (config) {
                const fullSchema = schemaService.getFullSchema();
                setSchema(fullSchema);

                const state = schemaService.getState();
                setCacheInfo({
                    hasCache: true,
                    cacheSize: 'Aktív',
                    version: state.version ?? undefined
                });
                validateSchema(fullSchema!);
            } else {
                // Failed to load anything
                setSchema(null);
                setCacheInfo({ hasCache: false, cacheSize: '0 B' });
            }
        } catch (error) {
            console.error("Failed to load schema:", error);
            setSchema(null);
        } finally {
            setIsLoading(false);
        }
    };


    const clearCache = async () => {
        setIsLoading(true);
        schemaService.clearCache();
        setSchema(null);
        setValidation(null);
        setCacheInfo({ hasCache: false, cacheSize: '0 B' });

        // Force refresh from server
        try {
            await schemaService.refreshSchema();
        } catch (e) {
            console.error("Refresh failed during clear cache:", e);
        }
        await loadSchema();
    };

    const validateSchema = (data: SchemaConfig) => {
        // Mock validation for UI demo
        if (data.slots && Object.keys(data.slots).length > 0) {
            setValidation({ success: true });
        } else {
            setValidation({ success: false, errors: [{ path: 'root', code: 'EMPTY_SCHEMA', message: 'No slots defined in schema.' }] });
        }
    };

    const toggleSlot = (key: string) => {
        const newSet = new Set(expandedSlots);
        if (newSet.has(key)) newSet.delete(key);
        else newSet.add(key);
        setExpandedSlots(newSet);
    };

    const expandAll = () => {
        if (schema?.slots) {
            setExpandedSlots(new Set(Object.keys(schema.slots)));
        }
    };

    const collapseAll = () => setExpandedSlots(new Set());
    const clearSearch = () => setSearchQuery('');

    // --- COMPUTED ---
    const filteredSlots = schema?.slots
        ? Object.entries(schema.slots).filter(([key, config]) => {
            if (!searchQuery) return true;
            const query = searchQuery.toLowerCase();
            return (
                key.toLowerCase().includes(query) ||
                config.label.toLowerCase().includes(query)
            );
        })
        : [];

    const slotCount = schema?.slots ? Object.keys(schema.slots).length : 0;
    const fieldCount = schema?.slots
        ? Object.values(schema.slots).reduce((acc, slot) =>
            acc + (slot.fields ? Object.keys(slot.fields).length : 0), 0)
        : 0;

    return (
        <div className="min-h-screen bg-background text-foreground transition-colors duration-500 font-sans">

            {/* HERO / HEADER SECTION */}
            <motion.div
                className={`sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border transition-all duration-500 ease-in-out`}
            >
                <div className="container mx-auto px-4 md:px-8">
                    <div className={`flex flex-col md:flex-row justify-between items-end transition-all duration-500 ease-in-out ${isScrolled ? 'py-4' : 'pb-6 pt-12 md:pt-16'}`}>

                        {/* Title Block */}
                        <motion.div variants={itemVariants} initial="hidden" animate="visible" className="flex flex-col justify-center">
                            <motion.h1
                                layout
                                className={`font-black leading-[0.85] tracking-tighter mix-blend-exclusion select-none transition-all duration-500 ${isScrolled ? 'text-2xl md:text-3xl' : 'text-4xl md:text-6xl'}`}
                            >
                                SÉMA<br />VALIDÁTOR<span className="text-emerald-500">.</span>
                            </motion.h1>

                            <motion.div
                                className={`flex items-center gap-4 overflow-hidden transition-all duration-500 ${isScrolled ? 'h-0 opacity-0 mt-0' : 'h-auto opacity-100 mt-6'}`}
                            >
                                <span className="font-mono text-[10px] uppercase tracking-widest opacity-60">VERZIÓ: {schema?.version || '0.0.0'}</span>
                                <div className="h-px w-12 bg-foreground/20" />
                                <span className="font-mono text-[10px] uppercase tracking-widest opacity-60 text-emerald-500 flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    RENDSZER AKTÍV
                                </span>
                            </motion.div>
                        </motion.div>

                        {/* Controls Block */}
                        <div className={`flex items-center gap-6 md:mb-1 w-full md:w-auto transition-all duration-500 ${isScrolled ? 'mt-2 md:mt-0' : 'mt-8 md:mt-0'}`}>
                            {/* Search */}
                            <div className="relative group flex-1 md:flex-none">
                                <Search className="absolute left-0 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground group-hover:text-foreground transition-colors" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="MODUL KERESÉSE..."
                                    className={`w-full md:w-64 bg-transparent border-b border-border py-2 pl-6 pr-8 text-xs font-mono tracking-widest uppercase focus:border-foreground outline-none transition-colors placeholder:text-muted-foreground/30 ${isScrolled ? 'bg-background/50' : ''}`}
                                />
                                {searchQuery && (
                                    <button onClick={clearSearch} className="absolute right-0 top-1/2 -translate-y-1/2 p-1 hover:text-red-500 transition-colors">
                                        <X className="w-3 h-3" />
                                    </button>
                                )}
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-3 border-l border-border pl-6">
                                <button onClick={() => setDarkMode(!darkMode)} className="p-2 hover:bg-foreground hover:text-background transition-colors">
                                    {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                                </button>
                                <button onClick={() => schemaService.refreshSchema().then(loadSchema)} disabled={isLoading} className="p-2 hover:bg-foreground hover:text-background transition-colors disabled:opacity-50">
                                    <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className={`flex items-center gap-8 border-t border-border overflow-x-auto scrollbar-hide transition-all duration-500 ${isScrolled ? 'opacity-0 h-0 border-none overflow-hidden' : 'opacity-100 h-auto'}`}>
                        {[
                            { key: 'visual', label: 'VIZUÁLIS NÉZET' },
                            { key: 'json', label: 'NYERS JSON' },
                            { key: 'validation', label: 'VALIDÁLÁSI NAPLÓ' },
                            { key: 'cache', label: 'CACHE ÁLLAPOT' },
                        ].map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveView(tab.key as any)}
                                className={`relative py-4 text-[10px] font-mono uppercase tracking-[0.2em] transition-colors whitespace-nowrap ${activeView === tab.key ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                {tab.label}
                                {activeView === tab.key && (
                                    <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Compact Tabs (Shown when scrolled) */}
                <div className={`container mx-auto px-4 md:px-8 transition-all duration-500 overflow-hidden ${isScrolled ? 'h-10 opacity-100 border-t border-border/50' : 'h-0 opacity-0'}`}>
                    <div className="flex items-center gap-6 h-full overflow-x-auto scrollbar-hide">
                        {[
                            { key: 'visual', label: 'VIZUÁLIS' },
                            { key: 'json', label: 'JSON' },
                            { key: 'validation', label: 'VALIDÁLÁS' },
                            { key: 'cache', label: 'CACHE' },
                        ].map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveView(tab.key as any)}
                                className={`relative text-[9px] font-mono uppercase tracking-widest transition-colors ${activeView === tab.key ? 'text-foreground font-bold' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>
            </motion.div>

            {/* MAIN CONTENT */}
            <main className="container mx-auto px-4 md:px-8 py-12 min-h-[110vh]">
                <AnimatePresence mode="wait">

                    {/* VISUAL VIEW */}
                    {activeView === 'visual' && (
                        <motion.div
                            key="visual"
                            variants={containerVariants}
                            initial="hidden"
                            animate="visible"
                            exit={{ opacity: 0, y: 10 }}
                            className="space-y-12"
                        >
                            {/* Stats Data Grid */}
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-border border border-border">
                                <StatBlock icon={Layers} label="Aktív Slotok" value={slotCount.toString().padStart(2, '0')} sub="DEFINÍCIÓK" />
                                <StatBlock icon={Database} label="Összes Mező" value={fieldCount.toString().padStart(3, '0')} sub="TULAJDONSÁGOK" />
                                <StatBlock
                                    icon={validation?.success ? CheckCircle2 : AlertCircle}
                                    label="Rendszer Állapot"
                                    value={validation?.success ? 'OK' : 'HIBA'}
                                    sub={validation?.success ? 'VALIDÁLVA' : `${validation?.errors?.length} PROBLÉMA`}
                                    onClick={() => setActiveView('validation')}
                                />
                                <StatBlock
                                    icon={HardDrive}
                                    label="Helyi Tároló"
                                    value={cacheInfo.hasCache ? 'BE' : 'KI'}
                                    sub={cacheInfo.cacheSize}
                                    onClick={() => setActiveView('cache')}
                                />
                            </div>

                            {/* Toolbar */}
                            <div className="flex justify-between items-end border-b border-border pb-2">
                                <span className="text-[10px] font-mono uppercase tracking-widest opacity-40">
                                    // SLOT JEGYZÉK {searchQuery && `(SZŰRŐ: "${searchQuery}")`}
                                </span>
                                <div className="flex gap-4">
                                    <button onClick={expandAll} className="text-[10px] font-mono uppercase tracking-widest hover:underline decoration-foreground/30 underline-offset-4">ÖSSZES NYITÁSA</button>
                                    <button onClick={collapseAll} className="text-[10px] font-mono uppercase tracking-widest hover:underline decoration-foreground/30 underline-offset-4">ÖSSZES ZÁRÁSA</button>
                                </div>
                            </div>

                            {/* Slots List */}
                            <div className="space-y-2">
                                {filteredSlots.length > 0 ? (
                                    filteredSlots.map(([key, config]) => (
                                        <BlueprintRow
                                            key={key}
                                            slotKey={key}
                                            config={config}
                                            isExpanded={expandedSlots.has(key) || !!searchQuery}
                                            onToggle={() => toggleSlot(key)}
                                        />
                                    ))
                                ) : (
                                    <div className="py-32 text-center border-2 border-dashed border-border opacity-50">
                                        <p className="font-mono text-xs uppercase tracking-widest">NINCS TALÁLAT</p>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}

                    {/* JSON VIEW */}
                    {activeView === 'json' && (
                        <motion.div
                            key="json"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="bg-zinc-950 text-zinc-50 font-mono text-xs p-8 rounded-none border border-border shadow-2xl relative group"
                        >
                            <button
                                onClick={() => navigator.clipboard.writeText(JSON.stringify(schema, null, 2))}
                                className="absolute top-4 right-4 text-[10px] uppercase tracking-widest border border-white/20 px-2 py-1 hover:bg-white hover:text-black transition-colors opacity-0 group-hover:opacity-100"
                            >
                                Másolás
                            </button>
                            <pre className="overflow-auto max-h-[70vh] custom-scrollbar">
                                {JSON.stringify(schema, null, 2)}
                            </pre>
                        </motion.div>
                    )}

                    {/* VALIDATION VIEW */}
                    {activeView === 'validation' && (
                        <motion.div
                            key="validation"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="max-w-3xl mx-auto"
                        >
                            {validation?.success ? (
                                <div className="text-center py-20 px-8 border border-emerald-500/20 bg-emerald-500/5">
                                    <CheckCircle2 className="w-16 h-16 mx-auto text-emerald-500 mb-6" />
                                    <h2 className="text-2xl font-bold mb-2">SIKERES VALIDÁLÁS</h2>
                                    <p className="font-mono text-xs text-emerald-600/70 uppercase tracking-widest">Nem található strukturális hiba</p>
                                    <div className="mt-12 h-px w-32 bg-emerald-500/20 mx-auto" />
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="p-6 border border-red-500/30 bg-red-500/5 flex items-center gap-4">
                                        <AlertCircle className="w-8 h-8 text-red-500" />
                                        <div>
                                            <h2 className="text-xl font-bold text-red-600">VALIDÁLÁS SIKERTELEN</h2>
                                            <p className="font-mono text-xs text-red-500/70 uppercase tracking-widest">{validation?.errors?.length} HIBA TALÁLHATÓ</p>
                                        </div>
                                    </div>
                                    <div className="grid gap-2">
                                        {validation?.errors?.map((err, i) => (
                                            <div key={i} className="p-4 border border-border bg-background flex items-start gap-4 hover:border-red-500/40 transition-colors">
                                                <span className="font-mono text-[10px] opacity-40 mt-1">{(i + 1).toString().padStart(2, '0')}</span>
                                                <div>
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="font-mono text-xs font-bold">{err.path || 'ROOT'}</span>
                                                        <span className="text-[10px] bg-red-500/10 text-red-500 px-1.5 py-0.5">{err.code}</span>
                                                    </div>
                                                    <p className="text-sm opacity-80">{err.message}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    )}

                    {/* CACHE VIEW */}
                    {activeView === 'cache' && (
                        <motion.div
                            key="cache"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="max-w-xl mx-auto border border-border bg-background p-8 max-h-[70vh] overflow-y-auto custom-scrollbar"
                        >
                            <div className="flex items-start justify-between mb-8">
                                <div>
                                    <h2 className="text-xl font-bold">HELYI CACHE</h2>
                                    <p className="text-[10px] font-mono text-muted-foreground mt-1 uppercase tracking-widest">BÖNGÉSZŐ TÁROLÓ VIZSGÁLÓ</p>
                                </div>
                                <HardDrive className="w-6 h-6 opacity-20" />
                            </div>

                            <div className="space-y-6">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-4 bg-muted/20 border border-border">
                                        <span className="text-[10px] font-mono uppercase opacity-50 block mb-2">ÁLLAPOT</span>
                                        <span className={`text-lg font-bold ${cacheInfo.hasCache ? 'text-emerald-500' : 'text-amber-500'}`}>
                                            {cacheInfo.hasCache ? 'AKTÍV' : 'ÜRES'}
                                        </span>
                                    </div>
                                    <div className="p-4 bg-muted/20 border border-border">
                                        <span className="text-[10px] font-mono uppercase opacity-50 block mb-2">MÉRET</span>
                                        <span className="text-lg font-mono">{cacheInfo.cacheSize}</span>
                                    </div>
                                </div>

                                {cacheInfo.version && (
                                    <div className="p-4 bg-muted/20 border border-border">
                                        <span className="text-[10px] font-mono uppercase opacity-50 block mb-2">VERZIÓ HASH</span>
                                        <code className="text-xs break-all opacity-80">{cacheInfo.version}</code>
                                    </div>
                                )}

                                <div className="pt-8 border-t border-border">
                                    <button
                                        onClick={clearCache}
                                        className="w-full py-4 border border-red-500/30 text-red-600 hover:bg-red-500 hover:text-white transition-all font-mono text-xs uppercase tracking-widest flex items-center justify-center gap-2 group"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                        HELYI CACHE TÖRLÉSE
                                    </button>
                                    <p className="text-[10px] text-center text-muted-foreground mt-4 opacity-60">
                                        Ez a művelet kikényszeríti a séma újratöltését a távoli szerverről.
                                    </p>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>
        </div>
    );
}
