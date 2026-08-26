'use strict';

/**
 * Durable notification outbox — TRANSACTIONAL OUTBOX PATTERN on MySQL/MariaDB.
 *
 * Mission architecture (§7–§10):
 *  - Business mutation + outbox event commit in the SAME MySQL transaction
 *    (`queueEmailInTransaction` receives the caller's transaction connection).
 *  - A background worker (`processOutboxOnce`) leases due events, dispatches
 *    them through the email provider, and records outcomes with retry,
 *    exponential backoff + jitter, and dead-letter handling.
 *  - The user's HTTP request NEVER waits on delivery; success means the MySQL
 *    transaction (business data + event) committed.
 *  - ZERO legacy-cloud-database dependency: the queue lives in the
 *    `notification_outbox` MySQL table and functions with every external
 *    secondary system completely unavailable.
 *
 * Durability semantics:
 *  - Leases (lease_owner + lease_expires_at) mean a crashed worker never loses
 *    an event: expired leases are reclaimed, and redelivery is safe because
 *    delivery is idempotent per (channel, eventId) identity.
 *  - Terminal records (provider accepted / DEAD_LETTER) leave the due-query
 *    index (state transitions out of the active set), so they are never
 *    re-claimed by the due scan.
 */

const crypto = require('crypto');
const { tenantContextAuditProjection } = require('../enterprise/tenantContext');

const MAX_ATTEMPTS = 5;
const BASE_RETRY_MS = 60_000;
const MAX_RETRY_MS = 60 * 60_000;
const LEASE_MS = 2 * 60_000;
const ACTIVE_STATES = ['NOTIFICATION_QUEUED', 'RETRYING', 'DELIVERY_ATTEMPTED'];

function outboxId(eventId, channel = 'email') {
  return crypto.createHash('sha256').update(`${channel}\0${eventId}`).digest('hex');
}

function validEmail(value) {
  return /^[^\s@,;<>]{1,64}@[^\s@,;<>]{1,190}$/.test(String(value || '').trim());
}

function retryDelay(attemptCount, withJitter = false) {
  const baseDelay = Math.min(MAX_RETRY_MS, BASE_RETRY_MS * (2 ** Math.max(0, attemptCount - 1)));
  if (!withJitter) return baseDelay;
  // Full jitter: decorrelates retry storms across concurrent workers (0.8x - 1.2x)
  const jitterFactor = 0.8 + Math.random() * 0.4;
  return Math.min(MAX_RETRY_MS, Math.round(baseDelay * jitterFactor));
}

function parseJsonField(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (_e) { return fallback; }
}

function normalizeRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    eventId: row.event_id,
    channel: row.channel,
    recipient: row.recipient,
    templateType: row.template_type,
    vars: parseJsonField(row.vars, {}),
    metadata: parseJsonField(row.metadata, {}),
    tenant: row.tenant_id ? { tenantId: row.tenant_id } : (parseJsonField(row.metadata, {})?.tenant || null),
    state: row.state,
    attemptCount: Number(row.attempt_count || 0),
    maxAttempts: Number(row.max_attempts || MAX_ATTEMPTS),
    providerAccepted: row.provider_accepted === 1 || row.provider_accepted === true,
    nextAttemptAt: Number(row.next_attempt_at || 0),
    leaseOwner: row.lease_owner || null,
    leaseExpiresAt: Number(row.lease_expires_at || 0),
    lastError: row.last_error || null,
  };
}

/**
 * Enqueue a notification inside the caller's MySQL transaction.
 *
 * @param {object} connection mysql2 connection (ideally the caller's
 *   transaction connection so business data + event commit atomically)
 * @param {object} params { eventId, recipient, templateType, vars, metadata, tenantContext, idempotencyKey }
 * @returns {string} deterministic outbox row id
 */
async function queueEmailInTransaction(connection, { eventId, recipient, templateType, vars = {}, metadata = {}, tenantContext = null, idempotencyKey = null } = {}) {
  if (!connection || typeof connection.query !== 'function') throw new Error('Invalid notification outbox event');
  if (!eventId || !validEmail(recipient) || !/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(String(templateType || ''))) throw new Error('Invalid notification outbox event');
  const id = outboxId(eventId);
  const tenant = tenantContext ? tenantContextAuditProjection(tenantContext) : null;
  const idemKey = idempotencyKey || `email:${id}`;
  // INSERT IGNORE + unique idempotency_key: repeating the same business
  // mutation (retry, duplicate webhook) never creates a duplicate event.
  await connection.query(
    `INSERT IGNORE INTO notification_outbox
       (id, event_id, channel, recipient, template_type, vars, metadata, tenant_id, idempotency_key, state, attempt_count, next_attempt_at, created_at)
     VALUES (?, ?, 'email', ?, ?, ?, ?, ?, ?, 'NOTIFICATION_QUEUED', 0, ?, NOW(6))`,
    [
      id,
      String(eventId).slice(0, 300),
      String(recipient).trim().toLowerCase(),
      String(templateType),
      JSON.stringify(vars || {}),
      JSON.stringify({ ...(metadata || {}), ...(tenant ? { tenant } : {}) }),
      tenant?.tenantId || null,
      String(idemKey).slice(0, 128),
      Date.now(),
    ]
  );
  return id;
}

/**
 * Claim one due event with a lease. Concurrency-safe: the UPDATE acts as an
 * atomic claim (only one worker can flip a row's lease). Expired leases from
 * crashed workers are reclaimable.
 */
async function claimDueEvent(pool, workerId, now = Date.now()) {
  const placeholders = ACTIVE_STATES.map(() => '?').join(',');
  // Candidates: active state, due, not leased (or lease expired), under max
  // attempts, and never already accepted by the provider (exactly-once intent).
  const [candidates] = await pool.query(
    `SELECT id FROM notification_outbox
      WHERE state IN (${placeholders})
        AND provider_accepted = 0
        AND next_attempt_at <= ?
        AND (lease_expires_at = 0 OR lease_expires_at <= ?)
        AND attempt_count < max_attempts
      ORDER BY next_attempt_at ASC
      LIMIT 10`,
    [...ACTIVE_STATES, now, now]
  );
  for (const candidate of candidates) {
    const [claimed] = await pool.query(
      `UPDATE notification_outbox
        SET lease_owner = ?, lease_expires_at = ?, state = 'DELIVERY_ATTEMPTED', last_attempt_at = NOW(6)
        WHERE id = ?
          AND state IN (${placeholders})
          AND provider_accepted = 0
          AND (lease_expires_at = 0 OR lease_expires_at <= ?)
          AND attempt_count < max_attempts`,
      [workerId, now + LEASE_MS, candidate.id, ...ACTIVE_STATES, now]
    );
    if (claimed.affectedRows === 1) {
      const [rows] = await pool.query('SELECT * FROM notification_outbox WHERE id = ?', [candidate.id]);
      return normalizeRow(rows[0]);
    }
  }
  return null;
}

/**
 * Record the outcome of a delivery attempt under the lease. If the lease was
 * stolen (another worker reclaimed an expired lease), this write is a no-op —
 * duplicate delivery stays safe.
 */
async function finishAttempt(pool, event, workerId, result, now = Date.now()) {
  const attemptCount = Number(event.attemptCount || 0) + 1;
  if (result?.success) {
    // Terminal success: provider_accepted is permanent and the row moves to
    // DELIVERED (outside the active-state set), so the due-query index can
    // never re-claim it even if next_attempt_at is reset.
    await pool.query(
      `UPDATE notification_outbox
        SET provider_accepted = 1, state = 'DELIVERED', provider_accepted_at = NOW(6), attempt_count = ?,
            lease_owner = NULL, lease_expires_at = 0, next_attempt_at = 0, last_error = NULL
        WHERE id = ? AND lease_owner = ?`,
      [attemptCount, event.id, workerId]
    );
    return;
  }
  const terminal = attemptCount >= Number(event.maxAttempts || MAX_ATTEMPTS);
  await pool.query(
    `UPDATE notification_outbox
      SET state = ?, attempt_count = ?, next_attempt_at = ?, last_error = ?,
          lease_owner = NULL, lease_expires_at = 0
      WHERE id = ? AND lease_owner = ?`,
    [
      terminal ? 'DEAD_LETTER' : 'RETRYING',
      attemptCount,
      terminal ? 0 : now + retryDelay(attemptCount, true),
      String(result?.error || 'Provider attempt failed').slice(0, 500),
      event.id,
      workerId,
    ]
  );
}

/**
 * Process at most one due event. Designed to run on an interval: crash-safe,
 * lease-based, idempotent on redelivery.
 */
async function processOutboxOnce({ pool, dispatch, authorize = null, workerId = crypto.randomUUID(), now = Date.now() }) {
  const event = await claimDueEvent(pool, workerId, now);
  if (!event) return { processed: false };
  let result;
  try {
    // Tenant-bound events are fail-closed unless the worker explicitly
    // reauthorizes them at execution time.
    const authorized = event.tenant ? (typeof authorize === 'function' && await authorize(event)) : true;
    if (authorized !== true) {
      result = { success: false, error: 'TENANT_CONTEXT_REAUTHORIZATION_FAILED' };
    } else {
      result = await dispatch(event);
    }
  } catch (error) { result = { success: false, error: error.message }; }
  await finishAttempt(pool, event, workerId, result, now);
  return { processed: true, eventId: event.eventId, providerAccepted: result?.success === true };
}

module.exports = { MAX_ATTEMPTS, outboxId, queueEmailInTransaction, claimDueEvent, finishAttempt, processOutboxOnce, retryDelay, normalizeRow };
