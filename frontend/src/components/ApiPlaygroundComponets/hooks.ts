// Hooks for API Playground

import { useState, useEffect, useMemo, useCallback } from 'react';
import { generateEndpointsFromConfig } from './utils';
import { EndpointDef, PlaygroundState, RequestState } from './types';

/**
 * Main hook for API Playground logic
 */
export function usePlaygroundLogic(initialApiKey: string = '') {
    const ENDPOINTS = useMemo(() => generateEndpointsFromConfig(), []);

    const [state, setState] = useState<PlaygroundState>({
        selectedEndpoint: ENDPOINTS[0],
        apiKey: initialApiKey,
        queryParams: {} as Record<string, string>,
        formData: {} as Record<string, unknown>,
        rawBody: '',
        useRawBody: false,
        searchQuery: '',
    });

    const [requestState, setRequestState] = useState<RequestState>({
        loading: false,
        response: null,
        status: null,
        duration: null,
        error: null
    });

    // Initialize endpoint state when selectedEndpoint changes
    useEffect(() => {
        const { selectedEndpoint } = state;
        let newRawBody = '';
        let newFormData = {};

        if (selectedEndpoint.bodyTemplate) {
            const template = selectedEndpoint.slot
                ? { key: selectedEndpoint.slot, data: (selectedEndpoint.bodyTemplate as any).data || {} }
                : selectedEndpoint.bodyTemplate;

            newRawBody = JSON.stringify(template, null, 2);
            if (selectedEndpoint.slotConfig) {
                newFormData = (template as any).data || {};
            }
        }

        setState(prev => ({
            ...prev,
            queryParams: selectedEndpoint.queryParams || {},
            rawBody: newRawBody,
            formData: newFormData,
            useRawBody: false
        }));

        setRequestState({ loading: false, response: null, status: null, duration: null, error: null });
    }, [state.selectedEndpoint]);

    return {
        ENDPOINTS,
        state,
        setState,
        requestState,
        setRequestState
    };
}

/**
 * Hook for request building and execution
 */
export function useRequestExecution(
    apiBase: string,
    selectedEndpoint: EndpointDef,
    queryParams: Record<string, string>,
    apiKey: string,
    rawBody: string,
    formData: Record<string, unknown>,
    useRawBody: boolean,
    setRequestState: React.Dispatch<React.SetStateAction<RequestState>>
) {
    const buildRequest = useCallback(() => {
        let url = `${window.location.origin}${apiBase}${selectedEndpoint.path}`;
        const params = new URLSearchParams(queryParams);
        if (params.toString()) url += `?${params.toString()}`;

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (apiKey) headers['X-API-KEY'] = apiKey;

        let body = '';
        if (['POST', 'PUT', 'PATCH'].includes(selectedEndpoint.method)) {
            if (useRawBody) {
                body = rawBody;
            } else if (selectedEndpoint.slot && Object.keys(formData).length) {
                body = JSON.stringify({ key: selectedEndpoint.slot, data: formData }, null, 2);
            } else {
                body = rawBody;
            }
        }

        return { url, headers, body };
    }, [apiBase, selectedEndpoint, queryParams, apiKey, rawBody, formData, useRawBody]);

    const executeRequest = useCallback(async () => {
        setRequestState(prev => ({ ...prev, loading: true }));
        const startTime = performance.now();

        try {
            const { headers, body } = buildRequest();
            const fetchUrl = `${apiBase}${selectedEndpoint.path}${new URLSearchParams(queryParams).toString() ? '?' + new URLSearchParams(queryParams).toString() : ''}`;

            const options: RequestInit = {
                method: selectedEndpoint.method,
                headers,
                credentials: 'include'
            };

            if (['POST', 'PUT', 'PATCH'].includes(selectedEndpoint.method) && body) {
                options.body = body;
            }

            const res = await fetch(fetchUrl, options);
            const contentType = res.headers.get('content-type');
            const data = contentType?.includes('application/json')
                ? await res.json()
                : await res.text();

            setRequestState(prev => ({ ...prev, response: data, status: res.status }));
        } catch (error) {
            setRequestState(prev => ({
                ...prev,
                response: { error: error instanceof Error ? error.message : 'Network Error' },
                status: 0
            }));
        } finally {
            setRequestState(prev => ({
                ...prev,
                loading: false,
                duration: Math.round(performance.now() - startTime)
            }));
        }
    }, [buildRequest, apiBase, selectedEndpoint, queryParams, setRequestState]);

    return { buildRequest, executeRequest };
}

/**
 * Hook for clipboard operations
 */
export function useClipboard() {
    const [copied, setCopied] = useState<string | null>(null);

    const copyToClipboard = useCallback((text: string, key: string) => {
        navigator.clipboard.writeText(text);
        setCopied(key);
        setTimeout(() => setCopied(null), 2000);
    }, []);

    return { copied, copyToClipboard };
}
