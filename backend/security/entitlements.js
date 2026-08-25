'use strict';

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

const ADMIN_EMAILS = Object.freeze([
  'admin@airesume.guru',
  'bhaskarbeyond@gmail.com',
]);

function isUserAdmin(userData = {}, userClaims = {}) {
  const email = String(userClaims?.email || userData?.email || '').trim().toLowerCase();
  const role = String(userClaims?.role || userData?.role || '').toUpperCase();
  const membership = String(userData?.membership || '').toUpperCase();
  return Boolean(
    userClaims?.admin ||
    userClaims?.superAdmin ||
    role === 'ADMIN' ||
    role === 'SUPER_ADMIN' ||
    userData?.isAdmin ||
    membership === 'ADMIN' ||
    ADMIN_EMAILS.includes(email)
  );
}

function resolveActiveTenantMembership(userData = {}) {
  const memberships = Array.isArray(userData?.tenantMemberships) ? userData.tenantMemberships : [];
  return memberships.find(item => {
    const status = String(item?.status || '').toUpperCase();
    return status === 'ACTIVE';
  }) || null;
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
  const activeTenantMembership = resolveActiveTenantMembership(userData);
  const isEnterprise = Boolean(activeTenantMembership || tenantData);
  
  // B2C Consumer Subscription Check
  const membership = String(userData?.membership || 'Basic');
  const isPremiumB2C = membership.toUpperCase() === 'PREMIUM';
  const membershipEnd = userData?.membershipEnds?.toDate?.() || new Date(userData?.membershipEnds || 0);
  const isB2CSubActive = isPremiumB2C && 
    ['ACTIVE', 'ADMIN_GRANTED'].includes(userData?.paymentStatus) && 
    (Number.isFinite(membershipEnd.getTime()) && membershipEnd > new Date());

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
    effectiveTier = 'Premium';
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
};
