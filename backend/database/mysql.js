const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const sslConfig = process.env.DB_SSL === 'true' || process.env.MYSQL_SSL === 'true'
    ? { rejectUnauthorized: false }
    : undefined;

const poolConfig = {
    host: process.env.DB_HOST || process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || process.env.MYSQL_PORT || 3306),
    user: process.env.DB_USER || process.env.MYSQL_USER || 'root',
    password: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : (process.env.MYSQL_PASSWORD || ''),
    database: process.env.DB_NAME || process.env.MYSQL_DATABASE || 'ai_resume_builder',
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 15),
    queueLimit: 0,
    charset: 'utf8mb4',
    ssl: sslConfig,
    multipleStatements: true,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT_MS || 8000),
};

let pool = null;

function getPool() {
    if (!pool || pool._closed || pool.pool?._closed) {
        pool = mysql.createPool(poolConfig);
    }
    return pool;
}

/**
 * Tests live MySQL/MariaDB connectivity.
 * @returns {Promise<{connected: boolean, latencyMs: number, version?: string, error?: string}>}
 */
async function testConnection() {
    const start = Date.now();
    try {
        if (!process.env.DB_USER && process.env.NODE_ENV === 'production') {
            return {
                connected: false,
                latencyMs: 0,
                error: 'MySQL credentials not configured in backend/.env (DB_NAME, DB_USER, DB_PASSWORD missing)',
                code: 'CREDENTIALS_MISSING',
                host: poolConfig.host,
                database: poolConfig.database,
            };
        }
        const p = getPool();
        const [rows] = await p.query('SELECT 1 AS alive, VERSION() AS version');
        const latencyMs = Date.now() - start;
        return {
            connected: true,
            latencyMs,
            version: rows[0]?.version || 'Unknown',
            host: poolConfig.host,
            database: poolConfig.database,
        };
    } catch (err) {
        return {
            connected: false,
            latencyMs: Date.now() - start,
            error: err.message,
            code: err.code || 'CONNECTION_FAILED',
            host: poolConfig.host,
            database: poolConfig.database,
        };
    }
}

/**
 * Executes schema.sql to ensure all tables and indexes exist.
 * Safe and idempotent (uses CREATE TABLE IF NOT EXISTS).
 */
async function initializeSchema() {
    try {
        if (!process.env.DB_USER && process.env.NODE_ENV === 'production') {
            return {
                success: false,
                error: 'MySQL credentials not configured in backend/.env. Please configure DB_NAME, DB_USER, and DB_PASSWORD first.',
            };
        }
        const schemaPath = path.join(__dirname, 'schema.sql');
        if (!fs.existsSync(schemaPath)) {
            throw new Error(`Schema file not found at ${schemaPath}`);
        }
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        const p = getPool();
        await p.query(schemaSql);
        await ensureExtendedSchema(p);
        console.log('[MySQL] Schema successfully initialized / verified.');
        return { success: true };
    } catch (err) {
        console.error('[MySQL] Schema initialization error:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Additive, idempotent schema extensions for existing deployments whose
 * tables were created before revision/tombstone/idempotency columns existed.
 *
 * Portable across MySQL 5.7/8.x and MariaDB: MySQL does not support
 * `ADD COLUMN IF NOT EXISTS`, so every ALTER is guarded by an
 * information_schema check first (the old MariaDB-only syntax silently
 * skipped every extension on plain MySQL).
 */
async function addColumnIfMissing(p, table, column, definition) {
    try {
        const [rows] = await p.query(
            'SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
            [table, column]
        );
        if (rows[0]?.c > 0) return;
        await p.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
    } catch (err) {
        if (!/unknown table|duplicate column|check that column/i.test(String(err.message || ''))) {
            console.warn(`[MySQL] Column extension notice (${table}.${column}):`, err.message);
        }
    }
}

async function addIndexIfMissing(p, table, indexName, definition) {
    try {
        const [rows] = await p.query(
            'SELECT COUNT(*) AS c FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?',
            [table, indexName]
        );
        if (rows[0]?.c > 0) return;
        await p.query(`ALTER TABLE \`${table}\` ADD ${definition}`);
    } catch (err) {
        if (!/unknown table|duplicate key name/i.test(String(err.message || ''))) {
            console.warn(`[MySQL] Index extension notice (${table}.${indexName}):`, err.message);
        }
    }
}

async function ensureExtendedSchema(poolOverride = null) {
    const p = poolOverride || getPool();
    await addColumnIfMissing(p, 'users', 'revision', 'INT NOT NULL DEFAULT 1');
    await addColumnIfMissing(p, 'users', 'deleted_at', 'TIMESTAMP NULL');
    await addColumnIfMissing(p, 'resumes', 'deleted_at', 'TIMESTAMP NULL');
    await addColumnIfMissing(p, 'sync_outbox', 'mutation_id', 'VARCHAR(64) NULL');
    await addColumnIfMissing(p, 'sync_outbox', 'idempotency_key', 'VARCHAR(64) NULL');
    await addColumnIfMissing(p, 'payment_orders', 'revision', 'INT NOT NULL DEFAULT 1');
    await addColumnIfMissing(p, 'payment_orders', 'mutation_id', 'VARCHAR(64) NULL');
    await addColumnIfMissing(p, 'payment_orders', 'recovery_needed', 'TINYINT(1) NOT NULL DEFAULT 0');
    await addColumnIfMissing(p, 'payment_orders', 'recovery_reason', 'VARCHAR(128) NULL');
    await addColumnIfMissing(p, 'payment_orders', 'last_payment_gateway', 'VARCHAR(64) NULL');
    await addColumnIfMissing(p, 'payment_orders', 'provider_refund_id', 'VARCHAR(255) NULL');
    await addColumnIfMissing(p, 'jobs', 'revision', 'INT NOT NULL DEFAULT 1');
    await addColumnIfMissing(p, 'blog', 'revision', 'INT NOT NULL DEFAULT 1');
    await addColumnIfMissing(p, 'blog', 'status', "VARCHAR(50) DEFAULT 'draft'");
    await addColumnIfMissing(p, 'blog', 'scheduled_at', 'TIMESTAMP NULL');
    await addColumnIfMissing(p, 'companies', 'extra_json', 'JSON NULL');
    await addColumnIfMissing(p, 'companies', 'revision', 'INT NOT NULL DEFAULT 1');
    await addColumnIfMissing(p, 'companies', 'status', "VARCHAR(50) DEFAULT 'pending'");
    await addColumnIfMissing(p, 'jobs', 'extra_json', 'JSON NULL');
    await addColumnIfMissing(p, 'applications', 'extra_json', 'JSON NULL');
    await addColumnIfMissing(p, 'applications', 'revision', 'INT NOT NULL DEFAULT 1');
    await addIndexIfMissing(p, 'favourites', 'uq_fav_user_item', 'UNIQUE KEY uq_fav_user_item (user_id, item_id)');
    const statements = [
        `CREATE TABLE IF NOT EXISTS payment_webhook_events (
            event_id VARCHAR(128) NOT NULL PRIMARY KEY,
            provider VARCHAR(64) NOT NULL,
            event_type VARCHAR(128) NOT NULL,
            order_id VARCHAR(128),
            payload JSON,
            received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
        `CREATE TABLE IF NOT EXISTS database_authority (
            id VARCHAR(32) NOT NULL PRIMARY KEY,
            generation INT NOT NULL DEFAULT 1,
            write_engine VARCHAR(32) NOT NULL DEFAULT 'mysql',
            mode VARCHAR(32) NOT NULL DEFAULT 'NORMAL',
            lease_owner VARCHAR(128),
            lease_expires_at BIGINT DEFAULT 0,
            reason TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
        `CREATE TABLE IF NOT EXISTS canonical_documents (
            entity_type VARCHAR(64) NOT NULL,
            entity_id VARCHAR(128) NOT NULL,
            payload JSON NOT NULL,
            revision INT NOT NULL DEFAULT 1,
            deleted_at TIMESTAMP NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (entity_type, entity_id),
            INDEX idx_cd_type (entity_type)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
        // OAuth / export-token tables moved out of Firestore into MySQL.
        `CREATE TABLE IF NOT EXISTS oauth_states (
            state_hash VARCHAR(64) NOT NULL PRIMARY KEY,
            provider VARCHAR(32) NOT NULL,
            code_verifier VARCHAR(255) NOT NULL,
            expires_at BIGINT NOT NULL,
            used_at TIMESTAMP NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_oauth_states_expiry (expires_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
        `CREATE TABLE IF NOT EXISTS oauth_exchange_codes (
            code_hash VARCHAR(64) NOT NULL PRIMARY KEY,
            uid VARCHAR(128) NOT NULL,
            provider VARCHAR(32) NOT NULL,
            expires_at BIGINT NOT NULL,
            used_at TIMESTAMP NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_oauth_exchange_expiry (expires_at),
            INDEX idx_oauth_exchange_uid (uid)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
        `CREATE TABLE IF NOT EXISTS export_render_tokens (
            token_hash VARCHAR(64) NOT NULL PRIMARY KEY,
            payload JSON NOT NULL,
            expires_at BIGINT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            consumed_at TIMESTAMP NULL,
            INDEX idx_export_tokens_expiry (expires_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
        `CREATE TABLE IF NOT EXISTS ai_usage (
            day_key VARCHAR(10) NOT NULL,
            uid_hash VARCHAR(40) NOT NULL,
            uid VARCHAR(128) NOT NULL,
            email VARCHAR(255),
            count INT NOT NULL DEFAULT 1,
            limit_used INT NOT NULL DEFAULT 10,
            last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (day_key, uid_hash),
            INDEX idx_ai_usage_uid (uid),
            INDEX idx_ai_usage_day (day_key)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
        `CREATE TABLE IF NOT EXISTS password_reset_tokens (
            token_hash VARCHAR(64) NOT NULL PRIMARY KEY,
            uid VARCHAR(128) NOT NULL,
            email VARCHAR(255) NOT NULL,
            expires_at BIGINT NOT NULL,
            used_at TIMESTAMP NULL,
            lease_id VARCHAR(64) NULL,
            lease_expires_at BIGINT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_prt_uid (uid),
            INDEX idx_prt_expiry (expires_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
        `CREATE TABLE IF NOT EXISTS password_reset_state (
            uid VARCHAR(128) NOT NULL PRIMARY KEY,
            active_token_hash VARCHAR(64) NOT NULL,
            expires_at BIGINT NOT NULL,
            consumed_at TIMESTAMP NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
        `CREATE TABLE IF NOT EXISTS email_verification_tokens (
            token_hash VARCHAR(64) NOT NULL PRIMARY KEY,
            uid VARCHAR(128) NOT NULL,
            email VARCHAR(255) NOT NULL,
            expires_at BIGINT NOT NULL,
            used_at TIMESTAMP NULL,
            lease_id VARCHAR(64) NULL,
            lease_expires_at BIGINT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_evt_uid (uid),
            INDEX idx_evt_expiry (expires_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
        `CREATE TABLE IF NOT EXISTS email_verification_state (
            uid VARCHAR(128) NOT NULL PRIMARY KEY,
            active_token_hash VARCHAR(64) NOT NULL,
            expires_at BIGINT NOT NULL,
            verified_at TIMESTAMP NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
        `CREATE TABLE IF NOT EXISTS email_logs (
            id VARCHAR(64) NOT NULL PRIMARY KEY,
            recipient VARCHAR(255),
            subject VARCHAR(255),
            template_type VARCHAR(64) DEFAULT 'custom',
            status VARCHAR(32) DEFAULT 'SENT',
            html MEDIUMTEXT,
            message_id VARCHAR(255),
            error TEXT,
            transport VARCHAR(64) DEFAULT 'primary_smtp',
            sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_email_logs_recipient (recipient),
            INDEX idx_email_logs_sent_at (sent_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
        // Durable notification outbox (transactional outbox pattern). MySQL is
        // authoritative; must function with Firestore completely unavailable.
        `CREATE TABLE IF NOT EXISTS notification_outbox (
            id VARCHAR(64) NOT NULL PRIMARY KEY,
            event_id VARCHAR(300) NOT NULL,
            channel VARCHAR(32) NOT NULL DEFAULT 'email',
            recipient VARCHAR(255) NOT NULL,
            template_type VARCHAR(80) NOT NULL,
            vars JSON,
            metadata JSON,
            tenant_id VARCHAR(128) NULL,
            idempotency_key VARCHAR(128) NULL,
            state VARCHAR(40) NOT NULL DEFAULT 'NOTIFICATION_QUEUED',
            attempt_count INT NOT NULL DEFAULT 0,
            max_attempts INT NOT NULL DEFAULT 5,
            provider_accepted TINYINT(1) NOT NULL DEFAULT 0,
            provider_accepted_at TIMESTAMP NULL,
            next_attempt_at BIGINT NOT NULL DEFAULT 0,
            lease_owner VARCHAR(128) NULL,
            lease_expires_at BIGINT NOT NULL DEFAULT 0,
            last_attempt_at TIMESTAMP NULL,
            last_error VARCHAR(500) NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_notification_idempotency (idempotency_key),
            INDEX idx_notification_due (state, next_attempt_at),
            INDEX idx_notification_recipient (recipient),
            INDEX idx_notification_state (state)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    ];
    for (const sql of statements) {
        try {
            await p.query(sql);
        } catch (err) {
            // Unknown table / older MariaDB without IF NOT EXISTS — non-fatal.
            if (!/unknown table|duplicate column|check that column/i.test(String(err.message || ''))) {
                console.warn('[MySQL] Schema extension notice:', err.message);
            }
        }
    }
}

/**
 * Closes the pool deterministically (graceful shutdown, test teardown).
 * Pending queries complete; idle connections are destroyed. Subsequent
 * getPool() calls create a fresh pool, so a restart-in-place is safe.
 */
async function closePool() {
    if (pool && !pool._closed) {
        const p = pool;
        pool = null;
        await p.end().catch(() => {});
    }
}

module.exports = {
    getPool,
    pool: getPool(),
    testConnection,
    initializeSchema,
    ensureExtendedSchema,
    closePool,
    poolConfig,
};
