<?php
/**
 * Apply Update Endpoint
 * 
 * Applies a delta update to the CMS.
 * Security hardened:
 * - Rate limiting (2 requests/hour)
 * - GPG signature verification (required in production)
 * - Audit logging
 * - Progress tracking via SSE
 * - Migration runner
 */

declare(strict_types=1);

require_once __DIR__ . '/../../vendor/autoload.php';
require_once __DIR__ . '/../../bootstrap.php';

use NomadCMS\Config\Version;
use NomadCMS\Services\DeltaUpdateService;
use NomadCMS\Services\UpdateDownloader;
use NomadCMS\Services\SecurityValidator;
use NomadCMS\Services\UpdateAuditLogger;
use NomadCMS\Services\MigrationRunner;
use NomadCMS\Services\Auth\JWTService;
use NomadCMS\Middleware\RateLimitMiddleware;

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// Rate limiting: 2 requests per hour
RateLimitMiddleware::checkSystemUpdateApply();

// Progress file for SSE - use predictable name so SSE endpoint can find it
$progressFile = sys_get_temp_dir() . '/nomad_update_progress.json';

// Secret for HMAC (from environment or generate)
$progressSecret = $_ENV['UPDATE_PROGRESS_SECRET'] ?? hash('sha256', __FILE__ . filemtime(__FILE__));

/**
 * Update progress for SSE endpoint with HMAC integrity
 */
function updateProgress(string $file, string $stage, int $progress, string $message, string $secret): void
{
    $data = [
        'stage' => $stage,
        'progress' => $progress,
        'message' => $message,
        'timestamp' => time(),
    ];
    
    // Add HMAC for integrity verification
    $json = json_encode($data);
    $hmac = hash_hmac('sha256', $json, $secret);
    
    $secureData = [
        'data' => $data,
        'hmac' => $hmac,
    ];
    
    file_put_contents($file, json_encode($secureData), LOCK_EX);
}

$auditLogger = new UpdateAuditLogger();
$userId = 'unknown';
$currentVersion = Version::VERSION;
$targetVersion = null;
$deltaApplyReached = false;

try {
    // Verify JWT and admin status
    $jwt = JWTService::getInstance();
    $token = $jwt->extractTokenFromHeader();
    $payload = $jwt->validateToken($token);
    
    if (!$payload) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        exit;
    }
    
    // Check admin permission
    if (!($payload['is_admin'] ?? false)) {
        http_response_code(403);
        echo json_encode(['error' => 'Admin rights required']);
        exit;
    }
    
    $userId = $payload['user_id'] ?? $payload['sub'] ?? 'unknown';
    
    // Get request body
    $input = json_decode(file_get_contents('php://input'), true);
    $targetVersion = $input['version'] ?? null;
    
    if (!$targetVersion) {
        http_response_code(400);
        echo json_encode(['error' => 'Target version required']);
        exit;
    }
    
    // Validate version format
    if (!preg_match('/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/', $targetVersion)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid version format']);
        exit;
    }
    
    // Log update start
    $auditLogger->logUpdateStart($userId, $currentVersion, $targetVersion);
    updateProgress($progressFile, 'starting', 5, 'Frissítés előkészítése...', $progressSecret);
    
    // Initialize services
    $security = new SecurityValidator();
    $downloader = new UpdateDownloader();
    $deltaService = new DeltaUpdateService($security, $downloader);
    
    // Step 1: Download and verify manifest
    updateProgress($progressFile, 'downloading', 10, 'Manifest letöltése...', $progressSecret);
    $manifestResult = $downloader->downloadManifest($targetVersion);
    if (!$manifestResult['success']) {
        throw new RuntimeException('Failed to download manifest: ' . ($manifestResult['error'] ?? 'Unknown'));
    }
    
    $remoteManifest = $manifestResult['manifest'];
    
    // Step 2: GPG signature verification (REQUIRED in production)
    updateProgress($progressFile, 'verifying', 15, 'Aláírás ellenőrzése...', $progressSecret);
    
    if (Version::requireGPGSignature()) {
        // Check if signature exists
        if (!isset($remoteManifest['signature'])) {
            $auditLogger->logGPGVerification($targetVersion, false, null);
            throw new RuntimeException('GPG signature required but not found in manifest');
        }
        
        // Verify signature
        $publicKeyPath = Version::getGPGPublicKeyPath();
        if (!file_exists($publicKeyPath)) {
            throw new RuntimeException('GPG public key not found. Configure UPDATE_GPG_PUBLIC_KEY in .env');
        }
        
        $signatureValid = $security->verifyGPGSignature(
            json_encode($remoteManifest['files'] ?? []),
            $remoteManifest['signature'],
            $publicKeyPath
        );
        
        $auditLogger->logGPGVerification(
            $targetVersion,
            $signatureValid,
            $remoteManifest['fingerprint'] ?? null
        );
        
        if (!$signatureValid) {
            throw new RuntimeException('Invalid GPG signature - update rejected for security');
        }
    } elseif (isset($remoteManifest['signature'])) {
        // GPG not required but signature present - verify anyway
        $publicKeyPath = Version::getGPGPublicKeyPath();
        if (file_exists($publicKeyPath)) {
            $signatureValid = $security->verifyGPGSignature(
                json_encode($remoteManifest['files'] ?? []),
                $remoteManifest['signature'],
                $publicKeyPath
            );
            $auditLogger->logGPGVerification($targetVersion, $signatureValid, null);
            
            if (!$signatureValid) {
                throw new RuntimeException('Invalid GPG signature - update rejected');
            }
        }
    }
    
    // Step 3: Validate manifest paths (prevent path traversal)
    $invalidPaths = $security->validateManifestPaths($remoteManifest);
    if (!empty($invalidPaths)) {
        throw new RuntimeException('Invalid paths in manifest: ' . implode(', ', array_slice($invalidPaths, 0, 3)));
    }
    
    // Step 4: Build local manifest and calculate delta
    updateProgress($progressFile, 'analyzing', 25, 'Változások elemzése...', $progressSecret);
    $localManifest = $deltaService->buildLocalManifest();
    $delta = $deltaService->compareManifests($localManifest, $remoteManifest);
    
    // Step 5-7: Apply the delta update
    // DeltaUpdateService handles download, hash verification, backup and apply atomically
    updateProgress($progressFile, 'downloading', 35, 'Fájlok letöltése és telepítése...', $progressSecret);
    $deltaApplyReached = true;
    $result = $deltaService->applyDelta($targetVersion, $delta);
    
    if (!$result['success']) {
        throw new RuntimeException($result['error'] ?? 'Failed to apply update');
    }
    
    updateProgress($progressFile, 'applying', 75, 'Frissítés telepítése kész...', $progressSecret);
    
    // Step 8: Run migrations if needed
    $migrations = $remoteManifest['migrations'] ?? [];
    if (!empty($migrations)) {
        updateProgress($progressFile, 'migrating', 85, 'Adatbázis migráció...', $progressSecret);
        
        try {
            // Get database connection
            $dbPath = __DIR__ . '/../../databases/database.sqlite';
            if (!file_exists($dbPath)) {
                throw new RuntimeException('Database file not found for migrations');
            }
            $db = new PDO("sqlite:{$dbPath}");
            $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            
            $migrationRunner = new MigrationRunner($db);
            $migrationResults = $migrationRunner->runPending($migrations);
            
            // Check for migration errors
            foreach ($migrationResults as $name => $migResult) {
                if ($migResult['status'] === 'error') {
                    error_log("Migration error in {$name}: " . ($migResult['error'] ?? 'unknown'));
                    // Continue anyway - migration errors shouldn't block the update
                }
            }
        } catch (Throwable $e) {
            error_log('Migration error: ' . $e->getMessage());
            // Continue - don't fail the entire update for migration errors
        }
    }
    
    // Step 9: Cleanup and finish
    updateProgress($progressFile, 'complete', 100, 'Frissítés kész!', $progressSecret);
    
    // Log success
    $backupId = $result['backup_id'] ?? $result['backupId'] ?? null;
    $auditLogger->logUpdateSuccess(
        $userId,
        $currentVersion,
        $targetVersion,
        count($delta['added']),
        count($delta['modified']),
        count($delta['deleted']),
        $backupId
    );
    
    // Success!
    echo json_encode([
        'success' => true,
        'fromVersion' => $currentVersion,
        'toVersion' => $targetVersion,
        'filesAdded' => count($delta['added']),
        'filesModified' => count($delta['modified']),
        'filesDeleted' => count($delta['deleted']),
        'backupId' => $backupId,
        'message' => 'Frissítés sikeresen telepítve',
    ], JSON_THROW_ON_ERROR);

} catch (Throwable $e) {
    error_log('Apply update error: ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
    
    // Log failure (full detail stays server-side in audit log)
    $auditLogger->logUpdateFailure(
        $userId,
        $currentVersion,
        $targetVersion ?? 'unknown',
        $e->getMessage(),
        $deltaApplyReached
    );
    
    // Sanitize error for client — don't leak internal paths or SQL details
    $safeError = 'A frissítés sikertelen. Részletek a szerver naplóban.';
    
    // Update progress to error (sanitized)
    updateProgress($progressFile, 'error', 0, 'Hiba: ' . $safeError, $progressSecret);
    
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $safeError,
        'rollbackPerformed' => $deltaApplyReached,
    ]);
}
