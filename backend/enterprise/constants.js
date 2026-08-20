'use strict';

const TENANT_LIFECYCLE_STATES = Object.freeze([
  'PROVISIONING', 'ACTIVE', 'SUSPENDED', 'DELETING', 'DELETED'
]);

const ISOLATION_TIERS = Object.freeze([
  'STANDARD', 'ENTERPRISE', 'REGULATED'
]);

const DATA_PLANE_TYPES = Object.freeze([
  'SHARED_POSTGRES', 'DEDICATED_POSTGRES'
]);

const MEMBERSHIP_STATES = Object.freeze([
  'INVITED', 'ACTIVE', 'SUSPENDED', 'REMOVED'
]);

const TENANT_ROLES = Object.freeze({
  TENANT_OWNER: [
    '*'
  ],
  TENANT_ADMIN: [
    'tenant.read', 'tenant.settings.write', 'tenant.members.read', 'tenant.members.invite',
    'tenant.members.manage', 'tenant.roles.manage', 'tenant.workspaces.manage',
    'tenant.audit.read', 'tenant.security.read', 'tenant.security.manage',
    'tenant.ai.manage', 'tenant.integrations.manage', 'tenant.usage.read'
  ],
  BILLING_ADMIN: [
    'tenant.read', 'tenant.billing.read', 'tenant.billing.manage', 'tenant.usage.read'
  ],
  WORKSPACE_MANAGER: [
    'workspace.read', 'workspace.manage', 'workspace.members.manage', 'resource.read',
    'resource.create', 'resource.update', 'resource.share', 'ai.use'
  ],
  MEMBER: [
    'workspace.read', 'resource.read', 'resource.create', 'resource.update', 'ai.use'
  ],
  VIEWER: [
    'workspace.read', 'resource.read'
  ]
});

const PERMISSIONS = Object.freeze([
  'tenant.read', 'tenant.settings.write', 'tenant.members.read', 'tenant.members.invite',
  'tenant.members.manage', 'tenant.roles.manage', 'tenant.workspaces.manage',
  'tenant.audit.read', 'tenant.security.read', 'tenant.security.manage',
  'tenant.ai.manage', 'tenant.integrations.manage', 'tenant.usage.read',
  'tenant.billing.read', 'tenant.billing.manage', 'workspace.read', 'workspace.manage',
  'workspace.members.manage', 'resource.read', 'resource.create', 'resource.update',
  'resource.share', 'ai.use'
]);

module.exports = {
  DATA_PLANE_TYPES,
  ISOLATION_TIERS,
  MEMBERSHIP_STATES,
  PERMISSIONS,
  TENANT_LIFECYCLE_STATES,
  TENANT_ROLES,
};
