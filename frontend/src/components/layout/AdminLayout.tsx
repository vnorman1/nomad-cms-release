import { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate, useLocation, useOutlet } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Menu,
    X,
    Search,
    Sun,
    Moon,
    LogOut,
    Settings,
} from 'lucide-react';
import { ADMIN_CONFIG, SlotConfig } from '@/config/admin.config';
import CommandPalette, { CommandPaletteHandle } from '@/components/CommandPalette';
import { useAuth } from '@/context/AuthContext';
import { useAi } from '@/context/AiContext';
import { ForcePasswordChange } from '@/components/auth/ForcePasswordChange';
import { GeminiChatbot } from '@/components/unique/GeminiChatbot';
import { useTheme } from '@/context/ThemeContext';

export default function AdminLayout() {
    const navigate = useNavigate();
    const location = useLocation();
    const outlet = useOutlet();
    const { logout } = useAuth();
    const { activeFormContext } = useAi();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const commandPaletteRef = useRef<CommandPaletteHandle>(null);

    const handleLogout = async () => {
        // Haptic feedback
        if (navigator.vibrate) {
            navigator.vibrate([30, 20, 30]);
        }
        await logout();
        navigate('/login');
    };



    // Theme Logic
    const { theme, toggleTheme } = useTheme();
    const darkMode = theme === 'dark';

    // Define extended config type using the explicit interface
    type ExtendedConfig = SlotConfig & { key: string };

    // Grouping logic (Hungarian headers) - include massive type
    const groupedSlots = Object.entries(ADMIN_CONFIG).reduce((acc, [key, config]) => {
        const type = config.type === 'object' ? 'Egyedi Tartalom' :
            config.type === 'massive' ? 'Adatbázisok' : 'Gyűjtemények';
        if (!acc[type]) acc[type] = [];
        acc[type].push({ key, ...config });
        return acc;
    }, {} as Record<string, ExtendedConfig[]>);

    return (
        <div className="min-h-screen flex bg-background text-foreground transition-colors duration-500 font-sans selection:bg-foreground selection:text-background">
            <CommandPalette ref={commandPaletteRef} />
            <ForcePasswordChange />

            <GeminiChatbot
                formContext={activeFormContext ? {
                    slotKey: activeFormContext.slotKey,
                    config: activeFormContext.config as any,
                    currentData: activeFormContext.currentData,
                    editingIndex: activeFormContext.editingIndex,
                } : undefined}
                onFillForm={activeFormContext?.onFillForm}
            />

            {/* NOMAD SIDEBAR */}
            <motion.aside
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.8 }}
                className="hidden lg:flex w-72 flex-col fixed left-0 top-0 bottom-0 z-[40] p-8 border-r border-border bg-background/50 backdrop-blur-sm supports-[backdrop-filter]:bg-background/20"
            >
                {/* BRANDING */}
                <div className="mb-12 pt-4">
                    <motion.h1
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 1.5, ease: [0.25, 1, 0.5, 1] }}
                        className="text-5xl font-black tracking-tighter leading-none mb-2 relative z-50"
                    >
                        NOMAD
                    </motion.h1>
                    <div className="flex flex-col gap-0.5 text-[9px] font-mono uppercase tracking-widest opacity-60">
                        <span>Norman Modular</span>
                        <span>Architecture Design</span>
                    </div>
                </div>

                {/* Navigation Blocks */}
                <nav className="flex-1 space-y-10 overflow-y-auto pr-4 scrollbar-hide">

                    {/* Dashboard Link */}
                    <div>
                        <NavLink
                            to="/"
                            className={({ isActive }) => `
                                group flex items-center justify-between text-sm font-medium tracking-wide transition-all duration-300 border-b border-transparent hover:border-foreground pb-1
                                ${isActive ? 'opacity-100 border-foreground' : 'opacity-40 hover:opacity-100'}
                            `}
                        >
                            <span>ÁTTEKINTÉS</span>
                            <span className="text-[9px] font-mono opacity-0 group-hover:opacity-100 transition-opacity">00</span>
                        </NavLink>
                    </div>

                    {/* Grouped Links */}
                    {Object.entries(groupedSlots).map(([group, slots], groupIndex) => (
                        <div key={group} className="space-y-4">
                            <h3 className="text-[9px] font-mono tracking-[0.2em] uppercase opacity-40">
                                // {group}
                            </h3>
                            <ul className="space-y-2">
                                {slots.map((slot, index) => (
                                    <li key={slot.key}>
                                        <NavLink
                                            to={`/edit/${slot.key}`}
                                            className={({ isActive }) => `
                                                group flex items-center justify-between py-1 transition-all duration-300
                                                ${isActive ? 'opacity-100' : 'opacity-40 hover:opacity-100'}
                                            `}
                                        >
                                            <span className="text-lg font-light tracking-tight group-hover:pl-2 transition-all">
                                                {slot.label}
                                            </span>
                                            {/* Technical Index */}
                                            <span className="text-[9px] font-mono opacity-20 group-hover:opacity-100">
                                                {groupIndex + 1}.{index}
                                            </span>
                                        </NavLink>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </nav>

                {/* Footer */}
                <div className="mt-8 pt-8 border-t border-border flex items-center justify-between">
                    {/* TYPEWRITER STATUS */}
                    <TypewriterText texts={['NOMAD', 'SYSTEM', 'ONLINE', 'NORMAN', 'MODULAR', 'ARCHITECTURE', 'DESIGN', '[V.N.]']} />

                    {/* THEME SWITCHER */}
                    <button
                        onClick={toggleTheme}
                        className="flex items-center gap-2 hover:bg-foreground hover:text-background px-2 py-1 transition-colors rounded-none"
                    >
                        {darkMode ? <Sun size={12} /> : <Moon size={12} />}
                        <span className="text-[9px] font-mono tracking-widest uppercase">
                            {darkMode ? 'VILÁGOS' : 'SÖTÉT'}
                        </span>
                    </button>
                </div>
            </motion.aside>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col min-w-0 lg:pl-72 transition-all duration-500">

                {/* Header */}
                <header className="h-20 flex items-center px-8 sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50 justify-between">

                    <div className="flex items-center gap-4 lg:hidden">
                        <button onClick={() => setMobileMenuOpen(true)}>
                            <Menu className="w-6 h-6" />
                        </button>
                        <span className="font-bold tracking-tighter">NOMAD</span>
                    </div>

                    {/* Mobile Search Button */}
                    <button
                        onClick={() => commandPaletteRef.current?.open()}
                        className="md:hidden p-2 opacity-60 hover:opacity-100 transition-opacity"
                    >
                        <Search className="w-5 h-5" />
                    </button>

                    {/* Search - Centered */}
                    <div className="hidden md:flex flex-1 justify-center px-8">
                        <button
                            onClick={() => commandPaletteRef.current?.open()}
                            className="relative group w-96 max-w-full text-left"
                        >
                            <Search className="absolute left-0 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground group-hover:text-foreground transition-colors" />
                            <div className="w-full bg-transparent border-b border-border py-2 pl-6 pr-12 text-xs font-mono tracking-widest text-muted-foreground/50 uppercase text-center group-hover:text-muted-foreground group-hover:border-foreground/50 transition-all">
                                KERESÉS...
                            </div>
                            <div className="absolute right-0 top-1/2 -translate-y-1/2 text-[9px] font-mono opacity-30 group-hover:opacity-60 border border-foreground/20 px-1 transition-opacity">
                                ⌘K
                            </div>
                        </button>
                    </div>

                    {/* User Controls - Right */}
                    <div className="flex items-center gap-6">
                        <NavLink
                            to="/settings"
                            className={({ isActive }) => `
                                opacity-50 hover:opacity-100 transition-opacity
                                ${isActive ? 'opacity-100' : ''}
                            `}
                        >
                            <Settings size={16} />
                        </NavLink>

                        <button
                            onClick={handleLogout}
                            className="opacity-50 hover:opacity-100 hover:text-destructive transition-all"
                        >
                            <LogOut size={16} />
                        </button>
                    </div>
                </header>

                {/* Content */}
                <div className="flex-1 px-8 lg:px-12 py-12">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={location.pathname}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.25, ease: 'easeOut' }}
                        >
                            {outlet}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </main>

            {/* Mobile Menu Overlay and Sidebar */}
            <AnimatePresence>
                {mobileMenuOpen && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setMobileMenuOpen(false)}
                            className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
                        />

                        {/* Sidebar Drawer */}
                        <motion.div
                            initial={{ x: '-100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '-100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            className="fixed inset-y-0 left-0 z-50 w-3/4 max-w-xs flex flex-col bg-background border-r border-border lg:hidden"
                        >
                            {/* Header */}
                            <div className="p-8 border-b border-border">
                                <div className="flex justify-between items-center mb-6">
                                    <h1 className="text-3xl font-black tracking-tighter">NOMAD</h1>
                                    <button onClick={() => setMobileMenuOpen(false)}>
                                        <X className="w-6 h-6 opacity-60 hover:opacity-100" />
                                    </button>
                                </div>
                                <div className="flex flex-col gap-0.5 text-[9px] font-mono uppercase tracking-widest opacity-60">
                                    <span>Norman Modular</span>
                                    <span>Architecture Design</span>
                                </div>
                            </div>

                            {/* Navigation */}
                            <nav className="flex-1 overflow-y-auto p-8 space-y-8">
                                {/* Dashboard */}
                                <div>
                                    <NavLink
                                        to="/"
                                        onClick={() => setMobileMenuOpen(false)}
                                        className={({ isActive }) => `
                                            group flex items-center justify-between text-sm font-medium tracking-wide transition-all duration-300 border-b border-transparent hover:border-foreground pb-1
                                            ${isActive ? 'opacity-100 border-foreground' : 'opacity-40 hover:opacity-100'}
                                        `}
                                    >
                                        <span>ÁTTEKINTÉS</span>
                                    </NavLink>
                                </div>

                                {/* Grouped Links */}
                                {Object.entries(groupedSlots).map(([group, slots], groupIndex) => (
                                    <div key={group} className="space-y-4">
                                        <h3 className="text-[9px] font-mono tracking-[0.2em] uppercase opacity-40">
                                            // {group}
                                        </h3>
                                        <ul className="space-y-3">
                                            {slots.map((slot, index) => (
                                                <li key={slot.key}>
                                                    <NavLink
                                                        to={`/edit/${slot.key}`}
                                                        onClick={() => setMobileMenuOpen(false)}
                                                        className={({ isActive }) => `
                                                            group flex items-center justify-between py-1 transition-all duration-300
                                                            ${isActive ? 'opacity-100' : 'opacity-40 hover:opacity-100'}
                                                        `}
                                                    >
                                                        <span className="text-base font-light tracking-tight group-hover:pl-2 transition-all">
                                                            {slot.label}
                                                        </span>
                                                        <span className="text-[9px] font-mono opacity-20 group-hover:opacity-100">
                                                            {groupIndex + 1}.{index}
                                                        </span>
                                                    </NavLink>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                            </nav>

                            {/* Footer */}
                            <div className="p-8 border-t border-border">
                                <button
                                    onClick={() => { toggleTheme(); setMobileMenuOpen(false); }}
                                    className="flex items-center gap-2 hover:bg-foreground hover:text-background px-2 py-1 transition-colors w-full"
                                >
                                    {darkMode ? <Sun size={14} /> : <Moon size={14} />}
                                    <span className="text-[10px] font-mono tracking-widest uppercase">
                                        {darkMode ? 'VILÁGOS MÓD' : 'SÖTÉT MÓD'}
                                    </span>
                                </button>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}

function TypewriterText({ texts }: { texts: string[] }) {
    const [textIndex, setTextIndex] = useState(0);
    const [displayText, setDisplayText] = useState('');
    const [phase, setPhase] = useState<'typing' | 'pausing' | 'deleting'>('typing');

    useEffect(() => {
        const currentFullText = texts[textIndex];

        const typeSpeed = 150;
        const deleteSpeed = 80;
        const pauseTime = 3000;

        let timeout: NodeJS.Timeout;

        switch (phase) {
            case 'typing':
                if (displayText.length < currentFullText.length) {
                    const randomSpeed = typeSpeed + (Math.random() * 40 - 20);
                    timeout = setTimeout(() => {
                        setDisplayText(currentFullText.slice(0, displayText.length + 1));
                    }, randomSpeed);
                } else {
                    setPhase('pausing');
                }
                break;

            case 'pausing':
                timeout = setTimeout(() => {
                    setPhase('deleting');
                }, pauseTime);
                break;

            case 'deleting':
                if (displayText.length > 0) {
                    timeout = setTimeout(() => {
                        setDisplayText(currentFullText.slice(0, displayText.length - 1));
                    }, deleteSpeed);
                } else {
                    setTextIndex((prev) => (prev + 1) % texts.length);
                    setPhase('typing');
                }
                break;
        }

        return () => clearTimeout(timeout);
    }, [displayText, phase, textIndex, texts]);

    return (
        <div className="flex items-center space-x-0.5 opacity-60 hover:opacity-100 transition-opacity min-h-[14px]">
            <span className="text-[9px] font-mono tracking-widest uppercase">{displayText}</span>
            <span className="w-[1px] h-2.5 bg-foreground/60 animate-[blink_1s_step-end_infinite]" />
        </div>
    );
}
