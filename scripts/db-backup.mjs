#!/usr/bin/env node
/**
 * Logical backup / restore for the authoritative MySQL/MariaDB database
 * (mission §26). Pure SQL dump: schema (SHOW CREATE TABLE) + batched INSERTs,
 * portable to any MySQL/MariaDB restore target. Designed for automated
 * scheduled backups with retention, and for verified restore drills.
 *
 * Usage:
 *   node scripts/db-backup.mjs backup  --out backups/resumepilot.sql [--gzip]
 *   node scripts/db-backup.mjs verify  --in  backups/resumepilot.sql[.gz][.enc]
 *   DB_RESTORE_CONFIRM=RESTORE:<database> node scripts/db-backup.mjs restore --in <file>
 *
 * Environment: DB_HOST DB_PORT DB_USER DB_PASSWORD DB_NAME. Production also
 * requires BACKUP_ENCRYPTION_KEY_BASE64 (exactly 32 random bytes, base64).
 * Backups and SHA-256 sidecars are created exclusively with mode 0600.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const mysql = require(path.join(process.cwd(), 'backend', 'node_modules', 'mysql2', 'promise'));

function requiredEnvironment(name, { allowEmpty = false } = {}) {
  if (!Object.prototype.hasOwnProperty.call(process.env, name)) {
    throw new Error(`${name} is required`);
  }
  const value = String(process.env[name] ?? '');
  if (!allowEmpty && !value.trim()) throw new Error(`${name} cannot be empty`);
  return value;
}

const DB = {
  host: requiredEnvironment('DB_HOST'),
  port: Number(requiredEnvironment('DB_PORT')),
  user: requiredEnvironment('DB_USER'),
  password: requiredEnvironment('DB_PASSWORD', { allowEmpty: true }),
  database: requiredEnvironment('DB_NAME'),
};
if (!Number.isInteger(DB.port) || DB.port < 1 || DB.port > 65535) {
  throw new Error('DB_PORT must be an integer from 1 to 65535');
}
if (process.env.NODE_ENV === 'production' && !DB.password) {
  throw new Error('DB_PASSWORD cannot be empty in production');
}

function backupEncryptionKey() {
  const encoded = process.env.BACKUP_ENCRYPTION_KEY_BASE64;
  if (!encoded) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('BACKUP_ENCRYPTION_KEY_BASE64 is required in production');
    }
    return null;
  }
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32 || key.toString('base64').replace(/=+$/, '') !== encoded.replace(/=+$/, '')) {
    throw new Error('BACKUP_ENCRYPTION_KEY_BASE64 must be canonical base64 for exactly 32 bytes');
  }
  return key;
}

function encryptBackup(payload, key) {
  if (!key) return payload;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from('ResumePilot-DB-Backup-v1', 'ascii'));
  const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
  return Buffer.concat([Buffer.from('RPDB1', 'ascii'), iv, cipher.getAuthTag(), ciphertext]);
}

function decryptBackup(payload, key) {
  if (!payload.subarray(0, 5).equals(Buffer.from('RPDB1', 'ascii'))) return payload;
  if (!key) throw new Error('BACKUP_ENCRYPTION_KEY_BASE64 is required to read this encrypted backup');
  if (payload.length < 34) throw new Error('Encrypted backup is truncated');
  const iv = payload.subarray(5, 17);
  const tag = payload.subarray(17, 33);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(Buffer.from('ResumePilot-DB-Backup-v1', 'ascii'));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(payload.subarray(33)), decipher.final()]);
}

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : fallback;
}

function sqlEscape(value) {
  if (value === null || value === undefined) return 'NULL';
  if (value instanceof Date) return `'${value.toISOString().slice(0, 19).replace('T', ' ')}'`;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Buffer.isBuffer(value)) return `X'${value.toString('hex')}'`;
  const s = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "''").replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\0/g, '\\0')}'`;
}

async function listTables(conn) {
  const [rows] = await conn.query(
    "SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' ORDER BY table_name"
  );
  return rows.map(r => r.t);
}

async function backup() {
  const out = argValue('--out');
  if (!out) throw new Error('--out <file.sql> is required');
  const gzip = process.argv.includes('--gzip');
  const conn = await mysql.createConnection({ ...DB, dateStrings: false });
  await conn.query('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');
  await conn.query('START TRANSACTION WITH CONSISTENT SNAPSHOT');
  const startedAt = new Date().toISOString();
  const lines = [];
  lines.push(`-- ResumePilot AI logical backup`);
  lines.push(`-- database: ${DB.database} @ ${DB.host}:${DB.port}`);
  lines.push(`-- started_at: ${startedAt}`);
  lines.push('SET NAMES utf8mb4;');
  lines.push('SET FOREIGN_KEY_CHECKS = 0;');
  lines.push('SET UNIQUE_CHECKS = 0;');
  lines.push('SET AUTOCOMMIT = 0;');

  const tables = await listTables(conn);
  const summary = { tables: 0, rows: 0 };
  for (const table of tables) {
    const [createRows] = await conn.query(`SHOW CREATE TABLE \`${table}\``);
    const createSql = createRows[0]['Create Table'];
    lines.push(`DROP TABLE IF EXISTS \`${table}\`;`);
    lines.push(`${createSql};`);

    const [rows] = await conn.query(`SELECT * FROM \`${table}\``);
    const BATCH = 250;
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const tuples = chunk.map(row => `(${Object.values(row).map(sqlEscape).join(',')})`).join(',');
      lines.push(`INSERT INTO \`${table}\` VALUES ${tuples};`);
    }
    summary.tables += 1;
    summary.rows += rows.length;
  }
  lines.push('COMMIT;');
  lines.push('SET FOREIGN_KEY_CHECKS = 1;');
  lines.push('SET UNIQUE_CHECKS = 1;');
  lines.push(`-- completed_at: ${new Date().toISOString()}`);

  await conn.commit();
  await conn.end();

  const key = backupEncryptionKey();
  const output = path.resolve(`${gzip ? `${out}.gz` : out}${key ? '.enc' : ''}`);
  fs.mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 });
  const logicalPayload = Buffer.from(lines.join('\n'), 'utf8');
  const compressedPayload = gzip ? zlib.gzipSync(logicalPayload, { level: 6 }) : logicalPayload;
  const storedPayload = encryptBackup(compressedPayload, key);
  fs.writeFileSync(output, storedPayload, { flag: 'wx', mode: 0o600 });
  const sha256 = crypto.createHash('sha256').update(storedPayload).digest('hex');
  fs.writeFileSync(`${output}.sha256`, `${sha256}  ${path.basename(output)}\n`, { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ ok: true, file: output, bytes: storedPayload.length, logicalBytes: logicalPayload.length, sha256, encrypted: Boolean(key), compressed: gzip, ...summary }));
}

function verifyStoredBackup(file) {
  const resolved = path.resolve(file);
  const payload = fs.readFileSync(resolved);
  const digestFile = `${resolved}.sha256`;
  const digestLine = fs.readFileSync(digestFile, 'utf8').trim();
  const match = digestLine.match(/^([0-9a-f]{64})  ([^/\\]+)$/);
  if (!match || match[2] !== path.basename(resolved)) throw new Error('Backup digest sidecar is invalid');
  const actual = crypto.createHash('sha256').update(payload).digest('hex');
  const expectedBuffer = Buffer.from(match[1], 'hex');
  const actualBuffer = Buffer.from(actual, 'hex');
  if (!crypto.timingSafeEqual(actualBuffer, expectedBuffer)) throw new Error('Backup digest mismatch');
  return { resolved, payload, sha256: actual };
}

async function readBackup(file) {
  const { resolved, payload } = verifyStoredBackup(file);
  const decrypted = decryptBackup(payload, backupEncryptionKey());
  return /\.gz(?:\.enc)?$/.test(resolved)
    ? zlib.gunzipSync(decrypted).toString('utf8')
    : decrypted.toString('utf8');
}

async function restore() {
  const input = argValue('--in');
  if (!input) throw new Error('--in <file.sql> is required');
  if (process.env.DB_RESTORE_CONFIRM !== `RESTORE:${DB.database}`) {
    throw new Error(`Set DB_RESTORE_CONFIRM=RESTORE:${DB.database} to authorize this destructive restore`);
  }
  const sql = await readBackup(input);
  const conn = await mysql.createConnection({ ...DB, multipleStatements: true, connectTimeout: 15000 });
  const startedAt = Date.now();
  await conn.query(sql);
  const tables = await listTables(conn);
  console.log(JSON.stringify({ ok: true, restoredTables: tables.length, durationMs: Date.now() - startedAt }));
  await conn.end();
}

async function verify() {
  const input = argValue('--in');
  if (!input) throw new Error('--in <file.sql> is required');
  const integrity = verifyStoredBackup(input);
  const decrypted = decryptBackup(integrity.payload, backupEncryptionKey());
  const sql = /\.gz(?:\.enc)?$/.test(integrity.resolved)
    ? zlib.gunzipSync(decrypted).toString('utf8')
    : decrypted.toString('utf8');
  const tables = [...sql.matchAll(/CREATE TABLE `([^`]+)`/g)].map(match => match[1]);
  const inserts = (sql.match(/^INSERT INTO/gm) || []).length;
  const hasFooter = sql.includes('completed_at:');
  const ok = hasFooter && tables.length > 0;
  console.log(JSON.stringify({ ok, sha256: integrity.sha256, tablesInBackup: tables.length, insertBatches: inserts, complete: hasFooter }));
  if (!ok) throw new Error('Backup structure is incomplete');
}

const command = process.argv[2];
try {
  if (command === 'backup') await backup();
  else if (command === 'restore') await restore();
  else if (command === 'verify') await verify();
  else {
    console.error('Usage: db-backup.mjs <backup|restore|verify> ...');
    process.exit(2);
  }
} catch (err) {
  console.error(JSON.stringify({ ok: false, error: err.message }));
  process.exit(1);
}
