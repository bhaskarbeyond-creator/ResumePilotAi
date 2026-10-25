'use strict';

/**
 * FreeLLMAPI Durable Metrics & Cooldown Persistence
 *
 * Uses Node 22's built-in `node:sqlite` (zero external dependencies, zero
 * native compilation) so provider latency, request counts and cooldown expiry
 * survive a Node restart on Hostinger shared hosting / XAMPP.
 *
 * If `node:sqlite` is unavailable (Node < 22.5) or the data directory is not
 * writable, the store degrades to an in-memory Map with the identical API:
 * routing keeps working, it simply forgets between restarts.
 *
 * Schema (data/freellm_metrics.db):
 *   provider_metrics   one row per (provider, model): counters + latency
 *   provider_cooldowns one row per (provider, model): expiry + reason
 *   request_log        bounded ring of the most recent attempts
 */

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_DB_RELATIVE = path.join('data', 'freellm_metrics.db');
const MAX_LOG_ROWS = 5000;
const MAX_SAMPLES = 200;

function repoRoot() {
  // backend/freellmapi/services -> repository root
  return path.resolve(__dirname, '..', '..', '..');
}

function resolveDatabasePath(environment = process.env) {
  const configured = String(environment.FREELMAPI_METRICS_DB || '').trim();
  if (configured === ':memory:') return ':memory:';
  if (configured) return path.resolve(configured);
  return path.join(repoRoot(), DEFAULT_DB_RELATIVE);
}

/**
 * Load `node:sqlite` without leaking Node's experimental-feature warning into
 * the test/build logs. Any failure (missing module, disabled flag) is a normal
 * fallback condition, not an error.
 */
function loadSqliteModule() {
  if (process.env.FREELMAPI_DISABLE_SQLITE === '1') return null;
  const originalEmitWarning = process.emitWarning;
  process.emitWarning = function filteredEmitWarning(warning, ...rest) {
    const text = typeof warning === 'string' ? warning : warning?.message;
    if (text && /SQLite is an experimental feature/i.test(text)) return;
    return originalEmitWarning.call(process, warning, ...rest);
  };
  try {
    return require('node:sqlite');
  } catch {
    return null;
  } finally {
    process.emitWarning = originalEmitWarning;
  }
}

function percentile(sortedNumbers, ratio) {
  if (sortedNumbers.length === 0) return 0;
  const index = Math.min(sortedNumbers.length - 1, Math.max(0, Math.ceil(sortedNumbers.length * ratio) - 1));
  return sortedNumbers[index];
}

class MetricsPersistence {
  constructor({ environment = process.env } = {}) {
    this.environment = environment;
    this.path = resolveDatabasePath(environment);
    this.backend = 'memory';
    this.db = null;
    this.error = null;
    this.samples = new Map(); // "provider\u0000model" -> number[] (bounded)
    this.memoryRequests = new Map();
    this.memoryCooldowns = new Map();
    this.memoryLog = [];
    this._open();
  }

  _open() {
    if (this.path === ':memory:') {
      this.backend = 'memory';
      return;
    }
    const sqlite = loadSqliteModule();
    if (!sqlite || typeof sqlite.DatabaseSync !== 'function') {
      this.backend = 'memory';
      this.error = 'node:sqlite unavailable';
      return;
    }
    try {
      fs.mkdirSync(path.dirname(this.path), { recursive: true });
      const db = new sqlite.DatabaseSync(this.path);
      db.exec('PRAGMA journal_mode = WAL;');
      db.exec('PRAGMA synchronous = NORMAL;');
      db.exec(`
        CREATE TABLE IF NOT EXISTS provider_metrics (
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
        CREATE TABLE IF NOT EXISTS provider_cooldowns (
          provider TEXT NOT NULL,
          model TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          reason TEXT,
          strikes INTEGER NOT NULL DEFAULT 1,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (provider, model)
        );
        CREATE TABLE IF NOT EXISTS request_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          provider TEXT,
          model TEXT,
          ok INTEGER NOT NULL,
          status INTEGER,
          latency_ms INTEGER,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_request_log_created ON request_log (created_at);
      `);
      this.db = db;
      this.backend = 'sqlite';
    } catch (error) {
      this.db = null;
      this.backend = 'memory';
      this.error = error.message;
    }
  }

  _key(provider, model) {
    return `${String(provider || '').toLowerCase()}\u0000${String(model || '')}`;
  }

  _sample(key, latencyMs) {
    if (!Number.isFinite(latencyMs) || latencyMs < 0) return [];
    const bucket = this.samples.get(key) || [];
    bucket.push(Math.round(latencyMs));
    if (bucket.length > MAX_SAMPLES) bucket.splice(0, bucket.length - MAX_SAMPLES);
    this.samples.set(key, bucket);
    return bucket;
  }

  recordRequest({ provider, model, ok = true, latencyMs = 0, status = null, at = Date.now() } = {}) {
    const p = String(provider || 'unknown').toLowerCase();
    const m = String(model || '');
    const key = this._key(p, m);
    const latency = Number.isFinite(latencyMs) ? Math.max(0, Math.round(latencyMs)) : 0;
    const samples = this._sample(key, latency);
    const p95 = percentile([...samples].sort((a, b) => a - b), 0.95);

    if (!this.db) {
      const row = this.memoryRequests.get(key) || {
        provider: p, model: m, requests: 0, successes: 0, failures: 0,
        totalLatencyMs: 0, lastLatencyMs: 0, lastStatus: null, p95LatencyMs: 0, updatedAt: at,
      };
      row.requests += 1;
      if (ok) row.successes += 1; else row.failures += 1;
      row.totalLatencyMs += latency;
      row.lastLatencyMs = latency;
      row.lastStatus = status;
      row.p95LatencyMs = p95;
      row.updatedAt = at;
      this.memoryRequests.set(key, row);
      this.memoryLog.push({ provider: p, model: m, ok, status, latencyMs: latency, createdAt: at });
      if (this.memoryLog.length > MAX_LOG_ROWS) this.memoryLog.splice(0, this.memoryLog.length - MAX_LOG_ROWS);
      return { backend: 'memory', provider: p, model: m };
    }

    try {
      this.db.prepare(`
        INSERT INTO provider_metrics
          (provider, model, requests, successes, failures, total_latency_ms, last_latency_ms, last_status, p95_latency_ms, updated_at)
        VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(provider, model) DO UPDATE SET
          requests = requests + 1,
          successes = successes + excluded.successes,
          failures = failures + excluded.failures,
          total_latency_ms = total_latency_ms + excluded.total_latency_ms,
          last_latency_ms = excluded.last_latency_ms,
          last_status = excluded.last_status,
          p95_latency_ms = excluded.p95_latency_ms,
          updated_at = excluded.updated_at
      `).run(p, m, ok ? 1 : 0, ok ? 0 : 1, latency, latency, status, p95, at);
      this.db.prepare('INSERT INTO request_log (provider, model, ok, status, latency_ms, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(p, m, ok ? 1 : 0, status, latency, at);
      if (Math.random() < 0.01) {
        this.db.prepare('DELETE FROM request_log WHERE id <= (SELECT MAX(id) - ? FROM request_log)').run(MAX_LOG_ROWS);
      }
    } catch (error) {
      this.error = error.message;
    }
    return { backend: 'sqlite', provider: p, model: m };
  }

  recordCooldown({ provider, model = '', expiresAt, reason = '', strikes = 1, at = Date.now() } = {}) {
    const p = String(provider || '').toLowerCase();
    const m = String(model || '');
    const key = this._key(p, m);
    if (!this.db) {
      this.memoryCooldowns.set(key, { provider: p, model: m, expiresAt, reason, strikes, updatedAt: at });
      return { backend: 'memory' };
    }
    try {
      this.db.prepare(`
        INSERT INTO provider_cooldowns (provider, model, expires_at, reason, strikes, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(provider, model) DO UPDATE SET
          expires_at = excluded.expires_at,
          reason = excluded.reason,
          strikes = excluded.strikes,
          updated_at = excluded.updated_at
      `).run(p, m, expiresAt, reason, strikes, at);
    } catch (error) {
      this.error = error.message;
    }
    return { backend: this.backend };
  }

  clearCooldown({ provider, model = '' } = {}) {
    const p = String(provider || '').toLowerCase();
    const key = this._key(p, model);
    if (!this.db) {
      this.memoryCooldowns.delete(key);
      return;
    }
    try {
      this.db.prepare('DELETE FROM provider_cooldowns WHERE provider = ? AND model = ?').run(p, String(model || ''));
    } catch (error) {
      this.error = error.message;
    }
  }

  clearAllCooldowns() {
    if (!this.db) {
      this.memoryCooldowns.clear();
      return;
    }
    try { this.db.prepare('DELETE FROM provider_cooldowns').run(); } catch (error) { this.error = error.message; }
  }

  loadCooldowns({ now = Date.now() } = {}) {
    if (!this.db) {
      return [...this.memoryCooldowns.values()]
        .filter(row => row.expiresAt > now)
        .map(row => ({ ...row }));
    }
    try {
      return this.db.prepare('SELECT provider, model, expires_at, reason, strikes, updated_at FROM provider_cooldowns WHERE expires_at > ?')
        .all(now)
        .map(row => ({
          provider: row.provider,
          model: row.model,
          expiresAt: Number(row.expires_at),
          reason: row.reason,
          strikes: Number(row.strikes),
          updatedAt: Number(row.updated_at),
        }));
    } catch (error) {
      this.error = error.message;
      return [];
    }
  }

  getProviderMetrics({ limit = 100 } = {}) {
    if (!this.db) {
      return [...this.memoryRequests.values()]
        .sort((a, b) => b.requests - a.requests)
        .slice(0, limit)
        .map(row => ({
          ...row,
          avgLatencyMs: row.requests > 0 ? Math.round(row.totalLatencyMs / row.requests) : 0,
        }));
    }
    try {
      return this.db.prepare(`
        SELECT provider, model, requests, successes, failures, total_latency_ms, last_latency_ms,
               last_status, p95_latency_ms, updated_at
        FROM provider_metrics ORDER BY requests DESC LIMIT ?
      `).all(limit).map(row => ({
        provider: row.provider,
        model: row.model,
        requests: Number(row.requests),
        successes: Number(row.successes),
        failures: Number(row.failures),
        totalLatencyMs: Number(row.total_latency_ms),
        lastLatencyMs: Number(row.last_latency_ms),
        lastStatus: row.last_status === null ? null : Number(row.last_status),
        p95LatencyMs: Number(row.p95_latency_ms),
        updatedAt: Number(row.updated_at),
        avgLatencyMs: Number(row.requests) > 0 ? Math.round(Number(row.total_latency_ms) / Number(row.requests)) : 0,
      }));
    } catch (error) {
      this.error = error.message;
      return [];
    }
  }

  getRecentRequests({ limit = 50 } = {}) {
    if (!this.db) return this.memoryLog.slice(-limit).reverse();
    try {
      return this.db.prepare('SELECT provider, model, ok, status, latency_ms, created_at FROM request_log ORDER BY id DESC LIMIT ?')
        .all(limit)
        .map(row => ({
          provider: row.provider,
          model: row.model,
          ok: Boolean(row.ok),
          status: row.status === null ? null : Number(row.status),
          latencyMs: Number(row.latency_ms),
          createdAt: Number(row.created_at),
        }));
    } catch (error) {
      this.error = error.message;
      return [];
    }
  }

  /**
   * F-07: windowed rollups per (provider, model) from the request log — the
   * rolling aggregate selectors must use instead of a single last row. One
   * lucky/blip sample must not reroute the next 30 minutes of traffic.
   * Returns newest-window rows aggregated as:
   *   { provider, model, n, successes, failures,
   *     lastAt, lastOk, lastStatus, lastLatencyMs,   // circuit-breaker input
   *     successSamples: [{ latencyMs, createdAt }] } // newest-first, capped
   * Selectors compute the weighted p50 from successSamples; the last
   * observation is used ONLY as a circuit-breaker input.
   */
  getRollingAggregates({ windowMs = 30 * 60_000, limit = 500, maxSamples = 10, now = Date.now() } = {}) {
    const cutoff = Number(now) - Math.max(1000, Number(windowMs) || 0);
    const rowLimit = Math.max(1, Number(limit) || 500);
    const sampleCap = Math.max(1, Number(maxSamples) || 10);
    let rows;
    if (!this.db) {
      rows = this.memoryLog.filter(row => Number(row.createdAt) >= cutoff).slice(-rowLimit).reverse();
    } else {
      try {
        rows = this.db.prepare('SELECT provider, model, ok, status, latency_ms, created_at FROM request_log WHERE created_at >= ? ORDER BY id DESC LIMIT ?')
          .all(cutoff, rowLimit)
          .map(row => ({
            provider: row.provider,
            model: row.model,
            ok: Boolean(row.ok),
            status: row.status === null ? null : Number(row.status),
            latencyMs: Number(row.latency_ms),
            createdAt: Number(row.created_at),
          }));
      } catch (error) {
        this.error = error.message;
        return [];
      }
    }
    // Sort defensively: both backends are newest-first by insertion order, but
    // out-of-order timestamps (clock skew, backfilled rows) must not corrupt
    // the circuit-breaker "last" fields.
    rows.sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
    const byKey = new Map();
    for (const row of rows) { // newest-first
      const key = this._key(row.provider, row.model);
      const aggregate = byKey.get(key) || {
        provider: row.provider,
        model: row.model,
        n: 0,
        successes: 0,
        failures: 0,
        lastAt: row.createdAt,
        lastOk: row.ok,
        lastStatus: row.status,
        lastLatencyMs: row.latencyMs,
        successSamples: [],
      };
      aggregate.n += 1;
      if (row.ok) {
        aggregate.successes += 1;
        if (aggregate.successSamples.length < sampleCap) {
          aggregate.successSamples.push({ latencyMs: row.latencyMs, createdAt: row.createdAt });
        }
      } else {
        aggregate.failures += 1;
      }
      byKey.set(key, aggregate);
    }
    return [...byKey.values()];
  }

  getSummary({ now = Date.now() } = {}) {
    const metrics = this.getProviderMetrics();
    const cooldowns = this.loadCooldowns({ now });
    return {
      backend: this.backend,
      path: this.path === ':memory:' ? ':memory:' : this.path,
      providersTracked: metrics.length,
      requests: metrics.reduce((sum, row) => sum + row.requests, 0),
      failures: metrics.reduce((sum, row) => sum + row.failures, 0),
      activeCooldowns: cooldowns.length,
      error: this.error,
    };
  }

  reset() {
    this.samples.clear();
    this.memoryRequests.clear();
    this.memoryCooldowns.clear();
    this.memoryLog.length = 0;
    if (!this.db) return;
    try {
      this.db.exec('DELETE FROM provider_metrics; DELETE FROM provider_cooldowns; DELETE FROM request_log;');
    } catch (error) {
      this.error = error.message;
    }
  }

  clearAllMetrics() {
    if (!this.db) {
      this.memoryRequests.clear();
      this.memoryLog = [];
      this.memoryCooldowns.clear();
      return;
    }
    try {
      this.db.prepare('DELETE FROM provider_metrics').run();
      this.db.prepare('DELETE FROM request_log').run();
      this.db.prepare('DELETE FROM provider_cooldowns').run();
    } catch (error) {
      this.error = error.message;
    }
  }

  close() {
    if (!this.db) return;
    try { this.db.close(); } catch { /* already closed */ }
    this.db = null;
    this.backend = 'memory';
  }
}

let defaultStore = null;

function getMetricsPersistence(options) {
  if (!defaultStore) defaultStore = new MetricsPersistence(options);
  return defaultStore;
}

function resetMetricsPersistenceForTests() {
  if (defaultStore) {
    try { defaultStore.clearAllMetrics(); } catch { /* ignore */ }
    try { defaultStore.close(); } catch { /* ignore */ }
  }
  defaultStore = null;
}

module.exports = {
  MetricsPersistence,
  getMetricsPersistence,
  resetMetricsPersistenceForTests,
  resolveDatabasePath,
  loadSqliteModule,
  MAX_LOG_ROWS,
};
