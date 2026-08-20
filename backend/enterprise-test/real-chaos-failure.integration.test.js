'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { freezeContext } = require('../enterprise/tenantContext');
const { createTenantJobEnvelope, validateTenantJobEnvelope } = require('../enterprise/tenantJobs');
const { EnterpriseQueueWorkerEngine } = require('../enterprise/tenantWorker');
const { checkTenantRateLimit, pingRedis } = require('../enterprise/redisCacheService');
const { createTenantArtifactToken, verifyTenantArtifactToken } = require('../enterprise/tenantSignedArtifacts');
const { withTenantTransaction } = require('../enterprise/tenantDataPlane');

test('Chaos & Failure: Database unavailable fails closed and throws TENANT_DATA_PLANE_UNAVAILABLE', async () => {
  const badPool = null;
  const context = { tenantId: crypto.randomUUID(), principalId: crypto.randomUUID() };

  await assert.rejects(
    async () => {
      await withTenantTransaction(badPool, context, async () => {});
    },
    (err) => {
      assert.equal(err.code, 'TENANT_DATA_PLANE_UNAVAILABLE');
      assert.equal(err.status, 503);
      return true;
    }
  );
});

test('Chaos & Failure: Redis offline fails open gracefully for rate limiter with fallback status', async () => {
  // Offline mock redis test
  const rateLimitRes = await checkTenantRateLimit({
    tenantId: crypto.randomUUID(),
    principalId: crypto.randomUUID(),
    operation: 'resume-export',
  });

  assert.equal(rateLimitRes.allowed, true);
  assert.equal(rateLimitRes.source, 'fallback');
});

test('Chaos & Failure: Worker restart and recovery from unhandled job crash', async () => {
  const secret = 'staging-test-queue-secret-key-32byteslong!';
  const workerEngine = new EnterpriseQueueWorkerEngine({ signingSecret: secret });

  const tenantId = crypto.randomUUID();
  const workspaceId = crypto.randomUUID();
  const principalId = crypto.randomUUID();

  const context = freezeContext({
    tenantId,
    workspaceId,
    principalId,
    subjectId: 'usr_chaos_tester',
    identityIssuer: 'firebase',
    tenant: { id: tenantId, lifecycleState: 'ACTIVE', isolationTier: 'STANDARD' },
    membership: { status: 'ACTIVE', roles: ['MEMBER'] },
    roles: ['MEMBER'],
    permissions: ['resume.read'],
    dataPlane: { id: 'shared-primary', type: 'SHARED_POSTGRES', region: 'default', routingVersion: 1, storageProfile: 'shared', cacheProfile: 'shared', queueProfile: 'shared', aiProfile: 'platform-default', securityProfile: 'standard' },
  });

  let callCount = 0;
  workerEngine.registerHandler('EXPORT_PDF', async () => {
    callCount++;
    if (callCount <= 2) {
      throw new Error('Simulated transient worker crash/reboot');
    }
    return { exported: true, url: 'https://storage/export.pdf' };
  });

  const envelope = createTenantJobEnvelope({
    context,
    jobType: 'EXPORT_PDF',
    resource: { type: 'RESUME', id: 'res-chaos-1' },
    idempotencyKey: 'chaos-1',
    signingSecret: secret,
  });

  await workerEngine.enqueue(envelope);

  // Attempt 1: fails and schedules retry
  const res1 = await workerEngine.processNextJob();
  assert.equal(res1.status, 'RETRY_SCHEDULED');

  // Attempt 2: fails again and schedules retry
  workerEngine.jobQueue[0].nextRunAt = Date.now() - 100; // fast-forward backoff
  const res2 = await workerEngine.processNextJob();
  assert.equal(res2.status, 'RETRY_SCHEDULED');

  // Attempt 3: recovers and succeeds!
  workerEngine.jobQueue[0].nextRunAt = Date.now() - 100; // fast-forward backoff
  const res3 = await workerEngine.processNextJob();
  assert.equal(res3.status, 'COMPLETED');
  assert.equal(res3.result.exported, true);
});

test('Chaos & Failure: Revoked or suspended tenant context rejects queued worker reauthorization', async () => {
  const secret = 'staging-test-queue-secret-key-32byteslong!';
  const workerEngine = new EnterpriseQueueWorkerEngine({ signingSecret: secret });

  const tenantId = crypto.randomUUID();
  const workspaceId = crypto.randomUUID();
  const principalId = crypto.randomUUID();

  const context = freezeContext({
    tenantId,
    workspaceId,
    principalId,
    subjectId: 'usr_suspended_tenant',
    identityIssuer: 'firebase',
    tenant: { id: tenantId, lifecycleState: 'ACTIVE', isolationTier: 'STANDARD' },
    membership: { status: 'ACTIVE', roles: ['MEMBER'] },
    roles: ['MEMBER'],
    permissions: ['resume.read'],
    dataPlane: { id: 'shared-primary', type: 'SHARED_POSTGRES', region: 'default', routingVersion: 1, storageProfile: 'shared', cacheProfile: 'shared', queueProfile: 'shared', aiProfile: 'platform-default', securityProfile: 'standard' },
  });

  workerEngine.registerHandler('EXPORT_PDF', async () => {
    return { ok: true };
  });

  const envelope = createTenantJobEnvelope({
    context,
    jobType: 'EXPORT_PDF',
    resource: { type: 'RESUME', id: 'res-suspended-1' },
    idempotencyKey: 'suspended-1',
    signingSecret: secret,
  });

  await workerEngine.enqueue(envelope);

  // Resolver simulates tenant was SUSPENDED between enqueue and execution
  const mockResolver = async () => {
    return { lifecycleState: 'SUSPENDED' };
  };

  // Processing fails due to revoked/suspended tenant
  const res = await workerEngine.processNextJob({ contextResolver: mockResolver });
  assert.equal(res.status, 'RETRY_SCHEDULED');
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
    dataPlane: { id: 'shared-primary', type: 'SHARED_POSTGRES', region: 'default', routingVersion: 1, storageProfile: 'shared', cacheProfile: 'shared', queueProfile: 'shared', aiProfile: 'platform-default', securityProfile: 'standard' },
  });

  const objectKey = `tenants/${tenantId}/workspaces/${workspaceId}/exports/resume/res-101/artifact-abc.v1.pdf`;

  const token = createTenantArtifactToken({
    context,
    objectKey,
    purpose: 'DOWNLOAD',
    expiresInMs: 2000,
    signingSecret: secret,
  });

  // Valid verification
  const verified = verifyTenantArtifactToken({
    context,
    token,
    purpose: 'DOWNLOAD',
    signingSecret: secret,
  });
  assert.equal(verified.tenantId, tenantId);

  // Mismatched purpose (requested UPLOAD when token was signed for DOWNLOAD)
  assert.throws(() => {
    verifyTenantArtifactToken({
      context,
      token,
      purpose: 'UPLOAD',
      signingSecret: secret,
    });
  }, /expired or invalid/i);

  // Expired token
  assert.throws(() => {
    verifyTenantArtifactToken({
      context,
      token,
      purpose: 'DOWNLOAD',
      signingSecret: secret,
      now: Date.now() + 50000,
    });
  }, /expired or invalid/i);
});
