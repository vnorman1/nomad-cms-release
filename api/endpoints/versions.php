<?php
/**
 * NOMAD CMS - Versions API Endpoint
 * 
 * Handles all version history operations using query parameters:
 * - GET ?action=history&slot_key=X           - Get version history
 * - GET ?action=version&slot_key=X&version=N - Get specific version
 * - GET ?action=settings                     - Get versioning settings
 * - GET ?action=stats                        - Get storage statistics
 * - POST ?action=restore&slot_key=X          - Restore to version
 * - POST ?action=settings                    - Update versioning settings
 * - POST ?action=cleanup                     - Run cleanup task
 * - DELETE ?action=delete&slot_key=X         - Delete all versions
 * 
 * HYBRID VERSIONING (NEW):
 * - POST ?action=promote&version_id=X        - Promote shadow to commit/named
 * - POST ?action=rename&version_id=X         - Rename commit/named version
 * - DELETE ?action=delete_version&version_id=X - Delete specific version
 * - POST ?action=cleanup_shadows             - Cleanup expired shadow versions
 * 
 * SECURITY:
 * - All endpoints require authentication
 * - Rate limited: 60 requests/minute for history, 15 requests/minute for restore
 * - Admin-only: settings, cleanup, delete operations
 */

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

use NomadCMS\Services\VersioningService;
use NomadCMS\Services\Versioning\VersionRepository;
use NomadCMS\Services\LoggerService;
use NomadCMS\Middleware\AuthMiddleware;
use NomadCMS\Middleware\RateLimitMiddleware;

// Apply CORS headers
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-API-Key');
header('Content-Type: application/json');

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Authenticate request
try {
    $currentUser = AuthMiddleware::requireAuth();
} catch (Exception $e) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Authentication required']);
    exit;
}

// Parse request
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$slotKey = isset($_GET['slot_key']) ? urldecode($_GET['slot_key']) : '';
$versionNumber = isset($_GET['version']) ? (int) $_GET['version'] : 0;

// Get request body for POST/PUT
$input = [];
if (in_array($method, ['POST', 'PUT'])) {
    $rawInput = file_get_contents('php://input');
    if ($rawInput) {
        $input = json_decode($rawInput, true) ?? [];
    }
}

try {
    $versioning = VersioningService::getInstance();
    
    // =========================================================================
    // RATE LIMITING - Apply appropriate limits based on action type
    // =========================================================================
    
    // Stricter limits for write operations
    $isWriteOperation = in_array($action, ['restore', 'settings', 'cleanup', 'delete', 'promote', 'rename', 'delete_version', 'cleanup_shadows']);
    if ($isWriteOperation) {
        // 15 write operations per minute per IP
        RateLimitMiddleware::check(
            key: 'versions:write:' . ($_SERVER['REMOTE_ADDR'] ?? 'unknown'),
            maxRequests: 15,
            windowSeconds: 60
        );
    } else {
        // 60 read operations per minute per IP
        RateLimitMiddleware::check(
            key: 'versions:read:' . ($_SERVER['REMOTE_ADDR'] ?? 'unknown'),
            maxRequests: 60,
            windowSeconds: 60
        );
    }
    
    // =========================================================================
    // SETTINGS ROUTES
    // =========================================================================
    
    // GET ?action=settings - Get versioning settings
    if ($method === 'GET' && $action === 'settings') {
        $settings = $versioning->getAllSettings();
        echo json_encode([
            'success' => true,
            'settings' => $settings
        ]);
        exit;
    }
    
    // POST ?action=settings - Update versioning settings
    if ($method === 'POST' && $action === 'settings') {
        // Require admin role
        if (!($currentUser->is_admin ?? false)) {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'Admin access required']);
            exit;
        }
        
        $updated = [];
        foreach ($input as $key => $value) {
            if (is_string($value)) {
                $versioning->setSetting($key, $value);
                $updated[$key] = $value;
            }
        }
        
        echo json_encode([
            'success' => true,
            'updated' => $updated
        ]);
        exit;
    }
    
    // =========================================================================
    // STATS ROUTES
    // =========================================================================
    
    // GET ?action=stats - Get storage statistics
    if ($method === 'GET' && $action === 'stats') {
        $stats = $versioning->getStorageStats();
        echo json_encode([
            'success' => true,
            'stats' => $stats
        ]);
        exit;
    }
    
    // POST ?action=cleanup - Run cleanup task
    if ($method === 'POST' && $action === 'cleanup') {
        // Require admin role
        if (!($currentUser->is_admin ?? false)) {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'Admin access required']);
            exit;
        }
        
        $result = $versioning->cleanupOldVersions();
        echo json_encode([
            'success' => true,
            'result' => $result
        ]);
        exit;
    }
    
    // =========================================================================
    // VERSION HISTORY ROUTES
    // =========================================================================
    
    // Helper: Validate slot access
    // Currently checks: slot exists OR user has admin role
    // This prevents information leakage about non-existent slots
    $validateSlotAccess = function(string $slotKey) use ($currentUser): void {
        // Admins can access any slot (even for debugging)
        if ($currentUser->is_admin ?? false) {
            return;
        }
        
        // Check if slot exists in database
        $slotData = \NomadCMS\Database\ContentDatabase::getSlot($slotKey);
        if ($slotData === null) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Slot not found']);
            exit;
        }
    };
    
    // GET ?action=history&slot_key=X - Get version history
    if ($method === 'GET' && $action === 'history') {
        if (empty($slotKey)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Missing slot_key parameter']);
            exit;
        }
        
        // Validate slot access
        $validateSlotAccess($slotKey);
        
        $limit = (int) ($_GET['limit'] ?? 20);
        $offset = (int) ($_GET['offset'] ?? 0);
        $includeShadows = filter_var($_GET['include_shadows'] ?? 'false', FILTER_VALIDATE_BOOLEAN);
        
        $history = $versioning->getVersionHistory($slotKey, $limit, $offset, $includeShadows);
        $totalCount = $versioning->getVersionCount($slotKey, $includeShadows);
        
        echo json_encode([
            'success' => true,
            'slot_key' => $slotKey,
            'versions' => $history,
            'total_count' => $totalCount,
            'limit' => $limit,
            'offset' => $offset,
            'include_shadows' => $includeShadows
        ]);
        exit;
    }
    
    // GET ?action=version&slot_key=X&version=N - Get specific version
    if ($method === 'GET' && $action === 'version') {
        if (empty($slotKey) || $versionNumber < 1) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Missing slot_key or version parameter']);
            exit;
        }
        
        // Validate slot access
        $validateSlotAccess($slotKey);
        
        $version = $versioning->getVersion($slotKey, $versionNumber);
        
        if (!$version) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Version not found']);
            exit;
        }
        
        echo json_encode([
            'success' => true,
            'version' => $version
        ]);
        exit;
    }
    
    // =========================================================================
    // RESTORE ROUTE
    // =========================================================================
    
    // POST ?action=restore&slot_key=X - Restore to specific version
    if ($method === 'POST' && $action === 'restore') {
        if (empty($slotKey)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Missing slot_key parameter']);
            exit;
        }
        
        // Validate slot access
        $validateSlotAccess($slotKey);
        
        // SECURITY FIX: Require write permission for restore operations
        // Restore modifies content - must have write access
        try {
            AuthMiddleware::requirePermission('write');
        } catch (\Exception $e) {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'Write permission required for restore']);
            exit;
        }
        
        $targetVersion = (int) ($input['version'] ?? 0);
        $useAtomicRestore = (bool) ($input['atomic'] ?? true); // Default to atomic restore
        
        if (!$targetVersion) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Missing version parameter']);
            exit;
        }
        
        // Use atomic restore (database-level transaction) by default
        if ($useAtomicRestore) {
            $result = $versioning->atomicRestore(
                $slotKey, 
                $targetVersion, 
                $currentUser->email ?? 'unknown'
            );
        } else {
            // Legacy restore (returns content only, client must save)
            $currentContent = $input['current_content'] ?? null;
            if ($currentContent === null) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Missing current_content for non-atomic restore']);
                exit;
            }
            $result = $versioning->restoreToVersion($slotKey, $targetVersion, $currentContent);
        }
        
        if (!$result['success']) {
            http_response_code(400);
            echo json_encode($result);
            exit;
        }
        
        LoggerService::info('VersionsAPI: Version restored', [
            'slot_key' => $slotKey,
            'target_version' => $targetVersion,
            'atomic' => $useAtomicRestore,
            'user' => $currentUser->email ?? 'unknown'
        ]);
        
        echo json_encode($result);
        exit;
    }
    
    // GET ?action=preview&slot_key=X&version=N - Preview version without restoring
    if ($method === 'GET' && $action === 'preview') {
        if (empty($slotKey) || $versionNumber < 1) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Missing slot_key or version parameter']);
            exit;
        }
        
        // Validate slot access
        $validateSlotAccess($slotKey);
        
        // Preview is read-only, no special permission needed beyond auth
        $result = $versioning->reconstructVersion($slotKey, $versionNumber);
        
        if (!$result['success']) {
            http_response_code(400);
            echo json_encode($result);
            exit;
        }
        
        echo json_encode([
            'success' => true,
            'preview' => true,
            'content' => $result['content'],
            'version' => $versionNumber,
            'strategy' => $result['strategy'] ?? 'unknown'
        ]);
        exit;
    }
    
    // =========================================================================
    // DELETE ROUTE
    // =========================================================================
    
    // DELETE ?action=delete&slot_key=X - Delete all versions
    if ($method === 'DELETE' && $action === 'delete') {
        if (empty($slotKey)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Missing slot_key parameter']);
            exit;
        }
        
        // Validate slot access
        $validateSlotAccess($slotKey);
        
        // Require admin permission
        if (!($currentUser->is_admin ?? false)) {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'Admin access required']);
            exit;
        }
        
        $result = $versioning->deleteAllVersions($slotKey);
        
        LoggerService::warning('VersionsAPI: All versions deleted', [
            'slot_key' => $slotKey,
            'user' => $currentUser->email ?? 'unknown'
        ]);
        
        echo json_encode([
            'success' => $result,
            'slot_key' => $slotKey
        ]);
        exit;
    }
    
    // =========================================================================
    // HYBRID VERSIONING ROUTES (Shadow/Commit/Named)
    // =========================================================================
    
    // POST ?action=promote&version_id=X - Promote shadow to commit/named
    if ($method === 'POST' && $action === 'promote') {
        $versionId = (int) ($_GET['version_id'] ?? $input['version_id'] ?? 0);
        
        if (!$versionId) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Missing version_id parameter']);
            exit;
        }
        
        // Require write permission
        try {
            AuthMiddleware::requirePermission('write');
        } catch (\Exception $e) {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'Write permission required']);
            exit;
        }
        
        $targetType = $input['type'] ?? VersionRepository::TYPE_COMMIT;
        $name = $input['name'] ?? null;
        
        // Validate target type
        if (!in_array($targetType, [VersionRepository::TYPE_COMMIT, VersionRepository::TYPE_NAMED])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Invalid target type. Use "commit" or "named"']);
            exit;
        }
        
        $result = $versioning->promoteVersion($versionId, $targetType, $name);
        
        if (!$result['success']) {
            http_response_code(400);
            echo json_encode($result);
            exit;
        }
        
        LoggerService::info('VersionsAPI: Version promoted', [
            'version_id' => $versionId,
            'target_type' => $targetType,
            'name' => $name,
            'user' => $currentUser->email ?? 'unknown'
        ]);
        
        echo json_encode([
            'success' => true,
            'version_id' => $versionId,
            'new_type' => $targetType,
            'name' => $name
        ]);
        exit;
    }
    
    // POST ?action=rename&version_id=X - Rename commit/named version
    if ($method === 'POST' && $action === 'rename') {
        $versionId = (int) ($_GET['version_id'] ?? $input['version_id'] ?? 0);
        $name = $input['name'] ?? '';
        
        if (!$versionId) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Missing version_id parameter']);
            exit;
        }
        
        if (empty($name)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Missing name parameter']);
            exit;
        }
        
        // Require write permission
        try {
            AuthMiddleware::requirePermission('write');
        } catch (\Exception $e) {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'Write permission required']);
            exit;
        }
        
        $result = $versioning->renameVersion($versionId, $name);
        
        if (!$result['success']) {
            http_response_code(400);
            echo json_encode($result);
            exit;
        }
        
        echo json_encode([
            'success' => true,
            'version_id' => $versionId,
            'new_name' => $name
        ]);
        exit;
    }
    
    // DELETE ?action=delete_version&version_id=X - Delete specific version
    if ($method === 'DELETE' && $action === 'delete_version') {
        $versionId = (int) ($_GET['version_id'] ?? 0);
        $forceNamedDelete = filter_var($_GET['force'] ?? 'false', FILTER_VALIDATE_BOOLEAN);
        
        if (!$versionId) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Missing version_id parameter']);
            exit;
        }
        
        // Require write permission
        try {
            AuthMiddleware::requirePermission('write');
        } catch (\Exception $e) {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'Write permission required']);
            exit;
        }
        
        // Get version info first for logging
        $versionInfo = $versioning->getVersionById($versionId);
        
        $result = $versioning->deleteVersion($versionId, $forceNamedDelete);
        
        if (!$result['success']) {
            // Check if requires confirmation
            if (isset($result['requires_confirmation']) && $result['requires_confirmation']) {
                http_response_code(409); // Conflict - needs confirmation
                echo json_encode($result);
                exit;
            }
            http_response_code(400);
            echo json_encode($result);
            exit;
        }
        
        LoggerService::info('VersionsAPI: Version deleted', [
            'version_id' => $versionId,
            'version_info' => $versionInfo,
            'user' => $currentUser->email ?? 'unknown'
        ]);
        
        echo json_encode([
            'success' => true,
            'version_id' => $versionId,
            'deleted' => true
        ]);
        exit;
    }
    
    // POST ?action=cleanup_shadows - Cleanup expired shadow versions
    if ($method === 'POST' && $action === 'cleanup_shadows') {
        $slotKeyFilter = $input['slot_key'] ?? null;
        
        $deleted = $versioning->cleanupExpiredShadows($slotKeyFilter);
        
        echo json_encode([
            'success' => true,
            'deleted_count' => $deleted,
            'slot_key' => $slotKeyFilter
        ]);
        exit;
    }
    
    // GET ?action=version_by_id&version_id=X - Get version by ID (not version number)
    if ($method === 'GET' && $action === 'version_by_id') {
        $versionId = (int) ($_GET['version_id'] ?? 0);
        
        if (!$versionId) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Missing version_id parameter']);
            exit;
        }
        
        $version = $versioning->getVersionById($versionId);
        
        if (!$version) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Version not found']);
            exit;
        }
        
        // Validate slot access
        $validateSlotAccess($version['slot_key']);
        
        echo json_encode([
            'success' => true,
            'version' => $version
        ]);
        exit;
    }
    
    // No matching route
    http_response_code(400);
    echo json_encode([
        'success' => false, 
        'error' => 'Invalid action. Valid actions: settings, stats, cleanup, history, version, version_by_id, restore, preview, delete, promote, rename, delete_version, cleanup_shadows'
    ]);
    
} catch (Exception $e) {
    LoggerService::error('VersionsAPI: Error', [
        'error' => $e->getMessage(),
        'trace' => $e->getTraceAsString()
    ]);
    
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Internal server error'
    ]);
}
