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

function isUserAdmin(_userData = {}, userClaims = {}) {
  const claims = userClaims?.claims && typeof userClaims.claims === 'object'
    ? userClaims.claims
    : userClaims;
  const role = String(claims?.role || '').toUpperCase();
  return Boolean(claims?.admin === true || claims?.superAdmin === true || role === 'ADMIN' || role === 'SUPER_ADMIN');
}

function resolveActiveTenantMembership(_userData = {}) {
  // Enterprise membership is resolved by the MariaDB tenant registry and must
  // be supplied as validated tenantData/context, never inferred from profile JSON.
  return null;
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
  const isEnterprise = Boolean(tenantData);
  
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

  if (admin) {
    effectiveTier = 'Admin';
    dailyLimit = Number(quotaConfig?.adminDailyLimit || process.env.AI_ADMIN_DAILY_LIMIT || 10000);
    allowsDocxExport = true;
    allowsAllTemplates = true;
    removesWatermark = true;
  } else if (isEnterprise) {
    effectiveTier = 'Enterprise';
    // Use tenant-specific daily limit if available, otherwise default to enterprise baseline (5,000)
    const tenantDailyLimit = Number(
      tenantData?.aiPolicy?.dailyLimit ||
      tenantData?.quotaPolicy?.aiRequestsPerDay ||
      quotaConfig?.enterpriseDailyLimit ||
      5000
    );
    dailyLimit = Math.max(1000, tenantDailyLimit);
    allowsDocxExport = true;
    allowsAllTemplates = true;
    removesWatermark = true;
  } else if (isB2CSubActive || (isPremiumB2C && !userData.membershipEnds)) {
    effectiveTier = membership === 'Enterprise' ? 'Enterprise' : (membership === 'Pro' ? 'Premium' : 'Premium');
    dailyLimit = Number(quotaConfig?.premiumDailyLimit || process.env.AI_PREMIUM_DAILY_LIMIT || 100);
    allowsDocxExport = true;
    allowsAllTemplates = true;
    removesWatermark = true;
  }

  // Account for manual single-user AI quota override if configured
  if (userData?.aiQuotaOverride) {
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
  resolveActiveTenantMembership,
  resolveEffectiveEntitlement,
  isPaidMembershipTier,
};
