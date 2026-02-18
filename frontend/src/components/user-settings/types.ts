import { UserSettings as UserSettingsType } from '@/api/auth';

export interface TabProps {
    settings: UserSettingsType;
    onUpdate: () => void;
    setError: (error: string | null) => void;
    setSuccess: (success: string | null) => void;
}

// For tabs that don't need settings/onUpdate
export type SimpleTabProps = Pick<TabProps, 'setError' | 'setSuccess'>;

