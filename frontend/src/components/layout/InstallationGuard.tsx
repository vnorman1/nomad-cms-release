/**
 * Installation Guard Component
 * Redirects to /install if the system is not yet installed
 */

import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { checkInstallationStatus } from '@/api/install';

// ==========================================
// TYPES
// ==========================================

interface InstallationContextType {
    isInstalled: boolean;
    isChecking: boolean;
    recheckInstallation: () => Promise<void>;
}

// ==========================================
// CONTEXT
// ==========================================

const InstallationContext = createContext<InstallationContextType | undefined>(undefined);

export function useInstallation() {
    const context = useContext(InstallationContext);
    if (!context) {
        throw new Error('useInstallation must be used within InstallationGuard');
    }
    return context;
}

// ==========================================
// GUARD COMPONENT
// ==========================================

export function InstallationGuard({ children }: { children: ReactNode }) {
    const [isInstalled, setIsInstalled] = useState<boolean | null>(null);
    const [isChecking, setIsChecking] = useState(true);
    const navigate = useNavigate();
    const location = useLocation();

    const checkInstallation = async () => {
        try {
            const status = await checkInstallationStatus();
            setIsInstalled(status.installed);
            return status.installed;
        } catch (err) {
            console.error('[InstallationGuard] Status check failed:', err);
            // Assume not installed if check fails
            setIsInstalled(false);
            return false;
        } finally {
            setIsChecking(false);
        }
    };

    const recheckInstallation = async () => {
        setIsChecking(true);
        await checkInstallation();
    };

    useEffect(() => {
        checkInstallation().then((installed) => {
            // If not installed and not already on /install, redirect
            if (!installed && location.pathname !== '/install') {
                navigate('/install', { replace: true });
            }
            // If installed and on /install, redirect to login
            else if (installed && location.pathname === '/install') {
                navigate('/login', { replace: true });
            }
        });
    }, []);

    // Watch for location changes
    useEffect(() => {
        if (isInstalled === null) return; // Still checking

        // If not installed and trying to go anywhere except /install, redirect
        if (!isInstalled && location.pathname !== '/install') {
            navigate('/install', { replace: true });
        }
        // If installed and trying to go to /install, redirect to login
        else if (isInstalled && location.pathname === '/install') {
            navigate('/login', { replace: true });
        }
    }, [location.pathname, isInstalled, navigate]);

    // Show loading while checking installation status
    if (isChecking || isInstalled === null) {
        return (
            <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-4">
                <div
                    className="fixed inset-0 pointer-events-none opacity-[0.03]"
                    style={{
                        backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
                        backgroundSize: '40px 40px',
                    }}
                />
                <div className="text-center relative z-10">
                    <Loader2 size={24} className="animate-spin mx-auto mb-4 opacity-50" />
                    <p className="text-xs font-mono uppercase tracking-[0.2em] opacity-40">
                        Rendszer inicializálása...
                    </p>
                </div>
            </div>
        );
    }

    return (
        <InstallationContext.Provider value={{ isInstalled, isChecking, recheckInstallation }}>
            {children}
        </InstallationContext.Provider>
    );
}
