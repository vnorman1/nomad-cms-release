/* tslint:disable */
/* eslint-disable */

export class SmartCompressResult {
  private constructor();
  free(): void;
  [Symbol.dispose](): void;
  /**
   * Get final data size in bytes
   */
  readonly final_size: number;
  /**
   * Get bytes saved by compression
   */
  readonly bytes_saved: number;
  /**
   * Check if data was actually compressed
   */
  readonly is_compressed: boolean;
  /**
   * Get original data size in bytes
   */
  readonly original_size: number;
  /**
   * Get compression ratio (0.0 to 1.0, higher = better compression)
   */
  readonly compression_ratio: number;
  /**
   * Get the compressed/uncompressed data
   */
  readonly data: Uint8Array;
}

/**
 * Acquire lock for critical operations (non-blocking, returns false if already locked)
 */
export function acquire_lock(): boolean;

/**
 * Apply a diff patch to restore content with race condition protection
 * 
 * # Arguments
 * * `base_json` - The base JSON string to apply the patch to
 * * `patch_json` - The RFC 6902 JSON Patch array as a string
 * 
 * # Returns
 * A PatchResult containing the patched data, its hash, and operation_id
 */
export function apply_patch(base_json: string, patch_json: string): any;

/**
 * LZ4 compress raw bytes using NOMAD unified format
 * 
 * # Arguments
 * * `input` - The bytes to compress
 * 
 * # Returns
 * NOMAD LZ4 frame
 */
export function compress_bytes(input: Uint8Array): Uint8Array;

/**
 * LZ4 compress a string (typically JSON diff) using NOMAD unified format
 * 
 * Returns compressed bytes in NOMAD LZ4 frame format.
 * This format is compatible with PHP CompressionService.
 * 
 * # Arguments
 * * `input` - The string to compress (usually JSON)
 * 
 * # Returns
 * NOMAD LZ4 frame: [MAGIC:4][ORIG_SIZE:4][COMP_SIZE:4][DATA]
 */
export function compress_diff(input: string): Uint8Array;

/**
 * Compute diff between two JSON values with race condition protection
 * 
 * Returns forward diff (old→new) and backward diff (new→old) for bidirectional versioning.
 * Includes operation_id for optimistic locking support.
 * 
 * # Arguments
 * * `old_json` - The original JSON string
 * * `new_json` - The modified JSON string
 * 
 * # Returns
 * A DiffResult containing:
 * - `diff_forward`: Changes to go from old to new
 * - `diff_backward`: Changes to go from new to old (for rollback)
 * - `diff_size`: Size of the diff in bytes
 * - `content_hash`: SHA-256 hash of new content
 * - `change_summary`: Human-readable summary like "+2 added, ~1 modified"
 * - `search_tokens`: Tokenized keywords from new content for search indexing
 * - `operation_id`: Unique ID for race condition tracking
 */
export function compute_diff(old_json: string, new_json: string): any;

/**
 * LZ4 decompress bytes back to raw bytes (NOMAD unified format)
 * 
 * # Arguments
 * * `compressed` - The NOMAD LZ4 frame
 * 
 * # Returns
 * Original bytes or error
 */
export function decompress_bytes(compressed: Uint8Array): Uint8Array;

/**
 * LZ4 decompress bytes back to string (NOMAD unified format)
 * 
 * # Arguments
 * * `compressed` - The NOMAD LZ4 frame
 * 
 * # Returns
 * Original string or error
 */
export function decompress_diff(compressed: Uint8Array): string;

/**
 * Decompress data that may or may not be compressed
 * 
 * # Arguments
 * * `data` - The data bytes
 * * `is_compressed` - Whether the data is LZ4 compressed
 * 
 * # Returns
 * Original string or error
 */
export function decompress_smart(data: Uint8Array, is_compressed: boolean): string;

/**
 * Convert diff to human-readable format
 * 
 * # Arguments
 * * `diff_json` - The JSON Patch array as a string
 * 
 * # Returns
 * Array of human-readable change descriptions
 */
export function diff_to_human_readable(diff_json: string): any;

/**
 * Estimate compressed size without actually compressing
 * 
 * Uses a fast heuristic for estimation. For accurate sizes, use get_compression_stats.
 * 
 * # Arguments
 * * `input_size` - The original input size in bytes
 * 
 * # Returns
 * Estimated compressed size (assumes ~70% compression ratio for JSON)
 */
export function estimate_compressed_size(input_size: number): number;

/**
 * Extract all affected paths from a JSON Patch diff
 * 
 * # Arguments
 * * `diff_json` - The JSON Patch array as a string
 * 
 * # Returns
 * Array of affected paths as JsValue
 */
export function extract_diff_paths(diff_json: string): any;

/**
 * Filter diff to only include operations on specific paths
 * 
 * # Arguments
 * * `diff_json` - The JSON Patch array as a string
 * * `path_prefix` - Path prefix to filter by (e.g., "/data/items")
 * 
 * # Returns
 * Filtered JSON Patch array as string
 */
export function filter_diff_by_path(diff_json: string, path_prefix: string): string;

/**
 * Get compression statistics without keeping the compressed data
 * 
 * Useful for estimating compression effectiveness before committing.
 * 
 * # Arguments
 * * `input` - The string to analyze
 * 
 * # Returns
 * CompressionStats as JsValue
 */
export function get_compression_stats(input: string): any;

/**
 * Get detailed statistics about a diff
 * 
 * # Arguments
 * * `diff_json` - The JSON Patch array as a string
 * 
 * # Returns
 * DiffStats as JsValue
 */
export function get_diff_stats(diff_json: string): any;

/**
 * Get the size of a JSON string when minified
 */
export function get_minified_size(json: string): number;

/**
 * Get the NOMAD LZ4 magic number for validation
 * 
 * # Returns
 * 4-byte magic number: "NLZ4" (0x4E4C5A34)
 */
export function get_nomad_lz4_magic(): Uint8Array;

/**
 * Get current operation ID (for optimistic locking)
 */
export function get_operation_id(): bigint;

/**
 * Calculate SHA-256 hash of content
 * 
 * # Arguments
 * * `content` - The content string to hash
 * 
 * # Returns
 * Lowercase hex-encoded SHA-256 hash
 */
export function hash_content(content: string): string;

/**
 * Initialize panic hook for better error messages in browser console
 */
export function init(): void;

/**
 * Check if a diff is empty (no operations)
 * 
 * # Arguments
 * * `diff_json` - The JSON Patch array as a string
 * 
 * # Returns
 * true if diff has no operations
 */
export function is_diff_empty(diff_json: string): boolean;

/**
 * Check if currently locked
 */
export function is_locked(): boolean;

/**
 * Validate if data is in NOMAD LZ4 format
 * 
 * # Arguments
 * * `data` - The data to validate
 * 
 * # Returns
 * true if data starts with NOMAD LZ4 magic number
 */
export function is_nomad_lz4_format(data: Uint8Array): boolean;

/**
 * Check if two JSON strings are semantically equal
 * 
 * Compares parsed JSON values, ignoring whitespace and key ordering
 */
export function json_equals(json_a: string, json_b: string): boolean;

/**
 * Merge multiple diffs into one
 * 
 * Simply concatenates diff operations. For complex merges, 
 * consider applying diffs sequentially.
 * 
 * # Arguments
 * * `diffs_json` - Array of JSON Patch arrays as a string
 * 
 * # Returns
 * Merged JSON Patch array as string
 */
export function merge_diffs(diffs_json: string): string;

/**
 * Increment and get new operation ID
 */
export function next_operation_id(): bigint;

/**
 * Release lock after critical operations
 */
export function release_lock(): void;

/**
 * Reverse a diff (swap forward/backward)
 * 
 * This is useful when you have only forward diff and need backward.
 * Note: This is a simple reversal that may not work for all cases.
 * 
 * # Arguments
 * * `diff_json` - The JSON Patch array as a string
 * * `old_json` - The original document (needed for remove → add conversion)
 * 
 * # Returns
 * Reversed JSON Patch array as string
 */
export function reverse_diff(diff_json: string, old_json: string): string;

/**
 * Smart compress - only if beneficial (uses NOMAD LZ4 format)
 * 
 * Compresses the input only if it saves at least `min_savings` bytes.
 * This prevents compression overhead for small or incompressible data.
 * 
 * # Arguments
 * * `input` - The string to compress
 * * `min_savings` - Minimum bytes that must be saved to use compression
 * 
 * # Returns
 * SmartCompressResult with compression decision
 */
export function smart_compress(input: string, min_savings: number): SmartCompressResult;

/**
 * Smart compress with default minimum savings (10% of original size)
 * 
 * Uses 10% of original size as the minimum savings threshold.
 * 
 * # Arguments
 * * `input` - The string to compress
 * 
 * # Returns
 * SmartCompressResult with compression decision
 */
export function smart_compress_auto(input: string): SmartCompressResult;

/**
 * Tokenize content into unique, searchable keywords
 * 
 * Full pipeline:
 * 1. Strip HTML tags
 * 2. Normalize text (lowercase, remove punctuation)
 * 3. Split into words
 * 4. Remove stop words
 * 5. Deduplicate with HashSet
 * 
 * # Arguments
 * * `content` - Raw HTML or text content
 * 
 * # Returns
 * Space-separated string of unique keywords
 */
export function tokenize_content(content: string): string;

/**
 * Extract tokens from JSON content (recursive extraction of all string values)
 */
export function tokenize_json(json_str: string): string;

/**
 * Tokenize content and return as vector (for programmatic use)
 */
export function tokenize_to_array(content: string): any;

/**
 * Validate operation ID hasn't changed (for optimistic locking)
 * Returns true if the operation ID is still valid
 */
export function validate_operation_id(expected_id: bigint): boolean;

/**
 * Verify content integrity by comparing hash
 * 
 * # Arguments
 * * `content` - The content string to verify
 * * `expected_hash` - The expected SHA-256 hash
 * 
 * # Returns
 * true if hashes match, false otherwise
 */
export function verify_hash(content: string, expected_hash: string): boolean;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_smartcompressresult_free: (a: number, b: number) => void;
  readonly acquire_lock: () => number;
  readonly apply_patch: (a: number, b: number, c: number, d: number) => any;
  readonly compress_bytes: (a: number, b: number) => [number, number];
  readonly compute_diff: (a: number, b: number, c: number, d: number) => any;
  readonly decompress_bytes: (a: number, b: number) => [number, number, number, number];
  readonly decompress_diff: (a: number, b: number) => [number, number, number, number];
  readonly decompress_smart: (a: number, b: number, c: number) => [number, number, number, number];
  readonly diff_to_human_readable: (a: number, b: number) => any;
  readonly estimate_compressed_size: (a: number) => number;
  readonly extract_diff_paths: (a: number, b: number) => any;
  readonly filter_diff_by_path: (a: number, b: number, c: number, d: number) => [number, number];
  readonly get_compression_stats: (a: number, b: number) => any;
  readonly get_diff_stats: (a: number, b: number) => any;
  readonly get_minified_size: (a: number, b: number) => number;
  readonly get_nomad_lz4_magic: () => [number, number];
  readonly get_operation_id: () => bigint;
  readonly hash_content: (a: number, b: number) => [number, number];
  readonly init: () => void;
  readonly is_diff_empty: (a: number, b: number) => number;
  readonly is_locked: () => number;
  readonly is_nomad_lz4_format: (a: number, b: number) => number;
  readonly json_equals: (a: number, b: number, c: number, d: number) => number;
  readonly merge_diffs: (a: number, b: number) => [number, number];
  readonly next_operation_id: () => bigint;
  readonly release_lock: () => void;
  readonly reverse_diff: (a: number, b: number, c: number, d: number) => [number, number];
  readonly smart_compress: (a: number, b: number, c: number) => number;
  readonly smart_compress_auto: (a: number, b: number) => number;
  readonly smartcompressresult_bytes_saved: (a: number) => number;
  readonly smartcompressresult_compression_ratio: (a: number) => number;
  readonly smartcompressresult_data: (a: number) => [number, number];
  readonly smartcompressresult_final_size: (a: number) => number;
  readonly smartcompressresult_is_compressed: (a: number) => number;
  readonly smartcompressresult_original_size: (a: number) => number;
  readonly tokenize_content: (a: number, b: number) => [number, number];
  readonly tokenize_json: (a: number, b: number) => [number, number];
  readonly tokenize_to_array: (a: number, b: number) => any;
  readonly validate_operation_id: (a: bigint) => number;
  readonly verify_hash: (a: number, b: number, c: number, d: number) => number;
  readonly compress_diff: (a: number, b: number) => [number, number];
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_externrefs: WebAssembly.Table;
  readonly __externref_table_dealloc: (a: number) => void;
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
