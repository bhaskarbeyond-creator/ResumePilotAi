'use strict';

/**
 * First-class non-human authentication for the enterprise API surface.
 *
 * Two principal kinds in addition to tenant members:
 *
 *  1. M2M service accounts — authenticate with `x-api-key` only. The key
 *     resolves the service account, which pins the tenant and workspace
 *     server-side. Client-supplied tenant/workspace values can only RESTRICT
 *     (and must match) the key's own tenant/workspace — they can never expand
 *     authority. The resulting service principal carries exactly the scopes
 *     recorded on the key; downstream routes apply the same RBAC checks as
 *     for human members.
 *
 *  2. Support (break-glass) elevation — an authenticated, support-eligible
 *     human presents `x-support-grant-id` alongside their bearer token. The
 *     grant is explicit, time-bound, scoped, approval-controlled, audited and
 *     revocable. Elevation is validated per request.
 *
 * Both flows fail closed. A request presenting more than one credential kind
 * is rejected outright (ambiguous credentials).
 */

const crypto = require('crypto');
const { getPool } = require('../database/mysql');
const { normalizeRequestedTenantId, normalizeRequestedWorkspaceId } = require('./tenantContext');

const API_KEY_HEADER_MAX = 512;

function serviceApiKeyFromRequest(req) {
  const header = String(req.get('x-api-key') || '');
  if (!header) return null;
  return header.length <= API_KEY_HEADER_MAX ? header : null;
}

function supportGrantIdFromRequest(req) {
  const raw = String(req.get('x-support-grant-id') || '').trim();
  return raw && raw.length <= 128 ? raw : null;
}

function hasBearerCredential(req) {
  return /^Bearer\s+[^\s]{1,8192}$/i.test(String(req.get('authorization') || ''));
}

function unauthorized(res, code, message) {
  return res.status(401).json({ error: { code, message, requestId: res.locals?.requestId } });
}

function _forbidden(res, code, message) {
  return res.status(403).json({ error: { code, message, requestId: res.locals?.requestId } });
}

// ─── Fail-closed endpoint allowlists ─────────────────────────────────────────
// M2M keys may only ever reach data-plane and read-only governance endpoints.
// Control-plane writes (memberships, service accounts, configuration,
// lifecycle, grants, platform administration) remain human-only. Anything not
// listed here responds 403 M2M_OPERATION_NOT_PERMITTED before a handler runs.
const M2M_ALLOWED_ENDPOINTS = Object.freeze([
  { method: 'GET', pattern: /^\/status$/ },
  { method: 'GET', pattern: /^\/context$/ },
  { method: 'GET', pattern: /^\/m2m\/context$/ },
  { method: 'GET', pattern: /^\/workspaces$/ },
  { method: 'GET', pattern: /^\/roles-matrix$/ },
  { method: 'GET', pattern: /^\/configuration$/ },
  { method: 'GET', pattern: /^\/teams$/ },
  { method: 'GET', pattern: /^\/resources$/ },
  { method: 'POST', pattern: /^\/resources$/ },
  { method: 'GET', pattern: /^\/resources\/[0-9a-f-]{36}$/i },
  { method: 'PATCH', pattern: /^\/resources\/[0-9a-f-]{36}$/i },
  { method: 'DELETE', pattern: /^\/resources\/[0-9a-f-]{36}$/i },
  { method: 'POST', pattern: /^\/ai\/generate-content$/ },
  { method: 'GET', pattern: /^\/usage\/ai$/ },
  { method: 'GET', pattern: /^\/usage\/ai\/events$/ },
  { method: 'GET', pattern: /^\/audit$/ },
  { method: 'GET', pattern: /^\/observability\/metrics$/ },
  { method: 'GET', pattern: /^\/data-plane\/status$/ },
  { method: 'GET', pattern: /^\/queue\/status$/ },
  { method: 'GET', pattern: /^\/queue\/jobs$/ },
  { method: 'POST', pattern: /^\/storage\/token$/ },
  { method: 'POST', pattern: /^\/storage\/verify$/ },
]);

// Support elevation: diagnostics always; repair (resource writes) only when
// the tenant policy explicitly allows repair scopes and the grant carries
// them. Route-level RBAC enforces the actual scope check; this list only
// decides reachability. Grant management, IAM, configuration and platform
// administration are never reachable through a support grant.
const SUPPORT_ALLOWED_ENDPOINTS = Object.freeze([
  { method: 'GET', pattern: /^\/status$/ },
  { method: 'GET', pattern: /^\/context$/ },
  { method: 'GET', pattern: /^\/support\/context$/ },
  { method: 'GET', pattern: /^\/workspaces$/ },
  { method: 'GET', pattern: /^\/roles-matrix$/ },
  { method: 'GET', pattern: /^\/configuration$/ },
  { method: 'GET', pattern: /^\/resources$/ },
  { method: 'GET', pattern: /^\/resources\/[0-9a-f-]{36}$/i },
  { method: 'POST', pattern: /^\/resources$/ },
  { method: 'PATCH', pattern: /^\/resources\/[0-9a-f-]{36}$/i },
  { method: 'GET', pattern: /^\/usage\/ai$/ },
  { method: 'GET', pattern: /^\/usage\/ai\/events$/ },
  { method: 'GET', pattern: /^\/audit$/ },
  { method: 'GET', pattern: /^\/observability\/metrics$/ },
  { method: 'GET', pattern: /^\/data-plane\/status$/ },
  { method: 'GET', pattern: /^\/queue\/status$/ },
  { method: 'GET', pattern: /^\/queue\/jobs$/ },
]);

function endpointAllowed(endpoints, method, path) {
  return endpoints.some(entry => entry.method === method && entry.pattern.test(path));
}

// Best-effort, throttled platform security events for M2M authentication
// failures. The plaintext key is never recorded — only its safe prefix.
const failureThrottle = new Map();
const FAILURE_THROTTLE_MS = 60_000;

async function recordM2mAuthFailure({ app, apiKey, code, requestId }) {
  try {
    const prefix = String(apiKey || '').slice(0, 12) || 'none';
    const now = Date.now();
    const last = failureThrottle.get(prefix) || 0;
    if (now - last < FAILURE_THROTTLE_MS) return;
    failureThrottle.set(prefix, now);
    if (failureThrottle.size > 500) failureThrottle.clear();
    const pool = app?.get?.('mysqlPool') || getPool();
    await pool.query(
      `INSERT INTO security_audit_logs
       (id, actor_uid, action, category, severity, target_type, metadata, request_id)
       VALUES (?, ?, 'M2M_AUTH_FAILED', 'iam.service_accounts', 'HIGH', 'SERVICE_ACCOUNT', ?, ?)`,
      [crypto.randomUUID(), `api-key:${prefix}`, JSON.stringify({
        keyPrefix: prefix,
        reason: String(code || 'INVALID_SERVICE_API_KEY').slice(0, 80),
      }), requestId || null]
    );
  } catch (error) {
    // Authentication remains fail-closed even if telemetry is impaired.
    console.error('[EnterpriseAuth] Failed to persist M2M authentication failure:', error?.message || error);
  }
}

/**
 * Enterprise API boundary middleware. Installed for /api/enterprise/* in
 * place of the plain bearer-only requireAuth:
 *
 *   x-api-key present                → service principal (M2M)
 *   bearer + x-support-grant-id      → human auth here; grant is resolved in
 *                                      the enterprise router (needs req.user)
 *   bearer only                      → normal human authentication
 *
 * Service keys are authenticated eagerly so downstream middleware (rate
 * limiting, allowlists, RBAC) operates on a verified principal.
 */
function createEnterpriseAuthMiddleware({ requireAuth } = {}) {
  return async function requireEnterpriseAuth(req, res, next) {
    const apiKey = serviceApiKeyFromRequest(req);
    const supportGrantId = supportGrantIdFromRequest(req);

    if (apiKey) {
      if (hasBearerCredential(req) || supportGrantId) {
        return res.status(400).json({ error: { code: 'AMBIGUOUS_CREDENTIALS', message: 'Provide exactly one credential: a bearer token or an x-api-key, never both.', requestId: res.locals?.requestId } });
      }
      const service = req.app.get('tenantService');
      if (!service?.authenticateServiceApiKey) {
        return res.status(503).json({ error: { code: 'TENANT_CONTROL_PLANE_UNAVAILABLE', message: 'Tenant service is unavailable', requestId: res.locals?.requestId } });
      }
      try {
        const authenticated = await service.authenticateServiceApiKey({
          apiKey,
          requestedTenantId: normalizeRequestedTenantId(req.get('x-tenant-id') || req.query?.tenantId),
          requestedWorkspaceId: normalizeRequestedWorkspaceId(req.get('x-workspace-id') || req.query?.workspaceId),
          requestId: res.locals?.requestId,
        });
        req.serviceAuth = authenticated;
        req.serviceContext = authenticated.context;
        return next();
      } catch (error) {
        await recordM2mAuthFailure({ app: req.app, apiKey, code: error.code, requestId: res.locals?.requestId });
        const status = [403, 404].includes(error.status) ? error.status : 401;
        const code = status === 404
          ? (error.code || 'SERVICE_TENANT_NOT_FOUND')
          : status === 403
            ? (error.code || 'TENANT_INACTIVE')
            : (error.code === 'SERVICE_ACCOUNT_STORE_UNAVAILABLE' ? 'SERVICE_ACCOUNT_STORE_UNAVAILABLE' : 'INVALID_SERVICE_API_KEY');
        const message = status === 401 ? 'Service authentication failed' : error.status === 403 ? 'Service access is not permitted' : 'Service context was not found';
        return res.status(status).json({ error: { code, message, requestId: res.locals?.requestId } });
      }
    }

    if (supportGrantId && !hasBearerCredential(req)) {
      return unauthorized(res, 'AUTH_REQUIRED', 'Support access requires an authenticated support engineer');
    }
    if (supportGrantId) {
      // Grant validation needs the verified user identity; the enterprise
      // router resolves it after bearer authentication succeeds.
      req.pendingSupportGrantId = supportGrantId;
    }
    return requireAuth(req, res, next);
  };
}

module.exports = {
  M2M_ALLOWED_ENDPOINTS,
  SUPPORT_ALLOWED_ENDPOINTS,
  createEnterpriseAuthMiddleware,
  endpointAllowed,
  hasBearerCredential,
  serviceApiKeyFromRequest,
  supportGrantIdFromRequest,
};
