import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Layers, Layout, Box, Database } from 'lucide-react';
import { ADMIN_CONFIG } from '@/config/admin.config';
import { getMediaLibrary } from '@/api/media';
import { useContentStats } from '@/hooks/useContentStats';

const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.1,
            delayChildren: 0.2,
        },
    },
};

const itemVariants = {
    hidden: { y: 100, opacity: 0 },
    visible: {
        y: 0,
        opacity: 1,
        transition: { duration: 1.2, ease: [0.16, 1, 0.3, 1] },
    },
};
const year = new Date().getFullYear();

// --- TECHNICAL COMPONENTS ---
function TechBadge({ children }: { children: React.ReactNode }) {
    return <span className="px-1.5 py-0.5 border border-foreground/20 text-[9px] font-mono uppercase tracking-widest">{children}</span>;
}

// --- STAT BLOCK ---
function StatBlock({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
    return (
        <motion.div
            variants={itemVariants}
            className="group relative flex flex-col justify-between min-h-[220px] p-6 hover:bg-foreground hover:text-background transition-colors duration-500"
        >
            <div className="flex justify-between items-start">
                <span className="text-[10px] font-mono uppercase tracking-[0.2em]">{label}</span>
                <ArrowUpRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>

            <div className="mt-auto">
                <span className="text-7xl xl:text-8xl font-bold tracking-tighter leading-none block -ml-1">{value}</span>
                {sub && <span className="text-[10px] font-mono tracking-widest opacity-60 mt-2 block">{sub}</span>}
            </div>
        </motion.div>
    );
}

// --- BLUEPRINT CARD ---
// Now receives data as prop instead of fetching individually
function BlueprintCard({ slotKey, config, data }: {
    slotKey: string,
    config: typeof ADMIN_CONFIG[keyof typeof ADMIN_CONFIG],
    data: any // Pre-loaded from batch API
}) {

    const count = Array.isArray(data) ? data.length : (data ? 1 : 0);
    const image = Array.isArray(data) && data.length > 0 ? (data[0].thumbnail || data[0].image) : (data?.image || data?.thumbnail);

    // Icon selection - include massive type
    const Icon = config.type === 'massive' ? Database :
        config.type === 'collection' ? Layers :
            (config.type === 'list' ? Layout : Box);

    // Type label
    const typeLabel = config.type === 'massive' ? 'MASSIVE' :
        config.type === 'object' ? 'OBJEKTUM' :
            (config.type === 'list' ? 'LISTA' : 'GYŰJTEMÉNY');

    return (
        <motion.div variants={itemVariants} className="group relative h-[280px] bg-background border border-border hover:border-foreground transition-colors duration-300">
            <Link to={`/edit/${slotKey}`} className="flex flex-col h-full p-6">

                {/* 1. Header Spec Line */}
                <div className="flex items-center justify-between border-b border-border pb-4 mb-4 group-hover:border-foreground/50 transition-colors">
                    <div className="flex items-center gap-3">
                        <Icon strokeWidth={1} className="w-4 h-4 text-foreground/50 group-hover:text-foreground transition-colors" />
                        <span className="font-mono text-[10px] uppercase tracking-widest opacity-60">
                            {typeLabel} ref_0{Math.floor(Math.random() * 90) + 10}
                        </span>
                    </div>
                    <TechBadge>{config.type === 'massive' ? '∞' : count.toString().padStart(2, '0')}</TechBadge>
                </div>

                {/* 2. Main Title */}
                <div className="flex-1 flex flex-col justify-center relative z-10">
                    <h3 className="text-3xl font-light tracking-tight group-hover:scale-105 origin-left transition-transform duration-500">
                        {config.label}
                    </h3>
                    <p className="text-[10px] font-mono text-muted-foreground mt-2 max-w-[200px] leading-relaxed opacity-0 group-hover:opacity-100 transition-opacity duration-300 transform translate-y-2 group-hover:translate-y-0">
                        {config.description || "Rendszer modul konfigurációs csomópont."}
                    </p>
                </div>

                {/* 3. Footer Metadata */}
                <div className="mt-auto border-t border-border pt-4 flex justify-between items-center group-hover:border-foreground/50 transition-colors relative z-10">
                    <span className="text-[10px] font-mono uppercase tracking-widest opacity-40">ID: {slotKey.toUpperCase()}</span>
                    <ArrowUpRight className="w-4 h-4 opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all duration-300" />
                </div>

                {/* 4. HOVER IMAGE REVEAL */}
                {image && (
                    <div className="absolute inset-0 z-0 opacity-0 group-hover:opacity-10 pointer-events-none transition-opacity duration-500">
                        <img src={image} className="w-full h-full object-cover" />
                    </div>
                )}

                <div className="absolute inset-x-6 top-1/2 h-px bg-foreground/10 scale-x-0 group-hover:scale-x-100 transition-transform duration-700 delay-100" />
                <div className="absolute inset-y-6 left-1/2 w-px bg-foreground/10 scale-y-0 group-hover:scale-y-100 transition-transform duration-700 delay-200" />

            </Link>
        </motion.div>
    );
}



import { useAuth } from '@/context/AuthContext';

export default function Dashboard() {
    const { user } = useAuth();
    // slotData is already loaded by useContentStats - no need for separate batch call
    const { totalItems, dbSizeKB, activeModules, loading, slotData } = useContentStats();

    // Actual uploaded media files count (from media library API)
    const [mediaCount, setMediaCount] = useState<number | null>(null);
    const [mediaLoading, setMediaLoading] = useState(true);

    useEffect(() => {
        // Load media library count (this is the only separate API call we need)
        getMediaLibrary()
            .then(res => {
                if (res.success) {
                    setMediaCount(res.total);
                }
            })
            .catch(() => { })
            .finally(() => setMediaLoading(false));
    }, []);

    // --- STATE ---
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const dateString = currentTime.toLocaleDateString('hu-HU', { month: 'long', day: 'numeric', weekday: 'long' });
    const timeString = currentTime.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });

    return (
        <div className="relative min-h-[calc(100vh-64px)] w-full">
            {/* BACKGROUND: Only visible on Medium+ screens */}

            <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="relative z-10 space-y-32 pb-32"
            >
                {/* HERO TYPOGRAPHY */}
                <section className="pt-12 border-b border-foreground pb-6">
                    <motion.div variants={itemVariants} className="relative z-10">
                        <h1 className="text-[16vw] font-black leading-[0.75] tracking-tighter text-foreground mix-blend-normal select-none pointer-events-none">
                            DASH<br />BOARD<span className="text-foreground">.</span>
                        </h1>
                    </motion.div>

                    <div className="flex justify-between items-end px-2 mt-8">
                        <div>
                            <p className="text-4xl md:text-6xl font-thin tracking-tighter leading-none">{timeString}</p>
                            <p className="font-mono text-sm uppercase tracking-widest opacity-60 mt-1">{dateString}</p>
                        </div>

                        <p className="font-mono text-xs text-right uppercase tracking-widest opacity-60 max-w-[200px] border-l border-foreground/20 pl-4 hidden md:block">
                            NOMAD RENDSZER<br />
                            Architektúra V.1.0
                        </p>
                    </div>
                </section>

                {/* STATS STRIP */}
                <section className="border-b border-foreground">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-foreground">
                        {user?.is_admin ? (
                            <Link to="/users" className="group relative flex flex-col justify-between min-h-[220px] p-6 hover:bg-foreground hover:text-background transition-colors duration-500">
                                <div className="flex justify-between items-start">
                                    <span className="text-[10px] font-mono uppercase tracking-[0.2em]">ADMINISZTRÁCIÓ</span>
                                    <ArrowUpRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                                <div className="mt-auto">
                                    <span className="text-3xl font-bold tracking-tighter leading-none block">FELHASZNÁLÓK KEZELÉSE</span>
                                    <span className="text-[10px] font-mono tracking-widest opacity-60 mt-2 block">JOGOSULTSÁGOK & HOZZÁFÉRÉS</span>
                                </div>
                            </Link>
                        ) : (
                            <StatBlock label="Összes Tartalom" value={loading ? '...' : totalItems} sub="BEJEGYZÉS" />
                        )}
                        <Link to="/media" className="group relative flex flex-col justify-between min-h-[220px] p-6 hover:bg-foreground hover:text-background transition-colors duration-500">
                            <div className="flex justify-between items-start">
                                <span className="text-[10px] font-mono uppercase tracking-[0.2em]">FELTÖLTÖTT FÁJLOK</span>
                                <ArrowUpRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                            <div className="mt-auto">
                                <span className="text-7xl xl:text-8xl font-bold tracking-tighter leading-none block -ml-1">{mediaLoading ? '...' : mediaCount ?? 0}</span>
                                <span className="text-[10px] font-mono tracking-widest opacity-60 mt-2 block">MÉDIA KÖNYVTÁR MEGNYITÁSA →</span>
                            </div>
                        </Link>
                        {user?.is_admin ? (
                            <Link to="/logs" className="group relative flex flex-col justify-between min-h-[220px] p-6 hover:bg-foreground hover:text-background transition-colors duration-500">
                                <div className="flex justify-between items-start">
                                    <span className="text-[10px] font-mono uppercase tracking-[0.2em]">RENDSZER NAPLÓK</span>
                                    <ArrowUpRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                                <div className="mt-auto">
                                    <span className="text-3xl font-bold tracking-tighter leading-none block">NAPLÓK MEGTEKINTÉSE</span>
                                    <span className="text-[10px] font-mono tracking-widest opacity-60 mt-2 block">ESEMÉNYEK & HIBÁK →</span>
                                </div>
                            </Link>
                        ) : (
                            <StatBlock label="Adatbázis Méret" value={loading ? '...' : dbSizeKB} sub={loading ? '...' : 'KB JSON'} />
                        )}
                        {user?.is_admin ? (
                            <Link to="/webhooks" className="group relative flex flex-col justify-between min-h-[220px] p-6 hover:bg-foreground hover:text-background transition-colors duration-500">
                                <div className="flex justify-between items-start">
                                    <span className="text-[10px] font-mono uppercase tracking-[0.2em]">WEBHOOKS</span>
                                    <ArrowUpRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                                <div className="mt-auto">
                                    <span className="text-3xl font-bold tracking-tighter leading-none block">INTEGRÁCIÓK</span>
                                    <span className="text-[10px] font-mono tracking-widest opacity-60 mt-2 block">KÜLSŐ KAPCSOLATOK →</span>
                                </div>
                            </Link>
                        ) : (
                            <StatBlock label="Aktív Modulok" value={activeModules.toString().padStart(2, '0')} sub="KONFIGURÁLVA" />
                        )}
                    </div>
                </section>

                {/* EDITORIAL MODULES GRID */}
                <section>
                    <motion.div variants={itemVariants} className="flex items-center justify-between mb-12 px-2">
                        <h2 className="text-4xl font-bold tracking-tight">MODULOK</h2>
                        <span className="font-mono text-[10px] uppercase tracking-widest opacity-50 hidden md:block">
                        // TERVRAJZOK
                        </span>
                    </motion.div>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {Object.entries(ADMIN_CONFIG).map(([key, config]) => (
                            <BlueprintCard key={key} slotKey={key} config={config} data={slotData[key]} />
                        ))}
                    </div>
                </section>

                {/* FOOTER MANIFESTO */}
                <motion.section variants={itemVariants} className="border-t border-foreground pt-12 grid grid-cols-1 lg:grid-cols-2 gap-12 opacity-40 hover:opacity-100 transition-opacity duration-700">
                    <p className="text-2xl font-serif italic max-w-md">
                        "A forma követi a funkciót, de a stílus követi az adatot."
                    </p>
                    <div className="font-mono text-[10px] text-right space-y-1 uppercase tracking-widest">

                        <p>© {year} [V.N.]</p>
                    </div>
                </motion.section>
            </motion.div>
        </div>
    );
}
