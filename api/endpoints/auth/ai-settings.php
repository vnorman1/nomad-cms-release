<?php
/**
 * NOMAD CMS - AI Settings Endpoint
 * Manage per-user Gemini AI configuration
 * 
 * GET: Get AI settings (API key is NOT returned)
 * PUT/PATCH: Update AI settings (API key is encrypted at rest)
 */

declare(strict_types=1);

require_once __DIR__ . '/../../bootstrap.php';

use NomadCMS\Database\UserRepository;
use NomadCMS\Middleware\AuthMiddleware;
use NomadCMS\Middleware\CSRFMiddleware;
use NomadCMS\Middleware\RateLimitMiddleware;

// CORS
handlePreflight();

// Rate limit
RateLimitMiddleware::check();

// Require authentication
session_start();
$currentUser = AuthMiddleware::requireAuth();

$method = $_SERVER['REQUEST_METHOD'];

// Set JSON content type
header('Content-Type: application/json');

try {
    $user = UserRepository::findByUuid($currentUser->uuid);
    
    if (!$user) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'User not found']);
        exit;
    }
    
    switch ($method) {
        case 'GET':
            // Get AI settings (API key is NOT returned for security)
            $aiSettings = UserRepository::getAiSettings($user['id']);
            
            http_response_code(200);
            echo json_encode([
                'success' => true,
                'ai_settings' => $aiSettings,
            ]);
            break;
            
        case 'PATCH':
        case 'PUT':
            // SECURITY: Validate CSRF token for session-based requests
            CSRFMiddleware::validateForSession();
            
            $body = json_decode(file_get_contents('php://input'), true);
            
            $updates = [];
            
            // AI enabled toggle
            if (isset($body['ai_enabled'])) {
                $updates['ai_enabled'] = (bool) $body['ai_enabled'];
            }
            
            // AI API key (can be set or cleared)
            if (array_key_exists('ai_api_key', $body)) {
                $apiKey = $body['ai_api_key'];
                
                // Validate API key format if provided
                if (!empty($apiKey)) {
                    // Google AI API keys typically start with "AIza"
                    if (!is_string($apiKey) || strlen($apiKey) < 10) {
                        http_response_code(400);
                        echo json_encode(['success' => false, 'error' => 'Invalid API key format']);
                        exit;
                    }
                }
                
                $updates['ai_api_key'] = $apiKey ?: null;
            }
            
            // AI system prompt
            if (array_key_exists('ai_system_prompt', $body)) {
                $prompt = $body['ai_system_prompt'];
                
                // Validate prompt length
                if (!empty($prompt) && strlen($prompt) > 10000) {
                    http_response_code(400);
                    echo json_encode(['success' => false, 'error' => 'System prompt too long (max 10000 characters)']);
                    exit;
                }
                
                $updates['ai_system_prompt'] = $prompt ?: null;
            }
            
            // AI max tokens (output limit)
            if (isset($body['ai_max_tokens'])) {
                $maxTokens = (int) $body['ai_max_tokens'];
                
                // Validate range: 1024 to 32768
                if ($maxTokens < 1024 || $maxTokens > 32768) {
                    http_response_code(400);
                    echo json_encode(['success' => false, 'error' => 'Max tokens must be between 1024 and 32768']);
                    exit;
                }
                
                $updates['ai_max_tokens'] = $maxTokens;
            }
            
            // AI selected model (user's preferred model)
            if (array_key_exists('ai_selected_model', $body)) {
                $model = $body['ai_selected_model'];
                
                // Validate: must be a string or null
                if ($model !== null && (!is_string($model) || strlen($model) > 100)) {
                    http_response_code(400);
                    echo json_encode(['success' => false, 'error' => 'Invalid model identifier']);
                    exit;
                }
                
                $updates['ai_selected_model'] = $model ?: null;
            }
            
            if (empty($updates)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'No valid fields to update']);
                exit;
            }
            
            // Update AI settings
            if (UserRepository::updateAiSettings($user['id'], $updates)) {
                // Get updated settings
                $newSettings = UserRepository::getAiSettings($user['id']);
                
                http_response_code(200);
                echo json_encode([
                    'success' => true,
                    'message' => 'AI settings updated',
                    'ai_settings' => $newSettings,
                ]);
            } else {
                http_response_code(500);
                echo json_encode(['success' => false, 'error' => 'Failed to update settings']);
            }
            break;
            
        case 'DELETE':
            // SECURITY: Validate CSRF token for session-based requests
            CSRFMiddleware::validateForSession();
            
            // Clear all AI settings
            UserRepository::updateAiSettings($user['id'], [
                'ai_enabled' => false,
                'ai_api_key' => null,
                'ai_system_prompt' => null,
            ]);
            
            http_response_code(200);
            echo json_encode([
                'success' => true,
                'message' => 'AI settings cleared',
            ]);
            break;
            
        default:
            http_response_code(405);
            echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    }
    
} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $_ENV['APP_DEBUG'] === 'true' ? $e->getMessage() : 'Internal server error',
    ]);
}
