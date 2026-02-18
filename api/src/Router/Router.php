<?php
/**
 * NOMAD CMS - Path-based Router
 * 
 * Enables clean RESTful URLs while maintaining backward compatibility
 * with query parameter-based endpoints.
 * 
 * URL Mapping:
 *   /api/data/{slot}          → endpoints/data.php?key={slot}
 *   /api/static/{slot}        → endpoints/static-serve.php?slot={slot}
 *   /api/massive/{slot}       → endpoints/massive.php?slot={slot}
 *   /api/schema               → endpoints/schema.php
 *   /api/search               → endpoints/search.php
 *   /api/media                → endpoints/media.php
 *   /api/upload               → endpoints/upload.php
 *   /api/auth/{action}        → endpoints/auth/{action}.php
 *   /api/admin/{action}       → endpoints/admin/{action}.php
 *   /api/versions/{slot}      → endpoints/versions.php?slot={slot}
 *   /api/sitemap              → endpoints/sitemap.php
 *   /api/batch                → endpoints/batch-content.php
 *   /api/ai/{action}          → endpoints/ai/{action}.php
 *   /api/forge/{action}       → endpoints/forge/{action}.php
 * 
 * Legacy URLs (still work):
 *   /api/endpoints/data.php?key=hero  → Direct PHP execution
 * 
 * @package NomadCMS
 * @since 2.0.0
 */

declare(strict_types=1);

namespace NomadCMS\Router;

class Router
{
    /**
     * Base path for API (e.g., '/api')
     */
    private string $basePath;

    /**
     * Endpoints directory path
     */
    private string $endpointsDir;

    /**
     * Route definitions: pattern => [file, paramMappings]
     * Pattern uses {param} syntax for path parameters
     */
    private array $routes = [];

    /**
     * Initialize router
     */
    public function __construct(string $basePath = '/api', ?string $endpointsDir = null)
    {
        $this->basePath = rtrim($basePath, '/');
        $this->endpointsDir = $endpointsDir ?? dirname(__DIR__, 2) . '/endpoints';
        $this->registerRoutes();
    }

    /**
     * Register all API routes
     */
    private function registerRoutes(): void
    {
        // ═══════════════════════════════════════════════════════════════════
        // CONTENT DATA ROUTES
        // ═══════════════════════════════════════════════════════════════════
        
        // GET/POST/DELETE /api/data/{slot}
        $this->addRoute('data/{slot}', 'data.php', ['slot' => 'key']);
        
        // GET /api/static/{slot} - Cached static content (full slot)
        $this->addRoute('static/{slot}', 'static-serve.php', ['slot' => 'slot']);
        
        // GET /api/static/{slot}/{item} - Cached static content (single item)
        $this->addRoute('static/{slot}/{item}', 'static-serve.php', ['slot' => 'slot', 'item' => 'item']);
        
        // GET/POST/PUT/DELETE /api/massive/{slot} - Large dataset operations
        $this->addRoute('massive/{slot}', 'massive.php', ['slot' => 'slot']);
        $this->addRoute('massive/{slot}/{id}', 'massive.php', ['slot' => 'slot', 'id' => 'id']);
        
        // ═══════════════════════════════════════════════════════════════════
        // SCHEMA & SYSTEM ROUTES
        // ═══════════════════════════════════════════════════════════════════
        
        // GET /api/schema - Full CMS schema
        $this->addRoute('schema', 'schema.php');
        
        // GET /api/search - Content search
        $this->addRoute('search', 'search.php');
        
        // GET /api/sitemap - XML sitemap
        $this->addRoute('sitemap', 'sitemap.php');
        
        // GET /api/versions/{slot} - Version history
        $this->addRoute('versions/{slot}', 'versions.php', ['slot' => 'slot']);
        $this->addRoute('versions', 'versions.php');
        
        // ═══════════════════════════════════════════════════════════════════
        // MEDIA ROUTES
        // ═══════════════════════════════════════════════════════════════════
        
        // POST /api/upload - File upload
        $this->addRoute('upload', 'upload.php');
        
        // GET/DELETE /api/media - Media library
        $this->addRoute('media', 'media.php');
        $this->addRoute('media/{id}', 'media.php', ['id' => 'id']);
        
        // POST /api/audio-upload
        $this->addRoute('audio-upload', 'audio-upload.php');
        
        // POST /api/video-upload
        $this->addRoute('video-upload', 'video-upload.php');
        
        // GET /api/file/{id} - File download
        $this->addRoute('file/{id}', 'file-serve.php', ['id' => 'id']);
        $this->addRoute('file-download/{id}', 'file-download.php', ['id' => 'id']);
        
        // GET /api/signed-url
        $this->addRoute('signed-url', 'get-signed-url.php');
        
        // ═══════════════════════════════════════════════════════════════════
        // AUTH ROUTES
        // ═══════════════════════════════════════════════════════════════════
        
        // POST /api/auth/login
        $this->addRoute('auth/login', 'auth/login.php');
        
        // POST /api/auth/logout
        $this->addRoute('auth/logout', 'auth/logout.php');
        
        // POST /api/auth/refresh
        $this->addRoute('auth/refresh', 'auth/refresh.php');
        
        // GET /api/auth/me
        $this->addRoute('auth/me', 'auth/me.php');
        
        // POST /api/auth/change-password
        $this->addRoute('auth/change-password', 'auth/change-password.php');
        
        // POST /api/auth/register
        $this->addRoute('auth/register', 'auth/register.php');
        
        // ═══════════════════════════════════════════════════════════════════
        // ADMIN ROUTES
        // ═══════════════════════════════════════════════════════════════════
        
        // GET /api/admin/users
        $this->addRoute('admin/users', 'admin/users.php');
        
        // POST /api/admin/create-user
        $this->addRoute('admin/create-user', 'admin/create-user.php');
        
        // GET /api/admin/dashboard
        $this->addRoute('admin/dashboard', 'admin/dashboard.php');
        
        // GET /api/admin/health
        $this->addRoute('admin/health', 'admin/health.php');
        
        // POST /api/admin/static-cache
        $this->addRoute('admin/static-cache', 'admin/static-cache.php');
        
        // GET/POST /api/admin/api-keys
        $this->addRoute('admin/api-keys', 'admin/api-keys.php');
        
        // ═══════════════════════════════════════════════════════════════════
        // AI ROUTES
        // ═══════════════════════════════════════════════════════════════════
        
        $this->addRoute('ai/models', 'ai/models.php');
        $this->addRoute('ai/generate', 'ai/generate.php');
        $this->addRoute('ai/chat', 'ai/chat.php');
        $this->addRoute('ai/session', 'ai/session.php');
        $this->addRoute('ai/sessions', 'ai/sessions.php');
        $this->addRoute('ai/expand', 'ai/expand.php');
        
        // ═══════════════════════════════════════════════════════════════════
        // FORGE (SCHEMA BUILDER) ROUTES
        // ═══════════════════════════════════════════════════════════════════
        
        $this->addRoute('forge/migrate', 'forge/migrate.php');
        $this->addRoute('forge/validate', 'forge/validate.php');
        $this->addRoute('forge/backup', 'forge/backup.php');
        $this->addRoute('forge/preview', 'forge/preview.php');
        
        // ═══════════════════════════════════════════════════════════════════
        // UPDATES ROUTES (nomad-updates CDN integration)
        // ═══════════════════════════════════════════════════════════════════
        
        $this->addRoute('updates/changelog', 'updates/changelog.php');
        $this->addRoute('updates/announcements', 'updates/announcements.php');
        $this->addRoute('updates/meta', 'updates/meta.php');
        
        // ═══════════════════════════════════════════════════════════════════
        // SYSTEM ROUTES
        // ═══════════════════════════════════════════════════════════════════
        
        $this->addRoute('system/info', 'system/info.php');
        $this->addRoute('system/logs', 'system/logs.php');
        $this->addRoute('system/version', 'system/version.php');
        $this->addRoute('system/releases', 'system/releases.php');
        $this->addRoute('system/check-update', 'system/check-update.php');
        $this->addRoute('system/apply-update', 'system/apply-update.php');
        $this->addRoute('system/rollback', 'system/rollback.php');
        $this->addRoute('system/update-progress', 'system/update-progress.php');
        $this->addRoute('system/security-alert', 'system/security-alert.php');
        $this->addRoute('system/queue-process', 'system/queue-process.php');
        
        // Batch operations
        $this->addRoute('batch', 'batch-content.php');
        
        // Webhooks
        $this->addRoute('webhook', 'webhook-receiver.php');
        $this->addRoute('webhook-actions', 'webhook-actions.php');
        
        // Install
        $this->addRoute('install', 'install/index.php');
        $this->addRoute('install/check', 'install/check.php');
        $this->addRoute('install/run', 'install/run.php');
    }

    /**
     * Add a route definition
     * 
     * @param string $pattern Route pattern with {param} placeholders
     * @param string $file PHP file to execute (relative to endpoints dir)
     * @param array $paramMap Map path params to query params: ['pathParam' => 'queryParam']
     */
    public function addRoute(string $pattern, string $file, array $paramMap = []): void
    {
        $this->routes[$pattern] = [
            'file' => $file,
            'params' => $paramMap,
        ];
    }

    /**
     * Dispatch the current request
     * Returns true if route was matched, false otherwise
     */
    public function dispatch(): bool
    {
        $uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
        $uri = rawurldecode($uri);
        
        // Remove base path prefix
        if (str_starts_with($uri, $this->basePath)) {
            $path = substr($uri, strlen($this->basePath));
            $path = ltrim($path, '/');
        } else {
            // Not an API request, don't handle
            return false;
        }
        
        // Legacy support: if path contains 'endpoints/', let it pass through
        if (str_starts_with($path, 'endpoints/')) {
            return false;
        }
        
        // Try to match a route
        foreach ($this->routes as $pattern => $config) {
            $params = $this->matchRoute($pattern, $path);
            
            if ($params !== null) {
                // Map path parameters to query parameters
                foreach ($config['params'] as $pathParam => $queryParam) {
                    if (isset($params[$pathParam])) {
                        $_GET[$queryParam] = $params[$pathParam];
                    }
                }
                
                // Execute the endpoint file
                $file = $this->endpointsDir . '/' . $config['file'];
                
                if (file_exists($file)) {
                    require $file;
                    return true;
                } else {
                    $this->sendError(404, "Endpoint file not found: {$config['file']}");
                    return true;
                }
            }
        }
        
        // No route matched
        return false;
    }

    /**
     * Match a route pattern against a path
     * Returns extracted parameters or null if no match
     */
    private function matchRoute(string $pattern, string $path): ?array
    {
        // Convert pattern to regex
        $regex = preg_replace_callback(
            '/\{([^}]+)\}/',
            fn($m) => '(?P<' . $m[1] . '>[^/]+)',
            $pattern
        );
        $regex = '#^' . $regex . '$#';
        
        if (preg_match($regex, $path, $matches)) {
            // Extract named parameters only
            $params = [];
            foreach ($matches as $key => $value) {
                if (is_string($key)) {
                    $params[$key] = $value;
                }
            }
            return $params;
        }
        
        return null;
    }

    /**
     * Send JSON error response
     */
    private function sendError(int $status, string $message): void
    {
        http_response_code($status);
        header('Content-Type: application/json');
        echo json_encode([
            'success' => false,
            'error' => $message,
            'status' => $status,
        ]);
    }

    /**
     * Get all registered routes (for documentation/debugging)
     */
    public function getRoutes(): array
    {
        $routes = [];
        foreach ($this->routes as $pattern => $config) {
            $routes[] = [
                'pattern' => $this->basePath . '/' . $pattern,
                'file' => $config['file'],
                'params' => $config['params'],
            ];
        }
        return $routes;
    }
}
