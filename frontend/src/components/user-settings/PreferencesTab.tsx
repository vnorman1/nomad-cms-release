import { useState, useEffect } from 'react';
import { Moon, Sun, Monitor, Save, Loader2, Bell, BellOff, BellRing } from 'lucide-react';
import { TabProps } from './types';
import { getPreferences, updatePreferences, NotificationLevel } from '@/api/auth';
import { useUI } from '@/context/UIContext';

type ThemeOption = 'light' | 'dark' | 'system';

const NOTIFICATION_OPTIONS: { id: NotificationLevel; label: string; description: string; icon: typeof Bell }[] = [
    { id: 'all', label: 'Minden', description: 'Minden értesítés megjelenik', icon: BellRing },
    { id: 'normal', label: 'Normál', description: 'Mentés, törlés, figyelmeztetések', icon: Bell },
    { id: 'critical', label: 'Csak hibák', description: 'Csak hibaüzenetek', icon: Bell },
    { id: 'none', label: 'Kikapcsolva', description: 'Nincs értesítés', icon: BellOff },
];

export function PreferencesTab({ setError, setSuccess }: TabProps) {
    const { setNotificationLevel: setGlobalNotificationLevel } = useUI();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [theme, setTheme] = useState<ThemeOption>('system');
    const [notificationLevel, setNotificationLevel] = useState<NotificationLevel>('all');
    const [hasChanges, setHasChanges] = useState(false);
    const [initialTheme, setInitialTheme] = useState<ThemeOption>('system');
    const [initialNotificationLevel, setInitialNotificationLevel] = useState<NotificationLevel>('all');

    // Load preferences on mount
    useEffect(() => {
        loadPreferences();
    }, []);

    const loadPreferences = async () => {
        try {
            setLoading(true);
            const response = await getPreferences();
            if (response.success) {
                // If no theme in preferences, it means 'system'
                const savedTheme = response.preferences.theme || 'system';
                const savedNotificationLevel = response.preferences.notification_level || 'all';
                setTheme(savedTheme);
                setInitialTheme(savedTheme);
                setNotificationLevel(savedNotificationLevel);
                setInitialNotificationLevel(savedNotificationLevel);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Preferenciák betöltése sikertelen');
        } finally {
            setLoading(false);
        }
    };

    const checkForChanges = (newTheme: ThemeOption, newNotificationLevel: NotificationLevel) => {
        setHasChanges(newTheme !== initialTheme || newNotificationLevel !== initialNotificationLevel);
    };

    const handleThemeChange = (newTheme: ThemeOption) => {
        setTheme(newTheme);
        checkForChanges(newTheme, notificationLevel);

        // Apply theme immediately for preview
        applyTheme(newTheme);
    };

    const handleNotificationLevelChange = (newLevel: NotificationLevel) => {
        setNotificationLevel(newLevel);
        checkForChanges(theme, newLevel);

        // Apply immediately for preview
        setGlobalNotificationLevel(newLevel);
    };

    const applyTheme = (selectedTheme: ThemeOption) => {
        const root = document.documentElement;

        let shouldBeDark = false;

        if (selectedTheme === 'system') {
            // Use system preference
            shouldBeDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        } else {
            shouldBeDark = selectedTheme === 'dark';
        }

        // Explicit add/remove for reliable toggling
        if (shouldBeDark) {
            root.classList.add('dark');
        } else {
            root.classList.remove('dark');
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        setSuccess(null);

        try {
            // Convert 'system' to undefined for API (backend expects null/undefined for system)
            const apiTheme = theme === 'system' ? null : theme;
            const response = await updatePreferences({
                theme: apiTheme as 'light' | 'dark' | undefined,
                notification_level: notificationLevel,
            });

            if (response.success) {
                setSuccess('Preferenciák mentve');
                setInitialTheme(theme);
                setInitialNotificationLevel(notificationLevel);
                setHasChanges(false);

                // Also persist to localStorage for initial page load
                if (theme === 'system') {
                    localStorage.removeItem('nomad_theme');
                } else {
                    localStorage.setItem('nomad_theme', theme);
                }
            } else {
                setError(response.error || 'Mentés sikertelen');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Mentés sikertelen');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12 opacity-50">
                <Loader2 size={20} className="animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Appearance Section */}
            <div className="border border-border p-6">
                <h3 className="text-sm font-mono uppercase tracking-widest mb-4 opacity-60 flex items-center gap-2">
                    <Moon size={14} />
                    Megjelenés
                </h3>
                <div className="grid grid-cols-3 gap-4 max-w-lg">
                    {([
                        { id: 'light', label: 'Világos', icon: Sun },
                        { id: 'dark', label: 'Sötét', icon: Moon },
                        { id: 'system', label: 'Rendszer', icon: Monitor },
                    ] as const).map((item) => (
                        <button
                            key={item.id}
                            onClick={() => handleThemeChange(item.id)}
                            className={`flex flex-col items-center justify-center gap-3 p-4 border transition-all h-32 ${theme === item.id
                                ? 'border-foreground bg-foreground/5'
                                : 'border-border opacity-60 hover:opacity-100 hover:border-foreground/50'
                                }`}
                        >
                            <item.icon size={24} strokeWidth={1.5} />
                            <span className="text-xs font-mono uppercase tracking-widest">{item.label}</span>
                        </button>
                    ))}
                </div>
                <p className="text-xs opacity-40 mt-4">
                    A "Rendszer" opció a böngésző/OS beállításait követi.
                </p>
            </div>

            {/* Notifications Section */}
            <div className="border border-border p-6">
                <h3 className="text-sm font-mono uppercase tracking-widest mb-4 opacity-60 flex items-center gap-2">
                    <Bell size={14} />
                    Értesítések
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {NOTIFICATION_OPTIONS.map((option) => (
                        <button
                            key={option.id}
                            onClick={() => handleNotificationLevelChange(option.id)}
                            className={`flex flex-col items-center justify-center gap-3 p-4 border transition-all h-32 ${notificationLevel === option.id
                                ? 'border-foreground bg-foreground/5'
                                : 'border-border opacity-60 hover:opacity-100 hover:border-foreground/50'
                                }`}
                        >
                            <option.icon size={24} strokeWidth={1.5} />
                            <span className="text-xs font-mono uppercase tracking-widest text-center">{option.label}</span>
                        </button>
                    ))}
                </div>
                <p className="text-xs opacity-40 mt-4">
                    Állítsd be, milyen gyakran láss felugró értesítéseket.
                </p>
            </div>

            {/* Action Bar */}
            <div className="flex justify-end pt-4">
                <button
                    onClick={handleSave}
                    disabled={saving || !hasChanges}
                    className="px-6 py-3 bg-foreground text-background font-mono text-xs uppercase tracking-widest disabled:opacity-30 hover:opacity-90 transition-opacity flex items-center gap-3"
                >
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    Beállítások Mentése
                </button>
            </div>
        </div>
    );
}

