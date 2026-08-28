'use strict';

const crypto = require('crypto');
const { getPool } = require('../database/mysql');
const { validateTenantJobEnvelope } = require('./tenantJobs');
const { assertUuid } = require('./tenantContext');

const OUTBOX_TABLE = 'enterprise_outbox';
const CLAIMABLE_STATES = Object.freeze(['QUEUED', 'RETRYING', 'PROCESSING']);
const TERMINAL_STATES = Object.freeze(['COMPLETED', 'DEAD_LETTER', 'REJECTED']);
const ALL_STATES = Object.freeze([...CLAIMABLE_STATES, ...TERMINAL_STATES]);
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BASE_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 10 * 60_000;
const DEFAULT_LEASE_MS = 2 * 60_000;
const DEFAULT_TTL_MS = 24 * 60 * 60_000;
const DEFAULT_PAGE_LIMIT = 50;

function resolvePool(pool) {
  const resolved = pool || getPool();
  if (!resolved?.query || resolved._closed) {
    throw Object.assign(new Error('Enterprise outbox requires an available MariaDB pool'), {
      code: 'ENTERPRISE_OUTBOX_UNAVAILABLE', status: 503,
    });
  }
  return resolved;
}

function outboxDocumentId(tenantId, idempotencyKey) {
  tenantId = assertUuid(tenantId, 'Tenant identifier');
  const key = String(idempotencyKey || '').trim();
  if (!key || key.length > 200) {
    throw Object.assign(new Error('A bounded idempotency key is required'), { code: 'INVALID_TENANT_JOB', status: 400 });
  }
  return crypto.createHash('sha256').update(`${tenantId}\u0000${key}`).digest('hex');
}

function backoffDelayMs(attemptCount, { baseMs = DEFAULT_BASE_BACKOFF_MS, jitter = true } = {}) {
  const boundedBase = Math.max(250, Math.min(Number(baseMs) || DEFAULT_BASE_BACKOFF_MS, MAX_BACKOFF_MS));
  const exponential = Math.min(MAX_BACKOFF_MS, boundedBase * (2 ** Math.max(0, Number(attemptCount || 1) - 1)));
  if (!jitter) return exponential;
  return Math.max(250, Math.round(exponential * (0.8 + Math.random() * 0.4)));
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseJson(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function boundedJson(value, maxBytes = 256_000) {
  const serialized = JSON.stringify(value === undefined ? null : value);
  if (Buffer.byteLength(serialized) > maxBytes) {
    throw Object.assign(new Error('Enterprise outbox payload exceeds the durable queue limit'), {
      code: 'ENTERPRISE_OUTBOX_PAYLOAD_TOO_LARGE', status: 413,
    });
  }
  return serialized;
}

// Correlation, submission time, generated job id, and signature may legitimately
// differ across delivery attempts. Every field that determines authorization,
// routing, policy, data classification, or work performed is immutable for an
// idempotency key.
function immutableJobIntent(envelope = {}) {
  return {
    schemaVersion: Number(envelope.schemaVersion || 0),
    jobType: envelope.jobType || null,
    tenantId: envelope.tenantId || null,
    workspaceId: envelope.workspaceId || null,
    dataPlaneId: envelope.dataPlaneId || null,
    routingVersion: Number(envelope.routingVersion || 0),
    cacheProfile: envelope.cacheProfile || null,
    queueProfile: envelope.queueProfile || null,
    storageProfile: envelope.storageProfile || null,
    aiProfile: envelope.aiProfile || null,
    actorType: envelope.actorType || null,
    principalId: envelope.principalId || null,
    subjectId: envelope.subjectId || null,
    identityIssuer: envelope.identityIssuer || null,
    resource: {
      type: envelope.resource?.type || null,
      id: envelope.resource?.id || null,
      revision: Number(envelope.resource?.revision || 0),
    },
    policyVersion: Number(envelope.policyVersion || 0),
    idempotencyKey: envelope.idempotencyKey || null,
    classification: envelope.classification || 'PRIVATE',
  };
}

function mapJob(row) {
  if (!row) return null;
  return {
    jobId: row.id,
    tenantId: row.tenantId,
    workspaceId: row.workspaceId || null,
    principalId: row.principalId,
    subjectId: row.subjectId || null,
    identityIssuer: row.identityIssuer,
    actorType: row.actorType,
    jobType: row.jobType,
    correlationId: row.correlationId || null,
    idempotencyKey: row.idempotencyKey,
    classification: row.classification,
    envelope: parseJson(row.envelope, {}),
    status: row.status,
    attemptCount: Number(row.attemptCount || 0),
    maxAttempts: Number(row.maxAttempts || DEFAULT_MAX_ATTEMPTS),
    nextAttemptAt: row.nextAttemptAt,
    expiresAt: row.expiresAt,
    leaseOwner: row.leaseOwner || null,
    leaseExpiresAt: row.leaseExpiresAt || null,
    lastError: row.lastError || null,
    rejectedReason: row.rejectedReason || null,
    result: parseJson(row.result, null),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completedAt || null,
  };
}

/** Idempotently enqueue a signed job envelope. */
async function enqueueOutboxJob({ pool = null, connection = null, envelope, now = Date.now(), maxAttempts = DEFAULT_MAX_ATTEMPTS, ttlMs = DEFAULT_TTL_MS }) {
  const executor = connection || resolvePool(pool);
  const submittedAt = toMillis(envelope?.submittedAt) || now;
  const jobId = outboxDocumentId(envelope?.tenantId, envelope?.idempotencyKey);
  const max = Math.max(1, Math.min(Number(maxAttempts) || DEFAULT_MAX_ATTEMPTS, 25));
  const expiresAt = new Date(submittedAt + Math.max(60_000, Number(ttlMs) || DEFAULT_TTL_MS));
  const [result] = await executor.query(
    `INSERT INTO enterprise_outbox
      (id, tenantId, workspaceId, principalId, subjectId, identityIssuer, actorType,
       jobType, correlationId, idempotencyKey, classification, envelope, status,
       attemptCount, maxAttempts, nextAttemptAt, expiresAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'QUEUED', 0, ?, ?, ?)
     ON DUPLICATE KEY UPDATE id = VALUES(id)`,
    [jobId, envelope.tenantId, envelope.workspaceId || null, envelope.principalId,
      envelope.subjectId || null, envelope.identityIssuer, envelope.actorType,
      envelope.jobType, envelope.correlationId || null, envelope.idempotencyKey,
      envelope.classification || 'PRIVATE', boundedJson(envelope), max, new Date(now), expiresAt]
  );
  if (Number(result.affectedRows || 0) === 1) return { status: 'ENQUEUED', jobId, queueLength: null };
  const [rows] = await executor.query(
    'SELECT status, tenantId, workspaceId, principalId, jobType, classification, envelope FROM enterprise_outbox WHERE id = ?',
    [jobId]
  );
  const existing = rows[0];
  const storedEnvelope = parseJson(existing?.envelope, {});
  const sameIntent = existing
    && existing.tenantId === envelope.tenantId
    && (existing.workspaceId || null) === (envelope.workspaceId || null)
    && existing.principalId === envelope.principalId
    && existing.jobType === envelope.jobType
    && existing.classification === (envelope.classification || 'PRIVATE')
    && JSON.stringify(immutableJobIntent(storedEnvelope)) === JSON.stringify(immutableJobIntent(envelope));
  if (!sameIntent) {
    throw Object.assign(new Error('Enterprise outbox idempotency key is already bound to a different job'), {
      code: 'ENTERPRISE_OUTBOX_IDEMPOTENCY_CONFLICT', status: 409,
    });
  }
  return { status: existing.status === 'COMPLETED' ? 'DUPLICATE_IGNORED' : 'ALREADY_QUEUED', jobId };
}

/** Atomically lease one due job; SKIP LOCKED permits concurrent workers. */
async function claimNextOutboxJob({ pool = null, workerId, now = Date.now(), leaseMs = DEFAULT_LEASE_MS }) {
  const resolvedPool = resolvePool(pool);
  const owner = String(workerId || '').slice(0, 128);
  if (!owner) throw Object.assign(new Error('Enterprise outbox worker id is required'), { code: 'ENTERPRISE_OUTBOX_WORKER_INVALID', status: 500 });
  const connection = await resolvedPool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT * FROM enterprise_outbox
       WHERE expiresAt > ? AND (
         (status IN ('QUEUED', 'RETRYING') AND nextAttemptAt <= ?)
         OR (status = 'PROCESSING' AND leaseExpiresAt <= ?)
       )
       ORDER BY nextAttemptAt ASC, created_at ASC
       LIMIT 1 FOR UPDATE SKIP LOCKED`,
      [new Date(now), new Date(now), new Date(now)]
    );
    if (!rows.length) {
      await connection.commit();
      return null;
    }
    const row = rows[0];
    const attemptCount = Number(row.attemptCount || 0) + 1;
    await connection.query(
      `UPDATE enterprise_outbox
       SET status = 'PROCESSING', attemptCount = ?, leaseOwner = ?, leaseExpiresAt = ?,
           lastAttemptAt = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [attemptCount, owner, new Date(now + Math.max(5_000, Number(leaseMs) || DEFAULT_LEASE_MS)), new Date(now), row.id]
    );
    await connection.commit();
    return { ...mapJob(row), status: 'PROCESSING', attemptCount, leaseOwner: owner, leaseExpiresAt: new Date(now + leaseMs) };
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

async function completeOutboxJob({ pool = null, job, workerId, result = null, now = Date.now() }) {
  if (!job?.jobId) return { status: 'INVALID_JOB' };
  const [update] = await resolvePool(pool).query(
    `UPDATE enterprise_outbox
     SET status = 'COMPLETED', result = ?, completedAt = ?, leaseOwner = NULL,
         leaseExpiresAt = NULL, lastError = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = 'PROCESSING' AND leaseOwner = ?`,
    [boundedJson(result), new Date(now), job.jobId, String(workerId)]
  );
  return Number(update.affectedRows || 0) === 1
    ? { status: 'COMPLETED', jobId: job.jobId }
    : { status: 'LEASE_LOST', jobId: job.jobId };
}

async function failOutboxJob({ pool = null, job, workerId, error, now = Date.now(), backoffBaseMs = DEFAULT_BASE_BACKOFF_MS, backoffJitter = true }) {
  if (!job?.jobId) return { status: 'INVALID_JOB' };
  const resolvedPool = resolvePool(pool);
  const connection = await resolvedPool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query('SELECT * FROM enterprise_outbox WHERE id = ? FOR UPDATE', [job.jobId]);
    const row = rows[0];
    if (!row || row.status !== 'PROCESSING' || row.leaseOwner !== String(workerId)) {
      await connection.rollback();
      return { status: 'LEASE_LOST', jobId: job.jobId };
    }
    const attemptCount = Number(row.attemptCount || 1);
    const terminal = attemptCount >= Math.max(1, Number(row.maxAttempts || DEFAULT_MAX_ATTEMPTS));
    const delay = backoffDelayMs(attemptCount, { baseMs: backoffBaseMs, jitter: backoffJitter });
    await connection.query(
      `UPDATE enterprise_outbox
       SET status = ?, lastError = ?, nextAttemptAt = ?, dlqAt = ?,
           leaseOwner = NULL, leaseExpiresAt = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [terminal ? 'DEAD_LETTER' : 'RETRYING',
        String(error?.message || error || 'Job execution failed').slice(0, 500),
        terminal ? row.nextAttemptAt : new Date(now + delay), terminal ? new Date(now) : null, row.id]
    );
    await connection.commit();
    return terminal
      ? { status: 'DEAD_LETTER', jobId: row.id, attemptCount }
      : { status: 'RETRY_SCHEDULED', jobId: row.id, attemptCount, backoffMs: delay, nextRunAt: now + delay };
  } catch (failure) {
    await connection.rollback().catch(() => {});
    throw failure;
  } finally {
    connection.release();
  }
}

async function rejectOutboxJob({ pool = null, job, reason, now = Date.now() }) {
  if (!job?.jobId) return { status: 'INVALID_JOB' };
  const [update] = await resolvePool(pool).query(
    `UPDATE enterprise_outbox
     SET status = 'REJECTED', rejectedReason = ?, rejectedAt = ?, leaseOwner = NULL,
         leaseExpiresAt = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status NOT IN ('COMPLETED', 'REJECTED')`,
    [String(reason || 'JOB_REJECTED').slice(0, 200), new Date(now), job.jobId]
  );
  return Number(update.affectedRows || 0) === 1
    ? { status: 'REJECTED', jobId: job.jobId, reason: String(reason || 'JOB_REJECTED') }
    : { status: 'NOT_FOUND', jobId: job.jobId };
}

async function replayDeadLetterJob({ pool = null, jobId, context, now = Date.now() }) {
  if (!context?.tenantId || !context?.principalId) {
    throw Object.assign(new Error('Verified tenant context is required to replay jobs'), { code: 'TENANT_CONTEXT_REQUIRED', status: 403 });
  }
  const resolvedPool = resolvePool(pool);
  const connection = await resolvedPool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      'SELECT * FROM enterprise_outbox WHERE id = ? AND tenantId = ? FOR UPDATE',
      [String(jobId || ''), context.tenantId]
    );
    const row = rows[0];
    if (!row || row.status !== 'DEAD_LETTER') {
      await connection.rollback();
      return { status: 'NOT_FOUND', jobId: String(jobId || '') };
    }
    if (toMillis(row.expiresAt) <= now) {
      await connection.rollback();
      return { status: 'EXPIRED_NOT_REPLAYABLE', jobId: row.id };
    }
    await connection.query(
      `UPDATE enterprise_outbox
       SET status = 'QUEUED', attemptCount = 0, nextAttemptAt = ?, replayedBy = ?,
           replayedAt = ?, dlqAt = NULL, lastError = NULL, leaseOwner = NULL,
           leaseExpiresAt = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [new Date(now), context.principalId, new Date(now), row.id]
    );
    await connection.query(
      `INSERT INTO enterprise_audit_events
       (id, tenantId, workspaceId, actorPrincipalId, action, category, severity,
        resourceType, resourceId, metadata, occurredAt)
       VALUES (?, ?, ?, ?, 'JOB_REPLAYED', 'tenant.jobs', 'HIGH', ?, ?, ?, ?)`,
      [crypto.randomUUID(), context.tenantId, row.workspaceId || context.workspaceId || null,
        context.principalId, row.jobType, row.id, JSON.stringify({ jobType: row.jobType }), new Date(now)]
    );
    await connection.commit();
    return { status: 'REPLAYED', jobId: row.id };
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

async function reauthorizeJobPrincipal({ tenantService, envelope }) {
  if (!tenantService?.resolveContext) {
    throw Object.assign(new Error('Enterprise worker requires a tenant service for reauthorization'), { code: 'ENTERPRISE_OUTBOX_UNAUTHORIZED', status: 403 });
  }
  if (String(envelope.identityIssuer || '') !== 'firebase' || !envelope.subjectId) {
    throw Object.assign(new Error('Job identity cannot be reauthorized by this worker'), { code: 'ENTERPRISE_OUTBOX_UNAUTHORIZED', status: 403 });
  }
  const resolved = await tenantService.resolveContext({
    user: { uid: envelope.subjectId, email: null, emailVerified: true, claims: {} },
    requestedTenantId: envelope.tenantId,
    requestedWorkspaceId: envelope.workspaceId,
    requestId: envelope.correlationId,
  });
  if (resolved.context.principalId !== envelope.principalId) {
    throw Object.assign(new Error('Job principal no longer matches the verified identity'), { code: 'ENTERPRISE_OUTBOX_UNAUTHORIZED', status: 403 });
  }
  return resolved.context;
}

const REJECT_ERROR_CODES = new Set([
  'INVALID_TENANT_JOB', 'INVALID_TENANT_JOB_SIGNATURE', 'EXPIRED_TENANT_JOB',
  'TENANT_INACTIVE', 'TENANT_MEMBERSHIP_INACTIVE', 'TENANT_MEMBERSHIP_NOT_FOUND',
  'TENANT_NOT_FOUND', 'WORKSPACE_NOT_FOUND', 'WORKSPACE_MEMBERSHIP_NOT_FOUND',
  'ENTERPRISE_OUTBOX_UNAUTHORIZED', 'TENANT_CONTEXT_REQUIRED',
]);

async function runOutboxWorkerOnce({
  pool = null,
  tenantService,
  signingSecret,
  handlers,
  workerId = `${process.pid}-${crypto.randomUUID()}`,
  now = Date.now(),
  maxJobs = 5,
  leaseMs = DEFAULT_LEASE_MS,
  backoffBaseMs = DEFAULT_BASE_BACKOFF_MS,
  backoffJitter = true,
}) {
  const resolvedPool = resolvePool(pool);
  if (!signingSecret || Buffer.byteLength(String(signingSecret)) < 32) {
    throw Object.assign(new Error('Enterprise outbox worker requires the tenant job signing secret'), { code: 'TENANT_JOB_SIGNING_UNAVAILABLE', status: 503 });
  }
  const outcomes = [];
  for (let index = 0; index < Math.max(1, Math.min(Number(maxJobs) || 1, 100)); index += 1) {
    const job = await claimNextOutboxJob({ pool: resolvedPool, workerId, now, leaseMs });
    if (!job) break;
    try {
      const envelope = validateTenantJobEnvelope(job.envelope, signingSecret, { now });
      if (toMillis(job.expiresAt) <= now) {
        throw Object.assign(new Error('Tenant job is expired'), { code: 'EXPIRED_TENANT_JOB', status: 409 });
      }
      const context = await reauthorizeJobPrincipal({ tenantService, envelope });
      const handler = handlers?.[envelope.jobType];
      if (typeof handler !== 'function') {
        throw Object.assign(new Error(`No handler registered for job type ${envelope.jobType}`), { code: 'OUTBOX_HANDLER_MISSING', status: 500 });
      }
      const result = await handler({ envelope, context, job });
      outcomes.push(await completeOutboxJob({ pool: resolvedPool, job, workerId, result, now }));
    } catch (error) {
      const code = String(error?.code || '');
      outcomes.push(REJECT_ERROR_CODES.has(code)
        ? await rejectOutboxJob({ pool: resolvedPool, job, reason: code || 'JOB_REJECTED', now })
        : await failOutboxJob({ pool: resolvedPool, job, workerId, error, now, backoffBaseMs, backoffJitter }));
    }
  }
  return outcomes;
}

async function sweepExpiredJobs({ pool = null, now = Date.now(), limit = 50 }) {
  const resolvedPool = resolvePool(pool);
  const bounded = Math.max(1, Math.min(Number(limit) || 50, 500));
  const [rows] = await resolvedPool.query(
    `SELECT id FROM enterprise_outbox
     WHERE status IN ('QUEUED', 'RETRYING') AND expiresAt <= ?
     ORDER BY expiresAt ASC LIMIT ?`,
    [new Date(now), bounded]
  );
  const outcomes = [];
  for (const row of rows) outcomes.push(await rejectOutboxJob({ pool: resolvedPool, job: { jobId: row.id }, reason: 'EXPIRED_TENANT_JOB', now }));
  return outcomes;
}

async function getOutboxStatus({ pool = null, signingSecret = null } = {}) {
  const resolvedPool = resolvePool(pool);
  const [rows] = await resolvedPool.query('SELECT status, COUNT(*) AS total FROM enterprise_outbox GROUP BY status');
  const counts = Object.fromEntries(ALL_STATES.map(status => [status, 0]));
  for (const row of rows) if (ALL_STATES.includes(row.status)) counts[row.status] = Number(row.total || 0);
  const signingConfigured = Boolean(signingSecret && Buffer.byteLength(String(signingSecret)) >= 32);
  return {
    engine: 'mariadb-transactional-outbox',
    durable: true,
    configured: true,
    healthy: signingConfigured,
    status: signingConfigured ? 'online' : 'misconfigured',
    activeQueued: counts.QUEUED + counts.RETRYING + counts.PROCESSING,
    deadLetterCount: counts.DEAD_LETTER,
    counts,
    signingConfigured,
  };
}

async function listOutboxJobs({ pool = null, context, status = null, limit = DEFAULT_PAGE_LIMIT }) {
  if (!context?.tenantId) {
    throw Object.assign(new Error('Verified tenant context is required to list jobs'), { code: 'TENANT_CONTEXT_REQUIRED', status: 403 });
  }
  const normalizedStatus = status ? String(status).toUpperCase() : null;
  if (normalizedStatus && !ALL_STATES.includes(normalizedStatus)) {
    throw Object.assign(new Error('Enterprise job status is invalid'), { code: 'INVALID_ENTERPRISE_JOB_STATUS', status: 400 });
  }
  const bounded = Math.max(1, Math.min(Number(limit) || DEFAULT_PAGE_LIMIT, 100));
  const sql = `SELECT * FROM enterprise_outbox WHERE tenantId = ?${normalizedStatus ? ' AND status = ?' : ''} ORDER BY created_at DESC LIMIT ?`;
  const params = normalizedStatus ? [context.tenantId, normalizedStatus, bounded] : [context.tenantId, bounded];
  const [rows] = await resolvePool(pool).query(sql, params);
  return rows.map(row => {
    const job = mapJob(row);
    return {
      jobId: job.jobId, jobType: job.jobType, tenantId: job.tenantId,
      workspaceId: job.workspaceId, status: job.status, attemptCount: job.attemptCount,
      maxAttempts: job.maxAttempts, correlationId: job.correlationId,
      lastError: job.lastError, rejectedReason: job.rejectedReason,
      createdAt: job.createdAt, updatedAt: job.updatedAt,
      completedAt: job.completedAt, expiresAt: job.expiresAt,
    };
  });
}

module.exports = {
  ALL_STATES,
  CLAIMABLE_STATES,
  DEFAULT_LEASE_MS,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_TTL_MS,
  OUTBOX_TABLE,
  REJECT_ERROR_CODES,
  backoffDelayMs,
  claimNextOutboxJob,
  completeOutboxJob,
  enqueueOutboxJob,
  failOutboxJob,
  getOutboxStatus,
  listOutboxJobs,
  outboxDocumentId,
  reauthorizeJobPrincipal,
  replayDeadLetterJob,
  rejectOutboxJob,
  runOutboxWorkerOnce,
  sweepExpiredJobs,
};
