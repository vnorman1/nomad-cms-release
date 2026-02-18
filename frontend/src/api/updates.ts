/**
 * Updates API Service
 * Handles communication with nomad-updates CDN-backed endpoints
 * 
 * @since 2.4.0
 */

import { apiClient } from './client';

// ==========================================
// TYPES
// ==========================================

// AI Model types
export interface AIModel {
    id: string;
    label: string;
    description: string;
    status: 'stable' | 'preview' | 'deprecated' | 'sunset';
    speed: 'fast' | 'slow';
    quality: 'fair' | 'good' | 'excellent';
    max_tokens: number;
    context_window: number;
    supports_streaming: boolean;
    pricing_tier: 'free' | 'paid';
    provider_id: string;
    provider_name: string;
    // Deprecated model fields
    deprecated_at?: string;
    sunset_date?: string;
    replacement?: string;
}

export interface AIProvider {
    id: string;
    name: string;
    icon: string;
    api_base: string;
    key_url: string;
    models: Omit<AIModel, 'provider_id' | 'provider_name'>[];
}

export interface AIModelsResponse {
    success: boolean;
    models: AIModel[];
    default_model: string;
    providers: AIProvider[];
    version: string;
    updated_at: string | null;
    status_descriptions: Record<string, string>;
    cache: {
        cache_exists: boolean;
        cache_fresh: boolean;
        cached_at: string | null;
        age_seconds: number | null;
        ttl_seconds: number;
        source: string;
    };
    error?: string;
}

export interface AIModelRefreshResponse {
    success: boolean;
    message: string;
    source: string;
    models_count: number | null;
}

// Changelog types
export interface ChangelogEntry {
    version: string;
    date: string;
    title: string;
    file: string;
    type: 'feature' | 'bugfix' | 'breaking' | 'security';
    highlights: string[];
}

export interface ChangelogIndexResponse {
    success: boolean;
    latest_version: string | null;
    entries: ChangelogEntry[];
    error?: string;
}

export interface ChangelogContentResponse {
    success: boolean;
    content: string;
    file: string;
    error?: string;
}

// Announcement types
export interface Announcement {
    id: string;
    type: 'info' | 'warning' | 'critical';
    title: string;
    message: string;
    created_at: string;
    expires_at: string | null;
    dismissible: boolean;
    action_url: string | null;
    action_label: string | null;
}

export interface AnnouncementsResponse {
    success: boolean;
    active: boolean;
    announcements: Announcement[];
}

// Meta types
export interface UpdateMeta {
    project: string;
    latest_version: string;
    updated_at: string;
    cdn_base: string;
    resources: Record<string, string>;
    cache_ttl: Record<string, number>;
}

export interface UpdateMetaResponse {
    success: boolean;
    meta: UpdateMeta | null;
}

// ==========================================
// AI MODELS API
// ==========================================

/**
 * Get available AI models from registry
 */
export async function getAIModels(activeOnly = false): Promise<AIModelsResponse> {
    const params = activeOnly ? '?active=1' : '';
    const response = await apiClient.get<AIModelsResponse>(`/endpoints/ai/models.php${params}`);
    return response.data;
}

/**
 * Force refresh AI models from CDN (admin only)
 */
export async function refreshAIModels(): Promise<AIModelRefreshResponse> {
    const response = await apiClient.post<AIModelRefreshResponse>('/endpoints/ai/models.php');
    return response.data;
}

// ==========================================
// CHANGELOG API
// ==========================================

/**
 * Get changelog index (list of all changelogs)
 */
export async function getChangelogIndex(): Promise<ChangelogIndexResponse> {
    const response = await apiClient.get<ChangelogIndexResponse>('/endpoints/updates/changelog.php');
    return response.data;
}

/**
 * Get a specific changelog content (markdown)
 */
export async function getChangelogContent(filename: string): Promise<ChangelogContentResponse> {
    const response = await apiClient.get<ChangelogContentResponse>(
        `/endpoints/updates/changelog.php?file=${encodeURIComponent(filename)}`
    );
    return response.data;
}

// ==========================================
// ANNOUNCEMENTS API
// ==========================================

/**
 * Get active announcements for current user
 */
export async function getAnnouncements(): Promise<AnnouncementsResponse> {
    const response = await apiClient.get<AnnouncementsResponse>('/endpoints/updates/announcements.php');
    return response.data;
}

/**
 * Dismiss an announcement
 */
export async function dismissAnnouncement(id: string): Promise<{ success: boolean }> {
    const response = await apiClient.post('/endpoints/updates/announcements.php', { id });
    return response.data;
}

// ==========================================
// META API
// ==========================================

/**
 * Get update hub meta info
 */
export async function getUpdateMeta(): Promise<UpdateMetaResponse> {
    const response = await apiClient.get<UpdateMetaResponse>('/endpoints/updates/meta.php');
    return response.data;
}

// ==========================================
// FORCE REFRESH API
// ==========================================

export interface ForceRefreshResponse {
    success: boolean;
    message: string;
    details: {
        cache_cleared: boolean;
        sources_refreshed: Record<string, string>;
        changelog_files_refreshed: number;
        cdn_purged: boolean;
        duration_ms: number;
    };
}

/**
 * Force refresh all updates from source
 * 
 * Strategy:
 * 1. Clears local cache (api/storage/cache/updates)
 * 2. Fetches from raw.githubusercontent.com first (always latest)
 * 3. If GitHub rate-limited → purges jsDelivr CDN + fetches from CDN
 * 4. Rebuilds all caches with fresh data
 * 
 * Rate limited: 5 requests per 5 minutes
 */
export async function forceRefreshUpdates(): Promise<ForceRefreshResponse> {
    const response = await apiClient.post<ForceRefreshResponse>('/endpoints/updates/refresh.php');
    return response.data;
}
