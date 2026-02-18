<?php
/**
 * Admin API - Users Management
 * GET: List all users
 * POST: Create new user
 */

require_once __DIR__ . '/../../bootstrap.php';

use NomadCMS\Database\UserRepository;
use NomadCMS\Middleware\AuthMiddleware;
use NomadCMS\Middleware\CSRFMiddleware;
use NomadCMS\Security\InputSanitizer;
use NomadCMS\Security\WebhookService;

header('Content-Type: application/json');

try {
    // 1. Authenticate and check Admin role
    $user = AuthMiddleware::requireAuth();
    
    if (empty($user->is_admin)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Unauthorized: Admin access required']);
        exit;
    }

    $method = $_SERVER['REQUEST_METHOD'];

    // 2. Handle Requests
    if ($method === 'GET') {
        // LIST USERS
        $users = UserRepository::findAll();
        
        // Remove sensitive data just in case, though UserRepository selection is already specific
        $safeUsers = array_map(function($u) {
            unset($u['password_hash']);
            unset($u['totp_secret']);
            unset($u['backup_codes']);
            return $u;
        }, $users);

        echo json_encode(['success' => true, 'users' => $safeUsers]);

    } elseif ($method === 'POST') {
        // SECURITY: Validate CSRF token for session-based requests
        CSRFMiddleware::validateForSession();
        
        // CREATE USER
        $data = json_decode(file_get_contents('php://input'), true);
        
        if (!$data) {
            throw new Exception('Invalid JSON body');
        }
        
        // Sanitize inputs
        $email = InputSanitizer::email($data['email'] ?? null);
        $password = $data['password'] ?? null;
        
        if (!$email) {
            throw new Exception('Valid email is required');
        }
        
        if (!$password || !is_string($password) || strlen($password) < 8) {
            throw new Exception('Password must be at least 8 characters');
        }
        
        if (strlen($password) > 128) {
            throw new Exception('Password too long');
        }

        $isAdmin = InputSanitizer::boolean($data['is_admin'] ?? false);

        $newUser = UserRepository::create($email, $password, $isAdmin);

        if ($newUser) {
            // Remove sensitive data from response
            unset($newUser['password_hash']);
            unset($newUser['totp_secret']);
            unset($newUser['backup_codes']);
            
            // Dispatch webhook event for user created (async)
            try {
                $webhookService = new WebhookService();
                $webhookService->dispatchEventAsync('user.created', [
                    'user_id' => $newUser['uuid'],
                    'email' => $newUser['email'],
                    'is_admin' => (bool)$isAdmin,
                    'created_by' => $user->uuid ?? null,
                    'timestamp' => date('c'),
                ]);
            } catch (\Exception $e) {
                error_log("Webhook dispatch failed for user.created: " . $e->getMessage());
            }
            
            echo json_encode(['success' => true, 'message' => 'User created successfully', 'user' => $newUser]);
        } else {
            throw new Exception('Failed to create user');
        }

    } else {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    }

} catch (Exception $e) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
