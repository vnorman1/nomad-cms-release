/**
 * Image/Video Upload/Delete Operations
 */
import { apiClient } from './client';
import type { UploadResponse, DeleteResponse } from './types';

/**
 * Upload an image file
 * Automatically converts to WebP and resizes to max 1200px
 */
export async function uploadImage(file: File): Promise<UploadResponse> {
    try {
        const formData = new FormData();
        formData.append('image', file);

        const response = await apiClient.post<UploadResponse>(
            '/endpoints/upload.php',
            formData,
            {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            }
        );

        return response.data;
    } catch (error) {
        console.error('Error uploading image:', error);
        throw error;
    }
}

/**
 * Delete an uploaded image from the server
 * @param url The URL of the image to delete (e.g., /api/uploads/image.webp)
 */
export async function deleteImage(url: string): Promise<DeleteResponse> {
    try {
        // Only delete if it's an uploaded image (not external URLs)
        if (!url || !url.startsWith('/api/uploads/')) {
            return { success: true }; // Not a managed upload, skip silently
        }

        const response = await apiClient.post<DeleteResponse>(
            '/endpoints/delete.php',
            { url }
        );

        return response.data;
    } catch (error) {
        console.error('Error deleting image:', error);
        // Don't throw - deletion failure shouldn't block new upload
        return { success: false };
    }
}

/**
 * Video upload response type
 */
export interface VideoUploadResponse extends UploadResponse {
    converted?: boolean;
    warning?: string;
    resolution?: string;
    max_resolution?: string;
    message?: string;
}

/**
 * Video resolution error class
 */
export class VideoResolutionError extends Error {
    resolution: string;
    maxResolution: string;

    constructor(resolution: string, maxResolution: string, message: string) {
        super(message);
        this.name = 'VideoResolutionError';
        this.resolution = resolution;
        this.maxResolution = maxResolution;
    }
}

/**
 * Upload a video file
 * If FFmpeg available: converts to WebM
 * If FFmpeg not available: saves original format
 * Max resolution: 8K (7680x4320)
 * Max duration: 12 hours
 */
export async function uploadVideo(file: File): Promise<VideoUploadResponse> {
    try {
        const formData = new FormData();
        formData.append('video', file);

        const response = await apiClient.post<VideoUploadResponse>(
            '/endpoints/video-upload.php',
            formData,
            {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
                // Video uploads may take longer due to possible conversion
                timeout: 600000, // 10 minutes timeout for long videos
            }
        );

        return response.data;
    } catch (error: any) {
        // Check for resolution error from API
        if (error?.response?.data?.error === 'resolution_too_high') {
            const data = error.response.data;
            throw new VideoResolutionError(
                data.resolution || 'unknown',
                data.max_resolution || '7680x4320',
                data.message || 'A videó felbontása túl nagy.'
            );
        }

        console.error('Error uploading video:', error);
        throw error;
    }
}

/**
 * Audio upload response interface
 */
export interface AudioUploadResponse extends UploadResponse {
    converted?: boolean;
    warning?: string;
    duration?: number;
    format?: string;
}

/**
 * Audio duration error class
 */
export class AudioDurationError extends Error {
    duration: number;
    maxDuration: number;

    constructor(duration: number, maxDuration: number, message: string) {
        super(message);
        this.name = 'AudioDurationError';
        this.duration = duration;
        this.maxDuration = maxDuration;
    }
}

/**
 * Upload an audio file
 * If FFmpeg available: converts to MP3
 * If FFmpeg not available: saves original format
 * Max duration: 4 hours
 * Max size: 100MB
 */
export async function uploadAudio(file: File): Promise<AudioUploadResponse> {
    try {
        const formData = new FormData();
        formData.append('audio', file);

        const response = await apiClient.post<AudioUploadResponse>(
            '/endpoints/audio-upload.php',
            formData,
            {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
                // Audio uploads may take longer due to possible conversion
                timeout: 300000, // 5 minutes timeout for long audio files
            }
        );

        return response.data;
    } catch (error: any) {
        // Check for duration error from API
        if (error?.response?.data?.error === 'duration_too_long') {
            const data = error.response.data;
            throw new AudioDurationError(
                data.duration || 0,
                data.max_duration || 14400,
                data.message || 'Az audió túl hosszú.'
            );
        }

        console.error('Error uploading audio:', error);
        throw error;
    }
}

/**
 * Delete any media file (video, audio) from the server
 * Uses the media.php DELETE endpoint
 * @param url The URL of the file to delete (e.g., /api/uploads/video.mp4)
 * @param force Force delete even if file is in use (default: true, since frontend already confirms)
 */
export async function deleteMedia(url: string, force: boolean = true): Promise<DeleteResponse> {
    try {
        // Only delete if it's a managed upload (not external URLs)
        if (!url || !url.startsWith('/api/uploads/')) {
            return { success: true }; // Not a managed upload, skip silently
        }

        const filename = url.split('/').pop();
        if (!filename) {
            return { success: false };
        }

        // force=true because frontend already asked for confirmation
        const response = await apiClient.delete<DeleteResponse>(
            `/endpoints/media.php?file=${encodeURIComponent(filename)}${force ? '&force=true' : ''}`
        );

        return response.data;
    } catch (error) {
        console.error('Error deleting media:', error);
        // Don't throw - deletion failure shouldn't block new upload
        return { success: false };
    }
}
