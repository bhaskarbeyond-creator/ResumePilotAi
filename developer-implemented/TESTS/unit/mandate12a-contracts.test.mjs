// Isolated HTTP contract tests: the pool is a controlled fixture, not MariaDB evidence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../../backend/index.js', import.meta.url));
const express = require('express');
const request = require('supertest');
const mysql = require('./database/mysql');
let query;
mysql.getPool = () => ({ query: (...args) => query(...args) });
const { platformRouter } = require('./routes/platform');
const app = express();
app.use((req, _res, next) => {
  if (req.get('x-test-role')) req.user = { uid: 'test-user', claims: { role: req.get('x-test-role') } };
  next();
});
app.use('/api/platform', platformRouter);
const get = (path, role = 'SUPER_ADMIN') => request(app).get(`/api/platform/${path}`).set('x-test-role', role);

const setupCounts = values => {
  const calls = [];
  query = async (sql, params) => {
    calls.push({ sql, params });
    const index = sql.includes('FROM users') ? 0 : sql.includes('FROM resumes') ? 1 : 2;
    return [[{ total: values[index] }]];
  };
  return calls;
};

test('stats return all three database counts and use parameterized calls', async () => {
  const calls = setupCounts([3, '12', 5]);
  const res = await get('stats');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { users: 3, resumes: 12, tenants: 5 });
  assert.equal(calls.length, 3);
  assert.match(calls[0].sql, /FROM users WHERE deleted_at IS NULL/);
  assert.match(calls[1].sql, /FROM resumes WHERE deleted_at IS NULL/);
  assert.match(calls[2].sql, /FROM enterprise_tenants/);
  assert.ok(calls.every(call => Array.isArray(call.params)));
  assert.equal(res.headers['cache-control'], 'no-store');
});
test('confirmed zero counts remain zero', async () => {
  setupCounts([0, 0, 0]);
  const res = await get('stats');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { users: 0, resumes: 0, tenants: 0 });
});
test('database failures and invalid counts never become zero or disclose diagnostics', async () => {
  query = async () => { throw new Error('secret database.internal password'); };
  let res = await get('stats');
  assert.equal(res.status, 503);
  assert.equal(res.body.error.code, 'PLATFORM_STATS_UNAVAILABLE');
  assert.equal(res.body.users, undefined);
  assert.doesNotMatch(JSON.stringify(res.body), /secret|database\.internal|password/);
  for (const value of [null, undefined, -1, 1.5, '1x', '9007199254740992']) {
    setupCounts([value, 0, 0]);
    res = await get('stats');
    assert.equal(res.status, 503, String(value));
    assert.equal(res.body.users, undefined);
  }
});
test('authorization rejects anonymous and ordinary users before querying', async () => {
  let calls = 0;
  query = async () => { calls++; throw Error('unexpected'); };
  assert.equal((await request(app).get('/api/platform/stats')).status, 401);
  assert.equal((await get('stats', 'USER')).status, 403);
  assert.equal((await get('health/probes', 'USER')).status, 403);
  assert.equal(calls, 0);
});
test('health probes reflect success, unconfigured auth, failure, and never leak exceptions', async () => {
  let calls = 0;
  query = async (_sql, params) => { calls++; assert.deepEqual(params, []); return [[{ alive: 1 }]]; };
  app.set('firebaseAdmin', undefined);
  let res = await get('health/probes');
  assert.equal(res.status, 200);
  assert.equal(res.body.services.find(s => s.id === 'api').state, 'HEALTHY');
  assert.equal(res.body.services.find(s => s.id === 'database').state, 'HEALTHY');
  assert.equal(res.body.services.find(s => s.id === 'authentication').state, 'UNKNOWN');
  assert.equal(res.headers['cache-control'], 'no-store');
  app.set('firebaseAdmin', { auth: () => ({ listUsers: async n => { assert.equal(n, 1); } }) });
  res = await get('health/probes');
  assert.equal(res.body.services.find(s => s.id === 'authentication').state, 'HEALTHY');
  assert.equal(calls, 2);
  query = async () => { throw new Error('password secret host.internal'); };
  app.set('firebaseAdmin', { auth: () => ({ listUsers: async () => { throw new Error('secret auth.internal'); } }) });
  res = await get('health/probes');
  assert.equal(res.status, 200);
  assert.equal(res.body.services.find(s => s.id === 'database').state, 'DEGRADED');
  assert.equal(res.body.services.find(s => s.id === 'authentication').state, 'DEGRADED');
  assert.doesNotMatch(JSON.stringify(res.body), /password|secret|\.internal/);
  query = async () => [[{ alive: 0 }]];
  res = await get('health/probes');
  assert.equal(res.body.services.find(s => s.id === 'database').state, 'DEGRADED');
});
test.skip('Tenant quota/domain persistence: schema and service authorization required');
test.skip('Seat concurrency: isolated MariaDB and out-of-scope enforcement review required');
test.skip('Session revocation: authorization and server enforcement required');
test.skip('Webhook certification: out-of-scope entry point and persistent transaction review required');
