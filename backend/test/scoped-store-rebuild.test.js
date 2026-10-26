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

// ── A.2: provider_cooldowns scoped rebuild + credential_kind ─────────────────

function seedLegacyCooldowns(file, rows) {
  const sqlite = loadSqliteModule();
  const db = new sqlite.DatabaseSync(file);
  db.exec(`
    CREATE TABLE IF NOT EXISTS provider_cooldowns (
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      reason TEXT,
      strikes INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (provider, model)
    );
  `);
  const insert = db.prepare('INSERT INTO provider_cooldowns (provider, model, expires_at, reason, strikes, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
  for (const row of rows) insert.run(row.provider, row.model, row.expiresAt, row.reason, row.strikes, row.updatedAt);
  db.close();
}

test('B1: legacy cooldown rows rebuild verbatim into the platform scope with credential_kind=platform', () => {
  const { dir, file } = tempDbFile();
  try {
    seedLegacyCooldowns(file, [
      { provider: 'groq', model: 'm1', expiresAt: NOW + 60_000, reason: 'HTTP 429 across all pooled keys', strikes: 2, updatedAt: NOW - 1000 },
    ]);
    const store = new MetricsPersistence({ environment: { FREELMAPI_METRICS_DB: file } });
    assert.equal(store.scopedSchema, true);
    assert.equal(store.error, null);
    const rows = store.loadCooldowns({ now: NOW });
    assert.equal(rows.length, 1, 'the legacy cooldown survives the rebuild');
    assert.equal(rows[0].scopeKey, 'platform');
    assert.equal(rows[0].credentialKind, 'platform', 'pre-021 cooldowns were platform-credential cooldowns by definition');
    assert.equal(rows[0].strikes, 2);
    assert.equal(rows[0].expiresAt, NOW + 60_000);
    assert.equal(rows[0].reason, 'HTTP 429 across all pooled keys');
    const sqlite = loadSqliteModule();
    const raw = new sqlite.DatabaseSync(file);
    const leftover = raw.prepare("SELECT name FROM sqlite_master WHERE name = 'provider_cooldowns_v2'").all();
    assert.equal(leftover.length, 0);
    const integrity = raw.prepare('PRAGMA integrity_check').get();
    assert.equal(String(Object.values(integrity)[0]), 'ok');
    raw.close();
    store.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('B2: both legacy tables rebuild in one open — mixed metrics+cooldowns parity', () => {
  const { dir, file } = tempDbFile();
  try {
    seedLegacyDb(file, LEGACY_ROWS);
    seedLegacyCooldowns(file, [
      { provider: 'openrouter', model: '', expiresAt: NOW + 30_000, reason: 'Provider unavailable', strikes: 1, updatedAt: NOW - 500 },
    ]);
    const store = new MetricsPersistence({ environment: { FREELMAPI_METRICS_DB: file } });
    assert.equal(store.scopedSchema, true);
    assert.equal(store.getProviderMetrics({ limit: 10 }).length, LEGACY_ROWS.length);
    assert.equal(store.loadCooldowns({ now: NOW }).length, 1);
    store.close();
    const reopened = new MetricsPersistence({ environment: { FREELMAPI_METRICS_DB: file } });
    assert.equal(reopened.scopedSchema, true, 'second open is a no-op (PRAGMA guards)');
    assert.equal(reopened.getProviderMetrics({ limit: 10 }).length, LEGACY_ROWS.length);
    assert.equal(reopened.loadCooldowns({ now: NOW }).length, 1);
    reopened.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('B3: scoped cooldown isolation — tenant row never touches platform, scoped clear never clears platform (F-14 persistence half)', () => {
  const { dir, file } = tempDbFile();
  try {
    const store = new MetricsPersistence({ environment: { FREELMAPI_METRICS_DB: file } });
    store.recordCooldown({ provider: 'groq', model: 'm1', expiresAt: NOW + 60_000, reason: 'HTTP 429 across all pooled keys', strikes: 1, at: NOW });
    store.recordCooldown({ provider: 'groq', model: 'm1', expiresAt: NOW + 30_000, reason: 'tenant byok 429', strikes: 1, at: NOW, scopeKey: 'tenant:t1', credentialKind: 'byok' });
    store.recordCooldown({ provider: 'groq', model: 'm1', expiresAt: NOW + 45_000, reason: 'tenant-penalty', strikes: 3, at: NOW, scopeKey: 'tenant:t2', credentialKind: 'tenant-penalty' });
    assert.equal(store.loadCooldowns({ now: NOW }).length, 3);
    assert.equal(store.loadCooldowns({ now: NOW, scopeKey: 'platform' }).length, 1);
    const tenant1 = store.loadCooldowns({ now: NOW, scopeKey: 'tenant:t1' });
    assert.equal(tenant1.length, 1);
    assert.equal(tenant1[0].credentialKind, 'byok');
    // F-14 rule at the store level: a tenant-scoped clear must never remove the platform row.
    store.clearCooldown({ provider: 'groq', model: 'm1', scopeKey: 'tenant:t1' });
    assert.equal(store.loadCooldowns({ now: NOW, scopeKey: 'tenant:t1' }).length, 0);
    assert.equal(store.loadCooldowns({ now: NOW, scopeKey: 'platform' }).length, 1, 'the platform cooldown survives a tenant release');
    assert.equal(store.loadCooldowns({ now: NOW, scopeKey: 'tenant:t2' }).length, 1, 'the other tenant is untouched too');
    // Scoped wipe (C.4 seam): platform-only reset keeps tenant rows.
    store.clearAllCooldowns({ scopeKey: 'platform' });
    assert.equal(store.loadCooldowns({ now: NOW, scopeKey: 'platform' }).length, 0);
    assert.equal(store.loadCooldowns({ now: NOW }).length, 1, 'tenant:t2 penalty row survives the platform wipe');
    store.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('B4: expiry filter composes with scope filter', () => {
  const { dir, file } = tempDbFile();
  try {
    const store = new MetricsPersistence({ environment: { FREELMAPI_METRICS_DB: file } });
    store.recordCooldown({ provider: 'groq', model: '', expiresAt: NOW - 1, reason: 'expired tenant', at: NOW - 1000, scopeKey: 'tenant:t1', credentialKind: 'byok' });
    store.recordCooldown({ provider: 'groq', model: '', expiresAt: NOW + 60_000, reason: 'active platform', at: NOW });
    assert.equal(store.loadCooldowns({ now: NOW }).length, 1, 'the expired tenant row is filtered');
    assert.equal(store.loadCooldowns({ now: NOW, scopeKey: 'tenant:t1' }).length, 0);
    assert.equal(store.loadCooldowns({ now: NOW - 2 }).length, 2, 'both rows are active in the past frame');
    store.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('B5: memory backend cooldown scoping parity', () => {
  const store = new MetricsPersistence({ environment: { FREELMAPI_METRICS_DB: ':memory:' } });
  store.recordCooldown({ provider: 'groq', model: 'm1', expiresAt: NOW + 60_000, reason: 'platform 429', at: NOW });
  store.recordCooldown({ provider: 'groq', model: 'm1', expiresAt: NOW + 60_000, reason: 'byok 429', at: NOW, scopeKey: 'uid:hash1', credentialKind: 'byok' });
  assert.equal(store.loadCooldowns({ now: NOW }).length, 2);
  assert.equal(store.loadCooldowns({ now: NOW, scopeKey: 'platform' }).length, 1);
  assert.equal(store.loadCooldowns({ now: NOW, scopeKey: 'uid:hash1' })[0].credentialKind, 'byok');
  store.clearCooldown({ provider: 'groq', model: 'm1', scopeKey: 'uid:hash1' });
  assert.equal(store.loadCooldowns({ now: NOW, scopeKey: 'platform' }).length, 1, 'scoped clear leaves the platform row');
  store.close();
});

// ── A.3: request_log additive ALTER (F-18 precedent) + scoped window reads ───

function seedLegacyRequestLog(file, rows) {
  const sqlite = loadSqliteModule();
  const db = new sqlite.DatabaseSync(file);
  db.exec(`
    CREATE TABLE IF NOT EXISTS request_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT,
      model TEXT,
      ok INTEGER NOT NULL,
      status INTEGER,
      latency_ms INTEGER,
      prompt_tokens INTEGER,
      completion_tokens INTEGER,
      created_at INTEGER NOT NULL
    );
  `);
  const insert = db.prepare('INSERT INTO request_log (provider, model, ok, status, latency_ms, prompt_tokens, completion_tokens, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  for (const row of rows) insert.run(row.provider, row.model, row.ok ? 1 : 0, row.status, row.latencyMs, row.promptTokens ?? null, row.completionTokens ?? null, row.createdAt);
  db.close();
}

test('C1: legacy ring gains scope_key + decision_id in place — parity, platform defaults, NULL history, idempotent', () => {
  const { dir, file } = tempDbFile();
  try {
    seedLegacyRequestLog(file, [
      { provider: 'groq', model: 'm1', ok: true, status: 200, latencyMs: 100, promptTokens: 5, completionTokens: 7, createdAt: NOW - 2000 },
      { provider: 'groq', model: 'm1', ok: false, status: 429, latencyMs: 3, createdAt: NOW - 1000 },
      { provider: 'openrouter', model: 'm2', ok: true, status: 200, latencyMs: 300, promptTokens: 1, completionTokens: 2, createdAt: NOW - 500 },
    ]);
    const store = new MetricsPersistence({ environment: { FREELMAPI_METRICS_DB: file } });
    assert.equal(store.scopedSchema, true);
    const recent = store.getRecentRequests({ limit: 10 });
    assert.equal(recent.length, 3, 'the ALTER preserves every ring row');
    for (const row of recent) {
      assert.equal(row.scopeKey, 'platform', 'history defaults to the platform scope');
      assert.equal(row.decisionId, null, 'history has no decision id — NULL, never fabricated');
    }
    assert.equal(recent.find(row => row.status === 429).promptTokens, null, 'F-18 null-when-unknown survives the ALTER');
    const aggregates = store.getRollingAggregates({ windowMs: 30 * 60_000, now: NOW });
    assert.equal(aggregates.find(a => a.provider === 'groq').n, 2, 'windowed reads work over the altered ring');
    store.close();
    const reopened = new MetricsPersistence({ environment: { FREELMAPI_METRICS_DB: file } });
    assert.equal(reopened.scopedSchema, true, 'reopen is a no-op (PRAGMA guard)');
    assert.equal(reopened.getRecentRequests({ limit: 10 }).length, 3);
    reopened.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('C2: aggregates are scope-isolated — the platform window never sees tenant rows and vice versa', () => {
  const { dir, file } = tempDbFile();
  try {
    const store = new MetricsPersistence({ environment: { FREELMAPI_METRICS_DB: file } });
    store.recordRequest({ provider: 'groq', model: 'm1', ok: true, latencyMs: 100, status: 200, at: NOW - 3000 });
    store.recordRequest({ provider: 'groq', model: 'm1', ok: true, latencyMs: 110, status: 200, at: NOW - 2000 });
    store.recordRequest({ provider: 'groq', model: 'm1', ok: false, latencyMs: 5, status: 429, at: NOW - 1000, scopeKey: 'tenant:t1' });
    store.recordRequest({ provider: 'groq', model: 'm1', ok: true, latencyMs: 900, status: 200, at: NOW - 500, scopeKey: 'tenant:t1' });
    const platform = store.getRollingAggregates({ windowMs: 30 * 60_000, now: NOW });
    assert.equal(platform.length, 1);
    assert.equal(platform[0].n, 2, 'the tenant failure/success are invisible to the platform window');
    assert.equal(platform[0].failures, 0);
    assert.equal(platform[0].scopeKey, 'platform');
    const tenant = store.getRollingAggregates({ windowMs: 30 * 60_000, now: NOW, scopeKey: 'tenant:t1' });
    assert.equal(tenant.length, 1);
    assert.equal(tenant[0].n, 2);
    assert.equal(tenant[0].failures, 1);
    assert.equal(tenant[0].scopeKey, 'tenant:t1');
    assert.equal(store.getRollingAggregates({ windowMs: 30 * 60_000, now: NOW, scopeKey: 'tenant:other' }).length, 0);
    store.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('C3: sample cap applies within a scope — tenant volume never evicts platform samples', () => {
  const store = new MetricsPersistence({ environment: { FREELMAPI_METRICS_DB: ':memory:' } });
  for (let i = 0; i < 4; i += 1) {
    store.recordRequest({ provider: 'groq', model: 'm1', ok: true, latencyMs: 100 + i, status: 200, at: NOW + i });
  }
  for (let i = 0; i < 12; i += 1) {
    store.recordRequest({ provider: 'groq', model: 'm1', ok: true, latencyMs: 900 + i, status: 200, at: NOW + 100 + i, scopeKey: 'tenant:t1' });
  }
  const platform = store.getRollingAggregates({ windowMs: 30 * 60_000, now: NOW + 10_000, maxSamples: 10 })[0];
  assert.equal(platform.n, 4);
  assert.equal(platform.successSamples.length, 4, 'platform samples intact despite tenant volume');
  assert.ok(platform.successSamples.every(sample => sample.latencyMs < 200), 'no tenant latency leaked into the platform window');
  const tenant = store.getRollingAggregates({ windowMs: 30 * 60_000, now: NOW + 10_000, maxSamples: 10, scopeKey: 'tenant:t1' })[0];
  assert.equal(tenant.n, 12);
  assert.equal(tenant.successSamples.length, 10, 'the cap applies within the tenant scope too');
  store.close();
});

test('C4: decision_id round-trip through the ring, scoped reads', () => {
  const { dir, file } = tempDbFile();
  try {
    const store = new MetricsPersistence({ environment: { FREELMAPI_METRICS_DB: file } });
    store.recordRequest({ provider: 'groq', model: 'm1', ok: true, latencyMs: 10, status: 200, at: NOW, decisionId: 'd-0001' });
    store.recordRequest({ provider: 'groq', model: 'm1', ok: true, latencyMs: 11, status: 200, at: NOW + 1, scopeKey: 'tenant:t1', decisionId: 'd-0002' });
    store.recordRequest({ provider: 'groq', model: 'm1', ok: true, latencyMs: 12, status: 200, at: NOW + 2 });
    const all = store.getRecentRequests({ limit: 10 });
    assert.deepEqual(all.map(row => row.decisionId).sort(), ['d-0001', 'd-0002', null].sort());
    const tenantRows = store.getRecentRequests({ limit: 10, scopeKey: 'tenant:t1' });
    assert.equal(tenantRows.length, 1);
    assert.equal(tenantRows[0].decisionId, 'd-0002');
    store.reset({ scopeKey: 'tenant:t1' });
    assert.equal(store.getRecentRequests({ limit: 10, scopeKey: 'tenant:t1' }).length, 0);
    assert.equal(store.getRecentRequests({ limit: 10, scopeKey: 'platform' }).length, 2, 'the scoped ring wipe never touches platform rows');
    store.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── A.4: routing_decisions ring (schema-proposal 3.4) ───────────────────────

const DECISION_COLUMNS = ['decision_id', 'created_at', 'scope_key', 'mode', 'requested_model', 'chosen_provider', 'chosen_model', 'exploration', 'quality_evidence', 'observed_latency_ms', 'observation_count', 'outcome', 'status', 'latency_ms', 'prompt_tokens', 'completion_tokens'];

test('D1: routing_decisions exists after open with the exact proposed shape + indexes + integrity ok', () => {
  const { dir, file } = tempDbFile();
  try {
    const store = new MetricsPersistence({ environment: { FREELMAPI_METRICS_DB: file } });
    assert.equal(store.scopedSchema, true);
    const sqlite = loadSqliteModule();
    const raw = new sqlite.DatabaseSync(file);
    const columns = raw.prepare('PRAGMA table_info(routing_decisions)').all().map(column => column.name);
    assert.deepEqual(columns, DECISION_COLUMNS);
    const indexes = raw.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'routing_decisions'").all().map(row => row.name);
    assert.ok(indexes.includes('idx_routing_decisions_created'));
    assert.ok(indexes.includes('idx_routing_decisions_scope'));
    const integrity = raw.prepare('PRAGMA integrity_check').get();
    assert.equal(String(Object.values(integrity)[0]), 'ok');
    raw.close();
    store.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('D2: recordDecision round-trip — NULL-when-unknown, no fabricated values, missing id records nothing', () => {
  const { dir, file } = tempDbFile();
  try {
    const store = new MetricsPersistence({ environment: { FREELMAPI_METRICS_DB: file } });
    const result = store.recordDecision({
      decisionId: 'dec-0001',
      createdAt: NOW,
      mode: 'auto',
      requestedModel: 'gpt-fixture',
      chosenProvider: 'groq',
      chosenModel: 'gpt-fixture',
      exploration: 'cold-start',
      qualityEvidence: 'unknown',
      observedLatencyMs: null,
      observationCount: 0,
      outcome: 'success',
      status: 200,
      latencyMs: 123,
      promptTokens: null,
      completionTokens: null,
    });
    assert.equal(result.recorded, true);
    const rows = store.getRecentDecisions({ limit: 10 });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].decisionId, 'dec-0001');
    assert.equal(rows[0].scopeKey, 'platform');
    assert.equal(rows[0].exploration, 'cold-start');
    assert.equal(rows[0].observedLatencyMs, null, 'unknown latency stays NULL — never 0');
    assert.equal(rows[0].promptTokens, null, 'unknown tokens stay NULL — never 0');
    assert.equal(rows[0].status, 200);
    const anonymous = store.recordDecision({ outcome: 'success' });
    assert.deepEqual(anonymous, { recorded: false, reason: 'missing-decision-id' });
    assert.equal(store.getRecentDecisions({ limit: 10 }).length, 1, 'an anonymous row is never stored');
    store.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('D3: one decision per request — a repeated decision_id upserts the outcome, never duplicates', () => {
  const { dir, file } = tempDbFile();
  try {
    const store = new MetricsPersistence({ environment: { FREELMAPI_METRICS_DB: file } });
    store.recordDecision({ decisionId: 'dec-fb', createdAt: NOW, outcome: 'failure', status: 429, chosenProvider: 'groq' });
    store.recordDecision({ decisionId: 'dec-fb', createdAt: NOW, outcome: 'fallback', status: 200, chosenProvider: 'openrouter', latencyMs: 900, promptTokens: 10, completionTokens: 20 });
    const rows = store.getRecentDecisions({ limit: 10 });
    assert.equal(rows.length, 1, 'attempts share the decision id — one row per routed request');
    assert.equal(rows[0].outcome, 'fallback');
    assert.equal(rows[0].status, 200);
    assert.equal(rows[0].promptTokens, 10);
    store.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('D4: ring bound — pruneDecisions keeps the newest 5000 deterministically', () => {
  const { dir, file } = tempDbFile();
  try {
    const store = new MetricsPersistence({ environment: { FREELMAPI_METRICS_DB: file } });
    for (let i = 0; i < 5005; i += 1) {
      store.recordDecision({ decisionId: `dec-${String(i).padStart(5, '0')}`, createdAt: NOW + i, outcome: 'success' });
    }
    store.pruneDecisions();
    const sqlite = loadSqliteModule();
    const raw = new sqlite.DatabaseSync(file);
    const count = Number(raw.prepare('SELECT COUNT(*) AS n FROM routing_decisions').get().n);
    assert.equal(count, 5000, 'the ring is bounded at MAX_LOG_ROWS');
    const oldest = raw.prepare('SELECT MIN(created_at) AS oldest FROM routing_decisions').get();
    assert.equal(Number(oldest.oldest), NOW + 5, 'the five oldest rows were pruned');
    raw.close();
    store.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('D5: decision-ring scope filter + scoped reset wipes exactly one scope', () => {
  const { dir, file } = tempDbFile();
  try {
    const store = new MetricsPersistence({ environment: { FREELMAPI_METRICS_DB: file } });
    store.recordDecision({ decisionId: 'dec-p', createdAt: NOW, scopeKey: 'platform', outcome: 'success' });
    store.recordDecision({ decisionId: 'dec-t1', createdAt: NOW + 1, scopeKey: 'tenant:t1', outcome: 'success' });
    store.recordDecision({ decisionId: 'dec-t2', createdAt: NOW + 2, scopeKey: 'tenant:t2', outcome: 'failure' });
    assert.equal(store.getRecentDecisions({ limit: 10 }).length, 3);
    assert.equal(store.getRecentDecisions({ limit: 10, scopeKey: 'tenant:t1' })[0].decisionId, 'dec-t1');
    store.reset({ scopeKey: 'tenant:t1' });
    const remaining = store.getRecentDecisions({ limit: 10 }).map(row => row.decisionId).sort();
    assert.deepEqual(remaining, ['dec-p', 'dec-t2']);
    store.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('D6: memory backend decision-ring parity (bounded, scoped, NULL-honest)', () => {
  const store = new MetricsPersistence({ environment: { FREELMAPI_METRICS_DB: ':memory:' } });
  store.recordDecision({ decisionId: 'dec-m1', createdAt: NOW, outcome: 'success', observedLatencyMs: 100, observationCount: 4 });
  store.recordDecision({ decisionId: 'dec-m2', createdAt: NOW + 1, scopeKey: 'uid:hash1', outcome: 'failure', status: 429 });
  assert.equal(store.getRecentDecisions({ limit: 10 }).length, 2);
  assert.equal(store.getRecentDecisions({ limit: 10, scopeKey: 'platform' })[0].decisionId, 'dec-m1');
  const tenant = store.getRecentDecisions({ limit: 10, scopeKey: 'uid:hash1' })[0];
  assert.equal(tenant.observedLatencyMs, null);
  assert.equal(tenant.status, 429);
  assert.deepEqual(store.recordDecision({}), { recorded: false, reason: 'missing-decision-id' });
  store.clearAllMetrics();
  assert.equal(store.getRecentDecisions({ limit: 10 }).length, 0, 'the full wipe includes the decision ring');
  store.close();
});
