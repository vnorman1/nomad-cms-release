import { createContext, useContext, useState, ReactNode, useCallback, useEffect } from 'react';
import { Toaster, ToastMessage, ToastType } from '../components/ui/Toaster';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { InputDialog } from '../components/ui/InputDialog';
import { getPreferences, NotificationLevel } from '../api/auth';

interface UIContextType {
    showToast: (type: ToastType, title: string, message?: string) => void;
    confirm: (options: ConfirmOptions) => void;
    prompt: (options: PromptOptions) => void;
    notificationLevel: NotificationLevel;
    setNotificationLevel: (level: NotificationLevel) => void;
}

interface ConfirmOptions {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    isDestructive?: boolean;
    onConfirm: () => void;
    onCancel?: () => void;
}

interface PromptOptions {
    title: string;
    message?: string;
    placeholder?: string;
    defaultValue?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: (value: string) => void;
    onCancel?: () => void;
}

const UIContext = createContext<UIContextType | undefined>(undefined);

/**
 * Check if a toast should be shown based on notification level
 */
function shouldShowToast(toastType: ToastType, level: NotificationLevel): boolean {
    switch (level) {
        case 'none':
            return false;
        case 'critical':
            // Only show errors
            return toastType === 'error';
        case 'normal':
            // Show success, error, warning (skip info)
            return toastType !== 'info';
        case 'all':
        default:
            return true;
    }
}

export function UIProvider({ children }: { children: ReactNode }) {
    // Toast State
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    const [notificationLevel, setNotificationLevel] = useState<NotificationLevel>('all');

    // Load notification level from preferences on mount
    useEffect(() => {
        getPreferences().then(response => {
            if (response.success && response.preferences.notification_level) {
                setNotificationLevel(response.preferences.notification_level);
            }
        }).catch(() => {
            // Ignore errors, use default 'all'
        });
    }, []);

    const removeToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const showToast = useCallback((type: ToastType, title: string, message?: string) => {
        // Check notification level before showing
        if (!shouldShowToast(type, notificationLevel)) {
            return;
        }

        const id = Math.random().toString(36).substring(7);
        setToasts(prev => [...prev, { id, type, title, message }]);
        setTimeout(() => removeToast(id), 5000); // Auto remove after 5s
    }, [removeToast, notificationLevel]);

    // Confirm Dialog State
    const [confirmState, setConfirmState] = useState<{
        isOpen: boolean;
        options: ConfirmOptions;
    }>({
        isOpen: false,
        options: {
            title: '',
            message: '',
            onConfirm: () => { },
        }
    });

    const confirm = useCallback((options: ConfirmOptions) => {
        setConfirmState({
            isOpen: true,
            options,
        });
    }, []);

    const handleConfirm = useCallback(() => {
        confirmState.options.onConfirm();
        setConfirmState(prev => ({ ...prev, isOpen: false }));
    }, [confirmState.options]);

    const handleCancel = useCallback(() => {
        if (confirmState.options.onCancel) {
            confirmState.options.onCancel();
        }
        setConfirmState(prev => ({ ...prev, isOpen: false }));
    }, [confirmState.options]);

    // Input Dialog State
    const [promptState, setPromptState] = useState<{
        isOpen: boolean;
        options: PromptOptions;
    }>({
        isOpen: false,
        options: {
            title: '',
            onConfirm: () => { },
        }
    });

    const prompt = useCallback((options: PromptOptions) => {
        setPromptState({
            isOpen: true,
            options,
        });
    }, []);

    const handlePromptConfirm = useCallback((value: string) => {
        promptState.options.onConfirm(value);
        setPromptState(prev => ({ ...prev, isOpen: false }));
    }, [promptState.options]);

    const handlePromptCancel = useCallback(() => {
        if (promptState.options.onCancel) {
            promptState.options.onCancel();
        }
        setPromptState(prev => ({ ...prev, isOpen: false }));
    }, [promptState.options]);

    return (
        <UIContext.Provider value={{ showToast, confirm, prompt, notificationLevel, setNotificationLevel }}>
            {children}
            <Toaster toasts={toasts} removeToast={removeToast} />
            <ConfirmDialog
                isOpen={confirmState.isOpen}
                title={confirmState.options.title}
                message={confirmState.options.message}
                confirmLabel={confirmState.options.confirmLabel}
                cancelLabel={confirmState.options.cancelLabel}
                isDestructive={confirmState.options.isDestructive}
                onConfirm={handleConfirm}
                onCancel={handleCancel}
            />
            <InputDialog
                isOpen={promptState.isOpen}
                title={promptState.options.title}
                message={promptState.options.message}
                placeholder={promptState.options.placeholder}
                defaultValue={promptState.options.defaultValue}
                confirmLabel={promptState.options.confirmLabel}
                cancelLabel={promptState.options.cancelLabel}
                onConfirm={handlePromptConfirm}
                onCancel={handlePromptCancel}
            />
        </UIContext.Provider>
    );
}

export function useUI() {
    const context = useContext(UIContext);
    if (context === undefined) {
        throw new Error('useUI must be used within a UIProvider');
    }
    return context;
}


