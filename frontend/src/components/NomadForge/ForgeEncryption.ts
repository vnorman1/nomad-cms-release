/**
 * ForgeEncryption - Application-Layer Encryption Service
 * Uses tweetnacl for client-side crypto_box_seal encryption
 * Fully browser-compatible (no Node.js dependencies)
 */

import nacl from 'tweetnacl';
// @ts-expect-error - tweetnacl-sealedbox-js doesn't have types
import sealedbox from 'tweetnacl-sealedbox-js';
import { secureTokenStorage } from '@/utils/secureTokenStorage';

/**
 * Get JWT token from secure memory storage
 * @security Uses secureTokenStorage instead of localStorage to prevent XSS token theft
 */
async function getAuthToken(): Promise<string | null> {
    return await secureTokenStorage.getAccessToken();
}

/**
 * Get auth headers for fetch requests
 * @security Async to support secure memory-based token storage
 */
async function getAuthHeaders(): Promise<HeadersInit> {
    const token = await getAuthToken();
    const headers: HeadersInit = {
        'Content-Type': 'application/json',
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
}

/**
 * Server public key response from handshake
 */
export interface HandshakeResponse {
    success: boolean;
    publicKey: string; // Base64 encoded X25519 public key
    sessionId: string; // Session identifier for this upload
    error?: string;
}

/**
 * Encrypted payload structure
 */
export interface EncryptedPayload {
    sessionId: string;
    ciphertext: string; // Base64 encoded sealed box
    nonce?: string;     // If using crypto_box (not sealed)
}

/**
 * Chunk metadata for chunked upload
 */
export interface ChunkMetadata {
    sessionId: string;
    chunkIndex: number;
    totalChunks: number;
    chunkHash: string; // SHA-256 hash for integrity
    totalSize: number;
}

/**
 * Fetch server's public key for encryption
 */
export async function fetchServerPublicKey(): Promise<HandshakeResponse> {
    try {
        const response = await fetch('/api/endpoints/forge/handshake.php', {
            method: 'GET',
            credentials: 'include',
            headers: await getAuthHeaders(),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Handshake failed: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        return {
            success: false,
            publicKey: '',
            sessionId: '',
            error: error instanceof Error ? error.message : 'Handshake failed',
        };
    }
}

/**
 * Encrypt data using crypto_box_seal (anonymous encryption)
 * Only the server can decrypt with its private key
 */
export function sealData(
    data: Uint8Array | string,
    serverPublicKeyBase64: string
): Uint8Array {
    // Convert base64 public key to Uint8Array
    const publicKeyBytes = base64ToUint8Array(serverPublicKeyBase64);

    // Convert data to Uint8Array if string
    const plaintext = typeof data === 'string'
        ? new TextEncoder().encode(data)
        : data;

    // Seal the data using tweetnacl-sealedbox
    const ciphertext = sealedbox.seal(plaintext, publicKeyBytes);

    return ciphertext;
}

/**
 * Encrypt JSON data and return base64 encoded result
 */
export function encryptJsonData(
    data: Record<string, unknown>[],
    serverPublicKeyBase64: string
): string {
    const jsonString = JSON.stringify(data);
    const sealed = sealData(jsonString, serverPublicKeyBase64);
    return uint8ArrayToBase64(sealed);
}

/**
 * Calculate hash of data for integrity verification using Web Crypto API
 */
export async function hashData(data: Uint8Array): Promise<string> {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);
    return uint8ArrayToBase64(new Uint8Array(hashBuffer));
}

/**
 * Split encrypted data into chunks
 */
export function chunkData(
    data: Uint8Array,
    chunkSize: number = 1024 * 1024 // 1MB default
): Uint8Array[] {
    const chunks: Uint8Array[] = [];
    let offset = 0;

    while (offset < data.length) {
        const end = Math.min(offset + chunkSize, data.length);
        chunks.push(data.slice(offset, end));
        offset = end;
    }

    return chunks;
}

/**
 * Prepare chunked upload with metadata
 */
export async function prepareChunkedUpload(
    data: Uint8Array,
    sessionId: string,
    chunkSize: number = 1024 * 1024
): Promise<{ chunks: Uint8Array[]; metadata: ChunkMetadata[] }> {
    const chunks = chunkData(data, chunkSize);
    const metadata: ChunkMetadata[] = [];

    for (let i = 0; i < chunks.length; i++) {
        const chunkHash = await hashData(chunks[i]);
        metadata.push({
            sessionId,
            chunkIndex: i,
            totalChunks: chunks.length,
            chunkHash,
            totalSize: data.length,
        });
    }

    return { chunks, metadata };
}

/**
 * Upload a single chunk
 */
export async function uploadChunk(
    chunk: Uint8Array,
    metadata: ChunkMetadata
): Promise<{ success: boolean; error?: string }> {
    try {
        const formData = new FormData();
        formData.append('chunk', new Blob([new Uint8Array(chunk)]));
        formData.append('metadata', JSON.stringify(metadata));

        const token = await getAuthToken();
        const headers: HeadersInit = {};
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch('/api/endpoints/forge/upload-chunk.php', {
            method: 'POST',
            credentials: 'include',
            headers,
            body: formData,
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            return { success: false, error: error.error || error.message || 'Upload failed' };
        }

        return { success: true };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Chunk upload failed',
        };
    }
}

/**
 * Finalize chunked upload - tell server all chunks are uploaded
 * @param sessionId - Session identifier from handshake
 * @param targetSlot - Target slot to import data to
 * @param totalChunks - Total number of chunks uploaded
 * @param imageSourceDir - Optional local directory path to search for images
 * @param imageBaseUrl - Optional base URL prefix for relative image paths
 */
export async function finalizeUpload(
    sessionId: string,
    targetSlot: string,
    totalChunks: number,
    imageSourceDir?: string,
    imageBaseUrl?: string
): Promise<{ success: boolean; recordCount?: number; error?: string }> {
    try {
        const response = await fetch('/api/endpoints/forge/finalize.php', {
            method: 'POST',
            credentials: 'include',
            headers: await getAuthHeaders(),
            body: JSON.stringify({
                sessionId,
                targetSlot,
                totalChunks,
                ...(imageSourceDir && { imageSourceDir }),
                ...(imageBaseUrl && { imageBaseUrl }),
            }),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            return { success: false, error: error.error || error.message || 'Finalize failed' };
        }

        const result = await response.json();
        return { success: true, recordCount: result.recordCount };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Finalize failed',
        };
    }
}

// ============ Utility Functions ============

function base64ToUint8Array(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

// ============ Queue Processing ============

/**
 * Process queued images after Forge import
 * Calls the backend queue processor to download remote images
 * 
 * @param jobId - The Forge session ID used for tracking
 * @param limit - Max images to process in this call
 */
export async function processImageQueue(
    jobId: string,
    limit: number = 20
): Promise<{ processed: number; failed: number; remaining: number }> {
    try {
        const response = await fetch('/api/endpoints/system/queue-process.php', {
            method: 'POST',
            credentials: 'include',
            headers: await getAuthHeaders(),
            body: JSON.stringify({ jobId, limit }),
        });

        if (!response.ok) {
            throw new Error(`Queue processing failed: ${response.status}`);
        }

        const result = await response.json();
        console.log('[ForgeEncryption] Queue processed:', result);
        return {
            processed: result.processed ?? 0,
            failed: result.failed ?? 0,
            remaining: result.remaining ?? 0,
        };
    } catch (error) {
        console.error('[ForgeEncryption] Queue processing error:', error);
        return { processed: 0, failed: 0, remaining: -1 };
    }
}

// ============ NomadEntropy Integration ============

import { NomadEntropy } from '../../utils/nomad-entropy';

let entropyCollector: NomadEntropy | null = null;

/**
 * Initialize NomadEntropy collection for enhanced randomness
 * Call this when Forge UI loads
 */
export async function initEntropyCollection(): Promise<void> {
    if (entropyCollector) return;
    entropyCollector = new NomadEntropy();
    await entropyCollector.startCollecting();
    console.log('[ForgeEncryption] NomadEntropy collector initialized');
}

/**
 * Get high-quality entropy bytes
 * Falls back to crypto.getRandomValues if WASM not available
 */
export function getEntropyBytes(length: number): Uint8Array {
    if (entropyCollector && entropyCollector.getSampleCount() > 0) {
        return entropyCollector.getBytes(length);
    }
    // Fallback to browser crypto
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return bytes;
}

/**
 * Cleanup entropy collector
 */
export function destroyEntropyCollector(): void {
    if (entropyCollector) {
        entropyCollector.destroy();
        entropyCollector = null;
    }
}

// ============ Local Folder Image Upload ============

/**
 * Upload images from a local folder (File System Access API)
 * Reads files from the selected directory handle and uploads them to the server
 * 
 * @param folderHandle - FileSystemDirectoryHandle from window.showDirectoryPicker()
 * @param imageNames - Array of image filenames to upload (from the CSV data)
 * @param targetSlot - Target slot for the images
 * @param onProgress - Progress callback (0-100)
 * @returns Object with uploaded files info and any errors
 */
export async function uploadImagesFromLocalFolder(
    folderHandle: FileSystemDirectoryHandle,
    imageNames: string[],
    targetSlot: string,
    onProgress?: (progress: number, status: string) => void
): Promise<{ 
    success: boolean; 
    uploaded: number; 
    failed: number;
    mapping: Record<string, string>; // originalName -> uploadedPath
    errors: string[] 
}> {
    const result = {
        success: false,
        uploaded: 0,
        failed: 0,
        mapping: {} as Record<string, string>,
        errors: [] as string[],
    };

    if (imageNames.length === 0) {
        result.success = true;
        return result;
    }

    // Filter out null/empty values and extract just filenames for searching
    const uniqueNames = [...new Set(imageNames.filter(n => n && n.trim() && n !== 'null'))];
    const total = uniqueNames.length;
    let processed = 0;

    for (const imagePath of uniqueNames) {
        try {
            // Extract just the filename from the path (handles both / and \ separators)
            const fileName = imagePath.split(/[/\\]/).pop() || imagePath;
            
            onProgress?.(Math.round((processed / total) * 100), `Feltöltés: ${fileName}`);

            // Try to find the file in the folder (and subdirectories) using just the filename
            const file = await findFileInDirectory(folderHandle, fileName);
            
            if (!file) {
                result.errors.push(`Nem található: ${fileName}`);
                result.failed++;
                processed++;
                continue;
            }

            // Upload the file
            const uploadResult = await uploadSingleFile(file, targetSlot);
            
            if (uploadResult.success && uploadResult.path) {
                // Store mapping with BOTH the original path AND just the filename as keys
                // This allows lookup by either format
                result.mapping[imagePath] = uploadResult.path;  // Full path key
                result.mapping[fileName] = uploadResult.path;   // Filename-only key
                result.uploaded++;
            } else {
                result.errors.push(`Feltöltés sikertelen: ${fileName} - ${uploadResult.error}`);
                result.failed++;
            }
        } catch (err) {
            const fileName = imagePath.split(/[/\\]/).pop() || imagePath;
            result.errors.push(`Hiba: ${fileName} - ${err instanceof Error ? err.message : 'Ismeretlen hiba'}`);
            result.failed++;
        }
        processed++;
    }

    onProgress?.(100, 'Feltöltés kész');
    result.success = result.failed === 0 || result.uploaded > 0;
    return result;
}

/**
 * Find a file directly in the selected folder (no recursive search needed)
 * User selects the folder containing the images, so files are directly there
 */
async function findFileInDirectory(
    dirHandle: FileSystemDirectoryHandle, 
    fileName: string
): Promise<File | null> {
    try {
        // Direct lookup - file should be directly in the selected folder
        const fileHandle = await dirHandle.getFileHandle(fileName);
        return await fileHandle.getFile();
    } catch {
        // File not found in this directory
        return null;
    }
}

/**
 * Upload a single image file to the server
 * Uses the /api/endpoints/upload.php endpoint which handles image processing
 */
async function uploadSingleFile(
    file: File, 
    _targetSlot: string
): Promise<{ success: boolean; path?: string; error?: string }> {
    try {
        const formData = new FormData();
        // IMPORTANT: The upload.php expects 'image' not 'file'
        formData.append('image', file);

        const token = await getAuthToken();
        const headers: HeadersInit = {};
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        // Use the image upload endpoint, not file-upload
        const response = await fetch('/api/endpoints/upload.php', {
            method: 'POST',
            credentials: 'include',
            headers,
            body: formData,
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            return { success: false, error: error.error || `HTTP ${response.status}` };
        }

        const result = await response.json();
        return { 
            success: true, 
            // upload.php returns 'url' not 'path'
            path: result.url || result.path || result.filename 
        };
    } catch (error) {
        return { 
            success: false, 
            error: error instanceof Error ? error.message : 'Upload failed' 
        };
    }
}

// Export nacl for potential debugging
export { nacl };