import fire from '../conf/fire';

/**
 * Resolves user membership & entitlement state.
 * Bridges personal B2C Pro subscriptions with B2B Enterprise tenant seats.
 */
export async function getUserMembership(userId) {
    if (!userId) return false;

    // 1. Authoritative API-first routing (MariaDB primary)
    try {
        const { getUserProfile } = await import('../services/api/users.js');
        const data = await getUserProfile(userId);
        if (data) {
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
        }
    } catch (apiErr) {
        console.warn('[paidOperations] /api/users-data primary fetch bypassed, attempting direct DB:', apiErr.message);
    }

    // 2. Direct Firestore fallback for offline/isolated environments
    try {
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
        }
        return false;
    } catch (err) {
        console.warn('Non-fatal error checking membership in Firestore:', err.message);
        return {
            membership: 'Basic',
            effectiveMembership: 'Basic',
            isPremium: false,
            hasEnterpriseMembership: false,
            activeTenantId: null
        };
    }
} 