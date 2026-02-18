/**
 * NOMAD CMS - Static Cache Playground
 * Test and compare Static Cache vs Direct API performance
 * 
 * Features:
 * - Fetch slot via Static Cache (getPublicData)
 * - Fetch slot via Direct API (getData)
 * - Performance comparison
 * - ETag / 304 status visualization
 * - localStorage cache inspection
 */

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Zap, Clock, CheckCircle, AlertCircle, RefreshCw,
    Trash2, BarChart2, FileJson, HardDrive, Server,
    ChevronDown, Search
} from 'lucide-react';
import { getPublicData, getData, clearPublicDataCache, getAllKeys } from '@/api/data';
import type { SlotKey } from '@/api/types';

interface FetchResult {
    data: Record<string, unknown> | unknown[] | string | number | boolean | null;
    duration: number;
    source: 'static' | 'api';
    cached?: boolean;
    error?: string;
}

interface CacheStats {
    etagCount: number;
    dataCount: number;
    totalSize: number;
}

export function StaticCachePlayground() {
    const [slotKey, setSlotKey] = useState('siteSettings');
    const [availableKeys, setAvailableKeys] = useState<string[]>([]);
    const [staticResult, setStaticResult] = useState<FetchResult | null>(null);
    const [apiResult, setApiResult] = useState<FetchResult | null>(null);
    const [loading, setLoading] = useState<{ static: boolean; api: boolean }>({ static: false, api: false });
    const [cacheStats, setCacheStats] = useState<CacheStats>({ etagCount: 0, dataCount: 0, totalSize: 0 });
    const [isCustomKey, setIsCustomKey] = useState(false);

    // Initial load: get available keys
    useEffect(() => {
        const fetchKeys = async () => {
            try {
                const keys = await getAllKeys();
                // keys is SlotKey[] which are objects. extracting .key property
                const keyStrings = keys.map(k => {
                    const keyVal = (k as unknown as SlotKey).key;
                    if (keyVal) return keyVal;
                    if (typeof k === 'string') return k;
                    return String(k);
                });

                setAvailableKeys(keyStrings);

                // If siteSettings is not in the list but we have keys, default to the first one
                if (keyStrings.length > 0 && !keyStrings.includes('siteSettings') && slotKey === 'siteSettings') {
                    setSlotKey(keyStrings[0]);
                }
            } catch (error) {
                console.warn('Failed to fetch available keys:', error);
                // Fallback to manual input mode if keys fetch fails
                setIsCustomKey(true);
            }
        };
        fetchKeys();
        updateCacheStats();
    }, []);

    // Calculate localStorage cache stats
    const updateCacheStats = useCallback(() => {
        let etagCount = 0;
        let dataCount = 0;
        let totalSize = 0;

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith('nomad_etag_')) {
                etagCount++;
                totalSize += localStorage.getItem(key)?.length || 0;
            }
            if (key?.startsWith('nomad_data_')) {
                dataCount++;
                totalSize += localStorage.getItem(key)?.length || 0;
            }
        }

        setCacheStats({ etagCount, dataCount, totalSize });
    }, []);

    // Fetch via Static Cache
    const fetchStatic = useCallback(async () => {
        setLoading(prev => ({ ...prev, static: true }));
        const start = performance.now();

        try {
            const data = await getPublicData(slotKey);
            const duration = performance.now() - start;

            // Check if this was a 304 response (data from localStorage)
            const cachedEtag = localStorage.getItem(`nomad_etag_${slotKey}`);

            setStaticResult({
                data: data as FetchResult['data'],
                duration,
                source: 'static',
                cached: !!cachedEtag,
            });
        } catch (error) {
            setStaticResult({
                data: null,
                duration: performance.now() - start,
                source: 'static',
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        } finally {
            setLoading(prev => ({ ...prev, static: false }));
            updateCacheStats();
        }
    }, [slotKey, updateCacheStats]);

    // Fetch via Direct API
    const fetchApi = useCallback(async () => {
        setLoading(prev => ({ ...prev, api: true }));
        const start = performance.now();

        try {
            const data = await getData(slotKey);
            const duration = performance.now() - start;

            setApiResult({
                data: data as FetchResult['data'],
                duration,
                source: 'api',
            });
        } catch (error) {
            setApiResult({
                data: null,
                duration: performance.now() - start,
                source: 'api',
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        } finally {
            setLoading(prev => ({ ...prev, api: false }));
        }
    }, [slotKey]);

    // Run both and compare
    const runComparison = useCallback(async () => {
        await Promise.all([fetchStatic(), fetchApi()]);
    }, [fetchStatic, fetchApi]);

    // Clear localStorage cache
    const clearCache = useCallback(() => {
        clearPublicDataCache();
        updateCacheStats();
        setStaticResult(null);
    }, [updateCacheStats]);

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    return (
        <div className="bg-card rounded-xl border border-border overflow-hidden shadow-sm">
            {/* Header */}
            <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-muted/20">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                        <Zap className="w-5 h-5 text-emerald-500" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-foreground">Static Cache Playground</h3>
                        <p className="text-sm text-muted-foreground">Összehasonlítás: Static Cache vs Direct API</p>
                    </div>
                </div>

                {/* Cache Stats */}
                <div className="flex items-center gap-4 text-sm bg-background px-3 py-1.5 rounded-full border border-border shadow-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <HardDrive className="w-4 h-4" />
                        <span className="font-medium text-foreground">{cacheStats.etagCount}</span>
                        <span className="text-xs">cached</span>
                    </div>
                    <div className="w-px h-3 bg-border" />
                    <div className="text-muted-foreground">
                        <span className="font-medium text-foreground">{formatBytes(cacheStats.totalSize)}</span>
                    </div>
                </div>
            </div>

            {/* Input & Controls */}
            <div className="px-6 py-4 border-b border-border bg-background">
                <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-1 space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-muted-foreground">Slot Key</label>
                            <button
                                onClick={() => setIsCustomKey(!isCustomKey)}
                                className="text-xs text-primary hover:underline"
                            >
                                {isCustomKey ? 'Listából választás' : 'Egyéni megadása'}
                            </button>
                        </div>

                        {isCustomKey ? (
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <input
                                    type="text"
                                    value={slotKey}
                                    onChange={(e) => setSlotKey(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2 bg-muted/30 border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all"
                                    placeholder="pl. siteSettings"
                                />
                            </div>
                        ) : (
                            <div className="relative">
                                <select
                                    value={slotKey}
                                    onChange={(e) => setSlotKey(e.target.value)}
                                    className="w-full pl-4 pr-10 py-2 bg-muted/30 border border-input rounded-lg text-foreground text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all cursor-pointer"
                                >
                                    {availableKeys.map(key => (
                                        <option key={key} value={key}>{key}</option>
                                    ))}
                                    {availableKeys.length === 0 && (
                                        <option value="" disabled>Nincsenek elérhető elemek</option>
                                    )}
                                </select>
                                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                            </div>
                        )}
                    </div>

                    <div className="flex items-end gap-2">
                        <button
                            onClick={runComparison}
                            disabled={loading.static || loading.api || !slotKey}
                            className="px-5 py-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed font-medium rounded-lg transition-colors flex items-center gap-2 shadow-sm"
                        >
                            <BarChart2 className="w-4 h-4" />
                            Összehasonlítás
                        </button>

                        <button
                            onClick={clearCache}
                            className="px-4 py-2 bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground rounded-lg transition-colors flex items-center gap-2 border border-border shadow-sm"
                        >
                            <Trash2 className="w-4 h-4" />
                            Cache törlés
                        </button>
                    </div>
                </div>
            </div>

            {/* Results Grid */}
            <div className="grid md:grid-cols-2 gap-px bg-border">
                {/* Static Cache Result */}
                <ResultCard
                    title="Static Cache"
                    icon={<Zap className="w-5 h-5" />}
                    iconColor="text-emerald-500"
                    bgColor="bg-emerald-500/5"
                    borderColor="border-emerald-500/20"
                    result={staticResult}
                    loading={loading.static}
                    onFetch={fetchStatic}
                    description="ETag + localStorage"
                />

                {/* API Result */}
                <ResultCard
                    title="Direct API"
                    icon={<Server className="w-5 h-5" />}
                    iconColor="text-blue-500"
                    bgColor="bg-blue-500/5"
                    borderColor="border-blue-500/20"
                    result={apiResult}
                    loading={loading.api}
                    onFetch={fetchApi}
                    description="PHP + Database"
                />
            </div>

            {/* Performance Comparison */}
            {staticResult && apiResult && (
                <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="px-6 py-4 bg-muted/30 border-t border-border"
                >
                    <div className="flex items-center justify-center gap-8 md:gap-16">
                        <div className="text-center">
                            <div className="text-3xl font-bold text-foreground">
                                {((apiResult.duration / (staticResult.duration || 0.1)) || 0).toFixed(1)}x
                            </div>
                            <div className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mt-1">gyorsabb</div>
                        </div>

                        <div className="h-12 w-px bg-border" />

                        <div className="text-center">
                            <div className="text-3xl font-bold text-emerald-500">
                                {Math.max(0, Math.round(apiResult.duration - staticResult.duration))}ms
                            </div>
                            <div className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mt-1">megtakarítva</div>
                        </div>

                        {staticResult.cached && (
                            <>
                                <div className="h-12 w-px bg-border hidden sm:block" />
                                <div className="hidden sm:flex flex-col items-center">
                                    <div className="flex items-center gap-2 text-emerald-500 mb-1">
                                        <CheckCircle className="w-6 h-6" />
                                    </div>
                                    <span className="text-xs uppercase tracking-wider font-semibold text-emerald-600 dark:text-emerald-400">304 Not Modified</span>
                                </div>
                            </>
                        )}
                    </div>
                </motion.div>
            )}
        </div>
    );
}

// Result Card Component
interface ResultCardProps {
    title: string;
    icon: React.ReactElement;
    iconColor: string;
    bgColor?: string;
    borderColor?: string;
    result: FetchResult | null;
    loading: boolean;
    onFetch: () => void;
    description: string;
}

function ResultCard({ title, icon, iconColor, bgColor, borderColor, result, loading, onFetch, description }: ResultCardProps) {
    const dataPreview = result?.data ? JSON.stringify(result.data, null, 2) : '';
    const truncatedPreview = dataPreview.slice(0, 300);
    const isTruncated = dataPreview.length > 300;

    return (
        <div className="bg-card p-6 relative group overflow-hidden">
            <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none ${bgColor}`} />

            <div className="relative z-10">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg bg-background border shadow-sm ${borderColor} ${iconColor}`}>
                            {icon}
                        </div>
                        <div>
                            <h4 className="font-semibold text-foreground">{title}</h4>
                            <p className="text-xs text-muted-foreground">{description}</p>
                        </div>
                    </div>

                    <button
                        onClick={onFetch}
                        disabled={loading}
                        className="p-2 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>

                <AnimatePresence mode="wait">
                    {loading ? (
                        <motion.div
                            key="loading"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="h-32 flex items-center justify-center"
                        >
                            <Loader2 className="w-8 h-8 text-primary animate-spin" />
                        </motion.div>
                    ) : result ? (
                        <motion.div
                            key="result"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                        >
                            {/* Duration */}
                            <div className="flex items-center gap-2 mb-3">
                                <Clock className="w-4 h-4 text-muted-foreground" />
                                <span className="text-2xl font-mono font-bold text-foreground">
                                    {result.duration.toFixed(1)}ms
                                </span>
                                {result.cached && (
                                    <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs rounded-full font-medium">
                                        cached (304)
                                    </span>
                                )}
                            </div>

                            {/* Status */}
                            {result.error ? (
                                <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 p-2 rounded-lg mb-3 border border-destructive/20">
                                    <AlertCircle className="w-4 h-4" />
                                    <span>{result.error}</span>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm mb-3">
                                    <CheckCircle className="w-4 h-4" />
                                    <span>Sikeres válasz</span>
                                </div>
                            )}

                            {/* Data Preview */}
                            {result.data !== null && (
                                <div className="mt-3 bg-muted/50 rounded-lg overflow-hidden border border-border">
                                    <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
                                        <FileJson className="w-3 h-3 text-muted-foreground" />
                                        <span className="text-xs font-medium text-muted-foreground">Response Preview</span>
                                    </div>
                                    <div className="p-3 overflow-x-auto">
                                        <pre className="text-xs text-muted-foreground font-mono leading-relaxed">
                                            {truncatedPreview}{isTruncated && '...'}
                                        </pre>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    ) : (
                        <motion.div
                            key="empty"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="h-32 flex flex-col items-center justify-center text-muted-foreground"
                        >
                            <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
                                <BarChart2 className="w-5 h-5 opacity-40" />
                            </div>
                            <span className="text-sm">Kattints a fenti gombra a futtatáshoz</span>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

function Loader2({ className }: { className?: string }) {
    return (
        <svg
            className={className}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
    );
}

export default StaticCachePlayground;
