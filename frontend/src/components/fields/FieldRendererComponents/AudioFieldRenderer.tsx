/**
 * AudioFieldRenderer - Audio upload field with playback
 * Follows the same patterns as VideoFieldRenderer
 * 
 * Features:
 * - Drag & drop audio files
 * - Dynamic waveform visualization (optimized with requestAnimationFrame)
 * - Built-in audio player with controls
 * - Media library integration
 * - Emerald/teal color scheme (distinct from violet GIF)
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { X, FolderOpen, Music2, Play, Pause, Volume2, VolumeX } from 'lucide-react';
import { deleteMedia } from '@/api';
import { apiClient } from '@/api/client';
import { useUI } from '@/context/UIContext';
import { BaseFieldProps, Label, isPendingAudio, getAudioDisplayUrl, PendingAudio } from './types';
import MediaPicker from '@/components/Media/MediaPicker';

export default function AudioFieldRenderer({ field, onChange, isDisabled, isReadOnly, safeValue }: BaseFieldProps) {
    const { showToast, confirm } = useUI();
    const [isDragging, setIsDragging] = useState(false);
    const [showMediaPicker, setShowMediaPicker] = useState(false);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

    // Audio player state
    const audioRef = useRef<HTMLAudioElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isMuted, setIsMuted] = useState(false);
    const [volume, setVolume] = useState(1);

    // Waveform animation state
    const [waveformHeights, setWaveformHeights] = useState<number[]>(() =>
        Array.from({ length: 40 }, (_, i) => 20 + Math.sin(i * 0.3) * 15)
    );
    const animationFrameRef = useRef<number>();
    const lastUpdateRef = useRef<number>(0);

    // Optimized waveform animation - only runs when playing
    useEffect(() => {
        if (!isPlaying) {
            // Static waveform when not playing
            setWaveformHeights(Array.from({ length: 40 }, (_, i) => 20 + Math.sin(i * 0.3) * 15));
            return;
        }

        const animate = (timestamp: number) => {
            // Throttle to ~30fps for performance
            if (timestamp - lastUpdateRef.current < 33) {
                animationFrameRef.current = requestAnimationFrame(animate);
                return;
            }
            lastUpdateRef.current = timestamp;

            setWaveformHeights(prev =>
                prev.map((_, i) => {
                    const base = 20 + Math.sin(i * 0.5 + timestamp * 0.003) * 20;
                    const variation = Math.sin(timestamp * 0.005 + i * 0.7) * 10;
                    return Math.max(10, Math.min(60, base + variation));
                })
            );

            animationFrameRef.current = requestAnimationFrame(animate);
        };

        animationFrameRef.current = requestAnimationFrame(animate);

        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [isPlaying]);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        if (!isDisabled && !isReadOnly) setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const isValidAudioFile = (file: File): boolean => {
        const validTypes = [
            'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav',
            'audio/ogg', 'audio/flac', 'audio/aac', 'audio/mp4',
            'audio/x-m4a', 'audio/webm', 'audio/x-aiff'
        ];
        return validTypes.includes(file.type) || file.type.startsWith('audio/');
    };

    const handleAudioSelect = async (files: FileList) => {
        if (files.length === 0) return;
        const file = files[0];

        if (!isValidAudioFile(file)) {
            showToast('error', 'ÉRVÉNYTELEN FÁJL', 'Csak audiófájlokat lehet feltölteni (MP3, WAV, OGG, FLAC, AAC, M4A).');
            return;
        }

        // Max 100MB check
        const maxSize = 100 * 1024 * 1024;
        if (file.size > maxSize) {
            showToast('error', 'TÚL NAGY FÁJL', 'A fájl mérete nem lehet nagyobb 100MB-nál.');
            return;
        }

        // Create local preview
        const preview = URL.createObjectURL(file);
        if (isPendingAudio(safeValue)) {
            URL.revokeObjectURL(safeValue.preview);
        }

        const pendingAudio: PendingAudio = { file, preview, _isPendingAudio: true };
        onChange(pendingAudio);
        showToast('info', 'AUDIÓ KIVÁLASZTVA', 'Az audió mentéskor kerül feltöltésre.');
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (isDisabled || isReadOnly) return;

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleAudioSelect(e.dataTransfer.files);
        } else {
            // Handle URL drops
            const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
            if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
                const audioExtensions = ['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a', '.webm'];
                if (audioExtensions.some(ext => url.toLowerCase().includes(ext))) {
                    onChange(url);
                    showToast('info', 'URL HOZZÁADVA', 'Külső audió URL mentve.');
                } else {
                    showToast('warning', 'NEM AUDIÓ URL', 'A megadott URL nem tűnik audiónak.');
                }
            }
        }
    };

    const handleClearAudio = async () => {
        if (isDisabled || isReadOnly) return;

        // Stop playback
        if (audioRef.current) {
            audioRef.current.pause();
            setIsPlaying(false);
        }

        // Pending audios: just clear without server check
        if (isPendingAudio(safeValue)) {
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
                    title: 'Audió Leválasztása',
                    message: `Ez az audió ${usageCount} helyen van használva. Csak erről a mezőről lesz eltávolítva.`,
                    isDestructive: false,
                    confirmLabel: 'Leválasztás',
                    onConfirm: () => {
                        onChange('');
                        showToast('info', 'AUDIÓ LEVÁLASZTVA', 'Az audió eltávolítva ebből a mezőből.');
                    }
                });
            } else {
                confirm({
                    title: 'Audió Végleges Törlése',
                    message: 'Ez az audió csak itt van használva. Törlés után véglegesen eltűnik a szerverről.',
                    isDestructive: true,
                    confirmLabel: 'Végleges Törlés',
                    onConfirm: async () => {
                        try {
                            await deleteMedia(safeValue as string);
                            onChange('');
                            showToast('success', 'AUDIÓ TÖRÖLVE', 'A fájl véglegesen törölve a szerverről.');
                        } catch (e) {
                            onChange('');
                            showToast('warning', 'TÖRLÉSI HIBA', 'A mezőből eltávolítva, de a fájl törlése sikertelen.');
                        }
                    }
                });
            }
        } catch (e) {
            onChange('');
            showToast('warning', 'LEVÁLASZTVA', 'Audió eltávolítva a mezőből.');
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
        showToast('success', 'AUDIÓ KIVÁLASZTVA', 'Audió a könyvtárból kiválasztva.');
    }, [onChange, showToast]);

    // Audio player controls
    const togglePlay = useCallback(() => {
        if (!audioRef.current) return;

        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play();
        }
        setIsPlaying(!isPlaying);
    }, [isPlaying]);

    const toggleMute = useCallback(() => {
        if (!audioRef.current) return;
        audioRef.current.muted = !isMuted;
        setIsMuted(!isMuted);
    }, [isMuted]);

    const handleTimeUpdate = useCallback(() => {
        if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
        }
    }, []);

    const handleLoadedMetadata = useCallback(() => {
        if (audioRef.current) {
            const audioDuration = audioRef.current.duration;
            // Handle Infinity and NaN cases
            if (isFinite(audioDuration) && !isNaN(audioDuration)) {
                setDuration(audioDuration);
            } else {
                // Try to get duration after a short delay (some browsers need this)
                setTimeout(() => {
                    if (audioRef.current && isFinite(audioRef.current.duration)) {
                        setDuration(audioRef.current.duration);
                    }
                }, 100);
            }
        }
    }, []);

    const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (audioRef.current) {
            const time = parseFloat(e.target.value);
            audioRef.current.currentTime = time;
            setCurrentTime(time);
        }
    }, []);

    const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (audioRef.current) {
            const vol = parseFloat(e.target.value);
            audioRef.current.volume = vol;
            setVolume(vol);
            setIsMuted(vol === 0);
        }
    }, []);

    const handleEnded = useCallback(() => {
        setIsPlaying(false);
        setCurrentTime(0);
    }, []);

    // Format time display
    const formatTime = (seconds: number): string => {
        if (!isFinite(seconds) || isNaN(seconds) || seconds < 0) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const dropActive = isDragging;
    const hasAudio = safeValue && (typeof safeValue === 'string' || isPendingAudio(safeValue));
    const displayUrl = getAudioDisplayUrl(safeValue);
    const isPending = isPendingAudio(safeValue);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (isPendingAudio(safeValue)) {
                URL.revokeObjectURL(safeValue.preview);
            }
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, []);

    return (
        <div className="space-y-4">
            <Label required={field.required}>{field.label}</Label>
            <div
                className={`
                    relative w-full border transition-all duration-300 overflow-hidden group 
                    ${hasAudio ? 'aspect-[3/1]' : 'aspect-[4/1]'}
                    ${dropActive ? 'border-2 border-foreground bg-secondary/20 scale-[1.01]' : 'border-dashed border-border hover:border-foreground/50'}
                    ${(isDisabled || isReadOnly) ? 'opacity-50 cursor-not-allowed border-border' : ''}
                `}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onContextMenu={handleContextMenu}
            >
                {hasAudio ? (
                    <div className="w-full h-full bg-gradient-to-br from-emerald-500/10 via-teal-500/10 to-cyan-500/10 flex flex-col">
                        {/* Hidden audio element */}
                        <audio
                            ref={audioRef}
                            src={displayUrl}
                            onTimeUpdate={handleTimeUpdate}
                            onLoadedMetadata={handleLoadedMetadata}
                            onDurationChange={handleLoadedMetadata}
                            onEnded={handleEnded}
                            onCanPlayThrough={handleLoadedMetadata}
                            preload="auto"
                        />

                        {/* Pending badge */}
                        {isPending && (
                            <div className="absolute top-2 left-2 px-2 py-1 bg-yellow-500/90 text-black text-[9px] font-mono uppercase tracking-wider z-30 flex items-center gap-1">
                                <Music2 size={10} />
                                NINCS MENTVE
                            </div>
                        )}

                        {/* Clear button */}
                        {!(isDisabled || isReadOnly) && (
                            <button
                                onClick={handleClearAudio}
                                className="absolute top-2 right-2 p-1.5 bg-background/80 hover:bg-red-500 text-foreground hover:text-white transition-all z-30 opacity-0 group-hover:opacity-100"
                            >
                                <X size={14} />
                            </button>
                        )}

                        {/* Waveform visualization (dynamic) */}
                        <div className="flex-1 flex items-center justify-center px-4 gap-0.5">
                            {waveformHeights.map((height, i) => {
                                // Safe progress calculation - handle Infinity and NaN
                                const safeDuration = isFinite(duration) && duration > 0 ? duration : 1;
                                const safeCurrentTime = isFinite(currentTime) ? currentTime : 0;
                                const progress = safeCurrentTime / safeDuration;
                                const barProgress = i / waveformHeights.length;
                                const isPast = duration > 0 && barProgress <= progress;

                                return (
                                    <div
                                        key={i}
                                        className={`w-1 rounded-full transition-colors duration-100 ${isPast
                                                ? 'bg-emerald-500'
                                                : 'bg-foreground/20'
                                            }`}
                                        style={{
                                            height: `${height}%`,
                                            transition: 'height 0.1s ease-out'
                                        }}
                                    />
                                );
                            })}
                        </div>

                        {/* Player controls */}
                        <div className="px-4 py-3 bg-background/50 backdrop-blur-sm border-t border-border/50 flex items-center gap-4">
                            {/* Play/Pause */}
                            <button
                                onClick={togglePlay}
                                className="w-10 h-10 flex items-center justify-center rounded-full bg-emerald-500 hover:bg-emerald-600 text-white transition-colors"
                            >
                                {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
                            </button>

                            {/* Time & Progress */}
                            <div className="flex-1 flex items-center gap-3">
                                <span className="text-[10px] font-mono text-foreground/60 w-10">
                                    {formatTime(currentTime)}
                                </span>
                                <input
                                    type="range"
                                    min={0}
                                    max={isFinite(duration) && duration > 0 ? duration : 100}
                                    value={isFinite(currentTime) ? currentTime : 0}
                                    onChange={handleSeek}
                                    className="flex-1 h-1 bg-foreground/20 rounded-full appearance-none cursor-pointer
                                        [&::-webkit-slider-thumb]:appearance-none
                                        [&::-webkit-slider-thumb]:w-3
                                        [&::-webkit-slider-thumb]:h-3
                                        [&::-webkit-slider-thumb]:rounded-full
                                        [&::-webkit-slider-thumb]:bg-emerald-500
                                        [&::-webkit-slider-thumb]:hover:bg-emerald-400
                                        [&::-webkit-slider-thumb]:transition-colors"
                                />
                                <span className="text-[10px] font-mono text-foreground/60 w-10 text-right">
                                    {isFinite(duration) && duration > 0 ? formatTime(duration) : '--:--'}
                                </span>
                            </div>

                            {/* Volume */}
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={toggleMute}
                                    className="p-1 text-foreground/60 hover:text-foreground transition-colors"
                                >
                                    {isMuted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
                                </button>
                                <input
                                    type="range"
                                    min={0}
                                    max={1}
                                    step={0.1}
                                    value={isMuted ? 0 : volume}
                                    onChange={handleVolumeChange}
                                    className="w-16 h-1 bg-foreground/20 rounded-full appearance-none cursor-pointer
                                        [&::-webkit-slider-thumb]:appearance-none
                                        [&::-webkit-slider-thumb]:w-2
                                        [&::-webkit-slider-thumb]:h-2
                                        [&::-webkit-slider-thumb]:rounded-full
                                        [&::-webkit-slider-thumb]:bg-foreground/60"
                                />
                            </div>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Upload overlay */}
                        {!(isDisabled || isReadOnly) && (
                            <input
                                type="file"
                                accept="audio/*"
                                onChange={(e) => e.target.files && handleAudioSelect(e.target.files)}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                            />
                        )}

                        {/* Empty state */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-foreground/40">
                            <Music2 size={32} strokeWidth={1.5} />
                            <span className="text-xs font-mono uppercase tracking-wider">
                                {dropActive ? 'EJTSD IDE' : 'AUDIÓ FELTÖLTÉS'}
                            </span>
                            <span className="text-[9px] opacity-60">MP3, WAV, OGG, FLAC, AAC, M4A</span>
                        </div>
                    </>
                )}
            </div>

            {/* Media Library button */}
            {!(isDisabled || isReadOnly) && (
                <button
                    onClick={() => setShowMediaPicker(true)}
                    className="flex items-center gap-2 px-3 py-2 border border-border hover:border-foreground/50 
                        text-[10px] font-mono uppercase tracking-wider transition-all hover:bg-secondary/30"
                >
                    <FolderOpen size={14} />
                    MÉDIA KÖNYVTÁR
                </button>
            )}

            {/* Context Menu */}
            {contextMenu && (
                <>
                    <div
                        className="fixed inset-0 z-50"
                        onClick={handleCloseContextMenu}
                    />
                    <div
                        className="fixed z-50 bg-popover border border-border shadow-lg py-1 min-w-[160px]"
                        style={{ top: contextMenu.y, left: contextMenu.x }}
                    >
                        <button
                            onClick={() => {
                                setShowMediaPicker(true);
                                handleCloseContextMenu();
                            }}
                            className="w-full px-3 py-2 text-left text-sm hover:bg-accent flex items-center gap-2"
                        >
                            <FolderOpen size={14} />
                            Média könyvtárból
                        </button>
                        {hasAudio && (
                            <button
                                onClick={() => {
                                    handleClearAudio();
                                    handleCloseContextMenu();
                                }}
                                className="w-full px-3 py-2 text-left text-sm hover:bg-accent text-red-500 flex items-center gap-2"
                            >
                                <X size={14} />
                                Eltávolítás
                            </button>
                        )}
                    </div>
                </>
            )}

            {/* Media Picker Modal */}
            <MediaPicker
                isOpen={showMediaPicker}
                onClose={() => setShowMediaPicker(false)}
                onSelect={handleMediaSelect}
                allowedTypes={['audio']}
                title="Audió kiválasztása a könyvtárból"
            />
        </div>
    );
}
