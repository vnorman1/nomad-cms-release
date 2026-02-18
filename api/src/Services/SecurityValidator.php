<?php
/**
 * NOMAD CMS - Security Validator for Updates
 * 
 * Handles security validation for the update system:
 * - GPG signature verification
 * - SHA-256 hash verification
 * - Path traversal prevention
 */

declare(strict_types=1);

namespace NomadCMS\Services;

use RuntimeException;

final class SecurityValidator
{
    /**
     * Verify GPG signature of manifest
     * 
     * @param string $manifestContent The manifest JSON content
     * @param string $signature The detached GPG signature
     * @param string $publicKeyPath Path to the public key file
     * @return bool True if signature is valid
     */
    public function verifyGPGSignature(
        string $manifestContent,
        string $signature,
        string $publicKeyPath
    ): bool {
        if (!extension_loaded('gnupg')) {
            throw new RuntimeException('GnuPG extension not available');
        }

        if (!file_exists($publicKeyPath)) {
            throw new RuntimeException('Public key file not found');
        }

        $gpg = new \gnupg();
        $gpg->seterrormode(\gnupg::ERROR_EXCEPTION);

        // Import the public key
        $publicKey = file_get_contents($publicKeyPath);
        $importResult = $gpg->import($publicKey);

        if ($importResult === false || empty($importResult['fingerprint'])) {
            throw new RuntimeException('Failed to import public key');
        }

        // Verify the signature
        $verifyResult = $gpg->verify($manifestContent, $signature);

        return $verifyResult !== false && isset($verifyResult[0]['validity']) && $verifyResult[0]['validity'] >= \gnupg::VALIDITY_MARGINAL;
    }

    /**
     * Verify SHA-256 hash of file content
     * 
     * @param string $content The file content
     * @param string $expectedHash The expected SHA-256 hash
     * @return bool True if hash matches
     */
    public function verifyFileHash(string $content, string $expectedHash): bool
    {
        $actualHash = hash('sha256', $content);
        return hash_equals($expectedHash, $actualHash);
    }

    /**
     * Verify SHA-256 hash of a file
     * 
     * @param string $filePath Path to the file
     * @param string $expectedHash The expected SHA-256 hash
     * @return bool True if hash matches
     */
    public function verifyFileHashFromPath(string $filePath, string $expectedHash): bool
    {
        if (!file_exists($filePath)) {
            return false;
        }

        $actualHash = hash_file('sha256', $filePath);
        return hash_equals($expectedHash, $actualHash);
    }

    /**
     * Check if a path is safe (no path traversal attacks)
     * 
     * @param string $path The path to validate
     * @return bool True if path is safe
     */
    public function isPathSafe(string $path): bool
    {
        // Reject path traversal attempts
        if (str_contains($path, '..')) {
            return false;
        }

        // Reject absolute paths
        if (str_starts_with($path, '/') || str_starts_with($path, '\\')) {
            return false;
        }

        // Reject Windows drive letters
        if (preg_match('/^[a-zA-Z]:/', $path)) {
            return false;
        }

        // Reject special characters that could be problematic
        if (preg_match('/[<>:"|?*\x00-\x1F]/', $path)) {
            return false;
        }

        // Reject null bytes
        if (str_contains($path, "\0")) {
            return false;
        }

        return true;
    }

    /**
     * Validate all paths in a manifest
     * 
     * @param array $manifest The manifest data
     * @return array List of invalid paths (empty if all valid)
     */
    public function validateManifestPaths(array $manifest): array
    {
        $invalidPaths = [];

        // Check files
        foreach (array_keys($manifest['files'] ?? []) as $path) {
            if (!$this->isPathSafe($path)) {
                $invalidPaths[] = $path;
            }
        }

        // Check deleted files
        foreach ($manifest['deleted'] ?? [] as $path) {
            if (!$this->isPathSafe($path)) {
                $invalidPaths[] = $path;
            }
        }

        return $invalidPaths;
    }

    /**
     * Verify checksums.sha256 file format and content
     * 
     * @param string $checksumContent Content of checksums.sha256
     * @param string $manifestContent The manifest content to verify
     * @return bool True if valid
     */
    public function verifyChecksumFile(string $checksumContent, string $manifestContent): bool
    {
        // Format: "hash  filename" (two spaces between hash and filename)
        $lines = explode("\n", trim($checksumContent));
        $manifestVerified = false;
        
        foreach ($lines as $line) {
            if (empty(trim($line))) {
                continue;
            }

            // Parse checksum line
            if (!preg_match('/^([a-f0-9]{64})\s{2}(.+)$/', $line, $matches)) {
                return false;
            }

            $expectedHash = $matches[1];
            $filename = $matches[2];

            if ($filename === 'manifest.json') {
                if (!$this->verifyFileHash($manifestContent, $expectedHash)) {
                    return false;
                }
                $manifestVerified = true;
            }
        }

        // Fail if the checksum file had no entry for manifest.json
        return $manifestVerified;
    }
}
