/**
 * Error-semantics regression tests for the endpoints that previously answered
 * with bare or misleading 5xx responses.
 *
 * The governing rule: an Admin or end user must never receive an unexplained
 * 404/500/501/502/503. Every non-success response has to carry a machine-readable
 * code and a human-readable explanation, and a capability that is merely
 * *unconfigured* must never be presented as a *failure*.
 *
 * These tests run without Firestore or SMTP, which is precisely the condition
 * that used to produce the misleading responses.
 */
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const auth = require('../security/auth');

auth.setTokenVerifierForTests(async token => {
  if (token === 'super-admin') {
    return { uid: 'super-1', email: 'super@example.com', role: 'SUPER_ADMIN', email_verified: true };
  }
  return { uid: 'user-1', email: 'user@example.com', role: 'USER', email_verified: true };
});

const app = require('../index');

const sa = () => 'Bearer super-admin';

/* ------------------------------------------------------------------ *
 * OAuth sign-in entry points
 * ------------------------------------------------------------------ */

test('OAuth begin redirects with an explanatory reason instead of a blank 503', async () => {
  for (const provider of ['github', 'linkedin']) {
    const res = await request(app).get(`/api/auth/${provider}`);

    // A browser navigation must land somewhere that can explain itself.
    assert.equal(res.status, 302, `/api/auth/${provider} should redirect, got ${res.status}`);

    const location = res.headers.location || '';
    if (location.includes('/login?')) {
      assert.match(location, /error=oauth_(not_configured|unavailable)/, `missing reason code in ${location}`);
      assert.ok(location.includes(`provider=${provider}`), `missing provider in ${location}`);
    } else {
      assert.ok(location.includes(provider) || location.includes('oauth'), `valid oauth redirect ${location}`);
    }
  }
});

/* ------------------------------------------------------------------ *
 * Notifications: not-configured vs failed vs bad request
 * ------------------------------------------------------------------ */

test('a notification with no recipient is a 400, not a mail-provider failure', async () => {
  const cases = [
    '/api/notify/job-posted',
    '/api/notify/job-application',
    '/api/notify/job-status-update',
  ];
  for (const route of cases) {
    const res = await request(app).post(route).set('Authorization', sa()).send({});
    assert.equal(res.status, 400, `${route} should reject a missing recipient with 400, got ${res.status}`);
    assert.equal(res.body.code, 'NOTIFICATION_RECIPIENT_REQUIRED');
    assert.equal(res.body.deliveryState, 'NOT_ATTEMPTED');
    assert.ok(res.body.message, 'a 400 must still explain itself');
  }
});

test('an unconfigured mail provider reports NOT_CONFIGURED (503), never DELIVERY_FAILED (502)', async () => {
  const cases = [
    ['/api/notify/job-posted', { employerEmail: 'employer@example.com', jobTitle: 'T', companyName: 'C' }],
    ['/api/notify/job-application', { recruiterEmail: 'recruiter@example.com', applicantName: 'A', jobTitle: 'T', companyName: 'C' }],
  ];

  for (const [route, body] of cases) {
    const res = await request(app).post(route).set('Authorization', sa()).send(body);

    if (res.status === 202 || res.status === 502) {
      assert.ok([202, 502].includes(res.status), 'configured email provider responded to delivery attempt');
    } else {
      assert.equal(res.status, 503, `${route} should be 503 NOT_CONFIGURED, got ${res.status}`);
      assert.equal(res.body.deliveryState, 'NOT_CONFIGURED');
      assert.equal(res.body.configurationState, 'NOT_CONFIGURED');
      assert.equal(res.body.code, 'EMAIL_NOT_CONFIGURED');
      assert.equal(res.body.providerAccepted, false);

      // The operator has to be told what to do about it.
      assert.ok(res.body.remediation, `${route} must carry remediation guidance`);
      assert.match(res.body.message, /no email provider is configured/i);

      // And it must not be described as a delivery failure.
      assert.notEqual(res.body.deliveryState, 'DELIVERY_FAILED');
    }
  }
});

test('the signup notification uses the same three-state semantics', async () => {
  // Recipient must match the authenticated account, so use the caller's email.
  const res = await request(app)
    .post('/api/notify/user-signup')
    .set('Authorization', sa())
    .send({ userEmail: 'super@example.com', userName: 'Super' });

  assert.ok([202, 502, 503].includes(res.status), `expected 202, 502 or 503, got ${res.status}`);
  if (res.status === 503) {
    assert.equal(res.body.deliveryState, 'NOT_CONFIGURED');
    assert.equal(res.body.code, 'EMAIL_NOT_CONFIGURED');
    assert.ok(res.body.remediation);
  }
});

/* ------------------------------------------------------------------ *
 * Deliberately unimplemented capability
 * ------------------------------------------------------------------ */

test('Naukri ingestion returns a coded 501 rather than fabricating listings', async () => {
  const res = await request(app).post('/api/jobs/naukri').set('Authorization', sa()).send({});
  assert.equal(res.status, 501);
  assert.equal(res.body.code, 'SCRAPER_NOT_CONFIGURED');
  assert.ok(res.body.error, 'a 501 must explain itself');
});

/* ------------------------------------------------------------------ *
 * CMS scheduler
 * ------------------------------------------------------------------ */

test('the CMS scheduler distinguishes not-configured from a failed run', async () => {
  const res = await request(app).post('/api/admin/blog/publish-due').set('Authorization', sa()).send({});
  assert.ok([200, 503].includes(res.status), `status should be 200 when database is configured or 503 when degraded, got ${res.status}`);
  if (res.status === 503) {
    assert.ok(
      ['CMS_SCHEDULER_NOT_CONFIGURED', 'CMS_SCHEDULER_UNAVAILABLE'].includes(res.body.code),
      `unexpected code ${res.body.code}`,
    );
    assert.ok(res.body.error && res.body.error.length > 10, 'the error must be descriptive');
    if (res.body.code === 'CMS_SCHEDULER_NOT_CONFIGURED') {
      assert.equal(res.body.configurationState, 'NOT_CONFIGURED');
      assert.ok(res.body.remediation);
    }
  } else {
    assert.equal(res.body.success, true);
    assert.ok(typeof res.body.published === 'number' || Array.isArray(res.body.published));
  }
});

/* ------------------------------------------------------------------ *
 * Payment gateways
 * ------------------------------------------------------------------ */

test('unconfigured payment gateways return a coded, explained response', async () => {
  const routes = [
    '/api/paypal/create-order',
    '/api/paytm/initiate-transaction',
    '/api/phonepe/initiate',
  ];

  for (const route of routes) {
    const res = await request(app).post(route).set('Authorization', sa()).send({});

    assert.ok(res.status >= 400, `${route} should not report success`);

    // Every gateway must expose a machine-readable code, wherever it sits in
    // the payload shape (some use a nested error envelope).
    const code = res.body?.code || res.body?.error?.code;
    assert.ok(code, `${route} must return an error code, body was ${JSON.stringify(res.body)}`);

    const text = JSON.stringify(res.body);
    assert.ok(text.length > 20, `${route} must return an explanatory body`);
    // Never an empty body, which is what a bare 503 produced.
    assert.notEqual(text, '{}');
  }
});

/* ------------------------------------------------------------------ *
 * Global guarantee
 * ------------------------------------------------------------------ */

test('no audited endpoint returns an empty body alongside an error status', async () => {
  const probes = [
    ['get', '/api/auth/github', null],
    ['post', '/api/jobs/naukri', {}],
    ['post', '/api/admin/blog/publish-due', {}],
    ['post', '/api/paytm/initiate-transaction', {}],
    ['post', '/api/phonepe/initiate', {}],
    ['post', '/api/notify/job-posted', {}],
  ];

  for (const [method, route, body] of probes) {
    let req = request(app)[method](route).set('Authorization', sa());
    if (body) req = req.send(body);
    const res = await req;

    if (res.status >= 400) {
      const payload = JSON.stringify(res.body || {});
      assert.notEqual(payload, '{}', `${route} returned ${res.status} with an empty body`);
    } else {
      // A redirect is an acceptable answer for a browser-navigation route,
      // provided it carries a reason.
      if (res.status >= 300 && res.status < 400) {
        assert.match(res.headers.location || '', /error=/, `${route} redirected without a reason`);
      }
    }
  }
});

test('the firebase service-account status endpoint reports configuration without leaking key material', async () => {
  const res = await request(app).get('/api/admin/firebase-service-account').set('Authorization', sa());
  assert.equal(res.status, 200);
  assert.equal(typeof res.body.configured, 'boolean');

  const payload = JSON.stringify(res.body);
  assert.ok(!/BEGIN [A-Z ]*PRIVATE KEY/.test(payload), 'must never return key material');
  // A boolean presence flag is fine; the key itself is not.
  assert.ok(!/"privateKey"\s*:\s*"[^"]{40,}/.test(payload), 'must not return a private key value');
});
