'use strict';

/**
 * FP-A06 — immediate operator session revocation.
 *
 * PROBLEM: `revokeRefreshTokens()` only invalidates Firebase REFRESH tokens. An
 * ID token that was already issued keeps working until it expires, so an
 * operator whose access was revoked could keep using the platform for up to an
 * hour. Removing the operator from a list in the console changed nothing.
 *
 * MECHANISM: a per-user revocation CUTOFF persisted in `revoked_sessions`
 * (migration 034), compared against the token's own SIGNED issue time:
 *
 *     revoked  <=>  issuedAtSeconds <= cutoffSeconds
 *
 * Why issue time and not `auth_time`:
 *   * `iat` is present on every Firebase ID token and is signed by the issuer, so
 *     a client cannot forge or omit it to escape a revocation;
 *   * `auth_time` is optional (absent on some token types) and carries different
 *     semantics per provider;
 *   * `exp` is a future bound, useless for "was this issued before we revoked?".
 * When neither `iat` nor `auth_time` is present the token is treated as
 * infinitely old (issue time 0), so a revocation still rejects it. That is the
 * fail-closed direction.
 *
 * SECOND GRANULARITY: tokens carry whole-second issue times, so a revocation
 * taken at 12:00:00.500 rejects everything issued in second 12:00:00, including a
 * token minted 400 ms after the revocation. This is deliberate: a false rejection
 * costs one re-authentication, a false acceptance is a security failure.
 *
 * CACHING: there is no positive ("not revoked") cache. A stale positive cache is
 * exactly the bug this module exists to fix. Each authenticated request performs
 * one indexed primary-key-range lookup on `(user_id, revoked_at)`; revocations
 * made by this process are additionally remembered in memory so they take effect
 * even if the database read is momentarily unavailable.
 *
 * DATABASE OUTAGE: fail CLOSED in production (the caller maps
 * SESSION_REVOCATION_UNAVAILABLE to 503). A test environment that has no database
 * at all can opt out explicitly with SESSION_REVOCATION_IN_TEST=false; that flag
 * has no effect outside NODE_ENV=test.
 */

const crypto = require('crypto');

// uid -> cutoff epoch ms for revocations performed by this process.
const localCutoffs = new Map();
// jti -> Set of locally revoked token IDs
const localRevokedJtis = new Set();

const DEFAULT_HORIZON_SECONDS = 24 * 60 * 60;

function horizonSeconds() {
  const configured = Number(process.env.SESSION_REVOCATION_HORIZON_SECONDS);
  return Number.isSafeInteger(configured) && configured > 0 && configured <= 315_360_000
    ? configured
    : DEFAULT_HORIZON_SECONDS;
}

/**
 * Is the revocation check active for this process?
 *
 * Enabled everywhere except `NODE_ENV=test`, where the vast majority of backend
 * suites exercise authentication with an injected verifier and no database. A
 * test run that actually wants to prove revocation sets
 * `SESSION_REVOCATION_IN_TEST=true` (which is what the mandate contract tests do).
 * The flag can never weaken a non-test process.
 */
function enforced() {
  if (process.env.NODE_ENV !== 'test') return true;
  return process.env.SESSION_REVOCATION_IN_TEST === 'true';
}

function pool() {
  return require('../database/mysql').getPool();
}

/** Signed issue time of a decoded token, in whole seconds. 0 = unknown (fail closed). */
function issuedAtSeconds(decoded) {
  const iat = Number(decoded?.iat);
  if (Number.isFinite(iat) && iat > 0) return Math.floor(iat);
  const authTime = Number(decoded?.auth_time);
  if (Number.isFinite(authTime) && authTime > 0) return Math.floor(authTime);
  return 0;
}

function revocationUnavailable(detail) {
  return Object.assign(new Error('Session revocation state could not be established'), {
    code: 'SESSION_REVOCATION_UNAVAILABLE',
    status: 503,
    detail,
  });
}

function sessionRevoked(cutoffSeconds) {
  return Object.assign(new Error('This session has been revoked'), {
    code: 'SESSION_REVOKED',
    status: 401,
    cutoffSeconds,
  });
}

/**
 * The latest persisted revocation cutoff for a user, in whole seconds, or null.
 * Rows are never filtered by `expires_at`: a lapsed pruning horizon must not be
 * able to resurrect an old token, so expiry is a cleanup concern only.
 */
async function persistedCutoffSeconds(uid) {
  const [rows] = await pool().query(
    'SELECT UNIX_TIMESTAMP(revoked_at) AS cutoff FROM revoked_sessions WHERE user_id = ? ORDER BY revoked_at DESC LIMIT 1',
    [uid]
  );
  if (!rows || !rows.length) return null;
  const cutoff = Number(rows[0].cutoff);
  if (!Number.isFinite(cutoff) || cutoff <= 0) return null;
  return Math.floor(cutoff);
}

/**
 * Reject a revoked session. Throws SESSION_REVOKED or SESSION_REVOCATION_UNAVAILABLE.
 * Never silently allows a token it could not evaluate.
 */
async function assertSessionActive({ uid, issuedAt, jti = null }) {
  if (!uid && !jti) return;
  if (!enforced()) return;

  // JTI instant blacklist check
  if (jti) {
    const tokenJti = String(jti).trim();
    if (localRevokedJtis.has(tokenJti)) {
      throw sessionRevoked(0);
    }
    try {
      const [jtiRows] = await pool().query(
        "SELECT id FROM revoked_sessions WHERE user_id = ? AND scope = 'JTI' AND (expires_at IS NULL OR expires_at > NOW(3)) LIMIT 1",
        [tokenJti]
      );
      if (jtiRows && jtiRows.length > 0) {
        localRevokedJtis.add(tokenJti);
        throw sessionRevoked(0);
      }
    } catch (err) {
      if (err?.code === 'SESSION_REVOKED') throw err;
      throw revocationUnavailable(err?.code || 'jti_lookup_failed');
    }
  }

  if (!uid) return;

  const localCutoff = localCutoffs.get(uid);
  const localCutoffSeconds = localCutoff ? Math.floor(localCutoff / 1000) : null;
  const issued = Number.isFinite(issuedAt) && issuedAt > 0 ? Math.floor(issuedAt) : 0;

  if (localCutoffSeconds !== null && issued <= localCutoffSeconds) {
    throw sessionRevoked(localCutoffSeconds);
  }

  let cutoffSeconds;
  try {
    cutoffSeconds = await persistedCutoffSeconds(uid);
  } catch (error) {
    // A revocation written by this process is still authoritative; anything else
    // cannot be verified, so authentication fails closed.
    throw revocationUnavailable(error?.code || 'lookup_failed');
  }
  if (cutoffSeconds !== null && issued <= cutoffSeconds) {
    throw sessionRevoked(cutoffSeconds);
  }
}

/**
 * Persist a user-level revocation and apply it immediately in this process.
 * Returns the stored record. Throws (and applies nothing) if persistence fails —
 * an operator must never be told a session was revoked when it was not.
 */
async function revokeUserSessions({ uid, actorUid = null, reason = null, requestId = null, scope = 'USER' }) {
  const userId = String(uid || '');
  if (!userId || userId.length > 128) {
    throw Object.assign(new Error('A valid user identifier is required'), { code: 'INVALID_REVOCATION_TARGET', status: 400 });
  }
  const normalizedScope = String(scope || 'USER').toUpperCase().slice(0, 32);
  const id = `rvs_${crypto.randomUUID()}`;
  const safeReason = reason ? String(reason).replace(/\p{Cc}/gu, ' ').trim().slice(0, 255) : null;
  const trimmedActor = actorUid ? String(actorUid).slice(0, 128) : null;

  const db = pool();
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      `INSERT INTO revoked_sessions (id, user_id, scope, revoked_at, expires_at, reason, revoked_by)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP(3), DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL ? SECOND), ?, ?)`,
      [id, userId, normalizedScope, horizonSeconds(), safeReason, trimmedActor]
    );
    const [rows] = await connection.query(
      'SELECT id, user_id, scope, UNIX_TIMESTAMP(revoked_at) AS cutoff, expires_at, reason, revoked_by FROM revoked_sessions WHERE id = ?',
      [id]
    );
    await connection.commit();
    const row = rows[0];
    const cutoffMs = Math.floor(Number(row.cutoff) * 1000);
    // Apply locally BEFORE returning so the very next request in this process is
    // already rejected, even if the pool connection is later recycled.
    applyLocalRevocation(userId, cutoffMs);
    return {
      id: row.id,
      uid: row.user_id,
      scope: row.scope,
      cutoffSeconds: Math.floor(Number(row.cutoff)),
      expiresAt: row.expires_at || null,
      reason: row.reason || null,
      revokedBy: row.revoked_by || null,
      requestId: requestId || null,
    };
  } catch (error) {
    await connection.rollback().catch(() => {});
    if (error?.code === 'ER_NO_SUCH_TABLE') {
      throw Object.assign(new Error('Session revocation storage is unavailable'), {
        code: 'SESSION_REVOCATION_UNAVAILABLE', status: 503,
      });
    }
    throw error;
  } finally {
    connection.release();
  }
}

function applyLocalRevocation(uid, cutoffMs) {
  const current = localCutoffs.get(uid) || 0;
  if (cutoffMs > current) localCutoffs.set(uid, cutoffMs);
}

/** Diagnostics for the platform console: latest revocation for one user. */
async function latestRevocation(uid) {
  const [rows] = await pool().query(
    `SELECT id, user_id, scope, UNIX_TIMESTAMP(revoked_at) AS cutoff, expires_at, reason, revoked_by
       FROM revoked_sessions WHERE user_id = ? ORDER BY revoked_at DESC LIMIT 1`,
    [String(uid)]
  );
  if (!rows || !rows.length) return null;
  const row = rows[0];
  return {
    id: row.id,
    uid: row.user_id,
    scope: row.scope,
    revokedAt: Number(row.cutoff) ? new Date(Number(row.cutoff) * 1000).toISOString() : null,
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    reason: row.reason || null,
    revokedBy: row.revoked_by || null,
  };
}

/**
 * Explicitly revokes a specific JWT token by its JTI claim.
 * Persists into MariaDB revoked_sessions with scope 'JTI' and applies immediately locally.
 */
async function revokeTokenJti({ jti, _uid = null, reason = null, actorUid = null, expiresInSeconds = null }) {
  const tokenJti = String(jti || '').trim();
  if (!tokenJti || tokenJti.length > 128) {
    throw Object.assign(new Error('A valid token JTI identifier is required'), { code: 'INVALID_JTI', status: 400 });
  }
  const id = `rvs_jti_${crypto.randomUUID()}`;
  const horizon = Number.isSafeInteger(Number(expiresInSeconds)) && Number(expiresInSeconds) > 0
    ? Number(expiresInSeconds)
    : horizonSeconds();
  const safeReason = reason ? String(reason).slice(0, 255) : null;
  const db = pool();
  await db.query(
    `INSERT INTO revoked_sessions (id, user_id, scope, revoked_at, expires_at, reason, revoked_by)
     VALUES (?, ?, 'JTI', CURRENT_TIMESTAMP(3), DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL ? SECOND), ?, ?)`,
    [id, tokenJti, horizon, safeReason, actorUid ? String(actorUid).slice(0, 128) : null]
  );
  localRevokedJtis.add(tokenJti);
  return { id, jti: tokenJti, scope: 'JTI', reason: safeReason };
}

// ─── Test seams ─────────────────────────────────────────────────────────────
// Only reachable from NODE_ENV=test (or when the platform explicitly allows the
// auth test seams), so a production process can never be talked out of a
// revocation by a test helper.
function assertTestSeam() {
  if (process.env.NODE_ENV !== 'test' && process.env.ALLOW_TEST_AUTH_VERIFIER !== 'true') {
    throw new Error('Session revocation test seams are disabled outside tests');
  }
}

function resetForTests() {
  assertTestSeam();
  localCutoffs.clear();
  localRevokedJtis.clear();
}

function applyLocalRevocationForTests(uid, cutoffMs) {
  assertTestSeam();
  applyLocalRevocation(String(uid), Number(cutoffMs) || Date.now());
}

function applyLocalJtiRevocationForTests(jti) {
  assertTestSeam();
  localRevokedJtis.add(String(jti));
}

module.exports = {
  DEFAULT_HORIZON_SECONDS,
  applyLocalJtiRevocationForTests,
  applyLocalRevocationForTests,
  assertSessionActive,
  enforced,
  horizonSeconds,
  issuedAtSeconds,
  latestRevocation,
  resetForTests,
  revokeTokenJti,
  revokeUserSessions,
  _localCutoffs: localCutoffs,
  _localRevokedJtis: localRevokedJtis,
};
