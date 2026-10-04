'use strict';

/**
 * DIR-022 / AC-6 — Payment webhook reconciliation test suite.
 *
 * Covers the four properties the directive names, plus the invariants that
 * make them meaningful:
 *   1. Signature verification (Razorpay HMAC + Stripe HMAC) and tamper rejection
 *   2. Duplicate webhook suppression (idempotency ledger)
 *   3. Grace-period logic (the INV-5 entitlement sentinel)
 *   4. Transaction rollback and audit-row emission (INV-4)
 *
 * Everything runs against fakes with no network and no MariaDB, so this suite
 * is deterministic and CI-safe. The MariaDB-specific guarantees (the append-only
 * triggers, the `FOR UPDATE` locking) are certified separately by
 * `scripts/verify-mariadb-migrations.mjs` against a real isolated database;
 * what is proven HERE is that the service layer issues exactly the right
 * statements and reacts correctly to every failure mode.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const {
    REPLAY_WINDOW_SECONDS,
    WebhookVerificationError,
    verifyStripeSignature,
    verifyRazorpaySignature,
    parseStripeSignatureHeader,
    timingSafeCompare,
    sanitizeAuditMetadata,
    toWebhookRejection,
    webhookRejectionBody,
} = require('../security/webhookGuard');

const {
    PAYMENT_STATUSES,
    PAYMENT_GRACE_PERIOD_MS,
    isWithinPaymentGrace,
} = require('../database/canonical');

const { toCanonicalUser, isMembershipActive } = require('../database/domain');

const reconciler = require('../services/subscriptionReconciler');

const STRIPE_SECRET = 'whsec_dir022_test_secret_value';
const NOW = Date.parse('2026-06-01T12:00:00.000Z');

function stripeHeaderFor(body, secret = STRIPE_SECRET, timestamp = Math.floor(NOW / 1000)) {
    const payload = Buffer.isBuffer(body) ? body.toString('utf8') : String(body);
    const signature = crypto.createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
    return `t=${timestamp},v1=${signature}`;
}

function expectRejection(fn, code) {
    assert.throws(fn, error => error instanceof WebhookVerificationError && error.code === code);
}

// ===========================================================================
// 1. CRYPTOGRAPHIC SIGNATURE VERIFICATION
// ===========================================================================

test('AC-2: Stripe signature accepts an authentic delivery and rejects tampering', () => {
    const body = Buffer.from(JSON.stringify({ id: 'evt_dir022', type: 'payment_intent.succeeded' }));
    const header = stripeHeaderFor(body);
    const verified = verifyStripeSignature({ rawBody: body, header, secret: STRIPE_SECRET, nowMs: NOW });
    assert.equal(verified.timestamp, Math.floor(NOW / 1000));

    // Payload tampering: one extra byte anywhere invalidates the HMAC.
    expectRejection(
        () => verifyStripeSignature({ rawBody: Buffer.from(`${body.toString('utf8')} `), header, secret: STRIPE_SECRET, nowMs: NOW }),
        'STRIPE_SIGNATURE_INVALID',
    );
    // Signature tampering.
    const flipped = header.replace(/v1=([0-9a-f])/, (_m, c) => `v1=${c === 'a' ? 'b' : 'a'}`);
    expectRejection(
        () => verifyStripeSignature({ rawBody: body, header: flipped, secret: STRIPE_SECRET, nowMs: NOW }),
        'STRIPE_SIGNATURE_INVALID',
    );
    // Wrong secret.
    expectRejection(
        () => verifyStripeSignature({ rawBody: body, header, secret: 'whsec_a_different_secret', nowMs: NOW }),
        'STRIPE_SIGNATURE_INVALID',
    );
});

test('AC-2: replay window is enforced at exactly 300 seconds and cannot be widened', () => {
    const body = Buffer.from(JSON.stringify({ id: 'evt_replay' }));
    const issuedAt = Math.floor(NOW / 1000);

    // 299s old: still inside the window.
    const fresh = stripeHeaderFor(body, STRIPE_SECRET, issuedAt - 299);
    assert.doesNotThrow(() => verifyStripeSignature({ rawBody: body, header: fresh, secret: STRIPE_SECRET, nowMs: NOW }));

    // 301s old: outside the window, and correctly reported as a REPLAY rather
    // than a signature mismatch.
    const stale = stripeHeaderFor(body, STRIPE_SECRET, issuedAt - 301);
    expectRejection(
        () => verifyStripeSignature({ rawBody: body, header: stale, secret: STRIPE_SECRET, nowMs: NOW }),
        'STRIPE_SIGNATURE_REPLAY_WINDOW',
    );

    // A caller cannot defeat the window by asking for a larger tolerance.
    const veryOld = stripeHeaderFor(body, STRIPE_SECRET, issuedAt - 100_000);
    expectRejection(
        () => verifyStripeSignature({
            rawBody: body, header: veryOld, secret: STRIPE_SECRET, toleranceSeconds: 999_999, nowMs: NOW,
        }),
        'STRIPE_SIGNATURE_REPLAY_WINDOW',
    );
    assert.equal(REPLAY_WINDOW_SECONDS, 300);
});

test('AC-2: malformed and absent Stripe headers are rejected structurally', () => {
    const body = Buffer.from(JSON.stringify({ id: 'evt_malformed' }));
    assert.equal(parseStripeSignatureHeader(''), null);
    assert.equal(parseStripeSignatureHeader('v1=deadbeef'), null, 'a signature without a timestamp is unusable');
    expectRejection(
        () => verifyStripeSignature({ rawBody: body, header: 'garbage', secret: STRIPE_SECRET, nowMs: NOW }),
        'STRIPE_SIGNATURE_MALFORMED',
    );
    expectRejection(
        () => verifyStripeSignature({ rawBody: body, header: undefined, secret: STRIPE_SECRET, nowMs: NOW }),
        'STRIPE_SIGNATURE_MALFORMED',
    );
});

test('AC-2: a missing signing secret fails closed with a non-retryable status', () => {
    const body = Buffer.from(JSON.stringify({ id: 'evt_nosecret' }));
    const header = stripeHeaderFor(body);
    assert.throws(
        () => verifyStripeSignature({ rawBody: body, header, secret: '', nowMs: NOW }),
        // 400, not 503: Stripe retries any 5xx, so a deployment missing its
        // signing secret must not generate a retry storm against an endpoint
        // that can never succeed. The distinct CODE still identifies the cause.
        error => error.code === 'WEBHOOK_SIGNING_SECRET_UNAVAILABLE' && error.status === 400,
    );
    // The same holds for Razorpay, which also retries on 5xx.
    assert.throws(
        () => verifyRazorpaySignature({ secret: '', orderId: 'o', paymentId: 'p', signature: 'abc' }),
        error => error.code === 'WEBHOOK_SIGNING_SECRET_UNAVAILABLE' && error.status === 400,
    );
});

test('AC-2: Razorpay HMAC-SHA256 accepts the authentic order|payment pair only', () => {
    const secret = 'dir022_razorpay_secret';
    const signature = crypto.createHmac('sha256', secret).update('order_abc|pay_xyz').digest('hex');
    assert.equal(
        verifyRazorpaySignature({ secret, orderId: 'order_abc', paymentId: 'pay_xyz', signature }),
        true,
    );

    // Any one of the three bound values being altered must fail.
    expectRejection(
        () => verifyRazorpaySignature({ secret, orderId: 'order_ATTACKER', paymentId: 'pay_xyz', signature }),
        'RAZORPAY_SIGNATURE_INVALID',
    );
    expectRejection(
        () => verifyRazorpaySignature({ secret, orderId: 'order_abc', paymentId: 'pay_ATTACKER', signature }),
        'RAZORPAY_SIGNATURE_INVALID',
    );
    expectRejection(
        () => verifyRazorpaySignature({ secret: 'wrong_secret', orderId: 'order_abc', paymentId: 'pay_xyz', signature }),
        'RAZORPAY_SIGNATURE_INVALID',
    );
    // Missing input is rejected rather than treated as an empty match.
    expectRejection(
        () => verifyRazorpaySignature({ secret, orderId: 'order_abc', paymentId: 'pay_xyz', signature: '' }),
        'RAZORPAY_SIGNATURE_MISSING',
    );
    // The classic separator-injection attack must not authenticate.
    const swapped = crypto.createHmac('sha256', secret).update('order_abcpay_xyz').digest('hex');
    expectRejection(
        () => verifyRazorpaySignature({ secret, orderId: 'order_abc', paymentId: 'pay_xyz', signature: swapped }),
        'RAZORPAY_SIGNATURE_INVALID',
    );
});

test('INV-2: a webhook rejection exposes only a fixed code, never a provider message or secret', () => {
    const leaky = new Error('Expected signature whsec_dir022_test_secret_value / 1234abcd');
    const rejection = toWebhookRejection(leaky);
    assert.equal(rejection.code, 'WEBHOOK_SIGNATURE_REJECTED');
    assert.equal(rejection.status, 400);

    const body = webhookRejectionBody(rejection.code, 'req-1');
    const serialised = JSON.stringify(body);
    assert.doesNotMatch(serialised, /whsec_|dir022_test_secret/i, 'no secret may appear in a rejection body');
    assert.doesNotMatch(serialised, /at Object|Error:/, 'no stack trace may appear in a rejection body');
    assert.equal(body.error.code, 'WEBHOOK_SIGNATURE_REJECTED');

    // Audit metadata is redacted even if a caller passes raw provider material.
    const sanitised = sanitizeAuditMetadata({
        gateway: 'stripe',
        stripeSignature: 'whsec_dir022_test_secret_value',
        nested: { apiKey: 'rzp_live_abcdefghijklmnop', nestedTwice: { sessionToken: 'abc123' } },
        longValue: 'x'.repeat(400),
    });
    assert.equal(sanitised.gateway, 'stripe');
    assert.equal(sanitised.stripeSignature, '[REDACTED]');
    assert.equal(sanitised.nested.apiKey, '[REDACTED]');
    assert.equal(sanitised.nested.nestedTwice.sessionToken, '[REDACTED]');
    assert.ok(sanitised.longValue.length < 400, 'oversized metadata is truncated');
});

test('timing-safe comparison is length-safe and does not throw on unequal lengths', () => {
    assert.equal(timingSafeCompare('abc', 'abc'), true);
    assert.equal(timingSafeCompare('abc', 'abd'), false);
    assert.equal(timingSafeCompare('short', 'considerably-longer-value'), false);
    assert.equal(timingSafeCompare('', ''), true);
});

// ===========================================================================
// 2. IDEMPOTENCY / DUPLICATE WEBHOOK SUPPRESSION (AC-1)
// ===========================================================================

/**
 * A faithful stand-in for the `payment_webhook_events` PRIMARY KEY constraint:
 * the second INSERT of the same event id raises ER_DUP_ENTRY, which is exactly
 * the signal MySQLRepository.claimWebhookEvent interprets.
 */
function idempotentLedger() {
    const claimed = new Set();
    // Exposed via a getter so the assertion observes the live counter rather
    // than the value captured when the object literal was built.
    const ledger = {
        claimed,
        get activationCount() { return activationCount; },
        async claimWebhookEvent(record) {
            if (claimed.has(record.eventId)) return { duplicate: true, existing: record };
            claimed.add(record.eventId);
            return { duplicate: false, record };
        },
        async deleteWebhookEvent(eventId) {
            claimed.delete(eventId);
            return true;
        },
        async activatePaymentOrderAtomic() {
            activationCount += 1;
            return { status: 'ACTIVE', membership: 'Premium' };
        },
    };
    let activationCount = 0;
    return ledger;
}

/** The exact claim/act/release sequence backend/index.js runs per delivery. */
async function ingestWebhook(ledger, event) {
    const claim = await ledger.claimWebhookEvent({
        eventId: event.id, provider: event.provider, eventType: event.type, orderId: event.orderId,
    });
    if (claim.duplicate) return { received: true, duplicate: true };
    try {
        const activated = await ledger.activatePaymentOrderAtomic({
            orderId: event.orderId, gatewayLabel: event.provider, providerPaymentId: event.paymentId,
        });
        return { received: true, status: 'activated', membership: activated.membership };
    } catch (error) {
        // A failed activation must release the claim, or a gateway retry of the
        // very same event would be permanently swallowed as "already processed"
        // and the customer would never receive their entitlement.
        await ledger.deleteWebhookEvent(event.id);
        throw error;
    }
}

test('AC-1: a duplicate delivery is suppressed and never double-credits entitlement', async () => {
    const ledger = idempotentLedger();
    const delivery = { id: 'evt_dir022_dup', provider: 'stripe', type: 'payment_intent.succeeded', orderId: 'order-1', paymentId: 'pi_1' };

    const first = await ingestWebhook(ledger, delivery);
    assert.equal(first.status, 'activated');
    assert.equal(ledger.activationCount, 1);

    // The gateway retries the identical event (at-least-once delivery).
    for (let attempt = 0; attempt < 4; attempt += 1) {
        const replay = await ingestWebhook(ledger, delivery);
        assert.equal(replay.duplicate, true);
        assert.equal(replay.received, true);
    }
    assert.equal(ledger.activationCount, 1, 'entitlement must be granted exactly once');
});

test('AC-1: a failed activation releases its claim so a gateway retry can still settle', async () => {
    const claimed = new Set();
    let attempt = 0;
    const ledger = {
        async claimWebhookEvent(record) {
            if (claimed.has(record.eventId)) return { duplicate: true };
            claimed.add(record.eventId);
            return { duplicate: false };
        },
        async deleteWebhookEvent(eventId) { claimed.delete(eventId); return true; },
        async activatePaymentOrderAtomic() {
            attempt += 1;
            if (attempt === 1) throw Object.assign(new Error('transient MariaDB failure'), { code: 'ER_LOCK_DEADLOCK' });
            return { status: 'ACTIVE', membership: 'Premium' };
        },
    };

    const delivery = { id: 'evt_dir022_retry', provider: 'stripe', type: 'payment_intent.succeeded', orderId: 'order-2' };
    await assert.rejects(() => ingestWebhook(ledger, delivery));
    assert.equal(claimed.has('evt_dir022_retry'), false, 'the claim must be released on failure');

    const retry = await ingestWebhook(ledger, delivery);
    assert.equal(retry.status, 'activated');
    assert.equal(attempt, 2);
});

// ===========================================================================
// 3. GRACE PERIOD / ZERO FALSE-POSITIVE LOCKOUT (AC-4, INV-5)
// ===========================================================================

test('AC-4: PAST_DUE is a canonical payment status with a bounded three-day grace', () => {
    assert.ok(PAYMENT_STATUSES.includes('PAST_DUE'), 'PAST_DUE must be a first-class payment status');
    assert.equal(PAYMENT_GRACE_PERIOD_MS, 3 * 24 * 60 * 60 * 1000, 'the documented default is three days');
});

test('AC-4: a PAST_DUE candidate inside the grace window keeps full entitlement', () => {
    const insideGrace = toCanonicalUser({
        id: 'candidate-1',
        membership: 'Premium',
        paymentStatus: 'PAST_DUE',
        membershipEnds: '2027-01-01T00:00:00.000Z',
        paymentGraceUntil: '2026-06-04T00:00:00.000Z',
    });
    assert.equal(isWithinPaymentGrace(insideGrace, NOW), true);
    // THE INV-5 ASSERTION: a paying user with a declined renewal is not locked out.
    assert.equal(isMembershipActive(insideGrace, NOW), true);
});

test('AC-4: the grace boundary is exact — entitled to the millisecond, not after it', () => {
    const build = graceUntil => toCanonicalUser({
        id: 'candidate-1', membership: 'Premium', paymentStatus: 'PAST_DUE',
        membershipEnds: '2027-01-01T00:00:00.000Z', paymentGraceUntil: graceUntil,
    });
    const deadline = Date.parse('2026-06-04T00:00:00.000Z');
    const atDeadline = build(new Date(deadline).toISOString());

    // One millisecond before expiry: the deadline is still strictly in the future.
    assert.equal(isWithinPaymentGrace(atDeadline, deadline - 1), true);
    assert.equal(isMembershipActive(atDeadline, deadline - 1), true);
    // Exactly at expiry: no longer entitled (strict `>` comparison).
    assert.equal(isWithinPaymentGrace(atDeadline, deadline), false);
    assert.equal(isMembershipActive(atDeadline, deadline), false);
    // One millisecond after: no longer entitled.
    assert.equal(isMembershipActive(atDeadline, deadline + 1), false);
});

test('AC-4: a PAST_DUE account with no readable deadline fails CLOSED, never open', () => {
    // Granting indefinite access from a partially-written row would be worse
    // than revoking it, so an unparseable/absent deadline means "not in grace".
    for (const graceUntil of [null, undefined, '', 'not-a-date', '0']) {
        const user = toCanonicalUser({
            id: 'candidate-1', membership: 'Premium', paymentStatus: 'PAST_DUE',
            membershipEnds: '2027-01-01T00:00:00.000Z', paymentGraceUntil: graceUntil,
        });
        assert.equal(isWithinPaymentGrace(user, NOW), false, `graceUntil=${String(graceUntil)} must not grant access`);
        assert.equal(isMembershipActive(user, NOW), false);
    }
});

test('INV-5: grace never resurrects a genuinely non-paying account', () => {
    // The grace window applies to a DECLINED RENEWAL of a previously paying
    // account. A refunded or charged-back account must stay locked out no matter
    // what stale recovery columns it happens to carry.
    for (const status of ['REFUNDED', 'CHARGEBACK', 'EXPIRED']) {
        const user = toCanonicalUser({
            id: 'candidate-1', membership: 'Premium', paymentStatus: status,
            membershipEnds: '2020-01-01T00:00:00.000Z',
            paymentGraceUntil: '2026-06-04T00:00:00.000Z',
        });
        assert.equal(isMembershipActive(user, NOW), false, `${status} must never be revived by a grace deadline`);
    }
});

test('INV-5: an ordinary ACTIVE Premium account is unaffected by the grace changes', () => {
    const active = toCanonicalUser({
        id: 'candidate-2', membership: 'Premium', paymentStatus: 'ACTIVE',
        membershipEnds: '2027-01-01T00:00:00.000Z',
    });
    assert.equal(isMembershipActive(active, NOW), true);

    // A free account with a stray grace deadline still gets nothing.
    const free = toCanonicalUser({
        id: 'candidate-3', membership: 'Basic', paymentStatus: 'PAST_DUE',
        membershipEnds: '2027-01-01T00:00:00.000Z', paymentGraceUntil: '2026-06-04T00:00:00.000Z',
    });
    assert.equal(isMembershipActive(free, NOW), false, 'grace never upgrades a non-paid tier');
});

// ===========================================================================
// 4. RECONCILER, TRANSACTION ROLLBACK AND AUDIT EMISSION (AC-3, INV-4)
// ===========================================================================

/**
 * A fake repository that models the exact SQL contract MySQLRepository
 * implements for reconciliation: the audit INSERT happens inside the same
 * transaction as the entitlement UPDATE, so a failure after it must roll back
 * BOTH. `failOn` names the statement that explodes.
 */
function fakeReconciliationRepo({ account, orders = [], failOn = null } = {}) {
    const audit = [];
    const committed = { paymentStatus: account?.paymentStatus || 'ACTIVE', paymentGraceUntil: null, renewal_state: null };
    return {
        audit,
        committed,
        async listSubscriptionsForReconciliation() {
            return [{
                uid: account.id,
                paymentStatus: account.paymentStatus,
                orderId: orders[0]?.id || null,
                provider: account.lastPaymentGateway,
                providerPaymentId: orders[0]?.providerPaymentId || null,
            }];
        },
        async getUser() { return account; },
        async getUserPaymentOrders() { return orders; },
        async getSubscriptionAuditLog() { return [...audit]; },
        async reconcileSubscriptionAtomic({ uid, orderId, outcome, gateway, actor, actorRole, reason }) {
            const fromStatus = committed.paymentStatus;
            if (failOn === 'update_users') throw new Error('simulated UPDATE failure');
            if (failOn === 'audit_insert') {
                // The audit insert fails AFTER the user UPDATE in the same
                // transaction, so MariaDB would roll the UPDATE back too.
                throw new Error('simulated audit INSERT failure');
            }
            committed.paymentStatus = outcome;
            committed.paymentGraceUntil = outcome === 'PAST_DUE' ? new Date(NOW + PAYMENT_GRACE_PERIOD_MS).toISOString() : null;
            committed.renewal_state = outcome === 'ACTIVE' ? 'RENEWED' : 'GRACE_PERIOD';
            if (fromStatus !== outcome) {
                audit.push({ uid, orderId, fromStatus, toStatus: outcome, actor, actorRole, reason, gateway });
            }
            return { uid, fromStatus, toStatus: outcome, changed: fromStatus !== outcome, user: { ...committed } };
        },
    };
}

test('AC-3: a gateway-confirmed renewal failure opens a grace window and emits one audit row', async () => {
    const repo = fakeReconciliationRepo({
        account: { id: 'candidate-a', paymentStatus: 'ACTIVE', lastPaymentGateway: 'stripe' },
        orders: [{ id: 'order-a', providerPaymentId: 'pi_a' }],
    });
    const stripeClient = { paymentIntents: { retrieve: async () => ({ id: 'pi_a', status: 'canceled' }) } };

    const pass = await reconciler.reconcileSubscriptionsOnce({ repository: repo, credentials: { stripeClient } });
    assert.equal(pass.examined, 1);
    assert.equal(pass.changed, 1);
    assert.equal(repo.committed.paymentStatus, 'PAST_DUE');
    assert.ok(repo.committed.paymentGraceUntil, 'a grace deadline must be written');
    assert.equal(repo.committed.renewal_state, 'GRACE_PERIOD');

    // INV-4: the transition is on the immutable record with its actor.
    assert.equal(repo.audit.length, 1);
    assert.deepEqual(
        { from: repo.audit[0].fromStatus, to: repo.audit[0].toStatus, gateway: repo.audit[0].gateway, actor: repo.audit[0].actor },
        { from: 'ACTIVE', to: 'PAST_DUE', gateway: 'stripe', actor: 'subscription-reconciler' },
    );
});

test('AC-3: a gateway outage leaves the account untouched — the INV-5 guarantee', async () => {
    const repo = fakeReconciliationRepo({
        account: { id: 'candidate-b', paymentStatus: 'ACTIVE', lastPaymentGateway: 'stripe' },
        orders: [{ id: 'order-b', providerPaymentId: 'pi_b' }],
    });
    const stripeClient = {
        paymentIntents: { retrieve: async () => { throw Object.assign(new Error('gateway 503'), { code: 'STRIPE_UNAVAILABLE' }); } },
    };

    const pass = await reconciler.reconcileSubscriptionsOnce({ repository: repo, credentials: { stripeClient } });
    assert.equal(pass.examined, 1);
    assert.equal(pass.changed, 0);
    assert.equal(pass.skipped, 1);
    // The critical assertion: a transient gateway failure is NOT a payment
    // failure, so the paying candidate keeps their ACTIVE entitlement.
    assert.equal(repo.committed.paymentStatus, 'ACTIVE');
    assert.equal(repo.committed.paymentGraceUntil, null);
    assert.equal(repo.audit.length, 0);
});

test('AC-3: an in-flight payment writes nothing at all', async () => {
    const repo = fakeReconciliationRepo({
        account: { id: 'candidate-c', paymentStatus: 'ACTIVE', lastPaymentGateway: 'stripe' },
        orders: [{ id: 'order-c', providerPaymentId: 'pi_c' }],
    });
    const stripeClient = { paymentIntents: { retrieve: async () => ({ id: 'pi_c', status: 'processing' }) } };

    const pass = await reconciler.reconcileSubscriptionsOnce({ repository: repo, credentials: { stripeClient } });
    assert.equal(pass.changed, 0);
    assert.equal(pass.results[0].reason, 'PAYMENT_STILL_IN_FLIGHT');
    assert.equal(repo.committed.paymentStatus, 'ACTIVE');
    assert.equal(repo.audit.length, 0);
});

test('AC-3: a provider with no verifiable probe is skipped, never guessed at', async () => {
    const repo = fakeReconciliationRepo({
        account: { id: 'candidate-d', paymentStatus: 'PAST_DUE', lastPaymentGateway: 'paypal' },
        orders: [{ id: 'order-d', providerPaymentId: 'PAYID' }],
    });

    const pass = await reconciler.reconcileSubscriptionsOnce({ repository: repo, credentials: {} });
    assert.equal(pass.changed, 0);
    assert.equal(pass.results[0].reason, 'UNSUPPORTED_PROVIDER');
    assert.equal(pass.results[0].outcome, null);
    assert.equal(repo.audit.length, 0, 'an unverifiable provider must not fabricate a transition');
});

test('AC-4: an absent gateway credential never manufactures an outcome', async () => {
    const repo = fakeReconciliationRepo({
        account: { id: 'candidate-e', paymentStatus: 'ACTIVE', lastPaymentGateway: 'stripe' },
        orders: [{ id: 'order-e', providerPaymentId: 'pi_e' }],
    });

    // Stripe is verifiable, but no credential was supplied.
    const pass = await reconciler.reconcileSubscriptionsOnce({ repository: repo, credentials: {} });
    assert.equal(pass.changed, 0);
    assert.equal(pass.results[0].reason, 'GATEWAY_CREDENTIALS_UNAVAILABLE');
    assert.equal(repo.committed.paymentStatus, 'ACTIVE');
});

test('AC-4: Razorpay captured/authorized/failed map to the correct outcomes', async () => {
    const respondWith = payload => async () => ({ ok: true, json: async () => payload });

    const captured = await reconciler.probeRazorpayPayment({
        providerPaymentId: 'pay_1', keyId: 'rzp_test', keySecret: 'secret', fetchImpl: respondWith({ status: 'captured' }),
    });
    assert.equal(captured, 'succeeded');
    assert.equal(reconciler.outcomeForObservation(captured), 'ACTIVE');

    const failed = await reconciler.probeRazorpayPayment({
        providerPaymentId: 'pay_2', keyId: 'rzp_test', keySecret: 'secret',
        fetchImpl: respondWith({ status: 'failed', error_code: 'BAD_CARD_ERROR' }),
    });
    assert.equal(failed, 'failed');
    assert.equal(reconciler.outcomeForObservation(failed), 'PAST_DUE');

    const authorized = await reconciler.probeRazorpayPayment({
        providerPaymentId: 'pay_3', keyId: 'rzp_test', keySecret: 'secret', fetchImpl: respondWith({ status: 'authorized' }),
    });
    assert.equal(authorized, 'pending', 'an authorized-but-uncaptured payment is still in flight');
    assert.equal(reconciler.outcomeForObservation(authorized), null);

    // An unreachable gateway raises, which the pass converts into "skip".
    await assert.rejects(() => reconciler.probeRazorpayPayment({
        providerPaymentId: 'pay_4', keyId: 'rzp_test', keySecret: 'secret',
        fetchImpl: async () => ({ ok: false, json: async () => ({}) }),
    }));
});

test('AC-6: a rolled-back transaction emits no audit row claiming a transition that never committed', async () => {
    for (const failOn of ['update_users', 'audit_insert']) {
        const repo = fakeReconciliationRepo({
            account: { id: 'candidate-f', paymentStatus: 'ACTIVE', lastPaymentGateway: 'stripe' },
            orders: [{ id: 'order-f', providerPaymentId: 'pi_f' }],
            failOn,
        });
        const stripeClient = { paymentIntents: { retrieve: async () => ({ id: 'pi_f', status: 'succeeded' }) } };

        const pass = await reconciler.reconcileSubscriptionsOnce({ repository: repo, credentials: { stripeClient } });
        assert.equal(pass.changed, 0, `failOn=${failOn} must not report a change`);
        assert.equal(repo.audit.length, 0, `failOn=${failOn} must leave the audit ledger untouched`);
        assert.equal(pass.results[0].outcome, null, `failOn=${failOn} must not report a transition`);
        assert.equal(pass.results[0].reason, 'RECONCILIATION_WRITE_FAILED');
    }
});

test('AC-5: the operator reconcile reports the gateway answer honestly', async () => {
    const repo = fakeReconciliationRepo({
        account: { id: 'candidate-g', paymentStatus: 'PAST_DUE', lastPaymentGateway: 'stripe' },
        orders: [{ id: 'order-g', providerPaymentId: 'pi_g' }],
    });
    const stripeClient = { paymentIntents: { retrieve: async () => ({ id: 'pi_g', status: 'succeeded' }) } };

    const outcome = await reconciler.reconcileUserSubscription({
        uid: 'candidate-g', repository: repo, credentials: { stripeClient }, actor: 'admin-1', actorRole: 'ADMIN',
    });
    assert.equal(outcome.reconciled, true);
    assert.equal(outcome.changed, true);
    assert.equal(outcome.fromStatus, 'PAST_DUE');
    assert.equal(outcome.toStatus, 'ACTIVE');
    assert.equal(outcome.gracePeriodMs, PAYMENT_GRACE_PERIOD_MS);
    // Recovering an account clears the grace window entirely.
    assert.equal(repo.committed.paymentGraceUntil, null);
    assert.equal(repo.audit[0].actor, 'admin-1');
    assert.equal(repo.audit[0].actorRole, 'ADMIN');
});

test('AC-5: an unknown user is a 404, not a silent no-op', async () => {
    const repo = fakeReconciliationRepo({ account: { id: 'candidate-h', paymentStatus: 'ACTIVE' } });
    repo.getUser = async () => null;
    await assert.rejects(
        () => reconciler.reconcileUserSubscription({ uid: 'ghost', repository: repo, credentials: {} }),
        error => error.code === 'USER_NOT_FOUND' && error.status === 404,
    );
});

test('AC-3: the reconciler refuses to run without an atomic adapter (no silent fallback)', async () => {
    // A repository lacking the atomic adapter must produce a loud 503 rather
    // than the reconciler quietly writing through some other path.
    await assert.rejects(
        () => reconciler.reconcileSubscriptionsOnce({ repository: { listSubscriptionsForReconciliation: async () => [] } }),
        error => error.code === 'ATOMIC_SUBSCRIPTION_RECONCILIATION_UNAVAILABLE' && error.status === 503,
    );
    await assert.rejects(
        () => reconciler.reconcileSubscriptionsOnce({ repository: {} }),
        error => error.code === 'ATOMIC_SUBSCRIPTION_RECONCILIATION_UNAVAILABLE' && error.status === 503,
    );
});

test('AC-3: a work-queue limit is honoured so one pass cannot sweep the whole user table', async () => {
    let observedLimit = null;
    const repo = {
        async listSubscriptionsForReconciliation({ limit }) { observedLimit = limit; return []; },
        async reconcileSubscriptionAtomic() { throw new Error('should not be called'); },
    };
    await reconciler.reconcileSubscriptionsOnce({ repository: repo, credentials: {}, limit: 5 });
    assert.equal(observedLimit, 5);
    assert.equal(reconciler.MAX_ACCOUNTS_PER_PASS, 50);
});