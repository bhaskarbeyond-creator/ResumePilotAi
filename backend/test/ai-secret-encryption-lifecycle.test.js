'use strict';

/**
 * Deliverable 1: AI Provider Secret Encryption Lifecycle & Diagnostic Contract Suite
 *
 * Verifies:
 *   1. Envelope present + no key -> AI_ENCRYPTION_KEY_MISSING_FOR_STORED_ENVELOPE (503)
 *   2. Envelope present + correct key -> decrypts cleanly in memory
 *   3. Envelope present + wrong key -> AI_ENCRYPTION_KEY_MISMATCH (503)
 *   4. Plaintext mode -> returns plaintext without throwing, diagnosticCode: AI_SECRETS_PLAINTEXT
 *   5. Empty store -> diagnosticCode: AI_SECRETS_EMPTY
 *   6. inspectSecretStore returns complete deterministic diagnostic without throwing
 */

process.env.NODE_ENV = 'test';
process.env.FREELMAPI_METRICS_DB = ':memory:';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const {
  decryptProviderSecrets,
  encryptProviderSecrets,
  inspectSecretStore,
} = require('../services/aiSecretStore');

const KEY_V1 = crypto.createHash('sha256').update('v1-master-test-key').digest('base64');
const KEY_WRONG = crypto.createHash('sha256').update('wrong-master-key-xyz').digest('base64');
const PLAINTEXT_SECRET = 'sk-real-test-token-12345';

test('D1-1: inspectSecretStore returns AI_SECRETS_EMPTY on empty or null input', () => {
  const diag1 = inspectSecretStore(null);
  assert.equal(diag1.mode, 'empty');
  assert.equal(diag1.diagnosticCode, 'AI_SECRETS_EMPTY');
  assert.equal(diag1.envelopeCount, 0);
  assert.equal(diag1.remediation, null);

  const diag2 = inspectSecretStore({});
  assert.equal(diag2.mode, 'empty');
  assert.equal(diag2.diagnosticCode, 'AI_SECRETS_EMPTY');
});

test('D1-2: Plaintext store returns AI_SECRETS_PLAINTEXT with 0 envelopes', () => {
  const secrets = {
    nvidia: { apiKey: PLAINTEXT_SECRET, model: 'meta/llama-3.3-70b-instruct' },
  };
  const diag = inspectSecretStore(secrets);
  assert.equal(diag.mode, 'plaintext');
  assert.equal(diag.status, 'healthy');
  assert.equal(diag.diagnosticCode, 'AI_SECRETS_PLAINTEXT');
  assert.equal(diag.hasPlaintextKeys, true);
  assert.equal(diag.hasEncryptedEnvelopes, false);
  assert.equal(diag.envelopeCount, 0);
  assert.equal(diag.plaintextCount, 1);
  assert.equal(diag.remediation, null);

  // Decryption of plaintext returns identical object in memory
  const decrypted = decryptProviderSecrets(secrets);
  assert.equal(decrypted.nvidia.apiKey, PLAINTEXT_SECRET);
});

test('D1-3: Envelope present + no key returns AI_ENCRYPTION_KEY_MISSING_FOR_STORED_ENVELOPE', () => {
  const envWithKey = { ENTERPRISE_ENCRYPTION_KEY: KEY_V1, ENTERPRISE_ENCRYPTION_KEY_VERSION: 'v1' };
  const encrypted = encryptProviderSecrets({
    nvidia: { apiKey: PLAINTEXT_SECRET },
    groq: { apiKeys: ['key-a', 'key-b'] },
  }, envWithKey);

  assert.equal(Boolean(encrypted.nvidia.apiKey.__enterpriseEncrypted), true);

  // 1. Diagnostic inspection without throwing
  const diag = inspectSecretStore(encrypted, {});
  assert.equal(diag.mode, 'encrypted');
  assert.equal(diag.status, 'blocked_missing_key');
  assert.equal(diag.diagnosticCode, 'AI_ENCRYPTION_KEY_MISSING_FOR_STORED_ENVELOPE');
  assert.equal(diag.encryptionConfigured, false);
  assert.equal(diag.envelopeCount, 2);
  assert.ok(diag.remediation.includes('Set ENTERPRISE_ENCRYPTION_KEY'));

  // 2. Execution throw fails closed with specific diagnostic details
  const prevKey = process.env.ENTERPRISE_ENCRYPTION_KEY;
  const prevKeys = process.env.ENTERPRISE_ENCRYPTION_KEYS;
  delete process.env.ENTERPRISE_ENCRYPTION_KEY;
  delete process.env.ENTERPRISE_ENCRYPTION_KEYS;

  try {
    assert.throws(
      () => decryptProviderSecrets(encrypted),
      (err) => {
        assert.equal(err.code, 'AI_SECRET_ENCRYPTION_UNAVAILABLE');
        assert.equal(err.diagnosticCode, 'AI_ENCRYPTION_KEY_MISSING_FOR_STORED_ENVELOPE');
        assert.equal(err.status, 503);
        assert.equal(err.keyVersion, 'v1');
        assert.ok(err.message.includes('remediation') || err.message.includes('ENTERPRISE_ENCRYPTION_KEY'));
        return true;
      }
    );
  } finally {
    if (prevKey !== undefined) process.env.ENTERPRISE_ENCRYPTION_KEY = prevKey;
    if (prevKeys !== undefined) process.env.ENTERPRISE_ENCRYPTION_KEYS = prevKeys;
  }
});

test('D1-4: Envelope present + correct key cleanly decrypts in memory', () => {
  const envWithKey = { ENTERPRISE_ENCRYPTION_KEY: KEY_V1, ENTERPRISE_ENCRYPTION_KEY_VERSION: 'v1' };
  const encrypted = encryptProviderSecrets({
    nvidia: { apiKey: PLAINTEXT_SECRET },
  }, envWithKey);

  const diag = inspectSecretStore(encrypted, envWithKey);
  assert.equal(diag.mode, 'encrypted');
  assert.equal(diag.status, 'healthy');
  assert.equal(diag.diagnosticCode, 'AI_SECRETS_ENCRYPTED_VALID');
  assert.equal(diag.remediation, null);

  const prevKey = process.env.ENTERPRISE_ENCRYPTION_KEY;
  process.env.ENTERPRISE_ENCRYPTION_KEY = KEY_V1;

  try {
    const decrypted = decryptProviderSecrets(encrypted);
    assert.equal(decrypted.nvidia.apiKey, PLAINTEXT_SECRET);
  } finally {
    if (prevKey !== undefined) process.env.ENTERPRISE_ENCRYPTION_KEY = prevKey;
    else delete process.env.ENTERPRISE_ENCRYPTION_KEY;
  }
});

test('D1-5: Envelope present + wrong key throws AI_ENCRYPTION_KEY_MISMATCH', () => {
  const envWithKey = { ENTERPRISE_ENCRYPTION_KEY: KEY_V1, ENTERPRISE_ENCRYPTION_KEY_VERSION: 'v1' };
  const envWithWrongKey = { ENTERPRISE_ENCRYPTION_KEY: KEY_WRONG, ENTERPRISE_ENCRYPTION_KEY_VERSION: 'v1' };

  const encrypted = encryptProviderSecrets({
    nvidia: { apiKey: PLAINTEXT_SECRET },
  }, envWithKey);

  // 1. Diagnostic inspect detects mismatch
  const diag = inspectSecretStore(encrypted, envWithWrongKey);
  assert.equal(diag.status, 'blocked_mismatched_key');
  assert.equal(diag.diagnosticCode, 'AI_ENCRYPTION_KEY_MISMATCH');
  assert.ok(diag.remediation.includes('Key mismatch detected'));

  // 2. Execution throw gives AI_ENCRYPTION_KEY_MISMATCH
  const prevKey = process.env.ENTERPRISE_ENCRYPTION_KEY;
  process.env.ENTERPRISE_ENCRYPTION_KEY = KEY_WRONG;

  try {
    assert.throws(
      () => decryptProviderSecrets(encrypted),
      (err) => {
        assert.equal(err.code, 'AI_ENCRYPTION_KEY_MISMATCH');
        assert.equal(err.diagnosticCode, 'AI_ENCRYPTION_KEY_MISMATCH');
        assert.equal(err.status, 503);
        assert.ok(err.message.includes('does not match the key used to seal the credential'));
        return true;
      }
    );
  } finally {
    if (prevKey !== undefined) process.env.ENTERPRISE_ENCRYPTION_KEY = prevKey;
    else delete process.env.ENTERPRISE_ENCRYPTION_KEY;
  }
});
