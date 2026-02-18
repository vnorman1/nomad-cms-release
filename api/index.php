<?php
/**
 * NOMAD CMS - API Front Controller
 * 
 * Entry point for all path-based API requests.
 * Provides clean RESTful URLs while maintaining full backward compatibility.
 * 
 * Usage:
 *   New style:    GET /api/data/hero
 *   Legacy style: GET /api/endpoints/data.php?key=hero  (still works!)
 * 
 * @package NomadCMS
 * @since 2.0.0
 */

declare(strict_types=1);

// Register autoloader for Router
require_once __DIR__ . '/vendor/autoload.php';

use NomadCMS\Router\Router;

// Initialize and dispatch
$router = new Router('/api', __DIR__ . '/endpoints');

if (!$router->dispatch()) {
    // No route matched - check if it's a direct file request
    $uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
    
    // If requesting a .php file directly, let Apache handle it
    if (str_ends_with($uri, '.php')) {
        return false;
    }
    
    // Otherwise, return 404
    http_response_code(404);
    header('Content-Type: application/json');
    echo json_encode([
        'success' => false,
        'error' => 'Endpoint not found',
        'path' => $uri,
        'hint' => 'Use /api/data/{slot}, /api/static/{slot}, /api/massive/{slot}, etc.',
        'documentation' => '/api/endpoints/schema.php for available endpoints',
    ]);
}
