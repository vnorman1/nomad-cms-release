/**
 * Admin API Service
 * Uses apiClient for automatic token handling
 * 
 * @security All requests go through apiClient interceptors
 *           which handle token refresh automatically
 */

import { apiClient } from './client';

export interface UserFormData {
    email: string;
    password?: string;
    is_admin: boolean;
}

// =============================================================================
// Users Management
// =============================================================================

export async function fetchUsers() {
    const response = await apiClient.get('/endpoints/admin/users.php');
    return response.data;
}

export async function createUser(data: UserFormData) {
    const response = await apiClient.post('/endpoints/admin/users.php', data);
    return response.data;
}

export async function updateUser(id: number, data: Partial<UserFormData>) {
    const response = await apiClient.put('/endpoints/admin/user-actions.php', { id, ...data });
    return response.data;
}

export async function deleteUser(id: number) {
    const response = await apiClient.delete(`/endpoints/admin/user-actions.php?id=${id}`);
    return response.data;
}

export async function toggleLockUser(id: number, lock: boolean) {
    const response = await apiClient.patch('/endpoints/admin/user-actions.php', { id, lock });
    return response.data;
}

// =============================================================================
// Backup API
// =============================================================================

/**
 * Download encrypted backup (.nomad + .pem bundle)
 * Requires TOTP verification
 * 
 * SECURITY: Uses POST to prevent sensitive data exposure in:
 * - Server access logs
 * - Browser history
 * - Referrer headers
 * 
 * @param totpCode - 6-digit TOTP code
 * @param recoveryPassword - Optional password to create disaster recovery kit
 */
export async function downloadBackup(totpCode: string, recoveryPassword?: string): Promise<void> {
    // SECURITY: Send credentials in request body, NOT in URL
    const response = await apiClient.post('/endpoints/admin/backup.php?action=download', {
        totp_code: totpCode,
        recovery_password: recoveryPassword || null,
    }, {
        responseType: 'blob'
    });

    // Get filename from Content-Disposition header
    const contentDisposition = response.headers['content-disposition'];
    const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
    const filename = filenameMatch?.[1] || `backup_${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.zip`;

    // Download the blob
    const blob = response.data;
    const url2 = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url2;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url2);
    document.body.removeChild(a);
}

/**
 * Restore from encrypted backup
 * Requires .nomad file and private key (NO TOTP - .pem key is sufficient)
 * 
 * @param nomadFile - .nomad backup file
 * @param privateKey - Private key PEM content
 * @param recoveryPassword - Optional recovery password for disaster recovery
 * @param recoveryFile - Optional recovery.nms file for disaster recovery
 */
export async function restoreBackup(
    nomadFile: File,
    privateKey: string,
    recoveryPassword?: string,
    recoveryFile?: File
): Promise<{ success: boolean; message: string; disaster_recovery?: boolean; migration_stats?: unknown }> {
    const formData = new FormData();
    formData.append('private_key', privateKey);
    formData.append('backup_file', nomadFile);

    // Disaster Recovery Mode
    if (recoveryPassword && recoveryFile) {
        formData.append('recovery_password', recoveryPassword);
        formData.append('recovery_file', recoveryFile);
    }

    const response = await apiClient.post('/endpoints/admin/backup.php', formData, {
        headers: {
            'Content-Type': 'multipart/form-data'
        }
    });

    return response.data;
}

// =============================================================================
// API Keys Management
// =============================================================================

export interface ApiKey {
    id: number;
    name: string;
    key_prefix: string;
    permissions: ('read' | 'write' | 'admin')[];
    encrypted_permissions?: ('encrypted_read' | 'encrypted_write')[];
    last_used_at: string | null;
    usage_count: number;
    expires_at: string | null;
    created_at: string;
    is_active: boolean;
    key_type: 'standard' | 'enhanced';
}

export interface CreatedApiKey extends ApiKey {
    key: string; // Full key - only shown once!
    encrypted_permissions?: ('encrypted_read' | 'encrypted_write')[];
}

export async function getApiKeys(): Promise<ApiKey[]> {
    const response = await apiClient.get('/endpoints/admin/api-keys.php');
    return response.data.keys;
}

export async function createApiKey(
    name: string,
    permissions: ('read' | 'write' | 'admin')[],
    expiresInDays?: number,
    enhanced?: boolean,
    encryptedPermissions?: ('encrypted_read' | 'encrypted_write')[],
    totpCode?: string
): Promise<CreatedApiKey> {
    const response = await apiClient.post('/endpoints/admin/api-keys.php', {
        name,
        permissions,
        expires_in: expiresInDays,
        enhanced: enhanced || false,
        encrypted_permissions: encryptedPermissions || [],
        totp_code: totpCode,
    });
    return response.data.key;
}

export async function revokeApiKey(keyId: number): Promise<void> {
    await apiClient.delete(`/endpoints/admin/api-keys.php?id=${keyId}`);
}

// =============================================================================
// Panic Mode API
// =============================================================================

export interface PanicModeStatus {
    enabled: boolean;
    activated_at: string | null;
    activated_by: number | null;
    reason: string | null;
    sessions_revoked: number;
    funny_message: string;
}

export interface PanicModeResponse {
    success: boolean;
    panic_mode?: PanicModeStatus;
    action?: 'enabled' | 'disabled';
    message?: string;
    sessions_revoked?: number;
    funny_message?: string;
    error?: string;
    status?: PanicModeStatus;
    tip?: string;
    warning?: string;
    info?: string;
}

/**
 * Get current panic mode status
 */
export async function getPanicModeStatus(): Promise<PanicModeResponse> {
    const response = await apiClient.get('/endpoints/admin/panic.php');
    return response.data;
}

/**
 * Toggle panic mode (enable/disable)
 */
export async function togglePanicMode(
    action: 'toggle' | 'enable' | 'disable' = 'toggle',
    reason?: string
): Promise<PanicModeResponse> {
    const response = await apiClient.post('/endpoints/admin/panic.php', { action, reason });
    return response.data;
}

