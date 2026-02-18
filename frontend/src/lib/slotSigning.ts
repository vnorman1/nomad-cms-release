/**
 * Slot Config Signing - Nomad Request Signing
 * 
 * Generates HMAC-SHA256 signatures for slot configurations per-request.
 * Uses the user's JWT token as the signing key - no separate secret needed!
 * 
 * SECURITY: 
 * - The JWT token is already shared between frontend/backend
 * - Each request includes a fresh timestamp to prevent replay attacks
 * - Backend validates timestamp freshness and signature using the same JWT
 * - Token now retrieved from secureTokenStorage (memory-based, XSS safe)
 * 
 * Blind Indexing Support:
 * - searchableFields are also sent in headers for encrypted slots
 * - These define which fields have blind index tokens for search
 * 
 * Usage:
 * Import getSlotHeaders() and add to API requests
 */

import { ADMIN_CONFIG, type SlotConfig } from '@/config/admin.config';
import { secureTokenStorage } from '@/utils/secureTokenStorage';
import * as CryptoJS from 'crypto-js';

const SIGNATURE_VERSION = 'v2';

/**
 * Slot encryption config cache - stores encryption and searchable fields
 */
interface SlotEncryptionConfig {
    encrypted: boolean;
    searchableFields: string[];
}

const slotConfigCache: Map<string, SlotEncryptionConfig> = new Map();

/**
 * Get stored JWT token from secureTokenStorage (memory-based, XSS safe)
 * @security Uses memory-based storage instead of localStorage
 */
async function getStoredToken(): Promise<string | null> {
    try {
        return await secureTokenStorage.getAccessToken();
    } catch {
        return null;
    }
}

/**
 * Get current Unix timestamp in seconds (UTC)
 */
export function getCurrentTimestamp(): number {
    return Math.floor(Date.now() / 1000);
}

/**
 * Generate HMAC-SHA256 signature for a slot config with timestamp
 * Uses JWT token as the signing key
 * @security Now async to use secureTokenStorage
 */
async function generateSignature(slotKey: string, encrypted: boolean, timestamp: number): Promise<string> {
    const token = await getStoredToken();
    if (!token) {
        console.warn('[SlotSigning] No JWT token available');
        return '';
    }

    // Payload format matches backend: "slot:slotKey:encrypted:true:ts:1234567890:v2"
    const payload = `slot:${slotKey}:encrypted:${encrypted}:ts:${timestamp}:${SIGNATURE_VERSION}`;
    return CryptoJS.HmacSHA256(payload, token).toString(CryptoJS.enc.Hex);
}

/**
 * Initialize slot encryption configs
 */
function initializeSlotConfigs(): void {
    for (const [slotKey, config] of Object.entries(ADMIN_CONFIG) as [string, SlotConfig][]) {
        if (config.type === 'massive') {
            slotConfigCache.set(slotKey, {
                encrypted: config.massive?.encrypted ?? false,
                searchableFields: config.massive?.searchableFields ?? [],
            });
        }
    }

    console.log(`[SlotSigning] Initialized ${slotConfigCache.size} slot configs (using JWT for signing)`);
}

// Initialize on module load
initializeSlotConfigs();

/**
 * Get slot configuration with fresh signature and timestamp
 * @security Now async to use secure memory-based token storage
 */
export async function getSlotSignature(slotKey: string): Promise<{
    encrypted: boolean;
    searchableFields: string[];
    signature: string;
    timestamp: number;
} | null> {
    const config = slotConfigCache.get(slotKey);
    if (!config) {
        return null;
    }

    const timestamp = getCurrentTimestamp();
    const signature = await generateSignature(slotKey, config.encrypted, timestamp);

    return {
        encrypted: config.encrypted,
        searchableFields: config.searchableFields,
        signature,
        timestamp,
    };
}

/**
 * Get HTTP headers for a slot request
 * Call this and spread into request headers
 * NOTE: This generates a fresh signature with current timestamp for each call
 * @security Now async to use secure memory-based token storage
 */
export async function getSlotHeaders(slotKey: string): Promise<Record<string, string>> {
    const sig = await getSlotSignature(slotKey);

    if (!sig || !sig.signature) {
        return {};
    }

    const headers: Record<string, string> = {
        'X-Nomad-Slot-Encrypted': String(sig.encrypted),
        'X-Nomad-Slot-Signature': sig.signature,
        'X-Nomad-Slot-Timestamp': String(sig.timestamp),
    };

    // Add searchable fields header if present (for blind indexing)
    if (sig.searchableFields.length > 0) {
        headers['X-Nomad-Slot-Searchable-Fields'] = sig.searchableFields.join(',');
    }

    return headers;
}

/**
 * Check if a slot is configured as encrypted
 */
export function isSlotEncrypted(slotKey: string): boolean {
    const config = slotConfigCache.get(slotKey);
    return config?.encrypted ?? false;
}

/**
 * Check if slot signing is possible (has JWT token)
 * @security Now async to use secure memory-based token storage
 */
export async function isSigningConfigured(): Promise<boolean> {
    const token = await getStoredToken();
    return Boolean(token);
}

/**
 * Debug helper - get current signing state
 * @security Now async to use secure memory-based token storage
 */
export async function debugSigningState(slotKey: string): Promise<{
    configured: boolean;
    hasConfig: boolean;
    currentTimestamp: number;
    signaturePreview?: string;
}> {
    const config = slotConfigCache.get(slotKey);
    const timestamp = getCurrentTimestamp();
    const token = await getStoredToken();
    const hasToken = Boolean(token);

    let signaturePreview: string | undefined;
    if (config && hasToken) {
        const sig = await generateSignature(slotKey, config.encrypted, timestamp);
        signaturePreview = sig.substring(0, 16) + '...';
    }

    return {
        configured: hasToken,
        hasConfig: Boolean(config),
        currentTimestamp: timestamp,
        signaturePreview,
    };
}
