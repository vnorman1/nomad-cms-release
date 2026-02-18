// Types and constants for API Playground

export const METHOD_THEMES = {
    GET: { color: 'emerald', bg: 'bg-emerald-500/10', text: 'text-emerald-500', border: 'border-emerald-500/20' },
    POST: { color: 'blue', bg: 'bg-blue-500/10', text: 'text-blue-500', border: 'border-blue-500/20' },
    PUT: { color: 'amber', bg: 'bg-amber-500/10', text: 'text-amber-500', border: 'border-amber-500/20' },
    DELETE: { color: 'red', bg: 'bg-red-500/10', text: 'text-red-500', border: 'border-red-500/20' },
    PATCH: { color: 'purple', bg: 'bg-purple-500/10', text: 'text-purple-500', border: 'border-purple-500/20' }
} as const;

export type HttpMethod = keyof typeof METHOD_THEMES;

export interface EndpointDef {
    id: string;
    name: string;
    method: HttpMethod;
    path: string;
    description: string;
    category: 'content' | 'media' | 'auth' | 'admin';
    requiresAuth: boolean;
    slot?: string;
    slotConfig?: import('@/config/admin.config').SlotConfig;
    queryParams?: Record<string, string>;
    bodyTemplate?: object;
}

export interface PlaygroundProps {
    apiKey?: string;
    baseUrl?: string;
    onClose?: () => void;
}

export interface PlaygroundState {
    selectedEndpoint: EndpointDef;
    apiKey: string;
    queryParams: Record<string, string>;
    formData: Record<string, unknown>;
    rawBody: string;
    useRawBody: boolean;
    searchQuery: string;
}

export interface RequestState {
    loading: boolean;
    response: unknown;
    status: number | null;
    duration: number | null;
    error: string | null;
}
