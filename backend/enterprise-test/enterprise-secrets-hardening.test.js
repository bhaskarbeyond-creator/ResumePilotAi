'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EnterpriseQueueWorkerEngine } = require('../enterprise/tenantWorker');
const { createTenantArtifactToken } = require('../enterprise/tenantSignedArtifacts');

const context = Object.freeze({
  tenantId: '11111111-1111-4111-8111-111111111111',
  workspaceId: '22222222-2222-4222-8222-222222222222',
  dataPlane: { id: 'shared-primary', type: 'SHARED_POSTGRES', region: 'default', routingVersion: 1, storageProfile: 'shared', cacheProfile: 'shared', queueProfile: 'shared', aiProfile: 'platform-default', securityProfile: 'standard' },
  lifecycleState: 'ACTIVE',
});

test('queue status is truthful when the signing secret is missing', () => {
  const misconfigured = new EnterpriseQueueWorkerEngine({ signingSecret: '' }).getStatus();
  assert.equal(misconfigured.healthy, false);
  assert.equal(misconfigured.status, 'misconfigured');

  const healthy = new EnterpriseQueueWorkerEngine({ signingSecret: '0123456789abcdef0123456789abcdef' }).getStatus();
  assert.equal(healthy.healthy, true);
  assert.equal(healthy.status, 'online');
});

test('artifact signing fails closed without a runtime secret', () => {
  assert.throws(() => createTenantArtifactToken({
    context,
    objectKey: 'tenants/11111111-1111-4111-8111-111111111111/workspaces/22222222-2222-4222-8222-222222222222/artifacts/resume/primary/resume.pdf',
    purpose: 'DOWNLOAD',
    expiresInMs: 60_000,
    signingSecret: '',
  }), /Tenant artifact signing secret is unavailable/);
});
