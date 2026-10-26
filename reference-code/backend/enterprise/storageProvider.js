'use strict';

const { assertStorageContext, tenantObjectKey } = require('./tenantStorage');

/**
 * Enterprise storage abstraction. Artifact keys stay tenant/workspace/resource
 * scoped (tenantStorage.js) and access is mediated by purpose-bound signed
 * tokens (tenantSignedArtifacts.js); this module abstracts the object-store
 * backend so enterprise code is not coupled to one provider.
 *
 * Implemented providers:
 *   - firebase-storage  (Firebase Storage / Google Cloud Storage via the
 *                        Firebase Admin SDK — the Hostinger + Firebase default)
 * Planned providers (not implemented, not claimed):
 *   - s3, r2            (S3-compatible / Cloudflare R2 credential adapters)
 */

const SUPPORTED_PROVIDERS = Object.freeze(['firebase-storage', 's3', 'r2']);

class FirebaseStorageProvider {
  constructor({ bucket = null, bucketName = null } = {}) {
    if (!bucket && !bucketName) {
      throw Object.assign(new Error('Firebase storage provider requires a storage bucket handle or name'), { code: 'ENTERPRISE_STORAGE_UNAVAILABLE', status: 503 });
    }
    this.bucket = bucket;
    this.bucketName = bucketName;
    this.providerName = 'firebase-storage';
  }

  async resolveBucket() {
    if (this.bucket) return this.bucket;
    const admin = require('../services/firebaseAdmin');
    if (typeof admin?.storage !== 'function') {
      throw Object.assign(new Error('Firebase storage is unavailable because the admin runtime is not initialized'), { code: 'ENTERPRISE_STORAGE_UNAVAILABLE', status: 503 });
    }
    this.bucket = admin.storage().bucket(this.bucketName);
    return this.bucket;
  }

  assertScopedKey(context, objectKey) {
    return assertStorageContext(context, objectKey);
  }

  async save({ context, objectKey, data, contentType = 'application/octet-stream' }) {
    this.assertScopedKey(context, objectKey);
    const bucket = await this.resolveBucket();
    const file = bucket.file(objectKey);
    await file.save(data, { contentType, resumable: false });
    return { objectKey, size: Buffer.byteLength(data) };
  }

  async load({ context, objectKey }) {
    this.assertScopedKey(context, objectKey);
    const bucket = await this.resolveBucket();
    const [contents] = await bucket.file(objectKey).download();
    return contents;
  }

  async exists({ context, objectKey }) {
    this.assertScopedKey(context, objectKey);
    const bucket = await this.resolveBucket();
    const [exists] = await bucket.file(objectKey).exists();
    return exists;
  }

  async remove({ context, objectKey }) {
    this.assertScopedKey(context, objectKey);
    const bucket = await this.resolveBucket();
    await bucket.file(objectKey).delete({ ignoreNotFound: true });
    return true;
  }

  describe() {
    return Object.freeze({ provider: this.providerName, bucket: this.bucketName || null, implemented: true });
  }
}

class S3CompatibleStorageProvider {
  constructor({ providerName = 's3' }) {
    throw Object.assign(
      new Error(`${providerName} storage provider is not implemented in this deployment; configure ENTERPRISE_STORAGE_PROVIDER=firebase-storage`),
      { code: 'ENTERPRISE_STORAGE_PROVIDER_UNAVAILABLE', status: 501 }
    );
  }
}

function createStorageProvider({ environment = process.env, bucket = null } = {}) {
  const provider = String(environment.ENTERPRISE_STORAGE_PROVIDER || 'firebase-storage').trim().toLowerCase();
  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    throw Object.assign(
      new Error(`Unknown ENTERPRISE_STORAGE_PROVIDER "${provider}"; supported: ${SUPPORTED_PROVIDERS.join(', ')}`),
      { code: 'ENTERPRISE_STORAGE_PROVIDER_INVALID', status: 503 }
    );
  }
  if (provider === 'firebase-storage') {
    const bucketName = String(environment.ENTERPRISE_STORAGE_BUCKET || environment.FIREBASE_STORAGE_BUCKET || '').trim() || null;
    return new FirebaseStorageProvider({ bucket, bucketName });
  }
  return new S3CompatibleStorageProvider({ providerName: provider });
}

module.exports = {
  FirebaseStorageProvider,
  SUPPORTED_PROVIDERS,
  createStorageProvider,
  tenantObjectKey,
};
