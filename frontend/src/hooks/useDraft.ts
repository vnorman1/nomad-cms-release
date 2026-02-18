/**
 * useDraft - React Hook a Draft szolgáltatás használatához
 * 
 * Funkciók:
 * - Automatikus draft betöltés komponens mountnál
 * - Debounce-olt auto-save adat változáskor
 * - "Folytatod ahol abbahagytad?" modal
 * - Cleanup komponens unmount-nál
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import DraftService, { Draft, DraftMeta, createAutoSaver } from '@/services/DraftService';

export interface UseDraftOptions {
    /** Slot kulcs (pl. 'blog', 'portfolio') */
    slotKey: string;
    /** Elem ID szerkesztésnél, undefined új elemnél */
    itemId?: string;
    /** Auto-save késleltetés ms-ban (default: 2000) */
    debounceMs?: number;
    /** Auto-save engedélyezve (default: true) */
    autoSaveEnabled?: boolean;
    /** Callback amikor draft-ot talál */
    onDraftFound?: (draft: Draft) => void;
}

export interface UseDraftReturn {
    /** Van-e betöltött draft */
    hasDraft: boolean;
    /** Betöltött draft adatai (ha van) */
    draftData: Record<string, any> | null;
    /** Draft meta információi */
    draftMeta: DraftMeta | null;
    /** Draft töltődik */
    isLoading: boolean;
    /** Utolsó mentés időpontja */
    lastSaved: Date | null;
    /** Mentés folyamatban */
    isSaving: boolean;
    /** Verzió szám */
    version: number;
    
    /** Adat változás kezelő (auto-save trigger) */
    onChange: (data: Record<string, any>) => void;
    /** Azonnali mentés */
    saveNow: (data: Record<string, any>) => Promise<Draft | null>;
    /** Draft betöltése az adatokba */
    loadDraft: () => Record<string, any> | null;
    /** Draft elvetése */
    discardDraft: () => Promise<void>;
    /** Draft elfogadása (törli a draft-ot sikeres mentés után) */
    acceptDraft: () => Promise<void>;
}

export function useDraft(options: UseDraftOptions): UseDraftReturn {
    const { 
        slotKey, 
        itemId, 
        debounceMs = 2000, 
        autoSaveEnabled = true,
        onDraftFound 
    } = options;

    // State
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [lastSaved, setLastSaved] = useState<Date | null>(null);
    const [version, setVersion] = useState(0);

    // Refs
    const autoSaverRef = useRef<ReturnType<typeof createAutoSaver> | null>(null);
    const onDraftFoundRef = useRef(onDraftFound);
    onDraftFoundRef.current = onDraftFound;

    // Initialize auto-saver
    useEffect(() => {
        autoSaverRef.current = createAutoSaver(slotKey, itemId, debounceMs);
        
        return () => {
            autoSaverRef.current?.cleanup();
        };
    }, [slotKey, itemId, debounceMs]);

    // Load draft on mount
    useEffect(() => {
        let mounted = true;

        async function loadDraft() {
            setIsLoading(true);
            try {
                const existingDraft = await DraftService.getDraft(slotKey, itemId);
                
                if (mounted && existingDraft) {
                    setDraft(existingDraft);
                    setVersion(existingDraft.version);
                    setLastSaved(new Date(existingDraft.updatedAt));
                    
                    if (onDraftFoundRef.current) {
                        onDraftFoundRef.current(existingDraft);
                    }
                }
            } catch (e) {
                console.error('[useDraft] Failed to load draft:', e);
            } finally {
                if (mounted) {
                    setIsLoading(false);
                }
            }
        }

        loadDraft();

        return () => {
            mounted = false;
        };
    }, [slotKey, itemId]);

    // onChange handler with auto-save
    const onChange = useCallback((data: Record<string, any>) => {
        if (!autoSaveEnabled || !autoSaverRef.current) return;

        autoSaverRef.current.onChange(data);
        setIsSaving(true);

        // Delayed state update to reflect saving complete
        setTimeout(() => {
            setIsSaving(false);
            setLastSaved(new Date());
            setVersion(v => v + 1);
        }, debounceMs + 100);
    }, [autoSaveEnabled, debounceMs]);

    // Immediate save
    const saveNow = useCallback(async (data: Record<string, any>): Promise<Draft | null> => {
        if (!autoSaverRef.current) return null;

        setIsSaving(true);
        try {
            const savedDraft = await autoSaverRef.current.saveNow(data);
            setDraft(savedDraft);
            setVersion(savedDraft.version);
            setLastSaved(new Date(savedDraft.updatedAt));
            return savedDraft;
        } catch (e) {
            console.error('[useDraft] Save failed:', e);
            return null;
        } finally {
            setIsSaving(false);
        }
    }, []);

    // Load draft data
    const loadDraft = useCallback((): Record<string, any> | null => {
        return draft?.data || null;
    }, [draft]);

    // Discard draft
    const discardDraft = useCallback(async (): Promise<void> => {
        await autoSaverRef.current?.discard();
        setDraft(null);
        setVersion(0);
        setLastSaved(null);
    }, []);

    // Accept draft (call after successful save)
    const acceptDraft = useCallback(async (): Promise<void> => {
        await DraftService.deleteDraft(slotKey, itemId);
        setDraft(null);
        setVersion(0);
    }, [slotKey, itemId]);

    // Draft meta for UI
    const draftMeta: DraftMeta | null = draft ? {
        id: draft.id,
        slotKey: draft.slotKey,
        itemId: draft.itemId,
        updatedAt: draft.updatedAt,
        size: JSON.stringify(draft.data).length,
        previewTitle: draft.data.title || draft.data.name
    } : null;

    return {
        hasDraft: draft !== null,
        draftData: draft?.data || null,
        draftMeta,
        isLoading,
        lastSaved,
        isSaving,
        version,
        onChange,
        saveNow,
        loadDraft,
        discardDraft,
        acceptDraft
    };
}

/**
 * Hook az összes draft listázásához (settings/cleanup oldalhoz)
 */
export function useDraftList() {
    const [drafts, setDrafts] = useState<DraftMeta[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [storageInfo, setStorageInfo] = useState<ReturnType<typeof DraftService.getStorageUsage> | null>(null);

    const refresh = useCallback(async () => {
        setIsLoading(true);
        try {
            const allDrafts = DraftService.getAllDraftsMeta();
            const usage = DraftService.getStorageUsage();
            setDrafts(allDrafts);
            setStorageInfo(usage);
        } catch (e) {
            console.error('[useDraftList] Failed to load drafts:', e);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const deleteDraft = useCallback(async (slotKey: string, itemId?: string) => {
        await DraftService.deleteDraft(slotKey, itemId);
        await refresh();
    }, [refresh]);

    const clearAll = useCallback(async () => {
        await DraftService.clearAllDrafts();
        await refresh();
    }, [refresh]);

    const runCleanup = useCallback(async () => {
        const result = await DraftService.runCleanup();
        await refresh();
        return result;
    }, [refresh]);

    return {
        drafts,
        isLoading,
        storageInfo,
        refresh,
        deleteDraft,
        clearAll,
        runCleanup
    };
}

export default useDraft;
