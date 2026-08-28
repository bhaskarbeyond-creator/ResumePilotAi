'use strict';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { setTokenVerifierForTests } = require('../security/auth');
const { extractJson, buildLegacyPrompt } = require('../services/aiRuntime');
const { installAiRouteContract, resetAiRouteContract } = require('./helpers/aiRouteContract');

setTokenVerifierForTests(async token => {
  const now = Math.floor(Date.now() / 1000);
  if (token === 'user') return { uid: 'user-1', email: 'user@example.com', email_verified: true, role: 'USER', auth_time: now };
  if (token === 'unverified') return { uid: 'user-2', email: 'pending@example.com', email_verified: false, role: 'USER', auth_time: now };
  if (token === 'admin') return { uid: 'admin-1', email: 'admin@example.com', email_verified: true, role: 'ADMIN', auth_time: now };
  throw new Error('invalid token');
});

const aiContract = installAiRouteContract();
const app = require('../index');
const bearer = token => ({ Authorization: `Bearer ${token}` });

test.beforeEach(() => aiContract.resetAdmission());

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

test('grounded prompt builder validates operations, source facts, and evidence contracts', () => {
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
  assert.match(work.prompt, /SOURCE-OF-TRUTH RULES \(MANDATORY\)/);
  assert.match(work.prompt, /"sourceExcerpt"/);

  // generate-education-description
  const edu = buildLegacyPrompt('generate-education-description', {
    school: 'MIT',
    degree: 'B.S. Computer Science',
    existingText: 'Completed a distributed systems capstone project'
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
    .post('/api/generate-content')
    .set(bearer('user'))
    .send({ operation: 'generate-summary', payload: { occupation: 'Engineer' }, apiKey: 'secret-key-attempt' });
  assert.equal(apiKeyAttempt.status, 400);
  assert.equal(apiKeyAttempt.body.error.code, 'CLIENT_AI_KEY_REJECTED');

  // Reject header client keys
  const headerKeyAttempt = await request(app)
    .post('/api/generate-content')
    .set(bearer('user'))
    .set('x-gemini-api-key', 'secret-key-attempt')
    .send({ operation: 'generate-summary', payload: { occupation: 'Engineer' } });
  assert.equal(headerKeyAttempt.status, 400);
  assert.equal(headerKeyAttempt.body.error.code, 'CLIENT_AI_KEY_REJECTED');

  // Reject client identity injection
  const identityAttempt = await request(app)
    .post('/api/generate-content')
    .set(bearer('user'))
    .send({ operation: 'generate-summary', payload: { occupation: 'Engineer', uid: 'victim-uid' } });
  assert.equal(identityAttempt.status, 400);
  assert.equal(identityAttempt.body.error.code, 'CLIENT_AI_IDENTITY_REJECTED');

  // Reject oversized input
  const oversizedAttempt = await request(app)
    .post('/api/generate-content')
    .set(bearer('user'))
    .send({ operation: 'generate-summary', payload: { occupation: 'Engineer', description: 'X'.repeat(60_000) } });
  assert.equal(oversizedAttempt.status, 413);
  assert.equal(oversizedAttempt.body.error.code, 'AI_INPUT_TOO_LARGE');

  // Reject unauthenticated requests
  const unauth = await request(app)
    .post('/api/generate-content')
    .send({ operation: 'generate-summary', payload: { occupation: 'Engineer' } });
  assert.equal(unauth.status, 401);
  assert.equal(unauth.body.error.code, 'AUTH_REQUIRED');

  // Reject unverified email requests
  const unverified = await request(app)
    .post('/api/generate-content')
    .set(bearer('unverified'))
    .send({ operation: 'generate-summary', payload: { occupation: 'Engineer' } });
  assert.equal(unverified.status, 403);
  assert.equal(unverified.body.error.code, 'EMAIL_VERIFICATION_REQUIRED');
});

test('AI endpoints support multi-language routing and deterministic fallbacks', async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: '{"summary":"Desarrollador de Software. Mantuvo microservicios de pagos.","sourceExcerpts":["Mantuvo microservicios de pagos"]}' }] } }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    // Test summary generation for Spanish
    const esSummary = await request(app)
      .post('/api/generate-content')
      .set(bearer('user'))
      .send({
        operation: 'generate-summary',
        payload: { occupation: 'Desarrollador de Software', sourceFacts: 'Mantuvo microservicios de pagos', language: 'es' },
      });
    assert.equal(esSummary.status, 200);
    assert.equal(esSummary.body.summary, 'Desarrollador de Software. Mantuvo microservicios de pagos.');
    assert.equal(esSummary.headers['x-ai-grounding'], 'source-validated');
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

test.after(() => resetAiRouteContract());
