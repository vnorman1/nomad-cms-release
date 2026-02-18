/* tslint:disable */
/* eslint-disable */

/**
 * Transform a single value based on transform type
 */
export function apply_transform(value: string, transform_type: string): string;

/**
 * Main entry point: process file and return preview
 */
export function process_file(data: Uint8Array, filename: string, preview_rows: number): any;

/**
 * Suggest mappings based on column names and sample data
 */
export function suggest_mappings(data: Uint8Array, filename: string, target_fields_json: string): any;

/**
 * Transform data based on mapping rules
 */
export function transform_data(data: Uint8Array, filename: string, mappings_json: string): any;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly apply_transform: (a: number, b: number, c: number, d: number) => [number, number];
  readonly process_file: (a: number, b: number, c: number, d: number, e: number) => any;
  readonly suggest_mappings: (a: number, b: number, c: number, d: number, e: number, f: number) => any;
  readonly transform_data: (a: number, b: number, c: number, d: number, e: number, f: number) => any;
  readonly __wbindgen_externrefs: WebAssembly.Table;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
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
