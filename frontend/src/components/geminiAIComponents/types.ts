import { ADMIN_CONFIG } from '@/config/admin.config';
import type { PendingAction } from '@/context/AiContext';

// -----------------------------------------------------------------------------
// TYPES
// -----------------------------------------------------------------------------

export interface Message {
    id: string;
    role: 'user' | 'ai' | 'system';
    content: string;
    timestamp: Date;
    type?: 'text' | 'code' | 'action' | 'error' | 'confirm';
    metadata?: {
        schema?: string;
        count?: number;
        generatedData?: Record<string, unknown> | Record<string, unknown>[];
        formId?: string;
        tokens?: number;
        pendingAction?: PendingAction;
    };
}

export interface FormContext {
    slotKey: string;
    config: typeof ADMIN_CONFIG[keyof typeof ADMIN_CONFIG];
    currentData?: Record<string, unknown>;
    editingIndex?: number | null;
}

export interface ChatbotProps {
    formContext?: FormContext;
    onFillForm?: (data: Record<string, unknown> | Record<string, unknown>[]) => void;
}

// Session storage keys
export const STORAGE_KEYS = {
    messages: 'ai_chat_messages',
    history: 'ai_chat_history',
    tokenCount: 'ai_token_count',
    pendingAutoGenerate: 'ai_pending_auto_generate'
} as const;
