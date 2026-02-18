/* tslint:disable */
/* eslint-disable */
export const memory: WebAssembly.Memory;
export const destroy_entropy_pool: () => void;
export const extract_entropy: (a: number) => [number, number];
export const feed_keyboard_entropy: (a: number) => void;
export const feed_mouse_entropy: (a: number, b: number, c: number) => void;
export const feed_timing_entropy: (a: number) => void;
export const get_sample_count: () => bigint;
export const init_entropy_pool: () => void;
export const __wbindgen_exn_store: (a: number) => void;
export const __externref_table_alloc: () => number;
export const __wbindgen_externrefs: WebAssembly.Table;
export const __wbindgen_free: (a: number, b: number, c: number) => void;
export const __wbindgen_start: () => void;
