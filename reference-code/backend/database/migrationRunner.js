'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MIGRATION_DIRECTORY = path.join(__dirname, 'migrations');
const MIGRATION_FILE_PATTERN = /^(\d{3,})_([a-z0-9_]+)\.sql$/;
const LOCK_NAME = 'resumepilot:mariadb:schema-migrations';

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function discoverMigrations(directory = MIGRATION_DIRECTORY) {
  const migrations = fs.readdirSync(directory)
    .map(file => {
      const match = file.match(MIGRATION_FILE_PATTERN);
      if (!match) return null;
      const content = fs.readFileSync(path.join(directory, file), 'utf8').replace(/\r\n/g, '\n');
      return Object.freeze({ version: match[1], name: match[2], file, content, checksum: sha256(content) });
    })
    .filter(Boolean)
    .sort((left, right) => left.version.localeCompare(right.version));
  const versions = new Set();
  for (const migration of migrations) {
    if (versions.has(migration.version)) throw new Error(`Duplicate database migration version ${migration.version}`);
    versions.add(migration.version);
  }
  return migrations;
}

// Migrations contain no procedures or custom delimiters. This parser splits on
// semicolons outside quoted strings/backticks and SQL comments.
function splitSqlStatements(sql) {
  const statements = [];
  let buffer = '';
  let quote = null;
  let lineComment = false;
  let blockComment = false;
  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];
    if (lineComment) {
      if (char === '\n') { lineComment = false; buffer += '\n'; }
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') { blockComment = false; index += 1; }
      continue;
    }
    if (!quote && char === '-' && next === '-' && (index === 0 || /\s/.test(sql[index - 1]))) {
      lineComment = true; index += 1; continue;
    }
    if (!quote && char === '#') { lineComment = true; continue; }
    if (!quote && char === '/' && next === '*') { blockComment = true; index += 1; continue; }
    if (quote) {
      buffer += char;
      if (char === '\\') {
        if (index + 1 < sql.length) buffer += sql[++index];
      } else if (char === quote) {
        if (sql[index + 1] === quote && quote !== '`') buffer += sql[++index];
        else quote = null;
      }
      continue;
    }
    if (char === "'" || char === '"' || char === '`') { quote = char; buffer += char; continue; }
    if (char === ';') {
      const statement = buffer.trim();
      if (statement) statements.push(statement);
      buffer = '';
      continue;
    }
    buffer += char;
  }
  const trailing = buffer.trim();
  if (trailing) statements.push(trailing);
  if (quote || blockComment) throw new Error('Migration SQL contains an unterminated quote or comment');
  return statements;
}

async function ensureMigrationLedger(connection) {
  await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(32) NOT NULL PRIMARY KEY,
    name VARCHAR(160) NOT NULL,
    checksum CHAR(64) NOT NULL,
    execution_ms INT UNSIGNED NOT NULL,
    applied_by VARCHAR(128) NOT NULL,
    applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await connection.query(`CREATE TABLE IF NOT EXISTS schema_migration_attempts (
    id CHAR(36) NOT NULL PRIMARY KEY,
    version VARCHAR(32) NOT NULL,
    checksum CHAR(64) NOT NULL,
    outcome VARCHAR(16) NOT NULL,
    error_message VARCHAR(500),
    started_at DATETIME(3) NOT NULL,
    completed_at DATETIME(3) NOT NULL,
    INDEX idx_schema_attempt_version (version, completed_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}

async function migrationStatus(pool, { directory = MIGRATION_DIRECTORY } = {}) {
  const migrations = discoverMigrations(directory);
  const connection = await pool.getConnection();
  try {
    await ensureMigrationLedger(connection);
    const [rows] = await connection.query('SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version');
    const applied = new Map(rows.map(row => [String(row.version), row]));
    const mismatches = [];
    const pending = [];
    for (const migration of migrations) {
      const record = applied.get(migration.version);
      if (!record) pending.push({ version: migration.version, name: migration.name, checksum: migration.checksum });
      else if (record.checksum !== migration.checksum || record.name !== migration.name) {
        mismatches.push({
          version: migration.version,
          expectedChecksum: migration.checksum,
          appliedChecksum: record.checksum,
          expectedName: migration.name,
          appliedName: record.name,
        });
      }
    }
    const unknownApplied = rows.filter(row => !migrations.some(migration => migration.version === String(row.version)))
      .map(row => ({ version: String(row.version), name: row.name, checksum: row.checksum }));
    return { migrations, applied: rows, pending, mismatches, unknownApplied };
  } finally {
    connection.release();
  }
}

function assertProductionMigrationAuthorization(environment, now = Date.now()) {
  if (environment.NODE_ENV !== 'production') return;
  const verifiedAt = Date.parse(String(environment.DB_BACKUP_VERIFIED_AT || ''));
  const reference = String(environment.DB_BACKUP_REFERENCE || '').trim();
  const changeId = String(environment.DB_MIGRATION_CHANGE_ID || '').trim();
  const maximumAgeMs = Math.max(60_000, Number(environment.DB_BACKUP_MAX_AGE_MS || 24 * 60 * 60_000));
  if (!reference || !changeId || !Number.isFinite(verifiedAt) || verifiedAt > now || now - verifiedAt > maximumAgeMs) {
    throw Object.assign(new Error('Production migrations require a recent verified backup reference and approved change identifier'), {
      code: 'PRODUCTION_MIGRATION_BACKUP_REQUIRED', status: 412,
    });
  }
}

async function recordAttempt(connection, { version, checksum, outcome, error = null, startedAt, completedAt }) {
  await connection.query(
    `INSERT INTO schema_migration_attempts
     (id, version, checksum, outcome, error_message, started_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [crypto.randomUUID(), version, checksum, outcome, error ? String(error.message || error).slice(0, 500) : null,
      new Date(startedAt), new Date(completedAt)]
  );
}

async function runMigrations(pool, {
  mode = process.env.NODE_ENV === 'production' ? 'verify' : 'apply',
  environment = process.env,
  directory = MIGRATION_DIRECTORY,
  appliedBy = environment.DB_MIGRATION_ACTOR || environment.HOSTNAME || 'application-bootstrap',
} = {}) {
  if (!pool?.getConnection) throw new Error('A MariaDB connection pool is required');
  if (!['apply', 'verify'].includes(mode)) throw new Error('Migration mode must be apply or verify');
  if (mode === 'apply') assertProductionMigrationAuthorization(environment);

  const initial = await migrationStatus(pool, { directory });
  if (initial.mismatches.length || initial.unknownApplied.length) {
    throw Object.assign(new Error('Database migration ledger does not match the checked-in migration set'), {
      code: 'MIGRATION_LEDGER_MISMATCH', details: {
        mismatches: initial.mismatches,
        unknownApplied: initial.unknownApplied,
      },
    });
  }
  if (mode === 'verify') {
    return { mode, applied: [], pending: initial.pending, current: initial.pending.length === 0 };
  }

  const connection = await pool.getConnection();
  let lockAcquired = false;
  const applied = [];
  try {
    const [lockRows] = await connection.query('SELECT GET_LOCK(?, 60) AS acquired', [LOCK_NAME]);
    lockAcquired = Number(lockRows[0]?.acquired) === 1;
    if (!lockAcquired) throw Object.assign(new Error('Timed out waiting for the schema migration lock'), { code: 'MIGRATION_LOCK_TIMEOUT' });
    await ensureMigrationLedger(connection);

    for (const migration of discoverMigrations(directory)) {
      const [rows] = await connection.query('SELECT name, checksum FROM schema_migrations WHERE version = ?', [migration.version]);
      if (rows.length) {
        if (rows[0].name !== migration.name || rows[0].checksum !== migration.checksum) {
          throw Object.assign(new Error(`Applied migration ${migration.version} checksum differs from source`), { code: 'MIGRATION_CHECKSUM_MISMATCH' });
        }
        continue;
      }
      const startedAt = Date.now();
      try {
        for (const statement of splitSqlStatements(migration.content)) await connection.query(statement);
        const executionMs = Math.max(0, Date.now() - startedAt);
        await connection.query(
          `INSERT INTO schema_migrations (version, name, checksum, execution_ms, applied_by)
           VALUES (?, ?, ?, ?, ?)`,
          [migration.version, migration.name, migration.checksum, executionMs, String(appliedBy).slice(0, 128)]
        );
        await recordAttempt(connection, {
          version: migration.version, checksum: migration.checksum, outcome: 'APPLIED',
          startedAt, completedAt: Date.now(),
        });
        applied.push({ version: migration.version, name: migration.name, checksum: migration.checksum, executionMs });
      } catch (error) {
        await recordAttempt(connection, {
          version: migration.version, checksum: migration.checksum, outcome: 'FAILED', error,
          startedAt, completedAt: Date.now(),
        }).catch(() => {});
        error.code = error.code || 'MIGRATION_FAILED';
        error.migration = migration.file;
        throw error;
      }
    }
  } finally {
    if (lockAcquired) await connection.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]).catch(() => {});
    connection.release();
  }
  const final = await migrationStatus(pool, { directory });
  return { mode, applied, pending: final.pending, current: final.pending.length === 0 };
}

module.exports = {
  LOCK_NAME,
  MIGRATION_DIRECTORY,
  assertProductionMigrationAuthorization,
  discoverMigrations,
  migrationStatus,
  runMigrations,
  sha256,
  splitSqlStatements,
};
