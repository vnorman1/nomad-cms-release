// Custom Endpoints Hook - Manages custom endpoint state with localStorage persistence

import { useState, useEffect, useCallback } from 'react';
import { CustomEndpoint, RequestHistoryItem } from './customTypes';
import { EndpointDef } from './types';

const STORAGE_KEY_ENDPOINTS = 'api-playground-custom-endpoints';
const STORAGE_KEY_HISTORY = 'api-playground-history';
const MAX_HISTORY_ITEMS = 50;

/**
 * Hook for managing custom endpoints with localStorage persistence
 */
export function useCustomEndpoints() {
    const [customEndpoints, setCustomEndpoints] = useState<CustomEndpoint[]>([]);
    const [isLoaded, setIsLoaded] = useState(false);

    // Load from localStorage on mount
    useEffect(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY_ENDPOINTS);
            if (saved) {
                setCustomEndpoints(JSON.parse(saved));
            }
        } catch (e) {
            console.error('Failed to load custom endpoints:', e);
        }
        setIsLoaded(true);
    }, []);

    // Save to localStorage when endpoints change
    useEffect(() => {
        if (isLoaded) {
            localStorage.setItem(STORAGE_KEY_ENDPOINTS, JSON.stringify(customEndpoints));
        }
    }, [customEndpoints, isLoaded]);

    const addEndpoint = useCallback((endpoint: CustomEndpoint) => {
        setCustomEndpoints(prev => [...prev, endpoint]);
    }, []);

    const updateEndpoint = useCallback((endpoint: CustomEndpoint) => {
        setCustomEndpoints(prev => 
            prev.map(ep => ep.id === endpoint.id ? endpoint : ep)
        );
    }, []);

    const deleteEndpoint = useCallback((id: string) => {
        setCustomEndpoints(prev => prev.filter(ep => ep.id !== id));
    }, []);

    const importEndpoints = useCallback((endpoints: CustomEndpoint[]) => {
        setCustomEndpoints(prev => {
            // Avoid duplicates by id
            const existingIds = new Set(prev.map(ep => ep.id));
            const newEndpoints = endpoints.filter(ep => !existingIds.has(ep.id));
            return [...prev, ...newEndpoints];
        });
    }, []);

    // Convert CustomEndpoint to EndpointDef format
    const toEndpointDef = useCallback((custom: CustomEndpoint): EndpointDef => ({
        id: custom.id,
        name: custom.name,
        method: custom.method,
        path: custom.path,
        description: custom.description,
        category: 'content', // Custom endpoints go to content category
        requiresAuth: false,
        queryParams: custom.queryParams,
        bodyTemplate: custom.bodyTemplate ? JSON.parse(custom.bodyTemplate) : undefined
    }), []);

    return {
        customEndpoints,
        addEndpoint,
        updateEndpoint,
        deleteEndpoint,
        importEndpoints,
        toEndpointDef,
        isLoaded
    };
}

/**
 * Hook for managing request history with localStorage persistence
 */
export function useRequestHistory() {
    const [history, setHistory] = useState<RequestHistoryItem[]>([]);
    const [isLoaded, setIsLoaded] = useState(false);

    // Load from localStorage on mount
    useEffect(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY_HISTORY);
            if (saved) {
                setHistory(JSON.parse(saved));
            }
        } catch (e) {
            console.error('Failed to load request history:', e);
        }
        setIsLoaded(true);
    }, []);

    // Save to localStorage when history changes
    useEffect(() => {
        if (isLoaded) {
            localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(history));
        }
    }, [history, isLoaded]);

    const addToHistory = useCallback((item: Omit<RequestHistoryItem, 'id' | 'timestamp'>) => {
        const newItem: RequestHistoryItem = {
            ...item,
            id: `history-${Date.now()}`,
            timestamp: new Date().toISOString()
        };
        
        setHistory(prev => {
            const updated = [newItem, ...prev];
            // Keep only last MAX_HISTORY_ITEMS
            return updated.slice(0, MAX_HISTORY_ITEMS);
        });
    }, []);

    const clearHistory = useCallback(() => {
        setHistory([]);
    }, []);

    const deleteHistoryItem = useCallback((id: string) => {
        setHistory(prev => prev.filter(item => item.id !== id));
    }, []);

    return {
        history,
        addToHistory,
        clearHistory,
        deleteHistoryItem,
        isLoaded
    };
}
