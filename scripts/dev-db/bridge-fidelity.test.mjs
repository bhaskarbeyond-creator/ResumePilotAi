/**
 * Fidelity checks for the MariaDB sandbox bridge, exercised through the
 * backend's own mysql2 driver with the backend's pool options. These prove the
 * bridge behaves like a MariaDB server on the points the backend depends on.
 *
 *   node --test scripts/dev-db/bridge-fidelity.test.mjs
 *
 * Requires a running bridge (BRIDGE_PORT, default 3306). The lock-timeout test
 * starts a second, short-timeout bridge on BRIDGE_TIMEOUT_PORT (default 3317)
 * with a throw-away data directory.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const backendRequire = createRequire(path.join(repoRoot, 'backend', 'package.json'));
const mysql = backendRequire('mysql2/promise');

const PORT = Number(process.env.BRIDGE_PORT || 3306);
const DB = 'airesume_test';
const poolOptions = { host: '127.0.0.1', port: PORT, user: 'root', password: '', database: DB, charset: 'utf8mb4', timezone: 'Z', connectionLimit: 4, multipleStatements: false };
let pool;

before(async () => {
  pool = mysql.createPool(poolOptions);
  await pool.query('DROP TABLE IF EXISTS bridge_fidelity');
  await pool.query('DROP TABLE IF EXISTS bridge_fidelity_nk');
  await pool.query(`CREATE TABLE bridge_fidelity (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(190) NOT NULL UNIQUE,
    payload JSON CHECK (json_valid(payload)),
    amount DECIMAL(10,2) NULL,
    flag TINYINT(1) NOT NULL DEFAULT 0,
    blob_value BLOB NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    note TEXT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await pool.query('CREATE TABLE bridge_fidelity_nk (code CHAR(8) PRIMARY KEY, label VARCHAR(40)) ENGINE=InnoDB');
});

after(async () => {
  await pool?.query('DROP TABLE IF EXISTS bridge_fidelity').catch(() => {});
  await pool?.query('DROP TABLE IF EXISTS bridge_fidelity_nk').catch(() => {});
  await pool?.end();
});

test('reports a MariaDB server version and UTC session time zone', async () => {
  const [[row]] = await pool.query('SELECT VERSION() AS version, @@session.time_zone AS tz');
  assert.match(row.version, /MariaDB/);
  assert.equal(row.tz, '+00:00');
});

test('INSERT returns insertId/affectedRows like mysql_insert_id()', async () => {
  const [result] = await pool.query('INSERT INTO bridge_fidelity (email, payload, amount, flag, blob_value, created_at, note) VALUES (?, ?, ?, ?, ?, ?, ?)', [
    'a@example.test', JSON.stringify({ a: 1 }), '12.50', 1, Buffer.from([1, 2, 3]), new Date('2026-01-02T03:04:05.678Z'), 'héllo 🚀',
  ]);
  assert.equal(result.affectedRows, 1);
  assert.ok(result.insertId > 0);
  const [plain] = await pool.query('INSERT INTO bridge_fidelity_nk (code, label) VALUES (?, ?)', ['ABCDEFGH', 'x']);
  assert.equal(plain.insertId, 0, 'no AUTO_INCREMENT value generated -> insertId 0');
});

test('SELECT values are parsed by mysql2 exactly as from a real server', async () => {
  const [[row]] = await pool.query('SELECT * FROM bridge_fidelity WHERE email = ?', ['a@example.test']);
  assert.equal(typeof row.id, 'number');
  assert.equal(row.payload, '{"a":1}', 'MariaDB JSON is LONGTEXT -> string');
  assert.equal(row.amount, '12.50', 'DECIMAL stays a string');
  assert.equal(row.flag, 1);
  assert.ok(Buffer.isBuffer(row.blob_value));
  assert.deepEqual([...row.blob_value], [1, 2, 3]);
  assert.ok(row.created_at instanceof Date);
  assert.equal(row.created_at.toISOString(), '2026-01-02T03:04:05.678Z');
  assert.equal(row.note, 'héllo 🚀');
});

test('UPDATE follows CLIENT_FOUND_ROWS: matched rows in affectedRows, changes in changedRows', async () => {
  const [same] = await pool.query('UPDATE bridge_fidelity SET flag = ? WHERE email = ?', [1, 'a@example.test']);
  assert.equal(same.affectedRows, 1);
  assert.equal(same.changedRows, 0);
  const [changed] = await pool.query('UPDATE bridge_fidelity SET flag = ? WHERE email = ?', [0, 'a@example.test']);
  assert.equal(changed.affectedRows, 1);
  assert.equal(changed.changedRows, 1);
  const [none] = await pool.query('UPDATE bridge_fidelity SET flag = 1 WHERE email = ?', ['missing@example.test']);
  assert.equal(none.affectedRows, 0);
  const [aliased] = await pool.query('UPDATE bridge_fidelity bf SET bf.note = bf.note WHERE bf.email IN (?) ORDER BY bf.id LIMIT 1', [['a@example.test', 'b@example.test']]);
  assert.equal(aliased.affectedRows, 1);
});

test('object/array placeholders and NULL round-trip through client-side formatting', async () => {
  await pool.query('INSERT INTO bridge_fidelity SET ?', { email: 'b@example.test', payload: null, amount: null, flag: 0 });
  const [rows] = await pool.query('SELECT email, payload, amount FROM bridge_fidelity WHERE email IN (?) ORDER BY email', [['a@example.test', 'b@example.test']]);
  assert.deepEqual(rows.map(r => r.email), ['a@example.test', 'b@example.test']);
  assert.equal(rows[1].payload, null);
  assert.equal(rows[1].amount, null);
});

test('server errors map to the usual mysql2 error codes with real SQLSTATE', async () => {
  await assert.rejects(pool.query('INSERT INTO bridge_fidelity (email) VALUES (?)', ['a@example.test']), err => err.code === 'ER_DUP_ENTRY' && err.errno === 1062 && err.sqlState === '23000');
  await assert.rejects(pool.query('INSERT INTO bridge_fidelity (email, payload) VALUES (?, ?)', ['c@example.test', 'not json']), err => err.errno === 4025);
  await assert.rejects(pool.query('SELECT * FROM no_such_table_here'), err => err.code === 'ER_NO_SUCH_TABLE' && err.sqlState === '42S02');
  await assert.rejects(pool.query('SELEC 1'), err => err.code === 'ER_PARSE_ERROR');
});

test('an open transaction isolates other connections until COMMIT', async () => {
  const a = await pool.getConnection();
  const b = await pool.getConnection();
  try {
    await a.beginTransaction();
    await a.query('INSERT INTO bridge_fidelity (email) VALUES (?)', ['tx@example.test']);
    let bDone = false;
    const reader = b.query('SELECT COUNT(*) AS n FROM bridge_fidelity WHERE email = ?', ['tx@example.test']).then(([rows]) => { bDone = true; return rows[0].n; });
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.equal(bDone, false, 'other connection must not observe the session while a transaction is open');
    await a.commit();
    assert.equal(await reader, 1);
  } finally {
    a.release();
    b.release();
  }
});

test('ROLLBACK discards writes, and a dropped connection rolls back implicitly', async () => {
  const a = await pool.getConnection();
  await a.beginTransaction();
  await a.query('INSERT INTO bridge_fidelity (email) VALUES (?)', ['rollback@example.test']);
  await a.rollback();
  a.release();
  const [[afterRollback]] = await pool.query('SELECT COUNT(*) AS n FROM bridge_fidelity WHERE email = ?', ['rollback@example.test']);
  assert.equal(afterRollback.n, 0);

  const raw = await mysql.createConnection(poolOptions);
  await raw.beginTransaction();
  await raw.query('INSERT INTO bridge_fidelity (email) VALUES (?)', ['dropped@example.test']);
  raw.destroy();
  const [[afterDrop]] = await pool.query('SELECT COUNT(*) AS n FROM bridge_fidelity WHERE email = ?', ['dropped@example.test']);
  assert.equal(afterDrop.n, 0);
});

test('a waiter behind a stuck transaction receives ER_LOCK_WAIT_TIMEOUT', async () => {
  const port = Number(process.env.BRIDGE_TIMEOUT_PORT || 3317);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-timeout-'));
  const child = spawn(process.execPath, [path.join(here, 'mariadb-sandbox-bridge.mjs')], {
    env: { ...process.env, BRIDGE_PORT: String(port), BRIDGE_DATA_DIR: dataDir, BRIDGE_LOCK_WAIT_MS: '400', BRIDGE_DATABASES: DB },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout bridge did not start')), 30_000);
      child.stdout.on('data', chunk => { if (String(chunk).includes('listening')) { clearTimeout(timer); resolve(); } });
      child.on('exit', code => reject(new Error(`timeout bridge exited ${code}`)));
    });
    const options = { ...poolOptions, port };
    const holder = await mysql.createConnection(options);
    const waiter = await mysql.createConnection(options);
    await holder.query('CREATE TABLE IF NOT EXISTS t (id INT PRIMARY KEY) ENGINE=InnoDB');
    await holder.beginTransaction();
    await holder.query('INSERT INTO t VALUES (1)');
    await assert.rejects(waiter.query('SELECT COUNT(*) FROM t'), err => err.code === 'ER_LOCK_WAIT_TIMEOUT' && err.errno === 1205);
    await holder.rollback();
    const [[row]] = await waiter.query('SELECT COUNT(*) AS n FROM t');
    assert.equal(row.n, 0);
    await holder.end();
    await waiter.end();
  } finally {
    child.kill('SIGTERM');
    await new Promise(resolve => child.once('exit', resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
