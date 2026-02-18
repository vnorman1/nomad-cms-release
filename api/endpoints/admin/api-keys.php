<?php
/**
 * NOMAD CMS - API Keys Management Endpoint
 * 
 * Admin-only endpoint for managing API keys.
 * 
 * GET    - List all API keys (masked)
 * POST   - Create new API key (returns key only once!)
 * DELETE - Revoke an API key
 */

declare(strict_types=1);

require_once __DIR__ . '/../../bootstrap.php';

use NomadCMS\Security\ApiKeyService;
use NomadCMS\Security\InputSanitizer;
use NomadCMS\Database\AuthDatabase;
use NomadCMS\Database\UserRepository;
use NomadCMS\Middleware\AuthMiddleware;
use NomadCMS\Middleware\CSRFMiddleware;
use NomadCMS\Auth\TOTPService;

header('Content-Type: application/json');

// Get request method
$method = $_SERVER['REQUEST_METHOD'];

// Handle CORS preflight
if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

try {
    // Authenticate user
    $user = AuthMiddleware::requireAuth();
    
    // Admin-only check
    if (empty($user->is_admin)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Admin access required']);
        exit;
    }
    
    // Get user ID from database
    $db = AuthDatabase::getInstance();
    $stmt = $db->prepare("SELECT id FROM users WHERE uuid = ?");
    $stmt->execute([$user->uuid]);
    $userRow = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$userRow) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'User not found']);
        exit;
    }
    
    $userId = (int) $userRow['id'];
    $apiKeyService = new ApiKeyService();
    
    switch ($method) {
        case 'GET':
            // List all keys
            $keys = $apiKeyService->listKeys($userId);
            echo json_encode([
                'success' => true,
                'keys' => $keys,
            ]);
            break;
            
        case 'POST':
            // SECURITY: Validate CSRF token for session-based requests
            CSRFMiddleware::validateForSession();
            
            // Create new key
            $input = json_decode(file_get_contents('php://input'), true) ?? [];
            
            // Sanitize name
            $name = InputSanitizer::apiKeyName($input['name'] ?? null);
            if (!$name) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Valid key name is required (1-100 characters)']);
                exit;
            }
            
            // Validate permissions using whitelist
            $requestedPerms = $input['permissions'] ?? ['read'];
            $validPerms = ['read', 'write', 'admin'];
            $permissions = InputSanitizer::whitelist($requestedPerms, $validPerms);
            
            if (empty($permissions)) {
                $permissions = ['read'];
            }
            
            // Validate expiry
            $expiresIn = InputSanitizer::positiveInt($input['expires_in'] ?? null);
            $expiresAt = null;
            
            if ($expiresIn !== null && $expiresIn > 0 && $expiresIn <= 3650) { // Max 10 years
                $expiresAt = date('c', strtotime("+{$expiresIn} days"));
            }
            
            // Check if enhanced (PRO) key is requested
            $isEnhanced = filter_var($input['enhanced'] ?? false, FILTER_VALIDATE_BOOLEAN);
            
            if ($isEnhanced) {
                // SECURITY: PRO keys require TOTP verification
                $totpCode = $input['totp_code'] ?? null;
                
                if (!$totpCode || strlen($totpCode) !== 6) {
                    http_response_code(400);
                    echo json_encode(['success' => false, 'error' => 'TOTP kód szükséges PRO kulcs létrehozásához']);
                    exit;
                }
                
                // Get user data with TOTP secret
                $userData = UserRepository::findByUuid($user->uuid);
                
                // Check if TOTP is enabled for this user
                if (!$userData || !$userData['totp_enabled'] || empty($userData['totp_secret'])) {
                    http_response_code(400);
                    echo json_encode([
                        'success' => false, 
                        'error' => 'A 2FA-nak engedélyezve kell lennie PRO kulcs létrehozásához'
                    ]);
                    exit;
                }
                
                // Get decrypted TOTP secret
                $totpSecret = UserRepository::getTotpSecret($userData);
                if (!$totpSecret) {
                    http_response_code(500);
                    echo json_encode(['success' => false, 'error' => 'TOTP konfigurációs hiba']);
                    exit;
                }
                
                // Verify TOTP
                if (!TOTPService::verifyCode($totpSecret, $totpCode)) {
                    http_response_code(401);
                    echo json_encode(['success' => false, 'error' => 'Érvénytelen TOTP kód']);
                    exit;
                }
                
                // Validate encrypted permissions for enhanced keys
                $requestedEncryptedPerms = $input['encrypted_permissions'] ?? [];
                $validEncryptedPerms = ['encrypted_read', 'encrypted_write'];
                $encryptedPermissions = InputSanitizer::whitelist($requestedEncryptedPerms, $validEncryptedPerms);
                
                $result = $apiKeyService->createEnhancedKey($userId, $name, $permissions, $encryptedPermissions, $expiresAt);
                
                echo json_encode([
                    'success' => true,
                    'message' => 'Enhanced (PRO) API key created. Save it now - you will not be able to see it again!',
                    'key' => $result,
                ]);
            } else {
                $result = $apiKeyService->createKey($userId, $name, $permissions, $expiresAt);
                
                echo json_encode([
                    'success' => true,
                    'message' => 'API key created. Save it now - you will not be able to see it again!',
                    'key' => $result,
                ]);
            }
            break;
            
        case 'DELETE':
            // SECURITY: Validate CSRF token for session-based requests
            CSRFMiddleware::validateForSession();
            
            // Revoke key
            $keyId = InputSanitizer::positiveInt($_GET['id'] ?? null);
            
            if (!$keyId) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Valid Key ID is required']);
                exit;
            }
            
            $revoked = $apiKeyService->revokeKey($userId, $keyId);
            
            if ($revoked) {
                echo json_encode([
                    'success' => true,
                    'message' => 'API key revoked',
                ]);
            } else {
                http_response_code(404);
                echo json_encode([
                    'success' => false,
                    'error' => 'Key not found or already revoked',
                ]);
            }
            break;
            
        default:
            http_response_code(405);
            echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    }
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => ($_ENV['APP_DEBUG'] ?? 'false') === 'true' 
            ? 'Server error: ' . $e->getMessage() 
            : 'Internal server error',
    ]);
}
