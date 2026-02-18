/**
 * SlotEditor Types
 * Közös típusok a SlotEditor komponensekhez
 */

import { SlotConfig } from '@/config/admin.config';

export interface BulkSelectionState {
    selectedItems: Set<number>;
    onToggleSelect: (idx: number) => void;
    onToggleSelectAll: () => void;
}

export interface DraftState {
    hasPendingDraft: boolean;
    pendingDraft: any;
    lastDraftSave: Date | null;
    isDraftSaving: boolean;
    showDraftRecovery: boolean;
}

export interface EditorState {
    editingIndex: number | null;
    editorOpen: boolean;
    tempItem: any;
    hasUnsavedChanges: boolean;
    isSaving: boolean;
}

export interface BlueprintCardProps {
    item: any;
    index: number;
    config: SlotConfig;
    onEdit: (idx: number) => void;
    onDelete: (idx: number) => void;
    onDuplicate?: (idx: number) => void;
    disabled?: boolean;
    selected?: boolean;
    onToggleSelect?: (idx: number) => void;
    publishedField?: string;
}

export interface TableViewProps {
    items: any[];
    config: SlotConfig;
    onEdit: (idx: number) => void;
    onDelete: (idx: number) => void;
    disabled?: boolean;
    selectedItems?: Set<number>;
    onToggleSelect?: (idx: number) => void;
    onToggleSelectAll?: () => void;
    publishedField?: string;
}

export interface EditorModalProps {
    isOpen: boolean;
    editingIndex: number | null;
    tempItem: any;
    config: SlotConfig;
    hasUnsavedChanges: boolean;
    isSaving: boolean;
    isDraftSaving: boolean;
    lastDraftSave: Date | null;
    showDraftRecovery: boolean;
    hasPendingDraft: boolean;
    pendingDraft: any;
    onTempItemChange: (item: any) => void;
    onSave: (data: any) => void;
    onClose: () => void;
    onRestoreDraft: () => void;
    onDiscardDraft: () => void;
}

export interface ToolbarProps {
    config: SlotConfig;
    slotKey: string;
    isListType: boolean;
    searchTerm: string;
    viewMode: 'cards' | 'table';
    showPublishedOnly: boolean | null;
    publishedField?: string;
    onBack: () => void;
    onSearchChange: (term: string) => void;
    onViewModeChange: (mode: 'cards' | 'table') => void;
    onPublishedFilterChange: (filter: boolean | null) => void;
    onNewItem: () => void;
    onShowVersionHistory?: () => void;
}

export interface DraftRecoveryBannerProps {
    show: boolean;
    hasPendingDraft: boolean;
    pendingDraft: any;
    onRestore: () => void;
    onDiscard: () => void;
}
