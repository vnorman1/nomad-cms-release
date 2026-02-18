import { useState } from 'react';
import { X, Plus } from 'lucide-react';
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
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    rectSortingStrategy
} from '@dnd-kit/sortable';
import { useUI } from '@/context/UIContext';
import { BaseFieldProps, Label, isPendingImage, getImageDisplayUrl, PendingImage, GalleryItem, SortableGalleryItem } from './types';

export default function GalleryFieldRenderer({ field, onChange, isDisabled, isReadOnly, safeValue }: BaseFieldProps) {
    const { showToast } = useUI();
    const [isDragging, setIsDragging] = useState(false);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        if (!isDisabled && !isReadOnly) setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const isValidImageFile = (file: File): boolean => {
        const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp'];
        return validTypes.includes(file.type) || file.type.startsWith('image/');
    };

    const handleGalleryImageSelect = (files: FileList) => {
        if (files.length === 0) return;

        const fileArray = Array.from(files);
        const maxSize = 10 * 1024 * 1024;

        const invalidFiles = fileArray.filter(f => !isValidImageFile(f));
        const tooLargeFiles = fileArray.filter(f => f.size > maxSize);

        if (invalidFiles.length > 0) {
            showToast('warning', 'ÉRVÉNYTELEN FÁJLOK', `${invalidFiles.length} fájl kihagyva (nem kép).`);
        }
        if (tooLargeFiles.length > 0) {
            showToast('warning', 'TÚL NAGY FÁJLOK', `${tooLargeFiles.length} fájl kihagyva (>10MB).`);
        }

        const validFiles = fileArray.filter(f => isValidImageFile(f) && f.size <= maxSize);
        if (validFiles.length === 0) {
            showToast('error', 'NINCS ÉRVÉNYES FÁJL', 'Egyik kiválasztott fájl sem megfelelő.');
            return;
        }

        const currentItems = (Array.isArray(safeValue) ? safeValue : []) as GalleryItem[];
        const newPendingImages: PendingImage[] = validFiles.map(file => ({
            file,
            preview: URL.createObjectURL(file),
            _isPending: true
        }));

        onChange([...currentItems, ...newPendingImages]);
        showToast('info', 'KÉPEK KIVÁLASZTVA', `${validFiles.length} kép mentéskor kerül feltöltésre.`);
    };

    const handleDropLink = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (isDisabled || isReadOnly) return;

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleGalleryImageSelect(e.dataTransfer.files);
        } else {
            const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
            if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
                const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'];
                if (imageExtensions.some(ext => url.toLowerCase().includes(ext))) {
                    const currentItems = (Array.isArray(safeValue) ? safeValue : []) as GalleryItem[];
                    onChange([...currentItems, url]);
                    showToast('info', 'URL HOZZÁADVA', 'Külső kép URL a galériához adva.');
                } else {
                    showToast('warning', 'NEM KÉP URL', 'A megadott URL nem tűnik képnek.');
                }
            }
        }
    };

    const galleryItems = (Array.isArray(safeValue) ? safeValue : []) as GalleryItem[];
    const dropActive = isDragging;

    const getItemId = (item: GalleryItem) => isPendingImage(item) ? item.preview : item;

    const handleGalleryDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            const oldIndex = galleryItems.findIndex(item => getItemId(item) === active.id);
            const newIndex = galleryItems.findIndex(item => getItemId(item) === over.id);
            if (oldIndex !== -1 && newIndex !== -1) {
                onChange(arrayMove(galleryItems, oldIndex, newIndex));
            }
        }
    };

    const handleRemoveGalleryItem = (idx: number) => {
        const item = galleryItems[idx];
        if (isPendingImage(item)) {
            URL.revokeObjectURL(item.preview);
        }
        onChange(galleryItems.filter((_, i) => i !== idx));
    };

    const pendingCount = galleryItems.filter(isPendingImage).length;

    return (
        <div className="space-y-4">
            <Label required={field.required}>{field.label}</Label>
            {pendingCount > 0 && (
                <div className="flex items-center gap-2 text-yellow-500 text-[9px] font-mono">
                    ● {pendingCount} kép mentéskor töltődik fel
                </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleGalleryDragEnd}>
                    <SortableContext items={galleryItems.map(getItemId)} strategy={rectSortingStrategy}>
                        {galleryItems.map((item, idx) => {
                            const itemId = getItemId(item);
                            const displayUrl = getImageDisplayUrl(item);
                            const itemIsPending = isPendingImage(item);

                            return (
                                <SortableGalleryItem key={itemId} id={itemId} disabled={isDisabled || isReadOnly}>
                                    <div className="relative aspect-square group border border-border bg-secondary/5 overflow-hidden transition-all hover:scale-[1.02]">
                                        <img src={displayUrl} className="w-full h-full object-cover pointer-events-none" alt={`Gallery item ${idx}`} loading="lazy" decoding="async" />
                                        {itemIsPending && (
                                            <div className="absolute top-0 right-0 w-2 h-2 bg-yellow-500 z-20" title="Nincs mentve" />
                                        )}
                                        {!(isDisabled || isReadOnly) && (
                                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[1px]">
                                                <button
                                                    onPointerDown={(e) => e.stopPropagation()}
                                                    onClick={() => handleRemoveGalleryItem(idx)}
                                                    className="p-2 bg-background border border-foreground hover:bg-destructive hover:border-destructive hover:text-white transition-all rounded-full cursor-pointer z-50"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        )}
                                        <div className="absolute top-0 left-0 bg-background/90 text-[8px] font-mono text-foreground px-1.5 py-0.5 border-b border-r border-border backdrop-blur">
                                            {(idx + 1).toString().padStart(2, '0')}
                                        </div>
                                    </div>
                                </SortableGalleryItem>
                            );
                        })}
                    </SortableContext>
                </DndContext>

                {/* Add / Drop Button */}
                <div
                    className={`
                        relative aspect-square border transition-all flex flex-col items-center justify-center gap-2 group 
                        ${dropActive ? 'border-2 border-foreground bg-secondary/20 scale-[1.05] z-10' : 'border-dashed border-border hover:border-foreground'}
                        ${(isDisabled || isReadOnly) ? 'opacity-50 cursor-not-allowed hidden' : 'cursor-pointer bg-secondary/5 hover:bg-secondary/10'}
                    `}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDropLink}
                >
                    {!(isDisabled || isReadOnly) && (
                        <input
                            type="file"
                            multiple
                            accept="image/*"
                            onChange={(e) => e.target.files && handleGalleryImageSelect(e.target.files)}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        />
                    )}
                    <Plus className={`transition-colors ${dropActive ? 'text-foreground' : 'text-foreground/40 group-hover:text-foreground'}`} />
                    <span className="text-[9px] font-mono uppercase opacity-40 group-hover:opacity-100 tracking-widest text-center px-2">
                        {dropActive ? 'Drop It!' : 'Bővítés / Drop'}
                    </span>
                </div>
            </div>
        </div>
    );
}
