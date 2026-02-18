/**
 * System Update API
 * 
 * API functions for the delta update system.
 * Communicates with the backend DeltaUpdateService.
 */

import { apiClient, API_BASE } from './client';

// Types
export interface UpdateInfo {
    available: boolean;
    currentVersion: string;
    latestVersion: string;
    downloadSize: number;
    changes: {
        added: number;
        modified: number;
        deleted: number;
        unchanged: number;
    };
    source: 'github' | 'jsdelivr' | null;
    error?: string;
    message?: string;
}

export interface UpdateResult {
    success: boolean;
    fromVersion?: string;
    toVersion?: string;
    filesAdded?: number;
    filesModified?: number;
    filesDeleted?: number;
    backupId?: string;
    error?: string;
    rollbackPerformed?: boolean;
}

export interface VersionInfo {
    version: string;
    releaseDate: string;
    tag: string;
    prerelease: boolean;
    isCurrent?: boolean;
}

export interface SystemVersionInfo {
    version: string;
    buildDate: string;
    codename: string;
    details?: {
        php: string;
        requirements: {
            php: string;
            node: string;
        };
    };
}

// API Functions

/**
 * Get current system version (PUBLIC - no auth required)
 */
export async function getSystemVersion(): Promise<SystemVersionInfo> {
    const response = await fetch(`${API_BASE}/system/version.php`);
    const data = await response.json();
    if (!data.success) {
        throw new Error(data.error || 'Failed to get version');
    }
    return {
        version: data.version,
        buildDate: data.buildDate,
        codename: data.codename,
        details: data.details,
    };
}

/**
 * Get list of available releases
 */
export async function getAvailableReleases(): Promise<{ currentVersion: string; releases: VersionInfo[] }> {
    const response = await apiClient.get('/system/releases.php');
    return {
        currentVersion: response.data.currentVersion,
        releases: response.data.releases ?? [],
    };
}

/**
 * Check for updates (uses delta comparison)
 */
export async function checkForUpdates(targetVersion?: string): Promise<UpdateInfo> {
    const params = targetVersion ? `?version=${encodeURIComponent(targetVersion)}` : '';
    const response = await apiClient.get(`/system/check-update.php${params}`);
    return response.data;
}

/**
 * Apply update
 */
export async function applyUpdate(targetVersion: string): Promise<UpdateResult> {
    const response = await apiClient.post('/system/apply-update.php', { version: targetVersion });
    return response.data;
}

/**
 * Rollback to backup
 */
export async function rollbackUpdate(backupId: string): Promise<{ success: boolean; error?: string }> {
    const response = await apiClient.post('/system/rollback.php', { backupId });
    return response.data;
}

// SSE Progress Types
export interface UpdateProgress {
    stage: 'starting' | 'downloading' | 'verifying' | 'analyzing' | 'applying' | 'migrating' | 'complete' | 'error';
    progress: number;
    message: string;
    timestamp: number;
}

/**
 * Subscribe to real-time update progress via SSE
 * Returns a cleanup function to close the connection
 */
export function subscribeToUpdateProgress(
    token: string,
    onProgress: (progress: UpdateProgress) => void,
    onError: (error: string) => void,
    onComplete: () => void
): () => void {
    const url = `${API_BASE}/system/update-progress.php?token=${encodeURIComponent(token)}`;
    const eventSource = new EventSource(url);

    eventSource.addEventListener('connected', () => {
        // SSE connection established
    });

    eventSource.addEventListener('progress', (event) => {
        try {
            const progress = JSON.parse(event.data) as UpdateProgress;
            onProgress(progress);
        } catch (e) {
            console.error('Failed to parse progress event:', e);
        }
    });

    eventSource.addEventListener('done', () => {
        onComplete();
        eventSource.close();
    });

    eventSource.onerror = () => {
        onError('SSE connection lost');
        eventSource.close();
    };

    // Return cleanup function
    return () => {
        eventSource.close();
    };
}

