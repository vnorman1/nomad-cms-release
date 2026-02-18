<?php
/**
 * NOMAD CMS - User Preferences Endpoint
 * 
 * GET  - Get current user preferences
 * PUT  - Update user preferences
 */

declare(strict_types=1);

require_once __DIR__ . '/../../bootstrap.php';

use NomadCMS\Database\AuthDatabase;
use NomadCMS\Middleware\AuthMiddleware;
use NomadCMS\Middleware\CSRFMiddleware;

header('Content-Type: application/json');

$method = $_SERVER['REQUEST_METHOD'];

// Handle CORS preflight
if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

try {
    // Authenticate user
    $user = AuthMiddleware::requireAuth();
    
    $db = AuthDatabase::getInstance();
    
    switch ($method) {
        case 'GET':
            // Get preferences
            $stmt = $db->prepare("SELECT preferences FROM users WHERE uuid = ?");
            $stmt->execute([$user->uuid]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            
            $preferences = $row['preferences'] ? json_decode($row['preferences'], true) : [];
            
            echo json_encode([
                'success' => true,
                'preferences' => $preferences,
            ]);
            break;
            
        case 'PUT':
            // SECURITY: Validate CSRF token for session-based requests
            CSRFMiddleware::validateForSession();
            
            // Update preferences
            $input = json_decode(file_get_contents('php://input'), true) ?? [];
            
            // Get current preferences
            $stmt = $db->prepare("SELECT preferences FROM users WHERE uuid = ?");
            $stmt->execute([$user->uuid]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            
            $current = $row['preferences'] ? json_decode($row['preferences'], true) : [];
            
            // Merge with new values (only allow specific keys)
            $allowedKeys = ['theme', 'language', 'sidebar_collapsed', 'compact_mode', 'notification_level'];
            
            foreach ($allowedKeys as $key) {
                if (array_key_exists($key, $input)) {
                    $value = $input[$key];
                    
                    // Validate theme value
                    if ($key === 'theme') {
                        if ($value === 'system' || $value === null) {
                            // Remove from preferences (use system default)
                            unset($current['theme']);
                        } elseif (in_array($value, ['light', 'dark'])) {
                            $current['theme'] = $value;
                        }
                    }
                    // Validate language
                    elseif ($key === 'language') {
                        if ($value === null) {
                            unset($current['language']);
                        } elseif (in_array($value, ['hu', 'en'])) {
                            $current['language'] = $value;
                        }
                    }
                    // Boolean values
                    elseif (in_array($key, ['sidebar_collapsed', 'compact_mode'])) {
                        if ($value === null || $value === false) {
                            unset($current[$key]);
                        } else {
                            $current[$key] = (bool) $value;
                        }
                    }
                    // Notification level
                    elseif ($key === 'notification_level') {
                        if ($value === null || $value === 'all') {
                            // 'all' is the default, no need to store
                            unset($current['notification_level']);
                        } elseif (in_array($value, ['all', 'normal', 'critical', 'none'])) {
                            $current['notification_level'] = $value;
                        }
                    }
                }
            }
            
            // Store as JSON (empty object becomes null)
            $jsonValue = empty($current) ? null : json_encode($current);
            
            $stmt = $db->prepare("UPDATE users SET preferences = ?, updated_at = datetime('now') WHERE uuid = ?");
            $stmt->execute([$jsonValue, $user->uuid]);
            
            echo json_encode([
                'success' => true,
                'message' => 'Preferences updated',
                'preferences' => $current,
            ]);
            break;
            
        default:
            http_response_code(405);
            echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    }
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Server error: ' . $e->getMessage(),
    ]);
}
