
import init, { decrypt_backup } from '../wasm-lib/backup-viewer/performance_backup_viewer_rust.js';
import JSZip from 'jszip';

export interface DecryptionResult {
    files: { [filename: string]: Blob };
    metadata: {
        keyLength: number; // WASM implementation handles this internally, UI might need dummy or updated logic
    };
}

let wasmInitialized = false;

export const initWasm = async () => {
    if (!wasmInitialized) {
        await init();
        wasmInitialized = true;
    }
};

/**
 * Decrypts a .nomad backup file using the High-Performance Rust WASM module.
 */
export const decryptBackup = async (
    fileBuffer: ArrayBuffer,
    privateKeyPem: string
): Promise<DecryptionResult> => {
    await initWasm();

    try {
        // Rust expects Uint8Array for the file data
        const fileBytes = new Uint8Array(fileBuffer);

        // Performance critical section: Calls into Rust WASM
        const zipBytes = decrypt_backup(fileBytes, privateKeyPem);

        // Data is back in JS land as Uint8Array. Parse as ZIP.
        const resultFiles: { [filename: string]: Blob } = {};
        const zip = await JSZip.loadAsync(zipBytes);

        for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
            if (!zipEntry.dir) {
                const content = await zipEntry.async('blob');
                resultFiles[relativePath] = content;
            }
        }

        return {
            files: resultFiles,
            metadata: {
                keyLength: 256 // Dummy value as WASM encapsulates the header parsing now. 
                // If exact key length is needed for UI, we'd need to expose it from Rust.
            }
        };
    } catch (e: any) {
        console.error("WASM Decryption Error:", e);
        // Throw a user-friendly error string
        throw new Error(typeof e === 'string' ? e : "Decryption failed in WASM module.");
    }
};
