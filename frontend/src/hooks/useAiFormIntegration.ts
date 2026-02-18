/**
 * useAiFormIntegration - Hook for AI form filling integration
 * Connects forms with the AI chatbot for intelligent content generation
 */

import { useEffect, useCallback } from 'react';
import { useAi, type FormContext } from '@/context/AiContext';
import type { SlotConfig } from '@/config/admin.config';

interface UseAiFormIntegrationOptions {
    slotKey: string;
    config: SlotConfig;
    currentData?: Record<string, unknown>;
    editingIndex?: number | null;
    onFillForm: (data: Record<string, unknown> | Record<string, unknown>[]) => void;
    enabled?: boolean;
}

export function useAiFormIntegration({
    slotKey,
    config,
    currentData,
    editingIndex,
    onFillForm,
    enabled = true,
}: UseAiFormIntegrationOptions) {
    const { aiEnabled, hasApiKey, setActiveFormContext } = useAi();

    // Set form context when component mounts or data changes
    useEffect(() => {
        if (!enabled || !aiEnabled || !hasApiKey) {
            setActiveFormContext(null);
            return;
        }

        const formContext: FormContext = {
            slotKey,
            config: {
                label: config.label,
                type: config.type,
                fields: config.fields.map(f => ({
                    id: f.id,
                    label: f.label,
                    type: f.type,
                    required: f.required,
                    options: f.options,
                })),
            },
            currentData,
            editingIndex,
            onFillForm,
        };

        setActiveFormContext(formContext);

        // Cleanup on unmount
        return () => {
            setActiveFormContext(null);
        };
    }, [
        enabled,
        aiEnabled,
        hasApiKey,
        slotKey,
        config,
        currentData,
        editingIndex,
        onFillForm,
        setActiveFormContext,
    ]);

    // Handler to fill form with AI-generated data
    const fillFormWithAiData = useCallback((data: Record<string, unknown>) => {
        // Validate data against schema
        const validatedData: Record<string, unknown> = {};

        for (const field of config.fields) {
            if (data[field.id] !== undefined) {
                validatedData[field.id] = data[field.id];
            }
        }

        onFillForm(validatedData);
    }, [config.fields, onFillForm]);

    return {
        isAiReady: aiEnabled && hasApiKey,
        fillFormWithAiData,
    };
}
