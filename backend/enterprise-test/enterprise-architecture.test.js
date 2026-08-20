'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { MemoryFirestore, createMemoryAdmin } = require('../test/helpers/memoryFirestore');
const { createTenantService } = require('../enterprise/tenantService');
const { FirestoreTenantRegistry } = require('../enterprise/tenantRegistry');
const { FirestoreEnterpriseRepository } = require('../enterprise/firestoreEnterpriseRepository');

const root = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

/**
 * Architecture truth suite: verifies the refactor's structural guarantees so a
 * future change cannot silently reintroduce a hard PostgreSQL, Redis, KMS, or
 * volatile-queue dependency.
 */

test('PostgreSQL is fully removed from the enterprise runtime', () => {
  const enterpriseDir = path.join(root, 'backend/enterprise');
  for (const name of fs.readdirSync(enterpriseDir)) {
    const source = fs.readFileSync(path.join(enterpriseDir, name), 'utf8');
    assert.doesNotMatch(source, /require\(['"]pg['"]\)/, `backend/enterprise/${name} must not require pg`);
    assert.doesNotMatch(source, /new Pool\(/, `backend/enterprise/${name} must not construct a database pool`);
    assert.doesNotMatch(source, /(process|environment)\.(TENANT_)?DATABASE_URL/, `backend/enterprise/${name} must not read a database URL`);
    assert.doesNotMatch(source, /require\('\.\/(tenantDataPlane|tenantRepository|postgresEnterpriseRepository|sqlMigrations)'\)/, `backend/enterprise/${name} must not import a removed PostgreSQL module`);
  }
  for (const gone of ['backend/enterprise/tenantDataPlane.js', 'backend/enterprise/tenantRepository.js', 'backend/enterprise/postgresEnterpriseRepository.js', 'backend/enterprise/sqlMigrations.js', 'backend/scripts/applyEnterpriseMigrations.js']) {
    assert.equal(fs.existsSync(path.join(root, gone)), false, `${gone} must not exist`);
  }
  // No PostgreSQL client library ships in the backend dependency tree.
  const pkg = JSON.parse(read('backend/package.json'));
  for (const section of ['dependencies', 'devDependencies']) {
    for (const dep of ['pg', '@electric-sql/pglite']) {
      assert.equal(pkg[section]?.[dep], undefined, `backend ${section} must not include ${dep}`);
    }
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

test('redis is fully removed: no client, no env wiring, correctness on Firestore alone', async () => {
  // No Redis client library, no cache service module, no route references.
  assert.equal(fs.existsSync(path.join(root, 'backend/enterprise/redisCacheService.js')), false, 'redisCacheService.js must not exist');
  const pkg = JSON.parse(read('backend/package.json'));
  for (const section of ['dependencies', 'devDependencies']) {
    for (const dep of ['ioredis', 'redis', 'redis-memory-server']) {
      assert.equal(pkg[section]?.[dep], undefined, `backend ${section} must not include ${dep}`);
    }
  }
  for (const name of fs.readdirSync(path.join(root, 'backend/enterprise'))) {
    const source = fs.readFileSync(path.join(root, 'backend/enterprise', name), 'utf8');
    assert.doesNotMatch(source, /require\(['"]ioredis['"]\)/, `backend/enterprise/${name} must not require a Redis client`);
    assert.doesNotMatch(source, /(process|environment)\.(TENANT_)?REDIS_URL/, `backend/enterprise/${name} must not read a Redis URL`);
  }
  const routes = read('backend/routes/enterprise.js');
  assert.doesNotMatch(routes, /require\('[^']*redis/i, 'routes must not import a Redis client');
  assert.doesNotMatch(routes, /pingRedis|checkTenantRateLimit|getTenantCache|setTenantCache/, 'routes must not call Redis helpers');
  assert.doesNotMatch(routes, /['"]\/cache\/status['"]/, 'the removed cache endpoint must not be registered');
  // Durable quota enforcement remains the Firestore atomic counter store.
  const quota = read('backend/enterprise/tenantQuota.js');
  assert.match(quota, /FirestoreAtomicCounterStore/, 'durable quota store must remain the enforcement mechanism');
});

test('startup announces the active architecture truthfully', () => {
  const index = read('backend/index.js');
  assert.match(index, /Enterprise Architecture/);
  assert.match(index, /Enterprise Data Provider/);
  assert.match(index, /Queue: Firestore Durable Outbox/);
  assert.match(index, /Cache: none/);
  assert.doesNotMatch(index, /redis/i, 'the startup path must not reference Redis');
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

test('data plane is Firestore-only with legacy stored metadata translated on read', () => {
  const { DATA_PLANE_TYPES, ENTERPRISE_DATA_PROVIDERS, LEGACY_DATA_PLANE_TYPES } = require('../enterprise/constants');
  assert.deepEqual(DATA_PLANE_TYPES, ['FIRESTORE']);
  assert.deepEqual(ENTERPRISE_DATA_PROVIDERS, ['firestore']);
  const { normalizeDataPlane } = require('../enterprise/tenantRegistry');
  const legacy = normalizeDataPlane({ id: 'shared-primary', type: 'SHARED_POSTGRES', routingVersion: 1 });
  assert.equal(legacy.type, 'FIRESTORE', 'stored PostgreSQL metadata must translate to the active plane');
  assert.equal(legacy.id, 'firestore-primary');
  assert.throws(() => normalizeDataPlane({ type: 'NATS_CLUSTER' }), /Unsupported data plane/);
  assert.deepEqual(LEGACY_DATA_PLANE_TYPES, ['SHARED_POSTGRES', 'DEDICATED_POSTGRES']);
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

test('non-Firestore provider selection fails closed with an explicit error', () => {
  const db = new MemoryFirestore();
  const admin = createMemoryAdmin({ db });
  const service = createTenantService({
    db,
    admin,
    environment: { ENTERPRISE_DATA_PROVIDER: 'postgres' },
  });
  const runtime = service.describeRuntime();
  assert.equal(runtime.dataPlaneConfigured, false, 'removed providers must not silently fall back');
  assert.match(String(runtime.error || ''), /Firestore is the only enterprise data plane/);
  assert.equal(runtime.dataProvider, 'postgres', 'the requested provider name stays visible for diagnosis');
});

test('environment example documents the zero-infrastructure architecture truthfully', () => {
  const env = read('.env.example');
  assert.doesNotMatch(env, /^TENANT_DATABASE_URL=/m, 'TENANT_DATABASE_URL must be gone');
  assert.doesNotMatch(env, /^REDIS_URL=/m, 'REDIS_URL must be gone');
  assert.doesNotMatch(env, /^TENANT_REDIS_URL=/m, 'TENANT_REDIS_URL must be gone');
  assert.match(env, /no PostgreSQL, Redis/i);
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
