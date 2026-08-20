'use strict';

const { assertPrincipalId, assertUuid } = require('./tenantContext');

const SAFE_SEGMENT = /^[A-Za-z0-9._:-]{1,160}$/;

function segment(value, label) {
  const normalized = String(value || '');
  if (!SAFE_SEGMENT.test(normalized)) {
    const error = new Error(`${label} is not a safe cache-key segment`);
    error.code = 'INVALID_CACHE_KEY';
    throw error;
  }
  return normalized;
}

function tenantCacheKey({ tenantId, workspaceId = null, subjectId = null, domain, resourceId = null, revision = null }) {
  const parts = ['v1', 'tenant', assertUuid(tenantId, 'Tenant identifier')];
  if (workspaceId) parts.push('workspace', assertUuid(workspaceId, 'Workspace identifier'));
  if (subjectId) parts.push('subject', assertPrincipalId(subjectId));
  parts.push('domain', segment(domain, 'Cache domain'));
  if (resourceId !== null && resourceId !== undefined) parts.push('resource', segment(resourceId, 'Resource identifier'));
  if (revision !== null && revision !== undefined) parts.push('revision', segment(String(revision), 'Revision'));
  return parts.join(':');
}

function globalCacheKey({ domain, revision = null, locale = null }) {
  const parts = ['v1', 'global', 'domain', segment(domain, 'Cache domain')];
  if (locale) parts.push('locale', segment(locale, 'Locale'));
  if (revision !== null && revision !== undefined) parts.push('revision', segment(String(revision), 'Revision'));
  return parts.join(':');
}

function tenantRateLimitKey({ tenantId, principalId, operation, window }) {
  return tenantCacheKey({
    tenantId,
    subjectId: principalId,
    domain: `rate-${segment(operation, 'Operation')}-${segment(window, 'Window')}`,
  });
}

function tenantCachePrefix({ tenantId, workspaceId = null }) {
  const base = ['v1', 'tenant', assertUuid(tenantId, 'Tenant identifier')];
  if (workspaceId) base.push('workspace', assertUuid(workspaceId, 'Workspace identifier'));
  return `${base.join(':')}:`;
}

module.exports = {
  globalCacheKey,
  tenantCacheKey,
  tenantCachePrefix,
  tenantRateLimitKey,
};
