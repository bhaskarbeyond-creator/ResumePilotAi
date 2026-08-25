import fire from '../conf/fire';

/**
 * Resolves user membership & entitlement state.
 * Bridges personal B2C Pro subscriptions with B2B Enterprise tenant seats.
 */
export async function getUserMembership(userId) {
    if (!userId) return false;
    const db = fire.firestore();
    const usersRef = db.collection("users").doc(userId);
    const snapshot = await usersRef.get();
    if (snapshot.exists) {
        const data = snapshot.data() || {};
        const memberships = Array.isArray(data.tenantMemberships) ? data.tenantMemberships : [];
        const activeTenant = memberships.find(t => String(t?.status || '').toUpperCase() === 'ACTIVE');
        const hasEnterpriseMembership = Boolean(activeTenant);
        
        const isB2CPremium = String(data.membership || '').toUpperCase() === 'PREMIUM';
        const isPremium = isB2CPremium || hasEnterpriseMembership || Boolean(data.isAdmin);
        const effectiveMembership = hasEnterpriseMembership ? 'Enterprise' : (data.membership || 'Basic');

        return {
            ...data,
            membership: isPremium ? (hasEnterpriseMembership ? 'Enterprise' : 'Premium') : 'Basic',
            effectiveMembership,
            isPremium,
            hasEnterpriseMembership,
            activeTenantId: activeTenant?.tenantId || null,
        };
    } else {
        return false;
    }
} 