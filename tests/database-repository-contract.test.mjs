import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';

const require = createRequire(import.meta.url);
const repositoryFactory = require('../backend/repositories');
const authority = require('../backend/database/authority');
const { ENTITIES, getOwnership } = require('../backend/database/ownership');
const ResilientRepository = require('../backend/repositories/ResilientRepository');

test('repository factory exposes one MariaDB implementation and no runtime selector', () => {
  assert.equal(typeof repositoryFactory.MySQLRepository, 'function');
  assert.equal(typeof repositoryFactory.ResilientRepository, 'function');
  assert.deepEqual(Object.keys(repositoryFactory).sort(), [
    'MySQLRepository', 'ResilientRepository', 'getDirectRepository', 'getRepository', 'resetRepositoryCacheForTests', 'setRepositoryForTests',
  ]);
});

test('every persisted application domain has exactly one declared owner', () => {
  const entries = Object.values(ENTITIES);
  assert.ok(entries.length >= 35);
  assert.equal(new Set(entries.map(entry => entry.entity)).size, entries.length);
  for (const entry of entries) {
    if (entry.entity === 'identity') assert.equal(entry.owner, 'FIREBASE_AUTH');
    else if (entry.entity === 'permission') assert.equal(entry.owner, 'CODE');
    else assert.equal(entry.owner, 'MARIADB', entry.entity);
    assert.equal(entry.replication, 'NONE', entry.entity);
  }
  assert.equal(getOwnership('resumes').table, 'resumes');
  assert.throws(() => getOwnership('unknown-domain'), error => error.code === 'DATABASE_OWNERSHIP_UNREGISTERED');
});

test('database authority cannot be switched or promoted at runtime', () => {
  assert.equal(authority.getConfiguredPrimary(), 'mysql');
  assert.equal(authority.getConfiguredSecondary(), null);
  assert.deepEqual(authority.getReadOrder(), ['mysql']);
  assert.throws(() => authority.assertManualSwitchAllowed(), error => error.code === 'DATABASE_OWNER_IMMUTABLE' && error.status === 409);
  assert.throws(() => authority.noteSecondaryFallback(), error => error.code === 'DATABASE_FALLBACK_FORBIDDEN');
});

test('repository outage is surfaced and never answered from a secondary store', async () => {
  authority.__resetForTests({ mysqlHealthy: true });
  const transportError = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
  const repository = new ResilientRepository({ mysqlRepo: { async getUser() { throw transportError; } } });
  await assert.rejects(repository.getUser('user-a'), error => error.status === 503 && error.code === 'ECONNREFUSED');
  const status = authority.getStatus();
  assert.equal(status.operationalWriteEngine, 'mysql');
  assert.equal(status.configuredSecondary, null);
  assert.equal(status.metrics.readFailures, 1);
});

test('owner-scoped and public-visibility SQL invariants are present in the canonical repository', async () => {
  const source = await fs.readFile(new URL('../backend/repositories/MySQLRepository.js', import.meta.url), 'utf8');
  assert.match(source, /SELECT \* FROM resumes WHERE id = \? AND user_id = \? LIMIT 1/);
  assert.match(source, /SELECT \* FROM job_tracker WHERE id = \? AND user_id = \? FOR UPDATE/);
  assert.match(source, /LOWER\(status\) = 'active'.*expires_at IS NULL/s);
  assert.match(source, /DELETE FROM jobs WHERE id = \? AND employer_id = \?/);
});
