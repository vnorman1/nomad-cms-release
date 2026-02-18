import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Lock, Mail, AlertCircle, Fingerprint, Smartphone, Loader2, Sun, Moon, Clock } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { getWebAuthnLoginOptions, loginWithWebAuthn } from '@/api/auth';
import { useTheme } from '@/context/ThemeContext';

export default function Login() {
    const navigate = useNavigate();
    const location = useLocation();
    const { login, isAuthenticated, isLoading, error, clearError, refreshUser } = useAuth();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [totpCode, setTotpCode] = useState('');
    const [requiresTOTP, setRequiresTOTP] = useState(false);
    const [localError, setLocalError] = useState('');
    const [passkeyLoading, setPasskeyLoading] = useState(false);
    const [isExiting, setIsExiting] = useState(false);

    // Lockout countdown state
    const [lockoutRemaining, setLockoutRemaining] = useState<number>(0);
    const lockoutIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Theme Logic
    const { theme, toggleTheme } = useTheme();
    const darkMode = theme === 'dark';

    // NOTE: Token cleanup for disaster recovery is now handled by the
    // "Bejelentkezés" button in SessionExpiredModal (calls tokenStorage.clear())
    // We removed the aggressive auto-clear here because it was breaking fresh logins

    // Redirect if already authenticated (but not if we are manually handling the exit animation)
    useEffect(() => {
        if (isAuthenticated && !isExiting) {
            const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';
            navigate(from, { replace: true });
        }
    }, [isAuthenticated, navigate, location, isExiting]);

    // Handle exit animation and navigation
    useEffect(() => {
        if (isExiting) {
            const timer = setTimeout(() => {
                const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';
                navigate(from, { replace: true });
            }, 1200); // Wait for the "chic" animation
            return () => clearTimeout(timer);
        }
    }, [isExiting, navigate, location]);

    // Lockout countdown timer - starts when lockout is set
    useEffect(() => {
        // Clear any existing interval
        if (lockoutIntervalRef.current) {
            clearInterval(lockoutIntervalRef.current);
            lockoutIntervalRef.current = null;
        }

        // Start countdown if locked
        if (lockoutRemaining > 0) {
            lockoutIntervalRef.current = setInterval(() => {
                setLockoutRemaining(prev => {
                    if (prev <= 1) {
                        if (lockoutIntervalRef.current) {
                            clearInterval(lockoutIntervalRef.current);
                            lockoutIntervalRef.current = null;
                        }
                        setLocalError('');
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }

        return () => {
            if (lockoutIntervalRef.current) {
                clearInterval(lockoutIntervalRef.current);
                lockoutIntervalRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lockoutRemaining > 0]); // Only trigger when lockout state changes (locked/unlocked)

    // Clear errors on input change
    useEffect(() => {
        if (error) clearError();
        if (lockoutRemaining === 0) {
            setLocalError('');
        }
    }, [email, password, totpCode]);

    // Format seconds to MM:SS
    const formatTime = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLocalError('');

        if (!email || !password) {
            setLocalError('Kérlek töltsd ki az összes mezőt');
            return;
        }

        try {
            const response = await login({
                email,
                password,
                totp_code: totpCode || undefined,
            });


            if (response.requires_totp) {
                // TOTP code is required - show the TOTP input
                setRequiresTOTP(true);
                setLocalError('');
            } else if (!response.success) {
                // Check if account is locked
                if (response.code === 'ACCOUNT_LOCKED' && response.lockout_remaining) {
                    setLockoutRemaining(response.lockout_remaining);
                }
                setLocalError(response.error ?? 'Bejelentkezés sikertelen');
            } else {
                // Success! Haptic feedback and animation
                if (navigator.vibrate) {
                    navigator.vibrate([50, 30, 50]); // Short tactile pattern
                }
                setIsExiting(true);
            }
        } catch (err) {
            console.error('[Login] Error:', err);
            setLocalError('Hálózati hiba, próbáld újra');
        }
    };

    // Passkey (WebAuthn) login handler
    const handlePasskeyLogin = async () => {
        setPasskeyLoading(true);
        setLocalError('');

        try {
            // Step 1: Get authentication options from server
            const optionsResponse = await getWebAuthnLoginOptions();

            if (!optionsResponse.success || !optionsResponse.options) {
                setLocalError(optionsResponse.error ?? 'Passkey bejelentkezés nem elérhető');
                return;
            }

            // Helper to decode MIME-encoded binary
            const decodeMimeBase64 = (str: string): ArrayBuffer => {
                const match = str.match(/=\?BINARY\?B\?(.+)\?=/);
                const base64 = match ? match[1] : str;
                const binary = atob(base64);
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) {
                    bytes[i] = binary.charCodeAt(i);
                }
                return bytes.buffer;
            };

            // Parse and convert options
            const rawOptions = optionsResponse.options as Record<string, unknown>;
            const publicKeyOptions = rawOptions.publicKey as Record<string, unknown>;

            const options: PublicKeyCredentialRequestOptions = {
                ...publicKeyOptions,
                challenge: decodeMimeBase64(publicKeyOptions.challenge as string),
                allowCredentials: ((publicKeyOptions.allowCredentials || []) as Array<{ id: string; type: string }>).map(cred => ({
                    id: decodeMimeBase64(cred.id),
                    type: cred.type as PublicKeyCredentialType,
                })),
            } as PublicKeyCredentialRequestOptions;


            // Step 2: Get credential from browser
            const credential = await navigator.credentials.get({
                publicKey: options,
            }) as PublicKeyCredential;


            if (!credential) {
                setLocalError('Passkey azonosítás megszakítva');
                return;
            }

            // Step 3: Send to server for verification
            const assertionResponse = credential.response as AuthenticatorAssertionResponse;

            const assertionData = {
                id: credential.id,
                rawId: btoa(String.fromCharCode(...new Uint8Array(credential.rawId))),
                type: credential.type,
                clientDataJSON: btoa(String.fromCharCode(...new Uint8Array(assertionResponse.clientDataJSON))),
                authenticatorData: btoa(String.fromCharCode(...new Uint8Array(assertionResponse.authenticatorData))),
                signature: btoa(String.fromCharCode(...new Uint8Array(assertionResponse.signature))),
                userHandle: assertionResponse.userHandle ? btoa(String.fromCharCode(...new Uint8Array(assertionResponse.userHandle))) : null,
            };


            const loginResponse = await loginWithWebAuthn(assertionData);

            if (loginResponse.success) {
                // Refresh auth state seamlessly
                await refreshUser();
                // Haptic feedback
                if (navigator.vibrate) {
                    navigator.vibrate([50, 30, 50]);
                }
                setIsExiting(true);
            } else {
                setLocalError(loginResponse.error ?? 'Passkey bejelentkezés sikertelen');
            }
        } catch (err: unknown) {
            console.error('[Passkey Login] Error:', err);
            if (err instanceof Error) {
                if (err.name === 'NotAllowedError') {
                    setLocalError('Passkey azonosítás megszakítva');
                } else {
                    setLocalError(err.message);
                }
            } else {
                setLocalError('Passkey bejelentkezés sikertelen');
            }
        } finally {
            setPasskeyLoading(false);
        }
    };

    const displayError = localError || error;

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
                        <div className="w-2 h-2 bg-foreground rounded-full animate-pulse" />
                        <span className="text-xs font-mono uppercase tracking-[0.2em]">
                            Biztonságos Bejelentkezés
                        </span>
                    </motion.div>
                </div>

                {/* Login Form Container - Fades out on success */}
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
                        {displayError && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="bg-destructive/10 border border-destructive/50 p-3 flex items-center gap-3 text-destructive"
                            >
                                <AlertCircle size={14} />
                                <span className="text-[10px] font-mono uppercase tracking-widest">
                                    {displayError}
                                </span>
                            </motion.div>
                        )}

                        {/* Lockout Countdown - Compact design */}
                        {lockoutRemaining > 0 && (
                            <motion.div
                                initial={{ opacity: 0, y: -5 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="bg-amber-500/10 border border-amber-500/30 px-3 py-2 flex items-center justify-between text-amber-600 dark:text-amber-400"
                            >
                                <div className="flex items-center gap-2">
                                    <Clock size={12} className="animate-pulse" />
                                    <span className="text-[9px] font-mono uppercase tracking-wider">
                                        Zárolva
                                    </span>
                                </div>
                                <span className="text-sm font-mono font-medium">
                                    {formatTime(lockoutRemaining)}
                                </span>
                            </motion.div>
                        )}

                        {/* Email Input */}
                        <div className="space-y-2 group">
                            <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-foreground/80 flex items-center gap-2">
                                <Mail size={10} /> E-mail cím
                            </label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value.toLowerCase())}
                                className="w-full bg-transparent border-b border-foreground/30 py-2 text-xl font-light focus:outline-none focus:border-foreground transition-colors rounded-none placeholder:text-foreground/50"
                                placeholder="admin@example.com"
                                autoFocus
                                autoComplete="email"
                            />
                        </div>

                        {/* Password Input */}
                        <div className="space-y-2 group">
                            <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-foreground/80 flex items-center gap-2">
                                <Lock size={10} /> Jelszó
                            </label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-transparent border-b border-foreground/30 py-2 text-xl font-light focus:outline-none focus:border-foreground transition-colors rounded-none placeholder:text-foreground/50"
                                placeholder="••••••••"
                                autoComplete="current-password"
                            />
                        </div>

                        {/* TOTP Code or Backup Code (if required) */}
                        {requiresTOTP && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                className="space-y-2 group"
                            >
                                <label className="text-[10px] font-mono uppercase tracking-[0.2em] opacity-60 flex items-center gap-2">
                                    <Smartphone size={10} /> 2FA Kód vagy Biztonsági Kód
                                </label>
                                <input
                                    type="text"
                                    value={totpCode}
                                    onChange={(e) => setTotpCode(e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase())}
                                    className="w-full bg-transparent border-b border-foreground/20 py-2 text-xl font-light focus:outline-none focus:border-foreground transition-colors rounded-none text-center tracking-[0.5em] font-mono"
                                    placeholder="000000"
                                    maxLength={8}
                                    autoComplete="one-time-code"
                                />
                                <p className="text-[9px] font-mono opacity-40 text-center">
                                    6 számjegyű TOTP vagy 8 karakteres biztonsági kód
                                </p>
                            </motion.div>
                        )}

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={isLoading || isExiting || lockoutRemaining > 0}
                            className="w-full h-14 bg-foreground text-background font-mono uppercase tracking-[0.2em] text-xs hover:opacity-90 transition-opacity flex items-center justify-center gap-4 group disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isLoading || isExiting ? (
                                <span className="animate-pulse">{isExiting ? 'BEJELENTKEZÉS SIKERES' : 'AZONOSÍTÁS...'}</span>
                            ) : lockoutRemaining > 0 ? (
                                <span className="flex items-center gap-2">
                                    <Clock size={14} />
                                    <span>ZÁROLVA ({formatTime(lockoutRemaining)})</span>
                                </span>
                            ) : (
                                <>
                                    <span>Belépés</span>
                                    <ArrowRight
                                        size={14}
                                        className="group-hover:translate-x-1 transition-transform"
                                    />
                                </>
                            )}
                        </button>

                        {/* WebAuthn / Passkey Login */}
                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-foreground/10" />
                            </div>
                            <div className="relative flex justify-center">
                                <span className="bg-background px-4 text-[10px] font-mono uppercase tracking-widest opacity-40">
                                    vagy
                                </span>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={handlePasskeyLogin}
                            disabled={passkeyLoading || isLoading || isExiting}
                            className="w-full h-12 border border-foreground/20 font-mono uppercase tracking-[0.2em] text-xs hover:border-foreground/50 hover:bg-foreground/5 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {passkeyLoading ? (
                                <>
                                    <Loader2 size={16} className="animate-spin" />
                                    <span>Azonosítás...</span>
                                </>
                            ) : (
                                <>
                                    <Fingerprint size={16} />
                                    <span>Bejelentkezés Passkey-jel</span>
                                </>
                            )}
                        </button>
                    </form>

                    {/* Footer */}
                    <div className="bg-foreground/5 p-4 border-t border-foreground/10 flex justify-between items-center text-[9px] font-mono opacity-40 uppercase">
                        <span>Made by: [V.N.]</span>

                        {/* Theme Toggle */}
                        <button
                            type="button"
                            onClick={toggleTheme}
                            className="flex items-center gap-2 hover:text-foreground transition-colors"
                        >
                            {darkMode ? <Sun size={10} /> : <Moon size={10} />}
                            <span>{darkMode ? 'Világos' : 'Sötét'}</span>
                        </button>
                    </div>

                    {/* Back to Website Link */}
                    <div className="mt-4 mb-2 text-center">
                        <a
                            href="/"
                            className="inline-flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.2em] text-foreground/60 hover:text-foreground transition-colors group"
                        >
                            <span>← Vissza a weboldalra</span>
                        </a>
                    </div>
                </motion.div>

            </motion.div>
        </div>
    );
}
