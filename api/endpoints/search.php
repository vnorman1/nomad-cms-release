<?php
/**
 * Search Endpoint - Deep content search
 * 
 * Performs efficient SQL-based search across content slots.
 * Supports fuzzy matching, field-specific search, and pagination.
 * 
 * SECURITY NOTE: Search is performed at SQL level to prevent
 * memory exhaustion attacks (DoS) from loading entire database.
 * 
 * GET /search.php?q=query&type=all&limit=20&offset=0
 * 
 * Auth: Required (read permission)
 */

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

use NomadCMS\Database\ContentDatabase;
use NomadCMS\Middleware\AuthMiddleware;
use NomadCMS\Security\InputSanitizer;

// Handle CORS preflight
handlePreflight();

// Set JSON content type
header('Content-Type: application/json');

// Require authentication
AuthMiddleware::requireAuth();
AuthMiddleware::requirePermission('read');

$method = $_SERVER['REQUEST_METHOD'];

if ($method !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

try {
    $query = trim($_GET['q'] ?? '');
    $type = $_GET['type'] ?? 'all'; // all, object, list, collection
    $limit = min((int)($_GET['limit'] ?? 20), 100); // Max 100 results
    $offset = max((int)($_GET['offset'] ?? 0), 0);
    $slotKey = $_GET['slot'] ?? null; // Optional: search only in specific slot
    
    if (strlen($query) < 2) {
        echo json_encode([
            'success' => true,
            'results' => [],
            'total' => 0,
            'message' => 'Query must be at least 2 characters'
        ]);
        exit;
    }
    
    // SECURITY: Limit query length to prevent ReDoS
    if (strlen($query) > 200) {
        echo json_encode([
            'success' => false,
            'error' => 'Query too long (max 200 characters)'
        ]);
        exit;
    }
    
    // Sanitize query but allow some special characters for search
    $query = preg_replace('/[^\p{L}\p{N}\s\-_@.]/u', '', $query);
    
    $db = ContentDatabase::getInstance();
    
    // SECURITY FIX: SQL-level search instead of loading entire database
    // Build SQL query with LIKE for case-insensitive search in JSON data field
    $searchPattern = '%' . str_replace(['%', '_'], ['\%', '\_'], $query) . '%';
    
    // Build WHERE clause
    $whereClauses = ["data LIKE ? ESCAPE '\\'"];
    $params = [$searchPattern];
    
    // Add slot filter if specified
    if ($slotKey !== null) {
        $slotKey = InputSanitizer::slotKey($slotKey);
        if ($slotKey !== null) {
            $whereClauses[] = "key = ?";
            $params[] = $slotKey;
        }
    }
    
    $whereSQL = implode(' AND ', $whereClauses);
    
    // First get total count (with limit to prevent counting entire DB)
    $countSQL = "SELECT COUNT(*) as total FROM slots WHERE {$whereSQL} LIMIT 1000";
    $countStmt = $db->prepare($countSQL);
    $countStmt->execute($params);
    $totalMatches = min((int)$countStmt->fetchColumn(), 1000);
    
    // Get matching slots with pagination at SQL level
    $sql = "SELECT key, data, updated_at 
            FROM slots 
            WHERE {$whereSQL}
            ORDER BY updated_at DESC 
            LIMIT ? OFFSET ?";
    
    $params[] = $limit;
    $params[] = $offset;
    
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $matchingSlots = $stmt->fetchAll();
    
    $results = [];
    $lowerQuery = mb_strtolower($query);
    
    // Process only the paginated results (not entire database)
    foreach ($matchingSlots as $slot) {
        $slotData = json_decode($slot['data'], true);
        if ($slotData === null) continue;
        
        // Search within the already-filtered slot data
        $matches = searchInData($slotData, $query, $slot['key']);
        
        foreach ($matches as $match) {
            $results[] = [
                'slot' => $slot['key'],
                'updated_at' => $slot['updated_at'],
                ...$match
            ];
            
            // Limit results per slot to prevent response bloat
            if (count($results) >= $limit) break;
        }
        
        if (count($results) >= $limit) break;
    }
    
    echo json_encode([
        'success' => true,
        'query' => $query,
        'results' => $results,
        'total' => $totalMatches,
        'limit' => $limit,
        'offset' => $offset,
        'hasMore' => $totalMatches > ($offset + count($results))
    ]);

} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => ($_ENV['APP_DEBUG'] ?? 'false') === 'true' ? $e->getMessage() : 'Search failed',
    ]);
}

/**
 * Recursively search in data structure
 * Returns array of matches with field path and context
 */
function searchInData(mixed $data, string $query, string $slotKey, string $path = '', ?int $index = null): array
{
    $matches = [];
    $lowerQuery = mb_strtolower($query);
    
    if (is_array($data)) {
        // Check if it's a collection/list (array of objects with numeric keys)
        $isCollection = isset($data[0]) && is_array($data[0]);
        
        if ($isCollection) {
            // Search in collection items
            foreach ($data as $idx => $item) {
                if (!is_array($item)) continue;
                
                $itemMatches = searchInCollectionItem($item, $query, $lowerQuery, $slotKey, $idx);
                $matches = array_merge($matches, $itemMatches);
            }
        } else {
            // Search in object fields
            foreach ($data as $fieldKey => $fieldValue) {
                if (is_string($fieldValue)) {
                    $matchInfo = findMatch($fieldValue, $query, $lowerQuery);
                    if ($matchInfo !== null) {
                        $matches[] = [
                            'type' => 'field',
                            'field' => $fieldKey,
                            'value' => $fieldValue,
                            'match' => $matchInfo['match'],
                            'context' => $matchInfo['context'],
                            'score' => $matchInfo['score'],
                            'index' => $index
                        ];
                    }
                } elseif (is_array($fieldValue)) {
                    // Recurse into nested arrays
                    $nestedMatches = searchInData(
                        $fieldValue, 
                        $query, 
                        $slotKey, 
                        $path ? "$path.$fieldKey" : $fieldKey,
                        $index
                    );
                    $matches = array_merge($matches, $nestedMatches);
                }
            }
        }
    }
    
    return $matches;
}

/**
 * Search in a single collection item
 */
function searchInCollectionItem(array $item, string $query, string $lowerQuery, string $slotKey, int $index): array
{
    $matches = [];
    $itemTitle = getItemTitle($item);
    $itemId = $item['id'] ?? $item['slug'] ?? $index;
    
    foreach ($item as $fieldKey => $fieldValue) {
        if (is_string($fieldValue)) {
            $matchInfo = findMatch($fieldValue, $query, $lowerQuery);
            if ($matchInfo !== null) {
                $matches[] = [
                    'type' => 'collection_item',
                    'field' => $fieldKey,
                    'value' => $fieldValue,
                    'match' => $matchInfo['match'],
                    'context' => $matchInfo['context'],
                    'score' => $matchInfo['score'],
                    'index' => $index,
                    'itemId' => $itemId,
                    'itemTitle' => $itemTitle
                ];
            }
        } elseif (is_array($fieldValue)) {
            // Handle nested arrays (like tags array)
            foreach ($fieldValue as $subValue) {
                if (is_string($subValue)) {
                    $matchInfo = findMatch($subValue, $query, $lowerQuery);
                    if ($matchInfo !== null) {
                        $matches[] = [
                            'type' => 'collection_item',
                            'field' => $fieldKey,
                            'value' => $subValue,
                            'match' => $matchInfo['match'],
                            'context' => $matchInfo['context'],
                            'score' => $matchInfo['score'],
                            'index' => $index,
                            'itemId' => $itemId,
                            'itemTitle' => $itemTitle
                        ];
                    }
                }
            }
        }
    }
    
    return $matches;
}

/**
 * Find match in a string with context and scoring
 */
function findMatch(string $haystack, string $query, string $lowerQuery): ?array
{
    $lowerHaystack = mb_strtolower($haystack);
    $pos = mb_strpos($lowerHaystack, $lowerQuery);
    
    if ($pos === false) {
        // Try fuzzy match for longer queries
        if (strlen($query) >= 4) {
            // Check if all words match
            $words = preg_split('/\s+/', $lowerQuery);
            $allMatch = true;
            foreach ($words as $word) {
                if (mb_strlen($word) > 2 && mb_strpos($lowerHaystack, $word) === false) {
                    $allMatch = false;
                    break;
                }
            }
            if ($allMatch && count($words) > 1) {
                return [
                    'match' => $query,
                    'context' => truncateText($haystack, 150),
                    'score' => 50 // Lower score for fuzzy match
                ];
            }
        }
        return null;
    }
    
    // Calculate relevance score
    $score = 100;
    
    // Boost exact matches
    if ($lowerHaystack === $lowerQuery) {
        $score = 200;
    }
    // Boost start-of-string matches
    elseif ($pos === 0) {
        $score = 150;
    }
    // Boost word-boundary matches
    elseif ($pos > 0 && preg_match('/[\s\-_]/', mb_substr($lowerHaystack, $pos - 1, 1))) {
        $score = 130;
    }
    
    // Extract context around the match
    $contextStart = max(0, $pos - 40);
    $contextLength = min(150, mb_strlen($haystack) - $contextStart);
    $context = mb_substr($haystack, $contextStart, $contextLength);
    
    // Add ellipsis if truncated
    if ($contextStart > 0) $context = '...' . $context;
    if ($contextStart + $contextLength < mb_strlen($haystack)) $context .= '...';
    
    return [
        'match' => mb_substr($haystack, $pos, mb_strlen($query)),
        'context' => $context,
        'score' => $score
    ];
}

/**
 * Get the title of a collection item
 */
function getItemTitle(array $item): string
{
    // Priority order for title fields
    $titleFields = ['title', 'name', 'label', 'quote', 'heading', 'subject'];
    
    foreach ($titleFields as $field) {
        if (isset($item[$field]) && is_string($item[$field])) {
            return truncateText($item[$field], 60);
        }
    }
    
    // Fallback: use first string value
    foreach ($item as $value) {
        if (is_string($value) && strlen($value) > 0) {
            return truncateText($value, 60);
        }
    }
    
    return 'Untitled';
}

/**
 * Truncate text to max length
 */
function truncateText(string $text, int $maxLength): string
{
    // Strip HTML tags for cleaner results
    $text = strip_tags($text);
    $text = html_entity_decode($text, ENT_QUOTES, 'UTF-8');
    $text = preg_replace('/\s+/', ' ', trim($text));
    
    if (mb_strlen($text) <= $maxLength) {
        return $text;
    }
    
    return mb_substr($text, 0, $maxLength - 3) . '...';
}
