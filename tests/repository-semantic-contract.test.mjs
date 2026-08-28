import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const MySQLRepository = require('../backend/repositories/MySQLRepository');
const ResilientRepository = require('../backend/repositories/ResilientRepository');
const { ENTITIES } = require('../backend/database/ownership');

const source = await fs.readFile('backend/repositories/MySQLRepository.js', 'utf8');

test('canonical repository implements the complete public method surface', () => {
  const methods = Object.getOwnPropertyNames(MySQLRepository.prototype)
    .filter(name => name !== 'constructor' && !name.startsWith('_'));
  assert.ok(methods.length >= 65, `expected broad repository surface, found ${methods.length}`);
  assert.equal(new Set(methods).size, methods.length);
  const resilient = new ResilientRepository({ mysqlRepo: new MySQLRepository() });
  for (const method of methods) assert.equal(typeof resilient[method], 'function', method);
});

test('user and resume reads are owner-scoped and revisions are compare-and-swap guarded', () => {
  assert.match(source, /SELECT \* FROM users WHERE id = \? LIMIT 1/);
  assert.match(source, /SELECT \* FROM resumes WHERE id = \? AND user_id = \? LIMIT 1/);
  assert.match(source, /SELECT user_id FROM resumes WHERE id = \? FOR UPDATE/);
  assert.match(source, /conflict\.code = 'RESUME_CONFLICT'/);
  assert.match(source, /WHERE id = \? AND user_id = \?/);
});

test('portfolio and cover mutation SQL cannot re-own another account primary key', () => {
  assert.match(source, /SELECT user_id, slug, is_published, revision, published_at FROM portfolios WHERE id = \? FOR UPDATE/);
  assert.match(source, /DELETE FROM portfolios WHERE id = \? AND user_id = \?/);
  assert.match(source, /SELECT user_id FROM covers WHERE id = \? FOR UPDATE/);
  assert.match(source, /DELETE FROM covers WHERE id = \? AND user_id = \?/);
});

test('job and application methods retain immutable owner predicates', () => {
  assert.match(source, /SELECT employer_id, revision FROM jobs WHERE id = \? FOR UPDATE/);
  assert.match(source, /WHERE id = \? AND employer_id = \?/);
  assert.match(source, /SELECT \* FROM applications WHERE 1=1/);
  assert.match(source, /applicant_id = \?/);
  assert.match(source, /employer_id = \?/);
});

test('transaction helper commits success and rolls back failure', async () => {
  const events = [];
  const connection = {
    async beginTransaction() { events.push('BEGIN'); },
    async commit() { events.push('COMMIT'); },
    async rollback() { events.push('ROLLBACK'); },
    release() { events.push('RELEASE'); },
  };
  const repository = new MySQLRepository();
  repository._getPool = () => ({ getConnection: async () => connection });
  assert.equal(await repository._withTransaction(async () => 'ok'), 'ok');
  assert.deepEqual(events, ['BEGIN', 'COMMIT', 'RELEASE']);

  events.length = 0;
  await assert.rejects(repository._withTransaction(async () => { throw new Error('fail'); }), /fail/);
  assert.deepEqual(events, ['BEGIN', 'ROLLBACK', 'RELEASE']);
});

test('deadlocks retry with a fresh transaction and never acknowledge the failed attempt', async () => {
  let attempts = 0;
  let commits = 0;
  let rollbacks = 0;
  const repository = new MySQLRepository();
  repository._getPool = () => ({
    async getConnection() {
      return {
        async beginTransaction() {},
        async commit() { commits += 1; },
        async rollback() { rollbacks += 1; },
        release() {},
      };
    },
  });
  const result = await repository._withTransaction(async () => {
    attempts += 1;
    if (attempts < 3) throw Object.assign(new Error('deadlock'), { code: 'ER_LOCK_DEADLOCK' });
    return 'committed';
  });
  assert.equal(result, 'committed');
  assert.equal(attempts, 3);
  assert.equal(commits, 1);
  assert.equal(rollbacks, 2);
});

test('every repository-backed ownership declaration resolves to a MariaDB table', () => {
  const persisted = Object.values(ENTITIES).filter(entry => entry.table);
  assert.ok(persisted.length >= 35);
  for (const entry of persisted) {
    assert.equal(entry.owner, 'MARIADB', entry.entity);
    assert.equal(entry.writeMode, 'SINGLE_OWNER', entry.entity);
    assert.equal(entry.replication, 'NONE', entry.entity);
  }
});
