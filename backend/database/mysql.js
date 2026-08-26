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
 * MariaDB supports ADD COLUMN IF NOT EXISTS.
 */
async function ensureExtendedSchema(poolOverride = null) {
    const p = poolOverride || getPool();
    const statements = [
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS revision INT NOT NULL DEFAULT 1",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL",
        "ALTER TABLE resumes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL",
        "ALTER TABLE sync_outbox ADD COLUMN IF NOT EXISTS mutation_id VARCHAR(64) NULL",
        "ALTER TABLE sync_outbox ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(64) NULL",
        "ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS revision INT NOT NULL DEFAULT 1",
        "ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS mutation_id VARCHAR(64) NULL",
        "ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS recovery_needed TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS recovery_reason VARCHAR(128) NULL",
        "ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS last_payment_gateway VARCHAR(64) NULL",
        "ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS provider_refund_id VARCHAR(255) NULL",
        "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS revision INT NOT NULL DEFAULT 1",
        "ALTER TABLE blog ADD COLUMN IF NOT EXISTS revision INT NOT NULL DEFAULT 1",
        "ALTER TABLE blog ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'draft'",
        "ALTER TABLE blog ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP NULL",
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
        "ALTER TABLE companies ADD COLUMN IF NOT EXISTS extra_json JSON NULL",
        "ALTER TABLE companies ADD COLUMN IF NOT EXISTS revision INT NOT NULL DEFAULT 1",
        "ALTER TABLE companies ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending'",
        "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS extra_json JSON NULL",
        "ALTER TABLE applications ADD COLUMN IF NOT EXISTS extra_json JSON NULL",
        "ALTER TABLE applications ADD COLUMN IF NOT EXISTS revision INT NOT NULL DEFAULT 1",
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
        "ALTER TABLE favourites ADD UNIQUE KEY IF NOT EXISTS uq_fav_user_item (user_id, item_id)",
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

module.exports = {
    getPool,
    pool: getPool(),
    testConnection,
    initializeSchema,
    ensureExtendedSchema,
    poolConfig,
};
