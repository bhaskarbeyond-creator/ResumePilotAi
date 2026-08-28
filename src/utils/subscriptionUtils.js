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
 * Convert any supported date representation to epoch milliseconds, or null.
 * Handles timestamp-like objects, Date, ISO/RFC strings, unix seconds, unix ms,
 * {seconds,nanoseconds}, {_seconds,_nanoseconds}, null, undefined, and invalid values.
 * Never throws.
 */
export const toEpochMs = (val) => {
    if (val === null || val === undefined || val === '' || val === false) return null;
    try {
        if (typeof val?.toDate === 'function') {
            const d = val.toDate();
            const ms = d instanceof Date ? d.getTime() : NaN;
            return Number.isFinite(ms) ? ms : null;
        }
        if (typeof val?.toMillis === 'function') {
            const ms = Number(val.toMillis());
            return Number.isFinite(ms) ? ms : null;
        }
        if (val instanceof Date) {
            const ms = val.getTime();
            return Number.isFinite(ms) ? ms : null;
        }
        if (typeof val === 'number') {
            if (!Number.isFinite(val) || val === 0) return null;
            if (Math.abs(val) >= 1e12) return Math.trunc(val);
            if (Math.abs(val) >= 1e9) return Math.trunc(val * 1000);
            return Math.trunc(val);
        }
        if (typeof val === 'string') {
            const trimmed = val.trim();
            if (!trimmed || trimmed === '0' || trimmed === 'null') return null;
            if (/^-?\d+(\.\d+)?$/.test(trimmed)) return toEpochMs(Number(trimmed));
            const parsed = Date.parse(trimmed);
            return Number.isFinite(parsed) ? parsed : null;
        }
        if (typeof val === 'object') {
            const seconds = val.seconds ?? val._seconds;
            const nanos = val.nanoseconds ?? val._nanoseconds ?? 0;
            if (seconds !== undefined && seconds !== null) {
                const sec = Number(seconds);
                if (!Number.isFinite(sec)) return null;
                return sec * 1000 + Math.trunc((Number(nanos) || 0) / 1e6);
            }
        }
    } catch {
        return null;
    }
    return null;
};

/**
 * Safely parses any date representation into a JavaScript Date, or null.
 */
export const parseSafeDate = (val) => {
    const ms = toEpochMs(val);
    if (ms === null) return null;
    const d = new Date(ms);
    return Number.isFinite(d.getTime()) ? d : null;
};

/** Canonical ISO-8601 UTC string, or null. */
export const toCanonicalDate = (val) => {
    const d = parseSafeDate(val);
    return d ? d.toISOString() : null;
};

/** Locale-formatted date that never throws. */
export const formatSafeDate = (val, locales = 'en-US', options = undefined) => {
    const d = parseSafeDate(val);
    if (!d) return '';
    try {
        return d.toLocaleDateString(locales, options);
    } catch {
        return d.toISOString();
    }
};

export const PAID_MEMBERSHIP_TIERS = ['Premium', 'Pro', 'Enterprise'];

export const isPaidMembershipTier = (membership) => {
    const upper = String(membership || '').trim().toUpperCase();
    return upper === 'PREMIUM' || upper === 'PRO' || upper === 'ENTERPRISE'
        || upper.includes('PREMIUM') || upper.includes('ENTERPRISE')
        || (upper.includes('PRO') && !upper.includes('PROFILE'));
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
export const evaluateDownloadAccess = ({ user, membership, membershipEnds, subscriptionsStatus, _isStatusLoaded }) => {
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
