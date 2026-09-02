'use strict';

/**
 * Canonical domain normalization.
 *
 * Timestamp-like objects, MariaDB Date values, ISO strings, epoch
 * seconds/millis, and {seconds,nanoseconds} values MUST be converted here
 * before they reach business logic, API responses, or the React application.
 *
 * Canonical date contract: ISO-8601 UTC string or null.
 * Example: "2026-09-25T00:00:00.000Z"
 */

const crypto = require('crypto');

const PAID_MEMBERSHIP_TIERS = Object.freeze(['PREMIUM', 'PRO', 'ENTERPRISE']);
const MEMBERSHIP_TIERS = Object.freeze(['FREE', 'BASIC', 'PREMIUM', 'PRO', 'ENTERPRISE']);
const PAYMENT_STATUSES = Object.freeze([
    'NONE', 'INACTIVE', 'PENDING', 'ACTIVE', 'ADMIN_GRANTED',
    'CANCELLED', 'CANCELED', 'EXPIRED', 'REFUNDED', 'CHARGEBACK',
]);

const DATE_FIELD_NAMES = Object.freeze([
    'membershipEnds', 'membershipStarts', 'membership_ends', 'membership_starts',
    'createdAt', 'updatedAt', 'created_at', 'updated_at',
    'publishedAt', 'published_at', 'activatedAt', 'activated_at',
    'reversedAt', 'reversed_at', 'deletedAt', 'deleted_at',
    'lastPaymentDate', 'lastPaymentSync', 'lastWebhookSync',
    'expiresAt', 'expires_at', 'expiryDate', 'expiry_date',
    'scheduledAt', 'deadline', 'appliedAt', 'usedAt', 'used_at',
    'cancellationDate', 'reviewedAt', 'submittedAt',
    'lastLoginAt', 'verifiedAt', 'consumedAt',
]);

function isPlainObject(value) {
    if (value === null || typeof value !== 'object') return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

/**
 * Convert any supported date representation to milliseconds since epoch,
 * or null if absent/invalid. Never throws.
 */
function toEpochMs(value) {
    if (value === null || value === undefined || value === '') return null;
    if (value === false) return null;

    try {
        if (typeof value?.toDate === 'function') {
            const d = value.toDate();
            const ms = d instanceof Date ? d.getTime() : Number.NaN;
            return Number.isFinite(ms) ? ms : null;
        }
        if (typeof value?.toMillis === 'function') {
            const ms = Number(value.toMillis());
            return Number.isFinite(ms) ? ms : null;
        }
        if (value instanceof Date) {
            const ms = value.getTime();
            return Number.isFinite(ms) ? ms : null;
        }
        if (typeof value === 'number') {
            if (!Number.isFinite(value) || value === 0) return value === 0 ? null : null;
            // Unix seconds (~1e9) vs milliseconds (~1e12).
            if (Math.abs(value) >= 1e12) return Math.trunc(value);
            if (Math.abs(value) >= 1e9) return Math.trunc(value * 1000);
            return Math.trunc(value);
        }
        if (typeof value === 'bigint') {
            return toEpochMs(Number(value));
        }
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (!trimmed || trimmed === '0' || trimmed === 'null' || trimmed === 'undefined') return null;
            if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
                return toEpochMs(Number(trimmed));
            }
            const parsed = Date.parse(trimmed);
            return Number.isFinite(parsed) ? parsed : null;
        }
        if (typeof value === 'object') {
            const seconds = value.seconds ?? value._seconds ?? value.Seconds;
            const nanos = value.nanoseconds ?? value._nanoseconds ?? value.nanoseconds ?? 0;
            if (seconds !== undefined && seconds !== null) {
                const sec = Number(seconds);
                const nano = Number(nanos) || 0;
                if (!Number.isFinite(sec)) return null;
                const ms = sec * 1000 + Math.trunc(nano / 1e6);
                return Number.isFinite(ms) ? ms : null;
            }
            if (value.$date) return toEpochMs(value.$date);
            if (value.iso) return toEpochMs(value.iso);
        }
    } catch {
        return null;
    }
    return null;
}

function toCanonicalDate(value) {
    const ms = toEpochMs(value);
    if (ms === null) return null;
    try {
        return new Date(ms).toISOString();
    } catch {
        return null;
    }
}

function toCanonicalDateObject(value) {
    const ms = toEpochMs(value);
    if (ms === null) return null;
    const d = new Date(ms);
    return Number.isFinite(d.getTime()) ? d : null;
}

function toCanonicalBoolean(value, defaultValue = false) {
    if (value === null || value === undefined) return defaultValue;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
        const v = value.trim().toLowerCase();
        if (['1', 'true', 'yes', 'on'].includes(v)) return true;
        if (['0', 'false', 'no', 'off', ''].includes(v)) return false;
    }
    return Boolean(value);
}

function toCanonicalNumber(value, fallback = null) {
    if (value === null || value === undefined || value === '') return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function toCanonicalId(value) {
    if (value === null || value === undefined) return null;
    const id = String(value).trim();
    return id ? id : null;
}

function toCanonicalMembership(value) {
    const raw = String(value || 'Basic').trim();
    if (!raw) return 'Basic';
    const upper = raw.toUpperCase();
    if (upper === 'FREE' || upper === 'BASIC') return 'Basic';
    if (upper === 'PREMIUM' || upper.includes('PREMIUM')) return 'Premium';
    if (upper === 'PRO' || upper.includes('PRO')) return 'Pro';
    if (upper === 'ENTERPRISE' || upper.includes('ENTERPRISE') || upper === 'ENT') return 'Enterprise';
    if (upper === 'ADMIN' || upper === 'SUPER_ADMIN') return raw;
    return raw;
}

function isPaidMembershipTier(membership) {
    const upper = String(membership || '').trim().toUpperCase();
    return PAID_MEMBERSHIP_TIERS.includes(upper)
        || upper.includes('PREMIUM')
        || upper.includes('ENTERPRISE')
        || upper === 'ENT'
        || (upper.includes('PRO') && !upper.includes('PROFILE'));
}

function toCanonicalPaymentStatus(value) {
    const raw = String(value || 'INACTIVE').trim().toUpperCase();
    if (PAYMENT_STATUSES.includes(raw)) return raw === 'CANCELED' ? 'CANCELLED' : raw;
    if (raw === 'PAID' || raw === 'SUCCESS' || raw === 'COMPLETED') return 'ACTIVE';
    return raw || 'INACTIVE';
}

function createMutationId(prefix = 'sync') {
    const time = Date.now().toString(36);
    const rand = crypto.randomBytes(8).toString('hex');
    return `${prefix}_${time}_${rand}`;
}

function isTimestampLike(value) {
    if (!value || typeof value !== 'object') return false;
    if (typeof value.toDate === 'function' || typeof value.toMillis === 'function') return true;
    return value.seconds !== undefined || value._seconds !== undefined;
}

function canonicalizeValue(value, fieldName = '') {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (DATE_FIELD_NAMES.includes(fieldName) || isTimestampLike(value)) {
        const iso = toCanonicalDate(value);
        if (iso !== null) return iso;
        if (DATE_FIELD_NAMES.includes(fieldName)) return null;
    }
    if (Array.isArray(value)) {
        return value.map((item) => canonicalizeValue(item, ''));
    }
    if (isPlainObject(value)) {
        const out = {};
        for (const [k, v] of Object.entries(value)) {
            if (k === '__dbMeta' || k === '_meta') continue;
            const next = canonicalizeValue(v, k);
            if (next !== undefined) out[k] = next;
        }
        return out;
    }
    return value;
}

function canonicalizeRecord(record, extraDateFields = []) {
    if (record === null || record === undefined) return record;
    if (Array.isArray(record)) {
        return record.map((item) => canonicalizeRecord(item, extraDateFields));
    }
    if (typeof record !== 'object') return record;
    const extra = new Set(extraDateFields);
    const out = {};
    for (const [k, v] of Object.entries(record)) {
        if (k === '__dbMeta' || k === '_meta') continue;
        if (extra.has(k) || DATE_FIELD_NAMES.includes(k) || isTimestampLike(v)) {
            out[k] = toCanonicalDate(v);
        } else {
            out[k] = canonicalizeValue(v, k);
        }
    }
    return out;
}

function withDatabaseMetadata(record, meta) {
    if (record === null || record === undefined) return record;
    if (Array.isArray(record)) {
        return record.map((item) => withDatabaseMetadata(item, meta));
    }
    if (typeof record !== 'object') return record;
    Object.defineProperty(record, '__dbMeta', {
        value: Object.freeze({
            dataSource: meta.dataSource || 'unknown',
            dataVersion: meta.dataVersion ?? null,
            readAt: meta.readAt || null,
        }),
        enumerable: false,
        configurable: true,
        writable: false,
    });
    return record;
}

function stripInternalMeta(record) {
    if (!record || typeof record !== 'object') return record;
    if (Array.isArray(record)) return record.map(stripInternalMeta);
    const copy = { ...record };
    delete copy.__dbMeta;
    delete copy._meta;
    return copy;
}

module.exports = {
    PAID_MEMBERSHIP_TIERS,
    MEMBERSHIP_TIERS,
    PAYMENT_STATUSES,
    DATE_FIELD_NAMES,
    toEpochMs,
    toCanonicalDate,
    toCanonicalDateObject,
    toCanonicalBoolean,
    toCanonicalNumber,
    toCanonicalId,
    toCanonicalMembership,
    toCanonicalPaymentStatus,
    isPaidMembershipTier,
    createMutationId,
    isTimestampLike,
    canonicalizeValue,
    canonicalizeRecord,
    withDatabaseMetadata,
    stripInternalMeta,
};
