/**
 * NomadEntropy - High-Security Entropy Generator
 * 
 * Collects hardware-level noise (mouse, keyboard, timing) and processes
 * it through Rust WASM using ChaCha20 mixing and SHA-3 extraction.
 */

import init, {
    init_entropy_pool,
    feed_mouse_entropy,
    feed_keyboard_entropy,
    feed_timing_entropy,
    get_sample_count,
    extract_entropy,
    destroy_entropy_pool
} from '../wasm-lib/nomad-entropy/nomad_entropy_rust.js';

let wasmInitialized = false;
let initPromise: Promise<void> | null = null;

/**
 * Initialize WASM module (singleton)
 */
async function initWasm(): Promise<void> {
    if (wasmInitialized) return;
    if (initPromise) return initPromise;

    initPromise = (async () => {
        await init();
        wasmInitialized = true;
    })();

    return initPromise;
}

/**
 * High-security entropy collector
 */
export class NomadEntropy {
    private collecting = false;
    private lastKeyTime = 0;
    private frameId: number | null = null;

    // Bound handlers for cleanup
    private handleMouseMove: (e: MouseEvent) => void;
    private handleKeyDown: (e: KeyboardEvent) => void;
    private handleFrame: () => void;

    constructor() {
        // Bind handlers
        this.handleMouseMove = this.onMouseMove.bind(this);
        this.handleKeyDown = this.onKeyDown.bind(this);
        this.handleFrame = this.onFrame.bind(this);
    }

    /**
     * Initialize and start collecting entropy
     */
    async startCollecting(): Promise<void> {
        if (this.collecting) return;

        await initWasm();
        init_entropy_pool();
        this.collecting = true;

        // Attach event listeners
        document.addEventListener('mousemove', this.handleMouseMove, { passive: true });
        document.addEventListener('keydown', this.handleKeyDown, { passive: true });

        // Start timing entropy loop
        this.startTimingLoop();
    }

    /**
     * Stop collecting entropy
     */
    stopCollecting(): void {
        if (!this.collecting) return;
        this.collecting = false;

        document.removeEventListener('mousemove', this.handleMouseMove);
        document.removeEventListener('keydown', this.handleKeyDown);

        if (this.frameId !== null) {
            cancelAnimationFrame(this.frameId);
            this.frameId = null;
        }
    }

    /**
     * Get current sample count
     */
    getSampleCount(): number {
        if (!wasmInitialized) return 0;
        return Number(get_sample_count());
    }

    /**
     * Extract entropy as Uint8Array
     */
    getBytes(length: number): Uint8Array {
        if (!wasmInitialized) {
            // Fallback to crypto.getRandomValues
            const bytes = new Uint8Array(length);
            crypto.getRandomValues(bytes);
            return bytes;
        }
        return new Uint8Array(extract_entropy(length));
    }

    /**
     * Extract entropy as hex string (for InstallPage)
     */
    getHexString(length: number): string {
        const bytes = this.getBytes(length);
        return Array.from(bytes)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    /**
     * Securely destroy the entropy pool
     */
    destroy(): void {
        this.stopCollecting();
        if (wasmInitialized) {
            destroy_entropy_pool();
        }
    }

    // --- Private Methods ---

    private onMouseMove(e: MouseEvent): void {
        if (!wasmInitialized) return;
        feed_mouse_entropy(e.clientX, e.clientY, performance.now());
    }

    private onKeyDown(_e: KeyboardEvent): void {
        if (!wasmInitialized) return;
        const now = performance.now();
        const interval = this.lastKeyTime > 0 ? now - this.lastKeyTime : 0;
        this.lastKeyTime = now;
        feed_keyboard_entropy(interval);
    }

    private onFrame(): void {
        if (!this.collecting || !wasmInitialized) return;

        // Feed high-res timestamp on each frame
        feed_timing_entropy(performance.now());

        // Continue loop
        this.frameId = requestAnimationFrame(this.handleFrame);
    }

    private startTimingLoop(): void {
        if (this.frameId !== null) return;
        this.frameId = requestAnimationFrame(this.handleFrame);
    }
}

// Export singleton for simple usage
let globalCollector: NomadEntropy | null = null;

/**
 * Get or create global entropy collector
 */
export function getEntropyCollector(): NomadEntropy {
    if (!globalCollector) {
        globalCollector = new NomadEntropy();
    }
    return globalCollector;
}

/**
 * Quick helper: get entropy bytes using global collector
 */
export async function getEntropyBytes(length: number): Promise<Uint8Array> {
    const collector = getEntropyCollector();
    if (collector.getSampleCount() === 0) {
        await collector.startCollecting();
        // Wait a moment for some entropy
        await new Promise(r => setTimeout(r, 100));
    }
    return collector.getBytes(length);
}
