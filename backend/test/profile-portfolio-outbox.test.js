'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const MySQLRepository = require('../repositories/MySQLRepository');

function transactionHarness(handler) {
  const calls = [];
  const connection = {
    async beginTransaction() { calls.push({ type: 'begin' }); },
    async query(sql, params = []) {
      calls.push({ type: 'query', sql, params });
      return handler(sql, params, calls);
    },
    async commit() { calls.push({ type: 'commit' }); },
    async rollback() { calls.push({ type: 'rollback' }); },
    release() { calls.push({ type: 'release' }); },
  };
  return { calls, pool: { getConnection: async () => connection } };
}

function repositoryWith(pool) {
  const repository = new MySQLRepository();
  repository._getPool = () => pool;
  return repository;
}

test('new profile and deterministic welcome event commit atomically', async () => {
  const harness = transactionHarness(async (sql) => {
    if (/SELECT revision FROM users/.test(sql)) return [[], []];
    return [{ affectedRows: 1 }, []];
  });
  const repository = repositoryWith(harness.pool);
  const saved = await repository.saveUserWithRevisionGuard('profile_user_1', {
    email: 'New.User@example.com', displayName: 'New User', membership: 'Basic',
  }, 0);
  assert.equal(saved.revision, 1);
  const userInsert = harness.calls.findIndex(call => call.type === 'query' && /INSERT INTO users/.test(call.sql));
  const outboxInsert = harness.calls.findIndex(call => call.type === 'query' && /INSERT INTO notification_outbox/.test(call.sql));
  const commit = harness.calls.findIndex(call => call.type === 'commit');
  assert.ok(userInsert > 0 && outboxInsert > userInsert && commit > outboxInsert);
  assert.equal(harness.calls[outboxInsert].params[1], 'user-welcome:profile_user_1');
  assert.equal(harness.calls[outboxInsert].params[2], 'new.user@example.com');
});

test('new profile rolls back when welcome enqueue fails', async () => {
  const harness = transactionHarness(async (sql) => {
    if (/SELECT revision FROM users/.test(sql)) return [[], []];
    if (/INSERT INTO notification_outbox/.test(sql)) throw new Error('queue unavailable');
    return [{ affectedRows: 1 }, []];
  });
  const repository = repositoryWith(harness.pool);
  await assert.rejects(
    () => repository.saveUserWithRevisionGuard('profile_user_2', { email: 'user@example.com' }, 0),
    /queue unavailable/
  );
  assert.ok(harness.calls.some(call => call.type === 'rollback'));
  assert.equal(harness.calls.some(call => call.type === 'commit'), false);
});

test('profile updates do not enqueue duplicate welcome events', async () => {
  const harness = transactionHarness(async (sql) => {
    if (/SELECT revision FROM users/.test(sql)) return [[{ revision: 3 }], []];
    return [{ affectedRows: 1 }, []];
  });
  const repository = repositoryWith(harness.pool);
  const saved = await repository.saveUserWithRevisionGuard('profile_user_3', { email: 'user@example.com' }, 3);
  assert.equal(saved.revision, 4);
  assert.equal(harness.calls.some(call => call.type === 'query' && /notification_outbox/.test(call.sql)), false);
});

test('first portfolio publication and publication event commit atomically', async () => {
  const harness = transactionHarness(async (sql) => {
    if (/SELECT email, displayName, firstname FROM users/.test(sql)) return [[{ email: 'owner@example.com', displayName: 'Owner' }], []];
    if (/SELECT user_id, slug, is_published, revision/.test(sql)) return [[], []];
    return [{ affectedRows: 1 }, []];
  });
  const repository = repositoryWith(harness.pool);
  const saved = await repository.savePortfolio('profile_user_1', 'portfolio_1234', {
    title: 'My Portfolio', theme: 'minimal', isPublished: true,
    content: [{ type: 'Hero', props: { name: 'Owner' } }], root: { props: { title: 'My Portfolio' } },
  }, { expectedRevision: 0 });
  assert.equal(saved.revision, 1);
  assert.equal(saved.isPublished, true);
  assert.match(saved.slug, /^my-portfolio-[a-f0-9]{8}$/);
  const portfolioInsert = harness.calls.findIndex(call => call.type === 'query' && /INSERT INTO portfolios/.test(call.sql));
  const outboxInsert = harness.calls.findIndex(call => call.type === 'query' && /INSERT INTO notification_outbox/.test(call.sql));
  const commit = harness.calls.findIndex(call => call.type === 'commit');
  assert.ok(portfolioInsert > 0 && outboxInsert > portfolioInsert && commit > outboxInsert);
  assert.equal(harness.calls[outboxInsert].params[1], 'portfolio-published:portfolio_1234:1');
});

test('portfolio publication rolls back if its outbox event cannot enqueue', async () => {
  const harness = transactionHarness(async (sql) => {
    if (/SELECT email, displayName, firstname FROM users/.test(sql)) return [[{ email: 'owner@example.com', displayName: 'Owner' }], []];
    if (/SELECT user_id, slug, is_published, revision/.test(sql)) return [[], []];
    if (/INSERT INTO notification_outbox/.test(sql)) throw new Error('queue unavailable');
    return [{ affectedRows: 1 }, []];
  });
  const repository = repositoryWith(harness.pool);
  await assert.rejects(
    () => repository.savePortfolio('profile_user_1', 'portfolio_1234', { title: 'Portfolio', isPublished: true }, { expectedRevision: 0 }),
    /queue unavailable/
  );
  assert.ok(harness.calls.some(call => call.type === 'rollback'));
  assert.equal(harness.calls.some(call => call.type === 'commit'), false);
});

test('portfolio CAS rejects stale revisions before mutation or notification', async () => {
  const harness = transactionHarness(async (sql) => {
    if (/SELECT email, displayName, firstname FROM users/.test(sql)) return [[{ email: 'owner@example.com' }], []];
    if (/SELECT user_id, slug, is_published, revision/.test(sql)) {
      return [[{ user_id: 'profile_user_1', slug: 'stable-deadbeef', is_published: 1, revision: 8, published_at: new Date() }], []];
    }
    return [{ affectedRows: 1 }, []];
  });
  const repository = repositoryWith(harness.pool);
  await assert.rejects(
    () => repository.savePortfolio('profile_user_1', 'portfolio_1234', { title: 'Stale', isPublished: true }, { expectedRevision: 7 }),
    error => error?.code === 'PORTFOLIO_CONFLICT' && error.remoteRevision === 8
  );
  assert.equal(harness.calls.some(call => call.type === 'query' && /INSERT INTO portfolios/.test(call.sql)), false);
  assert.equal(harness.calls.some(call => call.type === 'query' && /notification_outbox/.test(call.sql)), false);
  assert.ok(harness.calls.some(call => call.type === 'rollback'));
});

test('portfolio identifiers cannot be reassigned across owners', async () => {
  const harness = transactionHarness(async (sql) => {
    if (/SELECT email, displayName, firstname FROM users/.test(sql)) return [[{ email: 'attacker@example.com' }], []];
    if (/SELECT user_id, slug, is_published, revision/.test(sql)) return [[{ user_id: 'real_owner', revision: 2 }], []];
    return [{ affectedRows: 1 }, []];
  });
  const repository = repositoryWith(harness.pool);
  await assert.rejects(
    () => repository.savePortfolio('attacker', 'portfolio_1234', { title: 'Takeover', isPublished: true }, { expectedRevision: 2 }),
    error => error?.code === 'PORTFOLIO_NOT_FOUND' && error.status === 404
  );
  assert.equal(harness.calls.some(call => call.type === 'query' && /INSERT INTO portfolios/.test(call.sql)), false);
});
