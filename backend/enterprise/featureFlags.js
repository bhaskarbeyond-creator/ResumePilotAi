'use strict';

const { getFlagValue } = require('../services/featureFlagService');

/**
 * Server-side rollout flags are operational gates, never authorization decisions.
 * 
 * Synchronous version for middleware compatibility — reads from cache/env only.
 * The async version should be preferred when a db handle is available.
 */
function enterpriseFeatureEnabled(environment = process.env) {
  return String(environment.ENTERPRISE_TENANCY_ENABLED || '').toLowerCase() === 'true';
}

/**
 * Async version that checks Firestore-backed feature flags first.
 * Use this in route handlers where db is available.
 */
async function enterpriseFeatureEnabledAsync(db) {
  try {
    return await getFlagValue(db, 'ENTERPRISE_TENANCY_ENABLED');
  } catch {
    // Fallback to env if Firestore is unavailable
    return enterpriseFeatureEnabled();
  }
}

module.exports = { enterpriseFeatureEnabled, enterpriseFeatureEnabledAsync };
