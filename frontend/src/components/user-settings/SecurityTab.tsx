import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
    Shield, Loader2, QrCode, Copy, Smartphone, AlertTriangle, Trash2, Plus, Key, RefreshCw, Download
} from 'lucide-react';
import {
    getTOTPSetup, enableTOTP, disableTOTP, deletePasskey, getMe, getWebAuthnRegisterOptions, registerWebAuthn, regenerateBackupCodes
} from '@/api/auth';
import { useUI } from '@/context/UIContext';
import { TabProps } from './types';

export function SecurityTab({ settings, onUpdate, setError, setSuccess }: TabProps) {
    const { confirm } = useUI();
    const [totpSetup, setTotpSetup] = useState<{
        qr_code?: string;
        secret?: string;
        provisioning_uri?: string;
    } | null>(null);
    const [totpCode, setTotpCode] = useState('');
    const [disableCode, setDisableCode] = useState('');
    const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [passkeys, setPasskeys] = useState<Array<{ id: number; friendly_name: string | null; created_at: string }>>([]);
    const [regenerateCode, setRegenerateCode] = useState('');
    const [showRegenerateForm, setShowRegenerateForm] = useState(false);

    // Helper to generate passkey name based on browser
    const generatePasskeyName = (): string => {
        const ua = navigator.userAgent.toLowerCase();
        let browser = 'browser';
        if (ua.includes('chrome') && !ua.includes('edg')) browser = 'chrome';
        else if (ua.includes('safari') && !ua.includes('chrome')) browser = 'safari';
        else if (ua.includes('firefox')) browser = 'firefox';
        else if (ua.includes('edg')) browser = 'edge';
        else if (ua.includes('opera') || ua.includes('opr')) browser = 'opera';

        const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        return `${browser}-user-${date}`;
    };

    // Load passkeys
    useEffect(() => {
        loadPasskeys();
    }, []);

    const loadPasskeys = async () => {
        try {
            const response = await getMe();
            if (response.success && response.passkeys) {
                setPasskeys(response.passkeys);
            }
        } catch (err) {
            // Ignore
        }
    };

    const handleSetupTOTP = async () => {
        console.log('[UserSettings] handleSetupTOTP clicked');
        try {
            setLoading(true);
            setError(null);
            console.log('[UserSettings] Calling getTOTPSetup...');
            const response = await getTOTPSetup();
            console.log('[UserSettings] TOTP response:', response);

            if (response.success && !response.totp_enabled) {
                setTotpSetup({
                    qr_code: response.qr_code,
                    secret: response.secret,
                    provisioning_uri: response.provisioning_uri,
                });
            } else if (response.totp_enabled) {
                setError('TOTP már aktiválva van');
            } else {
                setError(response.error ?? 'Ismeretlen hiba');
            }
        } catch (err: unknown) {
            console.error('[UserSettings] TOTP setup error:', err);
            const errorMessage = err instanceof Error ? err.message : 'TOTP beállítás sikertelen';
            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    const handleEnableTOTP = async () => {
        if (totpCode.length !== 6) return;

        try {
            setLoading(true);
            const response = await enableTOTP({ code: totpCode });
            console.log('[SecurityTab] Enable TOTP response:', response);
            if (response.success) {
                setSuccess('2FA sikeresen aktiválva!');
                setTotpSetup(null);
                setTotpCode('');

                // Set backup codes for modal display
                if (response.backup_codes && response.backup_codes.length > 0) {
                    console.log('[SecurityTab] Showing backup codes modal:', response.backup_codes);
                    setBackupCodes(response.backup_codes);
                    // DON'T call onUpdate() here - it will be called when modal closes
                } else {
                    console.warn('[SecurityTab] No backup codes in response!');
                    onUpdate();
                }
            } else {
                setError(response.error ?? 'Érvénytelen kód');
            }
        } catch (err) {
            setError('Aktiválás sikertelen');
        } finally {
            setLoading(false);
        }
    };

    const handleDisableTOTP = async () => {
        if (disableCode.length !== 6) return;

        try {
            setLoading(true);
            const response = await disableTOTP({ code: disableCode });
            if (response.success) {
                setSuccess('2FA kikapcsolva');
                setDisableCode('');
                onUpdate();
            } else {
                setError(response.error ?? 'Érvénytelen kód');
            }
        } catch (err) {
            setError('Kikapcsolás sikertelen');
        } finally {
            setLoading(false);
        }
    };

    const handleRegenerateBackupCodes = async () => {
        if (regenerateCode.length !== 6) return;

        try {
            setLoading(true);
            const response = await regenerateBackupCodes({ code: regenerateCode });
            if (response.success) {
                setSuccess('Biztonsági kódok újragenerálva!');
                setBackupCodes(response.backup_codes ?? null);
                setRegenerateCode('');
                setShowRegenerateForm(false);
            } else {
                setError(response.error ?? 'Érvénytelen kód');
            }
        } catch (err) {
            setError('Újragenerálás sikertelen');
        } finally {
            setLoading(false);
        }
    };

    // Download backup codes as text file
    const downloadBackupCodes = (codes: string[]) => {
        const content = `NOMAD CMS - Biztonsági Kódok (Backup Codes)
============================================

Ezek a kódok csak egyszer használhatók!
Tartsd biztonságos helyen.

Generálva: ${new Date().toLocaleString('hu-HU')}

${codes.map((code, i) => `${i + 1}. ${code}`).join('\n')}

============================================
Ha egy kódot használtál, húzd át vagy töröld.
`;
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `nomad-backup-codes-${new Date().toISOString().slice(0, 10)}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setSuccess('Biztonsági kódok letöltve');
    };

    const handleDeletePasskey = (id: number, name: string | null) => {
        confirm({
            title: 'Passkey Törlése',
            message: `Biztosan törölni szeretnéd a "${name ?? 'Passkey'}" passkey-t? Ez a művelet nem visszavonható.`,
            confirmLabel: 'Törlés',
            cancelLabel: 'Mégsem',
            isDestructive: true,
            onConfirm: async () => {
                try {
                    setLoading(true);
                    const response = await deletePasskey(id);
                    if (response.success) {
                        setSuccess('Passkey törölve');
                        loadPasskeys();
                    } else {
                        setError(response.message ?? 'Törlés sikertelen');
                    }
                } catch (err) {
                    setError('Törlés sikertelen');
                } finally {
                    setLoading(false);
                }
            },
        });
    };

    const handleAddPasskey = async () => {
        console.log('[Passkey] Starting registration...');
        try {
            setLoading(true);
            setError(null);

            // Step 1: Get registration options from server
            console.log('[Passkey] Getting options from server...');
            const optionsResponse = await getWebAuthnRegisterOptions();
            console.log('[Passkey] Options response:', optionsResponse);

            if (!optionsResponse.success || !optionsResponse.options) {
                setError(optionsResponse.error ?? 'Nem sikerült a passkey beállítás');
                return;
            }

            // Helper to decode MIME-encoded binary (=?BINARY?B?base64?=) to ArrayBuffer
            const decodeMimeBase64 = (str: string): ArrayBuffer => {
                // Extract base64 from =?BINARY?B?xxx?= format
                const match = str.match(/=\?BINARY\?B\?(.+)\?=/);
                if (match) {
                    const base64 = match[1];
                    const binary = atob(base64);
                    const bytes = new Uint8Array(binary.length);
                    for (let i = 0; i < binary.length; i++) {
                        bytes[i] = binary.charCodeAt(i);
                    }
                    return bytes.buffer;
                }
                // If it's regular base64
                const binary = atob(str);
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) {
                    bytes[i] = binary.charCodeAt(i);
                }
                return bytes.buffer;
            };

            // Parse options and convert binary fields
            const rawOptions = optionsResponse.options as Record<string, unknown>;
            const publicKeyOptions = rawOptions.publicKey as Record<string, unknown>;

            // Convert challenge and user.id to ArrayBuffer
            const options: PublicKeyCredentialCreationOptions = {
                ...publicKeyOptions,
                challenge: decodeMimeBase64(publicKeyOptions.challenge as string),
                user: {
                    ...(publicKeyOptions.user as Record<string, unknown>),
                    id: decodeMimeBase64((publicKeyOptions.user as Record<string, unknown>).id as string),
                } as PublicKeyCredentialUserEntity,
            } as PublicKeyCredentialCreationOptions;

            console.log('[Passkey] Parsed options:', options);

            // Step 2: Create credential using WebAuthn browser API
            console.log('[Passkey] Calling navigator.credentials.create...');
            const credential = await navigator.credentials.create({
                publicKey: options,
            }) as PublicKeyCredential;

            console.log('[Passkey] Credential created:', credential);

            if (!credential) {
                setError('Passkey létrehozás megszakítva');
                return;
            }

            // Step 3: Send credential to server for verification
            const attestationResponse = credential.response as AuthenticatorAttestationResponse;
            console.log('[Passkey] Sending to server...');

            // Backend expects clientDataJSON and attestationObject at root level
            const registrationData = {
                id: credential.id,
                rawId: btoa(String.fromCharCode(...new Uint8Array(credential.rawId))),
                type: credential.type,
                clientDataJSON: btoa(String.fromCharCode(...new Uint8Array(attestationResponse.clientDataJSON))),
                attestationObject: btoa(String.fromCharCode(...new Uint8Array(attestationResponse.attestationObject))),
            };

            const friendlyName = generatePasskeyName();
            const registerResponse = await registerWebAuthn(registrationData, friendlyName);

            console.log('[Passkey] Server response:', registerResponse);

            if (registerResponse.success) {
                setSuccess('Passkey sikeresen hozzáadva!');
                loadPasskeys();
            } else {
                setError(registerResponse.error ?? 'Passkey regisztráció sikertelen');
            }
        } catch (err: unknown) {
            console.error('[Passkey] Error:', err);
            if (err instanceof Error) {
                if (err.name === 'NotAllowedError') {
                    setError('A passkey létrehozás meg lett szakítva');
                } else if (err.name === 'NotSupportedError') {
                    setError('A böngésző nem támogatja a passkey-ket');
                } else {
                    setError(err.message);
                }
            } else {
                setError('Passkey létrehozás sikertelen');
            }
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        setSuccess('Vágólapra másolva');
    };

    return (
        <div className="space-y-8">
            {/* TOTP / 2FA Section */}
            <div className="border border-border p-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-mono uppercase tracking-widest opacity-60 flex items-center gap-2">
                        <Smartphone size={14} />
                        Kétfaktoros hitelesítés (2FA)
                    </h3>
                    <span className={`px-2 py-1 text-xs font-mono uppercase ${settings.totp_enabled
                        ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                        : 'bg-foreground/10'
                        }`}>
                        {settings.totp_enabled ? 'Aktív' : 'Inaktív'}
                    </span>
                </div>

                {!settings.totp_enabled ? (
                    // Setup flow
                    <>
                        {!totpSetup ? (
                            <button
                                onClick={handleSetupTOTP}
                                disabled={loading}
                                className="w-full py-3 border border-dashed border-border hover:border-foreground transition-colors flex items-center justify-center gap-2 font-mono text-xs uppercase tracking-widest"
                            >
                                {loading ? <Loader2 size={14} className="animate-spin" /> : <QrCode size={14} />}
                                2FA Beállítása
                            </button>
                        ) : (
                            <div className="space-y-4">
                                <p className="text-sm opacity-60">
                                    Szkenneld be a QR kódot az authenticator alkalmazásoddal (Google Authenticator, Authy, stb.)
                                </p>

                                {totpSetup.qr_code && (
                                    <div className="flex justify-center p-4 bg-white">
                                        <img src={totpSetup.qr_code} alt="TOTP QR Code" className="w-48 h-48" />
                                    </div>
                                )}

                                {totpSetup.secret && (
                                    <div className="flex items-center gap-2 p-3 bg-foreground/5 font-mono text-sm">
                                        <span className="flex-1 break-all">{totpSetup.secret}</span>
                                        <button onClick={() => copyToClipboard(totpSetup.secret!)} className="opacity-50 hover:opacity-100">
                                            <Copy size={14} />
                                        </button>
                                    </div>
                                )}

                                <div>
                                    <label className="text-xs opacity-50 block mb-2">Ellenőrző kód</label>
                                    <div className="flex flex-col md:flex-row gap-3">
                                        <input
                                            type="text"
                                            value={totpCode}
                                            onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                            placeholder="000000"
                                            maxLength={6}
                                            className="flex-1 text-center text-xl font-mono tracking-[0.5em] bg-transparent border-b-2 border-border py-2 focus:outline-none focus:border-foreground w-full"
                                        />
                                        <button
                                            onClick={handleEnableTOTP}
                                            disabled={totpCode.length !== 6 || loading}
                                            className="px-4 py-2 bg-foreground text-background font-mono text-xs uppercase disabled:opacity-30 w-full md:w-auto"
                                        >
                                            {loading ? <Loader2 size={14} className="animate-spin" /> : 'Aktiválás'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                ) : (
                    // Disable flow + Regenerate backup codes
                    <div className="space-y-6">
                        {/* Disable 2FA */}
                        <div className="space-y-4">
                            <p className="text-sm opacity-60">
                                A 2FA kikapcsolásához add meg a jelenlegi kódod.
                            </p>
                            <div className="flex flex-col md:flex-row gap-3">
                                <input
                                    type="text"
                                    value={disableCode}
                                    onChange={e => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    placeholder="000000"
                                    maxLength={6}
                                    className="flex-1 text-center text-xl font-mono tracking-[0.5em] bg-transparent border-b-2 border-border py-2 focus:outline-none focus:border-foreground w-full"
                                />
                                <button
                                    onClick={handleDisableTOTP}
                                    disabled={disableCode.length !== 6 || loading}
                                    className="px-4 py-2 bg-destructive text-destructive-foreground font-mono text-xs uppercase disabled:opacity-30 w-full md:w-auto"
                                >
                                    {loading ? <Loader2 size={14} className="animate-spin" /> : 'Kikapcsolás'}
                                </button>
                            </div>
                        </div>

                        {/* Regenerate Backup Codes */}
                        <div className="border-t border-border pt-6">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-xs font-mono uppercase opacity-60 flex items-center gap-2">
                                    <Shield size={12} />
                                    Biztonsági kódok
                                </span>
                                {!showRegenerateForm && (
                                    <button
                                        onClick={() => setShowRegenerateForm(true)}
                                        className="px-3 py-1 border border-border hover:border-foreground transition-colors flex items-center gap-2 font-mono text-xs uppercase"
                                    >
                                        <RefreshCw size={12} />
                                        Újragenerálás
                                    </button>
                                )}
                            </div>

                            {showRegenerateForm && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    className="space-y-3"
                                >
                                    <p className="text-sm opacity-60">
                                        Az új kódok generálása érvényteleníti a régieket!
                                    </p>
                                    <div className="flex flex-col md:flex-row gap-3">
                                        <input
                                            type="text"
                                            value={regenerateCode}
                                            onChange={e => setRegenerateCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                            placeholder="2FA kód"
                                            maxLength={6}
                                            className="flex-1 text-center text-lg font-mono tracking-[0.3em] bg-transparent border-b-2 border-border py-2 focus:outline-none focus:border-foreground w-full"
                                        />
                                        <div className="flex gap-3">
                                            <button
                                                onClick={handleRegenerateBackupCodes}
                                                disabled={regenerateCode.length !== 6 || loading}
                                                className="flex-1 md:flex-none px-4 py-2 bg-foreground text-background font-mono text-xs uppercase disabled:opacity-30"
                                            >
                                                {loading ? <Loader2 size={14} className="animate-spin" /> : 'Generálás'}
                                            </button>
                                            <button
                                                onClick={() => { setShowRegenerateForm(false); setRegenerateCode(''); }}
                                                className="flex-1 md:flex-none px-3 py-2 border border-border font-mono text-xs uppercase hover:bg-foreground/5"
                                            >
                                                Mégsem
                                            </button>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Backup Codes Modal */}
            {backupCodes && (
                <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-background border border-border p-6 w-full max-w-md"
                    >
                        <div className="flex items-center gap-2 mb-4 text-amber-500">
                            <AlertTriangle size={20} />
                            <h3 className="font-bold">Biztonsági Kódok</h3>
                        </div>
                        <p className="text-sm opacity-60 mb-4">
                            Mentsd el ezeket a kódokat biztonságos helyre! Ha elveszíted a hozzáférést az authenticator alkalmazásodhoz, ezekkel tudsz bejelentkezni.
                        </p>
                        <div className="grid grid-cols-2 gap-2 mb-4 p-4 bg-foreground/5 font-mono text-sm border border-border">
                            {backupCodes.map((code, i) => (
                                <div key={i} className="py-1 flex items-center gap-2">
                                    <span className="text-[10px] opacity-40">{i + 1}.</span>
                                    <span className="tracking-widest">{code}</span>
                                </div>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => downloadBackupCodes(backupCodes)}
                                className="flex-1 py-2 border border-border hover:border-foreground transition-colors font-mono text-xs uppercase flex items-center justify-center gap-2"
                            >
                                <Download size={12} />
                                Letöltés
                            </button>
                            <button
                                onClick={() => {
                                    copyToClipboard(backupCodes.join('\n'));
                                    setBackupCodes(null);
                                    onUpdate(); // Refresh settings after modal closes
                                }}
                                className="flex-1 py-2 bg-foreground text-background font-mono text-xs uppercase flex items-center justify-center gap-2"
                            >
                                <Copy size={12} />
                                Másolás és Bezárás
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}

            {/* Passkeys Section */}
            <div className="border border-border p-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-mono uppercase tracking-widest opacity-60 flex items-center gap-2">
                        <Key size={14} />
                        Passkey-k (Ujjlenyomat, FaceID)
                    </h3>
                    <button
                        onClick={handleAddPasskey}
                        disabled={loading}
                        className="px-3 py-1 border border-border hover:border-foreground transition-colors flex items-center gap-2 font-mono text-xs uppercase disabled:opacity-50"
                    >
                        <Plus size={12} />
                        Új Passkey
                    </button>
                </div>

                {passkeys.length === 0 ? (
                    <p className="text-sm opacity-50 text-center py-4">
                        Nincs regisztrált passkey
                    </p>
                ) : (
                    <div className="space-y-2">
                        {passkeys.map(pk => (
                            <div key={pk.id} className="flex items-center justify-between p-3 bg-foreground/5">
                                <div>
                                    <div className="font-medium">{pk.friendly_name || 'Passkey'}</div>
                                    <div className="text-xs opacity-50">
                                        Létrehozva: {new Date(pk.created_at).toLocaleDateString('hu-HU')}
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleDeletePasskey(pk.id, pk.friendly_name)}
                                    disabled={loading}
                                    className="p-2 opacity-50 hover:opacity-100 hover:text-destructive transition-all"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
