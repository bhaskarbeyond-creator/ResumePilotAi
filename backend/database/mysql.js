'use strict';

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { migrationStatus, runMigrations } = require('./migrationRunner');

require('dotenv').config({ path: path.join(__dirname, '../../.env') });
require('dotenv').config({ path: path.join(__dirname, '../.env') });

function buildSslConfig(environment = process.env) {
  const enabled = String(environment.DB_SSL || environment.MYSQL_SSL || '').toLowerCase() === 'true';
  if (!enabled) return undefined;
  const rejectUnauthorized = String(environment.DB_SSL_REJECT_UNAUTHORIZED || 'true').toLowerCase() !== 'false';
  if (!rejectUnauthorized && environment.NODE_ENV === 'production') {
    throw Object.assign(new Error('Production MariaDB TLS certificate verification cannot be disabled'), {
      code: 'INSECURE_DATABASE_TLS_CONFIGURATION',
    });
  }
  const ssl = { rejectUnauthorized };
  if (environment.DB_SSL_CA_FILE) ssl.ca = fs.readFileSync(path.resolve(environment.DB_SSL_CA_FILE), 'utf8');
  else if (environment.DB_SSL_CA_BASE64) ssl.ca = Buffer.from(environment.DB_SSL_CA_BASE64, 'base64').toString('utf8');
  if (environment.DB_SSL_SERVERNAME) ssl.servername = environment.DB_SSL_SERVERNAME;
  return ssl;
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

const poolConfig = Object.freeze({
  host: process.env.DB_HOST || process.env.MYSQL_HOST || '127.0.0.1',
  port: boundedInteger(process.env.DB_PORT || process.env.MYSQL_PORT, 3306, 1, 65535),
  user: process.env.DB_USER || process.env.MYSQL_USER || 'root',
  password: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : (process.env.MYSQL_PASSWORD || ''),
  database: process.env.DB_NAME || process.env.MYSQL_DATABASE || 'ai_resume_builder',
  waitForConnections: true,
  connectionLimit: boundedInteger(process.env.DB_CONNECTION_LIMIT, 15, 1, 100),
  queueLimit: boundedInteger(process.env.DB_QUEUE_LIMIT, 200, 1, 10_000),
  charset: 'utf8mb4',
  timezone: 'Z',
  ssl: buildSslConfig(),
  multipleStatements: false,
  enableKeepAlive: process.env.NODE_ENV !== 'test',
  keepAliveInitialDelay: process.env.NODE_ENV === 'test' ? 0 : 10_000,
  idleTimeout: process.env.NODE_ENV === 'test' ? 1_000 : 60_000,
  connectTimeout: boundedInteger(process.env.DB_CONNECT_TIMEOUT_MS, 8_000, 1_000, 60_000),
});

let pool = null;

function getPool() {
  if (!pool || pool._closed || pool.pool?._closed) {
    pool = mysql.createPool(poolConfig);
    pool.on('connection', (connection) => {
      connection.query("SET time_zone = '+00:00'", () => {});
    });
  }
  return pool;
}

async function testConnection() {
  const start = Date.now();
  try {
    if (!process.env.DB_USER && process.env.NODE_ENV === 'production') {
      return {
        connected: false,
        latencyMs: 0,
        error: 'MariaDB credentials are not configured',
        code: 'CREDENTIALS_MISSING',
        host: poolConfig.host,
        database: poolConfig.database,
      };
    }
    const [rows] = await getPool().query('SELECT 1 AS alive, VERSION() AS version');
    return {
      connected: Boolean(rows[0]?.alive),
      latencyMs: Date.now() - start,
      version: rows[0]?.version || 'Unknown',
      host: poolConfig.host,
      database: poolConfig.database,
      tls: Boolean(poolConfig.ssl),
      tlsCertificateVerification: poolConfig.ssl ? poolConfig.ssl.rejectUnauthorized !== false : null,
    };
  } catch (error) {
    return {
      connected: false,
      latencyMs: Date.now() - start,
      error: error.message,
      code: error.code || 'CONNECTION_FAILED',
      host: poolConfig.host,
      database: poolConfig.database,
    };
  }
}

async function initializeSchema(options = {}) {
  try {
    if (!process.env.DB_USER && process.env.NODE_ENV === 'production') {
      return { success: false, error: 'MariaDB credentials are not configured', code: 'CREDENTIALS_MISSING' };
    }
    const result = await runMigrations(getPool(), options);
    if (!result.current) {
      return {
        success: false,
        code: 'DATABASE_MIGRATIONS_PENDING',
        error: `${result.pending.length} database migration(s) are pending`,
        ...result,
      };
    }
    return { success: true, ...result };
  } catch (error) {
    console.error('[MariaDB] Migration verification/application failed:', error.message);
    return {
      success: false,
      error: error.message,
      code: error.code || 'MIGRATION_FAILED',
      migration: error.migration || null,
      details: error.details || null,
    };
  }
}

async function getMigrationStatus() {
  return migrationStatus(getPool());
}

// Compatibility name retained for callers while behavior is now checksummed,
// ordered migration application rather than ad-hoc schema mutation.
async function ensureExtendedSchema() {
  return initializeSchema({ mode: 'apply' });
}

function setPoolForTests(testPool) {
  if (process.env.NODE_ENV !== 'test') {
    throw Object.assign(new Error('MariaDB pool injection is restricted to tests'), { code: 'DATABASE_TEST_OVERRIDE_FORBIDDEN' });
  }
  if (!testPool || typeof testPool.query !== 'function') {
    throw Object.assign(new Error('A query-capable MariaDB test pool is required'), { code: 'DATABASE_TEST_POOL_INVALID' });
  }
  pool = testPool;
  return pool;
}

async function closePool() {
  if (pool && !pool._closed) {
    const active = pool;
    pool = null;
    await active.end().catch(() => {});
  }
}

const exported = {
  buildSslConfig,
  closePool,
  ensureExtendedSchema,
  getMigrationStatus,
  getPool,
  initializeSchema,
  poolConfig,
  setPoolForTests,
  testConnection,
};
Object.defineProperty(exported, 'pool', { enumerable: true, get: getPool });
module.exports = exported;
