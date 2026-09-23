process.env.NODE_ENV = 'test';
process.env.CORS_ALLOWED_ORIGINS = 'https://app.example.com';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { setTokenVerifierForTests } = require('../security/auth');
const { installAiRouteContract, resetAiRouteContract } = require('./helpers/aiRouteContract');

setTokenVerifierForTests(async token => {
  const now = Math.floor(Date.now() / 1000);
  if (token === 'verified') return { uid: 'owner-1', email: 'owner@example.com', email_verified: true, role: 'USER', auth_time: now };
  if (token === 'unverified') return { uid: 'owner-1', email: 'owner@example.com', email_verified: false, role: 'USER', auth_time: now };
  throw new Error('invalid token');
});

const aiContract = installAiRouteContract();
const app = require('../index');
const bearer = token => ({ Authorization: `Bearer ${token}` });

test.beforeEach(() => aiContract.resetAdmission());

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
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"summary":"Engineer. Built payment APIs at Acme. Node.js.","sourceExcerpts":["Built payment APIs at Acme","Node.js"]}' }] } }] }), { status: 200 });
  };
  try {
    const response = await request(app).post('/api/generate-content').set(bearer('verified')).send({
      operation: 'generate-summary',
      payload: { name: 'Asha Rao', jobTitle: 'Engineer', workHistory: 'Built payment APIs at Acme', skills: ['Node.js'] },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { summary: 'Engineer. Built payment APIs at Acme. Node.js.' });
    assert.equal(response.headers['x-ai-provider'], 'gemini');
    assert.equal(response.headers['x-ai-grounding'], 'source-validated');
    assert.match(providerRequest.body.contents[0].parts[0].text, /Built payment APIs at Acme/);
    assert.match(providerRequest.url, /server-only-gemini-key/);
    assert.doesNotMatch(JSON.stringify(response.body), /server-only-gemini-key/);
    assert.equal(response.headers['x-ai-daily-limit'], '100');
  } finally {
    global.fetch = originalFetch;
  }
});

test('ungrounded whole-resume generation is explicitly retired without calling a provider', async () => {
  const originalFetch = global.fetch;
  let providerCalled = false;
  global.fetch = async () => {
    providerCalled = true;
    throw new Error('provider must not be called');
  };
  try {
    const response = await request(app).post('/api/generate-resume').set(bearer('verified')).send({
      occupation: 'Engineer', experienceLevel: 'mid-level', skills: ['Node.js'], education: ['M.Tech'], language: 'en',
    });
    assert.equal(response.status, 410);
    assert.equal(response.body.error.code, 'UNGROUNDED_AI_ENDPOINT_RETIRED');
    assert.equal(providerCalled, false);
  } finally {
    global.fetch = originalFetch;
  }
});

test('resume parser strips provider hallucinations and exposes extraction grounding', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({
    firstname: 'Asha', lastname: 'Mallory', occupation: 'Principal Engineer',
    skills: [{ name: 'React', rating: 90 }],
    languages: [{ name: 'English', level: 'Fluent' }],
    accountType: 'ADMIN',
  }) }] } }] }), { status: 200 });
  try {
    const response = await request(app).post('/api/parse-resume').set(bearer('verified')).send({
      rawText: 'Asha Rao\nEngineer\nSkills: React\nLanguages: English',
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers['x-ai-grounding'], 'source-extracted');
    assert.equal(response.body.data.firstname, 'Asha');
    assert.equal(response.body.data.lastname, '');
    assert.equal(response.body.data.occupation, '');
    assert.deepEqual(response.body.data.skills, [{ skillName: 'React', rating: null }]);
    assert.deepEqual(response.body.data.languages, [{ language: 'English', level: '' }]);
    assert.equal(response.body.data.accountType, undefined);
    assert.equal(response.body.data._grounding, 'source-extracted');
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

test('provider failures return source-preserving content without leaking provider details', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({ error: { message: 'secret provider diagnostic' } }), { status: 503 });
  try {
    const response = await request(app).post('/api/generate-content').set(bearer('verified')).send({
      operation: 'generate-summary',
      payload: { jobTitle: 'Engineer', workHistory: 'Maintained payment APIs and deployment runbooks' },
    });
    assert.equal(response.status, 200);
    // Phase 3: no summary is assembled from the job title + history; the
    // candidate is asked instead and the response is marked AI-unavailable.
    assert.equal(response.body.summary, undefined);
    assert.equal(response.body.requiresAnswer, true);
    assert.ok(Array.isArray(response.body.questions) && response.body.questions.length > 0);
    assert.equal(response.body.aiUnavailable, true);
    assert.doesNotMatch(JSON.stringify(response.body), /Engineer\. Maintained/);
    assert.equal(response.headers['x-ai-provider'], 'fallback');
    assert.doesNotMatch(JSON.stringify(response.body), /secret provider diagnostic|server-only-gemini-key/);
  } finally {
    global.fetch = originalFetch;
  }
});

test.after(() => resetAiRouteContract());
