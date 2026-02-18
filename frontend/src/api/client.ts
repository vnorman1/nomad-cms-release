/**
 * API Client Configuration
 * Axios instance with JWT token handling and proactive refresh
 * 
 * @security Uses secureTokenStorage for XSS-resistant token management
 */
import axios from 'axios';
import { secureTokenStorage } from '@/utils/secureTokenStorage';

// Configuration
export const API_BASE = '/api';

// Create axios instance with defaults
export const apiClient = axios.create({
    baseURL: API_BASE,
    headers: {
        'Content-Type': 'application/json',
    },
    withCredentials: true, // For CSRF cookies
});

// Session expired event - dispatched when session is irrecoverably expired
export const SESSION_EXPIRED_EVENT = 'nomad:session:expired';

/**
 * Dispatch session expired event to notify UI
 */
function dispatchSessionExpired() {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT, {
            detail: { timestamp: Date.now() }
        }));
    }
}

/**
 * Perform the actual refresh API call
 * @security httpOnly cookie is the ONLY source for refresh token (Zero Trust)
 * @note Cookie is automatically sent with withCredentials: true
 */
async function performRefresh(): Promise<boolean> {
    try {
        // SECURITY: Refresh token comes from httpOnly cookie ONLY
        // No fallback - if cookies blocked, user cannot maintain session
        const refreshResponse = await axios.post(
            `${API_BASE}/endpoints/auth/refresh.php`,
            {}, // Empty body - cookie provides refresh token
            { withCredentials: true }
        );

        if (refreshResponse.data.success) {
            // Only access_token comes in response - refresh token is in cookie
            await secureTokenStorage.setAccessTokenOnly(
                refreshResponse.data.access_token,
                refreshResponse.data.expires_in ?? 900
            );
            return true;
        }
        return false;
    } catch (e) {
        console.warn('[apiClient] Refresh API call failed:', e);
        return false;
    }
}

// Setup refresh callback for automatic token refresh
secureTokenStorage.setRefreshCallback(async () => {
    try {
        // SECURITY: Refresh token comes from httpOnly cookie ONLY
        const refreshResponse = await axios.post(
            `${API_BASE}/endpoints/auth/refresh.php`,
            {},
            { withCredentials: true }
        );

        if (refreshResponse.data.success) {
            return {
                accessToken: refreshResponse.data.access_token,
                // No refresh token in response - cookie handles it
                refreshToken: '', // Placeholder - not used anymore
                expiresIn: refreshResponse.data.expires_in ?? 900,
            };
        }
    } catch {
        // Refresh failed
    }
    return null;
});

/**
 * Proactively refresh token if about to expire
 * Uses Web Locks API to ensure only ONE tab refreshes at a time
 */
async function ensureValidToken(): Promise<boolean> {
    // Check if we have tokens
    if (!secureTokenStorage.hasTokens()) {
        return false;
    }

    // If token is not expiring soon, we're good
    if (!secureTokenStorage.isExpired()) {
        return true;
    }

    // Use Web Locks API to prevent race conditions across tabs
    try {
        if ('locks' in navigator) {
            return await navigator.locks.request('nomad_token_refresh', async () => {
                // Re-check inside the lock
                if (!secureTokenStorage.isExpired()) {
                    return true;
                }
                return await performRefresh();
            });
        } else {
            return await performRefresh();
        }
    } catch (e) {
        console.error('[apiClient] Token refresh lock error:', e);
        return false;
    }
}

// Request interceptor - proactively refresh and add JWT token
apiClient.interceptors.request.use(
    async (config) => {
        // Skip proactive refresh for auth endpoints to avoid loops
        const isAuthEndpoint = config.url?.includes('/auth/');

        if (!isAuthEndpoint) {
            try {
                await ensureValidToken();
            } catch (e) {
                // Token refresh failed - continue without token
            }
        }

        // Add current token to request (from secure memory storage)
        const accessToken = await secureTokenStorage.getAccessToken();
        if (accessToken) {
            config.headers.Authorization = `Bearer ${accessToken}`;
        }

        return config;
    },
    (error) => Promise.reject(error)
);

// Response interceptor - handle 401 as fallback and panic mode
apiClient.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        // Handle Panic Mode (503 with PANIC_MODE_ACTIVE code)
        if (error.response?.status === 503 && error.response?.data?.code === 'PANIC_MODE_ACTIVE') {
            const panicError = new Error('Bocsi, a rendszer jelenleg pánik módban van! Csak olvasás lehetséges. Próbáld meg később.');
            (panicError as any).isPanicMode = true;
            (panicError as any).originalError = error;
            return Promise.reject(panicError);
        }

        // If 401 and not already retrying (fallback for edge cases)
        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;

            try {
                // Force refresh attempt
                const refreshed = await performRefresh();

                if (refreshed) {
                    const accessToken = await secureTokenStorage.getAccessToken();
                    // Retry original request with new token
                    originalRequest.headers.Authorization = `Bearer ${accessToken}`;
                    return apiClient(originalRequest);
                } else {
                    // Refresh failed completely - notify user
                    secureTokenStorage.clear();
                    dispatchSessionExpired();
                }
            } catch {
                // Refresh failed
                secureTokenStorage.clear();
                dispatchSessionExpired();
            }
        }

        return Promise.reject(error);
    }
);

/**
 * Start background token refresh timer
 * Checks every 15 seconds if token needs refresh (proactive refresh)
 */
let refreshInterval: ReturnType<typeof setInterval> | null = null;

export function startTokenRefreshTimer() {
    if (refreshInterval) return;

    // Regular interval check - every 15 seconds
    refreshInterval = setInterval(async () => {
        if (secureTokenStorage.hasTokens() && secureTokenStorage.isExpired()) {
            console.debug('[apiClient] Background token refresh triggered');
            await ensureValidToken();
        }
    }, 15000); // Check every 15 seconds for proactive refresh
}

export function stopTokenRefreshTimer() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }
}

// Auto-start timer
startTokenRefreshTimer();

/**
 * Add Event Listeners for Tab Visibility/Focus
 * Immediately check token validity when user returns to the tab
 */
function handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
        // Verify token immediately when tab becomes visible
        if (secureTokenStorage.hasTokens() && secureTokenStorage.isExpired()) {
            ensureValidToken().catch(console.error);
        }
    }
}

function handleWindowFocus() {
    // Also check on window focus (e.g. alt-tab back)
    if (secureTokenStorage.hasTokens() && secureTokenStorage.isExpired()) {
        ensureValidToken().catch(console.error);
    }
}

if (typeof window !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);
}

export default apiClient;
