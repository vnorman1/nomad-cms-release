<?php
/**
 * NOMAD CMS - Security Alert Endpoint
 * 
 * Receives security alerts from the frontend (honeypot triggers, XSS detection, etc.)
 * This is intentionally unauthenticated to capture attacks before login.
 * 
 * SECURITY: Rate limited and validates input strictly
 * 
 * POST /api/endpoints/system/security-alert.php
 */

declare(strict_types=1);

require_once __DIR__ . '/../../bootstrap.php';

use NomadCMS\Security\InputSanitizer;
use NomadCMS\Middleware\RateLimitMiddleware;

// CORS
handlePreflight();

header('Content-Type: application/json');

// Only POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

// SECURITY: Strict rate limiting - max 10 alerts per IP per hour
// This prevents attackers from flooding the log
// Note: APCu may not be available in all environments
if (function_exists('apcu_fetch') && function_exists('apcu_store')) {
    try {
        $alertsKey = 'security_alerts_' . md5($_SERVER['REMOTE_ADDR'] ?? 'unknown');
        $alertCount = apcu_fetch($alertsKey);
        $alertCount = $alertCount !== false ? (int)$alertCount : 0;
        
        if ($alertCount >= 10) {
            http_response_code(429);
            echo json_encode(['success' => false, 'error' => 'Rate limited']);
            exit;
        }
        
        apcu_store($alertsKey, $alertCount + 1, 3600); // 1 hour TTL
    } catch (Throwable $e) {
        // APCu not available - continue without rate limiting
        error_log('[Security Alert] Rate limiting error: ' . $e->getMessage());
    }
}
// If APCu not available, continue without rate limiting

try {
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (!$input || !is_array($input)) {
        throw new Exception('Invalid request body');
    }
    
    // Validate alert type
    $allowedTypes = [
        'honeypot_access',     // XSS attempting to read fake tokens
        'xss_detected',        // XSS payload detected
        'token_theft_attempt', // Suspicious token access pattern
        'console_access',      // Someone trying to access tokens via console
        'tampering_detected',  // LocalStorage/Cookie tampering
        'suspicious_request',  // Suspicious API request pattern
    ];
    
    $type = InputSanitizer::whitelist($input['type'] ?? '', $allowedTypes);
    if (!$type) {
        throw new Exception('Invalid alert type');
    }
    
    // Sanitize and limit data size
    $data = [];
    if (isset($input['data']) && is_array($input['data'])) {
        // Whitelist allowed data fields
        $allowedFields = ['accessCount', 'timestamp', 'url', 'userAgent', 'referrer', 'fingerprint', 'details'];
        foreach ($allowedFields as $field) {
            if (isset($input['data'][$field])) {
                $value = $input['data'][$field];
                // Limit string length
                if (is_string($value)) {
                    $data[$field] = substr($value, 0, 500);
                } elseif (is_numeric($value)) {
                    $data[$field] = $value;
                }
            }
        }
    }
    
    // Build log entry
    $logEntry = [
        'timestamp' => date('Y-m-d H:i:s'),
        'type' => $type,
        'ip_hash' => hash('sha256', $_SERVER['REMOTE_ADDR'] ?? 'unknown'),
        'user_agent' => substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 200),
        'data' => $data,
    ];
    
    // Log to security-specific file
    $logDir = __DIR__ . '/../../data/logs';
    if (!is_dir($logDir)) {
        mkdir($logDir, 0755, true);
    }
    
    $logFile = $logDir . '/security_alerts.log';
    $logLine = json_encode($logEntry, JSON_UNESCAPED_UNICODE) . "\n";
    file_put_contents($logFile, $logLine, FILE_APPEND | LOCK_EX);
    
    // Also log to PHP error log for immediate visibility
    error_log("[SECURITY ALERT] Type: {$type}, IP: " . ($logEntry['ip_hash']) . ", Data: " . json_encode($data));
    
    // Check for panic mode trigger condition
    // If we see too many honeypot accesses, it could indicate active attack
    if (($type === 'honeypot_access' || $type === 'xss_detected') && 
        function_exists('apcu_fetch') && function_exists('apcu_store')) {
        try {
            $attackKey = 'xss_attack_count_' . md5($_SERVER['REMOTE_ADDR'] ?? 'unknown');
            $attackCount = apcu_fetch($attackKey);
            $attackCount = $attackCount !== false ? (int)$attackCount + 1 : 1;
            apcu_store($attackKey, $attackCount, 300); // 5 min window
            
            // Trigger panic mode consideration at 5+ attacks
            if ($attackCount >= 5) {
                error_log("[SECURITY CRITICAL] Possible active XSS attack from IP hash: " . $logEntry['ip_hash']);
                // Could auto-trigger panic mode here if desired
            }
        } catch (Throwable $e) {
            // APCu error - just log and continue
            error_log('[Security Alert] APCu error in attack tracking: ' . $e->getMessage());
        }
    }
    
    echo json_encode([
        'success' => true,
        'message' => 'Alert recorded',
    ]);

} catch (Exception $e) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => 'Failed to process alert',
    ]);
}
