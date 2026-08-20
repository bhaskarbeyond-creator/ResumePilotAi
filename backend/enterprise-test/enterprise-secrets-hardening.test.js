'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { MemoryFirestore, createMemoryAdmin } = require('../test/helpers/memoryFirestore');
const { getOutboxStatus } = require('../enterprise/enterpriseOutbox');
const { createTenantArtifactToken } = require('../enterprise/tenantSignedArtifacts');
const { ServerKeyEncryptionProvider, createEncryptionProvider } = require('../enterprise/encryptionProvider');

const context = Object.freeze({
  tenantId: '11111111-1111-4111-8111-111111111111',
  workspaceId: '22222222-2222-4222-8222-222222222222',
  dataPlane: { id: 'firestore-primary', type: 'FIRESTORE', region: 'default', routingVersion: 1, storageProfile: 'shared', cacheProfile: 'shared', queueProfile: 'firestore-durable-outbox', aiProfile: 'platform-default', securityProfile: 'standard' },
  lifecycleState: 'ACTIVE',
});

const signingSecret32 = '0123456789abcdef0123456789abcdef';

test('durable queue status is truthful when the signing secret is missing', async () => {
  const db = new MemoryFirestore();
  const admin = createMemoryAdmin({ db });
  const misconfigured = await getOutboxStatus({ db, admin, signingSecret: '' });
  assert.equal(misconfigured.healthy, false);
  assert.equal(misconfigured.status, 'misconfigured');
  assert.equal(misconfigured.durable, true);

  const healthy = await getOutboxStatus({ db, admin, signingSecret: signingSecret32 });
  assert.equal(healthy.healthy, true);
  assert.equal(healthy.status, 'online');
});

test('queue status never reports healthy without a Firestore data plane', async () => {
  const offline = await getOutboxStatus({ db: null, admin: null, signingSecret: signingSecret32 });
  assert.equal(offline.configured, false);
  assert.equal(offline.healthy, false);
  assert.equal(offline.status, 'unavailable');
  assert.equal(offline.durable, true, 'the engine is durable by design; it is simply not configured here');
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
