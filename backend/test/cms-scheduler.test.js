'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const MySQLRepository = require('../repositories/MySQLRepository');
const { publishDueBlogPosts } = require('../services/cmsScheduler');

function sqlHarness(records, { forceConflict = false } = {}) {
  const rows = new Map(Object.entries(records).map(([id, value]) => [id, { id, ...value }]));
  const calls = [];
  const audits = [];
  const connection = {
    async beginTransaction() { calls.push('begin'); },
    async commit() { calls.push('commit'); },
    async rollback() { calls.push('rollback'); },
    release() { calls.push('release'); },
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (/SELECT id, revision\s+FROM blog/.test(sql)) {
        const now = Date.now();
        return [[...rows.values()]
          .filter(row => row.status === 'scheduled' && row.scheduledAt && Date.parse(row.scheduledAt) <= now)
          .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt))
          .slice(0, 200)
          .map(row => ({ id: row.id, revision: row.revision }))];
      }
      if (/UPDATE blog/.test(sql)) {
        const [id, expectedRevision] = params;
        const row = rows.get(id);
        if (forceConflict || !row || row.status !== 'scheduled' || Number(row.revision) !== Number(expectedRevision)) {
          return [{ affectedRows: 0 }];
        }
        Object.assign(row, { status: 'approved', published: true, scheduledAt: null, revision: Number(row.revision) + 1 });
        return [{ affectedRows: 1 }];
      }
      if (/INSERT INTO security_audit_logs/.test(sql)) {
        audits.push({ actorUid: params[1], postId: params[2], requestId: params[4] });
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  return { rows, calls, audits, pool: { getConnection: async () => connection } };
}

function repositoryWithPool(pool) {
  const repository = new MySQLRepository();
  repository._getPool = () => pool;
  return repository;
}

test('trusted CMS scheduler transaction publishes only due revisions and is idempotent', async () => {
  const now = Date.now();
  const harness = sqlHarness({
    due: { status: 'scheduled', scheduledAt: new Date(now - 60_000).toISOString(), revision: 2 },
    future: { status: 'scheduled', scheduledAt: new Date(now + 3_600_000).toISOString(), revision: 4 },
    draft: { status: 'draft', scheduledAt: null, revision: 1 },
  });
  const repository = repositoryWithPool(harness.pool);

  const firstCount = await publishDueBlogPosts({ actorUid: 'scheduler-test', requestId: 'request-1', repository });
  assert.equal(firstCount, 1);
  assert.deepEqual(harness.rows.get('due'), {
    id: 'due', status: 'approved', published: true, scheduledAt: null, revision: 3,
  });
  assert.equal(harness.rows.get('future').status, 'scheduled');
  assert.equal(harness.rows.get('draft').status, 'draft');
  assert.deepEqual(harness.audits, [{ actorUid: 'scheduler-test', postId: 'due', requestId: 'request-1' }]);

  const secondCount = await publishDueBlogPosts({ actorUid: 'scheduler-test', requestId: 'request-2', repository });
  assert.equal(secondCount, 0);
  assert.equal(harness.rows.get('due').revision, 3);
  assert.equal(harness.calls.filter(call => call === 'begin').length, 2);
  assert.equal(harness.calls.filter(call => call === 'commit').length, 2);
  assert.equal(harness.calls.filter(call => call === 'rollback').length, 0);
});

test('CMS scheduler rolls back and surfaces a concurrent revision conflict', async () => {
  const harness = sqlHarness({
    due: { status: 'scheduled', scheduledAt: new Date(Date.now() - 60_000).toISOString(), revision: 7 },
  }, { forceConflict: true });
  const repository = repositoryWithPool(harness.pool);

  await assert.rejects(
    () => publishDueBlogPosts({ repository }),
    error => error.code === 'CMS_PUBLICATION_CONFLICT' && error.status === 409
  );
  assert.equal(harness.calls.includes('commit'), false);
  assert.equal(harness.calls.includes('rollback'), true);
  assert.equal(harness.audits.length, 0);
});

test('CMS scheduler fails closed when the atomic repository adapter is absent', async () => {
  await assert.rejects(
    () => publishDueBlogPosts({ repository: {} }),
    error => error.code === 'ATOMIC_CMS_PUBLICATION_UNAVAILABLE' && error.status === 503
  );
});
