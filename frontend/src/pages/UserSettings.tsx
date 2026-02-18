/**
 * User Settings Page
 * Profile settings, security (TOTP, Passkeys), and authentication preferences
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    User, Shield, Key, AlertTriangle, Check, Settings as SettingsIcon, Loader2, Database, Sparkles, AlertOctagon, Hammer, HardDrive, Bell, Download
} from 'lucide-react';
import {
    getSettings,
    type UserSettings as UserSettingsType
} from '@/api/auth';
import { GeneralTab } from '../components/user-settings/GeneralTab';
import { SecurityTab } from '../components/user-settings/SecurityTab';
import { PreferencesTab } from '../components/user-settings/PreferencesTab';
import { BackupTab } from '../components/user-settings/BackupTab';
import { ApiTab } from '../components/user-settings/ApiTab';
import { GeminiAITab } from '../components/user-settings/GeminiAITab';
import { PanicTab } from '../components/user-settings/PanicTab';
import { ForgeTab } from '../components/user-settings/ForgeTab';
import { CacheTab } from '../components/user-settings/CacheTab';
import { UpdatesTab } from '../components/user-settings/UpdatesTab';
import { UpdateSystemTab } from '../components/user-settings/UpdateSystemTab';
import { useAuth } from '@/context/AuthContext';

// ==========================================
// TABS CONFIG
// ==========================================

interface TabConfig {
    id: 'general' | 'security' | 'preferences' | 'notifications' | 'api' | 'backup' | 'gemini' | 'panic' | 'forge' | 'cache' | 'updates' | 'system-update';
    label: string;
    icon: typeof User;
    adminOnly?: boolean;
    danger?: boolean;
}

const TABS: TabConfig[] = [
    { id: 'general', label: 'Általános', icon: User },
    { id: 'security', label: 'Biztonság', icon: Shield },
    { id: 'preferences', label: 'Preferenciák', icon: SettingsIcon },
    { id: 'gemini', label: 'Nomi AI', icon: Sparkles },
    { id: 'updates', label: 'Frissítések', icon: Bell },
    { id: 'api', label: 'API Kulcsok', icon: Key, adminOnly: true },
    { id: 'cache', label: 'Cache és Verzió', icon: HardDrive, adminOnly: true },
    { id: 'backup', label: 'Biztonsági Mentés', icon: Database, adminOnly: true },
    { id: 'system-update', label: 'Rendszerfrissítés', icon: Download, adminOnly: true },
    { id: 'forge', label: 'Forge Migráció', icon: Hammer, adminOnly: true },
    { id: 'panic', label: 'Pánik Mód', icon: AlertOctagon, adminOnly: true, danger: true },
];

type TabId = TabConfig['id'];

// ==========================================
// MAIN COMPONENT
// ==========================================

export default function UserSettings() {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<TabId>('general');
    const [settings, setSettings] = useState<UserSettingsType | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Timer refs for auto-dismiss
    const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Auto-dismiss error after 5 seconds
    useEffect(() => {
        if (error) {
            if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
            errorTimerRef.current = setTimeout(() => setError(null), 5000);
        }
        return () => {
            if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
        };
    }, [error]);

    // Auto-dismiss success after 5 seconds
    useEffect(() => {
        if (success) {
            if (successTimerRef.current) clearTimeout(successTimerRef.current);
            successTimerRef.current = setTimeout(() => setSuccess(null), 5000);
        }
        return () => {
            if (successTimerRef.current) clearTimeout(successTimerRef.current);
        };
    }, [success]);

    // Load settings
    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            setLoading(true);
            const response = await getSettings();
            if (response.success && response.settings) {
                setSettings(response.settings);
            }
        } catch (err) {
            setError('Beállítások betöltése sikertelen');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="w-6 h-6 animate-spin opacity-50" />
            </div>
        );
    }

    // Filter tabs based on user permissions
    const visibleTabs = TABS.filter(tab => !tab.adminOnly || user?.is_admin);

    return (
        <div className="max-w-4xl mx-auto">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight mb-2">Beállítások</h1>
                <p className="text-sm opacity-60 font-mono uppercase tracking-widest">
                    Fiókbeállítások és biztonság
                </p>
            </div>

            {/* Status Messages */}
            <AnimatePresence mode="sync">
                {error && (
                    <motion.div
                        key="error"
                        initial={{ opacity: 0, y: -10, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: 'auto' }}
                        exit={{ opacity: 0, y: -10, height: 0 }}
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                        className="mb-6 overflow-hidden"
                    >
                        <div className="p-4 border border-destructive/50 bg-destructive/10 text-destructive flex items-center gap-3">
                            <AlertTriangle size={16} />
                            <span className="text-sm">{error}</span>
                            <button onClick={() => setError(null)} className="ml-auto opacity-60 hover:opacity-100">×</button>
                        </div>
                    </motion.div>
                )}

                {success && (
                    <motion.div
                        key="success"
                        initial={{ opacity: 0, y: -10, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: 'auto' }}
                        exit={{ opacity: 0, y: -10, height: 0 }}
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                        className="mb-6 overflow-hidden"
                    >
                        <div className="p-4 border border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center gap-3">
                            <Check size={16} />
                            <span className="text-sm">{success}</span>
                            <button onClick={() => setSuccess(null)} className="ml-auto opacity-60 hover:opacity-100">×</button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Layout Container */}
            <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 min-h-[500px]">
                {/* Vertical Sidebar Tabs */}
                <div className="w-full lg:w-64 shrink-0 space-y-1">
                    {visibleTabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-mono uppercase tracking-widest transition-all text-left border-l-2 ${activeTab === tab.id
                                ? tab.danger
                                    ? 'border-red-500 bg-red-500/5 opacity-100 text-red-500'
                                    : 'border-foreground bg-foreground/5 opacity-100'
                                : tab.danger
                                    ? 'border-transparent opacity-40 hover:opacity-100 hover:bg-red-500/5 hover:text-red-500'
                                    : 'border-transparent opacity-40 hover:opacity-100 hover:bg-foreground/5'
                                }`}
                        >
                            <tab.icon size={14} />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Content Area */}
                <div className="flex-1 min-w-0">
                    <motion.div
                        key={activeTab}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3 }}
                    >
                        {activeTab === 'general' && settings && (
                            <GeneralTab
                                settings={settings}
                                onUpdate={loadSettings}
                                setError={setError}
                                setSuccess={setSuccess}
                            />
                        )}
                        {activeTab === 'security' && settings && (
                            <SecurityTab
                                settings={settings}
                                onUpdate={loadSettings}
                                setError={setError}
                                setSuccess={setSuccess}
                            />
                        )}
                        {activeTab === 'preferences' && settings && (
                            <PreferencesTab
                                settings={settings}
                                onUpdate={loadSettings}
                                setError={setError}
                                setSuccess={setSuccess}
                            />
                        )}
                        {activeTab === 'api' && user?.is_admin && settings && (
                            <ApiTab
                                settings={settings}
                                onUpdate={loadSettings}
                                setError={setError}
                                setSuccess={setSuccess}
                            />
                        )}
                        {activeTab === 'gemini' && settings && (
                            <GeminiAITab
                                settings={settings}
                                onUpdate={loadSettings}
                                setError={setError}
                                setSuccess={setSuccess}
                            />
                        )}
                        {activeTab === 'backup' && user?.is_admin && settings && (
                            <BackupTab
                                settings={settings}
                                onUpdate={loadSettings}
                                setError={setError}
                                setSuccess={setSuccess}
                            />
                        )}
                        {activeTab === 'panic' && user?.is_admin && settings && (
                            <PanicTab
                                settings={settings}
                                onUpdate={loadSettings}
                                setError={setError}
                                setSuccess={setSuccess}
                            />
                        )}
                        {activeTab === 'forge' && user?.is_admin && settings && (
                            <ForgeTab
                                settings={settings}
                                onUpdate={loadSettings}
                                setError={setError}
                                setSuccess={setSuccess}
                            />
                        )}
                        {activeTab === 'cache' && user?.is_admin && (
                            <CacheTab
                                setError={setError}
                                setSuccess={setSuccess}
                            />
                        )}
                        {activeTab === 'updates' && (
                            <UpdatesTab
                                setError={setError}
                                setSuccess={setSuccess}
                            />
                        )}
                        {activeTab === 'system-update' && user?.is_admin && (
                            <UpdateSystemTab
                                setError={setError}
                                setSuccess={setSuccess}
                            />
                        )}
                    </motion.div>
                </div>
            </div>
        </div>
    );
}
