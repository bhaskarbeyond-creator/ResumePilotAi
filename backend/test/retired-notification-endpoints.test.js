'use strict';

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { setTokenVerifierForTests } = require('../security/auth');

setTokenVerifierForTests(async token => {
  if (token !== 'ordinary-user') throw new Error('invalid token');
  const now = Math.floor(Date.now() / 1000);
  return { uid: 'user-1', email: 'user@example.com', email_verified: true, role: 'USER', auth_time: now };
});

const app = require('../index');
const retiredPaths = [
  '/api/notify/user-signup',
  '/api/notify/password-reset',
  '/api/notify/send-verification-email',
  '/api/notify/password-changed',
  '/api/notify/email-otp',
  '/api/notify/security-alert',
  '/api/notify/portfolio-published',
  '/api/notify/job-application',
  '/api/notify/job-status-update',
  '/api/notify/job-posted',
  '/api/notify/subscription-cancelled',
];

test('every legacy client-authored notification dispatcher is authenticated and retired', async () => {
  for (const path of retiredPaths) {
    const anonymous = await request(app).post(path).send({});
    assert.equal(anonymous.status, 401, `${path} must not be anonymously callable`);
    const response = await request(app)
      .post(path)
      .set('Authorization', 'Bearer ordinary-user')
      .send({ userEmail: 'user@example.com', email: 'user@example.com' });
    assert.equal(response.status, 410, path);
    assert.equal(response.body.code, 'CLIENT_NOTIFICATION_DISPATCH_RETIRED', path);
  }
});
