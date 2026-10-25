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
 *   provider_metrics   one row per (provider, model, scope_key): counters + latency
 *   provider_cooldowns one row per (provider, model): expiry + reason
 *   request_log        bounded ring of the most recent attempts
 *
 * PH4-ENGINE-021 (Phase A.1): `scope_key` ('platform' default) is the evidence
 * scope dimension. Legacy DBs are rebuilt in place at open — guarded by
 * PRAGMA table_info, transaction-wrapped, idempotent (F-18 precedent pattern).
 * The rebuild is a preservation copy: every pre-existing row lands verbatim in
 * the 'platform' scope. If the rebuild ever fails the store degrades to the
 * legacy SQL shapes (scopedSchema=false) and keeps serving platform evidence —
 * fail-open on evidence, never on money.
 */

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_DB_RELATIVE = path.join('data', 'freellm_metrics.db');
const MAX_LOG_ROWS = 5000;
const MAX_SAMPLES = 200;
const PLATFORM_SCOPE = 'platform';

function normalizeScopeKey(scopeKey) {
  const text = String(scopeKey === null || scopeKey === undefined ? '' : scopeKey).trim();
  if (!text) return PLATFORM_SCOPE;
  return text.slice(0, 160);
}

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
    this.samples = new Map(); // "scope\u0000provider\u0000model" -> number[] (bounded)
    this.memoryRequests = new Map();
    this.memoryCooldowns = new Map();
    this.memoryLog = [];
    this.scopedSchema = false; // A.1: true once the scoped SQLite shape is in place (or on the memory backend, which is scope-native)
    this._open();
  }

  _open() {
    if (this.path === ':memory:') {
      this.backend = 'memory';
      this.scopedSchema = true; // the in-memory JS contract is scope-native
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
          prompt_tokens INTEGER,
          completion_tokens INTEGER,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_request_log_created ON request_log (created_at);
      `);
      // F-18: metrics DBs created before usage accounting lack the token
      // columns — add them (nullable) in place instead of dropping usage on
      // the floor. This is the engine's own bounded SQLite ring, not the
      // product schema; no MariaDB migration is involved.
      const logColumns = db.prepare('PRAGMA table_info(request_log)').all().map(column => column.name);
      if (!logColumns.includes('prompt_tokens')) db.exec('ALTER TABLE request_log ADD COLUMN prompt_tokens INTEGER');
      if (!logColumns.includes('completion_tokens')) db.exec('ALTER TABLE request_log ADD COLUMN completion_tokens INTEGER');
      this.db = db;
      this.backend = 'sqlite';
      // PH4-ENGINE-021 Phase A.1/A.2: guarded in-place rebuilds to the scoped
      // shapes (provider_metrics A.1, provider_cooldowns A.2). Idempotent
      // (PRAGMA guards), ONE transaction for the whole scoped migration (the
      // capability flag must never describe a half-migrated store),
      // preservation-copy semantics. A failure degrades to the legacy SQL
      // shapes instead of dropping the store.
      try {
        this._migrateScopedSchema(db);
        const integrity = db.prepare('PRAGMA integrity_check').get();
        const integrityOk = String(Object.values(integrity || {})[0] || '') === 'ok';
        this.scopedSchema = integrityOk;
        if (!integrityOk) this.error = 'scoped migration integrity_check failed';
      } catch (error) {
        this.scopedSchema = false;
        this.error = `scoped migration failed: ${error.message}`;
      }
    } catch (error) {
      this.db = null;
      this.backend = 'memory';
      this.error = error.message;
    }
  }

  /**
   * A.1+A.2: the whole scoped migration in ONE transaction — either every
   * table reaches its scoped shape or none does, so `scopedSchema` never
   * describes a half-migrated store. Each step is PRAGMA-guarded and runs at
   * most once per database file; later opens are no-ops.
   */
  _migrateScopedSchema(db) {
    db.exec('BEGIN IMMEDIATE;');
    try {
      this._migrateProviderMetrics(db);
      this._migrateProviderCooldowns(db);
      this._migrateRequestLog(db);
      db.exec('COMMIT;');
    } catch (error) {
      try { db.exec('ROLLBACK;'); } catch { /* rollback is best-effort */ }
      throw error;
    }
  }

  /**
   * A.3: request_log gains scope_key + decision_id — additive ALTERs only, no
   * rebuild (the F-18 in-place precedent pattern: PRAGMA-guarded, idempotent,
   * `:memory:` stores are unaffected because they never had a schema). Every
   * pre-existing ring row honestly defaults to the 'platform' scope; decision
   * ids stay NULL for history (NULL-when-unknown, never fabricated).
   */
  _migrateRequestLog(db) {
    const columns = db.prepare('PRAGMA table_info(request_log)').all().map(column => column.name);
    if (!columns.includes('scope_key')) db.exec("ALTER TABLE request_log ADD COLUMN scope_key TEXT NOT NULL DEFAULT 'platform'");
    if (!columns.includes('decision_id')) db.exec('ALTER TABLE request_log ADD COLUMN decision_id TEXT');
    db.exec('CREATE INDEX IF NOT EXISTS idx_request_log_scope ON request_log (scope_key, created_at);');
    db.exec('CREATE INDEX IF NOT EXISTS idx_request_log_decision ON request_log (decision_id);');
    return { altered: !columns.includes('scope_key') };
  }

  /**
   * A.1: rebuild provider_metrics to PK (provider, model, scope_key).
   * SQLite cannot ALTER a PRIMARY KEY, so the F-18-style guarded rebuild is:
   * CREATE v2 -> INSERT-SELECT (every legacy row preserved verbatim in the
   * 'platform' scope) -> DROP -> RENAME -> scope index.
   */
  _migrateProviderMetrics(db) {
    const columns = db.prepare('PRAGMA table_info(provider_metrics)').all().map(column => column.name);
    if (columns.includes('scope_key')) return { rebuilt: false };
    const before = Number(db.prepare('SELECT COUNT(*) AS n FROM provider_metrics').get().n);
    db.exec(`
      CREATE TABLE provider_metrics_v2 (
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        scope_key TEXT NOT NULL DEFAULT 'platform',
        requests INTEGER NOT NULL DEFAULT 0,
        successes INTEGER NOT NULL DEFAULT 0,
        failures INTEGER NOT NULL DEFAULT 0,
        total_latency_ms INTEGER NOT NULL DEFAULT 0,
        last_latency_ms INTEGER NOT NULL DEFAULT 0,
        last_status INTEGER,
        p95_latency_ms INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (provider, model, scope_key)
      );
      INSERT INTO provider_metrics_v2
        SELECT provider, model, 'platform', requests, successes, failures,
               total_latency_ms, last_latency_ms, last_status, p95_latency_ms, updated_at
        FROM provider_metrics;
      DROP TABLE provider_metrics;
      ALTER TABLE provider_metrics_v2 RENAME TO provider_metrics;
      CREATE INDEX IF NOT EXISTS idx_provider_metrics_scope ON provider_metrics (scope_key, updated_at);
    `);
    const after = Number(db.prepare('SELECT COUNT(*) AS n FROM provider_metrics').get().n);
    if (after !== before) throw new Error(`provider_metrics rebuild row parity failed (${before} -> ${after})`);
    return { rebuilt: true, rowsPreserved: after };
  }

  /**
   * A.2: rebuild provider_cooldowns to PK (provider, model, scope_key) plus
   * the credential_kind attribute ('platform' | 'byok' | 'tenant-penalty').
   * Same guarded preservation-copy pattern as A.1: a cooldown recorded before
   * this migration was by definition a platform-credential cooldown.
   */
  _migrateProviderCooldowns(db) {
    const columns = db.prepare('PRAGMA table_info(provider_cooldowns)').all().map(column => column.name);
    if (columns.includes('scope_key')) return { rebuilt: false };
    const before = Number(db.prepare('SELECT COUNT(*) AS n FROM provider_cooldowns').get().n);
    db.exec(`
      CREATE TABLE provider_cooldowns_v2 (
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        scope_key TEXT NOT NULL DEFAULT 'platform',
        credential_kind TEXT NOT NULL DEFAULT 'platform',
        expires_at INTEGER NOT NULL,
        reason TEXT,
        strikes INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (provider, model, scope_key)
      );
      INSERT INTO provider_cooldowns_v2
        SELECT provider, model, 'platform', 'platform', expires_at, reason, strikes, updated_at
        FROM provider_cooldowns;
      DROP TABLE provider_cooldowns;
      ALTER TABLE provider_cooldowns_v2 RENAME TO provider_cooldowns;
      CREATE INDEX IF NOT EXISTS idx_provider_cooldowns_scope ON provider_cooldowns (scope_key, expires_at);
    `);
    const after = Number(db.prepare('SELECT COUNT(*) AS n FROM provider_cooldowns').get().n);
    if (after !== before) throw new Error(`provider_cooldowns rebuild row parity failed (${before} -> ${after})`);
    return { rebuilt: true, rowsPreserved: after };
  }

  _key(provider, model, scopeKey = PLATFORM_SCOPE) {
    return `${normalizeScopeKey(scopeKey)}\u0000${String(provider || '').toLowerCase()}\u0000${String(model || '')}`;
  }

  _sample(key, latencyMs) {
    if (!Number.isFinite(latencyMs) || latencyMs < 0) return [];
    const bucket = this.samples.get(key) || [];
    bucket.push(Math.round(latencyMs));
    if (bucket.length > MAX_SAMPLES) bucket.splice(0, bucket.length - MAX_SAMPLES);
    this.samples.set(key, bucket);
    return bucket;
  }

  recordRequest({ provider, model, ok = true, latencyMs = 0, status = null, usage = null, at = Date.now(), scopeKey = PLATFORM_SCOPE, decisionId = null } = {}) {
    const p = String(provider || 'unknown').toLowerCase();
    const m = String(model || '');
    const scope = normalizeScopeKey(scopeKey);
    const decision = decisionId === null || decisionId === undefined ? null : String(decisionId).slice(0, 64);
    const key = this._key(p, m, scope);
    const latency = Number.isFinite(latencyMs) ? Math.max(0, Math.round(latencyMs)) : 0;
    // F-18: per-attempt token usage rides along with the attempt row. Missing
    // or malformed counts stay null — an unknown is never recorded as 0.
    const promptTokens = Number.isFinite(Number(usage?.promptTokens)) && Number(usage?.promptTokens) >= 0
      ? Math.round(Number(usage.promptTokens)) : null;
    const completionTokens = Number.isFinite(Number(usage?.completionTokens)) && Number(usage?.completionTokens) >= 0
      ? Math.round(Number(usage.completionTokens)) : null;
    const samples = this._sample(key, latency);
    const p95 = percentile([...samples].sort((a, b) => a - b), 0.95);

    if (!this.db) {
      const row = this.memoryRequests.get(key) || {
        provider: p, model: m, scopeKey: scope, requests: 0, successes: 0, failures: 0,
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
      this.memoryLog.push({ provider: p, model: m, ok, status, latencyMs: latency, promptTokens, completionTokens, createdAt: at, scopeKey: scope, decisionId: decision });
      if (this.memoryLog.length > MAX_LOG_ROWS) this.memoryLog.splice(0, this.memoryLog.length - MAX_LOG_ROWS);
      return { backend: 'memory', provider: p, model: m };
    }

    try {
      if (this.scopedSchema) {
        this.db.prepare(`
          INSERT INTO provider_metrics
            (provider, model, scope_key, requests, successes, failures, total_latency_ms, last_latency_ms, last_status, p95_latency_ms, updated_at)
          VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(provider, model, scope_key) DO UPDATE SET
            requests = requests + 1,
            successes = successes + excluded.successes,
            failures = failures + excluded.failures,
            total_latency_ms = total_latency_ms + excluded.total_latency_ms,
            last_latency_ms = excluded.last_latency_ms,
            last_status = excluded.last_status,
            p95_latency_ms = excluded.p95_latency_ms,
            updated_at = excluded.updated_at
        `).run(p, m, scope, ok ? 1 : 0, ok ? 0 : 1, latency, latency, status, p95, at);
      } else {
        // Legacy shape (scoped rebuild failed): platform evidence keeps
        // flowing through the pre-021 SQL; scoped rows cannot be represented
        // and are dropped (fail-open on evidence, never on the request).
        if (scope !== PLATFORM_SCOPE) return { backend: 'sqlite', provider: p, model: m, scopeDropped: true };
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
      }
      if (this.scopedSchema) {
        this.db.prepare('INSERT INTO request_log (provider, model, ok, status, latency_ms, prompt_tokens, completion_tokens, created_at, scope_key, decision_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(p, m, ok ? 1 : 0, status, latency, promptTokens, completionTokens, at, scope, decision);
      } else {
        this.db.prepare('INSERT INTO request_log (provider, model, ok, status, latency_ms, prompt_tokens, completion_tokens, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .run(p, m, ok ? 1 : 0, status, latency, promptTokens, completionTokens, at);
      }
      if (Math.random() < 0.01) {
        this.db.prepare('DELETE FROM request_log WHERE id <= (SELECT MAX(id) - ? FROM request_log)').run(MAX_LOG_ROWS);
      }
    } catch (error) {
      this.error = error.message;
    }
    return { backend: 'sqlite', provider: p, model: m };
  }

  recordCooldown({ provider, model = '', expiresAt, reason = '', strikes = 1, at = Date.now(), scopeKey = PLATFORM_SCOPE, credentialKind = 'platform' } = {}) {
    const p = String(provider || '').toLowerCase();
    const m = String(model || '');
    const scope = normalizeScopeKey(scopeKey);
    const kind = String(credentialKind || 'platform').slice(0, 32);
    const key = this._key(p, m, scope);
    if (!this.db) {
      this.memoryCooldowns.set(key, { provider: p, model: m, scopeKey: scope, credentialKind: kind, expiresAt, reason, strikes, updatedAt: at });
      return { backend: 'memory' };
    }
    try {
      if (this.scopedSchema) {
        this.db.prepare(`
          INSERT INTO provider_cooldowns (provider, model, scope_key, credential_kind, expires_at, reason, strikes, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(provider, model, scope_key) DO UPDATE SET
            credential_kind = excluded.credential_kind,
            expires_at = excluded.expires_at,
            reason = excluded.reason,
            strikes = excluded.strikes,
            updated_at = excluded.updated_at
        `).run(p, m, scope, kind, expiresAt, reason, strikes, at);
      } else {
        // Legacy shape: platform cooldowns keep flowing; scoped rows cannot be
        // represented and are dropped (fail-open on evidence).
        if (scope !== PLATFORM_SCOPE) return { backend: this.backend, scopeDropped: true };
        this.db.prepare(`
          INSERT INTO provider_cooldowns (provider, model, expires_at, reason, strikes, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(provider, model) DO UPDATE SET
            expires_at = excluded.expires_at,
            reason = excluded.reason,
            strikes = excluded.strikes,
            updated_at = excluded.updated_at
        `).run(p, m, expiresAt, reason, strikes, at);
      }
    } catch (error) {
      this.error = error.message;
    }
    return { backend: this.backend };
  }

  clearCooldown({ provider, model = '', scopeKey = PLATFORM_SCOPE } = {}) {
    const p = String(provider || '').toLowerCase();
    const m = String(model || '');
    const scope = normalizeScopeKey(scopeKey);
    const key = this._key(p, m, scope);
    if (!this.db) {
      this.memoryCooldowns.delete(key);
      return;
    }
    try {
      if (this.scopedSchema) {
        this.db.prepare('DELETE FROM provider_cooldowns WHERE provider = ? AND model = ? AND scope_key = ?').run(p, m, scope);
      } else if (scope === PLATFORM_SCOPE) {
        this.db.prepare('DELETE FROM provider_cooldowns WHERE provider = ? AND model = ?').run(p, m);
      }
    } catch (error) {
      this.error = error.message;
    }
  }

  clearAllCooldowns({ scopeKey = null } = {}) {
    const scope = scopeKey === null || scopeKey === undefined ? null : normalizeScopeKey(scopeKey);
    if (!this.db) {
      if (scope === null) {
        this.memoryCooldowns.clear();
        return;
      }
      for (const [key, row] of this.memoryCooldowns.entries()) {
        if ((row.scopeKey || PLATFORM_SCOPE) === scope) this.memoryCooldowns.delete(key);
      }
      return;
    }
    try {
      if (scope === null) {
        this.db.prepare('DELETE FROM provider_cooldowns').run();
      } else if (this.scopedSchema) {
        this.db.prepare('DELETE FROM provider_cooldowns WHERE scope_key = ?').run(scope);
      } else if (scope === PLATFORM_SCOPE) {
        this.db.prepare('DELETE FROM provider_cooldowns').run();
      }
    } catch (error) { this.error = error.message; }
  }

  loadCooldowns({ now = Date.now(), scopeKey = null } = {}) {
    const scope = scopeKey === null || scopeKey === undefined ? null : normalizeScopeKey(scopeKey);
    if (!this.db) {
      return [...this.memoryCooldowns.values()]
        .filter(row => row.expiresAt > now && (scope === null || (row.scopeKey || PLATFORM_SCOPE) === scope))
        .map(row => ({ ...row }));
    }
    try {
      if (this.scopedSchema) {
        const rows = scope === null
          ? this.db.prepare('SELECT provider, model, scope_key, credential_kind, expires_at, reason, strikes, updated_at FROM provider_cooldowns WHERE expires_at > ?').all(now)
          : this.db.prepare('SELECT provider, model, scope_key, credential_kind, expires_at, reason, strikes, updated_at FROM provider_cooldowns WHERE expires_at > ? AND scope_key = ?').all(now, scope);
        return rows.map(row => ({
          provider: row.provider,
          model: row.model,
          scopeKey: row.scope_key,
          credentialKind: row.credential_kind,
          expiresAt: Number(row.expires_at),
          reason: row.reason,
          strikes: Number(row.strikes),
          updatedAt: Number(row.updated_at),
        }));
      }
      if (scope !== null && scope !== PLATFORM_SCOPE) return []; // legacy shape cannot represent non-platform scopes
      return this.db.prepare('SELECT provider, model, expires_at, reason, strikes, updated_at FROM provider_cooldowns WHERE expires_at > ?')
        .all(now)
        .map(row => ({
          provider: row.provider,
          model: row.model,
          scopeKey: PLATFORM_SCOPE,
          credentialKind: 'platform',
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

  getProviderMetrics({ limit = 100, scopeKey = null } = {}) {
    const scope = scopeKey === null || scopeKey === undefined ? null : normalizeScopeKey(scopeKey);
    if (!this.db) {
      return [...this.memoryRequests.values()]
        .filter(row => scope === null || (row.scopeKey || PLATFORM_SCOPE) === scope)
        .sort((a, b) => b.requests - a.requests)
        .slice(0, limit)
        .map(row => ({
          ...row,
          scopeKey: row.scopeKey || PLATFORM_SCOPE,
          avgLatencyMs: row.requests > 0 ? Math.round(row.totalLatencyMs / row.requests) : 0,
        }));
    }
    try {
      if (this.scopedSchema) {
        const rows = scope === null
          ? this.db.prepare(`
            SELECT provider, model, scope_key, requests, successes, failures, total_latency_ms, last_latency_ms,
                   last_status, p95_latency_ms, updated_at
            FROM provider_metrics ORDER BY requests DESC LIMIT ?
          `).all(limit)
          : this.db.prepare(`
            SELECT provider, model, scope_key, requests, successes, failures, total_latency_ms, last_latency_ms,
                   last_status, p95_latency_ms, updated_at
            FROM provider_metrics WHERE scope_key = ? ORDER BY requests DESC LIMIT ?
          `).all(scope, limit);
        return rows.map(row => ({
          provider: row.provider,
          model: row.model,
          scopeKey: row.scope_key,
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
      }
      if (scope !== null && scope !== PLATFORM_SCOPE) return []; // legacy shape cannot represent non-platform scopes
      return this.db.prepare(`
        SELECT provider, model, requests, successes, failures, total_latency_ms, last_latency_ms,
               last_status, p95_latency_ms, updated_at
        FROM provider_metrics ORDER BY requests DESC LIMIT ?
      `).all(limit).map(row => ({
        provider: row.provider,
        model: row.model,
        scopeKey: PLATFORM_SCOPE,
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

  getRecentRequests({ limit = 50, scopeKey = null } = {}) {
    const scope = scopeKey === null || scopeKey === undefined ? null : normalizeScopeKey(scopeKey);
    if (!this.db) {
      return this.memoryLog
        .filter(row => scope === null || (row.scopeKey || PLATFORM_SCOPE) === scope)
        .slice(-limit).reverse();
    }
    try {
      if (this.scopedSchema) {
        const rows = scope === null
          ? this.db.prepare('SELECT provider, model, ok, status, latency_ms, prompt_tokens, completion_tokens, created_at, scope_key, decision_id FROM request_log ORDER BY id DESC LIMIT ?').all(limit)
          : this.db.prepare('SELECT provider, model, ok, status, latency_ms, prompt_tokens, completion_tokens, created_at, scope_key, decision_id FROM request_log WHERE scope_key = ? ORDER BY id DESC LIMIT ?').all(scope, limit);
        return rows.map(row => ({
          provider: row.provider,
          model: row.model,
          ok: Boolean(row.ok),
          status: row.status === null ? null : Number(row.status),
          latencyMs: Number(row.latency_ms),
          promptTokens: row.prompt_tokens === null || row.prompt_tokens === undefined ? null : Number(row.prompt_tokens),
          completionTokens: row.completion_tokens === null || row.completion_tokens === undefined ? null : Number(row.completion_tokens),
          createdAt: Number(row.created_at),
          scopeKey: row.scope_key,
          decisionId: row.decision_id === null || row.decision_id === undefined ? null : String(row.decision_id),
        }));
      }
      if (scope !== null && scope !== PLATFORM_SCOPE) return []; // legacy shape cannot represent non-platform scopes
      return this.db.prepare('SELECT provider, model, ok, status, latency_ms, prompt_tokens, completion_tokens, created_at FROM request_log ORDER BY id DESC LIMIT ?')
        .all(limit)
        .map(row => ({
          provider: row.provider,
          model: row.model,
          ok: Boolean(row.ok),
          status: row.status === null ? null : Number(row.status),
          latencyMs: Number(row.latency_ms),
          promptTokens: row.prompt_tokens === null || row.prompt_tokens === undefined ? null : Number(row.prompt_tokens),
          completionTokens: row.completion_tokens === null || row.completion_tokens === undefined ? null : Number(row.completion_tokens),
          createdAt: Number(row.created_at),
          scopeKey: PLATFORM_SCOPE,
          decisionId: null,
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
  getRollingAggregates({ windowMs = 30 * 60_000, limit = 500, maxSamples = 10, now = Date.now(), scopeKey = PLATFORM_SCOPE } = {}) {
    const cutoff = Number(now) - Math.max(1000, Number(windowMs) || 0);
    const rowLimit = Math.max(1, Number(limit) || 500);
    const sampleCap = Math.max(1, Number(maxSamples) || 10);
    const scope = normalizeScopeKey(scopeKey);
    let rows;
    if (!this.db) {
      rows = this.memoryLog
        .filter(row => Number(row.createdAt) >= cutoff && (row.scopeKey || PLATFORM_SCOPE) === scope)
        .slice(-rowLimit).reverse();
    } else {
      try {
        rows = (this.scopedSchema
          ? this.db.prepare('SELECT provider, model, ok, status, latency_ms, created_at FROM request_log WHERE created_at >= ? AND scope_key = ? ORDER BY id DESC LIMIT ?')
            .all(cutoff, scope, rowLimit)
          : this.db.prepare('SELECT provider, model, ok, status, latency_ms, created_at FROM request_log WHERE created_at >= ? ORDER BY id DESC LIMIT ?')
            .all(cutoff, rowLimit))
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
        scopeKey: scope,
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

  /**
   * F-13 / C.4 seam: `scopeKey` null (default) wipes everything (legacy
   * behaviour, byte-identical); a scope wipes exactly that scope where the
   * schema can represent it. Tables that are not scope-capable yet are only
   * wiped for the platform scope (they cannot hold anything else).
   */
  reset({ scopeKey = null } = {}) {
    const scope = scopeKey === null || scopeKey === undefined ? null : normalizeScopeKey(scopeKey);
    if (scope === null) {
      this.samples.clear();
      this.memoryRequests.clear();
      this.memoryCooldowns.clear();
      this.memoryLog.length = 0;
    } else {
      for (const [key, row] of this.memoryRequests.entries()) {
        if ((row.scopeKey || PLATFORM_SCOPE) === scope) { this.memoryRequests.delete(key); this.samples.delete(key); }
      }
      for (const [key, row] of this.memoryCooldowns.entries()) {
        if ((row.scopeKey || PLATFORM_SCOPE) === scope) this.memoryCooldowns.delete(key);
      }
      for (let i = this.memoryLog.length - 1; i >= 0; i -= 1) {
        if ((this.memoryLog[i].scopeKey || PLATFORM_SCOPE) === scope) this.memoryLog.splice(i, 1);
      }
    }
    if (!this.db) return;
    try {
      if (scope === null) {
        this.db.exec('DELETE FROM provider_metrics; DELETE FROM provider_cooldowns; DELETE FROM request_log;');
        return;
      }
      if (this.scopedSchema) {
        this.db.prepare('DELETE FROM provider_metrics WHERE scope_key = ?').run(scope);
        this.db.prepare('DELETE FROM provider_cooldowns WHERE scope_key = ?').run(scope);
        this.db.prepare('DELETE FROM request_log WHERE scope_key = ?').run(scope);
      } else if (scope === PLATFORM_SCOPE) {
        this.db.exec('DELETE FROM provider_metrics; DELETE FROM provider_cooldowns; DELETE FROM request_log;');
      }
    } catch (error) {
      this.error = error.message;
    }
  }

  clearAllMetrics({ scopeKey = null } = {}) {
    const scope = scopeKey === null || scopeKey === undefined ? null : normalizeScopeKey(scopeKey);
    if (!this.db) {
      if (scope === null) {
        this.memoryRequests.clear();
        this.memoryLog = [];
        this.memoryCooldowns.clear();
        this.samples.clear();
        return;
      }
      this.reset({ scopeKey: scope });
      return;
    }
    try {
      if (scope === null) {
        this.db.prepare('DELETE FROM provider_metrics').run();
        this.db.prepare('DELETE FROM request_log').run();
        this.db.prepare('DELETE FROM provider_cooldowns').run();
        return;
      }
      if (this.scopedSchema) {
        this.db.prepare('DELETE FROM provider_metrics WHERE scope_key = ?').run(scope);
        this.db.prepare('DELETE FROM provider_cooldowns WHERE scope_key = ?').run(scope);
        this.db.prepare('DELETE FROM request_log WHERE scope_key = ?').run(scope);
      } else if (scope === PLATFORM_SCOPE) {
        this.db.prepare('DELETE FROM provider_metrics').run();
        this.db.prepare('DELETE FROM provider_cooldowns').run();
        this.db.prepare('DELETE FROM request_log').run();
      }
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
  normalizeScopeKey,
  PLATFORM_SCOPE,
  MAX_LOG_ROWS,
};
