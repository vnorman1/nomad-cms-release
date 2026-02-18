/**
 * Media Library API Types & Functions
 * Handles media file operations and usage tracking
 */
import { apiClient } from './client';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface MediaUsage {
    slot: string;
    path: string;
    type: 'direct_reference' | 'embedded_in_text' | 'text_content';
    field?: string;
    context?: string;
}

export interface MediaFile {
    filename: string;
    url: string;
    size: number;
    sizeFormatted: string;
    mimeType: string;
    extension: string;
    width?: number;
    height?: number;
    createdAt: string;
    modifiedAt: string;
    usageCount: number;
    usages: MediaUsage[];
}

export interface MediaFileWithUsage extends MediaFile {
    usages: MediaUsage[];
    usageCount: number;
}

export interface MediaLibraryResponse {
    success: boolean;
    files: MediaFile[];
    total: number;
    totalSize: number;
    totalSizeFormatted: string;
    error?: string;
}

export interface MediaFileInfoResponse {
    success: boolean;
    file?: MediaFileWithUsage;
    error?: string;
}

export interface MediaDeleteResponse {
    success: boolean;
    message?: string;
    error?: string;
    usages?: MediaUsage[];
    usageCount?: number;
    deletedUsages?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// API FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get all media files from the server
 */
export async function getMediaLibrary(): Promise<MediaLibraryResponse> {
    try {
        const response = await apiClient.get<MediaLibraryResponse>('/endpoints/media.php');
        return response.data;
    } catch (error) {
        console.error('Error fetching media library:', error);
        throw error;
    }
}

/**
 * Get single media file info with usage locations
 */
export async function getMediaFileInfo(filename: string): Promise<MediaFileInfoResponse> {
    try {
        const response = await apiClient.get<MediaFileInfoResponse>(
            `/endpoints/media.php?file=${encodeURIComponent(filename)}`
        );
        return response.data;
    } catch (error) {
        console.error('Error fetching media file info:', error);
        throw error;
    }
}

/**
 * Delete a media file
 * @param filename The filename to delete
 * @param force Force delete even if file is in use
 */
export async function deleteMediaFile(filename: string, force: boolean = false): Promise<MediaDeleteResponse> {
    try {
        const url = `/endpoints/media.php?file=${encodeURIComponent(filename)}${force ? '&force=true' : ''}`;
        const response = await apiClient.delete<MediaDeleteResponse>(url);
        return response.data;
    } catch (error: any) {
        // Handle 400 response with usages info
        if (error?.response?.data) {
            return error.response.data;
        }
        console.error('Error deleting media file:', error);
        throw error;
    }
}
