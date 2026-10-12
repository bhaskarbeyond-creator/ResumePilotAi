'use strict';

const { toCanonicalDateObject, isPaidMembershipTier, toCanonicalMembership } = require('../database/canonical');
const { isMembershipActive } = require('../database/domain');

/**
 * Unified Entitlement & Plan Harmonization Engine
 * 
 * Bridges B2C consumer subscriptions (Basic, Premium) with B2B Enterprise
 * multi-tenant memberships (Enterprise Standard, Growth, Scale, Custom SLA).
 * 
 * Guarantees zero false negatives:
 * 1. Admin/SuperAdmin -> Full administrative access & elevated quota (10,000/day).
 * 2. Enterprise Tenant Member -> Inherits Enterprise tier, unrestricted DOCX/PDF export, 
 *    51 unlocked templates, and tenant-configured daily AI quota (e.g. 5,000-50,000/day).
 * 3. B2C Pro/Premium Subscriber -> Pro tier, 100 requests/day, unrestricted DOCX/PDF export.
 * 4. Basic / Free User -> Basic tier, 10 requests/day, standard templates.
 */

function isUserAdmin(userData = {}, userClaims = {}) {
  const claims = userClaims?.claims && typeof userClaims.claims === 'object'
    ? userClaims.claims
    : userClaims;
  const role = String(claims?.role || userData?.role || '').toUpperCase();
  return Boolean(claims?.admin === true || claims?.superAdmin === true || role === 'ADMIN' || role === 'SUPER_ADMIN');
}

function resolveActiveTenantMembership(_userData = {}) {
  // Enterprise membership is resolved by the MariaDB tenant registry and must
  // be supplied as validated tenantData/context, never inferred from profile JSON.
  return null;
}

/**
 * DIR-106 / P0-3 — an organization entitlement only counts when it is VALID.
 *
 * Rule A: "Suspended, expired, disabled, or otherwise invalid organizational
 * entitlements must not grant access."
 *
 * FAIL-CLOSED ON EXPLICIT INVALIDITY: a tenant/membership state that is present
 * and not ACTIVE denies the organizational entitlement outright. A state that is
 * absent is tolerated so that legacy callers which pass a bare `{ id }` tenant
 * object keep working; the authoritative path (`security/aiGovernance.js`)
 * always supplies both fields from MariaDB, so real requests are always checked.
 */
const ACTIVE_TENANT_STATES = new Set(['ACTIVE']);
const ACTIVE_MEMBERSHIP_STATES = new Set(['ACTIVE']);

function isTenantEntitlementValid(tenantData = {}) {
  if (!tenantData) return false;
  const tenantState = String(tenantData.status ?? tenantData.lifecycleState ?? '').toUpperCase();
  if (tenantState && !ACTIVE_TENANT_STATES.has(tenantState)) return false;
  const membershipState = String(tenantData.membershipStatus ?? tenantData.membershipState ?? '').toUpperCase();
  if (membershipState && !ACTIVE_MEMBERSHIP_STATES.has(membershipState)) return false;
  if (tenantData.decommissionedAt) return false;
  return true;
}

/**
 * Resolves the effective capability tier for a user.
 * 
 * @param {Object} userData - Stored user profile document from `users/{uid}`
 * @param {Object} options
 * @param {Object} [options.userClaims] - Decoded Firebase JWT claims
 * @param {Object} [options.tenantData] - Enterprise tenant document if in tenant context
 * @param {Object} [options.quotaConfig] - Global quota limits config from `settings/ai_quota`
 * @returns {Object} Normalized entitlement descriptor
 */
function resolveEffectiveEntitlement(userData = {}, { userClaims = {}, tenantData = null, quotaConfig = {} } = {}) {
  const admin = isUserAdmin(userData, userClaims);
  const activeTenantMembership = null;
  // DIR-106 / P0-3: an organization entitlement is only recognized when the
  // tenant is live and the membership is active. Invalid membership grants
  // nothing and falls through to individual resolution (Rule A + Rule B).
  const isEnterprise = Boolean(tenantData) && isTenantEntitlementValid(tenantData);
  
  // B2C consumer subscription state is owned by MariaDB billing/profile data.
  // Enterprise rights are never inferred from this string; they require a
  // validated MariaDB tenant context.
  const membership = toCanonicalMembership(userData?.membership || 'Basic');
  const isPremiumB2C = ['Premium', 'Pro'].includes(membership);
  const membershipEnd = toCanonicalDateObject(userData?.membershipEnds);
  const paymentOk = ['ACTIVE', 'ADMIN_GRANTED', 'PAID', 'SUCCESS', 'COMPLETED', 'CANCELLED', 'CANCELED'].includes(
    String(userData?.paymentStatus || '').toUpperCase()
  ) || !userData?.paymentStatus;
  const isB2CSubActive = isMembershipActive({
    membership,
    paymentStatus: userData?.paymentStatus,
    membershipEnds: userData?.membershipEnds,
  }) || (isPremiumB2C && paymentOk && membershipEnd && membershipEnd > new Date());

  // Determine Effective Capability Tier
  let effectiveTier = 'Basic';
  let dailyLimit = Number(quotaConfig?.basicDailyLimit || process.env.AI_BASIC_DAILY_LIMIT || 10);
  let allowsDocxExport = false;
  let allowsAllTemplates = false;
  let removesWatermark = false;

  if (admin && (membership === 'Admin' || isB2CSubActive || isEnterprise)) {
    effectiveTier = 'Admin';
    dailyLimit = Number(quotaConfig?.adminDailyLimit || process.env.AI_ADMIN_DAILY_LIMIT || 10000);
    allowsDocxExport = true;
    allowsAllTemplates = true;
    removesWatermark = true;
  } else if (isEnterprise) {
    effectiveTier = 'Enterprise';
    // DIR-106 / P1-1: the tenant's configured limit is authoritative. The former
    // `Math.max(1000, ...)` floor silently overrode a tenant configured for less
    // than 1000/day, contradicting "governed by that organization's assigned
    // configuration" (Rule A). Only a genuinely unusable value falls back.
    const tenantDailyLimit = Number(
      tenantData?.aiPolicy?.dailyLimit ||
      tenantData?.aiPolicy?.perUserDailyLimit ||
      tenantData?.quotaPolicy?.aiRequestsPerDay ||
      quotaConfig?.enterpriseDailyLimit ||
      5000
    );
    dailyLimit = Number.isFinite(tenantDailyLimit) && tenantDailyLimit > 0
      ? Math.floor(tenantDailyLimit)
      : 5000;
    allowsDocxExport = true;
    allowsAllTemplates = true;
    removesWatermark = true;
  } else if (isB2CSubActive || (isPremiumB2C && !userData.membershipEnds)) {
    effectiveTier = membership === 'Enterprise' ? 'Enterprise' : (membership === 'Pro' ? 'Premium' : 'Premium');
    dailyLimit = Number(quotaConfig?.premiumDailyLimit || process.env.AI_PREMIUM_DAILY_LIMIT || 100);
    allowsDocxExport = true;
    allowsAllTemplates = true;
    removesWatermark = true;
  } else if (admin) {
    // Admin role without active paid candidate subscription (e.g. SUPER_ADMIN + Basic + INACTIVE):
    // Role grants administrative console privileges (isAdmin: true), but candidate resume features
    // and candidate AI quota behave strictly according to paid entitlement (Basic tier, Rule C).
    effectiveTier = 'Basic';
    dailyLimit = Number(quotaConfig?.basicDailyLimit || process.env.AI_BASIC_DAILY_LIMIT || 10);
    allowsDocxExport = false;
    allowsAllTemplates = false;
    removesWatermark = false;
  }

  // DIR-106 / P1-2: a personal per-user override must never widen or narrow an
  // organization's configured allowance — the organization governs its members.
  if (userData?.aiQuotaOverride && !isEnterprise) {
    const override = userData.aiQuotaOverride;
    const expiresAt = override.expiresAt ? new Date(override.expiresAt).getTime() : Infinity;
    if (expiresAt > Date.now() && Number.isFinite(Number(override.dailyLimit))) {
      dailyLimit = Number(override.dailyLimit);
    }
  }

  return {
    effectiveTier,
    isAdmin: admin,
    isEnterprise,
    isPremium: effectiveTier !== 'Basic',
    dailyLimit,
    allowsDocxExport,
    allowsAllTemplates,
    removesWatermark,
    activeTenantMembership,
    tenantId: activeTenantMembership?.tenantId || tenantData?.id || null,
  };
}

module.exports = {
  isUserAdmin,
  isTenantEntitlementValid,
  resolveActiveTenantMembership,
  resolveEffectiveEntitlement,
  isPaidMembershipTier,
};
