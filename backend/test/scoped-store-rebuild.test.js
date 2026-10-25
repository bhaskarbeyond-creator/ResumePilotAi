'use strict';

/**
 * PH4-ENGINE-021 Phase A — scoped-store rebuild drills (migration-plan §4 A1–A4,
 * automated). Real file-backed `node:sqlite` stores: a LEGACY-shaped database
 * is seeded, opened with the new code, and the guarded in-place rebuild must
 * run exactly once — preservation-copy semantics (every legacy row lands
 * verbatim in the 'platform' scope), restart-idempotent, integrity-checked,
 * and reversible by the mandatory `.bak` file restore.
 *
 * Hermetic: temp-dir files only, no MariaDB, no network, no timers.
 * Zero console.*, zero waitForTimeout, deterministic timestamps.
 */

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { MetricsPersistence, loadSqliteModule } = require('../freellmapi/services/persistence');

const NOW = 1_761_500_000_000;

function tempDbFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-rebuild-'));
  return { dir, file: path.join(dir, 'metrics.db') };
}

function seedLegacyDb(file, rows) {
  const sqlite = loadSqliteModule();
  assert.ok(sqlite, 'node:sqlite must be available for this drill');
  const db = new sqlite.DatabaseSync(file);
  db.exec(`
    CREATE TABLE provider_metrics (
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      requests INTEGER NOT NULL DEFAULT 0,
      successes INTEGER NOT NULL DEFAULT 0,
      failures INTEGER NOT NULL DEFAULT 0,
      total_latency_ms INTEGER NOT NULL DEFAULT 0,
      last_latency_ms INTEGER NOT NULL DEFAULT 0,
      last_status INTEGER,
      p95_latency_ms INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (provider, model)
    );
  `);
  const insert = db.prepare('INSERT INTO provider_metrics (provider, model, requests, successes, failures, total_latency_ms, last_latency_ms, last_status, p95_latency_ms, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (const row of rows) {
    insert.run(row.provider, row.model, row.requests, row.successes, row.failures, row.totalLatencyMs, row.lastLatencyMs, row.lastStatus, row.p95LatencyMs, row.updatedAt);
  }
  db.close();
}

const LEGACY_ROWS = [
  { provider: 'groq', model: 'm1', requests: 7, successes: 6, failures: 1, totalLatencyMs: 700, lastLatencyMs: 100, lastStatus: 200, p95LatencyMs: 150, updatedAt: NOW - 60_000 },
  { provider: 'openrouter', model: 'm2', requests: 3, successes: 3, failures: 0, totalLatencyMs: 900, lastLatencyMs: 300, lastStatus: 200, p95LatencyMs: 300, updatedAt: NOW - 30_000 },
];

test('A1: legacy file DB rebuilds once — row parity, platform scope, counters verbatim, integrity ok', () => {
  const { dir, file } = tempDbFile();
  try {
    seedLegacyDb(file, LEGACY_ROWS);
    const store = new MetricsPersistence({ environment: { FREELMAPI_METRICS_DB: file } });
    assert.equal(store.backend, 'sqlite');
    assert.equal(store.scopedSchema, true, 'the guarded rebuild must succeed');
    assert.equal(store.error, null);
    const rows = store.getProviderMetrics({ limit: 10 });
    assert.equal(rows.length, LEGACY_ROWS.length, 'rebuild preserves every legacy row');
    for (const row of rows) assert.equal(row.scopeKey, 'platform', 'legacy rows land verbatim in the platform scope');
    const groq = rows.find(row => row.provider === 'groq');
    assert.equal(groq.requests, 7);
    assert.equal(groq.successes, 6);
    assert.equal(groq.failures, 1);
    assert.equal(groq.totalLatencyMs, 700);
    assert.equal(groq.lastStatus, 200);
    assert.equal(groq.p95LatencyMs, 150);
    assert.equal(groq.updatedAt, NOW - 60_000);
    const sqlite = loadSqliteModule();
    const raw = new sqlite.DatabaseSync(file);
    const integrity = raw.prepare('PRAGMA integrity_check').get();
    assert.equal(String(Object.values(integrity)[0]), 'ok');
    const columns = raw.prepare('PRAGMA table_info(provider_metrics)').all().map(column => column.name);
    assert.ok(columns.includes('scope_key'));
    const leftover = raw.prepare("SELECT name FROM sqlite_master WHERE name = 'provider_metrics_v2'").all();
    assert.equal(leftover.length, 0, 'the v2 scaffold must not survive the rebuild');
    raw.close();
    store.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('A2: rebuild is restart-idempotent — three reopens, counts stable, no double-apply', () => {
  const { dir, file } = tempDbFile();
  try {
    seedLegacyDb(file, LEGACY_ROWS);
    const first = new MetricsPersistence({ environment: { FREELMAPI_METRICS_DB: file } });
    first.recordRequest({ provider: 'groq', model: 'm1', ok: true, latencyMs: 80, status: 200, at: NOW });
    first.close();
    for (let reopen = 0; reopen < 3; reopen += 1) {
      const store = new MetricsPersistence({ environment: { FREELMAPI_METRICS_DB: file } });
      assert.equal(store.scopedSchema, true);
      assert.equal(store.error, null);
      const rows = store.getProviderMetrics({ limit: 10 });
      assert.equal(rows.length, 2, `reopen ${reopen + 1}: row count is stable`);
      const groq = rows.find(row => row.provider === 'groq');
      assert.equal(groq.requests, 8, `reopen ${reopen + 1}: counters are stable (no re-copied rows)`);
      store.close();
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('A3: scoped writes are isolated — tenant rows never touch platform counters', () => {
  const { dir, file } = tempDbFile();
  try {
    seedLegacyDb(file, LEGACY_ROWS);
    const store = new MetricsPersistence({ environment: { FREELMAPI_METRICS_DB: file } });
    const platformBefore = store.getProviderMetrics({ scopeKey: 'platform' }).find(row => row.provider === 'groq');
    store.recordRequest({ provider: 'groq', model: 'm1', ok: false, latencyMs: 5, status: 429, at: NOW, scopeKey: 'tenant:t1' });
    store.recordRequest({ provider: 'groq', model: 'm1', ok: false, latencyMs: 6, status: 429, at: NOW + 1, scopeKey: 'tenant:t1' });
    const platformAfter = store.getProviderMetrics({ scopeKey: 'platform' }).find(row => row.provider === 'groq');
    assert.deepEqual(
      { requests: platformAfter.requests, failures: platformAfter.failures, lastStatus: platformAfter.lastStatus },
      { requests: platformBefore.requests, failures: platformBefore.failures, lastStatus: platformBefore.lastStatus },
      'tenant-scope failures are invisible to the platform row'
    );
    const tenant = store.getProviderMetrics({ scopeKey: 'tenant:t1' });
    assert.equal(tenant.length, 1);
    assert.equal(tenant[0].requests, 2);
    assert.equal(tenant[0].failures, 2);
    assert.equal(tenant[0].lastStatus, 429);
    assert.equal(store.getProviderMetrics({ scopeKey: 'tenant:unknown' }).length, 0);
    assert.equal(store.getProviderMetrics().length, 3, 'null scope returns every scope (platform rows + tenant row)');
    store.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('A4: .bak-restore rollback drill — pre-open copy returns the store to its snapshot', () => {
  const { dir, file } = tempDbFile();
  try {
    seedLegacyDb(file, LEGACY_ROWS);
    const bak = `${file}.pre-A.bak`;
    fs.copyFileSync(file, bak); // the mandatory pre-step (migration-plan §4 A1)
    const store = new MetricsPersistence({ environment: { FREELMAPI_METRICS_DB: file } });
    assert.equal(store.scopedSchema, true);
    store.recordRequest({ provider: 'groq', model: 'm1', ok: true, latencyMs: 10, status: 200, at: NOW, scopeKey: 'tenant:t9' });
    assert.equal(store.getProviderMetrics().length, 3);
    store.close();
    fs.copyFileSync(bak, file); // rollback = restore the .bak
    const restored = new MetricsPersistence({ environment: { FREELMAPI_METRICS_DB: file } });
    assert.equal(restored.backend, 'sqlite', 'the restored file is healthy');
    assert.equal(restored.scopedSchema, true, 'the .bak was taken pre-open; the rebuild simply runs again');
    const rows = restored.getProviderMetrics({ limit: 10 });
    assert.equal(rows.length, LEGACY_ROWS.length, 'snapshot counts returned');
    assert.equal(rows.find(row => row.provider === 'groq').requests, 7);
    assert.equal(restored.getProviderMetrics({ scopeKey: 'tenant:t9' }).length, 0, 'post-snapshot scoped writes are gone with the restore');
    restored.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('A5: fresh database (no legacy file) opens directly in the scoped shape', () => {
  const { dir, file } = tempDbFile();
  try {
    const store = new MetricsPersistence({ environment: { FREELMAPI_METRICS_DB: file } });
    assert.equal(store.backend, 'sqlite');
    assert.equal(store.scopedSchema, true);
    assert.equal(store.error, null);
    store.recordRequest({ provider: 'groq', model: 'm1', ok: true, latencyMs: 42, status: 200, at: NOW });
    store.recordRequest({ provider: 'groq', model: 'm1', ok: true, latencyMs: 44, status: 200, at: NOW + 1, scopeKey: 'uid:abc123' });
    const all = store.getProviderMetrics({ limit: 10 });
    assert.equal(all.length, 2);
    assert.deepEqual(all.map(row => row.scopeKey).sort(), ['platform', 'uid:abc123']);
    store.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('A6: memory backend is scope-native — parity with the sqlite contract', () => {
  const store = new MetricsPersistence({ environment: { FREELMAPI_METRICS_DB: ':memory:' } });
  assert.equal(store.backend, 'memory');
  assert.equal(store.scopedSchema, true);
  store.recordRequest({ provider: 'groq', model: 'm1', ok: true, latencyMs: 10, status: 200, at: NOW });
  store.recordRequest({ provider: 'groq', model: 'm1', ok: false, latencyMs: 11, status: 500, at: NOW + 1, scopeKey: 'tenant:t1' });
  const platform = store.getProviderMetrics({ scopeKey: 'platform' });
  assert.equal(platform.length, 1);
  assert.equal(platform[0].requests, 1);
  assert.equal(platform[0].failures, 0);
  const tenant = store.getProviderMetrics({ scopeKey: 'tenant:t1' });
  assert.equal(tenant.length, 1);
  assert.equal(tenant[0].failures, 1);
  store.close();
});

test('A7: platform aggregate values are byte-equal to the pre-021 contract', () => {
  const store = new MetricsPersistence({ environment: { FREELMAPI_METRICS_DB: ':memory:' } });
  for (let i = 0; i < 5; i += 1) {
    store.recordRequest({ provider: 'groq', model: 'm1', ok: i !== 3, latencyMs: 100 + i, status: i === 3 ? 500 : 200, at: NOW + i });
  }
  const row = store.getProviderMetrics({ scopeKey: 'platform' })[0];
  assert.equal(row.requests, 5);
  assert.equal(row.successes, 4);
  assert.equal(row.failures, 1);
  assert.equal(row.totalLatencyMs, 510);
  assert.equal(row.lastLatencyMs, 104);
  assert.equal(row.lastStatus, 200);
  assert.equal(row.avgLatencyMs, 102);
  store.close();
});

test('A8: scoped reset wipes exactly one scope (C.4 seam, persistence half)', () => {
  const { dir, file } = tempDbFile();
  try {
    const store = new MetricsPersistence({ environment: { FREELMAPI_METRICS_DB: file } });
    store.recordRequest({ provider: 'groq', model: 'm1', ok: true, latencyMs: 10, status: 200, at: NOW });
    store.recordRequest({ provider: 'groq', model: 'm1', ok: true, latencyMs: 10, status: 200, at: NOW, scopeKey: 'tenant:t1' });
    store.recordRequest({ provider: 'groq', model: 'm1', ok: true, latencyMs: 10, status: 200, at: NOW, scopeKey: 'tenant:t2' });
    store.reset({ scopeKey: 'tenant:t1' });
    const remaining = store.getProviderMetrics({ limit: 10 }).map(row => row.scopeKey).sort();
    assert.deepEqual(remaining, ['platform', 'tenant:t2'], 'the platform row and the other tenant survive');
    store.reset();
    assert.equal(store.getProviderMetrics({ limit: 10 }).length, 0, 'null scope keeps the legacy full-wipe behaviour');
    store.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
