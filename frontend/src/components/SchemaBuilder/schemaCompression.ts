/**
 * Schema Compression Utilities
 * 
 * LZString-based compression for URL sharing of schema configurations.
 * Enables bookmark-friendly URLs for sharing schema builds.
 */

import LZString from 'lz-string';

/**
 * Compress a schema object to a URL-safe string
 */
export function compressSchemaToUrl(schema: object): string {
    const json = JSON.stringify(schema);
    const compressed = LZString.compressToEncodedURIComponent(json);
    return compressed;
}

/**
 * Decompress a URL-safe string back to a schema object
 */
export function decompressSchemaFromUrl(compressed: string): object | null {
    try {
        const json = LZString.decompressFromEncodedURIComponent(compressed);
        if (!json) return null;
        return JSON.parse(json);
    } catch {
        return null;
    }
}

/**
 * Generate a full shareable URL with compressed schema
 */
export function generateShareUrl(schema: object, baseUrl?: string): string {
    const compressed = compressSchemaToUrl(schema);
    const base = baseUrl || window.location.origin + window.location.pathname;
    return `${base}?s=${compressed}`;
}

/**
 * Extract and decompress schema from URL search params
 */
export function extractSchemaFromUrl(): object | null {
    const params = new URLSearchParams(window.location.search);
    const compressed = params.get('s');
    if (!compressed) return null;
    return decompressSchemaFromUrl(compressed);
}

/**
 * Get the estimated URL length for a schema
 */
export function getUrlLength(schema: object): number {
    const compressed = compressSchemaToUrl(schema);
    return compressed.length + 3; // +3 for "?s="
}

/**
 * Check if schema can fit in a safe URL length
 * Most browsers support ~2000-8000 characters
 */
export function isUrlSafe(schema: object, maxLength: number = 2000): boolean {
    return getUrlLength(schema) <= maxLength;
}
