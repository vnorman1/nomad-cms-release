/**
 * NOMAD CMS - Secure Token Storage
 * 
 * Memory-based token storage to prevent XSS token theft.
 * Access tokens are stored only in memory (closure scope).
 * Refresh tokens are ONLY in httpOnly cookies (Zero Trust).
 * 
 * @security CRITICAL - Prevents token theft via console/XSS attacks
 * @security ZERO TRUST - Refresh token NEVER in JavaScript realm
 */

// ==========================================
// SECURE TOKEN STORAGE
// ==========================================

// Session-unique storage key - MUST be stable across page loads
const STORAGE_KEY = '_ncs_tokens_v3';

// In-memory storage (not accessible from console)
let memoryAccessToken: string | null = null;
let memoryExpiresAt: number = 0;

// Callbacks for token refresh
type RefreshCallback = () => Promise<{ accessToken: string; refreshToken: string; expiresIn: number } | null>;
let refreshCallback: RefreshCallback | null = null;

// Prevent concurrent/recursive refresh calls
let isRefreshing: boolean = false;

export interface SecureStoredTokens {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
}

/**
 * Secure Token Storage API
 * - Access token: Memory only (XSS cannot steal it)
 * - Refresh token: httpOnly cookie ONLY (Zero Trust)
 */
export const secureTokenStorage = {
    /**
     * Initialize with refresh callback for automatic token refresh
     */
    setRefreshCallback(callback: RefreshCallback): void {
        refreshCallback = callback;
    },

    /**
     * Store access token only (refresh token handled by httpOnly cookie)
     * @security Zero Trust - refresh token NEVER in JavaScript realm
     * @param accessToken - Short-lived access token (memory only)
     * @param expiresIn - Access token TTL in seconds
     */
    setAccessTokenOnly(accessToken: string, expiresIn: number): void {
        memoryAccessToken = accessToken;
        memoryExpiresAt = Date.now() + expiresIn * 1000;

        // Mark that we have an active session (for hasTokens check)
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                hasSession: true,
                e: memoryExpiresAt,
                v: 3, // Version 3 = cookie-only refresh
            }));
        } catch {
            // Ignore - hasTokens will still work via memory check
        }
    },

    /**
     * Store tokens securely (DEPRECATED - use setAccessTokenOnly)
     * @deprecated Use setAccessTokenOnly - refresh token now comes from httpOnly cookie
     * @param accessToken - Short-lived access token (memory only)
     * @param refreshToken - Long-lived refresh token (ignored in v3)
     * @param expiresIn - Access token TTL in seconds
     */
    async set(accessToken: string, _refreshToken: string, expiresIn: number): Promise<void> {
        // Ignore refreshToken parameter - it comes from httpOnly cookie
        this.setAccessTokenOnly(accessToken, expiresIn);
    },

    /**
     * Get the current access token
     * Will attempt refresh if expired or about to expire (within 2 minutes)
     */
    async getAccessToken(): Promise<string | null> {
        // Check memory first - if valid and not expiring soon, return immediately
        if (memoryAccessToken && Date.now() < memoryExpiresAt - 120000) {
            return memoryAccessToken;
        }

        // Prevent recursive/concurrent refresh calls
        if (isRefreshing) {
            return memoryAccessToken;
        }

        // Only try refresh if:
        // 1. We have a refresh callback AND
        // 2. We have an active session marker
        if (refreshCallback && this.hasTokens()) {
            try {
                isRefreshing = true;
                const result = await refreshCallback();
                if (result) {
                    this.setAccessTokenOnly(result.accessToken, result.expiresIn);
                    return memoryAccessToken;
                }
            } catch (error) {
                // Refresh failed, clear everything
                this.clear();
            } finally {
                isRefreshing = false;
            }
        }

        return memoryAccessToken;
    },

    /**
     * Get the refresh token (DEPRECATED)
     * @deprecated Refresh token is now httpOnly cookie only - this returns null
     * @security Zero Trust - refresh token NEVER accessible to JavaScript
     */
    async getRefreshToken(): Promise<string | null> {
        // SECURITY: Refresh token is in httpOnly cookie only
        // JavaScript cannot and should not access it
        return null;
    },

    /**
     * Get all tokens (for internal use only)
     * @deprecated Use getAccessToken() directly
     */
    async get(): Promise<SecureStoredTokens | null> {
        const accessToken = memoryAccessToken;

        if (!accessToken) {
            return null;
        }

        return {
            accessToken,
            refreshToken: '', // Not accessible - in httpOnly cookie
            expiresAt: memoryExpiresAt,
        };
    },

    /**
     * Check if access token is expired or about to expire
     * Returns true 2 minutes (120s) before actual expiry to allow proactive refresh
     */
    isExpired(): boolean {
        if (!memoryAccessToken) return true;
        // Consider expired 120s before actual expiry for proactive refresh
        return Date.now() > memoryExpiresAt - 120000;
    },

    /**
     * Check if we have any stored tokens or active session
     * Note: httpOnly cookies are not visible to JavaScript
     * We use localStorage marker to indicate active session
     */
    hasTokens(): boolean {
        if (memoryAccessToken) return true;

        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const data = JSON.parse(stored);
                return data.hasSession === true;
            }
        } catch {
            // Ignore parse errors
        }

        return false;
    },

    /**
     * Clear all tokens (logout)
     * Also clears the refresh token cookie by setting it to expire
     */
    clear(): void {
        memoryAccessToken = null;
        memoryExpiresAt = 0;

        try {
            localStorage.removeItem(STORAGE_KEY);
            // Also clear any legacy token storage
            localStorage.removeItem('nomad_auth_tokens');

            // CRITICAL: Also clear the httpOnly refresh token cookie
            // We can't read it, but we CAN delete it by setting an expired date
            // The path must match what the server sets!
            document.cookie = 'nomad_refresh_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/api/endpoints/auth/;';
            document.cookie = 'nomad_refresh_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
        } catch {
            // Ignore localStorage errors
        }
    },

    /**
     * Restore session from cookie on page load
     * Attempts refresh using httpOnly cookie
     */
    async restoreSession(): Promise<boolean> {
        if (!refreshCallback) {
            return false;
        }

        // Check if we have a session marker
        if (!this.hasTokens()) {
            return false;
        }

        try {
            isRefreshing = true;
            const result = await refreshCallback();
            if (result) {
                this.setAccessTokenOnly(result.accessToken, result.expiresIn);
                return true;
            }
        } catch {
            this.clear();
        } finally {
            isRefreshing = false;
        }

        return false;
    },
};

// ==========================================
// LEGACY MIGRATION HELPER
// ==========================================

/**
 * Clean up any legacy storage data
 * Call this once on app initialization
 */
export function cleanupLegacyStorage(): void {
    try {
        // Remove old token storage formats
        localStorage.removeItem('nomad_auth_tokens');

        // Remove old _ncs_ prefixed keys (v1/v2)
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith('_ncs_') && key !== STORAGE_KEY) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
    } catch {
        // Ignore errors
    }
}

/**
 * Migrate from old plaintext localStorage to secure storage
 * @deprecated No longer stores refresh tokens - just cleans up
 */
export async function migrateLegacyTokens(): Promise<boolean> {
    cleanupLegacyStorage();
    return false;
}

// ==========================================
// ANTI-XSS DETECTION
// ==========================================

/**
 * Send security alert to backend
 * Fire-and-forget - don't block on response
 */
async function sendSecurityAlert(type: string, data: Record<string, unknown>): Promise<void> {
    // Skip in development to avoid console noise
    // The honeypot still works locally - just doesn't send alerts to backend
    if (import.meta.env.DEV) {
        console.warn(`[Security Alert] ${type}:`, data);
        return;
    }

    try {
        const apiUrl = import.meta.env.VITE_API_URL || '/api';
        await fetch(`${apiUrl}/endpoints/system/security-alert.php`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                type,
                data: {
                    ...data,
                    timestamp: Date.now(),
                    url: window.location.href,
                    userAgent: navigator.userAgent,
                    referrer: document.referrer || null,
                },
            }),
            // Don't wait for response - fire and forget
            keepalive: true,
        });
    } catch {
        // Silently fail - don't expose detection to attacker
    }
}

/**
 * Generate browser fingerprint for tracking
 * Used to correlate attacks across requests
 */
function generateFingerprint(): string {
    const components = [
        navigator.userAgent,
        navigator.language,
        screen.width + 'x' + screen.height,
        new Date().getTimezoneOffset(),
        navigator.hardwareConcurrency || 0,
    ];

    // Simple hash
    let hash = 0;
    const str = components.join('|');
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
}

/**
 * Detect potential XSS attacks trying to access tokens
 * Sets up honeypot traps for common attack patterns
 */
export function setupXSSDetection(): void {
    // Prevent double initialization
    if ((window as any).__nomad_xss_detection_init) {
        return;
    }
    (window as any).__nomad_xss_detection_init = true;

    // Create honeypot that looks like token storage
    const honeypotKeys = [
        'nomad_auth_tokens_backup',
        'nomad_tokens',
        'auth_tokens',
        'jwt_token',
        'access_token',
        '_token_cache',
    ];

    const honeypotData = JSON.stringify({
        accessToken: '_eyJhbGciOiJIUzI1NiJ9',
        refreshToken: '_d41d8cd98f00b204e9800998ecf8427e',
        expiresAt: Date.now() + 86400000,
    });

    // Track access counts per key
    const accessCounts: Record<string, number> = {};
    const fingerprint = generateFingerprint();

    // Flag to prevent false positives during initialization
    let isInitializing = true;

    // Monitor access to honeypots by overriding localStorage.getItem
    const originalGetItem = localStorage.getItem.bind(localStorage);

    localStorage.getItem = function (key: string): string | null {
        // Check if accessing any honeypot key (skip during init)
        if (!isInitializing && honeypotKeys.includes(key)) {
            accessCounts[key] = (accessCounts[key] || 0) + 1;
            const count = accessCounts[key];

            // First access might be legitimate code checking
            // But multiple accesses are suspicious
            if (count === 1) {
                // Log but don't alert yet
                console.debug('[Security] Token access check:', key);
            } else if (count === 2) {
                // Second access - warn
                console.warn('[Security] Repeated token access attempt:', key);
            } else if (count >= 3) {
                // 3+ accesses - likely attack
                console.error('[SECURITY] Potential XSS attack detected - token access attempt');

                // Send alert to backend
                sendSecurityAlert('honeypot_access', {
                    accessCount: count,
                    key,
                    fingerprint,
                });
            }
        }
        return originalGetItem(key);
    };

    // Also monitor document.cookie access for token theft
    const originalCookieGetter = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')?.get;
    if (originalCookieGetter) {
        let cookieAccessCount = 0;

        Object.defineProperty(document, 'cookie', {
            get: function () {
                cookieAccessCount++;

                // Normal cookie access happens a few times during page load
                // But repeated access (>100 in short time) is suspicious
                if (cookieAccessCount > 100 && cookieAccessCount % 50 === 0) {
                    sendSecurityAlert('token_theft_attempt', {
                        accessCount: cookieAccessCount,
                        type: 'excessive_cookie_access',
                        fingerprint,
                    });
                }

                return originalCookieGetter.call(document);
            },
            set: function (val: string) {
                document.cookie = val;
            },
            configurable: true,
        });
    }

    // Set honeypots (will be accessed by attackers looking for tokens)
    try {
        for (const key of honeypotKeys) {
            localStorage.setItem(key, honeypotData);
        }
    } catch {
        // Ignore storage errors
    }

    // Initialization complete - start monitoring
    // Use setTimeout to allow any legitimate initial checks to complete
    setTimeout(() => {
        isInitializing = false;
    }, 1000);

    // Detect console access attempts (basic)
    // This catches some XSS payloads that log to console
    const originalConsoleLog = console.log;
    console.log = function (...args: unknown[]) {
        // Check if someone is trying to log tokens
        const str = args.join(' ');
        if (str.includes('HONEYPOT') || str.includes('access_token') || str.includes('refresh_token')) {
            sendSecurityAlert('console_access', {
                details: 'Token-related console logging detected',
                fingerprint,
            });
        }
        return originalConsoleLog.apply(console, args);
    };
}

export default secureTokenStorage;
