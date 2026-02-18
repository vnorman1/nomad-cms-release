#!/usr/bin/env php
<?php
/**
 * NOMAD CMS - Manifest Generator
 * 
 * Generates manifest.json for releases, containing:
 * - Version information
 * - SHA-256 hashes for all distributable files
 * - File sizes and modification dates
 * 
 * Usage:
 *   php generate-manifest.php [version]
 * 
 * Example:
 *   php generate-manifest.php v1.2.0 > manifest.json
 */

declare(strict_types=1);

// Configuration
// If a second argument is provided, use it as the base path to scan
// This allows scanning the built package instead of source tree
if (isset($argv[2]) && is_dir($argv[2])) {
    $basePath = realpath($argv[2]);
    fwrite(STDERR, "Scanning build directory: $basePath\n");
} else {
    $basePath = realpath(__DIR__ . '/..');
    fwrite(STDERR, "Scanning source directory: $basePath\n");
}
if (!$basePath) {
    fwrite(STDERR, "Error: Could not determine base path\n");
    exit(1);
}

// Protected paths that should not be included in manifest
$protectedPaths = [
    '.env',
    '.env.example',
    'databases/',
    'uploads/',
    'keys/',
    'logs/',
    'backups/',
    'temp/',
    'files/',
    'nomad-install.lock',
    'vendor/',
    '.git/',
    '.github/',
    'node_modules/',
    '.DS_Store',
];

// Get version from command line or VERSION file
$version = $argv[1] ?? null;
if (!$version) {
    $versionFile = $basePath . '/VERSION';
    if (file_exists($versionFile)) {
        $version = trim(file_get_contents($versionFile));
    } else {
        $version = 'unknown';
    }
}

// Normalize version: strip 'v' prefix for clean semver
// Tags are "v1.2.0" but manifest should store "1.2.0"
$version = ltrim($version, 'v');

/**
 * Check if path should be excluded
 */
function isProtected(string $path, array $protectedPaths): bool
{
    foreach ($protectedPaths as $protected) {
        if (str_starts_with($path, $protected)) {
            return true;
        }
        // Also check basename for files like .DS_Store
        if (basename($path) === $protected) {
            return true;
        }
    }
    return false;
}

/**
 * Scan directory and build file list
 */
function scanFiles(string $basePath, array $protectedPaths): array
{
    $files = [];

    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($basePath, FilesystemIterator::SKIP_DOTS)
    );

    foreach ($iterator as $file) {
        if ($file->isDir()) {
            continue;
        }

        $absolutePath = $file->getPathname();
        $relativePath = ltrim(substr($absolutePath, strlen($basePath)), '/\\');

        // Skip protected paths
        if (isProtected($relativePath, $protectedPaths)) {
            continue;
        }

        // Skip hidden files (except specific ones)
        $parts = explode('/', $relativePath);
        $hasHidden = false;
        foreach ($parts as $part) {
            if (str_starts_with($part, '.') && $part !== '.htaccess') {
                $hasHidden = true;
                break;
            }
        }
        if ($hasHidden) {
            continue;
        }

        $files[$relativePath] = [
            'hash' => hash_file('sha256', $absolutePath),
            'size' => $file->getSize(),
            'modified' => date('c', $file->getMTime()),
        ];
    }

    // Sort for consistent output
    ksort($files);

    return $files;
}

// Build manifest
$manifest = [
    'version' => $version,
    'build_date' => date('c'),
    'base_version' => null,
    'files' => scanFiles($basePath, $protectedPaths),
    'deleted' => [],
    'migrations' => [],
    'signature' => null, // To be added by GPG signing step
];

// Count stats
$totalFiles = count($manifest['files']);
$totalSize = array_sum(array_column($manifest['files'], 'size'));

// Output manifest
echo json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);

// Log stats to stderr
fwrite(STDERR, sprintf(
    "Generated manifest for %s: %d files, %s total\n",
    $version,
    $totalFiles,
    formatBytes($totalSize)
));

/**
 * Format bytes to human readable
 */
function formatBytes(int $bytes): string
{
    $units = ['B', 'KB', 'MB', 'GB'];
    $unitIndex = 0;
    $size = (float)$bytes;

    while ($size >= 1024 && $unitIndex < count($units) - 1) {
        $size /= 1024;
        $unitIndex++;
    }

    return sprintf('%.2f %s', $size, $units[$unitIndex]);
}
