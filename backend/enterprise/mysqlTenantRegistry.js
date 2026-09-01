'use strict';

const crypto = require('crypto');
const { queueEmailInTransaction } = require('../services/notificationOutbox');
const {
  DATA_PLANE_TYPES,
  ISOLATION_TIERS,
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

function normalizeInvitationEmail(value) {
  const email = compact(value, 254).toLowerCase();
  if (!/^[^\s@,;<>]{1,64}@[^\s@,;<>]{1,189}$/.test(email)) {
    throw Object.assign(new Error('A valid invitation email address is required'), { code: 'INVALID_INVITATION_EMAIL', status: 400 });
  }
  return email;
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
    commercials: null,
  };
}

function normalizeTenantConfiguration(tenantId, input = {}, existing = defaultTenantConfiguration(tenantId)) {
  tenantId = assertUuid(tenantId, 'Tenant identifier');
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw Object.assign(new Error('Tenant configuration must be an object'), { code: 'INVALID_TENANT_CONFIGURATION', status: 400 });
  }
  const hasAiPolicy = Object.hasOwn(input, 'aiPolicy');
  const aiPolicy = hasAiPolicy && input.aiPolicy && typeof input.aiPolicy === 'object' ? input.aiPolicy : existing.aiPolicy;
  if (Object.hasOwn(aiPolicy || {}, 'customProviderKeys')) {
    throw Object.assign(new Error('Tenant provider credentials require the encrypted credential store'), { code: 'TENANT_PROVIDER_CREDENTIALS_UNSUPPORTED', status: 501 });
  }
  const allowedProviders = Array.isArray(aiPolicy.allowedProviders)
    ? [...new Set(aiPolicy.allowedProviders.map(provider => String(provider).toLowerCase()).filter(provider => /^[a-z0-9_-]{2,40}$/.test(provider)))].slice(0, 10)
    : [...(existing.aiPolicy?.allowedProviders || [])];
  const allowedModels = Array.isArray(aiPolicy.allowedModels)
    ? [...new Set(aiPolicy.allowedModels.map(model => String(model).trim()).filter(model => /^[A-Za-z0-9._:/-]{2,150}$/.test(model)))].slice(0, 25)
    : [...(existing.aiPolicy?.allowedModels || [])];
  const hasQuotaPolicy = Object.hasOwn(input, 'quotaPolicy');
  const quotaPolicy = hasQuotaPolicy && input.quotaPolicy && typeof input.quotaPolicy === 'object' ? input.quotaPolicy : existing.quotaPolicy;
  const bounded = (value, fallback, min, max) => Number.isInteger(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback;
  const hasRetentionPolicy = Object.hasOwn(input, 'retentionPolicy');
  const retentionPolicy = hasRetentionPolicy && input.retentionPolicy && typeof input.retentionPolicy === 'object' ? input.retentionPolicy : existing.retentionPolicy;
  const hasSecurityPolicy = Object.hasOwn(input, 'securityPolicy');
  const securityPolicy = hasSecurityPolicy && input.securityPolicy && typeof input.securityPolicy === 'object' ? input.securityPolicy : existing.securityPolicy;
  const hasIdentityPolicy = Object.hasOwn(input, 'identityPolicy');
  const identityPolicy = hasIdentityPolicy && input.identityPolicy && typeof input.identityPolicy === 'object' ? input.identityPolicy : existing.identityPolicy;
  const ssoMode = ['NONE', 'OIDC', 'SAML'].includes(String(identityPolicy.ssoMode || '').toUpperCase())
    ? String(identityPolicy.ssoMode).toUpperCase()
    : String(existing.identityPolicy?.ssoMode || 'NONE').toUpperCase();
  const primaryModel = /^[A-Za-z0-9._:/-]{2,150}$/.test(String(aiPolicy.primaryModel || '').trim())
    ? String(aiPolicy.primaryModel || '').trim()
    : String(existing.aiPolicy?.primaryModel || '');

  let commercials = existing.commercials || null;
  if (Object.hasOwn(input, 'commercials')) {
    const candidate = input.commercials;
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      throw Object.assign(new Error('Tenant commercial settings must be an object'), { code: 'INVALID_TENANT_COMMERCIALS', status: 400 });
    }
    const plan = compact(candidate.plan, 120);
    const seatLimit = Number(candidate.seatLimit);
    const currency = String(candidate.currency || '').trim().toUpperCase();
    const billingStatus = String(candidate.billingStatus || '').trim().toUpperCase();
    if (plan.length < 2 || !Number.isInteger(seatLimit) || seatLimit < 1 || seatLimit > 100_000 || !/^[A-Z]{3}$/.test(currency) || !['TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED'].includes(billingStatus)) {
      throw Object.assign(new Error('Tenant commercial settings are invalid'), { code: 'INVALID_TENANT_COMMERCIALS', status: 400 });
    }
    commercials = { plan, seatLimit, currency, billingStatus };
  }

  return {
    tenantId,
    revision: Number(existing.revision || 0) + 1,
    aiPolicy: hasAiPolicy
      ? { version: Number(existing.aiPolicy?.version || 0) + 1, allowedProviders, allowedModels, primaryModel }
      : { ...(existing.aiPolicy || {}) },
    quotaPolicy: hasQuotaPolicy ? {
      aiRequestsPerMinute: bounded(quotaPolicy.aiRequestsPerMinute, existing.quotaPolicy?.aiRequestsPerMinute || 12, 1, 10_000),
      aiRequestsPerDay: bounded(quotaPolicy.aiRequestsPerDay, existing.quotaPolicy?.aiRequestsPerDay || 100, 1, 10_000_000),
      renderConcurrency: bounded(quotaPolicy.renderConcurrency, existing.quotaPolicy?.renderConcurrency || 2, 1, 100),
    } : { ...(existing.quotaPolicy || {}) },
    retentionPolicy: hasRetentionPolicy ? {
      aiMemoryEnabled: retentionPolicy.aiMemoryEnabled === true,
      retentionDays: bounded(retentionPolicy.retentionDays, existing.retentionPolicy?.retentionDays || 30, 1, 3650),
    } : { ...(existing.retentionPolicy || {}) },
    securityPolicy: hasSecurityPolicy ? {
      requireMfaForAdmins: securityPolicy.requireMfaForAdmins === true,
      supportAccessRequiresApproval: securityPolicy.supportAccessRequiresApproval !== false,
    } : { ...(existing.securityPolicy || {}) },
    identityPolicy: hasIdentityPolicy ? {
      ssoMode,
      scimEnabled: ssoMode !== 'NONE' && identityPolicy.scimEnabled === true,
      sessionMaxMinutes: bounded(identityPolicy.sessionMaxMinutes, existing.identityPolicy?.sessionMaxMinutes || 480, 15, 10_080),
    } : { ...(existing.identityPolicy || {}) },
    customRoles: Object.hasOwn(input, 'customRoles') ? normalizeCustomRoles(input.customRoles, existing) : { ...(existing.customRoles || {}) },
    commercials,
  };
}

function parseJsonField(val, fallback = null) {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
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
    dataPlane: normalizeDataPlane(record.dataPlane ? parseJsonField(record.dataPlane, {}) : DEFAULT_DATA_PLANE),
    createdAt: record.createdAt || record.created_at || null,
    updatedAt: record.updatedAt || record.updated_at || null,
  };
}

function validateMembership(record, principalId) {
  if (!record || record.principalId !== principalId) throw Object.assign(new Error('Tenant membership was not found'), { code: 'TENANT_MEMBERSHIP_NOT_FOUND', status: 404 });
  const status = String(record.status || '').toUpperCase();
  if (!MEMBERSHIP_STATES.includes(status)) throw Object.assign(new Error('Tenant membership state is invalid'), { code: 'TENANT_ROUTE_INVALID', status: 503 });
  const roles = Array.isArray(record.roles) ? record.roles : parseJsonField(record.roles, []);
  return {
    ...record,
    id: String(record.id || ''),
    status,
    roles: normalizeRoles(roles, roles.filter(role => CUSTOM_ROLE_PATTERN.test(String(role || '').toUpperCase()))),
    canonicalPrincipalId: (() => {
      const expected = canonicalPrincipalId(principalId);
      if (record.canonicalPrincipalId && assertUuid(record.canonicalPrincipalId, 'Canonical principal identifier') !== expected) {
        throw Object.assign(new Error('Tenant membership canonical principal does not match its verified subject'), { code: 'TENANT_IDENTITY_MISMATCH', status: 503 });
      }
      return expected;
    })(),
    personalTenant: Boolean(record.personalTenant || record.personal_tenant),
    revision: Number(record.revision || 1),
    invitationEmail: record.invitationEmail || null,
    invitedAt: record.invitedAt || null,
    acceptedAt: record.acceptedAt || null,
    invitationExpiresAt: record.invitationExpiresAt || null,
    invitationState: record.invitationState || null,
    invitationDeliveryState: record.invitationDeliveryState || null,
    invitationNotificationId: record.invitationNotificationId || null,
    invitationQueueRevision: record.invitationQueueRevision == null ? null : Number(record.invitationQueueRevision),
    createdAt: record.createdAt || record.created_at || null,
    updatedAt: record.updatedAt || record.updated_at || null,
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

function personalTenantName(profile = {}) {
  const name = compact(profile.displayName || profile.firstname || '', 100);
  return name ? `${name}'s Personal Workspace` : 'Personal Workspace';
}

class MySqlTenantRegistry {
  constructor({ pool }) {
    if (!pool) {
      const { getPool } = require('../database/mysql');
      this.pool = getPool();
    } else {
      this.pool = pool;
    }
  }

  assertAvailable() {
    if (!this.pool || this.pool._closed) {
      throw Object.assign(new Error('Tenant control plane is unavailable: MySQL pool is closed'), { code: 'TENANT_CONTROL_PLANE_UNAVAILABLE', status: 503 });
    }
  }

  async ensurePersonalTenant(principalId, profile = {}) {
    this.assertAvailable();
    principalId = assertPrincipalId(principalId);

    // Check if principal already has personal tenant
    const [idRows] = await this.pool.query(
      'SELECT personalTenantId, defaultWorkspaceId FROM enterprise_principal_tenants WHERE principalId = ?',
      [principalId]
    );
    if (idRows.length > 0) {
      return {
        tenantId: assertUuid(idRows[0].personalTenantId, 'Personal tenant identifier'),
        workspaceId: assertUuid(idRows[0].defaultWorkspaceId, 'Personal workspace identifier'),
      };
    }

    const tenantId = crypto.randomUUID();
    const workspaceId = crypto.randomUUID();
    const membershipId = membershipDocumentId(tenantId, principalId);
    const wsMemId = workspaceMembershipDocumentId(workspaceId, principalId);
    const slug = `personal-${stablePrincipalHash(principalId).slice(0, 12)}`;
    const displayName = personalTenantName(profile);
    const dataPlane = { ...DEFAULT_DATA_PLANE };

    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      await conn.query(
        `INSERT INTO enterprise_tenants (id, slug, displayName, lifecycleState, isolationTier, dataPlane, policyVersion, legacyOwnerUid)
         VALUES (?, ?, ?, 'ACTIVE', 'STANDARD', ?, 1, ?)`,
        [tenantId, slug, displayName, JSON.stringify(dataPlane), principalId]
      );

      await conn.query(
        `INSERT INTO enterprise_workspaces (id, tenantId, name, lifecycleState, isDefault)
         VALUES (?, ?, 'Personal', 'ACTIVE', TRUE)`,
        [workspaceId, tenantId]
      );

      await conn.query(
        `INSERT INTO enterprise_memberships (id, tenantId, principalId, canonicalPrincipalId, workspaceId, status, roles, revision, personalTenant)
         VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, 1, TRUE)`,
        [membershipId, tenantId, principalId, canonicalPrincipalId(principalId), workspaceId, JSON.stringify(['TENANT_OWNER'])]
      );

      await conn.query(
        `INSERT INTO enterprise_workspace_memberships (id, tenantId, workspaceId, principalId, status)
         VALUES (?, ?, ?, ?, 'ACTIVE')`,
        [wsMemId, tenantId, workspaceId, principalId]
      );

      await conn.query(
        `INSERT INTO enterprise_principal_tenants (principalId, personalTenantId, defaultWorkspaceId)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE personalTenantId = VALUES(personalTenantId), defaultWorkspaceId = VALUES(defaultWorkspaceId)`,
        [principalId, tenantId, workspaceId]
      );

      await conn.commit();
      return { tenantId, workspaceId };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async createTenant({ id = null, slug, displayName, isolationTier = 'STANDARD', dataPlane = {}, policyVersion = 1, legacyOwnerUid = null }) {
    this.assertAvailable();
    const tenantId = id ? assertUuid(id, 'Tenant identifier') : crypto.randomUUID();
    const cleanSlug = compact(slug, 120).toLowerCase();
    const cleanDisplayName = compact(displayName, 120);
    if (!cleanSlug || cleanSlug.length < 2) throw Object.assign(new Error('Tenant slug is invalid'), { code: 'INVALID_TENANT_SLUG', status: 400 });
    if (!cleanDisplayName || cleanDisplayName.length < 2) throw Object.assign(new Error('Tenant display name is invalid'), { code: 'INVALID_TENANT_NAME', status: 400 });

    const normalizedDataPlane = normalizeDataPlane(dataPlane);
    const tier = normalizeTier(isolationTier);

    const [existing] = await this.pool.query('SELECT id FROM enterprise_tenants WHERE slug = ?', [cleanSlug]);
    if (existing.length > 0) {
      throw Object.assign(new Error('Tenant slug is already taken'), { code: 'TENANT_SLUG_CONFLICT', status: 409 });
    }

    const defaultWorkspaceId = crypto.randomUUID();
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      await conn.query(
        `INSERT INTO enterprise_tenants (id, slug, displayName, lifecycleState, isolationTier, dataPlane, policyVersion, legacyOwnerUid)
         VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?, ?)`,
        [tenantId, cleanSlug, cleanDisplayName, tier, JSON.stringify(normalizedDataPlane), Number(policyVersion) || 1, legacyOwnerUid || null]
      );

      await conn.query(
        `INSERT INTO enterprise_workspaces (id, tenantId, name, lifecycleState, isDefault)
         VALUES (?, ?, 'Default', 'ACTIVE', TRUE)`,
        [defaultWorkspaceId, tenantId]
      );

      const defaultConfig = defaultTenantConfiguration(tenantId);
      await conn.query(
        `INSERT INTO enterprise_tenant_configurations (tenantId, revision, customRoles, aiPolicy, quotaPolicy, retentionPolicy, securityPolicy, identityPolicy)
         VALUES (?, 1, ?, ?, ?, ?, ?, ?)`,
        [
          tenantId,
          JSON.stringify(defaultConfig.customRoles),
          JSON.stringify(defaultConfig.aiPolicy),
          JSON.stringify(defaultConfig.quotaPolicy),
          JSON.stringify(defaultConfig.retentionPolicy),
          JSON.stringify(defaultConfig.securityPolicy),
          JSON.stringify(defaultConfig.identityPolicy),
        ]
      );

      if (legacyOwnerUid) {
        const membershipId = membershipDocumentId(tenantId, legacyOwnerUid);
        const wsMemId = workspaceMembershipDocumentId(defaultWorkspaceId, legacyOwnerUid);
        await conn.query(
          `INSERT INTO enterprise_memberships (id, tenantId, principalId, canonicalPrincipalId, workspaceId, status, roles, revision, personalTenant)
           VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, 1, FALSE)`,
          [membershipId, tenantId, legacyOwnerUid, canonicalPrincipalId(legacyOwnerUid), defaultWorkspaceId, JSON.stringify(['TENANT_OWNER'])]
        );
        await conn.query(
          `INSERT INTO enterprise_workspace_memberships (id, tenantId, workspaceId, principalId, status)
           VALUES (?, ?, ?, ?, 'ACTIVE')`,
          [wsMemId, tenantId, defaultWorkspaceId, legacyOwnerUid]
        );
      }

      await conn.commit();

      return {
        id: tenantId,
        slug: cleanSlug,
        displayName: cleanDisplayName,
        lifecycleState: 'ACTIVE',
        isolationTier: tier,
        dataPlane: normalizedDataPlane,
        policyVersion: Number(policyVersion) || 1,
        legacyOwnerUid: legacyOwnerUid || null,
        defaultWorkspaceId,
      };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
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
    const tier = normalizeTier(isolationTier);
    const membershipId = membershipDocumentId(tenantId, ownerPrincipalId);
    const wsMemId = workspaceMembershipDocumentId(workspaceId, ownerPrincipalId);

    const [existing] = await this.pool.query('SELECT id FROM enterprise_tenants WHERE slug = ?', [cleanSlug]);
    if (existing.length > 0) {
      throw Object.assign(new Error('Tenant slug is already in use'), { code: 'TENANT_SLUG_CONFLICT', status: 409 });
    }

    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      await conn.query(
        `INSERT INTO enterprise_tenants (id, slug, displayName, lifecycleState, isolationTier, dataPlane, policyVersion, legacyOwnerUid)
         VALUES (?, ?, ?, 'ACTIVE', ?, ?, 1, ?)`,
        [tenantId, cleanSlug, cleanName, tier, JSON.stringify(normalizedPlane), ownerPrincipalId]
      );

      await conn.query(
        `INSERT INTO enterprise_workspaces (id, tenantId, name, lifecycleState, isDefault)
         VALUES (?, ?, 'Default Workspace', 'ACTIVE', TRUE)`,
        [workspaceId, tenantId]
      );

      const defaultConfig = defaultTenantConfiguration(tenantId);
      await conn.query(
        `INSERT INTO enterprise_tenant_configurations (tenantId, revision, customRoles, aiPolicy, quotaPolicy, retentionPolicy, securityPolicy, identityPolicy)
         VALUES (?, 1, ?, ?, ?, ?, ?, ?)`,
        [
          tenantId,
          JSON.stringify(defaultConfig.customRoles),
          JSON.stringify(defaultConfig.aiPolicy),
          JSON.stringify(defaultConfig.quotaPolicy),
          JSON.stringify(defaultConfig.retentionPolicy),
          JSON.stringify(defaultConfig.securityPolicy),
          JSON.stringify(defaultConfig.identityPolicy),
        ]
      );

      await conn.query(
        `INSERT INTO enterprise_memberships (id, tenantId, principalId, canonicalPrincipalId, workspaceId, status, roles, revision, personalTenant)
         VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, 1, FALSE)`,
        [membershipId, tenantId, ownerPrincipalId, canonicalPrincipalId(ownerPrincipalId), workspaceId, JSON.stringify(['TENANT_OWNER'])]
      );

      await conn.query(
        `INSERT INTO enterprise_workspace_memberships (id, tenantId, workspaceId, principalId, status)
         VALUES (?, ?, ?, ?, 'ACTIVE')`,
        [wsMemId, tenantId, workspaceId, ownerPrincipalId]
      );

      await conn.commit();
      return { tenantId, workspaceId, membershipId };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async getTenant(tenantId) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    const [rows] = await this.pool.query('SELECT * FROM enterprise_tenants WHERE id = ?', [tenantId]);
    if (rows.length === 0) throw Object.assign(new Error('Tenant was not found'), { code: 'TENANT_NOT_FOUND', status: 404 });
    return validateTenantRecord(rows[0]);
  }

  async getTenantBySlug(slug) {
    this.assertAvailable();
    const cleanSlug = String(slug || '').trim().toLowerCase();
    const [rows] = await this.pool.query('SELECT * FROM enterprise_tenants WHERE slug = ?', [cleanSlug]);
    if (rows.length === 0) throw Object.assign(new Error('Tenant was not found'), { code: 'TENANT_NOT_FOUND', status: 404 });
    return validateTenantRecord(rows[0]);
  }

  _mapTenantConfiguration(tenantId, row = null) {
    const defaults = defaultTenantConfiguration(tenantId);
    if (!row) return defaults;
    return {
      ...defaults,
      tenantId,
      revision: Number(row.revision || 1),
      customRoles: parseJsonField(row.customRoles, defaults.customRoles),
      aiPolicy: parseJsonField(row.aiPolicy, defaults.aiPolicy),
      quotaPolicy: parseJsonField(row.quotaPolicy, defaults.quotaPolicy),
      retentionPolicy: parseJsonField(row.retentionPolicy, defaults.retentionPolicy),
      securityPolicy: parseJsonField(row.securityPolicy, defaults.securityPolicy),
      identityPolicy: parseJsonField(row.identityPolicy, defaults.identityPolicy),
      commercials: parseJsonField(row.commercials, null),
    };
  }

  async getTenantConfiguration(tenantId) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    const [rows] = await this.pool.query('SELECT * FROM enterprise_tenant_configurations WHERE tenantId = ?', [tenantId]);
    return this._mapTenantConfiguration(tenantId, rows[0]);
  }

  async updateTenantConfiguration({ tenantId, input = {}, expectedRevision }) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    if (!Number.isInteger(Number(expectedRevision)) || Number(expectedRevision) < 1) {
      throw Object.assign(new Error('Expected tenant configuration revision is required'), { code: 'EXPECTED_REVISION_REQUIRED', status: 428 });
    }
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [tenantRows] = await connection.query('SELECT id FROM enterprise_tenants WHERE id = ? FOR UPDATE', [tenantId]);
      if (!tenantRows.length) {
        throw Object.assign(new Error('Tenant was not found'), { code: 'TENANT_NOT_FOUND', status: 404 });
      }
      const [rows] = await connection.query('SELECT * FROM enterprise_tenant_configurations WHERE tenantId = ? FOR UPDATE', [tenantId]);
      const existing = this._mapTenantConfiguration(tenantId, rows[0]);
      if (Number(expectedRevision) !== Number(existing.revision)) {
        throw Object.assign(new Error('Tenant configuration revision conflict'), {
          code: 'CONFIGURATION_REVISION_CONFLICT', status: 409, currentRevision: existing.revision,
        });
      }
      const normalized = normalizeTenantConfiguration(tenantId, input, existing);
      await connection.query(
        `INSERT INTO enterprise_tenant_configurations
           (tenantId, revision, customRoles, aiPolicy, quotaPolicy, retentionPolicy, securityPolicy, identityPolicy, commercials)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           revision = VALUES(revision), customRoles = VALUES(customRoles), aiPolicy = VALUES(aiPolicy),
           quotaPolicy = VALUES(quotaPolicy), retentionPolicy = VALUES(retentionPolicy),
           securityPolicy = VALUES(securityPolicy), identityPolicy = VALUES(identityPolicy),
           commercials = VALUES(commercials)`,
        [
          tenantId,
          normalized.revision,
          JSON.stringify(normalized.customRoles),
          JSON.stringify(normalized.aiPolicy),
          JSON.stringify(normalized.quotaPolicy),
          JSON.stringify(normalized.retentionPolicy),
          JSON.stringify(normalized.securityPolicy),
          JSON.stringify(normalized.identityPolicy),
          normalized.commercials ? JSON.stringify(normalized.commercials) : null,
        ]
      );
      await connection.commit();
      return normalized;
    } catch (error) {
      await connection.rollback().catch(() => {});
      throw error;
    } finally {
      connection.release();
    }
  }

  async updateTenantProfile({ tenantId, displayName }) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    const cleanDisplayName = compact(displayName, 120);
    if (cleanDisplayName.length < 2) throw Object.assign(new Error('Tenant display name is invalid'), { code: 'INVALID_TENANT_NAME', status: 400 });
    await this.pool.query('UPDATE enterprise_tenants SET displayName = ? WHERE id = ?', [cleanDisplayName, tenantId]);
    return this.getTenant(tenantId);
  }

  async setTenantLifecycleState({ tenantId, nextState }) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    const current = await this.getTenant(tenantId);
    const lifecycleState = assertTenantTransition(current.lifecycleState, nextState);
    await this.pool.query('UPDATE enterprise_tenants SET lifecycleState = ? WHERE id = ?', [lifecycleState, tenantId]);
    return { ...current, lifecycleState };
  }

  async listAllTenants({ limit = 200 } = {}) {
    this.assertAvailable();
    const bounded = Math.max(1, Math.min(Number(limit) || 200, 1000));
    const [rows] = await this.pool.query('SELECT * FROM enterprise_tenants ORDER BY created_at DESC LIMIT ?', [bounded]);
    return rows.map(r => {
      try {
        return validateTenantRecord(r);
      } catch {
        return null;
      }
    }).filter(Boolean);
  }

  async listTenantsByLifecycleState(lifecycleState, { limit = 500 } = {}) {
    this.assertAvailable();
    const state = String(lifecycleState || '').toUpperCase();
    if (!TENANT_LIFECYCLE_STATES.includes(state)) {
      throw Object.assign(new Error('Tenant lifecycle state is invalid'), { code: 'INVALID_TENANT_LIFECYCLE', status: 400 });
    }
    const bounded = Math.max(1, Math.min(Number(limit) || 500, 1000));
    const [rows] = await this.pool.query('SELECT * FROM enterprise_tenants WHERE lifecycleState = ? LIMIT ?', [state, bounded]);
    return rows.map(r => {
      try {
        return validateTenantRecord(r);
      } catch {
        return null;
      }
    }).filter(Boolean);
  }

  async resolveMembership({ principalId, requestedTenantId = null, requestedWorkspaceId = null, profile = {}, identityEmail = null, emailVerified = false }) {
    this.assertAvailable();
    principalId = assertPrincipalId(principalId);
    const tenantId = normalizeRequestedTenantId(requestedTenantId);
    const workspaceId = normalizeRequestedWorkspaceId(requestedWorkspaceId);

    if (tenantId) {
      const tenant = await this.getTenant(tenantId);
      if (tenant.lifecycleState !== 'ACTIVE') {
        throw Object.assign(new Error('Tenant is inactive'), { code: 'TENANT_INACTIVE', status: 403 });
      }
      let membership = await this.getMembership(tenant.id, principalId);
      if (membership.status === 'INVITED') {
        membership = await this.acceptMembershipInvitation({
          tenantId: tenant.id,
          principalId,
          identityEmail,
          emailVerified,
        });
      }
      if (membership.status !== 'ACTIVE') {
        throw Object.assign(new Error('Tenant membership is inactive'), { code: 'TENANT_MEMBERSHIP_INACTIVE', status: 403 });
      }
      let workspace = null;
      if (workspaceId) {
        workspace = await this.getWorkspace(workspaceId, tenant.id);
        const hasAccess = await this.hasWorkspaceAccess({ tenantId: tenant.id, workspaceId: workspace.id, principalId, roles: membership.roles });
        if (!hasAccess) throw Object.assign(new Error('User does not have access to this workspace'), { code: 'WORKSPACE_ACCESS_DENIED', status: 403 });
      } else if (membership.workspaceId) {
        workspace = await this.getWorkspace(membership.workspaceId, tenant.id).catch(() => null);
      }
      return { tenant, membership, workspace };
    }

    // Resolve via ensurePersonalTenant
    const personal = await this.ensurePersonalTenant(principalId, profile);
    const tenant = await this.getTenant(personal.tenantId);
    const membership = await this.getMembership(tenant.id, principalId);
    const workspace = await this.getWorkspace(personal.workspaceId, tenant.id).catch(() => null);
    return { tenant, membership, workspace };
  }

  async listMembershipsForPrincipals(principalIds = []) {
    this.assertAvailable();
    const requested = [...new Set((Array.isArray(principalIds) ? principalIds : [])
      .map(value => String(value || ''))
      .filter(value => value.length > 0))].slice(0, 200);
    const grouped = new Map(requested.map(principalId => [principalId, []]));
    if (!requested.length) return grouped;
    const placeholders = requested.map(() => '?').join(',');
    const [rows] = await this.pool.query(
      `SELECT m.*, t.displayName, t.slug, t.lifecycleState AS tenantLifecycleState,
              i.recipientEmail AS invitationEmail, i.invitedAt, i.acceptedAt,
              i.expiresAt AS invitationExpiresAt, i.invitationState,
              COALESCE(o.state, i.deliveryState) AS invitationDeliveryState,
              i.notificationId AS invitationNotificationId, i.queueRevision AS invitationQueueRevision
       FROM enterprise_memberships m
       JOIN enterprise_tenants t ON m.tenantId = t.id
       LEFT JOIN enterprise_membership_invitations i ON i.membershipId = m.id
       LEFT JOIN notification_outbox o ON o.id = i.notificationId
       WHERE m.principalId IN (${placeholders})
       ORDER BY m.principalId, m.id`,
      requested
    );
    // Every row is bucketed under, and revalidated against, its OWN principalId.
    // A row cannot be attributed to a different subject than the one it names,
    // so batching does not widen membership visibility for any caller.
    for (const row of rows || []) {
      const owner = String(row.principalId || '');
      if (!grouped.has(owner)) continue;
      try {
        const mem = validateMembership(row, owner);
        grouped.get(owner).push({
          ...mem,
          displayName: row.displayName || row.tenantId,
          slug: row.slug || row.tenantId,
          tenantLifecycleState: row.tenantLifecycleState || 'ACTIVE',
        });
      } catch {
        // Fail closed, identically to the single-principal read.
      }
    }
    return grouped;
  }

  async listMemberships(principalId) {
    this.assertAvailable();
    principalId = assertPrincipalId(principalId);
    const [rows] = await this.pool.query(
      `SELECT m.*, t.displayName, t.slug, t.lifecycleState AS tenantLifecycleState,
              i.recipientEmail AS invitationEmail, i.invitedAt, i.acceptedAt,
              i.expiresAt AS invitationExpiresAt, i.invitationState,
              COALESCE(o.state, i.deliveryState) AS invitationDeliveryState,
              i.notificationId AS invitationNotificationId, i.queueRevision AS invitationQueueRevision
       FROM enterprise_memberships m
       JOIN enterprise_tenants t ON m.tenantId = t.id
       LEFT JOIN enterprise_membership_invitations i ON i.membershipId = m.id
       LEFT JOIN notification_outbox o ON o.id = i.notificationId
       WHERE m.principalId = ?`,
      [principalId]
    );
    return rows.map(r => {
      try {
        const mem = validateMembership(r, principalId);
        return {
          ...mem,
          displayName: r.displayName || r.tenantId,
          slug: r.slug || r.tenantId,
          tenantLifecycleState: r.tenantLifecycleState || 'ACTIVE',
        };
      } catch {
        return null;
      }
    }).filter(Boolean);
  }

  async listTenantMemberships(tenantId) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    const [rows] = await this.pool.query(
      `SELECT m.*, i.recipientEmail AS invitationEmail, i.invitedAt, i.acceptedAt,
              i.expiresAt AS invitationExpiresAt, i.invitationState,
              COALESCE(o.state, i.deliveryState) AS invitationDeliveryState,
              i.notificationId AS invitationNotificationId, i.queueRevision AS invitationQueueRevision
       FROM enterprise_memberships m
       LEFT JOIN enterprise_membership_invitations i ON i.membershipId = m.id
       LEFT JOIN notification_outbox o ON o.id = i.notificationId
       WHERE m.tenantId = ?`,
      [tenantId]
    );
    return rows.map(r => {
      try {
        return validateMembership(r, r.principalId);
      } catch {
        return null;
      }
    }).filter(Boolean);
  }

  async getMembership(tenantId, principalId) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    principalId = assertPrincipalId(principalId);
    const [rows] = await this.pool.query(
      `SELECT m.*, i.recipientEmail AS invitationEmail, i.invitedAt, i.acceptedAt,
              i.expiresAt AS invitationExpiresAt, i.invitationState,
              COALESCE(o.state, i.deliveryState) AS invitationDeliveryState,
              i.notificationId AS invitationNotificationId, i.queueRevision AS invitationQueueRevision
       FROM enterprise_memberships m
       LEFT JOIN enterprise_membership_invitations i ON i.membershipId = m.id
       LEFT JOIN notification_outbox o ON o.id = i.notificationId
       WHERE m.tenantId = ? AND m.principalId = ?`,
      [tenantId, principalId]
    );
    if (rows.length === 0) {
      throw Object.assign(new Error('Tenant membership was not found'), { code: 'TENANT_MEMBERSHIP_NOT_FOUND', status: 404 });
    }
    return validateMembership(rows[0], principalId);
  }

  async grantMembership({
    tenantId,
    principalId,
    workspaceId,
    roles = ['ENTERPRISE_MEMBER'],
    status = 'ACTIVE',
    invitation = null,
    allowedRoles = [],
  }) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    principalId = assertPrincipalId(principalId);
    workspaceId = assertUuid(workspaceId, 'Workspace identifier');
    const membershipId = membershipDocumentId(tenantId, principalId);
    const workspaceMembershipId = workspaceMembershipDocumentId(workspaceId, principalId);
    const normalizedRoles = normalizeRoles(roles, allowedRoles);
    const stat = String(status || 'ACTIVE').toUpperCase();
    if (!MEMBERSHIP_STATES.includes(stat)) {
      throw Object.assign(new Error('Invalid membership status'), { code: 'INVALID_MEMBERSHIP_STATUS', status: 400 });
    }
    if ((stat === 'INVITED') !== Boolean(invitation)) {
      throw Object.assign(new Error('Invited memberships require one bound invitation payload'), { code: 'INVALID_MEMBERSHIP_INVITATION', status: 400 });
    }

    let invitationData = null;
    if (invitation) {
      const recipientEmail = normalizeInvitationEmail(invitation.recipientEmail);
      const expiresAt = new Date(invitation.expiresAt || 0);
      const now = Date.now();
      if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= now || expiresAt.getTime() > now + (30 * 24 * 60 * 60 * 1000)) {
        throw Object.assign(new Error('Invitation expiry must be within the next 30 days'), { code: 'INVALID_INVITATION_EXPIRY', status: 400 });
      }
      if (!invitation.notification || typeof invitation.notification !== 'object') {
        throw Object.assign(new Error('Invitation notification payload is required'), { code: 'INVALID_MEMBERSHIP_INVITATION', status: 400 });
      }
      invitationData = {
        recipientEmail,
        invitedByPrincipalId: assertPrincipalId(invitation.invitedByPrincipalId),
        expiresAt,
        notification: invitation.notification,
        tenantContext: invitation.tenantContext || null,
      };
    }

    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [workspaces] = await connection.query(
        'SELECT id, lifecycleState FROM enterprise_workspaces WHERE id = ? AND tenantId = ? FOR UPDATE',
        [workspaceId, tenantId]
      );
      if (!workspaces.length) {
        throw Object.assign(new Error('Workspace was not found in this tenant'), { code: 'WORKSPACE_NOT_FOUND', status: 404 });
      }
      if (String(workspaces[0].lifecycleState || '').toUpperCase() !== 'ACTIVE') {
        throw Object.assign(new Error('Workspace is not active'), { code: 'WORKSPACE_INACTIVE', status: 409 });
      }

      const [existingRows] = await connection.query(
        'SELECT id, principalId, revision FROM enterprise_memberships WHERE id = ? FOR UPDATE',
        [membershipId]
      );
      if (existingRows[0] && existingRows[0].principalId !== principalId) {
        throw Object.assign(new Error('Membership identity collision detected'), { code: 'TENANT_IDENTITY_MISMATCH', status: 409 });
      }
      const nextRevision = Number(existingRows[0]?.revision || 0) + 1;

      await connection.query(
        `INSERT INTO enterprise_memberships
           (id, tenantId, principalId, canonicalPrincipalId, workspaceId, status, roles, revision, personalTenant)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, FALSE)
         ON DUPLICATE KEY UPDATE
           canonicalPrincipalId = VALUES(canonicalPrincipalId),
           workspaceId = VALUES(workspaceId),
           status = VALUES(status),
           roles = VALUES(roles),
           revision = VALUES(revision),
           updated_at = CURRENT_TIMESTAMP`,
        [membershipId, tenantId, principalId, canonicalPrincipalId(principalId), workspaceId, stat, JSON.stringify(normalizedRoles), nextRevision]
      );

      await connection.query(
        `INSERT INTO enterprise_workspace_memberships (id, tenantId, workspaceId, principalId, status)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE tenantId = VALUES(tenantId), workspaceId = VALUES(workspaceId),
           principalId = VALUES(principalId), status = VALUES(status), updated_at = CURRENT_TIMESTAMP`,
        [workspaceMembershipId, tenantId, workspaceId, principalId, stat]
      );

      if (invitationData) {
        const eventId = `enterprise-invitation:${membershipId}:${nextRevision}`;
        const idempotencyKey = `enterprise-invite:${crypto.createHash('sha256').update(eventId).digest('hex')}`;
        const notificationId = await queueEmailInTransaction(connection, {
          eventId,
          recipient: invitationData.recipientEmail,
          templateType: invitationData.notification.templateType || 'enterprise-invitation',
          vars: invitationData.notification.vars || {},
          metadata: {
            ...(invitationData.notification.metadata || {}),
            membershipId,
            invitationRevision: nextRevision,
          },
          tenantContext: invitationData.tenantContext,
          idempotencyKey,
        });
        await connection.query(
          `INSERT INTO enterprise_membership_invitations
             (id, membershipId, tenantId, principalId, workspaceId, recipientEmail,
              invitedByPrincipalId, invitationState, deliveryState, notificationId,
              notificationEventId, queueRevision, expiresAt, invitedAt, lastQueuedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', 'NOTIFICATION_QUEUED', ?, ?, ?, ?, NOW(6), NOW(6))
           ON DUPLICATE KEY UPDATE
             workspaceId = VALUES(workspaceId), recipientEmail = VALUES(recipientEmail),
             invitedByPrincipalId = VALUES(invitedByPrincipalId), invitationState = 'PENDING',
             deliveryState = 'NOTIFICATION_QUEUED', notificationId = VALUES(notificationId),
             notificationEventId = VALUES(notificationEventId), queueRevision = VALUES(queueRevision),
             expiresAt = VALUES(expiresAt), invitedAt = NOW(6), lastQueuedAt = NOW(6),
             acceptedAt = NULL, revokedAt = NULL, updated_at = NOW(6)`,
          [membershipId, membershipId, tenantId, principalId, workspaceId,
            invitationData.recipientEmail, invitationData.invitedByPrincipalId,
            notificationId, eventId, nextRevision, invitationData.expiresAt]
        );
      } else if (stat === 'ACTIVE') {
        await connection.query(
          `UPDATE enterprise_membership_invitations
           SET invitationState = 'ACCEPTED', acceptedAt = COALESCE(acceptedAt, NOW(6)), updated_at = NOW(6)
           WHERE membershipId = ? AND invitationState = 'PENDING'`,
          [membershipId]
        );
      }

      const [resultRows] = await connection.query(
        `SELECT m.*, i.recipientEmail AS invitationEmail, i.invitedAt, i.acceptedAt,
                i.expiresAt AS invitationExpiresAt, i.invitationState,
                COALESCE(o.state, i.deliveryState) AS invitationDeliveryState,
                i.notificationId AS invitationNotificationId, i.queueRevision AS invitationQueueRevision
         FROM enterprise_memberships m
         LEFT JOIN enterprise_membership_invitations i ON i.membershipId = m.id
         LEFT JOIN notification_outbox o ON o.id = i.notificationId
         WHERE m.id = ?`,
        [membershipId]
      );
      const result = validateMembership(resultRows[0], principalId);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback().catch(() => {});
      throw error;
    } finally {
      connection.release();
    }
  }

  async queueMembershipInvitation({ tenantId, principalId, invitedByPrincipalId, notification, tenantContext = null }) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    principalId = assertPrincipalId(principalId);
    invitedByPrincipalId = assertPrincipalId(invitedByPrincipalId);
    if (!notification || typeof notification !== 'object') {
      throw Object.assign(new Error('Invitation notification payload is required'), { code: 'INVALID_MEMBERSHIP_INVITATION', status: 400 });
    }
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query(
        `SELECT m.id, m.status, m.revision, i.recipientEmail, i.notificationId, i.queueRevision, i.invitationState
         FROM enterprise_memberships m
         JOIN enterprise_membership_invitations i ON i.membershipId = m.id
         WHERE m.tenantId = ? AND m.principalId = ?
         FOR UPDATE`,
        [tenantId, principalId]
      );
      if (!rows.length) {
        throw Object.assign(new Error('Pending invitation was not found'), { code: 'TENANT_MEMBERSHIP_NOT_FOUND', status: 404 });
      }
      const current = rows[0];
      if (String(current.status).toUpperCase() !== 'INVITED' || String(current.invitationState).toUpperCase() !== 'PENDING') {
        throw Object.assign(new Error('Only a pending invitation can be resent'), { code: 'INVITATION_NOT_PENDING', status: 409 });
      }
      const recipientEmail = normalizeInvitationEmail(current.recipientEmail);
      if (current.notificationId) {
        await connection.query(
          `UPDATE notification_outbox
           SET state = 'CANCELLED', next_attempt_at = 0, lease_owner = NULL, lease_expires_at = 0,
               last_error = 'Superseded by invitation resend', updated_at = NOW(6)
           WHERE id = ? AND provider_accepted = 0 AND state IN ('NOTIFICATION_QUEUED', 'RETRYING', 'DELIVERY_ATTEMPTED')`,
          [current.notificationId]
        );
      }
      const queueRevision = Number(current.queueRevision || 0) + 1;
      const eventId = `enterprise-invitation:${current.id}:resend:${queueRevision}`;
      const notificationId = await queueEmailInTransaction(connection, {
        eventId,
        recipient: recipientEmail,
        templateType: notification.templateType || 'enterprise-invitation',
        vars: notification.vars || {},
        metadata: { ...(notification.metadata || {}), membershipId: current.id, invitationRevision: queueRevision },
        tenantContext,
        idempotencyKey: `enterprise-invite:${crypto.createHash('sha256').update(eventId).digest('hex')}`,
      });
      await connection.query(
        `UPDATE enterprise_membership_invitations
         SET invitedByPrincipalId = ?, deliveryState = 'NOTIFICATION_QUEUED', notificationId = ?,
             notificationEventId = ?, queueRevision = ?, expiresAt = DATE_ADD(NOW(6), INTERVAL 7 DAY),
             lastQueuedAt = NOW(6), updated_at = NOW(6)
         WHERE membershipId = ?`,
        [invitedByPrincipalId, notificationId, eventId, queueRevision, current.id]
      );
      const [resultRows] = await connection.query(
        `SELECT m.*, i.recipientEmail AS invitationEmail, i.invitedAt, i.acceptedAt,
                i.expiresAt AS invitationExpiresAt, i.invitationState,
                COALESCE(o.state, i.deliveryState) AS invitationDeliveryState,
                i.notificationId AS invitationNotificationId, i.queueRevision AS invitationQueueRevision
         FROM enterprise_memberships m
         JOIN enterprise_membership_invitations i ON i.membershipId = m.id
         LEFT JOIN notification_outbox o ON o.id = i.notificationId
         WHERE m.id = ?`,
        [current.id]
      );
      const result = validateMembership(resultRows[0], principalId);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback().catch(() => {});
      throw error;
    } finally {
      connection.release();
    }
  }

  async acceptMembershipInvitation({ tenantId, principalId, identityEmail, emailVerified }) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    principalId = assertPrincipalId(principalId);
    const verifiedEmail = normalizeInvitationEmail(identityEmail);
    if (emailVerified !== true) {
      throw Object.assign(new Error('Verify the invited email address before accepting this invitation'), { code: 'INVITATION_EMAIL_UNVERIFIED', status: 403 });
    }
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query(
        `SELECT m.id, m.workspaceId, m.status, i.recipientEmail, i.invitationState,
                i.expiresAt, i.notificationId
         FROM enterprise_memberships m
         JOIN enterprise_membership_invitations i ON i.membershipId = m.id
         WHERE m.tenantId = ? AND m.principalId = ?
         FOR UPDATE`,
        [tenantId, principalId]
      );
      if (!rows.length) {
        throw Object.assign(new Error('Pending invitation was not found'), { code: 'TENANT_MEMBERSHIP_NOT_FOUND', status: 404 });
      }
      const invitation = rows[0];
      if (String(invitation.status).toUpperCase() !== 'INVITED' || String(invitation.invitationState).toUpperCase() !== 'PENDING') {
        throw Object.assign(new Error('Invitation is no longer pending'), { code: 'INVITATION_NOT_PENDING', status: 409 });
      }
      if (normalizeInvitationEmail(invitation.recipientEmail) !== verifiedEmail) {
        throw Object.assign(new Error('Signed-in identity does not match the invitation recipient'), { code: 'INVITATION_IDENTITY_MISMATCH', status: 403 });
      }
      if (!invitation.expiresAt || new Date(invitation.expiresAt).getTime() <= Date.now()) {
        throw Object.assign(new Error('Invitation has expired; request a new invitation'), { code: 'INVITATION_EXPIRED', status: 410 });
      }
      const workspaceId = assertUuid(invitation.workspaceId, 'Workspace identifier');
      const [workspaces] = await connection.query(
        'SELECT lifecycleState FROM enterprise_workspaces WHERE id = ? AND tenantId = ? FOR UPDATE',
        [workspaceId, tenantId]
      );
      if (!workspaces.length || String(workspaces[0].lifecycleState).toUpperCase() !== 'ACTIVE') {
        throw Object.assign(new Error('Invitation workspace is unavailable'), { code: 'WORKSPACE_INACTIVE', status: 409 });
      }

      await connection.query(
        `UPDATE enterprise_memberships
         SET status = 'ACTIVE', revision = revision + 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'INVITED'`,
        [invitation.id]
      );
      await connection.query(
        `INSERT INTO enterprise_workspace_memberships (id, tenantId, workspaceId, principalId, status)
         VALUES (?, ?, ?, ?, 'ACTIVE')
         ON DUPLICATE KEY UPDATE status = 'ACTIVE', updated_at = CURRENT_TIMESTAMP`,
        [workspaceMembershipDocumentId(workspaceId, principalId), tenantId, workspaceId, principalId]
      );
      await connection.query(
        `UPDATE enterprise_membership_invitations
         SET invitationState = 'ACCEPTED', acceptedAt = NOW(6), updated_at = NOW(6)
         WHERE membershipId = ? AND invitationState = 'PENDING'`,
        [invitation.id]
      );
      if (invitation.notificationId) {
        await connection.query(
          `UPDATE notification_outbox
           SET state = 'CANCELLED', next_attempt_at = 0, lease_owner = NULL, lease_expires_at = 0,
               last_error = 'Invitation accepted before delivery', updated_at = NOW(6)
           WHERE id = ? AND provider_accepted = 0 AND state IN ('NOTIFICATION_QUEUED', 'RETRYING', 'DELIVERY_ATTEMPTED')`,
          [invitation.notificationId]
        );
      }
      const [resultRows] = await connection.query(
        `SELECT m.*, i.recipientEmail AS invitationEmail, i.invitedAt, i.acceptedAt,
                i.expiresAt AS invitationExpiresAt, i.invitationState,
                COALESCE(o.state, i.deliveryState) AS invitationDeliveryState,
                i.notificationId AS invitationNotificationId, i.queueRevision AS invitationQueueRevision
         FROM enterprise_memberships m
         JOIN enterprise_membership_invitations i ON i.membershipId = m.id
         LEFT JOIN notification_outbox o ON o.id = i.notificationId
         WHERE m.id = ?`,
        [invitation.id]
      );
      const result = validateMembership(resultRows[0], principalId);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback().catch(() => {});
      throw error;
    } finally {
      connection.release();
    }
  }

  async isInvitationDeliverable({ tenantId, membershipId, notificationId }) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    const [rows] = await this.pool.query(
      `SELECT 1
       FROM enterprise_membership_invitations i
       JOIN enterprise_memberships m ON m.id = i.membershipId
       WHERE i.tenantId = ? AND i.membershipId = ? AND i.notificationId = ?
         AND i.invitationState = 'PENDING' AND i.expiresAt > NOW(6) AND m.status = 'INVITED'
       LIMIT 1`,
      [tenantId, String(membershipId || ''), String(notificationId || '')]
    );
    return rows.length === 1;
  }

  async updateTenantMembership({ tenantId, principalId, roles, status, workspaceId = null, allowedRoles = [] }) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    principalId = assertPrincipalId(principalId);
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query(
        'SELECT * FROM enterprise_memberships WHERE tenantId = ? AND principalId = ? FOR UPDATE',
        [tenantId, principalId]
      );
      if (!rows.length) {
        throw Object.assign(new Error('Tenant membership was not found'), { code: 'TENANT_MEMBERSHIP_NOT_FOUND', status: 404 });
      }
      const current = validateMembership(rows[0], principalId);
      const nextRoles = roles ? normalizeRoles(roles, allowedRoles) : current.roles;
      const nextStatus = status ? String(status).toUpperCase() : current.status;
      if (!MEMBERSHIP_STATES.includes(nextStatus)) {
        throw Object.assign(new Error('Invalid membership status'), { code: 'INVALID_MEMBERSHIP_STATUS', status: 400 });
      }
      const nextWorkspaceId = workspaceId
        ? assertUuid(workspaceId, 'Workspace identifier')
        : assertUuid(current.workspaceId, 'Workspace identifier');
      const [workspaces] = await connection.query(
        'SELECT id, lifecycleState FROM enterprise_workspaces WHERE id = ? AND tenantId = ? FOR UPDATE',
        [nextWorkspaceId, tenantId]
      );
      if (!workspaces.length) {
        throw Object.assign(new Error('Workspace was not found in this tenant'), { code: 'WORKSPACE_NOT_FOUND', status: 404 });
      }
      if (nextStatus === 'ACTIVE' && String(workspaces[0].lifecycleState || '').toUpperCase() !== 'ACTIVE') {
        throw Object.assign(new Error('Workspace is not active'), { code: 'WORKSPACE_INACTIVE', status: 409 });
      }

      await connection.query(
        `UPDATE enterprise_memberships
         SET roles = ?, status = ?, workspaceId = ?, revision = revision + 1, updated_at = CURRENT_TIMESTAMP
         WHERE tenantId = ? AND principalId = ?`,
        [JSON.stringify(nextRoles), nextStatus, nextWorkspaceId, tenantId, principalId]
      );

      if (current.workspaceId && current.workspaceId !== nextWorkspaceId) {
        await connection.query(
          'DELETE FROM enterprise_workspace_memberships WHERE tenantId = ? AND workspaceId = ? AND principalId = ?',
          [tenantId, current.workspaceId, principalId]
        );
      }
      const workspaceMembershipId = workspaceMembershipDocumentId(nextWorkspaceId, principalId);
      await connection.query(
        `INSERT INTO enterprise_workspace_memberships (id, tenantId, workspaceId, principalId, status)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE status = VALUES(status), updated_at = CURRENT_TIMESTAMP`,
        [workspaceMembershipId, tenantId, nextWorkspaceId, principalId, nextStatus]
      );

      if (current.status === 'INVITED' && nextStatus === 'ACTIVE') {
        await connection.query(
          `UPDATE enterprise_membership_invitations
           SET invitationState = 'ACCEPTED', acceptedAt = COALESCE(acceptedAt, NOW(6)), updated_at = NOW(6)
           WHERE membershipId = ? AND invitationState = 'PENDING'`,
          [current.id]
        );
      } else if (nextStatus === 'REMOVED') {
        await connection.query(
          `UPDATE enterprise_membership_invitations
           SET invitationState = 'REVOKED', revokedAt = COALESCE(revokedAt, NOW(6)), updated_at = NOW(6)
           WHERE membershipId = ? AND invitationState = 'PENDING'`,
          [current.id]
        );
      }

      const [resultRows] = await connection.query(
        `SELECT m.*, i.recipientEmail AS invitationEmail, i.invitedAt, i.acceptedAt,
                i.expiresAt AS invitationExpiresAt, i.invitationState,
                COALESCE(o.state, i.deliveryState) AS invitationDeliveryState,
                i.notificationId AS invitationNotificationId, i.queueRevision AS invitationQueueRevision
         FROM enterprise_memberships m
         LEFT JOIN enterprise_membership_invitations i ON i.membershipId = m.id
         LEFT JOIN notification_outbox o ON o.id = i.notificationId
         WHERE m.tenantId = ? AND m.principalId = ?`,
        [tenantId, principalId]
      );
      const result = validateMembership(resultRows[0], principalId);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback().catch(() => {});
      throw error;
    } finally {
      connection.release();
    }
  }

  async removeTenantMembership({ tenantId, principalId }) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    principalId = assertPrincipalId(principalId);
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const [invitations] = await conn.query(
        `SELECT i.notificationId
         FROM enterprise_membership_invitations i
         JOIN enterprise_memberships m ON m.id = i.membershipId
         WHERE m.tenantId = ? AND m.principalId = ?
         FOR UPDATE`,
        [tenantId, principalId]
      );
      for (const invitation of invitations) {
        if (!invitation.notificationId) continue;
        await conn.query(
          `UPDATE notification_outbox
           SET state = 'CANCELLED', next_attempt_at = 0, lease_owner = NULL, lease_expires_at = 0,
               last_error = 'Invitation membership was removed', updated_at = NOW(6)
           WHERE id = ? AND provider_accepted = 0 AND state IN ('NOTIFICATION_QUEUED', 'RETRYING', 'DELIVERY_ATTEMPTED')`,
          [invitation.notificationId]
        );
      }
      await conn.query('DELETE FROM enterprise_memberships WHERE tenantId = ? AND principalId = ?', [tenantId, principalId]);
      await conn.query('DELETE FROM enterprise_workspace_memberships WHERE tenantId = ? AND principalId = ?', [tenantId, principalId]);
      await conn.query('DELETE FROM enterprise_team_members WHERE tenantId = ? AND principalId = ?', [tenantId, principalId]);
      await conn.commit();
      return { success: true };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async createWorkspace({ tenantId, name, isDefault = false }) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    const cleanName = compact(name, 120);
    if (!cleanName || cleanName.length < 2) throw Object.assign(new Error('Workspace name is invalid'), { code: 'INVALID_WORKSPACE', status: 400 });
    const id = crypto.randomUUID();

    await this.pool.query(
      `INSERT INTO enterprise_workspaces (id, tenantId, name, lifecycleState, isDefault)
       VALUES (?, ?, ?, 'ACTIVE', ?)`,
      [id, tenantId, cleanName, Boolean(isDefault)]
    );

    return { id, tenantId, name: cleanName, lifecycleState: 'ACTIVE', isDefault: Boolean(isDefault) };
  }

  async getWorkspace(workspaceId, tenantId) {
    this.assertAvailable();
    workspaceId = assertUuid(workspaceId, 'Workspace identifier');
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    const [rows] = await this.pool.query(
      'SELECT * FROM enterprise_workspaces WHERE id = ? AND tenantId = ? AND lifecycleState = "ACTIVE"',
      [workspaceId, tenantId]
    );
    if (rows.length === 0) throw Object.assign(new Error('Workspace was not found'), { code: 'WORKSPACE_NOT_FOUND', status: 404 });
    return { ...rows[0], id: workspaceId };
  }

  async getWorkspaceAnyState(workspaceId, tenantId) {
    this.assertAvailable();
    workspaceId = assertUuid(workspaceId, 'Workspace identifier');
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    const [rows] = await this.pool.query(
      'SELECT * FROM enterprise_workspaces WHERE id = ? AND tenantId = ?',
      [workspaceId, tenantId]
    );
    if (rows.length === 0) throw Object.assign(new Error('Workspace was not found'), { code: 'WORKSPACE_NOT_FOUND', status: 404 });
    return { ...rows[0], id: workspaceId };
  }

  async listWorkspaces(tenantId, { includeArchived = false } = {}) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    const sql = includeArchived
      ? 'SELECT * FROM enterprise_workspaces WHERE tenantId = ? ORDER BY isDefault DESC, name ASC'
      : 'SELECT * FROM enterprise_workspaces WHERE tenantId = ? AND lifecycleState = "ACTIVE" ORDER BY isDefault DESC, name ASC';
    const [rows] = await this.pool.query(sql, [tenantId]);
    return rows.map(r => ({ ...r, isDefault: Boolean(r.isDefault) }));
  }

  async listAccessibleWorkspaces({ tenantId, principalId, roles = [] }) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    const workspaces = await this.listWorkspaces(tenantId);
    if (hasTenantWideWorkspaceAccess(roles)) return workspaces;

    const [rows] = await this.pool.query(
      'SELECT workspaceId FROM enterprise_memberships WHERE tenantId = ? AND principalId = ? AND status = "ACTIVE"',
      [tenantId, principalId]
    );
    const accessibleWorkspaceIds = new Set(rows.map(r => r.workspaceId).filter(Boolean));
    if (accessibleWorkspaceIds.size === 0) {
      return workspaces.filter(w => w.isDefault);
    }
    return workspaces.filter(w => accessibleWorkspaceIds.has(w.id));
  }

  async updateWorkspace({ tenantId, workspaceId, name }) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    workspaceId = assertUuid(workspaceId, 'Workspace identifier');
    const cleanName = compact(name, 120);
    if (cleanName.length < 2) throw Object.assign(new Error('Workspace name is invalid'), { code: 'INVALID_WORKSPACE', status: 400 });

    await this.getWorkspaceAnyState(workspaceId, tenantId);
    await this.pool.query('UPDATE enterprise_workspaces SET name = ? WHERE id = ? AND tenantId = ?', [cleanName, workspaceId, tenantId]);
    return this.getWorkspaceAnyState(workspaceId, tenantId);
  }

  async setWorkspaceLifecycleState({ tenantId, workspaceId, nextState }) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    workspaceId = assertUuid(workspaceId, 'Workspace identifier');
    const current = await this.getWorkspaceAnyState(workspaceId, tenantId);
    const lifecycleState = assertWorkspaceTransition(current.lifecycleState, nextState);
    if (lifecycleState === 'ARCHIVED' && current.isDefault === 1) {
      throw Object.assign(new Error('The default workspace cannot be archived'), { code: 'WORKSPACE_DEFAULT_PROTECTED', status: 409 });
    }
    await this.pool.query('UPDATE enterprise_workspaces SET lifecycleState = ? WHERE id = ? AND tenantId = ?', [lifecycleState, workspaceId, tenantId]);
    return { ...current, lifecycleState };
  }

  async listWorkspaceMembers({ tenantId, workspaceId }) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    workspaceId = assertUuid(workspaceId, 'Workspace identifier');
    await this.getWorkspaceAnyState(workspaceId, tenantId);
    const [rows] = await this.pool.query(
      'SELECT * FROM enterprise_workspace_memberships WHERE tenantId = ? AND workspaceId = ? AND status = "ACTIVE" ORDER BY principalId ASC',
      [tenantId, workspaceId]
    );
    return rows;
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
    const id = workspaceMembershipDocumentId(workspaceId, principalId);
    await this.pool.query(
      `INSERT INTO enterprise_workspace_memberships (id, tenantId, workspaceId, principalId, status)
       VALUES (?, ?, ?, ?, 'ACTIVE')
       ON DUPLICATE KEY UPDATE status = 'ACTIVE', updated_at = CURRENT_TIMESTAMP`,
      [id, tenantId, workspaceId, principalId]
    );
    return { id, tenantId, workspaceId, principalId, status: 'ACTIVE' };
  }

  async removeWorkspaceMember({ tenantId, workspaceId, principalId }) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    principalId = assertPrincipalId(principalId);
    workspaceId = assertUuid(workspaceId, 'Workspace identifier');
    await this.pool.query(
      'DELETE FROM enterprise_workspace_memberships WHERE tenantId = ? AND workspaceId = ? AND principalId = ?',
      [tenantId, workspaceId, principalId]
    );
    return { success: true };
  }

  async hasWorkspaceAccess({ tenantId, workspaceId, principalId, roles = [] }) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    workspaceId = assertUuid(workspaceId, 'Workspace identifier');
    principalId = assertPrincipalId(principalId);
    if (hasTenantWideWorkspaceAccess(roles)) return true;
    const [rows] = await this.pool.query(
      'SELECT status FROM enterprise_workspace_memberships WHERE tenantId = ? AND workspaceId = ? AND principalId = ? AND status = "ACTIVE"',
      [tenantId, workspaceId, principalId]
    );
    return rows.length > 0;
  }

  async createTeam({ tenantId, workspaceId = null, name, description = '' }) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    const cleanName = compact(name, 120);
    if (!cleanName || cleanName.length < 2) throw Object.assign(new Error('Team name is invalid'), { code: 'INVALID_TEAM_NAME', status: 400 });
    const id = crypto.randomUUID();
    await this.pool.query(
      `INSERT INTO enterprise_teams (id, tenantId, workspaceId, name, description)
       VALUES (?, ?, ?, ?, ?)`,
      [id, tenantId, workspaceId || null, cleanName, description || '']
    );
    return { id, tenantId, workspaceId: workspaceId || null, name: cleanName, description: description || '' };
  }

  async getTeam(teamId, tenantId) {
    this.assertAvailable();
    teamId = assertUuid(teamId, 'Team identifier');
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    const [rows] = await this.pool.query('SELECT * FROM enterprise_teams WHERE id = ? AND tenantId = ?', [teamId, tenantId]);
    if (rows.length === 0) throw Object.assign(new Error('Team was not found'), { code: 'TEAM_NOT_FOUND', status: 404 });
    return rows[0];
  }

  async listTeams(tenantIdOrOpts, opts = {}) {
    this.assertAvailable();
    let tenantId = tenantIdOrOpts;
    let workspaceId = opts.workspaceId || null;
    if (typeof tenantIdOrOpts === 'object' && tenantIdOrOpts !== null) {
      tenantId = tenantIdOrOpts.tenantId;
      workspaceId = tenantIdOrOpts.workspaceId || null;
    }
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    if (workspaceId) workspaceId = assertUuid(workspaceId, 'Workspace identifier');
    const sql = workspaceId
      ? 'SELECT * FROM enterprise_teams WHERE tenantId = ? AND workspaceId = ? ORDER BY name ASC'
      : 'SELECT * FROM enterprise_teams WHERE tenantId = ? ORDER BY name ASC';
    const params = workspaceId ? [tenantId, workspaceId] : [tenantId];
    const [rows] = await this.pool.query(sql, params);
    return rows;
  }

  async deleteTeam(teamId, tenantId) {
    this.assertAvailable();
    teamId = assertUuid(teamId, 'Team identifier');
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    await this.getTeam(teamId, tenantId);
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('DELETE FROM enterprise_team_members WHERE teamId = ?', [teamId]);
      await conn.query('DELETE FROM enterprise_teams WHERE id = ? AND tenantId = ?', [teamId, tenantId]);
      await conn.commit();
      return { success: true };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async addTeamMember({ tenantId, teamId, principalId, role = 'MEMBER' }) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    teamId = assertUuid(teamId, 'Team identifier');
    principalId = assertPrincipalId(principalId);
    await this.getTeam(teamId, tenantId);
    const membership = await this.getMembership(tenantId, principalId);
    if (membership.status !== 'ACTIVE') throw Object.assign(new Error('Member must be active in tenant'), { code: 'TENANT_MEMBERSHIP_INACTIVE', status: 409 });
    const id = `${teamId}_${stablePrincipalHash(principalId)}`;
    await this.pool.query(
      `INSERT INTO enterprise_team_members (id, teamId, tenantId, principalId, role)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE role = VALUES(role), updated_at = CURRENT_TIMESTAMP`,
      [id, teamId, tenantId, principalId, role || 'MEMBER']
    );
    return { id, teamId, tenantId, principalId, role: role || 'MEMBER' };
  }

  async removeTeamMember({ tenantId, teamId, principalId }) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    teamId = assertUuid(teamId, 'Team identifier');
    principalId = assertPrincipalId(principalId);
    await this.pool.query('DELETE FROM enterprise_team_members WHERE teamId = ? AND tenantId = ? AND principalId = ?', [teamId, tenantId, principalId]);
    return { success: true };
  }

  async listTeamMembers({ tenantId, teamId }) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    teamId = assertUuid(teamId, 'Team identifier');
    await this.getTeam(teamId, tenantId);
    const [rows] = await this.pool.query('SELECT * FROM enterprise_team_members WHERE teamId = ? AND tenantId = ? ORDER BY principalId ASC', [teamId, tenantId]);
    return rows;
  }

  async purgeTenantRecords(tenantId, { requestId = null } = {}) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const [tenantRows] = await conn.query(
        'SELECT lifecycleState FROM enterprise_tenants WHERE id = ? FOR UPDATE',
        [tenantId]
      );
      if (!tenantRows.length) {
        await conn.commit();
        return { success: true, alreadyPurged: true };
      }
      if (String(tenantRows[0].lifecycleState).toUpperCase() !== 'DELETING') {
        throw Object.assign(new Error('Only a tenant in DELETING state can be hard-purged'), {
          code: 'TENANT_PURGE_STATE_INVALID', status: 409,
        });
      }

      // Lock and cancel undelivered invitation notifications before removing
      // their relational bindings. The notification rows are deleted below in
      // the same transaction, so no worker can deliver after a committed purge.
      await conn.query(
        `UPDATE notification_outbox o
         JOIN enterprise_membership_invitations i ON i.notificationId = o.id
         SET o.state = 'CANCELLED', o.next_attempt_at = 0, o.lease_owner = NULL,
             o.lease_expires_at = 0, o.last_error = 'Tenant was purged', o.updated_at = NOW(6)
         WHERE i.tenantId = ? AND o.provider_accepted = 0
           AND o.state IN ('NOTIFICATION_QUEUED', 'RETRYING', 'DELIVERY_ATTEMPTED')`,
        [tenantId]
      );

      // Delete dependants before workspace/tenant owners. This ordering is
      // compatible with migration 006's tenant+workspace AI foreign key.
      await conn.query('DELETE FROM enterprise_membership_invitations WHERE tenantId = ?', [tenantId]);
      await conn.query('DELETE FROM enterprise_team_members WHERE tenantId = ?', [tenantId]);
      await conn.query('DELETE FROM enterprise_teams WHERE tenantId = ?', [tenantId]);
      await conn.query('DELETE FROM enterprise_workspace_memberships WHERE tenantId = ?', [tenantId]);
      await conn.query('DELETE FROM enterprise_resources WHERE tenantId = ?', [tenantId]);
      await conn.query('DELETE FROM enterprise_ai_usage WHERE tenantId = ?', [tenantId]);
      await conn.query('DELETE FROM enterprise_service_accounts WHERE tenantId = ?', [tenantId]);
      await conn.query('DELETE FROM enterprise_support_grants WHERE tenantId = ?', [tenantId]);
      await conn.query('DELETE FROM enterprise_outbox WHERE tenantId = ?', [tenantId]);
      await conn.query('DELETE FROM notification_outbox WHERE tenant_id = ?', [tenantId]);
      await conn.query('DELETE FROM enterprise_audit_events WHERE tenantId = ?', [tenantId]);
      await conn.query('DELETE FROM enterprise_memberships WHERE tenantId = ?', [tenantId]);
      await conn.query('DELETE FROM enterprise_principal_tenants WHERE personalTenantId = ?', [tenantId]);
      await conn.query('DELETE FROM enterprise_tenant_configurations WHERE tenantId = ?', [tenantId]);
      await conn.query('DELETE FROM enterprise_workspaces WHERE tenantId = ?', [tenantId]);

      // Retain one non-tenant-owned platform audit record for incident and
      // deletion-accountability purposes; never recreate a tenant audit row
      // after the tenant partition has been erased.
      await conn.query(
        `INSERT INTO security_audit_logs
         (id, actor_uid, action, category, severity, target_type, target_id, metadata, request_id)
         VALUES (?, 'system:tenant-gc', 'PLATFORM_TENANT_HARD_DELETED', 'enterprise.tenancy',
                 'HIGH', 'TENANT', ?, ?, ?)`,
        [crypto.randomUUID(), tenantId, JSON.stringify({ tenantId, purgeMode: 'hard-delete' }), requestId ? String(requestId).slice(0, 128) : null]
      );
      await conn.query('DELETE FROM enterprise_tenants WHERE id = ?', [tenantId]);
      await conn.commit();
      return { success: true, alreadyPurged: false };
    } catch (err) {
      await conn.rollback().catch(() => {});
      throw err;
    } finally {
      conn.release();
    }
  }
}

module.exports = {
  MySqlTenantRegistry,
  DEFAULT_DATA_PLANE,
  customRoleIds,
  defaultTenantConfiguration,
  membershipDocumentId,
  normalizeCustomRoles,
  normalizeRoles,
  normalizeTenantConfiguration,
  validateMembership,
  validateTenantRecord,
  workspaceMembershipDocumentId,
};
