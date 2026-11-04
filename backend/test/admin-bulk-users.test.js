'use strict';

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { setTokenVerifierForTests } = require('../security/auth');

const NOW_SECONDS = Math.floor(Date.now() / 1000);
const TOKENS = {
  super: { uid: 'sa-bulk-super', email: 'super@ime365.test', email_verified: true, role: 'SUPER_ADMIN', auth_time: NOW_SECONDS },
  admin: { uid: 'sa-bulk-admin', email: 'admin@ime365.test', email_verified: true, role: 'ADMIN', auth_time: NOW_SECONDS },
  user: { uid: 'sa-bulk-user', email: 'candidate@ime365.test', email_verified: true, role: 'USER', auth_time: NOW_SECONDS },
};

setTokenVerifierForTests(async token => {
  const identity = TOKENS[token];
  if (!identity) throw new Error('invalid test token');
  return identity;
});

const app = require('../index');
const bearer = tokenName => ({ Authorization: `Bearer ${tokenName}` });

test('Admin Bulk User Management: Rejects unauthenticated caller with 401', async () => {
  const res = await request(app)
    .post('/api/admin/users/bulk-status')
    .send({ uids: ['user-1'], status: 'SUSPENDED' });
  assert.equal(res.status, 401);
});

test('Admin Bulk User Management: Rejects regular candidate or employer caller with 403', async () => {
  const res = await request(app)
    .post('/api/admin/users/bulk-status')
    .set(bearer('user'))
    .send({ uids: ['user-1'], status: 'SUSPENDED' });
  assert.equal(res.status, 403);
  assert.equal(res.body.error?.code || res.body.code, 'FORBIDDEN');
});

test('Admin Bulk User Management: Validates payload and rejects empty uids with 400', async () => {
  const res = await request(app)
    .post('/api/admin/users/bulk-status')
    .set(bearer('super'))
    .send({ uids: [], status: 'SUSPENDED' });
  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'INVALID_UIDS');
});

test('Admin Bulk User Management: Validates payload and rejects invalid action/status with 400', async () => {
  const res = await request(app)
    .post('/api/admin/users/bulk-status')
    .set(bearer('super'))
    .send({ uids: ['user-1'], action: 'destroy_everything' });
  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'INVALID_BULK_ACTION');
});

test('Admin Bulk User Management: Prevents self-mutation in bulk operations', async () => {
  const myUid = 'sa-bulk-super';
  const res = await request(app)
    .post('/api/admin/users/bulk-status')
    .set(bearer('super'))
    .send({ uids: [myUid], status: 'SUSPENDED' });
  assert.equal(res.status, 200);
  assert.equal(res.body.summary.failed, 1);
  assert.match(res.body.results.failed[0].error, /Cannot modify your own account/);
});

test('Admin Bulk User Management: Successfully accepts bulk status change and reports summary', async () => {
  const res = await request(app)
    .post('/api/admin/users/bulk-status')
    .set(bearer('super'))
    .send({
      uids: ['target-user-test-a', 'target-user-test-b'],
      status: 'SUSPENDED',
      reason: 'Automated test bulk suspension',
      revokeSessions: true,
    });
  assert.equal(res.status, 200);
  assert.equal(res.body.summary.total, 2);
  assert.equal(res.body.summary.failed, 0);
  assert.equal(res.body.summary.succeeded, 2);
});

test('Admin Bulk User Management: Legacy /bulk alias works identically with action payload', async () => {
  const res = await request(app)
    .post('/api/admin/users/bulk')
    .set(bearer('admin'))
    .send({
      uids: ['target-user-legacy-1'],
      action: 'activate',
    });
  assert.equal(res.status, 200);
  assert.equal(res.body.summary.total, 1);
  assert.equal(res.body.summary.succeeded, 1);
});
