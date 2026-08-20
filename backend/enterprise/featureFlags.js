'use strict';

/** Server-side rollout flags are operational gates, never authorization decisions. */
function enterpriseFeatureEnabled(environment = process.env) {
  return String(environment.ENTERPRISE_TENANCY_ENABLED || '').toLowerCase() === 'true';
}

module.exports = { enterpriseFeatureEnabled };
