'use strict';
process.env.NODE_ENV = 'test';
// This file asserts the limiter's own behaviour, so it opts back INTO the
// enforcement that the suite-wide test bypass normally disables.
process.env.RATE_LIMIT_ENFORCE = '1';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const {
  securityHeaders,
  apiSecurityHeaders,
  canonicalContentSecurityPolicy,
  createNonce,
  HSTS_VALUE,
  SHARED_SECURITY_HEADERS,
} = require('../security/headers');
const {
  assertSecretIntegrity,
  inspectSecrets,
  classifyValue,
  SECRET_SPECS,
} = require('../security/secretVault');
const {
  accountRateLimit,
  applyRateLimitHeaders,
  configureAbuseCounterStoreForTests,
  withCoarseTierBypass,
  isInfraProbe,
  superAdminExemption,
} = require('../security/abuse');
const { InMemoryAtomicCounterStore } = require('./helpers/inMemoryAtomicCounterStore');

function responseHarness() {
  return {
    locals: { requestId: 'dir040' },
    statusCode: 200,
    headers: {},
    body: null,
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name] = value; },
    removeHeader(name) { delete this.headers[name]; },
    json(value) { this.body = value; return this; },
  };
}

// ---------------------------------------------------------------- headers ----

test('every response carries the full enterprise header set with A+ values', () => {
  const res = responseHarness();
  securityHeaders()({}, res, () => {});
  assert.equal(res.headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(res.headers['X-Frame-Options'], 'DENY');
  assert.equal(res.headers['Referrer-Policy'], 'no-referrer');
  assert.equal(res.headers['Strict-Transport-Security'], 'max-age=31536000; includeSubDomains; preload');
  assert.equal(res.headers['X-Permitted-Cross-Domain-Policies'], 'none');
  assert.equal(res.headers['Cross-Origin-Opener-Policy'], 'same-origin-allow-popups');
  assert.ok(res.headers['Content-Security-Policy'].length > 0);
  assert.equal(res.headers['X-Powered-By'], undefined, 'framework must not be advertised');
});

test('the API surface emits transport headers without a document CSP it cannot enforce', () => {
  const res = responseHarness();
  apiSecurityHeaders()({}, res, () => {});
  assert.equal(res.headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(res.headers['Strict-Transport-Security'], HSTS_VALUE);
  assert.equal(res.headers['Content-Security-Policy'], undefined);
});

/**
 * DIR-040 REGRESSION GUARD — zero drift between the Express header table and the
 * canonical policy that generates all three Apache configs.
 *
 * This test exists because the two genuinely disagreed: Express emitted
 * Cross-Origin-Resource-Policy: cross-origin while the canonical policy and every
 * generated .htaccess said same-site. Nothing failed at the time, because each
 * layer was only ever asserted in isolation — this compares them directly.
 *
 * The CSP is compared nonce-stripped, because Express legitimately adds a
 * per-response nonce that a static Apache config cannot carry.
 */
test('the Express header table matches the canonical policy value-for-value', async () => {
  const { SECURITY_HEADERS, CONTENT_SECURITY_POLICY } = await import(
    pathToFileURL(path.join(__dirname, '..', '..', 'scripts', 'security-headers-policy.mjs')).href
  );
  const stripNonces = value => value.replace(/'nonce-[^']+'\s*/g, '');

  const canonical = new Map(SECURITY_HEADERS);
  const emitted = new Map(SHARED_SECURITY_HEADERS);

  // Every shared (non-CSP) header must agree with the canonical policy.
  for (const [name, value] of emitted) {
    assert.ok(canonical.has(name), `${name} is not in the canonical policy`);
    assert.equal(value, canonical.get(name), `${name} drifted from the canonical policy`);
  }
  // And the CSP must be the canonical policy modulo the per-response nonce.
  assert.equal(stripNonces(canonicalContentSecurityPolicy()), CONTENT_SECURITY_POLICY);

  // The middleware must actually emit the whole table it declares.
  const res = responseHarness();
  securityHeaders()({}, res, () => {});
  for (const [name, value] of SHARED_SECURITY_HEADERS) {
    assert.equal(res.headers[name], value, `${name} was not applied`);
  }
});

test('CSP script-src carries no unsafe-inline or unsafe-eval', () => {
  const csp = canonicalContentSecurityPolicy();
  const scriptSrc = csp.split('; ').find(d => d.startsWith('script-src'));
  assert.doesNotMatch(scriptSrc, /'unsafe-inline'|'unsafe-eval'/);
  assert.ok(scriptSrc.includes("'self'"));
  assert.ok(csp.includes("default-src 'self'"));
  assert.ok(csp.includes("object-src 'none'"));
  assert.ok(csp.includes("frame-ancestors 'none'"));
  assert.ok(csp.includes("base-uri 'self'"));
  assert.ok(csp.includes("form-action 'self'"));
});

test('CSP still permits every integration the product genuinely depends on', () => {
  const csp = canonicalContentSecurityPolicy();
  for (const origin of [
    'https://js.stripe.com', 'https://www.paypal.com', 'https://checkout.razorpay.com',
    'https://securegw.paytm.in', 'https://maps.googleapis.com', 'https://*.firebaseio.com',
    'wss://*.firebaseio.com', 'https://app.supademo.com', 'https://fonts.gstatic.com',
  ]) {
    assert.ok(csp.includes(origin), `CSP must permit ${origin}`);
  }
});

test('each response gets a fresh high-entropy nonce bound into script-src', () => {
  const seen = new Set();
  for (let i = 0; i < 50; i += 1) {
    const res = responseHarness();
    securityHeaders()({}, res, () => {});
    const nonce = res.locals.cspNonce;
    assert.equal(typeof nonce, 'string');
    assert.ok(nonce.length >= 16, 'nonce must carry entropy');
    assert.equal(res.headers['Content-Security-Policy'].includes(`'nonce-${nonce}'`), true);
    assert.ok(!seen.has(nonce), 'nonces must not repeat');
    seen.add(nonce);
  }
});

test('createNonce is base64 random and honours no external input', () => {
  const a = createNonce();
  const b = createNonce();
  assert.notEqual(a, b);
  assert.match(a, /^[A-Za-z0-9+/]+={0,2}$/);
});
// ----------------------------------------------------------- rate limiting ----

test('limiters emit the RFC RateLimit family with a sane reset', async () => {
  configureAbuseCounterStoreForTests(new InMemoryAtomicCounterStore());
  const limiter = accountRateLimit({ namespace: 'dir040', limit: 3, windowMs: 60_000 });
  const res = responseHarness();
  await limiter({ user: { uid: 'u1' }, ip: '1.1.1.1' }, res, () => {});
  assert.equal(res.headers['RateLimit-Limit'], '3');
  assert.ok(Number(res.headers['RateLimit-Remaining']) <= 2);
  const reset = Number(res.headers['RateLimit-Reset']);
  assert.ok(reset >= 0 && reset <= 60, `reset ${reset} must be seconds within the window`);
  assert.match(res.headers['RateLimit-Policy'], /^\d+;w=\d+;q=\d+;r=\d+$/);
  configureAbuseCounterStoreForTests(null);
});

test('brute force past the threshold yields 429 with Retry-After', async () => {
  configureAbuseCounterStoreForTests(new InMemoryAtomicCounterStore());
  const limiter = accountRateLimit({ namespace: 'dir040-burst', limit: 2, windowMs: 60_000 });
  const call = async () => {
    const res = responseHarness();
    let next = false;
    await limiter({ user: { uid: 'u2' }, ip: '9.9.9.9' }, res, () => { next = true; });
    return { res, next };
  };
  assert.equal((await call()).next, true);
  assert.equal((await call()).next, true);
  const blocked = await call();
  assert.equal(blocked.next, false);
  assert.equal(blocked.res.statusCode, 429);
  assert.equal(blocked.res.body.error.code, 'RATE_LIMITED');
  assert.ok(Number(blocked.res.headers['Retry-After']) > 0, 'Retry-After is required on 429');
  configureAbuseCounterStoreForTests(null);
});

test('the limiter fails CLOSED with 503 when the counter store is unavailable', async () => {
  configureAbuseCounterStoreForTests({
    async increment() { throw new Error('mariadb unreachable'); },
  });
  const limiter = accountRateLimit({ namespace: 'dir040-fail', limit: 5, windowMs: 60_000 });
  const res = responseHarness();
  let next = false;
  await limiter({ user: { uid: 'u3' }, ip: '8.8.8.8' }, res, () => { next = true; });
  assert.equal(next, false);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error.code, 'RATE_LIMIT_UNAVAILABLE');
  configureAbuseCounterStoreForTests(null);
});

test('invalid limiter configuration is rejected rather than silently widened', () => {
  for (const bad of [
    { namespace: 'has space', limit: 5, windowMs: 60_000 },
    { namespace: 'ok', limit: 0, windowMs: 60_000 },
    { namespace: 'ok', limit: 5, windowMs: 10 },
  ]) {
    assert.throws(() => accountRateLimit(bad), /Invalid durable rate-limit configuration/);
  }
});

/**
 * REGRESSION GUARD (DIR-040): the coarse tiers are mounted ahead of every /api
 * route, so a fail-closed 503 there would convert a MariaDB blip into a total
 * API outage AND pre-empt each route's own fail-closed contract (a route that
 * must answer 403 FORBIDDEN or 503 DATABASE_UNAVAILABLE would instead return
 * RATE_LIMIT_UNAVAILABLE, reporting a false cause). This pins the availability
 * half of the decision that backend/test/database-admin.test.js and
 * backend/test/totp-mfa-lifecycle.test.js pin at the HTTP layer.
 */
test('a coarse tier fails OPEN when the counter store is unavailable', async () => {
  configureAbuseCounterStoreForTests({
    async increment() { throw new Error('mariadb unreachable'); },
  });
  const limiter = accountRateLimit({ namespace: 'dir040-coarse', limit: 5, windowMs: 60_000, failClosed: false });
  const res = responseHarness();
  let next = false;
  await limiter({ user: { uid: 'u4' }, ip: '7.7.7.7' }, res, () => { next = true; });
  assert.equal(next, true, 'the request must continue to the route, not be 503ed here');
  assert.equal(res.statusCode, 200, 'no synthetic failure status');
  // No quota was measured, so advertising RateLimit-* would be a false claim.
  assert.equal(res.headers['RateLimit-Limit'], undefined);
  configureAbuseCounterStoreForTests(null);
});

/**
 * The mirror image, and the reason failClosed is opt-in rather than global: a
 * SPEND budget must still fail closed, or an unreachable counter silently
 * removes the cap it exists to enforce.
 */
test('a spend budget still fails CLOSED when the counter store is unavailable', async () => {
  configureAbuseCounterStoreForTests({
    async increment() { throw new Error('mariadb unreachable'); },
  });
  const limiter = accountRateLimit({ namespace: 'dir040-spend', limit: 5, windowMs: 60_000 });
  const res = responseHarness();
  let next = false;
  await limiter({ user: { uid: 'u5' }, ip: '6.6.6.6' }, res, () => { next = true; });
  assert.equal(next, false);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error.code, 'RATE_LIMIT_UNAVAILABLE');
  configureAbuseCounterStoreForTests(null);
});

test('SuperAdmins bypass the coarse tiers so management work is never locked out', () => {
  // The inner limiter is the thing being skipped, so track its invocation rather
  // than next(): a non-exempt caller correctly reaches the limiter, which then
  // decides pass/block on its own budget.
  const call = user => {
    let limiterRan = false;
    const limit = withCoarseTierBypass((req, res, next) => { limiterRan = true; next(); });
    limit({ path: '/api/admin/overview', user }, responseHarness(), () => {});
    return limiterRan;
  };
  assert.equal(call({ claims: { role: 'SUPER_ADMIN' } }), false, 'SUPER_ADMIN must skip the tier');
  assert.equal(call({ claims: { role: 'ADMIN' } }), true, 'ordinary ADMIN must still be limited');
  assert.equal(call({ claims: { role: 'USER' } }), true, 'ordinary user must still be limited');
  assert.equal(call(undefined), true, 'anonymous must still be limited');
});

test('infrastructure probes are never throttled', () => {
  assert.equal(isInfraProbe({ path: '/healthz' }), true);
  assert.equal(isInfraProbe({ path: '/readyz' }), true);
  assert.equal(isInfraProbe({ path: '/api/resumes' }), false);
  const limit = withCoarseTierBypass((req, res, next) => next());
  let passed = false;
  limit({ path: '/healthz' }, responseHarness(), () => { passed = true; });
  assert.equal(passed, true);
});

// ----------------------------------------------------------- secret vault ----

test('the linter is inert outside production so CI and local runs are never blocked', () => {
  const report = inspectSecrets({ NODE_ENV: 'test', DB_PASSWORD: 'changeme' });
  assert.equal(report.enforced, false);
  assert.deepEqual(report.findings, []);
});

test('production with no DB password fails loudly', () => {
  assert.throws(
    () => assertSecretIntegrity({ NODE_ENV: 'production' }),
    /Secret vaulting linter rejected the production configuration/
  );
});

test('production rejects placeholder secrets', () => {
  for (const value of ['changeme', 'your-secret-key', 'placeholder', 'sk-xxx', 'example-value']) {
    assert.equal(classifyValue('STRIPE_SECRET', value).ok, false, value);
  }
  assert.equal(classifyValue('STRIPE_SECRET', 'sk_live_51H8xQ2eZvKYlo2C0abcdefghijklmnop').ok, true);
});

test('a real-looking secret is accepted and a suspiciously short one is not', () => {
  assert.equal(classifyValue('GEMINI_API_KEY', 'AIzaSyD-1a2b3c4d5e6f7g8h9i0jKLMNOPQRSTUV').ok, true);
  assert.equal(classifyValue('GEMINI_API_KEY', 'short').ok, false);
  assert.equal(classifyValue('BACKUP_ENCRYPTION_KEY_BASE64', 'not base64!!').ok, false);
  assert.equal(classifyValue('FIREBASE_PRIVATE_KEY', 'nope').ok, false);
});

test('findings reference variable NAMES only, never values (zero plaintext secrets in logs)', () => {
  const secretValue = 'sk_live_SUPERSECRETVALUE_9x8y7z';
  try {
    assertSecretIntegrity({ NODE_ENV: 'production', DB_PASSWORD: secretValue, STRIPE_SECRET: 'changeme' });
    assert.fail('expected the linter to throw');
  } catch (error) {
    assert.ok(error.message.includes('STRIPE_SECRET'), 'names the offending variable');
    assert.equal(error.message.includes(secretValue), false, 'must never echo a secret value');
  }
});

test('DB_PASSWORD is the only required production secret', () => {
  const required = SECRET_SPECS.filter(spec => spec.required).map(spec => spec.name);
  assert.deepEqual(required, ['DB_PASSWORD']);
});
test('RateLimit-Reset never goes negative', () => {
  const res = responseHarness();
  applyRateLimitHeaders(res, 10, 10, Date.now() - 60_000);
  assert.equal(Number(res.headers['RateLimit-Reset']), 0);
  assert.equal(Number(res.headers['RateLimit-Remaining']), 0);
});

test('superAdminExemption reads verified token claims, never a client-supplied header', () => {
  assert.equal(superAdminExemption({ user: { claims: { role: 'SUPER_ADMIN' } } }), true);
  assert.equal(superAdminExemption({ user: { claims: { role: 'USER' } } }), false);
  assert.equal(superAdminExemption({ user: { claims: { role: 'USER' }, headers: { 'x-role': 'SUPER_ADMIN' } } }), false);
  assert.equal(superAdminExemption({}), false);
});