const test = require('node:test');
const assert = require('node:assert/strict');
const { isPrivateIp, isPrivateV4, assertHttpsUrl } = require('../security/network');
const { isAdminPath, requiresVerifiedEmail, enforceApiPolicy } = require('../security/policy');
const { accountRateLimit, _buckets } = require('../security/abuse');
const { permissionsFor } = require('../security/auth');

function responseHarness() {
  return {
    locals: { requestId: 'test-request' },
    statusCode: 200,
    headers: {},
    body: null,
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name] = value; },
    json(value) { this.body = value; return this; }
  };
}

test('private and reserved IP encodings are rejected', () => {
  for (const ip of ['127.0.0.1', '10.2.3.4', '172.31.255.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '192.0.2.1', '198.51.100.2', '203.0.113.9', '224.0.0.1']) {
    assert.equal(isPrivateV4(ip), true, ip);
  }
  for (const ip of ['::1', '::ffff:127.0.0.1', 'fc00::1', 'fe80::1', 'ff02::1', '2001:db8::1', '2002:7f00:1::']) {
    assert.equal(isPrivateIp(ip), true, ip);
  }
  assert.equal(isPrivateIp('8.8.8.8'), false);
  assert.equal(isPrivateIp('2606:4700:4700::1111'), false);
});

test('HTTPS allowlist rejects credentials, insecure schemes and suffix confusion', () => {
  assert.equal(assertHttpsUrl('https://api.paypal.com/v1', ['paypal.com']).hostname, 'api.paypal.com');
  assert.throws(() => assertHttpsUrl('http://api.paypal.com', ['paypal.com']));
  assert.throws(() => assertHttpsUrl('https://paypal.com@evil.example', ['paypal.com']));
  assert.throws(() => assertHttpsUrl('https://paypal.com.evil.example', ['paypal.com']));
});

test('role permissions are normalized but ordinary users receive none', () => {
  assert.equal(permissionsFor({ claims: { role: 'admin' } }).has('system.config.write'), true);
  assert.equal(permissionsFor({ claims: { role: 'USER' } }).has('system.config.write'), false);
});

test('route policy classifies aliases and sensitive operations', () => {
  assert.equal(isAdminPath('/auth/purge-orphaned-auth'), true);
  assert.equal(isAdminPath('/email/logs'), true);
  assert.equal(isAdminPath('/admin/firebase-service-account'), true);
  assert.equal(isAdminPath('/email/admin/save-smtp'), true);
  assert.equal(isAdminPath('/generate-summary'), false);
  assert.equal(requiresVerifiedEmail('/generate-summary'), true);
  assert.equal(requiresVerifiedEmail('/pay'), true);
});

test('route policy blocks normal user from admin alias', () => {
  const req = { path: '/auth/purge-orphaned-auth', user: { claims: { role: 'USER' }, emailVerified: true } };
  const res = responseHarness();
  let next = false;
  enforceApiPolicy(req, res, () => { next = true; });
  assert.equal(next, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error.code, 'FORBIDDEN');
});

test('ordinary ADMIN cannot grant roles or rotate Firebase credentials', () => {
  for (const path of ['/test-grant-admin', '/admin/firebase-service-account']) {
    const req = { path, user: { claims: { role: 'ADMIN', auth_time: Math.floor(Date.now() / 1000) }, emailVerified: true } };
    const res = responseHarness();
    enforceApiPolicy(req, res, () => assert.fail('must not call next'));
    assert.equal(res.statusCode, 403, path);
  }
});

test('route policy requires verified email for paid AI and payments', () => {
  const req = { path: '/generate-summary', user: { claims: {}, emailVerified: false } };
  const res = responseHarness();
  enforceApiPolicy(req, res, () => assert.fail('must not call next'));
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error.code, 'EMAIL_VERIFICATION_REQUIRED');
});

test('account limiter cannot be bypassed by changing IP for an authenticated account', () => {
  _buckets.clear();
  const limiter = accountRateLimit({ namespace: 'test', limit: 2, windowMs: 60_000 });
  const call = ip => {
    const req = { user: { uid: 'same-user' }, ip };
    const res = responseHarness();
    let next = false;
    limiter(req, res, () => { next = true; });
    return { res, next };
  };
  assert.equal(call('1.1.1.1').next, true);
  assert.equal(call('2.2.2.2').next, true);
  const blocked = call('3.3.3.3');
  assert.equal(blocked.next, false);
  assert.equal(blocked.res.statusCode, 429);
});
