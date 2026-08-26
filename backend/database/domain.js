'use strict';

/**
 * Canonical domain mappers. Both MariaDB and Firestore adapters produce
 * these shapes so the API never leaks engine-specific types.
 */

const {
    toCanonicalDate,
    toCanonicalBoolean,
    toCanonicalNumber,
    toCanonicalMembership,
    toCanonicalPaymentStatus,
    canonicalizeRecord,
    isPaidMembershipTier,
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

function isMembershipActive(user, now = Date.now()) {
    if (!user) return false;
    if (!isPaidMembershipTier(user.membership)) return false;
    const status = String(user.paymentStatus || '').toUpperCase();
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
