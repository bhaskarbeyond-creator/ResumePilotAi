'use strict';

const crypto = require('crypto');
const {
  DATA_PLANE_TYPES,
  ISOLATION_TIERS,
  MEMBERSHIP_STATES,
  PERMISSIONS,
  TENANT_LIFECYCLE_STATES,
  TENANT_ROLES,
} = require('../../enterprise/constants');
const { assertTenantTransition } = require('../../enterprise/tenantLifecycle');
const {
  assertPrincipalId,
  assertUuid,
  canonicalPrincipalId,
  stablePrincipalHash,
} = require('../../enterprise/tenantContext');

const DEFAULT_DATA_PLANE = Object.freeze({
  id: 'mysql-primary',
  type: 'MYSQL',
  region: 'default',
  routingVersion: 1,
  storageProfile: 'shared',
  cacheProfile: 'shared',
  queueProfile: 'mysql-transactional-outbox',
  aiProfile: 'platform-default',
  securityProfile: 'standard',
});

function compact(value, max = 160) {
  return Array.from(String(value || ''), character => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? '' : character;
  }).join('').trim().slice(0, max);
}

function normalizeTier(value) {
  const tier = String(value || 'STANDARD').toUpperCase();
  if (!ISOLATION_TIERS.includes(tier)) throw Object.assign(new Error('Unsupported isolation tier'), { code: 'INVALID_TENANT_TIER', status: 400 });
  return tier;
}

function normalizeDataPlane(input = {}) {
  const type = String(input.type || DEFAULT_DATA_PLANE.type).toUpperCase();
  const planeId = compact(input.id || DEFAULT_DATA_PLANE.id, 120);
  if (!DATA_PLANE_TYPES.includes(type) || planeId !== DEFAULT_DATA_PLANE.id) {
    throw Object.assign(new Error('Enterprise data ownership is immutable and assigned to MariaDB'), {
      code: 'ENTERPRISE_DATA_OWNER_IMMUTABLE', status: 409,
    });
  }
  return {
    id: planeId,
    type,
    region: compact(input.region || DEFAULT_DATA_PLANE.region, 80),
    routingVersion: Math.max(1, Number(input.routingVersion || DEFAULT_DATA_PLANE.routingVersion)),
    storageProfile: compact(input.storageProfile || DEFAULT_DATA_PLANE.storageProfile, 120),
    cacheProfile: compact(input.cacheProfile || DEFAULT_DATA_PLANE.cacheProfile, 120),
    queueProfile: compact(input.queueProfile || DEFAULT_DATA_PLANE.queueProfile, 120),
    aiProfile: compact(input.aiProfile || DEFAULT_DATA_PLANE.aiProfile, 120),
    securityProfile: compact(input.securityProfile || DEFAULT_DATA_PLANE.securityProfile, 120),
  };
}

const CUSTOM_ROLE_PATTERN = /^CUSTOM_[A-Z0-9_]{2,28}$/;

function normalizeRoles(roles = [], extraRoles = []) {
  const known = new Set([...Object.keys(TENANT_ROLES), ...extraRoles.map(role => String(role || '').toUpperCase())]);
  const normalized = [...new Set((Array.isArray(roles) ? roles : []).map(role => String(role || '').toUpperCase()).filter(role => known.has(role)))];
  if (!normalized.length) throw Object.assign(new Error('At least one valid tenant role is required'), { code: 'INVALID_TENANT_ROLE', status: 400 });
  return normalized;
}

// Normalizes tenant-defined custom roles stored inside the tenant configuration.
// Returns a frozen { id: { label, permissions } } map; invalid entries are
// dropped rather than corrupting authorization for the whole tenant.
function normalizeCustomRoles(customRoles, existing = {}) {
  let source = null;
  if (Array.isArray(customRoles)) {
    source = customRoles;
  } else if (customRoles && typeof customRoles === 'object') {
    source = Object.entries(customRoles).map(([id, def]) => ({
      id,
      label: def?.label || id,
      permissions: Array.isArray(def?.permissions) ? def.permissions : (Array.isArray(def) ? def : []),
    }));
  }
  if (!source) {
    if (existing?.customRoles && typeof existing.customRoles === 'object') {
      return normalizeCustomRoles(existing.customRoles);
    }
    return Object.freeze({});
  }
  const normalized = {};
  for (const entry of source.slice(0, 50)) {
    if (!entry || typeof entry !== 'object') continue;
    const id = String(entry.id || '').trim().toUpperCase();
    if (!CUSTOM_ROLE_PATTERN.test(id)) continue;
    const permissions = [...new Set((Array.isArray(entry.permissions) ? entry.permissions : [])
      .map(permission => String(permission || '').trim())
      .filter(permission => PERMISSIONS.includes(permission)))];
    if (!permissions.length) continue;
    normalized[id] = { label: String(entry.label || id).slice(0, 60), permissions: Object.freeze([...permissions]) };
  }
  return Object.freeze(normalized);
}

function customRoleIds(customRoles = {}) {
  return Object.keys(customRoles || {});
}

function defaultTenantConfiguration(tenantId) {
  return {
    tenantId,
    revision: 1,
    aiPolicy: { version: 1, allowedProviders: [], allowedModels: [], primaryModel: '' },
    quotaPolicy: { aiRequestsPerMinute: 12, aiRequestsPerDay: 100, renderConcurrency: 2 },
    retentionPolicy: { aiMemoryEnabled: false, retentionDays: 30 },
    securityPolicy: { requireMfaForAdmins: false, supportAccessRequiresApproval: true },
    identityPolicy: { ssoMode: 'NONE', scimEnabled: false, sessionMaxMinutes: 480 },
    customRoles: {},
  };
}

function normalizeTenantConfiguration(tenantId, input = {}, existing = defaultTenantConfiguration(tenantId)) {
  tenantId = assertUuid(tenantId, 'Tenant identifier');
  const aiPolicy = input.aiPolicy && typeof input.aiPolicy === 'object' ? input.aiPolicy : existing.aiPolicy;
  const allowedProviders = Array.isArray(aiPolicy.allowedProviders)
    ? [...new Set(aiPolicy.allowedProviders.map(provider => String(provider).toLowerCase()).filter(provider => /^[a-z0-9_-]{2,40}$/.test(provider)))].slice(0, 10)
    : [...(existing.aiPolicy?.allowedProviders || [])];
  const allowedModels = Array.isArray(aiPolicy.allowedModels)
    ? [...new Set(aiPolicy.allowedModels.map(model => String(model).trim()).filter(model => /^[A-Za-z0-9._:/-]{2,150}$/.test(model)))].slice(0, 25)
    : [...(existing.aiPolicy?.allowedModels || [])];
  const quotaPolicy = input.quotaPolicy && typeof input.quotaPolicy === 'object' ? input.quotaPolicy : existing.quotaPolicy;
  const bounded = (value, fallback, min, max) => Number.isInteger(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback;
  const retentionPolicy = input.retentionPolicy && typeof input.retentionPolicy === 'object' ? input.retentionPolicy : existing.retentionPolicy;
  const securityPolicy = input.securityPolicy && typeof input.securityPolicy === 'object' ? input.securityPolicy : existing.securityPolicy;
  const identityPolicy = input.identityPolicy && typeof input.identityPolicy === 'object' ? input.identityPolicy : existing.identityPolicy;
  const ssoMode = ['NONE', 'OIDC', 'SAML'].includes(String(identityPolicy.ssoMode || '').toUpperCase())
    ? String(identityPolicy.ssoMode).toUpperCase()
    : String(existing.identityPolicy?.ssoMode || 'NONE').toUpperCase();
  const primaryModel = /^[A-Za-z0-9._/-]{2,120}$/.test(String(aiPolicy.primaryModel || '').trim())
    ? String(aiPolicy.primaryModel || '').trim()
    : String(existing.aiPolicy?.primaryModel || '');
  return {
    tenantId,
    revision: Number(existing.revision || 0) + 1,
    aiPolicy: { version: Number(existing.aiPolicy?.version || 0) + 1, allowedProviders, allowedModels, primaryModel },
    quotaPolicy: {
      aiRequestsPerMinute: bounded(quotaPolicy.aiRequestsPerMinute, existing.quotaPolicy?.aiRequestsPerMinute || 12, 1, 10_000),
      aiRequestsPerDay: bounded(quotaPolicy.aiRequestsPerDay, existing.quotaPolicy?.aiRequestsPerDay || 100, 1, 10_000_000),
      renderConcurrency: bounded(quotaPolicy.renderConcurrency, existing.quotaPolicy?.renderConcurrency || 2, 1, 100),
    },
    retentionPolicy: {
      aiMemoryEnabled: retentionPolicy.aiMemoryEnabled === true,
      retentionDays: bounded(retentionPolicy.retentionDays, existing.retentionPolicy?.retentionDays || 30, 1, 3650),
    },
    securityPolicy: {
      requireMfaForAdmins: securityPolicy.requireMfaForAdmins === true,
      supportAccessRequiresApproval: securityPolicy.supportAccessRequiresApproval !== false,
    },
    identityPolicy: {
      ssoMode,
      scimEnabled: ssoMode !== 'NONE' && identityPolicy.scimEnabled === true,
      sessionMaxMinutes: bounded(identityPolicy.sessionMaxMinutes, existing.identityPolicy?.sessionMaxMinutes || 480, 15, 10_080),
    },
    customRoles: normalizeCustomRoles(input.customRoles, existing),
  };
}

function validateTenantRecord(record) {
  if (!record || !record.id || !record.displayName) throw Object.assign(new Error('Tenant record is invalid'), { code: 'TENANT_NOT_FOUND', status: 404 });
  assertUuid(record.id, 'Tenant identifier');
  const lifecycleState = String(record.lifecycleState || '').toUpperCase();
  if (!TENANT_LIFECYCLE_STATES.includes(lifecycleState)) throw Object.assign(new Error('Tenant lifecycle state is invalid'), { code: 'TENANT_ROUTE_INVALID', status: 503 });
  return {
    ...record,
    id: String(record.id).toLowerCase(),
    lifecycleState,
    isolationTier: normalizeTier(record.isolationTier),
    dataPlane: normalizeDataPlane(record.dataPlane || record),
  };
}

function validateMembership(record, principalId) {
  if (!record || record.principalId !== principalId) throw Object.assign(new Error('Tenant membership was not found'), { code: 'TENANT_MEMBERSHIP_NOT_FOUND', status: 404 });
  const status = String(record.status || '').toUpperCase();
  if (!MEMBERSHIP_STATES.includes(status)) throw Object.assign(new Error('Tenant membership state is invalid'), { code: 'TENANT_ROUTE_INVALID', status: 503 });
  // Read-side validation keeps builtin roles plus syntactically valid custom
  // role ids. Whether a custom role is actually defined (and what it grants)
  // is resolved from the tenant configuration when permissions are computed,
  // so an undefined custom role always contributes zero permissions.
  return {
    ...record,
    id: String(record.id || ''),
    status,
    roles: normalizeRoles(record.roles, (Array.isArray(record.roles) ? record.roles : [])
      .filter(role => CUSTOM_ROLE_PATTERN.test(String(role || '').toUpperCase()))),
    canonicalPrincipalId: (() => {
      const expected = canonicalPrincipalId(principalId);
      if (record.canonicalPrincipalId && assertUuid(record.canonicalPrincipalId, 'Canonical principal identifier') !== expected) {
        throw Object.assign(new Error('Tenant membership canonical principal does not match its verified subject'), { code: 'TENANT_IDENTITY_MISMATCH', status: 503 });
      }
      return expected;
    })(),
    revision: Number(record.revision || 1),
  };
}

function membershipDocumentId(tenantId, principalId) {
  return `${assertUuid(tenantId, 'Tenant identifier')}_${stablePrincipalHash(principalId)}`;
}

function workspaceMembershipDocumentId(workspaceId, principalId) {
  return `${assertUuid(workspaceId, 'Workspace identifier')}_${stablePrincipalHash(principalId)}`;
}

function hasTenantWideWorkspaceAccess(roles = []) {
  return roles.some(role => ['TENANT_OWNER', 'TENANT_ADMIN'].includes(String(role).toUpperCase()));
}

const WORKSPACE_LIFECYCLE_STATES = Object.freeze(['ACTIVE', 'ARCHIVED']);

function assertWorkspaceTransition(current, next) {
  const from = String(current || '').toUpperCase();
  const to = String(next || '').toUpperCase();
  if (!WORKSPACE_LIFECYCLE_STATES.includes(to)) {
    throw Object.assign(new Error('Unsupported workspace lifecycle state'), { code: 'INVALID_WORKSPACE_LIFECYCLE', status: 400 });
  }
  if (from === to) {
    throw Object.assign(new Error(`Workspace is already ${to.toLowerCase()}`), { code: 'WORKSPACE_LIFECYCLE_NOOP', status: 409 });
  }
  return to;
}

function teamMemberDocumentId(teamId, principalId) {
  return `${assertUuid(teamId, 'Team identifier')}_${stablePrincipalHash(principalId)}`;
}

function identityMapDocumentId(principalId) {
  return stablePrincipalHash(principalId);
}

function personalTenantName(profile = {}) {
  const name = compact(profile.displayName || profile.firstname || '', 100);
  return name ? `${name}'s Personal Workspace` : 'Personal Workspace';
}

class InMemoryTenantRegistry {
  constructor() {
    this.tenants = new Map();
    this.memberships = new Map();
    this.workspaces = new Map();
    this.workspaceMemberships = new Map();
    this.teams = new Map();
    this.teamMembers = new Map();
    this.personal = new Map();
    this.configurations = new Map();
    this.invitations = new Map();
    this.notificationOutbox = new Map();
  }

  async ensurePersonalTenant(principalId, profile = {}) {
    principalId = assertPrincipalId(principalId);
    if (this.personal.has(principalId)) return this.personal.get(principalId);
    const tenantId = crypto.randomUUID();
    const workspaceId = crypto.randomUUID();
    const tenant = { id: tenantId, slug: `personal-${stablePrincipalHash(principalId).slice(0, 12)}`, displayName: personalTenantName(profile), lifecycleState: 'ACTIVE', isolationTier: 'STANDARD', dataPlane: { ...DEFAULT_DATA_PLANE }, policyVersion: 1, legacyOwnerUid: principalId };
    const membership = { id: membershipDocumentId(tenantId, principalId), tenantId, principalId, canonicalPrincipalId: canonicalPrincipalId(principalId), workspaceId, status: 'ACTIVE', roles: ['TENANT_OWNER'], revision: 1, personalTenant: true };
    const workspace = { id: workspaceId, tenantId, name: 'Personal', lifecycleState: 'ACTIVE', isDefault: true };
    this.tenants.set(tenantId, tenant);
    this.memberships.set(membership.id, membership);
    this.workspaces.set(workspaceId, workspace);
    this.workspaceMemberships.set(workspaceMembershipDocumentId(workspaceId, principalId), { tenantId, workspaceId, principalId, status: 'ACTIVE' });
    const result = { tenantId, workspaceId };
    this.personal.set(principalId, result);
    return result;
  }

  async getTenant(tenantId) {
    const tenant = this.tenants.get(assertUuid(tenantId, 'Tenant identifier'));
    if (!tenant) throw Object.assign(new Error('Tenant was not found'), { code: 'TENANT_NOT_FOUND', status: 404 });
    return validateTenantRecord(tenant);
  }

  async getTenantConfiguration(tenantId) {
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    return this.configurations.get(tenantId) || defaultTenantConfiguration(tenantId);
  }

  async updateTenantConfiguration({ tenantId, input, expectedRevision }) {
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    const existing = await this.getTenantConfiguration(tenantId);
    if (!Number.isInteger(Number(expectedRevision)) || Number(expectedRevision) !== Number(existing.revision || 1)) {
      throw Object.assign(new Error('Tenant configuration changed after it was loaded'), { code: 'TENANT_CONFIGURATION_CONFLICT', status: 409 });
    }
    const configuration = normalizeTenantConfiguration(tenantId, input, existing);
    this.configurations.set(tenantId, configuration);
    return configuration;
  }

  
  async purgeTenantRecords(tenantId) {
    tenantId = assertUuid(tenantId, 'Tenant identifier');

    for (const [key, val] of this.workspaces.entries()) {
      if (val.tenantId === tenantId) this.workspaces.delete(key);
    }
    for (const [key, val] of this.memberships.entries()) {
      if (val.tenantId === tenantId) this.memberships.delete(key);
    }
    for (const [key, val] of this.workspaceMemberships.entries()) {
      if (val.tenantId === tenantId) this.workspaceMemberships.delete(key);
    }
    for (const [key, val] of this.teams.entries()) {
      if (val.tenantId === tenantId) this.teams.delete(key);
    }
    for (const [key, val] of this.teamMembers.entries()) {
      if (val.tenantId === tenantId) this.teamMembers.delete(key);
    }
    for (const [key, invitation] of this.invitations.entries()) {
      if (invitation.tenantId !== tenantId) continue;
      const queued = this.notificationOutbox.get(invitation.notificationId);
      if (queued && queued.providerAccepted !== true) {
        this.notificationOutbox.set(invitation.notificationId, { ...queued, state: 'CANCELLED' });
      }
      this.invitations.delete(key);
    }
    // Configuration and identity-map cleanup keep this registry consistent
    // with the durable registry purge contract: no orphaned configuration
    // documents and no principal left pointing at a deleted personal tenant.
    this.configurations.delete(tenantId);
    for (const [principalId, mapping] of this.personal.entries()) {
      if (mapping?.tenantId === tenantId) this.personal.delete(principalId);
    }
    this.tenants.delete(tenantId);
    return true;
  }

  async setTenantLifecycleState({ tenantId, nextState }) {
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    const tenant = this.tenants.get(tenantId);
    if (!tenant) throw Object.assign(new Error('Tenant was not found'), { code: 'TENANT_NOT_FOUND', status: 404 });
    tenant.lifecycleState = assertTenantTransition(tenant.lifecycleState, nextState);
    this.tenants.set(tenantId, tenant);
    return validateTenantRecord(tenant);
  }

  async updateTenantProfile({ tenantId, displayName }) {
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    const tenant = this.tenants.get(tenantId);
    if (!tenant) throw Object.assign(new Error('Tenant was not found'), { code: 'TENANT_NOT_FOUND', status: 404 });
    const cleanName = compact(displayName, 120);
    if (cleanName.length < 2) throw Object.assign(new Error('Tenant display name is invalid'), { code: 'INVALID_TENANT', status: 400 });
    const updated = { ...tenant, displayName: cleanName };
    this.tenants.set(tenantId, updated);
    return validateTenantRecord(updated);
  }

  async listAllTenants({ limit = 100 } = {}) {
    const bounded = Math.max(1, Math.min(Number(limit) || 100, 500));
    return [...this.tenants.values()]
      .sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')))
      .slice(0, bounded)
      .map(tenant => {
        try { return validateTenantRecord(tenant); } catch { return null; }
      })
      .filter(Boolean);
  }

  async listTenantsByLifecycleState(lifecycleState, { limit = 500 } = {}) {
    const state = String(lifecycleState || '').toUpperCase();
    if (!TENANT_LIFECYCLE_STATES.includes(state)) {
      throw Object.assign(new Error('Tenant lifecycle state is invalid'), { code: 'INVALID_TENANT_LIFECYCLE', status: 400 });
    }
    const bounded = Math.max(1, Math.min(Number(limit) || 500, 1000));
    return [...this.tenants.values()]
      .filter(tenant => String(tenant.lifecycleState || '').toUpperCase() === state)
      .slice(0, bounded)
      .map(tenant => {
        try { return validateTenantRecord(tenant); } catch { return null; }
      })
      .filter(Boolean);
  }

  async getMembership(tenantId, principalId) {
    const membership = this.memberships.get(membershipDocumentId(tenantId, principalId));
    if (!membership) throw Object.assign(new Error('Tenant membership was not found'), { code: 'TENANT_MEMBERSHIP_NOT_FOUND', status: 404 });
    return validateMembership(membership, principalId);
  }

  async getWorkspace(workspaceId, tenantId) {
    const workspace = this.workspaces.get(assertUuid(workspaceId, 'Workspace identifier'));
    if (!workspace || workspace.tenantId !== tenantId || workspace.lifecycleState !== 'ACTIVE') throw Object.assign(new Error('Workspace was not found'), { code: 'WORKSPACE_NOT_FOUND', status: 404 });
    return { ...workspace };
  }

  async hasWorkspaceAccess({ tenantId, workspaceId, principalId, roles = [] }) {
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    workspaceId = assertUuid(workspaceId, 'Workspace identifier');
    principalId = assertPrincipalId(principalId);
    if (hasTenantWideWorkspaceAccess(roles)) return true;
    const membership = this.workspaceMemberships.get(workspaceMembershipDocumentId(workspaceId, principalId));
    return Boolean(membership && membership.tenantId === tenantId && membership.status === 'ACTIVE');
  }

  async listWorkspaces(tenantId, { includeArchived = false } = {}) {
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    return [...this.workspaces.values()]
      .filter(workspace => workspace.tenantId === tenantId && (includeArchived
        ? WORKSPACE_LIFECYCLE_STATES.includes(String(workspace.lifecycleState || '').toUpperCase())
        : workspace.lifecycleState === 'ACTIVE'))
      .sort((left, right) => Number(right.isDefault === true) - Number(left.isDefault === true) || String(left.name).localeCompare(String(right.name)))
      .map(workspace => ({ ...workspace }));
  }

  async getWorkspaceAnyState(workspaceId, tenantId) {
    const workspace = this.workspaces.get(assertUuid(workspaceId, 'Workspace identifier'));
    if (!workspace || workspace.tenantId !== tenantId) throw Object.assign(new Error('Workspace was not found'), { code: 'WORKSPACE_NOT_FOUND', status: 404 });
    return { ...workspace };
  }

  async updateWorkspace({ tenantId, workspaceId, name }) {
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    const cleanName = compact(name, 120);
    if (cleanName.length < 2) throw Object.assign(new Error('Workspace name is invalid'), { code: 'INVALID_WORKSPACE', status: 400 });
    const workspace = this.workspaces.get(assertUuid(workspaceId, 'Workspace identifier'));
    if (!workspace || workspace.tenantId !== tenantId) throw Object.assign(new Error('Workspace was not found'), { code: 'WORKSPACE_NOT_FOUND', status: 404 });
    workspace.name = cleanName;
    this.workspaces.set(workspace.id, workspace);
    return { ...workspace };
  }

  async setWorkspaceLifecycleState({ tenantId, workspaceId, nextState }) {
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    const workspace = this.workspaces.get(assertUuid(workspaceId, 'Workspace identifier'));
    if (!workspace || workspace.tenantId !== tenantId) throw Object.assign(new Error('Workspace was not found'), { code: 'WORKSPACE_NOT_FOUND', status: 404 });
    const lifecycleState = assertWorkspaceTransition(workspace.lifecycleState, nextState);
    if (lifecycleState === 'ARCHIVED' && workspace.isDefault === true) {
      throw Object.assign(new Error('The default workspace cannot be archived'), { code: 'WORKSPACE_DEFAULT_PROTECTED', status: 409 });
    }
    workspace.lifecycleState = lifecycleState;
    this.workspaces.set(workspace.id, workspace);
    return { ...workspace };
  }

  async listWorkspaceMembers({ tenantId, workspaceId }) {
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    workspaceId = assertUuid(workspaceId, 'Workspace identifier');
    await this.getWorkspaceAnyState(workspaceId, tenantId);
    return [...this.workspaceMemberships.values()]
      .filter(member => member.tenantId === tenantId && member.workspaceId === workspaceId && member.status === 'ACTIVE')
      .sort((left, right) => String(left.principalId).localeCompare(String(right.principalId)))
      .map(member => ({ ...member }));
  }

  async addWorkspaceMember({ tenantId, workspaceId, principalId }) {
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    principalId = assertPrincipalId(principalId);
    workspaceId = assertUuid(workspaceId, 'Workspace identifier');
    await this.getWorkspace(workspaceId, tenantId);
    const membership = await this.getMembership(tenantId, principalId);
    if (membership.status !== 'ACTIVE') {
      throw Object.assign(new Error('Only an active tenant member can join a workspace'), { code: 'TENANT_MEMBERSHIP_INACTIVE', status: 409 });
    }
    const id = workspaceMembershipDocumentId(workspaceId, principalId);
    const record = { id, tenantId, workspaceId, principalId, status: 'ACTIVE' };
    this.workspaceMemberships.set(id, record);
    return { ...record };
  }

  async removeWorkspaceMember({ tenantId, workspaceId, principalId }) {
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    principalId = assertPrincipalId(principalId);
    workspaceId = assertUuid(workspaceId, 'Workspace identifier');
    const membership = await this.getMembership(tenantId, principalId);
    if (membership.workspaceId === workspaceId) {
      throw Object.assign(new Error('Reassign the member to another workspace before removing this workspace access'), { code: 'WORKSPACE_PRIMARY_MEMBERSHIP', status: 409 });
    }
    const id = workspaceMembershipDocumentId(workspaceId, principalId);
    const current = this.workspaceMemberships.get(id);
    if (!current || current.tenantId !== tenantId || current.status !== 'ACTIVE') {
      throw Object.assign(new Error('Workspace membership was not found'), { code: 'WORKSPACE_MEMBERSHIP_NOT_FOUND', status: 404 });
    }
    this.workspaceMemberships.set(id, { ...current, status: 'REMOVED' });
    return true;
  }

  async listAccessibleWorkspaces({ tenantId, principalId, roles = [] }) {
    const workspaces = await this.listWorkspaces(tenantId);
    if (hasTenantWideWorkspaceAccess(roles)) return workspaces;
    const accessible = [];
    for (const workspace of workspaces) {
      if (await this.hasWorkspaceAccess({ tenantId, workspaceId: workspace.id, principalId, roles })) accessible.push(workspace);
    }
    return accessible;
  }

  async listTeams({ tenantId, workspaceId = null, includeArchived = false }) {
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    return [...this.teams.values()]
      .filter(team => team.tenantId === tenantId && (includeArchived
        ? ['ACTIVE', 'ARCHIVED'].includes(String(team.status || 'ACTIVE').toUpperCase())
        : team.status === 'ACTIVE') && (!workspaceId || team.workspaceId === workspaceId))
      .sort((left, right) => String(left.name).localeCompare(String(right.name)))
      .map(team => ({ ...team }));
  }

  async createTeam({ tenantId, workspaceId, name }) {
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    workspaceId = assertUuid(workspaceId, 'Workspace identifier');
    await this.getWorkspace(workspaceId, tenantId);
    const cleanName = compact(name, 100);
    if (cleanName.length < 2) throw Object.assign(new Error('Team name is invalid'), { code: 'INVALID_TEAM', status: 400 });
    const team = { id: crypto.randomUUID(), tenantId, workspaceId, name: cleanName, status: 'ACTIVE' };
    this.teams.set(team.id, team);
    return { ...team };
  }

  async getTeam(teamId, tenantId) {
    const team = this.teams.get(assertUuid(teamId, 'Team identifier'));
    if (!team || team.tenantId !== tenantId || team.status !== 'ACTIVE') {
      throw Object.assign(new Error('Team was not found'), { code: 'TEAM_NOT_FOUND', status: 404 });
    }
    return { ...team };
  }

  async updateTeam({ tenantId, teamId, name, leadPrincipalId = undefined }) {
    // An omitted name keeps the current name (partial update contract).
    const team = await this.getTeam(teamId, tenantId);
    const cleanName = compact(name === undefined || name === null ? team.name : name, 100);
    if (cleanName.length < 2) throw Object.assign(new Error('Team name is invalid'), { code: 'INVALID_TEAM', status: 400 });
    let lead = Object.hasOwn(team, 'leadPrincipalId') ? team.leadPrincipalId : null;
    if (leadPrincipalId !== undefined) {
      lead = leadPrincipalId === null || leadPrincipalId === '' ? null : assertPrincipalId(leadPrincipalId);
      if (lead) {
        const membership = await this.getMembership(tenantId, lead).catch(() => null);
        const workspaceMember = membership
          ? await this.hasWorkspaceAccess({ tenantId, workspaceId: team.workspaceId, principalId: lead, roles: membership.roles })
          : false;
        if (!membership || String(membership.status || '').toUpperCase() !== 'ACTIVE' || !workspaceMember) {
          throw Object.assign(new Error('A team lead must be an active member of the team workspace'), { code: 'INVALID_TEAM_LEAD', status: 400 });
        }
      }
    }
    const updated = { ...team, name: cleanName, leadPrincipalId: lead };
    this.teams.set(team.id, updated);
    return { ...updated };
  }

  async archiveTeam({ tenantId, teamId }) {
    const team = await this.getTeam(teamId, tenantId);
    const archived = { ...team, status: 'ARCHIVED' };
    this.teams.set(team.id, archived);
    return { ...archived };
  }

  async restoreTeam({ tenantId, teamId }) {
    teamId = assertUuid(teamId, 'Team identifier');
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    const team = this.teams.get(teamId);
    if (!team || team.tenantId !== tenantId) throw Object.assign(new Error('Team was not found'), { code: 'TEAM_NOT_FOUND', status: 404 });
    await this.getWorkspace(team.workspaceId, tenantId);
    const restored = { ...team, status: 'ACTIVE' };
    this.teams.set(teamId, restored);
    return { ...restored };
  }

  async listTeamMembers({ tenantId, teamId }) {
    const team = await this.getTeam(teamId, tenantId);
    return [...this.teamMembers.values()]
      .filter(member => member.tenantId === tenantId && member.teamId === team.id && member.status === 'ACTIVE')
      .sort((left, right) => String(left.principalId).localeCompare(String(right.principalId)))
      .map(member => ({ ...member }));
  }

  async addTeamMember({ tenantId, teamId, principalId }) {
    principalId = assertPrincipalId(principalId);
    const team = await this.getTeam(teamId, tenantId);
    const membership = await this.getMembership(tenantId, principalId);
    if (membership.status !== 'ACTIVE') {
      throw Object.assign(new Error('Only an active tenant member can join a team'), { code: 'TENANT_MEMBERSHIP_INACTIVE', status: 409 });
    }
    const id = teamMemberDocumentId(team.id, principalId);
    const record = { id, tenantId, teamId: team.id, workspaceId: team.workspaceId, principalId, status: 'ACTIVE' };
    this.teamMembers.set(id, record);
    return { ...record };
  }

  async removeTeamMember({ tenantId, teamId, principalId }) {
    principalId = assertPrincipalId(principalId);
    const team = await this.getTeam(teamId, tenantId);
    const id = teamMemberDocumentId(team.id, principalId);
    const current = this.teamMembers.get(id);
    if (!current || current.tenantId !== tenantId || current.status !== 'ACTIVE') {
      throw Object.assign(new Error('Team membership was not found'), { code: 'TEAM_MEMBERSHIP_NOT_FOUND', status: 404 });
    }
    this.teamMembers.set(id, { ...current, status: 'REMOVED' });
    return true;
  }

  async createWorkspace({ tenantId, name, isDefault = false }) {
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    const cleanName = compact(name, 120);
    if (cleanName.length < 2) throw Object.assign(new Error('Workspace name is invalid'), { code: 'INVALID_WORKSPACE', status: 400 });
    const workspace = { id: crypto.randomUUID(), tenantId, name: cleanName, lifecycleState: 'ACTIVE', isDefault: isDefault === true };
    this.workspaces.set(workspace.id, workspace);
    return { ...workspace };
  }

  async grantMembership({ tenantId, principalId, workspaceId = null, roles = ['MEMBER'], status = 'ACTIVE', invitation = null, allowedRoles = [] }) {
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    principalId = assertPrincipalId(principalId);
    const membershipStatus = String(status || 'ACTIVE').toUpperCase() === 'INVITED' ? 'INVITED' : 'ACTIVE';
    const tenant = await this.getTenant(tenantId);
    if (tenant.lifecycleState !== 'ACTIVE') throw Object.assign(new Error('Tenant is not active'), { code: 'TENANT_INACTIVE', status: 403 });
    let resolvedWorkspaceId = workspaceId ? assertUuid(workspaceId, 'Workspace identifier') : null;
    if (resolvedWorkspaceId) await this.getWorkspace(resolvedWorkspaceId, tenantId);
    if (!resolvedWorkspaceId) {
      const defaults = await this.listWorkspaces(tenantId);
      resolvedWorkspaceId = defaults.find(workspace => workspace.isDefault === true)?.id || defaults[0]?.id || null;
    }
    if (!resolvedWorkspaceId) throw Object.assign(new Error('Tenant has no active workspace'), { code: 'WORKSPACE_NOT_FOUND', status: 409 });

    const id = membershipDocumentId(tenantId, principalId);
    const current = this.memberships.get(id) || null;
    // Production parity (mysqlTenantRegistry.grantMembership): re-granting an
    // ACTIVE membership is an idempotent upsert — roles/status/workspace are
    // replaced and the revision increments — never a duplicate row. This test
    // double previously threw TENANT_MEMBERSHIP_EXISTS here, diverging from
    // the real contract it stands in for (see GAP-22 lifecycle audit).
    const now = new Date().toISOString();
    const normalizedRoles = normalizeRoles(roles, allowedRoles);
    const baseMembership = {
      ...(current || {}), id, tenantId, principalId, canonicalPrincipalId: canonicalPrincipalId(principalId),
      workspaceId: resolvedWorkspaceId, status: membershipStatus, roles: normalizedRoles,
      revision: Number(current?.revision || 0) + 1, personalTenant: false,
      createdAt: current?.createdAt || now, updatedAt: now,
    };

    if (membershipStatus === 'INVITED') {
      const normalizedEmail = String(invitation?.recipientEmail || '').trim().toLowerCase().slice(0, 254);
      const expiresAt = new Date(invitation?.expiresAt || '').getTime();
      if (!/^[^\s@,;<>]{1,64}@[^\s@,;<>]{1,189}$/.test(normalizedEmail)) {
        throw Object.assign(new Error('Invitation email is invalid'), { code: 'INVALID_INVITATION_EMAIL', status: 400 });
      }
      if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
        throw Object.assign(new Error('Invitation expiry is invalid'), { code: 'INVALID_INVITATION_EXPIRY', status: 400 });
      }
      if (!invitation?.tenantContext || invitation.tenantContext.tenantId !== tenantId) {
        throw Object.assign(new Error('Invitation tenant context is invalid'), { code: 'TENANT_CONTEXT_INVALID', status: 400 });
      }
      if (!invitation?.notification?.templateType) {
        throw Object.assign(new Error('Invitation notification is required'), { code: 'INVALID_INVITATION_NOTIFICATION', status: 400 });
      }

      const previous = this.invitations.get(id) || null;
      if (previous?.notificationId) {
        const oldNotification = this.notificationOutbox.get(previous.notificationId);
        if (oldNotification && oldNotification.providerAccepted !== true) {
          this.notificationOutbox.set(previous.notificationId, { ...oldNotification, state: 'CANCELLED', lastError: 'Superseded by invitation resend' });
        }
      }
      const queueRevision = Number(previous?.queueRevision || 0) + 1;
      const eventId = `enterprise-invitation:${tenantId}:${id}:${queueRevision}`;
      const notificationId = crypto.createHash('sha256').update(eventId).digest('hex');
      const invitationRecord = {
        id, membershipId: id, tenantId, principalId, workspaceId: resolvedWorkspaceId,
        recipientEmail: normalizedEmail, invitedByPrincipalId: invitation.invitedByPrincipalId,
        invitationState: 'PENDING', deliveryState: 'NOTIFICATION_QUEUED', notificationId,
        notificationEventId: eventId, queueRevision, expiresAt: new Date(expiresAt).toISOString(),
        invitedAt: previous?.invitedAt || now, lastQueuedAt: now, acceptedAt: null, revokedAt: null,
      };
      this.notificationOutbox.set(notificationId, {
        id: notificationId, eventId, tenantId, recipient: normalizedEmail,
        templateType: invitation.notification.templateType, state: 'NOTIFICATION_QUEUED', providerAccepted: false,
      });
      this.invitations.set(id, invitationRecord);
      Object.assign(baseMembership, {
        invitationEmail: normalizedEmail,
        invitedAt: invitationRecord.invitedAt,
        acceptedAt: null,
        invitationExpiresAt: invitationRecord.expiresAt,
        invitationState: invitationRecord.invitationState,
        invitationDeliveryState: invitationRecord.deliveryState,
        invitationNotificationId: notificationId,
        invitationQueueRevision: queueRevision,
      });
    }

    this.memberships.set(id, baseMembership);
    this.workspaceMemberships.set(workspaceMembershipDocumentId(resolvedWorkspaceId, principalId), {
      tenantId, workspaceId: resolvedWorkspaceId, principalId, status: membershipStatus,
    });
    return validateMembership(baseMembership, principalId);
  }

  async queueMembershipInvitation({ tenantId, principalId, invitedByPrincipalId, notification, tenantContext = null }) {
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    principalId = assertPrincipalId(principalId);
    const id = membershipDocumentId(tenantId, principalId);
    const membership = this.memberships.get(id);
    const invitation = this.invitations.get(id);
    if (!membership || !invitation) throw Object.assign(new Error('Pending invitation was not found'), { code: 'TENANT_MEMBERSHIP_NOT_FOUND', status: 404 });
    if (membership.status !== 'INVITED' || invitation.invitationState !== 'PENDING') {
      throw Object.assign(new Error('Only a pending invitation can be resent'), { code: 'INVITATION_NOT_PENDING', status: 409 });
    }
    if (!notification?.templateType || tenantContext?.tenantId !== tenantId) {
      throw Object.assign(new Error('Invitation notification context is invalid'), { code: 'INVALID_MEMBERSHIP_INVITATION', status: 400 });
    }
    const previous = this.notificationOutbox.get(invitation.notificationId);
    if (previous && previous.providerAccepted !== true) {
      this.notificationOutbox.set(previous.id, { ...previous, state: 'CANCELLED', lastError: 'Superseded by invitation resend' });
    }
    const queueRevision = Number(invitation.queueRevision || 0) + 1;
    const eventId = `enterprise-invitation:${id}:resend:${queueRevision}`;
    const notificationId = crypto.createHash('sha256').update(eventId).digest('hex');
    const now = new Date().toISOString();
    const updatedInvitation = {
      ...invitation, invitedByPrincipalId, deliveryState: 'NOTIFICATION_QUEUED', notificationId,
      notificationEventId: eventId, queueRevision,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), lastQueuedAt: now,
    };
    this.invitations.set(id, updatedInvitation);
    this.notificationOutbox.set(notificationId, {
      id: notificationId, eventId, tenantId, recipient: invitation.recipientEmail,
      templateType: notification.templateType, state: 'NOTIFICATION_QUEUED', providerAccepted: false,
    });
    const updated = {
      ...membership, invitedByPrincipalId, invitationExpiresAt: updatedInvitation.expiresAt,
      invitationDeliveryState: 'NOTIFICATION_QUEUED', lastDeliveryState: 'NOTIFICATION_QUEUED',
      invitationNotificationId: notificationId, invitationQueueRevision: queueRevision,
      revision: Number(membership.revision || 0) + 1, updatedAt: now,
    };
    this.memberships.set(id, updated);
    return validateMembership(updated, principalId);
  }

  async assertNotLastOwner(tenantId, principalId, nextRoles, _nextStatus) {
    if (nextRoles && nextRoles.includes('TENANT_OWNER')) return;
    const memberships = await this.listTenantMemberships(tenantId);
    const owners = memberships.filter(member => Array.isArray(member.roles) && member.roles.includes('TENANT_OWNER') && String(member.status || '').toUpperCase() === 'ACTIVE');
    if (owners.length === 1 && owners[0].principalId === principalId) {
      throw Object.assign(new Error('A tenant must retain at least one active owner'), { code: 'LAST_TENANT_OWNER', status: 409 });
    }
  }

  async updateTenantMembership({ tenantId, principalId, roles = null, status = null, workspaceId = null, allowedRoles = [] }) {
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    principalId = assertPrincipalId(principalId);
    const id = membershipDocumentId(tenantId, principalId);
    const current = this.memberships.get(id);
    if (!current) throw Object.assign(new Error('Tenant membership was not found'), { code: 'TENANT_MEMBERSHIP_NOT_FOUND', status: 404 });
    const nextRoles = roles ? normalizeRoles(roles, allowedRoles) : Array.isArray(current.roles) ? current.roles : [];
    const nextStatus = status ? String(status).toUpperCase() : String(current.status || 'ACTIVE').toUpperCase();
    if (nextRoles.includes('TENANT_OWNER') && nextStatus !== 'ACTIVE') {
      throw Object.assign(new Error('A tenant owner must remain active'), { code: 'TENANT_OWNER_MUST_BE_ACTIVE', status: 409 });
    }
    if (nextStatus === 'REMOVED' || !nextRoles.includes('TENANT_OWNER')) {
      await this.assertNotLastOwner(tenantId, principalId, nextRoles, nextStatus);
    }
    let nextWorkspaceId = current.workspaceId || null;
    if (workspaceId) {
      nextWorkspaceId = assertUuid(workspaceId, 'Workspace identifier');
      await this.getWorkspace(nextWorkspaceId, tenantId);
      this.workspaceMemberships.set(workspaceMembershipDocumentId(nextWorkspaceId, principalId), { tenantId, workspaceId: nextWorkspaceId, principalId, status: nextStatus });
    }
    const membership = {
      ...current, tenantId, principalId, canonicalPrincipalId: canonicalPrincipalId(principalId),
      roles: nextRoles, status: nextStatus, workspaceId: nextWorkspaceId,
      revision: Number(current.revision || 0) + 1,
    };
    this.memberships.set(id, membership);
    const pendingInvitation = this.invitations.get(id);
    if (pendingInvitation && pendingInvitation.invitationState === 'PENDING' && ['ACTIVE', 'REMOVED'].includes(nextStatus)) {
      const invitationState = nextStatus === 'ACTIVE' ? 'ACCEPTED' : 'REVOKED';
      const timestampField = nextStatus === 'ACTIVE' ? 'acceptedAt' : 'revokedAt';
      const at = new Date().toISOString();
      this.invitations.set(id, { ...pendingInvitation, invitationState, [timestampField]: at });
      const queued = this.notificationOutbox.get(pendingInvitation.notificationId);
      if (queued && queued.providerAccepted !== true) this.notificationOutbox.set(pendingInvitation.notificationId, { ...queued, state: 'CANCELLED' });
    }
    return validateMembership(membership, principalId);
  }

  async removeTenantMembership({ tenantId, principalId }) {
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    principalId = assertPrincipalId(principalId);
    await this.assertNotLastOwner(tenantId, principalId, [], 'REMOVED');
    const id = membershipDocumentId(tenantId, principalId);
    const current = this.memberships.get(id);
    if (!current) throw Object.assign(new Error('Tenant membership was not found'), { code: 'TENANT_MEMBERSHIP_NOT_FOUND', status: 404 });
    this.memberships.set(id, { ...current, status: 'REMOVED', revision: Number(current.revision || 0) + 1 });
    // Production parity (mysqlTenantRegistry.removeTenantMembership): the
    // cascade removes workspace + team memberships in the same transaction so
    // no orphan memberships survive a tenant removal (GAP-22 lifecycle audit).
    for (const [key, val] of this.workspaceMemberships.entries()) {
      if (val.tenantId === tenantId && val.principalId === principalId) this.workspaceMemberships.delete(key);
    }
    for (const [key, val] of this.teamMembers.entries()) {
      if (val.tenantId === tenantId && val.principalId === principalId) this.teamMembers.delete(key);
    }
    const invitation = this.invitations.get(id);
    if (invitation?.invitationState === 'PENDING') {
      this.invitations.set(id, { ...invitation, invitationState: 'REVOKED', revokedAt: new Date().toISOString() });
      const queued = this.notificationOutbox.get(invitation.notificationId);
      if (queued && queued.providerAccepted !== true) this.notificationOutbox.set(invitation.notificationId, { ...queued, state: 'CANCELLED' });
    }
    return true;
  }

  async listMembershipsForPrincipals(principalIds = []) {
    const requested = [...new Set((Array.isArray(principalIds) ? principalIds : [])
      .map(value => String(value || ''))
      .filter(Boolean))];
    const grouped = new Map(requested.map(principalId => [principalId, []]));
    for (const principalId of requested) {
      for (const membership of this.memberships.values()) {
        if (membership.principalId !== principalId || membership.status !== 'ACTIVE') continue;
        const tenant = await this.getTenant(membership.tenantId);
        if (tenant.lifecycleState === 'ACTIVE') grouped.get(principalId).push({ membership: validateMembership(membership, principalId), tenant });
      }
    }
    return grouped;
  }

  async listMemberships(principalId) {
    principalId = assertPrincipalId(principalId);
    const result = [];
    for (const membership of this.memberships.values()) {
      if (membership.principalId !== principalId || membership.status !== 'ACTIVE') continue;
      const tenant = await this.getTenant(membership.tenantId);
      if (tenant.lifecycleState === 'ACTIVE') result.push({ membership: validateMembership(membership, principalId), tenant });
    }
    return result;
  }

  async listTenantMemberships(tenantId) {
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    return [...this.memberships.values()]
      .filter(membership => membership.tenantId === tenantId && membership.status !== 'REMOVED')
      .sort((left, right) => String(left.principalId).localeCompare(String(right.principalId)))
      .map(membership => ({ ...membership }));
  }

  async resolveMembership({ principalId, requestedTenantId = null, requestedWorkspaceId = null, profile = {}, identityEmail = null, emailVerified = false }) {
    principalId = assertPrincipalId(principalId);
    if (!requestedTenantId) {
      const personal = await this.ensurePersonalTenant(principalId, profile);
      requestedTenantId = personal.tenantId;
      requestedWorkspaceId = requestedWorkspaceId || personal.workspaceId;
    }
    const tenant = await this.getTenant(requestedTenantId);
    if (tenant.lifecycleState !== 'ACTIVE') throw Object.assign(new Error('Tenant is not active'), { code: 'TENANT_INACTIVE', status: 403 });
    const membership = await this.getMembership(requestedTenantId, principalId);
    // Mirror production: only a Firebase-verified email matching the persisted
    // recipient can activate a pending invitation.
    const accepted = membership.status === 'INVITED'
      ? await this.acceptMembershipInvitation({ tenantId: requestedTenantId, principalId, identityEmail, emailVerified })
      : membership;
    const workspace = await this.getWorkspace(requestedWorkspaceId || accepted.workspaceId, requestedTenantId);
    if (!await this.hasWorkspaceAccess({ tenantId: requestedTenantId, workspaceId: workspace.id, principalId, roles: accepted.roles })) {
      throw Object.assign(new Error('Workspace membership was not found'), { code: 'WORKSPACE_MEMBERSHIP_NOT_FOUND', status: 404 });
    }
    return { tenant, membership: accepted, workspace };
  }

  async acceptMembershipInvitation({ tenantId, principalId, identityEmail, emailVerified }) {
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    principalId = assertPrincipalId(principalId);
    const id = membershipDocumentId(tenantId, principalId);
    const current = this.memberships.get(id);
    const invitation = this.invitations.get(id);
    if (!current || !invitation) throw Object.assign(new Error('Pending invitation was not found'), { code: 'TENANT_MEMBERSHIP_NOT_FOUND', status: 404 });
    if (emailVerified !== true) throw Object.assign(new Error('Verify the invited email address before accepting this invitation'), { code: 'INVITATION_EMAIL_UNVERIFIED', status: 403 });
    const normalizedEmail = String(identityEmail || '').trim().toLowerCase();
    if (normalizedEmail !== invitation.recipientEmail) throw Object.assign(new Error('Signed-in identity does not match the invitation recipient'), { code: 'INVITATION_IDENTITY_MISMATCH', status: 403 });
    if (current.status !== 'INVITED' || invitation.invitationState !== 'PENDING') throw Object.assign(new Error('Invitation is no longer pending'), { code: 'INVITATION_NOT_PENDING', status: 409 });
    if (new Date(invitation.expiresAt).getTime() <= Date.now()) {
      this.invitations.set(id, { ...invitation, invitationState: 'EXPIRED' });
      throw Object.assign(new Error('Invitation has expired; request a new invitation'), { code: 'INVITATION_EXPIRED', status: 410 });
    }
    const now = new Date().toISOString();
    const accepted = {
      ...current, status: 'ACTIVE', acceptedAt: now, invitationState: 'ACCEPTED',
      revision: Number(current.revision || 0) + 1, updatedAt: now,
    };
    this.memberships.set(id, accepted);
    this.invitations.set(id, { ...invitation, invitationState: 'ACCEPTED', acceptedAt: now });
    const queued = this.notificationOutbox.get(invitation.notificationId);
    if (queued && queued.providerAccepted !== true) {
      this.notificationOutbox.set(invitation.notificationId, { ...queued, state: 'CANCELLED', lastError: 'Invitation accepted before delivery' });
    }
    if (accepted.workspaceId) {
      const workspaceMembershipId = workspaceMembershipDocumentId(accepted.workspaceId, accepted.principalId);
      const workspaceMembership = this.workspaceMemberships.get(workspaceMembershipId);
      if (workspaceMembership) this.workspaceMemberships.set(workspaceMembershipId, { ...workspaceMembership, status: 'ACTIVE' });
    }
    return validateMembership(accepted, principalId);
  }

  async isInvitationDeliverable({ tenantId, membershipId, notificationId }) {
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    const invitation = this.invitations.get(String(membershipId || ''));
    const membership = this.memberships.get(String(membershipId || ''));
    return Boolean(invitation && membership && invitation.tenantId === tenantId
      && invitation.notificationId === notificationId && invitation.invitationState === 'PENDING'
      && membership.status === 'INVITED' && new Date(invitation.expiresAt).getTime() > Date.now());
  }

  async provisionTenant({ ownerPrincipalId, displayName, slug, isolationTier = 'STANDARD', dataPlane = DEFAULT_DATA_PLANE, region = null }) {
    ownerPrincipalId = assertPrincipalId(ownerPrincipalId);
    const cleanName = compact(displayName, 120);
    const cleanSlug = compact(slug, 80).toLowerCase();
    if (cleanName.length < 2 || !/^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/.test(cleanSlug)) {
      throw Object.assign(new Error('Tenant name or slug is invalid'), { code: 'INVALID_TENANT', status: 400 });
    }
    for (const existing of this.tenants.values()) {
      if (existing.slug === cleanSlug) {
        throw Object.assign(new Error('Tenant slug is already in use'), { code: 'TENANT_SLUG_CONFLICT', status: 409 });
      }
    }
    const tenantId = crypto.randomUUID();
    const workspaceId = crypto.randomUUID();
    const tenant = { id: tenantId, slug: cleanSlug, displayName: cleanName, lifecycleState: 'ACTIVE', isolationTier: normalizeTier(isolationTier), dataPlane: normalizeDataPlane({ ...dataPlane, ...(region ? { region } : {}) }), policyVersion: 1 };
    const workspace = { id: workspaceId, tenantId, name: 'Default Workspace', lifecycleState: 'ACTIVE', isDefault: true };
    const membership = { id: membershipDocumentId(tenantId, ownerPrincipalId), tenantId, principalId: ownerPrincipalId, canonicalPrincipalId: canonicalPrincipalId(ownerPrincipalId), workspaceId, status: 'ACTIVE', roles: ['TENANT_OWNER'], revision: 1, personalTenant: false };
    this.tenants.set(tenantId, tenant);
    this.workspaces.set(workspaceId, workspace);
    this.memberships.set(membership.id, membership);
    this.workspaceMemberships.set(workspaceMembershipDocumentId(workspaceId, ownerPrincipalId), { tenantId, workspaceId, principalId: ownerPrincipalId, status: 'ACTIVE' });
    return { tenantId, workspaceId, membershipId: membership.id };
  }
}


module.exports = {
  CUSTOM_ROLE_PATTERN,
  DEFAULT_DATA_PLANE,
  InMemoryTenantRegistry,
  customRoleIds,
  identityMapDocumentId,
  membershipDocumentId,
  normalizeCustomRoles,
  normalizeDataPlane,
  normalizeTier,
  validateMembership,
  validateTenantRecord,
};
