'use strict';

/**
 * Regression coverage for the forensic-audit finding:
 *
 *   "Subscriptions & Gateways" is rendered by the ADMIN console
 *   (src/components/admin/settings/Settings.jsx -> subscriptionsSettings.jsx) but
 *   its read endpoint GET /api/platform/payment-settings was gated
 *   `requireSuperAdmin`, while the identical secret-free projection was served to
 *   any ADMIN via the /api/admin/payment-settings alias. The consequence for a
 *   plain ADMIN was a 403 that the component swallowed with a bare
 *   `console.warn`, rendering every gateway field empty with revision 0 — the
 *   reported "Razorpay values disappeared" symptom.
 *
 * These tests drive the real Express app over HTTP (supertest) rather than
 * string-matching source, so they fail if the route guard, the projection or the
 * secret redaction regress.
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

function _buildMockDb() {
  return {
    collection(name) {
      return {
        doc(id) {
          return {
            async get() {
              const value = SECRETS[`${name}/${id}`];
              return { exists: Boolean(value), data: () => value };
            },
          };
        },
      };
    },
  };
}

const app = require('../index');
// The projection is MySQL-authoritative; seed the fixture values in MySQL
// system_settings (Firestore data plane OFF) before the tests run.
const { before } = require('node:test');
const { getPool } = require('../database/mysql');
before(async () => {
  const pool = getPool();
  await pool.query("DELETE FROM system_settings WHERE category IN ('public_config','payment_providers','subscriptions')");
  await pool.query("INSERT INTO system_settings (category, data, revision) VALUES ('public_config', ?, 1)", [JSON.stringify({ subscriptions: { razorpayKeyId: 'mock-rzp-public-key-id' } })]);
  await pool.query("INSERT INTO system_settings (category, data, revision) VALUES ('payment_providers', ?, 7)", [JSON.stringify({
    razorpay: { keyId: 'mock-rzp-public-key-id', keySecret: 'mock-rzp-secret-DO_NOT_LEAK' },
    stripe: { secretKey: 'mock-stripe-secret-DO_NOT_LEAK' },
    paypal: { clientId: 'paypal-public-id', clientSecret: 'paypal-secret-DO_NOT_LEAK' },
    _revision: 7,
  })]);
  await pool.query("INSERT INTO system_settings (category, data, revision) VALUES ('subscriptions', ?, 1)", [JSON.stringify({})]);
});
app.set('db', null);

test('REGRESSION: ADMIN (system.config.read) can READ the secret-free payment projection', async () => {
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
