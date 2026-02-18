<?php
/**
 * NOMAD CMS - Image Processing Utilities
 * Functions for handling document file uploads (PDF, DOCX, etc.)
 * 
 * @security SVG files are NOT allowed by default due to XSS risk
 *           If enabled, they must be sanitized using SvgSanitizer
 */

use NomadCMS\Security\SvgSanitizer;

/**
 * Create uploads directory if it doesn't exist
 * Uses __DIR__ to ensure consistent path resolution regardless of working directory
 */
function ensureUploadDir(): void {
    // Always use __DIR__ as base to avoid production path issues
    $envDir = $_ENV['UPLOAD_DIR'] ?? '';
    
    if (!empty($envDir) && str_starts_with($envDir, '/')) {
        // Absolute path in env - use as-is
        $uploadDir = rtrim($envDir, '/') . '/';
    } else {
        // Relative path or not set - resolve from script location
        $uploadDir = __DIR__ . '/../uploads/';
    }
    
    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0755, true);
    }
}

/**
 * Get upload directory path
 * Uses __DIR__ to ensure consistent path resolution
 */
function getUploadDir(): string {
    $envDir = $_ENV['UPLOAD_DIR'] ?? '';
    
    if (!empty($envDir) && str_starts_with($envDir, '/')) {
        // Absolute path in env - use as-is
        return rtrim($envDir, '/') . '/';
    } else {
        // Relative path or not set - resolve from script location
        return __DIR__ . '/../uploads/';
    }
}

/**
 * Generate unique filename
 * @param string $originalName Original filename
 * @param string $extension File extension (default: webp)
 */
function generateFilename(string $originalName, string $extension = 'webp'): string {
    $baseName = pathinfo($originalName, PATHINFO_FILENAME);
    $baseName = preg_replace('/[^a-zA-Z0-9_-]/', '-', $baseName);
    $baseName = strtolower($baseName);
    $timestamp = time();
    $random = bin2hex(random_bytes(4));
    
    return "{$baseName}-{$timestamp}-{$random}.{$extension}";
}

/**
 * Create image resource from uploaded file
 */
function createImageFromFile(string $filePath, string $mimeType): GdImage|false {
    switch ($mimeType) {
        case 'image/jpeg':
        case 'image/jpg':
            return imagecreatefromjpeg($filePath);
        case 'image/png':
            return imagecreatefrompng($filePath);
        case 'image/gif':
            return imagecreatefromgif($filePath);
        case 'image/webp':
            return imagecreatefromwebp($filePath);
        default:
            return false;
    }
}

/**
 * Resize image maintaining aspect ratio
 */
function resizeImage(GdImage $source, int $maxWidth): GdImage {
    $origWidth = imagesx($source);
    $origHeight = imagesy($source);
    
    // If image is smaller than max width, return original
    if ($origWidth <= $maxWidth) {
        return $source;
    }
    
    // Calculate new dimensions
    $ratio = $maxWidth / $origWidth;
    $newWidth = $maxWidth;
    $newHeight = (int) round($origHeight * $ratio);
    
    // Create new image with new dimensions
    $resized = imagecreatetruecolor($newWidth, $newHeight);
    
    // Preserve transparency for PNG images
    imagealphablending($resized, false);
    imagesavealpha($resized, true);
    $transparent = imagecolorallocatealpha($resized, 0, 0, 0, 127);
    imagefill($resized, 0, 0, $transparent);
    
    // Resize with high quality resampling
    imagecopyresampled(
        $resized, $source,
        0, 0, 0, 0,
        $newWidth, $newHeight,
        $origWidth, $origHeight
    );
    
    return $resized;
}

/**
 * Process and save image as WebP
 * Uses environment variables for configuration
 * 
 * @security SVG files require explicit opt-in via ALLOW_SVG_UPLOAD=true
 *           SVG files are sanitized to remove dangerous scripts
 */
function processImage(array $file): string {
    $tmpPath = $file['tmp_name'];
    $originalName = $file['name'];
    
    $maxWidth = isset($_ENV['MAX_UPLOAD_WIDTH']) ? (int)$_ENV['MAX_UPLOAD_WIDTH'] : 5000;
    $quality = isset($_ENV['WEBP_QUALITY']) ? (int)$_ENV['WEBP_QUALITY'] : 90;
    $allowSvg = ($_ENV['ALLOW_SVG_UPLOAD'] ?? 'false') === 'true';
    
    // Use helper function for consistent path resolution
    $uploadDir = getUploadDir();
    
    // SECURITY: Validate file type using server-side detection, NOT client-provided type
    // The client-provided $file['type'] can be spoofed by attackers
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mimeType = finfo_file($finfo, $tmpPath);
    finfo_close($finfo);
    
    // SVG special handling - SECURITY SENSITIVE
    if ($mimeType === 'image/svg+xml' || str_ends_with(strtolower($originalName), '.svg')) {
        if (!$allowSvg) {
            throw new Exception('SVG uploads are disabled for security reasons');
        }
        
        // Read and sanitize SVG content
        $svgContent = file_get_contents($tmpPath);
        if ($svgContent === false) {
            throw new Exception('Failed to read SVG file');
        }
        
        try {
            // Check for obvious dangers first
            $check = SvgSanitizer::check($svgContent);
            if (!$check['safe']) {
                error_log('[SECURITY] Dangerous SVG upload blocked: ' . implode(', ', $check['issues']));
                throw new Exception('SVG contains potentially dangerous content');
            }
            
            // Sanitize to be extra safe
            $sanitizedSvg = SvgSanitizer::sanitize($svgContent);
            
            // Generate filename and save
            $outputFilename = generateFilename($originalName, 'svg');
            $outputPath = $uploadDir . $outputFilename;
            
            if (file_put_contents($outputPath, $sanitizedSvg) === false) {
                throw new Exception('Failed to save SVG file');
            }
            
            return $outputFilename;
        } catch (\InvalidArgumentException $e) {
            throw new Exception('Invalid SVG file: ' . $e->getMessage());
        }
    }
    
    $allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!in_array($mimeType, $allowedTypes)) {
        throw new Exception('Invalid file type. Allowed: JPG, PNG, GIF, WebP');
    }
    
    // Additional validation: verify it's actually an image using getimagesize
    $imageInfo = @getimagesize($tmpPath);
    if ($imageInfo === false) {
        throw new Exception('File is not a valid image');
    }
    
    // GIF special handling: preserve original format to keep animations
    if ($mimeType === 'image/gif') {
        $outputFilename = generateFilename($originalName, 'gif');
        $outputPath = $uploadDir . $outputFilename;
        
        // Simply copy the GIF to preserve animation frames
        if (!copy($tmpPath, $outputPath)) {
            throw new Exception('Failed to save GIF image');
        }
        
        return $outputFilename;
    }
    
    // For non-GIF images: Create image resource and convert to WebP
    $image = createImageFromFile($tmpPath, $mimeType);
    if ($image === false) {
        throw new Exception('Failed to process image');
    }
    
    // Resize if necessary
    $resized = resizeImage($image, $maxWidth);
    
    // Generate output filename
    $outputFilename = generateFilename($originalName, 'webp');
    $outputPath = $uploadDir . $outputFilename;
    
    // Save as WebP
    $success = imagewebp($resized, $outputPath, $quality);
    
    // Clean up
    imagedestroy($image);
    if ($resized !== $image) {
        imagedestroy($resized);
    }
    
    if (!$success) {
        throw new Exception('Failed to save image');
    }
    
    return $outputFilename;
}
