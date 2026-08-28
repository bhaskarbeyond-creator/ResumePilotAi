/**
 * DATABASE FAILURE INJECTION (mission §8, §12)
 *
 * Physical + controlled failure scenarios against the real stack:
 *
 *   A. MySQL completely unavailable at boot   → degrades, never fabricates
 *   B. Failure mid-transaction                → rollback, controlled error
 *   C. Connection dies during commit          → controlled error, no partial ack
 *   D. Deadlock                               → repository retry resolves it
 *   E. Connection starvation (pool limit 1)   → requests queue, all succeed,
 *                                                nothing fabricated
 *   G. MySQL restarted while app stays up     → app survives the outage window
 *   H. MySQL returns after outage             → readiness + writes recover
 *                                                WITHOUT restarting the app
 *
 * Evidence: .arena/evidence/db-failure-injection.json
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadCertificationDatabase } from './helpers/databaseConfig.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EVIDENCE = path.join(ROOT, '.arena', 'evidence');
fs.mkdirSync(EVIDENCE, { recursive: true });

const MYSQL_DIR = path.resolve(process.env.CERT_MARIADB_BASEDIR || path.join(os.homedir(), '.cache', 'resumepilot-mariadb'));
const MYSQLD = path.resolve(process.env.CERT_MARIADB_SERVER_BINARY || path.join(MYSQL_DIR, 'bin', 'mariadbd'));
const DB = loadCertificationDatabase();
const DESTRUCTIVE_RESTART_ENABLED = process.env.RUN_DESTRUCTIVE_MARIADB_RESTART_DRILL === 'true';
const destructiveTest = DESTRUCTIVE_RESTART_ENABLED ? test : test.skip;
const mysql = require(path.join(ROOT, 'backend', 'node_modules', 'mysql2', 'promise'));

const log = [];
const record = (scenario, detail) => { log.push({ t: new Date().toISOString(), scenario, ...detail }); };

function mysqldArgs() {
  const dataDir = process.env.CERT_MARIADB_DATADIR;
  if (!dataDir) throw new Error('CERT_MARIADB_DATADIR is required for the destructive restart drill');
  const runtimeDir = path.resolve(process.env.CERT_MARIADB_RUNTIME_DIR || path.join(os.tmpdir(), 'resumepilot-mariadb-cert'));
  fs.mkdirSync(runtimeDir, { recursive: true });
  return [
    '--no-defaults',
    `--user=${os.userInfo().username}`,
    `--basedir=${MYSQL_DIR}`,
    `--datadir=${path.resolve(dataDir)}`,
    `--tmpdir=${runtimeDir}`,
    `--socket=${path.join(runtimeDir, 'mariadb.sock')}`,
    `--pid-file=${path.join(runtimeDir, 'mariadb.pid')}`,
    `--port=${DB.port}`,
    `--bind-address=${DB.host}`,
    '--skip-name-resolve',
  ];
}

async function mysqlUp(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const c = await mysql.createConnection({ ...DB, connectTimeout: 2000 });
      await c.query('SELECT 1');
      await c.end();
      return true;
    } catch (_e) { await new Promise(r => setTimeout(r, 400)); }
  }
  return false;
}

let managedServer = null;

function verifiedServerPid() {
  const raw = managedServer?.pid || process.env.CERT_MARIADB_SERVER_PID;
  const pid = Number(raw);
  if (!Number.isInteger(pid) || pid < 2) {
    throw new Error('CERT_MARIADB_SERVER_PID must identify the isolated server used by the destructive restart drill');
  }
  if (process.platform !== 'win32') {
    const executable = fs.realpathSync(`/proc/${pid}/exe`);
    if (!/(?:mariadbd|mysqld)$/.test(executable)) {
      throw new Error(`Refusing to signal non-MariaDB process ${pid}: ${executable}`);
    }
  }
  return pid;
}

async function stopMysqld() {
  const pid = verifiedServerPid();
  process.kill(pid, 'SIGTERM');
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (!(await mysqlUp(500))) return;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Isolated MariaDB process ${pid} did not stop after SIGTERM`);
}

function startMysqld() {
  if (!fs.existsSync(MYSQLD)) {
    throw new Error(`CERT_MARIADB_SERVER_BINARY does not exist: ${MYSQLD}`);
  }
  managedServer = spawn(MYSQLD, mysqldArgs(), { stdio: 'ignore' });
  return managedServer;
}

async function ensureMysqldRunning() {
  if (await mysqlUp(1_000)) return true;
  startMysqld();
  return mysqlUp(15_000);
}

// ─── Scenario A: MySQL unavailable at boot ────────────────────────────────
test('A. app boots degraded with MySQL down; no fabricated data', async () => {
  const { bootServer, certToken } = await import('./helpers/bootServer.mjs');
  const server = await bootServer({ port: 8321, db: { ...DB, port: '3399' }, timeoutMs: 45000 }); // dead port
  try {
    const health = await fetch('http://127.0.0.1:8321/healthz').then(r => r.json());
    assert.equal(health.status, 'ok', 'liveness survives');
    const ready = await fetch('http://127.0.0.1:8321/readyz');
    assert.equal(ready.status, 503, 'readiness must fail honestly');
    const token = certToken({ uid: 'fi-a', email: 'fi-a@cert.local', role: 'USER' });
    const reads = await fetch('http://127.0.0.1:8321/api/resumes', { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(reads.status, 503, 'reads degrade with controlled 503');
    const body = await reads.json();
    assert.equal(body.success, false);
    assert.ok(['DATABASE_UNAVAILABLE', 'SERVICE_DEGRADED', 'SERVICE_UNAVAILABLE'].includes(body.code), `controlled code, got ${body.code}`);
    record('A', { boot: 'degraded', readyz: 503, readStatus: reads.status, code: body.code });
  } finally {
    await server.stop();
  }
});

// ─── Scenario B/C: mid-transaction & commit-time failures (repository level) ──
test('B/C. transaction failure mid-way rolls back; nothing acknowledged', async () => {
  // Controlled injection: a repository whose connection dies during commit.
  const ResilientRepository = require(path.join(ROOT, 'backend', 'repositories', 'ResilientRepository.js'));
  let commitAttempted = false;
  const failingMysqlRepo = {
    async saveUser() {
      commitAttempted = true;
      const err = new Error('Connection lost during commit (injected)');
      err.code = 'PROTOCOL_CONNECTION_LOST';
      throw err;
    },
    async getUser() { return null; },
  };
  const repo = new ResilientRepository({ mysqlRepo: failingMysqlRepo });
  await assert.rejects(
    () => repo.saveUser('fi-bc', { firstname: 'X' }),
    (err) => err.status === 503 || err.code === 'DATABASE_UNAVAILABLE',
    'commit failure must surface as controlled unavailability'
  );
  assert.equal(commitAttempted, true);
  record('B/C', { injected: 'PROTOCOL_CONNECTION_LOST at commit', outcome: 'controlled 503, no fabricated success' });
});

// ─── Scenario D: real deadlock resolved by repository retry ───────────────
test('D. deadlock under concurrent cross-updates resolves without data loss', async () => {
  assert.ok(await mysqlUp(), 'the explicitly configured disposable MariaDB must be running');
  const conn1 = await mysql.createConnection(DB);
  const conn2 = await mysql.createConnection(DB);
  await conn1.query("CREATE TABLE IF NOT EXISTS deadlock_probe (id INT PRIMARY KEY, v INT) ENGINE=InnoDB");
  await conn1.query('REPLACE INTO deadlock_probe (id, v) VALUES (1, 0), (2, 0)');

  // Two transactions locking rows 1 and 2 in opposite order → one deadlocks.
  const tx = async (conn, first, second) => {
    await conn.beginTransaction();
    await conn.query(`SELECT v FROM deadlock_probe WHERE id = ${first} FOR UPDATE`);
    await new Promise(r => setTimeout(r, 120));
    await conn.query(`SELECT v FROM deadlock_probe WHERE id = ${second} FOR UPDATE`);
    await conn.query(`UPDATE deadlock_probe SET v = v + 1 WHERE id = ${first}`);
    await conn.commit();
  };
  const results = await Promise.allSettled([tx(conn1, 1, 2), tx(conn2, 2, 1)]);
  const deadlockHit = results.some(r => r.status === 'rejected' && /deadlock/i.test(String(r.reason?.message)));
  await conn1.end(); await conn2.end();
  assert.ok(deadlockHit, 'the injection must actually produce a deadlock');

  // The repository layer retries deadlocks: simulate the same contention through
  // MySQLRepository._withTransaction by running concurrent saves on one resume.
  const MySQLRepository = require(path.join(ROOT, 'backend', 'repositories', 'MySQLRepository.js'));
  const repo = new MySQLRepository();
  const uid = 'fi-deadlock-user';
  await repo.saveUser(uid, { firstname: 'D', email: 'd@cert.local' }).catch(() => {});
  const concurrent = await Promise.allSettled(Array.from({ length: 6 }, (_, i) =>
    repo.saveResume(uid, 'fi_deadlock_resume', { title: `T${i}`, summary: `S${i}` })));
  const okCount = concurrent.filter(r => r.status === 'fulfilled').length;
  assert.ok(okCount >= 5, `concurrent saves should survive contention (ok=${okCount})`);
  const final = await repo.getResume(uid, 'fi_deadlock_resume');
  assert.ok(final && /^T\d$/.test(final.title), 'final state consistent');
  record('D', { deadlockReproduced: true, concurrentSavesOk: okCount, finalTitle: final.title });
});

// ─── Scenario E: connection starvation — queuing, no fabrication ──────────
test('E. single-connection pool serializes a burst without fabricating results', async () => {
  assert.ok(await mysqlUp(), 'the explicitly configured disposable MariaDB must be running');
  const tiny = mysql.createPool({ ...DB, connectionLimit: 1, waitForConnections: true, queueLimit: 0 });
  const startedAt = Date.now();
  const results = await Promise.all(Array.from({ length: 12 }, (_, i) =>
    tiny.query('SELECT SLEEP(0.05) AS s, ? AS i', [i]).then(([rows]) => rows[0].i)));
  const wallMs = Date.now() - startedAt;
  assert.equal(results.length, 12);
  assert.ok(wallMs >= 12 * 50 * 0.8, `requests must serialize through the single connection (took ${wallMs}ms)`);
  await tiny.end();
  record('E', { burst: 12, wallMs, outcome: 'all queued requests returned real results; none fabricated' });
});

// ─── Scenarios G/H: MySQL restarted while the app stays up ────────────────
destructiveTest('G/H. app survives a MariaDB restart; readiness and writes recover without app restart', async () => {
  assert.ok(await mysqlUp(), 'the isolated MariaDB must be running before the restart drill');
  verifiedServerPid();
  const { bootServer, certToken } = await import('./helpers/bootServer.mjs');
  const server = await bootServer({ port: 8322, db: DB, timeoutMs: 45000 });
  const token = certToken({ uid: 'fi-gh', email: 'fi-gh@cert.local', role: 'USER' });
  const base = 'http://127.0.0.1:8322';
  try {
    // Healthy baseline
    let ready = await fetch(`${base}/readyz`).then(r => r.json());
    assert.equal(ready.status, 'ready', 'baseline ready');
    // Provision the account row first (resumes.user_id is FK-bound to users.id).
    const profile = await fetch(`${base}/api/users-data/profile`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ email: 'fi-gh@cert.local', firstname: 'Fail', lastname: 'Over' }),
    });
    assert.equal(profile.status, 200, 'baseline profile write works');
    let save = await fetch(`${base}/api/resumes/fi_gh_resume`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: 'Before outage' }),
    });
    assert.equal(save.status, 200, 'baseline write works');

    // G: kill MySQL under the running app
    await stopMysqld();
    const downReads = await fetch(`${base}/api/resumes`, { headers: { Authorization: `Bearer ${token}` } });
    const downBody = await downReads.json();
    console.log('[G debug] outage read status:', downReads.status, 'body:', JSON.stringify(downBody).slice(0, 200));
    assert.equal(downReads.status, 503, `requests degrade during the outage (got ${downReads.status}: ${JSON.stringify(downBody).slice(0, 150)})`);
    assert.equal(downBody.success, false, 'no fabricated reads during outage');
    const downReady = await fetch(`${base}/readyz`).then(r => r.json());
    assert.equal(downReady.status, 'not_ready', 'readiness reflects the outage');
    record('G', { appRestarted: false, readStatusDuringOutage: downReads.status, readyDuringOutage: downReady.status });

    // H: restart MySQL; the SAME app process must recover
    assert.ok(await ensureMysqldRunning(), 'mysql restarted');
    let recovered = false;
    for (let i = 0; i < 30; i++) {
      const r = await fetch(`${base}/api/resumes`, { headers: { Authorization: `Bearer ${token}` } });
      if (r.status === 200) { recovered = true; break; }
      await new Promise(res => setTimeout(res, 1000));
    }
    assert.ok(recovered, 'app recovered reads without restart');
    const afterWrite = await fetch(`${base}/api/resumes/fi_gh_resume`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: 'After recovery' }),
    });
    assert.equal(afterWrite.status, 200, 'writes recover without restart');
    const afterReady = await fetch(`${base}/readyz`).then(r => r.json());
    assert.equal(afterReady.status, 'ready', 'readiness recovers');
    record('H', { recoveredWithoutAppRestart: true, writeAfterRecovery: afterWrite.status, readyAfter: afterReady.status });
  } finally {
    await server.stop();
  }
});

test.after(async () => {
  // Restore only the isolated server that this opt-in drill was authorized to
  // restart; never discover or signal unrelated database processes.
  if (DESTRUCTIVE_RESTART_ENABLED && !(await mysqlUp(1_000))) {
    await ensureMysqldRunning();
  }
  fs.writeFileSync(path.join(EVIDENCE, 'db-failure-injection.json'), JSON.stringify(log, null, 2));
});
