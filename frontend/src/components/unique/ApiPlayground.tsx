// API Playground - Professional Vercel-Inspired Design
// Clean, minimal, powerful - Everything you need, nothing you don't

import { useState, useCallback, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import {
    Plus,
    History,
    FileJson,
    ChevronLeft,
    Keyboard,
    Zap,
    X,
    Play,
    Copy,
    Check,
    Search,
    ChevronRight,
    Shield,
    Database,
    Cloud,
    LayoutGrid,
    Star,
    FolderOpen,
    Code,
    Clock,
    Loader2,
    ArrowRight,
    Pencil,
    Send,
    Layers
} from 'lucide-react';

import {
    PlaygroundProps,
    CustomEndpoint,
    RequestHistoryItem,
    usePlaygroundLogic,
    useRequestExecution,
    useClipboard,
    useCustomEndpoints,
    useRequestHistory,
    EndpointDef,
    METHOD_THEMES,
    HttpMethod,
    SnippetsModal,
    EndpointBuilder,
    RequestHistory as RequestHistoryModal,
    ImportExport,
    highlightJSON,
    DynamicFieldInput,
    MassiveDataPlayground,
    StaticCachePlayground
} from '../ApiPlaygroundComponets';

// =============================================================================
// Main Component - Clean Vercel-Inspired Layout
// =============================================================================

export function ApiPlayground({ apiKey: initialApiKey = '', baseUrl: initialBaseUrl, onClose }: PlaygroundProps) {
    const API_BASE = initialBaseUrl || import.meta.env.VITE_API_URL || '/api';

    // Core logic
    const { ENDPOINTS, state, setState, requestState, setRequestState } = usePlaygroundLogic(initialApiKey);
    const { selectedEndpoint, apiKey, queryParams, formData, rawBody, useRawBody, searchQuery } = state;
    const { loading, response, status, duration } = requestState;

    // Custom endpoints
    const {
        customEndpoints,
        addEndpoint,
        updateEndpoint,
        importEndpoints,
        toEndpointDef
    } = useCustomEndpoints();

    // Request history
    const {
        history,
        addToHistory,
        clearHistory,
        deleteHistoryItem
    } = useRequestHistory();

    // All endpoints (built-in + custom)
    const allEndpoints = useMemo(() => {
        const customDefs = customEndpoints.map(toEndpointDef);
        return [...ENDPOINTS, ...customDefs];
    }, [ENDPOINTS, customEndpoints, toEndpointDef]);

    // Request execution
    const { buildRequest, executeRequest: baseExecuteRequest } = useRequestExecution(
        API_BASE,
        selectedEndpoint,
        queryParams,
        apiKey,
        rawBody,
        formData,
        useRawBody,
        setRequestState
    );

    // Execute with history tracking
    const executeRequest = useCallback(async () => {
        await baseExecuteRequest();

        const { url, headers, body } = buildRequest();
        setTimeout(() => {
            if (requestState.response !== null) {
                addToHistory({
                    endpointId: selectedEndpoint.id,
                    endpointName: selectedEndpoint.name,
                    method: selectedEndpoint.method,
                    url,
                    headers,
                    body,
                    response: requestState.response,
                    status: requestState.status || 0,
                    duration: requestState.duration || 0
                });
            }
        }, 100);
    }, [baseExecuteRequest, buildRequest, selectedEndpoint, addToHistory, requestState]);

    // Clipboard
    const { copied, copyToClipboard } = useClipboard();

    // UI State
    const [expandedCategory, setExpandedCategory] = useState<string | null>('content');
    const [activeTab, setActiveTab] = useState<'params' | 'body' | 'auth'>('body');
    const [showSnippets, setShowSnippets] = useState(false);
    const [showEndpointBuilder, setShowEndpointBuilder] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [showImportExport, setShowImportExport] = useState(false);
    const [showMassiveData, setShowMassiveData] = useState(false);
    const [showStaticCache, setShowStaticCache] = useState(false);
    const [editingEndpoint, setEditingEndpoint] = useState<CustomEndpoint | undefined>(undefined);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [showKeyboardHints, setShowKeyboardHints] = useState(false);

    // Handlers
    const handleSaveEndpoint = useCallback((endpoint: CustomEndpoint) => {
        if (editingEndpoint) {
            updateEndpoint(endpoint);
        } else {
            addEndpoint(endpoint);
        }
        setEditingEndpoint(undefined);
    }, [editingEndpoint, addEndpoint, updateEndpoint]);

    const handleReplayRequest = useCallback((item: RequestHistoryItem) => {
        const endpoint = allEndpoints.find(ep => ep.id === item.endpointId);
        if (endpoint) {
            setState(prev => ({
                ...prev,
                selectedEndpoint: endpoint,
                rawBody: item.body,
                queryParams: Object.fromEntries(
                    new URL(item.url, window.location.origin).searchParams.entries()
                )
            }));
        }
        setShowHistory(false);
    }, [allEndpoints, setState]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose?.();
            }
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                executeRequest();
            }
            if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
                e.preventDefault();
                setSidebarCollapsed(prev => !prev);
            }
            if (e.key === '?') {
                setShowKeyboardHints(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose, executeRequest]);

    // Check if custom endpoint
    const isCustomEndpoint = customEndpoints.some(ep => ep.id === selectedEndpoint.id);
    const currentCustomEndpoint = customEndpoints.find(ep => ep.id === selectedEndpoint.id);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-background flex"
        >
            {/* Massive Data Full-Screen Modal */}
            <AnimatePresence>
                {showMassiveData && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[55] bg-background"
                    >
                        <MassiveDataPlayground
                            apiKey={apiKey}
                            baseUrl={API_BASE}
                            onClose={() => setShowMassiveData(false)}
                        />
                    </motion.div>
                )}

                {/* Static Cache Full-Screen Modal */}
                {showStaticCache && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[55] bg-background p-8 overflow-auto"
                    >
                        <div className="max-w-4xl mx-auto">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl font-semibold text-foreground">Static Cache Tesztelő</h2>
                                <button
                                    onClick={() => setShowStaticCache(false)}
                                    className="p-2 hover:bg-muted rounded-lg transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                            <StaticCachePlayground />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Modals */}
            <AnimatePresence>
                {showSnippets && (
                    <SnippetsModal
                        selectedEndpoint={selectedEndpoint}
                        buildRequest={buildRequest}
                        copied={copied}
                        onCopy={copyToClipboard}
                        onClose={() => setShowSnippets(false)}
                    />
                )}
                {showEndpointBuilder && (
                    <EndpointBuilder
                        onSave={handleSaveEndpoint}
                        onClose={() => {
                            setShowEndpointBuilder(false);
                            setEditingEndpoint(undefined);
                        }}
                        editEndpoint={editingEndpoint}
                    />
                )}
                {showHistory && (
                    <RequestHistoryModal
                        history={history}
                        onReplay={handleReplayRequest}
                        onClear={clearHistory}
                        onDeleteItem={deleteHistoryItem}
                        onClose={() => setShowHistory(false)}
                    />
                )}
                {showImportExport && (
                    <ImportExport
                        customEndpoints={customEndpoints}
                        onImport={importEndpoints}
                        onClose={() => setShowImportExport(false)}
                    />
                )}
                {showKeyboardHints && (
                    <KeyboardHints onClose={() => setShowKeyboardHints(false)} />
                )}
            </AnimatePresence>

            {/* Sidebar */}
            <motion.aside
                initial={false}
                animate={{ width: sidebarCollapsed ? 0 : 300 }}
                className="h-full border-r border-border bg-card/30 flex flex-col overflow-hidden"
            >
                {/* Sidebar Header */}
                <div className="h-14 px-4 border-b border-border flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-foreground to-foreground/70 flex items-center justify-center">
                            <Zap size={14} className="text-background" />
                        </div>
                        <div>
                            <span className="font-semibold text-sm">API Playground</span>
                            <p className="text-[10px] text-muted-foreground">{allEndpoints.length} endpoints</p>
                        </div>
                    </div>
                </div>

                {/* Search */}
                <div className="p-3 border-b border-border">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => setState(p => ({ ...p, searchQuery: e.target.value }))}
                            placeholder="Search endpoints..."
                            className="w-full h-9 bg-muted/50 rounded-lg pl-10 pr-4 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="p-3 border-b border-border space-y-1">
                    <QuickAction
                        icon={Plus}
                        label="New Endpoint"
                        onClick={() => setShowEndpointBuilder(true)}
                        primary
                    />
                    <QuickAction
                        icon={Layers}
                        label="Massive Data"
                        onClick={() => setShowMassiveData(true)}
                    />
                    <QuickAction
                        icon={Zap}
                        label="Static Cache"
                        onClick={() => setShowStaticCache(true)}
                    />
                    <div className="flex gap-1">
                        <QuickAction
                            icon={History}
                            label="History"
                            badge={history.length > 0 ? history.length : undefined}
                            onClick={() => setShowHistory(true)}
                            compact
                        />
                        <QuickAction
                            icon={FileJson}
                            label="Import"
                            onClick={() => setShowImportExport(true)}
                            compact
                        />
                    </div>
                </div>

                {/* Endpoint List */}
                <div className="flex-1 overflow-y-auto">
                    <CleanEndpointList
                        endpoints={allEndpoints}
                        searchQuery={searchQuery}
                        selectedEndpoint={selectedEndpoint}
                        expandedCategory={expandedCategory}
                        onSelectEndpoint={(ep) => setState(p => ({ ...p, selectedEndpoint: ep }))}
                        onToggleCategory={setExpandedCategory}
                    />
                </div>

                {/* Sidebar Footer */}
                <div className="p-3 border-t border-border">
                    <button
                        onClick={() => setShowKeyboardHints(true)}
                        className="w-full flex items-center justify-between px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
                    >
                        <span className="flex items-center gap-2">
                            <Keyboard size={14} />
                            Shortcuts
                        </span>
                        <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">?</kbd>
                    </button>
                </div>
            </motion.aside>

            {/* Sidebar Toggle (when collapsed) */}
            <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className={`absolute left-0 top-1/2 -translate-y-1/2 z-20 p-1.5 bg-card border border-border rounded-r-lg transition-all ${sidebarCollapsed ? 'translate-x-0' : '-translate-x-full opacity-0'
                    }`}
            >
                <ChevronRight size={16} className="text-muted-foreground" />
            </button>

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Top Bar */}
                <header className="h-14 px-4 border-b border-border flex items-center justify-between shrink-0 bg-card/30">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                            className="p-2 hover:bg-muted rounded-lg transition-colors"
                        >
                            {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
                        </button>
                        <div className="h-6 w-px bg-border" />
                        <span className="text-sm font-mono text-muted-foreground">{API_BASE}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowSnippets(true)}
                            className="h-8 px-3 flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                        >
                            <Code size={14} />
                            Code
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-destructive/10 hover:text-destructive rounded-lg transition-colors"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </header>

                {/* Request Section */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Request Builder */}
                    <div className="flex-1 flex flex-col min-w-0">
                        {/* URL Bar */}
                        <div className="p-4 border-b border-border bg-gradient-to-r from-muted/20 to-transparent">
                            <div className="flex items-center gap-3 mb-3">
                                <MethodBadge method={selectedEndpoint.method} />
                                <h2 className="text-lg font-semibold">{selectedEndpoint.name}</h2>
                                {isCustomEndpoint && currentCustomEndpoint && (
                                    <button
                                        onClick={() => {
                                            setEditingEndpoint(currentCustomEndpoint);
                                            setShowEndpointBuilder(true);
                                        }}
                                        className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                        <Pencil size={14} />
                                    </button>
                                )}
                            </div>
                            <p className="text-sm text-muted-foreground mb-4">{selectedEndpoint.description}</p>

                            {/* URL Display */}
                            <div className="flex items-center rounded-lg border border-border bg-background overflow-hidden">
                                <div className="px-3 py-2.5 text-sm font-mono text-muted-foreground bg-muted/30 border-r border-border">
                                    {API_BASE}
                                </div>
                                <div className="flex-1 px-3 py-2.5 text-sm font-mono text-foreground">
                                    {selectedEndpoint.path}
                                </div>
                                {Object.keys(queryParams).length > 0 && (
                                    <div className="px-3 py-2.5 text-sm font-mono text-purple-500 bg-purple-500/5 border-l border-border">
                                        ?{Object.entries(queryParams).map(([k, v]) => `${k}=${v}`).join('&')}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Tabs */}
                        <div className="flex border-b border-border">
                            {(['params', 'body', 'auth'] as const).map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    className={`px-6 py-3 text-sm font-medium transition-all border-b-2 capitalize ${activeTab === tab
                                        ? 'border-foreground text-foreground'
                                        : 'border-transparent text-muted-foreground hover:text-foreground'
                                        }`}
                                >
                                    {tab === 'params' ? 'Parameters' : tab === 'auth' ? 'Authentication' : 'Body'}
                                </button>
                            ))}
                        </div>

                        {/* Tab Content */}
                        <div className="flex-1 overflow-y-auto p-6">
                            {activeTab === 'params' && (
                                <ParamsTab
                                    queryParams={queryParams}
                                    onQueryParamChange={(k, v) => setState(p => ({ ...p, queryParams: { ...p.queryParams, [k]: v } }))}
                                />
                            )}
                            {activeTab === 'body' && (
                                <BodyTab
                                    selectedEndpoint={selectedEndpoint}
                                    formData={formData}
                                    rawBody={rawBody}
                                    useRawBody={useRawBody}
                                    onFormDataChange={(field, val) => setState(p => ({ ...p, formData: { ...p.formData, [field]: val } }))}
                                    onRawBodyChange={(val) => setState(p => ({ ...p, rawBody: val }))}
                                    onUseRawBodyChange={(val) => setState(p => ({ ...p, useRawBody: val }))}
                                />
                            )}
                            {activeTab === 'auth' && (
                                <AuthTab
                                    apiKey={apiKey}
                                    onApiKeyChange={(val) => setState(p => ({ ...p, apiKey: val }))}
                                />
                            )}
                        </div>
                    </div>

                    {/* Response Panel */}
                    <CleanResponsePanel
                        loading={loading}
                        response={response}
                        status={status}
                        duration={duration}
                        copied={copied}
                        onExecute={executeRequest}
                        onCopy={copyToClipboard}
                    />
                </div>
            </div>
        </motion.div>
    );
}

// =============================================================================
// Clean Sub-components
// =============================================================================

function MethodBadge({ method }: { method: HttpMethod }) {
    const theme = METHOD_THEMES[method];
    return (
        <span className={`px-2.5 py-1 text-xs font-bold font-mono rounded ${theme.bg} ${theme.text}`}>
            {method}
        </span>
    );
}

interface QuickActionProps {
    icon: LucideIcon;
    label: string;
    badge?: number;
    primary?: boolean;
    compact?: boolean;
    onClick: () => void;
}

function QuickAction({ icon: Icon, label, badge, primary, compact, onClick }: QuickActionProps) {
    if (compact) {
        return (
            <button
                onClick={onClick}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-all"
            >
                <Icon size={14} />
                {label}
                {badge !== undefined && (
                    <span className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">{badge}</span>
                )}
            </button>
        );
    }

    return (
        <button
            onClick={onClick}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-all ${primary
                ? 'bg-foreground text-background hover:bg-foreground/90 font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
        >
            <span className="flex items-center gap-2">
                <Icon size={16} />
                {label}
            </span>
            {badge !== undefined && (
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${primary ? 'bg-background/20 text-background' : 'bg-muted'
                    }`}>
                    {badge}
                </span>
            )}
        </button>
    );
}

// Clean Endpoint List
interface CleanEndpointListProps {
    endpoints: EndpointDef[];
    searchQuery: string;
    selectedEndpoint: EndpointDef;
    expandedCategory: string | null;
    onSelectEndpoint: (endpoint: EndpointDef) => void;
    onToggleCategory: (category: string | null) => void;
}

const CATEGORY_CONFIG = {
    custom: { icon: Star, label: 'Custom' },
    content: { icon: Database, label: 'Content' },
    media: { icon: Cloud, label: 'Media' },
    auth: { icon: Shield, label: 'Auth' },
    admin: { icon: LayoutGrid, label: 'Admin' }
} as const;

function CleanEndpointList({
    endpoints,
    searchQuery,
    selectedEndpoint,
    expandedCategory,
    onSelectEndpoint,
    onToggleCategory
}: CleanEndpointListProps) {
    const [expandedSlots, setExpandedSlots] = useState<Set<string>>(new Set());

    const { grouped, slotGroups } = useMemo(() => {
        const lowerQ = searchQuery.toLowerCase();
        const filtered = endpoints.filter(e =>
            e.name.toLowerCase().includes(lowerQ) ||
            e.path.toLowerCase().includes(lowerQ) ||
            e.slot?.toLowerCase().includes(lowerQ)
        );

        const custom = filtered.filter(e => e.id.startsWith('custom-'));
        const content = filtered.filter(e => e.category === 'content' && !e.id.startsWith('custom-'));

        // Group content by slot
        const slotMap = new Map<string, EndpointDef[]>();
        content.forEach(ep => {
            if (ep.slot) {
                const existing = slotMap.get(ep.slot) || [];
                existing.push(ep);
                slotMap.set(ep.slot, existing);
            }
        });

        const slots = Array.from(slotMap.entries()).map(([slot, eps]) => ({
            slot,
            label: eps[0]?.slotConfig?.label || slot,
            endpoints: eps
        })).sort((a, b) => a.label.localeCompare(b.label));

        return {
            grouped: {
                custom,
                content,
                media: filtered.filter(e => e.category === 'media'),
                auth: filtered.filter(e => e.category === 'auth'),
                admin: filtered.filter(e => e.category === 'admin')
            },
            slotGroups: slots
        };
    }, [endpoints, searchQuery]);

    const categories = (['custom', 'content', 'media', 'auth', 'admin'] as const).filter(
        cat => cat === 'content' ? slotGroups.length > 0 : grouped[cat].length > 0
    );

    return (
        <div className="p-2 space-y-1">
            {categories.map(category => {
                const { icon: Icon, label } = CATEGORY_CONFIG[category];
                const isExpanded = expandedCategory === category;
                const count = category === 'content'
                    ? slotGroups.reduce((acc, g) => acc + g.endpoints.length, 0)
                    : grouped[category].length;

                return (
                    <div key={category}>
                        <button
                            onClick={() => onToggleCategory(isExpanded ? null : category)}
                            className="w-full flex items-center justify-between px-3 py-2 text-sm text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted/30 transition-colors"
                        >
                            <span className="flex items-center gap-2">
                                <Icon size={14} />
                                {label}
                            </span>
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-mono opacity-60">{count}</span>
                                <ChevronRight size={14} className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                            </div>
                        </button>

                        <AnimatePresence>
                            {isExpanded && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden"
                                >
                                    {category === 'content' ? (
                                        <div className="pl-4 py-1 space-y-0.5">
                                            {slotGroups.map(group => {
                                                const isSlotExpanded = expandedSlots.has(group.slot);
                                                return (
                                                    <div key={group.slot}>
                                                        <button
                                                            onClick={() => {
                                                                const newSet = new Set(expandedSlots);
                                                                isSlotExpanded ? newSet.delete(group.slot) : newSet.add(group.slot);
                                                                setExpandedSlots(newSet);
                                                            }}
                                                            className="w-full flex items-center justify-between px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground rounded transition-colors"
                                                        >
                                                            <span className="flex items-center gap-1.5">
                                                                <FolderOpen size={12} />
                                                                {group.label}
                                                            </span>
                                                            <ChevronRight size={10} className={`transition-transform ${isSlotExpanded ? 'rotate-90' : ''}`} />
                                                        </button>
                                                        <AnimatePresence>
                                                            {isSlotExpanded && (
                                                                <motion.div
                                                                    initial={{ height: 0 }}
                                                                    animate={{ height: 'auto' }}
                                                                    exit={{ height: 0 }}
                                                                    className="overflow-hidden pl-4"
                                                                >
                                                                    {group.endpoints.map(ep => (
                                                                        <EndpointItem
                                                                            key={ep.id}
                                                                            endpoint={ep}
                                                                            isSelected={selectedEndpoint.id === ep.id}
                                                                            onSelect={() => onSelectEndpoint(ep)}
                                                                        />
                                                                    ))}
                                                                </motion.div>
                                                            )}
                                                        </AnimatePresence>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="pl-4 py-1 space-y-0.5">
                                            {grouped[category].map(ep => (
                                                <EndpointItem
                                                    key={ep.id}
                                                    endpoint={ep}
                                                    isSelected={selectedEndpoint.id === ep.id}
                                                    onSelect={() => onSelectEndpoint(ep)}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                );
            })}
        </div>
    );
}

function EndpointItem({ endpoint, isSelected, onSelect }: { endpoint: EndpointDef; isSelected: boolean; onSelect: () => void }) {
    const theme = METHOD_THEMES[endpoint.method];
    return (
        <button
            onClick={onSelect}
            className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all ${isSelected
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
        >
            <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold font-mono w-12 ${theme.text}`}>
                    {endpoint.method}
                </span>
                <span className="truncate">{endpoint.name}</span>
            </div>
        </button>
    );
}

// Tab Components
function ParamsTab({ queryParams, onQueryParamChange }: { queryParams: Record<string, string>; onQueryParamChange: (k: string, v: string) => void }) {
    const entries = Object.entries(queryParams);

    if (entries.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <ArrowRight size={32} className="mb-3 opacity-30" />
                <p className="text-sm">No query parameters</p>
                <p className="text-xs opacity-60 mt-1">This endpoint doesn't require parameters</p>
            </div>
        );
    }

    return (
        <div className="max-w-xl space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground">Query Parameters</h3>
            <div className="space-y-3">
                {entries.map(([key, value]) => (
                    <div key={key} className="flex items-center gap-4">
                        <label className="w-32 text-sm font-mono text-muted-foreground">{key}</label>
                        <input
                            value={value}
                            onChange={e => onQueryParamChange(key, e.target.value)}
                            className="flex-1 h-10 px-3 bg-muted/30 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}

function BodyTab({ selectedEndpoint, formData, rawBody, useRawBody, onFormDataChange, onRawBodyChange, onUseRawBodyChange }: {
    selectedEndpoint: EndpointDef;
    formData: Record<string, unknown>;
    rawBody: string;
    useRawBody: boolean;
    onFormDataChange: (field: string, value: unknown) => void;
    onRawBodyChange: (value: string) => void;
    onUseRawBodyChange: (value: boolean) => void;
}) {
    if (!selectedEndpoint.slotConfig && !['POST', 'PUT', 'PATCH'].includes(selectedEndpoint.method)) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Send size={32} className="mb-3 opacity-30" />
                <p className="text-sm">No request body</p>
                <p className="text-xs opacity-60 mt-1">GET requests don't have a body</p>
            </div>
        );
    }

    return (
        <div className="max-w-2xl">
            {/* Mode Toggle */}
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-medium text-muted-foreground">Request Body</h3>
                <div className="flex rounded-lg overflow-hidden border border-border">
                    <button
                        onClick={() => onUseRawBodyChange(false)}
                        className={`px-3 py-1.5 text-xs font-medium transition-colors ${!useRawBody ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
                            }`}
                    >
                        Form
                    </button>
                    <button
                        onClick={() => onUseRawBodyChange(true)}
                        className={`px-3 py-1.5 text-xs font-medium transition-colors ${useRawBody ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
                            }`}
                    >
                        Raw JSON
                    </button>
                </div>
            </div>

            {useRawBody ? (
                <textarea
                    value={rawBody}
                    onChange={e => onRawBodyChange(e.target.value)}
                    placeholder="{}"
                    className="w-full h-80 p-4 bg-muted/30 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                    spellCheck={false}
                />
            ) : selectedEndpoint.slotConfig ? (
                <div className="space-y-4">
                    {selectedEndpoint.slotConfig.fields.filter(f => !f.hidden).map(field => (
                        <div key={field.id} className="space-y-2">
                            <label className="flex items-center justify-between text-sm">
                                <span className="font-medium">
                                    {field.label}
                                    {field.required && <span className="text-destructive ml-1">*</span>}
                                </span>
                                <span className="text-xs text-muted-foreground font-mono">{field.type}</span>
                            </label>
                            <DynamicFieldInput
                                field={field}
                                value={formData[field.id]}
                                onChange={val => onFormDataChange(field.id, val)}
                            />
                        </div>
                    ))}
                </div>
            ) : (
                <textarea
                    value={rawBody}
                    onChange={e => onRawBodyChange(e.target.value)}
                    placeholder="{}"
                    className="w-full h-80 p-4 bg-muted/30 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                    spellCheck={false}
                />
            )}
        </div>
    );
}

function AuthTab({ apiKey, onApiKeyChange }: { apiKey: string; onApiKeyChange: (value: string) => void }) {
    return (
        <div className="max-w-xl space-y-6">
            <div className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground">API Key</h3>
                <div className="space-y-2">
                    <label className="text-xs text-muted-foreground font-mono">X-API-KEY</label>
                    <input
                        type="password"
                        value={apiKey}
                        onChange={e => onApiKeyChange(e.target.value)}
                        placeholder="Enter your API key..."
                        className="w-full h-10 px-3 bg-muted/30 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                </div>
            </div>
            <div className="p-4 bg-muted/20 rounded-lg border border-border">
                <p className="text-xs text-muted-foreground">
                    API keys are sent via the <code className="px-1 py-0.5 bg-muted rounded">X-API-KEY</code> header.
                    For authenticated endpoints, you may also need valid session cookies.
                </p>
            </div>
        </div>
    );
}

// Clean Response Panel
interface CleanResponsePanelProps {
    loading: boolean;
    response: unknown;
    status: number | null;
    duration: number | null;
    copied: string | null;
    onExecute: () => void;
    onCopy: (text: string, key: string) => void;
}

function CleanResponsePanel({ loading, response, status, duration, copied, onExecute, onCopy }: CleanResponsePanelProps) {
    const statusOk = status !== null && status >= 200 && status < 300;
    const hasResponse = response !== null && response !== undefined;

    return (
        <div className="w-[480px] border-l border-border bg-card/30 flex flex-col shrink-0">
            {/* Execute Button */}
            <div className="p-4 border-b border-border">
                <button
                    onClick={onExecute}
                    disabled={loading}
                    className={`w-full h-12 flex items-center justify-center gap-2 text-sm font-semibold rounded-lg transition-all ${loading
                        ? 'bg-muted text-muted-foreground cursor-wait'
                        : 'bg-foreground text-background hover:bg-foreground/90'
                        }`}
                >
                    {loading ? (
                        <>
                            <Loader2 size={16} className="animate-spin" />
                            Sending...
                        </>
                    ) : (
                        <>
                            <Play size={16} />
                            Send Request
                        </>
                    )}
                </button>

                {/* Stats */}
                <div className="flex items-center justify-center gap-6 mt-4 text-sm">
                    <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Status:</span>
                        <span className={`font-mono font-semibold ${status === null ? 'text-muted-foreground' : statusOk ? 'text-emerald-500' : 'text-red-500'
                            }`}>
                            {status || '—'}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Clock size={14} className="text-muted-foreground" />
                        <span className="font-mono">{duration ? `${duration}ms` : '—'}</span>
                    </div>
                </div>
            </div>

            {/* Response */}
            <div className="flex-1 overflow-hidden relative">
                {!hasResponse && !loading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                        <Zap size={48} className="mb-4 opacity-20" />
                        <p className="text-sm font-medium">Ready to send</p>
                        <p className="text-xs opacity-60 mt-1">Press ⌘+Enter to send request</p>
                    </div>
                )}

                {hasResponse && (
                    <div className="absolute inset-0 overflow-auto p-4">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-medium text-muted-foreground">Response</span>
                            <button
                                onClick={() => onCopy(JSON.stringify(response, null, 2), 'response')}
                                className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                            >
                                {copied === 'response' ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                                {copied === 'response' ? 'Copied!' : 'Copy'}
                            </button>
                        </div>
                        <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap break-all text-muted-foreground">
                            <code dangerouslySetInnerHTML={{ __html: highlightJSON(JSON.stringify(response, null, 2)) }} />
                        </pre>
                    </div>
                )}
            </div>
        </div>
    );
}

// Keyboard Hints Modal
function KeyboardHints({ onClose }: { onClose: () => void }) {
    const shortcuts = [
        { keys: ['⌘', 'Enter'], action: 'Send Request' },
        { keys: ['⌘', 'B'], action: 'Toggle Sidebar' },
        { keys: ['Esc'], action: 'Close' },
        { keys: ['?'], action: 'Show Shortcuts' },
    ];

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-background/80 backdrop-blur-sm flex items-center justify-center"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, y: 10 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 10 }}
                className="bg-card border border-border rounded-xl shadow-2xl p-6 w-80"
                onClick={e => e.stopPropagation()}
            >
                <h3 className="text-sm font-semibold mb-4">Keyboard Shortcuts</h3>
                <div className="space-y-3">
                    {shortcuts.map((shortcut, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">{shortcut.action}</span>
                            <div className="flex items-center gap-1">
                                {shortcut.keys.map((key, j) => (
                                    <kbd
                                        key={j}
                                        className="px-2 py-1 bg-muted rounded text-xs font-mono"
                                    >
                                        {key}
                                    </kbd>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </motion.div>
        </motion.div>
    );
}

export default ApiPlayground;
