/**
 * API Module - Central Export
 * Re-exports all API functions for easy importing
 */

// Client
export { apiClient, API_BASE } from './client';

// Types
export type { ApiResponse, SlotKey, UploadResponse, DeleteResponse } from './types';
export type * from './auth.types';

// Data Operations
export {
    getData,
    getDataWithLockInfo,
    saveData,
    deleteData,
    getAllKeys,
    getBatchData,
    ConflictError
} from './data';
export type { DataWithLockInfo, SaveResult, PrecomputedVersionData } from './data';

// Upload Operations
export { uploadImage, deleteImage, uploadVideo, VideoResolutionError, uploadAudio, AudioDurationError, deleteMedia } from './upload';
export type { VideoUploadResponse, AudioUploadResponse } from './upload';

// Media Library Operations
export * from './media';

// Auth Operations
export * from './auth';

// Massive Data Operations
export * from './massive';
export type {
    MassiveRecord,
    MassivePaginatedResponse,
    MassiveStats,
    MassiveListParams,
} from './massive';

// Updates (AI Models, Changelog, Announcements)
export * from './updates';
export type {
    AIModel,
    AIProvider,
    AIModelsResponse,
    ChangelogEntry,
    Announcement,
} from './updates';