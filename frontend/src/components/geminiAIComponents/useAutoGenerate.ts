/**
 * useAutoGenerate Hook - SIMPLIFIED
 * 
 * Automatikus tartalom generálás kezelése navigáció után.
 * NO session storage - in-memory only.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAi } from '@/context/AiContext';
import { FormContext } from './index';

interface UseAutoGenerateReturn {
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
}

// Retry configuration
const MAX_RETRIES = 30;
const INITIAL_RETRY_DELAY = 300;
const MAX_RETRY_DELAY = 1500;
const TOTAL_TIMEOUT_MS = 20000;

export function useAutoGenerate(
    formContext: FormContext | undefined,
    onFillForm: ((data: Record<string, unknown>) => void) | undefined,
    isThinking: boolean,
    setInputValue: (value: string) => void
): UseAutoGenerateReturn {
    const {
        autoGenerateRequest,
        setAutoGenerateRequest,
        executeSend,
        isAutoGenerating,
        setIsAutoGenerating,
    } = useAi();

    const [isOpen, setIsOpen] = useState(false);

    // Refs for tracking state
    const retryCountRef = useRef(0);
    const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const startTimeRef = useRef<number | null>(null);
    const isExecutingRef = useRef(false);

    // Clear retry timeout
    const clearRetryTimeout = useCallback(() => {
        if (retryTimeoutRef.current) {
            clearTimeout(retryTimeoutRef.current);
            retryTimeoutRef.current = null;
        }
    }, []);

    // Calculate delay with exponential backoff
    const getRetryDelay = useCallback((retryCount: number): number => {
        const delay = Math.min(INITIAL_RETRY_DELAY * Math.pow(1.3, retryCount), MAX_RETRY_DELAY);
        return delay;
    }, []);

    // Execute auto-generation
    const executeAutoGeneration = useCallback(async (message: string) => {
        if (isExecutingRef.current) return;
        isExecutingRef.current = true;

        clearRetryTimeout();
        setIsAutoGenerating(true);

        // Clear the request from context immediately
        setAutoGenerateRequest(null);

        // Open chatbot
        setIsOpen(true);

        // Set input value first
        setInputValue(message);

        // Small delay then execute send
        await new Promise(resolve => setTimeout(resolve, 200));

        // Use programmatic send
        await executeSend(message);

        // Reset state after a delay
        setTimeout(() => {
            setIsAutoGenerating(false);
            isExecutingRef.current = false;
            retryCountRef.current = 0;
            startTimeRef.current = null;
        }, 1500);
    }, [clearRetryTimeout, setIsAutoGenerating, setAutoGenerateRequest, setInputValue, executeSend]);

    // Main auto-generate effect with retry logic
    useEffect(() => {
        // Skip if no request
        if (!autoGenerateRequest) {
            clearRetryTimeout();
            retryCountRef.current = 0;
            startTimeRef.current = null;
            return;
        }

        // Skip if already executing
        if (isAutoGenerating || isExecutingRef.current) {
            return;
        }

        // Initialize start time
        if (!startTimeRef.current) {
            startTimeRef.current = Date.now();
        }

        // Check total timeout
        const elapsed = Date.now() - startTimeRef.current;
        if (elapsed > TOTAL_TIMEOUT_MS) {
            console.error('[useAutoGenerate] Timeout exceeded');
            clearRetryTimeout();
            setAutoGenerateRequest(null);
            startTimeRef.current = null;
            retryCountRef.current = 0;
            return;
        }

        // Check if ready
        const isReady = formContext && onFillForm && !isThinking;

        if (isReady) {
            executeAutoGeneration(autoGenerateRequest);
        } else if (retryCountRef.current < MAX_RETRIES) {
            const delay = getRetryDelay(retryCountRef.current);
            clearRetryTimeout();
            retryTimeoutRef.current = setTimeout(() => {
                retryCountRef.current++;
                // Force re-check by updating a ref - the effect will re-run due to dependencies
            }, delay);
        } else {
            console.error('[useAutoGenerate] Max retries exceeded');
            clearRetryTimeout();
            setAutoGenerateRequest(null);
            startTimeRef.current = null;
            retryCountRef.current = 0;
        }
    }, [
        autoGenerateRequest,
        formContext,
        onFillForm,
        isThinking,
        isAutoGenerating,
        setAutoGenerateRequest,
        clearRetryTimeout,
        getRetryDelay,
        executeAutoGeneration,
    ]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            clearRetryTimeout();
        };
    }, [clearRetryTimeout]);

    return {
        isOpen,
        setIsOpen,
    };
}
