'use strict';

/**
 * DIR-106 — the SINGLE authoritative AI governance resolver.
 *
 * WHY THIS MODULE EXISTS
 * The audit found the AI pipeline split into two halves that never met: the
 * quota gate read `req.tenantContext` (backend/security/abuse.js:322) while the
 * ONLY assignments to that property live inside the enterprise router, which
 * runs AFTER the gate. `tenantData` was therefore always `null` and every
 * organization member was charged against their personal allowance (P0-1).
 *
 * This module resolves tenant context, entitlement and quota ONCE, before the
 * quota middleware, and is the only place AI entitlement is decided.
 *
 * PRECEDENCE (Rule A / Rule B):
 *   active, applicable ORGANIZATION entitlement -> else INDIVIDUAL -> else NONE
 * An exhausted organization quota NEVER falls through to the individual plan.
 *
 * HONESTY: nothing here invents a limit. Every number is read from MariaDB
 * (`enterprise_tenant_configurations.quotaPolicy` / `system_settings.ai_quota`)
 * or from `resolveEffectiveEntitlement`. Unreadable state resolves to NONE.
 */

const QUOTA_SOURCE = Object.freeze({
    ORGANIZATION: 'ORGANIZATION',
    INDIVIDUAL: 'INDIVIDUAL',
    NONE: 'NONE',
});

const { resolveEffectiveEntitlement } = require('./entitlements');

/** A tenant must be live; a membership must be active. Anything else grants nothing. */
const TENANT_ACTIVE_STATES = new Set(['ACTIVE']);
const MEMBERSHIP_ACTIVE_STATUSES = new Set(['ACTIVE']);

const DEFAULT_ENTERPRISE_DAILY_LIMIT = 5000;
const DEFAULT_BASIC_DAILY_LIMIT = 10;

const pool = () => require('../database/mysql').getPool();

const toPositiveInt = (value) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
};

const parseJson = (value, fallback = {}) => {
    if (!value) return fallback;
    if (typeof value === 'object') return value;
    try { return JSON.parse(value); } catch { return fallback; }
};

/**
 * Selects the ONE applicable organization membership for this user.
 *
 * Deliberate decisions (each maps to a confirmed audit defect):
 *   - `personalTenant` rows are NOT organizations. Two such rows exist in the
 *     live database; treating them as org entitlements would hand a user their
 *     own tenant as an organization (Rule B, "Important distinction").
 *   - Invalid membership (suspended) or invalid tenant (non-ACTIVE,
 *     decommissioned) grants nothing. (P0-3)
 *   - Multiple eligible tenants are never resolved arbitrarily: an explicit
 *     `x-tenant-id` selects one, otherwise the request is ambiguous and is
 *     refused rather than guessed. (P0-2)
 *
 * @returns {{ membership: object|null, reason: string|null }}
 */
async function loadApplicableTenantMembership(uid, requestedTenantId) {
    const [rows] = await pool().query(
        `SELECT m.tenantId, m.workspaceId, m.status AS membershipStatus, m.personalTenant,
                t.lifecycleState, t.decommissionedAt, t.policyVersion,
                c.aiPolicy, c.quotaPolicy, c.revision AS configRevision
           FROM enterprise_memberships m
           JOIN enterprise_tenants t ON t.id = m.tenantId
      LEFT JOIN enterprise_tenant_configurations c ON c.tenantId = m.tenantId
          WHERE m.principalId = ?
          ORDER BY m.updated_at DESC`,
        [uid],
    );

    const organizational = rows.filter(row => row.personalTenant !== 1 && row.personalTenant !== true);
    if (!organizational.length) return { membership: null, reason: 'NO_ORGANIZATION_MEMBERSHIP' };

    const eligible = organizational.filter(row => (
        MEMBERSHIP_ACTIVE_STATUSES.has(String(row.membershipStatus || '').toUpperCase())
        && TENANT_ACTIVE_STATES.has(String(row.lifecycleState || '').toUpperCase())
        && !row.decommissionedAt
    ));
    if (!eligible.length) return { membership: null, reason: 'MEMBERSHIP_NOT_ACTIVE' };

    if (requestedTenantId) {
        const requested = eligible.find(row => String(row.tenantId) === String(requestedTenantId));
        return requested
            ? { membership: requested, reason: null }
            : { membership: null, reason: 'REQUESTED_TENANT_NOT_ELIGIBLE' };
    }
    if (eligible.length > 1) return { membership: null, reason: 'AMBIGUOUS_ACTIVE_TENANT' };
    return { membership: eligible[0], reason: null };
}

/**
 * Resolves the effective AI governance for one request. Read-only: it takes no
 * locks and consumes no quota — the reservation is a separate, later step.
 */
async function resolveAiGovernance(req) {
    const uid = req?.user?.uid;
    if (!uid) {
        return { source: QUOTA_SOURCE.NONE, reason: 'AUTH_REQUIRED', entitlement: null, quota: null, tenant: null };
    }

    const [[userRows], [quotaRows]] = await Promise.all([
        pool().query('SELECT * FROM users WHERE id = ? LIMIT 1', [uid]),
        pool().query("SELECT data FROM system_settings WHERE category = 'ai_quota' LIMIT 1"),
    ]);
    const userData = userRows[0] || {};
    const quotaConfig = parseJson(quotaRows[0]?.data, {});

    const requestedTenantId = req.get?.('x-tenant-id') || req.body?.tenantId || req.query?.tenantId || null;
    const lookup = await loadApplicableTenantMembership(uid, requestedTenantId);

    const membership = lookup.membership;
    const aiPolicy = parseJson(membership?.aiPolicy, {});
    const quotaPolicy = parseJson(membership?.quotaPolicy, {});
    const tenantData = membership ? {
        id: membership.tenantId,
        status: membership.lifecycleState,
        membershipStatus: membership.membershipStatus,
        revision: membership.configRevision ?? membership.policyVersion,
        aiPolicy,
        quotaPolicy,
    } : null;

    const entitlement = resolveEffectiveEntitlement(userData, {
        userClaims: req.user || {},
        tenantData,
        quotaConfig,
    });

    if (!tenantData) {
        // P0-2: Ambiguous or unauthorized tenant resolution must fail closed.
        // It must NEVER drop down to personal/individual allowance.
        if (lookup.reason === 'AMBIGUOUS_ACTIVE_TENANT') {
            return {
                source: QUOTA_SOURCE.NONE,
                reason: lookup.reason,
                entitlement: null,
                tenant: null,
                quota: null,
                error: {
                    status: 400,
                    code: 'TENANT_CONTEXT_REQUIRED',
                    message: 'Multiple active tenant memberships found. Provide X-Tenant-Id header to select tenant context.',
                },
            };
        }
        if (lookup.reason === 'REQUESTED_TENANT_NOT_ELIGIBLE') {
            return {
                source: QUOTA_SOURCE.NONE,
                reason: lookup.reason,
                entitlement: null,
                tenant: null,
                quota: null,
                error: {
                    status: 403,
                    code: 'TENANT_ACCESS_DENIED',
                    message: 'Requested tenant membership is not active or accessible.',
                },
            };
        }

        // Rule B — individual resolution. An org membership that is absent or
        // invalid permits this; an org quota exhaustion (decided later, at
        // reservation time) never does.
        return {
            source: entitlement.dailyLimit > 0 ? QUOTA_SOURCE.INDIVIDUAL : QUOTA_SOURCE.NONE,
            reason: lookup.reason,
            entitlement,
            tenant: null,
            quota: {
                scope: QUOTA_SOURCE.INDIVIDUAL,
                sharedLimit: null,
                sharedScopeKey: null,
                userLimit: entitlement.dailyLimit,
            },
        };
    }

    // Rule A — organization-first. The tenant's daily AI budget is the SHARED
    // cap across every member; `aiPolicy.perUserDailyLimit` is the optional
    // per-user cap ("enforce both where configured").
    const sharedLimit = toPositiveInt(quotaPolicy.aiRequestsPerDay)
        || toPositiveInt(quotaConfig?.enterpriseDailyLimit)
        || DEFAULT_ENTERPRISE_DAILY_LIMIT;
    const userLimit = toPositiveInt(aiPolicy.perUserDailyLimit) ?? entitlement.dailyLimit;

    return {
        source: QUOTA_SOURCE.ORGANIZATION,
        reason: null,
        entitlement,
        tenant: {
            tenantId: membership.tenantId,
            workspaceId: membership.workspaceId || null,
            policyVersion: membership.policyVersion ?? null,
            configRevision: membership.configRevision ?? null,
        },
        quota: {
            scope: QUOTA_SOURCE.ORGANIZATION,
            sharedLimit,
            sharedScopeKey: String(membership.tenantId),
            userLimit,
        },
    };
}

/**
 * Express middleware. Installs `req.aiGovernance` BEFORE the AI quota gate so
 * the gate never has to guess at tenant context.
 *
 * FAIL CLOSED: if resolution throws, the request is refused rather than being
 * silently downgraded to an individual allowance.
 */
function aiGovernanceMiddleware() {
    return async function attachAiGovernance(req, res, next) {
        try {
            req.aiGovernance = await resolveAiGovernance(req);
            if (req.aiGovernance?.error) {
                return res.status(req.aiGovernance.error.status || 400).json({
                    error: {
                        code: req.aiGovernance.error.code,
                        message: req.aiGovernance.error.message,
                        requestId: res.locals?.requestId,
                    },
                });
            }
            return next();
        } catch (_error) {
            return res.status(503).json({
                error: {
                    code: 'AI_GOVERNANCE_UNAVAILABLE',
                    message: 'AI entitlement could not be resolved',
                    requestId: res.locals?.requestId,
                },
            });
        }
    };
}

module.exports = {
    QUOTA_SOURCE,
    DEFAULT_BASIC_DAILY_LIMIT,
    DEFAULT_ENTERPRISE_DAILY_LIMIT,
    loadApplicableTenantMembership,
    resolveAiGovernance,
    aiGovernanceMiddleware,
};
