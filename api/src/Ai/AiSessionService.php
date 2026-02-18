<?php
/**
 * AI Session Service - "Secret" Chat History Storage
 * 
 * Handles temporary storage of AI chat sessions on the server.
 * Sessions are encrypted and expire after 1 hour of inactivity.
 * 
 * Features:
 * - AES-256-GCM encryption for session data
 * - Automatic cleanup with probabilistic triggering
 * - File locking to prevent race conditions
 * - Comprehensive error handling and logging
 * - Orphan session detection and removal
 * - Storage quota enforcement
 * 
 * @internal This is an internal service, not exposed via API
 */

declare(strict_types=1);

namespace NomadCMS\Ai;

class AiSessionService
{
    private const SESSION_DIR = __DIR__ . '/../../data/.ai_sessions';
    private const LOCK_DIR = __DIR__ . '/../../data/.ai_sessions/.locks';
    private const LOG_FILE = __DIR__ . '/../../logs/ai_sessions.log';
    private const CLEANUP_STATE_FILE = __DIR__ . '/../../data/.ai_sessions/.cleanup_state';
    
    private const SESSION_EXPIRY = 3600;           // 1 hour
    private const HARD_EXPIRY = 86400;             // 24 hours - absolute max lifetime
    private const ENCRYPTION_METHOD = 'aes-256-gcm';
    private const MAX_SESSIONS_PER_USER = 10;      // Max concurrent sessions per user
    private const MAX_TOTAL_SESSIONS = 1000;       // Max total sessions in system
    private const MAX_STORAGE_MB = 100;            // Max storage in MB
    private const CLEANUP_PROBABILITY = 5;         // 5% chance to run cleanup on each request
    private const LOCK_TIMEOUT = 10;               // Lock timeout in seconds
    
    // Advanced cleanup constants
    private const CLEANUP_BATCH_SIZE = 50;         // Process files in batches
    private const CLEANUP_MAX_DURATION = 30;       // Max cleanup runtime in seconds
    private const CLEANUP_COOLDOWN = 300;          // 5 minutes between cleanups
    private const AGGRESSIVE_CLEANUP_THRESHOLD = 0.8; // Trigger aggressive at 80% capacity
    private const EMERGENCY_CLEANUP_THRESHOLD = 0.95; // Emergency at 95%
    private const IDLE_CLEANUP_PROBABILITY = 20;   // 20% when server is idle
    private const STALE_LOCK_TIMEOUT = 300;        // 5 minutes for stale locks
    
    private static ?string $encryptionKey = null;
    private static bool $cleanupRan = false;
    private static ?float $cleanupStartTime = null;
    
    /**
     * Get or generate the encryption key
     */
    private static function getKey(): string
    {
        if (self::$encryptionKey === null) {
            $keyFile = self::SESSION_DIR . '/.key';
            
            self::ensureDirectories();
            
            if (file_exists($keyFile)) {
                self::$encryptionKey = file_get_contents($keyFile);
            } else {
                self::$encryptionKey = bin2hex(random_bytes(32));
                file_put_contents($keyFile, self::$encryptionKey);
                chmod($keyFile, 0600);
            }
        }
        
        return self::$encryptionKey;
    }
    
    /**
     * Ensure all required directories exist with proper permissions
     */
    private static function ensureDirectories(): void
    {
        $dirs = [self::SESSION_DIR, self::LOCK_DIR, dirname(self::LOG_FILE)];
        
        foreach ($dirs as $dir) {
            if (!is_dir($dir)) {
                mkdir($dir, 0700, true);
            }
        }
        
        // Security files
        $htaccess = self::SESSION_DIR . '/.htaccess';
        $gitignore = self::SESSION_DIR . '/.gitignore';
        
        if (!file_exists($htaccess)) {
            file_put_contents($htaccess, "Deny from all\nOptions -Indexes\n");
        }
        if (!file_exists($gitignore)) {
            file_put_contents($gitignore, "*\n!.gitignore\n!.htaccess\n");
        }
    }
    
    /**
     * Log cleanup events
     */
    private static function log(string $level, string $message, array $context = []): void
    {
        $logDir = dirname(self::LOG_FILE);
        if (!is_dir($logDir)) {
            mkdir($logDir, 0700, true);
        }
        
        $timestamp = date('Y-m-d H:i:s');
        $contextStr = empty($context) ? '' : ' ' . json_encode($context);
        $line = "[$timestamp] [$level] $message$contextStr\n";
        
        // Append to log, rotate if > 5MB
        if (file_exists(self::LOG_FILE) && filesize(self::LOG_FILE) > 5 * 1024 * 1024) {
            rename(self::LOG_FILE, self::LOG_FILE . '.' . date('Y-m-d-His'));
        }
        
        file_put_contents(self::LOG_FILE, $line, FILE_APPEND | LOCK_EX);
    }
    
    /**
     * Encrypt data
     */
    private static function encrypt(string $data): string
    {
        $key = hex2bin(self::getKey());
        $iv = random_bytes(16);
        $tag = '';
        
        $encrypted = openssl_encrypt(
            $data,
            self::ENCRYPTION_METHOD,
            $key,
            OPENSSL_RAW_DATA,
            $iv,
            $tag
        );
        
        return base64_encode($iv . $tag . $encrypted);
    }
    
    /**
     * Decrypt data
     */
    private static function decrypt(string $data): ?string
    {
        $decoded = base64_decode($data);
        if ($decoded === false || strlen($decoded) < 32) {
            return null;
        }
        
        $key = hex2bin(self::getKey());
        $iv = substr($decoded, 0, 16);
        $tag = substr($decoded, 16, 16);
        $encrypted = substr($decoded, 32);
        
        $decrypted = openssl_decrypt(
            $encrypted,
            self::ENCRYPTION_METHOD,
            $key,
            OPENSSL_RAW_DATA,
            $iv,
            $tag
        );
        
        return $decrypted === false ? null : $decrypted;
    }
    
    /**
     * Generate a unique session ID
     */
    public static function createSession(int $userId): string
    {
        // Probabilistic cleanup - runs ~5% of the time
        self::maybeRunCleanup();
        
        // Enforce per-user session limit
        self::enforceUserSessionLimit($userId);
        
        $sessionId = bin2hex(random_bytes(16));
        $sessionFile = self::getSessionPath($userId, $sessionId);
        
        $sessionData = [
            'user_id' => $userId,
            'session_id' => $sessionId,
            'created_at' => time(),
            'updated_at' => time(),
            'messages' => [],
            'metadata' => [
                'ip' => $_SERVER['REMOTE_ADDR'] ?? 'unknown',
                'user_agent' => substr($_SERVER['HTTP_USER_AGENT'] ?? 'unknown', 0, 200),
            ],
        ];
        
        if (!self::saveSession($sessionFile, $sessionData)) {
            self::log('ERROR', 'Failed to create session', ['user_id' => $userId]);
            throw new \RuntimeException('Failed to create AI session');
        }
        
        self::log('INFO', 'Session created', ['user_id' => $userId, 'session_id' => $sessionId]);
        
        return $sessionId;
    }
    
    /**
     * Maybe run cleanup based on probability and system state
     */
    private static function maybeRunCleanup(): void
    {
        if (self::$cleanupRan) {
            return;
        }
        
        // Check if cleanup is needed and allowed
        $cleanupProbability = self::calculateCleanupProbability();
        
        if (random_int(1, 100) <= $cleanupProbability) {
            if (self::acquireCleanupLock()) {
                self::$cleanupRan = true;
                try {
                    self::runIntelligentCleanup();
                } finally {
                    self::releaseCleanupLock();
                }
            }
        }
    }
    
    /**
     * Calculate cleanup probability based on system state
     */
    private static function calculateCleanupProbability(): int
    {
        $state = self::getCleanupState();
        $now = time();
        
        // Don't run if cooldown hasn't passed
        if (($state['last_cleanup'] ?? 0) > $now - self::CLEANUP_COOLDOWN) {
            return 0;
        }
        
        // Check capacity
        $stats = self::getQuickStats();
        $sessionRatio = $stats['total_sessions'] / self::MAX_TOTAL_SESSIONS;
        $storageRatio = $stats['total_size_mb'] / self::MAX_STORAGE_MB;
        $maxRatio = max($sessionRatio, $storageRatio);
        
        // Emergency cleanup
        if ($maxRatio >= self::EMERGENCY_CLEANUP_THRESHOLD) {
            return 100; // Always run
        }
        
        // Aggressive cleanup
        if ($maxRatio >= self::AGGRESSIVE_CLEANUP_THRESHOLD) {
            return 50; // 50% chance
        }
        
        // Check if server seems idle (low recent activity)
        $recentActivity = $state['recent_requests'] ?? 0;
        if ($recentActivity < 5) {
            return self::IDLE_CLEANUP_PROBABILITY;
        }
        
        return self::CLEANUP_PROBABILITY;
    }
    
    /**
     * Get quick stats without full file scanning
     */
    private static function getQuickStats(): array
    {
        if (!is_dir(self::SESSION_DIR)) {
            return ['total_sessions' => 0, 'total_size_mb' => 0];
        }
        
        $files = glob(self::SESSION_DIR . '/*.dat') ?: [];
        $count = count($files);
        
        // Estimate size from sample
        $sampleSize = min(10, $count);
        $totalSampleSize = 0;
        
        if ($sampleSize > 0) {
            $sample = array_slice($files, 0, $sampleSize);
            foreach ($sample as $file) {
                $totalSampleSize += filesize($file) ?: 0;
            }
            $avgSize = $totalSampleSize / $sampleSize;
            $estimatedTotal = $avgSize * $count;
        } else {
            $estimatedTotal = 0;
        }
        
        return [
            'total_sessions' => $count,
            'total_size_mb' => round($estimatedTotal / 1024 / 1024, 2)
        ];
    }
    
    /**
     * Get cleanup state
     */
    private static function getCleanupState(): array
    {
        if (!file_exists(self::CLEANUP_STATE_FILE)) {
            return [];
        }
        
        $content = @file_get_contents(self::CLEANUP_STATE_FILE);
        if ($content === false) {
            return [];
        }
        
        return json_decode($content, true) ?: [];
    }
    
    /**
     * Save cleanup state
     */
    private static function saveCleanupState(array $state): void
    {
        self::ensureDirectories();
        file_put_contents(
            self::CLEANUP_STATE_FILE, 
            json_encode($state),
            LOCK_EX
        );
    }
    
    /**
     * Acquire global cleanup lock (prevents concurrent cleanups)
     */
    private static function acquireCleanupLock(): bool
    {
        self::ensureDirectories();
        
        $lockFile = self::LOCK_DIR . '/.cleanup.lock';
        
        // Check for stale lock
        if (file_exists($lockFile)) {
            $lockAge = time() - (filemtime($lockFile) ?: 0);
            if ($lockAge > self::STALE_LOCK_TIMEOUT) {
                @unlink($lockFile);
                self::log('WARNING', 'Removed stale cleanup lock', ['age' => $lockAge]);
            } else {
                return false; // Another cleanup is running
            }
        }
        
        // Create lock file with PID
        $pid = getmypid();
        if (file_put_contents($lockFile, (string)$pid, LOCK_EX) === false) {
            return false;
        }
        
        // Double-check we got the lock (race condition prevention)
        usleep(10000); // 10ms
        $content = @file_get_contents($lockFile);
        
        return $content === (string)$pid;
    }
    
    /**
     * Release global cleanup lock
     */
    private static function releaseCleanupLock(): void
    {
        $lockFile = self::LOCK_DIR . '/.cleanup.lock';
        @unlink($lockFile);
    }
    
    /**
     * Enforce per-user session limit by removing oldest sessions
     */
    private static function enforceUserSessionLimit(int $userId): void
    {
        $userSessions = self::getUserSessions($userId);
        
        if (count($userSessions) >= self::MAX_SESSIONS_PER_USER) {
            // Sort by updated_at, oldest first
            usort($userSessions, fn($a, $b) => $a['updated_at'] <=> $b['updated_at']);
            
            // Remove oldest sessions to make room
            $toRemove = count($userSessions) - self::MAX_SESSIONS_PER_USER + 1;
            for ($i = 0; $i < $toRemove; $i++) {
                $sessionPath = $userSessions[$i]['path'];
                if (file_exists($sessionPath)) {
                    @unlink($sessionPath);
                    self::log('INFO', 'Removed old session for user limit', [
                        'user_id' => $userId,
                        'path' => basename($sessionPath)
                    ]);
                }
            }
        }
    }
    
    /**
     * Get all sessions for a user
     */
    private static function getUserSessions(int $userId): array
    {
        $sessions = [];
        $files = glob(self::SESSION_DIR . '/*.dat') ?: [];
        
        foreach ($files as $file) {
            $data = self::loadSession($file);
            if ($data !== null && ($data['user_id'] ?? null) === $userId) {
                $sessions[] = array_merge($data, ['path' => $file]);
            }
        }
        
        return $sessions;
    }
    
    /**
     * Get session file path
     */
    private static function getSessionPath(int $userId, string $sessionId): string
    {
        self::ensureDirectories();
        
        // Use hashed user ID + session ID for filename
        $hash = hash('sha256', $userId . ':' . $sessionId);
        return self::SESSION_DIR . '/' . $hash . '.dat';
    }
    
    /**
     * Acquire a file lock for a session
     * @return resource|null
     */
    private static function acquireLock(string $sessionPath): mixed
    {
        self::ensureDirectories();
        
        $lockFile = self::LOCK_DIR . '/' . basename($sessionPath) . '.lock';
        $lockHandle = @fopen($lockFile, 'c');
        
        if ($lockHandle === false) {
            self::log('ERROR', 'Failed to create lock file', ['path' => $lockFile]);
            return null;
        }
        
        $startTime = time();
        while (!flock($lockHandle, LOCK_EX | LOCK_NB)) {
            if (time() - $startTime > self::LOCK_TIMEOUT) {
                fclose($lockHandle);
                self::log('WARNING', 'Lock acquisition timeout', ['path' => $lockFile]);
                return null;
            }
            usleep(10000); // 10ms
        }
        
        return $lockHandle;
    }
    
    /**
     * Release a file lock
     * @param resource|null $lockHandle
     */
    private static function releaseLock(mixed $lockHandle): void
    {
        if ($lockHandle !== null && is_resource($lockHandle)) {
            flock($lockHandle, LOCK_UN);
            fclose($lockHandle);
        }
    }
    
    /**
     * Save session data with file locking
     */
    private static function saveSession(string $path, array $data): bool
    {
        $lock = self::acquireLock($path);
        if ($lock === null) {
            return false;
        }
        
        try {
            $encrypted = self::encrypt(json_encode($data));
            $result = file_put_contents($path, $encrypted);
            
            if ($result !== false) {
                chmod($path, 0600);
                return true;
            }
            
            self::log('ERROR', 'Failed to write session', ['path' => $path]);
            return false;
        } finally {
            self::releaseLock($lock);
        }
    }
    
    /**
     * Load session data with file locking
     */
    private static function loadSession(string $path): ?array
    {
        if (!file_exists($path)) {
            return null;
        }
        
        $lock = self::acquireLock($path);
        if ($lock === null) {
            return null;
        }
        
        try {
            $encrypted = file_get_contents($path);
            if ($encrypted === false) {
                return null;
            }
            
            $decrypted = self::decrypt($encrypted);
            if ($decrypted === null) {
                self::log('WARNING', 'Failed to decrypt session', ['path' => $path]);
                return null;
            }
            
            $data = json_decode($decrypted, true);
            if (json_last_error() !== JSON_ERROR_NONE) {
                self::log('WARNING', 'Invalid session JSON', ['path' => $path]);
                return null;
            }
            
            return $data;
        } finally {
            self::releaseLock($lock);
        }
    }
    
    /**
     * Get messages from a session with validation
     */
    public static function getMessages(int $userId, string $sessionId): array
    {
        $sessionFile = self::getSessionPath($userId, $sessionId);
        $sessionData = self::loadSession($sessionFile);
        
        if ($sessionData === null) {
            return [];
        }
        
        // Validate user ownership
        if (($sessionData['user_id'] ?? null) !== $userId) {
            self::log('WARNING', 'Session user mismatch', [
                'expected' => $userId,
                'actual' => $sessionData['user_id'] ?? 'null'
            ]);
            return [];
        }
        
        // Check soft expiry (1 hour inactivity)
        if (time() - ($sessionData['updated_at'] ?? 0) > self::SESSION_EXPIRY) {
            self::log('INFO', 'Session expired (inactivity)', ['session_id' => $sessionId]);
            self::safeDelete($sessionFile);
            return [];
        }
        
        // Check hard expiry (24 hours absolute)
        if (time() - ($sessionData['created_at'] ?? 0) > self::HARD_EXPIRY) {
            self::log('INFO', 'Session expired (hard limit)', ['session_id' => $sessionId]);
            self::safeDelete($sessionFile);
            return [];
        }
        
        return $sessionData['messages'] ?? [];
    }
    
    /**
     * Add messages to a session with validation
     */
    public static function addMessages(int $userId, string $sessionId, array $newMessages): bool
    {
        $sessionFile = self::getSessionPath($userId, $sessionId);
        $sessionData = self::loadSession($sessionFile);
        
        if ($sessionData === null) {
            $sessionData = [
                'user_id' => $userId,
                'session_id' => $sessionId,
                'created_at' => time(),
                'updated_at' => time(),
                'messages' => [],
            ];
        }
        
        // Validate user ownership
        if (($sessionData['user_id'] ?? null) !== $userId) {
            self::log('WARNING', 'Attempted message add to foreign session', [
                'user_id' => $userId,
                'session_id' => $sessionId
            ]);
            return false;
        }
        
        // Check hard expiry
        if (time() - ($sessionData['created_at'] ?? 0) > self::HARD_EXPIRY) {
            self::log('INFO', 'Cannot add to expired session', ['session_id' => $sessionId]);
            self::safeDelete($sessionFile);
            return false;
        }
        
        $sessionData['updated_at'] = time();
        $sessionData['messages'] = array_merge($sessionData['messages'] ?? [], $newMessages);
        
        // Limit to last 50 messages to prevent bloat
        if (count($sessionData['messages']) > 50) {
            $sessionData['messages'] = array_slice($sessionData['messages'], -50);
        }
        
        return self::saveSession($sessionFile, $sessionData);
    }
    
    /**
     * Safely delete a file with error handling
     */
    private static function safeDelete(string $path): bool
    {
        if (!file_exists($path)) {
            return true;
        }
        
        $lock = self::acquireLock($path);
        if ($lock === null) {
            // Force delete without lock
            return @unlink($path);
        }
        
        try {
            $result = @unlink($path);
            
            // Also remove the lock file
            $lockFile = self::LOCK_DIR . '/' . basename($path) . '.lock';
            @unlink($lockFile);
            
            return $result;
        } finally {
            self::releaseLock($lock);
        }
    }
    
    /**
     * Clear a session with logging
     */
    public static function clearSession(int $userId, string $sessionId): bool
    {
        $sessionFile = self::getSessionPath($userId, $sessionId);
        
        // Verify ownership before deletion
        $sessionData = self::loadSession($sessionFile);
        if ($sessionData !== null && ($sessionData['user_id'] ?? null) !== $userId) {
            self::log('WARNING', 'Attempted to clear foreign session', [
                'user_id' => $userId,
                'session_id' => $sessionId
            ]);
            return false;
        }
        
        $result = self::safeDelete($sessionFile);
        
        if ($result) {
            self::log('INFO', 'Session cleared by user', [
                'user_id' => $userId,
                'session_id' => $sessionId
            ]);
        }
        
        return $result;
    }
    
    /**
     * Run intelligent cleanup with batching and time limits
     */
    private static function runIntelligentCleanup(): array
    {
        self::$cleanupStartTime = microtime(true);
        
        $stats = [
            'expired_soft' => 0,
            'expired_hard' => 0,
            'corrupted' => 0,
            'orphan_locks' => 0,
            'quota_exceeded' => 0,
            'stale_locks' => 0,
            'total_sessions' => 0,
            'total_size_mb' => 0,
            'batches_processed' => 0,
            'duration_ms' => 0,
            'interrupted' => false,
            'errors' => [],
        ];
        
        if (!is_dir(self::SESSION_DIR)) {
            return $stats;
        }
        
        $now = time();
        $files = glob(self::SESSION_DIR . '/*.dat') ?: [];
        shuffle($files); // Randomize to avoid always processing same files first
        
        $stats['total_sessions'] = count($files);
        
        // Process in batches
        $batches = array_chunk($files, self::CLEANUP_BATCH_SIZE);
        $sessionsInfo = [];
        
        foreach ($batches as $batchIndex => $batch) {
            // Check time limit
            if (self::isCleanupTimeExceeded()) {
                $stats['interrupted'] = true;
                self::log('INFO', 'Cleanup interrupted due to time limit', [
                    'batches_completed' => $batchIndex,
                    'remaining_files' => count($files) - ($batchIndex * self::CLEANUP_BATCH_SIZE)
                ]);
                break;
            }
            
            $stats['batches_processed']++;
            
            foreach ($batch as $file) {
                $result = self::processFileForCleanup($file, $now);
                
                switch ($result['action']) {
                    case 'expired_hard':
                        $stats['expired_hard']++;
                        break;
                    case 'expired_soft':
                        $stats['expired_soft']++;
                        break;
                    case 'corrupted':
                        $stats['corrupted']++;
                        break;
                    case 'keep':
                        if (isset($result['info'])) {
                            $sessionsInfo[] = $result['info'];
                        }
                        break;
                    case 'error':
                        $stats['errors'][] = $result['error'];
                        break;
                }
            }
            
            // Yield to other processes between batches
            if ($batchIndex < count($batches) - 1) {
                usleep(1000); // 1ms
            }
        }
        
        // Enforce quotas if we processed all files
        if (!$stats['interrupted']) {
            $quotaStats = self::enforceQuotas($sessionsInfo);
            $stats['quota_exceeded'] = $quotaStats['removed'];
        }
        
        // Clean locks
        $lockStats = self::cleanupLocks($now);
        $stats['orphan_locks'] = $lockStats['orphan'];
        $stats['stale_locks'] = $lockStats['stale'];
        
        // Calculate final size
        $stats['total_size_mb'] = round(
            array_sum(array_column($sessionsInfo, 'size')) / 1024 / 1024, 
            2
        );
        
        // Calculate duration
        $stats['duration_ms'] = round((microtime(true) - self::$cleanupStartTime) * 1000);
        
        // Update cleanup state
        self::saveCleanupState([
            'last_cleanup' => $now,
            'last_stats' => $stats,
            'recent_requests' => 0, // Reset activity counter
        ]);
        
        // Log results
        $totalCleaned = $stats['expired_soft'] + $stats['expired_hard'] + 
                        $stats['corrupted'] + $stats['quota_exceeded'];
        
        if ($totalCleaned > 0 || $stats['interrupted']) {
            self::log('INFO', 'Intelligent cleanup completed', $stats);
        }
        
        return $stats;
    }
    
    /**
     * Process a single file for cleanup decision
     */
    private static function processFileForCleanup(string $file, int $now): array
    {
        try {
            // Fast check: file modification time
            $fileAge = $now - (filemtime($file) ?: 0);
            
            // Hard expiry based on file age (fast path)
            if ($fileAge > self::HARD_EXPIRY) {
                self::safeDelete($file);
                return ['action' => 'expired_hard'];
            }
            
            // Try to load session data
            $data = self::loadSession($file);
            
            if ($data === null) {
                self::safeDelete($file);
                return ['action' => 'corrupted'];
            }
            
            // Validate session structure
            if (!self::isValidSessionStructure($data)) {
                self::safeDelete($file);
                return ['action' => 'corrupted'];
            }
            
            $updatedAt = $data['updated_at'] ?? 0;
            $createdAt = $data['created_at'] ?? 0;
            
            // Soft expiry (inactivity)
            if ($now - $updatedAt > self::SESSION_EXPIRY) {
                self::safeDelete($file);
                return ['action' => 'expired_soft'];
            }
            
            // Hard expiry from session data
            if ($now - $createdAt > self::HARD_EXPIRY) {
                self::safeDelete($file);
                return ['action' => 'expired_hard'];
            }
            
            // Keep this session
            return [
                'action' => 'keep',
                'info' => [
                    'path' => $file,
                    'updated_at' => $updatedAt,
                    'created_at' => $createdAt,
                    'size' => filesize($file) ?: 0,
                    'user_id' => $data['user_id'] ?? null,
                    'message_count' => count($data['messages'] ?? []),
                ]
            ];
            
        } catch (\Throwable $e) {
            @unlink($file);
            return ['action' => 'error', 'error' => $e->getMessage()];
        }
    }
    
    /**
     * Validate session data structure
     */
    private static function isValidSessionStructure(array $data): bool
    {
        return isset($data['user_id']) 
            && isset($data['created_at'])
            && isset($data['updated_at'])
            && is_array($data['messages'] ?? []);
    }
    
    /**
     * Check if cleanup time limit exceeded
     */
    private static function isCleanupTimeExceeded(): bool
    {
        if (self::$cleanupStartTime === null) {
            return false;
        }
        
        $elapsed = microtime(true) - self::$cleanupStartTime;
        return $elapsed >= self::CLEANUP_MAX_DURATION;
    }
    
    /**
     * Enforce session and storage quotas
     */
    private static function enforceQuotas(array &$sessionsInfo): array
    {
        $stats = ['removed' => 0];
        
        // Sort by updated_at (oldest first)
        usort($sessionsInfo, fn($a, $b) => $a['updated_at'] <=> $b['updated_at']);
        
        // Enforce session count limit
        while (count($sessionsInfo) > self::MAX_TOTAL_SESSIONS) {
            $oldest = array_shift($sessionsInfo);
            self::safeDelete($oldest['path']);
            $stats['removed']++;
        }
        
        // Enforce storage limit
        $currentSize = array_sum(array_column($sessionsInfo, 'size'));
        $maxSize = self::MAX_STORAGE_MB * 1024 * 1024;
        
        while ($currentSize > $maxSize && !empty($sessionsInfo)) {
            $oldest = array_shift($sessionsInfo);
            self::safeDelete($oldest['path']);
            $currentSize -= $oldest['size'];
            $stats['removed']++;
        }
        
        return $stats;
    }
    
    /**
     * Cleanup orphan and stale lock files
     */
    private static function cleanupLocks(int $now): array
    {
        $stats = ['orphan' => 0, 'stale' => 0];
        
        if (!is_dir(self::LOCK_DIR)) {
            return $stats;
        }
        
        $lockFiles = glob(self::LOCK_DIR . '/*.lock') ?: [];
        
        foreach ($lockFiles as $lockFile) {
            // Skip cleanup lock
            if (basename($lockFile) === '.cleanup.lock') {
                continue;
            }
            
            $sessionFileName = str_replace('.lock', '', basename($lockFile));
            $sessionFile = self::SESSION_DIR . '/' . $sessionFileName;
            
            // Orphan lock (no corresponding session)
            if (!file_exists($sessionFile)) {
                @unlink($lockFile);
                $stats['orphan']++;
                continue;
            }
            
            // Stale lock (too old)
            $lockAge = $now - (filemtime($lockFile) ?: 0);
            if ($lockAge > self::STALE_LOCK_TIMEOUT) {
                @unlink($lockFile);
                $stats['stale']++;
            }
        }
        
        return $stats;
    }
    
    /**
     * Run comprehensive cleanup (legacy compatibility)
     */
    private static function runCleanup(): array
    {
        return self::runIntelligentCleanup();
    }
    
    /**
     * Clean up expired sessions (public method for manual/cron calls)
     */
    public static function cleanupExpiredSessions(): array
    {
        if (!self::acquireCleanupLock()) {
            return ['error' => 'Cleanup already in progress'];
        }
        
        try {
            return self::runIntelligentCleanup();
        } finally {
            self::releaseCleanupLock();
        }
    }
    
    /**
     * Force full cleanup (for maintenance)
     */
    public static function forceCleanup(): array
    {
        self::log('INFO', 'Force cleanup initiated');
        
        // Clear cooldown
        self::saveCleanupState([
            'last_cleanup' => 0,
            'recent_requests' => 0,
        ]);
        
        // Force acquire lock
        $lockFile = self::LOCK_DIR . '/.cleanup.lock';
        @unlink($lockFile);
        
        if (!self::acquireCleanupLock()) {
            return ['error' => 'Failed to acquire cleanup lock'];
        }
        
        try {
            return self::runIntelligentCleanup();
        } finally {
            self::releaseCleanupLock();
        }
    }
    
    /**
     * Emergency cleanup - aggressive removal to free space
     */
    public static function emergencyCleanup(float $targetFreePercent = 0.5): array
    {
        self::log('WARNING', 'Emergency cleanup initiated', ['target_free' => $targetFreePercent]);
        
        // Force acquire lock
        $lockFile = self::LOCK_DIR . '/.cleanup.lock';
        @unlink($lockFile);
        
        if (!self::acquireCleanupLock()) {
            return ['error' => 'Failed to acquire cleanup lock'];
        }
        
        try {
            $stats = ['removed' => 0, 'freed_mb' => 0];
            
            if (!is_dir(self::SESSION_DIR)) {
                return $stats;
            }
            
            $files = glob(self::SESSION_DIR . '/*.dat') ?: [];
            $totalCount = count($files);
            $targetRemove = (int)ceil($totalCount * $targetFreePercent);
            
            // Get file info
            $fileInfo = [];
            foreach ($files as $file) {
                $fileInfo[] = [
                    'path' => $file,
                    'mtime' => filemtime($file) ?: 0,
                    'size' => filesize($file) ?: 0,
                ];
            }
            
            // Sort by modification time (oldest first)
            usort($fileInfo, fn($a, $b) => $a['mtime'] <=> $b['mtime']);
            
            // Remove oldest files
            for ($i = 0; $i < $targetRemove && $i < count($fileInfo); $i++) {
                if (self::safeDelete($fileInfo[$i]['path'])) {
                    $stats['removed']++;
                    $stats['freed_mb'] += $fileInfo[$i]['size'] / 1024 / 1024;
                }
            }
            
            $stats['freed_mb'] = round($stats['freed_mb'], 2);
            
            self::log('WARNING', 'Emergency cleanup completed', $stats);
            
            return $stats;
        } finally {
            self::releaseCleanupLock();
        }
    }
    
    /**
     * Schedule cleanup for next request (won't run immediately)
     */
    public static function scheduleCleanup(): void
    {
        self::saveCleanupState([
            'last_cleanup' => 0, // Force next request to run cleanup
            'scheduled' => true,
        ]);
    }
    
    /**
     * Track request activity (for idle detection)
     */
    public static function trackActivity(): void
    {
        $state = self::getCleanupState();
        $state['recent_requests'] = ($state['recent_requests'] ?? 0) + 1;
        self::saveCleanupState($state);
    }
    
    /**
     * Get comprehensive cleanup statistics
     */
    public static function getStats(): array
    {
        if (!is_dir(self::SESSION_DIR)) {
            return [
                'total_sessions' => 0,
                'total_size_mb' => 0,
                'expired_count' => 0,
                'active_count' => 0,
                'health_status' => 'healthy',
            ];
        }
        
        $now = time();
        $files = glob(self::SESSION_DIR . '/*.dat') ?: [];
        $totalSize = 0;
        $expired = 0;
        $active = 0;
        $byAge = ['<1h' => 0, '1-6h' => 0, '6-24h' => 0, '>24h' => 0];
        $userCounts = [];
        
        foreach ($files as $file) {
            $size = filesize($file) ?: 0;
            $totalSize += $size;
            $fileAge = $now - (filemtime($file) ?: 0);
            
            // Categorize by age
            if ($fileAge < 3600) {
                $byAge['<1h']++;
            } elseif ($fileAge < 21600) {
                $byAge['1-6h']++;
            } elseif ($fileAge < 86400) {
                $byAge['6-24h']++;
            } else {
                $byAge['>24h']++;
            }
            
            if ($fileAge > self::SESSION_EXPIRY) {
                $expired++;
            } else {
                $active++;
            }
            
            // Try to get user ID for distribution stats
            $data = self::loadSession($file);
            if ($data !== null && isset($data['user_id'])) {
                $userId = $data['user_id'];
                $userCounts[$userId] = ($userCounts[$userId] ?? 0) + 1;
            }
        }
        
        $totalSizeMb = round($totalSize / 1024 / 1024, 2);
        $sessionRatio = count($files) / self::MAX_TOTAL_SESSIONS;
        $storageRatio = $totalSizeMb / self::MAX_STORAGE_MB;
        
        // Determine health status
        $health = 'healthy';
        $maxRatio = max($sessionRatio, $storageRatio);
        if ($maxRatio >= self::EMERGENCY_CLEANUP_THRESHOLD) {
            $health = 'critical';
        } elseif ($maxRatio >= self::AGGRESSIVE_CLEANUP_THRESHOLD) {
            $health = 'warning';
        } elseif ($expired > count($files) * 0.3) {
            $health = 'cleanup_needed';
        }
        
        // Cleanup state
        $cleanupState = self::getCleanupState();
        $lastCleanup = $cleanupState['last_cleanup'] ?? 0;
        $lastStats = $cleanupState['last_stats'] ?? null;
        
        return [
            'total_sessions' => count($files),
            'total_size_mb' => $totalSizeMb,
            'expired_count' => $expired,
            'active_count' => $active,
            'max_sessions' => self::MAX_TOTAL_SESSIONS,
            'max_storage_mb' => self::MAX_STORAGE_MB,
            'session_usage_percent' => round($sessionRatio * 100, 1),
            'storage_usage_percent' => round($storageRatio * 100, 1),
            'health_status' => $health,
            'by_age' => $byAge,
            'unique_users' => count($userCounts),
            'avg_sessions_per_user' => count($userCounts) > 0 
                ? round(count($files) / count($userCounts), 1) 
                : 0,
            'max_sessions_single_user' => !empty($userCounts) ? max($userCounts) : 0,
            'last_cleanup' => $lastCleanup > 0 
                ? date('Y-m-d H:i:s', $lastCleanup) 
                : 'never',
            'last_cleanup_stats' => $lastStats,
            'orphan_locks' => count(glob(self::LOCK_DIR . '/*.lock') ?: []),
        ];
    }
    
    /**
     * Get health check (simplified status for monitoring)
     */
    public static function healthCheck(): array
    {
        $stats = self::getStats();
        
        return [
            'status' => $stats['health_status'],
            'session_count' => $stats['total_sessions'],
            'storage_mb' => $stats['total_size_mb'],
            'expired_percent' => $stats['total_sessions'] > 0 
                ? round(($stats['expired_count'] / $stats['total_sessions']) * 100, 1)
                : 0,
            'needs_cleanup' => in_array($stats['health_status'], ['warning', 'critical', 'cleanup_needed']),
        ];
    }
    
    /**
     * Clear all sessions for a user (for account deletion)
     */
    public static function clearAllUserSessions(int $userId): int
    {
        $userSessions = self::getUserSessions($userId);
        $deleted = 0;
        
        foreach ($userSessions as $session) {
            if (self::safeDelete($session['path'])) {
                $deleted++;
            }
        }
        
        self::log('INFO', 'Cleared all user sessions', [
            'user_id' => $userId,
            'count' => $deleted
        ]);
        
        return $deleted;
    }
}
