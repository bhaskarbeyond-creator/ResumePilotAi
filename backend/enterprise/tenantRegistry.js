'use strict';

const crypto = require('crypto');
const {
  DATA_PLANE_TYPES,
  ISOLATION_TIERS,
  LEGACY_DATA_PLANE_TYPES,
  MEMBERSHIP_STATES,
  PERMISSIONS,
  TENANT_LIFECYCLE_STATES,
  TENANT_ROLES,
} = require('./constants');
const { assertTenantTransition } = require('./tenantLifecycle');
const {
  assertPrincipalId,
  assertUuid,
  canonicalPrincipalId,
  normalizeRequestedTenantId,
  normalizeRequestedWorkspaceId,
  stablePrincipalHash,
} = require('./tenantContext');

const DEFAULT_DATA_PLANE = Object.freeze({
  // Canonical Firebase-native enterprise data plane. No external database,
  // cache, or queue infrastructure is required to operate a tenant.
  id: 'firestore-primary',
  type: 'FIRESTORE',
  region: 'default',
  routingVersion: 1,
  storageProfile: 'shared',
  cacheProfile: 'shared',
  queueProfile: 'firestore-durable-outbox',
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
  const rawType = String(input.type || DEFAULT_DATA_PLANE.type).toUpperCase();
  // Earlier development iterations stored PostgreSQL routing metadata; those
  // values are translated to the active Firestore plane on read.
  const type = LEGACY_DATA_PLANE_TYPES.includes(rawType) ? DEFAULT_DATA_PLANE.type : rawType;
  if (!DATA_PLANE_TYPES.includes(type)) throw Object.assign(new Error('Unsupported data plane'), { code: 'INVALID_TENANT_DATA_PLANE', status: 400 });
  // A legacy plane id refers to the removed PostgreSQL topology; route it to
  // the active Firestore plane so stored metadata never implies a dead store.
  const planeId = LEGACY_DATA_PLANE_TYPES.includes(rawType)
    ? DEFAULT_DATA_PLANE.id
    : compact(input.id || DEFAULT_DATA_PLANE.id, 120);
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

// Custom roles are tenant-defined bundles of whitelisted permissions. They can
// never contain "*" and never grant tenant-wide workspace scope (that stays
// bound to the builtin TENANT_OWNER/TENANT_ADMIN roles).
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
  const source = Array.isArray(customRoles) ? customRoles : null;
  if (!source) return existing.customRoles || {};
  const normalized = {};
  for (const entry of source.slice(0, 25)) {
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

class FirestoreTenantRegistry {
  constructor({ db, admin }) {
    this.db = db;
    this.admin = admin;
  }

  assertAvailable() {
    if (!this.db) throw Object.assign(new Error('Tenant control plane is unavailable'), { code: 'TENANT_CONTROL_PLANE_UNAVAILABLE', status: 503 });
  }

  timestamp() {
    return this.admin?.firestore?.FieldValue?.serverTimestamp?.() || new Date();
  }

  async ensurePersonalTenant(principalId, profile = {}) {
    this.assertAvailable();
    principalId = assertPrincipalId(principalId);
    const identityRef = this.db.collection('enterprise_principal_tenants').doc(identityMapDocumentId(principalId));
    let output;
    await this.db.runTransaction(async transaction => {
      const mapped = await transaction.get(identityRef);
      if (mapped.exists) {
        const data = mapped.data() || {};
        output = { tenantId: assertUuid(data.personalTenantId, 'Personal tenant identifier'), workspaceId: assertUuid(data.defaultWorkspaceId, 'Personal workspace identifier') };
        return;
      }
      const tenantId = crypto.randomUUID();
      const workspaceId = crypto.randomUUID();
      const now = this.timestamp();
      const tenantRef = this.db.collection('enterprise_tenants').doc(tenantId);
      const workspaceRef = this.db.collection('enterprise_workspaces').doc(workspaceId);
      const membershipId = membershipDocumentId(tenantId, principalId);
      const membershipRef = this.db.collection('enterprise_memberships').doc(membershipId);
      const workspaceMembershipRef = this.db.collection('enterprise_workspace_memberships').doc(workspaceMembershipDocumentId(workspaceId, principalId));
      const tenant = {
        id: tenantId,
        slug: `personal-${stablePrincipalHash(principalId).slice(0, 12)}`,
        displayName: personalTenantName(profile),
        lifecycleState: 'ACTIVE',
        isolationTier: 'STANDARD',
        dataPlane: { ...DEFAULT_DATA_PLANE },
        policyVersion: 1,
        legacyOwnerUid: principalId,
        createdAt: now,
        updatedAt: now,
      };
      const workspace = {
        id: workspaceId,
        tenantId,
        name: 'Personal',
        lifecycleState: 'ACTIVE',
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      };
      const membership = {
        id: membershipId,
        tenantId,
        principalId,
        canonicalPrincipalId: canonicalPrincipalId(principalId),
        workspaceId,
        status: 'ACTIVE',
        roles: ['TENANT_OWNER'],
        revision: 1,
        personalTenant: true,
        createdAt: now,
        updatedAt: now,
      };
      transaction.create(identityRef, { principalId, personalTenantId: tenantId, defaultWorkspaceId: workspaceId, createdAt: now, updatedAt: now });
      transaction.create(tenantRef, tenant);
      transaction.create(workspaceRef, workspace);
      transaction.create(membershipRef, membership);
      transaction.create(workspaceMembershipRef, { id: workspaceMembershipRef.id, tenantId, workspaceId, principalId, status: 'ACTIVE', createdAt: now, updatedAt: now });
      output = { tenantId, workspaceId };
    });
    return output;
  }

  async getTenant(tenantId) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    const snapshot = await this.db.collection('enterprise_tenants').doc(tenantId).get();
    if (!snapshot.exists) throw Object.assign(new Error('Tenant was not found'), { code: 'TENANT_NOT_FOUND', status: 404 });
    return validateTenantRecord(snapshot.data());
  }

  async getTenantConfiguration(tenantId) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    const snapshot = await this.db.collection('enterprise_tenant_configurations').doc(tenantId).get();
    const defaults = defaultTenantConfiguration(tenantId);
    if (!snapshot.exists) return defaults;
    const stored = snapshot.data() || {};
    return {
      ...defaults,
      ...stored,
      tenantId,
      aiPolicy: { ...defaults.aiPolicy, ...(stored.aiPolicy || {}) },
      quotaPolicy: { ...defaults.quotaPolicy, ...(stored.quotaPolicy || {}) },
      retentionPolicy: { ...defaults.retentionPolicy, ...(stored.retentionPolicy || {}) },
      securityPolicy: { ...defaults.securityPolicy, ...(stored.securityPolicy || {}) },
      identityPolicy: { ...defaults.identityPolicy, ...(stored.identityPolicy || {}) },
      customRoles: normalizeCustomRoles(stored.customRoles, defaults),
    };
  }

  async updateTenantConfiguration({ tenantId, input, expectedRevision }) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    const reference = this.db.collection('enterprise_tenant_configurations').doc(tenantId);
    let configuration;
    await this.db.runTransaction(async transaction => {
      const snapshot = await transaction.get(reference);
      const defaults = defaultTenantConfiguration(tenantId);
      const existing = snapshot.exists ? { ...defaults, ...(snapshot.data() || {}) } : defaults;
      if (!Number.isInteger(Number(expectedRevision)) || Number(expectedRevision) !== Number(existing.revision || 1)) {
        throw Object.assign(new Error('Tenant configuration changed after it was loaded'), { code: 'TENANT_CONFIGURATION_CONFLICT', status: 409 });
      }
      configuration = normalizeTenantConfiguration(tenantId, input, existing);
      transaction.set(reference, { ...configuration, updatedAt: this.timestamp() }, { merge: false });
    });
    return configuration;
  }

  async setTenantLifecycleState({ tenantId, nextState }) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    const reference = this.db.collection('enterprise_tenants').doc(tenantId);
    let tenant;
    await this.db.runTransaction(async transaction => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) throw Object.assign(new Error('Tenant was not found'), { code: 'TENANT_NOT_FOUND', status: 404 });
      const current = validateTenantRecord(snapshot.data());
      const lifecycleState = assertTenantTransition(current.lifecycleState, nextState);
      tenant = { ...current, lifecycleState, updatedAt: this.timestamp() };
      transaction.set(reference, tenant, { merge: true });
    });
    return validateTenantRecord(tenant);
  }

  async updateTenantProfile({ tenantId, displayName }) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    const cleanName = compact(displayName, 120);
    if (cleanName.length < 2) throw Object.assign(new Error('Tenant display name is invalid'), { code: 'INVALID_TENANT', status: 400 });
    const reference = this.db.collection('enterprise_tenants').doc(tenantId);
    let tenant;
    await this.db.runTransaction(async transaction => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) throw Object.assign(new Error('Tenant was not found'), { code: 'TENANT_NOT_FOUND', status: 404 });
      const current = validateTenantRecord(snapshot.data());
      tenant = { ...current, displayName: cleanName, updatedAt: this.timestamp() };
      transaction.set(reference, { displayName: cleanName, updatedAt: this.timestamp() }, { merge: true });
    });
    return validateTenantRecord(tenant);
  }

  async listAllTenants({ limit = 100 } = {}) {
    this.assertAvailable();
    // Platform-level registry view. Caller authorization is enforced by the
    // service layer; the registry itself never decides who may call it.
    const bounded = Math.max(1, Math.min(Number(limit) || 100, 500));
    const snapshot = await this.db.collection('enterprise_tenants').orderBy('createdAt', 'desc').limit(bounded).get();
    return snapshot.docs.map(document => {
      try {
        return validateTenantRecord({ ...document.data(), id: document.id });
      } catch {
        return null;
      }
    }).filter(Boolean);
  }

  async getMembership(tenantId, principalId) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    principalId = assertPrincipalId(principalId);
    const snapshot = await this.db.collection('enterprise_memberships').doc(membershipDocumentId(tenantId, principalId)).get();
    if (!snapshot.exists) throw Object.assign(new Error('Tenant membership was not found'), { code: 'TENANT_MEMBERSHIP_NOT_FOUND', status: 404 });
    return validateMembership(snapshot.data(), principalId);
  }

  async getWorkspace(workspaceId, tenantId) {
    this.assertAvailable();
    workspaceId = assertUuid(workspaceId, 'Workspace identifier');
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    const snapshot = await this.db.collection('enterprise_workspaces').doc(workspaceId).get();
    if (!snapshot.exists || snapshot.data()?.tenantId !== tenantId || String(snapshot.data()?.lifecycleState || '').toUpperCase() !== 'ACTIVE') {
      throw Object.assign(new Error('Workspace was not found'), { code: 'WORKSPACE_NOT_FOUND', status: 404 });
    }
    return { ...snapshot.data(), id: workspaceId };
  }

  async hasWorkspaceAccess({ tenantId, workspaceId, principalId, roles = [] }) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    workspaceId = assertUuid(workspaceId, 'Workspace identifier');
    principalId = assertPrincipalId(principalId);
    if (hasTenantWideWorkspaceAccess(roles)) return true;
    const snapshot = await this.db.collection('enterprise_workspace_memberships').doc(workspaceMembershipDocumentId(workspaceId, principalId)).get();
    return snapshot.exists && snapshot.data()?.tenantId === tenantId && String(snapshot.data()?.status || '').toUpperCase() === 'ACTIVE';
  }

  async listWorkspaces(tenantId, { includeArchived = false } = {}) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    const snapshot = await this.db.collection('enterprise_workspaces').where('tenantId', '==', tenantId).get();
    return snapshot.docs.map(document => ({ ...document.data(), id: document.id }))
      .filter(workspace => {
        const state = String(workspace.lifecycleState || '').toUpperCase();
        return includeArchived ? WORKSPACE_LIFECYCLE_STATES.includes(state) : state === 'ACTIVE';
      })
      .sort((left, right) => Number(right.isDefault === true) - Number(left.isDefault === true) || String(left.name).localeCompare(String(right.name)));
  }

  async getWorkspaceAnyState(workspaceId, tenantId) {
    this.assertAvailable();
    workspaceId = assertUuid(workspaceId, 'Workspace identifier');
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    const snapshot = await this.db.collection('enterprise_workspaces').doc(workspaceId).get();
    if (!snapshot.exists || snapshot.data()?.tenantId !== tenantId) {
      throw Object.assign(new Error('Workspace was not found'), { code: 'WORKSPACE_NOT_FOUND', status: 404 });
    }
    return { ...snapshot.data(), id: workspaceId };
  }

  async updateWorkspace({ tenantId, workspaceId, name }) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    workspaceId = assertUuid(workspaceId, 'Workspace identifier');
    const cleanName = compact(name, 120);
    if (cleanName.length < 2) throw Object.assign(new Error('Workspace name is invalid'), { code: 'INVALID_WORKSPACE', status: 400 });
    const reference = this.db.collection('enterprise_workspaces').doc(workspaceId);
    let workspace;
    await this.db.runTransaction(async transaction => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists || snapshot.data()?.tenantId !== tenantId) {
        throw Object.assign(new Error('Workspace was not found'), { code: 'WORKSPACE_NOT_FOUND', status: 404 });
      }
      workspace = { ...snapshot.data(), id: workspaceId, name: cleanName, updatedAt: this.timestamp() };
      transaction.set(reference, workspace, { merge: true });
    });
    return workspace;
  }

  async setWorkspaceLifecycleState({ tenantId, workspaceId, nextState }) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    workspaceId = assertUuid(workspaceId, 'Workspace identifier');
    const reference = this.db.collection('enterprise_workspaces').doc(workspaceId);
    let workspace;
    await this.db.runTransaction(async transaction => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists || snapshot.data()?.tenantId !== tenantId) {
        throw Object.assign(new Error('Workspace was not found'), { code: 'WORKSPACE_NOT_FOUND', status: 404 });
      }
      const current = snapshot.data() || {};
      const lifecycleState = assertWorkspaceTransition(current.lifecycleState, nextState);
      if (lifecycleState === 'ARCHIVED' && current.isDefault === true) {
        throw Object.assign(new Error('The default workspace cannot be archived'), { code: 'WORKSPACE_DEFAULT_PROTECTED', status: 409 });
      }
      workspace = { ...current, id: workspaceId, lifecycleState, updatedAt: this.timestamp() };
      transaction.set(reference, workspace, { merge: true });
    });
    return workspace;
  }

  async listWorkspaceMembers({ tenantId, workspaceId }) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    workspaceId = assertUuid(workspaceId, 'Workspace identifier');
    await this.getWorkspaceAnyState(workspaceId, tenantId);
    const snapshot = await this.db.collection('enterprise_workspace_memberships').where('workspaceId', '==', workspaceId).get();
    return snapshot.docs.map(document => ({ ...document.data(), id: document.id }))
      .filter(member => member.tenantId === tenantId && String(member.status || '').toUpperCase() === 'ACTIVE')
      .sort((left, right) => String(left.principalId).localeCompare(String(right.principalId)));
  }

  async addWorkspaceMember({ tenantId, workspaceId, principalId }) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    principalId = assertPrincipalId(principalId);
    workspaceId = assertUuid(workspaceId, 'Workspace identifier');
    await this.getWorkspace(workspaceId, tenantId);
    const membership = await this.getMembership(tenantId, principalId);
    if (membership.status !== 'ACTIVE') {
      throw Object.assign(new Error('Only an active tenant member can join a workspace'), { code: 'TENANT_MEMBERSHIP_INACTIVE', status: 409 });
    }
    const reference = this.db.collection('enterprise_workspace_memberships').doc(workspaceMembershipDocumentId(workspaceId, principalId));
    const now = this.timestamp();
    await this.db.runTransaction(async transaction => {
      const snapshot = await transaction.get(reference);
      const current = snapshot.exists ? snapshot.data() || {} : {};
      transaction.set(reference, {
        id: reference.id, tenantId, workspaceId, principalId, status: 'ACTIVE',
        createdAt: current.createdAt || now, updatedAt: now,
      }, { merge: false });
    });
    return { id: reference.id, tenantId, workspaceId, principalId, status: 'ACTIVE' };
  }

  async removeWorkspaceMember({ tenantId, workspaceId, principalId }) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    principalId = assertPrincipalId(principalId);
    workspaceId = assertUuid(workspaceId, 'Workspace identifier');
    const membership = await this.getMembership(tenantId, principalId);
    if (membership.workspaceId === workspaceId) {
      throw Object.assign(new Error('Reassign the member to another workspace before removing this workspace access'), { code: 'WORKSPACE_PRIMARY_MEMBERSHIP', status: 409 });
    }
    const reference = this.db.collection('enterprise_workspace_memberships').doc(workspaceMembershipDocumentId(workspaceId, principalId));
    const snapshot = await reference.get();
    if (!snapshot.exists || snapshot.data()?.tenantId !== tenantId || String(snapshot.data()?.status || '').toUpperCase() !== 'ACTIVE') {
      throw Object.assign(new Error('Workspace membership was not found'), { code: 'WORKSPACE_MEMBERSHIP_NOT_FOUND', status: 404 });
    }
    await reference.set({ ...snapshot.data(), status: 'REMOVED', updatedAt: this.timestamp() }, { merge: false });
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
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    const snapshot = await this.db.collection('enterprise_teams').where('tenantId', '==', tenantId).get();
    return snapshot.docs.map(document => ({ ...document.data(), id: document.id }))
      .filter(team => (includeArchived
        ? ['ACTIVE', 'ARCHIVED'].includes(String(team.status || 'ACTIVE').toUpperCase())
        : team.status === 'ACTIVE') && (!workspaceId || team.workspaceId === workspaceId))
      .sort((left, right) => String(left.name).localeCompare(String(right.name)));
  }

  async createTeam({ tenantId, workspaceId, name }) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    workspaceId = assertUuid(workspaceId, 'Workspace identifier');
    await this.getWorkspace(workspaceId, tenantId);
    const cleanName = compact(name, 100);
    if (cleanName.length < 2) throw Object.assign(new Error('Team name is invalid'), { code: 'INVALID_TEAM', status: 400 });
    const id = crypto.randomUUID();
    const now = this.timestamp();
    await this.db.collection('enterprise_teams').doc(id).create({ id, tenantId, workspaceId, name: cleanName, status: 'ACTIVE', createdAt: now, updatedAt: now });
    return { id, tenantId, workspaceId, name: cleanName, status: 'ACTIVE' };
  }

  async getTeam(teamId, tenantId) {
    this.assertAvailable();
    teamId = assertUuid(teamId, 'Team identifier');
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    const snapshot = await this.db.collection('enterprise_teams').doc(teamId).get();
    if (!snapshot.exists || snapshot.data()?.tenantId !== tenantId || snapshot.data()?.status !== 'ACTIVE') {
      throw Object.assign(new Error('Team was not found'), { code: 'TEAM_NOT_FOUND', status: 404 });
    }
    return { ...snapshot.data(), id: teamId };
  }

  async updateTeam({ tenantId, teamId, name, leadPrincipalId = undefined }) {
    this.assertAvailable();
    const cleanName = compact(name, 100);
    if (cleanName.length < 2) throw Object.assign(new Error('Team name is invalid'), { code: 'INVALID_TEAM', status: 400 });
    const team = await this.getTeam(teamId, tenantId);
    // leadPrincipalId: undefined keeps the current lead, null/'' clears it, and
    // a principal value must be an active member of the team's workspace.
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
    const updated = { ...team, name: cleanName, leadPrincipalId: lead, updatedAt: this.timestamp() };
    await this.db.collection('enterprise_teams').doc(team.id).set(updated, { merge: true });
    return updated;
  }

  async archiveTeam({ tenantId, teamId }) {
    this.assertAvailable();
    const team = await this.getTeam(teamId, tenantId);
    await this.db.collection('enterprise_teams').doc(team.id).set({ ...team, status: 'ARCHIVED', updatedAt: this.timestamp() }, { merge: true });
    return { ...team, status: 'ARCHIVED' };
  }

  async restoreTeam({ tenantId, teamId }) {
    this.assertAvailable();
    // Restore resolves the team regardless of lifecycle status (getTeam only
    // returns ACTIVE teams), so an archived team becomes retrievable again.
    teamId = assertUuid(teamId, 'Team identifier');
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    const snapshot = await this.db.collection('enterprise_teams').doc(teamId).get();
    const team = snapshot.data() || {};
    if (!snapshot.exists || team.tenantId !== tenantId) {
      throw Object.assign(new Error('Team was not found'), { code: 'TEAM_NOT_FOUND', status: 404 });
    }
    await this.getWorkspace(team.workspaceId, tenantId);
    const now = this.timestamp();
    await this.db.collection('enterprise_teams').doc(teamId).set({ status: 'ACTIVE', updatedAt: now }, { merge: true });
    return { ...team, id: teamId, status: 'ACTIVE', updatedAt: now };
  }

  async listTeamMembers({ tenantId, teamId }) {
    this.assertAvailable();
    const team = await this.getTeam(teamId, tenantId);
    const snapshot = await this.db.collection('enterprise_team_members').where('teamId', '==', team.id).get();
    return snapshot.docs.map(document => ({ ...document.data(), id: document.id }))
      .filter(member => member.tenantId === tenantId && String(member.status || '').toUpperCase() === 'ACTIVE')
      .sort((left, right) => String(left.principalId).localeCompare(String(right.principalId)));
  }

  async addTeamMember({ tenantId, teamId, principalId }) {
    this.assertAvailable();
    principalId = assertPrincipalId(principalId);
    const team = await this.getTeam(teamId, tenantId);
    const membership = await this.getMembership(tenantId, principalId);
    if (membership.status !== 'ACTIVE') {
      throw Object.assign(new Error('Only an active tenant member can join a team'), { code: 'TENANT_MEMBERSHIP_INACTIVE', status: 409 });
    }
    const reference = this.db.collection('enterprise_team_members').doc(teamMemberDocumentId(team.id, principalId));
    const now = this.timestamp();
    await this.db.runTransaction(async transaction => {
      const snapshot = await transaction.get(reference);
      const current = snapshot.exists ? snapshot.data() || {} : {};
      transaction.set(reference, {
        id: reference.id, tenantId, teamId: team.id, workspaceId: team.workspaceId, principalId,
        status: 'ACTIVE', createdAt: current.createdAt || now, updatedAt: now,
      }, { merge: false });
    });
    return { id: reference.id, tenantId, teamId: team.id, workspaceId: team.workspaceId, principalId, status: 'ACTIVE' };
  }

  async removeTeamMember({ tenantId, teamId, principalId }) {
    this.assertAvailable();
    principalId = assertPrincipalId(principalId);
    const team = await this.getTeam(teamId, tenantId);
    const reference = this.db.collection('enterprise_team_members').doc(teamMemberDocumentId(team.id, principalId));
    const snapshot = await reference.get();
    if (!snapshot.exists || snapshot.data()?.tenantId !== tenantId || String(snapshot.data()?.status || '').toUpperCase() !== 'ACTIVE') {
      throw Object.assign(new Error('Team membership was not found'), { code: 'TEAM_MEMBERSHIP_NOT_FOUND', status: 404 });
    }
    await reference.set({ ...snapshot.data(), status: 'REMOVED', updatedAt: this.timestamp() }, { merge: false });
    return true;
  }

  async createWorkspace({ tenantId, name, isDefault = false }) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    const cleanName = compact(name, 120);
    if (cleanName.length < 2) throw Object.assign(new Error('Workspace name is invalid'), { code: 'INVALID_WORKSPACE', status: 400 });
    const id = crypto.randomUUID();
    const now = this.timestamp();
    await this.db.collection('enterprise_workspaces').doc(id).create({
      id, tenantId, name: cleanName, lifecycleState: 'ACTIVE', isDefault: isDefault === true, createdAt: now, updatedAt: now,
    });
    return { id, tenantId, name: cleanName, lifecycleState: 'ACTIVE', isDefault: isDefault === true };
  }

  async grantMembership({ tenantId, principalId, workspaceId = null, roles = ['MEMBER'], status = 'ACTIVE', invitationEmail = null, allowedRoles = [] }) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    principalId = assertPrincipalId(principalId);
    const normalizedRoles = normalizeRoles(roles, allowedRoles);
    const membershipStatus = String(status || 'ACTIVE').toUpperCase() === 'INVITED' ? 'INVITED' : 'ACTIVE';
    const normalizedEmail = invitationEmail ? String(invitationEmail).trim().toLowerCase().slice(0, 254) : null;
    if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      throw Object.assign(new Error('Invitation email is invalid'), { code: 'INVALID_INVITATION_EMAIL', status: 400 });
    }
    if (membershipStatus === 'INVITED' && !normalizedEmail) {
      throw Object.assign(new Error('An invitation requires the invited identity email'), { code: 'INVALID_INVITATION_EMAIL', status: 400 });
    }
    const tenant = await this.getTenant(tenantId);
    if (tenant.lifecycleState !== 'ACTIVE') throw Object.assign(new Error('Tenant is not active'), { code: 'TENANT_INACTIVE', status: 403 });
    let resolvedWorkspaceId = workspaceId ? assertUuid(workspaceId, 'Workspace identifier') : null;
    if (resolvedWorkspaceId) await this.getWorkspace(resolvedWorkspaceId, tenantId);
    if (!resolvedWorkspaceId) {
      const defaults = await this.listWorkspaces(tenantId);
      resolvedWorkspaceId = defaults.find(workspace => workspace.isDefault === true)?.id || defaults[0]?.id || null;
    }
    if (!resolvedWorkspaceId) throw Object.assign(new Error('Tenant has no active workspace'), { code: 'WORKSPACE_NOT_FOUND', status: 409 });
    const reference = this.db.collection('enterprise_memberships').doc(membershipDocumentId(tenantId, principalId));
    const workspaceReference = this.db.collection('enterprise_workspace_memberships').doc(workspaceMembershipDocumentId(resolvedWorkspaceId, principalId));
    const now = this.timestamp();
    let membership;
    await this.db.runTransaction(async transaction => {
      const snapshot = await transaction.get(reference);
      const current = snapshot.exists ? snapshot.data() || {} : {};
      membership = {
        id: reference.id,
        tenantId,
        principalId,
        canonicalPrincipalId: canonicalPrincipalId(principalId),
        workspaceId: resolvedWorkspaceId || current.workspaceId || null,
        status: membershipStatus,
        roles: normalizedRoles,
        revision: Number(current.revision || 0) + 1,
        personalTenant: false,
        invitationEmail: normalizedEmail,
        invitedAt: membershipStatus === 'INVITED' ? now : null,
        acceptedAt: membershipStatus === 'INVITED' ? null : (current.acceptedAt || null),
        createdAt: current.createdAt || now,
        updatedAt: now,
      };
      transaction.set(reference, membership, { merge: false });
      transaction.set(workspaceReference, { id: workspaceReference.id, tenantId, workspaceId: resolvedWorkspaceId, principalId, status: membershipStatus, createdAt: current.createdAt || now, updatedAt: now }, { merge: false });
    });
    return validateMembership(membership, principalId);
  }

  async assertNotLastOwner(tenantId, principalId, nextRoles, nextStatus) {
    if (nextRoles && nextRoles.includes('TENANT_OWNER')) return;
    const memberships = await this.listTenantMemberships(tenantId);
    const owners = memberships.filter(member => Array.isArray(member.roles) && member.roles.includes('TENANT_OWNER') && String(member.status || '').toUpperCase() === 'ACTIVE');
    if (owners.length === 1 && owners[0].principalId === principalId) {
      throw Object.assign(new Error('A tenant must retain at least one active owner'), { code: 'LAST_TENANT_OWNER', status: 409 });
    }
  }

  async updateTenantMembership({ tenantId, principalId, roles = null, status = null, workspaceId = null, allowedRoles = [] }) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    principalId = assertPrincipalId(principalId);
    const reference = this.db.collection('enterprise_memberships').doc(membershipDocumentId(tenantId, principalId));
    const snapshot = await reference.get();
    if (!snapshot.exists) throw Object.assign(new Error('Tenant membership was not found'), { code: 'TENANT_MEMBERSHIP_NOT_FOUND', status: 404 });
    const current = snapshot.data() || {};
    const nextRoles = roles ? normalizeRoles(roles, allowedRoles) : Array.isArray(current.roles) ? current.roles : [];
    const nextStatus = status ? String(status).toUpperCase() : String(current.status || 'ACTIVE').toUpperCase();
    if (nextRoles.includes('TENANT_OWNER') && nextStatus !== 'ACTIVE') {
      throw Object.assign(new Error('A tenant owner must remain active'), { code: 'TENANT_OWNER_MUST_BE_ACTIVE', status: 409 });
    }
    if (nextStatus === 'REMOVED' || !nextRoles.includes('TENANT_OWNER')) {
      await this.assertNotLastOwner(tenantId, principalId, nextRoles, nextStatus);
    }
    const now = this.timestamp();
    const membership = {
      ...current,
      tenantId,
      principalId,
      canonicalPrincipalId: canonicalPrincipalId(principalId),
      roles: nextRoles,
      status: nextStatus,
      revision: Number(current.revision || 0) + 1,
      updatedAt: now,
    };
    if (workspaceId) {
      membership.workspaceId = assertUuid(workspaceId, 'Workspace identifier');
      await this.getWorkspace(membership.workspaceId, tenantId);
    }
    await reference.set(membership, { merge: false });
    return validateMembership(membership, principalId);
  }

  async removeTenantMembership({ tenantId, principalId }) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    principalId = assertPrincipalId(principalId);
    await this.assertNotLastOwner(tenantId, principalId, [], 'REMOVED');
    const reference = this.db.collection('enterprise_memberships').doc(membershipDocumentId(tenantId, principalId));
    const snapshot = await reference.get();
    if (!snapshot.exists) throw Object.assign(new Error('Tenant membership was not found'), { code: 'TENANT_MEMBERSHIP_NOT_FOUND', status: 404 });
    await reference.update({ status: 'REMOVED', revision: Number((snapshot.data() || {}).revision || 0) + 1, updatedAt: this.timestamp() });
    return true;
  }

  async listMemberships(principalId) {
    this.assertAvailable();
    principalId = assertPrincipalId(principalId);
    const snapshot = await this.db.collection('enterprise_memberships').where('principalId', '==', principalId).get();
    const memberships = snapshot.docs.map(document => validateMembership(document.data(), principalId)).filter(membership => membership.status === 'ACTIVE');
    const joined = await Promise.all(memberships.map(async membership => ({
      membership,
      tenant: await this.getTenant(membership.tenantId),
    })));
    return joined.filter(item => item.tenant.lifecycleState === 'ACTIVE');
  }

  async listTenantMemberships(tenantId) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    const snapshot = await this.db.collection('enterprise_memberships').where('tenantId', '==', tenantId).get();
    return snapshot.docs.map(document => ({ ...document.data(), id: document.id }))
      .filter(membership => String(membership.status || '').toUpperCase() !== 'REMOVED')
      .sort((left, right) => String(left.principalId).localeCompare(String(right.principalId)));
  }

  async resolveMembership({ principalId, requestedTenantId = null, requestedWorkspaceId = null, profile = {} }) {
    this.assertAvailable();
    principalId = assertPrincipalId(principalId);
    requestedTenantId = normalizeRequestedTenantId(requestedTenantId);
    requestedWorkspaceId = normalizeRequestedWorkspaceId(requestedWorkspaceId);
    if (!requestedTenantId) {
      const personal = await this.ensurePersonalTenant(principalId, profile);
      requestedTenantId = personal.tenantId;
      requestedWorkspaceId = requestedWorkspaceId || personal.workspaceId;
    }
    const [tenant, membership] = await Promise.all([
      this.getTenant(requestedTenantId),
      this.getMembership(requestedTenantId, principalId),
    ]);
    if (tenant.lifecycleState !== 'ACTIVE') throw Object.assign(new Error('Tenant is not active'), { code: 'TENANT_INACTIVE', status: 403 });
    // An invitation is accepted exactly once — at the moment the invited
    // identity first resolves this tenant. The transition is persisted so the
    // acceptance is durable and auditable.
    const accepted = membership.status === 'INVITED'
      ? await this.acceptMembership(membership)
      : membership;
    const workspaceId = requestedWorkspaceId || accepted.workspaceId || null;
    const workspace = workspaceId ? await this.getWorkspace(workspaceId, requestedTenantId) : null;
    if (workspace && !await this.hasWorkspaceAccess({ tenantId: requestedTenantId, workspaceId: workspace.id, principalId, roles: accepted.roles })) {
      throw Object.assign(new Error('Workspace membership was not found'), { code: 'WORKSPACE_MEMBERSHIP_NOT_FOUND', status: 404 });
    }
    return { tenant, membership: accepted, workspace };
  }

  async acceptMembership(membership) {
    this.assertAvailable();
    const reference = this.db.collection('enterprise_memberships').doc(membership.id);
    const now = this.timestamp();
    let accepted;
    await this.db.runTransaction(async transaction => {
      const snapshot = await transaction.get(reference);
      const current = snapshot.exists ? snapshot.data() || {} : {};
      if (String(current.status || '').toUpperCase() !== 'INVITED') {
        accepted = { ...current, id: reference.id };
        return;
      }
      accepted = {
        ...current,
        status: 'ACTIVE',
        acceptedAt: now,
        revision: Number(current.revision || 0) + 1,
        updatedAt: now,
      };
      transaction.set(reference, accepted, { merge: false });
      if (accepted.workspaceId) {
        const workspaceReference = this.db.collection('enterprise_workspace_memberships').doc(workspaceMembershipDocumentId(accepted.workspaceId, accepted.principalId));
        transaction.set(workspaceReference, { status: 'ACTIVE', updatedAt: now }, { merge: true });
      }
    });
    return validateMembership(accepted, membership.principalId);
  }

  async markInvitationDelivery({ tenantId, principalId, deliveryState, deliveredAt }) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    principalId = assertPrincipalId(principalId);
    const reference = this.db.collection('enterprise_memberships').doc(membershipDocumentId(tenantId, principalId));
    await reference.set({
      invitationDeliveryState: String(deliveryState || 'DELIVERY_UNKNOWN').slice(0, 40),
      invitationDeliveredAt: deliveredAt || new Date().toISOString(),
      updatedAt: this.timestamp(),
    }, { merge: true });
    return true;
  }

  async provisionTenant({ ownerPrincipalId, displayName, slug, isolationTier = 'STANDARD', dataPlane = DEFAULT_DATA_PLANE, region = null }) {
    this.assertAvailable();
    ownerPrincipalId = assertPrincipalId(ownerPrincipalId);
    const cleanName = compact(displayName, 120);
    const cleanSlug = compact(slug, 80).toLowerCase();
    if (cleanName.length < 2 || !/^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/.test(cleanSlug)) {
      throw Object.assign(new Error('Tenant name or slug is invalid'), { code: 'INVALID_TENANT', status: 400 });
    }
    const tenantId = crypto.randomUUID();
    const workspaceId = crypto.randomUUID();
    const normalizedPlane = normalizeDataPlane({ ...dataPlane, ...(region ? { region } : {}) });
    const now = this.timestamp();
    const membershipId = membershipDocumentId(tenantId, ownerPrincipalId);
    await this.db.runTransaction(async transaction => {
      const duplicate = await transaction.get(this.db.collection('enterprise_tenant_slugs').doc(cleanSlug));
      if (duplicate.exists) throw Object.assign(new Error('Tenant slug is already in use'), { code: 'TENANT_SLUG_CONFLICT', status: 409 });
      transaction.create(this.db.collection('enterprise_tenant_slugs').doc(cleanSlug), { tenantId, createdAt: now });
      transaction.create(this.db.collection('enterprise_tenants').doc(tenantId), {
        id: tenantId, slug: cleanSlug, displayName: cleanName, lifecycleState: 'ACTIVE',
        isolationTier: normalizeTier(isolationTier), dataPlane: normalizedPlane, policyVersion: 1,
        createdAt: now, updatedAt: now,
      });
      transaction.create(this.db.collection('enterprise_workspaces').doc(workspaceId), {
        id: workspaceId, tenantId, name: 'Default Workspace', lifecycleState: 'ACTIVE', isDefault: true,
        createdAt: now, updatedAt: now,
      });
      transaction.create(this.db.collection('enterprise_memberships').doc(membershipId), {
        id: membershipId, tenantId, principalId: ownerPrincipalId, canonicalPrincipalId: canonicalPrincipalId(ownerPrincipalId), workspaceId, status: 'ACTIVE',
        roles: ['TENANT_OWNER'], revision: 1, personalTenant: false, createdAt: now, updatedAt: now,
      });
      transaction.create(this.db.collection('enterprise_workspace_memberships').doc(workspaceMembershipDocumentId(workspaceId, ownerPrincipalId)), {
        id: workspaceMembershipDocumentId(workspaceId, ownerPrincipalId), tenantId, workspaceId, principalId: ownerPrincipalId, status: 'ACTIVE', createdAt: now, updatedAt: now,
      });
    });
    return { tenantId, workspaceId, membershipId };
  }
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
    const cleanName = compact(name, 100);
    if (cleanName.length < 2) throw Object.assign(new Error('Team name is invalid'), { code: 'INVALID_TEAM', status: 400 });
    const team = await this.getTeam(teamId, tenantId);
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

  async grantMembership({ tenantId, principalId, workspaceId = null, roles = ['MEMBER'], status = 'ACTIVE', invitationEmail = null, allowedRoles = [] }) {
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    principalId = assertPrincipalId(principalId);
    const membershipStatus = String(status || 'ACTIVE').toUpperCase() === 'INVITED' ? 'INVITED' : 'ACTIVE';
    const normalizedEmail = invitationEmail ? String(invitationEmail).trim().toLowerCase().slice(0, 254) : null;
    if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      throw Object.assign(new Error('Invitation email is invalid'), { code: 'INVALID_INVITATION_EMAIL', status: 400 });
    }
    if (membershipStatus === 'INVITED' && !normalizedEmail) {
      throw Object.assign(new Error('An invitation requires the invited identity email'), { code: 'INVALID_INVITATION_EMAIL', status: 400 });
    }
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
    const current = this.memberships.get(id) || {};
    const now = new Date().toISOString();
    const membership = {
      id, tenantId, principalId, canonicalPrincipalId: canonicalPrincipalId(principalId), workspaceId: resolvedWorkspaceId || current.workspaceId || null,
      status: membershipStatus, roles: normalizeRoles(roles, allowedRoles), revision: Number(current.revision || 0) + 1,
      personalTenant: false,
      invitationEmail: normalizedEmail,
      invitedAt: membershipStatus === 'INVITED' ? now : null,
      acceptedAt: membershipStatus === 'INVITED' ? null : (current.acceptedAt || null),
      createdAt: current.createdAt || now,
      updatedAt: now,
    };
    this.memberships.set(id, membership);
    this.workspaceMemberships.set(workspaceMembershipDocumentId(resolvedWorkspaceId, principalId), { tenantId, workspaceId: resolvedWorkspaceId, principalId, status: membershipStatus });
    return validateMembership(membership, principalId);
  }

  async assertNotLastOwner(tenantId, principalId, nextRoles, nextStatus) {
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
    return true;
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

  async resolveMembership({ principalId, requestedTenantId = null, requestedWorkspaceId = null, profile = {} }) {
    principalId = assertPrincipalId(principalId);
    if (!requestedTenantId) {
      const personal = await this.ensurePersonalTenant(principalId, profile);
      requestedTenantId = personal.tenantId;
      requestedWorkspaceId = requestedWorkspaceId || personal.workspaceId;
    }
    const tenant = await this.getTenant(requestedTenantId);
    if (tenant.lifecycleState !== 'ACTIVE') throw Object.assign(new Error('Tenant is not active'), { code: 'TENANT_INACTIVE', status: 403 });
    const membership = await this.getMembership(requestedTenantId, principalId);
    // Invitation acceptance: the first enterprise access by the invited
    // identity durably transitions the membership to ACTIVE.
    const accepted = membership.status === 'INVITED'
      ? await this.acceptMembership(membership)
      : membership;
    const workspace = await this.getWorkspace(requestedWorkspaceId || accepted.workspaceId, requestedTenantId);
    if (!await this.hasWorkspaceAccess({ tenantId: requestedTenantId, workspaceId: workspace.id, principalId, roles: accepted.roles })) {
      throw Object.assign(new Error('Workspace membership was not found'), { code: 'WORKSPACE_MEMBERSHIP_NOT_FOUND', status: 404 });
    }
    return { tenant, membership: accepted, workspace };
  }

  async acceptMembership(membership) {
    const current = this.memberships.get(membership.id) || membership;
    if (String(current.status || '').toUpperCase() !== 'INVITED') return current;
    const now = new Date().toISOString();
    const accepted = { ...current, status: 'ACTIVE', acceptedAt: now, revision: Number(current.revision || 0) + 1, updatedAt: now };
    this.memberships.set(membership.id, accepted);
    if (accepted.workspaceId) {
      const workspaceMembershipId = workspaceMembershipDocumentId(accepted.workspaceId, accepted.principalId);
      const workspaceMembership = this.workspaceMemberships.get(workspaceMembershipId);
      if (workspaceMembership) this.workspaceMemberships.set(workspaceMembershipId, { ...workspaceMembership, status: 'ACTIVE' });
    }
    return validateMembership(accepted, membership.principalId);
  }

  async markInvitationDelivery({ tenantId, principalId, deliveryState, deliveredAt }) {
    const id = membershipDocumentId(assertUuid(tenantId, 'Tenant identifier'), assertPrincipalId(principalId));
    const current = this.memberships.get(id);
    if (!current) return false;
    this.memberships.set(id, {
      ...current,
      invitationDeliveryState: String(deliveryState || 'DELIVERY_UNKNOWN').slice(0, 40),
      invitationDeliveredAt: deliveredAt || new Date().toISOString(),
    });
    return true;
  }

  async provisionTenant({ ownerPrincipalId, displayName, slug, isolationTier = 'STANDARD', dataPlane = DEFAULT_DATA_PLANE, region = null }) {
    ownerPrincipalId = assertPrincipalId(ownerPrincipalId);
    const tenantId = crypto.randomUUID();
    const workspaceId = crypto.randomUUID();
    const tenant = { id: tenantId, slug: compact(slug, 80).toLowerCase(), displayName: compact(displayName, 120), lifecycleState: 'ACTIVE', isolationTier: normalizeTier(isolationTier), dataPlane: normalizeDataPlane({ ...dataPlane, ...(region ? { region } : {}) }), policyVersion: 1 };
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
  FirestoreTenantRegistry,
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
