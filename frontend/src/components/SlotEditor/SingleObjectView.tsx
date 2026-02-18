/**
 * SingleObjectView - Single Object Editor Component
 * Egyedi objektum szerkesztő (nem lista típusú slot-okhoz)
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
import { Save, Loader2, X } from 'lucide-react';
import FieldRenderer, { isPendingImage, isPendingVideo, isPendingAudio, GalleryItem } from '@/components/fields/FieldRenderer';
import { generateSlug } from '@/components/fields/FieldRendererComponents';
import { useKeyboardShortcut } from '@/context/KeyboardShortcutContext';
import type { SlotConfig } from '@/config/admin.config';

interface SingleObjectViewProps {
    data: any;
    config: SlotConfig;
    onFieldChange: (fieldId: string, value: any) => void;
    onSaveWithPendingImages?: (data: any) => Promise<void>;
    isSaving?: boolean;
}

// Helper to check if value is pending (image, video, or audio)
const isPendingMedia = (value: any): boolean => {
    return isPendingImage(value) || isPendingVideo(value) || isPendingAudio(value);
};

// Helper to check if a blocks array contains pending media
const blocksHavePendingMedia = (blocks: any[]): boolean => {
    if (!Array.isArray(blocks)) return false;
    return blocks.some(block => {
        if (!block || typeof block !== 'object') return false;
        // Check if this looks like a ContentBlock
        if (block.id && block.type !== undefined && 'data' in block) {
            if (isPendingMedia(block.data)) return true;
            // Check for gallery inside block
            if (Array.isArray(block.data)) {
                return block.data.some((item: GalleryItem) => isPendingImage(item));
            }
        }
        return false;
    });
};

// Helper to check if value contains pending media (including blocks)
const valueHasPendingMedia = (value: any): boolean => {
    if (isPendingMedia(value)) return true;
    if (Array.isArray(value)) {
        // Check if it's a blocks array
        if (value.length > 0 && value[0]?.id && value[0]?.type !== undefined && 'data' in value[0]) {
            return blocksHavePendingMedia(value);
        }
        // Regular gallery
        return value.some((item: GalleryItem) => isPendingImage(item));
    }
    return false;
};

// Helper to revoke all blob URLs in a value (including blocks)
const revokeBlobUrls = (value: any) => {
    if (isPendingImage(value)) {
        URL.revokeObjectURL(value.preview);
    } else if (isPendingVideo(value)) {
        URL.revokeObjectURL(value.preview);
    } else if (isPendingAudio(value)) {
        URL.revokeObjectURL(value.preview);
    } else if (Array.isArray(value)) {
        // Check if it's a blocks array
        if (value.length > 0 && value[0]?.id && value[0]?.type !== undefined && 'data' in value[0]) {
            value.forEach((block: any) => {
                if (block?.data) revokeBlobUrls(block.data);
            });
        } else {
            // Regular gallery
            value.forEach((item: GalleryItem) => {
                if (isPendingImage(item)) {
                    URL.revokeObjectURL(item.preview);
                }
            });
        }
    }
};

export function SingleObjectView({ data, config, onFieldChange, onSaveWithPendingImages, isSaving = false }: SingleObjectViewProps) {
    // Local state for pending changes (images/videos that need upload on save)
    const [localData, setLocalData] = useState<Record<string, any>>({});

    // Cleanup blob URLs on unmount to prevent memory leaks
    useEffect(() => {
        return () => {
            Object.values(localData).forEach(revokeBlobUrls);
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Merge server data with local pending changes
    const mergedData = useMemo(() => ({
        ...data,
        ...localData
    }), [data, localData]);

    // Check if there are any pending media (images, videos, or inside blocks) that need upload
    const hasPendingMedia = useMemo(() => {
        return Object.values(localData).some(value => valueHasPendingMedia(value));
    }, [localData]);

    // Handle field changes - update local state immediately (optimistic UI), then trigger debounced save
    const handleFieldChange = useCallback((fieldId: string, value: any) => {
        const isPending = valueHasPendingMedia(value);

        // Always update local state immediately for optimistic UI
        setLocalData(prev => {
            // Revoke blob URLs if previous value was a pending media
            if (prev[fieldId]) {
                revokeBlobUrls(prev[fieldId]);
            }
            return { ...prev, [fieldId]: value };
        });

        // For pending media, don't trigger save yet
        if (isPending) {
            return;
        }

        // Auto-generate slug if this field is a source for a slug field
        for (const slugField of config.fields) {
            if (slugField.type === 'slug' && slugField.slugSource === fieldId) {
                if (typeof value === 'string') {
                    const slugValue = generateSlug(value);
                    // Also update local state for the slug field
                    setLocalData(prev => ({ ...prev, [slugField.id]: slugValue }));
                    onFieldChange(slugField.id, slugValue);
                }
            }
        }

        // Trigger debounced save (handled by useSlotEditor)
        onFieldChange(fieldId, value);
    }, [onFieldChange, config.fields]);

    // Handle cancel/discard pending changes
    const handleDiscardPending = useCallback(() => {
        // Revoke all blob URLs
        Object.values(localData).forEach(revokeBlobUrls);
        // Clear local state
        setLocalData({});
    }, [localData]);

    // Handle save with pending media
    const handleSave = async () => {
        if (!onSaveWithPendingImages || !hasPendingMedia) return;

        try {
            await onSaveWithPendingImages(mergedData);
            // Clear local pending data after successful save (blob URLs already revoked in upload process)
            setLocalData({});
        } catch (error) {
            console.error('Save failed:', error);
        }
    };

    // Keyboard shortcuts
    // CTRL+S to save pending media
    useKeyboardShortcut('single-object-save', {
        key: 's',
        ctrl: true,
        handler: handleSave,
        enabled: hasPendingMedia && !isSaving
    });

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 px-4">
            {/* Form Fields */}
            <div className="space-y-12">
                {config.fields.map(field => (
                    <div key={field.id} className="group">
                        <FieldRenderer
                            field={field}
                            value={mergedData ? mergedData[field.id] : null}
                            onChange={(val) => handleFieldChange(field.id, val)}
                            disabled={isSaving}
                        />
                    </div>
                ))}

                {/* Save button for pending media */}
                {hasPendingMedia && (
                    <div className="pt-8 border-t border-border">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className={`
                                    flex items-center gap-3 px-8 py-3 bg-foreground text-background 
                                    text-xs font-mono uppercase tracking-widest
                                    hover:opacity-90 transition-opacity
                                    ${isSaving ? 'opacity-70 cursor-wait' : ''}
                                `}
                            >
                                {isSaving ? (
                                    <>
                                        <Loader2 size={14} className="animate-spin" />
                                        FELTÖLTÉS ÉS MENTÉS...
                                    </>
                                ) : (
                                    <>
                                        <Save size={14} />
                                        MÉDIA MENTÉSE
                                    </>
                                )}
                            </button>
                            <button
                                onClick={handleDiscardPending}
                                disabled={isSaving}
                                className="flex items-center gap-2 px-4 py-3 border border-border text-xs font-mono uppercase tracking-widest hover:bg-destructive hover:border-destructive hover:text-white transition-colors"
                            >
                                <X size={14} />
                                ELVETÉS
                            </button>
                        </div>
                        <p className="mt-2 text-[9px] font-mono text-yellow-500">
                            ● Van kiválasztott média ami még nincs feltöltve
                        </p>
                    </div>
                )}
            </div>

            {/* Status Sidebar */}
            <div className="hidden lg:block border-l border-border pl-16 opacity-40 pointer-events-none sticky top-52 mt-12 h-fit">
                <h3 className="text-[10px] font-mono uppercase tracking-widest mb-4">
                    Csomópont Státusz
                </h3>
                <div className="space-y-2 font-mono text-xs">
                    <p>MEZŐK: {config.fields.length}</p>
                    <p>UTOLSÓ MÓD: {new Date().toLocaleTimeString()}</p>
                    <p>STÁTUSZ: {hasPendingMedia ? 'FÜGGŐBEN' : 'AKTÍV'}</p>
                </div>
            </div>
        </div>
    );
}
