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

function errorWith(code, message, status, extra = {}) {
  return Object.assign(new Error(message), { code, status, ...extra });
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

function countSecretStoreEntries(secrets) {
  let envelopeCount = 0;
  let plaintextCount = 0;
  const keyVersions = new Set();

  for (const entry of Object.values(secrets)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    for (const field of SECRET_FIELDS) {
      const val = entry[field];
      if (!val) continue;
      if (isEncryptedEnvelope(val)) {
        envelopeCount++;
        if (val.keyVersion) keyVersions.add(String(val.keyVersion));
      } else if (typeof val === 'string' && val.trim().length > 0) {
        plaintextCount++;
      } else if (Array.isArray(val) && val.length > 0) {
        plaintextCount += val.length;
      }
    }
  }

  return {
    envelopeCount,
    plaintextCount,
    versionList: [...keyVersions].sort((a, b) => a.localeCompare(b)),
  };
}

function testDecryptEnvelopes(secrets, provider) {
  for (const entry of Object.values(secrets)) {
    if (!entry || typeof entry !== 'object') continue;
    for (const field of SECRET_FIELDS) {
      const val = entry[field];
      if (isEncryptedEnvelope(val)) {
        try {
          provider.decryptValue(val);
        } catch {
          return false;
        }
      }
    }
  }
  return true;
}

/**
 * Deterministic diagnostic inspection of stored secrets vs environment keys.
 * Never throws — surfaces health state, envelope counts, and actionable remediation.
 */
function inspectSecretStore(secrets, environment = process.env) {
  if (!secrets || typeof secrets !== 'object') {
    return {
      mode: 'empty',
      status: 'healthy',
      diagnosticCode: 'AI_SECRETS_EMPTY',
      hasEncryptedEnvelopes: false,
      hasPlaintextKeys: false,
      encryptionConfigured: Boolean(createEncryptionProvider(environment)),
      envelopeCount: 0,
      plaintextCount: 0,
      keyVersions: [],
      remediation: null,
    };
  }

  const { envelopeCount, plaintextCount, versionList } = countSecretStoreEntries(secrets);

  let provider = null;
  try {
    provider = createEncryptionProvider(environment);
  } catch {
    provider = null;
  }

  const encryptionConfigured = Boolean(provider);

  if (envelopeCount > 0 && !encryptionConfigured) {
    return {
      mode: 'encrypted',
      status: 'blocked_missing_key',
      diagnosticCode: 'AI_ENCRYPTION_KEY_MISSING_FOR_STORED_ENVELOPE',
      hasEncryptedEnvelopes: true,
      hasPlaintextKeys: plaintextCount > 0,
      encryptionConfigured: false,
      envelopeCount,
      plaintextCount,
      keyVersions: versionList,
      remediation: 'Set ENTERPRISE_ENCRYPTION_KEY in .env, or run node scripts/recover-ai-secrets.js --to-plaintext',
    };
  }

  if (envelopeCount > 0 && encryptionConfigured) {
    const canDecrypt = testDecryptEnvelopes(secrets, provider);
    if (!canDecrypt) {
      return {
        mode: 'encrypted',
        status: 'blocked_mismatched_key',
        diagnosticCode: 'AI_ENCRYPTION_KEY_MISMATCH',
        hasEncryptedEnvelopes: true,
        hasPlaintextKeys: plaintextCount > 0,
        encryptionConfigured: true,
        envelopeCount,
        plaintextCount,
        keyVersions: versionList,
        remediation: 'Configured ENTERPRISE_ENCRYPTION_KEY cannot decrypt stored envelope. Key mismatch detected.',
      };
    }

    return {
      mode: 'encrypted',
      status: 'healthy',
      diagnosticCode: 'AI_SECRETS_ENCRYPTED_VALID',
      hasEncryptedEnvelopes: true,
      hasPlaintextKeys: plaintextCount > 0,
      encryptionConfigured: true,
      envelopeCount,
      plaintextCount,
      keyVersions: versionList,
      remediation: null,
    };
  }

  if (plaintextCount > 0) {
    return {
      mode: 'plaintext',
      status: 'healthy',
      diagnosticCode: 'AI_SECRETS_PLAINTEXT',
      hasEncryptedEnvelopes: false,
      hasPlaintextKeys: true,
      encryptionConfigured,
      envelopeCount: 0,
      plaintextCount,
      keyVersions: [],
      remediation: null,
    };
  }

  return {
    mode: 'empty',
    status: 'healthy',
    diagnosticCode: 'AI_SECRETS_EMPTY',
    hasEncryptedEnvelopes: false,
    hasPlaintextKeys: false,
    encryptionConfigured,
    envelopeCount: 0,
    plaintextCount: 0,
    keyVersions: [],
    remediation: null,
  };
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
        `Stored AI provider secrets are envelope-encrypted (keyVersion: ${value.keyVersion || 'unknown'}) but ENTERPRISE_ENCRYPTION_KEY(S) is not configured; refusing to serve ciphertext as a credential. Remediation: Set ENTERPRISE_ENCRYPTION_KEY in .env, or run 'node scripts/recover-ai-secrets.js --to-plaintext' to recover plaintext operation.`,
        503,
        {
          diagnosticCode: 'AI_ENCRYPTION_KEY_MISSING_FOR_STORED_ENVELOPE',
          keyVersion: value.keyVersion || 'unknown',
          remediation: 'Set ENTERPRISE_ENCRYPTION_KEY in .env, or run node scripts/recover-ai-secrets.js --to-plaintext',
        }
      );
      throw providerRef.failed;
    }
  }
  try {
    return providerRef.provider.decryptValue(value);
  } catch (error) {
    if (error.code === 'ENTERPRISE_ENCRYPTION_CORRUPT' || error.code === 'ENTERPRISE_ENCRYPTION_UNAVAILABLE') {
      throw error;
    }
    throw errorWith(
      'AI_ENCRYPTION_KEY_MISMATCH',
      `Stored AI provider secret envelope (keyVersion: ${value.keyVersion || 'unknown'}) could not be decrypted with configured ENTERPRISE_ENCRYPTION_KEY. The encryption key does not match the key used to seal the credential.`,
      503,
      {
        diagnosticCode: 'AI_ENCRYPTION_KEY_MISMATCH',
        keyVersion: value.keyVersion || 'unknown',
        remediation: 'Verify ENTERPRISE_ENCRYPTION_KEY matches the key version used when credentials were saved',
      }
    );
  }
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
  inspectSecretStore,
};
