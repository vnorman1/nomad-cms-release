/**
 * Shared Type Definitions
 * Re-exports from config and API for convenience
 */

// Re-export config types
// Using relative paths to avoid resolution issues
import type { FieldType, FieldConfig, SlotConfig } from '../config/admin.config';
export type { FieldType, FieldConfig, SlotConfig };

// Re-export API types  
import type { ApiResponse, SlotKey, UploadResponse, DeleteResponse } from '../api/types';
export type { ApiResponse, SlotKey, UploadResponse, DeleteResponse };
