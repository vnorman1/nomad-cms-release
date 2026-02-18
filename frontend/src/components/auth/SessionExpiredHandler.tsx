/**
 * SessionExpiredHandler
 * Handles session expiry at app level - displays modal before redirect
 * This component MUST be mounted at App.tsx level to work correctly
 */
import { useState, useEffect, useCallback } from 'react';
import { SESSION_EXPIRED_EVENT } from '@/api/client';
import { tokenStorage } from '@/api/auth';
import { SessionExpiredModal } from '@/components/ui/SessionExpiredModal';

export function SessionExpiredHandler() {
    const [sessionExpired, setSessionExpired] = useState(false);

    // Listen for session expired events
    useEffect(() => {
        const handleSessionExpired = () => {
            setSessionExpired(true);
        };

        window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
        return () => {
            window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
        };
    }, []);

    const handleLogin = useCallback(() => {
        setSessionExpired(false);
        tokenStorage.clear();
        // Use window.location instead of navigate to ensure full page reload
        // and avoid React Router state issues during redirect
        // BASE_URL includes the /nomad/ prefix
        const basePath = import.meta.env.BASE_URL || '/';
        window.location.href = `${basePath}login`;
    }, []);

    return (
        <SessionExpiredModal
            isOpen={sessionExpired}
            onLogin={handleLogin}
        />
    );
}
