'use strict';

/**
 * Regression coverage for payment-settings read authorization and projection:
 * payment managers (`payments.manage`) and explicit system-config readers may
 * load the secret-free settings projection. Read-only payment access (`payments.read`)
 * alone must not disclose provider configuration to an AUDITOR. The canonical
 * platform route and backwards-compatible admin alias must enforce the same gate.
 *
 * These tests drive the real Express app over HTTP (supertest), so they fail if
 * either route's authorization or the secret redaction regresses.
 */

process.env.NODE_ENV = 'test';
process.env.SUPER_ADMIN_MFA_REQUIRED = 'true';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { setTokenVerifierForTests } = require('../security/auth');

const nowSeconds = () => Math.floor(Date.now() / 1000);

setTokenVerifierForTests(async token => {
  const now = nowSeconds();
  if (token === 'admin') {
    return { uid: 'admin-01', email: 'admin@example.com', email_verified: true, role: 'ADMIN', auth_time: now };
  }
  if (token === 'superadmin-mfa') {
    return {
      uid: 'sa-01', email: 'sa@example.com', email_verified: true, role: 'SUPER_ADMIN', auth_time: now,
      firebase: { sign_in_second_factor: 'totp' },
    };
  }
  if (token === 'superadmin-no-mfa') {
    return {
      uid: 'sa-01', email: 'sa@example.com', email_verified: true, role: 'SUPER_ADMIN', auth_time: now,
      firebase: { sign_in_second_factor: null },
    };
  }
  if (token === 'user') {
    return { uid: 'u-01', email: 'user@example.com', email_verified: true, role: 'USER', auth_time: now };
  }
  if (token === 'auditor') {
    return { uid: 'auditor-01', email: 'auditor@example.com', email_verified: true, role: 'AUDITOR', auth_time: now };
  }
  if (token === 'config-reader') {
    return { uid: 'config-reader-01', email: 'config-reader@example.com', email_verified: true, role: 'USER', permissions: ['system.config.read'], auth_time: now };
  }
  if (token === 'admin-config-reader') {
    return { uid: 'admin-config-reader-01', email: 'admin-config-reader@example.com', email_verified: true, role: 'ADMIN', permissions: ['system.config.read'], auth_time: now };
  }
  throw new Error('INVALID_TOKEN');
});

const SECRETS = {
  'data/public_config': { subscriptions: { razorpayKeyId: 'mock-rzp-public-key-id' } },
  'settings/payment_providers': {
    razorpay: { keyId: 'mock-rzp-public-key-id', keySecret: 'mock-rzp-secret-DO_NOT_LEAK' },
    stripe: { secretKey: 'mock-stripe-secret-DO_NOT_LEAK' },
    paypal: { clientId: 'paypal-public-id', clientSecret: 'paypal-secret-DO_NOT_LEAK' },
    _revision: 7,
  },
  'data/subscriptions': {},
};

const { setRepositoryForTests } = require('../repositories');
const adminAuditRecords = [];
setRepositoryForTests({
  async getSetting(category) {
    return SECRETS[`settings/${category}`] || SECRETS[`data/${category}`] || null;
  },
  async recordAdminAuditLog(record) {
    adminAuditRecords.push(record);
    return true;
  },
});

const app = require('../index');

test('REGRESSION: ADMIN with built-in payments.manage can READ the secret-free payment projection', async () => {
  const res = await request(app).get('/api/platform/payment-settings').set('Authorization', 'Bearer admin');
  assert.equal(res.status, 200, `ADMIN must be able to load the payment panel, got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.ok(res.body.publicKeys?.razorpayKeyId, 'public identifier must be returned');
  assert.equal(res.body.revision, 7, 'revision must be returned so the panel does not save with a stale 0');
  assert.equal(res.body.configuredProviders.razorpay, true);
  assert.match(res.body.maskedKeys?.razorpay || '', /^•{4}[A-Za-z0-9_]{4}$/, 'mask must be non-reversible');
});

test('REGRESSION: the payment projection never exposes a raw secret over HTTP', async () => {
  const res = await request(app).get('/api/platform/payment-settings').set('Authorization', 'Bearer admin');
  assert.equal(res.status, 200);
  const body = JSON.stringify(res.body);
  assert.doesNotMatch(body, /mock-rzp-secret-DO_NOT_LEAK/);
  assert.doesNotMatch(body, /mock-stripe-secret-DO_NOT_LEAK/);
  assert.doesNotMatch(body, /paypal-secret-DO_NOT_LEAK/);
});

test('REGRESSION: AUDITOR with payments.read alone is denied on both payment-settings routes', async () => {
  const canonical = await request(app).get('/api/platform/payment-settings').set('Authorization', 'Bearer auditor');
  const alias = await request(app).get('/api/admin/payment-settings').set('Authorization', 'Bearer auditor');
  assert.equal(canonical.status, 403);
  assert.equal(alias.status, 403);
});

test('REGRESSION: ADMIN with explicit system.config.read and delegated config reader can READ', async () => {
  const admin = await request(app).get('/api/platform/payment-settings').set('Authorization', 'Bearer admin-config-reader');
  const delegatedReader = await request(app).get('/api/platform/payment-settings').set('Authorization', 'Bearer config-reader');
  assert.equal(admin.status, 200);
  assert.equal(delegatedReader.status, 200);
  assert.ok(admin.body.publicKeys?.razorpayKeyId);
  assert.ok(delegatedReader.body.publicKeys?.razorpayKeyId);
});

test('REGRESSION: a plain USER cannot read the payment projection', async () => {
  const res = await request(app).get('/api/platform/payment-settings').set('Authorization', 'Bearer user');
  assert.equal(res.status, 403);
});

test('REGRESSION: unauthenticated read is rejected', async () => {
  const res = await request(app).get('/api/platform/payment-settings');
  assert.equal(res.status, 401);
});

test('REGRESSION: the alias and the canonical route expose the same gate and payload', async () => {
  const canonical = await request(app).get('/api/platform/payment-settings').set('Authorization', 'Bearer admin');
  const alias = await request(app).get('/api/admin/payment-settings').set('Authorization', 'Bearer admin');
  assert.equal(canonical.status, alias.status, 'the two read routes must not diverge in authorisation');
  assert.deepEqual(canonical.body, alias.body, 'the two read routes must return an identical projection');
});

test('REGRESSION: audit middleware records invalid platform mutations before route responses', async () => {
  adminAuditRecords.length = 0;
  const res = await request(app)
    .post('/api/platform/role-view-audit')
    .set('Authorization', 'Bearer superadmin-mfa')
    .send({ targetRole: 'NOT_A_ROLE' });
  assert.equal(res.status, 400);
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(adminAuditRecords.some(record =>
    record.pathname === '/api/platform/role-view-audit'
    && record.statusCode === 400
    && record.outcome === 'FAILURE'), 'platform mutation attempt must be logged by the application audit middleware');
});

test('REGRESSION: ADMIN still cannot WRITE payment settings (write stays SUPER_ADMIN + MFA + recent auth)', async () => {
  const res = await request(app)
    .post('/api/admin/payment-settings')
    .set('Authorization', 'Bearer admin')
    .send({ razorpayKeyId: 'attacker-key-id', razorpayKeySecret: 'attacker-supplied-secret' });
  assert.equal(res.status, 403, 'an ADMIN must never be able to write payment credentials');
});

test('REGRESSION: SUPER_ADMIN without a verified second factor still cannot WRITE', async () => {
  const res = await request(app)
    .post('/api/admin/payment-settings')
    .set('Authorization', 'Bearer superadmin-no-mfa')
    .send({ razorpayKeyId: 'attacker-key-id' });
  assert.equal(res.status, 403);
  assert.equal(res.body.error?.code, 'SUPER_ADMIN_MFA_REQUIRED');
});
