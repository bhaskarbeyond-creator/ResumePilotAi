'use strict';

const express = require('express');
const { enterpriseFeatureEnabled } = require('../enterprise/featureFlags');
const { normalizeRequestedTenantId, normalizeRequestedWorkspaceId } = require('../enterprise/tenantContext');

const router = express.Router();

function apiKeyFromRequest(req) {
  const header = String(req.get('x-api-key') || '');
  if (!header) return null;
  return header.length <= 512 ? header : null;
}

router.use((req, res, next) => {
  if (!enterpriseFeatureEnabled()) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API route not found', requestId: res.locals?.requestId } });
  }
  return next();
});

router.get('/context', async (req, res) => {
  try {
    const service = req.app.get('tenantService');
    if (!service) throw Object.assign(new Error('Tenant service is unavailable'), { code: 'TENANT_CONTROL_PLANE_UNAVAILABLE', status: 503 });
    const authenticated = await service.authenticateServiceApiKey({
      apiKey: apiKeyFromRequest(req),
      requestedTenantId: normalizeRequestedTenantId(req.get('x-tenant-id') || req.query?.tenantId),
      requestedWorkspaceId: normalizeRequestedWorkspaceId(req.get('x-workspace-id') || req.query?.workspaceId),
      requestId: res.locals?.requestId,
    });
    res.setHeader('X-Tenant-Context', authenticated.context.tenantId);
    res.setHeader('X-Tenant-Routing-Version', String(authenticated.context.dataPlane.routingVersion));
    return res.json({
      actor: { type: 'service', id: authenticated.account.id, displayName: authenticated.account.displayName },
      context: {
        tenantId: authenticated.context.tenantId,
        workspaceId: authenticated.context.workspaceId,
        permissions: authenticated.context.permissions,
        dataPlane: authenticated.context.dataPlane,
      },
    });
  } catch (error) {
    const status = error.status || 401;
    return res.status(status).json({ error: { code: error.code || 'INVALID_SERVICE_API_KEY', message: status === 404 ? 'Service context was not found' : 'Service authentication failed', requestId: res.locals?.requestId } });
  }
});

module.exports = { enterpriseM2mRouter: router };
