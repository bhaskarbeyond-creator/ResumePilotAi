'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Repository = require('../repositories/InMemoryRepository');

test('in-memory profile creation, conflict, retry and subsequent update use revision zero for absence', async () => {
  const repo = new Repository();
  const uid = 'memory-profile-test';
  await repo.saveUserWithRevisionGuard(uid, { firstname: 'First' }, 0);
  assert.equal((await repo.getUser(uid)).revision, 1);
  await assert.rejects(repo.saveUserWithRevisionGuard(uid, { firstname: 'Stale' }, 0), e => e.code === 'PROFILE_CONFLICT' && e.remoteRevision === 1);
  assert.equal((await repo.getUser(uid)).firstname, 'First');
  await repo.saveUserWithRevisionGuard(uid, { firstname: 'Updated' }, 1);
  assert.equal((await repo.getUser(uid)).revision, 2);
  assert.equal((await repo.getUser(uid)).firstname, 'Updated');
});

test('concurrent in-memory initial creates do not both succeed', async () => {
  const repo = new Repository();
  const attempts = await Promise.allSettled([
    repo.saveUserWithRevisionGuard('concurrent-user', { firstname: 'A' }, 0),
    repo.saveUserWithRevisionGuard('concurrent-user', { firstname: 'B' }, 0),
  ]);
  assert.equal(attempts.filter(x => x.status === 'fulfilled').length, 1);
  const rejected = attempts.find(x => x.status === 'rejected');
  assert.equal(rejected.reason.code, 'PROFILE_CONFLICT');
  assert.equal(rejected.reason.remoteRevision, 1);
  assert.equal((await repo.getUser('concurrent-user')).revision, 1);
});
