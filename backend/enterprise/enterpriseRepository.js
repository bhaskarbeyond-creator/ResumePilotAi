'use strict';

const { MySqlEnterpriseRepository } = require('./mysqlEnterpriseRepository');
const { FirestoreEnterpriseRepository } = require('./firestoreEnterpriseRepository');

/**
 * Enterprise data-access abstraction.
 *
 *   Enterprise services → EnterpriseRepository (this interface)
 *                          ├─ MySqlEnterpriseRepository (authoritative, primary)
 *                          └─ FirestoreEnterpriseRepository (legacy)
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
  'listAiUsageEvents',
  'ping',
]);

function assertRepositoryInterface(instance) {
  for (const method of REQUIRED_METHODS) {
    if (typeof instance[method] !== 'function') {
      throw Object.assign(new Error(`Enterprise repository does not implement ${method}`), { code: 'ENTERPRISE_REPOSITORY_INVALID', status: 500 });
    }
  }
  return instance;
}

function normalizeProvider(value) {
  const provider = String(value || 'mysql').trim().toLowerCase();
  if (provider !== 'mysql' && provider !== 'firestore') {
    throw Object.assign(
      new Error(`"${provider}" is not an available enterprise data provider: Firestore is the only enterprise data plane`),
      { code: 'ENTERPRISE_DATA_PROVIDER_INVALID', status: 503 }
    );
  }
  return provider;
}

function createEnterpriseRepository({ environment = process.env, pool = null, db = null, admin = null, encryptionProvider = null } = {}) {
  const provider = normalizeProvider(environment.ENTERPRISE_DATA_PROVIDER || 'mysql');
  if (provider === 'mysql') {
    return assertRepositoryInterface(new MySqlEnterpriseRepository({ pool, encryptionProvider }));
  }
  if (!db) {
    throw Object.assign(new Error('The Firestore enterprise repository requires an initialized Firebase/Firestore handle'), { code: 'ENTERPRISE_DATA_PLANE_UNAVAILABLE', status: 503 });
  }
  return assertRepositoryInterface(new FirestoreEnterpriseRepository({ db, admin, encryptionProvider }));
}

module.exports = {
  REQUIRED_METHODS,
  assertRepositoryInterface,
  createEnterpriseRepository,
  normalizeProvider,
};
