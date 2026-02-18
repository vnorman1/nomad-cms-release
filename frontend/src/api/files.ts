/**
 * NOMAD CMS - File Upload/Download Operations
 * Handles document uploads (PDF, DOCX, etc.) with optional AES-256 encryption
 */
import { apiClient } from './client';

// File upload response type
export interface FileUploadResponse {
    success: boolean;
    file?: {
        filename: string;
        url: string;
        prettyUrl?: string;  // Pretty URL like /pdf/{hash}/{name}.pdf
        size: number;
        originalName: string;
        encrypted: boolean;
    };
    error?: string;
}

// File delete response type
export interface FileDeleteResponse {
    success: boolean;
    message?: string;
    error?: string;
}

// File configuration for validation
export interface FileConfig {
    allowedTypes?: string[];
    maxSizeMB?: number;
    secure?: boolean;
}

/**
 * Upload a file (document)
 * @param file The file to upload
 * @param config Optional file configuration
 */
export async function uploadFile(
    file: File,
    config?: FileConfig
): Promise<FileUploadResponse> {
    try {
        const formData = new FormData();
        formData.append('file', file);

        // Add configuration to request
        if (config?.secure) {
            formData.append('secure', 'true');
        }
        if (config?.allowedTypes?.length) {
            formData.append('allowedTypes', JSON.stringify(config.allowedTypes));
        }
        if (config?.maxSizeMB) {
            formData.append('maxSizeMB', config.maxSizeMB.toString());
        }

        const response = await apiClient.post<FileUploadResponse>(
            '/endpoints/file-upload.php',
            formData,
            {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            }
        );

        // Check for server-side errors in response
        if (!response.data.success) {
            const errorMsg = response.data.error || 'Ismeretlen hiba történt a feltöltés során';
            throw new Error(errorMsg);
        }

        return response.data;
    } catch (error: unknown) {
        console.error('Error uploading file:', error);

        // Extract meaningful error message
        let errorMessage = 'Fájl feltöltési hiba';

        if (error instanceof Error) {
            errorMessage = error.message;
        }

        // Check for axios response errors
        if (typeof error === 'object' && error !== null && 'response' in error) {
            const axiosError = error as { response?: { data?: { error?: string } } };
            if (axiosError.response?.data?.error) {
                errorMessage = axiosError.response.data.error;
            }
        }

        // Translate common PHP errors to Hungarian
        const errorTranslations: Record<string, string> = {
            'File exceeds upload_max_filesize': 'A fájl túl nagy! Kérjük növeld a PHP_UPLOAD_MAX_FILESIZE értékét a .env fájlban.',
            'File exceeds MAX_FILE_SIZE': 'A fájl meghaladja a maximális méretet.',
            'File was only partially uploaded': 'A fájl csak részben töltődött fel. Próbáld újra.',
            'No file was uploaded': 'Nem lett fájl kiválasztva.',
            'Missing temporary folder': 'PHP szerver hiba: hiányzó temp mappa.',
            'Failed to write file to disk': 'Nincs írási jogosultság a szerveren.',
            'File upload stopped by extension': 'A fájl kiterjesztés nem engedélyezett.',
        };

        for (const [key, translation] of Object.entries(errorTranslations)) {
            if (errorMessage.includes(key)) {
                errorMessage = translation;
                break;
            }
        }

        throw new Error(errorMessage);
    }
}

/**
 * Delete a file from the server
 * @param url The URL of the file to delete
 */
export async function deleteFile(url: string): Promise<FileDeleteResponse> {
    try {
        // Only delete if it's a managed file
        if (!url || (!url.startsWith('/api/files/public/') && !url.startsWith('/api/files/secure/'))) {
            return { success: true }; // Not a managed file, skip silently
        }

        const response = await apiClient.post<FileDeleteResponse>(
            '/endpoints/file-download.php',
            { url }
        );

        return response.data;
    } catch (error) {
        console.error('Error deleting file:', error);
        return { success: false };
    }
}

/**
 * Get download URL for a file
 * Stateless: extracts filename from any URL format, uses f.php?f={filename}
 * @param url The file URL (prettyUrl, legacy url, or direct path)
 */
export async function getDownloadUrl(url: string): Promise<string> {
    // Extract just the filename (basename) from the URL
    let filename = url;

    // Remove /api/files/public/ prefix
    if (filename.includes('/api/files/public/')) {
        filename = filename.split('/api/files/public/').pop() || filename;
    }
    // Remove /api/files/secure/ prefix  
    else if (filename.includes('/api/files/secure/')) {
        filename = filename.split('/api/files/secure/').pop() || filename;
    }
    // Pretty URL format: /{ext}/{filename} or /secure-{ext}/{filename}
    else if (filename.match(/^\/(secure-)?[a-z]+\/.+/)) {
        // Get just the last part (filename)
        const parts = filename.split('/');
        filename = parts[parts.length - 1];
    }

    // Check if it's a secure file (starts with secure- or came from /api/files/secure/)
    const isSecure = url.includes('/secure-') || url.includes('/api/files/secure/');

    if (isSecure) {
        // Secure files need signed params
        try {
            const response = await apiClient.get<{ success: boolean; url?: string; error?: string }>(
                `/endpoints/get-signed-url.php?file=${encodeURIComponent(filename)}`
            );
            if (response.data.success && response.data.url) {
                const signedUrl = response.data.url;
                const params = signedUrl.split('?')[1] || '';
                return `/api/f/?f=${encodeURIComponent(filename)}&${params}`;
            }
        } catch (e) {
            console.error('Failed to get signed URL:', e);
        }
    }

    // Public file - direct access via /api/f/
    return `/api/f/?f=${encodeURIComponent(filename)}`;
}

/**
 * Validate file on client side before upload
 * @param file The file to validate
 * @param config File configuration
 */
export function validateFileClient(
    file: File,
    config?: FileConfig
): { valid: boolean; error?: string } {
    const maxSizeMB = config?.maxSizeMB ?? 25;
    const maxBytes = maxSizeMB * 1024 * 1024;

    // Check size
    if (file.size > maxBytes) {
        return { valid: false, error: `A fájl mérete nem lehet nagyobb ${maxSizeMB}MB-nál.` };
    }

    // Check extension if allowedTypes specified
    if (config?.allowedTypes?.length) {
        const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
        const fileMimeType = file.type?.toLowerCase() ?? '';

        // MIME to extension mapping for common types
        const mimeToExt: Record<string, string> = {
            // Documents
            'application/pdf': 'pdf',
            'application/msword': 'doc',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
            'application/vnd.ms-excel': 'xls',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
            'text/plain': 'txt',
            'application/zip': 'zip',
            'text/csv': 'csv',
            // Images
            'image/jpeg': 'jpg',
            'image/png': 'png',
            'image/gif': 'gif',
            'image/webp': 'webp',
            // 3D Models
            'model/gltf-binary': 'glb',
            'model/gltf+json': 'gltf',
            'model/obj': 'obj',
            'model/stl': 'stl',
            'model/vnd.usdz+zip': 'usdz',
            // Fonts
            'font/woff': 'woff',
            'font/woff2': 'woff2',
            'font/ttf': 'ttf',
            'font/otf': 'otf',
            // Data
            'application/json': 'json',
            'application/xml': 'xml',
            // Archives
            'application/vnd.rar': 'rar',
            'application/x-7z-compressed': '7z',
            'application/x-tar': 'tar',
            'application/gzip': 'gz',
            // Generic binary (for 3D models etc.)
            'application/octet-stream': 'bin',
        };

        // Normalize allowedTypes: convert MIME types to extensions
        const normalizedTypes = config.allowedTypes.map(type => {
            const lowerType = type.toLowerCase();
            // If it looks like a MIME type, try to convert it
            if (lowerType.includes('/')) {
                return mimeToExt[lowerType] || lowerType.split('/').pop() || lowerType;
            }
            // Already an extension
            return lowerType;
        });

        // Check if extension OR MIME matches
        const isValidExtension = normalizedTypes.includes(extension);
        const isValidMime = config.allowedTypes.some(type =>
            type.toLowerCase() === fileMimeType ||
            mimeToExt[type.toLowerCase()] === extension
        );

        if (!isValidExtension && !isValidMime) {
            // Show user-friendly extension list
            const displayTypes = [...new Set(normalizedTypes)].map(t => t.toUpperCase()).join(', ');
            return {
                valid: false,
                error: `Csak ${displayTypes} fájlokat lehet feltölteni.`
            };
        }
    }

    return { valid: true };
}

/**
 * Format file size for display
 * @param bytes Size in bytes
 */
export function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Get file icon based on extension
 * @param filename The filename
 */
export function getFileIcon(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() ?? '';

    const iconMap: Record<string, string> = {
        'pdf': 'PDF',
        'doc': 'DOC',
        'docx': 'DOC',
        'xls': 'XLS',
        'xlsx': 'XLS',
        'txt': 'TXT',
        'zip': 'ZIP',
        'csv': 'CSV',
    };

    return iconMap[ext] || 'FILE';
}
