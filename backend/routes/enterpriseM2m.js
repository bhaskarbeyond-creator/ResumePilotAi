'use strict';

const express = require('express');
const { enterpriseFeatureEnabledAsync } = require('../enterprise/featureFlags');

const router = express.Router();

router.use(async (req, res, next) => {
  try {
    if (!await enterpriseFeatureEnabledAsync(req.app.get('db'))) {
      return res.status(404).json({ error: { code: 'ENTERPRISE_DISABLED', message: 'Enterprise tenancy is disabled for this deployment.', configurationState: 'DISABLED', requestId: res.locals?.requestId } });
    }
    return next();
  } catch (_) {
    return res.status(503).json({ error: { code: 'ENTERPRISE_FLAG_UNAVAILABLE', message: 'Enterprise rollout state could not be determined.', configurationState: 'UNKNOWN', requestId: res.locals?.requestId } });
  }
});

// The service principal was already authenticated and bound to its tenant and
// workspace by the enterprise API boundary; this route echoes the resolved,
// server-derived context. Nothing here trusts client-supplied identity values.
router.get('/context', (req, res) => {
  const authenticated = req.serviceAuth;
  if (!authenticated) {
    return res.status(401).json({ error: { code: 'INVALID_SERVICE_API_KEY', message: 'Service authentication failed', requestId: res.locals?.requestId } });
  }
  const { context, account } = authenticated;
  res.setHeader('X-Tenant-Context', context.tenantId);
  res.setHeader('X-Tenant-Routing-Version', String(context.dataPlane.routingVersion));
  return res.json({
    actor: { type: 'service', id: account.id, displayName: account.displayName },
    context: {
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      workspaceScope: context.workspaceScope,
      permissions: context.permissions,
      dataPlane: context.dataPlane,
    },
  });
});

module.exports = { enterpriseM2mRouter: router };
