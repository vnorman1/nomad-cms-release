/**
 * VideoFieldRenderer - Video upload field with WebM conversion
 * Follows the same patterns as ImageFieldRenderer
 */

import { useState, useCallback } from 'react';
import { Upload, X, FolderOpen, Film } from 'lucide-react';
import { deleteMedia } from '@/api';
import { apiClient } from '@/api/client';
import { useUI } from '@/context/UIContext';
import { BaseFieldProps, Label, isPendingVideo, getVideoDisplayUrl, PendingVideo } from './types';
import MediaPicker from '@/components/Media/MediaPicker';

export default function VideoFieldRenderer({ field, onChange, isDisabled, isReadOnly, safeValue }: BaseFieldProps) {
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

    const isValidVideoFile = (file: File): boolean => {
        const validTypes = [
            'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo',
            'video/x-matroska', 'video/x-ms-wmv', 'video/x-flv', 'video/avi',
            'video/mov', 'video/mkv'
        ];
        return validTypes.includes(file.type) || file.type.startsWith('video/');
    };

    const handleVideoSelect = async (files: FileList) => {
        if (files.length === 0) return;
        const file = files[0];

        if (!isValidVideoFile(file)) {
            showToast('error', 'ÉRVÉNYTELEN FÁJL', 'Csak videófájlokat lehet feltölteni (MP4, WebM, MOV, AVI, MKV).');
            return;
        }

        // Create local preview
        const preview = URL.createObjectURL(file);
        if (isPendingVideo(safeValue)) {
            URL.revokeObjectURL(safeValue.preview);
        }

        const pendingVideo: PendingVideo = { file, preview, _isPendingVideo: true };
        onChange(pendingVideo);
        showToast('info', 'VIDEÓ KIVÁLASZTVA', 'A videó mentéskor kerül feltöltésre.');
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (isDisabled || isReadOnly) return;

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleVideoSelect(e.dataTransfer.files);
        } else {
            // Handle URL drops
            const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
            if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
                const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv'];
                if (videoExtensions.some(ext => url.toLowerCase().includes(ext))) {
                    onChange(url);
                    showToast('info', 'URL HOZZÁADVA', 'Külső videó URL mentve.');
                } else {
                    showToast('warning', 'NEM VIDEÓ URL', 'A megadott URL nem tűnik videónak.');
                }
            }
        }
    };

    const handleClearVideo = async () => {
        if (isDisabled || isReadOnly) return;

        // Pending videos: just clear without server check
        if (isPendingVideo(safeValue)) {
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
            const response = await apiClient.get(`/endpoints/media.php?file=${encodeURIComponent(filename)}`);
            const usageCount = response.data?.file?.usageCount || 0;

            if (usageCount > 1) {
                confirm({
                    title: 'Videó Leválasztása',
                    message: `Ez a videó ${usageCount} helyen van használva. Csak erről a mezőről lesz eltávolítva.`,
                    isDestructive: false,
                    confirmLabel: 'Leválasztás',
                    onConfirm: () => {
                        onChange('');
                        showToast('info', 'VIDEÓ LEVÁLASZTVA', 'A videó eltávolítva ebből a mezőből.');
                    }
                });
            } else {
                confirm({
                    title: 'Videó Végleges Törlése',
                    message: 'Ez a videó csak itt van használva. Törlés után véglegesen eltűnik a szerverről.',
                    isDestructive: true,
                    confirmLabel: 'Végleges Törlés',
                    onConfirm: async () => {
                        try {
                            await deleteMedia(safeValue as string);
                            onChange('');
                            showToast('success', 'VIDEÓ TÖRÖLVE', 'A fájl véglegesen törölve a szerverről.');
                        } catch (e) {
                            onChange('');
                            showToast('warning', 'TÖRLÉSI HIBA', 'A mezőből eltávolítva, de a fájl törlése sikertelen.');
                        }
                    }
                });
            }
        } catch (e) {
            onChange('');
            showToast('warning', 'LEVÁLASZTVA', 'Videó eltávolítva a mezőből.');
        }
    };

    const handleContextMenu = useCallback((e: React.MouseEvent) => {
        if (isDisabled || isReadOnly) return;
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY });
    }, [isDisabled, isReadOnly]);

    const handleCloseContextMenu = useCallback(() => {
        setContextMenu(null);
    }, []);

    const handleMediaSelect = useCallback((url: string) => {
        onChange(url);
        setShowMediaPicker(false);
        showToast('success', 'VIDEÓ KIVÁLASZTVA', 'Videó a könyvtárból kiválasztva.');
    }, [onChange, showToast]);

    const dropActive = isDragging;
    const hasVideo = safeValue && (typeof safeValue === 'string' || isPendingVideo(safeValue));
    const displayUrl = getVideoDisplayUrl(safeValue);
    const isPending = isPendingVideo(safeValue);

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
                onDrop={handleDrop}
                onContextMenu={handleContextMenu}
            >
                {!(isDisabled || isReadOnly) && (
                    <input
                        type="file"
                        accept="video/*"
                        onChange={(e) => e.target.files && handleVideoSelect(e.target.files)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                    />
                )}

                {hasVideo ? (
                    <>
                        <video
                            src={displayUrl}
                            className="w-full h-full object-contain bg-black"
                            controls
                            preload="metadata"
                        />
                        {isPending && (
                            <div className="absolute top-2 left-2 px-2 py-1 bg-yellow-500/90 text-black text-[9px] font-mono uppercase tracking-wider z-30 flex items-center gap-1">
                                <Film size={10} />
                                NINCS MENTVE
                            </div>
                        )}
                        {!(isDisabled || isReadOnly) && (
                            <div className="absolute inset-0 bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 backdrop-blur-sm z-10 pointer-events-none">
                                <span className="text-xs font-mono uppercase tracking-widest border-b border-foreground">
                                    Húzz ide videót a cseréhez · Jobb klikk = Könyvtár
                                </span>
                            </div>
                        )}
                        {!(isDisabled || isReadOnly) && (
                            <button
                                onClick={(e) => { e.stopPropagation(); handleClearVideo(); }}
                                className="absolute top-2 right-2 p-2 border border-foreground bg-background hover:bg-foreground hover:text-background transition-colors z-30"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </>
                ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <div className="w-px h-12 bg-foreground/20 mb-4" />
                        <Film size={20} className={`mb-2 ${dropActive ? 'text-foreground animate-bounce' : 'text-foreground/40'}`} />
                        <span className="text-[9px] font-mono uppercase tracking-widest opacity-40">
                            {dropActive ? 'ENGEDD EL A FELTÖLTÉSHEZ' : 'HÚZZ IDE · KATTINTS · JOBB KLIKK = KÖNYVTÁR'}
                        </span>
                        <span className="text-[8px] font-mono uppercase tracking-wider opacity-30 mt-1">
                            MP4, WebM, MOV, AVI, MKV · Max 100MB
                        </span>
                    </div>
                )}
            </div>

            {hasVideo && !isPending && (
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
                    <Film size={12} />
                    <span className="text-[9px] font-mono">A videó mentéskor feltöltődik és WebM-re konvertálódik</span>
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
                            <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">Videó műveletek</span>
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
                                input.accept = 'video/*';
                                input.onchange = (e) => {
                                    const files = (e.target as HTMLInputElement).files;
                                    if (files) handleVideoSelect(files);
                                };
                                input.click();
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2 text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors group"
                        >
                            <Upload size={14} className="group-hover:scale-110 transition-transform" />
                            <span>FELTÖLTÉS...</span>
                        </button>
                        {hasVideo && (
                            <>
                                <div className="h-px bg-border/50 my-1" />
                                <button
                                    onClick={() => {
                                        setContextMenu(null);
                                        handleClearVideo();
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
                allowedTypes={['video']}
                title="Videó kiválasztása a könyvtárból"
            />
        </div>
    );
}
