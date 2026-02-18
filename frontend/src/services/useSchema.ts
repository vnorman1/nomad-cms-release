/**
 * useSchema Hook - React hook for accessing the CMS schema
 * 
 * Provides reactive access to the dynamically loaded schema configuration.
 * Automatically re-renders when schema updates.
 * 
 * @example
 * const { config, isLoading, error, slotConfig } = useSchema();
 * const heroConfig = slotConfig('hero');
 */

import { useState, useEffect, useCallback } from 'react';
import { 
    schemaService, 
    type SchemaServiceState 
} from './schemaService';
import type { AdminConfig, SlotConfig } from './schemaValidator';

export interface UseSchemaResult {
    /** The full admin configuration (all slots) */
    config: AdminConfig | null;
    /** Whether the schema is currently loading */
    isLoading: boolean;
    /** Whether the schema has been loaded */
    isLoaded: boolean;
    /** Error message if loading failed */
    error: string | null;
    /** Schema version */
    version: string | null;
    /** Get a specific slot configuration */
    slotConfig: (slotKey: string) => SlotConfig | undefined;
    /** Force refresh the schema from API */
    refresh: () => Promise<void>;
    /** Get slot icon */
    getSlotIcon: (slotKey: string) => string;
    /** Get sitemap keys */
    getSitemapKeys: () => string[];
}

/**
 * React hook for accessing the CMS schema
 */
export function useSchema(): UseSchemaResult {
    const [config, setConfig] = useState<AdminConfig | null>(schemaService.getConfig());
    const [state, setState] = useState<SchemaServiceState>(schemaService.getState());

    useEffect(() => {
        // Subscribe to schema updates
        const unsubscribe = schemaService.subscribe((newConfig) => {
            setConfig(newConfig);
            setState(schemaService.getState());
        });

        // Trigger initial load if not loaded
        if (!schemaService.isLoaded()) {
            schemaService.loadSchema().then(() => {
                setConfig(schemaService.getConfig());
                setState(schemaService.getState());
            });
        }

        return unsubscribe;
    }, []);

    const slotConfig = useCallback((slotKey: string): SlotConfig | undefined => {
        return config?.[slotKey];
    }, [config]);

    const refresh = useCallback(async () => {
        await schemaService.refreshSchema();
        setConfig(schemaService.getConfig());
        setState(schemaService.getState());
    }, []);

    const getSlotIcon = useCallback((slotKey: string): string => {
        return config?.[slotKey]?.icon || 'File';
    }, [config]);

    const getSitemapKeys = useCallback((): string[] => {
        if (!config) return [];
        return Object.entries(config)
            .filter(([, slotConfig]) => slotConfig.isSitemap)
            .map(([key]) => key);
    }, [config]);

    return {
        config,
        isLoading: state.isLoading,
        isLoaded: state.isLoaded,
        error: state.error,
        version: state.version,
        slotConfig,
        refresh,
        getSlotIcon,
        getSitemapKeys,
    };
}

/**
 * Hook for accessing a specific slot's configuration
 */
export function useSlotConfig(slotKey: string): {
    config: SlotConfig | undefined;
    isLoading: boolean;
    error: string | null;
} {
    const { slotConfig, isLoading, error } = useSchema();
    
    return {
        config: slotConfig(slotKey),
        isLoading,
        error,
    };
}

export default useSchema;
