<?php
/**
 * NOMAD CMS - Response Utilities
 * JSON response helpers and CORS handling
 */

/**
 * Set CORS headers for the response
 */
function setCorsHeaders(): void {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
    
    header("Access-Control-Allow-Origin: $origin");
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-ADMIN-TOKEN');
    header('Access-Control-Allow-Credentials: true');
    header('Content-Type: application/json; charset=utf-8');
}

/**
 * Handle preflight OPTIONS request
 */
function handlePreflight(): void {
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        setCorsHeaders();
        http_response_code(200);
        exit();
    }
}

/**
 * Send JSON success response
 * @param mixed $data Response data
 * @param int $code HTTP status code
 */
function sendResponse(mixed $data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit();
}

/**
 * Send JSON error response
 * @param string $message Error message
 * @param int $code HTTP status code
 */
function sendError(string $message, int $code = 400): void {
    http_response_code($code);
    echo json_encode([
        'success' => false,
        'error' => $message
    ], JSON_UNESCAPED_UNICODE);
    exit();
}

/**
 * Get JSON body from request
 * @return array|null Decoded JSON or null
 */
function getJsonBody(): ?array {
    $input = file_get_contents('php://input');
    if (empty($input)) {
        return null;
    }
    return json_decode($input, true);
}
