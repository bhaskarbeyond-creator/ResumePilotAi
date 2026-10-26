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
 *    an event: expired leases are reclaimed.
 *  - SMTP does not provide an idempotency key. A process crash after provider
 *    acceptance but before the acknowledgement update can cause redelivery;
 *    this queue is durable at-least-once delivery, not exactly-once delivery.
 *  - Terminal records (provider accepted / DEAD_LETTER) leave the due-query
 *    index (state transitions out of the active set), so they are never
 *    re-claimed by the due scan.
 */

const crypto = require('crypto');
const { tenantContextAuditProjection } = require('../enterprise/tenantContext');
const { createEncryptionProvider, isEncryptedEnvelope } = require('../enterprise/encryptionProvider');

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
  const storedVars = parseJsonField(row.vars, {});
  let vars = storedVars;
  let payloadError = null;
  if (isEncryptedEnvelope(storedVars)) {
    try {
      const provider = createEncryptionProvider(process.env);
      if (!provider) throw Object.assign(new Error('Outbox encryption key unavailable'), { code: 'OUTBOX_ENCRYPTION_UNAVAILABLE' });
      vars = provider.decryptValue(storedVars);
      if (!vars || typeof vars !== 'object' || Array.isArray(vars)) throw new Error('Decrypted outbox variables are invalid');
    } catch (error) {
      vars = {};
      payloadError = error.code || 'OUTBOX_PAYLOAD_DECRYPTION_FAILED';
    }
  }
  return {
    id: row.id,
    eventId: row.event_id,
    channel: row.channel,
    recipient: row.recipient,
    templateType: row.template_type,
    vars,
    payloadError,
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
async function queueEmailInTransaction(connection, { eventId, recipient, templateType, vars = {}, metadata = {}, tenantContext = null, idempotencyKey = null, sensitive = false } = {}) {
  if (!connection || typeof connection.query !== 'function') throw new Error('Invalid notification outbox event');
  if (!eventId || !validEmail(recipient) || !/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(String(templateType || ''))) throw new Error('Invalid notification outbox event');
  const id = outboxId(eventId);
  const tenant = tenantContext ? tenantContextAuditProjection(tenantContext) : null;
  const idemKey = idempotencyKey || `email:${id}`;
  let storedVars = vars || {};
  if (sensitive) {
    const provider = createEncryptionProvider(process.env);
    if (!provider) {
      throw Object.assign(new Error('Server-side encryption is required for sensitive notification payloads.'), {
        code: 'OUTBOX_ENCRYPTION_UNAVAILABLE', status: 503,
      });
    }
    storedVars = provider.encryptValue(storedVars);
  }
  // A no-op duplicate-key update preserves idempotency without INSERT IGNORE,
  // which would also suppress truncation and constraint failures. The locked
  // row is validated so a reused idempotency key cannot bind a caller to an
  // unrelated notification.
  const normalizedEventId = String(eventId).slice(0, 300);
  const normalizedRecipient = String(recipient).trim().toLowerCase();
  const normalizedTemplate = String(templateType);
  const normalizedIdempotencyKey = String(idemKey).slice(0, 128);
  const [insertResult] = await connection.query(
    `INSERT INTO notification_outbox
       (id, event_id, channel, recipient, template_type, vars, metadata, tenant_id, idempotency_key, state, attempt_count, next_attempt_at, created_at)
     VALUES (?, ?, 'email', ?, ?, ?, ?, ?, ?, 'NOTIFICATION_QUEUED', 0, ?, NOW(6))
     ON DUPLICATE KEY UPDATE id = id`,
    [
      id,
      normalizedEventId,
      normalizedRecipient,
      normalizedTemplate,
      JSON.stringify(storedVars),
      JSON.stringify({ ...(metadata || {}), ...(tenant ? { tenant } : {}) }),
      tenant?.tenantId || null,
      normalizedIdempotencyKey,
      Date.now(),
    ]
  );
  if (Number(insertResult?.affectedRows || 0) === 1) return id;
  const [rows] = await connection.query(
    'SELECT id, event_id, recipient, template_type FROM notification_outbox WHERE idempotency_key = ? FOR UPDATE',
    [normalizedIdempotencyKey]
  );
  const persisted = rows[0];
  if (!persisted || persisted.id !== id || persisted.event_id !== normalizedEventId
      || persisted.recipient !== normalizedRecipient || persisted.template_type !== normalizedTemplate) {
    throw Object.assign(new Error('Notification idempotency key is already bound to a different event'), {
      code: 'NOTIFICATION_IDEMPOTENCY_CONFLICT', status: 409,
    });
  }
  return persisted.id;
}

/** Enqueue an operator/system notification as its own durable mutation. Product
 * lifecycle services should prefer queueEmailInTransaction with their existing
 * business transaction. */
async function queueEmail(pool, params) {
  if (!pool?.getConnection) throw new Error('A MariaDB pool is required');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const id = await queueEmailInTransaction(connection, params);
    await connection.commit();
    return id;
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Claim one due event with a lease. Concurrency-safe: the UPDATE acts as an
 * atomic claim (only one worker can flip a row's lease). Expired leases from
 * crashed workers are reclaimable.
 */
async function claimDueEvent(pool, workerId, now = Date.now()) {
  const placeholders = ACTIVE_STATES.map(() => '?').join(',');
  // Candidates: active state, due, not leased (or lease expired), under max
  // attempts, and not acknowledged as provider-accepted in our local ledger.
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
 * the stale worker cannot overwrite the new lease owner. Provider-side duplication
 * remains possible in the SMTP acceptance/acknowledgement crash window.
 */
async function updateInvitationDeliveryProjection(pool, event, state, error = null) {
  if (event?.templateType !== 'enterprise-invitation') return;
  await pool.query(
    `UPDATE enterprise_membership_invitations
     SET deliveryState = ?, deliveredAt = CASE WHEN ? = 'DELIVERED' THEN NOW(6) ELSE deliveredAt END,
         lastDeliveryError = ?, updated_at = NOW(6)
     WHERE notificationId = ?`,
    [state, state, error ? String(error).slice(0, 500) : null, event.id]
  );
}

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
    await updateInvitationDeliveryProjection(pool, event, 'DELIVERED');
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
  await updateInvitationDeliveryProjection(
    pool,
    event,
    terminal ? 'DEAD_LETTER' : 'RETRYING',
    result?.error || 'Provider attempt failed'
  );
}

/**
 * Process at most one due event. Designed to run on an interval: crash-safe,
 * lease-based, with deterministic local event identity and at-least-once delivery.
 */
async function processOutboxOnce({ pool, dispatch, authorize = null, workerId = crypto.randomUUID(), now = Date.now() }) {
  const event = await claimDueEvent(pool, workerId, now);
  if (!event) return { processed: false };
  let result;
  try {
    if (event.payloadError) {
      result = { success: false, error: event.payloadError };
    } else {
      // Tenant-bound events are fail-closed unless the worker explicitly
      // reauthorizes them at execution time.
      const authorized = event.tenant ? (typeof authorize === 'function' && await authorize(event)) : true;
      if (authorized !== true) {
        result = { success: false, error: 'TENANT_CONTEXT_REAUTHORIZATION_FAILED' };
      } else {
        result = await dispatch(event);
      }
    }
  } catch (error) { result = { success: false, error: error.message }; }
  await finishAttempt(pool, event, workerId, result, now);
  return { processed: true, eventId: event.eventId, providerAccepted: result?.success === true };
}

module.exports = { MAX_ATTEMPTS, outboxId, queueEmailInTransaction, queueEmail, claimDueEvent, finishAttempt, processOutboxOnce, retryDelay, normalizeRow };
