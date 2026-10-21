'use strict';

// Rate limits are set by server configuration only. Nothing a client sends may
// lift them: not a request header, not an email address in the request body,
// and not the email on the caller's own identity (anyone can register an
// address under the reserved .test domain with a public identity provider).
//
// The automated test environment keeps its own lifts through configuration:
// the auth limiters default to 10000 requests when NODE_ENV=test, and every
// limit can be raised with its environment variable. Those configured limits
// must still apply in the test environment, or the limiter tests could not run.
process.env.NODE_ENV = 'test';
process.env.AUTH_BURST_RATE_LIMIT_MAX = '2';
process.env.AUTH_RATE_LIMIT_MAX = '1000';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { accountRateLimit, configureAbuseCounterStoreForTests } = require('../security/abuse');
const { InMemoryAtomicCounterStore } = require('./helpers/inMemoryAtomicCounterStore');

function responseRecorder() {
  return {
    headers: {}, statusCode: 200, body: null, locals: { requestId: 'test-request' },
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

const CLIENT_SIGNALS = [
  ['an x-e2e-test request header', { headers: { 'x-e2e-test': '1' } }],
  ['a .test email on the verified identity', { user: { email: 'probe@example.test' } }],
  ['a .test email in the request body', { body: { email: 'probe@example.test' } }],
];

for (const [signal, extra] of CLIENT_SIGNALS) {
  test(`the durable account limiter is not lifted by ${signal}`, async () => {
    configureAbuseCounterStoreForTests(new InMemoryAtomicCounterStore());
    const limiter = accountRateLimit({ namespace: 'client-bypass-probe', limit: 2, windowMs: 60_000 });
    const attempt = async () => {
      const req = {
        ip: '203.0.113.9',
        headers: {},
        body: {},
        ...extra,
        user: { uid: 'bypass-probe', ...(extra.user || {}) },
      };
      const res = responseRecorder();
      let admitted = false;
      await limiter(req, res, () => { admitted = true; });
      return { admitted, res };
    };
    assert.equal((await attempt()).admitted, true);
    assert.equal((await attempt()).admitted, true);
    const third = await attempt();
    assert.equal(third.admitted, false, `${signal} lifted the limit`);
    assert.equal(third.res.statusCode, 429);
    assert.equal(third.res.body.error.code, 'RATE_LIMITED');
  });
}

test('the auth burst limiter applies its configured limit to requests carrying client test signals', async () => {
  const app = require('../index');
  const send = () => request(app)
    .post('/api/auth/preview-login')
    .set('x-e2e-test', '1')
    .send({ email: 'limit.probe@example.test', password: 'probe-only', name: 'Limit Probe' });
  const first = await send();
  const second = await send();
  assert.notEqual(first.status, 429, 'the first request is within the limit');
  assert.notEqual(second.status, 429, 'the second request is within the limit');
  const third = await send();
  assert.equal(third.status, 429, 'the header and the .test email lifted AUTH_BURST_RATE_LIMIT_MAX');
  assert.equal(third.body.error.code, 'AUTH_BURST_LIMITED');
});
