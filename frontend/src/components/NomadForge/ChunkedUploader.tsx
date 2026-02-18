/**
 * ChunkedUploader - Chunked upload component with progress tracking
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
    Upload, Shield, CheckCircle, AlertCircle,
    Pause, Play, X, Clock, Zap, Lock
} from 'lucide-react';
import {
    fetchServerPublicKey,
    encryptJsonData,
    prepareChunkedUpload,
    uploadChunk,
    finalizeUpload,
} from './ForgeEncryption';

interface ChunkedUploaderProps {
    data: Record<string, unknown>[];
    targetSlot: string;
    onComplete: (recordCount: number) => void;
    onError: (error: string) => void;
    onCancel: () => void;
}

type UploadStage = 'handshake' | 'encrypting' | 'uploading' | 'finalizing' | 'complete' | 'error';

interface UploadProgress {
    stage: UploadStage;
    progress: number;
    chunksUploaded: number;
    totalChunks: number;
    bytesUploaded: number;
    totalBytes: number;
    startTime: number;
    error?: string;
}

export function ChunkedUploader({
    data,
    targetSlot,
    onComplete,
    onError,
    onCancel,
}: ChunkedUploaderProps) {
    const [uploadProgress, setUploadProgress] = useState<UploadProgress>({
        stage: 'handshake',
        progress: 0,
        chunksUploaded: 0,
        totalChunks: 0,
        bytesUploaded: 0,
        totalBytes: 0,
        startTime: Date.now(),
    });
    const [isPaused, setIsPaused] = useState(false);
    const abortControllerRef = useRef<AbortController | null>(null);

    const updateProgress = useCallback((updates: Partial<UploadProgress>) => {
        setUploadProgress(prev => ({ ...prev, ...updates }));
    }, []);

    const formatBytes = (bytes: number): string => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    const formatTime = (seconds: number): string => {
        if (seconds < 60) return `${Math.round(seconds)}s`;
        const mins = Math.floor(seconds / 60);
        const secs = Math.round(seconds % 60);
        return `${mins}m ${secs}s`;
    };

    const calculateETA = (): string => {
        const { bytesUploaded, totalBytes, startTime } = uploadProgress;
        if (bytesUploaded === 0) return '--';

        const elapsed = (Date.now() - startTime) / 1000;
        const speed = bytesUploaded / elapsed;
        const remaining = (totalBytes - bytesUploaded) / speed;

        return formatTime(remaining);
    };

    const calculateSpeed = (): string => {
        const { bytesUploaded, startTime } = uploadProgress;
        const elapsed = (Date.now() - startTime) / 1000;
        if (elapsed === 0) return '--';

        const speed = bytesUploaded / elapsed;
        return formatBytes(speed) + '/s';
    };

    const startUpload = useCallback(async () => {
        abortControllerRef.current = new AbortController();

        try {
            // Phase A: Handshake
            updateProgress({ stage: 'handshake', progress: 5 });
            const handshake = await fetchServerPublicKey();

            if (!handshake.success) {
                throw new Error(handshake.error || 'Handshake failed');
            }

            updateProgress({ progress: 10 });

            // Phase B: Encrypt
            updateProgress({ stage: 'encrypting', progress: 15 });
            const encryptedBase64 = await encryptJsonData(data, handshake.publicKey);
            const encryptedData = new TextEncoder().encode(encryptedBase64);

            updateProgress({
                progress: 30,
                totalBytes: encryptedData.length,
            });

            // Phase C: Chunk and Upload
            updateProgress({ stage: 'uploading' });
            const { chunks, metadata } = await prepareChunkedUpload(
                encryptedData,
                handshake.sessionId,
                512 * 1024 // 512KB chunks
            );

            updateProgress({ totalChunks: chunks.length });

            let bytesUploaded = 0;
            for (let i = 0; i < chunks.length; i++) {
                // Check for pause/cancel
                if (isPaused) {
                    await new Promise<void>(resolve => {
                        const checkPause = setInterval(() => {
                            if (!isPaused) {
                                clearInterval(checkPause);
                                resolve();
                            }
                        }, 100);
                    });
                }

                if (abortControllerRef.current?.signal.aborted) {
                    throw new Error('Upload cancelled');
                }

                const result = await uploadChunk(chunks[i], metadata[i]);

                if (!result.success) {
                    throw new Error(result.error || `Chunk ${i} upload failed`);
                }

                bytesUploaded += chunks[i].length;
                const chunkProgress = 30 + ((i + 1) / chunks.length) * 60;

                updateProgress({
                    chunksUploaded: i + 1,
                    bytesUploaded,
                    progress: chunkProgress,
                });
            }

            // Phase D: Finalize
            updateProgress({ stage: 'finalizing', progress: 92 });
            const finalResult = await finalizeUpload(
                handshake.sessionId,
                targetSlot,
                chunks.length
            );

            if (!finalResult.success) {
                throw new Error(finalResult.error || 'Finalize failed');
            }

            updateProgress({ stage: 'complete', progress: 100 });
            onComplete(finalResult.recordCount || data.length);

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Upload failed';
            updateProgress({ stage: 'error', error: errorMessage });
            onError(errorMessage);
        }
    }, [data, targetSlot, isPaused, updateProgress, onComplete, onError]);

    useEffect(() => {
        startUpload();

        return () => {
            abortControllerRef.current?.abort();
        };
    }, []);

    const handlePause = () => setIsPaused(!isPaused);

    const handleCancel = () => {
        abortControllerRef.current?.abort();
        onCancel();
    };

    const getStageIcon = (stage: UploadStage) => {
        switch (stage) {
            case 'handshake': return Lock;
            case 'encrypting': return Shield;
            case 'uploading': return Upload;
            case 'finalizing': return Zap;
            case 'complete': return CheckCircle;
            case 'error': return AlertCircle;
            default: return Clock;
        }
    };

    const getStageLabel = (stage: UploadStage) => {
        switch (stage) {
            case 'handshake': return 'Kapcsolat...';
            case 'encrypting': return 'Titkosítás...';
            case 'uploading': return 'Feltöltés...';
            case 'finalizing': return 'Véglegesítés...';
            case 'complete': return 'Kész!';
            case 'error': return 'Hiba!';
            default: return 'Feldolgozás...';
        }
    };

    const StageIcon = getStageIcon(uploadProgress.stage);
    const isUploading = uploadProgress.stage === 'uploading';

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="border border-border rounded-lg overflow-hidden"
        >
            {/* Header */}
            <div className="flex items-center justify-between p-4 bg-foreground/[0.02] border-b border-border">
                <div className="flex items-center gap-3">
                    <motion.div
                        animate={uploadProgress.stage === 'complete' ? {} : { rotate: 360 }}
                        transition={{ duration: 2, repeat: uploadProgress.stage === 'complete' ? 0 : Infinity, ease: 'linear' }}
                        className={`
                            w-10 h-10 rounded-lg flex items-center justify-center
                            ${uploadProgress.stage === 'complete' ? 'bg-emerald-500/20' :
                                uploadProgress.stage === 'error' ? 'bg-red-500/20' : 'bg-foreground/10'}
                        `}
                    >
                        <StageIcon
                            size={20}
                            className={
                                uploadProgress.stage === 'complete' ? 'text-emerald-500' :
                                    uploadProgress.stage === 'error' ? 'text-red-500' : ''
                            }
                        />
                    </motion.div>
                    <div>
                        <div className="font-mono text-sm font-medium">
                            {getStageLabel(uploadProgress.stage)}
                        </div>
                        {isUploading && (
                            <div className="text-xs opacity-50">
                                {uploadProgress.chunksUploaded}/{uploadProgress.totalChunks} chunk
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {isUploading && (
                        <button
                            onClick={handlePause}
                            className="p-2 hover:bg-foreground/10 rounded transition-colors"
                        >
                            {isPaused ? <Play size={16} /> : <Pause size={16} />}
                        </button>
                    )}
                    <button
                        onClick={handleCancel}
                        className="p-2 hover:bg-foreground/10 rounded transition-colors text-red-500"
                    >
                        <X size={16} />
                    </button>
                </div>
            </div>

            {/* Progress Bar */}
            <div className="p-4">
                <div className="flex justify-between text-xs opacity-50 mb-2">
                    <span>{Math.round(uploadProgress.progress)}%</span>
                    {isUploading && (
                        <span>
                            {formatBytes(uploadProgress.bytesUploaded)} / {formatBytes(uploadProgress.totalBytes)}
                        </span>
                    )}
                </div>

                <div className="h-2 bg-border rounded-full overflow-hidden">
                    <motion.div
                        className="h-full"
                        style={{
                            backgroundColor: uploadProgress.stage === 'complete'
                                ? '#10b981' // emerald-500
                                : uploadProgress.stage === 'error'
                                    ? '#ef4444' // red-500 
                                    : 'currentColor'
                        }}
                        initial={{ width: 0 }}
                        animate={{ width: `${uploadProgress.progress}%` }}
                        transition={{ ease: 'easeOut', duration: 0.3 }}
                    />
                </div>

                {/* Stats */}
                {isUploading && (
                    <div className="flex items-center justify-between mt-4 text-xs">
                        <div className="flex items-center gap-1 opacity-50">
                            <Zap size={10} />
                            {calculateSpeed()}
                        </div>
                        <div className="flex items-center gap-1 opacity-50">
                            <Clock size={10} />
                            ETA: {calculateETA()}
                        </div>
                    </div>
                )}

                {/* Error */}
                {uploadProgress.error && (
                    <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-500">
                        {uploadProgress.error}
                    </div>
                )}
            </div>
        </motion.div>
    );
}
