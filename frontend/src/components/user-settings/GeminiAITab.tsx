import { useState, useEffect } from 'react';
import {
    Sparkles, Key, Terminal, Save, Loader2,
    Eye, EyeOff, X, Check, Power, AlertCircle, RefreshCw, Zap, Trash2,
    ChevronDown, ExternalLink, AlertTriangle, Cpu
} from 'lucide-react';
import { TabProps } from './types';
import { getAiSettings, updateAiSettings, clearAiSettings, type AiSettings } from '@/api/auth';
import { getAIModels, refreshAIModels, type AIModel, type AIProvider } from '@/api/updates';
import { useAi } from '@/context/AiContext';
import { useUI } from '@/context/UIContext';
import { TechToggle } from '@/components/ui/TechToggle';

export function GeminiAITab({ setError, setSuccess }: TabProps) {
    const { refreshAiStatus } = useAi();
    const { confirm } = useUI();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [clearing, setClearing] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);

    // Form State
    const [enabled, setEnabled] = useState(false);
    const [apiKey, setApiKey] = useState('');
    const [systemPrompt, setSystemPrompt] = useState('');
    const [maxTokens, setMaxTokens] = useState(4096);
    const [showKey, setShowKey] = useState(false);
    const [hasApiKey, setHasApiKey] = useState(false);

    // Model Registry State
    const [models, setModels] = useState<AIModel[]>([]);
    const [providers, setProviders] = useState<AIProvider[]>([]);
    const [selectedModel, setSelectedModel] = useState<string>('');
    const [defaultModel, setDefaultModel] = useState<string>('');
    const [modelsLoading, setModelsLoading] = useState(false);
    const [modelsError, setModelsError] = useState<string | null>(null);
    const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
    const [registryVersion, setRegistryVersion] = useState<string>('');

    // Initial state tracking
    const [, setInitialState] = useState<AiSettings | null>(null);

    // Load settings and models on mount
    useEffect(() => {
        loadSettings();
        loadModels();
    }, []);

    const loadModels = async () => {
        try {
            setModelsLoading(true);
            setModelsError(null);
            const response = await getAIModels();
            if (response.success) {
                setModels(response.models);
                setProviders(response.providers);
                setDefaultModel(response.default_model);
                setRegistryVersion(response.version);
                if (!selectedModel) {
                    setSelectedModel(response.default_model);
                }
            }
        } catch {
            setModelsError('Nem sikerült betölteni a modell listát');
        } finally {
            setModelsLoading(false);
        }
    };

    const handleRefreshModels = async () => {
        try {
            setModelsLoading(true);
            const response = await refreshAIModels();
            if (response.success) {
                setSuccess('Modell lista frissítve a CDN-ről');
                await loadModels();
            } else {
                setError(response.message || 'Frissítés sikertelen');
            }
        } catch {
            setError('Modell lista frissítés sikertelen');
        } finally {
            setModelsLoading(false);
        }
    };

    const loadSettings = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await getAiSettings();

            if (response.success && response.ai_settings) {
                const settings = response.ai_settings;
                setEnabled(settings.ai_enabled);
                setHasApiKey(settings.has_api_key);
                setSystemPrompt(settings.ai_system_prompt || '');
                setMaxTokens(settings.ai_max_tokens ?? 4096);
                // Set user's saved model preference (if any)
                if (settings.ai_selected_model) {
                    setSelectedModel(settings.ai_selected_model);
                }
                // Don't set apiKey - it's never returned from server
                setApiKey('');

                setInitialState({
                    ai_enabled: settings.ai_enabled,
                    has_api_key: settings.has_api_key,
                    ai_system_prompt: settings.ai_system_prompt,
                    ai_max_tokens: settings.ai_max_tokens,
                    ai_selected_model: settings.ai_selected_model,
                });
            }
        } catch (err) {
            setError('Nem sikerült betölteni az AI beállításokat');
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (field: 'apiKey' | 'systemPrompt', value: string) => {
        if (field === 'apiKey') setApiKey(value);
        if (field === 'systemPrompt') setSystemPrompt(value);
        setHasChanges(true);
    };

    const toggleEnabled = () => {
        setEnabled(prev => !prev);
        setHasChanges(true);
    };

    const handleResetKey = () => {
        setApiKey('');
        setHasChanges(true);
    };

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        setSuccess(null);

        try {
            const updates: Parameters<typeof updateAiSettings>[0] = {
                ai_enabled: enabled,
            };

            // Only send API key if user entered a new one
            if (apiKey.trim()) {
                updates.ai_api_key = apiKey.trim();
            }

            // Always send system prompt (can be empty to clear)
            updates.ai_system_prompt = systemPrompt.trim() || null;

            // Always send max tokens
            updates.ai_max_tokens = maxTokens;

            // Send selected model preference
            updates.ai_selected_model = selectedModel || null;

            const response = await updateAiSettings(updates);

            if (response.success) {
                setSuccess('AI beállítások sikeresen mentve.');
                setHasChanges(false);

                // Update initial state
                if (response.ai_settings) {
                    setHasApiKey(response.ai_settings.has_api_key);
                    setInitialState(response.ai_settings);
                }

                // Clear the API key field after successful save
                setApiKey('');

                // Refresh global AI status to update chatbot visibility
                await refreshAiStatus();
            } else {
                setError(response.error || 'Mentés sikertelen');
            }
        } catch (err) {
            setError('Hálózati hiba történt');
        } finally {
            setSaving(false);
        }
    };

    const handleClearAll = async () => {
        confirm({
            title: 'AI beállítások törlése',
            message: 'Biztosan törölni szeretnéd az összes AI beállítást? Ez a művelet nem visszavonható.',
            confirmLabel: 'Törlés',
            cancelLabel: 'Mégse',
            isDestructive: true,
            onConfirm: async () => {
                setClearing(true);
                setError(null);
                setSuccess(null);

                try {
                    const response = await clearAiSettings();

                    if (response.success) {
                        setSuccess('AI beállítások sikeresen törölve.');
                        setEnabled(false);
                        setApiKey('');
                        setSystemPrompt('');
                        setMaxTokens(4096);
                        setHasApiKey(false);
                        setHasChanges(false);
                        setInitialState(null);

                        // Refresh global AI status
                        await refreshAiStatus();
                    } else {
                        setError(response.error || 'Törlés sikertelen');
                    }
                } catch {
                    setError('Hálózati hiba történt');
                } finally {
                    setClearing(false);
                }
            }
        });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="animate-spin" size={32} />
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* 1. Global Enable Switch */}
            <div className={`border p-6 transition-all duration-300 ${enabled ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-border bg-background'}`}>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h3 className="text-sm font-mono uppercase tracking-widest mb-2 flex items-center gap-2">
                            <Power size={14} className={enabled ? 'text-emerald-500' : 'text-muted-foreground'} />
                            AI Integráció
                        </h3>
                        <p className="text-xs opacity-60 max-w-md">
                            Az AI segéd engedélyezése a CMS felületen. Kikapcsolás esetén a chatbot és a tartalomgenerálási funkciók elrejtésre kerülnek.
                        </p>
                    </div>
                    <TechToggle
                        checked={enabled}
                        onChange={toggleEnabled}
                        label={enabled ? 'AKTÍV' : 'INAKTÍV'}
                    />
                </div>
            </div>

            {/* 2. API Configuration */}
            <div className={`border border-border p-6 transition-opacity duration-300 ${!enabled ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
                <h3 className="text-sm font-mono uppercase tracking-widest mb-6 opacity-60 flex items-center gap-2">
                    <Key size={14} />
                    API Konfiguráció
                </h3>

                <div className="space-y-6">
                    {/* API Key Status */}
                    {hasApiKey && !apiKey && (
                        <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded text-xs">
                            <Check size={14} className="text-emerald-500" />
                            <span className="text-emerald-600 dark:text-emerald-400">API kulcs beállítva és titkosítva tárolva</span>
                        </div>
                    )}

                    <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-widest font-mono opacity-50 block">
                            {hasApiKey ? 'Új API kulcs (opcionális)' : 'API Key'}
                        </label>
                        <div className="relative group">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 opacity-30 group-focus-within:opacity-100 group-focus-within:text-amber-400 transition-all">
                                <Sparkles size={14} />
                            </div>
                            <input
                                type={showKey ? "text" : "password"}
                                value={apiKey}
                                onChange={(e) => handleChange('apiKey', e.target.value)}
                                className="w-full bg-background border border-border px-10 py-3 text-xs font-mono focus:outline-none focus:border-foreground transition-all"
                                placeholder={hasApiKey ? "••••••••••••••••" : "AIzaSy..."}
                            />

                            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                                <button
                                    onClick={() => setShowKey(!showKey)}
                                    className="p-2 hover:bg-muted/10 rounded-sm opacity-50 hover:opacity-100 transition-opacity"
                                    title={showKey ? "Kód elrejtése" : "Kód megjelenítése"}
                                >
                                    {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                                </button>
                                {apiKey && (
                                    <button
                                        onClick={handleResetKey}
                                        className="p-2 hover:bg-destructive/10 hover:text-destructive rounded-sm opacity-50 hover:opacity-100 transition-all"
                                        title="Mező törlése"
                                    >
                                        <X size={14} />
                                    </button>
                                )}
                            </div>
                        </div>
                        <p className="text-[10px] opacity-40 pt-1 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 bg-amber-500 rounded-full inline-block" />
                            Az API kulcs titkosítva tárolódik a szerveren. Soha nem kerül vissza.
                        </p>

                        {/* API Key Actions */}
                        {hasApiKey && (
                            <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2 pt-2">
                                <button
                                    onClick={async () => {
                                        try {
                                            setError(null);
                                            const response = await updateAiSettings({ ai_api_key: apiKey.trim() || undefined });
                                            if (response.success) {
                                                setSuccess('API kulcs frissítve.');
                                                setApiKey('');
                                                if (response.ai_settings) {
                                                    setHasApiKey(response.ai_settings.has_api_key);
                                                }
                                                await refreshAiStatus();
                                            } else {
                                                setError(response.error || 'Frissítés sikertelen');
                                            }
                                        } catch {
                                            setError('Hálózati hiba történt');
                                        }
                                    }}
                                    disabled={!apiKey.trim() || saving || clearing}
                                    className="px-3 py-1.5 border bg-foreground text-background font-mono text-[10px] uppercase tracking-widest disabled:opacity-30 hover:bg-background hover:text-foreground transition-all flex items-center justify-center gap-1.5"
                                >
                                    <RefreshCw size={12} />
                                    API Kulcs Frissítése
                                </button>

                                <button
                                    onClick={() => {
                                        confirm({
                                            title: 'API kulcs törlése',
                                            message: 'Biztosan törölni szeretnéd az API kulcsot? Az AI funkciók nem fognak működni kulcs nélkül.',
                                            confirmLabel: 'Törlés',
                                            cancelLabel: 'Mégse',
                                            isDestructive: true,
                                            onConfirm: async () => {
                                                try {
                                                    setError(null);
                                                    const response = await updateAiSettings({ ai_api_key: null });
                                                    if (response.success) {
                                                        setSuccess('API kulcs törölve.');
                                                        setApiKey('');
                                                        setHasApiKey(false);
                                                        await refreshAiStatus();
                                                    } else {
                                                        setError(response.error || 'Törlés sikertelen');
                                                    }
                                                } catch {
                                                    setError('Hálózati hiba történt');
                                                }
                                            }
                                        });
                                    }}
                                    disabled={saving || clearing}
                                    className="px-3 py-1.5 border border-destructive/50 text-destructive font-mono text-[10px] uppercase tracking-widest disabled:opacity-30 hover:bg-destructive/10 transition-all flex items-center justify-center gap-1.5"
                                >
                                    <Trash2 size={12} />
                                    API Kulcs Törlése
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Warning if not configured */}
                    {!hasApiKey && !apiKey && enabled && (
                        <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded text-xs">
                            <AlertCircle size={14} className="text-amber-500 mt-0.5 shrink-0" />
                            <div>
                                <span className="text-amber-600 dark:text-amber-400 font-medium">API kulcs szükséges</span>
                                <p className="text-amber-600/70 dark:text-amber-400/70 mt-1">
                                    Az AI funkciók használatához add meg az API kulcsodat.
                                    {providers[0]?.key_url && (
                                        <a href={providers[0].key_url} target="_blank" rel="noopener noreferrer" className="underline ml-1">
                                            Kulcs létrehozása →
                                        </a>
                                    )}
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* 3. Model Selection */}
            <div className={`border border-border p-6 transition-opacity duration-300 ${!enabled ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-sm font-mono uppercase tracking-widest opacity-60 flex items-center gap-2">
                        <Cpu size={14} />
                        AI Modell
                    </h3>
                    <div className="flex items-center gap-2">
                        {registryVersion && (
                            <span className="text-[9px] font-mono opacity-30">
                                registry {registryVersion}
                            </span>
                        )}
                        <button
                            onClick={handleRefreshModels}
                            disabled={modelsLoading}
                            className="p-1.5 hover:bg-muted/10 rounded-sm opacity-40 hover:opacity-100 transition-all"
                            title="Modell lista frissítése CDN-ről"
                        >
                            <RefreshCw size={12} className={modelsLoading ? 'animate-spin' : ''} />
                        </button>
                    </div>
                </div>

                {modelsError && (
                    <div className="flex items-center gap-2 p-2 mb-4 bg-amber-500/10 border border-amber-500/20 rounded text-[10px] text-amber-600 dark:text-amber-400">
                        <AlertCircle size={12} />
                        {modelsError}
                    </div>
                )}

                {/* Model Selector */}
                <div className="relative mb-4">
                    <button
                        onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
                        className="w-full flex items-center justify-between bg-background border border-border px-4 py-3 text-xs font-mono hover:border-foreground/50 transition-all"
                    >
                        <div className="flex items-center gap-3">
                            <Sparkles size={14} className="text-muted-foreground" />
                            <div className="text-left">
                                <div className="font-medium">
                                    {models.find(m => m.id === selectedModel)?.label || selectedModel || 'Modell kiválasztása...'}
                                </div>
                                <div className="text-[10px] opacity-50 mt-0.5">
                                    {models.find(m => m.id === selectedModel)?.description || ''}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {selectedModel && (() => {
                                const model = models.find(m => m.id === selectedModel);
                                if (!model) return null;
                                const statusColors: Record<string, string> = {
                                    stable: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
                                    preview: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30',
                                    deprecated: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
                                    sunset: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30',
                                };
                                return (
                                    <span className={`px-2 py-0.5 text-[9px] font-mono uppercase border rounded ${statusColors[model.status] || ''}`}>
                                        {model.status}
                                    </span>
                                );
                            })()}
                            <ChevronDown size={14} className={`transition-transform ${modelDropdownOpen ? 'rotate-180' : ''}`} />
                        </div>
                    </button>

                    {/* Dropdown */}
                    {modelDropdownOpen && (
                        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-background border border-border shadow-lg max-h-80 overflow-y-auto">
                            {models.map(model => (
                                <button
                                    key={model.id}
                                    onClick={() => {
                                        setSelectedModel(model.id);
                                        setModelDropdownOpen(false);
                                        setHasChanges(true);
                                    }}
                                    className={`w-full px-4 py-3 text-left hover:bg-muted/10 transition-colors border-b border-border/50 last:border-0 ${selectedModel === model.id ? 'bg-foreground/5' : ''} ${model.status === 'sunset' ? 'opacity-40 cursor-not-allowed' : ''}`}
                                    disabled={model.status === 'sunset'}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-mono font-medium truncate">{model.label}</span>
                                                {model.id === defaultModel && (
                                                    <span className="px-1.5 py-0 text-[8px] font-mono uppercase bg-foreground/10 rounded">default</span>
                                                )}
                                            </div>
                                            <p className="text-[10px] opacity-50 mt-0.5 truncate">{model.description}</p>
                                            {model.status === 'deprecated' && model.sunset_date && (
                                                <p className="text-[10px] text-amber-500 mt-0.5 flex items-center gap-1">
                                                    <AlertTriangle size={10} />
                                                    Megszűnik: {model.sunset_date}
                                                    {model.replacement && ` • Ajánlott: ${models.find(m => m.id === model.replacement)?.label || model.replacement}`}
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 ml-3 shrink-0">
                                            <div className="flex flex-col items-end gap-0.5">
                                                <span className={`text-[9px] font-mono ${model.speed === 'fast' ? 'text-emerald-500' : 'text-amber-500'}`}>
                                                    {model.speed === 'fast' ? 'Gyors' : 'Lassú'}
                                                </span>
                                                <span className="text-[9px] font-mono opacity-40">
                                                    {model.pricing_tier === 'free' ? 'Ingyenes' : 'Fizetős'}
                                                </span>
                                            </div>
                                            {(() => {
                                                const colors: Record<string, string> = {
                                                    stable: 'bg-emerald-500',
                                                    preview: 'bg-blue-500',
                                                    deprecated: 'bg-amber-500',
                                                    sunset: 'bg-red-500',
                                                };
                                                return <div className={`w-2 h-2 rounded-full ${colors[model.status] || 'bg-gray-500'}`} />;
                                            })()}
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Deprecation warning for selected model */}
                {selectedModel && models.find(m => m.id === selectedModel)?.status === 'deprecated' && (
                    <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded text-xs">
                        <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />
                        <div>
                            <span className="text-amber-600 dark:text-amber-400 font-medium">Elavult modell</span>
                            <p className="text-amber-600/70 dark:text-amber-400/70 mt-1">
                                Ez a modell hamarosan megszűnik. 
                                {(() => {
                                    const model = models.find(m => m.id === selectedModel);
                                    const replacement = model?.replacement ? models.find(m => m.id === model.replacement) : null;
                                    return replacement ? (
                                        <button
                                            onClick={() => {
                                                setSelectedModel(replacement.id);
                                                setHasChanges(true);
                                            }}
                                            className="underline ml-1"
                                        >
                                            Váltás ide: {replacement.label} →
                                        </button>
                                    ) : null;
                                })()}
                            </p>
                        </div>
                    </div>
                )}

                {/* Provider info */}
                {providers[0] && (
                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-border/50">
                        <span className="text-[10px] font-mono opacity-30">
                            Provider: {providers[0].name}
                        </span>
                        <a
                            href={providers[0].key_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] font-mono opacity-30 hover:opacity-60 transition-opacity flex items-center gap-1"
                        >
                            API kulcs kezelése <ExternalLink size={10} />
                        </a>
                    </div>
                )}
            </div>

            {/* 4. System Instructions */}
            <div className={`border border-border p-6 transition-opacity duration-300 ${!enabled ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
                <h3 className="text-sm font-mono uppercase tracking-widest mb-6 opacity-60 flex items-center gap-2">
                    <Terminal size={14} />
                    Rendszer Utasítások (System Prompt)
                </h3>

                <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest font-mono opacity-50 block">Alapértelmezett Viselkedés</label>
                    <textarea
                        value={systemPrompt}
                        onChange={(e) => handleChange('systemPrompt', e.target.value)}
                        rows={6}
                        className="w-full bg-background border border-border p-4 text-xs font-mono leading-relaxed focus:outline-none focus:border-foreground transition-all resize-none"
                        placeholder="Add meg, hogyan viselkedjen az AI asszisztens... (Hagyd üresen az alapértelmezett viselkedéshez)"
                    />
                    <div className="flex justify-between items-center text-[10px] opacity-40 pt-1">
                        <span>Karakterek: {systemPrompt.length} / 10000</span>
                        <span className="italic">Pro Tip: Légy specifikus a kívánt JSON struktúrával kapcsolatban.</span>
                    </div>
                </div>
            </div>

            {/* 5. Max Tokens - Redesigned */}
            <div className={`border border-border p-6 transition-all duration-500 group ${!enabled ? 'opacity-50 pointer-events-none grayscale' : 'hover:border-foreground/40'}`}>
                <div className="flex items-center justify-between mb-8">
                    <h3 className="text-sm font-mono uppercase tracking-widest opacity-60 flex items-center gap-2">
                        <Zap size={14} className={`transition-colors duration-300 ${maxTokens > 16000 ? 'text-amber-500' : ''}`} />
                        Max Output Tokens
                    </h3>
                    <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-mono font-bold tracking-tighter tabular-nums">
                            {maxTokens.toLocaleString()}
                        </span>
                        <span className="text-[10px] font-mono uppercase opacity-40">tokens</span>
                    </div>
                </div>

                <div className="relative h-12 flex items-center select-none">
                    {/* Background Track */}
                    <div className="absolute inset-x-0 h-1.5 bg-secondary/50 rounded-full overflow-hidden">
                        {/* Tick marks pattern */}
                        <div className="absolute inset-0 opacity-20"
                            style={{ backgroundImage: 'linear-gradient(90deg, transparent 98%, currentColor 98%)', backgroundSize: '3.125% 100%' }}
                        />
                    </div>

                    {/* Active Fill */}
                    <div
                        className="absolute left-0 h-1.5 bg-foreground rounded-full transition-all duration-100 ease-out shadow-[0_0_10px_rgba(0,0,0,0.1)] dark:shadow-[0_0_15px_rgba(255,255,255,0.2)]"
                        style={{ width: `${((maxTokens - 1024) / (32768 - 1024)) * 100}%` }}
                    >
                        {/* Glowing Tip */}
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-foreground rounded-full shadow-lg scale-0 group-hover:scale-100 transition-transform duration-300" />
                    </div>

                    {/* The actual input - invisible but clickable */}
                    <input
                        type="range"
                        min={1024}
                        max={32768}
                        step={1024}
                        value={maxTokens}
                        onChange={(e) => {
                            setMaxTokens(Number(e.target.value));
                            setHasChanges(true);
                        }}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                </div>

                <div className="flex justify-between items-center text-[10px] font-mono uppercase tracking-wider opacity-40 mt-1">
                    <span className="flex items-center gap-1">
                        <span className="w-1 h-1 rounded-full bg-current"></span>
                        Gyors
                    </span>
                    <span className="flex items-center gap-1">
                        Részletes
                        <span className="w-1 h-1 rounded-full bg-current"></span>
                    </span>
                </div>

                <p className="text-[10px] opacity-40 mt-6 border-l-2 border-border pl-3 py-1 italic">
                    A generált válasz maximális hossza. Nagyobb érték = részletesebb kifejtés, de magasabb API költség.
                </p>
            </div>

            {/* Action Bar */}
            <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2 pt-4 flex-wrap">
                <button
                    onClick={handleSave}
                    disabled={saving || clearing || !hasChanges}
                    className="px-6 py-3 bg-foreground text-background font-mono text-xs uppercase tracking-widest disabled:opacity-30 hover:opacity-90 transition-opacity flex items-center justify-center gap-3"
                >
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    Változtatások Mentése
                </button>

                <button
                    onClick={loadSettings}
                    disabled={loading || saving || clearing}
                    className="px-4 py-2 border border-border font-mono text-xs uppercase tracking-widest disabled:opacity-30 hover:bg-muted/10 transition-all flex items-center justify-center gap-2"
                >
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    Frissítés
                </button>

                {hasApiKey && (
                    <button
                        onClick={handleClearAll}
                        disabled={loading || saving || clearing}
                        className="px-4 py-2 border border-destructive/50 text-destructive font-mono text-xs uppercase tracking-widest disabled:opacity-30 hover:bg-destructive/10 transition-all flex items-center justify-center gap-2"
                    >
                        {clearing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        Összes törlése
                    </button>
                )}
            </div>
        </div>
    );
}
