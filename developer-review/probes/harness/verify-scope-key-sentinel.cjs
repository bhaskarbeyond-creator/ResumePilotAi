#!/usr/bin/env node
/*
 * R15 scope_key sentinel verification (continuation-note requirement).
 *
 * Question: do pre-existing (legacy) rows read back as scope_key='platform'
 * (schema-proposal §3.1: TEXT NOT NULL DEFAULT 'platform'; blast-radius §4:
 * "byte-identical by construction") or as NULL?
 *
 * Method: build a FRESH database file with the exact LEGACY (pre-A.1) shapes
 * of all three scoped tables — provider_metrics, provider_cooldowns,
 * request_log — seed rows WITHOUT any scope_key column, then open it through
 * the REAL MetricsPersistence (backend/freellmapi/services/persistence.js) so
 * the PRAGMA-guarded one-transaction migration runs, and print
 *   SELECT scope_key, COUNT(*) FROM <table> GROUP BY scope_key;
 * for each table, plus the NOT NULL / DEFAULT facts from table_info.
 *
 * Read path note: the engine's own scoped reads filter WHERE scope_key = ?
 * with the literal 'platform' for platform scope (persistence.js
 * getRollingAggregates / cooldown hydration / request-log ring) — if legacy
 * rows came back NULL those filters would MISS them and platform behaviour
 * would change; the query output below is the evidence that they do not.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { MetricsPersistence, loadSqliteModule } = require('../../../backend/freellmapi/services/persistence');

const NOW = Date.now();
const file = process.env.SCOPE_KEY_VERIFY_DB || path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'scope-key-verify-')), 'legacy-seed.db');
fs.rmSync(file, { force: true });

const sqlite = loadSqliteModule();
if (!sqlite) { console.error('node:sqlite unavailable — cannot run this verification'); process.exit(2); }

// ---- seed the three LEGACY shapes (no scope_key anywhere) -----------------
const db = new sqlite.DatabaseSync(file);
db.exec(`
  CREATE TABLE provider_metrics (
    provider TEXT NOT NULL, model TEXT NOT NULL,
    requests INTEGER NOT NULL DEFAULT 0, successes INTEGER NOT NULL DEFAULT 0,
    failures INTEGER NOT NULL DEFAULT 0, total_latency_ms INTEGER NOT NULL DEFAULT 0,
    last_latency_ms INTEGER NOT NULL DEFAULT 0, last_status INTEGER,
    p95_latency_ms INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL,
    PRIMARY KEY (provider, model)
  );
  CREATE TABLE provider_cooldowns (
    provider TEXT NOT NULL, model TEXT NOT NULL,
    expires_at INTEGER NOT NULL, reason TEXT,
    strikes INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL,
    PRIMARY KEY (provider, model)
  );
  CREATE TABLE request_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT, model TEXT, ok INTEGER NOT NULL, status INTEGER,
    latency_ms INTEGER, prompt_tokens INTEGER, completion_tokens INTEGER,
    created_at INTEGER NOT NULL
  );
`);
db.prepare('INSERT INTO provider_metrics (provider, model, requests, successes, failures, total_latency_ms, last_latency_ms, last_status, p95_latency_ms, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
  .run('groq', 'm1', 7, 6, 1, 700, 100, 200, 150, NOW - 60000);
db.prepare('INSERT INTO provider_metrics (provider, model, requests, successes, failures, total_latency_ms, last_latency_ms, last_status, p95_latency_ms, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
  .run('openrouter', 'm2', 3, 3, 0, 900, 300, 200, 300, NOW - 30000);
db.prepare('INSERT INTO provider_cooldowns (provider, model, expires_at, reason, strikes, updated_at) VALUES (?,?,?,?,?,?)')
  .run('groq', 'm1', NOW + 60000, 'legacy bench', 2, NOW - 1000);
db.prepare('INSERT INTO request_log (provider, model, ok, status, latency_ms, prompt_tokens, completion_tokens, created_at) VALUES (?,?,?,?,?,?,?,?)')
  .run('groq', 'm1', 1, 200, 120, 10, 20, NOW - 5000);
db.prepare('INSERT INTO request_log (provider, model, ok, status, latency_ms, prompt_tokens, completion_tokens, created_at) VALUES (?,?,?,?,?,?,?,?)')
  .run('openai', 'm3', 0, 500, 90, null, null, NOW - 4000);
db.close();

// ---- open through the REAL persistence (runs the guarded migration) -------
const store = new MetricsPersistence({ environment: { FREELMAPI_METRICS_DB: file } });
console.log(JSON.stringify({ backend: store.backend, scopedSchema: store.scopedSchema, error: store.error ? String(store.error.message || store.error) : null, file }));

const raw = new sqlite.DatabaseSync(file);
for (const table of ['provider_metrics', 'provider_cooldowns', 'request_log']) {
  const groups = raw.prepare(`SELECT scope_key, COUNT(*) AS n FROM ${table} GROUP BY scope_key`).all();
  const info = raw.prepare(`PRAGMA table_info(${table})`).all().find(c => c.name === 'scope_key');
  console.log(JSON.stringify({
    table,
    groupByScopeKey: groups,
    columnFacts: info ? { notnull: info.notnull, dflt_value: info.dflt_value } : 'MISSING',
  }));
}
// The engine's platform-scope read filters, verbatim behaviour:
const filtered = raw.prepare("SELECT COUNT(*) AS n FROM provider_metrics WHERE scope_key = 'platform'").get();
console.log(JSON.stringify({ platformLiteralFilterSeesAllLegacyMetricsRows: filtered.n }));
raw.close();
process.exit(0);
