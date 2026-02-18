/**
 * Version Context
 * 
 * Provides centralized access to the CMS version across all components.
 * Fetches version from backend and caches it.
 */

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getSystemVersion, SystemVersionInfo } from '@/api/systemUpdate';

interface VersionContextType {
    version: string;
    buildDate: string;
    codename: string;
    loading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
}

const defaultContext: VersionContextType = {
    version: '1.0.0',
    buildDate: '',
    codename: '',
    loading: true,
    error: null,
    refresh: async () => { },
};

const VersionContext = createContext<VersionContextType>(defaultContext);

export function VersionProvider({ children }: { children: ReactNode }) {
    const [versionInfo, setVersionInfo] = useState<SystemVersionInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadVersion = async () => {
        try {
            setLoading(true);
            setError(null);
            const info = await getSystemVersion();
            setVersionInfo(info);
        } catch (err) {
            console.error('Failed to load version:', err);
            setError('Nem sikerült lekérdezni a verziót');
            // Use fallback version
            setVersionInfo({
                version: '1.0.0',
                buildDate: new Date().toISOString().split('T')[0],
                codename: 'Genesis',
            });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadVersion();
    }, []);

    return (
        <VersionContext.Provider
            value={{
                version: versionInfo?.version ?? '1.0.0',
                buildDate: versionInfo?.buildDate ?? '',
                codename: versionInfo?.codename ?? '',
                loading,
                error,
                refresh: loadVersion,
            }}
        >
            {children}
        </VersionContext.Provider>
    );
}

export function useVersion() {
    return useContext(VersionContext);
}

export { VersionContext };
