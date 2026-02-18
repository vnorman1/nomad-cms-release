/**
 * useCheckDraft - Draft ellenőrző és kezelő hook
 * 
 * Ez a hook ellenőrzi, hogy van-e mentett draft egy adott slot/item-hez,
 * és lehetővé teszi a betöltést vagy törlést.
 * 
 * Használat:
 * 1. Editor megnyitásánál hívd meg a checkForDraft()-et
 * 2. Ha van draft, a hasPendingDraft true lesz
 * 3. A user választhat: loadPendingDraft() vagy discardPendingDraft()
 */

import { useState, useCallback, useEffect } from 'react';
import DraftService, { Draft, DraftMeta } from '@/services/DraftService';

export interface UseCheckDraftOptions {
    /** Slot kulcs (pl. 'blog', 'portfolio') */
    slotKey: string;
    /** Automatikus ellenőrzés mount-kor */
    autoCheck?: boolean;
}

export interface UseCheckDraftReturn {
    /** Van-e betöltetlen draft */
    hasPendingDraft: boolean;
    /** A draft adatai (ha van) */
    pendingDraft: Draft | null;
    /** Ellenőrzés folyamatban */
    isChecking: boolean;
    /** Hiba történt */
    error: string | null;
    
    /** Draft keresése egy adott item-hez */
    checkForDraft: (itemId?: string) => Promise<Draft | null>;
    /** Pending draft betöltése (visszaadja az adatokat) */
    loadPendingDraft: () => Record<string, any> | null;
    /** Pending draft elvetése */
    discardPendingDraft: () => Promise<void>;
    /** Draft mentése */
    saveDraft: (data: Record<string, any>, itemId?: string) => Promise<Draft>;
    /** Draft végleges törlése (sikeres mentés után) */
    clearDraft: (itemId?: string) => Promise<void>;
    /** Összes draft a slot-hoz */
    slotDrafts: DraftMeta[];
    /** Drafts újratöltése */
    refreshDrafts: () => void;
}

export function useCheckDraft(options: UseCheckDraftOptions): UseCheckDraftReturn {
    const { slotKey, autoCheck = false } = options;

    // State
    const [hasPendingDraft, setHasPendingDraft] = useState(false);
    const [pendingDraft, setPendingDraft] = useState<Draft | null>(null);
    const [isChecking, setIsChecking] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [slotDrafts, setSlotDrafts] = useState<DraftMeta[]>([]);

    // Drafts lekérése a slot-hoz
    const refreshDrafts = useCallback(() => {
        const drafts = DraftService.getDraftsBySlot(slotKey);
        setSlotDrafts(drafts);
    }, [slotKey]);

    // Initial load
    useEffect(() => {
        refreshDrafts();
    }, [refreshDrafts]);

    // Auto-check if enabled
    useEffect(() => {
        if (autoCheck) {
            checkForDraft();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoCheck, slotKey]);

    /**
     * Draft keresése egy adott item-hez
     */
    const checkForDraft = useCallback(async (itemId?: string): Promise<Draft | null> => {
        setIsChecking(true);
        setError(null);
        
        try {
            const draft = await DraftService.getDraft(slotKey, itemId);
            
            if (draft && draft.data && Object.keys(draft.data).length > 0) {
                setPendingDraft(draft);
                setHasPendingDraft(true);
                return draft;
            } else {
                setPendingDraft(null);
                setHasPendingDraft(false);
                return null;
            }
        } catch (e) {
            console.error('[useCheckDraft] Error checking draft:', e);
            setError('Hiba a draft ellenőrzésekor');
            return null;
        } finally {
            setIsChecking(false);
        }
    }, [slotKey]);

    /**
     * Pending draft betöltése - visszaadja az adatokat
     */
    const loadPendingDraft = useCallback((): Record<string, any> | null => {
        if (!pendingDraft) return null;
        
        const data = pendingDraft.data;
        // Reset pending state after loading
        setHasPendingDraft(false);
        // De ne töröljük a pendingDraft-ot amíg nem mentik el
        return data;
    }, [pendingDraft]);

    /**
     * Pending draft elvetése
     */
    const discardPendingDraft = useCallback(async (): Promise<void> => {
        if (!pendingDraft) return;
        
        try {
            await DraftService.deleteDraft(slotKey, pendingDraft.itemId);
            setPendingDraft(null);
            setHasPendingDraft(false);
            refreshDrafts();
        } catch (e) {
            console.error('[useCheckDraft] Error discarding draft:', e);
            setError('Hiba a draft törlésekor');
        }
    }, [pendingDraft, slotKey, refreshDrafts]);

    /**
     * Draft mentése
     */
    const saveDraft = useCallback(async (data: Record<string, any>, itemId?: string): Promise<Draft> => {
        try {
            const draft = await DraftService.saveDraft(slotKey, data, itemId);
            refreshDrafts();
            return draft;
        } catch (e) {
            console.error('[useCheckDraft] Error saving draft:', e);
            throw e;
        }
    }, [slotKey, refreshDrafts]);

    /**
     * Draft végleges törlése (sikeres mentés után hívandó)
     */
    const clearDraft = useCallback(async (itemId?: string): Promise<void> => {
        try {
            await DraftService.deleteDraft(slotKey, itemId);
            setPendingDraft(null);
            setHasPendingDraft(false);
            refreshDrafts();
        } catch (e) {
            console.error('[useCheckDraft] Error clearing draft:', e);
        }
    }, [slotKey, refreshDrafts]);

    return {
        hasPendingDraft,
        pendingDraft,
        isChecking,
        error,
        checkForDraft,
        loadPendingDraft,
        discardPendingDraft,
        saveDraft,
        clearDraft,
        slotDrafts,
        refreshDrafts
    };
}

export default useCheckDraft;
