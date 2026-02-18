<?php
/**
 * NOMAD CMS - Video Processing Utilities
 * Functions for handling video file uploads
 * 
 * NO CONVERSION - Videos are saved as-is (original format preserved)
 * Modern browsers support MP4, WebM, and most common formats natively.
 * 
 * Features:
 * - Server-side MIME type validation
 * - FFprobe metadata extraction (optional, for duration/resolution)
 * - Sanitized filenames
 * - Resource-safe (no CPU-intensive FFmpeg conversion)
 * 
 * LIMITS:
 * - Max resolution: 8K (7680x4320) - checked if FFprobe available
 * - Max duration: 12 hours - checked if FFprobe available
 */

declare(strict_types=1);

// Constants - hardcoded limits
define('VIDEO_MAX_WIDTH', 7680);    // 8K width
define('VIDEO_MAX_HEIGHT', 4320);   // 8K height
define('VIDEO_MAX_DURATION', 43200); // 12 hours in seconds

// Cache FFprobe availability check
$_ffprobeAvailableCache = null;

/**
 * Check if FFprobe is available for metadata extraction (cached)
 */
function isFFprobeAvailable(): bool {
    global $_ffprobeAvailableCache;
    
    if ($_ffprobeAvailableCache !== null) {
        return $_ffprobeAvailableCache;
    }
    
    $output = [];
    $returnCode = 0;
    @exec('ffprobe -version 2>&1', $output, $returnCode);
    $_ffprobeAvailableCache = ($returnCode === 0);
    return $_ffprobeAvailableCache;
}

/**
 * Get video info using FFprobe
 * @return array{duration: float, width: int, height: int, codec: string}|null
 */
function getVideoInfo(string $filePath): ?array {
    if (!isFFprobeAvailable()) {
        return null; // Can't check without ffprobe
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
    
    // Find video stream
    $videoStream = null;
    foreach ($data['streams'] as $stream) {
        if ($stream['codec_type'] === 'video') {
            $videoStream = $stream;
            break;
        }
    }
    
    if (!$videoStream) {
        return null;
    }
    
    return [
        'duration' => (float) ($data['format']['duration'] ?? 0),
        'width' => (int) ($videoStream['width'] ?? 0),
        'height' => (int) ($videoStream['height'] ?? 0),
        'codec' => $videoStream['codec_name'] ?? 'unknown',
    ];
}

/**
 * Process video file - SAVES ORIGINAL FORMAT (no conversion)
 * 
 * @param array $file $_FILES['video'] array
 * @return array{filename: string, converted: bool, duration?: float, resolution?: string}
 * @throws Exception on critical failure
 */
function processVideo(array $file): array {
    $tmpPath = $file['tmp_name'];
    $originalName = $file['name'];
    $originalExtension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
    
    // Get upload directory
    $envDir = $_ENV['UPLOAD_DIR'] ?? '';
    if (!empty($envDir) && str_starts_with($envDir, '/')) {
        $uploadDir = rtrim($envDir, '/') . '/';
    } else {
        $uploadDir = __DIR__ . '/../uploads/';
    }
    
    // Ensure upload directory exists
    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0755, true);
    }
    
    // SECURITY: Validate file type using server-side detection
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mimeType = finfo_file($finfo, $tmpPath);
    finfo_close($finfo);
    
    $allowedTypes = [
        'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo',
        'video/x-matroska', 'video/x-ms-wmv', 'video/x-flv', 'video/mpeg',
        'video/3gpp', 'video/3gpp2', 'video/ogg'
    ];
    
    if (!in_array($mimeType, $allowedTypes)) {
        throw new Exception('Invalid video file type. Allowed: MP4, WebM, MOV, AVI, MKV, WMV, FLV');
    }
    
    // Get video info if ffprobe is available (optional metadata)
    $videoInfo = getVideoInfo($tmpPath);
    
    // Check resolution limit (8K max)
    if ($videoInfo) {
        if ($videoInfo['width'] > VIDEO_MAX_WIDTH || $videoInfo['height'] > VIDEO_MAX_HEIGHT) {
            throw new Exception('RESOLUTION_TOO_HIGH:' . $videoInfo['width'] . 'x' . $videoInfo['height']);
        }
        
        // Check duration limit (12 hours max)
        if ($videoInfo['duration'] > VIDEO_MAX_DURATION) {
            $maxHours = VIDEO_MAX_DURATION / 3600;
            throw new Exception("Video is too long. Maximum duration: {$maxHours} hours");
        }
    }
    
    // Save original file as-is (no conversion)
    $outputFilename = generateVideoFilename($originalName, $originalExtension);
    $outputPath = $uploadDir . $outputFilename;
    
    if (!move_uploaded_file($tmpPath, $outputPath)) {
        // Fallback to copy if move fails
        if (!copy($tmpPath, $outputPath)) {
            throw new Exception('Failed to save video file');
        }
    }
    
    $result = [
        'filename' => $outputFilename,
        'converted' => false,
        'format' => $originalExtension,
    ];
    
    // Add metadata if available
    if ($videoInfo) {
        $result['duration'] = $videoInfo['duration'];
        $result['resolution'] = $videoInfo['width'] . 'x' . $videoInfo['height'];
        $result['codec'] = $videoInfo['codec'];
    }
    
    return $result;
}

/**
 * Generate unique video filename
 */
function generateVideoFilename(string $originalName, string $extension): string {
    $baseName = pathinfo($originalName, PATHINFO_FILENAME);
    $baseName = preg_replace('/[^a-zA-Z0-9_-]/', '-', $baseName);
    $baseName = strtolower($baseName);
    // Truncate to max 50 characters to prevent filesystem issues
    $baseName = substr($baseName, 0, 50);
    // Remove trailing dashes
    $baseName = rtrim($baseName, '-');
    // Ensure not empty
    if (empty($baseName)) {
        $baseName = 'video';
    }
    $timestamp = time();
    $random = bin2hex(random_bytes(4));
    
    return "{$baseName}-{$timestamp}-{$random}.{$extension}";
}
