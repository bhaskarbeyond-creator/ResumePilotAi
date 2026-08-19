import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAiRequest, generateUserAiContent } from '../src/services/aiService.js';

test('AI client preserves legacy operation payloads behind one same-origin backend contract', () => {
  assert.deepEqual(buildAiRequest('generate-summary', { name: 'Asha', workHistory: 'Acme' }), {
    url: '/api/generate-content',
    body: { operation: 'generate-summary', payload: { name: 'Asha', workHistory: 'Acme' } },
  });
  assert.deepEqual(buildAiRequest('generate-resume', { occupation: 'Engineer' }), {
    url: '/api/generate-resume', body: { occupation: 'Engineer' },
  });
  assert.throws(() => buildAiRequest('arbitrary-provider-call', {}), /Unsupported AI operation/);
});

test('AI client sends context and returns the exact UI response shape without browser credentials', async () => {
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = { url, options };
    return new Response(JSON.stringify({ suggestions: ['Built reliable APIs', 'Reduced deployment risk'] }), {
      status: 200, headers: { 'Content-Type': 'application/json', 'X-AI-Provider': 'gemini' },
    });
  };
  try {
    const result = await generateUserAiContent('generate-work-description', {
      jobTitle: 'Engineer', employer: 'Acme', existingText: 'Migrated APIs', language: 'en',
    });
    assert.deepEqual(result, { suggestions: ['Built reliable APIs', 'Reduced deployment risk'] });
    assert.equal(captured.url, '/api/generate-content');
    const body = JSON.parse(captured.options.body);
    assert.equal(body.payload.existingText, 'Migrated APIs');
    assert.equal(body.operation, 'generate-work-description');
    assert.doesNotMatch(captured.options.body, /apiKey|secret|Bearer/i);
    assert.equal(captured.options.credentials, 'same-origin');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('AI client preserves structured server errors for retry UX', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: 'AI_DAILY_QUOTA_EXCEEDED', message: 'Daily AI quota reached', requestId: 'req-1' } }), {
    status: 429, headers: { 'Content-Type': 'application/json' },
  });
  try {
    await assert.rejects(() => generateUserAiContent('generate-skills', { occupation: 'Engineer' }), error => {
      assert.equal(error.code, 'AI_DAILY_QUOTA_EXCEEDED');
      assert.equal(error.status, 429);
      assert.equal(error.requestId, 'req-1');
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('AI client routes generate-interview to direct backend endpoint', () => {
  assert.deepEqual(buildAiRequest('generate-interview', { occupation: 'Frontend Developer', questionCount: 5 }), {
    url: '/api/generate-interview',
    body: { occupation: 'Frontend Developer', questionCount: 5 },
  });
});

test('AI client supports user cancellation without converting it into generated content', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (_url, options) => new Promise((_resolve, reject) => {
    if (options.signal?.aborted) return reject(Object.assign(new Error('cancelled'), { name: 'AbortError' }));
    options.signal?.addEventListener('abort', () => reject(Object.assign(new Error('cancelled'), { name: 'AbortError' })), { once: true });
  });
  const controller = new AbortController();
  try {
    const pending = generateUserAiContent('generate-summary', { jobTitle: 'Engineer' }, { signal: controller.signal });
    controller.abort();
    await assert.rejects(pending, error => error.name === 'AbortError');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

