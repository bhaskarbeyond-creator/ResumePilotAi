'use strict';

const { getFlagValue } = require('../services/featureFlagService');

/** Environment-only synchronous check for startup wiring. */
function enterpriseFeatureEnabled(environment = process.env) {
  return String(environment.ENTERPRISE_TENANCY_ENABLED || '').toLowerCase() === 'true';
}

/** Per-request check of the authoritative MariaDB-backed feature flag. */
async function enterpriseFeatureEnabledAsync() {
  return Boolean(await getFlagValue('ENTERPRISE_TENANCY_ENABLED'));
}

module.exports = { enterpriseFeatureEnabled, enterpriseFeatureEnabledAsync };
