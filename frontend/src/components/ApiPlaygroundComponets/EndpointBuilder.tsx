// Custom Endpoint Builder - Clean Vercel-inspired design

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, X, Save, Trash2, Wand2, Settings } from 'lucide-react';
import { CustomEndpoint } from './customTypes';
import { HttpMethod, METHOD_THEMES } from './types';

interface EndpointBuilderProps {
    onSave: (endpoint: CustomEndpoint) => void;
    onClose: () => void;
    editEndpoint?: CustomEndpoint;
}

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

export function EndpointBuilder({ onSave, onClose, editEndpoint }: EndpointBuilderProps) {
    const [name, setName] = useState(editEndpoint?.name || '');
    const [method, setMethod] = useState<HttpMethod>(editEndpoint?.method || 'GET');
    const [path, setPath] = useState(editEndpoint?.path || '/api/');
    const [description, setDescription] = useState(editEndpoint?.description || '');
    const [headers, setHeaders] = useState<Array<{ key: string; value: string }>>(
        editEndpoint?.headers 
            ? Object.entries(editEndpoint.headers).map(([key, value]) => ({ key, value }))
            : [{ key: 'Content-Type', value: 'application/json' }]
    );
    const [queryParams, setQueryParams] = useState<Array<{ key: string; value: string }>>(
        editEndpoint?.queryParams
            ? Object.entries(editEndpoint.queryParams).map(([key, value]) => ({ key, value }))
            : []
    );
    const [bodyTemplate, setBodyTemplate] = useState(editEndpoint?.bodyTemplate || '{\n  \n}');

    const addHeader = () => setHeaders([...headers, { key: '', value: '' }]);
    const removeHeader = (index: number) => setHeaders(headers.filter((_, i) => i !== index));
    const updateHeader = (index: number, field: 'key' | 'value', value: string) => {
        const newHeaders = [...headers];
        newHeaders[index][field] = value;
        setHeaders(newHeaders);
    };

    const addQueryParam = () => setQueryParams([...queryParams, { key: '', value: '' }]);
    const removeQueryParam = (index: number) => setQueryParams(queryParams.filter((_, i) => i !== index));
    const updateQueryParam = (index: number, field: 'key' | 'value', value: string) => {
        const newParams = [...queryParams];
        newParams[index][field] = value;
        setQueryParams(newParams);
    };

    const handleSave = () => {
        const endpoint: CustomEndpoint = {
            id: editEndpoint?.id || `custom-${Date.now()}`,
            name: name || 'Untitled Endpoint',
            method,
            path,
            description,
            headers: headers.reduce((acc, h) => h.key ? { ...acc, [h.key]: h.value } : acc, {}),
            queryParams: queryParams.reduce((acc, p) => p.key ? { ...acc, [p.key]: p.value } : acc, {}),
            bodyTemplate,
            createdAt: editEndpoint?.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        onSave(endpoint);
        onClose();
    };

    const generateSampleBody = () => {
        const sample = {
            id: 1,
            name: 'Example',
            data: {
                field1: 'value1',
                field2: 'value2'
            },
            timestamp: new Date().toISOString()
        };
        setBodyTemplate(JSON.stringify(sample, null, 2));
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, y: 10 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 10 }}
                className="w-full max-w-2xl max-h-[85vh] bg-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                            <Settings size={16} />
                        </div>
                        <div>
                            <h3 className="font-semibold">{editEndpoint ? 'Edit Endpoint' : 'New Endpoint'}</h3>
                            <p className="text-xs text-muted-foreground">Create a custom API endpoint</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg transition-colors">
                        <X size={18} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Basic Info */}
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-muted-foreground">Name</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="My API Endpoint"
                                    className="w-full h-10 px-3 bg-muted/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                />
                            </div>
                            
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-muted-foreground">Method</label>
                                <div className="flex gap-1">
                                    {METHODS.map((m) => {
                                        const mTheme = METHOD_THEMES[m];
                                        const isSelected = method === m;
                                        return (
                                            <button
                                                key={m}
                                                onClick={() => setMethod(m)}
                                                className={`flex-1 py-2 text-xs font-bold font-mono rounded-lg transition-all ${
                                                    isSelected 
                                                        ? `${mTheme.bg} ${mTheme.text}`
                                                        : 'bg-muted/30 text-muted-foreground hover:text-foreground'
                                                }`}
                                            >
                                                {m}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground">Path</label>
                            <input
                                type="text"
                                value={path}
                                onChange={(e) => setPath(e.target.value)}
                                placeholder="/api/your-endpoint"
                                className="w-full h-10 px-3 bg-muted/30 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground">Description</label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Describe what this endpoint does..."
                                className="w-full h-20 p-3 bg-muted/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                            />
                        </div>
                    </div>

                    {/* Headers */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-medium text-muted-foreground">Headers</label>
                            <button
                                onClick={addHeader}
                                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                            >
                                <Plus size={12} /> Add
                            </button>
                        </div>
                        
                        <div className="space-y-2">
                            {headers.map((header, index) => (
                                <div key={index} className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={header.key}
                                        onChange={(e) => updateHeader(index, 'key', e.target.value)}
                                        placeholder="Key"
                                        className="flex-1 h-9 px-3 bg-muted/30 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                                    />
                                    <input
                                        type="text"
                                        value={header.value}
                                        onChange={(e) => updateHeader(index, 'value', e.target.value)}
                                        placeholder="Value"
                                        className="flex-1 h-9 px-3 bg-muted/30 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                                    />
                                    <button
                                        onClick={() => removeHeader(index)}
                                        className="p-2 text-muted-foreground hover:text-destructive rounded-lg hover:bg-destructive/10 transition-colors"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Query Parameters */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-medium text-muted-foreground">Query Parameters</label>
                            <button
                                onClick={addQueryParam}
                                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                            >
                                <Plus size={12} /> Add
                            </button>
                        </div>
                        
                        <div className="space-y-2">
                            {queryParams.length === 0 && (
                                <p className="text-xs text-muted-foreground/60 py-2">No query parameters</p>
                            )}
                            {queryParams.map((param, index) => (
                                <div key={index} className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={param.key}
                                        onChange={(e) => updateQueryParam(index, 'key', e.target.value)}
                                        placeholder="Key"
                                        className="flex-1 h-9 px-3 bg-muted/30 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                                    />
                                    <input
                                        type="text"
                                        value={param.value}
                                        onChange={(e) => updateQueryParam(index, 'value', e.target.value)}
                                        placeholder="Value"
                                        className="flex-1 h-9 px-3 bg-muted/30 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                                    />
                                    <button
                                        onClick={() => removeQueryParam(index)}
                                        className="p-2 text-muted-foreground hover:text-destructive rounded-lg hover:bg-destructive/10 transition-colors"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Body Template */}
                    {['POST', 'PUT', 'PATCH'].includes(method) && (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-medium text-muted-foreground">Request Body</label>
                                <button
                                    onClick={generateSampleBody}
                                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                                >
                                    <Wand2 size={12} /> Generate Sample
                                </button>
                            </div>
                            
                            <textarea
                                value={bodyTemplate}
                                onChange={(e) => setBodyTemplate(e.target.value)}
                                placeholder="{}"
                                className="w-full h-40 p-3 bg-muted/30 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                                spellCheck={false}
                            />
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between p-4 border-t border-border">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-4 py-2 bg-foreground text-background text-sm font-medium rounded-lg hover:bg-foreground/90 transition-all flex items-center gap-2"
                    >
                        <Save size={14} />
                        {editEndpoint ? 'Update' : 'Create'}
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
}
