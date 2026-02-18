/**
 * EditorModal - Item Editor Modal Component
 * Modal komponens az elemek szerkesztéséhez
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Save, Loader2 } from 'lucide-react';
import FieldRenderer from '@/components/fields/FieldRenderer';
import { generateSlug } from '@/components/fields/FieldRendererComponents';
import { DraftRecoveryBanner } from './DraftRecoveryBanner';
import { useKeyboardShortcut } from '@/context/KeyboardShortcutContext';
import type { EditorModalProps } from './types';

// Helper to check if a value is considered empty
const isFieldEmpty = (value: unknown): boolean => {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string' && value.trim() === '') return true;
    if (Array.isArray(value) && value.length === 0) return true;
    return false;
};

export function EditorModal({
    isOpen,
    editingIndex,
    tempItem,
    config,
    hasUnsavedChanges,
    isSaving,
    isDraftSaving,
    lastDraftSave,
    showDraftRecovery,
    hasPendingDraft,
    pendingDraft,
    onTempItemChange,
    onSave,
    onClose,
    onRestoreDraft,
    onDiscardDraft
}: EditorModalProps) {
    // Track validation error field IDs (not labels)
    const [validationErrorIds, setValidationErrorIds] = useState<Set<string>>(new Set());

    // Clear validation errors when modal closes
    useEffect(() => {
        if (!isOpen) {
            setValidationErrorIds(new Set());
        }
    }, [isOpen]);

    // Validate required fields - returns array of field IDs that are empty
    const validateRequiredFields = useCallback((): string[] => {
        const errorIds: string[] = [];
        if (!config?.fields || !tempItem) return errorIds;

        for (const field of config.fields) {
            if (field.required && isFieldEmpty(tempItem[field.id])) {
                errorIds.push(field.id);
            }
        }
        return errorIds;
    }, [config?.fields, tempItem]);

    // Check if a specific field has an error
    const hasFieldError = useMemo(() => {
        return (fieldId: string): boolean => validationErrorIds.has(fieldId);
    }, [validationErrorIds]);

    // Handle save with validation
    const handleSaveClick = useCallback(() => {
        const errorIds = validateRequiredFields();
        setValidationErrorIds(new Set(errorIds));

        if (errorIds.length > 0) {
            // Don't save if there are validation errors
            return;
        }

        onSave(tempItem);
    }, [validateRequiredFields, onSave, tempItem]);

    // Keyboard shortcuts
    // CTRL+S to save
    useKeyboardShortcut('editor-modal-save', {
        key: 's',
        ctrl: true,
        handler: handleSaveClick,
        enabled: isOpen && !isSaving
    });

    // ESC to close modal
    useKeyboardShortcut('editor-modal-close', {
        key: 'Escape',
        handler: () => !isSaving && onClose(),
        enabled: isOpen
    });

    // Clear validation errors when modal opens/closes
    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8">
                {/* Backdrop */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-background/80 backdrop-blur-md"
                    onClick={(e) => { e.stopPropagation(); if (!isSaving) onClose(); }}
                />

                {/* Modal Content */}
                <motion.div
                    initial={{ scale: 0.95, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.95, opacity: 0, y: 20 }}
                    className="relative w-full max-w-4xl h-[85vh] bg-background border border-foreground flex flex-col shadow-2xl shadow-black/20 z-50"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-8 py-6 border-b border-border">
                        <div>
                            <h2 className="text-2xl font-light tracking-tight uppercase">
                                {editingIndex !== null ? 'Csomópont Szerkesztése' : 'Új Csomópont'}
                            </h2>
                            <span className="text-[10px] font-mono opacity-40 tracking-widest">
                                REF: {editingIndex !== null ? `IDX_${editingIndex}` : 'ÚJ_ALLOKÁCIÓ'}
                                {hasUnsavedChanges && (
                                    <span className="text-yellow-500 ml-2">● MENTETLEN</span>
                                )}
                            </span>
                        </div>
                        <button
                            onClick={() => !isSaving && onClose()}
                            className={`hover:rotate-90 transition-transform duration-300 ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
                            disabled={isSaving}
                        >
                            <Plus className="rotate-45" size={24} />
                        </button>
                    </div>

                    {/* Draft Recovery Banner */}
                    <AnimatePresence>
                        <DraftRecoveryBanner
                            show={showDraftRecovery}
                            hasPendingDraft={hasPendingDraft}
                            pendingDraft={pendingDraft}
                            onRestore={onRestoreDraft}
                            onDiscard={onDiscardDraft}
                        />
                    </AnimatePresence>

                    {/* Form Fields */}
                    <div className="flex-1 overflow-y-auto p-8 space-y-12">
                        {config?.fields.map(field => {
                            // Handler that auto-generates slug when source field changes
                            const handleFieldChange = (val: unknown) => {
                                const newItem = { ...tempItem, [field.id]: val };

                                // Check if any slug field uses this field as source
                                if (config?.fields) {
                                    for (const slugField of config.fields) {
                                        if (slugField.type === 'slug' && slugField.slugSource === field.id) {
                                            // Auto-generate slug from the new value
                                            if (typeof val === 'string') {
                                                newItem[slugField.id] = generateSlug(val);
                                            }
                                        }
                                    }
                                }

                                onTempItemChange(newItem);
                            };

                            return (
                                <div key={field.id} className="max-w-3xl">
                                    <FieldRenderer
                                        field={field}
                                        value={tempItem ? tempItem[field.id] : null}
                                        onChange={handleFieldChange}
                                        disabled={isSaving}
                                        hasError={hasFieldError(field.id)}
                                    />
                                </div>
                            );
                        })}
                    </div>

                    {/* Footer */}
                    <div className="px-8 py-6 border-t border-border bg-secondary/5">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-4">
                                <span className={`text-[9px] font-mono uppercase ${hasUnsavedChanges ? 'text-yellow-500' : 'opacity-40'}`}>
                                    {hasUnsavedChanges ? '● Nem mentett változások' : 'Nincs változás'}
                                </span>
                                {isDraftSaving && (
                                    <span className="text-[9px] font-mono text-blue-400 flex items-center gap-1">
                                        <Loader2 size={10} className="animate-spin" />
                                        Auto-mentés...
                                    </span>
                                )}
                                {lastDraftSave && !isDraftSaving && (
                                    <span className="text-[9px] font-mono text-muted-foreground">
                                        Draft: {lastDraftSave.toLocaleTimeString('hu-HU')}
                                    </span>
                                )}
                            </div>
                            <div className="flex gap-4">
                                <button
                                    onClick={onClose}
                                    className="px-6 py-2 text-xs font-mono uppercase tracking-widest hover:text-foreground/60 transition-colors"
                                    disabled={isSaving}
                                >
                                    Mégse
                                </button>
                                <button
                                    onClick={handleSaveClick}
                                    disabled={isSaving}
                                    className={`
                                        px-8 py-2 bg-foreground text-background text-xs font-mono uppercase tracking-widest 
                                        hover:opacity-90 transition-opacity flex items-center gap-2 
                                        ${isSaving ? 'opacity-70 cursor-wait' : ''}
                                    `}
                                >
                                    {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                                    {isSaving ? 'MENTÉS...' : 'MENTÉS'}
                                </button>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
