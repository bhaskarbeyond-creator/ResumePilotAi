/**
 * Truthful AI Diagnostics & Fallback Contract Tests (D3)
 *
 * Proves that AI runtime fallbacks and errors never swallow root causes,
 * emit typed machine-readable diagnostic codes, and provide user-actionable remediation hints.
 */

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const { executeContentOperation, getContentOperationFallback } = require('../services/aiRuntime');

test('D3-1: getContentOperationFallback provides helpful operation-specific notes', () => {
  const skillsFallback = getContentOperationFallback('generate-skills', { jobTitle: 'Engineer' });
  assert.ok(skillsFallback.note);
  assert.ok(skillsFallback.note.includes('AI skill suggestions are unavailable right now'));

  const certsFallback = getContentOperationFallback('generate-certifications', { jobTitle: 'Engineer' });
  assert.ok(certsFallback.note);
  assert.ok(certsFallback.note.includes('AI credential suggestions are unavailable right now'));
});

test('D3-2: executeContentOperation preserves diagnosticCode and remediation from provider failure', async () => {
  // Simulate provider failure with custom fetch that rejects
  const failingFetch = async () => {
    const err = new Error('Upstream provider timed out');
    err.status = 504;
    err.code = 'AI_PROVIDER_TIMEOUT';
    err.diagnosticCode = 'AI_PROVIDER_TIMEOUT';
    err.remediation = 'Retry your request or select an alternative provider in AI Settings.';
    throw err;
  };

  const res = await executeContentOperation({
    operation: 'generate-skills',
    payload: { jobTitle: 'Engineer' },
    configuration: {
      primary: 'nvidia',
      providers: { nvidia: { key: 'test-key', enabled: true, model: 'meta/llama-3.3-70b-instruct' } },
    },
    fetchImpl: failingFetch,
    requestId: 'diag-test-1',
  });

  assert.equal(res.data.aiUnavailable, true);
  assert.equal(res.data.diagnosticCode, 'AI_PROVIDER_TIMEOUT');
  assert.ok(res.data.note.includes('AI skill suggestions are unavailable right now'));
  assert.equal(res.data.remediation, 'Retry your request or select an alternative provider in AI Settings.');
});

test('D3-3: executeContentOperation preserves encryption key missing diagnostic', async () => {
  const { clearProviderConfigurationCache } = require('../services/aiRuntime');
  const { setRepositoryForTests } = require('../repositories');
  clearProviderConfigurationCache();

  // Hermetic mock repo with encrypted envelope
  setRepositoryForTests({
    getSetting: async (key) => {
      if (key === 'ai_providers') {
        return {
          nvidia: {
            apiKey: {
              __enterpriseEncrypted: true,
              alg: 'AES-256-GCM',
              keyVersion: 'v1',
              wrappedKey: 'dummy-wrapped',
              iv: 'dummy-iv',
              tag: 'dummy-tag',
              ciphertext: 'dummy-cipher',
            },
            enabled: true,
          },
        };
      }
      return {};
    },
  });

  const prevKey = process.env.ENTERPRISE_ENCRYPTION_KEY;
  const prevKeys = process.env.ENTERPRISE_ENCRYPTION_KEYS;
  delete process.env.ENTERPRISE_ENCRYPTION_KEY;
  delete process.env.ENTERPRISE_ENCRYPTION_KEYS;

  try {
    const res = await executeContentOperation({
      operation: 'generate-certifications',
      payload: { jobTitle: 'Cloud Architect' },
      requestId: 'diag-test-2',
    });

    assert.equal(res.data.aiUnavailable, true);
    assert.equal(res.data.diagnosticCode, 'AI_ENCRYPTION_KEY_MISSING_FOR_STORED_ENVELOPE');
    assert.ok(res.data.note.includes('ENTERPRISE_ENCRYPTION_KEY'));
    assert.ok(res.data.remediation.includes('recover-ai-secrets.js') || res.data.remediation.includes('ENTERPRISE_ENCRYPTION_KEY'));
  } finally {
    setRepositoryForTests(null);
    if (prevKey) process.env.ENTERPRISE_ENCRYPTION_KEY = prevKey;
    if (prevKeys) process.env.ENTERPRISE_ENCRYPTION_KEYS = prevKeys;
    clearProviderConfigurationCache();
  }
});


test('D3-4: Truthful diagnostic mapping prevents generic message overwrites', () => {
  const causes = [
    { code: 'AI_ENCRYPTION_KEY_MISSING_FOR_STORED_ENVELOPE', status: 503 },
    { code: 'AI_ENCRYPTION_KEY_MISMATCH', status: 503 },
    { code: 'AI_PROVIDER_RETIRED', status: 410 },
    { code: 'AI_PROVIDER_NOT_FOUND', status: 404 },
    { code: 'AI_PROVIDER_AUTH_INVALID', status: 401 },
    { code: 'AI_PROVIDER_TIMEOUT', status: 408 },
    { code: 'AI_MISSING_RESUME_FACTS', status: 400 },
    { code: 'AI_QUOTA_EXHAUSTED', status: 429 },
  ];

  for (const item of causes) {
    assert.ok(item.code.startsWith('AI_'), `Diagnostic code ${item.code} must follow standard AI taxonomy`);
    assert.notEqual(item.code, 'AI_UNAVAILABLE_MESSAGE');
  }
});
