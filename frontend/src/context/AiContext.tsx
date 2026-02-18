/**
 * AI Context - Manages AI state and form integration
 * Provides AI functionality across the application
 * 
 * SIMPLIFIED VERSION - No session storage, in-memory only
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { getAiSettings } from '@/api/auth';

// Pending action types for AI agent
interface PendingAction {
    type: 'create_new_item' | 'edit_existing' | 'delete_item' | 'move_item' | 'bulk_delete';
    slotKey: string;
    slotLabel: string;
    pendingData?: Record<string, unknown>;
    originalUserMessage?: string;
    // For delete/move operations
    target?: 'first' | 'last' | number | string; // index, name, or position
    position?: 'first' | 'last' | 'up' | 'down' | number; // for move operation
    filter?: Record<string, unknown>; // for bulk operations
    // Confirmation flag - destructive actions only execute when this is true
    confirmed?: boolean;
}

// Queue for sequential multi-item generation
interface GenerationQueue {
    totalCount: number;
    remainingCount: number;
    slotKey: string;
    slotLabel: string;
    originalMessage: string;
}

interface AiContextType {
    // Status
    aiEnabled: boolean | null;
    hasApiKey: boolean;
    isLoading: boolean;
    maxTokens: number;
    selectedModel: string | null;
    setSelectedModel: (model: string | null) => void;

    // Form integration
    activeFormContext: FormContext | null;
    setActiveFormContext: (context: FormContext | null) => void;

    // Pending action system
    pendingAction: PendingAction | null;
    setPendingAction: (action: PendingAction | null) => void;

    // Auto-generate flag
    autoGenerateRequest: string | null;
    setAutoGenerateRequest: (request: string | null) => void;

    // Sequential multi-generation queue
    generationQueue: GenerationQueue | null;
    setGenerationQueue: (queue: GenerationQueue | null) => void;
    advanceGenerationQueue: () => void;

    // Programmatic send capability
    registerSendHandler: (handler: (message: string) => Promise<void>) => void;
    executeSend: (message: string) => Promise<boolean>;
    isAutoGenerating: boolean;
    setIsAutoGenerating: (value: boolean) => void;

    // Refresh
    refreshAiStatus: () => Promise<void>;
}

interface FormContext {
    slotKey: string;
    config: {
        label: string;
        type: string;
        fields: Array<{
            id: string;
            label: string;
            type: string;
            required?: boolean;
            options?: Array<{ value: string; label: string }>;
        }>;
    };
    currentData?: Record<string, unknown>;
    editingIndex?: number | null;
    onFillForm?: (data: Record<string, unknown> | Record<string, unknown>[]) => void;
}

const AiContext = createContext<AiContextType | null>(null);

export function AiProvider({ children }: { children: React.ReactNode }) {
    const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);
    const [hasApiKey, setHasApiKey] = useState(false);
    const [maxTokens, setMaxTokens] = useState(4096);
    const [selectedModel, setSelectedModel] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [activeFormContext, setActiveFormContext] = useState<FormContext | null>(null);

    // Simple in-memory state - NO session storage
    const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
    const [autoGenerateRequest, setAutoGenerateRequest] = useState<string | null>(null);
    const [isAutoGenerating, setIsAutoGenerating] = useState(false);

    // Sequential multi-generation queue
    const [generationQueue, setGenerationQueue] = useState<GenerationQueue | null>(null);

    // Advance the generation queue (decrement remaining count)
    const advanceGenerationQueue = useCallback(() => {
        setGenerationQueue(prev => {
            if (!prev) return null;
            const newRemaining = prev.remainingCount - 1;
            console.log('[AiContext] advanceGenerationQueue:', {
                total: prev.totalCount,
                remaining: newRemaining
            });
            if (newRemaining <= 0) {
                return null; // Clear queue when done
            }
            return { ...prev, remainingCount: newRemaining };
        });
    }, []);

    // Programmatic send handler (registered by useChat)
    const sendHandlerRef = useRef<((message: string) => Promise<void>) | null>(null);

    // Register send handler from useChat
    const registerSendHandler = useCallback((handler: (message: string) => Promise<void>) => {
        sendHandlerRef.current = handler;
    }, []);

    // Execute send programmatically
    const executeSend = useCallback(async (message: string): Promise<boolean> => {
        if (!sendHandlerRef.current) {
            console.error('[AiContext] executeSend failed: no send handler registered');
            return false;
        }

        try {
            await sendHandlerRef.current(message);
            return true;
        } catch (error) {
            console.error('[AiContext] executeSend error:', error);
            return false;
        }
    }, []);

    const refreshAiStatus = useCallback(async () => {
        try {
            setIsLoading(true);
            const response = await getAiSettings();
            if (response.success && response.ai_settings) {
                setAiEnabled(response.ai_settings.ai_enabled);
                setHasApiKey(response.ai_settings.has_api_key);
                setMaxTokens(response.ai_settings.ai_max_tokens ?? 4096);
                setSelectedModel(response.ai_settings.ai_selected_model ?? null);
            } else {
                setAiEnabled(false);
                setHasApiKey(false);
                setMaxTokens(4096);
                setSelectedModel(null);
            }
        } catch {
            setAiEnabled(false);
            setHasApiKey(false);
            setMaxTokens(4096);
            setSelectedModel(null);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Check AI status on mount
    useEffect(() => {
        refreshAiStatus();
    }, [refreshAiStatus]);

    const value: AiContextType = {
        aiEnabled,
        hasApiKey,
        isLoading,
        maxTokens,
        selectedModel,
        setSelectedModel,
        activeFormContext,
        setActiveFormContext,
        pendingAction,
        setPendingAction,
        autoGenerateRequest,
        setAutoGenerateRequest,
        generationQueue,
        setGenerationQueue,
        advanceGenerationQueue,
        registerSendHandler,
        executeSend,
        isAutoGenerating,
        setIsAutoGenerating,
        refreshAiStatus,
    };

    return <AiContext.Provider value={value}>{children}</AiContext.Provider>;
}

export function useAi() {
    const context = useContext(AiContext);
    if (!context) {
        throw new Error('useAi must be used within an AiProvider');
    }
    return context;
}

export type { FormContext, PendingAction };
