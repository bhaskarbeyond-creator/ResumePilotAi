'use strict';

const crypto = require('crypto');
const { validateTenantJobEnvelope } = require('./tenantJobs');
const { assertUuid } = require('./tenantContext');

/**
 * Durable enterprise job outbox backed by Firestore.
 *
 *   enqueue (Firestore transaction, idempotent document id)
 *     → enterprise_outbox/{jobId}  status=QUEUED
 *     → worker claims via lease transaction
 *     → signature + expiry verification
 *     → tenant/membership reauthorization at execution time
 *     → handler execution
 *     → COMPLETED | RETRYING (backoff) | DEAD_LETTER | REJECTED
 *
 * Durability: every state transition is a committed Firestore write. A worker
 * crash at any point leaves the lease to expire; an expired lease makes the job
 * reclaimable by any worker. No in-process array, timer, or memory is involved
 * in job correctness.
 *
 * Envelope integrity: jobs carry the HMAC-SHA256 signed envelope from
 * tenantJobs.js; tampering, expiry, suspension, or revoked membership are all
 * rejected without execution.
 */

const OUTBOX_COLLECTION = 'enterprise_outbox';
const CLAIMABLE_STATES = Object.freeze(['QUEUED', 'RETRYING', 'PROCESSING']);
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BASE_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 10 * 60_000;
const DEFAULT_LEASE_MS = 2 * 60_000;
const DEFAULT_TTL_MS = 24 * 60 * 60_000;
const DEFAULT_PAGE_LIMIT = 50;

function outboxDocumentId(tenantId, idempotencyKey) {
  return crypto.createHash('sha256').update(`${assertUuid(tenantId, 'Tenant identifier')}\u0000${String(idempotencyKey || '')}`).digest('hex');
}

function backoffDelayMs(attemptCount, { baseMs = DEFAULT_BASE_BACKOFF_MS, jitter = true } = {}) {
  const exponential = Math.min(MAX_BACKOFF_MS, baseMs * (2 ** Math.max(0, attemptCount - 1)));
  if (!jitter) return exponential;
  return Math.max(250, Math.round(exponential * (0.8 + Math.random() * 0.4)));
}

function ts(admin, millis) {
  return admin?.firestore?.Timestamp?.fromMillis?.(millis) || new Date(millis);
}

function tsMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function assertDb(db) {
  if (!db) throw Object.assign(new Error('Enterprise outbox requires a Firestore handle'), { code: 'ENTERPRISE_OUTBOX_UNAVAILABLE', status: 503 });
  return db;
}

/**
 * Idempotently enqueue a signed job envelope. The document id is derived from
 * (tenantId, idempotencyKey), so duplicate submissions collapse onto one
 * durable job instead of double-executing.
 */
async function enqueueOutboxJob({ db, admin, envelope, now = Date.now(), maxAttempts = DEFAULT_MAX_ATTEMPTS, ttlMs = DEFAULT_TTL_MS }) {
  assertDb(db);
  if (!admin?.firestore?.FieldValue) throw Object.assign(new Error('Enterprise outbox requires the Firebase admin runtime'), { code: 'ENTERPRISE_OUTBOX_UNAVAILABLE', status: 503 });
  const submittedAt = tsMillis(envelope?.submittedAt) || now;
  const jobId = outboxDocumentId(envelope.tenantId, envelope.idempotencyKey);
  const reference = db.collection(OUTBOX_COLLECTION).doc(jobId);
  const document = {
    jobId,
    tenantId: envelope.tenantId,
    workspaceId: envelope.workspaceId || null,
    principalId: envelope.principalId,
    subjectId: envelope.subjectId || null,
    identityIssuer: envelope.identityIssuer,
    actorType: envelope.actorType,
    jobType: envelope.jobType,
    resource: envelope.resource,
    correlationId: envelope.correlationId,
    idempotencyKey: envelope.idempotencyKey,
    classification: envelope.classification,
    envelope,
    status: 'QUEUED',
    attemptCount: 0,
    maxAttempts: Math.max(1, Number(maxAttempts) || DEFAULT_MAX_ATTEMPTS),
    nextAttemptAt: ts(admin, now),
    expiresAt: ts(admin, submittedAt + Math.max(60_000, Number(ttlMs) || DEFAULT_TTL_MS)),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  let duplicate = null;
  await db.runTransaction(async transaction => {
    const existing = await transaction.get(reference);
    if (existing.exists) {
      duplicate = { status: existing.data().status, jobId };
      return;
    }
    transaction.create(reference, document);
  });
  if (duplicate) {
    if (duplicate.status === 'COMPLETED') return { status: 'DUPLICATE_IGNORED', jobId: duplicate.jobId };
    return { status: 'ALREADY_QUEUED', jobId: duplicate.jobId };
  }
  return { status: 'ENQUEUED', jobId, queueLength: null };
}

/**
 * Claim the next due job. A job is claimable when it is QUEUED/RETRYING (or
 * PROCESSING with an expired lease — worker crash recovery) and its scheduled
 * attempt time has arrived. Claiming is a lease transaction; concurrent
 * workers cannot claim the same job.
 */
async function claimNextOutboxJob({ db, admin, workerId, now = Date.now(), leaseMs = DEFAULT_LEASE_MS }) {
  assertDb(db);
  let due;
  try {
    due = await db.collection(OUTBOX_COLLECTION)
      .where('status', 'in', CLAIMABLE_STATES)
      .where('nextAttemptAt', '<=', ts(admin, now))
      .orderBy('nextAttemptAt')
      .limit(10)
      .get();
  } catch (error) {
    if (error.code === 9 || String(error.message || '').includes('requires an index')) {
      const fallbackSnapshot = await db.collection(OUTBOX_COLLECTION)
        .where('status', 'in', CLAIMABLE_STATES)
        .limit(50)
        .get();
      const filtered = fallbackSnapshot.docs
        .filter(doc => {
          const val = doc.data() || {};
          const leaseUntil = tsMillis(val.leaseExpiresAt);
          const nextAttempt = tsMillis(val.nextAttemptAt);
          const isClaimable = val.status === 'PROCESSING' ? (leaseUntil > 0 && leaseUntil <= now) : nextAttempt <= now;
          return isClaimable;
        })
        .sort((a, b) => tsMillis(a.data()?.nextAttemptAt) - tsMillis(b.data()?.nextAttemptAt))
        .slice(0, 10);
      due = { docs: filtered };
    } else {
      throw error;
    }
  }
  for (const candidate of due.docs) {
    let claimed = null;
    await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(candidate.ref);
      const value = snapshot.data() || {};
      const leaseUntil = tsMillis(value.leaseExpiresAt);
      const claimable =
        CLAIMABLE_STATES.includes(value.status) &&
        (value.status === 'PROCESSING' ? leaseUntil <= now : tsMillis(value.nextAttemptAt) <= now);
      if (!claimable) return;
      transaction.update(candidate.ref, {
        status: 'PROCESSING',
        attemptCount: Number(value.attemptCount || 0) + 1,
        leaseOwner: String(workerId),
        leaseExpiresAt: ts(admin, now + leaseMs),
        lastAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      claimed = { ref: candidate.ref, jobId: candidate.id, ...value, leaseOwner: String(workerId), attemptCount: Number(value.attemptCount || 0) + 1 };
    });
    if (claimed) return claimed;
  }
  return null;
}

async function completeOutboxJob({ db, admin, job, workerId, result = null, now = Date.now() }) {
  assertDb(db);
  if (!job || !job.ref) return { status: 'INVALID_JOB' };
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(job.ref);
    const value = snapshot.data() || {};
    if (value.leaseOwner !== workerId) return;
    transaction.update(job.ref, {
      status: 'COMPLETED',
      result: result === undefined ? null : result,
      completedAt: ts(admin, now),
      leaseOwner: admin.firestore.FieldValue.delete(),
      leaseExpiresAt: admin.firestore.FieldValue.delete(),
      lastError: admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
  return { status: 'COMPLETED', jobId: job.jobId };
}

async function failOutboxJob({ db, admin, job, workerId, error, now = Date.now(), backoffBaseMs = DEFAULT_BASE_BACKOFF_MS, backoffJitter = true }) {
  assertDb(db);
  if (!job || !job.ref) return { status: 'INVALID_JOB' };
  let outcome = null;
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(job.ref);
    const value = snapshot.data() || {};
    if (value.leaseOwner !== workerId) { outcome = { status: 'LEASE_LOST', jobId: job.jobId }; return; }
    const attemptCount = Number(value.attemptCount || 1);
    const terminal = attemptCount >= Math.max(1, Number(value.maxAttempts || DEFAULT_MAX_ATTEMPTS));
    const delay = backoffDelayMs(attemptCount, { baseMs: backoffBaseMs, jitter: backoffJitter });
    transaction.update(job.ref, {
      status: terminal ? 'DEAD_LETTER' : 'RETRYING',
      lastError: String(error?.message || error || 'Job execution failed').slice(0, 500),
      ...(terminal
        ? { dlqAt: ts(admin, now) }
        : { nextAttemptAt: ts(admin, now + delay) }),
      leaseOwner: admin.firestore.FieldValue.delete(),
      leaseExpiresAt: admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    outcome = terminal
      ? { status: 'DEAD_LETTER', jobId: job.jobId, attemptCount }
      : { status: 'RETRY_SCHEDULED', jobId: job.jobId, attemptCount, backoffMs: delay, nextRunAt: now + delay };
  });
  return outcome;
}

/**
 * Deterministic rejections (invalid signature, expiry, suspended tenant,
 * revoked membership, tampering) terminate the job immediately: retrying a job
 * that can never succeed would only burn quota.
 */
async function rejectOutboxJob({ db, admin, job, reason, now = Date.now() }) {
  assertDb(db);
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(job.ref);
    if (!snapshot.exists) return;
    transaction.update(job.ref, {
      status: 'REJECTED',
      rejectedReason: String(reason || 'JOB_REJECTED').slice(0, 200),
      rejectedAt: ts(admin, now),
      leaseOwner: admin.firestore.FieldValue.delete(),
      leaseExpiresAt: admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
  return { status: 'REJECTED', jobId: job.jobId, reason };
}

/**
 * Replay a DEAD_LETTER job back into the queue. Requires a verified tenant
 * context with settings permission; the job must belong to that tenant.
 */
async function replayDeadLetterJob({ db, admin, jobId, context, now = Date.now() }) {
  assertDb(db);
  if (!context?.tenantId) throw Object.assign(new Error('Verified tenant context is required to replay jobs'), { code: 'TENANT_CONTEXT_REQUIRED', status: 403 });
  const reference = db.collection(OUTBOX_COLLECTION).doc(String(jobId || ''));
  let replayed = false;
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) return;
    const value = snapshot.data() || {};
    if (value.tenantId !== context.tenantId) { replayed = false; return; }
    if (value.status !== 'DEAD_LETTER') return;
    transaction.update(reference, {
      status: 'QUEUED',
      attemptCount: 0,
      nextAttemptAt: ts(admin, now),
      replayedBy: context.principalId,
      replayedAt: ts(admin, now),
      dlqAt: admin.firestore.FieldValue.delete(),
      lastError: admin.firestore.FieldValue.delete(),
      leaseOwner: admin.firestore.FieldValue.delete(),
      leaseExpiresAt: admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    const auditId = crypto.randomUUID();
    transaction.set(
      db.collection(`tenants/${context.tenantId}/audit_events`).doc(auditId),
      {
        id: auditId,
        tenantId: context.tenantId,
        workspaceId: value.workspaceId || context.workspaceId || null,
        principalId: context.principalId,
        subjectId: context.subjectId || null,
        actorType: context.actorType || 'user',
        action: 'JOB_REPLAYED',
        category: 'tenant.jobs',
        severity: 'HIGH',
        outcome: 'SUCCESS',
        resourceType: value.jobType,
        resourceId: String(jobId),
        correlationId: context.correlationId || context.requestId || null,
        metadata: { jobType: value.jobType || '' },
        occurredAt: new Date(now).toISOString(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }
    );
    replayed = true;
  });
  return replayed
    ? { status: 'REPLAYED', jobId: String(jobId) }
    : { status: 'NOT_FOUND', jobId: String(jobId) };
}

/**
 * Reauthorize the job at execution time: the tenant must still be active, the
 * principal's membership must still exist and be active, and the canonical
 * principal derived from the verified identity must match the envelope. This
 * closes the stale-authorization window between enqueue and execution.
 */
async function reauthorizeJobPrincipal({ tenantService, envelope }) {
  if (!tenantService?.resolveContext) {
    throw Object.assign(new Error('Enterprise worker requires a tenant service for reauthorization'), { code: 'ENTERPRISE_OUTBOX_UNAUTHORIZED', status: 403 });
  }
  if (String(envelope.identityIssuer || '') !== 'firebase') {
    // Only Firebase-subject reauthorization is implemented; service-issued
    // envelopes must be validated by an issuer-aware resolver (future work).
    throw Object.assign(new Error('Job identity issuer cannot be reauthorized by this worker'), { code: 'ENTERPRISE_OUTBOX_UNAUTHORIZED', status: 403 });
  }
  if (!envelope.subjectId) {
    throw Object.assign(new Error('Job subject is required for reauthorization'), { code: 'ENTERPRISE_OUTBOX_UNAUTHORIZED', status: 403 });
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
  'INVALID_TENANT_JOB',
  'INVALID_TENANT_JOB_SIGNATURE',
  'EXPIRED_TENANT_JOB',
  'TENANT_INACTIVE',
  'TENANT_MEMBERSHIP_INACTIVE',
  'TENANT_MEMBERSHIP_NOT_FOUND',
  'TENANT_NOT_FOUND',
  'WORKSPACE_NOT_FOUND',
  'WORKSPACE_MEMBERSHIP_NOT_FOUND',
  'ENTERPRISE_OUTBOX_UNAUTHORIZED',
  'TENANT_CONTEXT_REQUIRED',
]);

/**
 * Run one worker pass: claim due jobs, verify, reauthorize, execute, finalize.
 * Returns per-job outcomes for observability and tests.
 */
async function runOutboxWorkerOnce({
  db,
  admin,
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
  assertDb(db);
  if (!signingSecret || Buffer.byteLength(String(signingSecret)) < 32) {
    throw Object.assign(new Error('Enterprise outbox worker requires the tenant job signing secret'), { code: 'TENANT_JOB_SIGNING_UNAVAILABLE', status: 503 });
  }
  const outcomes = [];
  for (let index = 0; index < Math.max(1, Number(maxJobs) || 1); index += 1) {
    const job = await claimNextOutboxJob({ db, admin, workerId, now, leaseMs });
    if (!job) break;
    try {
      const envelope = validateTenantJobEnvelope(job.envelope, signingSecret, { now });
      if (tsMillis(job.expiresAt) && tsMillis(job.expiresAt) <= now) {
        throw Object.assign(new Error('Tenant job is expired'), { code: 'EXPIRED_TENANT_JOB', status: 409 });
      }
      const context = await reauthorizeJobPrincipal({ tenantService, envelope });
      const handler = handlers?.[envelope.jobType];
      if (typeof handler !== 'function') {
        throw Object.assign(new Error(`No handler registered for job type ${envelope.jobType}`), { code: 'OUTBOX_HANDLER_MISSING', status: 500 });
      }
      const result = await handler({ envelope, context, job });
      const completed = await completeOutboxJob({ db, admin, job, workerId, result, now });
      outcomes.push(completed);
    } catch (error) {
      const code = String(error?.code || '');
      if (REJECT_ERROR_CODES.has(code)) {
        outcomes.push(await rejectOutboxJob({ db, admin, job, reason: code || 'JOB_REJECTED', now }));
      } else {
        outcomes.push(await failOutboxJob({ db, admin, job, workerId, error, now, backoffBaseMs, backoffJitter }));
      }
    }
  }
  return outcomes;
}

/**
 * Sweep jobs whose expiry passed while queued (e.g. tenant sat suspended).
 * Expired jobs are terminally rejected, never executed.
 */
async function sweepExpiredJobs({ db, admin, now = Date.now(), limit = 50 }) {
  assertDb(db);
  let due;
  try {
    due = await db.collection(OUTBOX_COLLECTION)
      .where('status', 'in', ['QUEUED', 'RETRYING'])
      .where('expiresAt', '<=', ts(admin, now))
      .limit(limit)
      .get();
  } catch (error) {
    if (error.code === 9 || String(error.message || '').includes('requires an index')) {
      const fallbackSnapshot = await db.collection(OUTBOX_COLLECTION)
        .where('status', 'in', ['QUEUED', 'RETRYING'])
        .limit(limit * 2)
        .get();
      const filtered = fallbackSnapshot.docs
        .filter(doc => tsMillis(doc.data()?.expiresAt) <= now)
        .slice(0, limit);
      due = { docs: filtered };
    } else {
      throw error;
    }
  }
  const rejected = [];
  for (const document of due.docs) {
    const outcome = await rejectOutboxJob({ db, admin, job: { ref: document.ref, jobId: document.id }, reason: 'EXPIRED_TENANT_JOB', now });
    rejected.push(outcome);
  }
  return rejected;
}

/**
 * Truthful durable status. Never reports healthy when the Firestore handle or
 * the signing secret is missing.
 */
async function getOutboxStatus({ db, admin, signingSecret = null }) {
  if (!db || !admin?.firestore?.FieldValue) {
    return {
      engine: 'firestore-durable-outbox',
      durable: true,
      configured: false,
      healthy: false,
      status: 'unavailable',
      activeQueued: 0,
      deadLetterCount: 0,
      counts: {},
      signingConfigured: Boolean(signingSecret && Buffer.byteLength(String(signingSecret)) >= 32),
    };
  }
  const counts = {};
  for (const status of ['QUEUED', 'PROCESSING', 'RETRYING', 'COMPLETED', 'DEAD_LETTER', 'REJECTED']) {
    const snapshot = await db.collection(OUTBOX_COLLECTION).where('status', '==', status).limit(1_000).get();
    counts[status] = snapshot.size;
  }
  const signingConfigured = Boolean(signingSecret && Buffer.byteLength(String(signingSecret)) >= 32);
  return {
    engine: 'firestore-durable-outbox',
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

/**
 * Tenant-scoped job listing for the enterprise console (queue + DLQ views).
 * The tenantId predicate is enforced against the verified context.
 */
async function listOutboxJobs({ db, context, status = null, limit = DEFAULT_PAGE_LIMIT }) {
  assertDb(db);
  if (!context?.tenantId) throw Object.assign(new Error('Verified tenant context is required to list jobs'), { code: 'TENANT_CONTEXT_REQUIRED', status: 403 });
  let query = db.collection(OUTBOX_COLLECTION).where('tenantId', '==', context.tenantId);
  if (status) query = query.where('status', '==', String(status).toUpperCase());
  const snapshot = await query.orderBy('createdAt', 'desc').limit(Math.max(1, Math.min(Number(limit) || DEFAULT_PAGE_LIMIT, 100))).get();
  return snapshot.docs.map(document => {
    const value = document.data();
    return {
      jobId: document.id,
      jobType: value.jobType,
      tenantId: value.tenantId,
      workspaceId: value.workspaceId || null,
      status: value.status,
      attemptCount: Number(value.attemptCount || 0),
      maxAttempts: Number(value.maxAttempts || DEFAULT_MAX_ATTEMPTS),
      correlationId: value.correlationId || null,
      lastError: value.lastError || null,
      rejectedReason: value.rejectedReason || null,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      completedAt: value.completedAt || null,
      expiresAt: value.expiresAt || null,
    };
  });
}

module.exports = {
  CLAIMABLE_STATES,
  DEFAULT_LEASE_MS,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_TTL_MS,
  OUTBOX_COLLECTION,
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
