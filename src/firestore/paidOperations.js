import { isPaidMembershipTier } from '../utils/subscriptionUtils.js';

/**
 * Resolves user membership & entitlement state.
 * Bridges personal B2C Pro subscriptions with B2B Enterprise tenant seats.
 *
 * MySQL (via the backend API) is the authoritative profile/membership store.
 * There is NO Firestore fallback: the API result is the source of truth and
 * API failure surfaces as a controlled Basic-membership default.
 */
function toMembershipView(data) {
    const memberships = Array.isArray(data.tenantMemberships) ? data.tenantMemberships : [];
    const activeTenant = memberships.find(t => String(t?.status || '').toUpperCase() === 'ACTIVE');
    const hasEnterpriseMembership = Boolean(activeTenant);
    const isB2CPremium = isPaidMembershipTier(data.membership);
    const isPremium = isB2CPremium || hasEnterpriseMembership || Boolean(data.isAdmin);
    const effectiveMembership = hasEnterpriseMembership ? 'Enterprise' : (data.membership || 'Basic');
    return {
        ...data,
        membership: isPremium ? (hasEnterpriseMembership ? 'Enterprise' : (data.membership || 'Premium')) : 'Basic',
        effectiveMembership,
        isPremium,
        hasEnterpriseMembership,
        activeTenantId: activeTenant?.tenantId || null,
    };
}

export async function getUserMembership(userId) {
    if (!userId) return false;

    // Authoritative API-first routing (MySQL primary)
    try {
        const { getUserProfile } = await import('../services/api/users.js');
        const data = await getUserProfile(userId);
        if (data) return toMembershipView(data);
    } catch (apiErr) {
        console.warn('[paidOperations] /api/users-data primary fetch failed:', apiErr.message);
    }

    return {
        membership: 'Basic',
        effectiveMembership: 'Basic',
        isPremium: false,
        hasEnterpriseMembership: false,
        activeTenantId: null
    };
}
