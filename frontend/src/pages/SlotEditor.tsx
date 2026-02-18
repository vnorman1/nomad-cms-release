/**
 * SlotEditor - Main Page Component
 * A fő SlotEditor oldal, ami a moduláris komponenseket használja
 * 
 * ARCHITECTURE (2026-01-05):
 * - Version restore now uses ATOMIC server-side restore
 * - No more page reload hack - state is properly refreshed
 */

import { useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';

import {
    useSlotEditor,
    EditorToolbar,
    SingleObjectView,
    ListView,
    EditorModal,
    MassiveDataView,
    VersionPanel,
    BulkActionsBar
} from '@/components/SlotEditor';
// saveData - imported elsewhere when needed


export default function SlotEditor() {
    const { slotKey } = useParams<{ slotKey: string }>();
    const [showVersionHistory, setShowVersionHistory] = useState(false);

    const editor = useSlotEditor({ slotKey: slotKey || '' });



    /**
     * Handle version restore using ATOMIC server-side restore
     * The server performs the restore in a single transaction, then we refresh state
     */
    const handleVersionRestore = useCallback(async (restoredContent: unknown, newVersion?: number) => {
        console.log('[VersionRestore] ====== ATOMIC RESTORE COMPLETED ======');
        console.log('[VersionRestore] Slot:', slotKey);
        console.log('[VersionRestore] Content received from server');
        console.log('[VersionRestore] New version:', newVersion);

        try {
            // Server already saved the content via atomic restore
            // Just update local state to reflect the change
            if (restoredContent !== undefined && restoredContent !== null) {
                // Update the editor's local data state
                editor.setLocalData(restoredContent as any[]);

                // Close version panel
                setShowVersionHistory(false);

                // Refresh data from server to ensure consistency
                await editor.refetch();

                console.log('[VersionRestore] State refreshed successfully');
            }
        } catch (err) {
            console.error('[VersionRestore] State refresh failed:', err);
            // If state refresh fails, reload as fallback
            window.location.reload();
        }
    }, [slotKey, editor]);

    // Error state
    if (editor.error) {
        return (
            <div className="p-12 text-center font-mono text-xs uppercase text-destructive">
                RENDSZER HIBA: {editor.error}
            </div>
        );
    }

    // Invalid config
    if (!editor.config) {
        return (
            <div className="p-12 text-center font-mono text-xs uppercase opacity-40">
                ÉRVÉNYTELEN KONFIGURÁCIÓ
            </div>
        );
    }

    // Loading state (skip for massive - it handles its own loading)
    if (editor.loading && editor.config.type !== 'massive') {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="animate-spin text-foreground/20" size={32} />
            </div>
        );
    }

    // Massive Data View - different rendering path
    if (editor.config.type === 'massive') {
        return (
            <div className="min-h-screen">
                <MassiveDataView
                    slotKey={slotKey || ''}
                    config={editor.config}
                    onClose={() => editor.navigate('/')}
                />
            </div>
        );
    }

    return (
        <div className="min-h-screen pb-24">
            {/* Toolbar */}
            <EditorToolbar
                config={editor.config}
                slotKey={slotKey || ''}
                isListType={editor.isListType}
                searchTerm={editor.searchTerm}
                viewMode={editor.viewMode}
                showPublishedOnly={editor.showPublishedOnly}
                publishedField={editor.publishedField}
                onBack={() => editor.navigate('/')}
                onSearchChange={editor.setSearchTerm}
                onViewModeChange={editor.setViewMode}
                onPublishedFilterChange={editor.setShowPublishedOnly}
                onNewItem={() => editor.openEditor(null)}
                onShowVersionHistory={() => setShowVersionHistory(true)}
            />

            {/* Main Content */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="max-w-[1920px] mx-auto"
            >
                {/* Single Object View */}
                {!editor.isListType && (
                    <SingleObjectView
                        data={editor.data}
                        config={editor.config}
                        onFieldChange={editor.handleSingleObjectChange}
                        onSaveWithPendingImages={editor.handleSaveWithPendingImages}
                        isSaving={editor.isSaving}
                    />
                )}

                {/* List/Collection View */}
                {editor.isListType && (
                    <ListView
                        items={editor.filteredItems}
                        config={editor.config}
                        viewMode={editor.viewMode}
                        searchTerm={editor.searchTerm}
                        isSaving={editor.isSaving}
                        selectedItems={editor.selectedItems}
                        publishedField={editor.publishedField}
                        onEdit={(idx) => editor.openEditor(idx)}
                        onDelete={editor.handleDelete}
                        onDuplicate={editor.handleDuplicateSingle}
                        onNewItem={() => editor.openEditor(null)}
                        onToggleSelect={editor.handleToggleSelect}
                        onToggleSelectAll={editor.handleToggleSelectAll}
                        onDragEnd={editor.handleDragEnd}
                    />
                )}
            </motion.div>

            {/* Editor Modal */}
            <EditorModal
                isOpen={editor.editorOpen}
                editingIndex={editor.editingIndex}
                tempItem={editor.tempItem}
                config={editor.config}
                hasUnsavedChanges={editor.hasUnsavedChanges}
                isSaving={editor.isSaving}
                isDraftSaving={editor.isDraftSaving}
                lastDraftSave={editor.lastDraftSave}
                showDraftRecovery={editor.showDraftRecovery}
                hasPendingDraft={editor.hasPendingDraft}
                pendingDraft={editor.pendingDraft}
                onTempItemChange={editor.setTempItem}
                onSave={editor.handleSave}
                onClose={editor.closeEditor}
                onRestoreDraft={editor.handleRestoreDraft}
                onDiscardDraft={editor.handleDiscardDraft}
            />

            {/* Version History Panel */}
            <VersionPanel
                slotKey={slotKey || ''}
                currentContent={editor.data}
                onClose={() => setShowVersionHistory(false)}
                onRestore={handleVersionRestore}
                isOpen={showVersionHistory}
            />

            {/* Bulk Actions Floating Bar */}
            <BulkActionsBar
                selectedCount={editor.selectedItems.size}
                isSaving={editor.isSaving}
                onClear={() => editor.setSelectedItems(new Set())}
                onPublish={() => editor.handleBulkPublish(true)}
                onUnpublish={() => editor.handleBulkPublish(false)}
                onDuplicate={editor.handleBulkDuplicate}
                onDelete={editor.handleBulkDelete}
                hasPublishing={!!editor.publishedField}
            />
        </div>
    );
}
