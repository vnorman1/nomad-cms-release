// Request Builder Component for API Playground

import { Wand2 } from 'lucide-react';
import { EndpointDef } from './types';
import { DynamicFieldInput } from './FieldComponents';

type TabType = 'builder' | 'body' | 'headers' | 'docs';

interface RequestBuilderProps {
    selectedEndpoint: EndpointDef;
    activeTab: TabType;
    formData: Record<string, unknown>;
    rawBody: string;
    useRawBody: boolean;
    apiKey: string;
    queryParams: Record<string, string>;
    onTabChange: (tab: TabType) => void;
    onFormDataChange: (field: string, value: unknown) => void;
    onRawBodyChange: (value: string) => void;
    onUseRawBodyChange: (value: boolean) => void;
    onApiKeyChange: (value: string) => void;
    onQueryParamChange: (key: string, value: string) => void;
}

export function RequestBuilder({
    selectedEndpoint,
    activeTab,
    formData,
    rawBody,
    useRawBody,
    apiKey,
    queryParams,
    onTabChange,
    onFormDataChange,
    onRawBodyChange,
    onUseRawBodyChange,
    onApiKeyChange,
    onQueryParamChange
}: RequestBuilderProps) {
    const tabs: TabType[] = ['builder', 'body', 'headers', 'docs'];

    return (
        <>
            {/* Tabs */}
            <div className="flex border-b border-border">
                {tabs.map(tab => {
                    const isActive = activeTab === tab;
                    return (
                        <button
                            key={tab}
                            onClick={() => onTabChange(tab)}
                            className={`px-6 py-3 text-xs font-bold uppercase tracking-widest transition-all border-b-2 ${
                                isActive
                                    ? 'border-foreground text-foreground'
                                    : 'border-transparent text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            {tab}
                        </button>
                    );
                })}
            </div>

            {/* Tab Content */}
            <div className="flex-1 bg-muted/5 p-6 overflow-y-auto">
                {/* BUILDER TAB */}
                {activeTab === 'builder' && (
                    <BuilderTab
                        selectedEndpoint={selectedEndpoint}
                        formData={formData}
                        rawBody={rawBody}
                        useRawBody={useRawBody}
                        onFormDataChange={onFormDataChange}
                        onRawBodyChange={onRawBodyChange}
                        onUseRawBodyChange={onUseRawBodyChange}
                    />
                )}

                {/* BODY TAB */}
                {activeTab === 'body' && (
                    <BodyTab
                        rawBody={rawBody}
                        onRawBodyChange={onRawBodyChange}
                    />
                )}

                {/* HEADERS TAB */}
                {activeTab === 'headers' && (
                    <HeadersTab
                        apiKey={apiKey}
                        queryParams={queryParams}
                        onApiKeyChange={onApiKeyChange}
                        onQueryParamChange={onQueryParamChange}
                    />
                )}

                {/* DOCS TAB */}
                {activeTab === 'docs' && (
                    <DocsTab selectedEndpoint={selectedEndpoint} />
                )}
            </div>
        </>
    );
}

// =============================================================================
// Sub-components for each tab
// =============================================================================

interface BuilderTabProps {
    selectedEndpoint: EndpointDef;
    formData: Record<string, unknown>;
    rawBody: string;
    useRawBody: boolean;
    onFormDataChange: (field: string, value: unknown) => void;
    onRawBodyChange: (value: string) => void;
    onUseRawBodyChange: (value: boolean) => void;
}

function BuilderTab({
    selectedEndpoint,
    formData,
    rawBody,
    useRawBody,
    onFormDataChange,
    onRawBodyChange,
    onUseRawBodyChange
}: BuilderTabProps) {
    return (
        <div className="max-w-3xl">
            {selectedEndpoint.slotConfig ? (
                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                            Dynamic Fields
                        </h3>
                        <div className="flex gap-2">
                            <button
                                onClick={() => onUseRawBodyChange(false)}
                                className={`px-3 py-1 text-[10px] font-mono border ${
                                    !useRawBody
                                        ? 'bg-foreground text-background border-foreground'
                                        : 'text-muted-foreground border-border'
                                }`}
                            >
                                FORM
                            </button>
                            <button
                                onClick={() => onUseRawBodyChange(true)}
                                className={`px-3 py-1 text-[10px] font-mono border ${
                                    useRawBody
                                        ? 'bg-foreground text-background border-foreground'
                                        : 'text-muted-foreground border-border'
                                }`}
                            >
                                RAW
                            </button>
                        </div>
                    </div>

                    {!useRawBody ? (
                        <div className="grid grid-cols-2 gap-x-8 gap-y-6">
                            {selectedEndpoint.slotConfig.fields.filter(f => !f.hidden).map(field => (
                                <div
                                    key={field.id}
                                    className={`${
                                        ['textarea', 'richtext', 'gallery'].includes(field.type)
                                            ? 'col-span-2'
                                            : ''
                                    } space-y-2`}
                                >
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                            {field.label} {field.required && <span className="text-red-500">*</span>}
                                        </label>
                                        <span className="text-[9px] font-mono text-muted-foreground/50 lowercase">
                                            {field.type}
                                        </span>
                                    </div>
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
                            className="w-full h-96 bg-background border border-border p-4 font-mono text-xs text-foreground focus:outline-none focus:border-foreground"
                        />
                    )}
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center py-20 opacity-50">
                    <Wand2 size={32} className="mb-4 text-muted-foreground" />
                    <p className="text-sm font-mono tracking-widest">NO BUILDER AVAILABLE</p>
                </div>
            )}
        </div>
    );
}

interface BodyTabProps {
    rawBody: string;
    onRawBodyChange: (value: string) => void;
}

function BodyTab({ rawBody, onRawBodyChange }: BodyTabProps) {
    const prettify = () => {
        try {
            onRawBodyChange(JSON.stringify(JSON.parse(rawBody), null, 2));
        } catch {
            // Invalid JSON, ignore
        }
    };

    return (
        <div className="h-full flex flex-col">
            <div className="flex justify-end mb-2">
                <button
                    onClick={prettify}
                    className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground"
                >
                    Prettify
                </button>
            </div>
            <textarea
                value={rawBody}
                onChange={e => onRawBodyChange(e.target.value)}
                placeholder="{}"
                className="flex-1 bg-background border border-border p-4 font-mono text-xs text-foreground focus:outline-none focus:border-foreground resize-none"
                spellCheck={false}
            />
        </div>
    );
}

interface HeadersTabProps {
    apiKey: string;
    queryParams: Record<string, string>;
    onApiKeyChange: (value: string) => void;
    onQueryParamChange: (key: string, value: string) => void;
}

function HeadersTab({ apiKey, queryParams, onApiKeyChange, onQueryParamChange }: HeadersTabProps) {
    return (
        <div className="space-y-8 max-w-2xl">
            <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Authentication
                </h3>
                <div className="space-y-2">
                    <label className="text-[10px] font-mono text-muted-foreground">X-API-KEY</label>
                    <input
                        type="text"
                        value={apiKey}
                        onChange={e => onApiKeyChange(e.target.value)}
                        className="w-full bg-transparent border-b border-border py-2 px-0 text-sm font-mono text-foreground focus:outline-none focus:border-foreground transition-all"
                        placeholder="Enter API Key"
                    />
                </div>
            </div>

            <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Query Parameters
                </h3>
                {Object.entries(queryParams).length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">No parameters defined.</p>
                ) : (
                    <div className="space-y-3">
                        {Object.entries(queryParams).map(([k, v]) => (
                            <div key={k} className="flex items-center gap-4">
                                <div className="w-1/3 border-b border-border py-2 text-xs font-mono text-muted-foreground">
                                    {k}
                                </div>
                                <input
                                    value={v}
                                    onChange={e => onQueryParamChange(k, e.target.value)}
                                    className="flex-1 bg-transparent border-b border-border py-2 text-xs font-mono text-foreground focus:outline-none focus:border-foreground"
                                />
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

interface DocsTabProps {
    selectedEndpoint: EndpointDef;
}

function DocsTab({ selectedEndpoint }: DocsTabProps) {
    return (
        <div className="space-y-8 max-w-2xl">
            <div className="p-6 border border-border bg-background">
                <h3 className="text-lg font-bold mb-2">{selectedEndpoint.name}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                    {selectedEndpoint.description}
                </p>
            </div>

            {selectedEndpoint.slotConfig && (
                <div>
                    <h4 className="text-xs font-bold uppercase tracking-widest mb-4">Schema Definition</h4>
                    <div className="border border-border">
                        {selectedEndpoint.slotConfig.fields.map(f => (
                            <div
                                key={f.id}
                                className="grid grid-cols-[120px_1fr] gap-4 p-3 border-b border-border last:border-0 text-xs"
                            >
                                <div className="font-mono text-foreground font-medium">{f.id}</div>
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[9px] uppercase tracking-wider bg-muted text-muted-foreground px-1.5 py-0.5">
                                            {f.type}
                                        </span>
                                        {f.required && (
                                            <span className="text-[9px] uppercase tracking-wider text-red-500">
                                                Required
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-muted-foreground">{f.helpText || f.label}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
