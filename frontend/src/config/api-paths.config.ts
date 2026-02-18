/**
 * NOMAD CMS - API Path Configuration
 * 
 * Centralized configuration for API URL formats.
 * Supports both path-based (RESTful) and legacy (query param) URLs.
 * 
 * @since 2.0.0
 */

/**
 * API URL format mode
 * - 'path': Use clean RESTful paths (e.g., /api/data/hero)
 * - 'legacy': Use query parameters (e.g., /api/endpoints/data.php?key=hero)
 * - 'auto': Auto-detect based on server support (default)
 */
export type ApiUrlMode = 'path' | 'legacy' | 'auto';

/**
 * Current API URL mode
 * Set to 'path' for new deployments, 'legacy' for backwards compatibility
 */
export const API_URL_MODE: ApiUrlMode = 'path';

/**
 * Base path for API requests
 */
export const API_BASE = '/api';

/**
 * Path-based URL builders
 */
export const ApiPaths = {
    // Content Data
    data: (slot: string) => `${API_BASE}/data/${encodeURIComponent(slot)}`,
    static: (slot: string) => `${API_BASE}/static/${encodeURIComponent(slot)}`,
    massive: (slot: string) => `${API_BASE}/massive/${encodeURIComponent(slot)}`,
    massiveRecord: (slot: string, id: string | number) => 
        `${API_BASE}/massive/${encodeURIComponent(slot)}/${encodeURIComponent(String(id))}`,
    
    // Schema & System
    schema: () => `${API_BASE}/schema`,
    search: () => `${API_BASE}/search`,
    sitemap: () => `${API_BASE}/sitemap`,
    versions: (slot?: string) => slot ? `${API_BASE}/versions/${encodeURIComponent(slot)}` : `${API_BASE}/versions`,
    
    // Media
    upload: () => `${API_BASE}/upload`,
    media: () => `${API_BASE}/media`,
    mediaItem: (id: string | number) => `${API_BASE}/media/${encodeURIComponent(String(id))}`,
    file: (id: string | number) => `${API_BASE}/file/${encodeURIComponent(String(id))}`,
    signedUrl: () => `${API_BASE}/signed-url`,
    
    // Auth
    login: () => `${API_BASE}/auth/login`,
    logout: () => `${API_BASE}/auth/logout`,
    refresh: () => `${API_BASE}/auth/refresh`,
    me: () => `${API_BASE}/auth/me`,
    changePassword: () => `${API_BASE}/auth/change-password`,
    register: () => `${API_BASE}/auth/register`,
    preferences: () => `${API_BASE}/auth/preferences`,
    
    // Admin
    users: () => `${API_BASE}/admin/users`,
    apiKeys: () => `${API_BASE}/admin/api-keys`,
    dashboard: () => `${API_BASE}/admin/dashboard`,
    health: () => `${API_BASE}/admin/health`,
    staticCache: () => `${API_BASE}/admin/static-cache`,
    backup: () => `${API_BASE}/admin/backup`,
    
    // AI
    aiModels: () => `${API_BASE}/ai/models`,
    aiGenerate: () => `${API_BASE}/ai/generate`,
    aiChat: () => `${API_BASE}/ai/chat`,
    aiSession: () => `${API_BASE}/ai/session`,
    aiSessions: () => `${API_BASE}/ai/sessions`,
    aiExpand: () => `${API_BASE}/ai/expand`,
    
    // Forge (Schema Builder)
    forgeMigrate: () => `${API_BASE}/forge/migrate`,
    forgeValidate: () => `${API_BASE}/forge/validate`,
    forgeBackup: () => `${API_BASE}/forge/backup`,
    forgePreview: () => `${API_BASE}/forge/preview`,
    
    // System
    systemInfo: () => `${API_BASE}/system/info`,
    systemLogs: () => `${API_BASE}/system/logs`,
    batch: () => `${API_BASE}/batch`,
    webhook: () => `${API_BASE}/webhook`,
    install: () => `${API_BASE}/install`,
} as const;

/**
 * Legacy URL builders (for backwards compatibility)
 */
export const LegacyPaths = {
    data: (slot: string) => `/api/endpoints/data.php?key=${encodeURIComponent(slot)}`,
    static: (slot: string) => `/api/endpoints/static-serve.php?slot=${encodeURIComponent(slot)}`,
    massive: (slot: string) => `/api/endpoints/massive.php?slot=${encodeURIComponent(slot)}`,
    schema: () => `/api/endpoints/schema.php`,
    search: () => `/api/endpoints/search.php`,
    upload: () => `/api/endpoints/upload.php`,
    media: () => `/api/endpoints/media.php`,
    auth: (action: string) => `/api/endpoints/auth/${action}.php`,
    admin: (action: string) => `/api/endpoints/admin/${action}.php`,
} as const;

/**
 * Get the appropriate URL based on current mode
 */
export function getApiUrl(
    pathBuilder: () => string,
    legacyBuilder?: () => string
): string {
    if (API_URL_MODE === 'legacy' && legacyBuilder) {
        return legacyBuilder();
    }
    return pathBuilder();
}

/**
 * Endpoint path configuration for API Playground
 * Maps endpoint types to their path-based URLs
 */
export interface EndpointPathConfig {
    /** Path-based URL pattern (e.g., '/data/{slot}') */
    pathPattern: string;
    /** Legacy URL (e.g., '/endpoints/data.php') */
    legacyPath: string;
    /** Query param name for slot (legacy mode) */
    slotParam?: string;
}

export const ENDPOINT_PATHS: Record<string, EndpointPathConfig> = {
    data: { pathPattern: '/data/{slot}', legacyPath: '/endpoints/data.php', slotParam: 'key' },
    static: { pathPattern: '/static/{slot}', legacyPath: '/endpoints/static-serve.php', slotParam: 'slot' },
    massive: { pathPattern: '/massive/{slot}', legacyPath: '/endpoints/massive.php', slotParam: 'slot' },
    schema: { pathPattern: '/schema', legacyPath: '/endpoints/schema.php' },
    search: { pathPattern: '/search', legacyPath: '/endpoints/search.php' },
    upload: { pathPattern: '/upload', legacyPath: '/endpoints/upload.php' },
    media: { pathPattern: '/media', legacyPath: '/endpoints/media.php' },
    versions: { pathPattern: '/versions/{slot}', legacyPath: '/endpoints/versions.php', slotParam: 'slot' },
};

/**
 * Build full URL for an endpoint
 * 
 * @param endpointType - Type of endpoint (data, static, massive, etc.)
 * @param slot - Optional slot name for content endpoints
 * @param queryParams - Additional query parameters
 * @param mode - Override URL mode
 */
export function buildEndpointUrl(
    endpointType: keyof typeof ENDPOINT_PATHS,
    slot?: string,
    queryParams?: Record<string, string>,
    mode: ApiUrlMode = API_URL_MODE
): string {
    const config = ENDPOINT_PATHS[endpointType];
    if (!config) {
        throw new Error(`Unknown endpoint type: ${endpointType}`);
    }

    let url: string;
    const params = new URLSearchParams();

    if (mode === 'path') {
        // Path-based URL
        url = API_BASE + (slot 
            ? config.pathPattern.replace('{slot}', encodeURIComponent(slot))
            : config.pathPattern.replace('/{slot}', ''));
        
        // Add query params
        if (queryParams) {
            Object.entries(queryParams).forEach(([key, value]) => {
                if (value) params.append(key, value);
            });
        }
    } else {
        // Legacy URL with query params
        url = API_BASE + config.legacyPath;
        
        // Add slot as query param
        if (slot && config.slotParam) {
            params.append(config.slotParam, slot);
        }
        
        // Add additional query params
        if (queryParams) {
            Object.entries(queryParams).forEach(([key, value]) => {
                if (value) params.append(key, value);
            });
        }
    }

    const queryString = params.toString();
    return queryString ? `${url}?${queryString}` : url;
}
