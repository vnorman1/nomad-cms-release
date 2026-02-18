import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { ADMIN_CONFIG } from '@/config/admin.config';

/**
 * usePageTitle hook
 * Updates the document title based on the current route.
 * Format: Nomad | [Page Label]
 */
export function usePageTitle() {
    const location = useLocation();

    useEffect(() => {
        const path = location.pathname;
        let pageLabel = '';

        // Determine label based on path
        if (path === '/') {
            pageLabel = 'Áttekintés';
        } else if (path.startsWith('/edit/')) {
            const slotKey = path.split('/')[2];
            const slotConfig = ADMIN_CONFIG[slotKey];
            pageLabel = slotConfig?.label || 'Szerkesztő';
        } else if (path === '/users') {
            pageLabel = 'Felhasználók';
        } else if (path === '/settings') {
            pageLabel = 'Beállítások';
        } else if (path === '/logs') {
            pageLabel = 'Rendszernapló';
        } else if (path === '/media') {
            pageLabel = 'Médiatár';
        } else if (path === '/webhooks') {
            pageLabel = 'Webhookok';
        } else if (path === '/install') {
            pageLabel = 'Telepítés';
        } else if (path === '/login') {
            pageLabel = 'Bejelentkezés';
        } else if (path.includes('/dev/schema-validator')) {
            pageLabel = 'Schema Validator';
        }

        // Set title
        if (pageLabel) {
            document.title = `Nomad | ${pageLabel}`;
        } else {
            document.title = 'Nomad CMS';
        }
    }, [location]);
}
