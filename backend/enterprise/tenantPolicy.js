'use strict';

const { PERMISSIONS, TENANT_ROLES } = require('./constants');

function normalizeRole(value) {
  const role = String(value || '').trim().toUpperCase();
  return Object.hasOwn(TENANT_ROLES, role) ? role : null;
}

function permissionsForRoles(roles = []) {
  const permissions = new Set();
  for (const rawRole of roles) {
    const role = normalizeRole(rawRole);
    if (!role) continue;
    for (const permission of TENANT_ROLES[role]) permissions.add(permission);
  }
  return permissions;
}

function hasTenantPermission(context, permission) {
  if (!PERMISSIONS.includes(permission)) return false;
  const granted = new Set([...(context?.permissions || []), ...permissionsForRoles(context?.roles || [])]);
  return granted.has('*') || granted.has(permission);
}

function requireTenantPermission(permission) {
  return (req, res, next) => {
    if (!req.tenantContext || !hasTenantPermission(req.tenantContext, permission)) {
      return res.status(403).json({
        error: {
          code: 'TENANT_FORBIDDEN',
          message: 'The active tenant role does not allow this action.',
          requestId: res.locals?.requestId,
        }
      });
    }
    return next();
  };
}

function assertSameTenant(context, resource) {
  if (!context?.tenantId || !resource?.tenantId || String(context.tenantId) !== String(resource.tenantId)) {
    const error = new Error('Resource is not available in the active tenant');
    error.code = 'TENANT_RESOURCE_NOT_FOUND';
    error.status = 404;
    throw error;
  }
  if (resource.workspaceId && context.workspaceId && String(context.workspaceId) !== String(resource.workspaceId)) {
    const error = new Error('Resource is not available in the active workspace');
    error.code = 'WORKSPACE_RESOURCE_NOT_FOUND';
    error.status = 404;
    throw error;
  }
  return true;
}

module.exports = {
  assertSameTenant,
  hasTenantPermission,
  permissionsForRoles,
  requireTenantPermission,
};
