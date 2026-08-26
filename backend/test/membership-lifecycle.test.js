'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveEffectiveEntitlement } = require('../security/entitlements');
const { isMembershipActive, toCanonicalUser } = require('../database/domain');

test('B2C Pro subscriber with ISO membershipEnds is Premium-entitled', () => {
    const future = new Date(Date.now() + 30 * 86400000).toISOString();
    const ent = resolveEffectiveEntitlement({
        email: 'pro@example.com',
        membership: 'Pro',
        paymentStatus: 'ACTIVE',
        membershipEnds: future,
    });
    assert.equal(ent.isPremium, true);
    assert.equal(ent.allowsDocxExport, true);
    assert.equal(ent.effectiveTier, 'Premium');
});

test('B2C Enterprise string membership is entitled without tenant document', () => {
    const future = new Date(Date.now() + 30 * 86400000).toISOString();
    const ent = resolveEffectiveEntitlement({
        email: 'ent@example.com',
        membership: 'Enterprise',
        paymentStatus: 'ACTIVE',
        membershipEnds: future,
    });
    assert.equal(ent.isPremium, true);
    assert.equal(ent.effectiveTier, 'Enterprise');
});

test('membershipEnds as {seconds} does not crash entitlements', () => {
    const futureSec = Math.floor((Date.now() + 86400000 * 40) / 1000);
    const ent = resolveEffectiveEntitlement({
        membership: 'Premium',
        paymentStatus: 'ACTIVE',
        membershipEnds: { seconds: futureSec, nanoseconds: 0 },
    });
    assert.equal(ent.isPremium, true);
});

test('expired Premium is Basic', () => {
    const ent = resolveEffectiveEntitlement({
        membership: 'Premium',
        paymentStatus: 'ACTIVE',
        membershipEnds: '2020-01-01T00:00:00.000Z',
    });
    assert.equal(ent.effectiveTier, 'Basic');
    assert.equal(ent.allowsDocxExport, false);
});

test('activation / renewal / cancellation semantics', () => {
    const now = Date.parse('2026-06-01T00:00:00.000Z');
    const activated = toCanonicalUser({ membership: 'Premium', paymentStatus: 'ACTIVE', membershipEnds: '2026-09-01T00:00:00.000Z' });
    assert.equal(isMembershipActive(activated, now), true);

    const cancelledStillPaid = toCanonicalUser({ membership: 'Premium', paymentStatus: 'CANCELLED', membershipEnds: '2026-09-01T00:00:00.000Z' });
    assert.equal(isMembershipActive(cancelledStillPaid, now), true);

    const refunded = toCanonicalUser({ membership: 'Premium', paymentStatus: 'REFUNDED', membershipEnds: '2026-09-01T00:00:00.000Z' });
    assert.equal(isMembershipActive(refunded, now), false);
});
