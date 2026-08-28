'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createTenantService } = require('../enterprise/tenantService');
const { MySqlTenantRegistry, DEFAULT_DATA_PLANE } = require('../enterprise/mysqlTenantRegistry');
const { MySqlEnterpriseRepository } = require('../enterprise/mysqlEnterpriseRepository');

const root = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

function productionSources() {
  const dir = path.join(root, 'backend/enterprise');
  return fs.readdirSync(dir).filter(name => name.endsWith('.js')).map(name => ({ name, source: fs.readFileSync(path.join(dir, name), 'utf8') }));
}

function inertPool() {
  return {
    async query() { throw new Error('not connected in architecture unit test'); },
    async getConnection() { throw new Error('not connected in architecture unit test'); },
  };
}

test('MariaDB is the sole enterprise application-data provider; PostgreSQL clients and routing are absent', () => {
  const { DATA_PLANE_TYPES, ENTERPRISE_DATA_PROVIDERS } = require('../enterprise/constants');
  assert.deepEqual(DATA_PLANE_TYPES, ['MYSQL']);
  assert.deepEqual(ENTERPRISE_DATA_PROVIDERS, ['mysql']);
  assert.equal(DEFAULT_DATA_PLANE.id, 'mysql-primary');
  assert.equal(DEFAULT_DATA_PLANE.type, 'MYSQL');
  for (const { name, source } of productionSources()) {
    assert.doesNotMatch(source, /require\(['"]pg['"]\)|new Pool\(|TENANT_DATABASE_URL|postgresEnterpriseRepository/, `backend/enterprise/${name}`);
  }
  const pkg = JSON.parse(read('backend/package.json'));
  assert.equal(pkg.dependencies?.pg, undefined);
  assert.equal(pkg.devDependencies?.pg, undefined);
});

test('enterprise runtime contains no Firestore adapter, import, collection call, or hidden alternate owner', () => {
  for (const removed of [
    'backend/enterprise/firestoreEnterpriseRepository.js',
    'backend/enterprise/tenantRegistry.js',
    'backend/enterprise/firebaseBridge.js',
    'backend/enterprise/firebaseMigrationAdapter.js',
    'backend/enterprise/storageProvider.js',
  ]) assert.equal(fs.existsSync(path.join(root, removed)), false, `${removed} must remain removed`);
  for (const { name, source } of productionSources()) {
    assert.doesNotMatch(source, /firebase-admin\/firestore|admin\.firestore|\.collection\(|runTransaction\(/, `backend/enterprise/${name}`);
  }
});

test('durable job queue uses MariaDB leases, retries, idempotency, and dead-letter state—not process memory', () => {
  const source = read('backend/enterprise/enterpriseOutbox.js');
  assert.match(source, /INSERT INTO enterprise_outbox/);
  assert.match(source, /FOR UPDATE/);
  assert.match(source, /leaseOwner/);
  assert.match(source, /DEAD_LETTER/);
  assert.match(source, /idempotencyKey/);
  assert.doesNotMatch(source, /new Map\(\)|\.push\(job\)/);
  assert.equal(fs.existsSync(path.join(root, 'backend/enterprise/tenantWorker.js')), false);
});

test('Redis is not a correctness dependency or package', () => {
  const pkg = JSON.parse(read('backend/package.json'));
  for (const dependency of ['redis', 'ioredis', 'redis-memory-server']) {
    assert.equal(pkg.dependencies?.[dependency], undefined);
    assert.equal(pkg.devDependencies?.[dependency], undefined);
  }
  for (const { name, source } of productionSources()) {
    assert.doesNotMatch(source, /require\(['"](?:ioredis|redis)['"]\)|TENANT_REDIS_URL|REDIS_URL/, `backend/enterprise/${name}`);
  }
});

test('startup describes MariaDB ownership and never logs environment secrets', () => {
  const source = read('backend/index.js');
  assert.match(source, /Enterprise Data Provider:/);
  assert.match(source, /Queue: MariaDB transactional outbox/);
  assert.match(source, /Cache: none \(MySQL\/MariaDB is the authoritative store\)/);
  const block = source.slice(source.indexOf("console.log('[Enterprise Architecture]'"), source.indexOf("console.log('[Enterprise Architecture]'") + 1800);
  assert.doesNotMatch(block, /process\.env\.[A-Z_]*(?:KEY|SECRET|TOKEN|PASSWORD|URL)/);
});

test('service construction wires only MySql registry/repository and a server-side encryption provider', () => {
  const pool = inertPool();
  const service = createTenantService({
    pool,
    environment: {
      ENTERPRISE_DATA_PROVIDER: 'mysql',
      ENTERPRISE_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'),
    },
  });
  const runtime = service.describeRuntime();
  assert.equal(runtime.dataProvider, 'mysql');
  assert.equal(runtime.dataPlaneConfigured, true);
  assert.equal(runtime.encryption.provider, 'server-key');
  assert.equal(runtime.encryption.managedKms, false);
  assert.ok(service.registry instanceof MySqlTenantRegistry);
  assert.ok(service.repository instanceof MySqlEnterpriseRepository);
});

test('alternate enterprise provider selection fails closed instead of falling back', () => {
  assert.throws(
    () => createTenantService({ pool: inertPool(), environment: { ENTERPRISE_DATA_PROVIDER: 'postgres' } }),
    error => error.code === 'ENTERPRISE_DATA_PROVIDER_IMMUTABLE' && error.status === 503
  );
});

test('missing encryption key is reported truthfully and private resource writes fail before SQL', async () => {
  const service = createTenantService({ pool: inertPool(), environment: { ENTERPRISE_DATA_PROVIDER: 'mysql' } });
  const runtime = service.describeRuntime();
  assert.equal(runtime.encryption.configured, false);
  assert.equal(runtime.encryption.securityLevel, 'ENCRYPTION_UNAVAILABLE_FAIL_CLOSED');
  await assert.rejects(
    () => service.repository.createResource({
      tenantId: crypto.randomUUID(), workspaceId: crypto.randomUUID(), principalId: crypto.randomUUID(), workspaceScope: 'TENANT',
    }, { resourceType: 'RESUME', payload: { private: true } }),
    error => error.code === 'ENTERPRISE_ENCRYPTION_UNAVAILABLE' && error.status === 503
  );
});

test('environment example documents immutable MariaDB ownership and server-only keys', () => {
  const env = read('.env.example');
  assert.doesNotMatch(env, /^TENANT_DATABASE_URL=/m);
  assert.doesNotMatch(env, /^REDIS_URL=/m);
  assert.doesNotMatch(env, /^TENANT_REDIS_URL=/m);
  assert.match(env, /^ENTERPRISE_DATA_PROVIDER=mysql$/m);
  assert.match(env, /^ENTERPRISE_ENCRYPTION_KEY=$/m);
  assert.match(env, /^ENTERPRISE_OUTBOX_WORKER_ENABLED=false$/m);
  assert.doesNotMatch(env, /^VITE_(?:ENTERPRISE_ENCRYPTION|TENANT_DATABASE)/m);
});
