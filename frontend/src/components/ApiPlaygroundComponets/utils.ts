// Utility functions for API Playground

import { ADMIN_CONFIG, SlotConfig } from '@/config/admin.config';
import { API_URL_MODE } from '@/config/api-paths.config';
import { EndpointDef } from './types';

/**
 * Check if using path-based URLs
 */
const usePathBasedUrls = () => API_URL_MODE === 'path';

/**
 * Get endpoint path based on URL mode
 */
function getEndpointPath(pathBased: string, legacy: string): string {
    return usePathBasedUrls() ? pathBased : legacy;
}

/**
 * Generate body template from slot configuration
 */
export function generateBodyTemplate(slotConfig: SlotConfig): object {
    const data: Record<string, unknown> = {};
    slotConfig.fields.forEach(field => {
        if (field.hidden) return;
        switch (field.type) {
            case 'text':
            case 'textarea':
            case 'richtext':
            case 'email':
            case 'url':
                data[field.id] = field.placeholder || field.defaultValue || `Example ${field.label}`;
                break;
            case 'number':
                data[field.id] = field.defaultValue || 0;
                break;
            case 'boolean':
                data[field.id] = field.defaultValue ?? false;
                break;
            case 'select':
                data[field.id] = field.options?.[0]?.value || '';
                break;
            case 'multiselect':
                data[field.id] = field.options?.slice(0, 2).map(o => o.value) || [];
                break;
            case 'image':
            case 'gif':
                data[field.id] = '/uploads/example.jpg';
                break;
            case 'gallery':
                data[field.id] = ['/uploads/img1.jpg', '/uploads/img2.jpg'];
                break;
            case 'color':
                data[field.id] = '#3b82f6';
                break;
            case 'date':
                data[field.id] = new Date().toISOString().split('T')[0];
                break;
            case 'datetime':
                data[field.id] = new Date().toISOString();
                break;
            case 'json':
                data[field.id] = {};
                break;
            case 'array':
                data[field.id] = [];
                break;
            default:
                data[field.id] = '';
        }
    });
    return { key: 'slot_key', data };
}

/**
 * Generate body template for massive slot (without wrapper)
 */
export function generateMassiveBodyTemplate(slotConfig: SlotConfig): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    slotConfig.fields.forEach(field => {
        if (field.hidden) return;
        switch (field.type) {
            case 'text':
            case 'textarea':
            case 'richtext':
                data[field.id] = field.placeholder || field.defaultValue || `Example ${field.label}`;
                break;
            case 'email':
                data[field.id] = 'example@email.com';
                break;
            case 'url':
                data[field.id] = 'https://example.com';
                break;
            case 'number':
                data[field.id] = field.defaultValue || 0;
                break;
            case 'boolean':
                data[field.id] = field.defaultValue ?? false;
                break;
            case 'select':
                data[field.id] = field.options?.[0]?.value || '';
                break;
            case 'multiselect':
                data[field.id] = field.options?.slice(0, 2).map(o => o.value) || [];
                break;
            case 'date':
                data[field.id] = new Date().toISOString().split('T')[0];
                break;
            case 'datetime':
                data[field.id] = new Date().toISOString();
                break;
            default:
                data[field.id] = field.defaultValue || '';
        }
    });
    return data;
}

/**
 * Generate all endpoints from ADMIN_CONFIG
 */
export function generateEndpointsFromConfig(): EndpointDef[] {
    const endpoints: EndpointDef[] = [];
    const usePaths = usePathBasedUrls();

    // Static Auth Endpoints
    const authEndpoints: EndpointDef[] = [
        {
            id: 'auth-login', name: 'Login', method: 'POST', 
            path: getEndpointPath('/auth/login', '/endpoints/auth/login.php'),
            description: 'Authenticate user with email and password', category: 'auth', requiresAuth: false,
            bodyTemplate: { email: 'user@example.com', password: '••••••••' }
        },
        {
            id: 'auth-logout', name: 'Logout', method: 'POST', 
            path: getEndpointPath('/auth/logout', '/endpoints/auth/logout.php'),
            description: 'Invalidate current session', category: 'auth', requiresAuth: true,
        },
        {
            id: 'auth-me', name: 'Get Current User', method: 'GET', 
            path: getEndpointPath('/auth/me', '/endpoints/auth/me.php'),
            description: 'Retrieve authenticated user profile', category: 'auth', requiresAuth: true,
        },
        {
            id: 'auth-refresh', name: 'Refresh Token', method: 'POST', 
            path: getEndpointPath('/auth/refresh', '/endpoints/auth/refresh.php'),
            description: 'Refresh JWT access token', category: 'auth', requiresAuth: true,
        },
        {
            id: 'auth-preferences', name: 'User Preferences', method: 'GET', 
            path: getEndpointPath('/auth/preferences', '/endpoints/auth/preferences.php'),
            description: 'Get or update user preferences', category: 'auth', requiresAuth: true,
        },
    ];

    // Static Admin Endpoints
    const adminEndpoints: EndpointDef[] = [
        {
            id: 'admin-users', name: 'List Users', method: 'GET', 
            path: getEndpointPath('/admin/users', '/endpoints/admin/users.php'),
            description: 'Get all users (admin only)', category: 'admin', requiresAuth: true,
        },
        {
            id: 'admin-api-keys', name: 'API Keys', method: 'GET', 
            path: getEndpointPath('/admin/api-keys', '/endpoints/admin/api-keys.php'),
            description: 'Manage API keys', category: 'admin', requiresAuth: true,
        },
        {
            id: 'admin-backup', name: 'Create Backup', method: 'POST', 
            path: getEndpointPath('/admin/backup', '/endpoints/admin/backup.php'),
            description: 'Create database backup', category: 'admin', requiresAuth: true,
        },
    ];

    // Media Endpoints
    const mediaEndpoints: EndpointDef[] = [
        {
            id: 'media-upload', name: 'Upload File', method: 'POST', 
            path: getEndpointPath('/upload', '/endpoints/upload.php'),
            description: 'Upload media file (image, document)', category: 'media', requiresAuth: true,
            bodyTemplate: { file: '(binary)', alt: 'Image description' }
        },
    ];

    endpoints.push(...authEndpoints, ...adminEndpoints, ...mediaEndpoints);

    // Dynamic Content Endpoints from ADMIN_CONFIG
    Object.entries(ADMIN_CONFIG).forEach(([slotKey, slotConfig]) => {
        // Path-based: /data/{slot}, Legacy: /endpoints/data.php?key={slot}
        const dataPath = usePaths ? `/data/${slotKey}` : '/endpoints/data.php';
        const staticPath = usePaths ? `/static/${slotKey}` : '/endpoints/static-serve.php';
        const massivePath = usePaths ? `/massive/${slotKey}` : '/endpoints/massive.php';

        endpoints.push({
            id: `content-get-${slotKey}`,
            name: `Get ${slotConfig.label}`,
            method: 'GET',
            path: dataPath,
            description: `Retrieve ${slotConfig.label.toLowerCase()} data`,
            category: 'content',
            requiresAuth: false,
            slot: slotKey,
            slotConfig: slotConfig,
            queryParams: usePaths ? {} : { key: slotKey }
        });

        endpoints.push({
            id: `content-post-${slotKey}`,
            name: `Update ${slotConfig.label}`,
            method: 'POST',
            path: dataPath,
            description: `Update ${slotConfig.label.toLowerCase()} data`,
            category: 'content',
            requiresAuth: true,
            slot: slotKey,
            slotConfig: slotConfig,
            bodyTemplate: generateBodyTemplate(slotConfig)
        });

        endpoints.push({
            id: `content-delete-${slotKey}`,
            name: `Delete ${slotConfig.label}`,
            method: 'DELETE',
            path: dataPath,
            description: `Remove ${slotConfig.label.toLowerCase()} data`,
            category: 'content',
            requiresAuth: true,
            slot: slotKey,
            slotConfig: slotConfig,
            queryParams: usePaths ? {} : { key: slotKey }
        });

        // MASSIVE type endpoints - separate API
        if (slotConfig.type === 'massive') {
            // List paginated
            endpoints.push({
                id: `massive-list-${slotKey}`,
                name: `List ${slotConfig.label}`,
                method: 'GET',
                path: massivePath,
                description: `Paginated list of ${slotConfig.label.toLowerCase()} records`,
                category: 'content',
                requiresAuth: true,
                slot: slotKey,
                slotConfig: slotConfig,
                queryParams: usePaths ? {
                    page: '1',
                    pageSize: '50',
                    sort: 'id',
                    dir: 'desc',
                    search: '',
                } : {
                    slot: slotKey,
                    page: '1',
                    pageSize: '50',
                    sort: 'id',
                    dir: 'desc',
                    search: '',
                }
            });

            // Get single record
            endpoints.push({
                id: `massive-get-${slotKey}`,
                name: `Get ${slotConfig.label} by ID`,
                method: 'GET',
                path: usePaths ? `/massive/${slotKey}/1` : massivePath,
                description: `Get single ${slotConfig.label.toLowerCase()} record by ID`,
                category: 'content',
                requiresAuth: true,
                slot: slotKey,
                slotConfig: slotConfig,
                queryParams: usePaths ? {} : {
                    slot: slotKey,
                    id: '1',
                }
            });

            // Get statistics
            endpoints.push({
                id: `massive-stats-${slotKey}`,
                name: `${slotConfig.label} Stats`,
                method: 'GET',
                path: massivePath,
                description: `Get statistics for ${slotConfig.label.toLowerCase()}`,
                category: 'content',
                requiresAuth: true,
                slot: slotKey,
                slotConfig: slotConfig,
                queryParams: usePaths ? { stats: '1' } : {
                    slot: slotKey,
                    stats: '1',
                }
            });

            // Export CSV
            endpoints.push({
                id: `massive-export-${slotKey}`,
                name: `Export ${slotConfig.label} CSV`,
                method: 'GET',
                path: massivePath,
                description: `Export all ${slotConfig.label.toLowerCase()} records as CSV`,
                category: 'content',
                requiresAuth: true,
                slot: slotKey,
                slotConfig: slotConfig,
                queryParams: usePaths ? { export: 'csv' } : {
                    slot: slotKey,
                    export: 'csv',
                }
            });

            // Create record
            endpoints.push({
                id: `massive-create-${slotKey}`,
                name: `Create ${slotConfig.label}`,
                method: 'POST',
                path: massivePath,
                description: `Create new ${slotConfig.label.toLowerCase()} record`,
                category: 'content',
                requiresAuth: true,
                slot: slotKey,
                slotConfig: slotConfig,
                bodyTemplate: { slot: slotKey, data: generateMassiveBodyTemplate(slotConfig) }
            });

            // Update record
            endpoints.push({
                id: `massive-update-${slotKey}`,
                name: `Update ${slotConfig.label}`,
                method: 'PUT',
                path: massivePath,
                description: `Update ${slotConfig.label.toLowerCase()} record by ID`,
                category: 'content',
                requiresAuth: true,
                slot: slotKey,
                slotConfig: slotConfig,
                bodyTemplate: { slot: slotKey, id: 1, data: generateMassiveBodyTemplate(slotConfig) }
            });

            // Delete single
            endpoints.push({
                id: `massive-delete-${slotKey}`,
                name: `Delete ${slotConfig.label}`,
                method: 'DELETE',
                path: usePaths ? `/massive/${slotKey}/1` : massivePath,
                description: `Delete ${slotConfig.label.toLowerCase()} record by ID`,
                category: 'content',
                requiresAuth: true,
                slot: slotKey,
                slotConfig: slotConfig,
                queryParams: usePaths ? {} : {
                    slot: slotKey,
                    id: '1',
                }
            });

            // Bulk delete
            endpoints.push({
                id: `massive-bulk-delete-${slotKey}`,
                name: `Bulk Delete ${slotConfig.label}`,
                method: 'DELETE',
                path: massivePath,
                description: `Delete multiple ${slotConfig.label.toLowerCase()} records`,
                category: 'content',
                requiresAuth: true,
                slot: slotKey,
                slotConfig: slotConfig,
                queryParams: usePaths ? { ids: '1,2,3' } : {
                    slot: slotKey,
                    ids: '1,2,3',
                }
            });
        }
    });

    endpoints.push({
        id: 'content-list-all',
        name: 'List All Slots',
        method: 'GET',
        path: usePaths ? '/data/__all_keys__' : '/endpoints/data.php',
        description: 'Get all available content slot keys',
        category: 'content',
        requiresAuth: true,
        queryParams: usePaths ? {} : { key: '__all_keys__' }
    });

    return endpoints;
}

/**
 * Highlight JSON for display
 */
export function highlightJSON(json: string): string {
    if (!json) return '';
    const escaped = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return escaped.replace(
        /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
        (match) => {
            let cls = 'text-amber-500'; // number
            if (/^"/.test(match)) {
                cls = /:$/.test(match) ? 'text-blue-500' : 'text-emerald-500'; // key or string
            } else if (/true|false/.test(match)) {
                cls = 'text-purple-500';
            } else if (/null/.test(match)) {
                cls = 'text-muted-foreground';
            }
            return `<span class="${cls}">${match}</span>`;
        }
    );
}
