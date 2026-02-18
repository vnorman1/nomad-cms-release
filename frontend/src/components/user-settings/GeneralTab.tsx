import { useState } from 'react';
import { motion } from 'framer-motion';
import {
    Save, Loader2, Shield, Eye, EyeOff, Lock, Smartphone
} from 'lucide-react';
import {
    updateSettings,
    type UpdateSettingsRequest
} from '@/api/auth';
import { TabProps } from './types';

export function GeneralTab({ settings, onUpdate, setError, setSuccess }: TabProps) {
    const [email, setEmail] = useState(settings.email);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [totpCode, setTotpCode] = useState('');
    const [showPasswords, setShowPasswords] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showTotpModal, setShowTotpModal] = useState(false);
    const [pendingAction, setPendingAction] = useState<UpdateSettingsRequest | null>(null);

    const requiresTOTP = settings.totp_enabled;

    const handleEmailUpdate = async () => {
        if (email === settings.email) return;

        if (requiresTOTP) {
            setPendingAction({ email });
            setShowTotpModal(true);
            return;
        }

        await saveSettings({ email });
    };

    const handlePasswordUpdate = async () => {
        if (!newPassword) {
            setError('Add meg az új jelszót');
            return;
        }
        if (newPassword !== confirmPassword) {
            setError('A jelszavak nem egyeznek');
            return;
        }
        if (newPassword.length < 8) {
            setError('A jelszónak legalább 8 karakter hosszúnak kell lennie');
            return;
        }

        const data: UpdateSettingsRequest = {
            new_password: newPassword,
            confirm_password: confirmPassword,
            current_password: currentPassword,
        };

        if (requiresTOTP) {
            setPendingAction(data);
            setShowTotpModal(true);
            return;
        }

        await saveSettings(data);
    };

    const handleTotpConfirm = async () => {
        if (!pendingAction || !totpCode) return;
        await saveSettings({ ...pendingAction, totp_code: totpCode });
        setShowTotpModal(false);
        setTotpCode('');
        setPendingAction(null);
    };

    const saveSettings = async (data: UpdateSettingsRequest) => {
        try {
            setSaving(true);
            setError(null);
            const response = await updateSettings(data);

            if (response.success) {
                setSuccess('Beállítások mentve');
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
                onUpdate();
            } else if (response.requires_totp) {
                setPendingAction(data);
                setShowTotpModal(true);
            } else {
                setError(response.error ?? 'Mentés sikertelen');
            }
        } catch (err) {
            setError('Hálózati hiba');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-8">
            {/* Email */}
            <div className="border border-border p-6">
                <h3 className="text-sm font-mono uppercase tracking-widest mb-4 opacity-60">E-mail cím</h3>
                <div className="flex flex-col md:flex-row gap-4">
                    <input
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value.toLowerCase())}
                        className="flex-1 bg-transparent border-b border-border py-2 focus:outline-none focus:border-foreground transition-colors"
                        placeholder="email@example.com"
                    />
                    <button
                        onClick={handleEmailUpdate}
                        disabled={saving || email === settings.email}
                        className="px-4 py-2 bg-foreground text-background font-mono text-xs uppercase tracking-widest disabled:opacity-30 hover:opacity-80 transition-opacity flex items-center justify-center gap-2"
                    >
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        Mentés
                    </button>
                </div>
                {requiresTOTP && (
                    <p className="mt-2 text-xs opacity-50 flex items-center gap-2">
                        <Shield size={12} />
                        2FA kód szükséges az e-mail módosításhoz
                    </p>
                )}
            </div>

            {/* Password */}
            <div className="border border-border p-6">
                <h3 className="text-sm font-mono uppercase tracking-widest mb-4 opacity-60">Jelszó módosítása</h3>
                <div className="space-y-4">
                    {settings.has_password && (
                        <div>
                            <label className="text-xs opacity-50 block mb-1">Jelenlegi jelszó</label>
                            <div className="relative">
                                <input
                                    type={showPasswords ? 'text' : 'password'}
                                    value={currentPassword}
                                    onChange={e => setCurrentPassword(e.target.value)}
                                    className="w-full bg-transparent border-b border-border py-2 pr-10 focus:outline-none focus:border-foreground transition-colors"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPasswords(!showPasswords)}
                                    className="absolute right-0 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-100"
                                >
                                    {showPasswords ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs opacity-50 block mb-1">Új jelszó</label>
                            <input
                                type={showPasswords ? 'text' : 'password'}
                                value={newPassword}
                                onChange={e => setNewPassword(e.target.value)}
                                className="w-full bg-transparent border-b border-border py-2 focus:outline-none focus:border-foreground transition-colors"
                            />
                        </div>
                        <div>
                            <label className="text-xs opacity-50 block mb-1">Jelszó megerősítése</label>
                            <input
                                type={showPasswords ? 'text' : 'password'}
                                value={confirmPassword}
                                onChange={e => setConfirmPassword(e.target.value)}
                                className="w-full bg-transparent border-b border-border py-2 focus:outline-none focus:border-foreground transition-colors"
                            />
                        </div>
                    </div>
                    <button
                        onClick={handlePasswordUpdate}
                        disabled={saving || !newPassword}
                        className="px-4 py-2 bg-foreground text-background font-mono text-xs uppercase tracking-widest disabled:opacity-30 hover:opacity-80 transition-opacity flex items-center gap-2"
                    >
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
                        Jelszó módosítása
                    </button>
                </div>
                {requiresTOTP && (
                    <p className="mt-4 text-xs opacity-50 flex items-center gap-2">
                        <Shield size={12} />
                        2FA kód szükséges a jelszó módosításához
                    </p>
                )}
            </div>

            {/* TOTP Verification Modal */}
            {showTotpModal && (
                <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-background border border-border p-6 w-full max-w-sm"
                    >
                        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                            <Smartphone size={20} />
                            2FA Ellenőrzés
                        </h3>
                        <p className="text-sm opacity-60 mb-4">
                            Add meg az authenticator alkalmazásod kódját a módosítás megerősítéséhez.
                        </p>
                        <input
                            type="text"
                            value={totpCode}
                            onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            placeholder="000000"
                            maxLength={6}
                            className="w-full text-center text-2xl font-mono tracking-[0.5em] bg-transparent border-b-2 border-foreground py-3 focus:outline-none mb-6"
                            autoFocus
                        />
                        <div className="flex gap-3">
                            <button
                                onClick={() => {
                                    setShowTotpModal(false);
                                    setTotpCode('');
                                    setPendingAction(null);
                                }}
                                className="flex-1 py-2 border border-border font-mono text-xs uppercase tracking-widest hover:bg-foreground/5"
                            >
                                Mégse
                            </button>
                            <button
                                onClick={handleTotpConfirm}
                                disabled={totpCode.length !== 6 || saving}
                                className="flex-1 py-2 bg-foreground text-background font-mono text-xs uppercase tracking-widest disabled:opacity-30"
                            >
                                {saving ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Megerősítés'}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    );
}
