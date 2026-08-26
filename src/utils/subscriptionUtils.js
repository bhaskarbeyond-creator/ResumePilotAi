/**
 * Unified Subscription & Membership Helper Utilities
 * Standardizes global subscription switch handling, user membership,
 * expiration dates, and access control across all components.
 */

/**
 * Checks if global subscriptions are disabled (Free Mode enabled globally).
 * Handles boolean, object with .state, object with .enabled, or undefined/null.
 */
export const isGlobalSubscriptionDisabled = (subscriptionsStatus) => {
    if (subscriptionsStatus === null || subscriptionsStatus === undefined) {
        return false; // Default to paywall active if pending load to be safe
    }
    if (typeof subscriptionsStatus === 'boolean') {
        return subscriptionsStatus === false;
    }
    if (typeof subscriptionsStatus === 'object') {
        if (subscriptionsStatus.state === false || subscriptionsStatus.enabled === false) {
            return true;
        }
    }
    return false;
};

/**
 * Safely parses any date representation (Firestore Timestamp, ISO string, epoch ms, Date object, {seconds}).
 * Returns null if invalid or absent.
 */
export const parseSafeDate = (val) => {
    if (!val) return null;
    if (typeof val?.toDate === 'function') {
        try {
            return val.toDate();
        } catch {
            return null;
        }
    }
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
    if (typeof val === 'number') {
        const d = new Date(val);
        return isNaN(d.getTime()) ? null : d;
    }
    if (typeof val === 'string') {
        const d = new Date(val);
        return isNaN(d.getTime()) ? null : d;
    }
    if (val.seconds !== undefined) {
        const d = new Date(val.seconds * 1000);
        return isNaN(d.getTime()) ? null : d;
    }
    if (val._seconds !== undefined) {
        const d = new Date(val._seconds * 1000);
        return isNaN(d.getTime()) ? null : d;
    }
    try {
        const d = new Date(val);
        return isNaN(d.getTime()) ? null : d;
    } catch {
        return null;
    }
};

/**
 * Checks if a user has an active Premium or Enterprise membership.
 * Verifies both the membership string AND expiration date if present.
 */
export const isUserPremium = (membership, membershipEnds) => {
    const tier = String(membership || '').trim();
    if (tier !== 'Premium' && tier !== 'Enterprise' && tier !== 'Pro') {
        return false;
    }
    if (membershipEnds) {
        const endDate = parseSafeDate(membershipEnds);
        if (endDate && !isNaN(endDate.getTime()) && endDate < new Date()) {
            return false; // Subscription expired
        }
    }
    return true;
};

/**
 * Evaluates whether a download/export action should be allowed for a user.
 * Returns { allowed: boolean, reason: 'FREE_MODE' | 'PREMIUM_USER' | 'LOGIN_REQUIRED' | 'PREMIUM_REQUIRED' }
 */
export const evaluateDownloadAccess = ({ user, membership, membershipEnds, subscriptionsStatus, isStatusLoaded }) => {
    // 1. If global subscriptions are disabled, allow free download for everyone
    if (isGlobalSubscriptionDisabled(subscriptionsStatus)) {
        return { allowed: true, reason: 'FREE_MODE' };
    }

    // 2. If user is not logged in, require login first
    if (!user) {
        return { allowed: false, reason: 'LOGIN_REQUIRED' };
    }

    // 3. If user is Premium with active expiration date, allow download
    if (isUserPremium(membership, membershipEnds)) {
        return { allowed: true, reason: 'PREMIUM_USER' };
    }

    // 4. Otherwise, user is basic/expired and paywall is active
    return { allowed: false, reason: 'PREMIUM_REQUIRED' };
};
