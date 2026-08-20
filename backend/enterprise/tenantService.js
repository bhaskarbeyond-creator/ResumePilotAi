'use strict';

const { permissionsFor } = require('../security/auth');
const { buildTenantAuditEvent, writeTenantAuditEvent } = require('./tenantAudit');
const { createTenantPool, TenantDataPlaneRouter } = require('./tenantDataPlane');
const { FirestoreTenantRegistry } = require('./tenantRegistry');
const { freezeContext } = require('./tenantContext');
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

class TenantService {
  constructor({ registry, db = null, admin = null, dataPlaneRouter = null, repository = tenantRepository }) {
    this.registry = registry;
    this.db = db;
    this.admin = admin;
    this.dataPlaneRouter = dataPlaneRouter;
    this.repository = repository;
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

  async authorizeOutboxEvent(event) {
    const tenantEnvelope = event?.tenant;
    if (!tenantEnvelope) return true;
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
    return this.registry.listAccessibleWorkspaces({ tenantId: context.tenantId, principalId: context.principalId, roles: context.roles });
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

function createTenantService({ db, admin, registry = null, dataPlaneRouter = null, environment = process.env } = {}) {
  let resolvedRouter = dataPlaneRouter;
  // Pool creation is opt-in and does not connect at startup. A missing explicit
  // TENANT_DATABASE_URL leaves RLS-backed resource routes unavailable rather than
  // falling back to Firebase or a generic database URL.
  if (!resolvedRouter && String(environment.TENANT_DATABASE_URL || '').trim()) {
    resolvedRouter = new TenantDataPlaneRouter({ sharedPool: createTenantPool({ connectionString: environment.TENANT_DATABASE_URL }) });
  }
  return new TenantService({ registry: registry || new FirestoreTenantRegistry({ db, admin }), db, admin, dataPlaneRouter: resolvedRouter });
}

module.exports = {
  TenantService,
  createTenantService,
  isPlatformTenantProvisioner,
};
