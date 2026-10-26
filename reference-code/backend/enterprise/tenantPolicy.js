'use strict';

const { PERMISSIONS, TENANT_ROLES } = require('./constants');

function normalizeRole(value) {
  const role = String(value || '').trim().toUpperCase();
  return Object.hasOwn(TENANT_ROLES, role) ? role : null;
}

function permissionsForRoles(roles = [], customRoles = {}) {
  const permissions = new Set();
  const definitions = customRoles && typeof customRoles === 'object' ? customRoles : {};
  for (const rawRole of roles) {
    const role = normalizeRole(rawRole);
    if (role) {
      for (const permission of TENANT_ROLES[role]) permissions.add(permission);
      continue;
    }
    // Tenant-defined custom role: contributes only its declared, whitelisted
    // permissions. Undefined custom roles contribute nothing (fail closed).
    const custom = definitions[String(rawRole || '').toUpperCase()];
    if (custom && Array.isArray(custom.permissions)) {
      for (const permission of custom.permissions) {
        if (PERMISSIONS.includes(permission)) permissions.add(permission);
      }
    }
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

// Some administrative operations are legitimately reachable through more than
// one permission (for example a TENANT_ADMIN holds tenant.workspaces.manage
// while a WORKSPACE_MANAGER holds workspace.manage). Authorization remains
// entirely server-side; this simply expresses an OR over declared permissions.
function requireAnyTenantPermission(...permissions) {
  return (req, res, next) => {
    const allowed = req.tenantContext && permissions.some(permission => hasTenantPermission(req.tenantContext, permission));
    if (!allowed) {
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
  requireAnyTenantPermission,
  requireTenantPermission,
};
