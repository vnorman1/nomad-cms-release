/**
 * NOMAD CMS - Media Library Page
 * 
 * Full-featured media library with:
 * - Grid/List view modes
 * - Search & filtering
 * - File preview with usage tracking
 * - Delete functionality with usage warnings
 * 
 * Matches the brutalist-modern dashboard aesthetic
 */

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Grid3X3,
    List,
    Search,
    ArrowUpDown,
    Trash2,
    X,
    ExternalLink,
    Copy,
    Check,
    AlertTriangle,
    RefreshCw,
    Upload,
    FileImage,
    Clock,
    Link2,
    Loader2,
    Play,
    Pause,
    Volume2,
    VolumeX
} from 'lucide-react';
import { useMediaLibrary, SortField } from '@/hooks/useMediaLibrary';
import { uploadImage, uploadVideo, uploadAudio } from '@/api/upload';
import type { MediaFile, MediaUsage } from '@/api/media';
import { useNavigate } from 'react-router-dom';

// Helper to determine if file is a video
const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'avi', 'mkv'];
const isVideoFile = (extension: string) => VIDEO_EXTENSIONS.includes(extension.toLowerCase());

// Helper to determine if file is audio
const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'webm'];
const isAudioFile = (extension: string) => AUDIO_EXTENSIONS.includes(extension.toLowerCase());

// ═══════════════════════════════════════════════════════════════════════════
// ANIMATION VARIANTS
// ═══════════════════════════════════════════════════════════════════════════

const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.05,
            delayChildren: 0.1,
        },
    },
};

const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
        y: 0,
        opacity: 1,
        transition: { duration: 0.4 },
    },
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPER COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function TechBadge({ children }: { children: React.ReactNode }) {
    return (
        <span className="px-1.5 py-0.5 border border-foreground/20 text-[9px] font-mono uppercase tracking-widest">
            {children}
        </span>
    );
}

function StatMini({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="flex flex-col">
            <span className="text-[9px] font-mono uppercase tracking-widest opacity-50">{label}</span>
            <span className="text-lg font-bold tracking-tight">{value}</span>
        </div>
    );
}

// Usage badge component
function UsageBadge({ count }: { count: number }) {
    if (count === 0) return null;
    return (
        <span className={`
            absolute top-2 right-2 z-10 px-1.5 py-0.5 text-[9px] font-mono font-bold
            ${count > 0 ? 'bg-emerald-500 text-white' : 'bg-foreground/20 text-foreground'}
        `}>
            {count}× HASZNÁLVA
        </span>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MEDIA GRID ITEM
// ═══════════════════════════════════════════════════════════════════════════

interface MediaGridItemProps {
    file: MediaFile;
    isSelected: boolean;
    isLoading: boolean;
    onSelect: () => void;
}

function MediaGridItem({ file, isSelected, isLoading, onSelect }: MediaGridItemProps) {
    const isVideo = isVideoFile(file.extension);
    const isAudio = isAudioFile(file.extension);

    return (
        <motion.div
            variants={itemVariants}
            onClick={onSelect}
            className={`
                group relative aspect-square cursor-pointer border transition-all duration-300
                ${isSelected
                    ? 'border-foreground ring-2 ring-foreground ring-offset-2 ring-offset-background'
                    : 'border-border hover:border-foreground/50'
                }
            `}
        >
            {/* Usage badge */}
            <UsageBadge count={file.usageCount} />

            {/* Media preview */}
            {isVideo ? (
                <div className="w-full h-full relative bg-black/10">
                    <video
                        src={file.url}
                        className="w-full h-full object-cover"
                        muted
                        preload="metadata"
                    />
                    {/* Video play icon overlay */}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center">
                            <svg className="w-6 h-6 text-black ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                            </svg>
                        </div>
                    </div>
                </div>
            ) : isAudio ? (
                <div className="w-full h-full relative bg-gradient-to-br from-emerald-500/20 via-teal-500/20 to-cyan-500/20 flex items-center justify-center">
                    {/* Audio waveform decorative */}
                    <div className="flex items-center gap-0.5 h-16">
                        {Array.from({ length: 20 }, (_, i) => (
                            <div
                                key={i}
                                className="w-1 bg-emerald-500/60 rounded-full"
                                style={{ height: `${20 + Math.sin(i * 0.5) * 30}%` }}
                            />
                        ))}
                    </div>
                    {/* Audio icon overlay */}
                    <div className="absolute bottom-3 right-3 p-2 rounded-full bg-emerald-500/80">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                        </svg>
                    </div>
                </div>
            ) : (
                <img
                    src={file.url}
                    alt={file.filename}
                    className="w-full h-full object-cover transition-all duration-500"
                    loading="lazy"
                />
            )}

            {/* Overlay on hover */}
            <div className="absolute inset-0 bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-between p-3">
                <div className="flex justify-between items-start">
                    <TechBadge>{file.extension.toUpperCase()}</TechBadge>
                    {file.width && file.height && (
                        <span className="text-[9px] font-mono opacity-60">
                            {file.width}×{file.height}
                        </span>
                    )}
                </div>

                <div>
                    <p className="text-xs font-mono truncate">{file.filename}</p>
                    <div className="flex items-center justify-between">
                        <p className="text-[10px] opacity-60">{file.sizeFormatted}</p>
                        {file.usageCount > 0 && (
                            <span className="text-[9px] text-emerald-500 font-mono">
                                {file.usageCount} helyen
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Loading indicator */}
            {isLoading && (
                <div className="absolute inset-0 bg-background/90 flex items-center justify-center">
                    <Loader2 className="w-5 h-5 animate-spin" />
                </div>
            )}
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MEDIA LIST ITEM
// ═══════════════════════════════════════════════════════════════════════════

interface MediaListItemProps {
    file: MediaFile;
    isSelected: boolean;
    isLoading: boolean;
    onSelect: () => void;
}

function MediaListItem({ file, isSelected, isLoading, onSelect }: MediaListItemProps) {
    const isVideo = isVideoFile(file.extension);
    const isAudio = isAudioFile(file.extension);

    return (
        <motion.div
            variants={itemVariants}
            onClick={onSelect}
            className={`
                group grid grid-cols-[60px_1fr_100px_100px_100px] gap-4 p-3 items-center border-b border-border cursor-pointer transition-all duration-300
                ${isSelected
                    ? 'bg-foreground/5'
                    : 'hover:bg-foreground/5'
                }
            `}
        >
            {/* Thumbnail */}
            <div className="w-10 h-10 flex-shrink-0 border border-current/20 overflow-hidden">
                {isVideo ? (
                    <div className="w-full h-full bg-black/20 flex items-center justify-center">
                        <svg className="w-4 h-4 text-foreground" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                        </svg>
                    </div>
                ) : isAudio ? (
                    <div className="w-full h-full bg-emerald-500/20 flex items-center justify-center">
                        <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                        </svg>
                    </div>
                ) : (
                    <img
                        src={file.url}
                        alt={file.filename}
                        className="w-full h-full object-cover"
                        loading="lazy"
                    />
                )}
            </div>

            {/* Info */}
            <div className="min-w-0">
                <p className="font-mono text-sm truncate">{file.filename}</p>
            </div>

            {/* Size */}
            <div className="text-xs font-mono opacity-60">
                {file.sizeFormatted}
            </div>

            {/* Dimensions */}
            <div className="text-xs font-mono opacity-60">
                {file.width && file.height ? `${file.width}×${file.height}` : isVideo ? 'VIDEÓ' : isAudio ? 'AUDIÓ' : '-'}
            </div>

            {/* Usage count */}
            <div className="flex justify-end">
                {file.usageCount > 0 ? (
                    <span className="px-2 py-1 text-[9px] font-mono font-bold bg-emerald-500/10 text-emerald-600 rounded">
                        {file.usageCount}× HASZNÁLVA
                    </span>
                ) : (
                    <span className="text-[9px] font-mono opacity-30">-</span>
                )}
            </div>

            {/* Loading */}
            {isLoading && <Loader2 className="w-4 h-4 animate-spin absolute right-4" />}
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// USAGE DISPLAY
// ═══════════════════════════════════════════════════════════════════════════

interface UsageItemProps {
    usage: MediaUsage;
    onNavigate: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════
// AUDIO PLAYER COMPONENT (for detail panel)
// ═══════════════════════════════════════════════════════════════════════════

interface AudioPlayerProps {
    src: string;
}

function AudioPlayer({ src }: AudioPlayerProps) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isMuted, setIsMuted] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const handleLoadedMetadata = () => {
            setDuration(audio.duration);
            setIsLoaded(true);
        };

        const handleTimeUpdate = () => {
            setCurrentTime(audio.currentTime);
        };

        const handleEnded = () => {
            setIsPlaying(false);
            setCurrentTime(0);
        };

        const handleCanPlay = () => {
            setIsLoaded(true);
        };

        audio.addEventListener('loadedmetadata', handleLoadedMetadata);
        audio.addEventListener('timeupdate', handleTimeUpdate);
        audio.addEventListener('ended', handleEnded);
        audio.addEventListener('canplay', handleCanPlay);

        // Preload the audio
        audio.load();

        return () => {
            audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
            audio.removeEventListener('timeupdate', handleTimeUpdate);
            audio.removeEventListener('ended', handleEnded);
            audio.removeEventListener('canplay', handleCanPlay);
        };
    }, [src]);

    const togglePlay = () => {
        const audio = audioRef.current;
        if (!audio) return;

        if (isPlaying) {
            audio.pause();
        } else {
            audio.play();
        }
        setIsPlaying(!isPlaying);
    };

    const toggleMute = () => {
        const audio = audioRef.current;
        if (!audio) return;

        audio.muted = !isMuted;
        setIsMuted(!isMuted);
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const audio = audioRef.current;
        if (!audio) return;

        const time = parseFloat(e.target.value);
        audio.currentTime = time;
        setCurrentTime(time);
    };

    const formatTime = (seconds: number) => {
        if (!isFinite(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-emerald-500/10 via-teal-500/10 to-cyan-500/10 rounded">
            {/* Waveform visualization */}
            <div className="flex items-center gap-1 h-16">
                {Array.from({ length: 30 }, (_, i) => (
                    <motion.div
                        key={i}
                        className="w-1.5 bg-emerald-500/60 rounded-full"
                        animate={isPlaying ? {
                            height: [`${20 + Math.sin(i * 0.5) * 35}%`, `${20 + Math.sin((i + 2) * 0.5) * 45}%`, `${20 + Math.sin(i * 0.5) * 35}%`]
                        } : {
                            height: `${20 + Math.sin(i * 0.5) * 35}%`
                        }}
                        transition={isPlaying ? {
                            duration: 0.5 + (i % 5) * 0.1,
                            repeat: Infinity,
                            ease: "easeInOut"
                        } : {}}
                        style={{ height: `${20 + Math.sin(i * 0.5) * 35}%` }}
                    />
                ))}
            </div>

            {/* Custom audio controls */}
            <div className="flex items-center gap-3 bg-foreground/10 backdrop-blur-sm rounded-full px-4 py-2">
                {/* Play/Pause button */}
                <button
                    onClick={togglePlay}
                    disabled={!isLoaded}
                    className="w-10 h-10 rounded-full bg-foreground/10 hover:bg-foreground/20 flex items-center justify-center transition-colors disabled:opacity-50"
                >
                    {isPlaying ? (
                        <Pause className="w-5 h-5" />
                    ) : (
                        <Play className="w-5 h-5 ml-0.5" />
                    )}
                </button>

                {/* Time display */}
                <span className="font-mono text-xs min-w-[40px]">
                    {formatTime(currentTime)}
                </span>

                {/* Progress bar */}
                <input
                    type="range"
                    min={0}
                    max={duration || 100}
                    value={currentTime}
                    onChange={handleSeek}
                    className="w-32 h-1 bg-foreground/20 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-emerald-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
                />

                {/* Duration */}
                <span className="font-mono text-xs min-w-[40px] opacity-60">
                    {formatTime(duration)}
                </span>

                {/* Mute button */}
                <button
                    onClick={toggleMute}
                    className="p-2 hover:bg-foreground/10 rounded-full transition-colors"
                >
                    {isMuted ? (
                        <VolumeX className="w-4 h-4 opacity-50" />
                    ) : (
                        <Volume2 className="w-4 h-4" />
                    )}
                </button>
            </div>

            {/* Hidden audio element with preload */}
            <audio
                ref={audioRef}
                src={src}
                preload="auto"
                className="hidden"
            />
        </div>
    );
}

function UsageItem({ usage, onNavigate }: UsageItemProps) {
    const navigate = useNavigate();

    const typeLabels = {
        direct_reference: 'Közvetlen hivatkozás',
        embedded_in_text: 'Beágyazva szövegben',
        text_content: 'Szöveges tartalomban',
    };

    const handleClick = () => {
        onNavigate(); // Close panel first
        navigate(`/edit/${usage.slot}`);
    };

    return (
        <button
            onClick={handleClick}
            className="w-full text-left p-3 border border-border hover:border-foreground hover:bg-foreground/5 transition-all group"
        >
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <Link2 className="w-3 h-3 opacity-50 group-hover:opacity-100 transition-opacity" />
                    <span className="font-mono text-xs font-bold uppercase">{usage.slot}</span>
                </div>
                <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="text-[10px] opacity-60 space-y-1">
                <p>Típus: {typeLabels[usage.type]}</p>
                <p>Útvonal: {usage.path}</p>
                {usage.field && <p>Mező: {usage.field}</p>}
                {usage.context && (
                    <p className="truncate">Kontextus: {usage.context}</p>
                )}
            </div>
        </button>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// FILE DETAIL PANEL
// ═══════════════════════════════════════════════════════════════════════════

interface FileDetailPanelProps {
    file: NonNullable<ReturnType<typeof useMediaLibrary>['selectedFile']>;
    onClose: () => void;
    onDelete: (force?: boolean) => void;
    deleting: boolean;
}

function FileDetailPanel({ file, onClose, onDelete, deleting }: FileDetailPanelProps) {
    const [copied, setCopied] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    const copyUrl = async () => {
        await navigator.clipboard.writeText(file.url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const hasUsages = file.usageCount > 0;

    return (
        <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-y-0 right-0 w-full max-w-md bg-background border-l border-foreground z-50 overflow-hidden flex flex-col shadow-2xl"
        >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-foreground">
                <h3 className="font-mono text-sm uppercase tracking-widest">Részletek</h3>
                <button onClick={onClose} className="p-1 hover:bg-foreground/10 transition-colors">
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* Preview */}
            <div className="h-64 flex-shrink-0 bg-foreground/5 border-b border-border p-4 flex items-center justify-center">
                {isVideoFile(file.extension) ? (
                    <video
                        src={file.url}
                        className="max-w-full max-h-full object-contain shadow-sm"
                        controls
                        muted
                    />
                ) : isAudioFile(file.extension) ? (
                    <AudioPlayer src={file.url} />
                ) : (
                    <img
                        src={file.url}
                        alt={file.filename}
                        className="max-w-full max-h-full object-contain shadow-sm"
                    />
                )}
            </div>

            {/* File info */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {/* Filename & URL */}
                <div>
                    <p className="font-mono text-xs opacity-50 uppercase mb-1">Fájlnév</p>
                    <p className="font-mono break-all font-bold">{file.filename}</p>

                    <div className="flex items-center gap-2 mt-3">
                        <input
                            type="text"
                            readOnly
                            value={file.url}
                            className="flex-1 px-3 py-2 text-xs font-mono bg-foreground/5 border border-border focus:outline-none"
                        />
                        <button
                            onClick={copyUrl}
                            className="p-2 border border-border hover:border-foreground transition-colors"
                            title="Másolás"
                        >
                            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                        </button>
                        <a
                            href={file.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 border border-border hover:border-foreground transition-colors"
                            title="Megnyitás"
                        >
                            <ExternalLink className="w-4 h-4" />
                        </a>
                    </div>
                </div>

                {/* Metadata grid */}
                <div className="grid grid-cols-2 gap-4">
                    <StatMini label="Méret" value={file.sizeFormatted} />
                    <StatMini label="Típus" value={file.extension.toUpperCase()} />
                    {file.width && file.height && (
                        <>
                            <StatMini label="Szélesség" value={`${file.width}px`} />
                            <StatMini label="Magasság" value={`${file.height}px`} />
                        </>
                    )}
                </div>

                {/* Dates */}
                <div className="pt-4 border-t border-border space-y-2">
                    <div className="flex items-center gap-2 text-xs opacity-60">
                        <Clock className="w-3 h-3" />
                        <span>Létrehozva: {new Date(file.createdAt).toLocaleString('hu-HU')}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs opacity-60">
                        <Clock className="w-3 h-3" />
                        <span>Módosítva: {new Date(file.modifiedAt).toLocaleString('hu-HU')}</span>
                    </div>
                </div>

                {/* Usage section */}
                <div className="pt-4 border-t border-border">
                    <div className="flex items-center justify-between mb-4">
                        <h4 className="font-mono text-xs uppercase tracking-widest">
                            Használat ({file.usageCount})
                        </h4>
                        {hasUsages && (
                            <span className="text-[9px] px-2 py-0.5 bg-emerald-500/20 text-emerald-500 font-mono">
                                AKTÍV
                            </span>
                        )}
                    </div>

                    {file.usageCount === 0 ? (
                        <p className="text-xs opacity-50 italic">Ez a fájl nincs használatban sehol.</p>
                    ) : (
                        <>
                            <p className="text-[10px] text-emerald-500 mb-3 font-mono">
                                Kattints a használati helyre a szerkesztőhöz ugráshoz →
                            </p>
                            <div className="space-y-2">
                                {file.usages.map((usage, i) => (
                                    <UsageItem key={i} usage={usage} onNavigate={onClose} />
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Footer actions */}
            <div className="p-4 border-t border-foreground bg-background">
                {showDeleteConfirm ? (
                    <div className="space-y-3">
                        {hasUsages && (
                            <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/30 text-amber-500">
                                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                <p className="text-xs">
                                    Ez a fájl {file.usageCount} helyen van használatban!
                                    A törlés hibás hivatkozásokat eredményezhet.
                                </p>
                            </div>
                        )}
                        <div className="flex gap-2">
                            <button
                                onClick={() => setShowDeleteConfirm(false)}
                                className="flex-1 px-4 py-2 border border-border hover:border-foreground transition-colors text-sm"
                            >
                                Mégsem
                            </button>
                            <button
                                onClick={() => onDelete(true)}
                                disabled={deleting}
                                className="flex-1 px-4 py-2 bg-red-500 text-white hover:bg-red-600 transition-colors text-sm disabled:opacity-50"
                            >
                                {deleting ? 'Törlés...' : 'Törlés megerősítése'}
                            </button>
                        </div>
                    </div>
                ) : (
                    <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-red-500/50 text-red-500 hover:bg-red-500 hover:text-white transition-all text-sm"
                    >
                        <Trash2 className="w-4 h-4" />
                        Fájl törlése
                    </button>
                )}
            </div>
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function MediaLibraryPage() {
    const {
        total,
        totalSizeFormatted,
        loading,
        loadingFile,
        selectedFile,
        searchQuery,
        sortField,
        sortDirection,
        viewMode,
        refresh,
        selectFile,
        clearSelection,
        deleteFile,
        setSearchQuery,
        setSortField,
        toggleSortDirection,
        setViewMode,
        filteredFiles,
    } = useMediaLibrary();

    const [deleting, setDeleting] = useState(false);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleDelete = async (force?: boolean) => {
        if (!selectedFile) return;
        setDeleting(true);
        const result = await deleteFile(selectedFile.filename, force);
        setDeleting(false);
        if (result.success) {
            clearSelection();
        }
    };

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        try {
            // Detect file type based on MIME type
            const isVideo = file.type.startsWith('video/');
            const isAudio = file.type.startsWith('audio/');

            if (isVideo) {
                await uploadVideo(file);
            } else if (isAudio) {
                await uploadAudio(file);
            } else {
                await uploadImage(file);
            }
            await refresh();
        } catch (error) {
            console.error('Upload failed:', error);
        } finally {
            setUploading(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const sortOptions: { value: SortField; label: string }[] = [
        { value: 'modifiedAt', label: 'Dátum' },
        { value: 'filename', label: 'Név' },
        { value: 'size', label: 'Méret' },
    ];

    return (
        <div className="max-w-6xl mx-auto min-h-screen">
            <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="space-y-8 pb-32"
            >
                {/* HEADER */}
                <div className="flex justify-between items-end mb-8 border-b border-foreground pb-6">
                    <div>
                        <h1 className="text-4xl font-black tracking-tighter mb-2">MÉDIA KÖNYVTÁR</h1>
                        <p className="font-mono text-sm uppercase tracking-widest opacity-60">
                            Feltöltött médiafájlok kezelése
                        </p>
                    </div>
                    <div className="flex items-center gap-6">
                        <StatMini label="Összes fájl" value={total} />
                        <StatMini label="Tárhely" value={totalSizeFormatted} />
                    </div>
                </div>

                {/* TOOLBAR */}
                <motion.section variants={itemVariants} className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
                    {/* Search */}
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 opacity-40" />
                        <input
                            type="text"
                            placeholder="Keresés fájlnév alapján..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-border bg-background font-mono text-sm focus:border-foreground focus:outline-none transition-colors"
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Upload button */}
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*,video/*,audio/*"
                            onChange={handleUpload}
                            className="hidden"
                        />
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                            className="flex items-center gap-2 px-4 py-2 bg-foreground text-background hover:opacity-90 transition-opacity font-mono text-sm uppercase tracking-widest disabled:opacity-50"
                        >
                            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                            Feltöltés
                        </button>

                        {/* Refresh */}
                        <button
                            onClick={refresh}
                            disabled={loading}
                            className="p-2 border border-border hover:border-foreground transition-colors disabled:opacity-50"
                            title="Frissítés"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        </button>

                        {/* Sort dropdown */}
                        <select
                            value={sortField}
                            onChange={(e) => setSortField(e.target.value as SortField)}
                            className="px-3 py-2 border border-border bg-background font-mono text-xs uppercase tracking-widest focus:border-foreground focus:outline-none"
                        >
                            {sortOptions.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>

                        {/* Sort direction */}
                        <button
                            onClick={toggleSortDirection}
                            className="p-2 border border-border hover:border-foreground transition-colors"
                            title={sortDirection === 'asc' ? 'Növekvő' : 'Csökkenő'}
                        >
                            <ArrowUpDown className={`w-4 h-4 transition-transform ${sortDirection === 'asc' ? 'rotate-180' : ''}`} />
                        </button>

                        {/* View mode toggles */}
                        <div className="flex border border-border divide-x divide-border">
                            <button
                                onClick={() => setViewMode('grid')}
                                className={`p-2 transition-colors ${viewMode === 'grid' ? 'bg-foreground text-background' : 'hover:bg-foreground/10'}`}
                                title="Rács nézet"
                            >
                                <Grid3X3 className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setViewMode('list')}
                                className={`p-2 transition-colors ${viewMode === 'list' ? 'bg-foreground text-background' : 'hover:bg-foreground/10'}`}
                                title="Lista nézet"
                            >
                                <List className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </motion.section>

                {/* CONTENT */}
                <section className="min-h-[400px]">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-32">
                            <Loader2 className="w-8 h-8 animate-spin mb-4" />
                            <p className="font-mono text-sm opacity-50">Betöltés...</p>
                        </div>
                    ) : filteredFiles.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-32 border border-dashed border-border">
                            <FileImage className="w-12 h-12 opacity-20 mb-4" />
                            <p className="font-mono text-sm opacity-50">
                                {searchQuery ? 'Nincs találat a keresésre.' : 'Még nincsenek feltöltött fájlok.'}
                            </p>
                            {!searchQuery && (
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="mt-4 px-4 py-2 border border-border hover:border-foreground transition-colors font-mono text-xs"
                                >
                                    Első kép feltöltése
                                </button>
                            )}
                        </div>
                    ) : viewMode === 'grid' ? (
                        <motion.div
                            variants={containerVariants}
                            initial="hidden"
                            animate="visible"
                            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
                        >
                            {filteredFiles.map((file) => (
                                <MediaGridItem
                                    key={file.filename}
                                    file={file}
                                    isSelected={selectedFile?.filename === file.filename}
                                    isLoading={loadingFile === file.filename}
                                    onSelect={() => selectFile(file.filename)}
                                />
                            ))}
                        </motion.div>
                    ) : (
                        <div className="border border-border bg-background">
                            {/* List Header */}
                            <div className="grid grid-cols-[60px_1fr_100px_100px_100px] gap-4 p-3 border-b border-border bg-foreground/5 font-mono text-xs uppercase tracking-widest opacity-60">
                                <div>Előnézet</div>
                                <div>Fájlnév</div>
                                <div>Méret</div>
                                <div>Dimenziók</div>
                                <div className="text-right">Használat</div>
                            </div>
                            <motion.div
                                variants={containerVariants}
                                initial="hidden"
                                animate="visible"
                                className="divide-y divide-border"
                            >
                                {filteredFiles.map((file) => (
                                    <MediaListItem
                                        key={file.filename}
                                        file={file}
                                        isSelected={selectedFile?.filename === file.filename}
                                        isLoading={loadingFile === file.filename}
                                        onSelect={() => selectFile(file.filename)}
                                    />
                                ))}
                            </motion.div>
                        </div>
                    )}
                </section>
            </motion.div>

            {/* Detail Panel */}
            <AnimatePresence>
                {selectedFile && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={clearSelection}
                            className="fixed inset-0 bg-background/50 backdrop-blur-sm z-40"
                        />
                        <FileDetailPanel
                            file={selectedFile}
                            onClose={clearSelection}
                            onDelete={handleDelete}
                            deleting={deleting}
                        />
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}
