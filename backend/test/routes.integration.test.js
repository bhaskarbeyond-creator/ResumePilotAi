process.env.NODE_ENV = 'test';
process.env.CORS_ALLOWED_ORIGINS = 'https://app.example.com';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { setTokenVerifierForTests } = require('../security/auth');

setTokenVerifierForTests(async token => {
  const now = Math.floor(Date.now() / 1000);
  if (token === 'user') return { uid: 'user-1', email: 'user@example.com', email_verified: true, role: 'USER', auth_time: now };
  if (token === 'unverified') return { uid: 'user-2', email: 'pending@example.com', email_verified: false, role: 'USER', auth_time: now };
  if (token === 'admin') return { uid: 'admin-1', email: 'admin@example.com', email_verified: true, role: 'ADMIN', auth_time: now };
  if (token === 'stale-admin') return { uid: 'admin-1', email: 'admin@example.com', email_verified: true, role: 'ADMIN', auth_time: now - 3600 };
  throw new Error('invalid token');
});

const app = require('../index');
const bearer = token => ({ Authorization: `Bearer ${token}` });

test('minimal health endpoint is public and does not cache', async () => {
  const response = await request(app).get('/healthz');
  assert.equal(response.status, 200);
  assert.equal(response.body.status, 'ok');
  assert.equal(response.headers['cache-control'], 'no-store');
});

test('protected endpoint rejects absent and invalid Firebase tokens', async () => {
  const absent = await request(app).get('/api/rtl-font-config');
  assert.equal(absent.status, 401);
  assert.equal(absent.body.error.code, 'AUTH_REQUIRED');
  const invalid = await request(app).get('/api/rtl-font-config').set(bearer('invalid'));
  assert.equal(invalid.status, 401);
  assert.equal(invalid.body.error.code, 'INVALID_AUTH_TOKEN');
});

test('one-time export render data endpoint is public only through an opaque token', async () => {
  const missing = await request(app).get('/api/export-render-data');
  assert.equal(missing.status, 404);
  assert.equal(missing.headers['cache-control'], 'no-store, private');
  const forged = await request(app).get('/api/export-render-data?token=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
  assert.equal(forged.status, 404);
});

test('valid authenticated user reaches an ordinary route', async () => {
  const response = await request(app).get('/api/rtl-font-config').set(bearer('user'));
  assert.equal(response.status, 200);
  assert.equal(response.body.isRtlSupported, true);
  assert.match(response.headers['x-request-id'], /^[0-9a-f-]{36}$/);
});

test('admin aliases and mail logs reject an ordinary authenticated user', async () => {
  for (const route of ['/api/auth/purge-orphaned-auth', '/api/email/logs', '/api/email/admin/test-imap', '/api/send-sms', '/api/admin/blog/publish-due']) {
    const method = route.includes('logs') ? 'get' : 'post';
    const response = await request(app)[method](route).set(bearer('user')).send({});
    assert.equal(response.status, 403, route);
    assert.equal(response.body.error.code, 'FORBIDDEN', route);
  }
});

test('stale admin sessions cannot perform refunds or user administration', async () => {
  for (const [method, route] of [
    ['post', '/api/admin/payments/refund'],
    ['patch', '/api/admin/users/victim'],
    ['patch', '/api/admin/employer-applications/victim'],
    ['post', '/api/account/delete']
  ]) {
    const response = await request(app)[method](route).set(bearer('stale-admin')).send({ paymentOrderId: 'order', suspended: true });
    assert.equal(response.status, 403, route);
    assert.equal(response.body.error.code, 'RECENT_AUTH_REQUIRED', route);
  }
});

test('unverified users cannot consume paid AI or payment endpoints', async () => {
  const ai = await request(app).post('/api/generate-summary').set(bearer('unverified')).send({ occupation: 'Engineer' });
  assert.equal(ai.status, 403);
  assert.equal(ai.body.error.code, 'EMAIL_VERIFICATION_REQUIRED');
  const payment = await request(app).post('/api/pay').set(bearer('unverified')).send({ planId: 'monthly' });
  assert.equal(payment.status, 403);
  assert.equal(payment.body.error.code, 'EMAIL_VERIFICATION_REQUIRED');
  const message = await request(app).post('/api/messages/send').set(bearer('unverified')).send({ conversationId: 'conversation', text: 'hello' });
  assert.equal(message.status, 403);
  assert.equal(message.body.error.code, 'EMAIL_VERIFICATION_REQUIRED');
});

test('password reset request is generic and timing-equalized for malformed accounts', async () => {
  const started = Date.now();
  const response = await request(app).post('/api/auth/custom-password-reset').send({ email: 'not-an-email' });
  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.ok(Date.now() - started >= 275);
  assert.doesNotMatch(JSON.stringify(response.body), /not-an-email|user.not.found/i);
});

test('verification and notification dispatch cannot target another account', async () => {
  const anonymous = await request(app).post('/api/auth/send-verification-email').send({ email: 'victim@example.com' });
  assert.equal(anonymous.status, 401);
  const notification = await request(app).post('/api/notify/user-signup').set(bearer('user')).send({ userEmail: 'victim@example.com' });
  assert.equal(notification.status, 403);
  assert.equal(notification.body.error.code, 'RECIPIENT_MISMATCH');
});

test('CORS grants only exact configured origins', async () => {
  const allowed = await request(app).options('/api/rtl-font-config')
    .set('Origin', 'https://app.example.com')
    .set('Access-Control-Request-Method', 'GET');
  assert.equal(allowed.headers['access-control-allow-origin'], 'https://app.example.com');
  const denied = await request(app).options('/api/rtl-font-config')
    .set('Origin', 'https://app.example.com.evil.test')
    .set('Access-Control-Request-Method', 'GET');
  assert.equal(denied.headers['access-control-allow-origin'], undefined);
});

test('public contact endpoint uses validation, honeypot and per-source throttling', async () => {
  const bot = await request(app).post('/api/contact').send({ website: 'https://spam.test', email: 'x@y.test', name: 'Bot', message: 'buy now spam' });
  assert.equal(bot.status, 202);
  const invalid1 = await request(app).post('/api/contact').send({ email: 'bad', name: 'x', message: 'short' });
  assert.equal(invalid1.status, 400);
  const invalid2 = await request(app).post('/api/contact').send({ email: 'bad', name: 'x', message: 'short' });
  assert.equal(invalid2.status, 400);
  const limited = await request(app).post('/api/contact').send({ email: 'bad', name: 'x', message: 'short' });
  assert.equal(limited.status, 429);
});

test('Stripe webhook fails closed without a configured signature secret', async () => {
  const response = await request(app).post('/api/stripe-webhook')
    .set('Content-Type', 'application/json')
    .set('stripe-signature', 'forged')
    .send('{"id":"evt_forged"}');
  assert.equal(response.status, 400);
});

test('legacy/demo payment bypasses fail closed and client entitlement dates are ignored', async () => {
  const legacy = await request(app).post('/api/payment/razorpay-order').set(bearer('user')).send({ amount: 1, keySecret: 'attacker' });
  assert.equal(legacy.status, 410);
  const razorpay = await request(app).post('/api/razorpay/create-order').set(bearer('user')).send({ planId: 'monthly', amount: 1, userId: 'victim' });
  assert.equal(razorpay.status, 503);
  assert.equal(razorpay.body.error.code, 'PAYMENT_PROVIDER_UNAVAILABLE');
  const entitlement = await request(app).post('/api/check').set(bearer('user')).send({ accountType: 'Premium', expDate: '2999-01-01' });
  assert.equal(entitlement.status, 503);
  assert.equal(entitlement.body.status, 'false');
});

test('payment verification rejects malformed or unbound provider orders', async () => {
  const paypal = await request(app).post('/api/paypal/verify').set(bearer('user')).send({ orderId: '../metadata', paymentOrderId: 'x' });
  assert.equal(paypal.status, 400);
  const razorpay = await request(app).post('/api/razorpay/verify-payment').set(bearer('user')).send({ razorpay_order_id: 'order', razorpay_payment_id: 'pay', razorpay_signature: 'forged' });
  assert.equal(razorpay.status, 400);
});

test('JSON body limit rejects oversized payloads before route work', async () => {
  const response = await request(app).post('/api/check')
    .set(bearer('user'))
    .send({ value: 'x'.repeat(300 * 1024) });
  assert.equal(response.status, 413);
});
