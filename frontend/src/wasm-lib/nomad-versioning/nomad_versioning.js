let wasm;

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    }
}

let WASM_VECTOR_LEN = 0;

const SmartCompressResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_smartcompressresult_free(ptr >>> 0, 1));

/**
 * Result of smart compression
 */
export class SmartCompressResult {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(SmartCompressResult.prototype);
        obj.__wbg_ptr = ptr;
        SmartCompressResultFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        SmartCompressResultFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_smartcompressresult_free(ptr, 0);
    }
    /**
     * Get final data size in bytes
     * @returns {number}
     */
    get final_size() {
        const ret = wasm.smartcompressresult_final_size(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Get bytes saved by compression
     * @returns {number}
     */
    get bytes_saved() {
        const ret = wasm.smartcompressresult_bytes_saved(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Check if data was actually compressed
     * @returns {boolean}
     */
    get is_compressed() {
        const ret = wasm.smartcompressresult_is_compressed(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Get original data size in bytes
     * @returns {number}
     */
    get original_size() {
        const ret = wasm.smartcompressresult_original_size(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Get compression ratio (0.0 to 1.0, higher = better compression)
     * @returns {number}
     */
    get compression_ratio() {
        const ret = wasm.smartcompressresult_compression_ratio(this.__wbg_ptr);
        return ret;
    }
    /**
     * Get the compressed/uncompressed data
     * @returns {Uint8Array}
     */
    get data() {
        const ret = wasm.smartcompressresult_data(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
}
if (Symbol.dispose) SmartCompressResult.prototype[Symbol.dispose] = SmartCompressResult.prototype.free;

/**
 * Acquire lock for critical operations (non-blocking, returns false if already locked)
 * @returns {boolean}
 */
export function acquire_lock() {
    const ret = wasm.acquire_lock();
    return ret !== 0;
}

/**
 * Apply a diff patch to restore content with race condition protection
 *
 * # Arguments
 * * `base_json` - The base JSON string to apply the patch to
 * * `patch_json` - The RFC 6902 JSON Patch array as a string
 *
 * # Returns
 * A PatchResult containing the patched data, its hash, and operation_id
 * @param {string} base_json
 * @param {string} patch_json
 * @returns {any}
 */
export function apply_patch(base_json, patch_json) {
    const ptr0 = passStringToWasm0(base_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(patch_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.apply_patch(ptr0, len0, ptr1, len1);
    return ret;
}

/**
 * LZ4 compress raw bytes using NOMAD unified format
 *
 * # Arguments
 * * `input` - The bytes to compress
 *
 * # Returns
 * NOMAD LZ4 frame
 * @param {Uint8Array} input
 * @returns {Uint8Array}
 */
export function compress_bytes(input) {
    const ptr0 = passArray8ToWasm0(input, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.compress_bytes(ptr0, len0);
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

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
 * @param {string} input
 * @returns {Uint8Array}
 */
export function compress_diff(input) {
    const ptr0 = passStringToWasm0(input, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.compress_diff(ptr0, len0);
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

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
 * @param {string} old_json
 * @param {string} new_json
 * @returns {any}
 */
export function compute_diff(old_json, new_json) {
    const ptr0 = passStringToWasm0(old_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(new_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.compute_diff(ptr0, len0, ptr1, len1);
    return ret;
}

/**
 * LZ4 decompress bytes back to raw bytes (NOMAD unified format)
 *
 * # Arguments
 * * `compressed` - The NOMAD LZ4 frame
 *
 * # Returns
 * Original bytes or error
 * @param {Uint8Array} compressed
 * @returns {Uint8Array}
 */
export function decompress_bytes(compressed) {
    const ptr0 = passArray8ToWasm0(compressed, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.decompress_bytes(ptr0, len0);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * LZ4 decompress bytes back to string (NOMAD unified format)
 *
 * # Arguments
 * * `compressed` - The NOMAD LZ4 frame
 *
 * # Returns
 * Original string or error
 * @param {Uint8Array} compressed
 * @returns {string}
 */
export function decompress_diff(compressed) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passArray8ToWasm0(compressed, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.decompress_diff(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Decompress data that may or may not be compressed
 *
 * # Arguments
 * * `data` - The data bytes
 * * `is_compressed` - Whether the data is LZ4 compressed
 *
 * # Returns
 * Original string or error
 * @param {Uint8Array} data
 * @param {boolean} is_compressed
 * @returns {string}
 */
export function decompress_smart(data, is_compressed) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.decompress_smart(ptr0, len0, is_compressed);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Convert diff to human-readable format
 *
 * # Arguments
 * * `diff_json` - The JSON Patch array as a string
 *
 * # Returns
 * Array of human-readable change descriptions
 * @param {string} diff_json
 * @returns {any}
 */
export function diff_to_human_readable(diff_json) {
    const ptr0 = passStringToWasm0(diff_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.diff_to_human_readable(ptr0, len0);
    return ret;
}

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
 * @param {number} input_size
 * @returns {number}
 */
export function estimate_compressed_size(input_size) {
    const ret = wasm.estimate_compressed_size(input_size);
    return ret >>> 0;
}

/**
 * Extract all affected paths from a JSON Patch diff
 *
 * # Arguments
 * * `diff_json` - The JSON Patch array as a string
 *
 * # Returns
 * Array of affected paths as JsValue
 * @param {string} diff_json
 * @returns {any}
 */
export function extract_diff_paths(diff_json) {
    const ptr0 = passStringToWasm0(diff_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.extract_diff_paths(ptr0, len0);
    return ret;
}

/**
 * Filter diff to only include operations on specific paths
 *
 * # Arguments
 * * `diff_json` - The JSON Patch array as a string
 * * `path_prefix` - Path prefix to filter by (e.g., "/data/items")
 *
 * # Returns
 * Filtered JSON Patch array as string
 * @param {string} diff_json
 * @param {string} path_prefix
 * @returns {string}
 */
export function filter_diff_by_path(diff_json, path_prefix) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(diff_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(path_prefix, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.filter_diff_by_path(ptr0, len0, ptr1, len1);
        deferred3_0 = ret[0];
        deferred3_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

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
 * @param {string} input
 * @returns {any}
 */
export function get_compression_stats(input) {
    const ptr0 = passStringToWasm0(input, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.get_compression_stats(ptr0, len0);
    return ret;
}

/**
 * Get detailed statistics about a diff
 *
 * # Arguments
 * * `diff_json` - The JSON Patch array as a string
 *
 * # Returns
 * DiffStats as JsValue
 * @param {string} diff_json
 * @returns {any}
 */
export function get_diff_stats(diff_json) {
    const ptr0 = passStringToWasm0(diff_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.get_diff_stats(ptr0, len0);
    return ret;
}

/**
 * Get the size of a JSON string when minified
 * @param {string} json
 * @returns {number}
 */
export function get_minified_size(json) {
    const ptr0 = passStringToWasm0(json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.get_minified_size(ptr0, len0);
    return ret >>> 0;
}

/**
 * Get the NOMAD LZ4 magic number for validation
 *
 * # Returns
 * 4-byte magic number: "NLZ4" (0x4E4C5A34)
 * @returns {Uint8Array}
 */
export function get_nomad_lz4_magic() {
    const ret = wasm.get_nomad_lz4_magic();
    var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v1;
}

/**
 * Get current operation ID (for optimistic locking)
 * @returns {bigint}
 */
export function get_operation_id() {
    const ret = wasm.get_operation_id();
    return BigInt.asUintN(64, ret);
}

/**
 * Calculate SHA-256 hash of content
 *
 * # Arguments
 * * `content` - The content string to hash
 *
 * # Returns
 * Lowercase hex-encoded SHA-256 hash
 * @param {string} content
 * @returns {string}
 */
export function hash_content(content) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(content, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.hash_content(ptr0, len0);
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Initialize panic hook for better error messages in browser console
 */
export function init() {
    wasm.init();
}

/**
 * Check if a diff is empty (no operations)
 *
 * # Arguments
 * * `diff_json` - The JSON Patch array as a string
 *
 * # Returns
 * true if diff has no operations
 * @param {string} diff_json
 * @returns {boolean}
 */
export function is_diff_empty(diff_json) {
    const ptr0 = passStringToWasm0(diff_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.is_diff_empty(ptr0, len0);
    return ret !== 0;
}

/**
 * Check if currently locked
 * @returns {boolean}
 */
export function is_locked() {
    const ret = wasm.is_locked();
    return ret !== 0;
}

/**
 * Validate if data is in NOMAD LZ4 format
 *
 * # Arguments
 * * `data` - The data to validate
 *
 * # Returns
 * true if data starts with NOMAD LZ4 magic number
 * @param {Uint8Array} data
 * @returns {boolean}
 */
export function is_nomad_lz4_format(data) {
    const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.is_nomad_lz4_format(ptr0, len0);
    return ret !== 0;
}

/**
 * Check if two JSON strings are semantically equal
 *
 * Compares parsed JSON values, ignoring whitespace and key ordering
 * @param {string} json_a
 * @param {string} json_b
 * @returns {boolean}
 */
export function json_equals(json_a, json_b) {
    const ptr0 = passStringToWasm0(json_a, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(json_b, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.json_equals(ptr0, len0, ptr1, len1);
    return ret !== 0;
}

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
 * @param {string} diffs_json
 * @returns {string}
 */
export function merge_diffs(diffs_json) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(diffs_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.merge_diffs(ptr0, len0);
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Increment and get new operation ID
 * @returns {bigint}
 */
export function next_operation_id() {
    const ret = wasm.next_operation_id();
    return BigInt.asUintN(64, ret);
}

/**
 * Release lock after critical operations
 */
export function release_lock() {
    wasm.release_lock();
}

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
 * @param {string} diff_json
 * @param {string} old_json
 * @returns {string}
 */
export function reverse_diff(diff_json, old_json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(diff_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(old_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.reverse_diff(ptr0, len0, ptr1, len1);
        deferred3_0 = ret[0];
        deferred3_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

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
 * @param {string} input
 * @param {number} min_savings
 * @returns {SmartCompressResult}
 */
export function smart_compress(input, min_savings) {
    const ptr0 = passStringToWasm0(input, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.smart_compress(ptr0, len0, min_savings);
    return SmartCompressResult.__wrap(ret);
}

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
 * @param {string} input
 * @returns {SmartCompressResult}
 */
export function smart_compress_auto(input) {
    const ptr0 = passStringToWasm0(input, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.smart_compress_auto(ptr0, len0);
    return SmartCompressResult.__wrap(ret);
}

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
 * @param {string} content
 * @returns {string}
 */
export function tokenize_content(content) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(content, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.tokenize_content(ptr0, len0);
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Extract tokens from JSON content (recursive extraction of all string values)
 * @param {string} json_str
 * @returns {string}
 */
export function tokenize_json(json_str) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(json_str, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.tokenize_json(ptr0, len0);
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Tokenize content and return as vector (for programmatic use)
 * @param {string} content
 * @returns {any}
 */
export function tokenize_to_array(content) {
    const ptr0 = passStringToWasm0(content, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.tokenize_to_array(ptr0, len0);
    return ret;
}

/**
 * Validate operation ID hasn't changed (for optimistic locking)
 * Returns true if the operation ID is still valid
 * @param {bigint} expected_id
 * @returns {boolean}
 */
export function validate_operation_id(expected_id) {
    const ret = wasm.validate_operation_id(expected_id);
    return ret !== 0;
}

/**
 * Verify content integrity by comparing hash
 *
 * # Arguments
 * * `content` - The content string to verify
 * * `expected_hash` - The expected SHA-256 hash
 *
 * # Returns
 * true if hashes match, false otherwise
 * @param {string} content
 * @param {string} expected_hash
 * @returns {boolean}
 */
export function verify_hash(content, expected_hash) {
    const ptr0 = passStringToWasm0(content, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(expected_hash, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.verify_hash(ptr0, len0, ptr1, len1);
    return ret !== 0;
}

const EXPECTED_RESPONSE_TYPES = new Set(['basic', 'cors', 'default']);

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && EXPECTED_RESPONSE_TYPES.has(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else {
                    throw e;
                }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }
}

function __wbg_get_imports() {
    const imports = {};
    imports.wbg = {};
    imports.wbg.__wbg_Error_52673b7de5a0ca89 = function(arg0, arg1) {
        const ret = Error(getStringFromWasm0(arg0, arg1));
        return ret;
    };
    imports.wbg.__wbg___wbindgen_is_string_704ef9c8fc131030 = function(arg0) {
        const ret = typeof(arg0) === 'string';
        return ret;
    };
    imports.wbg.__wbg___wbindgen_throw_dd24417ed36fc46e = function(arg0, arg1) {
        throw new Error(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_error_7534b8e9a36f1ab4 = function(arg0, arg1) {
        let deferred0_0;
        let deferred0_1;
        try {
            deferred0_0 = arg0;
            deferred0_1 = arg1;
            console.error(getStringFromWasm0(arg0, arg1));
        } finally {
            wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
        }
    };
    imports.wbg.__wbg_new_1ba21ce319a06297 = function() {
        const ret = new Object();
        return ret;
    };
    imports.wbg.__wbg_new_25f239778d6112b9 = function() {
        const ret = new Array();
        return ret;
    };
    imports.wbg.__wbg_new_8a6f238a6ece86ea = function() {
        const ret = new Error();
        return ret;
    };
    imports.wbg.__wbg_new_b546ae120718850e = function() {
        const ret = new Map();
        return ret;
    };
    imports.wbg.__wbg_set_3f1d0b984ed272ed = function(arg0, arg1, arg2) {
        arg0[arg1] = arg2;
    };
    imports.wbg.__wbg_set_7df433eea03a5c14 = function(arg0, arg1, arg2) {
        arg0[arg1 >>> 0] = arg2;
    };
    imports.wbg.__wbg_set_efaaf145b9377369 = function(arg0, arg1, arg2) {
        const ret = arg0.set(arg1, arg2);
        return ret;
    };
    imports.wbg.__wbg_stack_0ed75d68575b0f3c = function(arg0, arg1) {
        const ret = arg1.stack;
        const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
        getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    };
    imports.wbg.__wbindgen_cast_2241b6af4c4b2941 = function(arg0, arg1) {
        // Cast intrinsic for `Ref(String) -> Externref`.
        const ret = getStringFromWasm0(arg0, arg1);
        return ret;
    };
    imports.wbg.__wbindgen_cast_4625c577ab2ec9ee = function(arg0) {
        // Cast intrinsic for `U64 -> Externref`.
        const ret = BigInt.asUintN(64, arg0);
        return ret;
    };
    imports.wbg.__wbindgen_cast_9ae0607507abb057 = function(arg0) {
        // Cast intrinsic for `I64 -> Externref`.
        const ret = arg0;
        return ret;
    };
    imports.wbg.__wbindgen_cast_d6cd19b81560fd6e = function(arg0) {
        // Cast intrinsic for `F64 -> Externref`.
        const ret = arg0;
        return ret;
    };
    imports.wbg.__wbindgen_init_externref_table = function() {
        const table = wasm.__wbindgen_externrefs;
        const offset = table.grow(4);
        table.set(0, undefined);
        table.set(offset + 0, undefined);
        table.set(offset + 1, null);
        table.set(offset + 2, true);
        table.set(offset + 3, false);
    };

    return imports;
}

function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    __wbg_init.__wbindgen_wasm_module = module;
    cachedDataViewMemory0 = null;
    cachedUint8ArrayMemory0 = null;


    wasm.__wbindgen_start();
    return wasm;
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (typeof module !== 'undefined') {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (typeof module_or_path !== 'undefined') {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (typeof module_or_path === 'undefined') {
        module_or_path = new URL('nomad_versioning_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync };
export default __wbg_init;
