'use strict';

/**
 * Canonical MariaDB domain mappers. These shapes prevent database-driver
 * representations from leaking through the API.
 */

const {
    toCanonicalDate,
    toCanonicalBoolean,
    toCanonicalNumber,
    toCanonicalMembership,
    toCanonicalPaymentStatus,
    canonicalizeRecord,
    isPaidMembershipTier,
    isWithinPaymentGrace,
    toEpochMs,
} = require('./canonical');

function toCanonicalUser(raw) {
    if (!raw) return null;
    const record = canonicalizeRecord(raw);
    const id = String(raw.id || raw.userId || raw.uid || '');
    const membership = toCanonicalMembership(raw.membership);
    const membershipEnds = toCanonicalDate(raw.membershipEnds || raw.membership_ends);
    const paymentStatus = toCanonicalPaymentStatus(raw.paymentStatus || raw.payment_status);
    return {
        ...record,
        id,
        userId: id,
        email: raw.email || record.email || '',
        firstname: raw.firstname || record.firstname || '',
        lastname: raw.lastname || record.lastname || '',
        displayName: raw.displayName || record.displayName || `${raw.firstname || ''} ${raw.lastname || ''}`.trim(),
        membership,
        membershipEnds,
        paymentStatus,
        // DIR-022 / INV-5: the renewal recovery window is part of the canonical
        // user shape, so every entitlement gate and the client banner read the
        // SAME authoritative deadline rather than each inventing its own.
        paymentGraceUntil: toCanonicalDate(raw.paymentGraceUntil || raw.payment_grace_until),
        paymentGraceStartedAt: toCanonicalDate(raw.paymentGraceStartedAt || raw.payment_grace_started_at),
        renewalFailedAt: toCanonicalDate(raw.renewalFailedAt || raw.renewal_failed_at),
        role: String(raw.role || record.role || 'USER').toUpperCase(),
        suspended: toCanonicalBoolean(raw.suspended, false),
        cancellationRequested: toCanonicalBoolean(raw.cancellationRequested, false),
        autoRenew: raw.autoRenew === undefined ? undefined : toCanonicalBoolean(raw.autoRenew, true),
        revision: toCanonicalNumber(raw.revision ?? record.revision, 1),
        createdAt: toCanonicalDate(raw.createdAt || raw.created_at),
        updatedAt: toCanonicalDate(raw.updatedAt || raw.updated_at),
        deletedAt: toCanonicalDate(raw.deletedAt || raw.deleted_at),
    };
}

/**
 * INV-5 (DIR-022): the single entitlement gate.
 *
 * A PAST_DUE account whose recovery window is still open is ENTITLED, because a
 * gateway that declined a renewal is not evidence that the customer stopped
 * paying — it is evidence that the gateway hiccuped. Revoking access the moment
 * a renewal is retried is the false-positive lockout this directive exists to
 * prevent.
 *
 * Every gate (`/api/check`, the PDF export wall, admin entitlement projection)
 * MUST call this function rather than re-deriving an `['ACTIVE', ...]` list, so
 * there is exactly one definition of "entitled" in the codebase.
 */
function isMembershipActive(user, now = Date.now()) {
    if (!user) return false;
    if (!isPaidMembershipTier(user.membership)) return false;
    const status = String(user.paymentStatus || '').toUpperCase();

    // Renewal recovery window wins over every other consideration: a PAST_DUE
    // account inside its grace period keeps full entitlements.
    if (status === 'PAST_DUE') {
        return isWithinPaymentGrace(user, now);
    }

    if (status && !['ACTIVE', 'ADMIN_GRANTED', 'PAID', 'SUCCESS', 'COMPLETED', ''].includes(status) && !['NONE', 'INACTIVE'].includes(status)) {
        if (['REFUNDED', 'CHARGEBACK', 'EXPIRED', 'CANCELLED', 'CANCELED'].includes(status)) {
            const ends = toEpochMs(user.membershipEnds);
            if (ends !== null && ends > now) {
                // Cancelled-but-paid-through-term remains entitled until expiry.
                if (status === 'CANCELLED' || status === 'CANCELED') return true;
            }
            if (['REFUNDED', 'CHARGEBACK', 'EXPIRED'].includes(status)) return false;
        }
    }
    if (!user.membershipEnds) return isPaidMembershipTier(user.membership);
    const ends = toEpochMs(user.membershipEnds);
    if (ends === null) return isPaidMembershipTier(user.membership);
    return ends > now;
}

function toCanonicalResume(raw) {
    if (!raw) return null;
    const record = canonicalizeRecord(raw);
    return {
        ...record,
        id: String(raw.id || record.id || ''),
        user_id: raw.user_id || raw.userId || record.user_id || null,
        revision: toCanonicalNumber(raw.revision ?? record.revision, 1),
        createdAt: toCanonicalDate(raw.createdAt || raw.created_at),
        updatedAt: toCanonicalDate(raw.updatedAt || raw.updated_at),
        created_at: toCanonicalDate(raw.created_at || raw.createdAt),
        deletedAt: toCanonicalDate(raw.deletedAt || raw.deleted_at),
        showPhoto: toCanonicalBoolean(raw.showPhoto, true),
    };
}

function toCanonicalList(mapper, rows) {
    if (!Array.isArray(rows)) return [];
    return rows.map(mapper).filter(Boolean);
}

module.exports = {
    toCanonicalUser,
    toCanonicalResume,
    isMembershipActive,
    toCanonicalList,
};
