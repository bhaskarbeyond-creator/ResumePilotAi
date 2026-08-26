const test = require('node:test');
const assert = require('node:assert/strict');
const { enforceDailyAiQuota, accountRateLimit, _buckets } = require('../security/abuse');

function quotaDb(membership = 'Basic') {
  // The quota store is MySQL (ai_usage table) — a Firestore-shaped mock is no
  // longer on the synchronous path. The default Basic limit applies when the
  // test user has no membership row.
  const { getPool } = require('../database/mysql');
  const pool = getPool();
  pool.query("DELETE FROM ai_usage WHERE uid IN ('user-1','user-2')").catch(() => {});
  pool.query(
    "INSERT INTO users (id, email, membership, paymentStatus) VALUES ('user-1', 'quota@example.com', ?, 'INACTIVE') ON DUPLICATE KEY UPDATE membership = ?",
    [membership, membership]
  ).catch(() => {});
  pool.query(
    "INSERT INTO users (id, email, membership, paymentStatus) VALUES ('user-2', 'quota2@example.com', 'Basic', 'INACTIVE') ON DUPLICATE KEY UPDATE membership = 'Basic'"
  ).catch(() => {});
  return { pool };
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
  // Simulate store outage by dropping the ai_usage table; the middleware must
  // fail closed (503) — never silently bypass the limit.
  const { getPool } = require('../database/mysql');
  const pool = getPool();
  await pool.query('DROP TABLE IF EXISTS ai_usage');
  try {
    const result = await runQuota(null);
    assert.equal(result.continued, false);
    assert.equal(result.res.statusCode, 503);
    assert.equal(result.res.body.error.code, 'AI_QUOTA_UNAVAILABLE');
  } finally {
    await pool.query(`CREATE TABLE IF NOT EXISTS ai_usage (
      day_key VARCHAR(10) NOT NULL,
      uid_hash VARCHAR(40) NOT NULL,
      uid VARCHAR(128) NOT NULL,
      email VARCHAR(255),
      count INT NOT NULL DEFAULT 1,
      limit_used INT NOT NULL DEFAULT 10,
      last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (day_key, uid_hash),
      INDEX idx_ai_usage_uid (uid),
      INDEX idx_ai_usage_day (day_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`).catch(() => {});
  }
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
