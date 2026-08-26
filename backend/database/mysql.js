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
    if (!pool) {
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
