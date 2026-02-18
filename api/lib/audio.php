<?php
/**
 * NOMAD CMS - Audio Processing Utilities
 * Functions for handling audio file uploads
 * 
 * Supported formats: MP3, WAV, OGG, FLAC, AAC, M4A, WEBM (audio)
 * 
 * NO CONVERSION - Audio files are saved as-is (original format preserved)
 * Modern browsers support MP3, WAV, OGG, and most common formats natively.
 * 
 * Features:
 * - Server-side MIME type validation
 * - Magic bytes validation for additional security
 * - FFprobe metadata extraction (optional, for duration)
 * - Sanitized filenames
 * - Resource-safe (no CPU-intensive FFmpeg conversion)
 * 
 * LIMITS:
 * - Max duration: 4 hours (checked if FFprobe available)
 * - Max file size: 100MB (configurable via AUDIO_MAX_SIZE env)
 * 
 * SECURITY:
 * - Server-side MIME type validation (finfo)
 * - Magic bytes validation for additional security
 * - Sanitized filenames
 */

declare(strict_types=1);

// Constants - only define if not already defined (for testing)
if (!defined('AUDIO_MAX_DURATION')) {
    define('AUDIO_MAX_DURATION', 14400); // 4 hours in seconds
}
if (!defined('AUDIO_MAX_SIZE')) {
    define('AUDIO_MAX_SIZE', (int)($_ENV['AUDIO_MAX_SIZE'] ?? 100 * 1024 * 1024)); // 100MB default
}

// Cache FFprobe availability (only check once per request)
$_audioFfprobeCache = null;

/**
 * Check if FFprobe is available for metadata extraction (cached)
 */
function isFFprobeAvailableForAudio(): bool {
    global $_audioFfprobeCache;
    
    if ($_audioFfprobeCache !== null) {
        return $_audioFfprobeCache;
    }
    
    $output = [];
    $returnCode = 0;
    @exec('ffprobe -version 2>&1', $output, $returnCode);
    $_audioFfprobeCache = $returnCode === 0;
    
    return $_audioFfprobeCache;
}

/**
 * Validate audio file by checking magic bytes
 * Additional security layer beyond MIME type check
 */
function validateAudioMagicBytes(string $filePath): bool {
    if (!file_exists($filePath) || !is_readable($filePath)) {
        return false;
    }
    
    $handle = @fopen($filePath, 'rb');
    if (!$handle) {
        return false;
    }
    
    $bytes = fread($handle, 12);
    fclose($handle);
    
    if ($bytes === false || strlen($bytes) < 4) {
        return false;
    }
    
    // MP3: ID3 tag or sync bytes (0xFF 0xFB, 0xFF 0xFA, 0xFF 0xF3, 0xFF 0xF2)
    if (substr($bytes, 0, 3) === 'ID3' || 
        (ord($bytes[0]) === 0xFF && (ord($bytes[1]) & 0xE0) === 0xE0)) {
        return true;
    }
    
    // WAV: RIFF....WAVE
    if (substr($bytes, 0, 4) === 'RIFF' && substr($bytes, 8, 4) === 'WAVE') {
        return true;
    }
    
    // OGG: OggS
    if (substr($bytes, 0, 4) === 'OggS') {
        return true;
    }
    
    // FLAC: fLaC
    if (substr($bytes, 0, 4) === 'fLaC') {
        return true;
    }
    
    // M4A/AAC: ftyp or free/mdat
    if (substr($bytes, 4, 4) === 'ftyp' || 
        substr($bytes, 4, 4) === 'free' ||
        substr($bytes, 4, 4) === 'mdat' ||
        substr($bytes, 4, 4) === 'moov') {
        return true;
    }
    
    // AIFF: FORM....AIFF
    if (substr($bytes, 0, 4) === 'FORM' && substr($bytes, 8, 4) === 'AIFF') {
        return true;
    }
    
    // WebM: starts with 0x1A 0x45 0xDF 0xA3
    if (ord($bytes[0]) === 0x1A && ord($bytes[1]) === 0x45 && 
        ord($bytes[2]) === 0xDF && ord($bytes[3]) === 0xA3) {
        return true;
    }
    
    return false;
}

/**
 * Get audio info using FFprobe
 * @return array{duration: float, codec: string, bitrate: int, channels: int, sampleRate: int}|null
 */
function getAudioInfo(string $filePath): ?array {
    if (!isFFprobeAvailableForAudio()) {
        return null;
    }
    
    $output = [];
    $returnCode = 0;
    
    $cmd = sprintf(
        'ffprobe -v quiet -print_format json -show_format -show_streams %s 2>&1',
        escapeshellarg($filePath)
    );
    
    @exec($cmd, $output, $returnCode);
    
    if ($returnCode !== 0) {
        return null;
    }
    
    $json = implode('', $output);
    $data = json_decode($json, true);
    
    if (!$data || !isset($data['streams'])) {
        return null;
    }
    
    // Find audio stream
    $audioStream = null;
    foreach ($data['streams'] as $stream) {
        if ($stream['codec_type'] === 'audio') {
            $audioStream = $stream;
            break;
        }
    }
    
    if (!$audioStream) {
        return null;
    }
    
    return [
        'duration' => (float) ($data['format']['duration'] ?? 0),
        'codec' => $audioStream['codec_name'] ?? 'unknown',
        'bitrate' => (int) ($data['format']['bit_rate'] ?? 0),
        'channels' => (int) ($audioStream['channels'] ?? 2),
        'sampleRate' => (int) ($audioStream['sample_rate'] ?? 44100),
    ];
}

/**
 * Format duration as human readable
 */
function formatAudioDuration(float $seconds): string {
    $totalSeconds = (int) floor($seconds);
    $hours = (int) floor($totalSeconds / 3600);
    $minutes = (int) floor(($totalSeconds % 3600) / 60);
    $secs = $totalSeconds % 60;
    
    if ($hours > 0) {
        return sprintf('%d:%02d:%02d', $hours, $minutes, $secs);
    }
    return sprintf('%d:%02d', $minutes, $secs);
}

/**
 * Generate unique filename for audio
 */
function generateAudioFilename(string $originalName, string $extension): string {
    $baseName = pathinfo($originalName, PATHINFO_FILENAME);
    $safeName = preg_replace('/[^a-zA-Z0-9_-]/', '_', $baseName);
    $safeName = substr($safeName, 0, 50);
    $uniqueId = substr(md5(uniqid((string)mt_rand(), true)), 0, 8);
    
    return sprintf('%s_%s.%s', $safeName, $uniqueId, $extension);
}

/**
 * Process audio file - SAVES ORIGINAL FORMAT (no conversion)
 * 
 * @param array $file $_FILES['audio'] array
 * @return array{filename: string, converted: bool, duration: float|null, format: string}
 * @throws Exception on critical failure
 */
function processAudio(array $file): array {
    $tmpPath = $file['tmp_name'];
    $originalName = $file['name'];
    $originalExtension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
    
    // SECURITY: Validate file exists and is readable
    if (!file_exists($tmpPath) || !is_readable($tmpPath)) {
        throw new Exception('INVALID_FILE:A feltöltött fájl nem elérhető.');
    }
    
    // Check file size
    $fileSize = $file['size'] ?? filesize($tmpPath);
    if ($fileSize > AUDIO_MAX_SIZE) {
        $maxSizeMB = AUDIO_MAX_SIZE / (1024 * 1024);
        throw new Exception("FILE_TOO_LARGE:A fájl mérete maximum {$maxSizeMB}MB lehet.");
    }
    
    // SECURITY: Check for zero-byte files
    if ($fileSize === 0) {
        throw new Exception('EMPTY_FILE:Az audio fájl üres.');
    }
    
    // Get upload directory
    $envDir = $_ENV['UPLOAD_DIR'] ?? '';
    if (!empty($envDir) && str_starts_with($envDir, '/')) {
        $uploadDir = rtrim($envDir, '/') . '/';
    } else {
        $uploadDir = __DIR__ . '/../uploads/';
    }
    
    // Ensure upload directory exists
    if (!is_dir($uploadDir)) {
        if (!mkdir($uploadDir, 0755, true)) {
            throw new Exception('DIRECTORY_ERROR:Nem sikerült létrehozni a feltöltési könyvtárat.');
        }
    }
    
    // SECURITY: Validate file type using server-side detection
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    if (!$finfo) {
        throw new Exception('SYSTEM_ERROR:Fájltípus ellenőrzés nem elérhető.');
    }
    $mimeType = finfo_file($finfo, $tmpPath);
    finfo_close($finfo);
    
    $allowedTypes = [
        'audio/mpeg', 'audio/mp3',           // MP3
        'audio/wav', 'audio/x-wav',          // WAV
        'audio/ogg', 'audio/vorbis',         // OGG
        'audio/flac', 'audio/x-flac',        // FLAC
        'audio/aac', 'audio/x-aac',          // AAC
        'audio/mp4', 'audio/x-m4a',          // M4A
        'audio/webm',                         // WebM audio
        'audio/x-aiff', 'audio/aiff',        // AIFF
        'application/ogg',                    // Some OGG files
        'application/octet-stream',           // Fallback for some systems
    ];
    
    // First check MIME type
    $mimeValid = in_array($mimeType, $allowedTypes);
    
    // SECURITY: Additional magic bytes validation
    $magicValid = validateAudioMagicBytes($tmpPath);
    
    // Either MIME or magic bytes must validate, but prefer both
    if (!$mimeValid && !$magicValid) {
        throw new Exception('INVALID_FILE_TYPE:Érvénytelen fájltípus. Engedélyezett: MP3, WAV, OGG, FLAC, AAC, M4A');
    }
    
    // Get audio info if ffprobe is available (optional metadata)
    $audioInfo = getAudioInfo($tmpPath);
    $duration = null;
    
    // Check duration limit
    if ($audioInfo) {
        $duration = $audioInfo['duration'];
        
        if ($duration > AUDIO_MAX_DURATION) {
            $maxHours = AUDIO_MAX_DURATION / 3600;
            throw new Exception("DURATION_TOO_LONG:Az audió túl hosszú. Maximum időtartam: {$maxHours} óra.");
        }
    }
    
    // SECURITY: Sanitize extension
    $outputExtension = preg_replace('/[^a-z0-9]/', '', $originalExtension);
    if (empty($outputExtension)) {
        $outputExtension = 'mp3';
    }
    
    // Generate unique filename and save original file as-is (no conversion)
    $outputFilename = generateAudioFilename($originalName, $outputExtension);
    $outputPath = $uploadDir . $outputFilename;
    
    if (!move_uploaded_file($tmpPath, $outputPath)) {
        if (!copy($tmpPath, $outputPath)) {
            throw new Exception('SAVE_FAILED:Nem sikerült menteni az audio fájlt.');
        }
    }
    
    $result = [
        'filename' => $outputFilename,
        'converted' => false,
        'duration' => $duration,
        'format' => $outputExtension,
    ];
    
    // Add metadata if available
    if ($audioInfo) {
        $result['codec'] = $audioInfo['codec'];
        $result['bitrate'] = $audioInfo['bitrate'];
        $result['channels'] = $audioInfo['channels'];
        $result['sampleRate'] = $audioInfo['sampleRate'];
    }
    
    return $result;
}

/**
 * Get audio metadata for display
 */
function getAudioMetadata(string $filePath): array {
    $info = getAudioInfo($filePath);
    
    if (!$info) {
        return [
            'duration' => null,
            'durationFormatted' => 'Ismeretlen',
            'codec' => 'Ismeretlen',
            'bitrate' => null,
            'bitrateFormatted' => 'Ismeretlen',
        ];
    }
    
    return [
        'duration' => $info['duration'],
        'durationFormatted' => formatAudioDuration($info['duration']),
        'codec' => strtoupper($info['codec']),
        'bitrate' => $info['bitrate'],
        'bitrateFormatted' => $info['bitrate'] > 0 ? round($info['bitrate'] / 1000) . ' kbps' : 'Ismeretlen',
        'channels' => $info['channels'],
        'sampleRate' => $info['sampleRate'],
    ];
}
