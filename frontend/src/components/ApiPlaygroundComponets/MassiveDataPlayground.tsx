// Massive Data Playground - Professional Integration Builder
// Redesigned for clarity, ease of use, and integration workflow

import { useCallback, useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Check,
    Copy,
    Layers,
    Loader2,
    Play,
    Plus,
    Trash2,
    X,
    Search,
    Database,
    BarChart3,
    FileJson,
    Code,
    Settings2,
    Filter,
    ArrowUpDown,
    Zap,
    Terminal
} from 'lucide-react';

import { ADMIN_CONFIG, SlotConfig } from '@/config/admin.config';
import { API_URL_MODE } from '@/config/api-paths.config';
import { generateMassiveBodyTemplate, highlightJSON } from './utils';

// =============================================================================
// Types & Constants
// =============================================================================

type OperationCategory = 'read' | 'write' | 'analytics';

interface OperationDef {
    id: string;
    label: string;
    description: string;
    category: OperationCategory;
    icon: React.ElementType;
}

const OPERATIONS: OperationDef[] = [
    // Read
    { id: 'advancedQuery', label: 'Query Builder', description: 'Search with complex filters', category: 'read', icon: Search },
    { id: 'list', label: 'Simple List', description: 'Standard pagination', category: 'read', icon: Database },
    { id: 'getById', label: 'Get Record', description: 'Fetch single item by ID', category: 'read', icon: FileJson },

    // Analytics
    { id: 'stats', label: 'Statistics', description: 'Count, min, max dates', category: 'analytics', icon: BarChart3 },
    { id: 'aggregate', label: 'Aggregation', description: 'Sum, Avg, Min, Max', category: 'analytics', icon: BarChart3 },
    { id: 'groupBy', label: 'Group By', description: 'Distribution analysis', category: 'analytics', icon: BarChart3 },

    // Write
    { id: 'create', label: 'Create Record', description: 'Insert new data', category: 'write', icon: Plus },
    { id: 'update', label: 'Update Record', description: 'Modify existing data', category: 'write', icon: Settings2 },
    { id: 'bulkUpdate', label: 'Bulk Update', description: 'Update multiple records', category: 'write', icon: Layers },
    { id: 'delete', label: 'Delete', description: 'Remove single record', category: 'write', icon: Trash2 },
];

const CONDITION_LABELS: Record<ConditionOp, string> = {
    eq: 'Equals (=)',
    ne: 'Not Equals (!=)',
    gt: 'Greater Than (>)',
    gte: 'Greater/Equal (>=)',
    lt: 'Less Than (<)',
    lte: 'Less/Equal (<=)',
    like: 'Like (Pattern)',
    notlike: 'Not Like',
    in: 'In List',
    notin: 'Not In List',
    isnull: 'Is Null',
    isnotnull: 'Is Not Null',
    between: 'Between',
    startswith: 'Starts With',
    endswith: 'Ends With',
    contains: 'Contains'
};

type LogicOp = 'AND' | 'OR';

type ConditionOp =
    | 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte'
    | 'like' | 'notlike' | 'in' | 'notin'
    | 'isnull' | 'isnotnull' | 'between'
    | 'startswith' | 'endswith' | 'contains';

interface ConditionRow {
    id: string;
    field: string;
    op: ConditionOp;
    value: string;
}

interface SortRow {
    id: string;
    field: string;
    dir: 'asc' | 'desc';
}

interface KeyValueRow {
    id: string;
    key: string;
    value: string;
}

interface MassiveDataPlaygroundProps {
    apiKey: string;
    baseUrl: string;
    onClose: () => void;
}

// =============================================================================
// Helpers
// =============================================================================

function makeId(prefix: string) {
    return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function parseMaybeJson(value: string): unknown {
    const trimmed = value.trim();
    if (trimmed === '') return '';
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    if (!Number.isNaN(Number(trimmed)) && /^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
    if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
        try { return JSON.parse(trimmed); } catch { return value; }
    }
    return value;
}

function rowsToObject(rows: KeyValueRow[]): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const row of rows) {
        const key = row.key.trim();
        if (!key) continue;
        out[key] = parseMaybeJson(row.value);
    }
    return out;
}

function getMassiveSlots(): Array<{ key: string; config: SlotConfig }> {
    return Object.entries(ADMIN_CONFIG)
        .filter(([, cfg]) => cfg.type === 'massive')
        .map(([key, config]) => ({ key, config }));
}

// =============================================================================
// UI Components
// =============================================================================

function Block({ title, icon: Icon, children, onDelete, className = '' }: { title: string; icon?: React.ElementType; children: React.ReactNode; onDelete?: () => void; className?: string }) {
    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={`bg-card border border-border rounded-md overflow-hidden shadow-sm ${className}`}
        >
            <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {Icon && <Icon size={14} className="text-muted-foreground" />}
                    <span className="text-xs font-bold uppercase tracking-wider text-foreground">{title}</span>
                </div>
                {onDelete && (
                    <button onClick={onDelete} className="text-muted-foreground hover:text-red-500 transition-colors">
                        <X size={14} />
                    </button>
                )}
            </div>
            <div className="p-4">{children}</div>
        </motion.div>
    );
}

function CodeBlock({ code }: { code: string; language?: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="relative group rounded-sm overflow-hidden border border-border bg-muted/10">
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <button
                    onClick={handleCopy}
                    className="p-1.5 bg-background border border-border rounded-sm text-muted-foreground hover:text-foreground shadow-sm"
                >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
            </div>
            <pre className="p-4 text-[10px] font-mono leading-relaxed overflow-x-auto custom-scrollbar text-muted-foreground">
                {code}
            </pre>
        </div>
    );
}

// =============================================================================
// Main Component
// =============================================================================

export function MassiveDataPlayground({ apiKey, baseUrl, onClose }: MassiveDataPlaygroundProps) {
    // Use path-based URLs when enabled
    const usePaths = API_URL_MODE === 'path';
    const slots = useMemo(() => getMassiveSlots(), []);

    // State
    const [currentApiKey, setCurrentApiKey] = useState(apiKey);
    const [selectedSlotKey, setSelectedSlotKey] = useState(slots[0]?.key || '');
    const [selectedOpId, setSelectedOpId] = useState('advancedQuery');
    const [activeTab, setActiveTab] = useState<'builder' | 'code' | 'settings'>('builder');
    
    // Dynamic endpoint path based on URL mode and selected slot
    const endpointPath = usePaths ? `/massive/${selectedSlotKey}` : '/endpoints/massive.php';

    // Sync prop
    useEffect(() => { setCurrentApiKey(apiKey); }, [apiKey]);

    // Builder State
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);
    const [search, setSearch] = useState('');
    const [recordId, setRecordId] = useState(1);
    const [logic, setLogic] = useState<LogicOp>('AND');

    // Dynamic Lists
    const [conditions, setConditions] = useState<ConditionRow[]>([]);
    const [sorts, setSorts] = useState<SortRow[]>([]);
    const [dataPairs, setDataPairs] = useState<KeyValueRow[]>([]);

    // Analytics
    const [aggFn, setAggFn] = useState('count');
    const [aggField, setAggField] = useState('id');
    const [groupByField, setGroupByField] = useState('status');

    // Execution
    const [loading, setLoading] = useState(false);
    const [response, setResponse] = useState<unknown>(null);
    const [status, setStatus] = useState<number | null>(null);
    const [duration, setDuration] = useState<number | null>(null);

    // Derived
    const selectedSlot = useMemo(() => slots.find(s => s.key === selectedSlotKey), [slots, selectedSlotKey]);
    const selectedOp = useMemo(() => OPERATIONS.find(o => o.id === selectedOpId), [selectedOpId]);

    // Reset data when slot changes
    useEffect(() => {
        if (selectedSlot) {
            const templ = generateMassiveBodyTemplate(selectedSlot.config);
            setDataPairs(Object.entries(templ).map(([k, v]) => ({
                id: makeId('data'),
                key: k,
                value: typeof v === 'string' ? v : JSON.stringify(v)
            })));
        }
    }, [selectedSlot]);

    // Build Request Object
    const buildRequest = useCallback(() => {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...(currentApiKey ? { 'X-API-KEY': currentApiKey } : {})
        };

        const qs = new URLSearchParams();
        if (selectedSlotKey) qs.set('slot', selectedSlotKey);

        let method = 'GET';
        let body: any = null;

        switch (selectedOpId) {
            case 'list':
                qs.set('page', String(page));
                qs.set('pageSize', String(pageSize));
                if (search) qs.set('search', search);
                break;
            case 'getById':
                qs.set('id', String(recordId));
                break;
            case 'stats':
                qs.set('stats', '1');
                break;
            case 'advancedQuery':
                method = 'POST';
                body = {
                    _action: 'query',
                    slot: selectedSlotKey,
                    conditions: conditions.map(c => ({ field: c.field, op: c.op, value: parseMaybeJson(c.value) })),
                    sort: sorts.map(s => ({ field: s.field, dir: s.dir })),
                    page,
                    pageSize,
                    logic,
                    search: search || undefined
                };
                break;
            case 'create':
                method = 'POST';
                body = { slot: selectedSlotKey, data: rowsToObject(dataPairs) };
                break;
            case 'update':
                method = 'PUT';
                body = { slot: selectedSlotKey, id: recordId, data: rowsToObject(dataPairs) };
                break;
            case 'delete':
                method = 'DELETE';
                qs.set('id', String(recordId));
                break;
            case 'aggregate':
                method = 'POST';
                body = {
                    _action: 'aggregate',
                    slot: selectedSlotKey,
                    function: aggFn,
                    field: aggField,
                    conditions: conditions.map(c => ({ field: c.field, op: c.op, value: parseMaybeJson(c.value) }))
                };
                break;
            case 'groupBy':
                method = 'POST';
                body = {
                    _action: 'groupby',
                    slot: selectedSlotKey,
                    field: groupByField,
                    conditions: conditions.map(c => ({ field: c.field, op: c.op, value: parseMaybeJson(c.value) }))
                };
                break;
        }

        const url = `${baseUrl}${endpointPath}${qs.toString() ? '?' + qs.toString() : ''}`;
        return { method, url, headers, body };
    }, [currentApiKey, baseUrl, selectedSlotKey, selectedOpId, page, pageSize, search, recordId, logic, conditions, sorts, dataPairs, aggFn, aggField, groupByField]);

    // Execute Request
    const execute = async () => {
        setLoading(true);
        setResponse(null);
        setStatus(null);
        const start = performance.now();

        try {
            const req = buildRequest();
            const res = await fetch(req.url, {
                method: req.method,
                headers: req.headers,
                body: req.body ? JSON.stringify(req.body) : undefined
            });

            const data = res.headers.get('content-type')?.includes('json')
                ? await res.json()
                : await res.text();

            setResponse(data);
            setStatus(res.status);
        } catch (e) {
            setResponse({ error: e instanceof Error ? e.message : 'Network Error' });
            setStatus(0);
        } finally {
            setLoading(false);
            setDuration(Math.round(performance.now() - start));
        }
    };

    // Code Generation
    const generateCode = () => {
        const req = buildRequest();
        const bodyStr = req.body ? JSON.stringify(req.body, null, 2) : '';

        const jsCode = `
// JavaScript / TypeScript (Fetch)
const response = await fetch('${req.url}', {
    method: '${req.method}',
    headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': '${currentApiKey || 'YOUR_API_KEY'}'
    },
    ${bodyStr ? `body: JSON.stringify(${bodyStr.replace(/\n/g, '\n    ')})` : ''}
});

const data = await response.json();
console.log(data);
`.trim();

        const phpCode = `
// PHP (cURL)
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, '${req.url}');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, '${req.method}');
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'X-API-KEY: ${currentApiKey || 'YOUR_API_KEY'}'
]);
${bodyStr ? `
$body = json_encode(${JSON.stringify(req.body)});
curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
` : ''}
$response = curl_exec($ch);
curl_close($ch);

$data = json_decode($response, true);
`.trim();

        return { js: jsCode, php: phpCode };
    };

    const codeSnippets = generateCode();

    return (
        <div className="fixed inset-0 z-[100] bg-background flex flex-col">
            {/* Header */}
            <div className="h-16 border-b border-border px-6 flex items-center justify-between bg-card/50 backdrop-blur-sm">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-sm bg-primary/10 flex items-center justify-center text-primary">
                        <Layers size={20} />
                    </div>
                    <div>
                        <h1 className="font-bold text-lg">Integration Builder</h1>
                        <p className="text-xs text-muted-foreground">Build queries, test endpoints, and generate integration code</p>
                    </div>
                </div>
                <button onClick={onClose} className="p-2 hover:bg-muted rounded-sm transition-colors">
                    <X size={20} />
                </button>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Left Sidebar - Resources */}
                <div className="w-64 border-r border-border bg-muted/10 flex flex-col">
                    <div className="p-4 border-b border-border">
                        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">
                            Select Resource
                        </label>
                        <div className="space-y-1">
                            {slots.map(s => (
                                <button
                                    key={s.key}
                                    onClick={() => setSelectedSlotKey(s.key)}
                                    className={`w-full text-left px-3 py-2 rounded-sm text-sm font-medium transition-all ${selectedSlotKey === s.key
                                        ? 'bg-primary/10 text-primary'
                                        : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                                        }`}
                                >
                                    {s.config.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4">
                        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 block">
                            Operation
                        </label>
                        <div className="space-y-4">
                            {(['read', 'analytics', 'write'] as const).map(cat => (
                                <div key={cat}>
                                    <div className="text-[10px] font-bold uppercase text-muted-foreground/50 mb-2">{cat}</div>
                                    <div className="space-y-1">
                                        {OPERATIONS.filter(op => op.category === cat).map(op => (
                                            <button
                                                key={op.id}
                                                onClick={() => setSelectedOpId(op.id)}
                                                className={`w-full flex items-center gap-3 px-3 py-2 rounded-sm text-sm transition-all ${selectedOpId === op.id
                                                    ? 'bg-card border border-border shadow-sm text-foreground'
                                                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                                                    }`}
                                            >
                                                <op.icon size={16} />
                                                <div className="text-left">
                                                    <div className="font-medium">{op.label}</div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Center - Builder Canvas */}
                <div className="flex-1 bg-muted/5 flex flex-col overflow-hidden relative">
                    <div className="flex-1 overflow-y-auto p-8">
                        <div className="max-w-3xl mx-auto space-y-6">

                            {/* Context Header */}
                            <div className="flex items-center gap-3 mb-8">
                                <span className="text-2xl font-light text-muted-foreground">I want to</span>
                                <span className="px-3 py-1 bg-primary/10 text-primary rounded-sm font-mono font-bold">
                                    {selectedOp?.label}
                                </span>
                                <span className="text-2xl font-light text-muted-foreground">on</span>
                                <span className="px-3 py-1 bg-muted text-foreground rounded-sm font-mono font-bold">
                                    {selectedSlot?.config.label}
                                </span>
                            </div>

                            {/* Dynamic Builder Blocks */}
                            <AnimatePresence mode="popLayout">

                                {/* ID Input for Single Record Ops */}
                                {['getById', 'update', 'delete'].includes(selectedOpId) && (
                                    <Block title="Target Record" icon={Search}>
                                        <div className="flex items-center gap-4">
                                            <label className="text-sm font-medium text-muted-foreground">Record ID</label>
                                            <input
                                                type="number"
                                                value={recordId}
                                                onChange={e => setRecordId(Number(e.target.value))}
                                                className="h-10 px-3 bg-background border border-border rounded-sm font-mono w-32"
                                            />
                                        </div>
                                    </Block>
                                )}

                                {/* Search & Pagination for List/Query */}
                                {['list', 'advancedQuery'].includes(selectedOpId) && (
                                    <Block title="Search & Pagination" icon={Settings2}>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-xs font-medium text-muted-foreground">Search Query</label>
                                                <input
                                                    type="text"
                                                    value={search}
                                                    onChange={e => setSearch(e.target.value)}
                                                    placeholder="Full text search..."
                                                    className="w-full h-10 px-3 bg-background border border-border rounded-sm text-sm"
                                                />
                                            </div>
                                            <div className="flex gap-4">
                                                <div className="space-y-2 flex-1">
                                                    <label className="text-xs font-medium text-muted-foreground">Page</label>
                                                    <input
                                                        type="number"
                                                        value={page}
                                                        onChange={e => setPage(Number(e.target.value))}
                                                        className="w-full h-10 px-3 bg-background border border-border rounded-sm text-sm"
                                                    />
                                                </div>
                                                <div className="space-y-2 flex-1">
                                                    <label className="text-xs font-medium text-muted-foreground">Size</label>
                                                    <input
                                                        type="number"
                                                        value={pageSize}
                                                        onChange={e => setPageSize(Number(e.target.value))}
                                                        className="w-full h-10 px-3 bg-background border border-border rounded-sm text-sm"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </Block>
                                )}

                                {/* Conditions Builder */}
                                {['advancedQuery', 'aggregate', 'groupBy', 'bulkUpdate'].includes(selectedOpId) && (
                                    <Block title="Filter Conditions" icon={Filter}>
                                        <div className="space-y-3">
                                            {conditions.map((c, idx) => (
                                                <div key={c.id} className="flex items-center gap-2">
                                                    <div className="w-8 text-center text-xs font-bold text-muted-foreground">
                                                        {idx === 0 ? 'WHERE' : logic}
                                                    </div>
                                                    <input
                                                        value={c.field}
                                                        onChange={e => setConditions(prev => prev.map(x => x.id === c.id ? { ...x, field: e.target.value } : x))}
                                                        placeholder="field"
                                                        className="flex-1 h-9 px-3 bg-background border border-border rounded-sm text-sm font-mono"
                                                    />
                                                    <select
                                                        value={c.op}
                                                        onChange={e => setConditions(prev => prev.map(x => x.id === c.id ? { ...x, op: e.target.value as ConditionOp } : x))}
                                                        className="h-9 px-2 bg-background border border-border rounded-sm text-sm font-mono max-w-[140px]"
                                                    >
                                                        {(Object.keys(CONDITION_LABELS) as ConditionOp[]).map(op => (
                                                            <option key={op} value={op}>
                                                                {CONDITION_LABELS[op]}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    {c.op === 'between' ? (
                                                        <div className="flex-1 flex gap-2">
                                                            <input
                                                                value={(() => {
                                                                    try {
                                                                        const parsed = JSON.parse(c.value);
                                                                        return Array.isArray(parsed) ? parsed[0] : c.value;
                                                                    } catch { return ''; }
                                                                })()}
                                                                onChange={e => {
                                                                    const val1 = e.target.value;
                                                                    let val2 = '';
                                                                    try {
                                                                        const parsed = JSON.parse(c.value);
                                                                        if (Array.isArray(parsed)) val2 = parsed[1] || '';
                                                                    } catch { }
                                                                    setConditions(prev => prev.map(x => x.id === c.id ? { ...x, value: JSON.stringify([val1, val2]) } : x));
                                                                }}
                                                                placeholder="Min"
                                                                className="flex-1 h-9 px-3 bg-background border border-border rounded-sm text-sm font-mono"
                                                            />
                                                            <input
                                                                value={(() => {
                                                                    try {
                                                                        const parsed = JSON.parse(c.value);
                                                                        return Array.isArray(parsed) ? parsed[1] : '';
                                                                    } catch { return ''; }
                                                                })()}
                                                                onChange={e => {
                                                                    let val1 = '';
                                                                    try {
                                                                        const parsed = JSON.parse(c.value);
                                                                        if (Array.isArray(parsed)) val1 = parsed[0] || '';
                                                                    } catch { }
                                                                    const val2 = e.target.value;
                                                                    setConditions(prev => prev.map(x => x.id === c.id ? { ...x, value: JSON.stringify([val1, val2]) } : x));
                                                                }}
                                                                placeholder="Max"
                                                                className="flex-1 h-9 px-3 bg-background border border-border rounded-sm text-sm font-mono"
                                                            />
                                                        </div>
                                                    ) : (
                                                        <input
                                                            value={c.value}
                                                            onChange={e => setConditions(prev => prev.map(x => x.id === c.id ? { ...x, value: e.target.value } : x))}
                                                            placeholder="value"
                                                            className="flex-1 h-9 px-3 bg-background border border-border rounded-sm text-sm font-mono"
                                                        />
                                                    )}
                                                    <button onClick={() => setConditions(prev => prev.filter(x => x.id !== c.id))} className="p-2 hover:bg-muted rounded-sm">
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            ))}

                                            <div className="flex items-center gap-2 pt-2">
                                                <button
                                                    onClick={() => setConditions(prev => [...prev, { id: makeId('c'), field: '', op: 'eq', value: '' }])}
                                                    className="text-xs flex items-center gap-1 px-3 py-1.5 bg-primary/10 text-primary rounded-sm hover:bg-primary/20 transition-colors"
                                                >
                                                    <Plus size={12} /> Add Condition
                                                </button>
                                                {conditions.length > 1 && (
                                                    <select
                                                        value={logic}
                                                        onChange={e => setLogic(e.target.value as LogicOp)}
                                                        className="text-xs bg-transparent border-none text-muted-foreground focus:ring-0 cursor-pointer"
                                                    >
                                                        <option value="AND">Match ALL (AND)</option>
                                                        <option value="OR">Match ANY (OR)</option>
                                                    </select>
                                                )}
                                            </div>
                                        </div>
                                    </Block>
                                )}

                                {/* Sorting Builder */}
                                {['advancedQuery'].includes(selectedOpId) && (
                                    <Block title="Sorting" icon={ArrowUpDown}>
                                        <div className="space-y-3">
                                            {sorts.map(s => (
                                                <div key={s.id} className="flex items-center gap-2">
                                                    <input
                                                        value={s.field}
                                                        onChange={e => setSorts(prev => prev.map(x => x.id === s.id ? { ...x, field: e.target.value } : x))}
                                                        placeholder="field"
                                                        className="flex-1 h-9 px-3 bg-background border border-border rounded-sm text-sm font-mono"
                                                    />
                                                    <select
                                                        value={s.dir}
                                                        onChange={e => setSorts(prev => prev.map(x => x.id === s.id ? { ...x, dir: e.target.value as any } : x))}
                                                        className="h-9 px-2 bg-background border border-border rounded-sm text-sm font-mono"
                                                    >
                                                        <option value="asc">Ascending</option>
                                                        <option value="desc">Descending</option>
                                                    </select>
                                                    <button onClick={() => setSorts(prev => prev.filter(x => x.id !== s.id))} className="p-2 hover:bg-muted rounded-sm">
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            ))}
                                            <button
                                                onClick={() => setSorts(prev => [...prev, { id: makeId('s'), field: 'created_at', dir: 'desc' }])}
                                                className="text-xs flex items-center gap-1 px-3 py-1.5 bg-muted text-foreground rounded-sm hover:bg-muted/80 transition-colors"
                                            >
                                                <Plus size={12} /> Add Sort
                                            </button>
                                        </div>
                                    </Block>
                                )}

                                {/* Data Builder (Create/Update) */}
                                {['create', 'update'].includes(selectedOpId) && (
                                    <Block title="Data Payload" icon={Database}>
                                        <div className="space-y-3">
                                            {dataPairs.map(d => (
                                                <div key={d.id} className="flex items-center gap-2">
                                                    <input
                                                        value={d.key}
                                                        onChange={e => setDataPairs(prev => prev.map(x => x.id === d.id ? { ...x, key: e.target.value } : x))}
                                                        placeholder="key"
                                                        className="w-1/3 h-9 px-3 bg-background border border-border rounded-sm text-sm font-mono"
                                                    />
                                                    <input
                                                        value={d.value}
                                                        onChange={e => setDataPairs(prev => prev.map(x => x.id === d.id ? { ...x, value: e.target.value } : x))}
                                                        placeholder="value"
                                                        className="flex-1 h-9 px-3 bg-background border border-border rounded-sm text-sm font-mono"
                                                    />
                                                    <button onClick={() => setDataPairs(prev => prev.filter(x => x.id !== d.id))} className="p-2 hover:bg-muted rounded-sm">
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            ))}
                                            <button
                                                onClick={() => setDataPairs(prev => [...prev, { id: makeId('d'), key: '', value: '' }])}
                                                className="text-xs flex items-center gap-1 px-3 py-1.5 bg-muted text-foreground rounded-sm hover:bg-muted/80 transition-colors"
                                            >
                                                <Plus size={12} /> Add Field
                                            </button>
                                        </div>
                                    </Block>
                                )}

                                {/* Analytics Config */}
                                {selectedOpId === 'aggregate' && (
                                    <Block title="Aggregation Config" icon={BarChart3}>
                                        <div className="flex gap-4">
                                            <select
                                                value={aggFn}
                                                onChange={e => setAggFn(e.target.value)}
                                                className="h-10 px-3 bg-background border border-border rounded-sm text-sm flex-1"
                                            >
                                                {['count', 'sum', 'avg', 'min', 'max'].map(f => <option key={f} value={f}>{f.toUpperCase()}</option>)}
                                            </select>
                                            <input
                                                value={aggField}
                                                onChange={e => setAggField(e.target.value)}
                                                placeholder="Field to aggregate"
                                                className="h-10 px-3 bg-background border border-border rounded-sm text-sm flex-1"
                                            />
                                        </div>
                                    </Block>
                                )}

                                {/* Group By Config */}
                                {selectedOpId === 'groupBy' && (
                                    <Block title="Group By Config" icon={BarChart3}>
                                        <div className="flex gap-4">
                                            <input
                                                value={groupByField}
                                                onChange={e => setGroupByField(e.target.value)}
                                                placeholder="Field to group by"
                                                className="h-10 px-3 bg-background border border-border rounded-sm text-sm flex-1"
                                            />
                                        </div>
                                    </Block>
                                )}

                            </AnimatePresence>
                        </div>
                    </div>

                    {/* Bottom Action Bar */}
                    <div className="p-4 border-t border-border bg-card flex items-center justify-between">
                        <div className="flex gap-2">
                            <button
                                onClick={() => setActiveTab('builder')}
                                className={`px-4 py-2 rounded-sm text-sm font-medium transition-colors ${activeTab === 'builder' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                Preview
                            </button>
                            <button
                                onClick={() => setActiveTab('code')}
                                className={`px-4 py-2 rounded-sm text-sm font-medium transition-colors ${activeTab === 'code' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                Integration Code
                            </button>
                            <button
                                onClick={() => setActiveTab('settings')}
                                className={`px-4 py-2 rounded-sm text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'settings' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                {(!currentApiKey) && <div className="w-2 h-2 rounded-sm bg-red-500" />}
                                Settings
                            </button>
                        </div>
                        <button
                            onClick={execute}
                            disabled={loading}
                            className="px-6 py-2 bg-primary text-primary-foreground rounded-sm font-bold text-sm flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
                        >
                            {loading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                            Run Query
                        </button>
                    </div>
                </div>

                {/* Right Panel - Results & Code */}
                <div className="w-[400px] border-l border-border bg-card flex flex-col">
                    {activeTab === 'builder' ? (
                        <>
                            <div className="p-4 border-b border-border">
                                <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Response</h3>
                                <div className="flex gap-4 mt-2 text-xs font-mono text-muted-foreground">
                                    <span>Status: <span className={status === 200 ? 'text-emerald-500' : 'text-foreground'}>{status ?? '-'}</span></span>
                                    <span>Time: <span className="text-foreground">{duration ? `${duration}ms` : '-'}</span></span>
                                </div>
                            </div>
                            <div className="flex-1 overflow-auto p-4 custom-scrollbar bg-muted/5">
                                {response ? (
                                    <pre className="text-[10px] font-mono leading-relaxed whitespace-pre-wrap break-all text-muted-foreground">
                                        <code dangerouslySetInnerHTML={{ __html: highlightJSON(JSON.stringify(response, null, 2)) }} />
                                    </pre>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground/30">
                                        <Zap size={48} />
                                        <span className="mt-4 text-xs font-mono uppercase tracking-widest">Ready to Run</span>
                                    </div>
                                )}
                            </div>
                        </>
                    ) : activeTab === 'code' ? (
                        <div className="flex-1 overflow-auto p-4 space-y-6">
                            <div>
                                <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
                                    <Terminal size={16} /> JavaScript / TypeScript
                                </h3>
                                <CodeBlock code={codeSnippets.js} language="javascript" />
                            </div>
                            <div>
                                <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
                                    <Code size={16} /> PHP (cURL)
                                </h3>
                                <CodeBlock code={codeSnippets.php} language="php" />
                            </div>
                        </div>
                    ) : (
                        <div className="p-6 space-y-6">
                            <div>
                                <h3 className="font-bold text-sm mb-4 flex items-center gap-2">
                                    <Settings2 size={16} /> Configuration
                                </h3>
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-muted-foreground">API Key</label>
                                    <input
                                        type="password"
                                        value={currentApiKey}
                                        onChange={e => setCurrentApiKey(e.target.value)}
                                        placeholder="Enter API Key..."
                                        className="w-full h-10 px-3 bg-background border border-border rounded-sm text-sm font-mono"
                                    />
                                    {!currentApiKey && (
                                        <div className="text-[10px] text-red-500 flex items-center gap-1">
                                            <Zap size={10} /> API Key is required for most operations
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
