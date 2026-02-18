import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Check, Loader2, Lock, Eye, EyeOff, ShieldAlert, KeyRound } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { updateSettings } from '@/api/auth';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

// -----------------------------------------------------------------------------
// DEBUG MODE: Set to true to force this screen to appear on every login
// -----------------------------------------------------------------------------
const DEBUG = false;

// Helper for "Technical Badges"
const TechBadge = ({ children, className }: { children: React.ReactNode, className?: string }) => (
    <span className={cn("px-1.5 py-0.5 border border-foreground/20 text-[9px] font-mono uppercase tracking-widest bg-background/50", className)}>
        {children}
    </span>
);

export function ForcePasswordChange() {
    const { user, logout } = useAuth();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [isExiting, setIsExiting] = useState(false);
    const navigate = useNavigate();

    // Check if user needs to change password OR if we are in debug mode
    const needsChange = (user?.is_new_user === true || user?.is_new_user === 1) || DEBUG;

    useEffect(() => {
        if (!needsChange && !success && !isExiting) {
            // Already handled or not needed
        }
    }, [needsChange]);

    if (!needsChange && !success && !isExiting) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (password !== confirmPassword) {
            setError('A JELSZAVAK NEM EGYEZNEK');
            return;
        }

        if (password.length < 8) {
            setError('A JELSZÓ TÚL RÖVID (MIN 8 KARAKTER)');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const res = await updateSettings({
                new_password: password,
                confirm_password: confirmPassword
            });

            if (res.success || DEBUG) {
                if (DEBUG && !res.success) console.log("Simulating success in DEBUG mode");

                setSuccess(true);
                setTimeout(async () => {
                    setIsExiting(true);
                    setTimeout(async () => {
                        // Force reload to ensure fresh token usage and clear any stale state
                        window.location.reload();
                    }, 1500);
                }, 2000);
            } else {
                setError(res.error || 'HIBA A JELSZÓ FRISSÍTÉSE KÖZBEN');
            }
        } catch (err) {
            if (DEBUG) {
                setSuccess(true);
                setTimeout(async () => {
                    setIsExiting(true);
                    setTimeout(async () => {
                        setSuccess(false);
                        setIsExiting(false);
                    }, 1500);
                }, 2500);
            } else {
                setError('HÁLÓZATI KAPCSOLATI HIBA');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        await logout();
        navigate('/login');
    };

    return (
        <AnimatePresence>
            {(needsChange || isExiting) && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] } }}
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 backdrop-blur-xl font-sans overflow-hidden"
                >
                    {/* Background Grid */}
                    <div className="absolute inset-0 bg-[radial-gradient(#00000010_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />

                    {/* Main Content Container */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 1.05, filter: "blur(10px)" }}
                        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                        className="relative z-10 w-full max-w-lg bg-background border border-foreground/20 shadow-2xl overflow-hidden"
                    >
                        {/* Header Stripe */}
                        <div className="h-1 bg-foreground/10 w-full" />
                        <div className="px-8 py-6 border-b border-foreground/10 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <ShieldAlert size={16} className="text-foreground" />
                                <span className="text-xs font-mono uppercase tracking-widest font-bold">Biztonsági_Protokoll_Felülbírálás</span>
                            </div>
                            <TechBadge>KÖTELEZŐ_FRISSÍTÉS</TechBadge>
                        </div>

                        <div className="p-8">
                            <AnimatePresence mode="wait">
                                {success ? (
                                    <motion.div
                                        key="success-state"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0, scale: 1.1, filter: "blur(5px)" }}
                                        transition={{ duration: 0.5 }}
                                        className="text-center py-10 flex flex-col items-center justify-center gap-6"
                                    >
                                        <div className="relative">
                                            <div className="w-24 h-24 border border-foreground/20 flex items-center justify-center rounded-full animate-pulse">
                                                <div className="w-16 h-16 bg-foreground text-background flex items-center justify-center rounded-sm">
                                                    <Check size={32} strokeWidth={3} />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <h2 className="text-2xl font-black tracking-tighter uppercase">
                                                Rendszer Szinkronizálva
                                            </h2>
                                            <div className="flex flex-col gap-1 items-center">
                                                <TechBadge>HITELESÍTŐ_ADATOK_FRISSÍTVE</TechBadge>
                                                <span className="text-[10px] font-mono uppercase tracking-widest opacity-60 mt-2">
                                                    Visszatérés a vezérlőpultra...
                                                </span>
                                            </div>
                                        </div>
                                    </motion.div>
                                ) : (
                                    <motion.div key="form-state" className="space-y-8">
                                        <div className="space-y-4">
                                            <div className="flex flex-col gap-1">
                                                <h1 className="text-3xl font-black tracking-tighter uppercase leading-none">
                                                    Kezdeti Beállítás
                                                </h1>
                                                <span className="text-[10px] font-mono uppercase tracking-widest opacity-60">
                                                     // Új_Felhasználó_Észlelve
                                                </span>
                                            </div>

                                            <div className="p-4 bg-foreground/5 border border-foreground/10 text-xs font-mono leading-relaxed opacity-80">
                                                <p className="uppercase tracking-wide mb-2 font-bold">// ÉRTESÍTÉS</p>
                                                <p>A szabványos működési eljárás kötelező jelszómódosítást ír elő az első belépéskor. Kérjük, állítson be egy biztonságos hozzáférési kulcsot.</p>
                                            </div>
                                        </div>

                                        <form onSubmit={handleSubmit} className="space-y-6">
                                            {error && (
                                                <motion.div
                                                    initial={{ opacity: 0, height: 0 }}
                                                    animate={{ opacity: 1, height: "auto" }}
                                                    className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-[10px] font-mono uppercase tracking-wide flex items-center gap-2"
                                                >
                                                    <span className="font-bold">Hiba:</span> {error}
                                                </motion.div>
                                            )}

                                            <div className="space-y-6">
                                                <div className="group space-y-2">
                                                    <label className="flex items-center justify-between text-[9px] font-mono uppercase tracking-widest text-muted-foreground group-focus-within:text-foreground transition-colors">
                                                        <span>Új_Jelszó</span>
                                                        <KeyRound size={12} />
                                                    </label>
                                                    <div className="relative">
                                                        <input
                                                            type={showPassword ? "text" : "password"}
                                                            value={password}
                                                            onChange={e => setPassword(e.target.value)}
                                                            className="w-full bg-background border border-foreground/20 px-4 py-3 outline-none transition-all text-sm font-bold font-mono placeholder:text-muted-foreground/20 focus:border-foreground focus:ring-1 focus:ring-foreground/20"
                                                            placeholder="ADJA_MEG_A_BIZTONSÁGI_KULCSOT"
                                                            required
                                                            autoComplete="new-password"
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => setShowPassword(!showPassword)}
                                                            className="absolute right-0 top-0 bottom-0 px-3 text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center"
                                                        >
                                                            {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="group space-y-2">
                                                    <label className="flex items-center justify-between text-[9px] font-mono uppercase tracking-widest text-muted-foreground group-focus-within:text-foreground transition-colors">
                                                        <span>Kulcs_Megerősítése</span>
                                                        <Lock size={12} />
                                                    </label>
                                                    <div className="relative">
                                                        <input
                                                            type={showConfirmPassword ? "text" : "password"}
                                                            value={confirmPassword}
                                                            onChange={e => setConfirmPassword(e.target.value)}
                                                            className="w-full bg-background border border-foreground/20 px-4 py-3 outline-none transition-all text-sm font-bold font-mono placeholder:text-muted-foreground/20 focus:border-foreground focus:ring-1 focus:ring-foreground/20"
                                                            placeholder="ERŐSÍTSE_MEG_A_KULCSOT"
                                                            required
                                                            autoComplete="new-password"
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                                            className="absolute right-0 top-0 bottom-0 px-3 text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center"
                                                        >
                                                            {showConfirmPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="pt-4 flex flex-col gap-3">
                                                <button
                                                    type="submit"
                                                    disabled={loading}
                                                    className="relative w-full h-12 bg-foreground text-background font-bold font-mono text-xs uppercase tracking-[0.2em] hover:opacity-90 transition-all flex items-center justify-center gap-4 group disabled:opacity-70 disabled:pointer-events-none overflow-hidden"
                                                >
                                                    {loading ? (
                                                        <Loader2 size={16} className="animate-spin" />
                                                    ) : (
                                                        <>
                                                            <span>Frissítés_Indítása</span>
                                                            <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                                                        </>
                                                    )}
                                                    {/* Decorative line */}
                                                    <div className="absolute bottom-0 left-0 h-[2px] bg-background w-full translate-x-[-100%] group-hover:translate-x-0 transition-transform duration-500" />
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={handleLogout}
                                                    className="w-full text-center text-[10px] font-mono uppercase tracking-widest opacity-40 hover:opacity-100 transition-opacity py-2"
                                                >
                                                    {DEBUG ? "// DEBUG: KIHAGYÁS" : "// MUNKAMENET_MEGSZAKÍTÁSA"}
                                                </button>
                                            </div>
                                        </form>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
