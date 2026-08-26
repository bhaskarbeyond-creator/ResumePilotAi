process.env.NODE_ENV = 'test';
process.env.CORS_ALLOWED_ORIGINS = 'https://app.example.com';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { setTokenVerifierForTests } = require('../security/auth');
const { _buckets } = require('../security/abuse');

setTokenVerifierForTests(async token => {
  const now = Math.floor(Date.now() / 1000);
  if (token === 'verified') return { uid: 'owner-1', email: 'owner@example.com', email_verified: true, role: 'USER', auth_time: now };
  if (token === 'unverified') return { uid: 'owner-1', email: 'owner@example.com', email_verified: false, role: 'USER', auth_time: now };
  throw new Error('invalid token');
});

const app = require('../index');
const usage = new Map();
// AI provider secrets are seeded in the authoritative MySQL system_settings
// store (Firestore data plane is OFF). Seeded in a `before` hook so the
// inserts are durable before any route is exercised.
const { before } = require('node:test');
const { getPool } = require('../database/mysql');
before(async () => {
  const pool = getPool();
  await pool.query("DELETE FROM system_settings WHERE category IN ('public_config','ai_providers')");
  await pool.query("INSERT INTO system_settings (category, data, revision) VALUES ('ai_providers', ?, 1)",
    [JSON.stringify({ gemini: { apiKey: 'server-only-gemini-key', model: 'gemini-2.0-flash' } })]);
  await pool.query("INSERT INTO system_settings (category, data, revision) VALUES ('public_config', ?, 1)",
    [JSON.stringify({ ai: { provider: 'gemini', enableGemini: true, enableFallback: true, maxTokens: 2048 } })]);
  // Premium user so the daily AI limit is 100 (resolveEffectiveEntitlement).
  await pool.query(
    "INSERT INTO users (id, email, membership, paymentStatus) VALUES ('owner-1', 'owner@example.com', 'Premium', 'ACTIVE') ON DUPLICATE KEY UPDATE membership = 'Premium', paymentStatus = 'ACTIVE'"
  );
});
app.set('db', null);
const bearer = token => ({ Authorization: `Bearer ${token}` });

test.beforeEach(() => {
  _buckets.clear();
  usage.clear();
});

test('AI generation requires a verified authenticated Firebase identity', async () => {
  const anonymous = await request(app).post('/api/generate-content').send({ operation: 'generate-summary', payload: { jobTitle: 'Engineer' } });
  assert.equal(anonymous.status, 401);
  const unverified = await request(app).post('/api/generate-content').set(bearer('unverified')).send({ operation: 'generate-summary', payload: { jobTitle: 'Engineer' } });
  assert.equal(unverified.status, 403);
  assert.equal(unverified.body.error.code, 'EMAIL_VERIFICATION_REQUIRED');
});

test('AI route preserves prompt context and response contract through the authenticated provider boundary', async () => {
  const originalFetch = global.fetch;
  let providerRequest;
  global.fetch = async (url, options) => {
    providerRequest = { url, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"summary":"Engineer focused on reliable payment APIs."}' }] } }] }), { status: 200 });
  };
  try {
    const response = await request(app).post('/api/generate-content').set(bearer('verified')).send({
      operation: 'generate-summary',
      payload: { name: 'Asha Rao', jobTitle: 'Engineer', workHistory: 'Built payment APIs at Acme', skills: ['Node.js'] },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { summary: 'Engineer focused on reliable payment APIs.' });
    assert.equal(response.headers['x-ai-provider'], 'gemini');
    assert.match(providerRequest.body.contents[0].parts[0].text, /Built payment APIs at Acme/);
    assert.match(providerRequest.url, /server-only-gemini-key/);
    assert.doesNotMatch(JSON.stringify(response.body), /server-only-gemini-key/);
    assert.equal(response.headers['x-ai-daily-limit'], '100');
  } finally {
    global.fetch = originalFetch;
  }
});

test('complete resume generation preserves required sections and drops unexpected provider fields', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: `\`\`\`json
    {"firstname":"Asha","lastname":"Rao","occupation":"Engineer","summary":"<b>Reliable engineer</b>","employments":[{"jobTitle":"Engineer","employer":"Acme","description":"Built APIs"}],"educations":[{"school":"University","degree":"M.Tech"}],"skills":[{"name":"Node.js","rating":4}],"languages":[{"name":"English","level":"Fluent"}],"accountType":"Premium","__proto__":{"admin":true}}
    \`\`\`` }] } }] }), { status: 200 });
  try {
    const response = await request(app).post('/api/generate-resume').set(bearer('verified')).send({
      occupation: 'Engineer', experienceLevel: 'mid-level', skills: ['Node.js'], education: ['M.Tech'], language: 'en',
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.firstname, 'Asha');
    assert.equal(response.body.summary, 'Reliable engineer');
    assert.equal(response.body.employments[0].employer, 'Acme');
    assert.equal(response.body.skills[0].name, 'Node.js');
    assert.equal(response.body.accountType, undefined);
    assert.equal(Object.hasOwn(response.body, '__proto__'), false);
    assert.equal(response.body._source, 'ai');
  } finally {
    global.fetch = originalFetch;
  }
});

test('AI route rejects client credentials, cross-account identity fields, and oversized context', async () => {
  const clientKey = await request(app).post('/api/generate-content').set(bearer('verified')).send({ apiKey: 'attacker-key', operation: 'generate-summary', payload: {} });
  assert.equal(clientKey.status, 400);
  assert.equal(clientKey.body.error.code, 'CLIENT_AI_KEY_REJECTED');

  const crossAccount = await request(app).post('/api/generate-content').set(bearer('verified')).send({ operation: 'generate-summary', payload: { userId: 'victim', jobTitle: 'Engineer' } });
  assert.equal(crossAccount.status, 400);
  assert.equal(crossAccount.body.error.code, 'CLIENT_AI_IDENTITY_REJECTED');

  const oversized = await request(app).post('/api/generate-content').set(bearer('verified')).send({ operation: 'generate-summary', payload: { workHistory: 'x'.repeat(51_000) } });
  assert.equal(oversized.status, 413);
  assert.equal(oversized.body.error.code, 'AI_INPUT_TOO_LARGE');
});

test('provider failures return a safe retryable error without leaking provider details', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({ error: { message: 'secret provider diagnostic' } }), { status: 503 });
  try {
    const response = await request(app).post('/api/generate-content').set(bearer('verified')).send({ operation: 'generate-summary', payload: { jobTitle: 'Engineer' } });
    assert.equal(response.status, 502);
    assert.equal(response.body.error.code, 'AI_PROVIDER_ERROR');
    assert.equal(response.body.error.message, 'AI generation is temporarily unavailable');
    assert.doesNotMatch(JSON.stringify(response.body), /secret provider diagnostic|server-only-gemini-key/);
  } finally {
    global.fetch = originalFetch;
  }
});

test.after(async () => {
  try {
    const { getPool } = require('../database/mysql');
    await getPool().end();
  } catch (_) {}
});
