/**
 * Auth Context
 * Global authentication state management with JWT tokens
 */

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { getMe, login as apiLogin, logout as apiLogout, register as apiRegister, tokenStorage } from '@/api/auth';
import type { User, LoginRequest, RegisterRequest, AuthResponse } from '@/api/auth.types';

// ==========================================
// TYPES
// ==========================================

interface AuthContextType {
    user: User | null;
    isLoading: boolean;
    isAuthenticated: boolean;
    error: string | null;
    login: (data: LoginRequest) => Promise<AuthResponse>;
    register: (data: RegisterRequest) => Promise<AuthResponse>;
    logout: (logoutAll?: boolean) => Promise<void>;
    refreshUser: () => Promise<void>;
    clearError: () => void;
}

// ==========================================
// CONTEXT
// ==========================================

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ==========================================
// PROVIDER
// ==========================================

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Check authentication on mount
    useEffect(() => {
        checkAuth();
    }, []);

    const checkAuth = async () => {
        // Check if we might have a session (localStorage marker or memory token)
        // Use hasTokens() which checks both memory and localStorage
        if (!tokenStorage.get()) {
            setIsLoading(false);
            return;
        }

        try {
            // getMe() uses apiClient which will automatically refresh token if needed
            const response = await getMe();
            if (response.success && response.user) {
                setUser(response.user);
            } else {
                tokenStorage.clear();
            }
        } catch {
            tokenStorage.clear();
        } finally {
            setIsLoading(false);
        }
    };

    const login = useCallback(async (data: LoginRequest): Promise<AuthResponse> => {
        setIsLoading(true);
        setError(null);

        try {
            const response = await apiLogin(data);

            if (response.success && response.user) {
                // Full login success
                setUser(response.user);
            } else if (response.requires_totp) {
                // TOTP required - this is not an error, just needs more input
                // Don't set error, let the Login page handle this
            } else if (!response.success) {
                // Actual error
                setError(response.error ?? 'Bejelentkezés sikertelen');
            }

            setIsLoading(false);
            return response;
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Bejelentkezés sikertelen';
            setError(errorMsg);
            setIsLoading(false);
            throw err;
        }
    }, []);

    const register = useCallback(async (data: RegisterRequest): Promise<AuthResponse> => {
        setIsLoading(true);
        setError(null);

        try {
            const response = await apiRegister(data);

            if (response.success && response.user) {
                setUser(response.user);
            } else {
                setError(response.errors?.join(', ') ?? response.error ?? 'Regisztráció sikertelen');
            }

            setIsLoading(false);
            return response;
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Regisztráció sikertelen';
            setError(errorMsg);
            setIsLoading(false);
            throw err;
        }
    }, []);

    const logout = useCallback(async (logoutAll = false) => {
        try {
            await apiLogout(logoutAll);
        } finally {
            setUser(null);
            setError(null);
        }
    }, []);

    const refreshUser = useCallback(async () => {
        try {
            const response = await getMe();
            if (response.success && response.user) {
                setUser(response.user);
            }
        } catch {
            // Ignore refresh errors
        }
    }, []);

    const clearError = useCallback(() => {
        setError(null);
    }, []);

    return (
        <AuthContext.Provider
            value={{
                user,
                isLoading,
                isAuthenticated: !!user,
                error,
                login,
                register,
                logout,
                refreshUser,
                clearError,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

// ==========================================
// HOOK
// ==========================================

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

export default AuthContext;
