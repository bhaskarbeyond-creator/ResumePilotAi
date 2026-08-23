'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const { normalizeRequestedTenantId, normalizeRequestedWorkspaceId } = require('../enterprise/tenantContext');
const { hasTenantPermission, requireAnyTenantPermission, requireTenantPermission } = require('../enterprise/tenantPolicy');
const { applyTenantAiPolicy, assertNoClientAuthority, buildTenantAiOperation } = require('../enterprise/tenantAi');
const { buildLegacyPrompt, generateWithProviders, loadProviderConfiguration, parseAiResponse } = require('../services/aiRuntime');
const { enterpriseFeatureEnabled, enterpriseFeatureEnabledAsync } = require('../enterprise/featureFlags');
const { M2M_ALLOWED_ENDPOINTS, SUPPORT_ALLOWED_ENDPOINTS, endpointAllowed } = require('../enterprise/enterpriseAuth');

const router = express.Router();

function runtimeSecret(envName, developmentFallback) {
  const value = String(process.env[envName] || '');
  if (value) return value;
  return String(process.env.NODE_ENV || '').toLowerCase() === 'production' ? '' : developmentFallback;
}

// This authenticated status endpoint lets an explicitly enabled frontend explain a
// server-side rollout mismatch without probing tenant data or creating control-plane state.
router.get('/status', async (req, res) => {
  const enabled = await enterpriseFeatureEnabledAsync(req.app.get('db'));
  return res.json({ enabled, apiVersion: 'tenant-foundation-v1', source: req.app.get('db') ? 'runtime-flag-or-environment' : 'environment-or-default' });
});

// Keep the foundation dark in existing production environments until the data-plane,
// IAM, migration, and operational gates have been explicitly enabled. This prevents a
// newly deployed route from creating control-plane records accidentally.
router.use(async (req, res, next) => {
  try {
    const enabled = await enterpriseFeatureEnabledAsync(req.app.get('db'));
    if (!enabled) {
      return res.status(404).json({ error: { code: 'ENTERPRISE_DISABLED', message: 'Enterprise tenancy is disabled for this deployment.', configurationState: 'DISABLED', requestId: res.locals?.requestId } });
    }
    return next();
  } catch (error) {
    return res.status(503).json({ error: { code: 'ENTERPRISE_FLAG_UNAVAILABLE', message: 'Enterprise rollout state could not be determined.', configurationState: 'UNKNOWN', requestId: res.locals?.requestId } });
  }
});

// The global API boundary already verified the credential (Firebase bearer token or
// x-api-key service key). Human principals additionally require a verified email;
// service principals carry no email and are bounded by their key's scopes instead.
router.use((req, res, next) => {
  if (req.serviceContext) return next();
  if (!req.user?.emailVerified) {
    return res.status(403).json({ error: { code: 'EMAIL_VERIFICATION_REQUIRED', message: 'A verified email address is required', requestId: res.locals?.requestId } });
  }
  return next();
});

// Fail-closed reachability policy for non-human principals. M2M service keys and
// support elevations can only ever reach the explicitly allowlisted endpoints;
// every other route responds 403 before any handler executes. Route-level RBAC
// then enforces the granted scopes, so a missing scope still fails with 403.
router.use((req, res, next) => {
  if (req.serviceContext && !endpointAllowed(M2M_ALLOWED_ENDPOINTS, req.method, req.path)) {
    return res.status(403).json({ error: { code: 'M2M_OPERATION_NOT_PERMITTED', message: 'Service accounts cannot access this operation', requestId: res.locals?.requestId } });
  }
  if (req.pendingSupportGrantId && !endpointAllowed(SUPPORT_ALLOWED_ENDPOINTS, req.method, req.path)) {
    return res.status(403).json({ error: { code: 'SUPPORT_OPERATION_NOT_PERMITTED', message: 'Support access cannot be used for this operation', requestId: res.locals?.requestId } });
  }
  return next();
});

// Per-service-account request budget. Keys live in CI systems, so the bucket is
// keyed by the authenticated service principal (never the raw key) and sits in
// addition to the tenant AI quotas, which M2M shares with humans by design.
const m2mAccountLimiter = rateLimit({
  windowMs: 60_000,
  limit: Number(process.env.ENTERPRISE_M2M_KEY_RPM || 300),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => `ent-m2m:${req.serviceContext?.principalId || 'unknown'}`,
  message: { error: { code: 'M2M_RATE_LIMITED', message: 'Service account request budget exhausted', requestId: undefined } },
  validate: { trustProxy: false, keyGeneratorIpFallback: false },
});
router.use((req, res, next) => {
  if (!req.serviceContext) return next();
  return m2mAccountLimiter(req, res, next);
});

// Real request telemetry: latencies and error classes are computed from actual
// served responses, never synthesized. Tenant identifiers come from the
// server-resolved context only.
router.use((req, res, next) => {
  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const { enterpriseObservability } = require('../enterprise/tenantObservability');
    enterpriseObservability.recordRequest({
      requestId: res.locals?.requestId,
      correlationId: res.locals?.requestId,
      tenantId: req.tenantContext?.tenantId || null,
      workspaceId: req.tenantContext?.workspaceId || null,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Number(process.hrtime.bigint() - startedAt) / 1e6,
    });
  });
  return next();
});

function enterpriseService(req) {
  const service = req.app.get('tenantService');
  if (!service) {
    const error = new Error('Tenant service is unavailable');
    error.code = 'TENANT_CONTROL_PLANE_UNAVAILABLE';
    error.status = 503;
    throw error;
  }
  return service;
}

function requestedContext(req) {
  // These values are intentionally only context requests. The registry verifies
  // active membership before a TenantContext is attached to the request.
  return {
    requestedTenantId: normalizeRequestedTenantId(req.get('x-tenant-id') || req.query?.tenantId || req.body?.tenantId),
    requestedWorkspaceId: normalizeRequestedWorkspaceId(req.get('x-workspace-id') || req.query?.workspaceId || req.body?.workspaceId),
  };
}

async function resolveTenantContext(req, res, next) {
  try {
    // M2M service principal: context was fully resolved server-side from the key
    // record (tenant, workspace, scopes). Client headers can only restrict, never
    // expand, and body-supplied identity is never consulted.
    if (req.serviceContext) {
      req.tenantContext = req.serviceContext;
      req.tenant = req.serviceAuth.tenant;
      req.tenantMembership = req.serviceAuth.account;
      req.workspace = req.serviceAuth.workspace;
      res.setHeader('X-Tenant-Context', req.serviceContext.tenantId);
      res.setHeader('X-Tenant-Routing-Version', String(req.serviceContext.dataPlane.routingVersion));
      return next();
    }
    // Support (break-glass) elevation: the validated grant replaces membership
    // resolution for this request only.
    if (req.pendingSupportGrantId) {
      const result = await enterpriseService(req).resolveSupportContext({
        user: req.user,
        grantId: req.pendingSupportGrantId,
        requestedTenantId: normalizeRequestedTenantId(req.get('x-tenant-id') || req.query?.tenantId),
        requestedWorkspaceId: normalizeRequestedWorkspaceId(req.get('x-workspace-id') || req.query?.workspaceId),
        requestId: res.locals?.requestId,
      });
      req.tenantContext = result.context;
      req.tenant = result.tenant;
      req.tenantMembership = result.context.membership;
      req.workspace = result.workspace;
      res.setHeader('X-Tenant-Context', result.context.tenantId);
      return next();
    }
    const result = await enterpriseService(req).resolveContext({
      user: req.user,
      requestId: res.locals?.requestId,
      ...requestedContext(req),
    });
    req.tenantContext = result.context;
    req.tenant = result.tenant;
    req.tenantMembership = result.membership;
    req.workspace = result.workspace;
    res.setHeader('X-Tenant-Context', result.context.tenantId);
    res.setHeader('X-Tenant-Routing-Version', String(result.context.dataPlane.routingVersion));
    return next();
  } catch (error) {
    const status = [401, 403, 404].includes(error.status) ? error.status : 503;
    return res.status(status).json({
      error: {
        code: error.code || 'TENANT_CONTEXT_UNAVAILABLE',
        message: error.status === 404 ? 'Tenant context was not found'
          : error.status === 403 ? 'Tenant context is not permitted'
            : error.status === 401 ? 'Tenant context requires reauthentication'
              : 'Tenant context is unavailable',
        requestId: res.locals?.requestId,
      }
    });
  }
}

router.post('/support-grants', resolveTenantContext, requireTenantPermission('tenant.settings.write'), async (req, res) => {
  try {
    const grant = await enterpriseService(req).createSupportGrant({ user: req.user, context: req.tenantContext, input: req.body || {}, requestId: res.locals?.requestId });
    return res.status(201).json({
      grant: { id: grant.id, tenantId: grant.tenantId, workspaceId: grant.workspaceId, supportSubjectId: grant.supportSubjectId, scopes: grant.scopes, expiresAt: grant.expiresAt, reason: grant.reason },
    });
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'SUPPORT_GRANT_CREATE_FAILED', message: error.status === 400 ? error.message : 'Support grant could not be created', requestId: res.locals?.requestId } });
  }
});

router.post('/support-grants/:grantId/revoke', resolveTenantContext, requireTenantPermission('tenant.settings.write'), async (req, res) => {
  try {
    await enterpriseService(req).revokeSupportGrant({ user: req.user, context: req.tenantContext, grantId: req.params.grantId, requestId: res.locals?.requestId });
    return res.status(204).end();
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'SUPPORT_GRANT_REVOKE_FAILED', message: error.status === 404 ? 'Support grant was not found' : 'Support grant could not be revoked', requestId: res.locals?.requestId } });
  }
});

router.get('/support-grants', resolveTenantContext, requireTenantPermission('tenant.settings.write'), async (req, res) => {
  try {
    const grants = await enterpriseService(req).listSupportGrants({ context: req.tenantContext });
    return res.json({ grants: grants.map(grant => ({ id: grant.id, tenantId: grant.tenantId, workspaceId: grant.workspaceId, supportSubjectId: grant.supportSubjectId, requestedBySubjectId: grant.requestedBySubjectId, reason: grant.reason, scopes: grant.scopes, status: grant.status, createdAt: grant.createdAt, expiresAt: grant.expiresAt })) });
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'SUPPORT_GRANT_LIST_FAILED', message: 'Support grants are unavailable', requestId: res.locals?.requestId } });
  }
});

router.get('/support/context', async (req, res) => {
  try {
    const result = await enterpriseService(req).resolveSupportContext({
      user: req.user,
      grantId: req.get('x-support-grant-id'),
      requestedTenantId: normalizeRequestedTenantId(req.get('x-tenant-id') || req.query?.tenantId),
      requestedWorkspaceId: normalizeRequestedWorkspaceId(req.get('x-workspace-id') || req.query?.workspaceId),
      requestId: res.locals?.requestId,
    });
    res.setHeader('X-Tenant-Context', result.context.tenantId);
    return res.json({
      actor: { type: 'support', supportGrantId: result.grant.id },
      context: { tenantId: result.context.tenantId, workspaceId: result.context.workspaceId, permissions: result.context.permissions, supportGrantId: result.context.supportGrantId },
      expiresAt: result.grant.expiresAt,
    });
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'SUPPORT_GRANT_DENIED', message: error.status === 403 ? 'Support access is not permitted' : 'Support context is unavailable', requestId: res.locals?.requestId } });
  }
});

router.get('/tenants', async (req, res) => {
  try {
    const tenants = await enterpriseService(req).listTenants({ user: req.user });
    return res.json({ tenants });
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'TENANT_CONTROL_PLANE_UNAVAILABLE', message: 'Tenant list is unavailable', requestId: res.locals?.requestId } });
  }
});

router.get('/roles-matrix', resolveTenantContext, requireTenantPermission('tenant.read'), async (req, res) => {
  const { TENANT_ROLES } = require('../enterprise/constants');
  // Tenant-defined custom roles are returned alongside the platform roles so
  // the console can render and assign the complete, live authorization model.
  let customRoles = {};
  try {
    const configuration = await enterpriseService(req).getTenantConfiguration({ context: req.tenantContext });
    customRoles = configuration.customRoles || {};
  } catch { /* defaults on failure: empty custom role set */ }
  return res.json({ roles: TENANT_ROLES, customRoles });
});

const respondWithContext = (req, res) => {
  const { isPlatformTenantProvisioner } = require('../enterprise/tenantService');
  return res.json({
    context: {
      tenantId: req.tenantContext.tenantId,
      workspaceId: req.tenantContext.workspaceId,
      roles: req.tenantContext.roles,
      permissions: req.tenantContext.permissions,
      policyVersion: req.tenantContext.policyVersion,
      dataPlane: req.tenantContext.dataPlane,
    },
    tenant: {
      id: req.tenant.id,
      slug: req.tenant.slug,
      displayName: req.tenant.displayName,
      lifecycleState: req.tenant.lifecycleState,
      isolationTier: req.tenant.isolationTier,
    },
    workspace: req.workspace ? { id: req.workspace.id, name: req.workspace.name, isDefault: req.workspace.isDefault === true } : null,
    // Server-derived caller capability: whether this identity may use the
    // platform administration surface. Never a client-side decision.
    platformAdmin: isPlatformTenantProvisioner(req.user),
  });
};

router.get('/context', resolveTenantContext, respondWithContext);
router.post('/context', resolveTenantContext, respondWithContext);

router.get('/workspaces', resolveTenantContext, requireTenantPermission('workspace.read'), async (req, res) => {
  try {
    // includeArchived is honoured only for workspace administrators so archived
    // workspaces can be inspected and restored; everyone else sees active ones.
    const wantsArchived = ['1', 'true'].includes(String(req.query?.includeArchived || '').toLowerCase());
    if (wantsArchived && hasTenantPermission(req.tenantContext, 'tenant.workspaces.manage')) {
      const workspaces = await enterpriseService(req).listAllWorkspaces({ context: req.tenantContext, includeArchived: true });
      return res.json({ workspaces: workspaces.map(workspace => ({ id: workspace.id, name: workspace.name, active: workspace.id === req.workspace?.id, isDefault: workspace.isDefault === true, lifecycleState: String(workspace.lifecycleState || 'ACTIVE').toUpperCase() })) });
    }
    const workspaces = await enterpriseService(req).listWorkspaces({ context: req.tenantContext });
    return res.json({ workspaces: workspaces.map(workspace => ({ id: workspace.id, name: workspace.name, active: workspace.id === req.workspace?.id, isDefault: workspace.isDefault === true, lifecycleState: 'ACTIVE' })) });
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'WORKSPACE_UNAVAILABLE', message: 'Workspaces are unavailable', requestId: res.locals?.requestId } });
  }
});

router.post('/workspaces', resolveTenantContext, requireAnyTenantPermission('workspace.manage', 'tenant.workspaces.manage'), async (req, res) => {
  try {
    const workspace = await enterpriseService(req).createWorkspace({ context: req.tenantContext, input: req.body || {} });
    return res.status(201).json({ workspace: { id: workspace.id, tenantId: workspace.tenantId, name: workspace.name, isDefault: workspace.isDefault === true } });
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'WORKSPACE_CREATE_FAILED', message: error.status === 400 ? error.message : 'Workspace could not be created', requestId: res.locals?.requestId } });
  }
});

router.patch('/workspaces/:workspaceId', resolveTenantContext, requireAnyTenantPermission('workspace.manage', 'tenant.workspaces.manage'), async (req, res) => {
  try {
    const workspace = await enterpriseService(req).updateWorkspace({ context: req.tenantContext, workspaceId: req.params.workspaceId, input: req.body || {} });
    return res.json({ workspace: { id: workspace.id, tenantId: workspace.tenantId, name: workspace.name, isDefault: workspace.isDefault === true, lifecycleState: String(workspace.lifecycleState || 'ACTIVE').toUpperCase() } });
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'WORKSPACE_UPDATE_FAILED', message: [400, 403, 404].includes(error.status) ? error.message : 'Workspace could not be updated', requestId: res.locals?.requestId } });
  }
});

router.post('/workspaces/:workspaceId/archive', resolveTenantContext, requireTenantPermission('tenant.workspaces.manage'), async (req, res) => {
  try {
    const workspace = await enterpriseService(req).setWorkspaceLifecycle({ context: req.tenantContext, workspaceId: req.params.workspaceId, nextState: 'ARCHIVED' });
    return res.json({ workspace: { id: workspace.id, name: workspace.name, lifecycleState: String(workspace.lifecycleState).toUpperCase() } });
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'WORKSPACE_LIFECYCLE_FAILED', message: [400, 404, 409].includes(error.status) ? error.message : 'Workspace could not be archived', requestId: res.locals?.requestId } });
  }
});

router.post('/workspaces/:workspaceId/restore', resolveTenantContext, requireTenantPermission('tenant.workspaces.manage'), async (req, res) => {
  try {
    const workspace = await enterpriseService(req).setWorkspaceLifecycle({ context: req.tenantContext, workspaceId: req.params.workspaceId, nextState: 'ACTIVE' });
    return res.json({ workspace: { id: workspace.id, name: workspace.name, lifecycleState: String(workspace.lifecycleState).toUpperCase() } });
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'WORKSPACE_LIFECYCLE_FAILED', message: [400, 404, 409].includes(error.status) ? error.message : 'Workspace could not be restored', requestId: res.locals?.requestId } });
  }
});

router.get('/workspaces/:workspaceId/members', resolveTenantContext, requireAnyTenantPermission('workspace.members.manage', 'tenant.members.read'), async (req, res) => {
  try {
    const members = await enterpriseService(req).listWorkspaceMembers({ context: req.tenantContext, workspaceId: req.params.workspaceId });
    return res.json({ members: members.map(member => ({ id: member.id, workspaceId: member.workspaceId, principalId: member.principalId, status: member.status, createdAt: member.createdAt || null })) });
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'WORKSPACE_MEMBERS_UNAVAILABLE', message: [403, 404].includes(error.status) ? error.message : 'Workspace members are unavailable', requestId: res.locals?.requestId } });
  }
});

router.post('/workspaces/:workspaceId/members', resolveTenantContext, requireAnyTenantPermission('workspace.members.manage', 'tenant.members.manage'), async (req, res) => {
  try {
    const member = await enterpriseService(req).addWorkspaceMember({ context: req.tenantContext, workspaceId: req.params.workspaceId, principalId: req.body?.principalId });
    return res.status(201).json({ member: { id: member.id, workspaceId: member.workspaceId, principalId: member.principalId, status: member.status } });
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'WORKSPACE_MEMBER_ADD_FAILED', message: [400, 403, 404, 409].includes(error.status) ? error.message : 'Workspace member could not be added', requestId: res.locals?.requestId } });
  }
});

router.delete('/workspaces/:workspaceId/members/:principalId', resolveTenantContext, requireAnyTenantPermission('workspace.members.manage', 'tenant.members.manage'), async (req, res) => {
  try {
    await enterpriseService(req).removeWorkspaceMember({ context: req.tenantContext, workspaceId: req.params.workspaceId, principalId: req.params.principalId });
    return res.status(204).end();
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'WORKSPACE_MEMBER_REMOVE_FAILED', message: [400, 403, 404, 409].includes(error.status) ? error.message : 'Workspace member could not be removed', requestId: res.locals?.requestId } });
  }
});

router.get('/memberships', resolveTenantContext, requireTenantPermission('tenant.members.read'), async (req, res) => {
  try {
    const memberships = await enterpriseService(req).listTenantMemberships({ context: req.tenantContext });
    return res.json({ memberships: memberships.map(membership => ({ id: membership.id, principalId: membership.principalId, workspaceId: membership.workspaceId, roles: membership.roles, status: membership.status, createdAt: membership.createdAt || null, invitationEmail: membership.invitationEmail || null, invitedAt: membership.invitedAt || null, acceptedAt: membership.acceptedAt || null, invitationDeliveryState: membership.invitationDeliveryState || null })) });
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'TENANT_MEMBERS_UNAVAILABLE', message: 'Tenant members are unavailable', requestId: res.locals?.requestId } });
  }
});

router.post('/memberships', resolveTenantContext, requireTenantPermission('tenant.members.manage'), async (req, res) => {
  try {
    const membership = await enterpriseService(req).grantMembership({ context: req.tenantContext, input: req.body || {} });
    return res.status(201).json({ membership: { id: membership.id, tenantId: membership.tenantId, principalId: membership.principalId, workspaceId: membership.workspaceId, roles: membership.roles, status: membership.status, invitationEmail: membership.invitationEmail || null } });
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'TENANT_MEMBERSHIP_GRANT_FAILED', message: [400, 403, 404, 409].includes(error.status) ? error.message : 'Tenant membership could not be granted', requestId: res.locals?.requestId } });
  }
});

router.patch('/memberships/:principalId', resolveTenantContext, requireTenantPermission('tenant.members.manage'), async (req, res) => {
  try {
    const membership = await enterpriseService(req).updateTenantMembership({ context: req.tenantContext, principalId: req.params.principalId, input: req.body || {} });
    return res.json({ membership: { id: membership.id, tenantId: membership.tenantId, principalId: membership.principalId, workspaceId: membership.workspaceId, roles: membership.roles, status: membership.status, invitationEmail: membership.invitationEmail || null } });
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'TENANT_MEMBERSHIP_UPDATE_FAILED', message: [400, 404, 409].includes(error.status) ? error.message : 'Tenant membership could not be updated', requestId: res.locals?.requestId } });
  }
});

router.post('/memberships/:principalId/invitation-resend', resolveTenantContext, requireTenantPermission('tenant.members.manage'), async (req, res) => {
  try {
    const membership = await enterpriseService(req).resendMembershipInvitation({ context: req.tenantContext, principalId: req.params.principalId });
    return res.json({ membership: { id: membership.id, principalId: membership.principalId, status: membership.status, invitationEmail: membership.invitationEmail || null, lastDeliveryState: membership.lastDeliveryState || null } });
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'INVITATION_RESEND_FAILED', message: [404, 409].includes(error.status) ? error.message : 'Invitation could not be resent', requestId: res.locals?.requestId } });
  }
});

router.delete('/memberships/:principalId', resolveTenantContext, requireTenantPermission('tenant.members.manage'), async (req, res) => {
  try {
    await enterpriseService(req).removeTenantMembership({ context: req.tenantContext, principalId: req.params.principalId });
    return res.status(204).end();
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'TENANT_MEMBERSHIP_REMOVE_FAILED', message: error.status === 409 ? error.message : 'Tenant membership could not be removed', requestId: res.locals?.requestId } });
  }
});

router.post('/service-accounts', resolveTenantContext, requireTenantPermission('tenant.security.manage'), async (req, res) => {
  try {
    const created = await enterpriseService(req).createServiceAccount({ context: req.tenantContext, input: req.body || {} });
    // The plaintext key is deliberately returned exactly once. Persistence/logging
    // contains only the one-way hash and safe prefix.
    return res.status(201).json({
      serviceAccount: { id: created.account.id, tenantId: created.account.tenantId, workspaceId: created.account.workspaceId, scope: created.account.workspaceId ? 'WORKSPACE' : 'TENANT', displayName: created.account.displayName, status: created.account.status },
      apiKey: created.material.plaintext,
      apiKeyId: created.material.record.id,
      apiKeyPrefix: created.material.record.prefix,
      scopes: created.material.record.scopes,
      expiresAt: created.material.record.expiresAt,
    });
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'SERVICE_ACCOUNT_CREATE_FAILED', message: error.status === 400 ? error.message : 'Service account could not be created', requestId: res.locals?.requestId } });
  }
});

router.get('/service-accounts', resolveTenantContext, requireTenantPermission('tenant.security.read'), async (req, res) => {
  try {
    const accounts = await enterpriseService(req).listServiceAccounts({ context: req.tenantContext });
    return res.json({ serviceAccounts: accounts.map(account => ({ id: account.id, tenantId: account.tenantId, workspaceId: account.workspaceId || null, scope: account.scope || (account.workspaceId ? 'WORKSPACE' : 'TENANT'), displayName: account.displayName, status: account.status, createdAt: account.createdAt || null, scopes: Array.isArray(account.scopes) ? account.scopes : [], apiKeyId: account.apiKeyId || null, apiKeyPrefix: account.apiKeyPrefix || null, expiresAt: account.expiresAt || null })) });
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'SERVICE_ACCOUNT_LIST_FAILED', message: 'Service accounts are unavailable', requestId: res.locals?.requestId } });
  }
});

router.post('/service-accounts/:serviceAccountId/revoke', resolveTenantContext, requireTenantPermission('tenant.security.manage'), async (req, res) => {
  try {
    await enterpriseService(req).revokeServiceAccount({ context: req.tenantContext, serviceAccountId: req.params.serviceAccountId });
    return res.status(204).end();
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'SERVICE_ACCOUNT_REVOKE_FAILED', message: error.status === 404 ? 'Service account was not found' : 'Service account could not be revoked', requestId: res.locals?.requestId } });
  }
});

router.post('/service-accounts/:serviceAccountId/rotate', resolveTenantContext, requireTenantPermission('tenant.security.manage'), async (req, res) => {
  try {
    const rotated = await enterpriseService(req).rotateServiceAccount({ context: req.tenantContext, serviceAccountId: req.params.serviceAccountId });
    // The plaintext key is deliberately returned exactly once, exactly like
    // creation. Persistence and logs contain only the hash and safe prefix.
    return res.json({
      serviceAccount: { id: rotated.account.id, tenantId: rotated.account.tenantId, workspaceId: rotated.account.workspaceId || null, scope: rotated.account.workspaceId ? 'WORKSPACE' : 'TENANT', displayName: rotated.account.displayName, status: rotated.account.status },
      apiKey: rotated.material.plaintext,
      apiKeyId: rotated.material.record.id,
      apiKeyPrefix: rotated.material.record.prefix,
      scopes: rotated.material.record.scopes,
      expiresAt: rotated.material.record.expiresAt,
    });
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'SERVICE_ACCOUNT_ROTATE_FAILED', message: error.status === 404 ? 'Service account was not found' : 'Service account key could not be rotated', requestId: res.locals?.requestId } });
  }
});

router.post('/tenants/:tenantId/reactivate', async (req, res) => {
  try {
    const tenant = await enterpriseService(req).setTenantLifecycleAsPlatform({ user: req.user, tenantId: req.params.tenantId, nextState: 'ACTIVE', requestId: res.locals?.requestId });
    return res.json({ tenant: { id: tenant.id, lifecycleState: tenant.lifecycleState } });
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'TENANT_LIFECYCLE_UPDATE_FAILED', message: error.status === 403 ? 'Tenant reactivation is not permitted' : 'Tenant could not be reactivated', requestId: res.locals?.requestId } });
  }
});

// ─── Tenant profile & data administration ────────────────────────────────────

router.patch('/tenant', resolveTenantContext, requireTenantPermission('tenant.settings.write'), async (req, res) => {
  try {
    const tenant = await enterpriseService(req).updateTenantProfile({ context: req.tenantContext, displayName: req.body?.displayName });
    return res.json({ tenant: { id: tenant.id, slug: tenant.slug, displayName: tenant.displayName, lifecycleState: tenant.lifecycleState, isolationTier: tenant.isolationTier } });
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'TENANT_PROFILE_UPDATE_FAILED', message: [400, 404].includes(error.status) ? error.message : 'Tenant profile could not be updated', requestId: res.locals?.requestId } });
  }
});

router.get('/data/export', resolveTenantContext, requireTenantPermission('tenant.settings.write'), async (req, res) => {
  try {
    const snapshot = await enterpriseService(req).exportTenantData({ context: req.tenantContext });
    return res.json({ snapshot });
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'TENANT_EXPORT_UNAVAILABLE', message: [403, 404].includes(error.status) ? error.message : 'Tenant data export is unavailable', requestId: res.locals?.requestId } });
  }
});

// ─── Platform administration ──────────────────────────────────────────────────
// These routes are gated on the caller's PLATFORM identity (super admin or
// system.config.write), never on tenant membership. Tenant administrators
// cannot reach them.

router.get('/platform/tenants', async (req, res) => {
  try {
    const tenants = await enterpriseService(req).listPlatformTenants({ user: req.user, limit: req.query?.limit });
    return res.json({ tenants });
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'PLATFORM_TENANTS_UNAVAILABLE', message: error.status === 403 ? 'Platform administration is not permitted' : 'Platform tenant registry is unavailable', requestId: res.locals?.requestId } });
  }
});

router.post('/platform/tenants/:tenantId/suspend', async (req, res) => {
  try {
    const tenant = await enterpriseService(req).setTenantLifecycleAsPlatform({ user: req.user, tenantId: req.params.tenantId, nextState: 'SUSPENDED', requestId: res.locals?.requestId });
    return res.json({ tenant: { id: tenant.id, lifecycleState: tenant.lifecycleState } });
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'TENANT_LIFECYCLE_UPDATE_FAILED', message: error.status === 403 ? 'Platform tenant suspension is not permitted' : 'Tenant could not be suspended', requestId: res.locals?.requestId } });
  }
});

router.post('/platform/tenants/:tenantId/reactivate', async (req, res) => {
  try {
    const tenant = await enterpriseService(req).setTenantLifecycleAsPlatform({ user: req.user, tenantId: req.params.tenantId, nextState: 'ACTIVE', requestId: res.locals?.requestId });
    return res.json({ tenant: { id: tenant.id, lifecycleState: tenant.lifecycleState } });
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'TENANT_LIFECYCLE_UPDATE_FAILED', message: error.status === 403 ? 'Platform tenant reactivation is not permitted' : 'Tenant could not be reactivated', requestId: res.locals?.requestId } });
  }
});

router.post('/lifecycle/suspend', resolveTenantContext, requireTenantPermission('tenant.settings.write'), async (req, res) => {
  try {
    const tenant = await enterpriseService(req).setTenantLifecycleState({ context: req.tenantContext, nextState: 'SUSPENDED' });
    return res.json({ tenant: { id: tenant.id, lifecycleState: tenant.lifecycleState } });
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'TENANT_LIFECYCLE_UPDATE_FAILED', message: 'Tenant could not be suspended', requestId: res.locals?.requestId } });
  }
});

router.get('/audit', resolveTenantContext, requireTenantPermission('tenant.audit.read'), async (req, res) => {
  try {
    const events = await enterpriseService(req).listAuditEvents({
      context: req.tenantContext,
      limit: req.query?.limit,
      filters: {
        action: req.query?.action || null,
        actor: req.query?.actor || null,
        outcome: req.query?.outcome || null,
        severity: req.query?.severity || null,
        category: req.query?.category || null,
        since: req.query?.since || null,
        until: req.query?.until || null,
      },
      cursor: req.query?.cursor || null,
    });
    // listAuditEvents returns an array with an attached nextCursor keyset hint.
    return res.json({ events: [...events], nextCursor: events.nextCursor || null });
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'TENANT_AUDIT_UNAVAILABLE', message: 'Tenant audit events are unavailable', requestId: res.locals?.requestId } });
  }
});

router.get('/teams', resolveTenantContext, requireTenantPermission('workspace.read'), async (req, res) => {
  try {
    // includeArchived is honoured only for workspace administrators so archived
    // teams can be inspected and restored; everyone else sees active ones.
    const wantsArchived = ['1', 'true'].includes(String(req.query?.includeArchived || '').toLowerCase());
    const allowed = wantsArchived && hasTenantPermission(req.tenantContext, 'workspace.manage');
    const teams = await enterpriseService(req).listTeams({ context: req.tenantContext, includeArchived: allowed });
    return res.json({ teams });
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'TENANT_TEAMS_UNAVAILABLE', message: 'Teams are unavailable', requestId: res.locals?.requestId } });
  }
});

router.post('/teams', resolveTenantContext, requireAnyTenantPermission('workspace.manage', 'tenant.workspaces.manage'), async (req, res) => {
  try {
    const team = await enterpriseService(req).createTeam({ context: req.tenantContext, input: req.body || {} });
    return res.status(201).json({ team });
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'TENANT_TEAM_CREATE_FAILED', message: error.status === 400 ? error.message : 'Team could not be created', requestId: res.locals?.requestId } });
  }
});

router.patch('/teams/:teamId', resolveTenantContext, requireAnyTenantPermission('workspace.manage', 'tenant.workspaces.manage'), async (req, res) => {
  try {
    const team = await enterpriseService(req).updateTeam({ context: req.tenantContext, teamId: req.params.teamId, input: req.body || {} });
    return res.json({ team });
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'TENANT_TEAM_UPDATE_FAILED', message: [400, 403, 404].includes(error.status) ? error.message : 'Team could not be updated', requestId: res.locals?.requestId } });
  }
});

router.post('/teams/:teamId/archive', resolveTenantContext, requireAnyTenantPermission('workspace.manage', 'tenant.workspaces.manage'), async (req, res) => {
  try {
    const team = await enterpriseService(req).archiveTeam({ context: req.tenantContext, teamId: req.params.teamId });
    return res.json({ team });
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'TENANT_TEAM_ARCHIVE_FAILED', message: [400, 403, 404].includes(error.status) ? error.message : 'Team could not be archived', requestId: res.locals?.requestId } });
  }
});

router.post('/teams/:teamId/restore', resolveTenantContext, requireAnyTenantPermission('workspace.manage', 'tenant.workspaces.manage'), async (req, res) => {
  try {
    const team = await enterpriseService(req).restoreTeam({ context: req.tenantContext, teamId: req.params.teamId });
    return res.json({ team });
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'TENANT_TEAM_RESTORE_FAILED', message: [400, 403, 404, 409].includes(error.status) ? error.message : 'Team could not be restored', requestId: res.locals?.requestId } });
  }
});

router.get('/teams/:teamId/members', resolveTenantContext, requireTenantPermission('workspace.read'), async (req, res) => {
  try {
    const members = await enterpriseService(req).listTeamMembers({ context: req.tenantContext, teamId: req.params.teamId });
    return res.json({ members: members.map(member => ({ id: member.id, teamId: member.teamId, workspaceId: member.workspaceId, principalId: member.principalId, status: member.status })) });
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'TEAM_MEMBERS_UNAVAILABLE', message: [403, 404].includes(error.status) ? error.message : 'Team members are unavailable', requestId: res.locals?.requestId } });
  }
});

router.post('/teams/:teamId/members', resolveTenantContext, requireAnyTenantPermission('workspace.members.manage', 'tenant.members.manage'), async (req, res) => {
  try {
    const member = await enterpriseService(req).addTeamMember({ context: req.tenantContext, teamId: req.params.teamId, principalId: req.body?.principalId });
    return res.status(201).json({ member: { id: member.id, teamId: member.teamId, workspaceId: member.workspaceId, principalId: member.principalId, status: member.status } });
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'TEAM_MEMBER_ADD_FAILED', message: [400, 403, 404, 409].includes(error.status) ? error.message : 'Team member could not be added', requestId: res.locals?.requestId } });
  }
});

router.delete('/teams/:teamId/members/:principalId', resolveTenantContext, requireAnyTenantPermission('workspace.members.manage', 'tenant.members.manage'), async (req, res) => {
  try {
    await enterpriseService(req).removeTeamMember({ context: req.tenantContext, teamId: req.params.teamId, principalId: req.params.principalId });
    return res.status(204).end();
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'TEAM_MEMBER_REMOVE_FAILED', message: [400, 403, 404, 409].includes(error.status) ? error.message : 'Team member could not be removed', requestId: res.locals?.requestId } });
  }
});

router.get('/configuration', resolveTenantContext, requireTenantPermission('tenant.read'), async (req, res) => {
  try {
    const configuration = await enterpriseService(req).getTenantConfiguration({ context: req.tenantContext });
    return res.json({ configuration });
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'TENANT_CONFIGURATION_UNAVAILABLE', message: 'Tenant configuration is unavailable', requestId: res.locals?.requestId } });
  }
});

router.patch('/configuration', resolveTenantContext, requireTenantPermission('tenant.settings.write'), async (req, res) => {
  try {
    const configuration = await enterpriseService(req).updateTenantConfiguration({ context: req.tenantContext, input: req.body?.configuration || {}, expectedRevision: req.body?.expectedRevision });
    return res.json({ configuration });
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'TENANT_CONFIGURATION_UPDATE_FAILED', message: error.status === 409 ? 'Tenant configuration changed. Reload before saving.' : 'Tenant configuration could not be updated', requestId: res.locals?.requestId } });
  }
});

router.post('/ai/generate-content', resolveTenantContext, requireTenantPermission('ai.use'), async (req, res) => {
  try {
    if (Object.hasOwn(req.body || {}, 'sources') || Object.hasOwn(req.body || {}, 'sourceResources')) {
      return res.status(400).json({ error: { code: 'TENANT_AI_SOURCE_UNSUPPORTED', message: 'Tenant AI sources must be resolved server-side from authorized resources.', requestId: res.locals?.requestId } });
    }
    const operation = String(req.body?.operation || '');
    const payload = assertNoClientAuthority(req.body?.payload || {}, 'Tenant AI payload');
    // Fail closed before provider invocation when the durable tenant usage
    // ledger is not available. Legacy AI routes remain unchanged.
    if (!enterpriseService(req).meteringAvailable()) {
      return res.status(503).json({ error: { code: 'TENANT_AI_METERING_UNAVAILABLE', message: 'Tenant AI metering is unavailable.', requestId: res.locals?.requestId } });
    }
    const aiOperation = buildTenantAiOperation({ context: req.tenantContext, operation, payload, policy: req.tenant.aiPolicy || {} });
    const quota = req.tenant.configuration?.quotaPolicy || {};
    await enterpriseService(req).consumeTenantQuota({ context: req.tenantContext, metric: 'ai-minute', limit: Number(quota.aiRequestsPerMinute || 1), windowMs: 60_000 });
    await enterpriseService(req).consumeTenantQuota({ context: req.tenantContext, metric: 'ai-day', limit: Number(quota.aiRequestsPerDay || 1), windowMs: 24 * 60 * 60_000 });
    const { prompt } = buildLegacyPrompt(operation, payload, { sessionId: aiOperation.correlationId });
    const configuration = applyTenantAiPolicy(
      await loadProviderConfiguration(req.app.get('db')),
      req.tenantContext,
      req.tenant.aiPolicy || {}
    );
    const generated = await generateWithProviders({ prompt, configuration, operation, timeoutMs: 45_000 });
    const data = parseAiResponse(operation, generated.raw);
    await enterpriseService(req).recordAiUsage({
      context: req.tenantContext,
      input: { provider: generated.provider, model: generated.model, operation, inputTokens: 0, outputTokens: 0, estimatedCostMicros: 0 },
    });
    // Every tenant AI generation is attributable in the audit trail, including
    // machine (M2M) and support actors — not just interactive humans.
    await enterpriseService(req).writeAudit(req.tenantContext, {
      action: 'TENANT_AI_GENERATED', category: 'tenant.ai', severity: 'INFO',
      resource: { type: 'ai_operation', id: aiOperation.correlationId },
      metadata: { operation, provider: generated.provider, model: generated.model, actorType: req.tenantContext.actorType },
    }).catch(() => { /* usage ledger already recorded; audit failure must not fail the request */ });
    res.setHeader('X-AI-Provider', generated.provider);
    res.setHeader('X-AI-Model', generated.model);
    return res.json({ data, context: { tenantId: req.tenantContext.tenantId, workspaceId: req.tenantContext.workspaceId, correlationId: req.tenantContext.correlationId, policyVersion: aiOperation.policyVersion } });
  } catch (error) {
    return res.status(error.status || 502).json({ error: { code: error.code || 'TENANT_AI_GENERATION_FAILED', message: error.status === 400 ? error.message : 'Tenant AI generation is unavailable.', requestId: res.locals?.requestId } });
  }
});

router.get('/usage/ai', resolveTenantContext, requireTenantPermission('tenant.usage.read'), async (req, res) => {
  try {
    const summary = await enterpriseService(req).getAiUsageSummary({ context: req.tenantContext, days: req.query?.days });
    return res.json({ usage: summary });
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'ENTERPRISE_USAGE_UNAVAILABLE', message: 'Tenant AI usage is unavailable', requestId: res.locals?.requestId } });
  }
});

router.get('/usage/ai/events', resolveTenantContext, requireTenantPermission('tenant.usage.read'), async (req, res) => {
  try {
    const events = await enterpriseService(req).listAiUsageEvents({ context: req.tenantContext, limit: req.query?.limit });
    return res.json({ events });
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'ENTERPRISE_USAGE_UNAVAILABLE', message: 'Tenant AI generation history is unavailable', requestId: res.locals?.requestId } });
  }
});

router.get('/resources', resolveTenantContext, requireTenantPermission('resource.read'), async (req, res) => {
  try {
    const resources = await enterpriseService(req).listResources({
      context: req.tenantContext,
      options: { resourceType: req.query?.resourceType, limit: req.query?.limit, cursor: req.query?.cursor },
    });
    return res.json({ resources });
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'TENANT_DATA_PLANE_UNAVAILABLE', message: error.status === 404 ? 'Resource was not found' : 'Tenant resources are unavailable', requestId: res.locals?.requestId } });
  }
});

router.post('/resources', resolveTenantContext, requireTenantPermission('resource.create'), async (req, res) => {
  try {
    const resource = await enterpriseService(req).createResource({ context: req.tenantContext, input: req.body || {} });
    return res.status(201).json({ resource });
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'TENANT_DATA_PLANE_UNAVAILABLE', message: 'Tenant resource could not be created', requestId: res.locals?.requestId } });
  }
});

router.get('/resources/:resourceId', resolveTenantContext, requireTenantPermission('resource.read'), async (req, res) => {
  try {
    const resource = await enterpriseService(req).getResource({ context: req.tenantContext, resourceId: req.params.resourceId });
    if (!resource) return res.status(404).json({ error: { code: 'TENANT_RESOURCE_NOT_FOUND', message: 'Resource was not found', requestId: res.locals?.requestId } });
    return res.json({ resource });
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'TENANT_DATA_PLANE_UNAVAILABLE', message: error.status === 404 ? 'Resource was not found' : 'Tenant resource is unavailable', requestId: res.locals?.requestId } });
  }
});

router.patch('/resources/:resourceId', resolveTenantContext, requireTenantPermission('resource.update'), async (req, res) => {
  try {
    const resource = await enterpriseService(req).updateResource({ context: req.tenantContext, resourceId: req.params.resourceId, input: req.body || {} });
    if (!resource) return res.status(404).json({ error: { code: 'TENANT_RESOURCE_NOT_FOUND', message: 'Resource was not found', requestId: res.locals?.requestId } });
    return res.json({ resource });
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'TENANT_RESOURCE_UPDATE_FAILED', message: error.status === 409 ? 'Resource changed. Reload before saving.' : 'Tenant resource could not be updated', requestId: res.locals?.requestId } });
  }
});

router.delete('/resources/:resourceId', resolveTenantContext, requireTenantPermission('resource.update'), async (req, res) => {
  try {
    const deleted = await enterpriseService(req).deleteResource({ context: req.tenantContext, resourceId: req.params.resourceId });
    if (!deleted) return res.status(404).json({ error: { code: 'TENANT_RESOURCE_NOT_FOUND', message: 'Resource was not found', requestId: res.locals?.requestId } });
    return res.status(204).end();
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'TENANT_RESOURCE_DELETE_FAILED', message: error.status === 404 ? 'Resource was not found' : 'Tenant resource could not be deleted', requestId: res.locals?.requestId } });
  }
});

router.get('/observability/metrics', resolveTenantContext, requireTenantPermission('tenant.read'), async (req, res) => {
  const { enterpriseObservability } = require('../enterprise/tenantObservability');
  const metrics = enterpriseObservability.getMetrics();
  const payload = { metrics };
  // Durable outbox posture is included best-effort; if the queue runtime is
  // unavailable the metrics endpoint says so instead of inventing numbers.
  try {
    const { getOutboxStatus } = require('../enterprise/enterpriseOutbox');
    const db = req.app.get('db');
    const admin = req.app.get('firebaseAdmin');
    const signingSecret = runtimeSecret('TENANT_JOB_SIGNING_SECRET', '');
    if (db && admin?.firestore?.FieldValue) {
      payload.queue = await getOutboxStatus({ db, admin, signingSecret });
    }
  } catch { /* metrics remain truthful without queue state */ }
  return res.json(payload);
});

router.get('/data-plane/status', resolveTenantContext, requireTenantPermission('tenant.read'), (req, res) => {
  // Truthful infrastructure status: Firestore is the canonical data plane.
  // There is no Redis/PostgreSQL layer in this architecture to report on.
  const service = enterpriseService(req);
  const runtime = service.describeRuntime ? service.describeRuntime() : null;
  return res.json({
    dataPlane: {
      provider: runtime?.dataProvider || 'unknown',
      configured: runtime?.dataPlaneConfigured === true,
      durable: true,
      encryption: runtime?.encryption?.provider || 'none',
      encryptionSecurityLevel: runtime?.encryption?.securityLevel || null,
      quotaStore: runtime?.quotaStore || 'unavailable',
      queue: 'firestore-durable-outbox',
    },
  });
});

// Durable enterprise job queue (Firestore-backed outbox). The signing secret
// never leaves the server; envelopes are created from the verified context.
function requireJobSigningSecret() {
  const secret = runtimeSecret('TENANT_JOB_SIGNING_SECRET', 'staging-enterprise-secret-key-min-32chars!');
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw Object.assign(new Error('Tenant job signing secret is unavailable'), { code: 'TENANT_JOB_SIGNING_UNAVAILABLE', status: 503 });
  }
  return secret;
}

function outboxRuntime(req) {
  const db = req.app.get('db');
  const admin = req.app.get('firebaseAdmin') || null;
  if (!db || !admin?.firestore?.FieldValue) {
    throw Object.assign(new Error('Durable enterprise queue requires Firestore'), { code: 'ENTERPRISE_OUTBOX_UNAVAILABLE', status: 503 });
  }
  return { db, admin, signingSecret: requireJobSigningSecret() };
}

router.get('/queue/status', resolveTenantContext, requireTenantPermission('tenant.read'), async (req, res) => {
  const { getOutboxStatus } = require('../enterprise/enterpriseOutbox');
  try {
    const { db, admin, signingSecret } = outboxRuntime(req);
    const status = await getOutboxStatus({ db, admin, signingSecret });
    return res.json({ queue: status });
  } catch (error) {
    if (error.code === 'TENANT_JOB_SIGNING_UNAVAILABLE') {
      const { db, admin } = req.app.get('db') && req.app.get('firebaseAdmin')?.firestore?.FieldValue
        ? { db: req.app.get('db'), admin: req.app.get('firebaseAdmin') }
        : { db: null, admin: null };
      return res.json({ queue: await getOutboxStatus({ db, admin, signingSecret: null }) });
    }
    // Firestore handle missing: report the queue as not configured, never healthy.
    return res.json({ queue: await getOutboxStatus({ db: null, admin: null, signingSecret: null }) });
  }
});

router.get('/queue/jobs', resolveTenantContext, requireTenantPermission('tenant.read'), async (req, res) => {
  try {
    const { listOutboxJobs } = require('../enterprise/enterpriseOutbox');
    const { db } = outboxRuntime(req);
    const jobs = await listOutboxJobs({ db, context: req.tenantContext, status: req.query?.status, limit: req.query?.limit });
    return res.json({ jobs });
  } catch (error) {
    const code = (typeof error.code === 'string' && error.code) ? error.code : 'ENTERPRISE_OUTBOX_UNAVAILABLE';
    return res.status(error.status || 503).json({ error: { code, message: 'Tenant jobs are unavailable', requestId: res.locals?.requestId } });
  }
});

router.post('/queue/jobs', resolveTenantContext, requireTenantPermission('resource.create'), async (req, res) => {
  try {
    const { enqueueOutboxJob } = require('../enterprise/enterpriseOutbox');
    const { createTenantJobEnvelope } = require('../enterprise/tenantJobs');
    const { db, admin, signingSecret } = outboxRuntime(req);
    // The envelope is derived from the verified server context and signed
    // server-side; the client never supplies identity, routing, or signature.
    const envelope = createTenantJobEnvelope({
      context: req.tenantContext,
      jobType: req.body?.jobType,
      resource: req.body?.resource,
      idempotencyKey: req.body?.idempotencyKey,
      classification: req.body?.classification,
      signingSecret,
    });
    const result = await enqueueOutboxJob({ db, admin, envelope });
    return res.status(result.status === 'ENQUEUED' ? 201 : 200).json({ ...result, jobType: envelope.jobType, correlationId: envelope.correlationId });
  } catch (error) {
    return res.status(error.status || 400).json({ error: { code: error.code || 'QUEUE_ENQUEUE_FAILED', message: error.status === 400 ? error.message : 'Job could not be enqueued', requestId: res.locals?.requestId } });
  }
});

router.post('/queue/replay', resolveTenantContext, requireTenantPermission('tenant.settings.write'), async (req, res) => {
  try {
    const { replayDeadLetterJob } = require('../enterprise/enterpriseOutbox');
    const { db, admin } = outboxRuntime(req);
    const result = await replayDeadLetterJob({ db, admin, jobId: req.body?.jobId, context: req.tenantContext });
    if (result.status === 'NOT_FOUND') return res.status(404).json({ error: { code: 'JOB_NOT_FOUND', message: 'Dead-letter job was not found in this tenant', requestId: res.locals?.requestId } });
    return res.json(result);
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'QUEUE_REPLAY_FAILED', message: 'Job could not be replayed', requestId: res.locals?.requestId } });
  }
});

router.post('/storage/token', resolveTenantContext, requireTenantPermission('resource.read'), (req, res) => {
  try {
    const { createTenantArtifactToken } = require('../enterprise/tenantSignedArtifacts');
    const token = createTenantArtifactToken({
      context: req.tenantContext,
      objectKey: req.body?.objectKey,
      purpose: req.body?.purpose || 'DOWNLOAD',
      expiresInMs: req.body?.expiresInMs || 60_000,
      signingSecret: runtimeSecret('TENANT_ARTIFACT_SIGNING_SECRET', 'staging-enterprise-artifact-secret-min-32chars!'),
    });
    return res.json({ token, objectKey: req.body?.objectKey });
  } catch (error) {
    return res.status(error.status || 400).json({ error: { code: error.code || 'STORAGE_TOKEN_FAILED', message: error.message, requestId: res.locals?.requestId } });
  }
});

router.post('/storage/verify', resolveTenantContext, requireTenantPermission('resource.read'), (req, res) => {
  try {
    const { verifyTenantArtifactToken } = require('../enterprise/tenantSignedArtifacts');
    const verified = verifyTenantArtifactToken({
      context: req.tenantContext,
      token: req.body?.token,
      purpose: req.body?.purpose,
      signingSecret: runtimeSecret('TENANT_ARTIFACT_SIGNING_SECRET', 'staging-enterprise-artifact-secret-min-32chars!'),
    });
    return res.json({ verified: true, claims: verified });
  } catch (error) {
    return res.status(error.status || 403).json({ error: { code: error.code || 'STORAGE_TOKEN_INVALID', message: error.message, requestId: res.locals?.requestId } });
  }
});

router.post('/test-email', resolveTenantContext, requireTenantPermission('tenant.settings.write'), async (req, res) => {
  const recipient = String(req.body?.recipientEmail || req.user?.email || '').trim().toLowerCase();
  if (!/^[^\s@,;<>]{1,64}@[^\s@,;<>]{1,190}$/.test(recipient)) {
    return res.status(400).json({ error: { code: 'INVALID_RECIPIENT', message: 'A valid recipient email address is required', requestId: res.locals?.requestId } });
  }
  const templateId = String(req.body?.templateId || 'invitation').trim();
  const customSubject = req.body?.customSubject ? String(req.body.customSubject).slice(0, 200) : null;
  const customBody = req.body?.customBody ? String(req.body.customBody).slice(0, 5000) : null;
  
  try {
    const emailRoute = require('./email');
    const { db } = outboxRuntime(req);
      const tabMap = {
        'invitation': 'members',
        'enterprise-invitation': 'members',
        'enterprise_invitation': 'members',
        'role_change': 'access',
        'enterprise_role_update': 'access',
        'role_update': 'access',
        'team_assignment': 'teams',
        'enterprise_workspace_assignment': 'workspaces',
        'workspace_assignment': 'workspaces',
        'security_alert': 'security',
        'enterprise_security_alert': 'security',
        'quota_warning': 'usage',
        'quota_alert': 'usage',
        'enterprise_quota_alert': 'usage',
      };
      const targetTab = tabMap[templateId] || 'overview';
      const { enterpriseConsoleUrl, sanitizeAbsoluteHttpUrl } = require('../services/publicAppUrl');
      const actionUrl = sanitizeAbsoluteHttpUrl(req.body?.vars?.action_url) || enterpriseConsoleUrl({
        tab: targetTab,
        tenantId: req.tenant?.id || req.tenantContext?.tenantId || '',
        workspaceId: req.workspace?.id || req.tenantContext?.workspaceId || '',
      });

      const result = await emailRoute.dispatchNotification(db, {
        to: recipient,
        templateType: templateId,
        vars: {
          organization_name: req.tenant?.displayName || 'ResumePilot Enterprise',
          inviter_name: req.user?.displayName || 'Enterprise Administrator',
          candidate_name: req.user?.displayName || 'Enterprise User',
          user_name: req.user?.displayName || 'Enterprise User',
          role_title: 'Enterprise Administrator',
          workspace_name: req.workspace?.name || 'Main Workspace',
          team_name: 'Core Engineering',
          updater_name: 'Security Operations',
          granted_by: req.user?.displayName || 'Enterprise Administrator',
          support_agent: 'support-tier3@resumepilot.ai',
          reason: 'Investigating isolated outbox webhook latency',
          expires_at: new Date(Date.now() + 4 * 3600 * 1000).toLocaleString(),
          usage_percent: '85',
          consumed_tokens: '850,000',
          quota_limit: '1,000,000',
          reset_date: '1st of next month',
          expires_in: '7 days',
          action_url: actionUrl,
          ...(req.body?.vars || {}),
        },
        customSubject,
        customBody,
      });
    if (!result?.success && result?.error) {
      return res.status(502).json({ error: { code: 'EMAIL_DISPATCH_FAILED', message: result.error, requestId: res.locals?.requestId } });
    }
    return res.json({ success: true, messageId: result?.result?.messageId || 'SENT', recipient, actionUrl, templateId });
  } catch (error) {
    return res.status(503).json({ error: { code: error.code || 'EMAIL_SERVICE_UNAVAILABLE', message: error.message || 'Email delivery service is unavailable', requestId: res.locals?.requestId } });
  }
});

router.post('/tenants', async (req, res) => {
  try {
    const result = await enterpriseService(req).provisionTenant({ user: req.user, input: req.body || {}, requestId: res.locals?.requestId });
    return res.status(201).json({
      tenant: { id: result.tenant.id, slug: result.tenant.slug, displayName: result.tenant.displayName, isolationTier: result.tenant.isolationTier },
      workspace: { id: result.workspace.id, name: result.workspace.name },
    });
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'TENANT_PROVISIONING_FAILED', message: error.status === 403 ? 'Tenant provisioning is not permitted' : 'Tenant provisioning is unavailable', requestId: res.locals?.requestId } });
  }
});

module.exports = { enterpriseFeatureEnabled, enterpriseRouter: router, resolveTenantContext };
