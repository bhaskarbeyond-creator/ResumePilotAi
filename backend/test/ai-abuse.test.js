'use strict';

process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  enforceDailyAiQuota,
  accountRateLimit,
  configureAbuseCounterStoreForTests,
} = require('../security/abuse');
const { setPoolForTests } = require('../database/mysql');
const { InMemoryAtomicCounterStore } = require('./helpers/inMemoryAtomicCounterStore');

class AiQuotaMariaDbPool {
  constructor() { this.reset(); }

  reset() {
    this.unavailable = false;
    this.users = new Map([
      ['user-1', { id: 'user-1', email: 'quota@example.test', membership: 'Basic', paymentStatus: 'INACTIVE' }],
      ['user-2', { id: 'user-2', email: 'quota2@example.test', membership: 'Basic', paymentStatus: 'INACTIVE' }],
    ]);
    this.usage = new Map();
  }

  // DIR-106: governance resolution is a PRE-TRANSACTION read and therefore uses
  // the pool directly (no locks held). Only the quota charge itself must go
  // through a connection. These handlers model that split explicitly.
  async query(sql, params = []) {
    if (this.unavailable) throw Object.assign(new Error('MariaDB unavailable'), { code: 'ECONNREFUSED' });
    const normalized = String(sql).replace(/\s+/g, ' ').trim();
    if (/^SELECT \* FROM users WHERE id = \? LIMIT 1$/i.test(normalized)) {
      const row = this.users.get(params[0]);
      return [[row ? { ...row } : null].filter(Boolean), []];
    }
    if (/^SELECT data FROM system_settings WHERE category = 'ai_quota' LIMIT 1$/i.test(normalized)) {
      return [[], []];
    }
    // No organization membership for these fixtures -> individual resolution.
    if (/FROM enterprise_memberships m/i.test(normalized)) {
      return [[], []];
    }
    throw new Error('Direct queries are not part of the AI quota transaction contract');
  }

  async getConnection() {
    if (this.unavailable) throw Object.assign(new Error('MariaDB unavailable'), { code: 'ECONNREFUSED' });
    const pool = this;
    return {
      beginTransaction: async () => {},
      async query(sql, params = []) {
        const normalized = String(sql).replace(/\s+/g, ' ').trim();
        if (/^SELECT \* FROM users WHERE id = \? LIMIT 1$/i.test(normalized)) {
          const row = pool.users.get(params[0]);
          return [[row ? { ...row } : null].filter(Boolean), []];
        }
        if (/^SELECT data FROM system_settings WHERE category = 'ai_quota' LIMIT 1$/i.test(normalized)) {
          return [[], []];
        }
        if (/^SELECT count FROM ai_usage WHERE day_key = \? AND uid_hash = \? FOR UPDATE$/i.test(normalized)) {
          const row = pool.usage.get(`${params[0]}:${params[1]}`);
          return [[row ? { count: row.count } : null].filter(Boolean), []];
        }
        if (/^INSERT INTO ai_usage /i.test(normalized)) {
          // DIR-106 column order: (day_key, uid_hash, uid, tenant_id, scope, email, count, limit_used)
          const key = `${params[0]}:${params[1]}`;
          if (!pool.usage.has(key)) {
            pool.usage.set(key, {
              uid: params[2], tenantId: params[3], scope: params[4], email: params[5], count: params[6], limit: params[7],
            });
          } else {
            const row = pool.usage.get(key);
            row.limit = params[7];
            if (params[6] !== undefined && params[6] > 0) row.count = params[6];
            if (params[3]) row.tenantId = params[3];
          }
          return [{ affectedRows: 1 }, []];
        }
        // DIR-106: the shared organization counter only runs for org scope. These
        // fixtures resolve to INDIVIDUAL, so any such SQL means the wrong branch
        // was taken and must fail loudly.
        if (/ai_quota_counters/i.test(normalized)) {
          throw new Error(`Unexpected organization counter SQL for an individual fixture: ${normalized}`);
        }
        throw new Error(`Unexpected AI quota SQL: ${normalized}`);
      },
      commit: async () => {},
      rollback: async () => {},
      release() {},
    };
  }

  async end() {}
}

const pool = new AiQuotaMariaDbPool();
setPoolForTests(pool);

function responseRecorder() {
  return {
    headers: {}, statusCode: 200, body: null, locals: { requestId: 'test-request' },
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

async function runQuota(uid = 'user-1') {
  const req = { user: { uid, email: `${uid}@example.test`, role: 'USER' } };
  const res = responseRecorder();
  let continued = false;
  await enforceDailyAiQuota(req, res, () => { continued = true; });
  return { res, continued };
}

test.beforeEach(() => {
  pool.reset();
  configureAbuseCounterStoreForTests(null);
});

test.after(() => {
  pool.reset();
  setPoolForTests(null);
  configureAbuseCounterStoreForTests(null);
});

test('daily AI quota is account-bound, durable, and fails closed after the basic limit', async () => {
  for (let count = 1; count <= 10; count += 1) {
    const result = await runQuota();
    assert.equal(result.continued, true);
    assert.equal(result.res.headers['X-AI-Daily-Remaining'], String(10 - count));
  }
  const blocked = await runQuota();
  assert.equal(blocked.continued, false);
  assert.equal(blocked.res.statusCode, 429);
  assert.equal(blocked.res.body.error.code, 'AI_DAILY_QUOTA_EXCEEDED');
  const otherAccount = await runQuota('user-2');
  assert.equal(otherAccount.continued, true);
});

test('AI quota fails closed when its authoritative MariaDB store is unavailable', async () => {
  pool.unavailable = true;
  const result = await runQuota();
  assert.equal(result.continued, false);
  assert.equal(result.res.statusCode, 503);
  assert.equal(result.res.body.error.code, 'AI_QUOTA_UNAVAILABLE');
});

/**
 * `accountRateLimit` deliberately bypasses itself when NODE_ENV is 'test' so
 * that unrelated suites never trip a limiter. These three cases exist to prove
 * the limiter's real behaviour, so they run with that bypass switched off and
 * restore it afterwards — otherwise the middleware short-circuits and the
 * assertion measures nothing.
 */
async function withoutTestBypass(body) {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  try {
    return await body();
  } finally {
    process.env.NODE_ENV = previous;
  }
}

test('burst limiter cannot be bypassed by changing source address for one account', async () => {
  configureAbuseCounterStoreForTests(new InMemoryAtomicCounterStore());
  const middleware = accountRateLimit({ namespace: 'ai-test', limit: 2, windowMs: 60_000 });
  const invoke = async ip => {
    const req = { user: { uid: 'same-account' }, ip };
    const res = responseRecorder();
    let continued = false;
    await middleware(req, res, () => { continued = true; });
    return { res, continued };
  };
  await withoutTestBypass(async () => {
    assert.equal((await invoke('203.0.113.1')).continued, true);
    assert.equal((await invoke('203.0.113.2')).continued, true);
    const blocked = await invoke('203.0.113.3');
    assert.equal(blocked.continued, false);
    assert.equal(blocked.res.statusCode, 429);
  });
});

test('burst limiter fails closed when the durable counter store is unavailable', async () => {
  configureAbuseCounterStoreForTests({ increment: async () => { throw new Error('counter offline'); } });
  const middleware = accountRateLimit({ namespace: 'ai-test-failure', limit: 2, windowMs: 60_000 });
  const res = responseRecorder();
  let continued = false;
  await withoutTestBypass(async () => {
    await middleware({ user: { uid: 'same-account' }, ip: '203.0.113.1' }, res, () => { continued = true; });
  });
  assert.equal(continued, false);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error.code, 'RATE_LIMIT_UNAVAILABLE');
});
