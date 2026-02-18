<?php
/**
 * NOMAD CMS - System Database (Auth)
 * Elkülönített adatbázis a biztonsági adatoknak (system.sqlite)
 * 
 * Split Architecture:
 * - system.sqlite: users, auth, sessions (THIS FILE)
 * - database.sqlite: CMS content, slots, media, versions
 */

declare(strict_types=1);

namespace NomadCMS\Database;

use PDO;
use PDOException;

final class AuthDatabase
{
    private static ?PDO $instance = null;
    
    /**
     * Get singleton database instance
     */
    public static function getInstance(): PDO
    {
        if (self::$instance === null) {
            $dbFile = $_ENV['DB_SYSTEM_DATABASE'] ?? 'system.sqlite';
            $dbPath = __DIR__ . '/../../databases/' . $dbFile;
            
            try {
                self::$instance = new PDO("sqlite:$dbPath", null, null, [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => false,
                ]);
                
                // Initialize schema if needed
                self::initializeSchema();
                
            } catch (PDOException $e) {
                throw new \RuntimeException("System database connection failed: " . $e->getMessage());
            }
        }
        
        return self::$instance;
    }
    
    /**
     * Initialize database schema
     */
    private static function initializeSchema(): void
    {
        $db = self::$instance;
        
        // Try WAL mode for better concurrency, fallback to DELETE for shared hosting
        try {
            $result = $db->query('PRAGMA journal_mode=WAL')->fetchColumn();
            if (strtoupper($result) === 'WAL') {
                // WAL mode successful - use NORMAL sync (safe with WAL)
                $db->exec('PRAGMA synchronous=NORMAL');
            } else {
                // WAL failed (e.g., NFS/shared hosting) - use DELETE mode
                $db->exec('PRAGMA journal_mode=DELETE');
                $db->exec('PRAGMA synchronous=FULL');
            }
        } catch (\Exception $e) {
            // Fallback to DELETE mode on any error
            $db->exec('PRAGMA journal_mode=DELETE');
            $db->exec('PRAGMA synchronous=FULL');
        }
        // 5MB cache for better read performance
        $db->exec('PRAGMA cache_size=-5000');
        // Temp tables in memory for faster JOINs
        $db->exec('PRAGMA temp_store=MEMORY');
        // Enable foreign keys
        $db->exec('PRAGMA foreign_keys=ON');
        // Auto-vacuum for long-term file size optimization
        $db->exec('PRAGMA auto_vacuum=INCREMENTAL');
        
        // Users table with USER-LEVEL auth settings
        $db->exec("
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                uuid TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT DEFAULT NULL,
                
                -- User-level auth settings (user can manage their own)
                totp_secret TEXT DEFAULT NULL,
                totp_enabled INTEGER DEFAULT 0,
                totp_allowed INTEGER DEFAULT 1,
                webauthn_allowed INTEGER DEFAULT 1,
                password_allowed INTEGER DEFAULT 1,
                backup_codes TEXT DEFAULT NULL,
                
                -- Account status
                email_verified INTEGER DEFAULT 0,
                is_admin INTEGER DEFAULT 0,
                is_new_user INTEGER DEFAULT 1,
                role TEXT DEFAULT NULL,
                failed_login_attempts INTEGER DEFAULT 0,
                locked_until TEXT DEFAULT NULL,
                
                -- Recovery settings
                recovery_email TEXT DEFAULT NULL,
                recovery_phone TEXT DEFAULT NULL,
                
                -- AI Assistant settings (per-user)
                ai_enabled INTEGER DEFAULT 0,
                ai_api_key TEXT DEFAULT NULL,
                ai_system_prompt TEXT DEFAULT NULL,
                ai_max_tokens INTEGER DEFAULT 4096,
                ai_selected_model TEXT DEFAULT NULL,
                
                -- User preferences (JSON: theme, language, etc.)
                preferences TEXT DEFAULT NULL,
                
                -- Timestamps
                last_login_at TEXT DEFAULT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        ");
        
        // Migration: Add is_new_user column if it doesn't exist
        try {
            $db->exec("ALTER TABLE users ADD COLUMN is_new_user INTEGER DEFAULT 1");
        } catch (\PDOException $e) {
            // Column already exists, ignore
        }
        
        // Migration: Add AI settings columns if they don't exist
        try {
            $db->exec("ALTER TABLE users ADD COLUMN ai_enabled INTEGER DEFAULT 0");
        } catch (\PDOException $e) {
            // Column already exists, ignore
        }
        try {
            $db->exec("ALTER TABLE users ADD COLUMN ai_api_key TEXT DEFAULT NULL");
        } catch (\PDOException $e) {
            // Column already exists, ignore
        }
        try {
            $db->exec("ALTER TABLE users ADD COLUMN ai_system_prompt TEXT DEFAULT NULL");
        } catch (\PDOException $e) {
            // Column already exists, ignore
        }
        try {
            $db->exec("ALTER TABLE users ADD COLUMN ai_max_tokens INTEGER DEFAULT 4096");
        } catch (\PDOException $e) {
            // Column already exists, ignore
        }
        try {
            $db->exec("ALTER TABLE users ADD COLUMN ai_selected_model TEXT DEFAULT NULL");
        } catch (\PDOException $e) {
            // Column already exists, ignore
        }
        
        // Migration: Add preferences column for user settings (theme, language, etc.)
        try {
            $db->exec("ALTER TABLE users ADD COLUMN preferences TEXT DEFAULT NULL");
        } catch (\PDOException $e) {
            // Column already exists, ignore
        }
        
        // Migration: Add role column for RBAC (admin, editor, viewer)
        try {
            $db->exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT NULL");
        } catch (\PDOException $e) {
            // Column already exists, ignore
        }
        
        // WebAuthn credentials table
        $db->exec("
            CREATE TABLE IF NOT EXISTS webauthn_credentials (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                credential_id TEXT UNIQUE NOT NULL,
                public_key TEXT NOT NULL,
                attestation_type TEXT NOT NULL,
                transports TEXT DEFAULT NULL,
                sign_count INTEGER DEFAULT 0,
                user_handle TEXT NOT NULL,
                friendly_name TEXT DEFAULT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                last_used_at TEXT DEFAULT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        ");
        
        // Refresh tokens table
        $db->exec("
            CREATE TABLE IF NOT EXISTS refresh_tokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                token_hash TEXT UNIQUE NOT NULL,
                family TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                revoked INTEGER DEFAULT 0,
                revoked_at TEXT DEFAULT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                ip_address TEXT DEFAULT NULL,
                user_agent TEXT DEFAULT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        ");
        
        // Sessions table for tracking active sessions
        $db->exec("
            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                session_id TEXT UNIQUE NOT NULL,
                ip_address TEXT DEFAULT NULL,
                user_agent TEXT DEFAULT NULL,
                last_activity_at TEXT DEFAULT CURRENT_TIMESTAMP,
                expires_at TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        ");
        
        // Login attempts for security auditing
        $db->exec("
            CREATE TABLE IF NOT EXISTS login_attempts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL,
                ip_address TEXT NOT NULL,
                user_agent TEXT DEFAULT NULL,
                success INTEGER NOT NULL,
                failure_reason TEXT DEFAULT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        ");
        
        // System settings table (key-value store for disaster recovery, etc.)
        $db->exec("
            CREATE TABLE IF NOT EXISTS system_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        ");
        
        // =========================================================================
        // Webhook Tables
        // =========================================================================
        
        // Outgoing webhook configurations
        $db->exec("
            CREATE TABLE IF NOT EXISTS webhooks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                url TEXT NOT NULL,
                secret TEXT NOT NULL,
                events TEXT NOT NULL,
                payload_fields TEXT DEFAULT NULL,
                slot_filters TEXT DEFAULT NULL,
                slot_type_filters TEXT DEFAULT NULL,
                headers TEXT DEFAULT NULL,
                is_active INTEGER DEFAULT 1,
                retry_count INTEGER DEFAULT 3,
                timeout_seconds INTEGER DEFAULT 30,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        ");
        
        // Add payload_fields column if not exists (migration for old databases)
        try {
            $db->exec("ALTER TABLE webhooks ADD COLUMN payload_fields TEXT DEFAULT NULL");
        } catch (\PDOException $e) {
            // Column already exists, ignore
        }
        
        // Add slot_filters column if not exists (migration for old databases)
        try {
            $db->exec("ALTER TABLE webhooks ADD COLUMN slot_filters TEXT DEFAULT NULL");
        } catch (\PDOException $e) {
            // Column already exists, ignore
        }
        
        // Add slot_type_filters column if not exists (migration for old databases)
        try {
            $db->exec("ALTER TABLE webhooks ADD COLUMN slot_type_filters TEXT DEFAULT NULL");
        } catch (\PDOException $e) {
            // Column already exists, ignore
        }
        
        // Add headers column if not exists (migration for old databases)
        try {
            $db->exec("ALTER TABLE webhooks ADD COLUMN headers TEXT DEFAULT NULL");
        } catch (\PDOException $e) {
            // Column already exists, ignore
        }
        
        // Webhook delivery log (for debugging and audit)
        $db->exec("
            CREATE TABLE IF NOT EXISTS webhook_deliveries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                webhook_id INTEGER NOT NULL,
                event TEXT NOT NULL,
                payload TEXT NOT NULL,
                response_status INTEGER,
                response_body TEXT,
                attempts INTEGER DEFAULT 1,
                delivered_at TEXT,
                failed_at TEXT,
                next_retry_at TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (webhook_id) REFERENCES webhooks(id) ON DELETE CASCADE
            )
        ");
        
        // Incoming webhook endpoints (external services calling CMS)
        $db->exec("
            CREATE TABLE IF NOT EXISTS webhook_endpoints (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                endpoint_key TEXT UNIQUE NOT NULL,
                secret TEXT NOT NULL,
                handler TEXT NOT NULL,
                is_active INTEGER DEFAULT 1,
                signature_header TEXT DEFAULT 'X-Webhook-Signature',
                timestamp_header TEXT,
                signature_format TEXT DEFAULT 'auto',
                last_called_at TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        ");
        
        // Migration: Add signature config columns if they don't exist
        try {
            $db->exec("ALTER TABLE webhook_endpoints ADD COLUMN signature_header TEXT DEFAULT 'X-Webhook-Signature'");
        } catch (\Exception $e) { /* Column exists */ }
        try {
            $db->exec("ALTER TABLE webhook_endpoints ADD COLUMN timestamp_header TEXT");
        } catch (\Exception $e) { /* Column exists */ }
        try {
            $db->exec("ALTER TABLE webhook_endpoints ADD COLUMN signature_format TEXT DEFAULT 'auto'");
        } catch (\Exception $e) { /* Column exists */ }
        
        // Pending webhooks for debouncing (collection/list slot types)
        $db->exec("
            CREATE TABLE IF NOT EXISTS webhook_pending (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                debounce_key TEXT NOT NULL,
                event TEXT NOT NULL,
                payload TEXT NOT NULL,
                slot_key TEXT,
                slot_type TEXT,
                execute_at INTEGER NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        ");
        
        // =========================================================================
        // Webhook Queue (Async Processing) - Phase 1
        // =========================================================================
        
        // Outgoing webhook queue for async delivery
        $db->exec("
            CREATE TABLE IF NOT EXISTS webhook_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                webhook_id INTEGER NOT NULL,
                event TEXT NOT NULL,
                payload TEXT NOT NULL,
                slot_key TEXT,
                slot_type TEXT,
                status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
                attempts INTEGER DEFAULT 0,
                max_attempts INTEGER DEFAULT 3,
                next_attempt_at INTEGER,
                created_at INTEGER NOT NULL,
                completed_at INTEGER,
                last_error TEXT,
                FOREIGN KEY (webhook_id) REFERENCES webhooks(id) ON DELETE CASCADE
            )
        ");
        
        // Processed events for idempotency (incoming webhooks) - Phase 2
        $db->exec("
            CREATE TABLE IF NOT EXISTS webhook_processed_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                endpoint_key TEXT NOT NULL,
                event_id TEXT NOT NULL,
                event_hash TEXT NOT NULL,
                processed_at INTEGER NOT NULL,
                result TEXT DEFAULT 'success',
                UNIQUE(endpoint_key, event_id)
            )
        ");
        
        // =========================================================================
        // Webhook Actions System 2.0 - User-defined automation
        // =========================================================================
        
        // Webhook Actions - Define what happens when a webhook arrives
        $db->exec("
            CREATE TABLE IF NOT EXISTS webhook_actions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                endpoint_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                
                -- Trigger conditions (when to fire)
                event_filter TEXT,
                condition_expression TEXT,
                
                -- Action configuration
                action_type TEXT NOT NULL,
                action_config TEXT NOT NULL,
                
                -- Payload transformation
                payload_mapping TEXT,
                
                -- Execution control
                priority INTEGER DEFAULT 0,
                is_active INTEGER DEFAULT 1,
                run_async INTEGER DEFAULT 0,
                timeout_seconds INTEGER DEFAULT 30,
                
                -- Statistics
                last_triggered_at TEXT,
                trigger_count INTEGER DEFAULT 0,
                success_count INTEGER DEFAULT 0,
                failure_count INTEGER DEFAULT 0,
                
                -- Timestamps
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                
                FOREIGN KEY (endpoint_id) REFERENCES webhook_endpoints(id) ON DELETE CASCADE
            )
        ");
        
        // Webhook Action Execution Logs - Track every action run
        $db->exec("
            CREATE TABLE IF NOT EXISTS webhook_action_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                action_id INTEGER NOT NULL,
                endpoint_id INTEGER NOT NULL,
                
                -- Input/Output
                input_payload TEXT,
                mapped_payload TEXT,
                output_result TEXT,
                
                -- Status
                status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'skipped', 'timeout')),
                error_message TEXT,
                execution_time_ms INTEGER,
                
                -- Context
                trigger_event TEXT,
                client_ip TEXT,
                
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                
                FOREIGN KEY (action_id) REFERENCES webhook_actions(id) ON DELETE CASCADE,
                FOREIGN KEY (endpoint_id) REFERENCES webhook_endpoints(id) ON DELETE CASCADE
            )
        ");
        
        // Provider Configurations - Store API keys/tokens for external services
        $db->exec("
            CREATE TABLE IF NOT EXISTS webhook_provider_configs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                provider TEXT NOT NULL,
                name TEXT NOT NULL,
                
                -- Encrypted config (bot tokens, API keys, etc.)
                config_encrypted TEXT NOT NULL,
                
                -- Status
                is_active INTEGER DEFAULT 1,
                is_verified INTEGER DEFAULT 0,
                last_verified_at TEXT,
                
                -- Timestamps
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        ");
        
        // Action Templates - Pre-built and user-created templates
        $db->exec("
            CREATE TABLE IF NOT EXISTS webhook_action_templates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                provider TEXT,
                
                -- Template definition
                action_type TEXT NOT NULL,
                action_config_template TEXT NOT NULL,
                payload_mapping_template TEXT,
                default_condition TEXT,
                
                -- Metadata
                icon TEXT,
                category TEXT,
                tags TEXT,
                is_system INTEGER DEFAULT 0,
                is_public INTEGER DEFAULT 1,
                user_id INTEGER,
                
                -- Usage stats
                usage_count INTEGER DEFAULT 0,
                
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
            )
        ");
        
        // Action Chains - Group actions into sequences
        $db->exec("
            CREATE TABLE IF NOT EXISTS webhook_action_chains (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                endpoint_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                
                -- Chain configuration
                execution_mode TEXT DEFAULT 'sequential' CHECK (execution_mode IN ('sequential', 'parallel', 'conditional')),
                stop_on_failure INTEGER DEFAULT 1,
                
                -- Trigger conditions
                event_filter TEXT,
                condition_expression TEXT,
                
                -- Status
                is_active INTEGER DEFAULT 1,
                priority INTEGER DEFAULT 0,
                
                -- Statistics
                last_triggered_at TEXT,
                trigger_count INTEGER DEFAULT 0,
                
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                
                FOREIGN KEY (endpoint_id) REFERENCES webhook_endpoints(id) ON DELETE CASCADE
            )
        ");
        
        // Chain Members - Actions within a chain
        $db->exec("
            CREATE TABLE IF NOT EXISTS webhook_chain_members (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chain_id INTEGER NOT NULL,
                action_id INTEGER NOT NULL,
                
                -- Order and conditions
                position INTEGER NOT NULL,
                condition_expression TEXT,
                
                -- Input mapping (use output from previous action)
                input_from_previous INTEGER DEFAULT 0,
                input_mapping TEXT,
                
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                
                FOREIGN KEY (chain_id) REFERENCES webhook_action_chains(id) ON DELETE CASCADE,
                FOREIGN KEY (action_id) REFERENCES webhook_actions(id) ON DELETE CASCADE
            )
        ");
        
        // Create indexes for performance
        $db->exec("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)");
        $db->exec("CREATE INDEX IF NOT EXISTS idx_webhooks_user_id ON webhooks(user_id)");
        $db->exec("CREATE INDEX IF NOT EXISTS idx_webhooks_is_active ON webhooks(is_active)");
        $db->exec("CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook_id ON webhook_deliveries(webhook_id)");
        $db->exec("CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_next_retry ON webhook_deliveries(next_retry_at)");
        $db->exec("CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_key ON webhook_endpoints(endpoint_key)");
        $db->exec("CREATE INDEX IF NOT EXISTS idx_webhook_pending_execute ON webhook_pending(execute_at)");
        $db->exec("CREATE INDEX IF NOT EXISTS idx_users_uuid ON users(uuid)");
        $db->exec("CREATE INDEX IF NOT EXISTS idx_webauthn_user_id ON webauthn_credentials(user_id)");
        $db->exec("CREATE INDEX IF NOT EXISTS idx_webauthn_credential_id ON webauthn_credentials(credential_id)");
        $db->exec("CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id)");
        $db->exec("CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash)");
        $db->exec("CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)");
        $db->exec("CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email)");
        $db->exec("CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip_address)");
        
        // Webhook queue indexes
        $db->exec("CREATE INDEX IF NOT EXISTS idx_webhook_queue_status ON webhook_queue(status, next_attempt_at)");
        $db->exec("CREATE INDEX IF NOT EXISTS idx_webhook_queue_webhook ON webhook_queue(webhook_id)");
        $db->exec("CREATE INDEX IF NOT EXISTS idx_processed_events_cleanup ON webhook_processed_events(processed_at)");
        
        // Webhook Actions 2.0 indexes
        $db->exec("CREATE INDEX IF NOT EXISTS idx_webhook_actions_endpoint ON webhook_actions(endpoint_id)");
        $db->exec("CREATE INDEX IF NOT EXISTS idx_webhook_actions_active ON webhook_actions(is_active)");
        $db->exec("CREATE INDEX IF NOT EXISTS idx_webhook_actions_type ON webhook_actions(action_type)");
        $db->exec("CREATE INDEX IF NOT EXISTS idx_webhook_action_logs_action ON webhook_action_logs(action_id)");
        $db->exec("CREATE INDEX IF NOT EXISTS idx_webhook_action_logs_endpoint ON webhook_action_logs(endpoint_id)");
        $db->exec("CREATE INDEX IF NOT EXISTS idx_webhook_action_logs_status ON webhook_action_logs(status)");
        $db->exec("CREATE INDEX IF NOT EXISTS idx_webhook_action_logs_created ON webhook_action_logs(created_at)");
        $db->exec("CREATE INDEX IF NOT EXISTS idx_webhook_provider_configs_user ON webhook_provider_configs(user_id)");
        $db->exec("CREATE INDEX IF NOT EXISTS idx_webhook_provider_configs_provider ON webhook_provider_configs(provider)");
        $db->exec("CREATE INDEX IF NOT EXISTS idx_webhook_action_templates_category ON webhook_action_templates(category)");
        $db->exec("CREATE INDEX IF NOT EXISTS idx_webhook_action_templates_provider ON webhook_action_templates(provider)");
        $db->exec("CREATE INDEX IF NOT EXISTS idx_webhook_action_chains_endpoint ON webhook_action_chains(endpoint_id)");
        $db->exec("CREATE INDEX IF NOT EXISTS idx_webhook_chain_members_chain ON webhook_chain_members(chain_id)");
        $db->exec("CREATE INDEX IF NOT EXISTS idx_webhook_chain_members_position ON webhook_chain_members(chain_id, position)");
    }
    
    /**
     * Close database connection
     */
    public static function close(): void
    {
        self::$instance = null;
    }

    /**
     * Garbage Collection: Delete old tokens
     * Deletes tokens expired more than 30 days ago to prevent database bloat
     */
    public static function cleanupTokens(): int
    {
        $db = AuthDatabase::getInstance();
        
        // Delete tokens expired or revoked more than 30 days ago
        $stmt = $db->prepare("
            DELETE FROM refresh_tokens 
            WHERE expires_at < datetime('now', '-30 days')
               OR (revoked = 1 AND revoked_at < datetime('now', '-30 days'))
        ");
        
        $stmt->execute();
        return $stmt->rowCount();
    }
    
    /**
     * Garbage Collection: Delete expired sessions
     * Deletes sessions expired more than 7 days ago to prevent database bloat
     */
    public static function cleanupSessions(): int
    {
        $db = AuthDatabase::getInstance();
        
        // Delete sessions expired more than 7 days ago
        $stmt = $db->prepare("
            DELETE FROM sessions 
            WHERE expires_at < datetime('now', '-7 days')
        ");
        
        $stmt->execute();
        return $stmt->rowCount();
    }
    
    // =========================================================================
    // System Settings (Key-Value Store)
    // =========================================================================
    
    /**
     * Get a system setting by key
     * 
     * @param string $key Setting key
     * @return string|null Setting value or null if not found
     */
    public static function getSetting(string $key): ?string
    {
        $db = self::getInstance();
        $stmt = $db->prepare("SELECT value FROM system_settings WHERE key = ?");
        $stmt->execute([$key]);
        $result = $stmt->fetch();
        return $result ? $result['value'] : null;
    }
    
    /**
     * Set a system setting (upsert)
     * 
     * @param string $key Setting key
     * @param string $value Setting value
     * @return bool Success
     */
    public static function setSetting(string $key, string $value): bool
    {
        $db = self::getInstance();
        $stmt = $db->prepare("
            INSERT INTO system_settings (key, value, updated_at) 
            VALUES (?, ?, datetime('now'))
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
        ");
        return $stmt->execute([$key, $value]);
    }
    
    /**
     * Delete a system setting
     * 
     * @param string $key Setting key
     * @return bool Success
     */
    public static function deleteSetting(string $key): bool
    {
        $db = self::getInstance();
        $stmt = $db->prepare("DELETE FROM system_settings WHERE key = ?");
        return $stmt->execute([$key]);
    }
}
