'use strict';

/**
 * Configuration resolution and writing (REC-012, INV-4, INV-6).
 *
 * ## The problem this replaces
 *
 * Before this module, a business value lived in one of three places depending on the
 * day it was written: a `system_settings` category, an environment variable read at
 * boot, or a frozen constant. An operator could not answer "what is the Basic daily AI
 * limit right now, where did that number come from, and who set it" without reading
 * source. Now every value resolves through one documented order and every write
 * produces a before/after row.
 *
 * ## Resolution order
 *
 *      config_overrides row  →  environment variable  →  declared default
 *
 * Read-only entries never consult the database — that is the mechanism behind the
 * "a security invariant cannot be widened through the UI it protects" claim
 * (CFG-007…009, 028…032). A database row for such a key is ignored, not honoured, so a
 * direct SQL insert cannot loosen it either.
 *
 * ## Failure posture
 *
 * The database being unavailable is **not** an error the caller should see. Admin
 * sessions must still load during an incident — that is precisely when an operator
 * needs the console. Resolution therefore degrades to env → default and reports
 * `source`/`degraded` so the UI can say so out loud rather than presenting a default
 * as if it were the operator's configured value.
 *
 * @module services/configService
 */

const crypto = require('crypto');
// The pool is reached through the module rather than destructured at load time so a
// test can substitute a store: `configService` has no business knowing whether MySQL is
// there, and the write path's transactional behaviour (rollback on conflict, audit row
// in the same transaction) has to be testable without a database.
const database = require('../database/mysql');

/**
 * Test seam: a store may be injected so the transactional write path can be exercised
 * without MySQL. Only `database.getPool()` is replaced — replacing the module export
 * globally would also redirect unrelated subsystems (quota buckets, rate-limit store)
 * into the fake and make an unrelated failure look like a configuration failure.
 * @type {null | {query: Function, getConnection: Function}}
 */
let poolOverride = null;

/**
 * @param {object|null} pool
 * @returns {void}
 */
function setConfigPoolForTests(pool) {
  if (process.env.NODE_ENV !== 'test' && process.env.ALLOW_TEST_AUTH_VERIFIER !== 'true') {
    throw new Error('Config pool injection is disabled outside tests');
  }
  poolOverride = pool;
  cache = null;
}

/**
 * @returns {{query: Function, getConnection: Function}}
 */
function configPool() {
  return poolOverride || database.getPool();
}
const registry = require('../config/registry');

/** How long a resolved map may be reused before it is re-read. */
const CACHE_TTL_MS = 30_000;

/** @type {{at: number, rows: Map<string, {value: unknown, revision: number}>}|null} */
let cache = null;

/** Last resolution origin, surfaced by the API so the UI can show provenance. */
let lastOrigin = Object.freeze({ source: 'default', degraded: false, reason: null });

/**
 * Reset the cache. Called by the write path (so a change is visible immediately) and
 * by tests (so cases do not leak into each other).
 * @returns {void}
 */
function invalidateConfigCache() {
  cache = null;
}

/**
 * Read every override row, or an empty map when the table is missing or the database
 * is unreachable.
 *
 * The table-missing case is expected on a deployment that has not run 029 yet and is
 * deliberately not an error: the registry's defaults are the documented behaviour, and
 * refusing to render the console because a migration is pending would be worse than
 * rendering it with provenance that says "default".
 *
 * @returns {Promise<Map<string, {value: unknown, revision: number}>>}
 */
async function loadOverrideRows() {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.rows;

  const rows = new Map();
  try {
    const pool = configPool();
    const [result] = await pool.query('SELECT config_key, value, revision FROM config_overrides');
    for (const row of Array.isArray(result) ? result : []) {
      const key = String(row.config_key);
      const raw = row.value;
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      rows.set(key, { value: parsed, revision: Number(row.revision ?? 1) });
    }
    lastOrigin = Object.freeze({ source: 'database', degraded: false, reason: null });
  } catch (error) {
    const code = error?.code || '';
    const missingTable = code === 'ER_NO_SUCH_TABLE';
    rows.clear();
    lastOrigin = Object.freeze({
      source: 'default',
      degraded: true,
      reason: missingTable
        ? 'config_overrides table is absent (migration 029 pending); showing declared defaults'
        : 'configuration store unavailable; showing declared defaults',
    });
    // A degraded read must not be cached for the full TTL: the operator may be looking
    // at this screen because the database just came back.
    cache = { at: Date.now() - CACHE_TTL_MS + 5_000, rows };
    return rows;
  }

  cache = { at: Date.now(), rows };
  return rows;
}

/**
 * Resolve one entry.
 * @param {import('../config/registry').RegistryEntry} entry
 * @param {Map<string, {value: unknown, revision: number}>} rows
 * @returns {{value: unknown, source: string, revision: number|null, valid: boolean}}
 */
function resolveEntry(entry, rows) {
  const row = entry.editable ? rows.get(entry.key) : undefined;
  if (row) {
    // A stored value is validated on read as well as on write: a row edited by hand in
    // SQL must not be able to put an out-of-range number into the runtime.
    try {
      return { value: entry.validate(row.value), source: 'database', revision: row.revision, valid: true };
    } catch (error) {
      return { value: entry.defaultValue, source: 'database-invalid', revision: row.revision, valid: false };
    }
  }

  if (entry.resolution === registry.RESOLUTION.ENV && entry.envVar) {
    const fromEnv = process.env[entry.envVar];
    if (fromEnv !== undefined && fromEnv !== '') {
      try {
        return { value: entry.validate(fromEnv), source: 'env', revision: null, valid: true };
      } catch (error) {
        return { value: entry.defaultValue, source: 'env-invalid', revision: null, valid: false };
      }
    }
  }

  return { value: entry.defaultValue, source: 'default', revision: null, valid: true };
}

/**
 * Resolve every entry.
 * @returns {Promise<Map<string, {value: unknown, source: string, revision: number|null, valid: boolean}>>}
 */
async function resolveAll() {
  const rows = await loadOverrideRows();
  const resolved = new Map();
  for (const entry of registry.ENTRIES) resolved.set(entry.key, resolveEntry(entry, rows));
  return resolved;
}

/**
 * Typed read of a single value. This is the function business code should call; it
 * never returns `undefined` because a registered key always has a declared default.
 *
 * @template T
 * @param {string} key registry key or `CFG-nnn` id
 * @param {T} [fallback] used only if the key is not registered (a programming error)
 * @returns {Promise<T>}
 */
async function getConfigValue(key, fallback) {
  const entry = registry.findEntry(key);
  if (!entry) {
    if (arguments.length > 1) return fallback;
    throw new Error(`config: unknown key ${key}`);
  }
  const rows = await loadOverrideRows();
  return /** @type {T} */ (resolveEntry(entry, rows).value);
}

/**
 * Read many values at once.
 * @param {string[]} keys
 * @returns {Promise<Record<string, unknown>>}
 */
async function getConfigValues(keys) {
  const rows = await loadOverrideRows();
  const out = {};
  for (const key of keys) {
    const entry = registry.findEntry(key);
    if (!entry) throw new Error(`config: unknown key ${key}`);
    out[entry.key] = resolveEntry(entry, rows).value;
  }
  return out;
}

/**
 * The census: every registered value with its effective value, origin, editability and
 * the reason it is read-only. This is the endpoint behind the console's Configuration
 * tab, and it is intentionally a full dump — an operator asking "what is set" should
 * not have to know which panel to open.
 *
 * @param {{actorPermissions?: (permission: string) => boolean}} [options]
 *   When supplied, values outside the actor's authority are replaced with `null` and
 *   marked `redacted`, so the census cannot become a privilege-escalation oracle.
 * @returns {Promise<{entries: object[], authority: {source: string, degraded: boolean, reason: string|null}}>}
 */
async function describeConfig(options = {}) {
  const resolved = await resolveAll();
  const entries = registry.ENTRIES.map(entry => {
    const value = resolved.get(entry.key);
    const denied = typeof options.actorPermissions === 'function'
      && entry.audit === registry.AUDIT.ELEVATED
      && !options.actorPermissions('system.config.read');
    const described = registry.describeEntry(entry, value);
    if (denied) {
      return { ...described, value: null, redacted: true };
    }
    return { ...described, redacted: false, valid: value.valid };
  });
  return { entries, authority: { ...lastOrigin } };
}

/**
 * Write one configuration value.
 *
 * Rejects rather than repairs: an invalid value is a 400 with the field message, a
 * stale revision is a 409, an unregistered key is a 404, a read-only key is a 403. None
 * of those cases writes anything, so a refused write leaves no audit row that would
 * suggest a change happened.
 *
 * @param {object} params
 * @param {string} params.key registry key or id
 * @param {unknown} params.value candidate value
 * @param {number|null} params.expectedRevision revision the caller was shown; `null` to create
 * @param {{uid: string, email?: string, role?: string}} params.actor
 * @param {string} [params.reason] required for `elevated` entries
 * @param {string} [params.requestId]
 * @returns {Promise<{key: string, value: unknown, revision: number, before: unknown, beforeRevision: number|null}>}
 */
async function writeConfigValue({ key, value, expectedRevision = null, actor, reason, requestId }) {
  const entry = registry.findEntry(key);
  if (!entry) {
    throw Object.assign(new Error('Unknown configuration key'), { code: 'CONFIG_KEY_UNKNOWN', status: 404 });
  }
  if (!entry.editable) {
    throw Object.assign(new Error(`${entry.label} is not editable from the dashboard`), {
      code: 'CONFIG_READ_ONLY',
      status: 403,
      reason: entry.readOnlyReason,
    });
  }
  if (!actor || !actor.uid) {
    throw Object.assign(new Error('A configuration write requires an identified actor'), { code: 'CONFIG_ACTOR_REQUIRED', status: 500 });
  }

  let normalised;
  try {
    normalised = entry.validate(value);
  } catch (error) {
    throw Object.assign(new Error(`${entry.label}: ${error.message}`), { code: 'CONFIG_INVALID', status: 400 });
  }

  const elevatedReason = entry.audit === registry.AUDIT.ELEVATED ? String(reason || '').trim() : '';
  if (entry.audit === registry.AUDIT.ELEVATED && elevatedReason.length < 10) {
    throw Object.assign(new Error(`${entry.label}: a reason of at least 10 characters is required for this change`), {
      code: 'CONFIG_REASON_REQUIRED',
      status: 400,
    });
  }
  if (elevatedReason.length > 500) {
    throw Object.assign(new Error('Reason must be at most 500 characters'), { code: 'CONFIG_REASON_TOO_LONG', status: 400 });
  }

  // Cross-field rules that a single-entry validator cannot express.
  if (entry.key === 'security.rateLimit.authBurst') {
    const hourly = Number(await getConfigValue('security.rateLimit.authHourly'));
    if (Number(normalised) > hourly) {
      throw Object.assign(new Error(`Auth burst limit (${normalised}/min) must not exceed the hourly limit (${hourly}/h)`), {
        code: 'CONFIG_INVALID', status: 400,
      });
    }
  }

  const pool = configPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      'SELECT value, revision FROM config_overrides WHERE config_key = ? FOR UPDATE',
      [entry.key]
    );
    const existing = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    const currentRevision = existing ? Number(existing.revision ?? 1) : null;
    const currentValue = existing
      ? (typeof existing.value === 'string' ? JSON.parse(existing.value) : existing.value)
      : entry.defaultValue;

    // `null` is not "skip the check" — it is the statement "I believe no value is stored".
    // Accepting it unconditionally made the write last-write-wins for any client that loaded a
    // page before the row existed, which is precisely the failure REC-015 was written to stop.
    // So it is compared like any other expectation: null matches only an absent row.
    const expectedMatches = expectedRevision === null || expectedRevision === undefined
      ? currentRevision === null
      : Number(expectedRevision) === Number(currentRevision ?? 0);
    if (!expectedMatches) {
      throw Object.assign(new Error(
        expectedRevision === null || expectedRevision === undefined
          ? `${entry.label} already has a stored value; reload before saving`
          : `${entry.label} was changed by someone else; reload before saving`
      ), {
        code: 'CONFIG_REVISION_CONFLICT',
        status: 409,
        currentRevision,
      });
    }

    const nextRevision = (currentRevision ?? 0) + 1;
    await connection.query(
      `INSERT INTO config_overrides (config_key, value, revision, updated_by, updated_by_email)
       VALUES (?, CAST(? AS JSON), ?, ?, ?)
       ON DUPLICATE KEY UPDATE value = CAST(? AS JSON), revision = ?, updated_by = ?, updated_by_email = ?`,
      [entry.key, JSON.stringify(normalised), nextRevision, actor.uid, actor.email || null,
        JSON.stringify(normalised), nextRevision, actor.uid, actor.email || null]
    );

    await connection.query(
      `INSERT INTO config_change_log
         (id, config_key, scope, value_before, value_after, revision_before, revision_after,
          actor_uid, actor_email, actor_role, reason, request_id)
       VALUES (?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), ?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(), entry.key, entry.scope,
        JSON.stringify(currentValue ?? null), JSON.stringify(normalised),
        currentRevision, nextRevision,
        actor.uid, actor.email || null, actor.role || null, elevatedReason || null, requestId || null,
      ]
    );

    await connection.commit();
    invalidateConfigCache();

    return {
      key: entry.key,
      value: normalised,
      revision: nextRevision,
      before: currentValue,
      beforeRevision: currentRevision,
    };
  } catch (error) {
    try { await connection.rollback(); } catch (_rollbackError) { /* the original error is the useful one */ }
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Change history for one key, newest first.
 * @param {string} key
 * @param {{limit?: number}} [options]
 * @returns {Promise<object[]>}
 */
async function configHistory(key, options = {}) {
  const entry = registry.findEntry(key);
  if (!entry) {
    throw Object.assign(new Error('Unknown configuration key'), { code: 'CONFIG_KEY_UNKNOWN', status: 404 });
  }
  const limit = Math.min(Math.max(Number(options.limit || 50), 1), 200);
  const pool = configPool();
  const [rows] = await pool.query(
    `SELECT id, config_key, scope, value_before, value_after, revision_before, revision_after,
            actor_uid, actor_email, actor_role, reason, created_at
       FROM config_change_log
      WHERE config_key = ?
      ORDER BY created_at DESC
      LIMIT ?`,
    [entry.key, limit]
  );
  const parse = raw => (typeof raw === 'string' ? JSON.parse(raw) : raw);
  return (Array.isArray(rows) ? rows : []).map(row => ({
    id: row.id,
    key: row.config_key,
    scope: row.scope,
    before: parse(row.value_before),
    after: parse(row.value_after),
    revisionBefore: row.revision_before === null ? null : Number(row.revision_before),
    revisionAfter: Number(row.revision_after),
    actor: { uid: row.actor_uid, email: row.actor_email, role: row.actor_role },
    reason: row.reason,
    at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  }));
}

module.exports = {
  getConfigValue,
  getConfigValues,
  describeConfig,
  writeConfigValue,
  configHistory,
  resolveAll,
  invalidateConfigCache,
  setConfigPoolForTests,
  __test: { resolveEntry, loadOverrideRows, CACHE_TTL_MS },
};
