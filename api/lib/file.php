<?php
/**
 * NOMAD CMS - File Processing Utilities
 * Functions for handling document file uploads (PDF, DOCX, etc.)
 * Supports both regular and AES-256 encrypted file storage
 */

declare(strict_types=1);

use NomadCMS\Security\EncryptionService;

// Default allowed file extensions
const DEFAULT_ALLOWED_EXTENSIONS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'zip', 'csv'];

// Default max file size in MB
const DEFAULT_MAX_SIZE_MB = 25;

/**
 * SECURITY: Dangerous extensions that are ALWAYS blocked regardless of allowedTypes
 * This prevents RCE even if an attacker manages to inject malicious allowedTypes
 * These cannot be bypassed by any API parameter
 */
const DANGEROUS_EXTENSIONS = [
    // PHP variants (most critical for Apache/nginx + PHP-FPM)
    'php', 'php3', 'php4', 'php5', 'php7', 'php8',
    'phtml', 'phar', 'phps', 'pht', 'phpt',
    // Other server-side scripts
    'asp', 'aspx', 'asa', 'asax', 'ascx', 'ashx', 'asmx', 'axd',
    'jsp', 'jspx', 'jsf', 'jspa', 'jspf',
    'cgi', 'pl', 'plx', 'pm', 'perl',
    'py', 'pyc', 'pyo', 'pyw',
    'rb', 'rbw', 'erb',
    'cfm', 'cfml', 'cfc',
    // Shell scripts
    'sh', 'bash', 'zsh', 'ksh', 'csh',
    'bat', 'cmd', 'com', 'ps1', 'psm1',
    // Executables
    'exe', 'msi', 'dll', 'scr', 'pif',
    'app', 'dmg', 'elf', 'bin', 'run',
    // Web server config files
    'htaccess', 'htpasswd', 'conf', 'config',
    // Template engines (could be executed)
    'twig', 'blade', 'mustache', 'hbs', 'ejs',
    // Java
    'class', 'jar', 'war', 'ear',
    // Special file types
    'svg',  // Can contain JavaScript (XSS)
    'shtml', 'stm', 'shtm',  // SSI
    'mht', 'mhtml',  // Can bypass filters
];

// MIME type mapping for allowed extensions
const MIME_TYPES = [
    'pdf'  => ['application/pdf', 'application/x-pdf', 'application/octet-stream'],
    'doc'  => ['application/msword', 'application/octet-stream'],
    'docx' => ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/octet-stream'],
    'xls'  => ['application/vnd.ms-excel', 'application/octet-stream'],
    'xlsx' => ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/octet-stream'],
    'txt'  => ['text/plain'],
    'zip'  => ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'],
    'csv'  => ['text/csv', 'application/csv', 'text/plain'],
    // 3D Model formats
    'glb'  => ['model/gltf-binary', 'application/octet-stream'],
    'gltf' => ['model/gltf+json', 'application/json', 'application/octet-stream'],
    'obj'  => ['model/obj', 'text/plain', 'application/octet-stream'],
    'fbx'  => ['application/octet-stream'],
    'stl'  => ['model/stl', 'application/sla', 'application/octet-stream'],
    'usdz' => ['model/vnd.usdz+zip', 'application/octet-stream'],  // Apple AR format
    // CAD formats
    'dwg'  => ['application/acad', 'image/vnd.dwg', 'application/octet-stream'],
    'dxf'  => ['application/dxf', 'image/vnd.dxf', 'application/octet-stream'],
    // JSON data files
    'json' => ['application/json', 'text/json'],
    // XML data files  
    'xml'  => ['application/xml', 'text/xml'],
    // Fonts
    'woff'  => ['font/woff', 'application/font-woff'],
    'woff2' => ['font/woff2', 'application/font-woff2'],
    'ttf'   => ['font/ttf', 'application/x-font-ttf'],
    'otf'   => ['font/otf', 'application/x-font-otf'],
    // E-books
    'epub' => ['application/epub+zip'],
    'mobi' => ['application/x-mobipocket-ebook'],
    // Archives
    'rar'  => ['application/vnd.rar', 'application/x-rar-compressed'],
    '7z'   => ['application/x-7z-compressed'],
    'tar'  => ['application/x-tar'],
    'gz'   => ['application/gzip', 'application/x-gzip'],
];

/**
 * Get base directory for file uploads
 * Uses __DIR__ to ensure consistent path resolution regardless of working directory
 */
function getFileBaseDir(): string {
    $envDir = $_ENV['FILE_UPLOAD_DIR'] ?? '';
    
    if (!empty($envDir) && str_starts_with($envDir, '/')) {
        // Absolute path in env - use as-is
        return rtrim($envDir, '/') . '/';
    } else {
        // Relative path or not set - resolve from script location
        return __DIR__ . '/../files/';
    }
}

/**
 * Ensure file upload directories exist
 */
function ensureFileUploadDirs(): void {
    $baseDir = getFileBaseDir();
    $publicDir = $baseDir . 'public/';
    $secureDir = $baseDir . 'secure/';
    
    foreach ([$baseDir, $publicDir, $secureDir] as $dir) {
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
    }
}

/**
 * Get file directories
 */
function getFileDirectories(): array {
    $baseDir = getFileBaseDir();
    return [
        'base' => $baseDir,
        'public' => $baseDir . 'public/',
        'secure' => $baseDir . 'secure/',
    ];
}

/**
 * Generate unique filename for file storage
 * @param string $originalName Original filename
 */
function generateFileFilename(string $originalName): string {
    $extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
    $baseName = pathinfo($originalName, PATHINFO_FILENAME);
    $baseName = preg_replace('/[^a-zA-Z0-9_-]/', '-', $baseName);
    $baseName = strtolower($baseName);
    $timestamp = time();
    $random = bin2hex(random_bytes(4));
    
    return "{$baseName}-{$timestamp}-{$random}.{$extension}";
}

/**
 * Validate file type and size
 * @param array $file $_FILES array element
 * @param array $allowedTypes Allowed extensions (e.g., ['pdf', 'docx'])
 * @param int $maxSizeMB Maximum size in MB
 * @throws Exception on validation failure
 */
function validateFile(array $file, array $allowedTypes = [], int $maxSizeMB = DEFAULT_MAX_SIZE_MB): void {
    // Use defaults if not specified
    $allowedTypes = !empty($allowedTypes) ? $allowedTypes : DEFAULT_ALLOWED_EXTENSIONS;
    
    // Check file was uploaded properly
    if (!isset($file['tmp_name']) || !is_uploaded_file($file['tmp_name'])) {
        throw new Exception('No file uploaded or invalid upload');
    }
    
    // Check file size
    $maxBytes = $maxSizeMB * 1024 * 1024;
    if ($file['size'] > $maxBytes) {
        throw new Exception("File too large. Maximum size: {$maxSizeMB}MB");
    }
    
    // Get extension from original filename
    $extension = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    
    // ========================================================================
    // SECURITY CRITICAL: Block dangerous extensions BEFORE checking whitelist
    // This prevents RCE even if attacker injects php into allowedTypes
    // THIS CHECK CANNOT BE BYPASSED BY ANY API PARAMETER
    // ========================================================================
    if (in_array($extension, DANGEROUS_EXTENSIONS, true)) {
        error_log("[SECURITY] BLOCKED dangerous file extension upload attempt: {$extension}, file: {$file['name']}");
        throw new Exception('This file type is not allowed for security reasons');
    }
    
    // Also check for double extensions (e.g., shell.php.jpg)
    $filename = strtolower($file['name']);
    foreach (DANGEROUS_EXTENSIONS as $dangerousExt) {
        if (strpos($filename, '.' . $dangerousExt . '.') !== false) {
            error_log("[SECURITY] BLOCKED double extension attack: {$file['name']}");
            throw new Exception('This file type is not allowed for security reasons');
        }
    }
    
    // Check null byte injection (file.php%00.jpg bypass attempt)
    if (strpos($file['name'], "\0") !== false) {
        error_log("[SECURITY] BLOCKED null byte injection in filename: " . bin2hex($file['name']));
        throw new Exception('Invalid filename');
    }
    
    // Now check whitelist
    if (!in_array($extension, $allowedTypes)) {
        throw new Exception('Invalid file type. Allowed: ' . implode(', ', $allowedTypes));
    }
    
    // SECURITY: Validate MIME type using server-side detection
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $detectedMime = finfo_file($finfo, $file['tmp_name']);
    finfo_close($finfo);
    
    // SECURITY: Block dangerous MIME types regardless of extension
    $dangerousMimes = [
        'application/x-php', 'application/php', 'text/x-php',
        'application/x-httpd-php', 'application/x-httpd-php-source',
        'application/x-shellscript', 'application/x-sh', 'application/x-csh',
        'application/x-perl', 'application/x-python', 'application/x-ruby',
        'application/x-executable', 'application/x-msdos-program',
    ];
    
    if (in_array($detectedMime, $dangerousMimes, true)) {
        error_log("[SECURITY] BLOCKED dangerous MIME type: {$detectedMime}, file: {$file['name']}");
        throw new Exception('This file type is not allowed for security reasons');
    }
    
    // Check if detected MIME matches allowed types
    $allowedMimes = [];
    foreach ($allowedTypes as $ext) {
        if (isset(MIME_TYPES[$ext])) {
            $allowedMimes = array_merge($allowedMimes, MIME_TYPES[$ext]);
        }
    }
    
    if (!in_array($detectedMime, $allowedMimes)) {
        error_log("[File Upload] MIME mismatch: detected=$detectedMime, allowed=" . implode(',', $allowedMimes));
        throw new Exception("Invalid file content. Detected MIME: $detectedMime");
    }
}

/**
 * Process and store a regular (non-encrypted) file
 * Stateless: filename is the identifier, no mapping needed
 * @param array $file $_FILES array element
 * @param array $allowedTypes Allowed extensions
 * @param int $maxSizeMB Maximum size in MB
 * @return array File info [filename, url, prettyUrl, size, originalName]
 */
function processFile(array $file, array $allowedTypes = [], int $maxSizeMB = DEFAULT_MAX_SIZE_MB): array {
    // Validate
    validateFile($file, $allowedTypes, $maxSizeMB);
    
    // Ensure directories exist
    ensureFileUploadDirs();
    $dirs = getFileDirectories();
    
    // Generate filename and move file
    $filename = generateFileFilename($file['name']);
    $destination = $dirs['public'] . $filename;
    
    if (!move_uploaded_file($file['tmp_name'], $destination)) {
        throw new Exception('Failed to save file');
    }
    
    // Pretty URL: /{ext}/{filename} - stateless, no mapping needed
    $extension = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
    $prettyUrl = "/{$extension}/{$filename}";
    
    return [
        'filename' => $filename,
        'url' => '/api/files/public/' . $filename,
        'prettyUrl' => $prettyUrl,
        'size' => $file['size'],
        'originalName' => $file['name'],
        'encrypted' => false,
    ];
}

/**
 * Process and store an encrypted file (AES-256)
 * Uses streaming encryption - MEMORY SAFE for large files
 * Stateless: filename is the identifier, metadata inside .nomad file
 * @param array $file $_FILES array element
 * @param array $allowedTypes Allowed extensions
 * @param int $maxSizeMB Maximum size in MB
 * @return array File info [filename, url, prettyUrl, size, originalName, encrypted]
 */
function processSecureFile(array $file, array $allowedTypes = [], int $maxSizeMB = DEFAULT_MAX_SIZE_MB): array {
    // Validate
    validateFile($file, $allowedTypes, $maxSizeMB);
    
    // Check encryption is configured
    if (!EncryptionService::isConfigured()) {
        throw new Exception('Encryption not configured. Cannot process secure file.');
    }
    
    // Ensure directories exist
    ensureFileUploadDirs();
    $dirs = getFileDirectories();
    
    // Get MIME type before processing (file may be moved)
    $mimeType = mime_content_type($file['tmp_name']) ?: 'application/octet-stream';
    
    // Generate filename
    $filename = generateFileFilename($file['name']);
    $destination = $dirs['secure'] . $filename . '.nomad';
    
    // Prepare metadata
    $metadata = [
        'originalName' => $file['name'],
        'mimeType' => $mimeType,
        'originalSize' => $file['size'],
    ];
    
    // STREAMING ENCRYPTION: Memory-safe, uses disk I/O
    // This uses Defuse File::encryptFile() internally
    EncryptionService::encryptFileStreaming($file['tmp_name'], $destination, $metadata);
    
    // Pretty URL: /secure-{ext}/{filename} - stateless, no mapping needed
    $extension = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
    $prettyUrl = "/secure-{$extension}/{$filename}";
    
    return [
        'filename' => $filename,
        'url' => '/api/files/secure/' . $filename,
        'prettyUrl' => $prettyUrl,
        'size' => $file['size'],
        'originalName' => $file['name'],
        'encrypted' => true,
    ];
}

/**
 * Decrypt and return a secure file for download
 * Supports both new binary .nomad format and legacy JSON .nomad format
 * 
 * MEMORY-SAFE: Returns path to decrypted temp file instead of content in RAM
 * Caller is responsible for deleting the temp file after use!
 * 
 * @param string $filename The stored filename (without extension)
 * @param bool $streamMode If true, returns temp file path (memory-safe). If false, returns content (legacy).
 * @return array [content|tempPath, metadata, isStreamed]
 */
function getSecureFile(string $filename, bool $streamMode = true): array {
    $dirs = getFileDirectories();
    
    // Security: prevent path traversal
    if (strpos($filename, '..') !== false || strpos($filename, '/') !== false) {
        throw new Exception('Invalid filename');
    }
    
    // Try new .nomad format first
    $nomadPath = $dirs['secure'] . $filename . '.nomad';
    if (file_exists($nomadPath)) {
        // Check if binary format (new) or JSON format (legacy)
        if (EncryptionService::isNomadBinaryFormat($nomadPath)) {
            // NEW BINARY FORMAT: Stream-decrypt to temp file
            $tempDecrypted = sys_get_temp_dir() . '/nomad_download_' . bin2hex(random_bytes(8));
            
            try {
                $metadata = EncryptionService::decryptFileStreaming($nomadPath, $tempDecrypted);
                
                if ($streamMode) {
                    return [
                        'tempPath' => $tempDecrypted,
                        'metadata' => $metadata,
                        'isStreamed' => true,
                    ];
                } else {
                    // Legacy mode: read content (not recommended for large files)
                    $content = file_get_contents($tempDecrypted);
                    @unlink($tempDecrypted);
                    return [
                        'content' => $content,
                        'metadata' => $metadata,
                        'isStreamed' => false,
                    ];
                }
            } catch (Exception $e) {
                @unlink($tempDecrypted);
                throw $e;
            }
        } else {
            // LEGACY JSON FORMAT: Load and decrypt in memory (backward compat)
            $nomadContent = file_get_contents($nomadPath);
            if ($nomadContent === false) {
                throw new Exception('Failed to read file');
            }
            
            $nomadFile = json_decode($nomadContent, true);
            if (!$nomadFile || !isset($nomadFile['encrypted'])) {
                throw new Exception('Invalid file format');
            }
            
            $encryptedContent = base64_decode($nomadFile['encrypted']);
            $content = EncryptionService::decrypt($encryptedContent);
            
            if ($streamMode) {
                // Write to temp file for consistent API
                $tempDecrypted = sys_get_temp_dir() . '/nomad_download_' . bin2hex(random_bytes(8));
                file_put_contents($tempDecrypted, $content);
                return [
                    'tempPath' => $tempDecrypted,
                    'metadata' => $nomadFile['metadata'] ?? [],
                    'isStreamed' => true,
                ];
            } else {
                return [
                    'content' => $content,
                    'metadata' => $nomadFile['metadata'] ?? [],
                    'isStreamed' => false,
                ];
            }
        }
    }
    
    // Fallback to legacy .enc format
    $encPath = $dirs['secure'] . $filename . '.enc';
    $metaPath = $encPath . '.meta';
    
    if (!file_exists($encPath)) {
        throw new Exception('File not found');
    }
    
    $encryptedContent = file_get_contents($encPath);
    if ($encryptedContent === false) {
        throw new Exception('Failed to read file');
    }
    
    $content = EncryptionService::decrypt($encryptedContent);
    
    $metadata = [];
    if (file_exists($metaPath)) {
        $metadata = json_decode(file_get_contents($metaPath), true) ?: [];
    }
    
    if ($streamMode) {
        // Write to temp file for consistent API
        $tempDecrypted = sys_get_temp_dir() . '/nomad_download_' . bin2hex(random_bytes(8));
        file_put_contents($tempDecrypted, $content);
        return [
            'tempPath' => $tempDecrypted,
            'metadata' => $metadata,
            'isStreamed' => true,
        ];
    } else {
        return [
            'content' => $content,
            'metadata' => $metadata,
            'isStreamed' => false,
        ];
    }
}

/**
 * Legacy wrapper for getSecureFile - returns content directly
 * @deprecated Use getSecureFile with streamMode=true for large files
 */
function getSecureFileContent(string $filename): array {
    return getSecureFile($filename, false);
}

/**
 * Delete a file (public or secure)
 * @param string $url File URL (e.g., /api/files/public/file.pdf or /api/files/secure/file.pdf)
 * @return bool Success
 */
function deleteFile(string $url): bool {
    $dirs = getFileDirectories();
    
    // Determine if public or secure
    if (strpos($url, '/api/files/public/') === 0) {
        $filename = basename($url);
        $filePath = $dirs['public'] . $filename;
    } elseif (strpos($url, '/api/files/secure/') === 0) {
        $filename = basename($url);
        
        // Try new .nomad format first
        $nomadPath = $dirs['secure'] . $filename . '.nomad';
        if (file_exists($nomadPath)) {
            return unlink($nomadPath);
        }
        
        // Fallback to legacy format
        $filePath = $dirs['secure'] . $filename . '.enc';
        $metaPath = $filePath . '.meta';
        
        if (file_exists($metaPath)) {
            unlink($metaPath);
        }
    } else {
        return false;
    }
    
    // Security: prevent path traversal
    if (strpos($filename, '..') !== false) {
        return false;
    }
    
    if (file_exists($filePath)) {
        return unlink($filePath);
    }
    
    return true; // Already deleted
}

/**
 * Get file info without loading content
 * Supports v3 (minimal header), v2 (cleartext metadata), and legacy JSON format
 * 
 * NOTE: For v3 format, sensitive metadata (mimeType, originalName, size) is encrypted.
 * Only the 'type' field is available without decryption.
 * 
 * @param string $url File URL
 * @return array|null File info or null if not found
 */
function getFileInfo(string $url): ?array {
    $dirs = getFileDirectories();
    
    if (strpos($url, '/api/files/public/') === 0) {
        $filename = basename($url);
        $filePath = $dirs['public'] . $filename;
        
        if (!file_exists($filePath)) {
            return null;
        }
        
        return [
            'filename' => $filename,
            'url' => $url,
            'size' => filesize($filePath),
            'encrypted' => false,
            'mimeType' => mime_content_type($filePath) ?: 'application/octet-stream',
        ];
    } elseif (strpos($url, '/api/files/secure/') === 0) {
        $filename = basename($url);
        
        // Try new .nomad format first
        $nomadPath = $dirs['secure'] . $filename . '.nomad';
        if (file_exists($nomadPath)) {
            // Read header info (type and version)
            $headerInfo = EncryptionService::readNomadHeader($nomadPath);
            
            if ($headerInfo !== null) {
                $version = $headerInfo['version'] ?? 0;
                
                if ($version === EncryptionService::NOMAD_VERSION_BINARY) {
                    // v3 format: Only type available in cleartext
                    // Sensitive metadata is encrypted
                    return [
                        'filename' => $filename,
                        'url' => $url,
                        'encrypted' => true,
                        'type' => $headerInfo['type'] ?? 'secure_file',
                        'format' => 'v3',
                        // Note: size, mimeType, originalName are encrypted in v3
                        // They will be available after decryption
                    ];
                } elseif ($version === EncryptionService::NOMAD_VERSION_V2) {
                    // v2 format: Full metadata in cleartext (legacy)
                    return [
                        'filename' => $filename,
                        'url' => $url,
                        'size' => $headerInfo['originalSize'] ?? 0,
                        'encrypted' => true,
                        'mimeType' => $headerInfo['mimeType'] ?? 'application/octet-stream',
                        'originalName' => $headerInfo['originalName'] ?? $filename,
                        'type' => $headerInfo['type'] ?? 'secure_file',
                        'format' => 'v2',
                    ];
                }
            }
            
            // Legacy JSON format - fallback
            $nomadContent = json_decode(file_get_contents($nomadPath), true);
            $legacyMetadata = $nomadContent['metadata'] ?? [];
            
            return [
                'filename' => $filename,
                'url' => $url,
                'size' => $legacyMetadata['originalSize'] ?? 0,
                'encrypted' => true,
                'mimeType' => $legacyMetadata['mimeType'] ?? 'application/octet-stream',
                'originalName' => $legacyMetadata['originalName'] ?? $filename,
                'format' => 'v1_json',
            ];
        }
        
        // Fallback to legacy .enc format
        $filePath = $dirs['secure'] . $filename . '.enc';
        $metaPath = $filePath . '.meta';
        
        if (!file_exists($filePath)) {
            return null;
        }
        
        $metadata = [];
        if (file_exists($metaPath)) {
            $metadata = json_decode(file_get_contents($metaPath), true) ?: [];
        }
        
        return [
            'filename' => $filename,
            'url' => $url,
            'size' => $metadata['originalSize'] ?? filesize($filePath),
            'encrypted' => true,
            'mimeType' => $metadata['mimeType'] ?? 'application/octet-stream',
            'originalName' => $metadata['originalName'] ?? $filename,
            'format' => 'legacy_enc',
        ];
    }
    
    return null;
}

// ============================================================================
// SIGNED URL FUNCTIONS FOR STATELESS AUTHENTICATION
// ============================================================================

/**
 * Generate a signed URL for secure file download
 * Uses HMAC-SHA256 with the encryption key for signature
 * @param string $filename The filename
 * @param int $expiresIn Expiration time in seconds (default: 1 hour)
 * @return string The signed URL query string (sig=...&exp=...)
 */
function generateSignedUrlParams(string $filename, int $expiresIn = 3600): string {
    $expires = time() + $expiresIn;
    $data = $filename . ':' . $expires;
    
    // Use encryption key from env for signing
    $secret = $_ENV['ENCRYPTION_KEY'] ?? '';
    if (empty($secret)) {
        throw new Exception('ENCRYPTION_KEY not configured');
    }
    
    $signature = hash_hmac('sha256', $data, $secret);
    
    return 'sig=' . $signature . '&exp=' . $expires;
}

/**
 * Verify a signed URL signature
 * @param string $filename The filename
 * @param string $signature The signature from URL
 * @param int $expires The expiration timestamp from URL
 * @return bool True if valid and not expired
 */
function verifySignedUrl(string $filename, string $signature, int $expires): bool {
    // Check expiration
    if (time() > $expires) {
        return false;
    }
    
    $data = $filename . ':' . $expires;
    
    $secret = $_ENV['ENCRYPTION_KEY'] ?? '';
    if (empty($secret)) {
        return false;
    }
    
    $expectedSignature = hash_hmac('sha256', $data, $secret);
    
    return hash_equals($expectedSignature, $signature);
}

/**
 * Generate full download URL with signature
 * @param string $filename The filename
 * @param int $expiresIn Expiration time in seconds
 * @return string Full URL path
 */
function getSecureDownloadUrl(string $filename, int $expiresIn = 3600): string {
    $signedParams = generateSignedUrlParams($filename, $expiresIn);
    return '/api/endpoints/file-download.php?file=' . urlencode($filename) . '&type=secure&' . $signedParams;
}
