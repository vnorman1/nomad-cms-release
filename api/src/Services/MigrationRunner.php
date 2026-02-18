<?php
/**
 * NOMAD CMS - Migration Runner
 * 
 * Executes database migrations in order during updates.
 * Tracks applied migrations to prevent re-running.
 */

declare(strict_types=1);

namespace NomadCMS\Services;

use PDO;
use RuntimeException;
use Throwable;

final class MigrationRunner
{
    private PDO $db;
    private string $migrationsPath;
    private string $tableName = 'migrations';
    
    public function __construct(PDO $db, ?string $migrationsPath = null)
    {
        $this->db = $db;
        $this->migrationsPath = $migrationsPath ?? __DIR__ . '/../../migrations';
        
        // Validate table name to prevent SQL injection (defense-in-depth)
        if (!preg_match('/^[a-zA-Z0-9_]+$/', $this->tableName)) {
            throw new RuntimeException('Invalid table name for migrations');
        }
        
        $this->ensureMigrationsTable();
    }
    
    /**
     * Run all pending migrations
     * 
     * @param array $migrations Migration files from manifest (optional)
     * @return array Results of each migration
     */
    public function runPending(?array $migrations = null): array
    {
        $results = [];
        $pending = $migrations ?? $this->getPendingMigrations();
        
        foreach ($pending as $migration) {
            $migrationName = is_array($migration) ? $migration['name'] : $migration;
            
            if ($this->hasRun($migrationName)) {
                $results[$migrationName] = ['status' => 'skipped', 'reason' => 'already applied'];
                continue;
            }
            
            try {
                $this->runMigration($migrationName);
                $this->markAsRun($migrationName);
                $results[$migrationName] = ['status' => 'success'];
            } catch (Throwable $e) {
                $results[$migrationName] = [
                    'status' => 'error',
                    'error' => $e->getMessage(),
                ];
                // Stop on first error
                break;
            }
        }
        
        return $results;
    }
    
    /**
     * Run a single migration file
     */
    public function runMigration(string $name): void
    {
        $filePath = $this->migrationsPath . '/' . $name;
        
        if (!file_exists($filePath)) {
            throw new RuntimeException("Migration file not found: {$name}");
        }
        
        $extension = pathinfo($filePath, PATHINFO_EXTENSION);
        
        switch ($extension) {
            case 'sql':
                $this->runSqlMigration($filePath);
                break;
            case 'php':
                $this->runPhpMigration($filePath);
                break;
            default:
                throw new RuntimeException("Unsupported migration type: {$extension}");
        }
    }
    
    /**
     * Run SQL migration file
     */
    private function runSqlMigration(string $filePath): void
    {
        $sql = file_get_contents($filePath);
        
        // Execute in a transaction
        $this->db->beginTransaction();
        
        try {
            // Split by semicolons (simple approach, doesn't handle complex cases)
            $statements = array_filter(
                array_map('trim', explode(';', $sql))
            );
            
            foreach ($statements as $statement) {
                if (!empty($statement)) {
                    $this->db->exec($statement);
                }
            }
            
            $this->db->commit();
        } catch (Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }
    }
    
    /**
     * Run PHP migration file
     * Expects file to return a callable or have up() function
     */
    private function runPhpMigration(string $filePath): void
    {
        $migration = require $filePath;
        
        if (is_callable($migration)) {
            $migration($this->db);
        } elseif (is_object($migration) && method_exists($migration, 'up')) {
            $migration->up($this->db);
        } else {
            throw new RuntimeException("Invalid migration format: must be callable or have up() method");
        }
    }
    
    /**
     * Rollback last N migrations
     */
    public function rollback(int $count = 1): array
    {
        $results = [];
        $migrations = $this->getAppliedMigrations($count);
        
        foreach ($migrations as $migration) {
            try {
                $this->rollbackMigration($migration['name']);
                $this->markAsRolledBack($migration['name']);
                $results[$migration['name']] = ['status' => 'success'];
            } catch (Throwable $e) {
                $results[$migration['name']] = [
                    'status' => 'error',
                    'error' => $e->getMessage(),
                ];
                break;
            }
        }
        
        return $results;
    }
    
    /**
     * Rollback a single migration
     */
    private function rollbackMigration(string $name): void
    {
        $filePath = $this->migrationsPath . '/' . $name;
        
        if (!file_exists($filePath)) {
            throw new RuntimeException("Migration file not found: {$name}");
        }
        
        $extension = pathinfo($filePath, PATHINFO_EXTENSION);
        
        if ($extension === 'php') {
            $migration = require $filePath;
            
            if (is_object($migration) && method_exists($migration, 'down')) {
                $migration->down($this->db);
            } else {
                throw new RuntimeException("Migration does not support rollback: {$name}");
            }
        } else {
            // SQL migrations typically don't support rollback
            throw new RuntimeException("SQL migrations don't support automatic rollback: {$name}");
        }
    }
    
    /**
     * Check if a migration has been applied
     */
    public function hasRun(string $name): bool
    {
        $stmt = $this->db->prepare(
            "SELECT COUNT(*) FROM {$this->tableName} WHERE name = ?"
        );
        $stmt->execute([$name]);
        
        return (int) $stmt->fetchColumn() > 0;
    }
    
    /**
     * Get list of pending migrations
     */
    public function getPendingMigrations(): array
    {
        if (!is_dir($this->migrationsPath)) {
            return [];
        }
        
        $files = glob($this->migrationsPath . '/*.{sql,php}', GLOB_BRACE);
        $pending = [];
        
        foreach ($files as $file) {
            $name = basename($file);
            if (!$this->hasRun($name)) {
                $pending[] = $name;
            }
        }
        
        // Sort by name (assumes format: YYYY_MM_DD_HHMMSS_description.sql)
        sort($pending);
        
        return $pending;
    }
    
    /**
     * Get applied migrations (most recent first)
     */
    private function getAppliedMigrations(int $limit = 10): array
    {
        $stmt = $this->db->prepare(
            "SELECT * FROM {$this->tableName} ORDER BY applied_at DESC LIMIT ?"
        );
        $stmt->execute([$limit]);
        
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
    
    /**
     * Mark migration as applied
     */
    private function markAsRun(string $name): void
    {
        $stmt = $this->db->prepare(
            "INSERT INTO {$this->tableName} (name, applied_at) VALUES (?, datetime('now'))"
        );
        $stmt->execute([$name]);
    }
    
    /**
     * Remove migration from applied list (for rollback)
     */
    private function markAsRolledBack(string $name): void
    {
        $stmt = $this->db->prepare(
            "DELETE FROM {$this->tableName} WHERE name = ?"
        );
        $stmt->execute([$name]);
    }
    
    /**
     * Ensure migrations tracking table exists
     */
    private function ensureMigrationsTable(): void
    {
        $this->db->exec("
            CREATE TABLE IF NOT EXISTS {$this->tableName} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                applied_at TEXT NOT NULL
            )
        ");
    }
    
    /**
     * Get migration status summary
     */
    public function getStatus(): array
    {
        $pending = $this->getPendingMigrations();
        
        $stmt = $this->db->query("SELECT COUNT(*) FROM {$this->tableName}");
        $applied = (int) $stmt->fetchColumn();
        
        return [
            'applied' => $applied,
            'pending' => count($pending),
            'pending_files' => $pending,
        ];
    }
}
