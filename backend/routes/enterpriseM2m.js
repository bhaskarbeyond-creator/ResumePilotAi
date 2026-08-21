'use strict';

const express = require('express');
const { enterpriseFeatureEnabled } = require('../enterprise/featureFlags');

const router = express.Router();

router.use((req, res, next) => {
  if (!enterpriseFeatureEnabled()) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API route not found', requestId: res.locals?.requestId } });
  }
  return next();
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
