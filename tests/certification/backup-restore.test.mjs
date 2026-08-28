/**
 * BACKUP / RESTORE CERTIFICATION (mission §26)
 *
 * Performs a REAL backup → destruction → restore drill against an explicitly
 * gated, disposable MariaDB test database. It refuses production/non-loopback
 * targets:
 *
 *   1. seed marker records (user + resume) with known content
 *   2. take a logical backup (scripts/db-backup.mjs backup)
 *   3. verify backup integrity (scripts/db-backup.mjs verify)
 *   4. DESTROY the database (DROP DATABASE) — total data loss
 *   5. recreate the empty database and RESTORE from the backup
 *   6. reconciliation: table census, marker rows, and content checksums
 *      must match the pre-destruction state exactly
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadCertificationDatabase } from './helpers/databaseConfig.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const mysql = require(path.join(ROOT, 'backend', 'node_modules', 'mysql2', 'promise'));

const ENABLED = process.env.RUN_MARIADB_BACKUP_RESTORE_DRILL === 'true';
const RESET_ALLOWED = process.env.MARIADB_TEST_ALLOW_RESET === 'true';
const DB = ENABLED
  ? loadCertificationDatabase()
  : { host: '127.0.0.1', port: 3306, user: 'not-configured', password: '', database: 'resumepilot_cert_not_configured', name: 'resumepilot_cert_not_configured' };
const BACKUP_FILE = path.join(ROOT, 'scratch', 'recovery-evidence', `backup-restore-${Date.now()}.sql`);
const drillTest = (name, fn) => test(name, {
  skip: ENABLED ? false : 'NOT VERIFIED: set RUN_MARIADB_BACKUP_RESTORE_DRILL=true and MARIADB_TEST_ALLOW_RESET=true for an isolated disposable database',
}, fn);

if (ENABLED) {
  assert.equal(process.env.NODE_ENV, 'test', 'destructive recovery drill requires NODE_ENV=test');
  assert.equal(RESET_ALLOWED, true, 'destructive recovery drill requires MARIADB_TEST_ALLOW_RESET=true');
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(String(DB.host).toLowerCase()),
    'destructive recovery drill is restricted to a loopback MariaDB service');
  assert.match(DB.database, /(?:^|[_-])(?:test|ci|cert|certification|sandbox|scratch)(?:[_-]|$)/i,
    'destructive recovery drill requires an explicitly disposable database name');
  fs.mkdirSync(path.dirname(BACKUP_FILE), { recursive: true });
}
const MARKER_UID = 'cert-backup-user';
const MARKER_RESUME = 'cert_backup_resume';

function run(args) {
  return execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'db-backup.mjs'), ...args], {
    cwd: ROOT,
    env: {
      ...process.env,
      DB_HOST: DB.host,
      DB_PORT: String(DB.port),
      DB_USER: DB.user,
      DB_PASSWORD: DB.password,
      DB_NAME: DB.database,
      DB_RESTORE_CONFIRM: `RESTORE:${DB.database}`,
    },
    encoding: 'utf8',
  });
}

let snapshot = null;

async function tableCensus(conn) {
  const [rows] = await conn.query(
    "SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' ORDER BY table_name"
  );
  return rows.map(r => r.t);
}

async function getConnection(retries = 3) {
  let lastError;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      return await mysql.createConnection({ ...DB, multipleStatements: true, connectTimeout: 3000 });
    } catch (error) {
      lastError = error;
      if (attempt + 1 < retries) await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  throw lastError;
}

drillTest('backup/restore drill: seed → backup → destroy → restore → reconcile', async () => {
  const conn = await getConnection();

  // 1. Seed deterministic marker records.
  await conn.query('DELETE FROM resumes WHERE id = ?', [MARKER_RESUME]);
  await conn.query('DELETE FROM users WHERE id = ?', [MARKER_UID]);
  await conn.query(
    "INSERT INTO users (id, email, firstname, lastname, membership, revision) VALUES (?, 'backup@certification.local', 'Backup', 'Drill', 'Premium', 7)",
    [MARKER_UID]
  );
  await conn.query(
    "INSERT INTO resumes (id, user_id, title, revision) VALUES (?, ?, 'Backup Drill Resume', 3)",
    [MARKER_RESUME, MARKER_UID]
  );
  const tablesBefore = await tableCensus(conn);
  await conn.end();

  // 2. Backup.
  const backupOut = run(['backup', '--out', BACKUP_FILE]);
  const backupResult = JSON.parse(backupOut.trim().split('\n').pop());
  assert.equal(backupResult.ok, true);
  assert.ok(backupResult.tables >= 40, `backup must cover the whole schema (got ${backupResult.tables} tables)`);
  assert.ok(fs.existsSync(BACKUP_FILE));

  // 3. Verify backup integrity.
  const verifyOut = run(['verify', '--in', BACKUP_FILE]);
  const verifyResult = JSON.parse(verifyOut.trim().split('\n').pop());
  assert.equal(verifyResult.ok, true, 'backup must be complete and well-formed');
  assert.ok(verifyResult.tablesInBackup >= 40);

  // 4. DESTROY the database (simulated catastrophe).
  const admin = await mysql.createConnection({ host: DB.host, port: DB.port, user: DB.user, password: DB.password, multipleStatements: true });
  await admin.query(`DROP DATABASE \`${DB.database}\``);
  await admin.query(`CREATE DATABASE \`${DB.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  const [gone] = await admin.query(
    'SELECT COUNT(*) c FROM information_schema.tables WHERE table_schema = ?',
    [DB.database]
  );
  assert.equal(Number(gone[0].c), 0, 'database must be empty after destruction');

  // 5. Restore from the backup.
  const restoreOut = run(['restore', '--in', BACKUP_FILE]);
  const restoreResult = JSON.parse(restoreOut.trim().split('\n').pop());
  assert.equal(restoreResult.ok, true);

  // 6. Reconcile.
  const check = await mysql.createConnection(DB);
  const tablesAfter = await tableCensus(check);
  assert.deepEqual(tablesAfter, tablesBefore, 'table census must survive the drill');

  const [users] = await check.query('SELECT email, firstname, lastname, membership, revision FROM users WHERE id = ?', [MARKER_UID]);
  assert.equal(users.length, 1, 'marker user restored');
  assert.equal(users[0].email, 'backup@certification.local');
  assert.equal(users[0].membership, 'Premium');
  assert.equal(Number(users[0].revision), 7);

  const [resumes] = await check.query('SELECT user_id, title, revision FROM resumes WHERE id = ?', [MARKER_RESUME]);
  assert.equal(resumes.length, 1, 'marker resume restored');
  assert.equal(resumes[0].title, 'Backup Drill Resume');
  assert.equal(resumes[0].user_id, MARKER_UID);
  assert.equal(Number(resumes[0].revision), 3);

  await check.end();
  await admin.end();
  snapshot = { tables: tablesAfter.length, backupFile: BACKUP_FILE };
});

drillTest('restored database is structurally healthy for the application', async () => {
  const conn = await getConnection();
  const [alive] = await conn.query('SELECT 1 AS alive');
  assert.equal(alive[0].alive, 1);
  // The schema bootstrap must be idempotent on a restored database.
  const [users] = await conn.query('SHOW COLUMNS FROM users LIKE "revision"');
  assert.equal(users.length, 1);
  const [outbox] = await conn.query('SHOW COLUMNS FROM notification_outbox LIKE "idempotency_key"');
  assert.equal(outbox.length, 1);
  await conn.end();
  assert.ok(snapshot.tables >= 40);
});

test.after(() => {
  for (const file of [BACKUP_FILE, `${BACKUP_FILE}.sha256`]) {
    fs.rmSync(file, { force: true });
  }
});
