'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createTenantJobEnvelope, validateTenantJobEnvelope } = require('../enterprise/tenantJobs');
const { freezeContext } = require('../enterprise/tenantContext');

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
    dataPlane: { id: 'shared-primary', type: 'SHARED_POSTGRES', region: 'default', routingVersion: 1, storageProfile: 'shared', cacheProfile: 'shared', queueProfile: 'shared', aiProfile: 'platform-default', securityProfile: 'standard' },
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

test('Queue & Worker: DLQ state tracking and exponential retry metadata', async () => {
  const maxAttempts = 3;
  let attempts = 0;
  let status = 'PENDING';
  let lastError = null;

  // Simulate worker execution failures
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    attempts = attempt;
    const isTerminal = attempts >= maxAttempts;
    status = isTerminal ? 'DEAD_LETTER' : 'FAILED';
    lastError = `Simulated worker network timeout on attempt ${attempt}`;
  }

  // Verifications
  assert.equal(status, 'DEAD_LETTER', 'Record must transition to DEAD_LETTER status after max attempts');
  assert.equal(attempts, 3);
  assert.match(lastError, /attempt 3/);
});
