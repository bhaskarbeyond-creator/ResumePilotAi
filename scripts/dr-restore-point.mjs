#!/usr/bin/env node
/**
 * dr-restore-point.mjs — create and verify a production restore point.
 *
 * A "restore point" is not just a backup file. It is the complete, timestamped
 * description of a known-good production state, sufficient to answer "what
 * exactly were we running, and can we prove we can get back to it?" before any
 * architectural, database or deployment change is made.
 *
 * Captured
 *   • authoritative origin/main SHA and local HEAD SHA
 *   • production runtime SHAs (backend + frontend) as reported by the live service
 *   • MariaDB version, migration ledger version, database size, schema checksum
 *   • PM2 / application process state
 *   • TWO independent backup artifacts, each with its own SHA-256 and verification
 *
 * Independence is MEASURED, not assumed: if both artifacts land on the same
 * filesystem device the manifest says so explicitly and independence is
 * reported as NOT ACHIEVED. A second copy on the same disk is not DR.
 *
 * Usage
 *   node scripts/dr-restore-point.mjs [--out-dir <dir>] [--secondary-dir <dir>] [--no-probe]
 *
 * Environment
 *   DB_HOST DB_PORT DB_USER DB_PASSWORD DB_NAME  (loaded from backend/.env if present)
 *   BACKUP_ENCRYPTION_KEY_BASE64                 (required when NODE_ENV=production)
 *   PRODUCTION_URL                                optional, default https://airesume.projectdemo.guru
 *
 * Exit codes: 0 verified, 1 failed, 2 blocked.
 */

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);
const value = (name, fallback = null) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};

const PRIMARY_DIR = path.resolve(value('--out-dir', process.env.BACKUP_DIR || path.join(ROOT, 'backups', 'restore-points')));
const SECONDARY_DIR = path.resolve(value('--secondary-dir', process.env.BACKUP_SECONDARY_DIR || path.join(PRIMARY_DIR, 'secondary')));
const SKIP_PROBE = argv.includes('--no-probe');
const PRODUCTION_URL = (process.env.PRODUCTION_URL || 'https://airesume.projectdemo.guru').replace(/\/+$/, '');

const EPOCH = Date.now();
const STAMP = new Date(EPOCH).toISOString();

// ── Environment ────────────────────────────────────────────────────────────
function loadEnvironment() {
  const candidates = [
    process.env.BACKEND_ENV_FILE,
    path.join(ROOT, 'backend', '.env'),
    '/home/u727965524/backend/.env',
  ].filter(Boolean);
  for (const file of candidates) {
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

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function git(args, { optional = true } = {}) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (_) {
    return optional ? null : (() => { throw new Error(`git ${args.join(' ')} failed`); })();
  }
}

/** Filesystem device id, used to prove whether two artifacts are truly independent. */
function deviceOf(file) {
  try {
    return fs.statSync(file).dev;
  } catch (_) {
    return null;
  }
}

function runDbBackup(args) {
  const stdout = execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'db-backup.mjs'), ...args], {
    cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: process.env,
  });
  return JSON.parse(String(stdout).trim().split('\n').filter(Boolean).pop());
}

// ── Production runtime identity ────────────────────────────────────────────
async function probeProduction() {
  const result = { backendSha: null, frontendSha: null, healthOk: null, status: 'NOT VERIFIED', reason: null };
  if (SKIP_PROBE) {
    result.reason = 'probing disabled with --no-probe';
    return result;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${PRODUCTION_URL}/api/platform/version`, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    result.backendSha = body?.commitSha || null;
    result.frontendSha = body?.frontendBuildSha || null;
    result.healthOk = true;
    result.status = result.backendSha ? 'VERIFIED' : 'NOT VERIFIED';
    if (!result.frontendSha) result.reason = 'production did not report a frontend build SHA';
  } catch (error) {
    result.healthOk = false;
    result.reason = `production probe failed: ${String(error.message || error).slice(0, 200)}`;
  } finally {
    clearTimeout(timer);
  }
  return result;
}

// ── Database inventory ─────────────────────────────────────────────────────
async function inspectDatabase() {
  const inventory = {
    status: 'NOT VERIFIED',
    mariadbVersion: null,
    databaseName: null,
    databaseSizeBytes: null,
    tableCount: null,
    migrationVersion: null,
    migrationCount: null,
    schemaChecksum: null,
    reason: null,
  };

  let mysql;
  try {
    mysql = require(path.join(ROOT, 'backend', 'node_modules', 'mysql2', 'promise'));
  } catch (_) {
    inventory.reason = 'mysql2 driver is not installed; run npm --prefix backend ci';
    return inventory;
  }

  // The connection itself must be inside the guard: a refused connection is a
  // normal, reportable outcome (host down, firewall, wrong port), not a crash.
  let conn;
  try {
    conn = await mysql.createConnection({
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME,
      connectTimeout: 15000,
    });
  } catch (error) {
    inventory.reason = `connection failed: ${String(error.message || error).slice(0, 300)}`;
    return inventory;
  }

  try {
    const [[server]] = await conn.query('SELECT VERSION() AS version, DATABASE() AS db');
    inventory.mariadbVersion = server.version;
    inventory.databaseName = server.db;

    const [[size]] = await conn.query(
      `SELECT ROUND(SUM(data_length + index_length), 0) AS bytes
         FROM information_schema.tables
        WHERE table_schema = DATABASE()`,
    );
    inventory.databaseSizeBytes = size?.bytes ? Number(size.bytes) : null;

    const [columns] = await conn.query(
      `SELECT table_name, column_name, column_type, is_nullable
         FROM information_schema.columns
        WHERE table_schema = DATABASE()
        ORDER BY table_name, column_name`,
    );
    inventory.tableCount = new Set(columns.map((c) => c.table_name)).size;

    // Schema checksum: a stable digest of the physical column layout. Two
    // databases with the same checksum have the same schema, which is what
    // makes a restore comparable to the state it was taken from.
    const digest = crypto.createHash('sha256');
    for (const c of columns) {
      digest.update(`${c.table_name}.${c.column_name}:${c.column_type}:${c.is_nullable}\n`);
    }
    inventory.schemaChecksum = digest.digest('hex');

    try {
      const [migrations] = await conn.query('SELECT version, name FROM schema_migrations ORDER BY version');
      inventory.migrationCount = migrations.length;
      inventory.migrationVersion = migrations.length
        ? migrations[migrations.length - 1].version
        : null;
    } catch (error) {
      inventory.reason = `schema_migrations unreadable: ${error.message}`;
    }

    inventory.status = 'VERIFIED';
  } catch (error) {
    inventory.reason = String(error.message || error).slice(0, 300);
  } finally {
    await conn.end().catch(() => {});
  }
  return inventory;
}

// ── PM2 / application state ────────────────────────────────────────────────
function capturePm2State() {
  const state = { status: 'NOT VERIFIED', processes: [], reason: null };
  const candidates = [
    process.env.PM2_PATH,
    '/opt/alt/alt-nodejs20/root/usr/bin/pm2',
    path.join(os.homedir(), '.local/bin/pm2'),
    'pm2',
  ].filter(Boolean);

  for (const binary of candidates) {
    try {
      const output = execFileSync(binary, ['jlist'], {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 20000,
      });
      const parsed = JSON.parse(output);
      if (!Array.isArray(parsed)) throw new Error('unexpected pm2 output');
      state.processes = parsed.map((p) => ({
        name: p.name,
        pid: p.pid,
        status: p.pm2_env?.status || null,
        restarts: p.pm2_env?.restart_time ?? null,
        memoryBytes: p.monit?.memory ?? null,
        uptimeMs: p.pm2_env?.pm_uptime ? Date.now() - p.pm2_env.pm_uptime : null,
      }));
      state.binary = binary;
      state.status = 'VERIFIED';
      return state;
    } catch (error) {
      state.reason = String(error.message || error).slice(0, 200);
    }
  }
  if (!state.processes.length && !state.reason) state.reason = 'pm2 not found';
  return state;
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const startedAtMs = Date.now();
  const envFile = loadEnvironment();

  const missing = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_NAME'].filter((n) => !String(process.env[n] || '').trim());
  if (missing.length) {
    console.error(JSON.stringify({ script: 'dr-restore-point', status: 'BLOCKED', error: `Missing ${missing.join(', ')}` }, null, 2));
    process.exit(2);
  }
  const encryptionKey = process.env.BACKUP_ENCRYPTION_KEY_BASE64 || '';
  if (process.env.NODE_ENV === 'production' && !encryptionKey) {
    console.error(JSON.stringify({ script: 'dr-restore-point', status: 'BLOCKED', error: 'BACKUP_ENCRYPTION_KEY_BASE64 is required in production' }, null, 2));
    process.exit(2);
  }

  fs.mkdirSync(PRIMARY_DIR, { recursive: true, mode: 0o700 });
  fs.mkdirSync(SECONDARY_DIR, { recursive: true, mode: 0o700 });

  const manifest = {
    schema: 'resumepilot.restore-point.v1',
    createdAt: STAMP,
    createdAtEpochMs: EPOCH,
    host: os.hostname(),
    node: process.version,
    envFile: envFile ? path.basename(envFile) : null,
    git: {
      localHeadSha: git(['rev-parse', 'HEAD']),
      originMainSha: git(['rev-parse', 'origin/main']),
      branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
      dirty: (git(['status', '--porcelain']) || '') !== '',
    },
    production: null,
    database: null,
    pm2: null,
    artifacts: [],
    independence: null,
    verification: null,
    status: 'RUNNING',
  };

  // Run the read-only inspections concurrently; none of them mutate anything.
  const [production, database] = await Promise.all([probeProduction(), inspectDatabase()]);
  manifest.production = production;
  manifest.database = database;
  manifest.pm2 = capturePm2State();

  if (database.status !== 'VERIFIED') {
    manifest.status = 'BLOCKED';
    manifest.error = `Database inventory failed: ${database.reason}. No restore point was created.`;
    console.error(JSON.stringify(manifest, null, 2));
    process.exit(2);
  }

  // ── Two independent artifacts ────────────────────────────────────────────
  const baseName = `restore-point-${EPOCH}`;
  const targets = [
    { role: 'primary', dir: PRIMARY_DIR },
    { role: 'secondary', dir: SECONDARY_DIR },
  ];

  for (const target of targets) {
    const out = path.join(target.dir, `${baseName}-${target.role}.sql`);
    try {
      const created = runDbBackup(['backup', '--out', out, '--gzip']);
      const verify = runDbBackup(['verify', '--in', created.file]);
      const checksum = sha256File(created.file);
      manifest.artifacts.push({
        role: target.role,
        file: created.file,
        filename: path.basename(created.file),
        location: target.dir,
        sizeBytes: created.bytes,
        logicalBytes: created.logicalBytes,
        sha256: checksum,
        digestMatchesTool: checksum === created.sha256,
        encrypted: Boolean(created.encrypted),
        compressed: Boolean(created.compressed),
        tables: created.tables,
        rows: created.rows,
        verification: { structural: verify, status: verify.ok ? 'VERIFIED' : 'FAILED' },
      });
    } catch (error) {
      manifest.artifacts.push({
        role: target.role,
        location: target.dir,
        status: 'FAILED',
        error: String(error.message || error).slice(0, 400),
      });
    }
  }

  // ── Independence measurement ─────────────────────────────────────────────
  const good = manifest.artifacts.filter((a) => a.sha256);
  const devices = good.map((a) => deviceOf(a.file));
  const distinctDevices = new Set(devices.filter((d) => d !== null));
  const sameDirectory = path.resolve(PRIMARY_DIR) === path.resolve(SECONDARY_DIR);
  manifest.independence = {
    artifactCount: good.length,
    distinctFilesystemDevices: distinctDevices.size,
    sameDirectory,
    achieved: good.length >= 2 && distinctDevices.size >= 2 && !sameDirectory,
    status: good.length >= 2 && distinctDevices.size >= 2 && !sameDirectory ? 'VERIFIED' : 'NOT ACHIEVED',
    note: good.length < 2
      ? 'Fewer than two artifacts were created, so there is no independent copy.'
      : distinctDevices.size < 2
        ? 'Both artifacts are on the SAME filesystem device. This is a second copy, not an independent backup: a single disk failure destroys both. Put the secondary artifact on separate storage or replicate offsite.'
        : 'Artifacts are on distinct filesystem devices.',
  };

  // ── Verification ─────────────────────────────────────────────────────────
  const structurallyOk = good.filter((a) => a.verification?.structural?.ok);
  manifest.verification = {
    artifactsCreated: manifest.artifacts.length,
    artifactsVerified: structurallyOk.length,
    checksumsMatch: good.every((a) => a.digestMatchesTool),
    status: good.length === 2 && structurallyOk.length === 2 && good.every((a) => a.digestMatchesTool) ? 'VERIFIED' : 'FAILED',
    verifiedAt: new Date().toISOString(),
  };

  manifest.status = manifest.verification.status;
  manifest.durationMs = Date.now() - startedAtMs;

  const manifestPath = path.join(PRIMARY_DIR, `restore-point-${EPOCH}.json`);
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  manifest.manifestPath = manifestPath;

  console.log(JSON.stringify(manifest, null, 2));
  process.exit(manifest.verification.status === 'VERIFIED' ? 0 : 1);
}

main().catch((error) => {
  console.error(JSON.stringify({ script: 'dr-restore-point', status: 'FAILED', error: String(error.message || error) }, null, 2));
  process.exit(1);
});
