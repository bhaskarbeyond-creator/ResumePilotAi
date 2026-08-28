'use strict';

const { MySqlEnterpriseRepository } = require('./mysqlEnterpriseRepository');

const REQUIRED_METHODS = Object.freeze([
  'createResource', 'getResource', 'listResources', 'updateResource', 'deleteResource',
  'appendAuditEvent', 'listAuditEvents',
  'recordAiUsage', 'getAiUsageSummary', 'listAiUsageEvents', 'ping',
]);

function assertRepositoryInterface(instance) {
  for (const method of REQUIRED_METHODS) {
    if (typeof instance?.[method] !== 'function') {
      throw Object.assign(new Error(`Enterprise repository does not implement ${method}`), {
        code: 'ENTERPRISE_REPOSITORY_INVALID', status: 500,
      });
    }
  }
  return instance;
}

function normalizeProvider(value) {
  const provider = String(value || 'mysql').trim().toLowerCase();
  if (!['mysql', 'mariadb'].includes(provider)) {
    throw Object.assign(new Error('Enterprise application data is owned by MariaDB and cannot be routed to another provider.'), {
      code: 'ENTERPRISE_DATA_PROVIDER_IMMUTABLE', status: 503,
    });
  }
  return 'mysql';
}

function createEnterpriseRepository({ environment = process.env, pool = null, encryptionProvider = null } = {}) {
  normalizeProvider(environment.ENTERPRISE_DATA_PROVIDER || 'mysql');
  return assertRepositoryInterface(new MySqlEnterpriseRepository({ pool, encryptionProvider }));
}

module.exports = { REQUIRED_METHODS, assertRepositoryInterface, createEnterpriseRepository, normalizeProvider };
