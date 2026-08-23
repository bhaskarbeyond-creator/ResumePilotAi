'use strict';

process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { setTokenVerifierForTests } = require('../security/auth');

setTokenVerifierForTests(async token => {
  const now = Math.floor(Date.now() / 1000);
  if (token === 'admin') return { uid: 'admin-rbac', email: 'admin@example.com', email_verified: true, role: 'ADMIN', auth_time: now };
  if (token === 'super') return { uid: 'super-rbac', email: 'super@example.com', email_verified: true, role: 'SUPER_ADMIN', auth_time: now };
  throw new Error('invalid token');
});

const app = require('../index');
const bearer = token => ({ Authorization: `Bearer ${token}` });

test('ordinary Admin cannot replace secrets or run external provider tests', async () => {
  const attempts = [
    ['post', '/api/admin/settings/socialAuth', { data: { linkedinClientSecret: 'new-client-secret-value' } }],
    ['post', '/api/admin/ai/fetch-models', { provider: 'nvidia' }],
    ['post', '/api/email/admin/test-connection', { type: 'smtp' }],
    ['post', '/api/send-sms', { toPhone: '+14155552671', messageBody: 'test' }],
    ['post', '/api/admin/payment/test-provider', { type: 'razorpay' }],
  ];
  for (const [method, route, body] of attempts) {
    const response = await request(app)[method](route).set(bearer('admin')).send(body);
    assert.equal(response.status, 403, route);
    assert.equal(response.body.error?.code, 'FORBIDDEN', route);
  }
});

test('an explicitly unsupported email test type still returns validation, not a misleading auth result', async () => {
  const response = await request(app).post('/api/email/admin/test-connection').set(bearer('admin')).send({ type: 'gemini' });
  assert.equal(response.status, 400);
  assert.equal(response.body.code, 'EMAIL_TEST_TYPE_UNSUPPORTED');
});
