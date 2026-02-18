/**
 * useSchemaBuilder Hook
 * 
 * Core state management for the Schema Builder.
 * Handles LocalStorage persistence, URL state, and all CRUD operations.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    BuilderSchema,
    BuilderSlotConfig,
    BuilderFieldConfig,
    StaticPage,
    DEFAULT_SCHEMA,
    createEmptySlot,
    createEmptyField,
} from './types';
import {
    extractSchemaFromUrl,
    generateShareUrl,
    getUrlLength,
    isUrlSafe,
} from './schemaCompression';

const STORAGE_KEY = 'nomad-schema-builder';

interface UseSchemaBuilderReturn {
    // State
    schema: BuilderSchema;
    selectedSlotKey: string | null;
    selectedFieldIndex: number | null;
    isDirty: boolean;
    urlLength: number;
    isUrlSafe: boolean;

    // Schema operations
    setSchema: (schema: BuilderSchema) => void;
    updateSchemaMetadata: (updates: Partial<BuilderSchema>) => void;
    resetSchema: () => void;
    importSchema: (json: string) => boolean;
    exportSchema: () => string;

    // Slot operations
    addSlot: (key: string, config?: BuilderSlotConfig) => void;
    removeSlot: (key: string) => void;
    updateSlot: (key: string, updates: Partial<BuilderSlotConfig>) => void;
    renameSlot: (oldKey: string, newKey: string) => void;
    selectSlot: (key: string | null) => void;

    // Field operations
    addField: (slotKey: string, id: string) => void;
    removeField: (slotKey: string, fieldIndex: number) => void;
    updateField: (slotKey: string, fieldIndex: number, updates: Partial<BuilderFieldConfig>) => void;
    moveField: (slotKey: string, fromIndex: number, toIndex: number) => void;
    selectField: (index: number | null) => void;

    // Static pages operations
    addStaticPage: (page: StaticPage) => void;
    removeStaticPage: (index: number) => void;
    updateStaticPage: (index: number, updates: Partial<StaticPage>) => void;

    // URL operations
    getShareUrl: () => string;
    loadFromUrl: () => boolean;

    // Persistence
    saveToLocalStorage: () => void;
    loadFromLocalStorage: () => boolean;
    clearLocalStorage: () => void;
}


export function useSchemaBuilder(): UseSchemaBuilderReturn {
    const [schema, setSchemaState] = useState<BuilderSchema>(DEFAULT_SCHEMA);
    const [selectedSlotKey, setSelectedSlotKey] = useState<string | null>(null);
    const [selectedFieldIndex, setSelectedFieldIndex] = useState<number | null>(null);
    const [isDirty, setIsDirty] = useState(false);
    const [isInitialized, setIsInitialized] = useState(false);

    // Computed values
    const urlLength = useMemo(() => getUrlLength(schema), [schema]);
    const urlSafe = useMemo(() => isUrlSafe(schema), [schema]);

    // Initialize on mount
    useEffect(() => {
        if (isInitialized) return;

        // Try URL first, then localStorage
        const urlSchema = extractSchemaFromUrl();
        if (urlSchema && (urlSchema as BuilderSchema).slots) {
            setSchemaState(urlSchema as BuilderSchema);
            setIsInitialized(true);
            return;
        }

        // Try localStorage
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                if (parsed.slots) {
                    setSchemaState(parsed);
                }
            } catch (e) {
                console.warn('Failed to parse stored schema:', e);
            }
        }
        setIsInitialized(true);
    }, [isInitialized]);

    // Auto-save to localStorage on changes
    useEffect(() => {
        if (!isInitialized) return;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(schema));
        setIsDirty(true);
    }, [schema, isInitialized]);

    // Schema operations
    const setSchema = useCallback((newSchema: BuilderSchema) => {
        setSchemaState(newSchema);
    }, []);

    const updateSchemaMetadata = useCallback((updates: Partial<BuilderSchema>) => {
        setSchemaState(prev => ({ ...prev, ...updates }));
    }, []);

    const resetSchema = useCallback(() => {
        setSchemaState(DEFAULT_SCHEMA);
        setSelectedSlotKey(null);
        setSelectedFieldIndex(null);
        setIsDirty(false);
    }, []);

    const importSchema = useCallback((json: string): boolean => {
        try {
            const parsed = JSON.parse(json);
            if (!parsed.slots) {
                return false;
            }
            setSchemaState(parsed);
            setSelectedSlotKey(null);
            setSelectedFieldIndex(null);
            return true;
        } catch {
            return false;
        }
    }, []);

    const exportSchema = useCallback((): string => {
        return JSON.stringify(schema, null, 2);
    }, [schema]);

    // Slot operations
    const addSlot = useCallback((key: string, config?: BuilderSlotConfig) => {
        if (schema.slots[key]) return;
        setSchemaState(prev => ({
            ...prev,
            slots: {
                ...prev.slots,
                [key]: config ?? createEmptySlot(key),
            },
        }));
        setSelectedSlotKey(key);
    }, [schema.slots]);

    const removeSlot = useCallback((key: string) => {
        setSchemaState(prev => {
            const { [key]: _, ...rest } = prev.slots;
            return { ...prev, slots: rest };
        });
        if (selectedSlotKey === key) {
            setSelectedSlotKey(null);
            setSelectedFieldIndex(null);
        }
    }, [selectedSlotKey]);

    const updateSlot = useCallback((key: string, updates: Partial<BuilderSlotConfig>) => {
        setSchemaState(prev => ({
            ...prev,
            slots: {
                ...prev.slots,
                [key]: { ...prev.slots[key], ...updates },
            },
        }));
    }, []);

    const renameSlot = useCallback((oldKey: string, newKey: string) => {
        if (oldKey === newKey || schema.slots[newKey]) return;
        setSchemaState(prev => {
            const { [oldKey]: slot, ...rest } = prev.slots;
            return {
                ...prev,
                slots: { ...rest, [newKey]: slot },
            };
        });
        if (selectedSlotKey === oldKey) {
            setSelectedSlotKey(newKey);
        }
    }, [schema.slots, selectedSlotKey]);

    const selectSlot = useCallback((key: string | null) => {
        setSelectedSlotKey(key);
        setSelectedFieldIndex(null);
    }, []);

    // Field operations
    const addField = useCallback((slotKey: string, id: string) => {
        const slot = schema.slots[slotKey];
        if (!slot) return;

        // Check if field id already exists
        if (slot.fields.some(f => f.id === id)) return;

        setSchemaState(prev => ({
            ...prev,
            slots: {
                ...prev.slots,
                [slotKey]: {
                    ...prev.slots[slotKey],
                    fields: [...prev.slots[slotKey].fields, createEmptyField(id)],
                },
            },
        }));
    }, [schema.slots]);

    const removeField = useCallback((slotKey: string, fieldIndex: number) => {
        setSchemaState(prev => ({
            ...prev,
            slots: {
                ...prev.slots,
                [slotKey]: {
                    ...prev.slots[slotKey],
                    fields: prev.slots[slotKey].fields.filter((_, i) => i !== fieldIndex),
                },
            },
        }));
        if (selectedFieldIndex === fieldIndex) {
            setSelectedFieldIndex(null);
        }
    }, [selectedFieldIndex]);

    const updateField = useCallback((slotKey: string, fieldIndex: number, updates: Partial<BuilderFieldConfig>) => {
        setSchemaState(prev => ({
            ...prev,
            slots: {
                ...prev.slots,
                [slotKey]: {
                    ...prev.slots[slotKey],
                    fields: prev.slots[slotKey].fields.map((f, i) =>
                        i === fieldIndex ? { ...f, ...updates } : f
                    ),
                },
            },
        }));
    }, []);

    const moveField = useCallback((slotKey: string, fromIndex: number, toIndex: number) => {
        setSchemaState(prev => {
            const fields = [...prev.slots[slotKey].fields];
            const [moved] = fields.splice(fromIndex, 1);
            fields.splice(toIndex, 0, moved);
            return {
                ...prev,
                slots: {
                    ...prev.slots,
                    [slotKey]: { ...prev.slots[slotKey], fields },
                },
            };
        });
    }, []);

    const selectField = useCallback((index: number | null) => {
        setSelectedFieldIndex(index);
    }, []);

    // Static pages operations
    const addStaticPage = useCallback((page: StaticPage) => {
        setSchemaState(prev => ({
            ...prev,
            staticPages: [...(prev.staticPages || []), page],
        }));
    }, []);

    const removeStaticPage = useCallback((index: number) => {
        setSchemaState(prev => ({
            ...prev,
            staticPages: (prev.staticPages || []).filter((_, i) => i !== index),
        }));
    }, []);

    const updateStaticPage = useCallback((index: number, updates: Partial<StaticPage>) => {
        setSchemaState(prev => ({
            ...prev,
            staticPages: (prev.staticPages || []).map((p, i) =>
                i === index ? { ...p, ...updates } : p
            ),
        }));
    }, []);

    // URL operations
    const getShareUrl = useCallback((): string => {
        return generateShareUrl(schema);
    }, [schema]);

    const loadFromUrl = useCallback((): boolean => {
        const urlSchema = extractSchemaFromUrl();
        if (urlSchema && (urlSchema as BuilderSchema).slots) {
            setSchemaState(urlSchema as BuilderSchema);
            return true;
        }
        return false;
    }, []);

    // Persistence
    const saveToLocalStorage = useCallback(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(schema));
        setIsDirty(false);
    }, [schema]);

    const loadFromLocalStorage = useCallback((): boolean => {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                if (parsed.slots) {
                    setSchemaState(parsed);
                    return true;
                }
            } catch {
                return false;
            }
        }
        return false;
    }, []);

    const clearLocalStorage = useCallback(() => {
        localStorage.removeItem(STORAGE_KEY);
        setIsDirty(false);
    }, []);


    return {
        schema,
        selectedSlotKey,
        selectedFieldIndex,
        isDirty,
        urlLength,
        isUrlSafe: urlSafe,

        setSchema,
        updateSchemaMetadata,
        resetSchema,
        importSchema,
        exportSchema,

        addSlot,
        removeSlot,
        updateSlot,
        renameSlot,
        selectSlot,

        addField,
        removeField,
        updateField,
        moveField,
        selectField,

        addStaticPage,
        removeStaticPage,
        updateStaticPage,

        getShareUrl,
        loadFromUrl,

        saveToLocalStorage,
        loadFromLocalStorage,
        clearLocalStorage,
    };
}
