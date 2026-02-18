/**
 * ListView - List/Collection View Component
 * Lista nézet a collection/list típusú slot-okhoz
 */

import { Plus } from 'lucide-react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent
} from '@dnd-kit/core';
import {
    SortableContext,
    sortableKeyboardCoordinates,
    rectSortingStrategy
} from '@dnd-kit/sortable';

import { SortableItem } from './SortableItem';
import { BlueprintCard } from './BlueprintCard';
import { TableView } from './TableView';
import type { SlotConfig } from '@/config/admin.config';

interface ListViewProps {
    items: any[];
    config: SlotConfig;
    viewMode: 'cards' | 'table';
    searchTerm: string;
    isSaving: boolean;
    selectedItems: Set<number>;
    publishedField?: string;
    onEdit: (idx: number) => void;
    onDelete: (idx: number) => void;
    onDuplicate: (idx: number) => void;
    onNewItem: () => void;
    onToggleSelect: (idx: number) => void;
    onToggleSelectAll: () => void;
    onDragEnd: (event: DragEndEvent) => void;
}

export function ListView({
    items,
    config,
    viewMode,
    searchTerm,
    isSaving,
    selectedItems,
    publishedField,
    onEdit,
    onDelete,
    onDuplicate,
    onNewItem,
    onToggleSelect,
    onToggleSelectAll,
    onDragEnd
}: ListViewProps) {
    // DND Sensors
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    // Empty state - no data
    if (items.length === 0 && !searchTerm) {
        return (
            <div className="flex flex-col items-center justify-center py-24 opacity-40">
                <div className="w-16 h-16 border border-dashed border-foreground rounded-full flex items-center justify-center mb-4">
                    <Plus size={24} />
                </div>
                <p className="text-xs font-mono uppercase tracking-widest">
                    Nincs adat az indexben
                </p>
            </div>
        );
    }

    // Empty state - no search results
    if (items.length === 0 && searchTerm) {
        return (
            <div className="flex flex-col items-center justify-center py-24 opacity-40">
                <p className="text-xs font-mono uppercase tracking-widest">
                    Nincs találat a keresésre: "{searchTerm}"
                </p>
            </div>
        );
    }

    // Cards View
    if (viewMode === 'cards') {
        return (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={items.map(i => i._dndId)} strategy={rectSortingStrategy}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 content-start px-1">
                        {items.map((item: any, idx: number) => (
                            <SortableItem key={item._dndId} id={item._dndId} disabled={isSaving}>
                                <BlueprintCard
                                    item={item}
                                    index={idx}
                                    config={config}
                                    onEdit={() => onEdit(idx)}
                                    onDelete={() => onDelete(idx)}
                                    onDuplicate={onDuplicate}
                                    disabled={isSaving}
                                    selected={selectedItems.has(idx)}
                                    onToggleSelect={onToggleSelect}
                                    publishedField={publishedField}
                                />
                            </SortableItem>
                        ))}

                        {/* Add New Card */}
                        <button
                            onClick={onNewItem}
                            className="h-[320px] border border-dashed border-border hover:border-foreground flex flex-col items-center justify-center gap-4 group transition-colors opacity-50 hover:opacity-100"
                        >
                            <div className="w-12 h-12 rounded-full border border-foreground flex items-center justify-center group-hover:bg-foreground group-hover:text-background transition-colors">
                                <Plus size={24} />
                            </div>
                            <span className="text-[10px] font-mono uppercase tracking-widest">
                                Új Tervrajz
                            </span>
                        </button>
                    </div>
                </SortableContext>
            </DndContext>
        );
    }

    // Table View
    return (
        <TableView
            items={items}
            config={config}
            onEdit={onEdit}
            onDelete={onDelete}
            disabled={isSaving}
            selectedItems={selectedItems}
            onToggleSelect={onToggleSelect}
            onToggleSelectAll={onToggleSelectAll}
            publishedField={publishedField}
        />
    );
}
