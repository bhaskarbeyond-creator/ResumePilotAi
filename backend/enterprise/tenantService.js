'use strict';

const { permissionsFor } = require('../security/auth');
const { buildTenantAuditEvent, writeTenantAuditEvent } = require('./tenantAudit');
const { createEnterpriseRepository, normalizeProvider } = require('./enterpriseRepository');
const { createEncryptionProvider } = require('./encryptionProvider');
const { MySqlTenantRegistry, membershipDocumentId, customRoleIds } = require('./mysqlTenantRegistry');
const { MySqlServiceAccountStore } = require('./mysqlServiceAccountStore');
const { MySqlSupportGrantStore } = require('./mysqlSupportGrantStore');
const { MySqlAtomicCounterStore } = require('./mysqlAtomicCounterStore');
const { assertSupportScopes } = require('./serviceIdentity');
const { TenantQuotaGuard } = require('./tenantQuota');
const { assertUuid, canonicalPrincipalId, freezeContext } = require('./tenantContext');
const { permissionsForRoles } = require('./tenantPolicy');

function profileFromUser(user) {
  return {
    displayName: String(user?.claims?.name || user?.claims?.display_name || user?.email || '').slice(0, 120),
  };
}

function compactInvitationText(value, fallback, max = 160) {
  const text = Array.from(String(value || ''), character => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? ' ' : character;
  }).join('').replace(/\s+/g, ' ').trim().slice(0, max);
  return text || fallback;
}

function buildInvitationNotification({ recipientEmail, organizationName, inviterLabel, roles, actionUrl }) {
  const organization = compactInvitationText(organizationName, 'your enterprise workspace', 120);
  const inviter = compactInvitationText(inviterLabel, 'An enterprise administrator', 120);
  const roleTitle = compactInvitationText((roles || []).join(', ').replace(/_/g, ' '), 'Enterprise Member', 160);
  const recipientName = compactInvitationText(String(recipientEmail || '').split('@')[0].replace(/[._+-]/g, ' '), 'Team member', 100);
  return {
    templateType: 'enterprise-invitation',
    vars: {
      user_name: recipientName,
      candidate_name: recipientName,
      inviter_name: inviter,
      organization_name: organization,
      role_title: roleTitle,
      action_url: actionUrl,
      expires_in: '7 days',
    },
    metadata: {
      source: 'enterprise_membership_transaction',
      customSubject: `You're invited to join ${organization} on ResumePilot Enterprise`,
      customBody: [
        `Hi ${recipientName},`,
        '',
        `${inviter} invited you to join ${organization} on ResumePilot Enterprise.`,
        `Assigned role: ${roleTitle}.`,
        '',
        'Sign in with this email address to review and accept the invitation:',
        actionUrl,
        '',
        'This invitation expires in 7 days. If you were not expecting it, ignore this message and contact your organization administrator.',
      ].join('\n'),
    },
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
  constructor({ registry, admin = null, repository = null, serviceAccountStore = null, supportGrantStore = null, quotaGuard = null, encryptionProvider = null, dataProviderName = 'mysql', constructionError = null }) {
    this.constructionError = constructionError;
    this.registry = registry;
    // Firebase Admin is retained only for identity-directory operations.
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
      quotaStore: this.quotaGuard ? 'mariadb-atomic' : 'unavailable',
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
      identityEmail: user?.email || user?.claims?.email || null,
      emailVerified: user?.emailVerified === true || user?.claims?.email_verified === true,
    });
    const configuration = await this.registry.getTenantConfiguration(resolved.tenant.id);
    this.enforceTenantSecurityPolicies({ user, configuration, roles: resolved.membership.roles });
    const tenant = { ...resolved.tenant, configuration, aiPolicy: configuration.aiPolicy };
    // Custom roles defined in the tenant configuration expand into their
    // declared whitelisted permissions at resolution time (fail closed).
    const permissions = [...permissionsForRoles(resolved.membership.roles, configuration.customRoles || {})];
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
  // auth_time claim; MFA uses the verified sign_in_second_factor claim; SSO
  // mode uses the verified firebase.sign_in_provider claim. When a claim is
  // absent from the verified token the corresponding check cannot be evaluated
  // and is skipped — it never trusts client-supplied values.
  enforceTenantSecurityPolicies({ user, configuration, roles = [] }) {
    if (isPlatformTenantProvisioner(user)) {
      return;
    }
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
    // SSO mode is an enforced identity policy: when the tenant declares SAML or
    // OIDC, non-federated sign-ins (password, phone, anonymous) cannot resolve
    // enterprise context. The provider is read from the verified token claims.
    const ssoMode = String(identityPolicy.ssoMode || 'NONE').toUpperCase();
    if (ssoMode !== 'NONE') {
      const signInProvider = String(claims.firebase?.sign_in_provider || claims.sign_in_provider || '');
      const federated = ssoMode === 'SAML'
        ? signInProvider.startsWith('saml.')
        : ssoMode === 'OIDC'
          ? signInProvider.startsWith('oidc.')
          : true;
      if (signInProvider && !federated) {
        throw Object.assign(
          new Error('This organization requires federated single sign-on. Sign in with your identity provider to continue.'),
          { code: 'TENANT_SSO_REQUIRED', status: 403 },
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
    // Grant scope: WORKSPACE (default) anchors the session to one workspace;
    // TENANT allows tenant-wide diagnostics and can only be issued by a
    // TENANT-scoped caller. Scopes remain policy-gated either way.
    const requestedGrantScope = String(input?.scope || 'WORKSPACE').trim().toUpperCase();
    if (!['TENANT', 'WORKSPACE'].includes(requestedGrantScope)) {
      throw Object.assign(new Error('Support grant scope must be TENANT or WORKSPACE'), { code: 'INVALID_SUPPORT_SCOPE', status: 400 });
    }
    if (requestedGrantScope === 'TENANT' && tenantScopedRequest && context.workspaceScope !== 'TENANT') {
      throw Object.assign(new Error('Only tenant administrators can create tenant-scoped support grants'), { code: 'WORKSPACE_FORBIDDEN', status: 403 });
    }
    let workspaceId = null;
    if (requestedGrantScope === 'WORKSPACE') {
      workspaceId = tenantScopedRequest
        ? (context.workspaceScope === 'TENANT' && input?.workspaceId ? assertUuid(input.workspaceId, 'Workspace identifier') : assertUuid(context.workspaceId, 'Workspace identifier'))
        : assertUuid(input?.workspaceId, 'Workspace identifier');
    } else if (tenantScopedRequest ? context.workspaceScope === 'TENANT' && input?.workspaceId : input?.workspaceId) {
      // A tenant-scoped grant may still be narrowed to a specific workspace.
      workspaceId = assertUuid(input.workspaceId, 'Workspace identifier');
    }
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
    const tenant = await this.registry.getTenant(tenantId);
    const workspace = workspaceId ? await this.registry.getWorkspace(workspaceId, tenantId) : null;
    if (workspace && tenantScopedRequest && context.workspaceScope !== 'TENANT' && workspace.id !== context.workspaceId) {
      throw Object.assign(new Error('Support grant workspace is not permitted'), { code: 'WORKSPACE_FORBIDDEN', status: 403 });
    }
    if (tenant.lifecycleState !== 'ACTIVE') {
      throw Object.assign(new Error('Tenant is not active'), { code: 'TENANT_INACTIVE', status: 403 });
    }
    // Break-glass scope governance is enforced server-side from the tenant's
    // recorded security policy. The default (supportAccessRequiresApproval)
    // restricts grants to read-only diagnostic scopes; explicitly disabling it
    // is the tenant's recorded decision to allow repair (write) scopes.
    const securityPolicy = tenantScopedRequest
      ? (await this.registry.getTenantConfiguration(context.tenantId).catch(() => null))?.securityPolicy || {}
      : {};
    const allowRepair = securityPolicy.supportAccessRequiresApproval === false;
    const scopes = assertSupportScopes(input?.scopes && Array.isArray(input.scopes) && input.scopes.length ? input.scopes : ['tenant.audit.read'], { allowRepair });
    const grant = await this.supportGrantStore.create({
      tenantId,
      workspaceId: workspace?.id || null,
      supportSubjectId,
      requestedBySubjectId: user.uid,
      reason: input?.reason,
      expiresInMinutes: input?.expiresInMinutes,
      scopes,
    });
    await this.writePlatformAudit({
      user, tenantId, workspaceId: workspace?.id || null,
      action: 'SUPPORT_GRANT_CREATED', category: 'tenant.support', severity: 'HIGH',
      resource: { type: 'support_grant', id: grant.id },
      metadata: {
        grantScope: workspace?.id ? 'WORKSPACE' : 'TENANT',
        supportSubjectId: grant.supportSubjectId,
        requestId: requestId || '', expiresAt: grant.expiresAt,
      },
    });
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
    if (context?.tenantId) {
      await this.writePlatformAudit({
        user, tenantId: context.tenantId, workspaceId: context.workspaceId || null,
        action: 'SUPPORT_GRANT_REVOKED', category: 'tenant.support', severity: 'HIGH',
        resource: { type: 'support_grant', id: String(grantId) },
        metadata: { requestId: requestId || '' },
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
    const workspaceId = requestedWorkspaceId ? assertUuid(requestedWorkspaceId, 'Workspace identifier') : null;
    // Store validation binds grant → support engineer → tenant and enforces
    // expiry/revocation. Workspace binding rules are applied below so both
    // workspace-scoped and tenant-scoped grants fail closed.
    const grant = await this.supportGrantStore.validate({ grantId, supportSubjectId: user.uid, tenantId, workspaceId });
    if (!grant) {
      throw Object.assign(new Error('Support grant is invalid, expired, or unavailable in this tenant'), { code: 'SUPPORT_GRANT_DENIED', status: 403 });
    }
    let workspace = null;
    let workspaceScope;
    if (grant.workspaceId) {
      // Workspace-scoped grant: the requested workspace must be exactly the
      // grant's anchor workspace. No lateral movement.
      if (workspaceId !== grant.workspaceId) {
        throw Object.assign(new Error('Support grant is limited to a different workspace'), { code: 'SUPPORT_GRANT_DENIED', status: 403 });
      }
      workspaceScope = 'WORKSPACE';
    } else {
      // Tenant-scoped grant: tenant-wide diagnostics, optionally narrowed to a
      // specific ACTIVE workspace inside the same tenant (validated server-side).
      workspaceScope = 'TENANT';
      if (workspaceId) {
        try {
          workspace = await this.registry.getWorkspace(workspaceId, tenantId);
          workspaceScope = 'WORKSPACE';
        } catch {
          throw Object.assign(new Error('Support grant workspace was not found in this tenant'), { code: 'SUPPORT_GRANT_DENIED', status: 403 });
        }
      }
    }
    const [tenant, configuration] = await Promise.all([
      this.registry.getTenant(tenantId),
      this.registry.getTenantConfiguration(tenantId),
    ]);
    if (!workspace && grant.workspaceId) {
      workspace = await this.registry.getWorkspace(grant.workspaceId, tenantId);
    }
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
      workspaceId: workspace?.id || null,
      tenant: { ...tenant, configuration, aiPolicy: configuration.aiPolicy },
      membership: { id: `support:${grant.id}`, status: 'ACTIVE', roles: [] },
      permissions: grant.scopes,
      workspaceScope,
      dataPlane: tenant.dataPlane,
    });
    return { context, tenant: { ...tenant, configuration, aiPolicy: configuration.aiPolicy }, workspace, grant };
  }

  async createServiceAccount({ context, input }) {
    if (!this.serviceAccountStore) {
      throw Object.assign(new Error('Service account store is unavailable'), { code: 'SERVICE_ACCOUNT_STORE_UNAVAILABLE', status: 503 });
    }
    // Service accounts are either pinned to exactly one workspace (default) or
    // tenant-scoped. Creating a tenant-scoped account is itself a tenant-wide
    // privilege: only TENANT-scoped callers (owners/admins) may do so.
    const requestedScope = String(input?.scope || 'WORKSPACE').trim().toUpperCase();
    if (!['TENANT', 'WORKSPACE'].includes(requestedScope)) {
      throw Object.assign(new Error('Service account scope must be TENANT or WORKSPACE'), { code: 'INVALID_SERVICE_ACCOUNT_SCOPE', status: 400 });
    }
    let workspaceId;
    if (requestedScope === 'TENANT') {
      if (context.workspaceScope !== 'TENANT') {
        throw Object.assign(new Error('Only tenant administrators can create tenant-scoped service accounts'), { code: 'WORKSPACE_FORBIDDEN', status: 403 });
      }
      workspaceId = null;
    } else {
      workspaceId = input?.workspaceId || context.workspaceId;
      if (context.workspaceScope !== 'TENANT' && workspaceId !== context.workspaceId) {
        throw Object.assign(new Error('Service account workspace is not permitted'), { code: 'WORKSPACE_FORBIDDEN', status: 403 });
      }
    }
    const created = await this.serviceAccountStore.create({
      tenantId: context.tenantId,
      workspaceId: workspaceId ? assertUuid(workspaceId, 'Workspace identifier') : null,
      displayName: input?.displayName,
      scopes: input?.scopes,
    });
    const event = buildTenantAuditEvent({
      context,
      action: 'SERVICE_ACCOUNT_CREATED',
      category: 'tenant.security',
      severity: 'HIGH',
      resource: { type: 'service_account', id: created.account.id },
      metadata: { scopes: created.material.record.scopes.join(','), accountScope: requestedScope },
    });
    await writeTenantAuditEvent(this.repository, event);

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
    const event = buildTenantAuditEvent({
      context,
      action: 'SERVICE_ACCOUNT_REVOKED',
      category: 'tenant.security',
      severity: 'HIGH',
      resource: { type: 'service_account', id: serviceAccountId },
    });
    await writeTenantAuditEvent(this.repository, event);

    return true;
  }

  async rotateServiceAccount({ context, serviceAccountId }) {
    if (!this.serviceAccountStore) {
      throw Object.assign(new Error('Service account store is unavailable'), { code: 'SERVICE_ACCOUNT_STORE_UNAVAILABLE', status: 503 });
    }
    const rotated = await this.serviceAccountStore.rotate(serviceAccountId, {
      tenantId: context.tenantId,
      workspaceId: context.workspaceScope === 'TENANT' ? null : context.workspaceId,
    });
    if (!rotated) throw Object.assign(new Error('Service account was not found'), { code: 'SERVICE_ACCOUNT_NOT_FOUND', status: 404 });
    const event = buildTenantAuditEvent({
      context,
      action: 'SERVICE_ACCOUNT_KEY_ROTATED',
      category: 'tenant.security',
      severity: 'HIGH',
      resource: { type: 'service_account', id: serviceAccountId },
      metadata: { apiKeyId: rotated.material.record.id, apiKeyPrefix: rotated.material.record.prefix },
    });
    await writeTenantAuditEvent(this.repository, event);

    return rotated;
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
    const event = buildTenantAuditEvent({
      context,
      action: 'WORKSPACE_CREATED',
      category: 'tenant.workspace',
      resource: { type: 'workspace', id: workspace.id },
      metadata: { name: workspace.name },
    });
    await writeTenantAuditEvent(this.repository, event);

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
    // Client-supplied tenant/workspace identifiers can only RESTRICT the key's
    // own binding; they can never expand it or point at another tenant.
    if (requestedTenantId && assertUuid(requestedTenantId, 'Tenant identifier') !== account.tenantId) {
      throw Object.assign(new Error('Service API key is unavailable in this tenant'), { code: 'SERVICE_TENANT_NOT_FOUND', status: 404 });
    }
    if (account.workspaceId && requestedWorkspaceId && assertUuid(requestedWorkspaceId, 'Workspace identifier') !== account.workspaceId) {
      throw Object.assign(new Error('Service API key is unavailable in this workspace'), { code: 'SERVICE_WORKSPACE_NOT_FOUND', status: 404 });
    }
    const tenant = await this.registry.getTenant(account.tenantId);
    if (tenant.lifecycleState !== 'ACTIVE') {
      throw Object.assign(new Error('Tenant is not active'), { code: 'TENANT_INACTIVE', status: 403 });
    }
    const configuration = await this.registry.getTenantConfiguration(account.tenantId);
    // Workspace resolution: a workspace-scoped account is pinned to its own
    // workspace. A tenant-scoped account may optionally narrow itself to one
    // ACTIVE workspace of its own tenant (validated server-side); selecting a
    // workspace narrows the context scope to WORKSPACE for that request.
    let workspace = null;
    let workspaceScope = 'TENANT';
    if (account.workspaceId) {
      workspace = await this.registry.getWorkspace(account.workspaceId, account.tenantId);
      workspaceScope = 'WORKSPACE';
    } else if (requestedWorkspaceId) {
      workspace = await this.registry.getWorkspace(assertUuid(requestedWorkspaceId, 'Workspace identifier'), account.tenantId);
      workspaceScope = 'WORKSPACE';
    }
    const tenantView = { ...tenant, configuration, aiPolicy: configuration.aiPolicy };
    const context = freezeContext({
      requestId,
      correlationId: requestId,
      principalId: account.id,
      subjectId: `service:${account.id}`,
      identityIssuer: 'service',
      actorType: 'service',
      tenantId: tenant.id,
      workspaceId: workspace?.id || null,
      tenant: tenantView,
      membership: { id: `service:${account.id}`, status: 'ACTIVE', roles: [] },
      permissions: key.scopes,
      workspaceScope,
      dataPlane: tenant.dataPlane,
    });
    return { context, tenant: tenantView, workspace, account, key };
  }

  async authorizeOutboxEvent(event) {
    const tenantEnvelope = event?.tenant;
    if (!tenantEnvelope) return true;
    if (event?.templateType === 'enterprise-invitation') {
      const membershipId = event?.metadata?.membershipId;
      if (!membershipId || typeof this.registry.isInvitationDeliverable !== 'function') return false;
      const deliverable = await this.registry.isInvitationDeliverable({
        tenantId: tenantEnvelope.tenantId,
        membershipId,
        notificationId: event.id,
      });
      if (!deliverable) return false;
    }
    // Current bridge reauthorizes Firebase user subjects only. Future OIDC/
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

  async listAuditEvents({ context, limit = 100, filters = {}, cursor = null }) {
    if (!this.repository) throw Object.assign(new Error('Tenant audit store is unavailable'), { code: 'TENANT_AUDIT_UNAVAILABLE', status: 503 });
    return this.repository.listAuditEvents(context, { limit, ...filters, cursor });
  }

  async getAiUsageSummary({ context, days = 30 }) {
    if (!this.repository) throw Object.assign(new Error('Tenant usage ledger is unavailable'), { code: 'ENTERPRISE_USAGE_UNAVAILABLE', status: 503 });
    return this.repository.getAiUsageSummary(context, { days });
  }

  async getTenantConfiguration({ context }) {
    return this.registry.getTenantConfiguration(context.tenantId);
  }

  async updateTenantProfile({ context, displayName }) {
    const tenant = await this.registry.updateTenantProfile({ tenantId: context.tenantId, displayName });
    await this.writeAudit(context, {
      action: 'TENANT_PROFILE_UPDATED', category: 'tenant.configuration', severity: 'HIGH',
      resource: { type: 'tenant', id: context.tenantId },
      metadata: { displayName: tenant.displayName },
    });
    return tenant;
  }

  async exportTenantData({ context }) {
    const pool = this.repository?.pool || this.registry?.pool;
    if (!pool) {
      throw Object.assign(new Error('Tenant data export requires the MariaDB data plane'), { code: 'TENANT_EXPORT_UNAVAILABLE', status: 503 });
    }
    const { exportTenantSnapshot, verifySnapshot } = require('./enterpriseBackup');
    const snapshot = await exportTenantSnapshot({ pool, tenantId: context.tenantId });
    const verification = verifySnapshot(snapshot);
    if (!verification.ok) {
      throw Object.assign(new Error(`Tenant export failed integrity verification: ${verification.problems.join('; ')}`), { code: 'TENANT_EXPORT_INVALID', status: 500 });
    }
    await this.writeAudit(context, {
      action: 'TENANT_DATA_EXPORTED', category: 'tenant.configuration', severity: 'HIGH',
      resource: { type: 'tenant', id: context.tenantId },
      metadata: {
        format: snapshot.format,
        version: snapshot.version,
        tables: snapshot.tables.length,
        records: snapshot.recordCount,
        checksum: snapshot.checksum,
      },
    });
    return snapshot;
  }

  async listAiUsageEvents({ context, limit }) {
    this.assertRepository();
    return this.repository.listAiUsageEvents(context, { limit });
  }

  async listPlatformTenants({ user, limit }) {
    if (!isPlatformTenantProvisioner(user)) {
      throw Object.assign(new Error('Platform tenant registry permission is required'), { code: 'FORBIDDEN', status: 403 });
    }
    const tenants = await this.registry.listAllTenants({ limit });
    return tenants.map(tenant => ({
      id: tenant.id,
      slug: tenant.slug,
      displayName: tenant.displayName,
      lifecycleState: tenant.lifecycleState,
      isolationTier: tenant.isolationTier,
      region: tenant.dataPlane.region,
      createdAt: tenant.createdAt || null,
    }));
  }

  async updateTenantConfiguration({ context, input, expectedRevision }) {
    const configuration = await this.registry.updateTenantConfiguration({ tenantId: context.tenantId, input, expectedRevision });
    const event = buildTenantAuditEvent({
      context,
      action: 'TENANT_CONFIGURATION_UPDATED',
      category: 'tenant.configuration',
      severity: 'HIGH',
      metadata: { configurationRevision: configuration.revision },
    });
    await writeTenantAuditEvent(this.repository, event);

    return configuration;
  }


  async executeTenantGarbageCollection({ gracePeriodDays = 7, requestId = null } = {}) {
    if (!this.registry.purgeTenantRecords) {
      throw new Error("Registry does not support purging");
    }

    // Convert database dates, ISO strings, epochs, and timestamp-like test adapters defensively.
    const toEpochMillis = (value) => {
      if (!value) return 0;
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      if (typeof value.toMillis === 'function') {
        const millis = value.toMillis();
        return Number.isFinite(millis) ? millis : 0;
      }
      if (typeof value.toDate === 'function') {
        const date = value.toDate();
        const millis = date instanceof Date ? date.getTime() : Number(new Date(date).getTime());
        return Number.isFinite(millis) ? millis : 0;
      }
      if (typeof value._seconds === 'number') {
        const millis = value._seconds * 1000 + Math.floor(Number(value._nanoseconds || 0) / 1e6);
        return Number.isFinite(millis) ? millis : 0;
      }
      if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : 0;
      const parsed = new Date(value).getTime();
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const days = Math.max(0, Number(gracePeriodDays) || 0);
    const msInDay = 24 * 60 * 60 * 1000;
    const gracePeriodMs = days * msInDay;
    const now = Date.now();

    // Complete view of every DELETING tenant. listAllTenants orders by
    // createdAt desc with a 500 cap, which can permanently hide old tenants
    // from garbage collection; the lifecycle query cannot.
    let candidates;
    if (typeof this.registry.listTenantsByLifecycleState === 'function') {
      candidates = await this.registry.listTenantsByLifecycleState('DELETING');
    } else {
      candidates = (await this.registry.listAllTenants({ limit: 500 }))
        .filter(tenant => tenant.lifecycleState === 'DELETING');
    }

    let purgedCount = 0;
    const failures = [];

    for (const tenant of candidates) {
      if (tenant.lifecycleState !== 'DELETING') continue;
      const updatedAt = toEpochMillis(tenant.updatedAt) || toEpochMillis(tenant.createdAt);
      if (now - updatedAt <= gracePeriodMs) continue;

      // Each tenant purge is isolated: one failing tenant must never prevent
      // the others from being reclaimed. Failed tenants stay in DELETING and
      // are retried on the next collection run (purge is idempotent).
      try {
        await this.registry.purgeTenantRecords(tenant.id, { requestId });
        purgedCount += 1;
      } catch (error) {
        failures.push({ tenantId: tenant.id, error: String(error?.message || error).slice(0, 300) });
        continue;
      }

      // purgeTenantRecords writes the retained platform deletion audit inside
      // the same MariaDB transaction. Do not recreate a tenant-scoped audit row
      // after the tenant partition has been removed.
    }

    if (failures.length) {
      console.warn(`[TenantService] Tenant garbage collection: ${purgedCount} purged, ${failures.length} failed:`,
        JSON.stringify(failures));
    }

    return { purgedCount, considered: candidates.length, failures };
  }

  async setTenantLifecycleAsPlatform({ user, tenantId, nextState, requestId }) {
    if (!isPlatformTenantProvisioner(user)) {
      throw Object.assign(new Error('Platform tenant lifecycle permission is required'), { code: 'FORBIDDEN', status: 403 });
    }
    const tenant = await this.registry.setTenantLifecycleState({ tenantId, nextState });
    await this.writePlatformAudit({
      user, tenantId: tenant.id,
      action: `PLATFORM_TENANT_${String(nextState).toUpperCase()}`,
      category: 'tenant.lifecycle', severity: 'HIGH',
      resource: { type: 'tenant', id: tenant.id }, metadata: { requestId: requestId || '' },
    });
    return tenant;
  }

  async updateTenantProfileAsPlatform({ user, tenantId, displayName, requestId }) {
    if (!isPlatformTenantProvisioner(user)) {
      throw Object.assign(new Error('Platform tenant profile permission is required'), { code: 'FORBIDDEN', status: 403 });
    }
    const tenant = await this.registry.updateTenantProfile({ tenantId, displayName });
    await this.writePlatformAudit({
      user, tenantId: tenant.id,
      action: 'PLATFORM_TENANT_RENAMED', category: 'tenant.lifecycle', severity: 'HIGH',
      resource: { type: 'tenant', id: tenant.id },
      metadata: { displayName: tenant.displayName, requestId: requestId || '' },
    });
    return tenant;
  }

  async setTenantLifecycleState({ context, nextState }) {
    const tenant = await this.registry.setTenantLifecycleState({ tenantId: context.tenantId, nextState });
    const event = buildTenantAuditEvent({
      context,
      action: `TENANT_${String(nextState).toUpperCase()}`,
      category: 'tenant.lifecycle',
      severity: 'HIGH',
      resource: { type: 'tenant', id: context.tenantId },
    });
    await writeTenantAuditEvent(this.repository, event);

    return tenant;
  }

  async listWorkspaces({ context }) {
    // Non-human principals are not members: a service key sees its own workspace
    // (or all tenant workspaces when tenant-scoped); a support session sees the
    // grant's blast radius. Membership lookup never applies to them.
    if (context.actorType === 'service' || context.actorType === 'support') {
      const all = await this.registry.listWorkspaces(context.tenantId, {});
      if (context.workspaceScope === 'TENANT') return all;
      return all.filter(workspace => workspace.id === context.workspaceId);
    }
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
    this.assertRepository();
    await writeTenantAuditEvent(this.repository, buildTenantAuditEvent({ context, ...event }));
  }

  async writePlatformAudit({ user = null, tenantId, workspaceId = null, action, category, severity = 'INFO', resource = null, metadata = {} }) {
    this.assertRepository();
    return this.repository.appendAuditEvent({
      tenantId: assertUuid(tenantId, 'Tenant identifier'),
      workspaceId: workspaceId || null,
      workspaceScope: workspaceId ? 'WORKSPACE' : 'TENANT',
      principalId: String(user?.uid || 'system:tenant-lifecycle').slice(0, 128),
    }, { action, category, severity, resource, metadata });
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
    const leadChanged = input && Object.hasOwn(input, 'leadPrincipalId');
    const updated = await this.registry.updateTeam({
      tenantId: context.tenantId,
      teamId,
      name: input?.name,
      leadPrincipalId: leadChanged ? (input.leadPrincipalId === '' ? null : input.leadPrincipalId) : undefined,
    });
    await this.writeAudit(context, {
      action: 'TEAM_UPDATED', category: 'tenant.team',
      resource: { type: 'team', id: updated.id }, metadata: {
        name: updated.name,
        ...(leadChanged ? { leadPrincipalId: updated.leadPrincipalId || null } : {}),
      },
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

  async restoreTeam({ context, teamId }) {
    const restored = await this.registry.restoreTeam({ tenantId: context.tenantId, teamId });
    this.assertWorkspaceScopeFor(context, restored.workspaceId, 'Workspace team access is not permitted');
    await this.writeAudit(context, {
      action: 'TEAM_RESTORED', category: 'tenant.team', severity: 'MEDIUM',
      resource: { type: 'team', id: restored.id },
    });
    return restored;
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

  async listTeams({ context, includeArchived = false }) {
    return this.registry.listTeams({
      tenantId: context.tenantId,
      workspaceId: context.workspaceScope === 'TENANT' ? null : context.workspaceId,
      includeArchived,
    });
  }

  async createTeam({ context, input }) {
    const workspaceId = input?.workspaceId || context.workspaceId;
    if (context.workspaceScope !== 'TENANT' && workspaceId !== context.workspaceId) {
      throw Object.assign(new Error('Workspace team access is not permitted'), { code: 'WORKSPACE_FORBIDDEN', status: 403 });
    }
    const team = await this.registry.createTeam({ tenantId: context.tenantId, workspaceId, name: input?.name });
    const event = buildTenantAuditEvent({
      context,
      action: 'TEAM_CREATED',
      category: 'tenant.team',
      resource: { type: 'team', id: team.id },
      metadata: { workspaceId: team.workspaceId },
    });
    await writeTenantAuditEvent(this.repository, event);

    return team;
  }

  async grantMembership({ context, input, actor = null }) {
    let targetPrincipalId = String(input?.principalId || '');
    const invitationMode = String(input?.status || 'ACTIVE').toUpperCase() === 'INVITED';
    const requestedRoles = Array.isArray(input?.roles) ? input.roles.map(role => String(role).toUpperCase()) : ['MEMBER'];
    if (requestedRoles.includes('TENANT_OWNER') && !context.roles.includes('TENANT_OWNER')) {
      throw Object.assign(new Error('Only a tenant owner may grant tenant ownership'), { code: 'TENANT_OWNER_GRANT_FORBIDDEN', status: 403 });
    }
    const configuration = context.tenant?.configuration || await this.registry.getTenantConfiguration(context.tenantId);
    const allowedRoles = customRoleIds(configuration.customRoles || {});
    let invitationEmail = invitationMode ? String(input?.invitationEmail || '').trim().toLowerCase() : null;
    const validInvitationEmail = value => /^[^\s@,;<>]{1,64}@[^\s@,;<>]{1,189}$/.test(String(value || ''));

    // Email-addressed invitations are resolved through the retained Firebase
    // identity directory. The stored recipient must match that verified
    // principal; an administrator cannot bind one account while mailing another.
    if (!targetPrincipalId && invitationEmail) {
      if (!this.admin?.auth) {
        throw Object.assign(new Error('An email invitation requires the identity directory'), { code: 'TARGET_PRINCIPAL_NOT_FOUND', status: 404 });
      }
      try {
        const resolved = await this.admin.auth().getUserByEmail(invitationEmail);
        targetPrincipalId = resolved.uid;
      } catch {
        throw Object.assign(new Error('No registered identity exists for that email address'), { code: 'TARGET_PRINCIPAL_NOT_FOUND', status: 404 });
      }
    }

    if (this.admin?.auth) {
      try {
        const target = await this.admin.auth().getUser(targetPrincipalId);
        if (target.disabled) {
          throw Object.assign(new Error('Target identity is suspended'), { code: 'TARGET_PRINCIPAL_SUSPENDED', status: 409 });
        }
        if (invitationMode) {
          const directoryEmail = String(target.email || '').trim().toLowerCase();
          if (!invitationEmail) invitationEmail = directoryEmail;
          if (!directoryEmail || invitationEmail !== directoryEmail) {
            throw Object.assign(new Error('Invitation email does not match the target identity'), { code: 'INVITATION_IDENTITY_MISMATCH', status: 409 });
          }
        }
      } catch (error) {
        if (error.status) throw error;
        throw Object.assign(new Error('Target identity was not found'), { code: 'TARGET_PRINCIPAL_NOT_FOUND', status: 404 });
      }
    }
    if (invitationMode && !validInvitationEmail(invitationEmail)) {
      throw Object.assign(new Error('A valid invitation email address is required'), { code: 'INVALID_INVITATION_EMAIL', status: 400 });
    }

    const workspaceId = input?.workspaceId || context.workspaceId;
    const { enterpriseConsoleUrl } = require('../services/publicAppUrl');
    const actionUrl = invitationMode ? enterpriseConsoleUrl({
      tab: 'members',
      tenantId: context.tenantId,
      workspaceId: workspaceId || '',
    }) : null;
    const invitation = invitationMode ? {
      recipientEmail: invitationEmail,
      invitedByPrincipalId: context.principalId,
      expiresAt: new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)).toISOString(),
      tenantContext: context,
      notification: buildInvitationNotification({
        recipientEmail: invitationEmail,
        organizationName: context.tenant?.displayName,
        inviterLabel: actor?.displayName || actor?.email || 'An enterprise administrator',
        roles: requestedRoles,
        actionUrl,
      }),
    } : null;

    const membership = await this.registry.grantMembership({
      tenantId: context.tenantId,
      principalId: targetPrincipalId,
      workspaceId,
      roles: requestedRoles,
      status: invitationMode ? 'INVITED' : 'ACTIVE',
      invitation,
      allowedRoles,
    });
    const event = buildTenantAuditEvent({
      context,
      action: invitationMode ? 'TENANT_INVITATION_CREATED' : 'TENANT_MEMBERSHIP_GRANTED',
      category: 'tenant.membership',
      resource: { type: 'membership', id: membership.id },
      severity: 'HIGH',
      metadata: {
        targetPrincipalId: membership.principalId,
        roles: membership.roles.join(','),
        status: membership.status,
        ...(membership.invitationEmail ? { invitationEmail: membership.invitationEmail } : {}),
        ...(membership.invitationNotificationId ? { notificationId: membership.invitationNotificationId } : {}),
      },
    });
    await writeTenantAuditEvent(this.repository, event);
    return membership;
  }

  async resendMembershipInvitation({ context, principalId, actor = null }) {
    const membership = await this.registry.getMembership(context.tenantId, principalId);
    if (String(membership.status || '').toUpperCase() !== 'INVITED') {
      throw Object.assign(new Error('Only a pending invitation can be resent'), { code: 'INVITATION_NOT_PENDING', status: 409 });
    }
    if (!membership.invitationEmail) {
      throw Object.assign(new Error('The invitation has no delivery address'), { code: 'INVITATION_NO_ADDRESS', status: 409 });
    }
    const { enterpriseConsoleUrl } = require('../services/publicAppUrl');
    const actionUrl = enterpriseConsoleUrl({
      tab: 'members',
      tenantId: context.tenantId,
      workspaceId: membership.workspaceId || context.workspaceId || '',
    });
    const queued = await this.registry.queueMembershipInvitation({
      tenantId: context.tenantId,
      principalId,
      invitedByPrincipalId: context.principalId,
      tenantContext: context,
      notification: buildInvitationNotification({
        recipientEmail: membership.invitationEmail,
        organizationName: context.tenant?.displayName,
        inviterLabel: actor?.displayName || actor?.email || 'An enterprise administrator',
        roles: membership.roles,
        actionUrl,
      }),
    });
    await this.writeAudit(context, {
      action: 'TENANT_INVITATION_RESENT', category: 'tenant.membership', severity: 'MEDIUM',
      resource: { type: 'membership', id: membership.id },
      metadata: {
        targetPrincipalId: principalId,
        invitationEmail: membership.invitationEmail,
        deliveryState: queued.invitationDeliveryState || 'NOTIFICATION_QUEUED',
        notificationId: queued.invitationNotificationId || '',
      },
    });
    return { ...queued, lastDeliveryState: queued.invitationDeliveryState || 'NOTIFICATION_QUEUED' };
  }

  async updateTenantMembership({ context, principalId, input }) {
    const requestedRoles = Array.isArray(input?.roles) ? input.roles.map(role => String(role).toUpperCase()) : null;
    if (requestedRoles && requestedRoles.includes('TENANT_OWNER') && !context.roles.includes('TENANT_OWNER')) {
      throw Object.assign(new Error('Only a tenant owner may grant tenant ownership'), { code: 'TENANT_OWNER_GRANT_FORBIDDEN', status: 403 });
    }
    const configuration = context.tenant?.configuration || await this.registry.getTenantConfiguration(context.tenantId);
    const membership = await this.registry.updateTenantMembership({
      tenantId: context.tenantId,
      principalId,
      roles: requestedRoles,
      status: input?.status ? String(input.status).toUpperCase() : null,
      workspaceId: input?.workspaceId || null,
      allowedRoles: customRoleIds(configuration.customRoles || {}),
    });
    const event = buildTenantAuditEvent({
      context,
      action: 'TENANT_MEMBERSHIP_UPDATED',
      category: 'tenant.membership',
      resource: { type: 'membership', id: membership.id },
      severity: 'HIGH',
      metadata: { targetPrincipalId: membership.principalId, roles: membership.roles.join(','), status: membership.status },
    });
    await writeTenantAuditEvent(this.repository, event);

    return membership;
  }

  async removeTenantMembership({ context, principalId }) {
    await this.registry.removeTenantMembership({ tenantId: context.tenantId, principalId });
    const event = buildTenantAuditEvent({
      context,
      action: 'TENANT_MEMBERSHIP_REMOVED',
      category: 'tenant.membership',
      resource: { type: 'membership', id: membershipDocumentId(context.tenantId, principalId) },
      severity: 'HIGH',
      metadata: { targetPrincipalId: principalId },
    });
    await writeTenantAuditEvent(this.repository, event);

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

  async listResources({ context, options = {} }) {
    this.assertRepository();
    const repoResources = await this.repository.listResources(context, options);
    const wantsResumes = !options.resourceType || String(options.resourceType).toUpperCase() === 'RESUME';
    if (!wantsResumes) return repoResources;

    const pool = this.repository.pool || this.registry?.pool;
    if (!pool?.query) return repoResources;
    const boundedLimit = Math.max(1, Math.min(Number(options.limit) || 50, 200));
    let workspacePredicate = '';
    const params = [context.tenantId];
    if (context.workspaceScope !== 'TENANT') {
      workspacePredicate = ` AND (
        membership.workspaceId = ? OR EXISTS (
          SELECT 1 FROM enterprise_workspace_memberships workspace_membership
          WHERE workspace_membership.tenantId = membership.tenantId
            AND workspace_membership.principalId = membership.principalId
            AND workspace_membership.workspaceId = ?
            AND workspace_membership.status = 'ACTIVE'
        )
      )`;
      params.push(context.workspaceId, context.workspaceId);
    }
    params.push(boundedLimit);
    const [rows] = await pool.query(
      `SELECT resume.*, membership.workspaceId AS membershipWorkspaceId,
              user.email AS ownerAccountEmail
       FROM enterprise_memberships membership
       INNER JOIN resumes resume ON resume.user_id = membership.principalId
       LEFT JOIN users user ON user.id = resume.user_id
       WHERE membership.tenantId = ? AND membership.status = 'ACTIVE'${workspacePredicate}
       ORDER BY resume.updated_at DESC LIMIT ?`,
      params
    );
    const existingIds = new Set(repoResources.map(resource => String(resource.id)));
    const parseArray = value => {
      if (Array.isArray(value)) return value;
      if (typeof value !== 'string' || !value) return [];
      try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
    };
    const memberResumes = [];
    for (const row of rows) {
      if (existingIds.has(String(row.id))) continue;
      const experience = parseArray(row.employments);
      const skills = parseArray(row.skills);
      const education = parseArray(row.educations);
      const candidateName = `${row.firstname || ''} ${row.lastname || ''}`.trim() || row.title || 'Candidate Profile';
      memberResumes.push({
        id: row.id,
        tenantId: context.tenantId,
        workspaceId: row.membershipWorkspaceId || context.workspaceId || null,
        resourceType: 'RESUME',
        ownerPrincipalId: row.user_id,
        ownerEmail: row.email || row.ownerAccountEmail || null,
        ownerName: candidateName,
        candidateName,
        jobTitle: row.occupation || '',
        atsScore: null,
        template: row.template || 'Cv1',
        classification: 'INTERNAL',
        revision: Number(row.revision || 1),
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
        updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
        payload: {
          personalInfo: {
            fullName: candidateName,
            jobTitle: row.occupation || '',
            email: row.email || row.ownerAccountEmail || '',
            phone: row.phone || '',
            location: [row.city, row.country].filter(Boolean).join(', '),
            summary: row.summary || '',
          },
          experience,
          skills,
          education,
        },
      });
      existingIds.add(String(row.id));
    }
    return [...repoResources, ...memberResumes].slice(0, boundedLimit);
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
    if (!this.registry) {
      throw Object.assign(new Error('Tenant control plane registry is unavailable'), { code: 'TENANT_CONTROL_PLANE_UNAVAILABLE', status: 503 });
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
    const event = buildTenantAuditEvent({
      context: resolved.context,
      action: 'TENANT_PROVISIONED',
      category: 'tenant.lifecycle',
      resource: { type: 'tenant', id: result.tenantId },
      severity: 'HIGH',
      metadata: { isolationTier: resolved.tenant.isolationTier, dataPlaneType: resolved.tenant.dataPlane.type },
    });
    await writeTenantAuditEvent(this.repository, event);

    return { ...result, tenant: resolved.tenant, workspace: resolved.workspace };
  }
}

function createTenantService({ pool = null, admin = null, registry = null, repository = null, serviceAccountStore = null, supportGrantStore = null, quotaGuard = null, environment = process.env } = {}) {
  normalizeProvider(environment.ENTERPRISE_DATA_PROVIDER || 'mysql');

  let encryptionProvider = null;
  let constructionError = null;
  try {
    encryptionProvider = createEncryptionProvider(environment);
  } catch (error) {
    constructionError = error.message;
    encryptionProvider = Object.freeze({
      describe: () => ({
        provider: error.code === 'ENTERPRISE_ENCRYPTION_PROVIDER_UNAVAILABLE' ? 'unavailable' : 'server-key',
        configured: false,
        error: error.message,
        securityLevel: 'ENCRYPTION_UNAVAILABLE_FAIL_CLOSED',
      }),
    });
  }

  const resolvedRegistry = registry || new MySqlTenantRegistry({ pool });
  const resolvedRepository = repository || createEnterpriseRepository({
    environment,
    pool,
    encryptionProvider: encryptionProvider && typeof encryptionProvider.encryptValue === 'function' ? encryptionProvider : null,
  });
  const resolvedServiceAccountStore = serviceAccountStore || new MySqlServiceAccountStore({ pool });
  const resolvedSupportGrantStore = supportGrantStore || new MySqlSupportGrantStore({ pool });
  const resolvedQuotaGuard = quotaGuard || new TenantQuotaGuard({ store: new MySqlAtomicCounterStore({ pool }) });

  return new TenantService({
    registry: resolvedRegistry,
    admin,
    repository: resolvedRepository,
    serviceAccountStore: resolvedServiceAccountStore,
    supportGrantStore: resolvedSupportGrantStore,
    quotaGuard: resolvedQuotaGuard,
    encryptionProvider: encryptionProvider && typeof encryptionProvider.encryptValue === 'function' ? encryptionProvider : null,
    dataProviderName: 'mysql',
    constructionError,
  });
}

module.exports = {
  TenantService,
  createTenantService,
  isPlatformTenantProvisioner,
  isSupportEligible,
};
