<?php
/**
 * Admin API - User Actions
 * PUT: Update user
 * DELETE: Delete user
 * PATCH: Toggle lock status
 */

require_once __DIR__ . '/../../bootstrap.php';

use NomadCMS\Database\UserRepository;
use NomadCMS\Middleware\AuthMiddleware;
use NomadCMS\Middleware\CSRFMiddleware;
use NomadCMS\Security\InputSanitizer;
use NomadCMS\Security\WebhookService;

header('Content-Type: application/json');

try {
    // SECURITY: Validate CSRF token for session-based requests
    CSRFMiddleware::validateForSession();
    
    // 1. Authenticate and check Admin role
    $user = AuthMiddleware::requireAuth();
    
    if (empty($user->is_admin)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Unauthorized: Admin access required']);
        exit;
    }

    $method = $_SERVER['REQUEST_METHOD'];
    $data = json_decode(file_get_contents('php://input'), true) ?? [];
    
    // Sanitize and validate user ID
    $userId = InputSanitizer::positiveInt($data['id'] ?? null);

    if (!$userId) {
        // Try to get ID from query string for DELETE
        if ($method === 'DELETE' && isset($_GET['id'])) {
            $userId = InputSanitizer::positiveInt($_GET['id']);
        }
        
        if (!$userId) {
            throw new Exception('Valid User ID is required');
        }
    }

    // Prevent self-deletion or self-demotion to avoid lockout
    if ($userId == $user->id) {
        if ($method === 'DELETE') {
            throw new Exception('Cannot delete your own account');
        }
        if ($method === 'PATCH' && InputSanitizer::boolean($data['lock'] ?? false)) {
             throw new Exception('Cannot lock your own account');
        }
        if ($method === 'PUT' && isset($data['is_admin']) && !InputSanitizer::boolean($data['is_admin'])) {
             throw new Exception('Cannot remove your own admin privileges');
        }
    }

    if ($method === 'PUT') {
        // UPDATE USER - Sanitize all input data
        $sanitizedData = InputSanitizer::userUpdateData($data);
        
        if (empty($sanitizedData)) {
            throw new Exception('No valid update data provided');
        }
        
        if (UserRepository::update($userId, $sanitizedData)) {
            // Dispatch webhook event for user updated (async)
            try {
                $targetUser = UserRepository::findById($userId);
                $webhookService = new WebhookService();
                $webhookService->dispatchEventAsync('user.updated', [
                    'user_id' => $targetUser['uuid'] ?? null,
                    'email' => $targetUser['email'] ?? null,
                    'updated_fields' => array_keys($sanitizedData),
                    'updated_by' => $user->uuid ?? null,
                    'timestamp' => date('c'),
                ]);
            } catch (\Exception $e) {
                error_log("Webhook dispatch failed for user.updated: " . $e->getMessage());
            }
            echo json_encode(['success' => true, 'message' => 'User updated successfully']);
        } else {
            throw new Exception('Failed to update user');
        }

    } elseif ($method === 'DELETE') {
        // DELETE USER
        // Get user data before deletion for webhook
        $targetUser = UserRepository::findById($userId);
        
        if (UserRepository::delete($userId)) {
            // Dispatch webhook event for user deleted (async)
            try {
                $webhookService = new WebhookService();
                $webhookService->dispatchEventAsync('user.deleted', [
                    'user_id' => $targetUser['uuid'] ?? null,
                    'email' => $targetUser['email'] ?? null,
                    'deleted_by' => $user->uuid ?? null,
                    'timestamp' => date('c'),
                ]);
            } catch (\Exception $e) {
                error_log("Webhook dispatch failed for user.deleted: " . $e->getMessage());
            }
            echo json_encode(['success' => true, 'message' => 'User deleted successfully']);
        } else {
            throw new Exception('Failed to delete user');
        }

    } elseif ($method === 'PATCH') {
        // TOGGLE LOCK
        if (isset($data['lock'])) {
            $lockStatus = InputSanitizer::boolean($data['lock']);
            
            if (UserRepository::toggleLock($userId, $lockStatus)) {
                echo json_encode(['success' => true, 'message' => 'User lock status updated']);
            } else {
                throw new Exception('Failed to update lock status');
            }
        } else {
            throw new Exception('Lock status (lock: true/false) required');
        }

    } else {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    }

} catch (Exception $e) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
