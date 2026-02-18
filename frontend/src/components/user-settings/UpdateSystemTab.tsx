/**
 * Rendszerfrissítés Tab
 * 
 * Felhasználóbarát UI a rendszerfrissítések kezeléséhez.
 * Stílus: CacheTab-hoz illeszkedő, egyszerű border-border design.
 */

import { useState, useEffect, useCallback } from 'react';
import {
    Download, RefreshCw, ChevronDown, Package, Shield, Clock,
    ArrowRight, Loader2, CheckCircle2, XCircle, FileText, Plus, Minus,
    Edit3, HardDrive, Server, Wifi, AlertTriangle
} from 'lucide-react';
import { TabProps } from './types';
import {
    getSystemVersion, getAvailableReleases, checkForUpdates, applyUpdate,
    UpdateInfo, VersionInfo, SystemVersionInfo
} from '@/api/systemUpdate';
import { useUI } from '@/context/UIContext';

// Simplified props for tabs that don't need settings
type SimpleTabProps = Pick<TabProps, 'setError' | 'setSuccess'>;

type UpdateStage = 'idle' | 'checking' | 'ready' | 'downloading' | 'applying' | 'complete' | 'error';

/** Format bytes to human readable */
function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/** Format relative date */
function formatRelativeDate(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'ma';
    if (diffDays === 1) return 'tegnap';
    if (diffDays < 7) return `${diffDays} napja`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} hete`;
    return date.toLocaleDateString('hu-HU');
}

export function UpdateSystemTab({ setError, setSuccess }: SimpleTabProps) {
    const { confirm } = useUI();

    // State
    const [stage, setStage] = useState<UpdateStage>('idle');
    const [versionInfo, setVersionInfo] = useState<SystemVersionInfo | null>(null);
    const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
    const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
    const [availableVersions, setAvailableVersions] = useState<VersionInfo[]>([]);
    const [showVersionPicker, setShowVersionPicker] = useState(false);
    const [progress, setProgress] = useState(0);
    const [progressMessage, setProgressMessage] = useState('');

    // Load current version on mount
    useEffect(() => {
        loadCurrentVersion();
    }, []);

    const loadCurrentVersion = async () => {
        try {
            const info = await getSystemVersion();
            setVersionInfo(info);
        } catch (err) {
            console.error('Failed to load version:', err);
            // Use fallback
            setVersionInfo({
                version: '1.0.0',
                buildDate: new Date().toISOString().split('T')[0],
                codename: 'Genesis',
            });
        }
    };

    const handleCheckUpdates = useCallback(async () => {
        setStage('checking');
        setUpdateInfo(null);

        try {
            const info = await checkForUpdates(selectedVersion || undefined);

            setUpdateInfo(info);
            setStage(info.available ? 'ready' : 'idle');

            if (!info.available) {
                setSuccess?.('A rendszer naprakész!');
            }
        } catch (err) {
            setStage('error');
            setError?.('Nem sikerült ellenőrizni a frissítéseket');
        }
    }, [selectedVersion, setError, setSuccess]);

    const handleApplyUpdate = async () => {
        if (!updateInfo) return;

        // Confirmation dialog
        const confirmed = await new Promise<boolean>(resolve => {
            confirm({
                title: 'Frissítés Telepítése',
                message: `Biztosan telepíted a v${updateInfo.latestVersion} verziót? A rendszer automatikusan biztonsági mentést készít.`,
                confirmLabel: 'Telepítés',
                cancelLabel: 'Mégsem',
                onConfirm: () => resolve(true),
                onCancel: () => resolve(false),
            });
        });

        if (!confirmed) return;

        setStage('downloading');
        setProgress(0);
        setProgressMessage('Fájlok letöltése...');

        try {
            // Simulate progress (real progress would come from SSE or polling)
            const progressInterval = setInterval(() => {
                setProgress(p => Math.min(p + 10, 90));
            }, 500);

            const result = await applyUpdate(updateInfo.latestVersion);

            clearInterval(progressInterval);

            if (result.success) {
                setProgress(100);
                setStage('complete');
                setSuccess?.(`Sikeres frissítés: v${result.toVersion}`);

                // Reload version after update
                setTimeout(() => {
                    loadCurrentVersion();
                    setUpdateInfo(null);
                    setStage('idle');
                }, 2000);
            } else {
                throw new Error(result.error || 'Frissítés sikertelen');
            }

        } catch (err) {
            setStage('error');
            setError?.('A frissítés sikertelen. A rendszer visszaállt az előző verzióra.');
        }
    };

    const loadAvailableVersions = async () => {
        try {
            const result = await getAvailableReleases();
            setAvailableVersions(result.releases);
        } catch {
            setError?.('Nem sikerült betölteni a verziókat');
        }
    };

    const handleOpenVersionPicker = () => {
        loadAvailableVersions();
        setShowVersionPicker(true);
    };

    // Calculate total changes for display
    const changes = updateInfo?.changes ?? { added: 0, modified: 0, deleted: 0, unchanged: 0 };
    const totalChanges = changes.added + changes.modified + changes.deleted;

    const currentVersion = versionInfo?.version ?? '1.0.0';

    return (
        <div className="space-y-8">
            {/* Status Card */}
            <div className="border border-border p-6">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-sm font-mono uppercase tracking-widest opacity-60 flex items-center gap-2">
                        <Download size={14} />
                        Rendszerfrissítés
                    </h3>
                    <div className="flex items-center gap-2">
                        <span className="px-2 py-1 text-xs font-mono bg-foreground/5 border border-border">
                            v{currentVersion}
                        </span>
                        {versionInfo?.codename && (
                            <span className="text-[10px] font-mono opacity-40 uppercase">
                                {versionInfo.codename}
                            </span>
                        )}
                    </div>
                </div>

                {/* Status Display */}
                <div className="flex items-center gap-4 mb-6">
                    <div className={`p-3 border ${stage === 'complete' ? 'border-emerald-500/50 bg-emerald-500/5' :
                        stage === 'error' ? 'border-red-500/50 bg-red-500/5' :
                            stage === 'ready' ? 'border-blue-500/50 bg-blue-500/5' :
                                'border-border bg-foreground/5'
                        }`}>
                        {stage === 'complete' ? (
                            <CheckCircle2 className="text-emerald-500" size={20} />
                        ) : stage === 'error' ? (
                            <XCircle className="text-red-500" size={20} />
                        ) : stage === 'ready' ? (
                            <Download className="text-blue-500" size={20} />
                        ) : stage === 'checking' || stage === 'downloading' ? (
                            <Loader2 className="animate-spin opacity-50" size={20} />
                        ) : (
                            <Shield className="opacity-30" size={20} />
                        )}
                    </div>
                    <div>
                        <div className="text-sm font-medium">
                            {stage === 'idle' && 'Ellenőrizd a frissítéseket'}
                            {stage === 'checking' && 'Keresés...'}
                            {stage === 'ready' && 'Frissítés elérhető!'}
                            {stage === 'downloading' && progressMessage}
                            {stage === 'applying' && 'Telepítés folyamatban...'}
                            {stage === 'complete' && 'Sikeres frissítés!'}
                            {stage === 'error' && 'Hiba történt'}
                        </div>
                        <div className="text-[10px] font-mono opacity-40">
                            {stage === 'idle' && 'Nézd meg, van-e új verzió'}
                            {stage === 'checking' && 'Egy pillanat...'}
                            {stage === 'ready' && `v${updateInfo?.latestVersion} verzió telepíthető`}
                            {stage === 'downloading' && `${progress}% kész`}
                            {stage === 'complete' && `v${updateInfo?.latestVersion} telepítve`}
                            {stage === 'error' && 'Próbáld újra később'}
                        </div>
                    </div>
                </div>

                {/* Progress Bar */}
                {(stage === 'downloading' || stage === 'applying') && (
                    <div className="mb-6">
                        <div className="h-1 bg-foreground/10 overflow-hidden">
                            <div
                                className="h-full bg-foreground transition-all duration-300"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                    </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-3">
                    {stage === 'idle' && (
                        <>
                            <button
                                onClick={handleOpenVersionPicker}
                                className="flex items-center gap-2 px-3 py-2 text-xs font-mono uppercase tracking-widest opacity-50 hover:opacity-100 transition-opacity border border-border"
                            >
                                <FileText size={12} />
                                Más verzió
                                <ChevronDown size={10} />
                            </button>
                            <button
                                onClick={handleCheckUpdates}
                                className="flex items-center gap-2 px-4 py-2 text-xs font-mono uppercase tracking-widest bg-foreground text-background hover:opacity-90 transition-opacity"
                            >
                                <RefreshCw size={12} />
                                Ellenőrzés
                            </button>
                        </>
                    )}

                    {stage === 'checking' && (
                        <button disabled className="flex items-center gap-2 px-4 py-2 text-xs font-mono uppercase tracking-widest bg-foreground/50 text-background cursor-not-allowed">
                            <Loader2 size={12} className="animate-spin" />
                            Ellenőrzés...
                        </button>
                    )}

                    {stage === 'ready' && (
                        <button
                            onClick={handleApplyUpdate}
                            className="flex items-center gap-2 px-4 py-2 text-xs font-mono uppercase tracking-widest bg-emerald-500 text-white hover:bg-emerald-600 transition-colors"
                        >
                            <Download size={12} />
                            Frissítés Telepítése
                        </button>
                    )}

                    {(stage === 'error' || stage === 'complete') && (
                        <button
                            onClick={() => {
                                setStage('idle');
                                setUpdateInfo(null);
                            }}
                            className="flex items-center gap-2 px-4 py-2 text-xs font-mono uppercase tracking-widest border border-border hover:bg-foreground/5 transition-colors"
                        >
                            <RefreshCw size={12} />
                            Újra
                        </button>
                    )}
                </div>
            </div>

            {/* Update Details */}
            {updateInfo && stage === 'ready' && (
                <div className="border border-border p-6">
                    <h3 className="text-sm font-mono uppercase tracking-widest opacity-60 mb-6 flex items-center gap-2">
                        <Package size={14} />
                        Frissítés Részletei
                    </h3>

                    {/* Version Change */}
                    <div className="flex items-center justify-center gap-4 mb-6 py-4 border-y border-border">
                        <div className="text-center">
                            <div className="text-[10px] font-mono uppercase opacity-40 mb-1">Jelenlegi</div>
                            <span className="px-3 py-1.5 text-sm font-mono bg-foreground/5 border border-border">
                                v{updateInfo.currentVersion}
                            </span>
                        </div>
                        <ArrowRight className="opacity-30" size={16} />
                        <div className="text-center">
                            <div className="text-[10px] font-mono uppercase opacity-40 mb-1">Új verzió</div>
                            <span className="px-3 py-1.5 text-sm font-mono bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                                v{updateInfo.latestVersion}
                            </span>
                        </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-4 gap-4">
                        <div className="p-3 border border-border text-center">
                            <div className="text-[10px] opacity-40 uppercase font-mono tracking-widest mb-1">Változások</div>
                            <div className="text-lg font-mono font-bold">{totalChanges}</div>
                        </div>
                        <div className="p-3 border border-border text-center">
                            <div className="text-[10px] opacity-40 uppercase font-mono tracking-widest mb-1">Letöltés</div>
                            <div className="text-lg font-mono font-bold">{formatBytes(updateInfo.downloadSize)}</div>
                        </div>
                        <div className="p-3 border border-border text-center">
                            <div className="text-[10px] opacity-40 uppercase font-mono tracking-widest mb-1">Forrás</div>
                            <div className="text-lg font-mono font-bold capitalize flex items-center justify-center gap-1">
                                {updateInfo.source === 'github' ? <Server size={12} /> : <Wifi size={12} />}
                                {updateInfo.source || '—'}
                            </div>
                        </div>
                        <div className="p-3 border border-border text-center">
                            <div className="text-[10px] opacity-40 uppercase font-mono tracking-widest mb-1">Változatlan</div>
                            <div className="text-lg font-mono font-bold">{changes.unchanged}</div>
                        </div>
                    </div>

                    {/* Detailed Changes */}
                    <div className="mt-4 flex items-center justify-center gap-6 text-xs font-mono">
                        <div className="flex items-center gap-2">
                            <span className="flex items-center justify-center w-5 h-5 bg-emerald-500/10 text-emerald-500">
                                <Plus size={10} />
                            </span>
                            <span className="opacity-50">{changes.added} új</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="flex items-center justify-center w-5 h-5 bg-blue-500/10 text-blue-500">
                                <Edit3 size={10} />
                            </span>
                            <span className="opacity-50">{changes.modified} módosított</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="flex items-center justify-center w-5 h-5 bg-red-500/10 text-red-500">
                                <Minus size={10} />
                            </span>
                            <span className="opacity-50">{changes.deleted} törölt</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Info Section */}
            <div className="border border-border p-6">
                <h3 className="text-sm font-mono uppercase tracking-widest opacity-60 mb-4 flex items-center gap-2">
                    <AlertTriangle size={14} />
                    Információ
                </h3>
                <div className="grid grid-cols-3 gap-4">
                    <div className="flex items-start gap-3 p-3 bg-foreground/5">
                        <Shield className="text-emerald-500 shrink-0 mt-0.5" size={14} />
                        <div>
                            <div className="text-xs font-medium mb-0.5">Biztonságos</div>
                            <div className="text-[10px] opacity-50">Automatikus visszaállítás hiba esetén</div>
                        </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 bg-foreground/5">
                        <HardDrive className="text-blue-500 shrink-0 mt-0.5" size={14} />
                        <div>
                            <div className="text-xs font-medium mb-0.5">Delta frissítés</div>
                            <div className="text-[10px] opacity-50">Csak a változásokat tölti le</div>
                        </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 bg-foreground/5">
                        <Clock className="text-amber-500 shrink-0 mt-0.5" size={14} />
                        <div>
                            <div className="text-xs font-medium mb-0.5">Opcionális</div>
                            <div className="text-[10px] opacity-50">Te döntöd el, mikor frissítesz</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Version Picker Modal */}
            {showVersionPicker && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div
                        className="absolute inset-0 bg-black/50"
                        onClick={() => setShowVersionPicker(false)}
                    />
                    <div className="relative bg-background border border-border w-full max-w-md overflow-hidden">
                        <div className="p-4 border-b border-border">
                            <h3 className="text-sm font-mono uppercase tracking-widest">Válassz verziót</h3>
                            <p className="text-[10px] opacity-50 mt-1">
                                Telepíthetsz korábbi vagy újabb verziót is
                            </p>
                        </div>

                        <div className="max-h-80 overflow-y-auto">
                            {availableVersions.length === 0 ? (
                                <div className="p-4 text-center text-xs opacity-50">
                                    <Loader2 className="animate-spin mx-auto mb-2" size={16} />
                                    Betöltés...
                                </div>
                            ) : (
                                availableVersions.map((version) => (
                                    <button
                                        key={version.tag}
                                        disabled={version.isCurrent}
                                        onClick={() => {
                                            if (version.isCurrent) return;
                                            setSelectedVersion(version.version);
                                            setShowVersionPicker(false);
                                            setTimeout(() => handleCheckUpdates(), 100);
                                        }}
                                        className={`w-full flex items-center justify-between p-3 border-b border-border/50 transition-colors text-left ${version.isCurrent ? 'bg-foreground/5 opacity-50 cursor-not-allowed' : 'hover:bg-foreground/5 cursor-pointer'
                                            }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <Package size={14} className="opacity-30" />
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono text-sm">v{version.version}</span>
                                                    {version.isCurrent && (
                                                        <span className="px-1.5 py-0.5 text-[9px] font-mono uppercase bg-emerald-500/10 text-emerald-500">
                                                            jelenlegi
                                                        </span>
                                                    )}
                                                    {version.prerelease && (
                                                        <span className="px-1.5 py-0.5 text-[9px] font-mono uppercase bg-amber-500/10 text-amber-500">
                                                            béta
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="text-[10px] opacity-40">
                                                    {formatRelativeDate(version.releaseDate)}
                                                </span>
                                            </div>
                                        </div>
                                        <ChevronDown className="rotate-[-90deg] opacity-20" size={12} />
                                    </button>
                                ))
                            )}
                        </div>

                        <div className="p-3 border-t border-border">
                            <button
                                onClick={() => setShowVersionPicker(false)}
                                className="w-full py-2 text-xs font-mono uppercase tracking-widest opacity-50 hover:opacity-100 transition-opacity"
                            >
                                Mégse
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
