'use strict';

const { DATA_PLANE_TYPES } = require('./constants');

function resolveTenantInfrastructure(context) {
  const plane = context?.dataPlane;
  if (!context?.tenantId || !plane || !DATA_PLANE_TYPES.includes(String(plane.type || '').toUpperCase()) || !plane.id || !plane.routingVersion) {
    throw Object.assign(new Error('Tenant infrastructure route is invalid'), { code: 'TENANT_ROUTE_INVALID', status: 503 });
  }
  return Object.freeze({
    tenantId: context.tenantId,
    workspaceId: context.workspaceId || null,
    dataPlaneId: String(plane.id),
    dataPlaneType: String(plane.type).toUpperCase(),
    routingVersion: Number(plane.routingVersion),
    region: String(plane.region),
    storageProfile: String(plane.storageProfile),
    cacheProfile: String(plane.cacheProfile),
    queueProfile: String(plane.queueProfile),
    aiProfile: String(plane.aiProfile),
    securityProfile: String(plane.securityProfile),
  });
}

function assertSameInfrastructureRoute(context, route) {
  const expected = resolveTenantInfrastructure(context);
  if (!route || route.tenantId !== expected.tenantId || route.dataPlaneId !== expected.dataPlaneId || Number(route.routingVersion) !== expected.routingVersion) {
    throw Object.assign(new Error('Tenant infrastructure route changed or mismatched'), { code: 'TENANT_ROUTE_MISMATCH', status: 409 });
  }
  return expected;
}

module.exports = { assertSameInfrastructureRoute, resolveTenantInfrastructure };
