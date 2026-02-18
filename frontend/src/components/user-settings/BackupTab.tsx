import { useState, useRef } from 'react';
import {
    Database, Download, Upload, Loader2, Key, Shield, FileKey, X, AlertTriangle, Eye, LifeBuoy, CheckCircle2
} from 'lucide-react';
import { TabProps } from './types';
import { downloadBackup, restoreBackup } from '@/api/admin';
import { BackupViewer } from '../BackupViewer/BackupViewer';

type ModalMode = 'backup' | 'restore' | null;

/**
 * Password strength calculator - same as InstallPage
 */
function calculatePasswordStrength(password: string): {
    score: number;
    label: string;
    requirements: { met: boolean; text: string }[];
} {
    const requirements = [
        { met: password.length >= 16, text: 'Min. 16 karakter' },
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

export function BackupTab({ setError, setSuccess }: TabProps) {
    const [creating, setCreating] = useState(false);
    const [restoring, setRestoring] = useState(false);

    // Modal state
    const [modalMode, setModalMode] = useState<ModalMode>(null);
    const [totpCode, setTotpCode] = useState('');

    // Restore state
    const [nomadFile, setNomadFile] = useState<File | null>(null);
    const [privateKey, setPrivateKey] = useState('');
    const nomadInputRef = useRef<HTMLInputElement>(null);
    const pemInputRef = useRef<HTMLInputElement>(null);

    const [showPreview, setShowPreview] = useState(false);

    // Disaster Recovery Kit state (backup)
    const [includeRecoveryKit, setIncludeRecoveryKit] = useState(false);
    const [recoveryPassword, setRecoveryPassword] = useState('');
    const [recoveryPasswordConfirm, setRecoveryPasswordConfirm] = useState('');

    // Disaster Recovery state (restore)
    const [disasterRecoveryMode, setDisasterRecoveryMode] = useState(false);
    const [recoveryFile, setRecoveryFile] = useState<File | null>(null);
    const [recoveryPasswordRestore, setRecoveryPasswordRestore] = useState('');
    const recoveryInputRef = useRef<HTMLInputElement>(null);

    // ==========================================================================
    // Backup Download
    // ==========================================================================
    const handleOpenBackupModal = () => {
        setModalMode('backup');
        setTotpCode('');
        setIncludeRecoveryKit(false);
        setRecoveryPassword('');
        setRecoveryPasswordConfirm('');
        setError(null);
    };

    const handleConfirmBackup = async () => {
        if (totpCode.length !== 6) {
            setError('A TOTP kód 6 számjegyű must legyen');
            return;
        }

        // Validate recovery password if enabled - use strength checker
        if (includeRecoveryKit) {
            const strength = calculatePasswordStrength(recoveryPassword);
            if (strength.score < 100) {
                setError('A visszaállítási jelszó nem elég erős');
                return;
            }
            if (recoveryPassword !== recoveryPasswordConfirm) {
                setError('A jelszavak nem egyeznek');
                return;
            }
        }

        setCreating(true);
        setError(null);

        try {
            await downloadBackup(totpCode, includeRecoveryKit ? recoveryPassword : undefined);
            setSuccess(includeRecoveryKit
                ? 'Biztonsági mentés letöltve (.nomad + .pem + recovery.nms)'
                : 'Biztonsági mentés letöltve (.nomad + .pem)');
            setModalMode(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Backup létrehozása sikertelen');
        } finally {
            setCreating(false);
        }
    };

    // ==========================================================================
    // Restore
    // ==========================================================================
    const handleOpenRestoreModal = () => {
        setModalMode('restore');
        setTotpCode('');
        setNomadFile(null);
        setPrivateKey('');
        setDisasterRecoveryMode(false);
        setRecoveryFile(null);
        setRecoveryPasswordRestore('');
        setError(null);
    };

    const handleNomadFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && file.name.endsWith('.nomad')) {
            setNomadFile(file);
        } else {
            setError('Csak .nomad fájl tölthető fel');
        }
    };

    const handlePemFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && file.name.endsWith('.pem')) {
            const content = await file.text();
            setPrivateKey(content);
        } else {
            setError('Csak .pem fájl tölthető fel');
        }
    };

    const handleConfirmRestore = async () => {
        if (!nomadFile) {
            setError('.nomad backup fájl szükséges');
            return;
        }
        if (!privateKey) {
            setError('.pem privát kulcs szükséges');
            return;
        }

        setRestoring(true);
        setError(null);

        try {
            const result = await restoreBackup(
                nomadFile,
                privateKey,
                disasterRecoveryMode ? recoveryPasswordRestore : undefined,
                disasterRecoveryMode ? recoveryFile || undefined : undefined
            );
            setSuccess(result.disaster_recovery
                ? 'Katasztrófa visszaállítás sikeres! Adatok migrálva.'
                : (result.message || 'Visszaállítás sikeres'));
            setModalMode(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Visszaállítás sikertelen');
        } finally {
            setRestoring(false);
        }
    };

    const closeModal = () => {
        if (!creating && !restoring) {
            setModalMode(null);
        }
    };

    return (
        <div className="space-y-8">
            {/* Backup Section */}
            <div className="border border-border p-6">
                <h3 className="text-sm font-mono uppercase tracking-widest mb-4 opacity-60 flex items-center gap-2">
                    <Database size={14} />
                    Zero-Knowledge Backup
                </h3>
                <div className="flex flex-col md:flex-row items-start justify-between gap-4">
                    <div className="max-w-md">
                        <p className="text-sm opacity-80 mb-2">
                            Titkosított biztonsági mentés letöltése. A mentés tartalmazza az adatbázisokat és a feltöltött fájlokat.
                        </p>
                        <p className="text-xs opacity-50 flex items-center gap-1">
                            <Shield size={10} />
                            RSA-2048 + AES-256-GCM titkosítás
                        </p>
                    </div>
                    <button
                        onClick={handleOpenBackupModal}
                        disabled={creating || restoring}
                        className="w-full md:w-auto px-4 py-2 bg-foreground text-background font-mono text-xs uppercase tracking-widest disabled:opacity-30 hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                    >
                        <Download size={14} />
                        Mentés Letöltése
                    </button>
                    <button
                        onClick={() => setShowPreview(true)}
                        className="w-full md:w-auto px-4 py-2 border border-border hover:border-foreground hover:bg-foreground hover:text-background transition-all font-mono text-xs uppercase tracking-widest flex items-center justify-center gap-2"
                    >
                        <Eye size={14} />
                        Előnézet
                    </button>
                </div>
            </div>

            {/* Restore Section */}
            <div className="border border-border p-6">
                <h3 className="text-sm font-mono uppercase tracking-widest mb-4 opacity-60 flex items-center gap-2">
                    <Upload size={14} />
                    Visszaállítás
                </h3>
                <div className="flex flex-col md:flex-row items-start justify-between gap-4">
                    <div className="max-w-md">
                        <p className="text-sm opacity-80 mb-2">
                            Rendszer visszaállítása korábbi .nomad mentésből.
                        </p>
                        <p className="text-xs opacity-50 flex items-center gap-1">
                            <AlertTriangle size={10} />
                            A jelenlegi adatok felülírásra kerülnek
                        </p>
                    </div>
                    <button
                        onClick={handleOpenRestoreModal}
                        disabled={creating || restoring}
                        className="w-full md:w-auto px-4 py-2 border border-border hover:border-foreground hover:bg-foreground hover:text-background transition-all font-mono text-xs uppercase tracking-widest disabled:opacity-30 flex items-center justify-center gap-2"
                    >
                        <FileKey size={14} />
                        Visszaállítás
                    </button>
                </div>
            </div>

            {/* Modal */}
            {modalMode && (
                <div
                    className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
                    onClick={closeModal}
                >
                    <div
                        className="bg-background border border-border p-8 max-w-md w-full mx-4"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-sm font-mono uppercase tracking-widest flex items-center gap-2">
                                <Key size={14} />
                                {modalMode === 'backup' ? '2FA Hitelesítés' : 'Visszaállítás'}
                            </h3>
                            <button
                                onClick={closeModal}
                                disabled={creating || restoring}
                                className="opacity-50 hover:opacity-100 transition-opacity disabled:opacity-20"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="space-y-4">
                            {/* TOTP Input - Only for backup download */}
                            {modalMode === 'backup' && (
                                <div>
                                    <label className="text-xs opacity-50 block mb-2">TOTP Kód (6 számjegy)</label>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        maxLength={6}
                                        value={totpCode}
                                        onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                                        placeholder="000000"
                                        className="w-full bg-transparent border-b border-border py-2 focus:outline-none focus:border-foreground transition-colors font-mono text-2xl tracking-[0.5em] text-center"
                                        autoFocus
                                    />
                                </div>
                            )}

                            {/* Disaster Recovery Kit (backup mode only) */}
                            {modalMode === 'backup' && (
                                <>
                                    <div className="border-t border-border pt-4 mt-4">
                                        <label className="flex items-center gap-3 cursor-pointer group">
                                            <input
                                                type="checkbox"
                                                checked={includeRecoveryKit}
                                                onChange={(e) => setIncludeRecoveryKit(e.target.checked)}
                                                className="w-4 h-4 accent-foreground"
                                            />
                                            <div>
                                                <span className="text-sm flex items-center gap-2">
                                                    <LifeBuoy size={14} />
                                                    Katasztrófa Visszaállítási Kit
                                                </span>
                                                <p className="text-xs opacity-50 mt-1">
                                                    Titkosított másolat a szerver kulcsairól — offline tárolás ajánlott
                                                </p>
                                            </div>
                                        </label>
                                    </div>

                                    {includeRecoveryKit && (
                                        <div className="space-y-3 pl-7 animate-in fade-in slide-in-from-top-2 duration-200">
                                            <div>
                                                <label className="text-xs opacity-50 block mb-2">Visszaállítási Jelszó</label>
                                                <input
                                                    type="password"
                                                    value={recoveryPassword}
                                                    onChange={(e) => setRecoveryPassword(e.target.value)}
                                                    placeholder="Min. 16 karakter, erős jelszó"
                                                    className="w-full bg-transparent border border-border px-3 py-2 focus:outline-none focus:border-foreground transition-colors font-mono text-sm"
                                                />
                                                {/* Password strength indicator */}
                                                {recoveryPassword && (
                                                    <div className="mt-3 space-y-2">
                                                        <div className="flex items-center justify-between text-xs">
                                                            <span className="opacity-50">Jelszó erősség:</span>
                                                            <span className={`font-mono ${
                                                                calculatePasswordStrength(recoveryPassword).score >= 100 ? 'text-green-500' :
                                                                calculatePasswordStrength(recoveryPassword).score >= 60 ? 'text-yellow-500' : 'text-red-500'
                                                            }`}>
                                                                {calculatePasswordStrength(recoveryPassword).label}
                                                            </span>
                                                        </div>
                                                        <div className="h-1 bg-border overflow-hidden">
                                                            <div 
                                                                className={`h-full transition-all duration-300 ${
                                                                    calculatePasswordStrength(recoveryPassword).score >= 100 ? 'bg-green-500' :
                                                                    calculatePasswordStrength(recoveryPassword).score >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                                                                }`}
                                                                style={{ width: `${calculatePasswordStrength(recoveryPassword).score}%` }}
                                                            />
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-1 text-xs">
                                                            {calculatePasswordStrength(recoveryPassword).requirements.map((req, i) => (
                                                                <div key={i} className={`flex items-center gap-1 ${req.met ? 'text-green-500' : 'opacity-40'}`}>
                                                                    <CheckCircle2 size={10} />
                                                                    {req.text}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            <div>
                                                <label className="text-xs opacity-50 block mb-2">Jelszó Megerősítése</label>
                                                <input
                                                    type="password"
                                                    value={recoveryPasswordConfirm}
                                                    onChange={(e) => setRecoveryPasswordConfirm(e.target.value)}
                                                    placeholder="Jelszó újra"
                                                    className={`w-full bg-transparent border px-3 py-2 focus:outline-none transition-colors font-mono text-sm ${
                                                        recoveryPasswordConfirm && recoveryPassword !== recoveryPasswordConfirm 
                                                            ? 'border-red-500' 
                                                            : recoveryPasswordConfirm && recoveryPassword === recoveryPasswordConfirm
                                                                ? 'border-green-500'
                                                                : 'border-border focus:border-foreground'
                                                    }`}
                                                />
                                                {recoveryPasswordConfirm && recoveryPassword !== recoveryPasswordConfirm && (
                                                    <p className="text-xs text-red-500 mt-1">A jelszavak nem egyeznek</p>
                                                )}
                                            </div>
                                            <p className="text-xs opacity-40 flex items-center gap-1">
                                                <AlertTriangle size={10} />
                                                Ezt a jelszót jegyezd meg! Katasztrófa esetén erre lesz szükség.
                                            </p>
                                        </div>
                                    )}
                                </>
                            )}

                            {/* Restore inputs */}
                            {modalMode === 'restore' && (
                                <>
                                    <div>
                                        <label className="text-xs opacity-50 block mb-2">.nomad Backup Fájl</label>
                                        <input
                                            ref={nomadInputRef}
                                            type="file"
                                            accept=".nomad"
                                            onChange={handleNomadFileChange}
                                            className="hidden"
                                        />
                                        <button
                                            onClick={() => nomadInputRef.current?.click()}
                                            className="w-full border border-dashed border-border p-4 text-center hover:border-foreground transition-colors"
                                        >
                                            {nomadFile ? (
                                                <span className="font-mono text-sm">{nomadFile.name}</span>
                                            ) : (
                                                <span className="opacity-50 text-sm">Kattints a feltöltéshez...</span>
                                            )}
                                        </button>
                                    </div>

                                    <div>
                                        <label className="text-xs opacity-50 block mb-2">.pem Privát Kulcs</label>
                                        <input
                                            ref={pemInputRef}
                                            type="file"
                                            accept=".pem"
                                            onChange={handlePemFileChange}
                                            className="hidden"
                                        />
                                        <button
                                            onClick={() => pemInputRef.current?.click()}
                                            className="w-full border border-dashed border-border p-4 text-center hover:border-foreground transition-colors"
                                        >
                                            {privateKey ? (
                                                <span className="font-mono text-sm text-green-500 flex items-center justify-center gap-2">
                                                    <Key size={12} /> Kulcs betöltve
                                                </span>
                                            ) : (
                                                <span className="opacity-50 text-sm">Kattints a feltöltéshez...</span>
                                            )}
                                        </button>
                                    </div>

                                    {/* Disaster Recovery Mode */}
                                    <div className="border-t border-border pt-4 mt-2">
                                        <label className="flex items-center gap-3 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={disasterRecoveryMode}
                                                onChange={(e) => setDisasterRecoveryMode(e.target.checked)}
                                                className="w-4 h-4 accent-foreground"
                                            />
                                            <div>
                                                <span className="text-sm flex items-center gap-2">
                                                    <LifeBuoy size={14} />
                                                    Katasztrófa Visszaállítás Mód
                                                </span>
                                                <p className="text-xs opacity-50 mt-1">
                                                    Használd, ha a szerver .env kulcsai megváltoztak
                                                </p>
                                            </div>
                                        </label>
                                    </div>

                                    {disasterRecoveryMode && (
                                        <div className="space-y-3 pl-7 animate-in fade-in slide-in-from-top-2 duration-200">
                                            <div>
                                                <label className="text-xs opacity-50 block mb-2">recovery.nms Fájl</label>
                                                <input
                                                    ref={recoveryInputRef}
                                                    type="file"
                                                    accept=".nms"
                                                    onChange={(e) => {
                                                        const file = e.target.files?.[0];
                                                        if (file?.name.endsWith('.nms')) {
                                                            setRecoveryFile(file);
                                                        } else {
                                                            setError('Csak .nms fájl tölthető fel');
                                                        }
                                                    }}
                                                    className="hidden"
                                                />
                                                <button
                                                    onClick={() => recoveryInputRef.current?.click()}
                                                    className="w-full border border-dashed border-border p-3 text-center hover:border-foreground transition-colors"
                                                >
                                                    {recoveryFile ? (
                                                        <span className="font-mono text-sm text-yellow-500 flex items-center justify-center gap-2">
                                                            <FileKey size={12} /> {recoveryFile.name}
                                                        </span>
                                                    ) : (
                                                        <span className="opacity-50 text-sm">Töltsd fel a recovery.nms fájlt...</span>
                                                    )}
                                                </button>
                                            </div>
                                            <div>
                                                <label className="text-xs opacity-50 block mb-2">Visszaállítási Jelszó</label>
                                                <input
                                                    type="password"
                                                    value={recoveryPasswordRestore}
                                                    onChange={(e) => setRecoveryPasswordRestore(e.target.value)}
                                                    placeholder="A backup létrehozásakor megadott jelszó"
                                                    className="w-full bg-transparent border border-border px-3 py-2 focus:outline-none focus:border-foreground transition-colors font-mono text-sm"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        <div className="mt-8 flex gap-3">
                            <button
                                onClick={closeModal}
                                disabled={creating || restoring}
                                className="flex-1 px-4 py-3 border border-border font-mono text-xs uppercase tracking-widest hover:bg-foreground/5 transition-colors disabled:opacity-30"
                            >
                                Mégse
                            </button>
                            <button
                                onClick={modalMode === 'backup' ? handleConfirmBackup : handleConfirmRestore}
                                disabled={
                                    creating || restoring ||
                                    (modalMode === 'backup' && totpCode.length !== 6) ||
                                    (modalMode === 'restore' && (!nomadFile || !privateKey))
                                }
                                className="flex-1 px-4 py-3 bg-foreground text-background font-mono text-xs uppercase tracking-widest disabled:opacity-30 hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                            >
                                {(creating || restoring) ? (
                                    <Loader2 size={14} className="animate-spin" />
                                ) : modalMode === 'backup' ? (
                                    <Download size={14} />
                                ) : (
                                    <Upload size={14} />
                                )}
                                {modalMode === 'backup' ? 'Letöltés' : 'Visszaállítás'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Backup Viewer */}
            <BackupViewer isOpen={showPreview} onClose={() => setShowPreview(false)} />
        </div>
    );
}
