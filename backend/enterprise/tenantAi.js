'use strict';

const crypto = require('crypto');
const { tenantCacheKey } = require('./tenantCache');

const CLIENT_AUTHORITY_FIELDS = new Set([
  'tenantId', 'tenant_id', 'workspaceId', 'workspace_id', 'uid', 'userId', 'user_id',
  'ownerUid', 'owner_uid', 'resourceId', 'resource_id', 'vectorNamespace', 'vector_namespace',
  'dataPlaneId', 'data_plane_id'
]);

function assertNoClientAuthority(input, label = 'AI request') {
  const candidate = input && typeof input === 'object' ? input : {};
  for (const key of Object.keys(candidate)) {
    if (CLIENT_AUTHORITY_FIELDS.has(key)) {
      const error = new Error(`${label} cannot supply identity, tenant, workspace, resource, or vector authority`);
      error.code = 'CLIENT_AI_CONTEXT_REJECTED';
      error.status = 400;
      throw error;
    }
  }
  return candidate;
}

function normalizeAllowedProviders(policy = {}, configuredProviders = {}) {
  // Enterprise AI is deny-by-default: an explicit empty allowlist means that the
  // tenant has not approved any provider yet. Legacy routes do not call this helper.
  if (Array.isArray(policy.allowedProviders)) {
    return new Set(policy.allowedProviders.map(value => String(value).toLowerCase()));
  }
  // A policy omitted only for migration compatibility inherits currently configured
  // providers; newly provisioned tenant configurations always persist an array.
  return new Set(Object.keys(configuredProviders));
}

function applyTenantAiPolicy(configuration, context, policy = {}) {
  const allowedProviders = normalizeAllowedProviders(policy, configuration.providers);
  const customKeys = policy.customProviderKeys || {};
  // Model governance is enforced server-side: when the tenant declares a model
  // allowlist, providers whose effective model is not allowlisted are disabled
  // even if the provider itself is approved. `restrictedModels` is the symmetric
  // denylist (e.g. a permanently retired model for this tenant).
  const allowedModels = Array.isArray(policy.allowedModels)
    ? new Set(policy.allowedModels.map(value => String(value).trim()).filter(Boolean))
    : null;
  const restrictedModels = new Set(
    Array.isArray(policy.restrictedModels)
      ? policy.restrictedModels.map(value => String(value).trim()).filter(Boolean)
      : []
  );
  const providers = Object.fromEntries(Object.entries(configuration.providers || {}).map(([name, provider]) => {
    const effectiveKey = String(customKeys[name] || provider.key || '').trim();
    const hasCustomKey = Boolean(String(customKeys[name] || '').trim());
    return [name, {
      ...provider,
      key: effectiveKey,
      enabled: (hasCustomKey || provider.enabled === true) && allowedProviders.has(name)
        && Boolean(effectiveKey)
        && !restrictedModels.has(String(provider.model || ''))
        && (!allowedModels || allowedModels.size === 0 || allowedModels.has(String(provider.model || ''))),
    }];
  }));
  // The tenant-preferred primary model takes effect only through provider
  // selection: the primary becomes the provider actually serving that model.
  const modelPreferredPrimary = String(policy.primaryModel || '')
    ? Object.keys(providers).find(name => providers[name]?.enabled && String(providers[name].model || '') === String(policy.primaryModel))
    : undefined;
  const primary = modelPreferredPrimary
    || (allowedProviders.has(configuration.primary) && providers[configuration.primary]?.enabled
      ? configuration.primary
      : Object.keys(providers).find(name => providers[name].enabled) || configuration.primary);
  if (!providers[primary]?.enabled) {
    const error = new Error('No provider is permitted by the active tenant AI policy');
    error.code = 'TENANT_AI_PROVIDER_UNAVAILABLE';
    error.status = 403;
    throw error;
  }
  return Object.freeze({
    ...configuration,
    primary,
    providers,
    // Tenant identity for routing-state isolation (health, model access,
    // telemetry are all keyed by this). Null only on the platform scope.
    tenantId: context && context.tenantId ? String(context.tenantId) : null,
    principalId: context && context.principalId ? String(context.principalId) : null,
    // F-09: the providers whose EFFECTIVE KEY is genuinely tenant-owned BYOK
    // (read from the encrypted enterprise_tenant_credentials store, F-08).
    // Platform keys must never be re-labelled as dedicated BYOK — that tier
    // disables metrics and cooldowns, so mislabelling hides the largest
    // traffic class from routing intelligence.
    tenantByokProviders: Object.freeze(
      Object.keys(providers).filter(name => Boolean(String(customKeys[name] || '').trim()))
    ),
    // Tenant AI governance data (no credentials) for the dynamic model
    // selector: allowlist/denylist apply to discovered models as well as the
    // configured model; primaryModel is a preference signal.
    tenantPolicy: Object.freeze({
      allowedProviders: Array.isArray(policy.allowedProviders) ? policy.allowedProviders.map(value => String(value)) : null,
      allowedModels: Array.isArray(policy.allowedModels)
        ? policy.allowedModels.map(value => String(value).trim()).filter(Boolean)
        : null,
      restrictedModels: Array.isArray(policy.restrictedModels)
        ? policy.restrictedModels.map(value => String(value).trim()).filter(Boolean)
        : null,
      primaryModel: policy.primaryModel ? String(policy.primaryModel).trim() : null,
    }),
    tenantPolicyVersion: Number(policy.version || context.policyVersion),
    tenantAiProfile: String(policy.profile || context.dataPlane.aiProfile || 'platform-default'),
  });
}

/**
 * F-08: tenant BYOK read path.
 *
 * `aiPolicy.customProviderKeys` is write-only by design — the MySQL registry
 * stores tenant keys exclusively in the encrypted `enterprise_tenant_credentials`
 * table and normalizeTenantConfiguration drops any inline keys on read. This
 * loader closes the loop: it reads the stored credentials for the tenant's
 * allowed providers and returns them as a providerId -> apiKey map, ready to be
 * merged into the policy passed to applyTenantAiPolicy. Resolution order is
 * therefore tenant BYOK -> platform admin config -> environment default.
 *
 * Guarantees:
 * - Key material is never logged and never appears in error messages.
 * - Results are cached per tenant for `ttlMs` (default 10s) so a decrypt round
 *   trip does not sit on every AI request.
 * - A registry without credential-store capability yields {} (BYOK not
 *   deployed / test harnesses that carry keys inline on the policy).
 * - If the store IS supported but cannot be read (encryption unconfigured,
 *   database error) the loader fails CLOSED with 503 TENANT_BYOK_UNAVAILABLE:
 *   silently serving platform keys would break the tenant's cost and data
 *   isolation promise. Failures are not cached.
 */
const TENANT_BYOK_CACHE_TTL_MS = 10_000;
const tenantByokCache = new Map();

async function loadTenantByokKeys({ registry, tenantId, allowedProviders, ttlMs = TENANT_BYOK_CACHE_TTL_MS, now = Date.now() } = {}) {
  const id = String(tenantId || '').trim();
  if (!registry || typeof registry.getTenantCredentials !== 'function' || !id) return {};

  const cached = tenantByokCache.get(id);
  if (cached && cached.expiresAt > now) return cached.keys;

  let providerIds = (Array.isArray(allowedProviders) ? allowedProviders : [])
    .map(providerId => String(providerId || '').toLowerCase().trim())
    .filter(Boolean);
  if (!providerIds.length && typeof registry.listTenantCredentialProviders === 'function') {
    try {
      const rows = await registry.listTenantCredentialProviders({ tenantId: id });
      providerIds = (rows || []).map(row => String(row?.providerId || '').toLowerCase().trim()).filter(Boolean);
    } catch (error) {
      throw Object.assign(new Error('Tenant BYOK credentials are temporarily unavailable; refusing to fall back to platform keys'), {
        code: 'TENANT_BYOK_UNAVAILABLE',
        status: 503,
        cause: error?.code || 'TENANT_BYOK_STORE_ERROR',
      });
    }
  }

  const keys = {};
  for (const providerId of providerIds) {
    let credentials;
    try {
      credentials = await registry.getTenantCredentials({ tenantId: id, providerId });
    } catch (error) {
      throw Object.assign(new Error('Tenant BYOK credentials are temporarily unavailable; refusing to fall back to platform keys'), {
        code: 'TENANT_BYOK_UNAVAILABLE',
        status: 503,
        cause: error?.code || 'TENANT_BYOK_STORE_ERROR',
      });
    }
    const apiKey = typeof credentials === 'string'
      ? credentials.trim()
      : String(credentials?.apiKey || '').trim();
    if (apiKey) keys[providerId] = apiKey;
  }

  tenantByokCache.set(id, { expiresAt: now + Math.max(0, Number(ttlMs) || 0), keys });
  return keys;
}

function clearTenantByokCache() {
  tenantByokCache.clear();
}

function buildTenantAiOperation({ context, operation, payload, sourceResources = [], policy = {} }) {
  assertNoClientAuthority(payload, 'AI payload');
  if (!Array.isArray(sourceResources)) throw Object.assign(new Error('AI sources are invalid'), { code: 'INVALID_AI_SOURCES', status: 400 });
  for (const source of sourceResources) {
    if (!source || source.tenantId !== context.tenantId || (source.workspaceId && source.workspaceId !== context.workspaceId)) {
      throw Object.assign(new Error('AI source is outside the active tenant context'), { code: 'TENANT_AI_SOURCE_DENIED', status: 404 });
    }
  }
  const sourceDigest = crypto.createHash('sha256').update(JSON.stringify({
    operation: String(operation || ''),
    payload: payload && typeof payload === 'object' ? payload : {},
    resources: sourceResources.map(source => ({
      id: source.id,
      revision: source.revision,
      tenantId: source.tenantId,
      workspaceId: source.workspaceId || null,
    })),
  })).digest('hex');
  return Object.freeze({
    tenantId: context.tenantId,
    workspaceId: context.workspaceId,
    principalId: context.principalId,
    correlationId: context.correlationId,
    operation: String(operation || ''),
    policyVersion: Number(policy.version || context.policyVersion),
    sourceDigest,
    sourceCount: sourceResources.length,
    cacheKey: tenantCacheKey({
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      subjectId: context.principalId,
      domain: `ai-${String(operation || '').toLowerCase()}`,
      resourceId: sourceDigest,
      revision: Number(policy.version || context.policyVersion),
    }),
  });
}

module.exports = {
  CLIENT_AUTHORITY_FIELDS,
  applyTenantAiPolicy,
  assertNoClientAuthority,
  buildTenantAiOperation,
  clearTenantByokCache,
  loadTenantByokKeys,
};
