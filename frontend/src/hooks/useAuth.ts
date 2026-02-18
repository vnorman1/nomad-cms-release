/**
 * useAuth Hook
 * Authentication state management with JWT tokens
 */

import { useState, useEffect, useCallback } from 'react';
import { getMe, login, logout, register, tokenStorage } from '@/api/auth';
import type { User, LoginRequest, RegisterRequest, AuthResponse } from '@/api/auth.types';

interface AuthState {
    user: User | null;
    isLoading: boolean;
    isAuthenticated: boolean;
    error: string | null;
}

export function useAuth() {
    const [state, setState] = useState<AuthState>({
        user: null,
        isLoading: true,
        isAuthenticated: false,
        error: null,
    });

    // Check authentication on mount
    useEffect(() => {
        checkAuth();
    }, []);

    const checkAuth = useCallback(async () => {
        // Check if we might have a session (localStorage marker or memory token)
        if (!tokenStorage.get()) {
            setState({ user: null, isLoading: false, isAuthenticated: false, error: null });
            return;
        }

        try {
            // getMe() uses apiClient which will automatically refresh token if needed
            const response = await getMe();
            if (response.success && response.user) {
                setState({
                    user: response.user,
                    isLoading: false,
                    isAuthenticated: true,
                    error: null,
                });
            } else {
                tokenStorage.clear();
                setState({ user: null, isLoading: false, isAuthenticated: false, error: null });
            }
        } catch {
            tokenStorage.clear();
            setState({ user: null, isLoading: false, isAuthenticated: false, error: null });
        }
    }, []);

    const handleLogin = useCallback(async (data: LoginRequest): Promise<AuthResponse> => {
        setState(prev => ({ ...prev, isLoading: true, error: null }));

        try {
            const response = await login(data);

            if (response.success && response.user) {
                setState({
                    user: response.user,
                    isLoading: false,
                    isAuthenticated: true,
                    error: null,
                });
            } else {
                setState(prev => ({
                    ...prev,
                    isLoading: false,
                    error: response.error ?? 'Login failed',
                }));
            }

            return response;
        } catch (err) {
            const error = err instanceof Error ? err.message : 'Login failed';
            setState(prev => ({ ...prev, isLoading: false, error }));
            throw err;
        }
    }, []);

    const handleRegister = useCallback(async (data: RegisterRequest): Promise<AuthResponse> => {
        setState(prev => ({ ...prev, isLoading: true, error: null }));

        try {
            const response = await register(data);

            if (response.success && response.user) {
                setState({
                    user: response.user,
                    isLoading: false,
                    isAuthenticated: true,
                    error: null,
                });
            } else {
                setState(prev => ({
                    ...prev,
                    isLoading: false,
                    error: response.errors?.join(', ') ?? response.error ?? 'Registration failed',
                }));
            }

            return response;
        } catch (err) {
            const error = err instanceof Error ? err.message : 'Registration failed';
            setState(prev => ({ ...prev, isLoading: false, error }));
            throw err;
        }
    }, []);

    const handleLogout = useCallback(async (logoutAll = false) => {
        try {
            await logout(logoutAll);
        } finally {
            setState({ user: null, isLoading: false, isAuthenticated: false, error: null });
        }
    }, []);

    const refreshUser = useCallback(async () => {
        try {
            const response = await getMe();
            if (response.success && response.user) {
                setState(prev => ({ ...prev, user: response.user! }));
            }
        } catch {
            // Ignore refresh errors
        }
    }, []);

    return {
        ...state,
        login: handleLogin,
        register: handleRegister,
        logout: handleLogout,
        refreshUser,
        checkAuth,
    };
}

export default useAuth;
