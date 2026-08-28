'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createTenantJobEnvelope, validateTenantJobEnvelope } = require('../enterprise/tenantJobs');
const { freezeContext } = require('../enterprise/tenantContext');
const { backoffDelayMs } = require('../enterprise/enterpriseOutbox');

test('Queue & Worker: HMAC-SHA256 signed envelope rejects tampered or expired payload', async () => {
  const secret = 'staging-test-queue-secret-key-32byteslong!';
  const tenantId = crypto.randomUUID();
  const workspaceId = crypto.randomUUID();
  const principalId = crypto.randomUUID();

  const context = freezeContext({
    tenantId,
    workspaceId,
    principalId,
    subjectId: 'usr_alice_123',
    identityIssuer: 'firebase',
    tenant: { id: tenantId, lifecycleState: 'ACTIVE', isolationTier: 'STANDARD' },
    membership: { status: 'ACTIVE', roles: ['MEMBER'] },
    roles: ['MEMBER'],
    permissions: ['resume.read'],
    policyVersion: 1,
    dataPlane: { id: 'mysql-primary', type: 'MYSQL', region: 'default', routingVersion: 1, storageProfile: 'mariadb', cacheProfile: 'none', queueProfile: 'mysql-transactional-outbox', aiProfile: 'platform-default', securityProfile: 'standard' },
  });

  const envelope = createTenantJobEnvelope({
    context,
    jobType: 'EXPORT_PDF',
    resource: { type: 'RESUME', id: 'res-999' },
    idempotencyKey: 'export-res-999-v1',
    signingSecret: secret,
  });

  assert.ok(envelope.signature);
  assert.ok(envelope.jobId);
  assert.equal(envelope.tenantId, tenantId);

  // 1. Verify authentic signature
  const validated = validateTenantJobEnvelope(envelope, secret);
  assert.equal(validated.tenantId, tenantId);

  // 2. Tampered payload is rejected
  const tamperedEnvelope = { ...envelope, tenantId: crypto.randomUUID() };
  assert.throws(() => {
    validateTenantJobEnvelope(tamperedEnvelope, secret);
  }, /signature is invalid/i);

  // 3. Expired payload is rejected
  assert.throws(() => {
    validateTenantJobEnvelope(envelope, secret, { maxAgeMs: 0, now: Date.now() + 100000 });
  }, /expired/i);
});

test('Queue & Worker: retry backoff grows deterministically and stays bounded', () => {
  const first = backoffDelayMs(1, { baseMs: 1_000, jitter: false });
  const second = backoffDelayMs(2, { baseMs: 1_000, jitter: false });
  const third = backoffDelayMs(3, { baseMs: 1_000, jitter: false });
  assert.deepEqual([first, second, third], [1_000, 2_000, 4_000]);
  assert.equal(backoffDelayMs(100, { baseMs: 1_000, jitter: false }), 10 * 60_000);
});
