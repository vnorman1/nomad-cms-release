<?php
/**
 * NOMAD CMS - Massive Database
 * 
 * Speciálisan nagy adatmennyiségre optimalizált adatbázis kezelő.
 * KÜLÖN SQLite fájlt használ a database.sqlite-tól (massive.sqlite).
 * Minden 'massive' típusú slot saját táblát kap ebben az adatbázisban.
 * 
 * Funkciók:
 * - Dinamikus tábla létrehozás slot alapján
 * - Server-side pagination (LIMIT/OFFSET)
 * - Server-side sorting
 * - Full-text search (SQLite FTS5)
 * - Bulk műveletek
 * - CSV export/import
 * 
 * Split Architecture:
 * - system.sqlite: users, auth, sessions (AuthDatabase)
 * - database.sqlite: CMS content, slots, media, versions (ContentDatabase)
 * - massive.sqlite: large datasets, subscribers, logs (THIS FILE)
 */

declare(strict_types=1);

namespace NomadCMS\Database;

use PDO;
use PDOException;
use NomadCMS\Database\MassiveEncryption;

final class MassiveDatabase
{
    private static ?PDO $instance = null;
    
    /**
     * Get singleton database instance
     * Uses separate massive.sqlite file
     */
    public static function getInstance(): PDO
    {
        if (self::$instance === null) {
            $dbFile = $_ENV['DB_MASSIVE_DATABASE'] ?? 'massive.sqlite';
            $dbPath = __DIR__ . '/../../databases/' . $dbFile;
            
            try {
                self::$instance = new PDO("sqlite:$dbPath", null, null, [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => false,
                ]);
                
                // Try WAL mode for better concurrency, fallback to DELETE for shared hosting
                try {
                    $result = self::$instance->query('PRAGMA journal_mode=WAL')->fetchColumn();
                    if (strtoupper($result) === 'WAL') {
                        // WAL mode successful - use NORMAL sync (safe with WAL)
                        self::$instance->exec('PRAGMA synchronous=NORMAL');
                    } else {
                        // WAL failed (e.g., NFS/shared hosting) - use DELETE mode
                        self::$instance->exec('PRAGMA journal_mode=DELETE');
                        self::$instance->exec('PRAGMA synchronous=FULL');
                    }
                } catch (\Exception $e) {
                    // Fallback to DELETE mode on any error
                    self::$instance->exec('PRAGMA journal_mode=DELETE');
                    self::$instance->exec('PRAGMA synchronous=FULL');
                }
                // Increase cache size for better performance (10MB)
                self::$instance->exec('PRAGMA cache_size=-10000');
                // Enable foreign keys
                self::$instance->exec('PRAGMA foreign_keys=ON');
                // Optimize temp storage
                self::$instance->exec('PRAGMA temp_store=MEMORY');
                // Enable auto-vacuum
                self::$instance->exec('PRAGMA auto_vacuum=INCREMENTAL');
                
            } catch (PDOException $e) {
                throw new \RuntimeException("Massive database connection failed: " . $e->getMessage());
            }
        }
        
        return self::$instance;
    }
    
    /**
     * Generate table name from slot key
     * Prefixed with 'massive_' to avoid conflicts
     */
    private static function getTableName(string $slotKey): string
    {
        return 'massive_' . preg_replace('/[^a-zA-Z0-9_]/', '_', $slotKey);
    }

    /**
     * Build FTS5 query string that handles separators correctly
     * Converts "james.jo" -> "james* jo*" so it matches tokenized content
     */
    private static function buildFtsQuery(string $search): string
    {
        // Replace non-alphanumeric characters (separators) with spaces
        // We keep spaces to split tokens
        $clean = preg_replace('/[^a-zA-Z0-9_]/', ' ', $search);
        
        // Split into words
        $words = array_filter(explode(' ', $clean), fn($w) => strlen($w) > 0);
        
        if (empty($words)) {
            return $search . '*';
        }
        
        // Append * to each word for prefix matching
        // "james jo" -> "james* jo*"
        return implode('* ', $words) . '*';
    }
    
    /**
     * Initialize/ensure table exists for a massive slot
     * Creates table with standard columns + indexes
     */
    public static function ensureTable(string $slotKey): void
    {
        $db = self::getInstance();
        $tableName = self::getTableName($slotKey);
        
        // Check if table exists
        $stmt = $db->prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?");
        $stmt->execute([$tableName]);
        
        if (!$stmt->fetch()) {
            // Create main table
            $db->exec("
                CREATE TABLE {$tableName} (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    data TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            ");
            
            // Create FTS5 virtual table for full-text search (standalone, not external content)
            $db->exec("
                CREATE VIRTUAL TABLE IF NOT EXISTS {$tableName}_fts 
                USING fts5(content)
            ");
            
            // Create indexes
            $db->exec("CREATE INDEX IF NOT EXISTS idx_{$tableName}_created ON {$tableName}(created_at)");
            $db->exec("CREATE INDEX IF NOT EXISTS idx_{$tableName}_updated ON {$tableName}(updated_at)");
        }
    }
    
    /**
     * Get paginated records from a massive slot
     * 
     * @param string $slotKey Slot identifier
     * @param int $page Page number (1-based)
     * @param int $pageSize Items per page
     * @param string|null $sortField Field to sort by
     * @param string $sortDir Sort direction ('asc' or 'desc')
     * @param string|null $search Search query
     * @param array $filters Key-value filter pairs
     * @param bool $encrypted If true, decrypt data after retrieval
     * @param array $searchableFields Fields with blind index (for encrypted search)
     * @return array{items: array, total: int, page: int, pageSize: int, totalPages: int}
     */
    public static function getPaginated(
        string $slotKey,
        int $page = 1,
        int $pageSize = 50,
        ?string $sortField = null,
        string $sortDir = 'desc',
        ?string $search = null,
        array $filters = [],
        bool $encrypted = false,
        array $searchableFields = []
    ): array {
        self::ensureTable($slotKey);
        
        $db = self::getInstance();
        $tableName = self::getTableName($slotKey);
        
        $page = max(1, $page);
        $pageSize = max(1, min(200, $pageSize)); // Cap at 200
        $offset = ($page - 1) * $pageSize;
        $sortDir = strtolower($sortDir) === 'asc' ? 'ASC' : 'DESC';
        
        $whereConditions = [];
        $params = [];
        
        // Handle search
        if (!empty($search)) {
            if ($encrypted && !empty($searchableFields)) {
                // Use blind index search for encrypted data with searchable fields
                $blindSearchQuery = MassiveEncryption::buildBlindSearchQuery($search, $searchableFields);
                if ($blindSearchQuery) {
                    $whereConditions[] = "id IN (SELECT rowid FROM {$tableName}_fts WHERE {$tableName}_fts MATCH ?)";
                    $params[] = $blindSearchQuery;
                }
            } elseif (!$encrypted) {
                // Use regular FTS for unencrypted data
                $whereConditions[] = "id IN (SELECT rowid FROM {$tableName}_fts WHERE {$tableName}_fts MATCH ?)";
                $params[] = self::buildFtsQuery($search);
            }
            // If encrypted with no searchable fields, search is ignored
        }
        
        // JSON field filters (only for unencrypted data)
        if (!$encrypted) {
            foreach ($filters as $field => $value) {
                if ($value !== null && $value !== '') {
                    $whereConditions[] = "json_extract(data, ?) = ?";
                    $params[] = '$.' . $field;
                    $params[] = $value;
                }
            }
        }
        
        $whereClause = !empty($whereConditions) ? 'WHERE ' . implode(' AND ', $whereConditions) : '';
        
        // Get total count
        $countSql = "SELECT COUNT(*) as total FROM {$tableName} {$whereClause}";
        $countStmt = $db->prepare($countSql);
        $countStmt->execute($params);
        $total = (int) $countStmt->fetch()['total'];
        
        // Build ORDER BY clause (for encrypted, only system fields are sortable)
        $orderBy = 'id DESC'; // Default sort
        if ($sortField) {
            // For encrypted slots, only allow sorting by system fields
            if ($encrypted && !in_array($sortField, ['id', 'created_at', 'updated_at'])) {
                $sortField = 'id'; // Force to ID if trying to sort by JSON field
            }
            
            $safeField = preg_replace('/[^a-zA-Z0-9_]/', '', $sortField);
            if (in_array($sortField, ['id', 'created_at', 'updated_at'])) {
                $orderBy = "{$sortField} {$sortDir}";
            } else {
                $orderBy = "json_extract(data, '\$.{$safeField}') {$sortDir}";
            }
        }
        
        // Get paginated data
        $sql = "SELECT id, data, created_at, updated_at FROM {$tableName} {$whereClause} ORDER BY {$orderBy} LIMIT ? OFFSET ?";
        $stmt = $db->prepare($sql);
        $params[] = $pageSize;
        $params[] = $offset;
        $stmt->execute($params);
        
        $items = [];
        while ($row = $stmt->fetch()) {
            // Decrypt or decode data
            if ($encrypted && MassiveEncryption::isEncrypted($row['data'])) {
                $data = MassiveEncryption::decryptData($row['data']);
            } else {
                $data = json_decode($row['data'], true);
            }
            
            $items[] = [
                'id' => (int) $row['id'],
                'data' => $data,
                'created_at' => $row['created_at'],
                'updated_at' => $row['updated_at'],
            ];
        }
        
        return [
            'items' => $items,
            'total' => $total,
            'page' => $page,
            'pageSize' => $pageSize,
            'totalPages' => (int) ceil($total / $pageSize),
        ];
    }
    
    /**
     * Get a single record by ID
     * 
     * @param string $slotKey Slot identifier
     * @param int $id Record ID
     * @param bool $encrypted If true, decrypt data after retrieval
     * @return array|null Record or null if not found
     */
    public static function getById(string $slotKey, int $id, bool $encrypted = false): ?array
    {
        self::ensureTable($slotKey);
        
        $db = self::getInstance();
        $tableName = self::getTableName($slotKey);
        
        $stmt = $db->prepare("SELECT id, data, created_at, updated_at FROM {$tableName} WHERE id = ?");
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        
        if (!$row) {
            return null;
        }
        
        // Decrypt or decode data
        if ($encrypted && MassiveEncryption::isEncrypted($row['data'])) {
            $data = MassiveEncryption::decryptData($row['data']);
        } else {
            $data = json_decode($row['data'], true);
        }
        
        return [
            'id' => (int) $row['id'],
            'data' => $data,
            'created_at' => $row['created_at'],
            'updated_at' => $row['updated_at'],
        ];
    }
    
    /**
     * Insert a new record
     * 
     * @param string $slotKey Slot identifier
     * @param array $data Data to insert
     * @param bool $encrypted If true, encrypt data before storage
     * @param array $searchableFields Fields to create blind index for (when encrypted)
     * @return int The new record ID
     */
    public static function insert(
        string $slotKey,
        array $data,
        bool $encrypted = false,
        array $searchableFields = []
    ): int {
        self::ensureTable($slotKey);
        
        $db = self::getInstance();
        $tableName = self::getTableName($slotKey);
        
        // Encrypt or encode data
        if ($encrypted) {
            $storedData = MassiveEncryption::encryptData($data);
        } else {
            $storedData = json_encode($data, JSON_UNESCAPED_UNICODE);
        }
        
        $stmt = $db->prepare("INSERT INTO {$tableName} (data) VALUES (?)");
        $stmt->execute([$storedData]);
        
        $id = (int) $db->lastInsertId();
        
        // Update FTS index
        if ($encrypted && !empty($searchableFields)) {
            // Use blind index for encrypted data with searchable fields
            self::updateBlindIndex($slotKey, $id, $data, $searchableFields);
        } elseif (!$encrypted) {
            // Use plaintext FTS for unencrypted data
            self::updateFtsIndex($slotKey, $id, $data);
        }
        
        return $id;
    }
    
    /**
     * Update an existing record
     * 
     * @param string $slotKey Slot identifier
     * @param int $id Record ID
     * @param array $data Data to update
     * @param bool $encrypted If true, encrypt data before storage
     * @param array $searchableFields Fields to create blind index for (when encrypted)
     * @return bool Success status
     */
    public static function update(
        string $slotKey,
        int $id,
        array $data,
        bool $encrypted = false,
        array $searchableFields = []
    ): bool {
        self::ensureTable($slotKey);
        
        $db = self::getInstance();
        $tableName = self::getTableName($slotKey);
        
        // Encrypt or encode data
        if ($encrypted) {
            $storedData = MassiveEncryption::encryptData($data);
        } else {
            $storedData = json_encode($data, JSON_UNESCAPED_UNICODE);
        }
        
        $stmt = $db->prepare("UPDATE {$tableName} SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
        $result = $stmt->execute([$storedData, $id]);
        
        if ($result) {
            if ($encrypted && !empty($searchableFields)) {
                // Update blind index for encrypted data with searchable fields
                self::updateBlindIndex($slotKey, $id, $data, $searchableFields);
            } elseif ($encrypted) {
                // Remove from FTS if encrypted with no searchable fields
                $stmt = $db->prepare("DELETE FROM {$tableName}_fts WHERE rowid = ?");
                $stmt->execute([$id]);
            } else {
                // Update plaintext FTS index for unencrypted data
                self::updateFtsIndex($slotKey, $id, $data);
            }
        }
        
        return $result && $stmt->rowCount() > 0;
    }
    
    /**
     * Delete a single record
     */
    public static function delete(string $slotKey, int $id): bool
    {
        self::ensureTable($slotKey);
        
        $db = self::getInstance();
        $tableName = self::getTableName($slotKey);
        
        // Remove from FTS first
        $stmt = $db->prepare("DELETE FROM {$tableName}_fts WHERE rowid = ?");
        $stmt->execute([$id]);
        
        $stmt = $db->prepare("DELETE FROM {$tableName} WHERE id = ?");
        return $stmt->execute([$id]) && $stmt->rowCount() > 0;
    }
    
    /**
     * Bulk delete multiple records
     */
    public static function bulkDelete(string $slotKey, array $ids): int
    {
        if (empty($ids)) {
            return 0;
        }
        
        self::ensureTable($slotKey);
        
        $db = self::getInstance();
        $tableName = self::getTableName($slotKey);
        
        $ids = array_map('intval', $ids);
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        
        // Remove from FTS first
        $stmt = $db->prepare("DELETE FROM {$tableName}_fts WHERE rowid IN ({$placeholders})");
        $stmt->execute($ids);
        
        $stmt = $db->prepare("DELETE FROM {$tableName} WHERE id IN ({$placeholders})");
        $stmt->execute($ids);
        
        return $stmt->rowCount();
    }
    
    /**
     * Update FTS index for a record (plaintext)
     */
    private static function updateFtsIndex(string $slotKey, int $id, array $data): void
    {
        $db = self::getInstance();
        $tableName = self::getTableName($slotKey);
        
        // Flatten data for FTS
        $searchableContent = self::flattenForSearch($data);
        
        // Delete existing entry
        $stmt = $db->prepare("DELETE FROM {$tableName}_fts WHERE rowid = ?");
        $stmt->execute([$id]);
        
        // Insert new entry
        $stmt = $db->prepare("INSERT INTO {$tableName}_fts(rowid, content) VALUES (?, ?)");
        $stmt->execute([$id, $searchableContent]);
    }
    
    /**
     * Update blind index for encrypted record
     * Creates deterministic HMAC tokens for searchable fields
     * 
     * @param string $slotKey Slot identifier
     * @param int $id Record ID
     * @param array $data Plaintext data (before encryption)
     * @param array $searchableFields List of field names to index
     */
    private static function updateBlindIndex(string $slotKey, int $id, array $data, array $searchableFields): void
    {
        $db = self::getInstance();
        $tableName = self::getTableName($slotKey);
        
        // Generate blind index tokens for searchable fields
        $blindIndexContent = MassiveEncryption::generateBlindIndex($data, $searchableFields);
        
        // Delete existing entry
        $stmt = $db->prepare("DELETE FROM {$tableName}_fts WHERE rowid = ?");
        $stmt->execute([$id]);
        
        if (!empty($blindIndexContent)) {
            // Insert blind index tokens
            $stmt = $db->prepare("INSERT INTO {$tableName}_fts(rowid, content) VALUES (?, ?)");
            $stmt->execute([$id, $blindIndexContent]);
        }
    }
    
    /**
     * Flatten array data to searchable string
     */
    private static function flattenForSearch(array $data): string
    {
        $parts = [];
        
        foreach ($data as $key => $value) {
            if (is_string($value)) {
                $parts[] = $value;
            } elseif (is_numeric($value)) {
                $parts[] = (string) $value;
            } elseif (is_array($value)) {
                $parts[] = self::flattenForSearch($value);
            }
        }
        
        return implode(' ', $parts);
    }
    
    /**
     * Get statistics for a massive slot
     */
    public static function getStats(string $slotKey): array
    {
        self::ensureTable($slotKey);
        
        $db = self::getInstance();
        $tableName = self::getTableName($slotKey);
        
        $stmt = $db->query("
            SELECT 
                COUNT(*) as total,
                MIN(created_at) as oldest,
                MAX(created_at) as newest,
                MAX(updated_at) as last_updated
            FROM {$tableName}
        ");
        
        return $stmt->fetch();
    }
    
    /**
     * Export all records as array (for CSV export)
     * 
     * @param string $slotKey Slot identifier
     * @param string|null $sortField Field to sort by
     * @param string $sortDir Sort direction
     * @param bool $encrypted If true, decrypt data for export
     * @return array All records
     */
    public static function exportAll(string $slotKey, ?string $sortField = null, string $sortDir = 'desc', bool $encrypted = false): array
    {
        self::ensureTable($slotKey);
        
        $db = self::getInstance();
        $tableName = self::getTableName($slotKey);
        
        // For encrypted slots, only allow sorting by system fields
        $orderBy = 'id DESC';
        if ($sortField) {
            if ($encrypted && !in_array($sortField, ['id', 'created_at', 'updated_at'])) {
                $sortField = 'id';
            }
            
            $safeField = preg_replace('/[^a-zA-Z0-9_]/', '', $sortField);
            if (in_array($sortField, ['id', 'created_at', 'updated_at'])) {
                $orderBy = "{$sortField} " . (strtolower($sortDir) === 'asc' ? 'ASC' : 'DESC');
            } else {
                $orderBy = "json_extract(data, '\$.{$safeField}') " . (strtolower($sortDir) === 'asc' ? 'ASC' : 'DESC');
            }
        }
        
        $stmt = $db->query("SELECT id, data, created_at, updated_at FROM {$tableName} ORDER BY {$orderBy}");
        
        $items = [];
        while ($row = $stmt->fetch()) {
            // Decrypt or decode data
            if ($encrypted && MassiveEncryption::isEncrypted($row['data'])) {
                $data = MassiveEncryption::decryptData($row['data']);
            } else {
                $data = json_decode($row['data'], true);
            }
            
            $items[] = [
                'id' => (int) $row['id'],
                'data' => $data,
                'created_at' => $row['created_at'],
                'updated_at' => $row['updated_at'],
            ];
        }
        
        return $items;
    }
    
    /**
     * Bulk insert records (for CSV import)
     * 
     * @param string $slotKey Slot identifier
     * @param array $records Array of data records to insert
     * @param bool $encrypted If true, encrypt data before storage
     * @param array $searchableFields Fields to create blind index for (when encrypted)
     * @return int Number of records inserted
     */
    public static function bulkInsert(
        string $slotKey,
        array $records,
        bool $encrypted = false,
        array $searchableFields = []
    ): int {
        self::ensureTable($slotKey);
        
        $db = self::getInstance();
        $tableName = self::getTableName($slotKey);
        
        $db->beginTransaction();
        
        try {
            $stmt = $db->prepare("INSERT INTO {$tableName} (data) VALUES (?)");
            $count = 0;
            
            foreach ($records as $data) {
                // Encrypt or encode data
                if ($encrypted) {
                    $storedData = MassiveEncryption::encryptData($data);
                } else {
                    $storedData = json_encode($data, JSON_UNESCAPED_UNICODE);
                }
                
                $stmt->execute([$storedData]);
                $id = (int) $db->lastInsertId();
                
                // Update FTS/blind index
                if ($encrypted && !empty($searchableFields)) {
                    self::updateBlindIndex($slotKey, $id, $data, $searchableFields);
                } elseif (!$encrypted) {
                    self::updateFtsIndex($slotKey, $id, $data);
                }
                $count++;
            }
            
            $db->commit();
            return $count;
            
        } catch (\Exception $e) {
            $db->rollBack();
            throw $e;
        }
    }
    
    /**
     * Drop table for a massive slot (dangerous!)
     */
    public static function dropTable(string $slotKey): bool
    {
        $db = self::getInstance();
        $tableName = self::getTableName($slotKey);
        
        try {
            $db->exec("DROP TABLE IF EXISTS {$tableName}_fts");
            $db->exec("DROP TABLE IF EXISTS {$tableName}");
            return true;
        } catch (\Exception $e) {
            return false;
        }
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // ADVANCED QUERY SUPPORT
    // ═══════════════════════════════════════════════════════════════════════════
    
    /**
     * Advanced query with multiple operators
     * Supports: eq, ne, gt, gte, lt, lte, like, in, notin, isnull, isnotnull, between
     * 
     * @param string $slotKey Slot identifier
     * @param array $conditions Array of conditions with operator support
     *   Example: [
     *     ['field' => 'status', 'op' => 'eq', 'value' => 'active'],
     *     ['field' => 'age', 'op' => 'gte', 'value' => 18],
     *     ['field' => 'tags', 'op' => 'like', 'value' => '%vip%'],
     *     ['field' => 'category', 'op' => 'in', 'value' => ['A', 'B', 'C']],
     *     ['field' => 'score', 'op' => 'between', 'value' => [10, 100]],
     *   ]
     * @param int $page Page number
     * @param int $pageSize Items per page
     * @param array|null $sort Multi-field sort: [['field' => 'name', 'dir' => 'asc'], ...]
     * @param string|null $search Full-text search
     * @param string $logic 'AND' or 'OR' for combining conditions
     * @return array Paginated results with metadata
     */
    public static function advancedQuery(
        string $slotKey,
        array $conditions = [],
        int $page = 1,
        int $pageSize = 50,
        ?array $sort = null,
        ?string $search = null,
        string $logic = 'AND'
    ): array {
        self::ensureTable($slotKey);
        
        $db = self::getInstance();
        $tableName = self::getTableName($slotKey);
        
        $page = max(1, $page);
        $pageSize = max(1, min(200, $pageSize));
        $offset = ($page - 1) * $pageSize;
        $logic = strtoupper($logic) === 'OR' ? 'OR' : 'AND';
        
        $whereConditions = [];
        $params = [];
        
        // Full-text search
        if (!empty($search)) {
            $whereConditions[] = "id IN (SELECT rowid FROM {$tableName}_fts WHERE {$tableName}_fts MATCH ?)";
            $params[] = self::buildFtsQuery($search);
        }
        
        // Process conditions
        foreach ($conditions as $cond) {
            $field = $cond['field'] ?? null;
            $op = strtolower($cond['op'] ?? 'eq');
            $value = $cond['value'] ?? null;
            
            if (!$field) continue;
            
            $safeField = preg_replace('/[^a-zA-Z0-9_]/', '', $field);
            $jsonPath = in_array($field, ['id', 'created_at', 'updated_at']) 
                ? $field 
                : "json_extract(data, '\$.{$safeField}')";
            
            // For numeric comparisons, we need to CAST to handle SQLite prepared statement quirks
            $isNumericOp = in_array($op, ['gt', 'gte', 'lt', 'lte', 'between']);
            $isNumericValue = is_numeric($value) || (is_array($value) && isset($value[0]) && is_numeric($value[0]));
            $numericJsonPath = ($isNumericOp && $isNumericValue && !in_array($field, ['id', 'created_at', 'updated_at']))
                ? "CAST({$jsonPath} AS REAL)"
                : $jsonPath;
            
            switch ($op) {
                case 'eq':
                    $whereConditions[] = "{$jsonPath} = ?";
                    $params[] = $value;
                    break;
                case 'ne':
                    $whereConditions[] = "{$jsonPath} != ?";
                    $params[] = $value;
                    break;
                case 'gt':
                    $whereConditions[] = "{$numericJsonPath} > ?";
                    $params[] = $value;
                    break;
                case 'gte':
                    $whereConditions[] = "{$numericJsonPath} >= ?";
                    $params[] = $value;
                    break;
                case 'lt':
                    $whereConditions[] = "{$numericJsonPath} < ?";
                    $params[] = $value;
                    break;
                case 'lte':
                    $whereConditions[] = "{$numericJsonPath} <= ?";
                    $params[] = $value;
                    break;
                case 'like':
                    $whereConditions[] = "{$jsonPath} LIKE ?";
                    $params[] = $value;
                    break;
                case 'notlike':
                    $whereConditions[] = "{$jsonPath} NOT LIKE ?";
                    $params[] = $value;
                    break;
                case 'in':
                    if (is_array($value) && !empty($value)) {
                        $placeholders = implode(',', array_fill(0, count($value), '?'));
                        $whereConditions[] = "{$jsonPath} IN ({$placeholders})";
                        foreach ($value as $v) $params[] = $v;
                    }
                    break;
                case 'notin':
                    if (is_array($value) && !empty($value)) {
                        $placeholders = implode(',', array_fill(0, count($value), '?'));
                        $whereConditions[] = "{$jsonPath} NOT IN ({$placeholders})";
                        foreach ($value as $v) $params[] = $v;
                    }
                    break;
                case 'isnull':
                    $whereConditions[] = "({$jsonPath} IS NULL OR {$jsonPath} = '')";
                    break;
                case 'isnotnull':
                    $whereConditions[] = "({$jsonPath} IS NOT NULL AND {$jsonPath} != '')";
                    break;
                case 'between':
                    if (is_array($value) && count($value) === 2) {
                        $whereConditions[] = "{$numericJsonPath} BETWEEN ? AND ?";
                        $params[] = $value[0];
                        $params[] = $value[1];
                    }
                    break;
                case 'startswith':
                    $whereConditions[] = "{$jsonPath} LIKE ?";
                    $params[] = $value . '%';
                    break;
                case 'endswith':
                    $whereConditions[] = "{$jsonPath} LIKE ?";
                    $params[] = '%' . $value;
                    break;
                case 'contains':
                    $whereConditions[] = "{$jsonPath} LIKE ?";
                    $params[] = '%' . $value . '%';
                    break;
            }
        }
        
        $whereClause = !empty($whereConditions) 
            ? 'WHERE ' . implode(" {$logic} ", $whereConditions) 
            : '';
        
        // Count total
        $countSql = "SELECT COUNT(*) as total FROM {$tableName} {$whereClause}";
        $countStmt = $db->prepare($countSql);
        $countStmt->execute($params);
        $total = (int) $countStmt->fetch()['total'];
        
        // Build ORDER BY clause (multi-field support)
        $orderByParts = [];
        if ($sort && is_array($sort)) {
            foreach ($sort as $s) {
                $sortField = $s['field'] ?? null;
                $sortDir = strtoupper($s['dir'] ?? 'ASC') === 'DESC' ? 'DESC' : 'ASC';
                
                if ($sortField) {
                    $safeField = preg_replace('/[^a-zA-Z0-9_]/', '', $sortField);
                    if (in_array($sortField, ['id', 'created_at', 'updated_at'])) {
                        $orderByParts[] = "{$sortField} {$sortDir}";
                    } else {
                        $orderByParts[] = "json_extract(data, '\$.{$safeField}') {$sortDir}";
                    }
                }
            }
        }
        $orderBy = !empty($orderByParts) ? implode(', ', $orderByParts) : 'id DESC';
        
        // Get results
        $sql = "SELECT id, data, created_at, updated_at FROM {$tableName} {$whereClause} ORDER BY {$orderBy} LIMIT ? OFFSET ?";
        $stmt = $db->prepare($sql);
        $params[] = $pageSize;
        $params[] = $offset;
        $stmt->execute($params);
        
        $items = [];
        while ($row = $stmt->fetch()) {
            $items[] = [
                'id' => (int) $row['id'],
                'data' => json_decode($row['data'], true),
                'created_at' => $row['created_at'],
                'updated_at' => $row['updated_at'],
            ];
        }
        
        return [
            'items' => $items,
            'total' => $total,
            'page' => $page,
            'pageSize' => $pageSize,
            'totalPages' => (int) ceil($total / $pageSize),
            'query' => [
                'conditions' => count($conditions),
                'logic' => $logic,
                'sort' => $sort,
            ],
        ];
    }
    
    /**
     * Aggregate query - SUM, COUNT, AVG, MIN, MAX on numeric fields
     * 
     * @param string $slotKey Slot identifier
     * @param string $field Field to aggregate
     * @param string $function Aggregate function (count, sum, avg, min, max)
     * @param array $conditions Optional conditions to filter before aggregation
     * @return mixed Aggregate result
     */
    public static function aggregate(
        string $slotKey,
        string $field,
        string $function = 'count',
        array $conditions = []
    ): mixed {
        self::ensureTable($slotKey);
        
        $db = self::getInstance();
        $tableName = self::getTableName($slotKey);
        
        $function = strtoupper($function);
        $allowedFunctions = ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'];
        
        if (!in_array($function, $allowedFunctions)) {
            throw new \InvalidArgumentException("Invalid aggregate function: {$function}");
        }
        
        $safeField = preg_replace('/[^a-zA-Z0-9_]/', '', $field);
        $jsonPath = in_array($field, ['id', 'created_at', 'updated_at']) 
            ? $field 
            : "json_extract(data, '\$.{$safeField}')";
        
        // Build where clause from conditions
        $whereConditions = [];
        $params = [];
        
        foreach ($conditions as $cond) {
            $condField = $cond['field'] ?? null;
            $op = strtolower($cond['op'] ?? 'eq');
            $value = $cond['value'] ?? null;
            
            if (!$condField) continue;
            
            $safeCondField = preg_replace('/[^a-zA-Z0-9_]/', '', $condField);
            $condJsonPath = in_array($condField, ['id', 'created_at', 'updated_at']) 
                ? $condField 
                : "json_extract(data, '\$.{$safeCondField}')";
            
            if ($op === 'eq') {
                $whereConditions[] = "{$condJsonPath} = ?";
                $params[] = $value;
            }
        }
        
        $whereClause = !empty($whereConditions) 
            ? 'WHERE ' . implode(' AND ', $whereConditions) 
            : '';
        
        $selectExpr = $function === 'COUNT' ? 'COUNT(*)' : "{$function}({$jsonPath})";
        $sql = "SELECT {$selectExpr} as result FROM {$tableName} {$whereClause}";
        
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        
        return $stmt->fetch()['result'];
    }
    
    /**
     * Group by query - count records by field value
     * 
     * @param string $slotKey Slot identifier
     * @param string $field Field to group by
     * @param array $conditions Optional conditions
     * @param int $limit Maximum groups to return
     * @return array Array of [value => count]
     */
    public static function groupBy(
        string $slotKey,
        string $field,
        array $conditions = [],
        int $limit = 100
    ): array {
        self::ensureTable($slotKey);
        
        $db = self::getInstance();
        $tableName = self::getTableName($slotKey);
        
        $safeField = preg_replace('/[^a-zA-Z0-9_]/', '', $field);
        $jsonPath = in_array($field, ['id', 'created_at', 'updated_at']) 
            ? $field 
            : "json_extract(data, '\$.{$safeField}')";
        
        // Build where clause
        $whereConditions = [];
        $params = [];
        
        foreach ($conditions as $cond) {
            $condField = $cond['field'] ?? null;
            $value = $cond['value'] ?? null;
            
            if (!$condField) continue;
            
            $safeCondField = preg_replace('/[^a-zA-Z0-9_]/', '', $condField);
            $condJsonPath = in_array($condField, ['id', 'created_at', 'updated_at']) 
                ? $condField 
                : "json_extract(data, '\$.{$safeCondField}')";
            
            $whereConditions[] = "{$condJsonPath} = ?";
            $params[] = $value;
        }
        
        $whereClause = !empty($whereConditions) 
            ? 'WHERE ' . implode(' AND ', $whereConditions) 
            : '';
        
        $sql = "SELECT {$jsonPath} as group_value, COUNT(*) as count 
                FROM {$tableName} 
                {$whereClause}
                GROUP BY {$jsonPath} 
                ORDER BY count DESC 
                LIMIT ?";
        
        $params[] = $limit;
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        
        $results = [];
        while ($row = $stmt->fetch()) {
            $results[] = [
                'value' => $row['group_value'],
                'count' => (int) $row['count'],
            ];
        }
        
        return $results;
    }
    
    /**
     * Get distinct values for a field
     * 
     * @param string $slotKey Slot identifier
     * @param string $field Field to get distinct values from
     * @param int $limit Maximum values to return
     * @return array Array of distinct values
     */
    public static function distinct(
        string $slotKey,
        string $field,
        int $limit = 1000
    ): array {
        self::ensureTable($slotKey);
        
        $db = self::getInstance();
        $tableName = self::getTableName($slotKey);
        
        $safeField = preg_replace('/[^a-zA-Z0-9_]/', '', $field);
        $jsonPath = in_array($field, ['id', 'created_at', 'updated_at']) 
            ? $field 
            : "json_extract(data, '\$.{$safeField}')";
        
        $sql = "SELECT DISTINCT {$jsonPath} as value FROM {$tableName} WHERE {$jsonPath} IS NOT NULL LIMIT ?";
        $stmt = $db->prepare($sql);
        $stmt->execute([$limit]);
        
        return array_column($stmt->fetchAll(), 'value');
    }
    
    /**
     * Bulk update with conditions
     * 
     * @param string $slotKey Slot identifier
     * @param array $updates Key-value pairs to update in data
     * @param array $conditions Conditions to match records
     * @return int Number of updated records
     */
    public static function bulkUpdate(
        string $slotKey,
        array $updates,
        array $conditions
    ): int {
        self::ensureTable($slotKey);
        
        $db = self::getInstance();
        $tableName = self::getTableName($slotKey);
        
        // Build where clause
        $whereConditions = [];
        $params = [];
        
        foreach ($conditions as $cond) {
            $field = $cond['field'] ?? null;
            $value = $cond['value'] ?? null;
            
            if (!$field) continue;
            
            $safeField = preg_replace('/[^a-zA-Z0-9_]/', '', $field);
            $jsonPath = "json_extract(data, '\$.{$safeField}')";
            
            $whereConditions[] = "{$jsonPath} = ?";
            $params[] = $value;
        }
        
        if (empty($whereConditions)) {
            throw new \InvalidArgumentException("Bulk update requires at least one condition");
        }
        
        $whereClause = 'WHERE ' . implode(' AND ', $whereConditions);
        
        // Get matching records
        $sql = "SELECT id, data FROM {$tableName} {$whereClause}";
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        
        $db->beginTransaction();
        
        try {
            $count = 0;
            $updateStmt = $db->prepare("UPDATE {$tableName} SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
            
            while ($row = $stmt->fetch()) {
                $data = json_decode($row['data'], true);
                
                // Apply updates
                foreach ($updates as $key => $value) {
                    $data[$key] = $value;
                }
                
                $updateStmt->execute([json_encode($data, JSON_UNESCAPED_UNICODE), $row['id']]);
                self::updateFtsIndex($slotKey, (int)$row['id'], $data);
                $count++;
            }
            
            $db->commit();
            return $count;
            
        } catch (\Exception $e) {
            $db->rollBack();
            throw $e;
        }
    }
}

