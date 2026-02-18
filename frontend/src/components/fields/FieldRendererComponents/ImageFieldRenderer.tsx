import { useState, useCallback } from 'react';
import { Upload, X, FolderOpen } from 'lucide-react';
import { deleteImage } from '@/api';
import { apiClient } from '@/api/client';
import { useUI } from '@/context/UIContext';
import { BaseFieldProps, Label, isPendingImage, getImageDisplayUrl, PendingImage } from './types';
import MediaPicker from '@/components/Media/MediaPicker';
import { FALLBACK_IMAGE } from '@/utils/fallbackImages';

export default function ImageFieldRenderer({ field, onChange, isDisabled, isReadOnly, safeValue }: BaseFieldProps) {
    const { showToast, confirm } = useUI();
    const [isDragging, setIsDragging] = useState(false);
    const [showMediaPicker, setShowMediaPicker] = useState(false);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

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

    const handleSingleImageSelect = (files: FileList) => {
        if (files.length === 0) return;
        const file = files[0];

        if (!isValidImageFile(file)) {
            showToast('error', 'ÉRVÉNYTELEN FÁJL', 'Csak képfájlokat lehet feltölteni.');
            return;
        }

        const maxSize = 10 * 1024 * 1024;
        if (file.size > maxSize) {
            showToast('error', 'TÚL NAGY FÁJL', 'A fájl mérete nem lehet nagyobb 10MB-nál.');
            return;
        }

        const preview = URL.createObjectURL(file);
        if (isPendingImage(safeValue)) {
            URL.revokeObjectURL(safeValue.preview);
        }

        const pendingImage: PendingImage = { file, preview, _isPending: true };
        onChange(pendingImage);
        showToast('info', 'KÉP KIVÁLASZTVA', 'A kép mentéskor kerül feltöltésre.');
    };

    const handleDropLink = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (isDisabled || isReadOnly) return;

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleSingleImageSelect(e.dataTransfer.files);
        } else {
            const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
            if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
                const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'];
                if (imageExtensions.some(ext => url.toLowerCase().includes(ext))) {
                    onChange(url);
                    showToast('info', 'URL HOZZÁADVA', 'Külső kép URL mentve.');
                } else {
                    showToast('warning', 'NEM KÉP URL', 'A megadott URL nem tűnik képnek.');
                }
            }
        }
    };

    const handleClearImage = async () => {
        if (isDisabled || isReadOnly) return;

        // Pending images: just clear without server check
        if (isPendingImage(safeValue)) {
            URL.revokeObjectURL(safeValue.preview);
            onChange('');
            return;
        }

        // Check if this is a managed upload
        if (typeof safeValue !== 'string' || !safeValue.startsWith('/api/uploads/')) {
            // External URL - just clear the field
            onChange('');
            return;
        }

        // Get filename and check usage
        const filename = safeValue.split('/').pop();
        if (!filename) {
            onChange('');
            return;
        }

        try {
            // Check how many places use this image
            const response = await apiClient.get(`/endpoints/media.php?file=${encodeURIComponent(filename)}`);
            const usageCount = response.data?.file?.usageCount || 0;

            if (usageCount > 1) {
                // Image is used elsewhere - just unlink, don't delete from server
                confirm({
                    title: 'Kép Leválasztása',
                    message: `Ez a kép ${usageCount} helyen van használva. Csak erről a mezőről lesz eltávolítva, a fájl megmarad a szerveren.`,
                    isDestructive: false,
                    confirmLabel: 'Leválasztás',
                    onConfirm: () => {
                        onChange('');
                        showToast('info', 'KÉP LEVÁLASZTVA', 'A kép eltávolítva ebből a mezőből.');
                    }
                });
            } else {
                // Image is only used here - can delete from server
                confirm({
                    title: 'Kép Végleges Törlése',
                    message: 'Ez a kép csak itt van használva. Törlés után véglegesen eltűnik a szerverről.',
                    isDestructive: true,
                    confirmLabel: 'Végleges Törlés',
                    onConfirm: async () => {
                        try {
                            await deleteImage(safeValue);
                            onChange('');
                            showToast('success', 'KÉP TÖRÖLVE', 'A fájl véglegesen törölve a szerverről.');
                        } catch (e) {
                            onChange('');
                            showToast('warning', 'TÖRLÉSI HIBA', 'A mezőből eltávolítva, de a fájl törlése sikertelen.');
                        }
                    }
                });
            }
        } catch (e) {
            // If usage check fails, fall back to simple unlink
            onChange('');
            showToast('warning', 'LEVÁLASZTVA', 'Kép eltávolítva a mezőből.');
        }
    };

    // Right-click context menu handler
    const handleContextMenu = useCallback((e: React.MouseEvent) => {
        if (isDisabled || isReadOnly) return;
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY });
    }, [isDisabled, isReadOnly]);

    // Close context menu when clicking elsewhere
    const handleCloseContextMenu = useCallback(() => {
        setContextMenu(null);
    }, []);

    // Handle media picker selection
    const handleMediaSelect = useCallback((url: string) => {
        onChange(url);
        setShowMediaPicker(false);
        showToast('success', 'KÉP KIVÁLASZTVA', 'Kép a könyvtárból kiválasztva.');
    }, [onChange, showToast]);

    const dropActive = isDragging;
    const hasImage = safeValue && (typeof safeValue === 'string' || isPendingImage(safeValue));
    const displayUrl = getImageDisplayUrl(safeValue);
    const isPending = isPendingImage(safeValue);

    return (
        <div className="space-y-4">
            <Label required={field.required}>{field.label}</Label>
            <div
                className={`
                    relative w-full aspect-video border transition-all duration-300 overflow-hidden group 
                    ${dropActive ? 'border-2 border-foreground bg-secondary/20 scale-[1.01]' : 'border-dashed border-border hover:border-foreground/50'}
                    ${(isDisabled || isReadOnly) ? 'opacity-50 cursor-not-allowed border-border' : ''}
                `}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDropLink}
                onContextMenu={handleContextMenu}
            >
                {!(isDisabled || isReadOnly) && (
                    <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => e.target.files && handleSingleImageSelect(e.target.files)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                    />
                )}

                {hasImage ? (
                    <>
                        <img
                            src={displayUrl}
                            alt="Preview"
                            className="w-full h-full object-contain p-4"
                            loading="lazy"
                            decoding="async"
                            onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_IMAGE; }}
                        />
                        {isPending && (
                            <div className="absolute top-2 left-2 px-2 py-1 bg-yellow-500/90 text-black text-[9px] font-mono uppercase tracking-wider z-30">
                                ● NINCS MENTVE
                            </div>
                        )}
                        {!(isDisabled || isReadOnly) && (
                            <div className="absolute inset-0 bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 backdrop-blur-sm z-10 pointer-events-none">
                                <span className="text-xs font-mono uppercase tracking-widest border-b border-foreground">Húzz ide képet a cseréhez · Jobb klikk = Könyvtár</span>
                            </div>
                        )}
                        {!(isDisabled || isReadOnly) && (
                            <button
                                onClick={(e) => { e.stopPropagation(); handleClearImage(); }}
                                className="absolute top-2 right-2 p-2 border border-foreground bg-background hover:bg-foreground hover:text-background transition-colors z-30"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </>
                ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <div className="w-px h-12 bg-foreground/20 mb-4" />
                        <Upload size={16} className={`mb-2 ${dropActive ? 'text-foreground animate-bounce' : 'text-foreground/40'}`} />
                        <span className="text-[9px] font-mono uppercase tracking-widest opacity-40">
                            {dropActive ? 'ENGEDD EL A FELTÖLTÉSHEZ' : 'HÚZZ IDE · KATTINTS · JOBB KLIKK = KÖNYVTÁR'}
                        </span>
                    </div>
                )}
            </div>
            {hasImage && !isPending && (
                <div className="flex items-center gap-2 opacity-50 hover:opacity-100 transition-opacity">
                    <span className="text-[9px] font-mono">FORRÁS:</span>
                    <input
                        type="text"
                        value={displayUrl}
                        readOnly={true}
                        className="flex-1 bg-transparent border-none text-[9px] font-mono focus:outline-none truncate cursor-text"
                        onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                </div>
            )}
            {isPending && (
                <div className="flex items-center gap-2 text-yellow-500">
                    <span className="text-[9px] font-mono">● A kép mentéskor töltődik fel a szerverre</span>
                </div>
            )}

            {/* Context Menu */}
            {contextMenu && (
                <>
                    <div
                        className="fixed inset-0 z-40"
                        onClick={handleCloseContextMenu}
                    />
                    <div
                        className="fixed z-50 bg-background border border-border shadow-2xl min-w-[220px] p-1"
                        style={{ left: contextMenu.x, top: contextMenu.y }}
                    >
                        <div className="px-3 py-2 border-b border-border/50 mb-1">
                            <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">Műveletek</span>
                        </div>
                        <button
                            onClick={() => {
                                setContextMenu(null);
                                setShowMediaPicker(true);
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2 text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors group"
                        >
                            <FolderOpen size={14} className="group-hover:scale-110 transition-transform" />
                            <span>KÖNYVTÁR...</span>
                        </button>
                        <button
                            onClick={() => {
                                setContextMenu(null);
                                const input = document.createElement('input');
                                input.type = 'file';
                                input.accept = 'image/*';
                                input.onchange = (e) => {
                                    const files = (e.target as HTMLInputElement).files;
                                    if (files) handleSingleImageSelect(files);
                                };
                                input.click();
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2 text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors group"
                        >
                            <Upload size={14} className="group-hover:scale-110 transition-transform" />
                            <span>FELTÖLTÉS...</span>
                        </button>
                        {hasImage && (
                            <>
                                <div className="h-px bg-border/50 my-1" />
                                <button
                                    onClick={() => {
                                        setContextMenu(null);
                                        handleClearImage();
                                    }}
                                    className="w-full flex items-center gap-3 px-3 py-2 text-xs font-mono uppercase tracking-wider text-red-500/70 hover:text-red-500 hover:bg-red-500/10 transition-colors group"
                                >
                                    <X size={14} className="group-hover:scale-110 transition-transform" />
                                    <span>ELTÁVOLÍTÁS</span>
                                </button>
                            </>
                        )}
                    </div>
                </>
            )}

            {/* Media Picker Modal */}
            <MediaPicker
                isOpen={showMediaPicker}
                onClose={() => setShowMediaPicker(false)}
                onSelect={handleMediaSelect}
                allowedTypes={['image']}
                title="Kép kiválasztása a könyvtárból"
            />
        </div>
    );
}
