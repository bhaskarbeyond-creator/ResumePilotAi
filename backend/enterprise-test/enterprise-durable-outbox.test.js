'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { MemoryFirestore, createMemoryAdmin } = require('../test/helpers/memoryFirestore');
const outbox = require('../enterprise/enterpriseOutbox');
const { createTenantJobEnvelope } = require('../enterprise/tenantJobs');
const { freezeContext } = require('../enterprise/tenantContext');

const SECRET = 'outbox-test-signing-secret-32-bytes-min!!';
const ALT_SECRET = 'outbox-test-signing-secret-ROTATED-32b!';

function enterpriseContext({ tenantId = crypto.randomUUID(), workspaceId = crypto.randomUUID(), principalId = crypto.randomUUID(), subjectId = 'outbox-subject' } = {}) {
  return freezeContext({
    tenantId, workspaceId, principalId, subjectId, identityIssuer: 'firebase',
    tenant: { id: tenantId, lifecycleState: 'ACTIVE', isolationTier: 'STANDARD' },
    membership: { status: 'ACTIVE', roles: ['MEMBER'] }, roles: ['MEMBER'], permissions: [],
    dataPlane: { id: 'firestore-primary', type: 'FIRESTORE', region: 'default', routingVersion: 1, storageProfile: 'shared', cacheProfile: 'shared', queueProfile: 'firestore-durable-outbox', aiProfile: 'platform-default', securityProfile: 'standard' },
  });
}

function setup() {
  const db = new MemoryFirestore();
  const admin = createMemoryAdmin({ db });
  return { db, admin };
}

function serviceFor(context) {
  return { resolveContext: async () => ({ context }) };
}

function runWorker({ db, admin, context, handlers, now, workerId = 'w1', signingSecret = SECRET, maxJobs = 5 }) {
  return outbox.runOutboxWorkerOnce({ db, admin, tenantService: serviceFor(context), signingSecret, handlers, workerId, now, maxJobs, backoffBaseMs: 1_000, backoffJitter: false });
}

test('enqueue is idempotent: duplicate submissions collapse onto one durable job', async () => {
  const { db, admin } = setup();
  const context = enterpriseContext();
  const envelope = createTenantJobEnvelope({ context, jobType: 'EXPORT_PDF', resource: { type: 'RESUME', id: 'r1' }, idempotencyKey: 'dup-1', signingSecret: SECRET });
  const first = await outbox.enqueueOutboxJob({ db, admin, envelope });
  const second = await outbox.enqueueOutboxJob({ db, admin, envelope });
  assert.equal(first.status, 'ENQUEUED');
  assert.equal(second.status, 'ALREADY_QUEUED');
  assert.equal(second.jobId, first.jobId);

  // Completing then re-delivering the same envelope never re-executes.
  const outcomes = await runWorker({ db, admin, context, handlers: { EXPORT_PDF: async () => ({ ok: 1 }) }, now: Date.now() });
  assert.equal(outcomes[0].status, 'COMPLETED');
  const afterCompletion = await outbox.enqueueOutboxJob({ db, admin, envelope });
  assert.equal(afterCompletion.status, 'DUPLICATE_IGNORED', 'duplicate delivery after completion must be ignored');
  const secondPass = await runWorker({ db, admin, context, handlers: { EXPORT_PDF: async () => { throw new Error('must not run'); } }, now: Date.now() });
  assert.deepEqual(secondPass, [], 'completed job must never be re-executed');
});

test('expired jobs are terminally rejected by the sweeper and never executed', async () => {
  const { db, admin } = setup();
  const context = enterpriseContext();
  const envelope = createTenantJobEnvelope({ context, jobType: 'EXPORT_PDF', resource: { type: 'RESUME', id: 'r-exp' }, idempotencyKey: 'exp-1', signingSecret: SECRET });
  await outbox.enqueueOutboxJob({ db, admin, envelope, ttlMs: 60_000 });
  const tomorrow = Date.now() + 25 * 60 * 60_000;
  const swept = await outbox.sweepExpiredJobs({ db, admin, now: tomorrow });
  assert.equal(swept.length, 1);
  assert.equal(swept[0].reason, 'EXPIRED_TENANT_JOB');
  const outcomes = await runWorker({ db, admin, context, handlers: { EXPORT_PDF: async () => ({ ok: true }) }, now: tomorrow });
  assert.deepEqual(outcomes, [], 'expired job must not execute even if claimed before sweep');
});

test('membership revocation between enqueue and execution rejects the job', async () => {
  const { db, admin } = setup();
  const context = enterpriseContext({ subjectId: 'usr_revoked_member' });
  const envelope = createTenantJobEnvelope({ context, jobType: 'NOTIFY', resource: { type: 'RESUME', id: 'r-rev' }, idempotencyKey: 'rev-1', signingSecret: SECRET });
  await outbox.enqueueOutboxJob({ db, admin, envelope });

  const revokedService = {
    resolveContext: async () => {
      throw Object.assign(new Error('Tenant membership was not found'), { code: 'TENANT_MEMBERSHIP_NOT_FOUND', status: 404 });
    },
  };
  const outcomes = await outbox.runOutboxWorkerOnce({ db, admin, tenantService: revokedService, signingSecret: SECRET, handlers: { NOTIFY: async () => ({ ok: true }) }, workerId: 'w1', now: Date.now(), maxJobs: 3, backoffBaseMs: 1, backoffJitter: false });
  assert.equal(outcomes[0].status, 'REJECTED');
  assert.equal(outcomes[0].reason, 'TENANT_MEMBERSHIP_NOT_FOUND');
  const status = await outbox.getOutboxStatus({ db, admin, signingSecret: SECRET });
  assert.equal(status.counts.REJECTED, 1);
  assert.equal(status.counts.DEAD_LETTER, 0, 'authorization rejection is not a retryable failure');
});

test('stale principal binding (identity swap) rejects the job at execution time', async () => {
  const { db, admin } = setup();
  const context = enterpriseContext({ subjectId: 'usr_original' });
  const envelope = createTenantJobEnvelope({ context, jobType: 'NOTIFY', resource: { type: 'RESUME', id: 'r-swap' }, idempotencyKey: 'swap-1', signingSecret: SECRET });
  await outbox.enqueueOutboxJob({ db, admin, envelope });

  // The subject now resolves to a different canonical principal (e.g. identity
  // was reassigned): reauthorization must fail closed.
  const otherPrincipal = enterpriseContext({ principalId: crypto.randomUUID(), subjectId: 'usr_original' });
  const swappedService = { resolveContext: async () => ({ context: otherPrincipal }) };
  const outcomes = await outbox.runOutboxWorkerOnce({ db, admin, tenantService: swappedService, signingSecret: SECRET, handlers: { NOTIFY: async () => ({ ok: true }) }, workerId: 'w1', now: Date.now(), maxJobs: 3, backoffBaseMs: 1, backoffJitter: false });
  assert.equal(outcomes[0].status, 'REJECTED');
  assert.equal(outcomes[0].reason, 'ENTERPRISE_OUTBOX_UNAUTHORIZED');
});

test('DLQ: persistent failures dead-letter after max attempts and replay re-queues them', async () => {
  const { db, admin } = setup();
  const context = enterpriseContext({ subjectId: 'usr_dlq' });
  const envelope = createTenantJobEnvelope({ context, jobType: 'EXPORT_PDF', resource: { type: 'RESUME', id: 'r-dlq' }, idempotencyKey: 'dlq-1', signingSecret: SECRET });
  await outbox.enqueueOutboxJob({ db, admin, envelope, maxAttempts: 3 });
  const failing = { EXPORT_PDF: async () => { throw new Error('renderer permanently offline'); } };

  let clock = Date.now();
  const first = await runWorker({ db, admin, context, handlers: failing, now: clock });
  assert.equal(first[0].status, 'RETRY_SCHEDULED');
  clock = first[0].nextRunAt;
  const second = await runWorker({ db, admin, context, handlers: failing, now: clock });
  assert.equal(second[0].status, 'RETRY_SCHEDULED');
  clock = second[0].nextRunAt;
  const third = await runWorker({ db, admin, context, handlers: failing, now: clock });
  assert.equal(third[0].status, 'DEAD_LETTER');

  const status = await outbox.getOutboxStatus({ db, admin, signingSecret: SECRET });
  assert.equal(status.deadLetterCount, 1);
  assert.equal(status.durable, true);

  const jobId = outbox.outboxDocumentId(context.tenantId, 'dlq-1');
  const adminContext = freezeContext({
    tenantId: context.tenantId, workspaceId: context.workspaceId, principalId: crypto.randomUUID(),
    tenant: { id: context.tenantId, lifecycleState: 'ACTIVE', isolationTier: 'STANDARD', dataPlane: { id: 'firestore-primary', type: 'FIRESTORE', routingVersion: 1 } },
    membership: { status: 'ACTIVE', roles: ['TENANT_ADMIN'] }, roles: ['TENANT_ADMIN'], permissions: ['tenant.settings.write'],
  });
  const replayed = await outbox.replayDeadLetterJob({ db, admin, jobId, context: adminContext });
  assert.equal(replayed.status, 'REPLAYED');

  const fixed = { EXPORT_PDF: async () => ({ exported: true }) };
  const fourth = await runWorker({ db, admin, context, handlers: fixed, now: Date.now() + 1_000 });
  assert.equal(fourth[0].status, 'COMPLETED', 'replayed job must execute with a fresh attempt budget');

  // Replay writes an auditable trail inside the tenant partition.
  const audit = await db.collection(`tenants/${context.tenantId}/audit_events`).get();
  assert.ok(audit.docs.some(document => document.data().action === 'JOB_REPLAYED'), 'JOB_REPLAYED audit event must exist');
});

test('replay is tenant-scoped: tenant B cannot replay tenant A dead letters', async () => {
  const { db, admin } = setup();
  const contextA = enterpriseContext({ subjectId: 'usr_a' });
  const envelope = createTenantJobEnvelope({ context: contextA, jobType: 'EXPORT_PDF', resource: { type: 'RESUME', id: 'r-cross' }, idempotencyKey: 'cross-1', signingSecret: SECRET });
  await outbox.enqueueOutboxJob({ db, admin, envelope, maxAttempts: 1 });
  const failing = { EXPORT_PDF: async () => { throw new Error('boom'); } };
  const [outcome] = await runWorker({ db, admin, context: contextA, handlers: failing, now: Date.now() });
  assert.equal(outcome.status, 'DEAD_LETTER');

  const contextB = freezeContext({
    tenantId: crypto.randomUUID(), workspaceId: crypto.randomUUID(), principalId: crypto.randomUUID(),
    tenant: { id: crypto.randomUUID(), lifecycleState: 'ACTIVE', isolationTier: 'STANDARD', dataPlane: { id: 'firestore-primary', type: 'FIRESTORE', routingVersion: 1 } },
    membership: { status: 'ACTIVE', roles: ['TENANT_ADMIN'] }, roles: ['TENANT_ADMIN'], permissions: ['tenant.settings.write'],
  });
  const jobId = outbox.outboxDocumentId(contextA.tenantId, 'cross-1');
  const denied = await outbox.replayDeadLetterJob({ db, admin, jobId, context: contextB });
  assert.equal(denied.status, 'NOT_FOUND', 'cross-tenant replay must be invisible (not-found, not forbidden)');

  const allowed = await outbox.replayDeadLetterJob({ db, admin, jobId, context: freezeContext({ tenantId: contextA.tenantId, workspaceId: contextA.workspaceId, principalId: crypto.randomUUID(), tenant: { id: contextA.tenantId, lifecycleState: 'ACTIVE', isolationTier: 'STANDARD', dataPlane: { id: 'firestore-primary', type: 'FIRESTORE', routingVersion: 1 } }, membership: { status: 'ACTIVE', roles: ['TENANT_ADMIN'] }, roles: ['TENANT_ADMIN'], permissions: [] }) });
  assert.equal(allowed.status, 'REPLAYED');
});

test('tampered envelopes (payload or signature swap) are rejected without execution', async () => {
  const { db, admin } = setup();
  const context = enterpriseContext();
  const envelope = createTenantJobEnvelope({ context, jobType: 'NOTIFY', resource: { type: 'RESUME', id: 'r-tamper' }, idempotencyKey: 'tamper-1', signingSecret: SECRET });
  await outbox.enqueueOutboxJob({ db, admin, envelope });
  const jobId = outbox.outboxDocumentId(context.tenantId, 'tamper-1');

  // Payload tampering: rewrite tenantId inside the stored envelope.
  await db.collection(outbox.OUTBOX_COLLECTION).doc(jobId).update({ envelope: { ...envelope, tenantId: crypto.randomUUID() } });
  let outcomes = await runWorker({ db, admin, context, handlers: { NOTIFY: async () => ({ ok: true }) }, now: Date.now() });
  assert.equal(outcomes[0].status, 'REJECTED');
  assert.equal(outcomes[0].reason, 'INVALID_TENANT_JOB_SIGNATURE');

  // Secret rotation without key continuity: signatures fail closed.
  const envelope2 = createTenantJobEnvelope({ context, jobType: 'NOTIFY', resource: { type: 'RESUME', id: 'r-tamper-2' }, idempotencyKey: 'tamper-2', signingSecret: SECRET });
  await outbox.enqueueOutboxJob({ db, admin, envelope: envelope2 });
  outcomes = await runWorker({ db, admin, context, handlers: { NOTIFY: async () => ({ ok: true }) }, now: Date.now(), signingSecret: ALT_SECRET });
  assert.equal(outcomes[0].status, 'REJECTED', 'envelopes signed with a previous secret must not silently execute');
});

test('job listing is tenant-scoped and ordered', async () => {
  const { db, admin } = setup();
  const contextA = enterpriseContext({ subjectId: 'usr_list_a' });
  const contextB = enterpriseContext({ subjectId: 'usr_list_b' });
  for (const key of ['list-a-1', 'list-a-2']) {
    await outbox.enqueueOutboxJob({ db, admin, envelope: createTenantJobEnvelope({ context: contextA, jobType: 'NOTIFY', resource: { type: 'RESUME', id: 'r' }, idempotencyKey: key, signingSecret: SECRET }) });
  }
  await outbox.enqueueOutboxJob({ db, admin, envelope: createTenantJobEnvelope({ context: contextB, jobType: 'NOTIFY', resource: { type: 'RESUME', id: 'r' }, idempotencyKey: 'list-b-1', signingSecret: SECRET }) });

  const listA = await outbox.listOutboxJobs({ db, context: contextA, status: null });
  assert.equal(listA.length, 2);
  assert.ok(listA.every(job => job.tenantId === contextA.tenantId));
  const listB = await outbox.listOutboxJobs({ db, context: contextB, status: 'QUEUED' });
  assert.equal(listB.length, 1);
  assert.equal(listB[0].tenantId, contextB.tenantId);
  assert.ok(!('envelope' in listB[0]), 'listing must not expose the signed envelope');
});

test('missing handlers retry and dead-letter instead of dropping jobs silently', async () => {
  const { db, admin } = setup();
  const context = enterpriseContext({ subjectId: 'usr_no_handler' });
  await outbox.enqueueOutboxJob({
    db, admin, maxAttempts: 1,
    envelope: createTenantJobEnvelope({ context, jobType: 'RAG_INGEST', resource: { type: 'FILE', id: 'f1' }, idempotencyKey: 'nohandler-1', signingSecret: SECRET }),
  });
  const [outcome] = await runWorker({ db, admin, context, handlers: {}, now: Date.now() });
  assert.equal(outcome.status, 'DEAD_LETTER', 'unhandled job types must be visible in the DLQ, not dropped');
  const [job] = await outbox.listOutboxJobs({ db, context, status: 'DEAD_LETTER' });
  assert.match(job.lastError, /No handler registered/);
});

test('outbox status stays truthful when Firestore is unavailable', async () => {
  const status = await outbox.getOutboxStatus({ db: null, admin: null, signingSecret: SECRET });
  assert.equal(status.configured, false);
  assert.equal(status.healthy, false);
  assert.equal(status.engine, 'firestore-durable-outbox');
});
