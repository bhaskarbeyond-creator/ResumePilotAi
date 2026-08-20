'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { MemoryFirestore, createMemoryAdmin } = require('../test/helpers/memoryFirestore');
const { createTenantService } = require('../enterprise/tenantService');
const { checkTenantRateLimit, pingRedis, redisConfigured } = require('../enterprise/redisCacheService');
const { FirestoreTenantRegistry } = require('../enterprise/tenantRegistry');
const { FirestoreEnterpriseRepository } = require('../enterprise/firestoreEnterpriseRepository');

const root = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

/**
 * Architecture truth suite: verifies the refactor's structural guarantees so a
 * future change cannot silently reintroduce a hard PostgreSQL, Redis, KMS, or
 * volatile-queue dependency.
 */

test('enterprise business logic contains no direct PostgreSQL usage', () => {
  for (const file of ['backend/enterprise/tenantService.js', 'backend/routes/enterprise.js', 'backend/routes/enterpriseM2m.js']) {
    const source = read(file);
    assert.doesNotMatch(source, /require\(['"]pg['"]\)/, `${file} must not require pg`);
    assert.doesNotMatch(source, /new Pool\(/, `${file} must not construct a PostgreSQL pool`);
    assert.doesNotMatch(source, /(process|environment)\.TENANT_DATABASE_URL/, `${file} must not read TENANT_DATABASE_URL directly`);
  }
});

test('PostgreSQL lives only behind the optional adapter modules', () => {
  const adapter = read('backend/enterprise/postgresEnterpriseRepository.js');
  const dataPlane = read('backend/enterprise/tenantDataPlane.js');
  for (const source of [adapter, dataPlane]) {
    assert.match(source, /optional|adapter|Optional|legacy/i, 'adapter modules must declare themselves optional adapters');
  }
  const factory = read('backend/enterprise/enterpriseRepository.js');
  assert.match(factory, /default.*firestore|firestore.*default|canonical/i);
  // No other enterprise module requires the data plane directly.
  for (const name of fs.readdirSync(path.join(root, 'backend/enterprise'))) {
    if (['postgresEnterpriseRepository.js', 'sqlMigrations.js', 'tenantDataPlane.js', 'tenantRepository.js'].includes(name)) continue;
    const source = fs.readFileSync(path.join(root, 'backend/enterprise', name), 'utf8');
    assert.doesNotMatch(source, /require\('\.\/tenantDataPlane'\)/, `backend/enterprise/${name} must not use the PostgreSQL data plane directly`);
  }
});

test('the volatile in-process queue engine is gone from production code', () => {
  assert.equal(fs.existsSync(path.join(root, 'backend/enterprise/tenantWorker.js')), false, 'tenantWorker.js (in-memory engine) must not exist');
  const routes = read('backend/routes/enterprise.js');
  assert.match(routes, /enterpriseOutbox/, 'routes must use the durable outbox');
  const outbox = read('backend/enterprise/enterpriseOutbox.js');
  assert.match(outbox, /runTransaction/, 'job claiming must use Firestore lease transactions');
  assert.doesNotMatch(outbox, /new Map\(\)|\.push\(job\)/, 'the durable outbox must not hold jobs in process memory');
});

test('redis is optional: identical correctness with and without configuration', async () => {
  delete process.env.TENANT_REDIS_URL;
  delete process.env.REDIS_URL;
  assert.equal(redisConfigured(), false);
  const withoutRedis = await checkTenantRateLimit({ tenantId: crypto.randomUUID(), principalId: 'p', operation: 'op' });
  assert.deepEqual([withoutRedis.source, withoutRedis.authoritative], ['not-configured', false]);
  const ping = await pingRedis();
  assert.equal(ping.ok, false);
  assert.equal(ping.configured, false);
  assert.equal(ping.optional, true, 'redis status must be explicitly optional');

  // No enterprise route enforces limits through the advisory Redis limiter.
  const routes = read('backend/routes/enterprise.js');
  assert.doesNotMatch(routes, /checkTenantRateLimit/, 'route authorization/quotas must use the durable quota guard');
  const quota = read('backend/enterprise/tenantQuota.js');
  assert.match(quota, /FirestoreAtomicCounterStore/, 'durable quota store must remain the enforcement mechanism');
});

test('startup announces the active architecture truthfully', () => {
  const index = read('backend/index.js');
  assert.match(index, /Enterprise Architecture/);
  assert.match(index, /Enterprise Data Provider/);
  assert.match(index, /Queue: Firestore Durable Outbox/);
  assert.match(index, /Redis: (configured \(optional accelerator\)|not configured)/);
  assert.match(index, /Encryption Provider/);
  // The architecture log itself must not interpolate raw environment values.
  const logBlock = index.slice(index.indexOf('[Enterprise Architecture]'), index.indexOf('[Enterprise Architecture]') + 1_500);
  assert.doesNotMatch(logBlock, /process\.env\.[A-Z_]*(KEY|SECRET|URL|TOKEN|PASSWORD)/, 'startup log must never interpolate secrets');
});

test('encryption abstraction exists, is server-side, and never claims managed KMS', () => {
  const provider = read('backend/enterprise/encryptionProvider.js');
  assert.match(provider, /class ServerKeyEncryptionProvider/);
  assert.match(provider, /ManagedKmsProvider/);
  assert.match(provider, /not implemented/i, 'the KMS slot must explicitly state it is not implemented');
  assert.match(provider, /ENTERPRISE_ENCRYPTION_UNAVAILABLE/);
  assert.doesNotMatch(provider, /equivalent to KMS|as secure as KMS/i);
});

test('data plane types are Firebase-native with legacy types still readable', () => {
  const { DATA_PLANE_TYPES, ENTERPRISE_DATA_PROVIDERS } = require('../enterprise/constants');
  assert.ok(DATA_PLANE_TYPES.includes('FIRESTORE'));
  assert.ok(DATA_PLANE_TYPES.includes('SHARED_POSTGRES'), 'legacy stored tenant metadata must remain valid');
  assert.deepEqual(ENTERPRISE_DATA_PROVIDERS, ['firestore', 'postgres']);
});

test('createTenantService provisions Firestore-first without any external service', async () => {
  const db = new MemoryFirestore();
  const admin = createMemoryAdmin({ db });
  const service = createTenantService({
    db,
    admin,
    environment: {
      ENTERPRISE_DATA_PROVIDER: 'firestore',
      ENTERPRISE_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'),
    },
  });
  const runtime = service.describeRuntime();
  assert.equal(runtime.dataProvider, 'firestore');
  assert.equal(runtime.dataPlaneConfigured, true);
  assert.equal(runtime.encryption.provider, 'server-key');
  assert.equal(runtime.encryption.managedKms, false);
  assert.ok(service.repository instanceof FirestoreEnterpriseRepository);
  assert.ok(service.registry instanceof FirestoreTenantRegistry);
  assert.equal(service.meteringAvailable(), true);
});

test('missing encryption keys leave the runtime honest and operations fail closed', async () => {
  const db = new MemoryFirestore();
  const admin = createMemoryAdmin({ db });
  const service = createTenantService({ db, admin, environment: { ENTERPRISE_DATA_PROVIDER: 'firestore' } });
  const runtime = service.describeRuntime();
  assert.equal(runtime.encryption.provider, 'none');
  assert.equal(runtime.encryption.securityLevel, 'ENCRYPTION_UNAVAILABLE_FAIL_CLOSED');

  const { tenantId, workspaceId } = await service.registry.provisionTenant({ ownerPrincipalId: 'arch-owner', displayName: 'Arch Co', slug: 'arch-co' });
  const resolved = await service.resolveContext({ user: { uid: 'arch-owner', emailVerified: true, claims: {} }, requestedTenantId: tenantId, requestedWorkspaceId: workspaceId, requestId: crypto.randomUUID() });
  await assert.rejects(
    () => service.createResource({ context: resolved.context, input: { resourceType: 'RESUME', payload: { a: 1 } } }),
    error => error.code === 'ENTERPRISE_ENCRYPTION_UNAVAILABLE' && error.status === 503
  );
});

test('postgres provider selection fails closed without a database URL', () => {
  const db = new MemoryFirestore();
  const admin = createMemoryAdmin({ db });
  const service = createTenantService({
    db,
    admin,
    environment: { ENTERPRISE_DATA_PROVIDER: 'postgres' }, // no TENANT_DATABASE_URL
  });
  const runtime = service.describeRuntime();
  assert.equal(runtime.dataPlaneConfigured, false, 'postgres without a URL must not silently fall back');
});

test('environment example documents the architecture truthfully', () => {
  const env = read('.env.example');
  assert.match(env, /^ENTERPRISE_DATA_PROVIDER=firestore$/m);
  assert.match(env, /^TENANT_DATABASE_URL=$/m);
  assert.match(env, /OPTIONAL legacy PostgreSQL/i);
  assert.match(env, /^REDIS_URL=$/m);
  assert.match(env, /OPTIONAL Redis accelerator/i);
  assert.match(env, /^ENTERPRISE_ENCRYPTION_KEY=$/m);
  assert.match(env, /^ENTERPRISE_OUTBOX_WORKER_ENABLED=false$/m);
  assert.match(env, /^ENTERPRISE_STORAGE_PROVIDER=firebase-storage$/m);
  assert.doesNotMatch(env, /^VITE_(ENTERPRISE_ENCRYPTION|TENANT_DATABASE)/m);
});

test('security rules deny all client access to the enterprise data plane', () => {
  const rules = read('SecurityRules.txt');
  assert.match(rules, /match \/tenants\/\{tenantId\}\/\{document=.*\}/, 'tenant partition tree must be deny-all for clients');
  assert.match(rules, /enterprise_/);
});
