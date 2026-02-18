/**
 * useSlotEditor - Main Hook for SlotEditor Logic
 * Fő hook a SlotEditor állapotkezeléshez és logikához
 */

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { arrayMove } from '@dnd-kit/sortable';
import { DragEndEvent } from '@dnd-kit/core';

import { ADMIN_CONFIG, SlotConfig } from '@/config/admin.config';
import { useSlotData } from '@/hooks/useSlotData';
import { useUI } from '@/context/UIContext';
import { useCheckDraft } from '@/hooks/useCheckDraft';
import { useAi } from '@/context/AiContext';
import { normalizeAccents } from '@/components/geminiAIComponents';
import { uploadImage, deleteImage, uploadVideo, uploadAudio } from '@/api';
import { uploadFile as uploadFileApi } from '@/api/files';
import { isPendingImage, isPendingFile, isPendingVideo, isPendingAudio, GalleryItem, StoredFileInfo } from '@/components/fields/FieldRenderer';

interface UseSlotEditorOptions {
    slotKey: string;
}

export function useSlotEditor({ slotKey }: UseSlotEditorOptions) {
    const navigate = useNavigate();
    const { showToast, confirm } = useUI();
    const {
        aiEnabled,
        hasApiKey,
        setActiveFormContext,
        pendingAction,
        setPendingAction,
        autoGenerateRequest,
        setAutoGenerateRequest,
        generationQueue,
        setGenerationQueue,
        advanceGenerationQueue,
    } = useAi();

    // Data fetching - now includes refetch for version restore
    const { data, loading, error, save, refetch } = useSlotData(slotKey);
    const config = ADMIN_CONFIG[slotKey as keyof typeof ADMIN_CONFIG] as SlotConfig | undefined;

    const isListType = config?.type === 'list' || config?.type === 'collection';
    const publishedField = config?.publishedField;

    // View state
    const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
    const [searchTerm, setSearchTerm] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // Bulk Selection
    const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
    const [showPublishedOnly, setShowPublishedOnly] = useState<boolean | null>(null);

    // Editor State
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [editorOpen, setEditorOpen] = useState(false);
    const [tempItem, setTempItem] = useState<any>(null);
    const [showDraftRecovery, setShowDraftRecovery] = useState(false);

    // Local Items for DnD
    const [localItems, setLocalItems] = useState<any[]>([]);

    // Unsaved Changes
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    // Debounce for single object auto-save
    const singleObjectSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingSingleObjectDataRef = useRef<Record<string, any> | null>(null);

    // Track initial item state for detecting real user changes (not auto-ID generation)
    const initialTempItemRef = useRef<Record<string, any> | null>(null);

    // Draft State
    const [lastDraftSave, setLastDraftSave] = useState<Date | null>(null);
    const [isDraftSaving, setIsDraftSaving] = useState(false);

    // Multiple generation tracking
    const [remainingGenerations, setRemainingGenerations] = useState(0);
    const [originalGenerationMessage, setOriginalGenerationMessage] = useState<string | null>(null);

    // Draft hook
    const currentItemId = editingIndex !== null ? `item_${editingIndex}` : 'new';
    const {
        hasPendingDraft,
        pendingDraft,
        checkForDraft,
        loadPendingDraft,
        discardPendingDraft,
        saveDraft,
        clearDraft
    } = useCheckDraft({ slotKey });

    // Ref to hold the latest handleAiFillForm without causing re-renders
    const handleAiFillFormRef = useRef<(data: Record<string, unknown> | Record<string, unknown>[]) => void>();

    // =====================================================
    // IMAGE CLEANUP HELPERS
    // =====================================================

    // Helper to extract image URLs from an item based on config fields
    const extractImageUrls = useCallback((item: Record<string, any>): string[] => {
        const urls: string[] = [];
        if (!config) return urls;

        for (const field of config.fields) {
            if (field.type === 'image') {
                const value = item[field.id];
                if (typeof value === 'string' && value.startsWith('/api/uploads/')) {
                    urls.push(value);
                }
            } else if (field.type === 'gallery') {
                const values = item[field.id];
                if (Array.isArray(values)) {
                    for (const v of values) {
                        if (typeof v === 'string' && v.startsWith('/api/uploads/')) {
                            urls.push(v);
                        }
                    }
                }
            }
        }
        return urls;
    }, [config]);

    // Helper to delete images from server (with usage check)
    // Only deletes images that are not used elsewhere
    const deleteImagesFromServer = useCallback(async (urls: string[]): Promise<void> => {
        if (urls.length === 0) return;

        console.log('[ImageCleanup] Checking', urls.length, 'images for deletion');

        // Import apiClient dynamically to avoid circular deps
        const { apiClient } = await import('@/api/client');

        // Check usage and delete only orphaned images
        const deletePromises = urls.map(async (url) => {
            try {
                // Extract filename from URL
                const filename = url.split('/').pop();
                if (!filename) return;

                // Check usage count
                const response = await apiClient.get(`/endpoints/media.php?file=${encodeURIComponent(filename)}`);
                const usageCount = response.data?.file?.usageCount || 0;

                // Only delete if usage <= 1 (current reference that's being removed)
                if (usageCount <= 1) {
                    await deleteImage(url);
                    console.log('[ImageCleanup] Deleted orphan:', url);
                } else {
                    console.log('[ImageCleanup] Skipped (in use):', url, 'usageCount:', usageCount);
                }
            } catch (e) {
                console.error('[ImageCleanup] Failed to check/delete:', url, e);
            }
        });

        await Promise.allSettled(deletePromises);
    }, []);

    // =====================================================
    // AUTO-ID GENERATION HELPER
    // =====================================================

    // Helper to generate a hash-like ID based on timestamp
    const generateHashId = useCallback((length: number): string => {
        const timestamp = Date.now().toString(36);
        const randomPart = Math.random().toString(36).substring(2);
        const combined = timestamp + randomPart;

        // If the combined string is shorter than needed, repeat it
        let result = combined;
        while (result.length < length) {
            result += Math.random().toString(36).substring(2);
        }

        return result.substring(0, length);
    }, []);

    // Helper to check if a string looks like a hash (non-numeric, alphanumeric)
    const isHashLikeId = useCallback((id: unknown): boolean => {
        if (typeof id !== 'string') return false;
        // It's hash-like if it's at least 8 chars, alphanumeric, and not purely numeric
        if (id.length < 8) return false;
        if (/^\d+$/.test(id)) return false; // Pure numeric is not hash
        if (/^[a-zA-Z0-9_-]+$/.test(id)) return true; // Alphanumeric with optional _ and -
        return false;
    }, []);

    // Helper to create a new empty item with auto-generated ID if there's an 'id' field
    const createEmptyItemWithAutoId = useCallback((): Record<string, any> => {
        const emptyItem: Record<string, any> = {};

        if (!config?.fields) return emptyItem;

        // Check if there's an 'id' field in the config
        const idField = config.fields.find(f => f.id === 'id');

        config.fields.forEach(f => {
            if (f.id === 'id' && idField) {
                if (localItems.length > 0) {
                    // Check if existing IDs are hash-like or numeric
                    const firstExistingId = localItems[0]?.id;

                    if (isHashLikeId(firstExistingId)) {
                        // Generate a hash ID with similar length to existing ones
                        const existingLength = String(firstExistingId).length;
                        const newHashId = generateHashId(existingLength);
                        emptyItem[f.id] = newHashId;
                        console.log('[AutoID] Generated hash ID:', newHashId, '(length:', existingLength, ')');
                    } else {
                        // Find the highest numeric ID in existing items and add 1
                        let maxId = 0;
                        localItems.forEach(item => {
                            const itemId = item.id;
                            if (typeof itemId === 'number' && itemId > maxId) {
                                maxId = itemId;
                            } else if (typeof itemId === 'string') {
                                const numericId = parseInt(itemId, 10);
                                if (!isNaN(numericId) && numericId > maxId) {
                                    maxId = numericId;
                                }
                            }
                        });
                        // Use next sequential ID
                        emptyItem[f.id] = maxId + 1;
                        console.log('[AutoID] Generated numeric ID:', maxId + 1);
                    }
                } else {
                    // No existing items, start with 1 (default to numeric)
                    emptyItem[f.id] = 1;
                    console.log('[AutoID] No existing items, starting with ID: 1');
                }
            } else {
                emptyItem[f.id] = f.defaultValue ?? '';
            }
        });

        return emptyItem;
    }, [config?.fields, localItems, generateHashId, isHashLikeId]);

    // Handle pending AI action - automatically open new item modal
    useEffect(() => {
        if (pendingAction && pendingAction.slotKey === slotKey && pendingAction.type === 'create_new_item') {
            // Quick delay to let React batch state updates
            const timeoutId = setTimeout(() => {
                // Clear the pending action
                setPendingAction(null);

                // Open new item editor
                setEditingIndex(null);
                setEditorOpen(true);

                // Initialize empty form with auto-generated ID
                const emptyItem = createEmptyItemWithAutoId();
                setTempItem(emptyItem);
                initialTempItemRef.current = { ...emptyItem }; // Track initial state

                // Show toast only if no auto-generate
                if (!autoGenerateRequest) {
                    showToast('info', 'AI TARTALOM', 'Írd be az AI-nak mit szeretnél, és automatikusan kitölti az űrlapot.');
                }
            }, 800);

            return () => clearTimeout(timeoutId);
        }
    }, [pendingAction, slotKey, setPendingAction, createEmptyItemWithAutoId, showToast, autoGenerateRequest]);

    // Handle AI delete action - only executes when confirmed
    useEffect(() => {
        if (pendingAction && pendingAction.slotKey === slotKey && pendingAction.type === 'delete_item') {
            // IMPORTANT: Only execute if user has confirmed the action
            if (!pendingAction.confirmed) {
                console.log('[AI Delete] Waiting for user confirmation...');
                return; // Wait for confirmation
            }

            const msg = normalizeAccents(pendingAction.originalUserMessage?.toLowerCase() || '');
            setPendingAction(null);

            if (!isListType || localItems.length === 0) {
                showToast('error', 'HIBA', 'Nincs elem amit törölni lehetne.');
                return;
            }

            console.log('[AI Delete] User confirmed! Parsing message:', msg, 'Items:', localItems.length);

            // Parse target from message
            let targetIndex = -1;
            let matchedIndices: number[] = [];

            // Ordinal keywords (Hungarian)
            const ordinals: Record<string, number> = {
                'elso': 0, 'first': 0,
                'masodik': 1, 'second': 1,
                'harmadik': 2, 'third': 2,
                'negyedik': 3, 'fourth': 3,
                'otodik': 4, 'fifth': 4,
                'utolso': localItems.length - 1, 'last': localItems.length - 1,
                'utolso elotti': localItems.length - 2,
            };

            // Check for ordinal keywords
            for (const [word, index] of Object.entries(ordinals)) {
                if (msg.includes(word) && index >= 0 && index < localItems.length) {
                    targetIndex = index;
                    break;
                }
            }

            // Try to find by number if not found
            if (targetIndex === -1) {
                const numberMatch = msg.match(/(\d+)/);
                if (numberMatch) {
                    targetIndex = parseInt(numberMatch[1], 10) - 1; // 1-indexed to 0-indexed
                }
            }

            // Try to find by name if still not found
            if (targetIndex === -1) {
                const nameFields = ['name', 'title', 'quote', 'skill', 'label'];
                for (const fieldId of nameFields) {
                    const fieldExists = config?.fields.some(f => f.id === fieldId);
                    if (fieldExists) {
                        const foundIdx = localItems.findIndex(item => {
                            const itemValue = normalizeAccents(String(item[fieldId] || '').toLowerCase());
                            return itemValue && msg.includes(itemValue);
                        });
                        if (foundIdx >= 0) {
                            targetIndex = foundIdx;
                            break;
                        }
                    }
                }
            }

            // NEW: Try to find by category/tag/type (for "töröld a soft skilleket")
            if (targetIndex === -1) {
                const categoryFields = ['tags', 'category', 'type', 'skillType'];
                const categoryKeywords = [
                    'soft skill', 'hard skill', 'technical', 'frontend', 'backend',
                    'softskill', 'hardskill', 'language', 'framework', 'tool',
                ];

                // Check if message contains a category keyword
                let matchedCategory = '';
                for (const kw of categoryKeywords) {
                    if (msg.includes(normalizeAccents(kw))) {
                        matchedCategory = kw;
                        break;
                    }
                }

                if (matchedCategory) {
                    console.log('[AI Delete] Looking for category:', matchedCategory);

                    // Find all items matching this category
                    for (let i = 0; i < localItems.length; i++) {
                        const item = localItems[i];
                        for (const fieldId of categoryFields) {
                            const fieldValue = item[fieldId];
                            if (fieldValue) {
                                const normalizedValue = normalizeAccents(String(fieldValue).toLowerCase());
                                if (normalizedValue.includes(normalizeAccents(matchedCategory))) {
                                    matchedIndices.push(i);
                                    break;
                                }
                                // Also check if it's an array (tags)
                                if (Array.isArray(fieldValue)) {
                                    const hasMatch = fieldValue.some(tag =>
                                        normalizeAccents(String(tag).toLowerCase()).includes(normalizeAccents(matchedCategory))
                                    );
                                    if (hasMatch) {
                                        matchedIndices.push(i);
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            }

            console.log('[AI Delete] Target index:', targetIndex, 'Matched indices:', matchedIndices);

            // If we found multiple by category, delete them all
            if (matchedIndices.length > 0) {
                const count = matchedIndices.length;

                // Extract and delete all images from matched items
                const allImagesToDelete: string[] = [];
                matchedIndices.forEach(idx => {
                    const item = localItems[idx];
                    allImagesToDelete.push(...extractImageUrls(item));
                });
                if (allImagesToDelete.length > 0) {
                    deleteImagesFromServer(allImagesToDelete);
                }

                const updatedList = localItems.filter((_, i) => !matchedIndices.includes(i));
                setLocalItems(updatedList);
                save(updatedList).then((result) => {
                    if (result.conflict) {
                        showToast('warning', 'KONFLIKTUS', 'Valaki más módosította a tartalmat.');
                        return;
                    }
                    showToast('success', 'TÖRÖLVE', `${count} elem törölve (kategória alapján).`);
                });
                return;
            }

            // Single item delete
            if (targetIndex >= 0 && targetIndex < localItems.length) {
                const itemToDelete = localItems[targetIndex];
                const itemName = itemToDelete?.name || itemToDelete?.title || `#${targetIndex + 1}`;

                // Extract and delete images from server
                const imagesToDelete = extractImageUrls(itemToDelete);
                if (imagesToDelete.length > 0) {
                    deleteImagesFromServer(imagesToDelete);
                }

                const updatedList = localItems.filter((_, i) => i !== targetIndex);
                setLocalItems(updatedList);
                save(updatedList).then((result) => {
                    if (result.conflict) {
                        showToast('warning', 'KONFLIKTUS', 'Valaki más módosította a tartalmat.');
                        return;
                    }
                    showToast('success', 'TÖRÖLVE', `"${itemName}" sikeresen törölve.`);
                });
            } else {
                showToast('warning', 'NEM TALÁLTAM', 'Nem tudtam azonosítani melyik elemet kell törölni. Próbáld: "töröld az első elemet" vagy "töröld a soft skilleket".');
            }
        }
    }, [pendingAction, slotKey, setPendingAction, isListType, localItems, save, showToast, config]);

    // Handle AI move/reorder action
    useEffect(() => {
        if (pendingAction && pendingAction.slotKey === slotKey && pendingAction.type === 'move_item') {
            const msg = normalizeAccents(pendingAction.originalUserMessage?.toLowerCase() || '');
            setPendingAction(null);

            if (!isListType || localItems.length < 2) {
                showToast('error', 'HIBA', 'Nincs elég elem az átrendezéshez.');
                return;
            }

            console.log('[AI Move] Parsing message:', msg, 'Items:', localItems.length);

            // Parse source and destination
            let sourceIndex = -1;
            let targetPosition = '';

            // Find source by name
            const nameFields = ['name', 'title', 'quote', 'skill', 'label'];
            for (const fieldId of nameFields) {
                const fieldExists = config?.fields.some(f => f.id === fieldId);
                if (fieldExists) {
                    for (let i = 0; i < localItems.length; i++) {
                        const itemValue = normalizeAccents(String(localItems[i][fieldId] || '').toLowerCase());
                        if (itemValue && itemValue.length > 2 && msg.includes(itemValue)) {
                            sourceIndex = i;
                            break;
                        }
                    }
                    if (sourceIndex >= 0) break;
                }
            }

            // Find target position
            if (msg.includes('elso') || msg.includes('first') || msg.includes('felulre') || msg.includes('top') || msg.includes('elejere')) {
                targetPosition = 'first';
            } else if (msg.includes('utolso') || msg.includes('last') || msg.includes('vegere') || msg.includes('bottom') || msg.includes('aljara')) {
                targetPosition = 'last';
            } else if (msg.includes(' fel') || msg.includes('felebb') || msg.includes('up')) {
                targetPosition = 'up';
            } else if (msg.includes(' le') || msg.includes('lejjebb') || msg.includes('down')) {
                targetPosition = 'down';
            }

            console.log('[AI Move] Source:', sourceIndex, 'Target:', targetPosition);

            if (sourceIndex >= 0 && targetPosition) {
                const updatedList = [...localItems];
                const [movedItem] = updatedList.splice(sourceIndex, 1);
                const itemName = movedItem.name || movedItem.title || `#${sourceIndex + 1}`;

                let newIndex = 0;
                if (targetPosition === 'first') {
                    newIndex = 0;
                } else if (targetPosition === 'last') {
                    newIndex = updatedList.length;
                } else if (targetPosition === 'up') {
                    newIndex = Math.max(0, sourceIndex - 1);
                } else if (targetPosition === 'down') {
                    newIndex = Math.min(updatedList.length, sourceIndex);  // +1 already removed
                }

                updatedList.splice(newIndex, 0, movedItem);
                setLocalItems(updatedList);
                save(updatedList).then((result) => {
                    if (result.conflict) {
                        showToast('warning', 'KONFLIKTUS', 'Valaki más módosította a tartalmat.');
                        return;
                    }
                    showToast('success', 'ÁTRENDEZVE', `"${itemName}" átmozgatva.`);
                });
            } else {
                showToast('warning', 'NEM SIKERÜLT', 'Nem tudtam azonosítani mit és hova. Próbáld: "Mozgasd a React-ot az első helyre".');
            }
        }
    }, [pendingAction, slotKey, setPendingAction, isListType, localItems, save, showToast, config]);

    // Handle AI bulk delete action
    useEffect(() => {
        if (pendingAction && pendingAction.slotKey === slotKey && pendingAction.type === 'bulk_delete') {
            // IMPORTANT: Only execute if user has confirmed the action
            if (!pendingAction.confirmed) {
                console.log('[AI Bulk Delete] Waiting for user confirmation...');
                return; // Wait for confirmation
            }

            const msg = normalizeAccents(pendingAction.originalUserMessage?.toLowerCase() || '');
            setPendingAction(null);

            if (!isListType || localItems.length === 0) {
                showToast('error', 'HIBA', 'Nincs elem amit törölni lehetne.');
                return;
            }

            console.log('[AI Bulk Delete] User confirmed! Message:', msg, 'Items:', localItems.length);

            // Delete all
            if (msg.includes('minden') || msg.includes('osszes') || msg.includes('all') || msg.includes('mindent')) {
                const count = localItems.length;

                // Extract and delete all images from all items
                const allImagesToDelete: string[] = [];
                localItems.forEach(item => {
                    allImagesToDelete.push(...extractImageUrls(item));
                });
                if (allImagesToDelete.length > 0) {
                    deleteImagesFromServer(allImagesToDelete);
                }

                setLocalItems([]);
                save([]).then((result) => {
                    if (result.conflict) {
                        showToast('warning', 'KONFLIKTUS', 'Valaki más módosította a tartalmat.');
                        return;
                    }
                    showToast('success', 'TÖRÖLVE', `${count} elem sikeresen törölve.`);
                });
            } else {
                showToast('warning', 'NEM EGYÉRTELMŰ', 'A tömeges törléshez írd: "Töröld az összes elemet" vagy "Töröld mindent".');
            }
        }
    }, [pendingAction, slotKey, setPendingAction, isListType, localItems, save, showToast]);

    // Initialize local items from data
    useEffect(() => {
        if (Array.isArray(data)) {
            setLocalItems(data.map(item => ({
                ...item,
                _dndId: item._dndId || Math.random().toString(36).substr(2, 9)
            })));
        }
    }, [data]);

    // Track unsaved changes
    useEffect(() => {
        if (editorOpen && tempItem) {
            const currentJson = JSON.stringify(tempItem);
            // For new items: compare to initial state (with auto-ID), for editing: compare to original item
            const originalJson = editingIndex !== null
                ? JSON.stringify(localItems[editingIndex])
                : (initialTempItemRef.current ? JSON.stringify(initialTempItemRef.current) : '{}');
            setHasUnsavedChanges(currentJson !== originalJson);
        } else {
            setHasUnsavedChanges(false);
        }
    }, [tempItem, editorOpen, editingIndex, localItems]);

    // Auto-save draft (debounced) - only when user made actual changes
    useEffect(() => {
        // Skip if editor is closed, no tempItem, or tempItem is empty
        if (!editorOpen || !tempItem || Object.keys(tempItem).length === 0) return;

        // IMPORTANT: Only save draft if user made actual changes
        // This prevents saving on initial load / auto-ID generation
        const currentJson = JSON.stringify(tempItem);
        // For new items: compare to initial state (with auto-ID), for editing: compare to original item
        const originalJson = editingIndex !== null
            ? JSON.stringify(localItems[editingIndex])
            : (initialTempItemRef.current ? JSON.stringify(initialTempItemRef.current) : '{}');
        const userMadeChanges = currentJson !== originalJson;

        // Don't save draft if no real user changes (e.g., just auto-ID generation)
        if (!userMadeChanges) return;

        setIsDraftSaving(true);
        const timeoutId = setTimeout(async () => {
            try {
                await saveDraft(tempItem, currentItemId);
                setLastDraftSave(new Date());
            } catch (e) {
                console.error('Draft save failed:', e);
            } finally {
                setIsDraftSaving(false);
            }
        }, 2000);

        return () => clearTimeout(timeoutId);
    }, [tempItem, editorOpen, currentItemId, saveDraft, editingIndex, localItems]);

    // Browser beforeunload warning
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (hasUnsavedChanges) {
                e.preventDefault();
                e.returnValue = '';
                return '';
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [hasUnsavedChanges]);

    // Cleanup debounce timeout on unmount
    useEffect(() => {
        return () => {
            if (singleObjectSaveTimeoutRef.current) {
                clearTimeout(singleObjectSaveTimeoutRef.current);
            }
        };
    }, []);

    // Clear selection when filter changes
    useEffect(() => {
        setSelectedItems(new Set());
    }, [searchTerm, showPublishedOnly]);

    // Filtered items
    const filteredItems = useMemo(() => {
        if (!isListType) return [];
        let items = localItems;

        // Filter by published status
        if (publishedField && showPublishedOnly !== null) {
            items = items.filter((item: any) => item[publishedField] === showPublishedOnly);
        }

        // Filter by search term
        if (searchTerm) {
            items = items.filter((item: any) =>
                Object.values(item).some(val =>
                    String(val).toLowerCase().includes(searchTerm.toLowerCase())
                )
            );
        }
        return items;
    }, [localItems, searchTerm, isListType, publishedField, showPublishedOnly]);

    // === Handlers ===

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            const oldIndex = localItems.findIndex(i => i._dndId === active.id);
            const newIndex = localItems.findIndex(i => i._dndId === over.id);

            if (oldIndex !== -1 && newIndex !== -1) {
                const newOrder = arrayMove(localItems, oldIndex, newIndex);
                setLocalItems(newOrder);

                save(newOrder).catch(() => {
                    showToast('error', 'RENDEZÉS HIBA', 'Nem sikerült menteni az új sorrendet.');
                });
            }
        }
    }, [localItems, save, showToast]);

    const handleToggleSelect = useCallback((index: number) => {
        setSelectedItems(prev => {
            const newSet = new Set(prev);
            if (newSet.has(index)) {
                newSet.delete(index);
            } else {
                newSet.add(index);
            }
            return newSet;
        });
    }, []);

    const handleToggleSelectAll = useCallback(() => {
        if (selectedItems.size === filteredItems.length) {
            setSelectedItems(new Set());
        } else {
            setSelectedItems(new Set(filteredItems.map((_, idx) => idx)));
        }
    }, [filteredItems, selectedItems.size]);

    const handleBulkDelete = useCallback(() => {
        if (selectedItems.size === 0) return;

        confirm({
            title: `${selectedItems.size} Elem Törlése`,
            message: `Biztosan törölni szeretné a kiválasztott ${selectedItems.size} elemet? A művelet végleges.`,
            isDestructive: true,
            confirmLabel: `${selectedItems.size} Elem Törlése`,
            onConfirm: async () => {
                setIsSaving(true);
                try {
                    const indicesToDelete = Array.from(selectedItems);
                    const itemsToDeleteObjects = indicesToDelete.map(idx => filteredItems[idx]);

                    // Extract and delete all images from selected items
                    const allImagesToDelete: string[] = [];
                    itemsToDeleteObjects.forEach(item => {
                        allImagesToDelete.push(...extractImageUrls(item));
                    });
                    if (allImagesToDelete.length > 0) {
                        await deleteImagesFromServer(allImagesToDelete);
                    }

                    const itemDndIds = itemsToDeleteObjects.map(item => item._dndId);
                    const updatedList = localItems.filter(item => !itemDndIds.includes(item._dndId));

                    setLocalItems(updatedList);
                    const saveResult = await save(updatedList);

                    if (saveResult.conflict) {
                        showToast('warning', 'KONFLIKTUS', 'Valaki más módosította a tartalmat. Frissítsd az oldalt!');
                        return;
                    }

                    setSelectedItems(new Set());
                    showToast('success', 'TÖRLÉS SIKERES', `${indicesToDelete.length} elem eltávolítva.`);
                } catch (e: any) {
                    console.error("Bulk delete failed", e);
                    if (e?.isPanicMode) {
                        showToast('warning', 'PÁNIK MÓD', 'Bocsi, a rendszer most pánik módban van! Próbáld meg később.');
                    } else {
                        showToast('error', 'HIBA', 'Nem sikerült törölni az elemeket.');
                    }
                } finally {
                    setIsSaving(false);
                }
            }
        });
    }, [selectedItems, filteredItems, localItems, save, confirm, showToast, extractImageUrls, deleteImagesFromServer]);

    const handleBulkDuplicate = useCallback(async () => {
        if (selectedItems.size === 0) return;

        setIsSaving(true);
        try {
            const indicesToDuplicate = Array.from(selectedItems);
            const itemsToDuplicate = indicesToDuplicate.map(idx => filteredItems[idx]);

            const duplicatedItems = itemsToDuplicate.map(item => ({
                ...item,
                _dndId: Math.random().toString(36).substr(2, 9),
                ...(item.title ? { title: `${item.title} (másolat)` } : {}),
                ...(item.name ? { name: `${item.name} (másolat)` } : {}),
                ...(publishedField ? { [publishedField]: false } : {}),
                ...(item.slug ? { slug: `${item.slug}-copy-${Date.now()}` } : {})
            }));

            const updatedList = [...localItems, ...duplicatedItems];
            setLocalItems(updatedList);
            const saveResult = await save(updatedList);

            if (saveResult.conflict) {
                showToast('warning', 'KONFLIKTUS', 'Valaki más módosította a tartalmat. Frissítsd az oldalt!');
                return;
            }

            showToast('success', 'DUPLIKÁLÁS SIKERES', `${itemsToDuplicate.length} elem lemásolva.`);
        } catch (e: any) {
            console.error("Bulk duplicate failed", e);
            if (e?.isPanicMode) {
                showToast('warning', 'PÁNIK MÓD', 'Bocsi, a rendszer most pánik módban van! Próbáld meg később.');
            } else {
                showToast('error', 'HIBA', 'Nem sikerült duplikálni az elemeket.');
            }
        } finally {
            setIsSaving(false);
        }
    }, [selectedItems, filteredItems, localItems, save, showToast, publishedField]);

    const handleBulkPublish = useCallback(async (shouldPublish: boolean) => {
        if (selectedItems.size === 0 || !publishedField) return;

        setIsSaving(true);
        try {
            const indicesToUpdate = Array.from(selectedItems);
            // We need to map indices back to the original items in localItems via _dndId or reference
            // But since filteredItems are subsets, let's use the _dndId to find them in localItems
            const itemsToUpdate = indicesToUpdate.map(idx => filteredItems[idx]);
            const idsToUpdate = new Set(itemsToUpdate.map(i => i._dndId));

            const updatedList = localItems.map(item => {
                if (idsToUpdate.has(item._dndId)) {
                    return { ...item, [publishedField]: shouldPublish };
                }
                return item;
            });

            setLocalItems(updatedList);
            const saveResult = await save(updatedList);

            if (saveResult.conflict) {
                showToast('warning', 'KONFLIKTUS', 'Valaki más módosította a tartalmat. Frissítsd az oldalt!');
                return;
            }

            // Note: We keep selection active so user can toggle back if mistakes were made
            showToast(
                'success',
                shouldPublish ? 'PUBLIKÁLVA' : 'VÁZLATBA TÉVE',
                `${itemsToUpdate.length} elem státusza frissítve.`
            );
        } catch (e: any) {
            console.error("Bulk publish failed", e);
            showToast('error', 'HIBA', 'Nem sikerült frissíteni a státuszt.');
        } finally {
            setIsSaving(false);
        }
    }, [selectedItems, filteredItems, localItems, save, showToast, publishedField]);

    const handleDuplicateSingle = useCallback(async (filteredIndex: number) => {
        setIsSaving(true);
        try {
            const item = filteredItems[filteredIndex];
            const duplicatedItem = {
                ...item,
                _dndId: Math.random().toString(36).substr(2, 9),
                ...(item.title ? { title: `${item.title} (másolat)` } : {}),
                ...(item.name ? { name: `${item.name} (másolat)` } : {}),
                ...(publishedField ? { [publishedField]: false } : {}),
                ...(item.slug ? { slug: `${item.slug}-copy-${Date.now()}` } : {})
            };

            const updatedList = [...localItems, duplicatedItem];
            setLocalItems(updatedList);
            const saveResult = await save(updatedList);

            if (saveResult.conflict) {
                showToast('warning', 'KONFLIKTUS', 'Valaki más módosította a tartalmat. Frissítsd az oldalt!');
                return;
            }

            showToast('success', 'DUPLIKÁLVA', 'Az elem sikeresen lemásolva.');
        } catch (e: any) {
            console.error("Duplicate failed", e);
            if (e?.isPanicMode) {
                showToast('warning', 'PÁNIK MÓD', 'Bocsi, a rendszer most pánik módban van! Próbáld meg később.');
            } else {
                showToast('error', 'HIBA', 'Nem sikerült duplikálni az elemet.');
            }
        } finally {
            setIsSaving(false);
        }
    }, [filteredItems, localItems, save, showToast, publishedField]);

    // Helper function to process a single media value (image, video, audio, file)
    const processMediaValue = useCallback(async (value: any, key: string): Promise<any> => {
        // Handle single pending image
        if (isPendingImage(value)) {
            const response = await uploadImage(value.file);
            if (response.success && response.url) {
                URL.revokeObjectURL(value.preview);
                return response.url;
            }
            throw new Error('Image upload failed');
        }
        
        // Handle pending video upload
        if (isPendingVideo(value)) {
            const response = await uploadVideo(value.file);
            if (response.success && response.url) {
                URL.revokeObjectURL(value.preview);
                return response.url;
            }
            throw new Error('Video upload failed');
        }
        
        // Handle pending audio upload
        if (isPendingAudio(value)) {
            const response = await uploadAudio(value.file);
            if (response.success && response.url) {
                URL.revokeObjectURL(value.preview);
                return response.url;
            }
            throw new Error('Audio upload failed');
        }
        
        // Handle pending file upload
        if (isPendingFile(value)) {
            const fieldConfig = config?.fields.find(f => f.id === key);
            const fileConfig = fieldConfig?.fileConfig || {};
            const response = await uploadFileApi(value.file, fileConfig);
            if (response.success && response.file) {
                return response.file as StoredFileInfo;
            }
            throw new Error(response.error || 'File upload failed');
        }
        
        return value;
    }, [config]);

    // Helper function to upload all pending images and files in data before save
    // Now supports recursive processing for blocks field type
    const uploadPendingImages = useCallback(async (data: Record<string, any>): Promise<Record<string, any>> => {
        const processedData = { ...data };

        for (const [key, value] of Object.entries(processedData)) {
            // Handle single pending media (image, video, audio, file)
            if (isPendingImage(value) || isPendingVideo(value) || isPendingAudio(value) || isPendingFile(value)) {
                try {
                    processedData[key] = await processMediaValue(value, key);
                } catch (error) {
                    console.error(`Failed to upload media for field ${key}:`, error);
                    throw error;
                }
            }
            // Handle blocks field type - array of ContentBlock objects with {id, type, data}
            else if (Array.isArray(value) && value.length > 0 && value[0]?.id && value[0]?.type !== undefined && 'data' in value[0]) {
                // This is a blocks array (ContentBlock[])
                const processedBlocks = [];
                for (const block of value) {
                    const processedBlock = { ...block };
                    
                    // Process the data inside each block based on type
                    if (block.data !== null && block.data !== undefined) {
                        // Check if block data is a pending media
                        if (isPendingImage(block.data) || isPendingVideo(block.data) || isPendingAudio(block.data)) {
                            try {
                                processedBlock.data = await processMediaValue(block.data, `${key}.${block.id}`);
                            } catch (error) {
                                console.error(`Failed to upload media in block ${block.id}:`, error);
                                throw error;
                            }
                        }
                        // Handle gallery inside a block
                        else if (Array.isArray(block.data)) {
                            const processedArray: string[] = [];
                            for (const item of block.data as GalleryItem[]) {
                                if (isPendingImage(item)) {
                                    try {
                                        const response = await uploadImage(item.file);
                                        if (response.success && response.url) {
                                            URL.revokeObjectURL(item.preview);
                                            processedArray.push(response.url);
                                        } else {
                                            throw new Error('Gallery upload failed');
                                        }
                                    } catch (error) {
                                        console.error(`Failed to upload gallery image in block ${block.id}:`, error);
                                        throw error;
                                    }
                                } else if (typeof item === 'string') {
                                    processedArray.push(item);
                                }
                            }
                            processedBlock.data = processedArray;
                        }
                    }
                    
                    processedBlocks.push(processedBlock);
                }
                processedData[key] = processedBlocks;
            }
            // Handle gallery with pending images (regular array of strings/PendingImages)
            else if (Array.isArray(value)) {
                // Check if this looks like a gallery (strings or PendingImages)
                const hasGalleryItems = value.some(item => typeof item === 'string' || isPendingImage(item));
                if (hasGalleryItems) {
                    const processedArray: string[] = [];
                    for (const item of value as GalleryItem[]) {
                        if (isPendingImage(item)) {
                            try {
                                const response = await uploadImage(item.file);
                                if (response.success && response.url) {
                                    URL.revokeObjectURL(item.preview);
                                    processedArray.push(response.url);
                                } else {
                                    throw new Error('Gallery upload failed');
                                }
                            } catch (error) {
                                console.error('Failed to upload gallery image:', error);
                                throw error;
                            }
                        } else if (typeof item === 'string') {
                            processedArray.push(item);
                        }
                    }
                    processedData[key] = processedArray;
                }
            }
        }

        return processedData;
    }, [config, processMediaValue]);

    const handleSave = useCallback(async (newData: any) => {
        setIsSaving(true);
        try {
            // Upload any pending images first
            const processedData = await uploadPendingImages(newData);

            let saveResult;
            if (isListType) {
                const updatedList = [...localItems];
                if (editingIndex !== null && editingIndex >= 0) {
                    updatedList[editingIndex] = { ...updatedList[editingIndex], ...processedData };
                } else {
                    updatedList.push({ ...processedData, _dndId: Math.random().toString(36).substr(2, 9) });
                }
                setLocalItems(updatedList);
                saveResult = await save(updatedList);
            } else {
                saveResult = await save(processedData);
            }

            // Handle conflict error (optimistic locking)
            if (saveResult.conflict) {
                showToast('warning', 'KONFLIKTUS',
                    'A tartalom időközben módosult egy másik felhasználó által. Kérlek frissítsd az oldalt és próbáld újra!');
                // Offer to refetch
                confirm({
                    title: 'Tartalom Konfliktus',
                    message: 'A tartalmat időközben más felhasználó módosította. Szeretnéd újratölteni a legfrissebb verziót?',
                    confirmLabel: 'Frissítés',
                    onConfirm: async () => {
                        await refetch();
                        showToast('info', 'FRISSÍTVE', 'A legfrissebb tartalom betöltve.');
                    }
                });
                return;
            }

            if (!saveResult.success) {
                throw new Error(saveResult.message || 'Save failed');
            }

            await clearDraft(currentItemId);

            if (isListType) {
                setHasUnsavedChanges(false);
                setEditorOpen(false);
                setEditingIndex(null);
                setTempItem(null); // Clear tempItem after successful save
                initialTempItemRef.current = null; // Clear initial state
            }

            // Check if we need to generate more items
            if (remainingGenerations > 0 && originalGenerationMessage) {
                const remaining = remainingGenerations;
                const total = remaining + 1; // +1 because we just saved one

                console.log(`[useSlotEditor] Multiple generation: ${remaining} items remaining`);
                showToast('info', 'AI GENERÁLÁS', `Elem mentve! Következő generálása... (${total - remaining}/${total + (remaining > 0 ? 0 : 1)})`);

                // Decrement counter
                setRemainingGenerations(remaining - 1);

                // Delay then trigger next generation
                setTimeout(() => {
                    // Open new editor for next item
                    setEditingIndex(null);
                    setEditorOpen(true);

                    // Initialize empty form with auto-generated ID
                    const emptyItem = createEmptyItemWithAutoId();
                    setTempItem(emptyItem);
                    initialTempItemRef.current = { ...emptyItem }; // Track initial state

                    // Trigger auto-generation again
                    setAutoGenerateRequest(originalGenerationMessage);

                    console.log('[useSlotEditor] Triggered next generation');
                }, 800);
            } else {
                // Normal completion
                if (remainingGenerations === 0 && originalGenerationMessage) {
                    // Completed all generations
                    showToast('success', 'GENERÁLÁS KÉSZ', 'Minden elem sikeresen generálva és mentve!');
                    setOriginalGenerationMessage(null);
                } else {
                    showToast('success', 'MENTÉS SIKERES', 'Az adatok sikeresen rögzítésre kerültek.');
                }
            }
        } catch (e: any) {
            console.error("Save failed", e);
            // Check if it's a panic mode error
            if (e?.isPanicMode) {
                showToast('warning', 'PÁNIK MÓD', 'Bocsi, a rendszer most pánik módban van! Próbáld meg később.');
            } else {
                showToast('error', 'MENTÉS SIKERTELEN', 'Hiba történt az adatok mentése közben.');
            }
            // Reset multiple generation on error
            setRemainingGenerations(0);
            setOriginalGenerationMessage(null);
        } finally {
            setIsSaving(false);
        }
    }, [isListType, localItems, editingIndex, save, clearDraft, currentItemId, showToast, remainingGenerations, originalGenerationMessage, config, setAutoGenerateRequest, uploadPendingImages, confirm, refetch]);

    const handleDelete = useCallback((filteredIndex: number) => {
        if (isSaving) return;

        // Convert filtered index to real localItems index using _dndId
        const itemToDelete = filteredItems[filteredIndex];
        const realIndex = localItems.findIndex(item => item._dndId === itemToDelete._dndId);

        if (realIndex === -1) {
            showToast('error', 'HIBA', 'Az elem nem található.');
            return;
        }

        confirm({
            title: 'Törlés Megerősítése',
            message: 'Biztosan törölni szeretné ezt az elemet? A művelet végleges.',
            isDestructive: true,
            confirmLabel: 'Törlés',
            onConfirm: async () => {
                setIsSaving(true);
                try {
                    // Extract and delete images from server
                    const imagesToDelete = extractImageUrls(itemToDelete);
                    if (imagesToDelete.length > 0) {
                        await deleteImagesFromServer(imagesToDelete);
                    }

                    const updatedList = localItems.filter((_, i) => i !== realIndex);
                    setLocalItems(updatedList);
                    const saveResult = await save(updatedList);

                    if (saveResult.conflict) {
                        showToast('warning', 'KONFLIKTUS', 'Valaki más módosította a tartalmat. Frissítsd az oldalt!');
                        return;
                    }

                    showToast('success', 'TÖRÖLVE', 'Az elem eltávolításra került.');
                } catch (e: any) {
                    console.error("Delete failed", e);
                    if (e?.isPanicMode) {
                        showToast('warning', 'PÁNIK MÓD', 'Bocsi, a rendszer most pánik módban van! Próbáld meg később.');
                    } else {
                        showToast('error', 'HIBA', 'Nem sikerült törölni az elemet.');
                    }
                } finally {
                    setIsSaving(false);
                }
            }
        });
    }, [isSaving, localItems, filteredItems, save, confirm, showToast, extractImageUrls, deleteImagesFromServer]);

    const openEditor = useCallback(async (filteredIndex: number | null = null) => {
        const itemId = filteredIndex !== null ? `item_${filteredIndex}` : 'new';

        const existingDraft = await checkForDraft(itemId);

        if (filteredIndex !== null) {
            // Convert filtered index to real localItems index using _dndId
            const filteredItem = filteredItems[filteredIndex];
            const realIndex = localItems.findIndex(item => item._dndId === filteredItem._dndId);

            if (realIndex === -1) {
                console.error('Cannot find item in localItems');
                return;
            }

            setEditingIndex(realIndex);  // Store the REAL index
            setTempItem({ ...localItems[realIndex] });
            initialTempItemRef.current = { ...localItems[realIndex] }; // Track initial state for editing
        } else {
            setEditingIndex(null);
            // Use auto-ID helper for new items
            const newItem = createEmptyItemWithAutoId();
            setTempItem(newItem);
            initialTempItemRef.current = { ...newItem }; // Track initial state to detect real user changes
        }

        setEditorOpen(true);

        if (existingDraft && existingDraft.data && Object.keys(existingDraft.data).length > 0) {
            setShowDraftRecovery(true);
        } else {
            setShowDraftRecovery(false);
        }
    }, [localItems, filteredItems, checkForDraft, createEmptyItemWithAutoId]);

    const handleRestoreDraft = useCallback(() => {
        const draftData = loadPendingDraft();
        if (draftData) {
            setTempItem(draftData);
            setShowDraftRecovery(false);
            showToast('success', 'DRAFT VISSZAÁLLÍTVA', 'A korábban mentett változtatások betöltve.');
        }
    }, [loadPendingDraft, showToast]);

    const handleDiscardDraft = useCallback(async () => {
        await discardPendingDraft();
        setShowDraftRecovery(false);
        showToast('info', 'DRAFT ELVETVE', 'A korábban mentett változtatások törölve.');
    }, [discardPendingDraft, showToast]);

    // Helper to cleanup blob URLs from tempItem when closing without save
    const cleanupPendingImages = useCallback((item: Record<string, any> | null) => {
        if (!item) return;
        Object.values(item).forEach(value => {
            if (isPendingImage(value)) {
                URL.revokeObjectURL(value.preview);
            } else if (Array.isArray(value)) {
                value.forEach((v: GalleryItem) => {
                    if (isPendingImage(v)) {
                        URL.revokeObjectURL(v.preview);
                    }
                });
            }
        });
    }, []);

    const closeEditor = useCallback(() => {
        // Check if there are pending images in tempItem
        const hasPendingImages = tempItem && Object.values(tempItem).some((value: any) => {
            if (isPendingImage(value)) return true;
            if (Array.isArray(value)) {
                return value.some((item: GalleryItem) => isPendingImage(item));
            }
            return false;
        });

        if (hasUnsavedChanges || hasPendingImages) {
            confirm({
                title: 'Mentetlen Változások',
                message: hasPendingImages
                    ? 'Vannak kiválasztott képek amik nem lettek feltöltve. Biztosan be szeretné zárni a szerkesztőt?'
                    : 'Vannak mentetlen változások. Biztosan be szeretné zárni a szerkesztőt?',
                isDestructive: true,
                confirmLabel: 'Elvetés',
                cancelLabel: 'Szerkesztés Folytatása',
                onConfirm: () => {
                    // Cleanup blob URLs before closing
                    cleanupPendingImages(tempItem);
                    setHasUnsavedChanges(false);
                    setEditorOpen(false);
                    setEditingIndex(null);
                    setTempItem(null);
                    initialTempItemRef.current = null; // Clear initial state
                }
            });
        } else {
            setEditorOpen(false);
            setEditingIndex(null);
            setTempItem(null);
            initialTempItemRef.current = null; // Clear initial state
        }
    }, [hasUnsavedChanges, confirm, tempItem, cleanupPendingImages]);

    // =====================================================
    // SINGLE OBJECT AUTO-SAVE
    // =====================================================
    // Simple 500ms debounced save - backend handles versioning automatically
    // Backend uses hash-based dedup, so rapid saves won't create duplicate versions

    const handleSingleObjectChange = useCallback(async (fieldId: string, value: any) => {
        // Check if the value is a pending image - if so, don't auto-save yet
        // The user will need to trigger a manual save
        if (isPendingImage(value)) {
            // Just update local state, don't save to server
            // This will show preview but not upload yet - SingleObjectView handles this now
            return;
        }

        // Check if it's a gallery with pending images
        if (Array.isArray(value) && value.some(item => isPendingImage(item))) {
            // SingleObjectView handles pending galleries now
            return;
        }

        // Debounced auto-save for non-image fields (500ms)
        // Accumulate changes in pending data ref
        pendingSingleObjectDataRef.current = {
            ...(pendingSingleObjectDataRef.current || data),
            [fieldId]: value
        };

        // Clear existing timeout
        if (singleObjectSaveTimeoutRef.current) {
            clearTimeout(singleObjectSaveTimeoutRef.current);
        }

        // Set new debounced save
        // Backend will automatically create versions when content changes (hash-based dedup)
        singleObjectSaveTimeoutRef.current = setTimeout(() => {
            const dataToSave = pendingSingleObjectDataRef.current;
            if (dataToSave) {
                save(dataToSave).then((result) => {
                    if (result.conflict) {
                        showToast('warning', 'KONFLIKTUS', 'Valaki más módosította a tartalmat.');
                    }
                }).catch(() => {
                    showToast('error', 'AUTO-MENTÉS HIBA', 'Nem sikerült menteni a változást.');
                });
                pendingSingleObjectDataRef.current = null;
            }
        }, 500);
    }, [data, save, showToast]);

    // Save handler for SingleObjectView with pending images
    const handleSaveWithPendingImages = useCallback(async (newData: any) => {
        setIsSaving(true);
        try {
            // Upload any pending images first
            const processedData = await uploadPendingImages(newData);

            // Save the processed data - backend handles versioning automatically
            const saveResult = await save(processedData);

            if (saveResult.conflict) {
                showToast('warning', 'KONFLIKTUS', 'Valaki más módosította a tartalmat. Frissítsd az oldalt!');
                return;
            }

            showToast('success', 'MENTÉS SIKERES', 'A képek feltöltve és az adatok mentve.');
        } catch (e) {
            console.error("Save with pending images failed", e);
            showToast('error', 'MENTÉS SIKERTELEN', 'Hiba történt a képek feltöltése közben.');
            throw e; // Re-throw so SingleObjectView can handle it
        } finally {
            setIsSaving(false);
        }
    }, [save, uploadPendingImages, showToast]);

    // AI Form Fill Handler - using functional update to avoid stale closure
    // Works for both list/collection (modal) and single object views
    // When autoSave is true (multiple generation mode), saves immediately after filling
    const handleAiFillForm = useCallback((aiData: Record<string, unknown> | Record<string, unknown>[]) => {
        console.log('[AI Fill] Received data:', aiData);
        console.log('[AI Fill] editorOpen:', editorOpen);
        console.log('[AI Fill] isListType:', isListType);

        // Check if AI returned an array of items (multi-item generation)
        if (Array.isArray(aiData) && isListType && aiData.length > 0) {
            console.log('[AI Fill] Array detected! Saving ALL', aiData.length, 'items at once');

            // Add ALL items to the list at once
            const newItems = aiData.map(item => ({
                ...item,
                _dndId: Math.random().toString(36).substr(2, 9)
            }));

            const updatedList = [...localItems, ...newItems];
            setLocalItems(updatedList);

            save(updatedList).then((result) => {
                if (result.conflict) {
                    showToast('warning', 'KONFLIKTUS', 'Valaki más módosította a tartalmat. Frissítsd az oldalt!');
                    return;
                }
                showToast('success', 'AI GENERÁLÁS', `${aiData.length} elem sikeresen hozzáadva!`);

                // Close modal if open
                if (editorOpen) {
                    setEditorOpen(false);
                    setTempItem(null);
                    setEditingIndex(null);
                    initialTempItemRef.current = null; // Clear initial state
                }
            }).catch(() => {
                showToast('error', 'MENTÉS HIBA', 'Nem sikerült menteni az elemeket.');
            });

            return;
        }

        // Single item case (original logic)
        const singleData = aiData as Record<string, unknown>;


        // Determine if we should auto-save (during multiple generation)
        const shouldAutoSave = originalGenerationMessage !== null;

        if (isListType) {
            // List/collection type - fill the modal form
            if (editorOpen) {
                const filledData = { ...singleData };

                setTempItem((currentTempItem: any) => {
                    if (currentTempItem === null) {
                        console.log('[AI Fill] No tempItem, using singleData directly');
                        return filledData;
                    }
                    console.log('[AI Fill] Merging with current tempItem:', currentTempItem);
                    return { ...currentTempItem, ...filledData };
                });
                setHasUnsavedChanges(true);

                if (shouldAutoSave) {
                    // Auto-save after a brief delay for state to settle
                    console.log('[AI Fill] Auto-save mode - will save automatically');
                    showToast('info', 'AI KITÖLTÉS', 'Űrlap kitöltve, automatikus mentés...');

                    // Use setTimeout to allow state update to complete
                    setTimeout(() => {
                        // Call handleSave with the filled data directly
                        // We need to use the data directly because tempItem might not be updated yet
                        const saveData = { ...singleData };
                        console.log('[AI Fill] Auto-saving with data:', saveData);

                        // Trigger save directly
                        const updatedList = [...localItems];
                        if (editingIndex !== null && editingIndex >= 0) {
                            updatedList[editingIndex] = { ...updatedList[editingIndex], ...saveData };
                        } else {
                            updatedList.push({ ...saveData, _dndId: Math.random().toString(36).substr(2, 9) });
                        }

                        setLocalItems(updatedList);
                        save(updatedList).then(async (result) => {
                            if (result.conflict) {
                                showToast('warning', 'KONFLIKTUS', 'Valaki más módosította a tartalmat.');
                                setRemainingGenerations(0);
                                setOriginalGenerationMessage(null);
                                return;
                            }

                            await clearDraft(currentItemId);
                            setHasUnsavedChanges(false);
                            setEditorOpen(false);
                            setEditingIndex(null);

                            // Check if we need to generate more items
                            if (remainingGenerations > 0 && originalGenerationMessage) {
                                const remaining = remainingGenerations;

                                console.log(`[AI Fill] Multiple generation: ${remaining} items remaining`);
                                showToast('info', 'AI GENERÁLÁS', `Elem mentve! Következő generálása...`);

                                // Decrement counter
                                setRemainingGenerations(remaining - 1);

                                // Delay then trigger next generation
                                setTimeout(() => {
                                    // Open new editor for next item
                                    setEditingIndex(null);
                                    setEditorOpen(true);

                                    // Initialize empty form with auto-generated ID
                                    const emptyItem = createEmptyItemWithAutoId();
                                    setTempItem(emptyItem);
                                    initialTempItemRef.current = { ...emptyItem }; // Track initial state

                                    // Trigger auto-generation again
                                    setAutoGenerateRequest(originalGenerationMessage);

                                    console.log('[AI Fill] Triggered next generation');
                                }, 1000);
                            } else {
                                // Completed all generations
                                showToast('success', 'GENERÁLÁS KÉSZ', 'Minden elem sikeresen generálva és mentve!');
                                setOriginalGenerationMessage(null);
                            }
                        }).catch((e) => {
                            console.error('[AI Fill] Auto-save failed:', e);
                            showToast('error', 'MENTÉS HIBA', 'Nem sikerült automatikusan menteni.');
                            setRemainingGenerations(0);
                            setOriginalGenerationMessage(null);
                        });
                    }, 500);
                } else {
                    showToast('success', 'AI KITÖLTÉS', 'Az űrlap kitöltve az AI által generált tartalommal.');
                }
            } else {
                console.log('[AI Fill] Editor not open, cannot fill form');
            }
        } else {
            // Single object type - directly save each field
            console.log('[AI Fill] Single object mode - saving fields directly');
            const currentData = data || {};
            const mergedData = { ...currentData, ...singleData };

            // Save the merged data
            save(mergedData).then((result) => {
                if (result.conflict) {
                    showToast('warning', 'KONFLIKTUS', 'Valaki más módosította a tartalmat. Frissítsd az oldalt!');
                    return;
                }
                showToast('success', 'AI KITÖLTÉS', 'Az űrlap kitöltve az AI által generált tartalommal.');
            }).catch(() => {
                showToast('error', 'MENTÉS HIBA', 'Nem sikerült menteni az AI által generált tartalmat.');
            });
        }
    }, [editorOpen, isListType, data, save, showToast, remainingGenerations, originalGenerationMessage, localItems, editingIndex, clearDraft, currentItemId, config, setAutoGenerateRequest, generationQueue, advanceGenerationQueue, setGenerationQueue, slotKey, autoGenerateRequest]);

    // Keep the ref updated with latest handleAiFillForm
    useEffect(() => {
        handleAiFillFormRef.current = handleAiFillForm;
    }, [handleAiFillForm]);

    // Update AI form context when editor opens/closes OR for single objects when page loads
    useEffect(() => {
        // For list/collection types - context only when editor modal is open
        // For single object types - context is always available (no modal needed)
        const shouldHaveContext = config && aiEnabled && hasApiKey && !loading && (
            (isListType && editorOpen) || (!isListType && data !== undefined)
        );

        if (shouldHaveContext) {
            const newContext = {
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
                currentData: isListType ? tempItem : data,
                editingIndex: isListType ? editingIndex : null,
                onFillForm: (data: Record<string, unknown> | Record<string, unknown>[]) => {
                    if (handleAiFillFormRef.current) {
                        handleAiFillFormRef.current(data);
                    }
                },
            };
            setActiveFormContext(newContext);
        } else {
            setActiveFormContext(null);
        }

        return () => {
            setActiveFormContext(null);
        };
    }, [editorOpen, isListType, config, aiEnabled, hasApiKey, slotKey, tempItem, data, loading, editingIndex, setActiveFormContext]);

    return {
        // Config
        config,
        isListType,
        publishedField,

        // Data
        data,
        loading,
        error,
        localItems,
        filteredItems,

        // Data mutation (for version restore)
        setLocalData: setLocalItems,  // Allows external state update
        refetch,                       // Allows data refresh from server

        // View state
        viewMode,
        setViewMode,
        searchTerm,
        setSearchTerm,
        showPublishedOnly,
        setShowPublishedOnly,
        isSaving,

        // Selection
        selectedItems,
        setSelectedItems,
        handleToggleSelect,
        handleToggleSelectAll,
        handleBulkDelete,
        handleBulkDuplicate,
        handleBulkPublish,

        // Editor
        editingIndex,
        editorOpen,
        tempItem,
        setTempItem,
        hasUnsavedChanges,
        openEditor,
        closeEditor,
        handleSave,
        handleDelete,
        handleDuplicateSingle,
        handleSingleObjectChange,
        handleSaveWithPendingImages,

        // DnD
        handleDragEnd,

        // Draft
        showDraftRecovery,
        hasPendingDraft,
        pendingDraft,
        lastDraftSave,
        isDraftSaving,
        handleRestoreDraft,
        handleDiscardDraft,

        // Navigation
        navigate
    };
}
