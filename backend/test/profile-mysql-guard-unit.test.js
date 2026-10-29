'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const MySQLRepository = require('../repositories/MySQLRepository');
function harness({ existing = null, duplicate = false } = {}) {
  const calls = [];
  const conn = { async beginTransaction(){ calls.push('begin'); }, async commit(){ calls.push('commit'); }, async rollback(){ calls.push('rollback'); }, release(){ calls.push('release'); }, async query(sql) {
    calls.push(sql);
    if (sql.startsWith('SELECT revision FROM users')) return [existing ? [{revision:existing}] : [], []];
    if (sql.startsWith('INSERT INTO users') && duplicate) throw Object.assign(new Error('duplicate'), {code:'ER_DUP_ENTRY'});
    return [{affectedRows:1}, []];
  }};
  const repo = new MySQLRepository(); repo._getPool = () => ({getConnection: async()=>conn});
  return {repo,calls};
}
test('guarded creation uses insert-only and preserves atomic welcome event', async () => {
  const {repo,calls} = harness(); await repo.saveUserWithRevisionGuard('new_user',{email:'new@example.test'},0);
  const insert = calls.find(x=>x.startsWith('INSERT INTO users'));
  assert.ok(insert); assert.doesNotMatch(insert,/ON DUPLICATE KEY UPDATE/);
  assert.ok(calls.some(x=>x.includes('notification_outbox'))); assert.ok(calls.includes('commit'));
});
test('existing guarded update still uses row lock and rejects stale revision', async () => {
  const {repo,calls}=harness({existing:4});
  await assert.rejects(repo.saveUserWithRevisionGuard('existing',{email:'a@example.test'},3), e=>e.code==='PROFILE_CONFLICT' && e.remoteRevision===4);
  assert.ok(calls.includes('rollback')); assert.ok(!calls.some(x=>x.startsWith('INSERT INTO users')));
  await repo.saveUserWithRevisionGuard('existing',{email:'a@example.test'},4);
  assert.match(calls.find(x=>x.startsWith('INSERT INTO users')),/ON DUPLICATE KEY UPDATE/);
});
test('competing insert rolls back and maps duplicate UID to authoritative conflict', async () => {
  const {repo,calls}=harness({duplicate:true}); repo.getUser=async()=>({revision:1});
  await assert.rejects(repo.saveUserWithRevisionGuard('new_user',{email:'new@example.test'},0),e=>e.code==='PROFILE_CONFLICT' && e.remoteRevision===1);
  assert.ok(calls.includes('rollback')); assert.ok(!calls.includes('commit'));
});
test('unrelated duplicate is not hidden as profile conflict', async () => {
  const {repo}=harness({duplicate:true}); repo.getUser=async()=>null;
  await assert.rejects(repo.saveUserWithRevisionGuard('new_user',{email:'new@example.test'},0),e=>e.code==='ER_DUP_ENTRY');
});
