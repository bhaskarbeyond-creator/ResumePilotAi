'use strict';

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { setTokenVerifierForTests } = require('../security/auth');
const { MemoryFirestore, createMemoryAdmin } = require('./helpers/memoryFirestore');

/**
 * REGRESSION COVERAGE — GDPR settings write path (P2, defence-in-depth).
 *
 * Defect: a hardened `POST /api/admin/gdpr-settings` endpoint validated the
 * consent-banner fields (site-relative paths only, control characters stripped,
 * length bounded) — but NO frontend ever called it. The Admin console saves
 * through the GENERIC `POST /api/admin/settings/gdpr` route, which applied only
 * the generic normaliser. The hardening was dead code and the live write path
 * accepted values that are rendered to every visitor in the consent banner,
 * including an absolute third-party `privacyPolicyUrl` (an off-site redirect
 * that the client-side `sanitizeUrl` allows through).
 *
 * Both routes now share `sanitizeGdprSettings`. These tests drive the REAL
 * Express app through the route the UI actually uses.
 */

const nowSeconds = () => Math.floor(Date.now() / 1000);

setTokenVerifierForTests(async token => {
  const base = { email_verified: true, auth_time: nowSeconds() };
  if (token === 'admin') return { ...base, uid: 'admin-1', email: 'admin@example.com', role: 'ADMIN' };
  if (token === 'user') return { ...base, uid: 'user-1', email: 'user@example.com', role: 'USER' };
  throw new Error('invalid token');
});

const app = require('../index');
const bearer = token => ({ Authorization: `Bearer ${token}` });

function installDb() {
  // A fresh in-memory Firestore per test keeps the settings revision counter
  // deterministic; the routes run their real transaction logic against it.
  const db = new MemoryFirestore();
  app.set('db', db);
  app.set('firebaseAdmin', createMemoryAdmin({ db }));
  return db;
}

async function saveGdpr(data, token = 'admin') {
  return request(app)
    .post('/api/admin/settings/gdpr')
    .set(bearer(token))
    .send({ data, expectedRevision: -1 });
}

test('the generic settings route rejects an absolute third-party privacy policy URL', async () => {
  installDb();
  const response = await saveGdpr({
    enableCookieBanner: true,
    privacyPolicyUrl: 'https://evil.example/phish',
    termsOfServiceUrl: '/p/terms-of-service',
  });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  // The value must be replaced by the safe default, never persisted as given.
  assert.equal(response.body.settings.privacyPolicyUrl, '/p/privacy-policy');
});

test('protocol-relative and javascript URLs are rejected server-side', async () => {
  installDb();
  for (const hostile of ['//evil.example/x', 'javascript:alert(1)', 'data:text/html,<script>', 'http://evil.example']) {
    const response = await saveGdpr({ privacyPolicyUrl: hostile, termsOfServiceUrl: hostile });
    assert.equal(response.status, 200);
    assert.equal(response.body.settings.privacyPolicyUrl, '/p/privacy-policy', `accepted ${hostile}`);
    assert.equal(response.body.settings.termsOfServiceUrl, '/p/terms-of-service', `accepted ${hostile}`);
  }
});

test('control characters are stripped and lengths are bounded on the live write path', async () => {
  installDb();
  const response = await saveGdpr({
    cookieMessage: `bad\u0000message\u001fwith\u007fcontrol${'x'.repeat(900)}`,
    buttonText: `ok\u0000${'y'.repeat(200)}`,
  });
  assert.equal(response.status, 200);
  const saved = response.body.settings;
  assert.doesNotMatch(saved.cookieMessage, /[\u0000-\u001f\u007f]/, 'control characters must be stripped');
  assert.ok(saved.cookieMessage.length <= 500, `cookieMessage length ${saved.cookieMessage.length} exceeds 500`);
  assert.ok(saved.buttonText.length <= 80, `buttonText length ${saved.buttonText.length} exceeds 80`);
});

test('legitimate site-relative paths are preserved unchanged', async () => {
  installDb();
  const response = await saveGdpr({
    enableCookieBanner: false,
    cookieMessage: 'We use analytics cookies.',
    buttonText: 'Accept',
    privacyPolicyUrl: '/p/custom-privacy',
    termsOfServiceUrl: '/p/custom-terms',
  });
  assert.equal(response.status, 200);
  assert.deepEqual(
    {
      enableCookieBanner: response.body.settings.enableCookieBanner,
      cookieMessage: response.body.settings.cookieMessage,
      buttonText: response.body.settings.buttonText,
      privacyPolicyUrl: response.body.settings.privacyPolicyUrl,
      termsOfServiceUrl: response.body.settings.termsOfServiceUrl,
    },
    {
      enableCookieBanner: false,
      cookieMessage: 'We use analytics cookies.',
      buttonText: 'Accept',
      privacyPolicyUrl: '/p/custom-privacy',
      termsOfServiceUrl: '/p/custom-terms',
    }
  );
});

test('the dedicated endpoint and the generic route produce identical values', async () => {
  // Both paths must converge; otherwise the hardening can drift again.
  const hostile = {
    enableCookieBanner: true,
    cookieMessage: 'msg\u0001x',
    buttonText: 'btn\u0002y',
    privacyPolicyUrl: 'https://evil.example',
    termsOfServiceUrl: '../../etc/passwd',
  };

  installDb();
  const viaGeneric = await saveGdpr(hostile);
  assert.equal(viaGeneric.status, 200);

  installDb();
  const viaDedicated = await request(app).post('/api/admin/gdpr-settings').set(bearer('admin')).send(hostile);
  assert.equal(viaDedicated.status, 200, JSON.stringify(viaDedicated.body));

  const pick = body => {
    const source = body.settings || body.gdpr || body;
    return {
      enableCookieBanner: source.enableCookieBanner,
      cookieMessage: source.cookieMessage,
      buttonText: source.buttonText,
      privacyPolicyUrl: source.privacyPolicyUrl,
      termsOfServiceUrl: source.termsOfServiceUrl,
    };
  };
  assert.deepEqual(pick(viaGeneric.body), pick(viaDedicated.body), 'the two write paths must not diverge');
});

test('a non-admin cannot write GDPR settings through either route', async () => {
  installDb();
  assert.equal((await saveGdpr({ cookieMessage: 'x' }, 'user')).status, 403);
  assert.equal((await request(app).post('/api/admin/gdpr-settings').set(bearer('user')).send({ cookieMessage: 'x' })).status, 403);
});
