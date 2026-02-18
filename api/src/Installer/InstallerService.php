<?php
/**
 * NOMAD CMS - Installer Service
 * Handles secure one-click installation with atomic operations
 * 
 * Security Features:
 * - Cryptographically secure key generation (256-bit hex keys)
 * - Defuse Crypto for ENCRYPTION_KEY
 * - Argon2id password hashing via UserRepository
 * - SHA256 lock file integrity verification
 * - No credentials stored in .env
 */

declare(strict_types=1);

namespace NomadCMS\Installer;

use NomadCMS\Database\UserRepository;
use NomadCMS\Database\AuthDatabase;
use Defuse\Crypto\Key;

final class InstallerService
{
    /**
     * Lock file name - placed in api/ root
     */
    private const LOCK_FILE = 'nomad-install.lock';
    
    /**
     * Required environment variables for a fresh install
     */
    private const REQUIRED_ENV_VARS = [
        'APP_ENV',
        'APP_DEBUG',
        'APP_URL',
        'JWT_SECRET',
        'JWT_ALGORITHM',
        'ENCRYPTION_KEY',
        'PASSWORD_PEPPER',
        'SALT_PREFIX',
        'VERSIONING_HMAC_SECRET',
    ];

    /**
     * Check if installation is required
     * Returns true if NOT installed (needs installation)
     */
    public static function isInstalled(): bool
    {
        $lockPath = self::getLockFilePath();
        
        if (!file_exists($lockPath)) {
            return false;
        }
        
        // Validate lock file integrity
        return self::validateLockFile();
    }

    /**
     * Get the lock file path
     */
    private static function getLockFilePath(): string
    {
        return dirname(__DIR__, 2) . '/' . self::LOCK_FILE;
    }

    /**
     * Get lock file data if exists
     */
    public static function getLockFileData(): ?array
    {
        $lockPath = self::getLockFilePath();
        
        if (!file_exists($lockPath)) {
            return null;
        }
        
        $content = file_get_contents($lockPath);
        if ($content === false) {
            return null;
        }
        
        return json_decode($content, true);
    }

    /**
     * Generate cryptographically secure .env file
     */
    public static function generateEnvironmentFile(array $config): bool
    {
        $envPath = dirname(__DIR__, 2) . '/.env';
        
        // Get user entropy if provided (already SHA-256 hashed client-side)
        $userEntropy = $config['user_entropy'] ?? null;
        
        // Generate RSA key pair for asymmetric JWT (RS256)
        if (!self::generateRSAKeyPair()) {
            error_log('[Install] Failed to generate RSA key pair');
            return false;
        }
        
        // Generate secure random keys with optional user entropy mixing
        $jwtSecret = self::generateEntropyMixedSecret(32, $userEntropy); // 256-bit hex (64 chars)
        $passwordPepper = self::generateEntropyMixedSecret(32, $userEntropy); // 256-bit hex
        $saltPrefix = self::generateEntropyMixedSecret(16, $userEntropy); // 128-bit hex
        $sessionSecret = self::generateEntropyMixedSecret(32, $userEntropy); // For session encryption
        $ipHashSecret = self::generateEntropyMixedSecret(32, $userEntropy); // For IP hashing (HMAC)
        $versioningHmacSecret = self::generateEntropyMixedSecret(32, $userEntropy); // For versioning HMAC
        $updateProgressSecret = self::generateEntropyMixedSecret(32, $userEntropy); // For update progress HMAC
        
        // Generate Defuse encryption key (uses its own secure random generation)
        $encryptionKey = Key::createNewRandomKey()->saveToAsciiSafeString();
        
        // Generate Blind Index Key (32 bytes hex) for searchable encryption
        $blindIndexKey = self::generateEntropyMixedSecret(32, $userEntropy);
        
        // Build .env content
        $envContent = <<<ENV
# ============================================
# NOMAD CMS - Production Environment
# ============================================
# Generated: {$config['timestamp']}
# WARNING: Keep this file secure and never commit to version control!

# ----------------
# Application
# ----------------
APP_ENV=production
APP_DEBUG=false
APP_URL={$config['app_url']}
SITE_URL={$config['app_url']}
ALLOW_SVG_UPLOAD=true

# ----------------
# JWT Configuration (RS256 - Asymmetric)
# ----------------
JWT_ALGORITHM=RS256
JWT_PRIVATE_KEY_PATH=keys/private.pem
JWT_PUBLIC_KEY_PATH=keys/public.pem
JWT_SECRET={$jwtSecret}
JWT_ACCESS_TOKEN_TTL=900
JWT_REFRESH_TOKEN_TTL=604800
JWT_ISSUER=nomad-cms
JWT_AUDIENCE=nomad-cms-frontend

# ----------------
# WebAuthn (FIDO2)
# ----------------
WEBAUTHN_RP_NAME="NOMAD CMS"
WEBAUTHN_RP_ID={$config['webauthn_rp_id']}
WEBAUTHN_RP_ORIGIN={$config['webauthn_rp_origin']}
WEBAUTHN_TIMEOUT=60000
WEBAUTHN_USER_VERIFICATION=preferred

# ----------------
# TOTP (2FA)
# ----------------
TOTP_ISSUER="NOMAD CMS"
TOTP_DIGITS=6
TOTP_PERIOD=30
TOTP_ALGORITHM=sha256

# ----------------
# Encryption (Defuse Crypto)
# ----------------
ENCRYPTION_KEY={$encryptionKey}
# BLIND_INDEX_KEY is used for searchable encryption (Massive Data)
# It allows searching encrypted data without decrypting it
BLIND_INDEX_KEY={$blindIndexKey}

# ----------------
# Database (Split Architecture)
# ----------------
DB_CONNECTION=sqlite
DB_SYSTEM_DATABASE=system.sqlite
DB_CONTENT_DATABASE=database.sqlite
DB_MASSIVE_DATABASE=massive.sqlite

# ----------------
# Password Security
# ----------------
PASSWORD_PEPPER={$passwordPepper}
PASSWORD_SALT_PREFIX={$saltPrefix}
IP_HASH_SECRET={$ipHashSecret}
PASSWORD_MEMORY_COST=65536
PASSWORD_TIME_COST=4
PASSWORD_THREADS=3

# ----------------
# Account Security
# ----------------
ACCOUNT_MAX_FAILED_ATTEMPTS=5
ACCOUNT_LOCK_DURATION=900

# ----------------
# Session Security
# ----------------
SESSION_LIFETIME=7200
SESSION_SECURE_COOKIE=true
SESSION_HTTP_ONLY=true
SESSION_SAME_SITE=Strict
SESSION_SECRET={$sessionSecret}

# ----------------
# CORS Configuration
# ----------------
CORS_ALLOWED_ORIGINS={$config['cors_origins']}
CORS_ALLOWED_METHODS=GET,POST,PUT,DELETE,OPTIONS
CORS_ALLOWED_HEADERS=Content-Type,Authorization,X-ADMIN-TOKEN,X-CSRF-TOKEN,X-API-KEY
CORS_MAX_AGE=86400

# ----------------
# Rate Limiting
# ----------------
RATE_LIMIT_ENABLED=true
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_WINDOW_SECONDS=60
TRUSTED_PROXIES=

# ----------------
# Public API Rate Limits (generous defaults for public-facing endpoints)
# ----------------
PUBLIC_API_RATE_LIMIT_MAX=200
PUBLIC_API_RATE_LIMIT_WINDOW=60
STATIC_SERVE_RATE_LIMIT_MAX=300
STATIC_SERVE_RATE_LIMIT_WINDOW=60

# ----------------
# Auth Rate Limits
# ----------------
AUTH_RATE_LIMIT_LOGIN=10
AUTH_RATE_LIMIT_LOGIN_WINDOW=300
AUTH_RATE_LIMIT_TOTP=5
AUTH_RATE_LIMIT_TOTP_WINDOW=60
AUTH_RATE_LIMIT_PASSWORD_RESET=3
AUTH_RATE_LIMIT_PASSWORD_RESET_WINDOW=3600
AUTH_RATE_LIMIT_REGISTRATION=5
AUTH_RATE_LIMIT_REGISTRATION_WINDOW=3600

# ----------------
# Feature Toggles
# ----------------
AUTH_TOTP_ENABLED=true
AUTH_WEBAUTHN_ENABLED=true
AUTH_PASSWORD_ENABLED=true
AUTH_REGISTRATION_ENABLED=false
AUTH_REQUIRE_EMAIL_VERIFICATION=false

# ----------------
# AI Configuration
# ----------------
GEMINI_DEFAULT_MODEL=gemini-3-flash-preview

# ----------------
# File Storage
# ----------------
# Directories are resolved automatically by the API relative to installation root
MAX_UPLOAD_SIZE_MB=100
MAX_UPLOAD_WIDTH=5000
WEBP_QUALITY=90

# ----------------
# Logging
# ----------------
LOG_CHANNEL=file
LOG_LEVEL=warning
LOG_MAX_SIZE=3

# Webhooks (HMAC-Secured)
# ----------------
# Enable outgoing webhooks (CMS → external services)
WEBHOOKS_OUTGOING_ENABLED=true
# Enable incoming webhooks (external services → CMS)
WEBHOOKS_INCOMING_ENABLED=true
# HMAC signature tolerance window (seconds, for replay protection)
# Default: 300 (5 minutes) - matches industry standard
WEBHOOK_SIGNATURE_TOLERANCE=300
# Max retry attempts for failed webhook deliveries
WEBHOOK_MAX_RETRIES=3
# Retry delay multiplier (exponential backoff: 2^attempts * 60 seconds)
WEBHOOK_RETRY_DELAY_MULTIPLIER=2

# ----------------
# Versioning (Git-like History)
# ----------------
# HMAC secret for versioning integrity verification
# Used to sign version records and prevent tampering
VERSIONING_HMAC_SECRET={$versioningHmacSecret}
# Note: maxVersions and retentionDays are managed via Admin UI (CacheTab)
# and stored in the versioning_settings database table

# ----------------
# Update System Security
# ----------------
# HMAC secret for update progress file integrity
UPDATE_PROGRESS_SECRET={$updateProgressSecret}
# Require GPG signature verification for updates (recommended: true in production)
UPDATE_REQUIRE_GPG_SIGNATURE=true
# Path to GPG public key for verifying update signatures
UPDATE_GPG_PUBLIC_KEY=keys/update-signing.pub
# Path to update audit log
UPDATE_AUDIT_LOG=logs/update-audit.log

# ----------------
# Forge Import (Optimized for Shared Hosting)
# ----------------
# Sync threshold: images ≤ this count are processed immediately
# Higher = more sync (faster for small imports), lower = more async
FORGE_SYNC_IMAGE_THRESHOLD=10
# Enable async processing for large image batches (>threshold)
FORGE_ASYNC_IMAGES=true
# Enable piggyback queue processing (processes 1-2 images on every API request)
# Essential for shared hosting without cron/daemon access
FORGE_PIGGYBACK_PROCESSING=true
# Enable optimistic locking for concurrent import protection
FORGE_OPTIMISTIC_LOCKING=true
ENV;

        // Write atomically using temp file
        $tempPath = $envPath . '.tmp';
        
        if (file_put_contents($tempPath, $envContent) === false) {
            return false;
        }
        
        // Secure file permissions (owner read/write only)
        chmod($tempPath, 0600);
        
        // Atomic rename
        if (!rename($tempPath, $envPath)) {
            unlink($tempPath);
            return false;
        }
        
        return true;
    }

    /**
     * Create super admin user
     * Uses existing UserRepository with Argon2id hashing
     */
    public static function createSuperAdmin(string $email, string $password): array
    {
        // Validate email format
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new \InvalidArgumentException('Invalid email format');
        }
        
        // Validate password strength
        $passwordErrors = self::validatePasswordStrength($password);
        if (!empty($passwordErrors)) {
            throw new \InvalidArgumentException(implode(', ', $passwordErrors));
        }
        
        // Initialize database if needed
        self::initializeDatabase();
        
        // Create admin user via UserRepository (handles Argon2id hashing)
        // Pass false for is_new_user to avoid forced password change on first login
        $user = UserRepository::create($email, $password, true, false);
        
        if (!$user) {
            throw new \RuntimeException('Failed to create admin user');
        }
        
        return [
            'uuid' => $user['uuid'],
            'email' => $user['email'],
            'is_admin' => (bool) $user['is_admin'],
        ];
    }

    /**
     * Validate password strength
     */
    private static function validatePasswordStrength(string $password): array
    {
        $errors = [];
        
        if (strlen($password) < 12) {
            $errors[] = 'Password must be at least 12 characters';
        }
        
        if (!preg_match('/[A-Z]/', $password)) {
            $errors[] = 'Password must contain at least one uppercase letter';
        }
        
        if (!preg_match('/[a-z]/', $password)) {
            $errors[] = 'Password must contain at least one lowercase letter';
        }
        
        if (!preg_match('/[0-9]/', $password)) {
            $errors[] = 'Password must contain at least one number';
        }
        
        if (!preg_match('/[!@#$%^&*()_+\-=\[\]{};\':\"\\|,.<>\/?]/', $password)) {
            $errors[] = 'Password must contain at least one special character';
        }
        
        return $errors;
    }

    /**
     * Initialize the database schema if needed
     */
    private static function initializeDatabase(): void
    {
        // Get database instance (this will create the file and schema)
        AuthDatabase::getInstance();
    }

    /**
     * Create lock file with SHA256 integrity hash
     */
    public static function createLockFile(): bool
    {
        $lockPath = self::getLockFilePath();
        
        // Generate unique installation data
        $timestamp = date('c');
        $serverUniqueId = self::generateServerUniqueId();
        
        // Create integrity hash: SHA256(timestamp + server_unique_id + random_salt)
        $randomSalt = bin2hex(random_bytes(32));
        $integrityData = $timestamp . $serverUniqueId . $randomSalt;
        $integrityHash = hash('sha256', $integrityData);
        
        $lockData = [
            'installed_at' => $timestamp,
            'integrity_hash' => $integrityHash,
            'salt' => $randomSalt,
            'version' => '1.0.0',
        ];
        
        // Write atomically
        $tempPath = $lockPath . '.tmp';
        
        if (file_put_contents($tempPath, json_encode($lockData, JSON_PRETTY_PRINT)) === false) {
            return false;
        }
        
        // Secure file permissions
        chmod($tempPath, 0644);
        
        // Atomic rename
        if (!rename($tempPath, $lockPath)) {
            unlink($tempPath);
            return false;
        }
        
        return true;
    }

    /**
     * Generate cryptographically secure secret with optional user entropy mixing
     * Combines random_bytes with user-provided entropy (SHA-256 hashed client-side)
     * for additional unpredictability
     * 
     * @param int $length Number of bytes (output will be 2x in hex)
     * @param string|null $userEntropy User-provided SHA-256 hashed entropy
     * @return string Hex-encoded secret
     */
    private static function generateEntropyMixedSecret(int $length, ?string $userEntropy = null): string
    {
        // Always start with cryptographically secure random bytes
        $randomBytes = random_bytes($length);
        
        // If user entropy is provided, mix it in
        if ($userEntropy !== null && strlen($userEntropy) > 0) {
            // User entropy is already SHA-256 hashed (64 hex chars = 32 bytes when decoded)
            $entropyBytes = hex2bin($userEntropy) ?: '';
            
            // Add server-side entropy (microtime, random, process id)
            $serverEntropy = microtime(true) . getmypid() . bin2hex(random_bytes(8));
            
            // Combine all sources and hash
            $combined = $randomBytes . $entropyBytes . $serverEntropy;
            
            // Use HKDF to derive the final key material
            // This cryptographically mixes all entropy sources
            $derived = hash_hkdf('sha256', $combined, $length, 'nomad-cms-secret-derivation');
            
            return bin2hex($derived);
        }
        
        // Without user entropy, just use random_bytes
        return bin2hex($randomBytes);
    }

    /**
     * Generate RSA key pair for asymmetric JWT signing (RS256)
     * Creates private.pem and public.pem in the keys directory
     * 
     * @param int $keyBits Key size in bits (default 4096 for security)
     * @return bool Success status
     */
    private static function generateRSAKeyPair(int $keyBits = 4096): bool
    {
        $keysDir = dirname(__DIR__, 2) . '/keys';
        $privateKeyPath = $keysDir . '/private.pem';
        $publicKeyPath = $keysDir . '/public.pem';
        
        // Create keys directory if it doesn't exist
        if (!is_dir($keysDir)) {
            if (!mkdir($keysDir, 0700, true)) {
                error_log('[Install] Failed to create keys directory');
                return false;
            }
        }
        
        // Check if keys already exist (don't overwrite)
        if (file_exists($privateKeyPath) && file_exists($publicKeyPath)) {
            error_log('[Install] RSA key pair already exists, skipping generation');
            return true;
        }
        
        // Generate RSA key pair
        $config = [
            'private_key_bits' => $keyBits,
            'private_key_type' => OPENSSL_KEYTYPE_RSA,
            'digest_alg' => 'sha256',
        ];
        
        $keyPair = openssl_pkey_new($config);
        if ($keyPair === false) {
            error_log('[Install] Failed to generate RSA key pair: ' . openssl_error_string());
            return false;
        }
        
        // Export private key
        if (!openssl_pkey_export($keyPair, $privateKey)) {
            error_log('[Install] Failed to export private key: ' . openssl_error_string());
            return false;
        }
        
        // Export public key
        $keyDetails = openssl_pkey_get_details($keyPair);
        if ($keyDetails === false) {
            error_log('[Install] Failed to get key details: ' . openssl_error_string());
            return false;
        }
        $publicKey = $keyDetails['key'];
        
        // Write private key with secure permissions (600 = owner read/write only)
        $privateKeyTmp = $privateKeyPath . '.tmp';
        if (file_put_contents($privateKeyTmp, $privateKey) === false) {
            error_log('[Install] Failed to write private key');
            return false;
        }
        chmod($privateKeyTmp, 0600);
        if (!rename($privateKeyTmp, $privateKeyPath)) {
            unlink($privateKeyTmp);
            return false;
        }
        
        // Write public key (644 = owner read/write, others read)
        $publicKeyTmp = $publicKeyPath . '.tmp';
        if (file_put_contents($publicKeyTmp, $publicKey) === false) {
            error_log('[Install] Failed to write public key');
            return false;
        }
        chmod($publicKeyTmp, 0644);
        if (!rename($publicKeyTmp, $publicKeyPath)) {
            unlink($publicKeyTmp);
            return false;
        }
        
        error_log('[Install] RSA key pair generated successfully (' . $keyBits . ' bits)');
        return true;
    }

    /**
     * Generate a unique server identifier
     */
    private static function generateServerUniqueId(): string
    {
        $parts = [
            $_SERVER['SERVER_NAME'] ?? 'localhost',
            $_SERVER['DOCUMENT_ROOT'] ?? __DIR__,
            php_uname('n'),
        ];
        
        return hash('sha256', implode('|', $parts));
    }

    /**
     * Validate lock file integrity
     */
    public static function validateLockFile(): bool
    {
        $lockData = self::getLockFileData();
        
        if (!$lockData) {
            return false;
        }
        
        // Check required fields
        $requiredFields = ['installed_at', 'integrity_hash', 'salt', 'version'];
        foreach ($requiredFields as $field) {
            if (!isset($lockData[$field])) {
                return false;
            }
        }
        
        // Verify integrity hash format (SHA256 = 64 hex chars)
        if (!preg_match('/^[a-f0-9]{64}$/i', $lockData['integrity_hash'])) {
            return false;
        }
        
        // Recalculate and verify hash
        $serverUniqueId = self::generateServerUniqueId();
        $expectedHash = hash('sha256', $lockData['installed_at'] . $serverUniqueId . $lockData['salt']);
        
        return hash_equals($expectedHash, $lockData['integrity_hash']);
    }

    /**
     * Execute full installation atomically
     * 
     * @param string $email Admin email
     * @param string $password Admin password
     * @param array $config Optional configuration overrides
     * @return array Installation result
     */
    public static function install(string $email, string $password, array $config = [], ?string $userEntropy = null): array
    {
        // Check if already installed
        if (self::isInstalled()) {
            throw new \RuntimeException('Installation already completed');
        }
        
        // Determine scheme and host with safe fallbacks
        $isHttps = ($_SERVER['REQUEST_SCHEME'] ?? '') === 'https' 
                || (($_SERVER['HTTPS'] ?? 'off') !== 'off')
                || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
        $scheme = $isHttps ? 'https' : 'http';
        $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
        
        // Merge default config with provided config
        $defaultConfig = [
            'app_url' => $scheme . '://' . $host,
            'webauthn_rp_id' => $host,
            'webauthn_rp_origin' => $scheme . '://' . $host,
            'cors_origins' => $scheme . '://' . $host,
            'timestamp' => date('c'),
            'user_entropy' => $userEntropy, // Pass user entropy to env generation
        ];
        
        $finalConfig = array_merge($defaultConfig, $config);
        
        try {
            // Step 1: Generate secure environment file
            if (!self::generateEnvironmentFile($finalConfig)) {
                throw new \RuntimeException('Failed to generate environment file');
            }
            
            // Reload environment for the new values
            self::reloadEnvironment();
            
            // Step 2: Create super admin user
            $adminUser = self::createSuperAdmin($email, $password);
            
            // Step 3: Create lock file
            if (!self::createLockFile()) {
                throw new \RuntimeException('Failed to create lock file');
            }
            
            return [
                'success' => true,
                'message' => 'Installation complete',
                'admin' => [
                    'uuid' => $adminUser['uuid'],
                    'email' => $adminUser['email'],
                ],
                'redirect' => '/nomad/login',
            ];
            
        } catch (\Exception $e) {
            // Cleanup on failure
            self::cleanupFailedInstall();
            
            throw $e;
        }
    }

    /**
     * Reload environment variables from newly created .env
     */
    private static function reloadEnvironment(): void
    {
        $envPath = dirname(__DIR__, 2) . '/.env';
        
        if (file_exists($envPath)) {
            $dotenv = \Dotenv\Dotenv::createImmutable(dirname(__DIR__, 2), '.env');
            $dotenv->load();
        }
    }

    /**
     * Cleanup after a failed installation
     */
    private static function cleanupFailedInstall(): void
    {
        // Remove generated files if they exist
        $envPath = dirname(__DIR__, 2) . '/.env';
        $lockPath = self::getLockFilePath();
        $keysDir = dirname(__DIR__, 2) . '/keys';
        
        if (file_exists($envPath)) {
            unlink($envPath);
        }
        
        if (file_exists($lockPath)) {
            unlink($lockPath);
        }
        
        // Remove RSA keys if they were just generated
        $privateKeyPath = $keysDir . '/private.pem';
        $publicKeyPath = $keysDir . '/public.pem';
        
        if (file_exists($privateKeyPath)) {
            unlink($privateKeyPath);
        }
        if (file_exists($publicKeyPath)) {
            unlink($publicKeyPath);
        }
    }

    /**
     * Get installation status info
     */
    public static function getStatus(): array
    {
        $isInstalled = self::isInstalled();
        $lockData = self::getLockFileData();
        
        if ($isInstalled && $lockData) {
            return [
                'installed' => true,
                'locked_at' => $lockData['installed_at'] ?? null,
                'version' => $lockData['version'] ?? '1.0.0',
            ];
        }
        
        return [
            'installed' => false,
            'requires_setup' => true,
        ];
    }
}
