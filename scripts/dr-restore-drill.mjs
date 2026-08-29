#!/usr/bin/env node
/**
 * dr-restore-drill.mjs — automated, safe restore verification.
 *
 * Proves a backup is RESTORABLE, not merely well-formed. Verifying a checksum
 * tells you the bytes survived; loading the dump into a real MariaDB and
 * reconciling it against the backup's own contents tells you that you can
 * actually recover.
 *
 * Stages
 *   1. integrity   SHA-256 sidecar + gzip/AES-256-GCM decode
 *   2. inventory   tables, indexes, constraints, migrations, critical rows
 *   3. restore     into an EXPLICITLY DISPOSABLE, loopback-only database
 *   4. reconcile   restored schema/data compared against the artifact
 *
 * Safety
 *   The restore stage is refused unless the target database name advertises its
 *   own disposability, the host is loopback, MARIADB_TEST_ALLOW_RESET=true, and
 *   DB_RESTORE_CONFIRM exactly matches `RESTORE:<database>`. There is no flag
 *   that weakens any of these.
 *
 * If no isolated database is configured, stages 1-2 still run and the drill
 * reports NOT VERIFIED with the exact remediation. It never pretends.
 *
 * Usage
 *   node scripts/dr-restore-drill.mjs [--in <artifact>] [--dir <backupDir>] [--json]
 *
 * Exit codes: 0 verified, 1 failed, 2 blocked.
 */

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { evaluateRestoreReconciliation, assertRestorableTarget } from './lib/dr-restore-safety.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);
const value = (name, fallback = null) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const AS_JSON = argv.includes('--json');
const DIR = path.resolve(value('--dir', process.env.BACKUP_DIR || path.join(ROOT, 'backups', 'scheduled')));

const CRITICAL_TABLES = (process.env.DR_CRITICAL_TABLES || 'users,resumes,schema_migrations,system_settings')
  .split(',').map((t) => t.trim()).filter(Boolean);

/** Tables that must have data, not just exist. Empty means the restore is wrong. */
const REQUIRE_ROWS = (process.env.DR_REQUIRE_ROWS_TABLES || 'users,schema_migrations,system_settings')
  .split(',').map((t) => t.trim()).filter(Boolean);

function loadEnvironment() {
  for (const file of [process.env.BACKEND_ENV_FILE, path.join(ROOT, 'backend', '.env'), '/home/u727965524/backend/.env'].filter(Boolean)) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      if (process.env[m[1]] !== undefined) continue;
      process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
    }
    return file;
  }
  return null;
}

function encryptionKey() {
  const encoded = process.env.BACKUP_ENCRYPTION_KEY_BASE64;
  if (!encoded) return null;
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) throw new Error('BACKUP_ENCRYPTION_KEY_BASE64 must decode to exactly 32 bytes');
  return key;
}

/** Decrypt (if needed) and gunzip (if needed), mirroring db-backup.mjs exactly. */
function decodeArtifact(file) {
  const payload = fs.readFileSync(file);
  let buffer = payload;
  if (payload.subarray(0, 5).equals(Buffer.from('RPDB1', 'ascii'))) {
    const key = encryptionKey();
    if (!key) throw new Error('artifact is encrypted but BACKUP_ENCRYPTION_KEY_BASE64 is not set');
    if (payload.length < 34) throw new Error('encrypted artifact is truncated');
    const iv = payload.subarray(5, 17);
    const tag = payload.subarray(17, 33);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(Buffer.from('ResumePilot-DB-Backup-v1', 'ascii'));
    decipher.setAuthTag(tag);
    buffer = Buffer.concat([decipher.update(payload.subarray(33)), decipher.final()]);
  }
  const isGzip = /\.gz(\.enc)?$/.test(file) || (buffer[0] === 0x1f && buffer[1] === 0x8b);
  return { sql: (isGzip ? zlib.gunzipSync(buffer) : buffer).toString('utf8'), encrypted: payload.subarray(0, 5).equals(Buffer.from('RPDB1', 'ascii')) };
}

/** Structural inventory of the dump. */
export function inspectDump(sql) {
  const tables = [...sql.matchAll(/CREATE TABLE `([^`]+)`/g)].map((m) => m[1]);
  const insertTables = new Set([...sql.matchAll(/INSERT INTO `([^`]+)`/g)].map((m) => m[1]));
  const migrations = [];
  // Parse EVERY schema_migrations INSERT, not just the first. db-backup.mjs
  // batches inserts (one statement per 250 rows), and a dump may also contain
  // other statements mentioning the table. Reading only the first match would
  // silently report zero migrations for any database with more than one batch.
  for (const statement of sql.matchAll(/INSERT INTO `schema_migrations` VALUES ([^;]*);/g)) {
    for (const m of statement[1].matchAll(/\('(\d+)',\s*'([^']*)'/g)) {
      migrations.push({ version: m[1], name: m[2] });
    }
  }
  migrations.sort((a, b) => String(a.version).localeCompare(String(b.version)));
  return {
    tableCount: tables.length,
    tables,
    tablesWithData: [...insertTables],
    insertBatches: (sql.match(/^INSERT INTO/gm) || []).length,
    migrationCount: migrations.length,
    migrationVersions: migrations.map((m) => m.version),
    latestMigration: migrations.length ? migrations[migrations.length - 1].version : null,
    indexCount: (sql.match(/\b(?:KEY|INDEX)\s+`/g) || []).length,
    foreignKeyCount: (sql.match(/CONSTRAINT\s+`[^`]+`\s+FOREIGN KEY/g) || []).length,
    checkConstraintCount: (sql.match(/\bCHECK\s*\(/g) || []).length,
    complete: sql.includes('completed_at:'),
  };
}

function newestArtifact(dir) {
  const indexFile = path.join(dir, 'recovery-points.json');
  if (fs.existsSync(indexFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
      const verified = (parsed.recoveryPoints || []).filter((e) => e.verified && fs.existsSync(e.file));
      if (verified.length) return verified.sort((a, b) => b.timestampMs - a.timestampMs)[0].file;
    } catch (_) { /* fall through */ }
  }
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => /\.sql(\.gz)?(\.enc)?$/.test(f)).sort();
  return files.length ? path.join(dir, files[files.length - 1]) : null;
}

async function liveReconcile(target, inventory) {
  const mysql = require(path.join(ROOT, 'backend', 'node_modules', 'mysql2', 'promise'));
  const conn = await mysql.createConnection({
    host: target.host,
    port: Number(process.env.DR_TARGET_PORT || 3306),
    user: process.env.DR_TARGET_USER || process.env.DB_USER,
    password: process.env.DR_TARGET_PASSWORD ?? process.env.DB_PASSWORD ?? '',
    database: target.database,
    connectTimeout: 15000,
  });

  try {
    const [tables] = await conn.query(
      "SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' ORDER BY table_name",
    );
    const restoredTables = tables.map((r) => r.t);

    let restoredMigrations = null;
    try {
      const [rows] = await conn.query('SELECT version FROM schema_migrations ORDER BY version');
      restoredMigrations = rows.length;
    } catch (_) { /* table absent -> reported as a problem */ }

    const rowCounts = {};
    for (const table of CRITICAL_TABLES) {
      try {
        const [rows] = await conn.query(`SELECT COUNT(*) AS c FROM \`${table}\``);
        rowCounts[table] = Number(rows[0]?.c ?? 0);
      } catch (_) {
        rowCounts[table] = NaN;
      }
    }

    return evaluateRestoreReconciliation({
      expectedTables: inventory.tables,
      restoredTables,
      expectedMigrations: inventory.migrationCount,
      restoredMigrations,
      criticalTables: REQUIRE_ROWS,
      rowCounts,
    });
  } finally {
    await conn.end().catch(() => {});
  }
}

async function main() {
  const startedAtMs = Date.now();
  loadEnvironment();

  const artifact = value('--in') ? path.resolve(value('--in')) : newestArtifact(DIR);
  const report = {
    script: 'dr-restore-drill',
    startedAt: new Date(startedAtMs).toISOString(),
    backupDir: DIR,
    artifact: artifact || null,
    stages: {},
    status: 'RUNNING',
  };

  if (!artifact || !fs.existsSync(artifact)) {
    report.status = 'BLOCKED';
    report.error = `No backup artifact found${DIR ? ` in ${DIR}` : ''}. Provide one with --in <file>.`;
    report.remediation = 'Run a backup first: npm run dr:backup';
    emit(report);
    process.exit(2);
  }

  // ── Stage 1: integrity ───────────────────────────────────────────────────
  const stat = fs.statSync(artifact);
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(artifact)).digest('hex');
  const sidecarPath = `${artifact}.sha256`;
  let sidecarMatch = null;
  if (fs.existsSync(sidecarPath)) {
    const m = fs.readFileSync(sidecarPath, 'utf8').trim().match(/^([0-9a-f]{64})\s+(\S+)$/);
    sidecarMatch = m ? m[1] === sha256 : false;
  }
  report.stages.integrity = {
    sizeBytes: stat.size,
    sha256,
    sidecarPresent: fs.existsSync(sidecarPath),
    sidecarMatch,
    status: sidecarMatch === false ? 'FAIL' : 'PASS',
  };
  if (sidecarMatch === false) {
    report.status = 'FAILED';
    report.error = 'Backup checksum does not match its sidecar; the artifact is corrupt.';
    emit(report);
    process.exit(1);
  }

  let sql;
  try {
    const decoded = decodeArtifact(artifact);
    sql = decoded.sql;
    report.stages.integrity.encrypted = decoded.encrypted;
    report.stages.integrity.decodedBytes = Buffer.byteLength(sql);
    report.stages.integrity.decodeStatus = 'PASS';
  } catch (error) {
    report.stages.integrity.decodeStatus = 'FAIL';
    report.stages.integrity.decodeError = String(error.message || error).slice(0, 300);
    report.status = 'FAILED';
    report.error = 'Backup could not be decompressed/decrypted - it is not restorable.';
    emit(report);
    process.exit(1);
  }

  // ── Stage 2: inventory ───────────────────────────────────────────────────
  const inventory = inspectDump(sql);
  report.stages.inventory = { ...inventory, status: inventory.tableCount > 0 && inventory.complete ? 'PASS' : 'FAIL' };
  if (report.stages.inventory.status === 'FAIL') {
    report.status = 'FAILED';
    report.error = `Backup structure is incomplete (${inventory.tableCount} tables, complete=${inventory.complete}).`;
    emit(report);
    process.exit(1);
  }

  // ── Stage 3/4: isolated restore + reconcile ─────────────────────────────
  const targetDatabase = process.env.DR_RESTORE_TARGET_DB || process.env.DB_RESTORE_TARGET_DB || null;
  if (!targetDatabase) {
    report.stages.restore = { status: 'NOT VERIFIED', reason: 'no isolated restore target configured' };
    report.status = 'NOT VERIFIED';
    report.remediation = [
      'Set DR_RESTORE_TARGET_DB to a disposable database (e.g. resumepilot_restore_drill),',
      'DB_RESTORE_CONFIRM=RESTORE:<that database>, MARIADB_TEST_ALLOW_RESET=true,',
      'and DR_TARGET_USER / DR_TARGET_PASSWORD for a loopback MariaDB, then re-run.',
      'Stages 1-2 (integrity and inventory) have passed; only the live restore is unverified.',
    ].join(' ');
    emit(report);
    process.exit(2);
  }

  let target;
  try {
    target = assertRestorableTarget({
      host: process.env.DR_TARGET_HOST || process.env.DB_HOST,
      database: targetDatabase,
      confirm: process.env.DB_RESTORE_CONFIRM,
      allowReset: process.env.MARIADB_TEST_ALLOW_RESET === 'true',
    });
  } catch (error) {
    report.stages.restore = { status: 'BLOCKED', reason: error.message };
    report.status = 'BLOCKED';
    report.error = error.message;
    emit(report);
    process.exit(2);
  }

  try {
    const restoreEnv = {
      ...process.env,
      DB_HOST: target.host,
      DB_PORT: String(process.env.DR_TARGET_PORT || process.env.DB_PORT || 3306),
      DB_USER: process.env.DR_TARGET_USER || process.env.DB_USER,
      DB_PASSWORD: String(process.env.DR_TARGET_PASSWORD ?? process.env.DB_PASSWORD ?? ''),
      DB_NAME: target.database,
      DB_RESTORE_CONFIRM: `RESTORE:${target.database}`,
    };
    const restoreStartedAt = Date.now();
    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'db-backup.mjs'), 'restore', '--in', artifact], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: restoreEnv,
    });
    report.stages.restore = {
      status: 'PASS',
      target: `${target.host}/${target.database}`,
      durationMs: Date.now() - restoreStartedAt,
    };
  } catch (error) {
    report.stages.restore = { status: 'FAIL', error: String(error.message || error).slice(0, 400), target: `${target.host}/${target.database}` };
    report.status = 'FAILED';
    emit(report);
    process.exit(1);
  }

  let reconciliation;
  try {
    reconciliation = await liveReconcile(target, inventory);
    report.stages.reconcile = reconciliation;
  } catch (error) {
    report.stages.reconcile = { status: 'FAIL', error: String(error.message || error).slice(0, 400) };
    report.status = 'FAILED';
    emit(report);
    process.exit(1);
  }

  report.status = reconciliation.status === 'PASS' ? 'VERIFIED' : 'FAILED';
  report.durationMs = Date.now() - startedAtMs;
  if (report.status === 'VERIFIED') {
    report.restoreDrillAtMs = Date.now();
    report.note = 'Record this timestamp in DR_LAST_RESTORE_DRILL_AT_MS so dr-monitor stops reporting NO_RESTORE_DRILL.';
  }
  emit(report);
  process.exit(report.status === 'VERIFIED' ? 0 : 1);
}

function emit(report) {
  report.finishedAt = new Date().toISOString();
  try {
    fs.mkdirSync(path.join(ROOT, 'test-results'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, 'test-results', 'dr-restore-drill.json'), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  } catch (_) { /* reporting must never break the drill */ }
  if (AS_JSON) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`dr-restore-drill: ${path.basename(report.artifact || '(none)')}`);
    for (const [name, stage] of Object.entries(report.stages)) {
      console.log(`  ${name.padEnd(11)}: ${stage.status}${stage.reason ? ` — ${stage.reason}` : ''}`);
    }
    console.log(`  status      : ${report.status}`);
    if (report.error) console.log(`  error       : ${report.error}`);
    if (report.remediation) console.log(`  remediation : ${report.remediation}`);
  }
}

const invokedDirectly = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((error) => {
    console.error(JSON.stringify({ script: 'dr-restore-drill', status: 'FAILED', error: String(error.message || error) }, null, 2));
    process.exit(1);
  });
}
