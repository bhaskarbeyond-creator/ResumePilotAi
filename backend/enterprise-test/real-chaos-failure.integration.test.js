'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { freezeContext } = require('../enterprise/tenantContext');
const { createTenantJobEnvelope } = require('../enterprise/tenantJobs');
const outbox = require('../enterprise/enterpriseOutbox');
const { createTenantArtifactToken, verifyTenantArtifactToken } = require('../enterprise/tenantSignedArtifacts');
const { MemoryFirestore, createMemoryAdmin } = require('../test/helpers/memoryFirestore');
const { FirestoreAtomicCounterStore, TenantQuotaGuard } = require('../enterprise/tenantQuota');

const SIGNING_SECRET = 'staging-test-queue-secret-key-32byteslong!';

function enterpriseContext({ tenantId = crypto.randomUUID(), workspaceId = crypto.randomUUID(), principalId = crypto.randomUUID(), subjectId = 'usr_chaos_tester', lifecycleState = 'ACTIVE' } = {}) {
  return freezeContext({
    tenantId,
    workspaceId,
    principalId,
    subjectId,
    identityIssuer: 'firebase',
    tenant: { id: tenantId, lifecycleState, isolationTier: 'STANDARD' },
    membership: { status: 'ACTIVE', roles: ['MEMBER'] },
    roles: ['MEMBER'],
    permissions: ['resume.read'],
    dataPlane: { id: 'firestore-primary', type: 'FIRESTORE', region: 'default', routingVersion: 1, storageProfile: 'shared', cacheProfile: 'shared', queueProfile: 'firestore-durable-outbox', aiProfile: 'platform-default', securityProfile: 'standard' },
  });
}

test('Chaos & Failure: data-store outage fails closed — the quota guard errors instead of allowing unbounded use', async () => {
  const { MemoryFirestore, createMemoryAdmin } = require('../test/helpers/memoryFirestore');
  const { FirestoreAtomicCounterStore, TenantQuotaGuard } = require('../enterprise/tenantQuota');
  const db = new MemoryFirestore({ failWrites: true });
  const admin = createMemoryAdmin({ db });
  const guard = new TenantQuotaGuard({ store: new FirestoreAtomicCounterStore({ db, admin }) });
  const context = enterpriseContext({ subjectId: 'usr_store_outage' });
  await assert.rejects(
    () => guard.consume({ context, metric: 'ai-minute', limit: 10, windowMs: 60_000 }),
    error => error.code === 14 || /simulated Firestore outage/i.test(error.message),
    'quota consumption during a store outage must fail closed, never silently allow'
  );
});

test('Chaos & Failure: worker crash mid-execution is recovered after lease expiry by another worker', async () => {
  const db = new MemoryFirestore();
  const admin = createMemoryAdmin({ db });
  const context = enterpriseContext({ subjectId: 'usr_crash_recovery' });
  const envelope = createTenantJobEnvelope({ context, jobType: 'EXPORT_PDF', resource: { type: 'RESUME', id: 'res-crash-1' }, idempotencyKey: 'chaos-crash-1', signingSecret: SIGNING_SECRET });
  await outbox.enqueueOutboxJob({ db, admin, envelope });

  // Worker A claims the job then "crashes" — no completion, no failure write.
  const claimed = await outbox.claimNextOutboxJob({ db, admin, workerId: 'crashed-worker', now: Date.now(), leaseMs: 1_000 });
  assert.ok(claimed, 'job must be claimed by the crashing worker');

  // While the lease is held, another worker cannot steal the job.
  const stolen = await outbox.claimNextOutboxJob({ db, admin, workerId: 'rescue-worker', now: Date.now() + 100, leaseMs: 1_000 });
  assert.equal(stolen, null, 'an actively leased job must not be claimable');

  // After the lease expires, the rescue worker reclaims and completes it.
  const reclaimed = await outbox.claimNextOutboxJob({ db, admin, workerId: 'rescue-worker', now: Date.now() + 5_000, leaseMs: 1_000 });
  assert.ok(reclaimed, 'expired lease must make the job reclaimable');
  assert.equal(reclaimed.attemptCount, 2, 'crash counts as an attempt');
  const tenantService = { resolveContext: async () => ({ context }) };
  const outcomes = await outbox.runOutboxWorkerOnce({
    db,
    admin,
    tenantService,
    signingSecret: SIGNING_SECRET,
    handlers: { EXPORT_PDF: async () => ({ exported: true }) },
    workerId: 'final-worker',
    now: Date.now() + 6_000,
    maxJobs: 3,
    backoffBaseMs: 1,
    backoffJitter: false,
  });
  assert.ok(outcomes.some(outcome => outcome.status === 'COMPLETED'), `expected completion after recovery, got ${JSON.stringify(outcomes)}`);
});

test('Chaos & Failure: transient handler failures retry with backoff and eventually succeed', async () => {
  const db = new MemoryFirestore();
  const admin = createMemoryAdmin({ db });
  const context = enterpriseContext({ subjectId: 'usr_transient' });
  const envelope = createTenantJobEnvelope({ context, jobType: 'EXPORT_PDF', resource: { type: 'RESUME', id: 'res-transient-1' }, idempotencyKey: 'chaos-transient-1', signingSecret: SIGNING_SECRET });
  await outbox.enqueueOutboxJob({ db, admin, envelope, maxAttempts: 5 });

  const tenantService = { resolveContext: async () => ({ context }) };
  let attempts = 0;
  let clock = Date.now();
  const handlers = {
    EXPORT_PDF: async () => {
      attempts += 1;
      if (attempts <= 2) throw new Error('Simulated transient provider outage');
      return { exported: true };
    },
  };

  const first = await outbox.runOutboxWorkerOnce({ db, admin, tenantService, signingSecret: SIGNING_SECRET, handlers, workerId: 'w1', now: clock, maxJobs: 3, backoffBaseMs: 1_000, backoffJitter: false });
  assert.equal(first[0].status, 'RETRY_SCHEDULED');
  clock = first[0].nextRunAt;
  const second = await outbox.runOutboxWorkerOnce({ db, admin, tenantService, signingSecret: SIGNING_SECRET, handlers, workerId: 'w1', now: clock, maxJobs: 3, backoffBaseMs: 1_000, backoffJitter: false });
  assert.equal(second[0].status, 'RETRY_SCHEDULED');
  assert.ok(second[0].backoffMs > first[0].backoffMs, 'backoff must grow exponentially');
  clock = second[0].nextRunAt;
  const third = await outbox.runOutboxWorkerOnce({ db, admin, tenantService, signingSecret: SIGNING_SECRET, handlers, workerId: 'w1', now: clock, maxJobs: 3, backoffBaseMs: 1_000, backoffJitter: false });
  assert.equal(third[0].status, 'COMPLETED');
  assert.equal(attempts, 3);
});

test('Chaos & Failure: suspended or revoked tenants are terminally rejected at execution time', async () => {
  const db = new MemoryFirestore();
  const admin = createMemoryAdmin({ db });
  const context = enterpriseContext({ subjectId: 'usr_suspended_tenant' });
  const envelope = createTenantJobEnvelope({ context, jobType: 'EXPORT_PDF', resource: { type: 'RESUME', id: 'res-suspended-1' }, idempotencyKey: 'chaos-suspended-1', signingSecret: SIGNING_SECRET });
  await outbox.enqueueOutboxJob({ db, admin, envelope });

  // The tenant was suspended between enqueue and execution.
  const suspendedService = {
    resolveContext: async () => {
      throw Object.assign(new Error('Tenant is not active'), { code: 'TENANT_INACTIVE', status: 403 });
    },
  };
  const outcomes = await outbox.runOutboxWorkerOnce({
    db, admin, tenantService: suspendedService, signingSecret: SIGNING_SECRET,
    handlers: { EXPORT_PDF: async () => ({ ok: true }) },
    workerId: 'w1', now: Date.now(), maxJobs: 3, backoffBaseMs: 1, backoffJitter: false,
  });
  assert.equal(outcomes[0].status, 'REJECTED');
  assert.equal(outcomes[0].reason, 'TENANT_INACTIVE');

  const status = await outbox.getOutboxStatus({ db, admin, signingSecret: SIGNING_SECRET });
  assert.equal(status.counts.REJECTED, 1, 'deterministic rejection must not retry');
});

test('Chaos & Failure: Artifact storage token rejects expired credentials and mismatched purpose', async () => {
  const secret = 'staging-test-artifact-secret-32byteslong!';
  const tenantId = crypto.randomUUID();
  const workspaceId = crypto.randomUUID();
  const principalId = crypto.randomUUID();

  const context = freezeContext({
    tenantId,
    workspaceId,
    principalId,
    subjectId: 'usr_storage_tester',
    identityIssuer: 'firebase',
    tenant: { id: tenantId, lifecycleState: 'ACTIVE', isolationTier: 'STANDARD' },
    membership: { status: 'ACTIVE', roles: ['MEMBER'] },
    roles: ['MEMBER'],
    permissions: ['resource.read'],
    dataPlane: { id: 'firestore-primary', type: 'FIRESTORE', region: 'default', routingVersion: 1, storageProfile: 'shared', cacheProfile: 'shared', queueProfile: 'firestore-durable-outbox', aiProfile: 'platform-default', securityProfile: 'standard' },
  });

  const objectKey = `tenants/${tenantId}/workspaces/${workspaceId}/exports/resume/res-101/artifact-abc.v1.pdf`;

  const token = createTenantArtifactToken({ context, objectKey, purpose: 'DOWNLOAD', expiresInMs: 2_000, signingSecret: secret });

  const verified = verifyTenantArtifactToken({ context, token, purpose: 'DOWNLOAD', signingSecret: secret });
  assert.equal(verified.tenantId, tenantId);

  assert.throws(() => {
    verifyTenantArtifactToken({ context, token, purpose: 'UPLOAD', signingSecret: secret });
  }, /expired or invalid/i);

  assert.throws(() => {
    verifyTenantArtifactToken({ context, token, purpose: 'DOWNLOAD', signingSecret: secret, now: Date.now() + 50_000 });
  }, /expired or invalid/i);
});
