<?php
/**
 * NOMAD CMS - Compression Service
 * 
 * Unified LZ4/gzip compression for versioning data.
 * Supports NOMAD LZ4 frame format for WASM/PHP interoperability.
 * 
 * ## NOMAD LZ4 Frame Format
 * 
 * ```
 * +----------------+----------------+----------------+----------------+
 * | Magic Number   | Original Size  | Compressed Size| Compressed Data|
 * | (4 bytes)      | (4 bytes LE)   | (4 bytes LE)   | (variable)     |
 * +----------------+----------------+----------------+----------------+
 * | 0x4E 0x4C 0x5A 0x34 ("NLZ4")                                      |
 * +----------------+----------------+----------------+----------------+
 * ```
 */

declare(strict_types=1);

namespace NomadCMS\Services\Versioning;

class CompressionService
{
    /** NOMAD LZ4 magic number: "NLZ4" */
    private const NOMAD_LZ4_MAGIC = "\x4E\x4C\x5A\x34";
    
    /** NOMAD LZ4 header size (magic + original_size + compressed_size) */
    private const NOMAD_LZ4_HEADER_SIZE = 12;
    
    /** Minimum content size before compression is attempted */
    private const MIN_CONTENT_SIZE_FOR_COMPRESSION = 100;
    
    /** Minimum compression savings percentage required */
    private const COMPRESSION_THRESHOLD_PERCENT = 10;
    
    /**
     * Compress data using NOMAD LZ4 unified format (preferred) or gzip fallback
     * 
     * @param string $data Raw data to compress
     * @return array{data: string, is_compressed: bool, method?: string}
     */
    public function compress(string $data): array
    {
        // Skip compression for small data
        if (strlen($data) < self::MIN_CONTENT_SIZE_FOR_COMPRESSION) {
            return ['data' => $data, 'is_compressed' => false];
        }
        
        // Try NOMAD LZ4 format first (if PHP lz4 extension is installed)
        if (function_exists('lz4_compress')) {
            $compressed = $this->compressNomadLz4($data);
            if ($compressed !== false) {
                $savings = 1 - (strlen($compressed) / strlen($data));
                if ($savings * 100 >= self::COMPRESSION_THRESHOLD_PERCENT) {
                    return ['data' => $compressed, 'is_compressed' => true, 'method' => 'nomad_lz4'];
                }
            }
        }
        
        // Fallback to gzip
        $compressed = gzcompress($data, 6);
        if ($compressed !== false) {
            $savings = 1 - (strlen($compressed) / strlen($data));
            if ($savings * 100 >= self::COMPRESSION_THRESHOLD_PERCENT) {
                return ['data' => $compressed, 'is_compressed' => true, 'method' => 'gzip'];
            }
        }
        
        // Compression didn't save enough, return raw
        return ['data' => $data, 'is_compressed' => false];
    }
    
    /**
     * Compress data using NOMAD LZ4 unified frame format
     * 
     * Format: [MAGIC:4][ORIGINAL_SIZE:4LE][COMPRESSED_SIZE:4LE][DATA]
     * Uses raw LZ4 block compression (compatible with Rust lz4_flex::block)
     * 
     * @param string $data Raw data to compress
     * @return string|false NOMAD LZ4 frame or false on failure
     */
    private function compressNomadLz4(string $data): string|false
    {
        if (!function_exists('lz4_compress')) {
            return false;
        }
        
        // Use raw LZ4 block compression (false = no LZ4 frame header, raw block only)
        // This matches Rust lz4_flex::block::compress output
        $compressed = lz4_compress($data, false);
        if ($compressed === false) {
            return false;
        }
        
        $originalSize = strlen($data);
        $compressedSize = strlen($compressed);
        
        // Build NOMAD LZ4 frame
        $frame = self::NOMAD_LZ4_MAGIC;
        $frame .= pack('V', $originalSize);   // 4 bytes LE
        $frame .= pack('V', $compressedSize); // 4 bytes LE
        $frame .= $compressed;
        
        return $frame;
    }
    
    /**
     * Decompress data (auto-detects format: NOMAD LZ4, native LZ4, or gzip)
     * 
     * @param string $data Compressed data
     * @param bool $isCompressed Whether data is compressed
     * @param bool $throwOnFailure Whether to throw exception on decompression failure
     * @return string Decompressed data
     * @throws \RuntimeException If decompression fails and throwOnFailure is true
     */
    public function decompress(string $data, bool $isCompressed, bool $throwOnFailure = true): string
    {
        if (!$isCompressed) {
            return $data;
        }
        
        // Try NOMAD LZ4 format first (check magic number)
        if ($this->isNomadLz4Format($data)) {
            $decompressed = $this->decompressNomadLz4($data);
            if ($decompressed !== false) {
                return $decompressed;
            }
            // NOMAD LZ4 was detected but decompression failed - this is a hard error
            if ($throwOnFailure) {
                throw new \RuntimeException('NOMAD LZ4 decompression failed: format detected but decode failed');
            }
        }
        
        // Try native PHP LZ4 (for backward compatibility with old data)
        if (function_exists('lz4_uncompress')) {
            $decompressed = @lz4_uncompress($data);
            if ($decompressed !== false) {
                return $decompressed;
            }
        }
        
        // Try gzip
        $decompressed = @gzuncompress($data);
        if ($decompressed !== false) {
            return $decompressed;
        }
        
        // If all fails and throwOnFailure is enabled, throw exception
        if ($throwOnFailure) {
            $dataInfo = sprintf(
                'len=%d, hex_start=%s, is_nomad=%s',
                strlen($data),
                bin2hex(substr($data, 0, 16)),
                $this->isNomadLz4Format($data) ? 'yes' : 'no'
            );
            throw new \RuntimeException('All decompression methods failed: ' . $dataInfo);
        }
        
        // Fallback: return raw data (for backward compatibility)
        return $data;
    }
    
    /**
     * Check if data is in NOMAD LZ4 frame format
     * 
     * @param string $data Data to check
     * @return bool True if data starts with NOMAD LZ4 magic
     */
    public function isNomadLz4Format(string $data): bool
    {
        return strlen($data) >= self::NOMAD_LZ4_HEADER_SIZE 
            && substr($data, 0, 4) === self::NOMAD_LZ4_MAGIC;
    }
    
    /**
     * Decompress NOMAD LZ4 frame format
     * 
     * Uses raw LZ4 block decompression with original_size hint.
     * Compatible with Rust lz4_flex::block::compress output.
     * 
     * @param string $data NOMAD LZ4 frame
     * @return string|false Decompressed data or false on failure
     */
    private function decompressNomadLz4(string $data): string|false
    {
        if (!function_exists('lz4_uncompress')) {
            error_log('[CompressionService] lz4_uncompress function not available');
            return false;
        }
        
        // Validate minimum length
        if (strlen($data) < self::NOMAD_LZ4_HEADER_SIZE) {
            error_log('[CompressionService] Data too short for NOMAD LZ4: ' . strlen($data) . ' bytes');
            return false;
        }
        
        // Validate magic number
        if (substr($data, 0, 4) !== self::NOMAD_LZ4_MAGIC) {
            error_log('[CompressionService] Invalid NOMAD LZ4 magic: ' . bin2hex(substr($data, 0, 4)));
            return false;
        }
        
        // Read header (little-endian u32 values)
        $originalSize = unpack('V', substr($data, 4, 4))[1];
        $compressedSize = unpack('V', substr($data, 8, 4))[1];
        
        // Validate data length
        $expectedLen = self::NOMAD_LZ4_HEADER_SIZE + $compressedSize;
        if (strlen($data) < $expectedLen) {
            error_log("[CompressionService] Incomplete NOMAD LZ4 frame: expected $expectedLen, got " . strlen($data));
            return false;
        }
        
        // Extract compressed data (raw LZ4 block, no frame header)
        $compressedData = substr($data, self::NOMAD_LZ4_HEADER_SIZE, $compressedSize);
        
        // CRITICAL: Use lz4_uncompress with original_size hint
        // This tells PHP exactly how much memory to allocate for decompression
        // The second parameter is essential for raw LZ4 block decompression
        $decompressed = @lz4_uncompress($compressedData, $originalSize);
        
        if ($decompressed === false) {
            error_log("[CompressionService] lz4_uncompress failed. originalSize=$originalSize, compressedSize=$compressedSize");
            error_log("[CompressionService] First 32 bytes of compressed: " . bin2hex(substr($compressedData, 0, 32)));
            return false;
        }
        
        // Validate decompressed size
        if (strlen($decompressed) !== $originalSize) {
            error_log("[CompressionService] Size mismatch: expected $originalSize, got " . strlen($decompressed));
            return false;
        }
        
        return $decompressed;
    }
    
    /**
     * Get compression format info for diagnostics
     * 
     * @param string $data Compressed data
     * @return array{format: string, original_size?: int, compressed_size?: int}
     */
    public function getCompressionInfo(string $data): array
    {
        if ($this->isNomadLz4Format($data)) {
            $originalSize = unpack('V', substr($data, 4, 4))[1];
            $compressedSize = unpack('V', substr($data, 8, 4))[1];
            return [
                'format' => 'nomad_lz4',
                'original_size' => $originalSize,
                'compressed_size' => $compressedSize,
                'header_size' => self::NOMAD_LZ4_HEADER_SIZE,
            ];
        }
        
        // Check for gzip magic
        if (strlen($data) >= 2 && substr($data, 0, 2) === "\x78\x9c") {
            return ['format' => 'gzip'];
        }
        
        return ['format' => 'unknown'];
    }
}
