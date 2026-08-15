'use strict';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { setTokenVerifierForTests } = require('../security/auth');
const { extractJson, buildLegacyPrompt } = require('../services/aiRuntime');

setTokenVerifierForTests(async token => {
  const now = Math.floor(Date.now() / 1000);
  if (token === 'user') return { uid: 'user-1', email: 'user@example.com', email_verified: true, role: 'USER', auth_time: now };
  if (token === 'unverified') return { uid: 'user-2', email: 'pending@example.com', email_verified: false, role: 'USER', auth_time: now };
  if (token === 'admin') return { uid: 'admin-1', email: 'admin@example.com', email_verified: true, role: 'ADMIN', auth_time: now };
  throw new Error('invalid token');
});

const app = require('../index');
const secrets = { gemini: { apiKey: 'server-only-gemini-key', model: 'gemini-2.0-flash' } };
const fakeDb = {
  collection(name) {
    return {
      doc(id) {
        if (name === 'settings') return { id, async get() { return { exists: true, data: () => secrets }; } };
        if (name === 'data') return { id, async get() { return { exists: true, data: () => ({ ai: { provider: 'gemini', enableGemini: true } }) }; } };
        return { id, async get() { return { exists: false, data: () => ({}) }; } };
      },
    };
  },
  async runTransaction(callback) {
    await callback({
      async get() { return { exists: false, data: () => ({}) }; },
      set() {},
    });
  },
};
app.set('db', fakeDb);
const bearer = token => ({ Authorization: `Bearer ${token}` });

test('extractJson parses clean, wrapped, and malformed JSON with raw control characters', () => {
  // Clean JSON
  assert.deepEqual(extractJson('{"suggestions":["bullet 1","bullet 2"]}'), { suggestions: ['bullet 1', 'bullet 2'] });

  // Markdown-fenced JSON
  assert.deepEqual(extractJson('```json\n{"summary": "Experienced engineer"}\n```'), { summary: 'Experienced engineer' });

  // JSON with unescaped control characters inside string literals
  const unescapedNewlines = '{\n  "summary": "Line 1\nLine 2 with \ttab"\n}';
  const parsedControl = extractJson(unescapedNewlines);
  assert.ok(parsedControl);
  assert.match(parsedControl.summary, /Line 1/);

  // Invalid JSON returns null safely without throwing unhandled crash
  assert.equal(extractJson('This is completely not JSON and has no braces'), null);
});

test('buildLegacyPrompt validates operations, bounds input sizes, and enforces ATS criteria', () => {
  // generate-work-description
  const work = buildLegacyPrompt('generate-work-description', {
    jobTitle: 'Backend Lead',
    employer: 'Cloud Corp',
    existingText: 'Architected microservices',
    language: 'en'
  });
  assert.match(work.prompt, /Backend Lead/);
  assert.match(work.prompt, /Cloud Corp/);
  assert.match(work.prompt, /Architected microservices/);
  assert.match(work.prompt, /STRICT ANTI-AI BUZZWORD BAN/);

  // generate-education-description
  const edu = buildLegacyPrompt('generate-education-description', {
    school: 'MIT',
    degree: 'B.S. Computer Science'
  });
  assert.match(edu.prompt, /MIT/);
  assert.match(edu.prompt, /B\.S\. Computer Science/);

  // generate-summary
  const summary = buildLegacyPrompt('generate-summary', {
    name: 'Alex',
    jobTitle: 'Senior SRE',
    skills: ['Kubernetes', 'Terraform', 'Go']
  });
  assert.match(summary.prompt, /Alex/);
  assert.match(summary.prompt, /Senior SRE/);
  assert.match(summary.prompt, /Kubernetes, Terraform, Go/);

  // Missing required fields throws 400
  assert.throws(() => buildLegacyPrompt('generate-work-description', {}), /Job title is required/);
  assert.throws(() => buildLegacyPrompt('generate-education-description', {}), /School is required/);
});

test('AI gateway enforces security boundary, identity protections, and size constraints', async () => {
  // Reject client-supplied API keys
  const apiKeyAttempt = await request(app)
    .post('/api/generate-summary')
    .set(bearer('user'))
    .send({ occupation: 'Engineer', apiKey: 'secret-key-attempt' });
  assert.equal(apiKeyAttempt.status, 400);
  assert.equal(apiKeyAttempt.body.error.code, 'CLIENT_AI_KEY_REJECTED');

  // Reject header client keys
  const headerKeyAttempt = await request(app)
    .post('/api/generate-summary')
    .set(bearer('user'))
    .set('x-gemini-api-key', 'secret-key-attempt')
    .send({ occupation: 'Engineer' });
  assert.equal(headerKeyAttempt.status, 400);
  assert.equal(headerKeyAttempt.body.error.code, 'CLIENT_AI_KEY_REJECTED');

  // Reject client identity injection
  const identityAttempt = await request(app)
    .post('/api/generate-summary')
    .set(bearer('user'))
    .send({ occupation: 'Engineer', uid: 'victim-uid' });
  assert.equal(identityAttempt.status, 400);
  assert.equal(identityAttempt.body.error.code, 'CLIENT_AI_IDENTITY_REJECTED');

  // Reject oversized input
  const oversizedAttempt = await request(app)
    .post('/api/generate-summary')
    .set(bearer('user'))
    .send({ occupation: 'Engineer', description: 'X'.repeat(60_000) });
  assert.equal(oversizedAttempt.status, 413);
  assert.equal(oversizedAttempt.body.error.code, 'AI_INPUT_TOO_LARGE');

  // Reject unauthenticated requests
  const unauth = await request(app)
    .post('/api/generate-summary')
    .send({ occupation: 'Engineer' });
  assert.equal(unauth.status, 401);
  assert.equal(unauth.body.error.code, 'AUTH_REQUIRED');

  // Reject unverified email requests
  const unverified = await request(app)
    .post('/api/generate-summary')
    .set(bearer('unverified'))
    .send({ occupation: 'Engineer' });
  assert.equal(unverified.status, 403);
  assert.equal(unverified.body.error.code, 'EMAIL_VERIFICATION_REQUIRED');
});

test('AI endpoints support multi-language routing and deterministic fallbacks', async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'Ingeniero de software con experiencia en microservicios.' }] } }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    // Test summary generation for Spanish
    const esSummary = await request(app)
      .post('/api/generate-summary')
      .set(bearer('user'))
      .send({ occupation: 'Desarrollador de Software', language: 'es' });
    assert.equal(esSummary.status, 200);
    assert.ok(esSummary.body.summary);
  } finally {
    global.fetch = originalFetch;
  }

  // Test parse-resume validation bounds
  const emptyParse = await request(app)
    .post('/api/parse-resume')
    .set(bearer('user'))
    .send({ rawText: '' });
  assert.equal(emptyParse.status, 400);
  assert.equal(emptyParse.body.error.code, 'INVALID_RESUME_TEXT');
});
