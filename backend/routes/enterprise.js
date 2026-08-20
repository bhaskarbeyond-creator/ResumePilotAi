'use strict';

const express = require('express');
const { normalizeRequestedTenantId, normalizeRequestedWorkspaceId } = require('../enterprise/tenantContext');
const { requireTenantPermission } = require('../enterprise/tenantPolicy');
const { applyTenantAiPolicy, assertNoClientAuthority, buildTenantAiOperation } = require('../enterprise/tenantAi');
const { buildLegacyPrompt, generateWithProviders, loadProviderConfiguration, parseAiResponse } = require('../services/aiRuntime');
const { enterpriseFeatureEnabled } = require('../enterprise/featureFlags');

const router = express.Router();

// This authenticated status endpoint lets an explicitly enabled frontend explain a
// server-side rollout mismatch without probing tenant data or creating control-plane state.
router.get('/status', (req, res) => {
  return res.json({ enabled: enterpriseFeatureEnabled(), apiVersion: 'tenant-foundation-v1' });
});

// Keep the foundation dark in existing production environments until the data-plane,
// IAM, migration, and operational gates have been explicitly enabled. This prevents a
// newly deployed route from creating control-plane records accidentally.
router.use((req, res, next) => {
  if (!enterpriseFeatureEnabled()) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API route not found', requestId: res.locals?.requestId } });
  }
  return next();
});

// The global API boundary already verifies Firebase bearer tokens. Enterprise context
// creation additionally requires a verified human identity; service-account support is
// introduced through a separate authenticated principal flow rather than this browser route.
router.use((req, res, next) => {
  if (!req.user?.emailVerified) {
    return res.status(403).json({ error: { code: 'EMAIL_VERIFICATION_REQUIRED', message: 'A verified email address is required', requestId: res.locals?.requestId } });
  }
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
    requestedTenantId: normalizeRequestedTenantId(req.get('x-tenant-id') || req.query?.tenantId),
    requestedWorkspaceId: normalizeRequestedWorkspaceId(req.get('x-workspace-id') || req.query?.workspaceId),
  };
}

async function resolveTenantContext(req, res, next) {
  try {
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
    return res.status(error.status || 503).json({
      error: {
        code: error.code || 'TENANT_CONTEXT_UNAVAILABLE',
        message: error.status === 404 ? 'Tenant context was not found' : 'Tenant context is unavailable',
        requestId: res.locals?.requestId,
      }
    });
  }
}

router.post('/support-grants', async (req, res) => {
  try {
    const grant = await enterpriseService(req).createSupportGrant({ user: req.user, input: req.body || {}, requestId: res.locals?.requestId });
    return res.status(201).json({
      grant: { id: grant.id, tenantId: grant.tenantId, workspaceId: grant.workspaceId, supportSubjectId: grant.supportSubjectId, scopes: grant.scopes, expiresAt: grant.expiresAt, reason: grant.reason },
    });
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'SUPPORT_GRANT_CREATE_FAILED', message: error.status === 400 ? error.message : 'Support grant could not be created', requestId: res.locals?.requestId } });
  }
});

router.post('/support-grants/:grantId/revoke', async (req, res) => {
  try {
    await enterpriseService(req).revokeSupportGrant({ user: req.user, grantId: req.params.grantId, requestId: res.locals?.requestId });
    return res.status(204).end();
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'SUPPORT_GRANT_REVOKE_FAILED', message: error.status === 404 ? 'Support grant was not found' : 'Support grant could not be revoked', requestId: res.locals?.requestId } });
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

router.get('/context', resolveTenantContext, (req, res) => {
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
  });
});

router.get('/workspaces', resolveTenantContext, requireTenantPermission('workspace.read'), async (req, res) => {
  try {
    const workspaces = await enterpriseService(req).listWorkspaces({ context: req.tenantContext });
    return res.json({ workspaces: workspaces.map(workspace => ({ id: workspace.id, name: workspace.name, active: workspace.id === req.workspace?.id, isDefault: workspace.isDefault === true })) });
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'WORKSPACE_UNAVAILABLE', message: 'Workspaces are unavailable', requestId: res.locals?.requestId } });
  }
});

router.get('/memberships', resolveTenantContext, requireTenantPermission('tenant.members.read'), async (req, res) => {
  try {
    const memberships = await enterpriseService(req).listTenantMemberships({ context: req.tenantContext });
    return res.json({ memberships: memberships.map(membership => ({ id: membership.id, principalId: membership.principalId, workspaceId: membership.workspaceId, roles: membership.roles, status: membership.status, createdAt: membership.createdAt || null })) });
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'TENANT_MEMBERS_UNAVAILABLE', message: 'Tenant members are unavailable', requestId: res.locals?.requestId } });
  }
});

router.post('/memberships', resolveTenantContext, requireTenantPermission('tenant.members.manage'), async (req, res) => {
  try {
    const membership = await enterpriseService(req).grantMembership({ context: req.tenantContext, input: req.body || {} });
    return res.status(201).json({ membership: { id: membership.id, tenantId: membership.tenantId, principalId: membership.principalId, workspaceId: membership.workspaceId, roles: membership.roles, status: membership.status } });
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'TENANT_MEMBERSHIP_GRANT_FAILED', message: error.status === 400 ? error.message : 'Tenant membership could not be granted', requestId: res.locals?.requestId } });
  }
});

router.post('/service-accounts', resolveTenantContext, requireTenantPermission('tenant.security.manage'), async (req, res) => {
  try {
    const created = await enterpriseService(req).createServiceAccount({ context: req.tenantContext, input: req.body || {} });
    // The plaintext key is deliberately returned exactly once. Persistence/logging
    // contains only the one-way hash and safe prefix.
    return res.status(201).json({
      serviceAccount: { id: created.account.id, tenantId: created.account.tenantId, workspaceId: created.account.workspaceId, displayName: created.account.displayName, status: created.account.status },
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

router.post('/tenants/:tenantId/reactivate', async (req, res) => {
  try {
    const tenant = await enterpriseService(req).setTenantLifecycleAsPlatform({ user: req.user, tenantId: req.params.tenantId, nextState: 'ACTIVE', requestId: res.locals?.requestId });
    return res.json({ tenant: { id: tenant.id, lifecycleState: tenant.lifecycleState } });
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'TENANT_LIFECYCLE_UPDATE_FAILED', message: error.status === 403 ? 'Tenant reactivation is not permitted' : 'Tenant could not be reactivated', requestId: res.locals?.requestId } });
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
    const events = await enterpriseService(req).listAuditEvents({ context: req.tenantContext, limit: req.query?.limit });
    return res.json({ events });
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'TENANT_AUDIT_UNAVAILABLE', message: 'Tenant audit events are unavailable', requestId: res.locals?.requestId } });
  }
});

router.get('/teams', resolveTenantContext, requireTenantPermission('workspace.read'), async (req, res) => {
  try {
    const teams = await enterpriseService(req).listTeams({ context: req.tenantContext });
    return res.json({ teams });
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'TENANT_TEAMS_UNAVAILABLE', message: 'Teams are unavailable', requestId: res.locals?.requestId } });
  }
});

router.post('/teams', resolveTenantContext, requireTenantPermission('workspace.manage'), async (req, res) => {
  try {
    const team = await enterpriseService(req).createTeam({ context: req.tenantContext, input: req.body || {} });
    return res.status(201).json({ team });
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'TENANT_TEAM_CREATE_FAILED', message: error.status === 400 ? error.message : 'Team could not be created', requestId: res.locals?.requestId } });
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
    // Fail closed before provider invocation when the RLS-backed tenant usage ledger
    // is not available. Legacy AI routes remain unchanged until their adapters migrate.
    if (!enterpriseService(req).dataPlaneRouter) {
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
    res.setHeader('X-AI-Provider', generated.provider);
    res.setHeader('X-AI-Model', generated.model);
    return res.json({ data, context: { tenantId: req.tenantContext.tenantId, workspaceId: req.tenantContext.workspaceId, correlationId: req.tenantContext.correlationId, policyVersion: aiOperation.policyVersion } });
  } catch (error) {
    return res.status(error.status || 502).json({ error: { code: error.code || 'TENANT_AI_GENERATION_FAILED', message: error.status === 400 ? error.message : 'Tenant AI generation is unavailable.', requestId: res.locals?.requestId } });
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
