/**
 * CacheTab - Static Cache & Versioning Management
 * 
 * Settings tab for managing:
 * - Static cache: View stats, rebuild, clear
 * - Content versioning: Enable/disable, retention settings
 */

import { useState, useEffect } from 'react';
import {
    RefreshCw,
    Trash2,
    Loader2,
    Zap,
    History,
    Check
} from 'lucide-react';
import { apiClient } from '@/api';
import { versioningService, type StorageStats } from '@/services/versioningService';
import { useUI } from '@/context/UIContext';
import { TechToggle } from '@/components/ui/TechToggle';

interface CacheStats {
    total_files: number;
    total_size: number;
    total_size_human: string;
    slot_count: number;
    oldest?: string | null;
    newest?: string | null;
}

interface CacheTabProps {
    setError: (error: string | null) => void;
    setSuccess: (success: string | null) => void;
}

export function CacheTab({ setError, setSuccess }: CacheTabProps) {
    const { confirm } = useUI();
    const [stats, setStats] = useState<CacheStats | null>(null);
    const [slotCount, setSlotCount] = useState<number>(0);
    const [loading, setLoading] = useState(true);
    const [rebuilding, setRebuilding] = useState(false);
    const [clearing, setClearing] = useState(false);
    const [rebuildTime, setRebuildTime] = useState<number | null>(null);

    // Static cache settings state
    const [cacheEnabled, setCacheEnabled] = useState(true);
    const [savingCacheSettings, setSavingCacheSettings] = useState(false);

    useEffect(() => {
        loadStats();
    }, []);

    const loadStats = async () => {
        try {
            setLoading(true);

            // Load cache settings
            try {
                const settingsResponse = await apiClient.get('/endpoints/admin/cache-settings.php');
                if (settingsResponse.data.success && settingsResponse.data.settings) {
                    setCacheEnabled(settingsResponse.data.settings['cache.enabled'] === 'true');
                }
            } catch (settingsErr) {
                console.error('Failed to load cache settings:', settingsErr);
            }

            // Get slot count for time estimation
            const keysResponse = await apiClient.get('/endpoints/data.php?key=__all_keys__');
            if (keysResponse.data.success && keysResponse.data.keys) {
                setSlotCount(keysResponse.data.keys.length);
            }
            setStats(null);
        } catch (err) {
            console.error('Failed to load cache stats:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleCacheToggle = async (enabled: boolean) => {
        try {
            setSavingCacheSettings(true);
            setCacheEnabled(enabled);

            await apiClient.post('/endpoints/admin/cache-settings.php', {
                'cache.enabled': enabled ? 'true' : 'false'
            });

            setSuccess(enabled ? 'Static cache bekapcsolva' : 'Static cache kikapcsolva');
        } catch (err) {
            setCacheEnabled(!enabled); // Revert on error
            setError(err instanceof Error ? err.message : 'Beállítás mentése sikertelen');
        } finally {
            setSavingCacheSettings(false);
        }
    };



    // Estimate rebuild time: ~50ms per slot
    const estimatedSeconds = Math.max(1, Math.ceil(slotCount * 0.05));
    const estimatedTimeText = estimatedSeconds < 60
        ? `~${estimatedSeconds} másodperc`
        : `~${Math.ceil(estimatedSeconds / 60)} perc`;

    const handleRebuild = async () => {
        try {
            setRebuilding(true);
            const startTime = Date.now();
            const response = await apiClient.post('/endpoints/admin/cache-rebuild.php');

            if (response.data.success) {
                const elapsed = Math.round((Date.now() - startTime) / 1000);
                setRebuildTime(elapsed);
                // Update stats from response
                if (response.data.stats) {
                    setStats(response.data.stats);
                }
                setSuccess(`Cache újraépítve: ${response.data.count} fájl generálva (${elapsed}s)`);
            } else {
                setError(response.data.error || 'Cache rebuild failed');
            }
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : 'Cache rebuild failed';
            setError(errorMessage);
        } finally {
            setRebuilding(false);
        }
    };

    const handleClear = () => {
        confirm({
            title: 'Cache Ürítése',
            message: 'Biztosan törölni szeretnéd az összes cache fájlt? A weboldal lassabb lehet az első látogatásoknál, amíg a cache újra nem épül.',
            confirmLabel: 'Igen, Törlés',
            cancelLabel: 'Mégsem',
            isDestructive: true,
            onConfirm: async () => {
                try {
                    setClearing(true);
                    // Immediately reset stats for better UX feedback
                    setStats({ total_files: 0, total_size: 0, total_size_human: '0 B', slot_count: 0 });

                    const response = await apiClient.post('/endpoints/admin/cache-rebuild.php?clear=1');

                    if (response.data.success) {
                        // Update with actual stats from response
                        if (response.data.stats) {
                            setStats(response.data.stats);
                        }
                        setSuccess(`Cache törölve és újraépítve: ${response.data.count} fájl`);
                    } else {
                        setError(response.data.error || 'Cache clear failed');
                    }
                } catch (err: unknown) {
                    const errorMessage = err instanceof Error ? err.message : 'Cache clear failed';
                    setError(errorMessage);
                } finally {
                    setClearing(false);
                }
            }
        });
    };

    return (
        <div className="space-y-8">
            {/* Cache Management Card */}
            <div className="border border-border p-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-mono uppercase tracking-widest opacity-60 flex items-center gap-2">
                        <Zap size={14} />
                        Static Cache Kezelés
                    </h3>
                    <div className="flex items-center gap-4">
                        <div className="text-[10px] font-mono opacity-40 uppercase">
                            {slotCount} slot aktív
                        </div>
                        <TechToggle
                            checked={cacheEnabled}
                            onChange={handleCacheToggle}
                            label={cacheEnabled ? 'Aktív' : 'Inaktív'}
                            disabled={loading || savingCacheSettings}
                        />
                    </div>
                </div>

                {/* SSG Architecture Info */}
                <div className="mt-6 pt-6 border-t border-border">
                    <label className="text-xs opacity-50 block mb-3">SSG Architektúra</label>
                    <div className="p-3 border border-border bg-foreground/5">
                        <div className="text-sm font-mono">Per-Slot Mappa Struktúra</div>
                        <div className="text-[10px] opacity-40 mt-1">
                            Minden slot saját mappában: <code className="bg-foreground/10 px-1">{'{slot}'}/manifest.json</code>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-6">
                    {/* Actions Column */}
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-xs opacity-50 block">Újraépítés</label>
                            <button
                                onClick={handleRebuild}
                                disabled={rebuilding || clearing}
                                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-foreground text-background hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed font-mono text-xs uppercase tracking-widest"
                            >
                                {rebuilding ? (
                                    <Loader2 size={14} className="animate-spin" />
                                ) : (
                                    <RefreshCw size={14} />
                                )}
                                Cache Újraépítés
                            </button>
                            <p className="text-[10px] opacity-40 font-mono">
                                Becsült idő: {estimatedTimeText}
                            </p>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs opacity-50 block">Törlés</label>
                            <button
                                onClick={handleClear}
                                disabled={rebuilding || clearing}
                                className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-border text-red-500 hover:bg-red-500/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-mono text-xs uppercase tracking-widest"
                            >
                                {clearing ? (
                                    <Loader2 size={14} className="animate-spin" />
                                ) : (
                                    <Trash2 size={14} />
                                )}
                                Cache Ürítése
                            </button>
                        </div>
                    </div>

                    {/* Stats Column */}
                    <div className="space-y-4">
                        <label className="text-xs opacity-50 block border-b border-border pb-2">Statisztika</label>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <div className="text-xs opacity-40 uppercase font-mono tracking-widest mb-1">Slot Mappák</div>
                                <div className="text-xl font-mono font-medium">
                                    {(loading || rebuilding || clearing) ? '—' : (stats?.slot_count ?? 0)}
                                </div>
                            </div>
                            <div>
                                <div className="text-xs opacity-40 uppercase font-mono tracking-widest mb-1">Fájlok</div>
                                <div className="text-xl font-mono font-medium">
                                    {(loading || rebuilding || clearing) ? '—' : (stats?.total_files ?? 0)}
                                </div>
                            </div>
                            <div>
                                <div className="text-xs opacity-40 uppercase font-mono tracking-widest mb-1">Méret</div>
                                <div className="text-xl font-mono font-medium">
                                    {(loading || rebuilding || clearing) ? '—' : (stats?.total_size_human ?? '0 B')}
                                </div>
                            </div>
                            <div>
                                <div className="text-xs opacity-40 uppercase font-mono tracking-widest mb-1">Aktív Slotok</div>
                                <div className="text-xl font-mono font-medium">
                                    {slotCount}
                                </div>
                            </div>
                        </div>

                        {rebuildTime !== null && !rebuilding && (
                            <div className="mt-4 p-3 bg-foreground/5 text-xs font-mono flex items-center gap-2">
                                <Check size={12} className="text-emerald-500" />
                                <span>Utolsó újraépítés: {rebuildTime}mp</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Versioning Section */}
            <VersioningSection setError={setError} setSuccess={setSuccess} />
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// VERSIONING SECTION COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

interface VersioningSectionProps {
    setError: (error: string | null) => void;
    setSuccess: (success: string | null) => void;
}

function VersioningSection({ setError, setSuccess }: VersioningSectionProps) {
    const { confirm } = useUI();
    const [stats, setStats] = useState<StorageStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [cleaning, setCleaning] = useState(false);

    // Local state for form
    const [enabled, setEnabled] = useState(true);
    const [maxVersions, setMaxVersions] = useState('50');
    const [retentionDays, setRetentionDays] = useState('90');

    useEffect(() => {
        loadVersioningData();
    }, []);

    const loadVersioningData = async () => {
        try {
            setLoading(true);

            // Load settings and stats in parallel
            const [settingsData, statsData] = await Promise.all([
                versioningService.getSettings(),
                versioningService.getStorageStats()
            ]);

            setStats(statsData);

            // Update local state
            setEnabled(settingsData['versioning.enabled'] === 'true');
            setMaxVersions(settingsData['versioning.maxVersions'] || '50');
            setRetentionDays(settingsData['versioning.retentionDays'] || '90');

        } catch (err) {
            console.error('Failed to load versioning data:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        try {
            setSaving(true);

            await versioningService.updateSettings({
                'versioning.enabled': enabled ? 'true' : 'false',
                'versioning.maxVersions': maxVersions,
                'versioning.retentionDays': retentionDays
            });

            setSuccess('Verziókezelés beállítások mentve');
            await loadVersioningData();

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Mentés sikertelen');
        } finally {
            setSaving(false);
        }
    };

    const handleCleanup = () => {
        confirm({
            title: 'Lejárt Verziók Törlése',
            message: `Biztosan törölni szeretnéd a ${retentionDays} napnál régebbi verziókat és a ${maxVersions} verziós limitet meghaladó verziókat? Ez a művelet nem visszavonható.`,
            confirmLabel: 'Törlés',
            cancelLabel: 'Mégsem',
            isDestructive: true,
            onConfirm: async () => {
                try {
                    setCleaning(true);
                    const result = await versioningService.runCleanup();

                    // Build detailed success message
                    const parts: string[] = [];
                    if (result.deleted_by_retention > 0) {
                        parts.push(`${result.deleted_by_retention} lejárt`);
                    }
                    if (result.deleted_by_max_versions > 0) {
                        parts.push(`${result.deleted_by_max_versions} limit feletti`);
                    }

                    if (result.deleted > 0) {
                        setSuccess(`${result.deleted} verzió törölve (${parts.join(', ')})`);
                    } else {
                        setSuccess('Nincs törölhető verzió');
                    }

                    await loadVersioningData();
                } catch (err) {
                    setError(err instanceof Error ? err.message : 'Tisztítás sikertelen');
                } finally {
                    setCleaning(false);
                }
            }
        });
    };

    const formatBytes = (bytes: number): string => {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const compressionRatio = stats && stats.total_diff_size > 0
        ? Math.round((1 - (stats.total_compressed_size / stats.total_diff_size)) * 100)
        : 0;

    return (
        <div className="border border-border p-6">
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-mono uppercase tracking-widest opacity-60 flex items-center gap-2">
                    <History size={14} />
                    Verziókezelés és Előzmények
                </h3>
                <div className="flex items-center gap-2">
                    <TechToggle
                        checked={enabled}
                        onChange={setEnabled}
                        label={enabled ? 'Aktív' : 'Inaktív'}
                        disabled={loading}
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Information / Stats */}
                <div className="space-y-6">
                    <p className="text-xs opacity-60 leading-relaxed">
                        A rendszer minden mentéskor létrehoz egy verziót. Optimális tömörítést használ, így minimális tárhelyet foglal.
                    </p>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-3 border border-border">
                            <div className="text-[10px] opacity-40 uppercase font-mono tracking-widest mb-1">Verziók</div>
                            <div className="text-lg font-mono font-bold">
                                {loading ? '—' : (stats?.total_versions ?? 0)}
                            </div>
                        </div>
                        <div className="p-3 border border-border">
                            <div className="text-[10px] opacity-40 uppercase font-mono tracking-widest mb-1">Tárhely</div>
                            <div className="text-lg font-mono font-bold">
                                {loading ? '—' : formatBytes(stats?.total_compressed_size ?? 0)}
                            </div>
                        </div>
                        <div className="p-3 border border-border">
                            <div className="text-[10px] opacity-40 uppercase font-mono tracking-widest mb-1">Slotok</div>
                            <div className="text-lg font-mono font-bold">
                                {loading ? '—' : (stats?.slots_with_versions ?? 0)}
                            </div>
                        </div>
                        <div className="p-3 border border-border">
                            <div className="text-[10px] opacity-40 uppercase font-mono tracking-widest mb-1">Tömörítés</div>
                            <div className="text-lg font-mono font-bold text-emerald-500">
                                {loading ? '—' : `${compressionRatio}%`}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Settings Form */}
                <div className="space-y-6">
                    <div className="grid grid-cols-1 gap-4">
                        <div>
                            <label className="text-xs opacity-50 block mb-1">Max verziók / slot</label>
                            <input
                                type="number"
                                min="5"
                                max="200"
                                value={maxVersions}
                                onChange={e => setMaxVersions(e.target.value)}
                                className="w-full bg-transparent border-b border-border py-2 focus:outline-none focus:border-foreground transition-colors text-sm font-mono"
                                disabled={loading || !enabled}
                            />
                        </div>

                        <div>
                            <label className="text-xs opacity-50 block mb-1">Megőrzési idő (nap)</label>
                            <input
                                type="number"
                                min="7"
                                max="365"
                                value={retentionDays}
                                onChange={e => setRetentionDays(e.target.value)}
                                className="w-full bg-transparent border-b border-border py-2 focus:outline-none focus:border-foreground transition-colors text-sm font-mono"
                                disabled={loading || !enabled}
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-3 pt-4">
                        <button
                            onClick={handleSave}
                            disabled={saving || loading}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-foreground text-background font-mono text-xs uppercase tracking-widest disabled:opacity-50 hover:opacity-90 transition-opacity"
                        >
                            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                            Beállítások Mentése
                        </button>

                        <button
                            onClick={handleCleanup}
                            disabled={cleaning || loading || !enabled}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-border text-red-500 hover:bg-red-500/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-mono text-xs uppercase tracking-widest"
                        >
                            {cleaning ? (
                                <Loader2 size={14} className="animate-spin" />
                            ) : (
                                <Trash2 size={14} />
                            )}
                            Lejárt Verziók Törlése
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
