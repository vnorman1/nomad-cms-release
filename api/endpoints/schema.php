<?php
/**
 * Schema Endpoint
 * 
 * Serves the CMS configuration schema (nomad.schema.json).
 * Does not require authentication - schema structure is not sensitive data.
 * 
 * GET /api/endpoints/schema.php - Returns the full schema with caching headers
 */

// Allow CORS for all origins (schema is public)
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, If-None-Match, If-Modified-Since');

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Only accept GET requests
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Method not allowed. Use GET.']);
    exit;
}

// Schema file path
$schemaPath = __DIR__ . '/../data/nomad.schema.json';

// Check if schema file exists
if (!file_exists($schemaPath)) {
    http_response_code(404);
    header('Content-Type: application/json');
    echo json_encode([
        'error' => 'Schema file not found',
        'path' => 'data/nomad.schema.json'
    ]);
    exit;
}

// Get file modification time for caching
$lastModified = filemtime($schemaPath);
$etag = '"' . md5_file($schemaPath) . '"';

// Check If-None-Match header (ETag)
if (isset($_SERVER['HTTP_IF_NONE_MATCH']) && $_SERVER['HTTP_IF_NONE_MATCH'] === $etag) {
    http_response_code(304);
    exit;
}

// Check If-Modified-Since header
if (isset($_SERVER['HTTP_IF_MODIFIED_SINCE'])) {
    $ifModifiedSince = strtotime($_SERVER['HTTP_IF_MODIFIED_SINCE']);
    if ($ifModifiedSince !== false && $lastModified <= $ifModifiedSince) {
        http_response_code(304);
        exit;
    }
}

// Read and parse schema
$schemaContent = file_get_contents($schemaPath);
$schema = json_decode($schemaContent, true);

if (json_last_error() !== JSON_ERROR_NONE) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode([
        'error' => 'Invalid JSON in schema file',
        'details' => json_last_error_msg()
    ]);
    exit;
}

// Set caching headers
header('Content-Type: application/json; charset=utf-8');
header('ETag: ' . $etag);
header('Last-Modified: ' . gmdate('D, d M Y H:i:s', $lastModified) . ' GMT');
header('Cache-Control: public, max-age=60'); // Cache for 1 minute, then revalidate

// Return the schema
echo json_encode($schema, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
