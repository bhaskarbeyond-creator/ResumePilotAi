'use strict';

const { PostgresEnterpriseRepository } = require('./postgresEnterpriseRepository');
const { FirestoreEnterpriseRepository } = require('./firestoreEnterpriseRepository');
const { ENTERPRISE_DATA_PROVIDERS } = require('./constants');

/**
 * Enterprise data-access abstraction.
 *
 *   Enterprise services → EnterpriseRepository (this interface)
 *                          ├─ FirestoreEnterpriseRepository  (canonical, Firebase-native)
 *                          └─ PostgresEnterpriseRepository   (optional legacy adapter)
 *
 * Business logic never branches on the provider; it calls the repository with a
 * verified tenant context. The active provider is chosen once at startup from
 * ENTERPRISE_DATA_PROVIDER (default: firestore) and surfaced in startup logs,
 * health checks, and telemetry.
 */

const REQUIRED_METHODS = Object.freeze([
  'createResource',
  'getResource',
  'listResources',
  'updateResource',
  'deleteResource',
  'appendAuditEvent',
  'listAuditEvents',
  'recordAiUsage',
  'getAiUsageSummary',
  'ping',
]);

function assertRepositoryInterface(instance, providerName) {
  for (const method of REQUIRED_METHODS) {
    if (typeof instance[method] !== 'function') {
      throw Object.assign(new Error(`Enterprise repository "${providerName}" does not implement ${method}`), { code: 'ENTERPRISE_REPOSITORY_INVALID', status: 500 });
    }
  }
  return instance;
}

function normalizeProvider(value) {
  const provider = String(value || 'firestore').trim().toLowerCase();
  if (!ENTERPRISE_DATA_PROVIDERS.includes(provider)) {
    throw Object.assign(
      new Error(`Unknown ENTERPRISE_DATA_PROVIDER "${provider}"; supported: ${ENTERPRISE_DATA_PROVIDERS.join(', ')}`),
      { code: 'ENTERPRISE_DATA_PROVIDER_INVALID', status: 503 }
    );
  }
  return provider;
}

function createEnterpriseRepository({ environment = process.env, db = null, admin = null, encryptionProvider = undefined, pgPool = null } = {}) {
  const provider = normalizeProvider(environment.ENTERPRISE_DATA_PROVIDER);
  if (provider === 'postgres') {
    const databaseUrl = String(environment.TENANT_DATABASE_URL || '').trim();
    if (!databaseUrl && !pgPool) {
      throw Object.assign(
        new Error('ENTERPRISE_DATA_PROVIDER=postgres requires TENANT_DATABASE_URL; the Firestore provider needs no external database'),
        { code: 'ENTERPRISE_DATA_PROVIDER_UNAVAILABLE', status: 503 }
      );
    }
    return assertRepositoryInterface(
      new PostgresEnterpriseRepository({ pool: pgPool || null, connectionString: databaseUrl || null }),
      'postgres'
    );
  }
  if (!db) {
    throw Object.assign(new Error('Firestore enterprise repository requires an initialized Firebase/Firestore handle'), { code: 'ENTERPRISE_DATA_PLANE_UNAVAILABLE', status: 503 });
  }
  return assertRepositoryInterface(
    new FirestoreEnterpriseRepository({ db, admin, encryptionProvider: encryptionProvider === undefined ? null : encryptionProvider }),
    'firestore'
  );
}

module.exports = {
  REQUIRED_METHODS,
  assertRepositoryInterface,
  createEnterpriseRepository,
  normalizeProvider,
};
