/**
 * Install API Service
 * Handles installation status check and execution
 */

import { apiClient } from './client';

// ==========================================
// TYPES
// ==========================================

export interface InstallationStatus {
    installed: boolean;
    requires_setup?: boolean;
    locked_at?: string;
    version?: string;
}

export interface InstallationRequest {
    email: string;
    password: string;
    app_url?: string;
    user_entropy?: string; // SHA-256 hashed client-side entropy
}

export interface InstallationResponse {
    success: boolean;
    message?: string;
    error?: string;
    redirect?: string;
    admin?: {
        uuid: string;
        email: string;
    };
}

// ==========================================
// API FUNCTIONS
// ==========================================

/**
 * Check if CMS needs installation
 * This endpoint is always accessible (no auth required)
 */
export async function checkInstallationStatus(): Promise<InstallationStatus> {
    try {
        const response = await apiClient.get<InstallationStatus>('/endpoints/install/status.php');
        return response.data;
    } catch (error) {
        console.error('[Install] Status check failed:', error);
        // If we can't check status, assume not installed
        return {
            installed: false,
            requires_setup: true,
        };
    }
}

/**
 * Execute installation with admin credentials
 * Rate limited: 5 attempts per 5 minutes
 */
export async function executeInstallation(
    email: string,
    password: string,
    appUrl?: string,
    userEntropy?: string
): Promise<InstallationResponse> {
    try {
        const payload: InstallationRequest = {
            email,
            password,
        };

        if (appUrl) {
            payload.app_url = appUrl;
        }
        
        if (userEntropy && userEntropy.length > 0) {
            payload.user_entropy = userEntropy;
        }

        console.log('[Install] Sending request to execute.php with payload:', { ...payload, password: '***' });

        const response = await apiClient.post<InstallationResponse>(
            '/endpoints/install/execute.php',
            payload
        );

        console.log('[Install] Raw response:', response);
        console.log('[Install] Response data:', response.data);
        console.log('[Install] Success value:', response.data?.success, typeof response.data?.success);

        // Ensure we return the correct structure
        return {
            success: response.data?.success === true,
            message: response.data?.message,
            error: response.data?.error,
            redirect: response.data?.redirect,
            admin: response.data?.admin,
        };
    } catch (error: unknown) {
        console.error('[Install] Execution failed:', error);

        // Handle axios error response
        if (error && typeof error === 'object' && 'response' in error) {
            const axiosError = error as { response?: { data?: InstallationResponse; status?: number } };
            
            if (axiosError.response?.status === 429) {
                return {
                    success: false,
                    error: 'Túl sok telepítési kísérlet. Próbáld újra később.',
                };
            }

            if (axiosError.response?.status === 403) {
                return {
                    success: false,
                    error: 'A telepítés már megtörtént.',
                };
            }

            if (axiosError.response?.data?.error) {
                return {
                    success: false,
                    error: axiosError.response.data.error,
                };
            }
        }

        return {
            success: false,
            error: 'Telepítés sikertelen. Ellenőrizd a szervernaplókat.',
        };
    }
}
