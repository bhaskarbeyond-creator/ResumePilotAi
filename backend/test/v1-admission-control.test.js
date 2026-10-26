'use strict';

/**
 * F-01 (P0) — `/v1/*` admission control.
 *
 * The OpenAI/Anthropic-compatible gateway used to authenticate callers and
 * then run inference with NO burst limiter, NO governance resolution and NO
 * daily-quota charge: any signed-in user (and, in non-production, any
 * anonymous caller) could drive unmetered paid inference. These tests pin the
 * corrected contract:
 *
 *   1. A static router-stack guard: every `/v1` route layer is registered
 *      AFTER the admission mount (audit §8 "static guards worth adding to CI").
 *   2. Anonymous access is closed by default and NEVER allowed in production;
 *      the only escape hatch is the explicit non-production dev flag
 *      `ALLOW_ANON_V1=true` with no platform keys configured.
 *   3. User-token inference runs the EXACT `/api/ai*` chain
 *      (aiAccountLimiter → aiGovernanceMiddleware → enforceDailyAiQuota) and
 *      is charged in the durable `ai_usage` ledger.
 *   4. Quota exhaustion rejects with 429 AI_DAILY_QUOTA_EXCEEDED.
 *   5. The burst limiter rejects with 429 RATE_LIMITED.
 *   6. Platform-key principals are burst-limited but never charged against a
 *      user entitlement (they are operator credentials); catalog reads
 *      (/v1/models, /v1/status) never consume the daily AI quota.
 *
 * The data plane is the same in-memory MariaDB contract style used by
 * ai-governance-entitlement.test.js: the SQL surface exercised here is the
 * production SQL surface (enterprise_quota_buckets, ai_usage,
 * ai_quota_counters, governance reads).
 */

process.env.NODE_ENV = 'test';
process.env.FREELMAPI_METRICS_DB = ':memory:';
// The burst budget is read at module load: 3/min makes the limiter rejection
// provable within a handful of requests.
process.env.AI_BURST_LIMIT = '3';
// No platform keys by default; the platform-key test sets its own.
delete process.env.FREELMAPI_API_KEYS;
delete process.env.ALLOW_ANON_V1;

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { setPoolForTests } = require('../database/mysql');
const { setRepositoryForTests } = require('../repositories');
const { setTokenVerifierForTests } = require('../security/auth');

/**
 * In-memory MariaDB standing in for the real one for the /v1 admission chain.
 * Implements the SAME SQL surface the production path uses (governance reads,
 * durable burst counters, daily quota ledger), so a change in either breaks
 * here. Unexpected SQL is recorded (tests can assert on it) and answered with
 * an empty result so background boot work cannot crash the suite.
 */
class V1AdmissionPool {
  constructor() { this.reset(); }

  reset() {
    this.users = new Map([
      ['v1-user-a', { id: 'v1-user-a', email: 'a@test', membership: 'Basic', paymentStatus: 'INACTIVE' }],
      ['v1-user-b', { id: 'v1-user-b', email: 'b@test', membership: 'Basic', paymentStatus: 'INACTIVE' }],
      ['v1-user-c', { id: 'v1-user-c', email: 'c@test', membership: 'Basic', paymentStatus: 'INACTIVE' }],
    ]);
    this.quotaSettings = { basicDailyLimit: 2, premiumDailyLimit: 100, adminDailyLimit: 10000 };
    this.usage = new Map();          // ai_usage ledger rows, key `${day}:${uidHash}`
    this.orgCounters = new Map();    // ai_quota_counters
    this.buckets = new Map();        // enterprise_quota_buckets (burst limiter)
    this.memberships = [];
    this.counts = { usersQueries: 0, membershipQueries: 0 };
    this.unexpectedSql = [];
  }

  async query(sql, params = []) {
    const n = String(sql).replace(/\s+/g, ' ').trim();
    if (/^SELECT 1 AS alive, VERSION\(\) AS version$/i.test(n)) {
      return [[{ alive: 1, version: '11.4-v1-admission-contract' }], []];
    }
    if (/^SELECT \* FROM users WHERE id = \? LIMIT 1$/i.test(n)) {
      this.counts.usersQueries += 1;
      const row = this.users.get(String(params[0]));
      return [[row ? { ...row } : null].filter(Boolean), []];
    }
    if (/^SELECT data FROM system_settings WHERE category = 'ai_quota' LIMIT 1$/i.test(n)) {
      return [[{ data: JSON.stringify(this.quotaSettings) }], []];
    }
    if (/^SELECT data, revision FROM system_settings WHERE category = \? LIMIT 1$/i.test(n)) {
      return [[], []];
    }
    if (/FROM enterprise_memberships m/i.test(n)) {
      this.counts.membershipQueries += 1;
      return [[], []];
    }
    if (/^INSERT INTO admin_audit_logs /i.test(n)) return [{ affectedRows: 1 }, []];
    if (/^DELETE FROM export_render_tokens WHERE expires_at /i.test(n)) return [{ affectedRows: 0 }, []];
    this.unexpectedSql.push(n);
    return [/^(INSERT|UPDATE|DELETE)/i.test(n) ? { affectedRows: 0 } : [], []];
  }

  async getConnection() {
    const pool = this;
    return {
      beginTransaction: async () => {},
      commit: async () => {},
      rollback: async () => {},
      release() {},
      async query(sql, params = []) {
        const n = String(sql).replace(/\s+/g, ' ').trim();
        // ── durable burst counter (MySqlAtomicCounterStore) ──
        if (/^SELECT count, expiresAt FROM enterprise_quota_buckets WHERE id = \? FOR UPDATE$/i.test(n)) {
          const row = pool.buckets.get(String(params[0]));
          return [[row ? { count: row.count, expiresAt: row.expiresAt } : null].filter(Boolean), []];
        }
        if (/^UPDATE enterprise_quota_buckets /i.test(n)) {
          const row = pool.buckets.get(String(params[2]));
          if (row) { row.count = Number(params[0]); row.expiresAt = Number(params[1]); }
          return [{ affectedRows: row ? 1 : 0 }, []];
        }
        if (/^INSERT INTO enterprise_quota_buckets /i.test(n)) {
          pool.buckets.set(String(params[0]), { count: Number(params[2]), expiresAt: Number(params[3]) });
          return [{ affectedRows: 1 }, []];
        }
        // ── durable daily quota ledger (enforceDailyAiQuota) ──
        if (/^INSERT INTO ai_quota_counters /i.test(n)) {
          const key = `${params[0]}:${params[1]}:`;
          if (!pool.orgCounters.has(key)) pool.orgCounters.set(key, { count: 0, limit: params[3] });
          else pool.orgCounters.get(key).limit = params[3];
          return [{ affectedRows: 1 }, []];
        }
        if (/^SELECT count FROM ai_quota_counters /i.test(n)) {
          const row = pool.orgCounters.get(`${params[0]}:${params[1]}:`);
          return [[row ? { count: row.count } : null].filter(Boolean), []];
        }
        if (/^UPDATE ai_quota_counters /i.test(n)) {
          const row = pool.orgCounters.get(`${params[2]}:${params[3]}:`);
          if (row) { row.count = params[0]; row.limit = params[1]; }
          return [{ affectedRows: row ? 1 : 0 }, []];
        }
        if (/^SELECT count FROM ai_usage WHERE day_key = \? AND uid_hash = \? FOR UPDATE$/i.test(n)) {
          const row = pool.usage.get(`${params[0]}:${params[1]}`);
          return [[row ? { count: row.count } : null].filter(Boolean), []];
        }
        if (/^INSERT INTO ai_usage /i.test(n)) {
          const key = `${params[0]}:${params[1]}`;
          if (!pool.usage.has(key)) {
            pool.usage.set(key, {
              uid: params[2], tenantId: params[3], scope: params[4], email: params[5],
              count: Number(params[6]) || 0, limit: Number(params[7]),
            });
          } else {
            const row = pool.usage.get(key);
            row.limit = Number(params[7]);
            if (params[6] !== undefined && Number(params[6]) > 0) row.count = Number(params[6]);
            if (params[3]) row.tenantId = params[3];
          }
          return [{ affectedRows: 1 }, []];
        }
        if (/^SELECT data, revision FROM system_settings WHERE category = \? FOR UPDATE$/i.test(n)) return [[], []];
        if (/^SELECT payload, expires_at FROM export_render_tokens /i.test(n)) return [[], []];
        if (/^DELETE FROM export_render_tokens /i.test(n)) return [{ affectedRows: 0 }, []];
        pool.unexpectedSql.push(n);
        return [/^(INSERT|UPDATE|DELETE)/i.test(n) ? { affectedRows: 0 } : [], []];
      },
    };
  }

  async end() {}
}

const pool = new V1AdmissionPool();
setPoolForTests(pool);
setRepositoryForTests({
  async getSetting() { return null; },
  async recordAdminAuditLog(event) { return event; },
});

setTokenVerifierForTests(async token => {
  const now = Math.floor(Date.now() / 1000);
  if (token === 'user-a') return { uid: 'v1-user-a', email: 'a@test', email_verified: true, role: 'USER', auth_time: now };
  if (token === 'user-b') return { uid: 'v1-user-b', email: 'b@test', email_verified: true, role: 'USER', auth_time: now };
  if (token === 'user-c') return { uid: 'v1-user-c', email: 'c@test', email_verified: true, role: 'USER', auth_time: now };
  if (token === 'super-admin') return { uid: 'v1-admin-s', email: 's@test', email_verified: true, role: 'SUPER_ADMIN', auth_time: now };
  throw new Error('invalid token');
});

process.env.GROQ_API_KEY = 'gsk-v1-admission-0001';

const app = require('../index');
const freellm = require('../freellmapi');
const { clearFreeLlmConfigCache } = require('../services/freellmConfig');

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

function completionPayload(content) {
  return jsonResponse({
    choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 9, completion_tokens: 3, total_tokens: 12 },
  });
}

/** Serve every provider call from a deterministic in-process stub. */
function installProviderStub() {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes('/models')) return jsonResponse({ data: [{ id: 'llama-3.3-70b-versatile' }] });
    return completionPayload('admission-controlled completion');
  };
  return () => { globalThis.fetch = original; };
}

const CHAT_BODY = { model: 'auto', messages: [{ role: 'user', content: 'Admission probe' }] };

test.beforeEach(() => {
  pool.reset();
  freellm.resetCooldowns();
  freellm.clearCache();
  freellm.modelDiscovery.clear();
  clearFreeLlmConfigCache();
});

test.after(() => {
  setPoolForTests(null);
  delete process.env.GROQ_API_KEY;
  delete process.env.FREELMAPI_API_KEYS;
  delete process.env.ALLOW_ANON_V1;
  clearFreeLlmConfigCache();
});

// ── 1. Static guard (audit §8): the admission mount precedes every /v1 route ──
test('F-01 guard: every /v1 route is registered behind the admission mount', () => {
  const router = app._router || app.router;
  const layers = router.stack;
  const admissionIdx = layers.findIndex(layer => layer.name === 'v1AdmissionControl');
  assert.ok(admissionIdx >= 0, 'v1AdmissionControl must be mounted on the app');

  const v1RouteLayers = layers
    .map((layer, index) => ({ layer, index }))
    .filter(({ layer }) => layer.route && [].concat(layer.route.path).some(p => String(p).startsWith('/v1/') || String(p).startsWith('/api/v1/')));
  assert.ok(v1RouteLayers.length >= 5, `expected the five /v1 routes, saw ${v1RouteLayers.length}`);
  for (const { layer, index } of v1RouteLayers) {
    assert.ok(index > admissionIdx,
      `route ${JSON.stringify(layer.route.path)} is registered BEFORE the /v1 admission mount`);
  }
});

// ── 2. Anonymous is closed by default; production closes it absolutely ───────
test('F-01: anonymous /v1 inference is rejected 401 by default (non-production)', async () => {
  const res = await request(app).post('/v1/chat/completions').send(CHAT_BODY);
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'missing_api_key');
  assert.equal(pool.usage.size, 0, 'a rejected call must not reach the quota ledger');
});

test('F-01: production rejects anonymous /v1 even with ALLOW_ANON_V1=true', async () => {
  process.env.ALLOW_ANON_V1 = 'true';
  const previousEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const res = await request(app).post('/v1/chat/completions').send(CHAT_BODY);
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'missing_api_key');
  } finally {
    process.env.NODE_ENV = previousEnv;
    delete process.env.ALLOW_ANON_V1;
  }
});

test('F-01: the documented dev flag ALLOW_ANON_V1=true admits anonymous local callers', async () => {
  process.env.ALLOW_ANON_V1 = 'true';
  const restore = installProviderStub();
  try {
    const res = await request(app).post('/v1/chat/completions').send(CHAT_BODY);
    assert.equal(res.status, 200);
    assert.equal(res.body.choices[0].message.content, 'admission-controlled completion');
    assert.equal(pool.usage.size, 0, 'anonymous dev calls have no user principal to charge');
  } finally {
    restore();
    delete process.env.ALLOW_ANON_V1;
  }
});

// ── 3. User tokens run the /api/ai* chain and are metered ────────────────────
test('F-01: user-token /v1 completions are metered in the durable ai_usage ledger', async () => {
  const restore = installProviderStub();
  try {
    const res = await request(app)
      .post('/v1/chat/completions')
      .set('Authorization', 'Bearer user-a')
      .send(CHAT_BODY);
    assert.equal(res.status, 200);
    assert.equal(res.body.choices[0].message.content, 'admission-controlled completion');
    // Governance resolved and the durable ledger was charged BEFORE inference.
    assert.equal(res.headers['x-ai-daily-limit'], '2');
    assert.equal(res.headers['x-ai-daily-remaining'], '1');
    assert.equal(res.headers['x-ai-quota-source'], 'INDIVIDUAL');
    const rows = [...pool.usage.values()];
    assert.equal(rows.length, 1, 'exactly one ai_usage row for the calling principal');
    assert.equal(rows[0].uid, 'v1-user-a');
    assert.equal(rows[0].count, 1);
    assert.ok(pool.counts.usersQueries >= 1, 'governance must resolve the caller identity');
  } finally {
    restore();
  }
});

test('F-01: exceeding the daily quota rejects /v1 with 429 AI_DAILY_QUOTA_EXCEEDED', async () => {
  const restore = installProviderStub();
  try {
    const call = () => request(app).post('/v1/chat/completions').set('Authorization', 'Bearer user-b').send(CHAT_BODY);
    const first = await call();
    assert.equal(first.status, 200);
    assert.equal(first.headers['x-ai-daily-remaining'], '1');
    const second = await call();
    assert.equal(second.status, 200);
    assert.equal(second.headers['x-ai-daily-remaining'], '0');
    const third = await call();
    assert.equal(third.status, 429);
    assert.equal(third.body.error.code, 'AI_DAILY_QUOTA_EXCEEDED');
    const rows = [...pool.usage.values()];
    assert.equal(rows.length, 1);
    assert.equal(rows[0].count, 2, 'the rejected request must not be charged');
  } finally {
    restore();
  }
});

// ── 4. Platform keys: burst-limited, never charged as a user ────────────────
test('F-01: platform-key calls are burst-limited (429 RATE_LIMITED) and never touch the user quota ledger', async () => {
  process.env.FREELMAPI_API_KEYS = 'v1-admission-platform-key';
  const restore = installProviderStub();
  try {
    const call = () => request(app)
      .post('/v1/chat/completions')
      .set('Authorization', 'Bearer v1-admission-platform-key')
      .send(CHAT_BODY);
    for (const expected of [200, 200, 200]) {
      const res = await call();
      assert.equal(res.status, expected);
    }
    const fourth = await call();
    assert.equal(fourth.status, 429, 'the burst limiter must throttle platform keys too');
    assert.equal(fourth.body.error.code, 'RATE_LIMITED');
    assert.equal(pool.usage.size, 0, 'platform keys are operator credentials, not user entitlements');
    assert.equal(pool.counts.usersQueries, 0, 'governance must not resolve a user for platform keys');
  } finally {
    restore();
    delete process.env.FREELMAPI_API_KEYS;
  }
});

test('F-01: an invalid bearer token is rejected 401 invalid_api_key', async () => {
  const res = await request(app)
    .post('/v1/chat/completions')
    .set('Authorization', 'Bearer not-a-real-token')
    .send(CHAT_BODY);
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'invalid_api_key');
});

// ── 5. Catalog reads are admitted but never consume the daily AI quota ───────
test('F-01: catalog reads require a principal and do not consume AI quota', async () => {
  const anonymous = await request(app).get('/v1/models');
  assert.equal(anonymous.status, 401, 'the catalog is no longer an unauthenticated surface');

  const models = await request(app).get('/v1/models').set('Authorization', 'Bearer user-c');
  assert.equal(models.status, 200);
  assert.equal(models.body.object, 'list');

  // F-10 supersedes the /v1/status leg of this contract: engine status is an
  // operator-only reduced surface (asserted in the F-10 tests below). What
  // must survive here: catalog reads are admitted with a principal and never
  // consume the daily AI quota.
  process.env.FREELMAPI_API_KEYS = 'v1-admission-platform-key';
  try {
    const status = await request(app).get('/v1/status').set('Authorization', 'Bearer v1-admission-platform-key');
    assert.equal(status.status, 200);
  } finally {
    delete process.env.FREELMAPI_API_KEYS;
  }

  assert.equal(pool.usage.size, 0, 'a catalog read is not an inference and must not be charged');
});

// ── 6. The /api/v1 alias carries the same admission control ──────────────────
test('F-01: the /api/v1 alias enforces the same admission chain', async () => {
  const anonymous = await request(app).post('/api/v1/chat/completions').send(CHAT_BODY);
  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.body.error.code, 'missing_api_key');

  const restore = installProviderStub();
  try {
    const res = await request(app)
      .post('/api/v1/chat/completions')
      .set('Authorization', 'Bearer user-c')
      .send(CHAT_BODY);
    assert.equal(res.status, 200);
    assert.equal(res.headers['x-ai-quota-source'], 'INDIVIDUAL');
    assert.equal([...pool.usage.values()][0].uid, 'v1-user-c');
  } finally {
    restore();
  }
});

// ── 7. F-10: /v1/status is an operator surface with a reduced payload ───────
test('F-10: unauthenticated /v1/status is rejected 401 (no internals)', async () => {
  const res = await request(app).get('/v1/status');
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'missing_api_key');
});

test('F-10: a plain user token is rejected 403 status_forbidden and is not charged', async () => {
  const res = await request(app).get('/v1/status').set('Authorization', 'Bearer user-c');
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'status_forbidden');
  assert.equal(pool.usage.size, 0, 'a rejected status read never reaches the quota ledger');
});

test('F-10: the dev anonymous-local principal never sees engine internals', async () => {
  process.env.ALLOW_ANON_V1 = 'true';
  try {
    const res = await request(app).get('/v1/status');
    assert.equal(res.status, 403, 'anonymous-local is admitted to /v1 but is not an operator');
    assert.equal(res.body.error.code, 'status_forbidden');
  } finally {
    delete process.env.ALLOW_ANON_V1;
  }
});

const REDUCED_STATUS_INTERNALS = ['cacheEntries', 'activeCooldowns', 'persistence', 'supportedProviders', 'capabilities', 'claudeCodeAgent'];

test('F-10: platform key reads the reduced status payload (no counts, cooldowns, paths)', async () => {
  process.env.FREELMAPI_API_KEYS = 'v1-admission-platform-key';
  try {
    const res = await request(app).get('/v1/status').set('Authorization', 'Bearer v1-admission-platform-key');
    assert.equal(res.status, 200);
    assert.ok(res.body.status === 'ok' || res.body.status === 'degraded');
    assert.equal(typeof res.body.version, 'string');
    assert.equal(typeof res.body.providers?.configured, 'number');
    assert.equal(typeof res.body.providers?.enabled, 'number');
    assert.ok(res.body.providers.enabled <= res.body.providers.configured);
    assert.ok(res.body.providers.configured >= 1, 'the spec env configures GROQ_API_KEY');
    for (const field of REDUCED_STATUS_INTERNALS) {
      assert.ok(!(field in res.body), `reduced payload must not expose ${field}`);
    }
    const serialized = JSON.stringify(res.body);
    assert.ok(!/[.]db|sqlite|mariadb-data|[/]home[/]/i.test(serialized), 'no filesystem paths leak');
  } finally {
    delete process.env.FREELMAPI_API_KEYS;
  }
});

test('F-10: super-admin session reads the same reduced payload on /v1/status', async () => {
  const res = await request(app).get('/v1/status').set('Authorization', 'Bearer super-admin');
  assert.equal(res.status, 200);
  for (const field of REDUCED_STATUS_INTERNALS) {
    assert.ok(!(field in res.body), `reduced payload must not expose ${field}`);
  }
});

test('F-10: the full engine view lives on super-admin-only /api/freellmapi/status', async () => {
  const anonymous = await request(app).get('/api/freellmapi/status');
  assert.equal(anonymous.status, 401, 'the full view is no longer an unauthenticated surface');

  const user = await request(app).get('/api/freellmapi/status').set('Authorization', 'Bearer user-c');
  assert.equal(user.status, 403);

  const admin = await request(app).get('/api/freellmapi/status').set('Authorization', 'Bearer super-admin');
  assert.equal(admin.status, 200);
  assert.ok(Array.isArray(admin.body.supportedProviders), 'admin console keeps the full engine view');
  assert.ok('activeCooldowns' in admin.body);
  assert.ok('cacheEntries' in admin.body);
});
