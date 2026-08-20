'use strict';

const { permissionsFor } = require('../security/auth');
const { buildTenantAuditEvent, writeTenantAuditEvent } = require('./tenantAudit');
const { createTenantPool, TenantDataPlaneRouter } = require('./tenantDataPlane');
const { FirestoreTenantRegistry, InMemoryTenantRegistry, membershipDocumentId } = require('./tenantRegistry');
const { FirestoreServiceAccountStore } = require('./serviceAccountStore');
const { FirestoreSupportGrantStore } = require('./supportAccessStore');
const { FirestoreAtomicCounterStore, TenantQuotaGuard } = require('./tenantQuota');
const { assertUuid, canonicalPrincipalId, freezeContext } = require('./tenantContext');
const { permissionsForRoles } = require('./tenantPolicy');
const tenantRepository = require('./tenantRepository');

function profileFromUser(user) {
  return {
    displayName: String(user?.claims?.name || user?.claims?.display_name || user?.email || '').slice(0, 120),
  };
}

function isPlatformTenantProvisioner(user) {
  const permissions = permissionsFor(user);
  return permissions.has('*') || permissions.has('system.config.write');
}

function isSupportEligible(user) {
  const role = String(user?.claims?.role || '').toUpperCase();
  const permissions = permissionsFor(user);
  return ['SUPPORT', 'ADMIN', 'SUPER_ADMIN'].includes(role) || permissions.has('*') || permissions.has('tenant.support.access');
}

class TenantService {
  constructor({ registry, db = null, admin = null, dataPlaneRouter = null, repository = tenantRepository, serviceAccountStore = null, supportGrantStore = null, quotaGuard = null }) {
    this.registry = registry;
    this.db = db;
    this.admin = admin;
    this.dataPlaneRouter = dataPlaneRouter;
    this.repository = repository;
    this.serviceAccountStore = serviceAccountStore;
    this.supportGrantStore = supportGrantStore;
    this.quotaGuard = quotaGuard;
  }

  async resolveContext({ user, requestedTenantId, requestedWorkspaceId, requestId }) {
    const principalId = user?.uid;
    const resolved = await this.registry.resolveMembership({
      principalId,
      requestedTenantId,
      requestedWorkspaceId,
      profile: profileFromUser(user),
    });
    const configuration = await this.registry.getTenantConfiguration(resolved.tenant.id);
    const tenant = { ...resolved.tenant, configuration, aiPolicy: configuration.aiPolicy };
    const permissions = [...permissionsForRoles(resolved.membership.roles)];
    const workspaceScope = resolved.membership.roles.some(role => ['TENANT_OWNER', 'TENANT_ADMIN'].includes(String(role).toUpperCase()))
      ? 'TENANT'
      : 'WORKSPACE';
    const context = freezeContext({
      requestId,
      correlationId: requestId,
      principalId: resolved.membership.canonicalPrincipalId,
      subjectId: principalId,
      identityIssuer: 'firebase',
      actorType: 'user',
      tenantId: tenant.id,
      workspaceId: resolved.workspace?.id || null,
      tenant,
      membership: resolved.membership,
      permissions,
      workspaceScope,
      dataPlane: tenant.dataPlane,
    });
    return { context, tenant, membership: resolved.membership, workspace: resolved.workspace };
  }

  async listTenants({ user }) {
    const rows = await this.registry.listMemberships(user?.uid);
    return rows.map(({ membership, tenant }) => ({
      id: tenant.id,
      slug: tenant.slug,
      displayName: tenant.displayName,
      lifecycleState: tenant.lifecycleState,
      isolationTier: tenant.isolationTier,
      region: tenant.dataPlane.region,
      dataPlaneType: tenant.dataPlane.type,
      roles: membership.roles,
      defaultWorkspaceId: membership.workspaceId || null,
      personalTenant: membership.personalTenant === true,
    }));
  }

  async createSupportGrant({ user, context = null, input, requestId }) {
    const tenantScopedRequest = Boolean(context?.tenantId);
    if (!tenantScopedRequest && !isPlatformTenantProvisioner(user)) {
      throw Object.assign(new Error('Platform support-grant permission is required'), { code: 'FORBIDDEN', status: 403 });
    }
    if (!this.supportGrantStore) {
      throw Object.assign(new Error('Support access store is unavailable'), { code: 'SUPPORT_ACCESS_UNAVAILABLE', status: 503 });
    }
    const tenantId = tenantScopedRequest ? context.tenantId : assertUuid(input?.tenantId, 'Tenant identifier');
    const workspaceId = tenantScopedRequest
      ? (context.workspaceScope === 'TENANT' && input?.workspaceId ? assertUuid(input.workspaceId, 'Workspace identifier') : assertUuid(context.workspaceId, 'Workspace identifier'))
      : assertUuid(input?.workspaceId, 'Workspace identifier');
    const supportSubjectId = String(input?.supportSubjectId || '');
    if (this.admin?.auth) {
      try {
        const supportUser = await this.admin.auth().getUser(supportSubjectId);
        if (supportUser.disabled || !['SUPPORT', 'ADMIN', 'SUPER_ADMIN'].includes(String(supportUser.customClaims?.role || '').toUpperCase())) {
          throw Object.assign(new Error('Support identity is not eligible for tenant support access'), { code: 'SUPPORT_IDENTITY_NOT_ELIGIBLE', status: 403 });
        }
      } catch (error) {
        if (error.status) throw error;
        throw Object.assign(new Error('Support identity was not found'), { code: 'SUPPORT_IDENTITY_NOT_FOUND', status: 404 });
      }
    }
    const [tenant, workspace] = await Promise.all([
      this.registry.getTenant(tenantId),
      this.registry.getWorkspace(workspaceId, tenantId),
    ]);
    if (tenantScopedRequest && context.workspaceScope !== 'TENANT' && workspace.id !== context.workspaceId) {
      throw Object.assign(new Error('Support grant workspace is not permitted'), { code: 'WORKSPACE_FORBIDDEN', status: 403 });
    }
    if (tenant.lifecycleState !== 'ACTIVE') {
      throw Object.assign(new Error('Tenant is not active'), { code: 'TENANT_INACTIVE', status: 403 });
    }
    const grant = await this.supportGrantStore.create({
      tenantId,
      workspaceId: workspace.id,
      supportSubjectId,
      requestedBySubjectId: user.uid,
      reason: input?.reason,
      expiresInMinutes: input?.expiresInMinutes,
      scopes: input?.scopes || ['tenant.audit.read'],
    });
    if (this.db && this.admin) {
      await this.db.collection('security_audit_logs').doc().set({
        action: 'SUPPORT_GRANT_CREATED', actorUid: user.uid, tenantId, workspaceId: workspace.id,
        supportSubjectId: grant.supportSubjectId, supportGrantId: grant.id, reason: grant.reason,
        requestId: requestId || null, expiresAt: grant.expiresAt,
        createdAt: this.admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    return grant;
  }

  async revokeSupportGrant({ user, context = null, grantId, requestId }) {
    const tenantScopedRequest = Boolean(context?.tenantId);
    if (!tenantScopedRequest && !isPlatformTenantProvisioner(user)) {
      throw Object.assign(new Error('Platform support-grant permission is required'), { code: 'FORBIDDEN', status: 403 });
    }
    if (!this.supportGrantStore) {
      throw Object.assign(new Error('Support access store is unavailable'), { code: 'SUPPORT_ACCESS_UNAVAILABLE', status: 503 });
    }
    const revoked = await this.supportGrantStore.revoke(grantId, tenantScopedRequest ? {
      tenantId: context.tenantId,
      workspaceId: context.workspaceScope === 'TENANT' ? null : context.workspaceId,
    } : {});
    if (!revoked) throw Object.assign(new Error('Support grant was not found'), { code: 'SUPPORT_GRANT_NOT_FOUND', status: 404 });
    if (this.db && this.admin?.firestore?.FieldValue) {
      await this.db.collection('security_audit_logs').doc().set({
        action: 'SUPPORT_GRANT_REVOKED', actorUid: user.uid, supportGrantId: String(grantId), requestId: requestId || null,
        tenantId: context?.tenantId || null,
        workspaceId: context?.workspaceId || null,
        createdAt: this.admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    return true;
  }

  async resolveSupportContext({ user, grantId, requestedTenantId, requestedWorkspaceId, requestId }) {
    if (!isSupportEligible(user)) {
      throw Object.assign(new Error('Support access is not permitted'), { code: 'FORBIDDEN', status: 403 });
    }
    if (!this.supportGrantStore) {
      throw Object.assign(new Error('Support access store is unavailable'), { code: 'SUPPORT_ACCESS_UNAVAILABLE', status: 503 });
    }
    const tenantId = assertUuid(requestedTenantId, 'Tenant identifier');
    const workspaceId = assertUuid(requestedWorkspaceId, 'Workspace identifier');
    const grant = await this.supportGrantStore.validate({ grantId, supportSubjectId: user.uid, tenantId, workspaceId });
    if (!grant) {
      throw Object.assign(new Error('Support grant is invalid, expired, or unavailable in this tenant'), { code: 'SUPPORT_GRANT_DENIED', status: 403 });
    }
    const [tenant, workspace, configuration] = await Promise.all([
      this.registry.getTenant(tenantId),
      this.registry.getWorkspace(workspaceId, tenantId),
      this.registry.getTenantConfiguration(tenantId),
    ]);
    if (tenant.lifecycleState !== 'ACTIVE') {
      throw Object.assign(new Error('Tenant is not active'), { code: 'TENANT_INACTIVE', status: 403 });
    }
    const context = freezeContext({
      requestId,
      correlationId: requestId,
      principalId: canonicalPrincipalId(user.uid),
      subjectId: user.uid,
      identityIssuer: 'firebase',
      actorType: 'support',
      supportGrantId: grant.id,
      tenantId,
      workspaceId,
      tenant: { ...tenant, configuration, aiPolicy: configuration.aiPolicy },
      membership: { id: `support:${grant.id}`, status: 'ACTIVE', roles: [] },
      permissions: grant.scopes,
      workspaceScope: 'WORKSPACE',
      dataPlane: tenant.dataPlane,
    });
    return { context, tenant: { ...tenant, configuration, aiPolicy: configuration.aiPolicy }, workspace, grant };
  }

  async createServiceAccount({ context, input }) {
    if (!this.serviceAccountStore) {
      throw Object.assign(new Error('Service account store is unavailable'), { code: 'SERVICE_ACCOUNT_STORE_UNAVAILABLE', status: 503 });
    }
    const workspaceId = input?.workspaceId || context.workspaceId;
    if (context.workspaceScope !== 'TENANT' && workspaceId !== context.workspaceId) {
      throw Object.assign(new Error('Service account workspace is not permitted'), { code: 'WORKSPACE_FORBIDDEN', status: 403 });
    }
    const created = await this.serviceAccountStore.create({
      tenantId: context.tenantId,
      workspaceId: assertUuid(workspaceId, 'Workspace identifier'),
      displayName: input?.displayName,
      scopes: input?.scopes,
    });
    if (this.db && this.admin) {
      const event = buildTenantAuditEvent({
        context,
        action: 'SERVICE_ACCOUNT_CREATED',
        category: 'tenant.security',
        severity: 'HIGH',
        resource: { type: 'service_account', id: created.account.id },
        metadata: { scopes: created.material.record.scopes.join(',') },
      });
      await writeTenantAuditEvent(this.db, this.admin, event);
    }
    return created;
  }

  async listServiceAccounts({ context }) {
    if (!this.serviceAccountStore) {
      throw Object.assign(new Error('Service account store is unavailable'), { code: 'SERVICE_ACCOUNT_STORE_UNAVAILABLE', status: 503 });
    }
    return this.serviceAccountStore.list({
      tenantId: context.tenantId,
      workspaceId: context.workspaceScope === 'TENANT' ? null : context.workspaceId,
    });
  }

  async revokeServiceAccount({ context, serviceAccountId }) {
    if (!this.serviceAccountStore) {
      throw Object.assign(new Error('Service account store is unavailable'), { code: 'SERVICE_ACCOUNT_STORE_UNAVAILABLE', status: 503 });
    }
    const revoked = await this.serviceAccountStore.revoke(serviceAccountId, {
      tenantId: context.tenantId,
      workspaceId: context.workspaceScope === 'TENANT' ? null : context.workspaceId,
    });
    if (!revoked) throw Object.assign(new Error('Service account was not found'), { code: 'SERVICE_ACCOUNT_NOT_FOUND', status: 404 });
    if (this.db && this.admin) {
      const event = buildTenantAuditEvent({
        context,
        action: 'SERVICE_ACCOUNT_REVOKED',
        category: 'tenant.security',
        severity: 'HIGH',
        resource: { type: 'service_account', id: serviceAccountId },
      });
      await writeTenantAuditEvent(this.db, this.admin, event);
    }
    return true;
  }

  async listSupportGrants({ context }) {
    if (!this.supportGrantStore) {
      throw Object.assign(new Error('Support access store is unavailable'), { code: 'SUPPORT_ACCESS_UNAVAILABLE', status: 503 });
    }
    return this.supportGrantStore.list({
      tenantId: context.tenantId,
      workspaceId: context.workspaceScope === 'TENANT' ? null : context.workspaceId,
    });
  }

  async createWorkspace({ context, input }) {
    const workspace = await this.registry.createWorkspace({
      tenantId: context.tenantId,
      name: input?.name,
      isDefault: input?.isDefault === true,
    });
    if (this.db && this.admin) {
      const event = buildTenantAuditEvent({
        context,
        action: 'WORKSPACE_CREATED',
        category: 'tenant.workspace',
        resource: { type: 'workspace', id: workspace.id },
        metadata: { name: workspace.name },
      });
      await writeTenantAuditEvent(this.db, this.admin, event);
    }
    return workspace;
  }

  async authenticateServiceApiKey({ apiKey, requestedTenantId = null, requestedWorkspaceId = null, requestId }) {
    if (!this.serviceAccountStore) {
      throw Object.assign(new Error('Service account store is unavailable'), { code: 'SERVICE_ACCOUNT_STORE_UNAVAILABLE', status: 503 });
    }
    const authenticated = await this.serviceAccountStore.authenticate(apiKey);
    if (!authenticated) {
      throw Object.assign(new Error('Service API key is invalid'), { code: 'INVALID_SERVICE_API_KEY', status: 401 });
    }
    const { account, key } = authenticated;
    if (requestedTenantId && assertUuid(requestedTenantId, 'Tenant identifier') !== account.tenantId) {
      throw Object.assign(new Error('Service API key is unavailable in this tenant'), { code: 'SERVICE_TENANT_NOT_FOUND', status: 404 });
    }
    if (requestedWorkspaceId && assertUuid(requestedWorkspaceId, 'Workspace identifier') !== account.workspaceId) {
      throw Object.assign(new Error('Service API key is unavailable in this workspace'), { code: 'SERVICE_WORKSPACE_NOT_FOUND', status: 404 });
    }
    const [tenant, workspace, configuration] = await Promise.all([
      this.registry.getTenant(account.tenantId),
      this.registry.getWorkspace(account.workspaceId, account.tenantId),
      this.registry.getTenantConfiguration(account.tenantId),
    ]);
    if (tenant.lifecycleState !== 'ACTIVE') {
      throw Object.assign(new Error('Tenant is not active'), { code: 'TENANT_INACTIVE', status: 403 });
    }
    const context = freezeContext({
      requestId,
      correlationId: requestId,
      principalId: account.id,
      subjectId: `service:${account.id}`,
      identityIssuer: 'service',
      actorType: 'service',
      tenantId: tenant.id,
      workspaceId: workspace.id,
      tenant: { ...tenant, configuration, aiPolicy: configuration.aiPolicy },
      membership: { id: `service:${account.id}`, status: 'ACTIVE', roles: [] },
      permissions: key.scopes,
      workspaceScope: 'WORKSPACE',
      dataPlane: tenant.dataPlane,
    });
    return { context, tenant: { ...tenant, configuration, aiPolicy: configuration.aiPolicy }, workspace, account, key };
  }

  async authorizeOutboxEvent(event) {
    const tenantEnvelope = event?.tenant;
    if (!tenantEnvelope) return true;
    // Current legacy bridge reauthorizes Firebase user subjects only. Future OIDC/
    // SCIM workers must supply an issuer-aware resolver instead of guessing.
    if (tenantEnvelope.identityIssuer && tenantEnvelope.identityIssuer !== 'firebase') return false;
    try {
      const resolved = await this.resolveContext({
        user: { uid: tenantEnvelope.subjectId, email: null, emailVerified: true, claims: {} },
        requestedTenantId: tenantEnvelope.tenantId,
        requestedWorkspaceId: tenantEnvelope.workspaceId,
        requestId: tenantEnvelope.requestId || tenantEnvelope.correlationId,
      });
      return resolved.context.principalId === tenantEnvelope.principalId
        && resolved.context.dataPlane.id === tenantEnvelope.dataPlaneId
        && resolved.context.dataPlane.routingVersion === Number(tenantEnvelope.routingVersion);
    } catch {
      return false;
    }
  }

  async listAuditEvents({ context, limit = 100 }) {
    if (!this.db) throw Object.assign(new Error('Tenant audit store is unavailable'), { code: 'TENANT_AUDIT_UNAVAILABLE', status: 503 });
    const boundedLimit = Math.max(1, Math.min(Number(limit) || 100, 250));
    const snapshot = await this.db.collection('enterprise_audit_events').where('tenantId', '==', context.tenantId).limit(boundedLimit).get();
    return snapshot.docs.map(document => ({ id: document.id, ...document.data() }))
      .sort((left, right) => new Date(right.occurredAt || 0) - new Date(left.occurredAt || 0));
  }

  async getTenantConfiguration({ context }) {
    return this.registry.getTenantConfiguration(context.tenantId);
  }

  async updateTenantConfiguration({ context, input, expectedRevision }) {
    const configuration = await this.registry.updateTenantConfiguration({ tenantId: context.tenantId, input, expectedRevision });
    if (this.db && this.admin) {
      const event = buildTenantAuditEvent({
        context,
        action: 'TENANT_CONFIGURATION_UPDATED',
        category: 'tenant.configuration',
        severity: 'HIGH',
        metadata: { configurationRevision: configuration.revision },
      });
      await writeTenantAuditEvent(this.db, this.admin, event);
    }
    return configuration;
  }

  async setTenantLifecycleAsPlatform({ user, tenantId, nextState, requestId }) {
    if (!isPlatformTenantProvisioner(user)) {
      throw Object.assign(new Error('Platform tenant lifecycle permission is required'), { code: 'FORBIDDEN', status: 403 });
    }
    const tenant = await this.registry.setTenantLifecycleState({ tenantId, nextState });
    if (this.db && this.admin?.firestore?.FieldValue) {
      await this.db.collection('security_audit_logs').doc().set({
        action: `PLATFORM_TENANT_${String(nextState).toUpperCase()}`,
        actorUid: user.uid,
        tenantId: tenant.id,
        requestId: requestId || null,
        createdAt: this.admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    return tenant;
  }

  async setTenantLifecycleState({ context, nextState }) {
    const tenant = await this.registry.setTenantLifecycleState({ tenantId: context.tenantId, nextState });
    if (this.db && this.admin) {
      const event = buildTenantAuditEvent({
        context,
        action: `TENANT_${String(nextState).toUpperCase()}`,
        category: 'tenant.lifecycle',
        severity: 'HIGH',
        resource: { type: 'tenant', id: context.tenantId },
      });
      await writeTenantAuditEvent(this.db, this.admin, event);
    }
    return tenant;
  }

  async listWorkspaces({ context }) {
    // Registry membership records are keyed by the verified external identity
    // subject; PostgreSQL resource rows use the canonical UUID principal.
    return this.registry.listAccessibleWorkspaces({ tenantId: context.tenantId, principalId: context.subjectId, roles: context.roles });
  }

  async listTenantMemberships({ context }) {
    return this.registry.listTenantMemberships(context.tenantId);
  }

  async listTeams({ context }) {
    return this.registry.listTeams({
      tenantId: context.tenantId,
      workspaceId: context.workspaceScope === 'TENANT' ? null : context.workspaceId,
    });
  }

  async createTeam({ context, input }) {
    const workspaceId = input?.workspaceId || context.workspaceId;
    if (context.workspaceScope !== 'TENANT' && workspaceId !== context.workspaceId) {
      throw Object.assign(new Error('Workspace team access is not permitted'), { code: 'WORKSPACE_FORBIDDEN', status: 403 });
    }
    const team = await this.registry.createTeam({ tenantId: context.tenantId, workspaceId, name: input?.name });
    if (this.db && this.admin) {
      const event = buildTenantAuditEvent({
        context,
        action: 'TEAM_CREATED',
        category: 'tenant.team',
        resource: { type: 'team', id: team.id },
        metadata: { workspaceId: team.workspaceId },
      });
      await writeTenantAuditEvent(this.db, this.admin, event);
    }
    return team;
  }

  async grantMembership({ context, input }) {
    const targetPrincipalId = String(input?.principalId || '');
    const requestedRoles = Array.isArray(input?.roles) ? input.roles.map(role => String(role).toUpperCase()) : ['MEMBER'];
    if (requestedRoles.includes('TENANT_OWNER') && !context.roles.includes('TENANT_OWNER')) {
      throw Object.assign(new Error('Only a tenant owner may grant tenant ownership'), { code: 'TENANT_OWNER_GRANT_FORBIDDEN', status: 403 });
    }
    // The foundation grants only already-known identities. Email invitations/SCIM
    // become separate lifecycle flows; never create a membership for an arbitrary
    // unverified client-supplied subject.
    if (this.admin?.auth) {
      try {
        const target = await this.admin.auth().getUser(targetPrincipalId);
        if (target.disabled) throw Object.assign(new Error('Target identity is suspended'), { code: 'TARGET_PRINCIPAL_SUSPENDED', status: 409 });
      } catch (error) {
        if (error.status) throw error;
        throw Object.assign(new Error('Target identity was not found'), { code: 'TARGET_PRINCIPAL_NOT_FOUND', status: 404 });
      }
    }
    const membership = await this.registry.grantMembership({
      tenantId: context.tenantId,
      principalId: targetPrincipalId,
      workspaceId: input?.workspaceId || context.workspaceId,
      roles: input?.roles || ['MEMBER'],
    });
    if (this.db && this.admin) {
      const event = buildTenantAuditEvent({
        context,
        action: 'TENANT_MEMBERSHIP_GRANTED',
        category: 'tenant.membership',
        resource: { type: 'membership', id: membership.id },
        severity: 'HIGH',
        metadata: { targetPrincipalId: membership.principalId, roles: membership.roles.join(',') },
      });
      await writeTenantAuditEvent(this.db, this.admin, event);
    }
    return membership;
  }

  async updateTenantMembership({ context, principalId, input }) {
    const requestedRoles = Array.isArray(input?.roles) ? input.roles.map(role => String(role).toUpperCase()) : null;
    if (requestedRoles && requestedRoles.includes('TENANT_OWNER') && !context.roles.includes('TENANT_OWNER')) {
      throw Object.assign(new Error('Only a tenant owner may grant tenant ownership'), { code: 'TENANT_OWNER_GRANT_FORBIDDEN', status: 403 });
    }
    const membership = await this.registry.updateTenantMembership({
      tenantId: context.tenantId,
      principalId,
      roles: requestedRoles,
      status: input?.status ? String(input.status).toUpperCase() : null,
      workspaceId: input?.workspaceId || null,
    });
    if (this.db && this.admin) {
      const event = buildTenantAuditEvent({
        context,
        action: 'TENANT_MEMBERSHIP_UPDATED',
        category: 'tenant.membership',
        resource: { type: 'membership', id: membership.id },
        severity: 'HIGH',
        metadata: { targetPrincipalId: membership.principalId, roles: membership.roles.join(','), status: membership.status },
      });
      await writeTenantAuditEvent(this.db, this.admin, event);
    }
    return membership;
  }

  async removeTenantMembership({ context, principalId }) {
    await this.registry.removeTenantMembership({ tenantId: context.tenantId, principalId });
    if (this.db && this.admin) {
      const event = buildTenantAuditEvent({
        context,
        action: 'TENANT_MEMBERSHIP_REMOVED',
        category: 'tenant.membership',
        resource: { type: 'membership', id: membershipDocumentId(context.tenantId, principalId) },
        severity: 'HIGH',
        metadata: { targetPrincipalId: principalId },
      });
      await writeTenantAuditEvent(this.db, this.admin, event);
    }
    return true;
  }

  async withTenantDataPlane(context, callback) {
    if (!this.dataPlaneRouter) {
      throw Object.assign(new Error('Tenant PostgreSQL data plane is not configured'), { code: 'TENANT_DATA_PLANE_UNAVAILABLE', status: 503 });
    }
    return this.dataPlaneRouter.withContext(context, callback);
  }

  async createResource({ context, input }) {
    return this.withTenantDataPlane(context, async tx => {
      const resource = await this.repository.createTenantResource(tx, context, input);
      await this.repository.appendTenantAuditEvent(tx, context, { action: 'RESOURCE_CREATED', category: 'resource.lifecycle', resource: { type: resource.resourceType, id: resource.id } });
      return resource;
    });
  }

  async getResource({ context, resourceId }) {
    return this.withTenantDataPlane(context, tx => this.repository.getTenantResource(tx, context, resourceId));
  }

  async listResources({ context, options }) {
    return this.withTenantDataPlane(context, tx => this.repository.listTenantResources(tx, context, options));
  }

  async updateResource({ context, resourceId, input }) {
    return this.withTenantDataPlane(context, async tx => {
      const resource = await this.repository.updateTenantResource(tx, context, resourceId, input);
      if (resource) await this.repository.appendTenantAuditEvent(tx, context, { action: 'RESOURCE_UPDATED', category: 'resource.lifecycle', resource: { type: resource.resourceType, id: resource.id } });
      return resource;
    });
  }

  async deleteResource({ context, resourceId }) {
    return this.withTenantDataPlane(context, async tx => {
      const resource = await this.repository.getTenantResource(tx, context, resourceId);
      if (!resource) return false;
      await this.repository.deleteTenantResource(tx, context, resourceId);
      await this.repository.appendTenantAuditEvent(tx, context, { action: 'RESOURCE_DELETED', category: 'resource.lifecycle', severity: 'HIGH', resource: { type: resource.resourceType, id: resource.id } });
      return true;
    });
  }

  async consumeTenantQuota({ context, metric, limit, windowMs, principalScoped = true }) {
    if (!this.quotaGuard) {
      throw Object.assign(new Error('Tenant quota coordination is unavailable'), { code: 'TENANT_QUOTA_UNAVAILABLE', status: 503 });
    }
    return this.quotaGuard.consume({ context, metric, limit, windowMs, principalScoped });
  }

  async recordAiUsage({ context, input }) {
    return this.withTenantDataPlane(context, async tx => {
      const usage = await this.repository.recordTenantAiUsage(tx, context, input);
      await this.repository.appendTenantAuditEvent(tx, context, { action: 'AI_GENERATION_COMPLETED', category: 'ai.usage', resource: null, metadata: { provider: input.provider, model: input.model, operation: input.operation } });
      return usage;
    });
  }

  async provisionTenant({ user, input, requestId }) {
    if (!isPlatformTenantProvisioner(user)) {
      throw Object.assign(new Error('Platform tenant provisioning permission is required'), { code: 'FORBIDDEN', status: 403 });
    }
    const result = await this.registry.provisionTenant({
      ownerPrincipalId: user.uid,
      displayName: input?.displayName,
      slug: input?.slug,
      isolationTier: input?.isolationTier,
      dataPlane: input?.dataPlane,
      region: input?.region,
    });
    const resolved = await this.resolveContext({ user, requestedTenantId: result.tenantId, requestedWorkspaceId: result.workspaceId, requestId });
    if (this.db && this.admin) {
      const event = buildTenantAuditEvent({
        context: resolved.context,
        action: 'TENANT_PROVISIONED',
        category: 'tenant.lifecycle',
        resource: { type: 'tenant', id: result.tenantId },
        severity: 'HIGH',
        metadata: { isolationTier: resolved.tenant.isolationTier, dataPlaneType: resolved.tenant.dataPlane.type },
      });
      await writeTenantAuditEvent(this.db, this.admin, event);
    }
    return { ...result, tenant: resolved.tenant, workspace: resolved.workspace };
  }
}

function createTenantService({ db, admin, registry = null, dataPlaneRouter = null, serviceAccountStore = null, supportGrantStore = null, quotaGuard = null, environment = process.env } = {}) {
  let resolvedRouter = dataPlaneRouter;
  // Pool creation is opt-in and does not connect at startup. A missing explicit
  // TENANT_DATABASE_URL leaves RLS-backed resource routes unavailable rather than
  // falling back to Firebase or a generic database URL.
  if (!resolvedRouter && String(environment.TENANT_DATABASE_URL || '').trim()) {
    resolvedRouter = new TenantDataPlaneRouter({ sharedPool: createTenantPool({ connectionString: environment.TENANT_DATABASE_URL }) });
  }
  const environmentIsProduction = String(environment.NODE_ENV || '').toLowerCase() === 'production';
  const resolvedRegistry = registry || (
    db
      ? new FirestoreTenantRegistry({ db, admin })
      // Local/dev fallback: without a Firestore handle the control plane cannot persist.
      // Never used in production; a production process must have db (Firestore) configured.
      : environmentIsProduction
        ? new FirestoreTenantRegistry({ db: null, admin })
        : new InMemoryTenantRegistry()
  );
  return new TenantService({
    registry: resolvedRegistry,
    db,
    admin,
    dataPlaneRouter: resolvedRouter,
    serviceAccountStore: serviceAccountStore || (db && admin ? new FirestoreServiceAccountStore({ db, admin }) : null),
    supportGrantStore: supportGrantStore || (db && admin ? new FirestoreSupportGrantStore({ db, admin }) : null),
    quotaGuard: quotaGuard || (db && admin ? new TenantQuotaGuard({ store: new FirestoreAtomicCounterStore({ db, admin }) }) : null),
  });
}

module.exports = {
  TenantService,
  createTenantService,
  isPlatformTenantProvisioner,
  isSupportEligible,
};
