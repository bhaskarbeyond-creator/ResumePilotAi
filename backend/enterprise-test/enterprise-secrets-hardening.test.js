'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { InMemoryEnterpriseOutboxPool } = require('../test/helpers/inMemoryEnterpriseOutboxPool');
const { getOutboxStatus } = require('../enterprise/enterpriseOutbox');
const { createTenantArtifactToken } = require('../enterprise/tenantSignedArtifacts');
const { ServerKeyEncryptionProvider, createEncryptionProvider } = require('../enterprise/encryptionProvider');

const context = Object.freeze({
  tenantId: '11111111-1111-4111-8111-111111111111',
  workspaceId: '22222222-2222-4222-8222-222222222222',
  dataPlane: { id: 'mysql-primary', type: 'MYSQL', region: 'default', routingVersion: 1, storageProfile: 'mariadb', cacheProfile: 'none', queueProfile: 'mysql-transactional-outbox', aiProfile: 'platform-default', securityProfile: 'standard' },
  lifecycleState: 'ACTIVE',
});

const signingSecret32 = '0123456789abcdef0123456789abcdef';

test('durable queue status is truthful when the signing secret is missing', async () => {
  const pool = new InMemoryEnterpriseOutboxPool();
  const misconfigured = await getOutboxStatus({ pool, signingSecret: '' });
  assert.equal(misconfigured.healthy, false);
  assert.equal(misconfigured.status, 'misconfigured');
  assert.equal(misconfigured.durable, true);

  const healthy = await getOutboxStatus({ pool, signingSecret: signingSecret32 });
  assert.equal(healthy.healthy, true);
  assert.equal(healthy.status, 'online');
});

test('queue status fails closed when MariaDB is unavailable', async () => {
  const unavailable = { query: async () => { throw Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' }); } };
  await assert.rejects(
    () => getOutboxStatus({ pool: unavailable, signingSecret: signingSecret32 }),
    error => error.code === 'ECONNREFUSED'
  );
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

test('encryption fails closed when no server-side key is configured', () => {
  assert.equal(createEncryptionProvider({}), null, 'no provider is constructed without a key');
  const provider = new ServerKeyEncryptionProvider({
    keys: new Map([['v1', crypto.randomBytes(32)]]),
  });
  assert.throws(() => provider.decryptValue({ __enterpriseEncrypted: true, alg: 'AES-256-GCM', keyVersion: 'v9' }), /ENTERPRISE_ENCRYPTION_UNAVAILABLE|not configured/);
  assert.equal(provider.describe().managedKms, false, 'must never claim a managed KMS');
});

test('requesting the managed KMS provider fails explicitly instead of pretending', () => {
  assert.throws(() => createEncryptionProvider({ ENTERPRISE_ENCRYPTION_PROVIDER: 'kms', ENTERPRISE_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64') }), /not implemented/i);
});
