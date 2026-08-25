'use strict';

const crypto = require('crypto');

/**
 * Enterprise encryption abstraction.
 *
 * Two provider kinds are defined by the architecture:
 *   1. ManagedKmsProvider  - an external key-management service. NOT implemented
 *      in this repository: no managed KMS is deployed for this environment and
 *      none is claimed. Selecting `kms` fails closed with an explicit error.
 *   2. ServerKeyProvider  - the implemented provider. Master keys live only in
 *      server-side environment configuration, are never sent to the frontend,
 *      and never appear in logs, tokens, or persisted documents. Every document
 *      is sealed with a unique data key using AES-256-GCM; the data key is
 *      itself wrapped by the active master key (envelope encryption), which is
 *      the same shape a managed-KMS provider would use, so providers stay
 *      interchangeable through configuration alone.
 *
 * Fail-closed contract: if encryption is required and no key is configured,
 * encrypt/decrypt throw ENTERPRISE_ENCRYPTION_UNAVAILABLE (503). The
 * application never silently stores plaintext where ciphertext is required.
 */

const ALGORITHM = 'AES-256-GCM';
const MASTER_KEY_BYTES = 32;
const KEY_VERSION_PATTERN = /^v[0-9]{1,4}$/;

function failClosed(message) {
  const error = new Error(message);
  error.code = 'ENTERPRISE_ENCRYPTION_UNAVAILABLE';
  error.status = 503;
  return error;
}

function parseMasterKey(version, raw) {
  const value = String(raw || '').trim();
  if (!value) throw failClosed(`Enterprise encryption key ${version} is empty`);
  let bytes = null;
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(value) && Buffer.byteLength(value) >= 43) {
    try { bytes = Buffer.from(value, 'base64'); } catch { bytes = null; }
  }
  if (!bytes && /^[0-9a-f]{64}$/i.test(value)) bytes = Buffer.from(value, 'hex');
  if (!bytes || bytes.length !== MASTER_KEY_BYTES) {
    throw failClosed(
      `Enterprise encryption key ${version} must be a base64- or hex-encoded 32-byte key (generate with: openssl rand -base64 32)`
    );
  }
  return bytes;
}

function parseKeyMap(environment = process.env) {
  const map = new Map();
  const bundled = String(environment.ENTERPRISE_ENCRYPTION_KEYS || '').trim();
  if (bundled) {
    let parsed;
    try { parsed = JSON.parse(bundled); } catch { throw failClosed('ENTERPRISE_ENCRYPTION_KEYS must be JSON: {"v1":"<base64 32-byte key>"}'); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw failClosed('ENTERPRISE_ENCRYPTION_KEYS must be a JSON object of version -> key');
    }
    for (const [version, key] of Object.entries(parsed)) {
      if (!KEY_VERSION_PATTERN.test(version)) throw failClosed(`Enterprise encryption key version ${version} must match v1..v9999`);
      map.set(version, parseMasterKey(version, key));
    }
  }
  const single = String(environment.ENTERPRISE_ENCRYPTION_KEY || '').trim();
  if (single) {
    const version = String(environment.ENTERPRISE_ENCRYPTION_KEY_VERSION || 'v1').trim();
    if (!KEY_VERSION_PATTERN.test(version)) throw failClosed('ENTERPRISE_ENCRYPTION_KEY_VERSION must match v1..v9999');
    if (map.has(version)) throw failClosed(`Enterprise encryption key ${version} is defined twice`);
    map.set(version, parseMasterKey(version, single));
  }
  return map;
}

function randomDataKey() {
  return crypto.randomBytes(32);
}

function sealWithMaster(masterKey, plaintextBytes) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
  const sealed = Buffer.concat([cipher.update(plaintextBytes), cipher.final()]);
  return { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ct: sealed.toString('base64') };
}

function openWithMaster(masterKey, { iv, tag, ct }) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, Buffer.from(String(iv || ''), 'base64'));
  decipher.setAuthTag(Buffer.from(String(tag || ''), 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(String(ct || ''), 'base64')), decipher.final()]);
}

class ServerKeyEncryptionProvider {
  constructor({ keys, activeVersion = null }) {
    if (!keys || !(keys instanceof Map) || keys.size === 0) {
      throw failClosed('Server-side encryption provider requires at least one 32-byte master key');
    }
    this.keys = keys;
    const versions = [...keys.keys()].sort();
    this.activeVersion = String(activeVersion || versions[versions.length - 1]);
    if (!keys.has(this.activeVersion)) {
      throw failClosed(`Active enterprise encryption key ${this.activeVersion} is not present in the configured key set`);
    }
  }

  get kind() { return 'server-key'; }

  describe() {
    return Object.freeze({
      provider: 'server-key',
      configured: true,
      algorithm: ALGORITHM,
      activeVersion: this.activeVersion,
      keyVersions: [...this.keys.keys()].sort(),
      // Honest capability statement: this is server-side envelope encryption,
      // not an external managed KMS with hardware-backed key custody.
      managedKms: false,
      securityLevel: 'SERVER_SIDE_MASTER_KEY_ENVELOPE_AES_256_GCM',
      keyRotationSupported: true,
    });
  }

  encryptValue(plaintext) {
    const serialized = Buffer.from(JSON.stringify(plaintext === undefined ? null : plaintext), 'utf8');
    const dataKey = randomDataKey();
    const wrapped = sealWithMaster(this.keys.get(this.activeVersion), dataKey);
    const payload = sealWithMaster(dataKey, serialized);
    return {
      __enterpriseEncrypted: true,
      alg: ALGORITHM,
      keyVersion: this.activeVersion,
      wrappedKey: `${wrapped.iv}.${wrapped.tag}.${wrapped.ct}`,
      iv: payload.iv,
      tag: payload.tag,
      ciphertext: payload.ct,
    };
  }

  decryptValue(envelope) {
    if (!envelope || envelope.__enterpriseEncrypted !== true || envelope.alg !== ALGORITHM) {
      throw Object.assign(new Error('Encrypted value envelope is invalid'), { code: 'ENTERPRISE_ENCRYPTION_CORRUPT', status: 500 });
    }
    const masterKey = this.keys.get(String(envelope.keyVersion || ''));
    if (!masterKey) {
      throw failClosed(`Enterprise encryption key ${envelope.keyVersion} is not configured; supply it via ENTERPRISE_ENCRYPTION_KEYS to read this data`);
    }
    const [wrappedIv, wrappedTag, wrappedCt] = String(envelope.wrappedKey || '').split('.');
    const dataKey = openWithMaster(masterKey, { iv: wrappedIv, tag: wrappedTag, ct: wrappedCt });
    const [iv, tag, ct] = [envelope.iv, envelope.tag, envelope.ciphertext];
    const decipher = crypto.createDecipheriv('aes-256-gcm', dataKey, Buffer.from(String(iv || ''), 'base64'));
    decipher.setAuthTag(Buffer.from(String(tag || ''), 'base64'));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(String(ct || ''), 'base64')), decipher.final()]);
    return JSON.parse(plaintext.toString('utf8'));
  }
}

class ManagedKmsProvider {
  constructor() {
    throw Object.assign(
      new Error('Managed KMS encryption provider is not implemented in this deployment; use the server-key provider (ENTERPRISE_ENCRYPTION_PROVIDER=server-key)'),
      { code: 'ENTERPRISE_ENCRYPTION_PROVIDER_UNAVAILABLE', status: 501 }
    );
  }
}

function createEncryptionProvider(environment = process.env) {
  const requested = String(environment.ENTERPRISE_ENCRYPTION_PROVIDER || 'server-key').trim().toLowerCase();
  if (requested === 'kms' || requested === 'managed-kms') {
    throw Object.assign(
      new Error('Managed KMS encryption provider is not implemented in this deployment; use the server-key provider (ENTERPRISE_ENCRYPTION_PROVIDER=server-key)'),
      { code: 'ENTERPRISE_ENCRYPTION_PROVIDER_UNAVAILABLE', status: 501 }
    );
  }
  if (requested !== 'server-key' && requested !== 'serverkey') {
    throw failClosed(`Unknown enterprise encryption provider "${requested}"; supported: server-key`);
  }
  const keys = parseKeyMap(environment);
  if (!keys.size) {
    // No provider is constructed when no key is configured. Callers must treat
    // this as "encryption unavailable" and fail closed on encrypted paths.
    return null;
  }
  return new ServerKeyEncryptionProvider({
    keys,
    activeVersion: String(environment.ENTERPRISE_ENCRYPTION_ACTIVE_KEY || '').trim() || null,
  });
}

function isEncryptedEnvelope(value) {
  return Boolean(value && typeof value === 'object' && value.__enterpriseEncrypted === true);
}

module.exports = {
  ALGORITHM,
  ManagedKmsProvider,
  ServerKeyEncryptionProvider,
  createEncryptionProvider,
  isEncryptedEnvelope,
};
