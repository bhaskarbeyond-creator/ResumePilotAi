'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    toEpochMs,
    toCanonicalDate,
    toCanonicalDateObject,
    toCanonicalBoolean,
    toCanonicalMembership,
    isPaidMembershipTier,
    canonicalizeRecord,
    createMutationId,
} = require('../database/canonical');
const { toCanonicalUser, isMembershipActive } = require('../database/domain');

const FUTURE_ISO = '2026-09-25T00:00:00.000Z';
const FUTURE_MS = Date.parse(FUTURE_ISO);
const FUTURE_SEC = Math.floor(FUTURE_MS / 1000);

test('canonical dates: Firestore Timestamp-like toDate()', () => {
    const ts = { toDate: () => new Date(FUTURE_ISO) };
    assert.equal(toCanonicalDate(ts), FUTURE_ISO);
});

test('canonical dates: toMillis()', () => {
    const ts = { toMillis: () => FUTURE_MS };
    assert.equal(toCanonicalDate(ts), FUTURE_ISO);
});

test('canonical dates: JavaScript Date', () => {
    assert.equal(toCanonicalDate(new Date(FUTURE_ISO)), FUTURE_ISO);
});

test('canonical dates: ISO string', () => {
    assert.equal(toCanonicalDate(FUTURE_ISO), FUTURE_ISO);
});

test('canonical dates: RFC 2822', () => {
    const rfc = 'Fri, 25 Sep 2026 00:00:00 GMT';
    assert.equal(toCanonicalDate(rfc), FUTURE_ISO);
});

test('canonical dates: epoch milliseconds', () => {
    assert.equal(toCanonicalDate(FUTURE_MS), FUTURE_ISO);
});

test('canonical dates: epoch seconds', () => {
    assert.equal(toCanonicalDate(FUTURE_SEC), FUTURE_ISO);
});

test('canonical dates: {seconds, nanoseconds}', () => {
    assert.equal(toCanonicalDate({ seconds: FUTURE_SEC, nanoseconds: 0 }), FUTURE_ISO);
});

test('canonical dates: {_seconds, _nanoseconds}', () => {
    assert.equal(toCanonicalDate({ _seconds: FUTURE_SEC, _nanoseconds: 0 }), FUTURE_ISO);
});

test('canonical dates: null/undefined/invalid never throw', () => {
    assert.equal(toCanonicalDate(null), null);
    assert.equal(toCanonicalDate(undefined), null);
    assert.equal(toCanonicalDate(''), null);
    assert.equal(toCanonicalDate('not-a-date'), null);
    assert.equal(toCanonicalDate({}), null);
    assert.equal(toEpochMs(0), null);
    assert.equal(toCanonicalDateObject('garbage'), null);
});

test('canonicalizeRecord converts membershipEnds without leaking Timestamp', () => {
    const rec = canonicalizeRecord({
        membershipEnds: { seconds: FUTURE_SEC, nanoseconds: 0 },
        createdAt: new Date(FUTURE_ISO),
        title: 'ok',
    });
    assert.equal(rec.membershipEnds, FUTURE_ISO);
    assert.equal(rec.createdAt, FUTURE_ISO);
    assert.equal(rec.title, 'ok');
    assert.equal(typeof rec.membershipEnds, 'string');
});

test('paid membership tiers include Premium, Pro, Enterprise', () => {
    assert.equal(isPaidMembershipTier('Premium'), true);
    assert.equal(isPaidMembershipTier('Pro'), true);
    assert.equal(isPaidMembershipTier('Enterprise'), true);
    assert.equal(isPaidMembershipTier('Basic'), false);
    assert.equal(isPaidMembershipTier('Free'), false);
    assert.equal(toCanonicalMembership('premium pro'), 'Premium');
});

test('toCanonicalUser + isMembershipActive works with ISO membershipEnds', () => {
    const user = toCanonicalUser({
        id: 'u1',
        membership: 'Premium',
        paymentStatus: 'ACTIVE',
        membershipEnds: FUTURE_ISO,
    });
    assert.equal(user.membershipEnds, FUTURE_ISO);
    assert.equal(isMembershipActive(user, Date.parse('2026-01-01T00:00:00.000Z')), true);
    assert.equal(isMembershipActive(user, Date.parse('2026-12-01T00:00:00.000Z')), false);
});

test('toCanonicalUser does not expose toDate() on membershipEnds', () => {
    const user = toCanonicalUser({
        id: 'u2',
        membership: 'Pro',
        paymentStatus: 'ACTIVE',
        membershipEnds: { toDate: () => new Date(FUTURE_ISO) },
    });
    assert.equal(typeof user.membershipEnds?.toDate, 'undefined');
    assert.equal(user.membershipEnds, FUTURE_ISO);
    assert.equal(isMembershipActive(user), true);
});

test('expired membership is not active', () => {
    const user = toCanonicalUser({
        id: 'u3',
        membership: 'Premium',
        paymentStatus: 'ACTIVE',
        membershipEnds: '2020-01-01T00:00:00.000Z',
    });
    assert.equal(isMembershipActive(user), false);
});

test('boolean canonicalization', () => {
    assert.equal(toCanonicalBoolean(1), true);
    assert.equal(toCanonicalBoolean(0), false);
    assert.equal(toCanonicalBoolean('true'), true);
    assert.equal(toCanonicalBoolean('false'), false);
});

test('mutation IDs are unique and prefixed', () => {
    const a = createMutationId('ev');
    const b = createMutationId('ev');
    assert.ok(a.startsWith('ev_'));
    assert.notEqual(a, b);
});
