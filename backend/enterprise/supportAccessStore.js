'use strict';

const crypto = require('crypto');
const { normalizeScopes } = require('./serviceIdentity');
const { assertPrincipalId, assertUuid } = require('./tenantContext');

function normalizeReason(value) {
  const reason = Array.from(String(value || ''), character => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? ' ' : character;
  }).join('').replace(/\s+/g, ' ').trim();
  if (reason.length < 10 || reason.length > 500) {
    throw Object.assign(new Error('Support access reason must be between 10 and 500 characters'), { code: 'INVALID_SUPPORT_REASON', status: 400 });
  }
  return reason;
}

function normalizeExpiry(value, now = Date.now()) {
  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 480) {
    throw Object.assign(new Error('Support access duration must be between 5 and 480 minutes'), { code: 'INVALID_SUPPORT_EXPIRY', status: 400 });
  }
  return new Date(now + minutes * 60_000).toISOString();
}

function createSupportGrant({ tenantId, workspaceId = null, supportSubjectId, requestedBySubjectId, reason, expiresInMinutes, scopes = ['tenant.audit.read'], now = Date.now() }) {
  return Object.freeze({
    id: crypto.randomUUID(),
    tenantId: assertUuid(tenantId, 'Tenant identifier'),
    // null ⇒ tenant-scoped (break-glass across the tenant); UUID ⇒ limited to
    // exactly that workspace.
    workspaceId: workspaceId ? assertUuid(workspaceId, 'Workspace identifier') : null,
    supportSubjectId: assertPrincipalId(supportSubjectId),
    requestedBySubjectId: assertPrincipalId(requestedBySubjectId),
    reason: normalizeReason(reason),
    scopes: normalizeScopes(scopes),
    status: 'ACTIVE',
    createdAt: new Date(now).toISOString(),
    expiresAt: normalizeExpiry(expiresInMinutes, now),
  });
}

function activeGrant(grant, { supportSubjectId, tenantId, workspaceId, now = Date.now() }) {
  if (!grant || grant.status !== 'ACTIVE') return false;
  if (grant.supportSubjectId !== supportSubjectId || grant.tenantId !== tenantId) return false;
  // Workspace-scoped grants must match the requested workspace exactly.
  // Tenant-scoped grants (workspaceId null) allow any workspace within the
  // tenant; the service layer validates workspace existence and narrowing.
  if (grant.workspaceId && grant.workspaceId !== workspaceId) return false;
  return new Date(grant.expiresAt).getTime() > now;
}

class InMemorySupportGrantStore {
  constructor() { this.grants = new Map(); }

  async create(input) {
    const grant = createSupportGrant(input);
    this.grants.set(grant.id, grant);
    return grant;
  }

  async validate({ grantId, supportSubjectId, tenantId, workspaceId, now }) {
    const grant = this.grants.get(String(grantId || ''));
    return activeGrant(grant, { supportSubjectId, tenantId, workspaceId, now }) ? grant : null;
  }

  async revoke(grantId, { tenantId = null, workspaceId = null } = {}) {
    const grant = this.grants.get(String(grantId || ''));
    if (!grant) return false;
    if (tenantId && grant.tenantId !== assertUuid(tenantId, 'Tenant identifier')) return false;
    if (workspaceId && grant.workspaceId !== assertUuid(workspaceId, 'Workspace identifier')) return false;
    this.grants.set(grant.id, { ...grant, status: 'REVOKED', revokedAt: new Date().toISOString() });
    return true;
  }

  async list({ tenantId, workspaceId = null }) {
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    const rows = [];
    for (const grant of this.grants.values()) {
      if (grant.tenantId !== tenantId || grant.status !== 'ACTIVE') continue;
      if (workspaceId && grant.workspaceId !== workspaceId) continue;
      rows.push({ ...grant });
    }
    return rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }
}

module.exports = {
  InMemorySupportGrantStore,
  activeGrant,
  createSupportGrant,
};
