import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Mail, Lock, Shield, User, Check, AlertCircle } from 'lucide-react';
import { UserFormData } from '@/api/admin';
import { cn } from '@/lib/utils';

interface UserModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: UserFormData) => Promise<void>;
    initialData?: Partial<UserFormData>;
    title: string;
}

export function UserModal({
    isOpen,
    onClose,
    onSubmit,
    initialData,
    title
}: UserModalProps) {
    const [formData, setFormData] = useState<UserFormData>({
        email: initialData?.email || '',
        password: '',
        is_admin: initialData?.is_admin || false
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Reset form when opening
    useEffect(() => {
        if (isOpen) {
            setFormData({
                email: initialData?.email || '',
                password: '',
                is_admin: initialData?.is_admin || false
            });
            setError(null);
        }
    }, [isOpen, initialData]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            await onSubmit(formData);
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Ismeretlen hiba');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            />

            {/* Modal */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="w-full max-w-lg relative bg-background border border-border overflow-hidden shadow-2xl"
            >
                {/* Decorative Elements */}
                <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-foreground z-10" />
                <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-foreground z-10" />
                <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-foreground z-10" />
                <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-foreground z-10" />

                {/* Header */}
                <div className="p-8 pb-6 border-b border-border bg-foreground/5">
                    <div className="flex justify-between items-start mb-2">
                        <div>
                            <span className="text-[10px] font-mono uppercase tracking-[0.2em] opacity-60 flex items-center gap-1.5 mb-1">
                                <User size={10} />
                                {initialData ? 'Szerkesztés' : 'Létrehozás'}
                            </span>
                            <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 opacity-40 hover:opacity-100 hover:bg-foreground/5 transition-all rounded-sm"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="p-8 space-y-8">
                    {/* Error Display */}
                    <AnimatePresence>
                        {error && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="overflow-hidden"
                            >
                                <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-start gap-3">
                                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                                    <span className="text-xs font-mono">{error}</span>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <div className="space-y-6">
                        {/* Email Input */}
                        <div className="space-y-2 group">
                            <label className="text-[10px] font-mono uppercase tracking-[0.2em] opacity-60 flex items-center gap-2 group-focus-within:opacity-100 group-focus-within:text-primary transition-colors">
                                <Mail size={12} /> E-mail Cím (Azonosító)
                            </label>
                            <input
                                type="email"
                                required
                                autoFocus
                                value={formData.email}
                                onChange={e => setFormData({ ...formData, email: e.target.value.toLowerCase() })}
                                className="w-full bg-transparent border-b border-border py-2 text-lg font-light focus:outline-none focus:border-foreground transition-all placeholder:opacity-20"
                                placeholder="pl. user@nomad.com"
                            />
                        </div>

                        {/* Password Input */}
                        <div className="space-y-2 group">
                            <label className="text-[10px] font-mono uppercase tracking-[0.2em] opacity-60 flex items-center gap-2 group-focus-within:opacity-100 group-focus-within:text-primary transition-colors">
                                <Lock size={12} />
                                {initialData ? 'Új Jelszó (Opcionális)' : 'Jelszó'}
                            </label>
                            <input
                                type="password"
                                required={!initialData}
                                value={formData.password}
                                onChange={e => setFormData({ ...formData, password: e.target.value })}
                                className="w-full bg-transparent border-b border-border py-2 text-lg font-light focus:outline-none focus:border-foreground transition-all placeholder:opacity-20"
                                placeholder={initialData ? "••••••••" : "••••••••••••"}
                                minLength={8}
                            />
                            <p className="text-[10px] opacity-40 pt-1">
                                {!initialData && "Minimum 8 karakter."}
                                {initialData && "Hagyd üresen, ha nem szeretnéd megváltoztatni."}
                            </p>
                        </div>

                        {/* Admin Toggle - Fancy Version */}
                        <div
                            onClick={() => setFormData({ ...formData, is_admin: !formData.is_admin })}
                            className={cn(
                                "relative group cursor-pointer border p-4 transition-all duration-300",
                                formData.is_admin
                                    ? "border-amber-500/50 bg-amber-500/5"
                                    : "border-border hover:border-foreground/30"
                            )}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className={cn(
                                        "w-10 h-10 flex items-center justify-center rounded-full border transition-colors",
                                        formData.is_admin
                                            ? "border-amber-500 text-amber-500 bg-amber-500/10"
                                            : "border-border text-muted-foreground"
                                    )}>
                                        <Shield size={18} />
                                    </div>
                                    <div>
                                        <h4 className={cn(
                                            "text-sm font-bold uppercase tracking-wide transition-colors",
                                            formData.is_admin ? "text-amber-600 dark:text-amber-400" : "text-foreground"
                                        )}>
                                            Adminisztrátor
                                        </h4>
                                        <p className="text-[10px] opacity-60 max-w-[200px] leading-tight mt-1">
                                            Teljes hozzáférés a rendszerhez, beállításokhoz és felhasználókhoz.
                                        </p>
                                    </div>
                                </div>

                                {/* Toggle Switch UI */}
                                <div className={cn(
                                    "w-12 h-6 rounded-full border relative transition-colors duration-300",
                                    formData.is_admin ? "bg-amber-500 border-amber-500" : "bg-transparent border-input"
                                )}>
                                    <div className={cn(
                                        "absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all duration-300 shadow-sm",
                                        formData.is_admin ? "left-[26px]" : "left-[2px] bg-muted-foreground"
                                    )} />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Footer / Actions */}
                    <div className="flex items-center justify-between pt-4 border-t border-border">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-6 py-3 text-xs font-mono uppercase tracking-widest hover:bg-foreground/5 transition-colors opacity-60 hover:opacity-100"
                        >
                            Mégse
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-8 py-3 bg-foreground text-background text-xs font-bold font-mono uppercase tracking-widest hover:opacity-90 transition-opacity flex items-center gap-3 disabled:opacity-50"
                        >
                            {loading && <Loader2 size={14} className="animate-spin" />}
                            {!loading && (initialData ? <Check size={14} /> : <User size={14} />)}
                            {initialData ? 'Mentés' : 'Létrehozás'}
                        </button>
                    </div>
                </form>
            </motion.div>
        </div>
    );
}
