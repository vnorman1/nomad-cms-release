<?php
/**
 * Sitemap Endpoint Logic
 * Generates XML sitemap dynamically from schema configuration
 * 
 * SECURITY: Rate limited to prevent abuse
 */

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

use NomadCMS\Database\ContentDatabase;
use NomadCMS\Middleware\RateLimitMiddleware;

// Apply rate limiting: 30 requests per minute per IP
// Generous enough for search engine crawlers, but prevents DDoS
RateLimitMiddleware::check(
    key: 'sitemap:' . ($_SERVER['REMOTE_ADDR'] ?? 'unknown'),
    maxRequests: 30,
    windowSeconds: 60
);

// Set XML content type
header('Content-Type: application/xml; charset=utf-8');

// Configuration
$siteUrl = $_ENV['SITE_URL'] ?? 'https://yourdomain.com';

/**
 * Load sitemap configuration dynamically from nomad.schema.json
 * Only includes slots with isSitemap: true
 */
function loadSitemapConfigFromSchema(): array {
    $schemaPath = __DIR__ . '/../data/nomad.schema.json';
    
    if (!file_exists($schemaPath)) {
        return [];
    }
    
    $schemaContent = file_get_contents($schemaPath);
    if ($schemaContent === false) {
        return [];
    }
    
    $schema = json_decode($schemaContent, true);
    if (!$schema || !isset($schema['slots'])) {
        return [];
    }
    
    $sitemapConfig = [];
    
    foreach ($schema['slots'] as $key => $slot) {
        // Only include slots with isSitemap: true
        if (empty($slot['isSitemap'])) {
            continue;
        }
        
        // Only collection and massive types have multiple items
        $type = $slot['type'] ?? 'object';
        if (!in_array($type, ['collection', 'massive', 'list'])) {
            continue;
        }
        
        // Get slug field (default to 'slug')
        $slugField = $slot['slugField'] ?? 'slug';
        
        // Get published field for filtering (optional)
        $publishedField = $slot['publishedField'] ?? null;
        
        // Get custom URL pattern or use default (/{key}/{slug})
        $urlPattern = $slot['urlPattern'] ?? "/{$key}/{slug}";
        
        $sitemapConfig[$key] = [
            'slugField' => $slugField,
            'publishedField' => $publishedField,
            'urlPattern' => $urlPattern,
            'priority' => '0.7',
            'changefreq' => 'weekly',
            'type' => $type,
        ];
    }
    
    return $sitemapConfig;
}

/**
 * Load static pages from schema's staticPages array
 * Falls back to default homepage if no staticPages are defined
 */
function loadStaticPagesFromSchema(): array {
    $schemaPath = __DIR__ . '/../data/nomad.schema.json';
    
    if (!file_exists($schemaPath)) {
        // Fallback to default homepage only
        return [
            ['path' => '/', 'priority' => '1.0', 'changefreq' => 'daily'],
        ];
    }
    
    $schemaContent = file_get_contents($schemaPath);
    if ($schemaContent === false) {
        return [
            ['path' => '/', 'priority' => '1.0', 'changefreq' => 'daily'],
        ];
    }
    
    $schema = json_decode($schemaContent, true);
    
    // Return staticPages from schema or default
    if (!empty($schema['staticPages']) && is_array($schema['staticPages'])) {
        return $schema['staticPages'];
    }
    
    // Fallback to homepage only
    return [
        ['path' => '/', 'priority' => '1.0', 'changefreq' => 'daily'],
    ];
}

// Load dynamic config from schema
$sitemapConfig = loadSitemapConfigFromSchema();

/**
 * Generate XML sitemap
 */
function generateSitemap(): string {
    global $siteUrl, $sitemapConfig;
    
    $urls = [];
    
    // Load static pages from schema (or fallback to defaults)
    $staticPages = loadStaticPagesFromSchema();
    
    foreach ($staticPages as $page) {
        $urls[] = [
            'loc' => $siteUrl . $page['path'],
            'priority' => $page['priority'] ?? '0.5',
            'changefreq' => $page['changefreq'] ?? 'monthly',
            'lastmod' => date('Y-m-d')
        ];
    }
    
    // Add dynamic collection items from schema-configured slots
    try {
        foreach ($sitemapConfig as $key => $config) {
            // Using ContentDatabase to get the slot data
            $slot = ContentDatabase::getSlot($key);
            
            // ContentDatabase::getSlot returns the decoded data array directly
            if (is_array($slot)) {
                foreach ($slot as $item) {
                    // Check if item is published using same logic as StaticCacheService
                    // Priority: 1. explicit publishedField, 2. status field, 3. implicit boolean fields
                    $publishedField = $config['publishedField'] ?? null;
                    $isPublished = true;
                    
                    if ($publishedField !== null) {
                        // 1. Explicit publishedField from schema
                        $isPublished = !empty($item[$publishedField]);
                    } elseif (isset($item['status'])) {
                        // 2. Status field convention
                        $allowedStatuses = ['stabil', 'mukodo', 'published', 'active'];
                        $isPublished = in_array($item['status'], $allowedStatuses);
                    } else {
                        // 3. Implicit boolean fields
                        $implicitFields = ['published', 'isPublished', 'active', 'isActive'];
                        foreach ($implicitFields as $field) {
                            if (isset($item[$field])) {
                                $isPublished = (bool)$item[$field];
                                break;
                            }
                        }
                    }
                    
                    if (!$isPublished) {
                        continue; // Skip unpublished items
                    }
                    
                    // Get slug from configured field
                    $slug = $item[$config['slugField']] ?? null;
                    
                    if ($slug) {
                        $url = str_replace('{slug}', $slug, $config['urlPattern']);
                        $urls[] = [
                            'loc' => $siteUrl . $url,
                            'priority' => $config['priority'],
                            'changefreq' => $config['changefreq'],
                            'lastmod' => $item['updatedAt'] ?? $item['updated_at'] ?? date('Y-m-d')
                        ];
                    }
                }
            }
        }
    } catch (Exception $e) {
        // Silently fail database operations for sitemap
        // In debug mode, checking logs might be useful
    }
    
    // Build XML
    $xml = '<?xml version="1.0" encoding="UTF-8"?>' . PHP_EOL;
    $xml .= '<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>' . PHP_EOL;
    $xml .= '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . PHP_EOL;
    
    foreach ($urls as $url) {
        $xml .= '  <url>' . PHP_EOL;
        $xml .= '    <loc>' . htmlspecialchars($url['loc']) . '</loc>' . PHP_EOL;
        $xml .= '    <lastmod>' . $url['lastmod'] . '</lastmod>' . PHP_EOL;
        $xml .= '    <changefreq>' . $url['changefreq'] . '</changefreq>' . PHP_EOL;
        $xml .= '    <priority>' . $url['priority'] . '</priority>' . PHP_EOL;
        $xml .= '  </url>' . PHP_EOL;
    }
    
    $xml .= '</urlset>';
    
    return $xml;
}

/**
 * Generate robots.txt
 */
function generateRobotsTxt(): string {
    global $siteUrl;
    
    $robots = "# NOMAD CMS - Robots.txt\n";
    $robots .= "# Generated automatically\n\n";
    
    $robots .= "User-agent: *\n";
    $robots .= "Allow: /\n\n";
    
    // Disallow admin areas
    $robots .= "# Admin areas\n";
    $robots .= "Disallow: /nomad/\n";
    $robots .= "Disallow: /api/\n\n";
    
    // Disallow common sensitive paths
    $robots .= "# Sensitive paths\n";
    $robots .= "Disallow: /*.json$\n";
    $robots .= "Disallow: /*.php$\n\n";
    
    // Sitemap location
    $robots .= "# Sitemap\n";
    $robots .= "Sitemap: " . rtrim($siteUrl, '/') . "/sitemap.xml\n";
    
    return $robots;
}

// Check if robots.txt is requested
if (isset($_GET['robots']) && $_GET['robots'] === '1') {
    header('Content-Type: text/plain; charset=utf-8');
    echo generateRobotsTxt();
    exit;
}

// Output sitemap
echo generateSitemap();

