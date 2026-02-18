import { useState, useCallback } from 'react';
import { Upload, X, FolderOpen } from 'lucide-react';
import { deleteImage } from '@/api';
import { apiClient } from '@/api/client';
import { useUI } from '@/context/UIContext';
import { BaseFieldProps, Label, isPendingImage, getImageDisplayUrl, PendingImage } from './types';
import MediaPicker from '@/components/Media/MediaPicker';
import { FALLBACK_GIF } from '@/utils/fallbackImages';

export default function GifFieldRenderer({ field, onChange, isDisabled, isReadOnly, safeValue }: BaseFieldProps) {
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

    const isValidGifFile = (file: File): boolean => file.type === 'image/gif';

    const handleSingleGifSelect = (files: FileList) => {
        if (files.length === 0) return;
        const file = files[0];

        if (!isValidGifFile(file)) {
            showToast('error', 'CSAK GIF ENGEDÉLYEZETT', 'Csak animált GIF fájlokat (.gif) lehet feltölteni.');
            return;
        }

        const maxSize = 15 * 1024 * 1024;
        if (file.size > maxSize) {
            showToast('error', 'TÚL NAGY FÁJL', 'A GIF mérete nem lehet nagyobb 15MB-nál.');
            return;
        }

        const preview = URL.createObjectURL(file);
        if (isPendingImage(safeValue)) {
            URL.revokeObjectURL(safeValue.preview);
        }

        const pendingImage: PendingImage = { file, preview, _isPending: true };
        onChange(pendingImage);
        showToast('info', 'GIF KIVÁLASZTVA', 'A GIF mentéskor kerül feltöltésre.');
    };

    const handleGifDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (isDisabled || isReadOnly) return;

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            if (!isValidGifFile(file)) {
                showToast('error', 'CSAK GIF ENGEDÉLYEZETT', 'Csak animált GIF fájlokat lehet ide húzni.');
                return;
            }
            handleSingleGifSelect(e.dataTransfer.files);
        } else {
            const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
            if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
                if (url.toLowerCase().endsWith('.gif')) {
                    onChange(url);
                    showToast('info', 'GIF URL HOZZÁADVA', 'Külső GIF URL mentve.');
                } else {
                    showToast('warning', 'NEM GIF URL', 'Csak GIF URL-eket lehet hozzáadni.');
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
                // GIF is used elsewhere - just unlink, don't delete from server
                confirm({
                    title: 'GIF Leválasztása',
                    message: `Ez a GIF ${usageCount} helyen van használva. Csak erről a mezőről lesz eltávolítva, a fájl megmarad a szerveren.`,
                    isDestructive: false,
                    confirmLabel: 'Leválasztás',
                    onConfirm: () => {
                        onChange('');
                        showToast('info', 'GIF LEVÁLASZTVA', 'A GIF eltávolítva ebből a mezőből.');
                    }
                });
            } else {
                // GIF is only used here - can delete from server
                confirm({
                    title: 'GIF Végleges Törlése',
                    message: 'Ez a GIF csak itt van használva. Törlés után véglegesen eltűnik a szerverről.',
                    isDestructive: true,
                    confirmLabel: 'Végleges Törlés',
                    onConfirm: async () => {
                        try {
                            await deleteImage(safeValue);
                            onChange('');
                            showToast('success', 'GIF TÖRÖLVE', 'A fájl véglegesen törölve a szerverről.');
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
            showToast('warning', 'LEVÁLASZTVA', 'GIF eltávolítva a mezőből.');
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
        // Validate it's a GIF
        if (!url.toLowerCase().endsWith('.gif')) {
            showToast('warning', 'NEM GIF', 'Csak GIF fájlokat választhatsz ki ehhez a mezőhöz.');
            return;
        }
        onChange(url);
        setShowMediaPicker(false);
        showToast('success', 'GIF KIVÁLASZTVA', 'GIF a könyvtárból kiválasztva.');
    }, [onChange, showToast]);

    const dropActive = isDragging;
    const hasGif = safeValue && (typeof safeValue === 'string' || isPendingImage(safeValue));
    const displayUrl = getImageDisplayUrl(safeValue);
    const isPending = isPendingImage(safeValue);

    return (
        <div className="space-y-4">
            <Label required={field.required}>{field.label}</Label>
            <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                <span className="text-[9px] font-mono uppercase tracking-wider text-purple-400">
                    CSAK ANIMÁLT GIF
                </span>
            </div>
            <div
                className={`
                    relative w-full aspect-video border transition-all duration-300 overflow-hidden group 
                    ${dropActive ? 'border-2 border-purple-500 bg-purple-500/10 scale-[1.01]' : 'border-dashed border-purple-500/50 hover:border-purple-500'}
                    ${(isDisabled || isReadOnly) ? 'opacity-50 cursor-not-allowed border-border' : ''}
                `}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleGifDrop}
                onContextMenu={handleContextMenu}
            >
                {!(isDisabled || isReadOnly) && (
                    <input
                        type="file"
                        accept="image/gif"
                        onChange={(e) => e.target.files && handleSingleGifSelect(e.target.files)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                    />
                )}

                {hasGif ? (
                    <>
                        <img
                            src={displayUrl}
                            alt="GIF Preview"
                            className="w-full h-full object-contain p-4"
                            loading="lazy"
                            decoding="async"
                            onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_GIF; }}
                        />
                        <div className="absolute bottom-2 left-2 px-2 py-1 bg-purple-500/90 text-white text-[8px] font-mono uppercase tracking-wider z-20 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                            GIF
                        </div>
                        {isPending && (
                            <div className="absolute top-2 left-2 px-2 py-1 bg-yellow-500/90 text-black text-[9px] font-mono uppercase tracking-wider z-30">
                                ● NINCS MENTVE
                            </div>
                        )}
                        {!(isDisabled || isReadOnly) && (
                            <div className="absolute inset-0 bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 backdrop-blur-sm z-10 pointer-events-none">
                                <span className="text-xs font-mono uppercase tracking-widest border-b border-purple-500 text-purple-400">Húzz ide GIF-et · Jobb klikk = Könyvtár</span>
                            </div>
                        )}
                        {!(isDisabled || isReadOnly) && (
                            <button
                                onClick={(e) => { e.stopPropagation(); handleClearImage(); }}
                                className="absolute top-2 right-2 p-2 border border-purple-500 bg-background hover:bg-purple-500 hover:text-white transition-colors z-30"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </>
                ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <div className="w-px h-12 bg-purple-500/20 mb-4" />
                        <div className="relative">
                            <Upload size={16} className={`mb-2 ${dropActive ? 'text-purple-500 animate-bounce' : 'text-purple-500/40'}`} />
                            <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-purple-500 animate-pulse shadow-[0_0_10px_rgba(168,85,247,0.5)]" />
                        </div>
                        <span className="text-[9px] font-mono uppercase tracking-widest text-purple-400/60">
                            {dropActive ? 'ENGEDD EL A GIF FELTÖLTÉSÉHEZ' : 'HÚZZ IDE · KATTINTS · JOBB KLIKK = KÖNYVTÁR'}
                        </span>
                        <span className="text-[8px] font-mono text-purple-400/40 mt-1">
                            MAX 15MB
                        </span>
                    </div>
                )}
            </div>
            {hasGif && !isPending && (
                <div className="flex items-center gap-2 opacity-50 hover:opacity-100 transition-opacity">
                    <span className="text-[9px] font-mono text-purple-400">FORRÁS:</span>
                    <input
                        type="text"
                        value={displayUrl}
                        readOnly={true}
                        className="flex-1 bg-transparent border-none text-[9px] font-mono focus:outline-none truncate cursor-text text-purple-300"
                        onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                </div>
            )}
            {isPending && (
                <div className="flex items-center gap-2 text-yellow-500">
                    <span className="text-[9px] font-mono">● A GIF mentéskor töltődik fel a szerverre</span>
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
                                input.accept = 'image/gif';
                                input.onchange = (e) => {
                                    const files = (e.target as HTMLInputElement).files;
                                    if (files) handleSingleGifSelect(files);
                                };
                                input.click();
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2 text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors group"
                        >
                            <Upload size={14} className="group-hover:scale-110 transition-transform" />
                            <span>FELTÖLTÉS...</span>
                        </button>
                        {hasGif && (
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
                title="GIF kiválasztása a könyvtárból"
            />
        </div>
    );
}
