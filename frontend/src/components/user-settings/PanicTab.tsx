import { useState, useEffect } from 'react';
import {
    AlertTriangle, ShieldCheck, Loader2, Power, PowerOff,
    AlertOctagon, Coffee, Zap, Lock, Unlock, Users, RefreshCw, Server
} from 'lucide-react';
import { TabProps } from './types';
import { getPanicModeStatus, togglePanicMode, PanicModeStatus } from '@/api/admin';

export function PanicTab({ setError, setSuccess }: TabProps) {
    const [loading, setLoading] = useState(true);
    const [toggling, setToggling] = useState(false);
    const [status, setStatus] = useState<PanicModeStatus | null>(null);
    const [reason, setReason] = useState('');
    const [showConfirm, setShowConfirm] = useState(false);

    // Load status on mount
    useEffect(() => {
        loadStatus();
    }, []);

    const loadStatus = async () => {
        try {
            setLoading(true);
            const response = await getPanicModeStatus();
            if (response.panic_mode) {
                setStatus(response.panic_mode);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Státusz betöltése sikertelen');
        } finally {
            setLoading(false);
        }
    };

    const handleToggle = async () => {
        if (status?.enabled) {
            // Disabling - no confirmation needed
            await executeToggle('disable');
        } else {
            // Enabling - show confirmation
            setShowConfirm(true);
        }
    };

    const executeToggle = async (action: 'enable' | 'disable') => {
        setToggling(true);
        setError(null);
        setShowConfirm(false);

        try {
            const response = await togglePanicMode(action, reason || undefined);

            if (response.success) {
                setSuccess(response.message || (action === 'enable' ? 'Rendszer lezárás aktiválva' : 'Rendszer lezárás feloldva'));
                if (response.status) {
                    setStatus(response.status);
                }
                setReason('');
            } else {
                setError(response.error || 'Művelet sikertelen');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Művelet sikertelen');
        } finally {
            setToggling(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12 opacity-50">
                <Loader2 size={20} className="animate-spin" />
            </div>
        );
    }

    const isPanic = status?.enabled ?? false;

    return (
        <div className="space-y-8">
            {/* Header with Status */}
            <div className={`border p-8 transition-all duration-500 ${isPanic
                ? 'border-red-500/50 bg-red-500/5'
                : 'border-emerald-500/30 bg-emerald-500/5'
                }`}>
                {/* Big Status Icon */}
                <div className="flex flex-col items-center text-center">
                    <div className={`p-6 rounded-full mb-6 transition-all duration-500 ${isPanic
                        ? 'bg-red-500/10 text-red-500'
                        : 'bg-emerald-500/10 text-emerald-500'
                        }`}>
                        {isPanic ? (
                            <AlertOctagon size={48} strokeWidth={1.5} />
                        ) : (
                            <ShieldCheck size={48} strokeWidth={1.5} />
                        )}
                    </div>

                    <h2 className={`text-xl font-bold mb-2 tracking-tight ${isPanic ? 'text-red-500' : 'text-emerald-500'}`}>
                        {isPanic ? 'RENDSZER KORLÁTOZVA' : 'MINDEN SZOLGÁLTATÁS AKTÍV'}
                    </h2>

                    <p className="text-sm opacity-60 max-w-md">
                        {isPanic
                            ? 'A rendszer jelenleg korlátozott (csak olvasás) módban üzemel. Minden módosítási kísérlet elutasításra kerül.'
                            : 'A rendszer normál üzemmódban működik. Minden szolgáltatás és adatbázis művelet elérhető.'}
                    </p>
                </div>
            </div>

            {/* Status Details (when active) */}
            {isPanic && status && (
                <div className="border border-red-500/30 bg-red-500/5 p-6 space-y-4">
                    <h3 className="text-xs font-mono uppercase tracking-widest opacity-60 flex items-center gap-2 text-red-500">
                        <AlertTriangle size={14} />
                        Aktív Korlátozások
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="flex items-center gap-3 p-3 bg-background/50 border border-border/50">
                            <Lock size={16} className="text-red-500" />
                            <div>
                                <div className="text-sm font-medium">Írásvédelem</div>
                                <div className="text-xs opacity-50">POST/PUT/DELETE tiltva</div>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 p-3 bg-background/50 border border-border/50">
                            <Users size={16} className="text-red-500" />
                            <div>
                                <div className="text-sm font-medium">Hitelesítés</div>
                                <div className="text-xs opacity-50">{status.sessions_revoked} munkamenet visszavonva</div>
                            </div>
                        </div>

                        {status.activated_at && (
                            <div className="flex items-center gap-3 p-3 bg-background/50 border border-border/50">
                                <Zap size={16} className="text-red-500" />
                                <div>
                                    <div className="text-sm font-medium">Aktiválás ideje</div>
                                    <div className="text-xs opacity-50">
                                        {new Date(status.activated_at).toLocaleString('hu-HU')}
                                    </div>
                                </div>
                            </div>
                        )}

                        {status.reason && (
                            <div className="flex items-center gap-3 p-3 bg-background/50 border border-border/50">
                                <Coffee size={16} className="text-red-500" />
                                <div>
                                    <div className="text-sm font-medium">Indoklás</div>
                                    <div className="text-xs opacity-50 truncate max-w-[200px]">
                                        {status.reason}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Info Box */}
            <div className="border border-border p-6 space-y-4">
                <h3 className="text-xs font-mono uppercase tracking-widest opacity-60 flex items-center gap-2">
                    <Server size={14} />
                    Működési Információk
                </h3>

                <div className="space-y-3 text-sm opacity-70">
                    <p>
                        A <strong>Biztonsági Lezárás</strong> (Panic Mode) egy vészhelyzeti funkció, amely azonnal
                        <span className="text-red-500 font-medium"> csak olvasás (read-only)</span> üzemmódba helyezi a rendszert.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                        <div className="space-y-2">
                            <strong className="text-xs uppercase tracking-wide opacity-80">Hatások:</strong>
                            <ul className="list-disc list-inside space-y-1 ml-2 text-xs">
                                <li>Adatbázis írási műveletek blokkolása</li>
                                <li>Fájl feltöltések és módosítások tiltása</li>
                                <li>Adminisztrátori munkamenetek érvénytelenítése</li>
                            </ul>
                        </div>
                        <div className="space-y-2">
                            <strong className="text-xs uppercase tracking-wide opacity-80">Engedélyezett:</strong>
                            <ul className="list-disc list-inside space-y-1 ml-2 text-xs">
                                <li>Publikus oldalak megtekintése (GET)</li>
                                <li>Admin felület olvasása (GET)</li>
                                <li>Rendszer állapotának lekérdezése</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>

            {/* Confirmation Modal */}
            {showConfirm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-background border border-border p-6 max-w-md w-full space-y-6 shadow-2xl">
                        <div className="flex items-center gap-3 text-red-500 border-b border-border pb-4">
                            <AlertOctagon size={24} />
                            <h3 className="text-lg font-bold">Rendszer Lezárása</h3>
                        </div>

                        <div className="space-y-4">
                            <p className="text-sm opacity-70">
                                Ez a művelet <strong>azonnal megszakít minden aktív kapcsolatot</strong> és
                                írásvédett módba kapcsolja a teljes rendszert.
                            </p>

                            <div>
                                <label className="block text-xs font-mono uppercase tracking-widest opacity-60 mb-2">
                                    Naplózási Indok (Opcionális)
                                </label>
                                <input
                                    type="text"
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    placeholder="Pl.: Karbantartás, biztonsági incidens..."
                                    maxLength={200}
                                    className="w-full px-4 py-3 bg-background border border-border focus:border-red-500 focus:outline-none transition-colors font-mono text-sm"
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button
                                onClick={() => setShowConfirm(false)}
                                className="flex-1 px-4 py-3 border border-border font-mono text-xs uppercase tracking-widest hover:bg-foreground/5 transition-colors"
                            >
                                Mégsem
                            </button>
                            <button
                                onClick={() => executeToggle('enable')}
                                disabled={toggling}
                                className="flex-1 px-4 py-3 bg-red-500 text-white font-mono text-xs uppercase tracking-widest hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {toggling ? (
                                    <Loader2 size={14} className="animate-spin" />
                                ) : (
                                    <Power size={14} />
                                )}
                                Lezárás
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Main Action Button */}
            <div className="flex flex-col items-center gap-4 pt-4">
                <button
                    onClick={handleToggle}
                    disabled={toggling}
                    className={`w-full max-w-md px-8 py-4 font-mono text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-3 border ${isPanic
                        ? 'bg-emerald-500 text-white hover:bg-emerald-600 border-transparent'
                        : 'bg-background text-red-500 border-red-500 hover:bg-red-500 hover:text-white'
                        } disabled:opacity-50`}
                >
                    {toggling ? (
                        <Loader2 size={16} className="animate-spin" />
                    ) : isPanic ? (
                        <>
                            <Unlock size={16} />
                            Korlátozás Feloldása
                        </>
                    ) : (
                        <>
                            <PowerOff size={16} />
                            Rendszer Lezárása (Panic Mode)
                        </>
                    )}
                </button>

                {/* Refresh Button */}
                <button
                    onClick={loadStatus}
                    disabled={loading}
                    className="px-4 py-2 text-xs font-mono uppercase tracking-widest opacity-40 hover:opacity-100 transition-opacity flex items-center gap-2"
                >
                    <RefreshCw size={12} />
                    Státusz Frissítése
                </button>
            </div>
        </div>
    );
}
