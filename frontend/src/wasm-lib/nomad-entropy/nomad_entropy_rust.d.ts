/* tslint:disable */
/* eslint-disable */

/**
 * Destroy the entropy pool securely
 */
export function destroy_entropy_pool(): void;

/**
 * Extract entropy bytes
 */
export function extract_entropy(length: number): Uint8Array;

/**
 * Feed keyboard timing entropy
 * Uses milliseconds between keystrokes
 */
export function feed_keyboard_entropy(interval_ms: number): void;

/**
 * Feed mouse movement entropy
 * Uses last 2 digits of coordinates + high-res timestamp
 */
export function feed_mouse_entropy(x: number, y: number, timestamp: number): void;

/**
 * Feed high-resolution timing entropy
 * Uses performance.now() timestamps
 */
export function feed_timing_entropy(timestamp: number): void;

/**
 * Get the number of samples collected
 */
export function get_sample_count(): bigint;

/**
 * Initialize the entropy pool
 */
export function init_entropy_pool(): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly destroy_entropy_pool: () => void;
  readonly extract_entropy: (a: number) => [number, number];
  readonly feed_keyboard_entropy: (a: number) => void;
  readonly feed_mouse_entropy: (a: number, b: number, c: number) => void;
  readonly feed_timing_entropy: (a: number) => void;
  readonly get_sample_count: () => bigint;
  readonly init_entropy_pool: () => void;
  readonly __wbindgen_exn_store: (a: number) => void;
  readonly __externref_table_alloc: () => number;
  readonly __wbindgen_externrefs: WebAssembly.Table;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
