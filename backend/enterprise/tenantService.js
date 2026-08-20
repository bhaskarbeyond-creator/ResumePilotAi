'use strict';

const { permissionsFor } = require('../security/auth');
const { buildTenantAuditEvent, writeTenantAuditEvent } = require('./tenantAudit');
const { createEnterpriseRepository } = require('./enterpriseRepository');
const { createEncryptionProvider } = require('./encryptionProvider');
const { FirestoreTenantRegistry, InMemoryTenantRegistry, membershipDocumentId } = require('./tenantRegistry');
const { FirestoreServiceAccountStore } = require('./serviceAccountStore');
const { FirestoreSupportGrantStore } = require('./supportAccessStore');
const { FirestoreAtomicCounterStore, TenantQuotaGuard } = require('./tenantQuota');
const { assertUuid, canonicalPrincipalId, freezeContext } = require('./tenantContext');
const { permissionsForRoles } = require('./tenantPolicy');

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
  constructor({ registry, db = null, admin = null, repository = null, serviceAccountStore = null, supportGrantStore = null, quotaGuard = null, encryptionProvider = null, dataProviderName = 'firestore', constructionError = null }) {
    this.constructionError = constructionError;
    this.registry = registry;
    this.db = db;
    this.admin = admin;
    // Enterprise business logic reaches tenant data exclusively through the
    // repository abstraction. There is no provider branching in services.
    this.repository = repository;
    this.serviceAccountStore = serviceAccountStore;
    this.supportGrantStore = supportGrantStore;
    this.quotaGuard = quotaGuard;
    this.encryptionProvider = encryptionProvider;
    this.dataProviderName = dataProviderName;
  }

  /** Truthful description of the active enterprise runtime for logs and health. */
  describeRuntime() {
    return {
      dataProvider: this.repository ? this.repository.providerName || this.dataProviderName : this.dataProviderName,
      dataPlaneConfigured: Boolean(this.repository),
      error: this.constructionError ? String(this.constructionError).slice(0, 200) : null,
      encryption: this.encryptionProvider ? this.encryptionProvider.describe() : { provider: 'none', configured: false, securityLevel: 'ENCRYPTION_UNAVAILABLE_FAIL_CLOSED' },
      quotaStore: this.quotaGuard ? 'firestore-atomic' : 'unavailable',
    };
  }

  /** AI metering is available exactly when the durable repository is configured. */
  meteringAvailable() {
    return Boolean(this.repository);
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
    this.enforceTenantSecurityPolicies({ user, configuration, roles: resolved.membership.roles });
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

  // Tenant-configured security and identity policies are enforced at every
  // context resolution, not just stored. Session age uses the verified Firebase
  // auth_time claim; MFA uses the verified sign_in_second_factor claim. When a
  // claim is absent from the verified token the corresponding check cannot be
  // evaluated and is skipped — it never trusts client-supplied values.
  enforceTenantSecurityPolicies({ user, configuration, roles = [] }) {
    const identityPolicy = configuration?.identityPolicy || {};
    const securityPolicy = configuration?.securityPolicy || {};
    const claims = user?.claims && typeof user.claims === 'object' ? user.claims : user || {};
    const maxMinutes = Number(identityPolicy.sessionMaxMinutes || 0);
    const authTime = Number(claims.auth_time || 0);
    if (maxMinutes >= 15 && authTime > 0) {
      const sessionAgeMinutes = (Date.now() / 1000 - authTime) / 60;
      if (sessionAgeMinutes > maxMinutes) {
        throw Object.assign(
          new Error('The enterprise session exceeded the tenant maximum session length. Sign in again to continue.'),
          { code: 'TENANT_SESSION_REAUTH_REQUIRED', status: 401 },
        );
      }
    }
    const isAdmin = roles.some(role => ['TENANT_OWNER', 'TENANT_ADMIN'].includes(String(role).toUpperCase()));
    if (securityPolicy.requireMfaForAdmins === true && isAdmin) {
      const secondFactor = claims.firebase?.sign_in_second_factor || claims.sign_in_second_factor || null;
      if (!secondFactor) {
        throw Object.assign(
          new Error('This tenant requires multi-factor authentication for administrator access.'),
          { code: 'TENANT_MFA_REQUIRED', status: 403 },
        );
      }
    }
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

  async listAuditEvents({ context, limit = 100, filters = {} }) {
    if (!this.repository) throw Object.assign(new Error('Tenant audit store is unavailable'), { code: 'TENANT_AUDIT_UNAVAILABLE', status: 503 });
    return this.repository.listAuditEvents(context, { limit, ...filters });
  }

  async getAiUsageSummary({ context, days = 30 }) {
    if (!this.repository) throw Object.assign(new Error('Tenant usage ledger is unavailable'), { code: 'ENTERPRISE_USAGE_UNAVAILABLE', status: 503 });
    return this.repository.getAiUsageSummary(context, { days });
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
    // subject; data-plane documents use the canonical UUID principal.
    return this.registry.listAccessibleWorkspaces({ tenantId: context.tenantId, principalId: context.subjectId, roles: context.roles });
  }

  async listAllWorkspaces({ context, includeArchived = false }) {
    // Tenant-wide administration view: includes archived workspaces so they can
    // be restored. Route-level policy restricts this to workspace administrators.
    return this.registry.listWorkspaces(context.tenantId, { includeArchived: includeArchived === true });
  }

  assertWorkspaceScopeFor(context, workspaceId, message) {
    if (context.workspaceScope !== 'TENANT' && workspaceId !== context.workspaceId) {
      throw Object.assign(new Error(message), { code: 'WORKSPACE_FORBIDDEN', status: 403 });
    }
  }

  async writeAudit(context, event) {
    if (this.db && this.admin) {
      await writeTenantAuditEvent(this.db, this.admin, buildTenantAuditEvent({ context, ...event }));
    }
  }

  async updateWorkspace({ context, workspaceId, input }) {
    workspaceId = assertUuid(workspaceId, 'Workspace identifier');
    this.assertWorkspaceScopeFor(context, workspaceId, 'Workspace management access is not permitted');
    const workspace = await this.registry.updateWorkspace({ tenantId: context.tenantId, workspaceId, name: input?.name });
    await this.writeAudit(context, {
      action: 'WORKSPACE_UPDATED', category: 'tenant.workspace',
      resource: { type: 'workspace', id: workspaceId }, metadata: { name: workspace.name },
    });
    return workspace;
  }

  async setWorkspaceLifecycle({ context, workspaceId, nextState }) {
    workspaceId = assertUuid(workspaceId, 'Workspace identifier');
    const workspace = await this.registry.setWorkspaceLifecycleState({ tenantId: context.tenantId, workspaceId, nextState });
    await this.writeAudit(context, {
      action: `WORKSPACE_${String(workspace.lifecycleState).toUpperCase()}`, category: 'tenant.workspace', severity: 'HIGH',
      resource: { type: 'workspace', id: workspaceId },
    });
    return workspace;
  }

  async listWorkspaceMembers({ context, workspaceId }) {
    workspaceId = assertUuid(workspaceId, 'Workspace identifier');
    this.assertWorkspaceScopeFor(context, workspaceId, 'Workspace member access is not permitted');
    return this.registry.listWorkspaceMembers({ tenantId: context.tenantId, workspaceId });
  }

  async addWorkspaceMember({ context, workspaceId, principalId }) {
    workspaceId = assertUuid(workspaceId, 'Workspace identifier');
    this.assertWorkspaceScopeFor(context, workspaceId, 'Workspace member management is not permitted');
    const member = await this.registry.addWorkspaceMember({ tenantId: context.tenantId, workspaceId, principalId });
    await this.writeAudit(context, {
      action: 'WORKSPACE_MEMBER_ADDED', category: 'tenant.workspace', severity: 'MEDIUM',
      resource: { type: 'workspace', id: workspaceId }, metadata: { targetPrincipalId: member.principalId },
    });
    return member;
  }

  async removeWorkspaceMember({ context, workspaceId, principalId }) {
    workspaceId = assertUuid(workspaceId, 'Workspace identifier');
    this.assertWorkspaceScopeFor(context, workspaceId, 'Workspace member management is not permitted');
    await this.registry.removeWorkspaceMember({ tenantId: context.tenantId, workspaceId, principalId });
    await this.writeAudit(context, {
      action: 'WORKSPACE_MEMBER_REMOVED', category: 'tenant.workspace', severity: 'MEDIUM',
      resource: { type: 'workspace', id: workspaceId }, metadata: { targetPrincipalId: principalId },
    });
    return true;
  }

  async updateTeam({ context, teamId, input }) {
    const team = await this.registry.getTeam(teamId, context.tenantId);
    this.assertWorkspaceScopeFor(context, team.workspaceId, 'Workspace team access is not permitted');
    const updated = await this.registry.updateTeam({ tenantId: context.tenantId, teamId, name: input?.name });
    await this.writeAudit(context, {
      action: 'TEAM_UPDATED', category: 'tenant.team',
      resource: { type: 'team', id: updated.id }, metadata: { name: updated.name },
    });
    return updated;
  }

  async archiveTeam({ context, teamId }) {
    const team = await this.registry.getTeam(teamId, context.tenantId);
    this.assertWorkspaceScopeFor(context, team.workspaceId, 'Workspace team access is not permitted');
    const archived = await this.registry.archiveTeam({ tenantId: context.tenantId, teamId });
    await this.writeAudit(context, {
      action: 'TEAM_ARCHIVED', category: 'tenant.team', severity: 'MEDIUM',
      resource: { type: 'team', id: archived.id },
    });
    return archived;
  }

  async listTeamMembers({ context, teamId }) {
    const team = await this.registry.getTeam(teamId, context.tenantId);
    this.assertWorkspaceScopeFor(context, team.workspaceId, 'Workspace team access is not permitted');
    return this.registry.listTeamMembers({ tenantId: context.tenantId, teamId });
  }

  async addTeamMember({ context, teamId, principalId }) {
    const team = await this.registry.getTeam(teamId, context.tenantId);
    this.assertWorkspaceScopeFor(context, team.workspaceId, 'Workspace team access is not permitted');
    const member = await this.registry.addTeamMember({ tenantId: context.tenantId, teamId, principalId });
    await this.writeAudit(context, {
      action: 'TEAM_MEMBER_ADDED', category: 'tenant.team',
      resource: { type: 'team', id: team.id }, metadata: { targetPrincipalId: member.principalId },
    });
    return member;
  }

  async removeTeamMember({ context, teamId, principalId }) {
    const team = await this.registry.getTeam(teamId, context.tenantId);
    this.assertWorkspaceScopeFor(context, team.workspaceId, 'Workspace team access is not permitted');
    await this.registry.removeTeamMember({ tenantId: context.tenantId, teamId, principalId });
    await this.writeAudit(context, {
      action: 'TEAM_MEMBER_REMOVED', category: 'tenant.team',
      resource: { type: 'team', id: team.id }, metadata: { targetPrincipalId: principalId },
    });
    return true;
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

  async createResource({ context, input }) {
    this.assertRepository();
    return this.repository.createResource(context, input);
  }

  async getResource({ context, resourceId }) {
    this.assertRepository();
    return this.repository.getResource(context, resourceId);
  }

  async listResources({ context, options }) {
    this.assertRepository();
    return this.repository.listResources(context, options);
  }

  async updateResource({ context, resourceId, input }) {
    this.assertRepository();
    return this.repository.updateResource(context, resourceId, input);
  }

  async deleteResource({ context, resourceId }) {
    this.assertRepository();
    return this.repository.deleteResource(context, resourceId);
  }

  async consumeTenantQuota({ context, metric, limit, windowMs, principalScoped = true }) {
    if (!this.quotaGuard) {
      throw Object.assign(new Error('Tenant quota coordination is unavailable'), { code: 'TENANT_QUOTA_UNAVAILABLE', status: 503 });
    }
    return this.quotaGuard.consume({ context, metric, limit, windowMs, principalScoped });
  }

  async recordAiUsage({ context, input }) {
    this.assertRepository();
    return this.repository.recordAiUsage(context, {
      ...input,
      // One durable ledger entry per correlation id: duplicate provider
      // callbacks or worker retries never double-count usage.
      idempotencyKey: input?.idempotencyKey || context.correlationId,
    });
  }

  assertRepository() {
    if (!this.repository) {
      throw Object.assign(new Error('Enterprise data plane is not configured'), { code: 'ENTERPRISE_DATA_PLANE_UNAVAILABLE', status: 503 });
    }
    return this.repository;
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

function createTenantService({ db, admin, registry = null, repository = null, serviceAccountStore = null, supportGrantStore = null, quotaGuard = null, environment = process.env } = {}) {
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
  // Enterprise data plane: Firestore is the only provider and needs no
  // external database, cache, queue, or KMS service.
  let encryptionProvider = null;
  try {
    encryptionProvider = createEncryptionProvider(environment);
  } catch (error) {
    // Misconfigured keys surface per-operation (fail closed) instead of
    // crashing unrelated startup paths; the runtime description stays truthful.
    encryptionProvider = Object.freeze({
      describe: () => ({ provider: error.code === 'ENTERPRISE_ENCRYPTION_PROVIDER_UNAVAILABLE' ? 'unavailable' : 'server-key', configured: false, error: error.message, securityLevel: 'ENCRYPTION_UNAVAILABLE_FAIL_CLOSED' }),
    });
  }
  let constructionError = null;
  let resolvedRepository = repository;
  if (!resolvedRepository && db) {
    try {
      resolvedRepository = createEnterpriseRepository({
        environment,
        db,
        admin,
        encryptionProvider: encryptionProvider && typeof encryptionProvider.encryptValue === 'function' ? encryptionProvider : null,
      });
    } catch (error) {
      // An explicitly requested-but-misconfigured provider must not crash the
      // legacy application process. Enterprise data routes fail closed with the
      // configuration error; the runtime description surfaces the cause.
      console.error('[Enterprise data plane] Repository construction failed:', error.message);
      resolvedRepository = null;
      constructionError = error.message;
    }
  }
  return new TenantService({
    registry: resolvedRegistry,
    db,
    admin,
    repository: resolvedRepository || null,
    serviceAccountStore: serviceAccountStore || (db && admin ? new FirestoreServiceAccountStore({ db, admin }) : null),
    supportGrantStore: supportGrantStore || (db && admin ? new FirestoreSupportGrantStore({ db, admin }) : null),
    quotaGuard: quotaGuard || (db && admin ? new TenantQuotaGuard({ store: new FirestoreAtomicCounterStore({ db, admin }) }) : null),
    encryptionProvider: encryptionProvider && typeof encryptionProvider.encryptValue === 'function' ? encryptionProvider : null,
    dataProviderName: String(environment.ENTERPRISE_DATA_PROVIDER || 'firestore').toLowerCase(),
    constructionError,
  });
}

module.exports = {
  TenantService,
  createTenantService,
  isPlatformTenantProvisioner,
  isSupportEligible,
};
