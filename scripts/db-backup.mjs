#!/usr/bin/env node
/**
 * Logical backup / restore for the authoritative MySQL/MariaDB database
 * (mission §26). Pure SQL dump: schema (SHOW CREATE TABLE) + batched INSERTs,
 * portable to any MySQL/MariaDB restore target. Designed for automated
 * scheduled backups with retention, and for verified restore drills.
 *
 * Usage:
 *   node scripts/db-backup.mjs backup  --out backups/ai_resume_builder.sql [--gzip]
 *   node scripts/db-backup.mjs restore --in  backups/ai_resume_builder.sql
 *   node scripts/db-backup.mjs verify  --in  backups/ai_resume_builder.sql
 *
 * Environment: DB_HOST DB_PORT DB_USER DB_PASSWORD DB_NAME
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const mysql = require(path.join(process.cwd(), 'backend', 'node_modules', 'mysql2', 'promise'));

const DB = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'resumepilot',
  password: process.env.DB_PASSWORD || 'resumepilot_sandbox_pw',
  database: process.env.DB_NAME || 'ai_resume_builder',
};

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

  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  const payload = Buffer.from(lines.join('\n'), 'utf8');
  if (gzip) {
    fs.writeFileSync(`${out}.gz`, zlib.gzipSync(payload, { level: 6 }));
    console.log(JSON.stringify({ ok: true, file: `${out}.gz`, bytes: payload.length, ...summary }));
  } else {
    fs.writeFileSync(out, payload);
    console.log(JSON.stringify({ ok: true, file: out, bytes: payload.length, ...summary }));
  }
  await conn.end();
}

async function readBackup(file) {
  const raw = fs.readFileSync(file);
  return file.endsWith('.gz') ? zlib.gunzipSync(raw).toString('utf8') : raw.toString('utf8');
}

async function restore() {
  const input = argValue('--in');
  if (!input) throw new Error('--in <file.sql> is required');
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
  const sql = await readBackup(input);
  const tables = [...sql.matchAll(/CREATE TABLE `([^`]+)`/g)].map(m => m[1]);
  const inserts = (sql.match(/^INSERT INTO/gm) || []).length;
  const hasFooter = sql.includes('completed_at:');
  console.log(JSON.stringify({ ok: hasFooter && tables.length > 0, tablesInBackup: tables.length, insertBatches: inserts, complete: hasFooter }));
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
