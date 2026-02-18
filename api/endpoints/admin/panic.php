<?php
/**
 * Admin API - Panic Mode Management 🚨
 * 
 * "DON'T PANIC" - Friendly reminder from your admin panel
 * 
 * GET: Check panic mode status
 * POST: Enable/Disable panic mode (toggle)
 * 
 * Only accessible by admin users.
 * When enabled, the entire system goes read-only.
 */

require_once __DIR__ . '/../../bootstrap.php';

use NomadCMS\Middleware\AuthMiddleware;
use NomadCMS\Middleware\CSRFMiddleware;
use NomadCMS\Security\PanicModeService;
use NomadCMS\Security\WebhookService;

header('Content-Type: application/json');

try {
    // 1. Authenticate - this is ADMIN ONLY territory
    $user = AuthMiddleware::requireAuth();
    
    // Double-check admin status (better safe than sorry!)
    if (empty($user->is_admin)) {
        http_response_code(403);
        echo json_encode([
            'success' => false,
            'error' => 'Nice try! But only admins can access the panic button. 🔐',
            'code' => 'ADMIN_REQUIRED',
        ]);
        exit;
    }

    $method = $_SERVER['REQUEST_METHOD'];

    // 2. Handle Requests
    if ($method === 'GET') {
        // GET STATUS - Check if we're panicking
        $status = PanicModeService::getStatus();
        
        echo json_encode([
            'success' => true,
            'panic_mode' => $status,
            'tip' => $status['enabled'] 
                ? 'Pro tip: Take a deep breath. It\'s probably fine. Probably.' 
                : 'Everything is calm... for now. 👀',
        ]);

    } elseif ($method === 'POST') {
        // TOGGLE PANIC MODE - The big red button!
        
        // SECURITY: Validate CSRF token
        CSRFMiddleware::validateForSession();
        
        // Parse request body
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        
        // Determine action
        $action = $data['action'] ?? 'toggle';
        $reason = trim($data['reason'] ?? '');
        
        // Validate reason length if provided
        if (strlen($reason) > 500) {
            $reason = substr($reason, 0, 500) . '... (truncated, you talk too much!)';
        }
        
        $currentStatus = PanicModeService::isActive();
        
        // Handle based on action
        if ($action === 'enable' || ($action === 'toggle' && !$currentStatus)) {
            // 🔴 ENABLE PANIC MODE
            $result = PanicModeService::enable((int)$user->id, $reason ?: null);
            
            if ($result['success']) {
                // Dispatch webhook event for panic mode enabled (async - non-blocking)
                try {
                    $webhookService = new WebhookService();
                    $webhookService->dispatchEventAsync('system.panic_enabled', [
                        'id' => 'panic_mode',
                        'reason' => $reason ?: 'No reason provided',
                        'author_id' => $user->uuid ?? null,
                        'sessions_revoked' => $result['sessions_revoked'],
                        'timestamp' => date('c'),
                    ]);
                } catch (\Exception $e) {
                    error_log("Webhook queue failed for system.panic_enabled: " . $e->getMessage());
                }
                
                echo json_encode([
                    'success' => true,
                    'action' => 'enabled',
                    'message' => $result['message'],
                    'sessions_revoked' => $result['sessions_revoked'],
                    'funny_message' => $result['funny_message'],
                    'status' => PanicModeService::getStatus(),
                    'warning' => '⚠️ All users have been logged out. Only GET requests are now allowed!',
                ]);
            } else {
                echo json_encode($result);
            }
            
        } elseif ($action === 'disable' || ($action === 'toggle' && $currentStatus)) {
            // 🟢 DISABLE PANIC MODE
            $result = PanicModeService::disable((int)$user->id);
            
            if ($result['success']) {
                // Dispatch webhook event for panic mode disabled (async - non-blocking)
                try {
                    $webhookService = new WebhookService();
                    $webhookService->dispatchEventAsync('system.panic_disabled', [
                        'id' => 'panic_mode',
                        'author_id' => $user->uuid ?? null,
                        'timestamp' => date('c'),
                    ]);
                } catch (\Exception $e) {
                    error_log("Webhook queue failed for system.panic_disabled: " . $e->getMessage());
                }
                
                echo json_encode([
                    'success' => true,
                    'action' => 'disabled',
                    'message' => $result['message'],
                    'funny_message' => $result['funny_message'],
                    'status' => PanicModeService::getStatus(),
                    'info' => 'ℹ️ Full functionality restored. Users can log in again.',
                ]);
            } else {
                echo json_encode($result);
            }
            
        } else {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'error' => 'Invalid action. Use: toggle, enable, or disable',
            ]);
        }

    } else {
        http_response_code(405);
        echo json_encode([
            'success' => false,
            'error' => 'Method not allowed. GET to check status, POST to toggle.',
        ]);
    }

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Panic mode endpoint error: ' . $e->getMessage(),
        'ironic_note' => 'The panic button is panicking. How meta! 🤯',
    ]);
}
