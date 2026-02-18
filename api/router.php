<?php
/**
 * NOMAD CMS - PHP Development Server Router
 * 
 * This file is used as the router for PHP's built-in development server.
 * It handles the path-based routing while the dev server runs from /api directory.
 * 
 * Usage: php -S 127.0.0.1:8000 router.php
 * 
 * In dev mode, requests come without /api prefix because:
 * - Vite proxy: /api/data/hero → (rewrite) → /data/hero
 * - PHP server root is /api, so it receives /data/hero
 * 
 * This router adds back the context and dispatches to index.php
 */

// Get the request URI
$uri = $_SERVER['REQUEST_URI'] ?? '/';
$path = parse_url($uri, PHP_URL_PATH);

// Check if it's a real file (static assets, direct PHP access)
$realPath = __DIR__ . $path;
if (is_file($realPath)) {
    // Let PHP's built-in server handle static files
    return false;
}

// Check for legacy endpoint URLs (e.g., /endpoints/data.php)
if (str_starts_with($path, '/endpoints/') && str_ends_with($path, '.php')) {
    $file = __DIR__ . $path;
    if (is_file($file)) {
        require $file;
        return true;
    }
}

// For path-based routes, simulate the /api prefix for the Router
// The router expects paths like /api/data/hero
// But dev server receives /data/hero
// We prepend /api so the Router can match

$_SERVER['ORIGINAL_REQUEST_URI'] = $_SERVER['REQUEST_URI'];
$_SERVER['REQUEST_URI'] = '/api' . $uri;

// Load the front controller
require __DIR__ . '/index.php';
