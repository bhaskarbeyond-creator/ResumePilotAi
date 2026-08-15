const test = require('node:test');
const assert = require('node:assert/strict');
const { enforceDailyAiQuota, accountRateLimit, _buckets } = require('../security/abuse');

function quotaDb(membership = 'Basic') {
  const usage = new Map();
  return {
    usage,
    collection(name) {
      return {
        doc(id) {
          if (name === 'users') return { async get() { return { data: () => ({ membership }) }; } };
          if (name === 'settings' && id === 'ai_quota') return { async get() { return { data: () => ({}) }; } };
          return { id };
        },
      };
    },
    async runTransaction(callback) {
      await callback({
        async get(reference) { return { data: () => usage.get(reference.id) || {} }; },
        set(reference, value) { usage.set(reference.id, { ...(usage.get(reference.id) || {}), ...value }); },
      });
    },
  };
}

function responseRecorder() {
  return {
    headers: {}, statusCode: 200, body: null, locals: { requestId: 'test-request' },
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

async function runQuota(db, uid = 'user-1') {
  const req = { user: { uid }, app: { get: key => key === 'db' ? db : null } };
  const res = responseRecorder();
  let continued = false;
  await enforceDailyAiQuota(req, res, () => { continued = true; });
  return { res, continued };
}

test('daily AI quota is account-bound, durable, and fails closed after the basic limit', async () => {
  const db = quotaDb('Basic');
  for (let count = 1; count <= 10; count += 1) {
    const result = await runQuota(db);
    assert.equal(result.continued, true);
    assert.equal(result.res.headers['X-AI-Daily-Remaining'], String(10 - count));
  }
  const blocked = await runQuota(db);
  assert.equal(blocked.continued, false);
  assert.equal(blocked.res.statusCode, 429);
  assert.equal(blocked.res.body.error.code, 'AI_DAILY_QUOTA_EXCEEDED');
  const otherAccount = await runQuota(db, 'user-2');
  assert.equal(otherAccount.continued, true);
});

test('AI quota fails closed when its durable store is unavailable', async () => {
  const result = await runQuota(null);
  assert.equal(result.continued, false);
  assert.equal(result.res.statusCode, 503);
  assert.equal(result.res.body.error.code, 'AI_QUOTA_UNAVAILABLE');
});

test('burst limiter cannot be bypassed by changing source address for one account', () => {
  _buckets.clear();
  const middleware = accountRateLimit({ namespace: 'ai-test', limit: 2, windowMs: 60_000 });
  const invoke = ip => {
    const req = { user: { uid: 'same-account' }, ip };
    const res = responseRecorder();
    let continued = false;
    middleware(req, res, () => { continued = true; });
    return { res, continued };
  };
  assert.equal(invoke('203.0.113.1').continued, true);
  assert.equal(invoke('203.0.113.2').continued, true);
  const blocked = invoke('203.0.113.3');
  assert.equal(blocked.continued, false);
  assert.equal(blocked.res.statusCode, 429);
});
