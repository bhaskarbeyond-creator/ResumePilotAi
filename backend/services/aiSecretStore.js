'use strict';

// F-19: platform AI provider keys were stored verbatim in
// system_settings.ai_providers while tenant BYOK credentials already used
// AES-256-GCM envelope encryption (enterprise/encryptionProvider.js) — the
// same product treated tenant secrets better than platform secrets.
//
// This module is the single envelope boundary for the platform key store:
//   - encryptProviderSecrets: plaintext apiKey/apiKeys -> envelopes at rest
//     (opportunistic: when ENTERPRISE_ENCRYPTION_KEY(S) is configured; with
//     no key configured the legacy plaintext behaviour is preserved rather
//     than breaking keyless deployments — surfaced honestly via
//     getSecretEncryptionStatus).
//   - decryptProviderSecrets: envelopes -> plaintext IN MEMORY ONLY.
//     Lazy and fail-closed: the provider is constructed only when an
//     envelope is actually present, and a stored envelope that cannot be
//     decrypted (no/misconfigured key) throws AI_SECRET_ENCRYPTION_UNAVAILABLE
//     instead of silently serving ciphertext as a key.
// Legacy plaintext strings pass through both directions untouched, so every
// pre-existing store keeps working and migrates to envelopes on its next
// authorized save.

const { createEncryptionProvider, isEncryptedEnvelope } = require('../enterprise/encryptionProvider');

const SECRET_FIELDS = Object.freeze(['apiKey', 'apiKeys']);

function errorWith(code, message, status) {
  return Object.assign(new Error(message), { code, status });
}

/**
 * 'active' when the envelope provider is configured, 'misconfigured' when the
 * encryption environment is present but invalid, 'unavailable' when no key is
 * configured. Never throws — this is a status surface, not a crypto path.
 */
function getSecretEncryptionStatus(environment = process.env) {
  try {
    return createEncryptionProvider(environment) ? 'active' : 'unavailable';
  } catch {
    return 'misconfigured';
  }
}

function decryptSecretValue(value, providerRef) {
  if (!isEncryptedEnvelope(value)) return value;
  if (!providerRef.provider) {
    if (providerRef.failed) throw providerRef.failed;
    try {
      providerRef.provider = createEncryptionProvider(process.env);
    } catch (error) {
      providerRef.failed = error;
      throw error;
    }
    if (!providerRef.provider) {
      providerRef.failed = errorWith(
        'AI_SECRET_ENCRYPTION_UNAVAILABLE',
        'Stored AI provider secrets are envelope-encrypted but ENTERPRISE_ENCRYPTION_KEY(S) is not configured; refusing to serve ciphertext as a credential.',
        503,
      );
      throw providerRef.failed;
    }
  }
  return providerRef.provider.decryptValue(value);
}

/**
 * Returns a shallow-per-provider copy of the ai_providers store with every
 * envelope-encrypted apiKey/apiKeys field decrypted. Non-secret fields and
 * legacy plaintext values pass through unchanged.
 */
function decryptProviderSecrets(secrets) {
  if (!secrets || typeof secrets !== 'object') return secrets || {};
  const providerRef = { provider: null, failed: null };
  const decrypted = {};
  for (const [providerId, entry] of Object.entries(secrets)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      decrypted[providerId] = entry;
      continue;
    }
    let touched = false;
    const next = { ...entry };
    for (const field of SECRET_FIELDS) {
      if (field in next) {
        next[field] = decryptSecretValue(next[field], providerRef);
        touched = true;
      }
    }
    decrypted[providerId] = touched ? next : entry;
  }
  return decrypted;
}

/**
 * Returns a copy of the ai_providers store with plaintext apiKey/apiKeys
 * sealed in envelopes — when an encryption provider is configured. With no
 * provider (keyless deployment) the store is returned unchanged (legacy
 * plaintext contract; getSecretEncryptionStatus surfaces the state).
 */
function encryptProviderSecrets(secrets, environment = process.env) {
  if (!secrets || typeof secrets !== 'object') return secrets || {};
  const provider = createEncryptionProvider(environment);
  if (!provider) return secrets;
  const encrypted = {};
  for (const [providerId, entry] of Object.entries(secrets)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      encrypted[providerId] = entry;
      continue;
    }
    const next = { ...entry };
    if (typeof next.apiKey === 'string' && next.apiKey) {
      next.apiKey = provider.encryptValue(next.apiKey);
    }
    if (Array.isArray(next.apiKeys) && next.apiKeys.length > 0) {
      next.apiKeys = provider.encryptValue(next.apiKeys);
    }
    encrypted[providerId] = next;
  }
  return encrypted;
}

module.exports = {
  decryptProviderSecrets,
  encryptProviderSecrets,
  getSecretEncryptionStatus,
};
