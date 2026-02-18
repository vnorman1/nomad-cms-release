/**
 * Auth API Types
 * Type definitions for authentication endpoints
 */

// ==========================================
// REQUEST TYPES
// ==========================================

export interface LoginRequest {
    email: string;
    password: string;
    totp_code?: string;
}

export interface RegisterRequest {
    email: string;
    password: string;
    confirm_password: string;
}

export interface RefreshRequest {
    refresh_token: string;
}

export interface TOTPVerifyRequest {
    code: string;
}

export interface AuthSettingsRequest {
    totp_allowed?: boolean;
    webauthn_allowed?: boolean;
    password_allowed?: boolean;
}

// ==========================================
// RESPONSE TYPES
// ==========================================

// RBAC Role types
export type UserRole = 'admin' | 'editor' | 'viewer';

export interface User {
    uuid: string;
    email: string;
    role: UserRole;  // RBAC: admin, editor, viewer
    is_admin: boolean;
    email_verified?: boolean;
    totp_enabled?: boolean;
    passkey_count?: number;
    created_at?: string;
    last_login_at?: string;
    is_new_user?: boolean | number; // SQLite uses 0/1, so handle both
}

export interface AuthTokens {
    access_token: string;
    refresh_token: string;
    token_type: string;
    expires_in: number;
}

export interface AuthResponse {
    success: boolean;
    message?: string;
    error?: string;
    errors?: string[];
    code?: string; // Error code (e.g., 'ACCOUNT_LOCKED')
    requires_totp?: boolean; // True when login needs TOTP code
    lockout_remaining?: number; // Remaining lockout time in seconds
    lockout_remaining_minutes?: number; // Remaining lockout time in minutes
    user?: User;
    access_token?: string;
    refresh_token?: string;
    token_type?: string;
    expires_in?: number;
}

export interface TOTPSetupResponse {
    success: boolean;
    totp_enabled: boolean;
    provisioning_uri?: string;
    qr_code?: string; // data URI
    secret?: string;
    backup_codes?: string[];
    message?: string;
    error?: string;
    warning?: string;
}

export interface Passkey {
    id: number;
    friendly_name: string | null;
    created_at: string;
    last_used_at: string | null;
}

export interface MeResponse {
    success: boolean;
    user?: User;
    passkeys?: Passkey[];
    error?: string;
}

export interface WebAuthnOptionsResponse {
    success: boolean;
    options?: Record<string, unknown>;
    message?: string;
    error?: string;
}

export interface WebAuthnRegisterResponse {
    success: boolean;
    credential_id?: string;
    message?: string;
    error?: string;
}

// ==========================================
// STORAGE TYPES
// ==========================================

export interface StoredTokens {
    accessToken: string;
    refreshToken: string;
    expiresAt: number; // timestamp
}
