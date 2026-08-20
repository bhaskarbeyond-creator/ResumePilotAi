'use strict';

const { FirestoreEnterpriseRepository } = require('./firestoreEnterpriseRepository');

/**
 * Enterprise data-access abstraction.
 *
 *   Enterprise services → EnterpriseRepository (this interface)
 *                          └─ FirestoreEnterpriseRepository (canonical, only)
 *
 * Firestore is the single enterprise data plane. There is no PostgreSQL
 * adapter, no provider branching in business logic, and no configuration that
 * can select another store: the optional PostgreSQL adapter was removed
 * outright rather than hidden behind a flag. Setting ENTERPRISE_DATA_PROVIDER
 * to anything else fails closed with an explicit error.
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

function assertRepositoryInterface(instance) {
  for (const method of REQUIRED_METHODS) {
    if (typeof instance[method] !== 'function') {
      throw Object.assign(new Error(`Enterprise repository does not implement ${method}`), { code: 'ENTERPRISE_REPOSITORY_INVALID', status: 500 });
    }
  }
  return instance;
}

function normalizeProvider(value) {
  const provider = String(value || 'firestore').trim().toLowerCase();
  if (provider !== 'firestore') {
    throw Object.assign(
      new Error(`"${provider}" is not an available enterprise data provider: Firestore is the only enterprise data plane`),
      { code: 'ENTERPRISE_DATA_PROVIDER_INVALID', status: 503 }
    );
  }
  return provider;
}

function createEnterpriseRepository({ environment = process.env, db = null, admin = null, encryptionProvider = null } = {}) {
  normalizeProvider(environment.ENTERPRISE_DATA_PROVIDER);
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
