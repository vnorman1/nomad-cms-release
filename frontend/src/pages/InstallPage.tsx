import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Lock, Mail, AlertCircle, Shield, Sun, Moon, Eye, EyeOff, CheckCircle2, Fingerprint, Cpu } from 'lucide-react';
import { executeInstallation } from '@/api/install';
import { NomadEntropy } from '@/utils/nomad-entropy';

/**
 * Client-side entropy hashing using SubtleCrypto
 * Combines user-provided text + NomadEntropy WASM for stronger security
 */
async function hashEntropy(entropy: string, wasmEntropy: string): Promise<string> {
    // Combine user text + WASM entropy + timestamp
    const combinedEntropy = entropy + wasmEntropy + Date.now().toString();

    // Convert to bytes
    const encoder = new TextEncoder();
    const data = encoder.encode(combinedEntropy);

    // Hash with SHA-256
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);

    // Convert to hex string
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Password strength calculator
 */
function calculatePasswordStrength(password: string): {
    score: number;
    label: string;
    requirements: { met: boolean; text: string }[];
} {
    const requirements = [
        { met: password.length >= 12, text: 'Min. 12 karakter' },
        { met: /[A-Z]/.test(password), text: 'Nagybetű' },
        { met: /[a-z]/.test(password), text: 'Kisbetű' },
        { met: /[0-9]/.test(password), text: 'Szám' },
        { met: /[!@#$%^&*()_+\-=\[\]{};\':\"\\|,.<>\/?]/.test(password), text: 'Speciális karakter' },
    ];

    const metCount = requirements.filter(r => r.met).length;
    const score = (metCount / requirements.length) * 100;

    let label = 'Gyenge';
    if (score >= 100) label = 'Erős';
    else if (score >= 80) label = 'Jó';
    else if (score >= 60) label = 'Közepes';

    return { score, label, requirements };
}

export default function InstallPage() {
    // Form state
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [userEntropy, setUserEntropy] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    // UI state
    const [isLoading, setIsLoading] = useState(false);
    const [isExiting, setIsExiting] = useState(false);
    const [error, setError] = useState('');
    const [wasmSamples, setWasmSamples] = useState(0);

    // NomadEntropy WASM collector
    const entropyCollectorRef = useRef<NomadEntropy | null>(null);

    // Initialize NomadEntropy on mount
    useEffect(() => {
        const collector = new NomadEntropy();
        entropyCollectorRef.current = collector;

        collector.startCollecting().then(() => {
            console.log('[Install] NomadEntropy WASM initialized');
        });

        // Update sample count periodically
        const interval = setInterval(() => {
            if (entropyCollectorRef.current) {
                setWasmSamples(entropyCollectorRef.current.getSampleCount());
            }
        }, 500);

        return () => {
            clearInterval(interval);
            if (entropyCollectorRef.current) {
                entropyCollectorRef.current.destroy();
                entropyCollectorRef.current = null;
            }
        };
    }, []);

    // Theme
    const [darkMode, setDarkMode] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('theme') === 'dark' ||
                (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
        }
        return true;
    });

    const passwordStrength = calculatePasswordStrength(password);

    // Apply theme
    useEffect(() => {
        if (darkMode) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        }
    }, [darkMode]);

    // Handle exit animation
    useEffect(() => {
        if (isExiting) {
            const timer = setTimeout(() => {
                // Force page reload to reinitialize the app with new installation state
                // BASE_URL includes the /nomad/ prefix
                const basePath = import.meta.env.BASE_URL || '/';
                window.location.href = `${basePath}login`;
            }, 1200);
            return () => clearTimeout(timer);
        }
    }, [isExiting]);

    // Clear errors on input change
    useEffect(() => {
        setError('');
    }, [email, password, confirmPassword, userEntropy]);

    const validateForm = (): string | null => {
        if (!email) return 'E-mail cím megadása kötelező';
        if (!email.includes('@')) return 'Érvénytelen e-mail formátum';
        if (!password) return 'Jelszó megadása kötelező';
        if (password !== confirmPassword) return 'A jelszavak nem egyeznek';
        if (passwordStrength.score < 100) return 'A jelszó nem elég erős';
        return null;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        const validationError = validateForm();
        if (validationError) {
            setError(validationError);
            return;
        }

        setIsLoading(true);

        try {
            // Get WASM entropy from NomadEntropy collector
            const wasmEntropy = entropyCollectorRef.current?.getHexString(32) ?? '';
            console.log('[Install] WASM entropy samples:', entropyCollectorRef.current?.getSampleCount());

            // Hash user entropy + WASM entropy client-side before sending
            const hashedEntropy = await hashEntropy(userEntropy, wasmEntropy);
            console.log('[Install] Combined entropy hashed, length:', hashedEntropy.length);

            const result = await executeInstallation(email, password, undefined, hashedEntropy);
            console.log('[Install] Result:', result);

            if (result.success === true) {
                if (navigator.vibrate) {
                    navigator.vibrate([50, 30, 50]);
                }
                setIsExiting(true);
                // Immediate redirect with full page reload
                // BASE_URL includes the /nomad/ prefix
                const basePath = import.meta.env.BASE_URL || '/';
                setTimeout(() => {
                    window.location.href = `${basePath}login`;
                }, 1000);
            } else {
                setError(result.error ?? 'Telepítés sikertelen');
            }
        } catch (err) {
            console.error('[Install] Error:', err);
            setError('Hálózati hiba, próbáld újra');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-4 selection:bg-foreground selection:text-background font-sans transition-colors duration-500">
            {/* Background grid */}
            <div
                className="fixed inset-0 pointer-events-none opacity-[0.03]"
                style={{
                    backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
                    backgroundSize: '40px 40px',
                }}
            />

            <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full max-w-md relative z-10"
            >
                {/* Header - The Brand Logo that will fly away */}
                <div className="mb-0 text-center relative z-20">
                    <motion.h1
                        layoutId="brand-logo"
                        animate={isExiting ? { y: -150, scale: 1.5 } : { y: 0, scale: 1 }}
                        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
                        className="text-6xl font-black tracking-tighter mb-2 relative"
                    >
                        NOMAD
                    </motion.h1>
                    <motion.div
                        initial={{ opacity: 1, height: 'auto' }}
                        animate={isExiting ? { opacity: 0, height: 0, marginBottom: 0 } : { opacity: 1, height: 'auto', marginBottom: 32 }}
                        transition={{ duration: 0.5 }}
                        className="inline-flex items-center gap-2 border-b border-foreground pb-1 overflow-hidden"
                    >
                        <Shield size={12} className="text-foreground" />
                        <span className="text-xs font-mono uppercase tracking-[0.2em]">
                            Első Beállítás
                        </span>
                    </motion.div>
                </div>

                {/* Install Form Container */}
                <motion.div
                    animate={isExiting ? {
                        opacity: 0,
                        y: 100,
                        filter: 'blur(20px)',
                        scale: 0.9,
                    } : {
                        opacity: 1,
                        y: 0,
                        filter: 'blur(0px)',
                        scale: 1
                    }}
                    transition={{ duration: 0.8, ease: "easeInOut" }}
                    className="border border-foreground bg-background relative overflow-hidden"
                >
                    {/* Decorative corners */}
                    <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-foreground z-10" />
                    <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-foreground z-10" />
                    <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-foreground z-10" />
                    <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-foreground z-10" />

                    <form onSubmit={handleSubmit} className="p-8 md:p-12 space-y-8 relative z-0">
                        {/* Error Message */}
                        <AnimatePresence>
                            {error && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    className="bg-destructive/10 border border-destructive/50 p-3 flex items-center gap-3 text-destructive"
                                >
                                    <AlertCircle size={14} />
                                    <span className="text-[10px] font-mono uppercase tracking-widest">
                                        {error}
                                    </span>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Success Message */}
                        <AnimatePresence>
                            {isExiting && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="bg-foreground/5 border border-foreground/20 p-3 flex items-center gap-3"
                                >
                                    <CheckCircle2 size={14} />
                                    <span className="text-[10px] font-mono uppercase tracking-widest">
                                        Telepítés sikeres
                                    </span>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Email Input */}
                        <div className="space-y-2 group">
                            <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-foreground/80 flex items-center gap-2">
                                <Mail size={10} /> Admin E-mail
                            </label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value.toLowerCase())}
                                className="w-full bg-transparent border-b border-foreground/30 py-2 text-xl font-light focus:outline-none focus:border-foreground transition-colors rounded-none placeholder:text-foreground/50"
                                placeholder="admin@example.com"
                                autoFocus
                                autoComplete="email"
                                disabled={isLoading || isExiting}
                            />
                        </div>

                        {/* Password Input */}
                        <div className="space-y-2 group">
                            <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-foreground/80 flex items-center gap-2">
                                <Lock size={10} /> Jelszó
                            </label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full bg-transparent border-b border-foreground/30 py-2 pr-10 text-xl font-light focus:outline-none focus:border-foreground transition-colors rounded-none placeholder:text-foreground/50"
                                    placeholder="••••••••••••"
                                    autoComplete="new-password"
                                    disabled={isLoading || isExiting}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-0 top-1/2 -translate-y-1/2 p-2 opacity-40 hover:opacity-100 transition-opacity"
                                    tabIndex={-1}
                                >
                                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>

                            {/* Password Strength */}
                            <AnimatePresence>
                                {password && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="space-y-3 pt-3"
                                    >
                                        {/* Strength Bar */}
                                        <div className="flex items-center gap-3">
                                            <div className="flex-1 h-[2px] bg-foreground/10 overflow-hidden">
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${passwordStrength.score}%` }}
                                                    transition={{ duration: 0.3 }}
                                                    className={`h-full transition-colors ${passwordStrength.score >= 100 ? 'bg-foreground' :
                                                        passwordStrength.score >= 60 ? 'bg-foreground/60' :
                                                            'bg-foreground/30'
                                                        }`}
                                                />
                                            </div>
                                            <span className="text-[9px] font-mono uppercase tracking-wider opacity-60 min-w-[50px] text-right">
                                                {passwordStrength.label}
                                            </span>
                                        </div>

                                        {/* Requirements */}
                                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                                            {passwordStrength.requirements.map((req, i) => (
                                                <span
                                                    key={i}
                                                    className={`text-[9px] font-mono uppercase tracking-wider transition-opacity ${req.met ? 'opacity-100' : 'opacity-30'
                                                        }`}
                                                >
                                                    {req.met ? '✓' : '○'} {req.text}
                                                </span>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Confirm Password Input */}
                        <div className="space-y-2 group">
                            <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-foreground/80 flex items-center gap-2">
                                <Lock size={10} /> Jelszó Megerősítése
                            </label>
                            <div className="relative">
                                <input
                                    type={showConfirmPassword ? 'text' : 'password'}
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className={`w-full bg-transparent border-b py-2 pr-10 text-xl font-light focus:outline-none transition-colors rounded-none placeholder:text-foreground/50 ${confirmPassword && password !== confirmPassword
                                        ? 'border-destructive/50 focus:border-destructive'
                                        : confirmPassword && password === confirmPassword
                                            ? 'border-foreground focus:border-foreground'
                                            : 'border-foreground/30 focus:border-foreground'
                                        }`}
                                    placeholder="••••••••••••"
                                    autoComplete="new-password"
                                    disabled={isLoading || isExiting}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                    className="absolute right-0 top-1/2 -translate-y-1/2 p-2 opacity-40 hover:opacity-100 transition-opacity"
                                    tabIndex={-1}
                                >
                                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                            <AnimatePresence>
                                {confirmPassword && (
                                    <motion.p
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        className={`text-[9px] font-mono uppercase tracking-wider ${password === confirmPassword ? 'opacity-60' : 'text-destructive'
                                            }`}
                                    >
                                        {password === confirmPassword ? '✓ Jelszavak egyeznek' : '✗ Jelszavak nem egyeznek'}
                                    </motion.p>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* User Entropy Input */}
                        <div className="space-y-2 group">
                            <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-foreground/80 flex items-center gap-2">
                                <Fingerprint size={10} /> Extra Titkosítás (Opcionális)
                            </label>
                            <textarea
                                value={userEntropy}
                                onChange={(e) => setUserEntropy(e.target.value)}
                                className="w-full bg-transparent border border-foreground/30 p-3 text-sm font-light focus:outline-none focus:border-foreground transition-colors rounded-none placeholder:text-foreground/50 resize-none min-h-[80px]"
                                placeholder="Írj be bármilyen véletlenszerű karaktereket, szavakat, számokat... Minél több, annál erősebb titkosítás!"
                                autoComplete="off"
                                disabled={isLoading || isExiting}
                            />
                            <div className="flex items-center justify-between">
                                <div className="text-[9px] font-mono uppercase tracking-wider opacity-40">
                                    <p>{userEntropy.length > 0
                                        ? `✓ ${userEntropy.length} karakter`
                                        : '○ Adj meg véletlenszerű karaktereket'
                                    }</p>
                                    <p className="flex items-center gap-1 mt-1">
                                        <Cpu size={8} />
                                        Entrópia: {wasmSamples} minta
                                    </p>
                                </div>
                                {userEntropy.length > 0 && (
                                    <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        className="flex gap-1"
                                    >
                                        {[...Array(Math.min(5, Math.floor(userEntropy.length / 10)))].map((_, i) => (
                                            <div key={i} className="w-1 h-1 rounded-full bg-foreground" />
                                        ))}
                                    </motion.div>
                                )}
                            </div>
                        </div>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={isLoading || isExiting || passwordStrength.score < 100 || password !== confirmPassword || !email}
                            className="w-full h-14 bg-foreground text-background font-mono uppercase tracking-[0.2em] text-xs hover:opacity-90 transition-opacity flex items-center justify-center gap-4 group disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isLoading || isExiting ? (
                                <span className="animate-pulse">{isExiting ? 'TELEPÍTÉS SIKERES' : 'TELEPÍTÉS...'}</span>
                            ) : (
                                <>
                                    <span>Telepítés Indítása</span>
                                    <ArrowRight
                                        size={14}
                                        className="group-hover:translate-x-1 transition-transform"
                                    />
                                </>
                            )}
                        </button>

                        {/* Security info divider */}
                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-foreground/10" />
                            </div>
                            <div className="relative flex justify-center">
                                <span className="bg-background px-4 text-[9px] font-mono uppercase tracking-widest opacity-30">
                                    Biztonság
                                </span>
                            </div>
                        </div>

                        {/* Security badges */}
                        <div className="flex items-center justify-center gap-6 text-[9px] font-mono uppercase tracking-wider opacity-30">
                            <span>256-bit</span>
                            <span className="w-1 h-1 rounded-full bg-foreground/30" />
                            <span>Argon2id</span>
                            <span className="w-1 h-1 rounded-full bg-foreground/30" />
                            <span>SHA-256</span>
                        </div>
                    </form>

                    {/* Footer */}
                    <div className="bg-foreground/5 p-4 border-t border-foreground/10 flex justify-between items-center text-[9px] font-mono opacity-40 uppercase">
                        <span>Made by: [V.N.]</span>

                        {/* Theme Toggle */}
                        <button
                            type="button"
                            onClick={() => setDarkMode(!darkMode)}
                            className="flex items-center gap-2 hover:text-foreground transition-colors"
                        >
                            {darkMode ? <Sun size={10} /> : <Moon size={10} />}
                            <span>{darkMode ? 'Világos' : 'Sötét'}</span>
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </div>
    );
}
