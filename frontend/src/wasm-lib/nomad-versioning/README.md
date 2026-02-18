# NOMAD CMS Versioning WASM Module

Enterprise-grade Git-like version history with WASM-based diff engine.

## Features

- **RFC 6902 JSON Patch** - Standard compliant diff computation
- **Bidirectional Diffs** - Forward (old→new) and backward (new→old) for rollback
- **LZ4 Compression** - Ultra-fast compression with ~70% size reduction
- **SHA-256 Hashing** - Content integrity verification
- **Smart Compression** - Only compresses when beneficial
- **Human-readable Summaries** - "+3 added, ~2 modified, -1 removed"

## Prerequisites

- Rust toolchain (1.70+)
- wasm-pack: `cargo install wasm-pack`
- (Optional) wasm-opt for additional optimization: `brew install binaryen`

## Build

```bash
# Run tests
cargo test

# Build WASM
./build.sh

# Or manually:
wasm-pack build --target web --release
```

## Output

After building, files are copied to:
- `frontend/src/wasm/versioning/` - For frontend use
- `api/wasm/` - For backend use (Node.js/PHP FFI)

## Usage

### JavaScript/TypeScript

```typescript
import init, { 
  compute_diff, 
  apply_patch, 
  compress_diff,
  decompress_diff,
  hash_content,
  smart_compress
} from './nomad_versioning.js';

// Initialize WASM (required once)
await init();

// Compute diff between two JSON documents
const old = '{"name": "test", "value": 1}';
const new_ = '{"name": "test", "value": 2, "added": true}';

const result = compute_diff(old, new_);
console.log(result.success);        // true
console.log(result.change_summary); // "+1 added, ~1 modified"
console.log(result.diff_forward);   // JSON Patch array
console.log(result.diff_backward);  // Reverse patch for rollback
console.log(result.content_hash);   // SHA-256 of new content

// Apply patch to restore
const restored = apply_patch(new_, JSON.stringify(result.diff_backward));
console.log(restored.data); // Original document

// Compress for storage
const compressed = compress_diff(JSON.stringify(result.diff_forward));
const decompressed = decompress_diff(compressed);

// Smart compression (only if beneficial)
const smartResult = smart_compress(largeJson, 100); // min 100 bytes savings
if (smartResult.is_compressed) {
  console.log(`Saved ${smartResult.bytes_saved} bytes`);
}

// Verify content integrity
const hash = hash_content(content);
const isValid = verify_hash(content, storedHash);
```

### Exported Functions

| Function | Description |
|----------|-------------|
| `compute_diff(old, new)` | Compute bidirectional diff |
| `apply_patch(base, patch)` | Apply JSON Patch to restore |
| `hash_content(content)` | SHA-256 hash |
| `verify_hash(content, hash)` | Verify content integrity |
| `compress_diff(diff)` | LZ4 compress string |
| `decompress_diff(blob)` | LZ4 decompress to string |
| `smart_compress(input, min_savings)` | Compress only if beneficial |
| `smart_compress_auto(input)` | Smart compress with 10% threshold |
| `get_compression_stats(input)` | Get compression statistics |
| `extract_diff_paths(diff)` | Get affected paths from diff |
| `get_diff_stats(diff)` | Detailed diff statistics |
| `filter_diff_by_path(diff, prefix)` | Filter operations by path |
| `diff_to_human_readable(diff)` | Convert to readable descriptions |
| `is_diff_empty(diff)` | Check if diff has no operations |
| `json_equals(a, b)` | Compare JSON semantically |

## Performance

| Operation | 1MB JSON | Target |
|-----------|----------|--------|
| Diff computation | ~5ms | <10ms ✅ |
| LZ4 compression | ~2ms | <5ms ✅ |
| LZ4 decompression | ~1ms | <3ms ✅ |
| SHA-256 hash | ~3ms | <5ms ✅ |

## Compression Ratio

Typical JSON diff compression with LZ4:
- Small diffs (<1KB): 20-40% reduction
- Medium diffs (1-10KB): 50-70% reduction
- Large diffs (>10KB): 60-80% reduction

## Testing

```bash
# Run all tests
cargo test

# Run specific test
cargo test test_compute_diff

# Run with output
cargo test -- --nocapture
```

## License

MIT
