/**
 * Auth API Service
 * Authentication endpoints with JWT token management
 * 
 * @security SECURE TOKEN STORAGE - Access tokens stored in memory only
 *           Refresh tokens encrypted before localStorage storage
 *           Prevents XSS token theft via console access
 */

import { apiClient } from './client';
import { secureTokenStorage, migrateLegacyTokens, setupXSSDetection } from '@/utils/secureTokenStorage';
import type {
    LoginRequest,
    RegisterRequest,
    // RefreshRequest - Not needed anymore, cookie handles refresh token
    TOTPVerifyRequest,
    AuthResponse,
    TOTPSetupResponse,
    MeResponse,
    WebAuthnOptionsResponse,
    WebAuthnRegisterResponse,
    StoredTokens,
} from './auth.types';

// ==========================================
// TOKEN STORAGE (SECURE - Memory + Encrypted)
// ==========================================

// Initialize XSS detection honeypot on module load
if (typeof window !== 'undefined') {
    setupXSSDetection();
    // Migrate legacy tokens on app start
    migrateLegacyTokens().catch(() => { });
}

/**
 * Token storage wrapper for backward compatibility
 * Uses secureTokenStorage internally but exposes same interface
 * 
 * @security Access tokens are NEVER stored in localStorage
 *           Only encrypted refresh tokens persist across page loads
 */
export const tokenStorage = {
    get(): StoredTokens | null {
        // Synchronous wrapper - returns cached memory values
        // For async operations, use secureTokenStorage directly
        const accessToken = secureTokenStorage.hasTokens()
            ? '***SECURE***' // Placeholder to indicate tokens exist
            : null;

        if (!accessToken) return null;

        return {
            accessToken: '***SECURE***',
            refreshToken: '***SECURE***',
            expiresAt: Date.now() + 900000, // Placeholder
        };
    },

    set(accessToken: string, refreshToken: string, expiresIn: number): void {
        // Async internally but fire-and-forget for compatibility
        secureTokenStorage.set(accessToken, refreshToken, expiresIn).catch(console.error);
    },

    clear(): void {
        secureTokenStorage.clear();
    },

    isExpired(): boolean {
        return secureTokenStorage.isExpired();
    },

    getAccessToken(): string | null {
        // This is now async internally - use secureTokenStorage.getAccessToken() for real token
        // For sync checks, use hasTokens()
        return secureTokenStorage.hasTokens() ? '***PENDING***' : null;
    },

    /**
     * Async method to get the real access token
     * Use this instead of getAccessToken() for API calls
     */
    async getAccessTokenAsync(): Promise<string | null> {
        return secureTokenStorage.getAccessToken();
    },

    /**
     * Async method to get refresh token
     */
    async getRefreshTokenAsync(): Promise<string | null> {
        return secureTokenStorage.getRefreshToken();
    },
};

// ==========================================
// AUTH ENDPOINTS
// ==========================================

/**
 * Login with email and password
 * @security Refresh token is in httpOnly cookie - NOT in response body (Zero Trust)
 */
export async function login(data: LoginRequest): Promise<AuthResponse> {
    try {
        const response = await apiClient.post<AuthResponse>('/endpoints/auth/login.php', data);

        // SECURITY: Only access_token in response - refresh_token is in httpOnly cookie
        if (response.data.success && response.data.access_token) {
            // Use new cookie-only method
            secureTokenStorage.setAccessTokenOnly(
                response.data.access_token,
                response.data.expires_in ?? 900
            );
        }

        return response.data;
    } catch (error: unknown) {
        // Handle 423 Locked status (account lockout)
        if (error && typeof error === 'object' && 'response' in error) {
            const axiosError = error as { response?: { status?: number; data?: AuthResponse } };
            if (axiosError.response?.status === 423 && axiosError.response?.data) {
                // Return the lockout response data instead of throwing
                return axiosError.response.data;
            }
        }
        throw error;
    }
}

/**
 * Register new user
 * @security Refresh token is in httpOnly cookie - NOT in response body
 */
export async function register(data: RegisterRequest): Promise<AuthResponse> {
    const response = await apiClient.post<AuthResponse>('/endpoints/auth/register.php', data);

    if (response.data.success && response.data.access_token) {
        secureTokenStorage.setAccessTokenOnly(
            response.data.access_token,
            response.data.expires_in ?? 900
        );
    }

    return response.data;
}

/**
 * Refresh access token
 * @security Uses httpOnly cookie - no refresh token in JavaScript
 */
export async function refreshTokens(): Promise<AuthResponse> {
    // SECURITY: httpOnly cookie provides refresh token automatically
    const response = await apiClient.post<AuthResponse>('/endpoints/auth/refresh.php', {});

    if (response.data.success && response.data.access_token) {
        secureTokenStorage.setAccessTokenOnly(
            response.data.access_token,
            response.data.expires_in ?? 900
        );
    }

    return response.data;
}

/**
 * Logout and revoke tokens
 */
export async function logout(logoutAll = false): Promise<void> {
    const tokens = tokenStorage.get();

    try {
        await apiClient.post('/endpoints/auth/logout.php', {
            refresh_token: tokens?.refreshToken,
            logout_all: logoutAll,
        });
    } finally {
        tokenStorage.clear();
        // Stop the background refresh timer
        const { stopTokenRefreshTimer } = await import('./client');
        stopTokenRefreshTimer();
    }
}

/**
 * Get current user info
 */
export async function getMe(): Promise<MeResponse> {
    const response = await apiClient.get<MeResponse>('/endpoints/auth/me.php');
    return response.data;
}

// ==========================================
// TOTP (2FA) ENDPOINTS
// ==========================================

/**
 * Get TOTP setup (QR code and secret)
 */
export async function getTOTPSetup(): Promise<TOTPSetupResponse> {
    try {
        const response = await apiClient.get<TOTPSetupResponse>('/endpoints/auth/totp-setup.php');
        return response.data;
    } catch (err) {
        console.error('[TOTP] Setup error:', err);
        throw err;
    }
}

/**
 * Enable TOTP by verifying code
 */
export async function enableTOTP(data: TOTPVerifyRequest): Promise<TOTPSetupResponse> {
    try {
        const response = await apiClient.post<TOTPSetupResponse>('/endpoints/auth/totp-setup.php', data);
        return response.data;
    } catch (err) {
        console.error('[TOTP] Enable error:', err);
        throw err;
    }
}

/**
 * Disable TOTP
 */
export async function disableTOTP(data: TOTPVerifyRequest): Promise<TOTPSetupResponse> {
    try {
        const response = await apiClient.delete<TOTPSetupResponse>('/endpoints/auth/totp-setup.php', { data });
        return response.data;
    } catch (err) {
        console.error('[TOTP] Disable error:', err);
        throw err;
    }
}

/**
 * Regenerate backup codes (requires TOTP code for verification)
 */
export async function regenerateBackupCodes(data: TOTPVerifyRequest): Promise<TOTPSetupResponse> {
    try {
        const response = await apiClient.patch<TOTPSetupResponse>('/endpoints/auth/totp-setup.php', data);
        return response.data;
    } catch (err) {
        console.error('[TOTP] Regenerate error:', err);
        throw err;
    }
}

// ==========================================
// WEBAUTHN (PASSKEY) ENDPOINTS
// ==========================================

/**
 * Get WebAuthn registration options
 */
export async function getWebAuthnRegisterOptions(): Promise<WebAuthnOptionsResponse> {
    try {
        const response = await apiClient.get<WebAuthnOptionsResponse>('/endpoints/auth/webauthn-register.php');
        return response.data;
    } catch (err) {
        console.error('[WebAuthn] Get options error:', err);
        throw err;
    }
}

/**
 * Complete WebAuthn registration
 */
export async function registerWebAuthn(
    credential: Record<string, unknown>,
    friendlyName?: string
): Promise<WebAuthnRegisterResponse> {
    try {
        const response = await apiClient.post<WebAuthnRegisterResponse>('/endpoints/auth/webauthn-register.php', {
            ...credential,
            friendly_name: friendlyName,
        });
        return response.data;
    } catch (err) {
        console.error('[WebAuthn] Registration error:', err);
        throw err;
    }
}

/**
 * Delete a passkey
 */
export async function deletePasskey(id: number): Promise<{ success: boolean; message?: string }> {
    const response = await apiClient.delete(`/endpoints/auth/webauthn-register.php?id=${id}`);
    return response.data;
}

/**
 * Get WebAuthn login options
 */
export async function getWebAuthnLoginOptions(email?: string): Promise<WebAuthnOptionsResponse> {
    const url = email
        ? `/endpoints/auth/webauthn-login.php?email=${encodeURIComponent(email)}`
        : '/endpoints/auth/webauthn-login.php';
    const response = await apiClient.get<WebAuthnOptionsResponse>(url);
    return response.data;
}

/**
 * Complete WebAuthn login
 */
export async function loginWithWebAuthn(assertion: Record<string, unknown>): Promise<AuthResponse> {
    const response = await apiClient.post<AuthResponse>('/endpoints/auth/webauthn-login.php', assertion);

    if (response.data.success && response.data.access_token && response.data.refresh_token) {
        tokenStorage.set(
            response.data.access_token,
            response.data.refresh_token,
            response.data.expires_in ?? 900
        );
    }

    return response.data;
}

// ==========================================
// USER SETTINGS
// ==========================================

export interface UserSettings {
    email: string;
    totp_enabled: boolean;
    totp_allowed: boolean;
    webauthn_allowed: boolean;
    password_allowed: boolean;
    has_password: boolean;
    recovery_email: string | null;
}

export interface SettingsResponse {
    success: boolean;
    settings?: UserSettings;
    error?: string;
}

export interface UpdateSettingsRequest {
    email?: string;
    current_password?: string;
    new_password?: string;
    confirm_password?: string;
    totp_allowed?: boolean;
    webauthn_allowed?: boolean;
    password_allowed?: boolean;
    recovery_email?: string | null;
    totp_code?: string; // Required for sensitive operations when TOTP is enabled
}

export interface UpdateSettingsResponse {
    success: boolean;
    message?: string;
    updated_fields?: string[];
    error?: string;
    requires_totp?: boolean;
}

/**
 * Get user settings
 */
export async function getSettings(): Promise<SettingsResponse> {
    const response = await apiClient.get<SettingsResponse>('/endpoints/auth/settings.php');
    return response.data;
}

/**
 * Update user settings
 */
export async function updateSettings(data: UpdateSettingsRequest): Promise<UpdateSettingsResponse> {
    const response = await apiClient.patch<UpdateSettingsResponse & { access_token?: string; token_update?: boolean }>('/endpoints/auth/settings.php', data);

    // If backend issued a new token (e.g., after password change), update storage
    if (response.data.success && response.data.token_update && response.data.access_token) {
        // We preserve existing refresh token if not returned, assuming only access token was rotated
        const currentTokens = tokenStorage.get();
        tokenStorage.set(
            response.data.access_token,
            currentTokens?.refreshToken ?? '', // Fallback to empty if missing (shouldn't happen in valid session)
            900 // Default TTL, or read from config if available
        );
    }

    return response.data;
}

// ==========================================
// USER PREFERENCES
// ==========================================

export type NotificationLevel = 'all' | 'normal' | 'critical' | 'none';

export interface UserPreferences {
    theme?: 'light' | 'dark';
    language?: 'hu' | 'en';
    sidebar_collapsed?: boolean;
    compact_mode?: boolean;
    notification_level?: NotificationLevel;
}

export interface PreferencesResponse {
    success: boolean;
    preferences: UserPreferences;
    message?: string;
    error?: string;
}

/**
 * Get user preferences
 */
export async function getPreferences(): Promise<PreferencesResponse> {
    const response = await apiClient.get<PreferencesResponse>('/endpoints/auth/preferences.php');
    return response.data;
}

/**
 * Update user preferences
 */
export async function updatePreferences(data: Partial<UserPreferences & { theme: 'light' | 'dark' | 'system' }>): Promise<PreferencesResponse> {
    const response = await apiClient.put<PreferencesResponse>('/endpoints/auth/preferences.php', data);
    return response.data;
}

// ==========================================
// AI SETTINGS
// ==========================================

export interface AiSettings {
    ai_enabled: boolean;
    has_api_key: boolean;
    ai_system_prompt: string | null;
    ai_max_tokens: number;
    ai_selected_model: string | null;
}

export interface AiSettingsResponse {
    success: boolean;
    ai_settings?: AiSettings;
    error?: string;
}

export interface UpdateAiSettingsRequest {
    ai_enabled?: boolean;
    ai_api_key?: string | null;
    ai_system_prompt?: string | null;
    ai_max_tokens?: number;
    ai_selected_model?: string | null;
}

export interface UpdateAiSettingsResponse {
    success: boolean;
    message?: string;
    ai_settings?: AiSettings;
    error?: string;
}

/**
 * Get AI settings for current user
 */
export async function getAiSettings(): Promise<AiSettingsResponse> {
    const response = await apiClient.get<AiSettingsResponse>('/endpoints/auth/ai-settings.php');
    return response.data;
}

/**
 * Update AI settings
 */
export async function updateAiSettings(data: UpdateAiSettingsRequest): Promise<UpdateAiSettingsResponse> {
    const response = await apiClient.patch<UpdateAiSettingsResponse>('/endpoints/auth/ai-settings.php', data);
    return response.data;
}

/**
 * Clear all AI settings
 */
export async function clearAiSettings(): Promise<{ success: boolean; message?: string; error?: string }> {
    const response = await apiClient.delete('/endpoints/auth/ai-settings.php');
    return response.data;
}

// ==========================================
// AI CHAT
// ==========================================

export interface AiChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export interface AiChatRequest {
    messages: AiChatMessage[];
    schema_context?: Record<string, unknown>;
    route_context?: {
        path: string;
        currentSlot: string | null;
        currentSlotLabel: string | null;
    };
    form_context?: Record<string, unknown>;
    model?: string;
    temperature?: number;
    max_tokens?: number;
    // Secret session handling
    _sid?: string; // Session ID for server-side history
    _ssh?: boolean; // Enable server-side history
}

export interface AiChatResponse {
    success: boolean;
    message?: string;
    model?: string;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
    finish_reason?: string;
    error?: string;
    deprecation_warning?: {
        message: string;
        replacement: string | null;
        sunset_date: string | null;
    };
}

/**
 * Send chat message to AI
 */
export async function sendAiChat(data: AiChatRequest): Promise<AiChatResponse> {
    const response = await apiClient.post<AiChatResponse>('/endpoints/ai/chat.php', data);
    return response.data;
}

