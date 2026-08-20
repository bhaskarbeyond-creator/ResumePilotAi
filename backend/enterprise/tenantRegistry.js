'use strict';

const crypto = require('crypto');
const {
  DATA_PLANE_TYPES,
  ISOLATION_TIERS,
  MEMBERSHIP_STATES,
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
  id: 'shared-primary',
  type: 'SHARED_POSTGRES',
  region: 'default',
  routingVersion: 1,
  storageProfile: 'shared',
  cacheProfile: 'shared',
  queueProfile: 'shared',
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
  if (!DATA_PLANE_TYPES.includes(type)) throw Object.assign(new Error('Unsupported data plane'), { code: 'INVALID_TENANT_DATA_PLANE', status: 400 });
  return {
    id: compact(input.id || DEFAULT_DATA_PLANE.id, 120),
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

function normalizeRoles(roles = []) {
  const normalized = [...new Set((Array.isArray(roles) ? roles : []).map(role => String(role || '').toUpperCase()).filter(role => Object.hasOwn(TENANT_ROLES, role)))];
  if (!normalized.length) throw Object.assign(new Error('At least one valid tenant role is required'), { code: 'INVALID_TENANT_ROLE', status: 400 });
  return normalized;
}

function defaultTenantConfiguration(tenantId) {
  return {
    tenantId,
    revision: 1,
    aiPolicy: { version: 1, allowedProviders: [], primaryModel: '' },
    quotaPolicy: { aiRequestsPerMinute: 12, aiRequestsPerDay: 100, renderConcurrency: 2 },
    retentionPolicy: { aiMemoryEnabled: false, retentionDays: 30 },
    securityPolicy: { requireMfaForAdmins: false, supportAccessRequiresApproval: true },
    identityPolicy: { ssoMode: 'NONE', scimEnabled: false, sessionMaxMinutes: 480 },
  };
}

function normalizeTenantConfiguration(tenantId, input = {}, existing = defaultTenantConfiguration(tenantId)) {
  tenantId = assertUuid(tenantId, 'Tenant identifier');
  const aiPolicy = input.aiPolicy && typeof input.aiPolicy === 'object' ? input.aiPolicy : existing.aiPolicy;
  const allowedProviders = Array.isArray(aiPolicy.allowedProviders)
    ? [...new Set(aiPolicy.allowedProviders.map(provider => String(provider).toLowerCase()).filter(provider => /^[a-z0-9_-]{2,40}$/.test(provider)))].slice(0, 10)
    : [...(existing.aiPolicy?.allowedProviders || [])];
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
    aiPolicy: { version: Number(existing.aiPolicy?.version || 0) + 1, allowedProviders, primaryModel },
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
  return {
    ...record,
    id: String(record.id || ''),
    status,
    roles: normalizeRoles(record.roles),
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

  async listWorkspaces(tenantId) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    const snapshot = await this.db.collection('enterprise_workspaces').where('tenantId', '==', tenantId).get();
    return snapshot.docs.map(document => ({ ...document.data(), id: document.id }))
      .filter(workspace => String(workspace.lifecycleState || '').toUpperCase() === 'ACTIVE')
      .sort((left, right) => Number(right.isDefault === true) - Number(left.isDefault === true) || String(left.name).localeCompare(String(right.name)));
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

  async listTeams({ tenantId, workspaceId = null }) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    const snapshot = await this.db.collection('enterprise_teams').where('tenantId', '==', tenantId).get();
    return snapshot.docs.map(document => ({ ...document.data(), id: document.id }))
      .filter(team => team.status === 'ACTIVE' && (!workspaceId || team.workspaceId === workspaceId))
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

  async grantMembership({ tenantId, principalId, workspaceId = null, roles = ['MEMBER'] }) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    principalId = assertPrincipalId(principalId);
    const normalizedRoles = normalizeRoles(roles);
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
        status: 'ACTIVE',
        roles: normalizedRoles,
        revision: Number(current.revision || 0) + 1,
        personalTenant: false,
        createdAt: current.createdAt || now,
        updatedAt: now,
      };
      transaction.set(reference, membership, { merge: false });
      transaction.set(workspaceReference, { id: workspaceReference.id, tenantId, workspaceId: resolvedWorkspaceId, principalId, status: 'ACTIVE', createdAt: current.createdAt || now, updatedAt: now }, { merge: false });
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

  async updateTenantMembership({ tenantId, principalId, roles = null, status = null, workspaceId = null }) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    principalId = assertPrincipalId(principalId);
    const reference = this.db.collection('enterprise_memberships').doc(membershipDocumentId(tenantId, principalId));
    const snapshot = await reference.get();
    if (!snapshot.exists) throw Object.assign(new Error('Tenant membership was not found'), { code: 'TENANT_MEMBERSHIP_NOT_FOUND', status: 404 });
    const current = snapshot.data() || {};
    const nextRoles = roles ? normalizeRoles(roles) : Array.isArray(current.roles) ? current.roles : [];
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
    const workspaceId = requestedWorkspaceId || membership.workspaceId || null;
    const workspace = workspaceId ? await this.getWorkspace(workspaceId, requestedTenantId) : null;
    if (workspace && !await this.hasWorkspaceAccess({ tenantId: requestedTenantId, workspaceId: workspace.id, principalId, roles: membership.roles })) {
      throw Object.assign(new Error('Workspace membership was not found'), { code: 'WORKSPACE_MEMBERSHIP_NOT_FOUND', status: 404 });
    }
    return { tenant, membership, workspace };
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

  async listWorkspaces(tenantId) {
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    return [...this.workspaces.values()]
      .filter(workspace => workspace.tenantId === tenantId && workspace.lifecycleState === 'ACTIVE')
      .sort((left, right) => Number(right.isDefault === true) - Number(left.isDefault === true) || String(left.name).localeCompare(String(right.name)))
      .map(workspace => ({ ...workspace }));
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

  async listTeams({ tenantId, workspaceId = null }) {
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    return [...this.teams.values()]
      .filter(team => team.tenantId === tenantId && team.status === 'ACTIVE' && (!workspaceId || team.workspaceId === workspaceId))
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

  async createWorkspace({ tenantId, name, isDefault = false }) {
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    const cleanName = compact(name, 120);
    if (cleanName.length < 2) throw Object.assign(new Error('Workspace name is invalid'), { code: 'INVALID_WORKSPACE', status: 400 });
    const workspace = { id: crypto.randomUUID(), tenantId, name: cleanName, lifecycleState: 'ACTIVE', isDefault: isDefault === true };
    this.workspaces.set(workspace.id, workspace);
    return { ...workspace };
  }

  async grantMembership({ tenantId, principalId, workspaceId = null, roles = ['MEMBER'] }) {
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    principalId = assertPrincipalId(principalId);
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
    const membership = {
      id, tenantId, principalId, canonicalPrincipalId: canonicalPrincipalId(principalId), workspaceId: resolvedWorkspaceId || current.workspaceId || null,
      status: 'ACTIVE', roles: normalizeRoles(roles), revision: Number(current.revision || 0) + 1,
      personalTenant: false,
    };
    this.memberships.set(id, membership);
    this.workspaceMemberships.set(workspaceMembershipDocumentId(resolvedWorkspaceId, principalId), { tenantId, workspaceId: resolvedWorkspaceId, principalId, status: 'ACTIVE' });
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

  async updateTenantMembership({ tenantId, principalId, roles = null, status = null, workspaceId = null }) {
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    principalId = assertPrincipalId(principalId);
    const id = membershipDocumentId(tenantId, principalId);
    const current = this.memberships.get(id);
    if (!current) throw Object.assign(new Error('Tenant membership was not found'), { code: 'TENANT_MEMBERSHIP_NOT_FOUND', status: 404 });
    const nextRoles = roles ? normalizeRoles(roles) : Array.isArray(current.roles) ? current.roles : [];
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
    const workspace = await this.getWorkspace(requestedWorkspaceId || membership.workspaceId, requestedTenantId);
    if (!await this.hasWorkspaceAccess({ tenantId: requestedTenantId, workspaceId: workspace.id, principalId, roles: membership.roles })) {
      throw Object.assign(new Error('Workspace membership was not found'), { code: 'WORKSPACE_MEMBERSHIP_NOT_FOUND', status: 404 });
    }
    return { tenant, membership, workspace };
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
  DEFAULT_DATA_PLANE,
  FirestoreTenantRegistry,
  InMemoryTenantRegistry,
  identityMapDocumentId,
  membershipDocumentId,
  normalizeDataPlane,
  normalizeTier,
  validateMembership,
  validateTenantRecord,
};
