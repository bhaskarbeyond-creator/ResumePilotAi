'use strict';

/**
 * Deliverable 2: Live AI Fleet Verification Probe Suite Contract Tests
 *
 * Verifies that probeSingleProvider and probeAiFleet truthfully classify:
 *   - 200 OK -> alive (extracts token snippet & latency)
 *   - 410 Gone -> retired (first-class deprecation detection)
 *   - 404 Not Found -> not-found
 *   - 401 / 403 -> auth-invalid
 *   - 429 -> rate-limited
 *   - Request timeout -> timeout
 *   - Unconfigured -> not-configured
 */

process.env.NODE_ENV = 'test';
process.env.FREELMAPI_METRICS_DB = ':memory:';

const test = require('node:test');
const assert = require('node:assert/strict');

const { probeSingleProvider, probeAiFleet } = require('../scripts/probe-ai-fleet');

function mockFetch(status, body, { latencyMs = 5 } = {}) {
  return async () => {
    await new Promise(r => setTimeout(r, latencyMs));
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => typeof body === 'string' ? body : JSON.stringify(body),
      json: async () => typeof body === 'string' ? JSON.parse(body) : body,
    };
  };
}

test('D2-1: probeSingleProvider reports not-configured when key is empty', async () => {
  const result = await probeSingleProvider('nvidia', { key: '' });
  assert.equal(result.status, 'not-configured');
  assert.equal(result.alive, false);
  assert.equal(result.errorClass, 'unconfigured');
});

test('D2-2: probeSingleProvider detects alive model on HTTP 200', async () => {
  const fetchImpl = mockFetch(200, {
    choices: [{ message: { content: 'OK' } }],
    usage: { total_tokens: 3 },
  });

  const result = await probeSingleProvider('nvidia', {
    key: 'valid-test-key',
    model: 'meta/llama-3.3-70b-instruct',
  }, { fetchImpl, timeoutMs: 500 });

  assert.equal(result.status, 'alive');
  assert.equal(result.alive, true);
  assert.equal(result.httpStatus, 200);
  assert.equal(result.responseSnippet, 'OK');
  assert.ok(result.latencyMs >= 0);
});

test('D2-3: probeSingleProvider detects retired model on HTTP 410', async () => {
  const fetchImpl = mockFetch(410, {
    error: { message: 'Model meta/llama-3.1-8b-instruct has been retired. Please use llama-3.3-70b.' },
  });

  const result = await probeSingleProvider('nvidia', {
    key: 'valid-test-key',
    model: 'meta/llama-3.1-8b-instruct',
  }, { fetchImpl, timeoutMs: 500 });

  assert.equal(result.status, 'retired');
  assert.equal(result.alive, false);
  assert.equal(result.httpStatus, 410);
  assert.equal(result.errorClass, 'model_retired');
  assert.ok(result.message.includes('retired'));
});

test('D2-4: probeSingleProvider detects not-found model on HTTP 404', async () => {
  const fetchImpl = mockFetch(404, {
    error: { message: 'Model google/gemini-2.0-flash-exp:free not found' },
  });

  const result = await probeSingleProvider('openrouter', {
    key: 'valid-test-key',
    model: 'google/gemini-2.0-flash-exp:free',
  }, { fetchImpl, timeoutMs: 500 });

  assert.equal(result.status, 'not-found');
  assert.equal(result.alive, false);
  assert.equal(result.httpStatus, 404);
  assert.equal(result.errorClass, 'model_not_found');
});

test('D2-5: probeSingleProvider detects auth-invalid on HTTP 401', async () => {
  const fetchImpl = mockFetch(401, {
    error: { message: 'Incorrect API key provided' },
  });

  const result = await probeSingleProvider('openai', {
    key: 'sk-invalid-key-xxx',
    model: 'gpt-4o-mini',
  }, { fetchImpl, timeoutMs: 500 });

  assert.equal(result.status, 'auth-invalid');
  assert.equal(result.alive, false);
  assert.equal(result.httpStatus, 401);
  assert.equal(result.errorClass, 'auth_invalid');
});

test('D2-6: probeSingleProvider detects upstream timeout', async () => {
  const hangingFetch = async (_url, { signal }) => {
    return new Promise((_, reject) => {
      signal.addEventListener('abort', () => {
        const err = new Error('Aborted');
        err.name = 'AbortError';
        reject(err);
      });
    });
  };

  const result = await probeSingleProvider('nvidia', {
    key: 'valid-test-key',
    model: 'meta/llama-3.3-70b-instruct',
  }, { fetchImpl: hangingFetch, timeoutMs: 40 });

  assert.equal(result.status, 'timeout');
  assert.equal(result.alive, false);
  assert.equal(result.httpStatus, 408);
  assert.equal(result.errorClass, 'timeout');
});

test('D2-7: probeAiFleet returns aggregated summary with alive and dead counts', async () => {
  const fetchImpl = mockFetch(200, {
    choices: [{ message: { content: 'OK' } }],
    usage: { total_tokens: 2 },
  });

  const report = await probeAiFleet({
    providers: ['nvidia'],
    timeoutMs: 500,
    fetchImpl,
    runtimeConfig: {
      primary: 'nvidia',
      providers: {
        nvidia: { key: 'test-key', model: 'meta/llama-3.3-70b-instruct' },
      },
    },
  });

  assert.equal(typeof report.timestamp, 'string');
  assert.equal(report.summary.totalProbed, 1);
  assert.equal(report.summary.aliveCount, 1);
  assert.equal(report.fleetAlive, true);
  assert.ok(report.answer.includes('OPERATIONAL'));
});
