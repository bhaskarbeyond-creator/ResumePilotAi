'use strict';

/**
 * DIR-022 / AC-3 — Autonomous subscription reconciliation daemon.
 *
 * WHY A RECONCILER EXISTS AT ALL
 * ------------------------------
 * Webhooks are best-effort delivery. They are dropped, duplicated, delayed past
 * any sane timeout, and occasionally arrive out of order. Without a second
 * source of truth, any of those failures leaves a paying customer either
 * un-activated or (worse) silently downgraded while still being charged. This
 * worker is that second source of truth: it asks the GATEWAY what actually
 * happened, rather than trusting that a webhook arrived.
 *
 * DESIGN CONSTRAINTS (each one load-bearing)
 * ------------------------------------------
 *  - NO INVENTED STATE. Every outcome comes from a live gateway probe or from
 *    MariaDB. When the gateway cannot be reached the account is reported as
 *    `unverified` and left EXACTLY as it is. Failing open into PAST_DUE
 *    because a probe timed out would lock out paying users — the precise
 *    false-positive AC-4 forbids. Failing closed into ACTIVE would grant free
 *    entitlements.
 *  - NO NON-TRANSACTIONAL FALLBACK. Following the cmsScheduler convention,
 *    every write delegates to the repository's atomic adapter; this service
 *    holds no SQL and has no alternate store.
 *  - BOUNDED PASS. Each run processes a fixed maximum number of accounts, so a
 *    large backlog cannot monopolise the event loop or trip a gateway rate limit.
 *  - SELF-ISOLATING. One account's failure never aborts the pass.
 *
 * INVARIANT INV-2: no credential ever enters a return value or a log line.
 * Gateway credentials are resolved inside the probe functions only.
 */

const { PAYMENT_GRACE_PERIOD_MS } = require('../database/canonical');

/** Hard ceiling on accounts touched per pass. */
const MAX_ACCOUNTS_PER_PASS = 50;

/** Gateway probe timeout. Mirrors the other provider probes in this codebase. */
const PROVIDER_TIMEOUT_MS = 10_000;

/**
 * Providers whose live status this worker is able to verify.
 *
 * PayPal/Paytm/PhonePe are deliberately absent: their status endpoints in this
 * codebase are reached from the notification-outbox tick with per-provider
 * credential shapes this service does not own. Rather than ship a probe that
 * guesses at a credential contract, those accounts are reported as
 * `unsupported_provider` and left untouched — honest and safe.
 */
const VERIFYABLE_PROVIDERS = new Set(['stripe', 'razorpay']);

function repoFor(repository) {
    return repository || require('../repositories').getRepository();
}

function fail(code, status = 503) {
    return Object.assign(new Error(code), { code, status });
}

function providerRequestTimeout() {
    return (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function')
        ? { signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) }
        : {};
}

/**
 * Asks Stripe what really happened to a payment intent.
 * @returns {'succeeded'|'failed'|'pending'}
 */
async function probeStripePayment({ providerPaymentId, stripeClient }) {
    if (!stripeClient) return null;
    const intent = await stripeClient.paymentIntents.retrieve(String(providerPaymentId));
    const status = String(intent?.status || '').toLowerCase();
    if (status === 'succeeded') return 'succeeded';
    if (status === 'canceled') return 'failed';
    // 'requires_payment_method' / 'requires_action' / 'processing' are all still
    // in-flight: the customer may yet be charged, so the account is left alone.
    return 'pending';
}

/**
 * Asks Razorpay what really happened to a payment.
 *
 * Razorpay's payment object carries `status` ('captured', 'authorized',
 * 'failed', ...) and an `error_code` when a charge is declined.
 */
async function probeRazorpayPayment({ providerPaymentId, keyId, keySecret, fetchImpl = fetch }) {
    if (!keyId || !keySecret || !providerPaymentId) return null;
    const response = await fetchImpl(
        `https://api.razorpay.com/v1/payments/${encodeURIComponent(String(providerPaymentId))}`,
        {
            headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}` },
            timeout: PROVIDER_TIMEOUT_MS,
            ...providerRequestTimeout(),
        }
    );
    if (!response.ok) throw fail('RAZORPAY_STATUS_UNAVAILABLE', 502);
    const payment = await response.json().catch(() => ({}));
    const status = String(payment?.status || '').toLowerCase();
    if (status === 'captured') return 'succeeded';
    if (status === 'failed' || payment?.error_code) return 'failed';
    return 'pending';
}

/**
 * Maps a gateway-observed state onto the entitlement outcome this codebase
 * understands.
 *
 * `pending` deliberately maps to null: an in-flight payment must NOT open a
 * grace window (the customer may still be about to be charged) and must NOT be
 * declared ACTIVE. Returning null means "write nothing".
 */
function outcomeForObservation(observed) {
    if (observed === 'succeeded') return 'ACTIVE';
    if (observed === 'failed') return 'PAST_DUE';
    return null;
}

/**
 * Resolves the live gateway probe for one provider.
 *
 * Returns null — meaning "cannot be verified" — in BOTH cases where a probe
 * would be dishonest: an unsupported provider, AND a supported provider whose
 * credentials are not configured. The second case matters: without this check a
 * credential-less deployment would return `null` from the probe, which the pass
 * would mislabel as `PAYMENT_STILL_IN_FLIGHT` — telling an operator the payment
 * is in progress when in fact the platform could not ask anyone. Misreporting
 * why a reconciliation was skipped is how a real billing incident gets
 * misdiagnosed.
 *
 * Credentials are never returned to the caller and never logged (INV-2).
 */
function createProbe({ provider, credentials = {}, fetchImpl = fetch }) {
    const normalized = String(provider || '').toLowerCase();
    if (!VERIFYABLE_PROVIDERS.has(normalized)) return null;
    if (normalized === 'stripe') {
        const stripeClient = credentials.stripeClient || null;
        if (!stripeClient) return null;
        return target => probeStripePayment({ ...target, stripeClient });
    }
    const keyId = credentials.keyId || null;
    const keySecret = credentials.keySecret || null;
    if (!keyId || !keySecret) return null;
    return target => probeRazorpayPayment({ ...target, keyId, keySecret, fetchImpl });
}

/**
 * Runs ONE reconciliation pass (AC-3).
 *
 * @returns {Promise<{examined:number, changed:number, skipped:number, results:Array}>}
 */
async function reconcileSubscriptionsOnce({
    repository = null,
    credentials = {},
    actor = 'subscription-reconciler',
    limit = MAX_ACCOUNTS_PER_PASS,
    fetchImpl = fetch,
} = {}) {
    const repo = repoFor(repository);
    if (typeof repo?.listSubscriptionsForReconciliation !== 'function') {
        throw fail('ATOMIC_SUBSCRIPTION_RECONCILIATION_UNAVAILABLE', 503);
    }
    if (typeof repo.reconcileSubscriptionAtomic !== 'function') {
        throw fail('ATOMIC_SUBSCRIPTION_RECONCILIATION_UNAVAILABLE', 503);
    }

    const accounts = await repo.listSubscriptionsForReconciliation({ limit });
    const results = [];
    let changed = 0;
    let skipped = 0;

    for (const account of accounts) {
        const probe = createProbe({ provider: account.provider, credentials, fetchImpl });
        const record = { uid: account.uid, outcome: null, observation: 'unverified', reason: null };

        if (!probe) {
            record.reason = VERIFYABLE_PROVIDERS.has(String(account.provider || '').toLowerCase())
                ? 'GATEWAY_CREDENTIALS_UNAVAILABLE'
                : 'UNSUPPORTED_PROVIDER';
            skipped += 1;
            results.push(record);
            continue;
        }

        let observed = null;
        try {
            observed = await probe({ providerPaymentId: account.providerPaymentId });
        } catch (error) {
            // A gateway outage is NOT evidence of a failed payment. Leaving the
            // account untouched is the INV-5 guarantee: transient gateway
            // downtime must never become a customer lockout.
            record.observation = 'probe_failed';
            record.reason = error?.code || 'GATEWAY_PROBE_FAILED';
            skipped += 1;
            results.push(record);
            continue;
        }

        record.observation = observed || 'unknown';
        const outcome = outcomeForObservation(observed);
        if (!outcome) {
            record.reason = 'PAYMENT_STILL_IN_FLIGHT';
            skipped += 1;
            results.push(record);
            continue;
        }

        try {
            const applied = await repo.reconcileSubscriptionAtomic({
                uid: account.uid,
                orderId: account.orderId,
                outcome,
                gateway: account.provider,
                actor,
                actorRole: 'SYSTEM',
                reason: 'GATEWAY_RECONCILIATION',
            });
            record.outcome = applied.toStatus;
            if (applied.changed) changed += 1;
        } catch (error) {
            record.reason = error?.code || 'RECONCILIATION_WRITE_FAILED';
            skipped += 1;
        }
        results.push(record);
    }

    return { examined: accounts.length, changed, skipped, results };
}

/**
 * AC-5: reconciles a SINGLE account on operator demand.
 *
 * Used by the SuperAdmin "Reconcile User Entitlements" control. It probes the
 * same way the daemon does — there is no privileged shortcut that skips the
 * gateway check, because an operator pressing "reconcile" wants the GATEWAY's
 * answer, not the platform's assumption.
 */
async function reconcileUserSubscription({
    uid, repository = null, credentials = {}, actor = 'admin', actorRole = 'ADMIN', fetchImpl = fetch,
}) {
    const repo = repoFor(repository);
    if (typeof repo.reconcileSubscriptionAtomic !== 'function') {
        throw fail('ATOMIC_SUBSCRIPTION_RECONCILIATION_UNAVAILABLE', 503);
    }
    const target = String(uid || '').trim();
    const account = await repo.getUser(target);
    if (!account) throw fail('USER_NOT_FOUND', 404);

    const auditTrail = typeof repo.getSubscriptionAuditLog === 'function'
        ? await repo.getSubscriptionAuditLog({ uid: target, limit: 10 })
        : [];

    const provider = String(account.lastPaymentGateway || '').trim().toLowerCase();
    const orders = typeof repo.getUserPaymentOrders === 'function'
        ? (await repo.getUserPaymentOrders(target)) || []
        : [];
    const latestOrder = Array.isArray(orders) && orders.length ? orders[0] : null;
    const probe = createProbe({ provider, credentials, fetchImpl });

    if (!probe) {
        return {
            uid: target,
            reconciled: false,
            changed: false,
            observation: 'unverified',
            reason: VERIFYABLE_PROVIDERS.has(provider)
                ? 'GATEWAY_CREDENTIALS_UNAVAILABLE'
                : 'UNSUPPORTED_PROVIDER',
            gracePeriodMs: PAYMENT_GRACE_PERIOD_MS,
            audit: auditTrail,
        };
    }

    const providerPaymentId = latestOrder?.providerPaymentId
        || latestOrder?.providerPaymentIntentId
        || account.lastPaymentOrderId
        || null;

    let observed = null;
    let probeError = null;
    try {
        observed = await probe({ providerPaymentId });
    } catch (error) {
        probeError = error?.code || 'GATEWAY_PROBE_FAILED';
    }

    const outcome = probeError ? null : outcomeForObservation(observed);
    let applied = null;
    if (outcome) {
        applied = await repo.reconcileSubscriptionAtomic({
            uid: target,
            orderId: latestOrder?.id || account.lastPaymentOrderId || null,
            outcome,
            gateway: provider || null,
            actor,
            actorRole,
            reason: 'ADMIN_RECONCILIATION',
        });
    }

    return {
        uid: target,
        reconciled: Boolean(outcome),
        changed: Boolean(applied?.changed),
        fromStatus: applied?.fromStatus || String(account.paymentStatus || 'INACTIVE').toUpperCase(),
        toStatus: applied?.toStatus || null,
        observation: observed || 'unverified',
        reason: probeError || (outcome ? 'ADMIN_RECONCILIATION' : 'PAYMENT_STILL_IN_FLIGHT'),
        gracePeriodMs: PAYMENT_GRACE_PERIOD_MS,
        audit: typeof repo.getSubscriptionAuditLog === 'function'
            ? await repo.getSubscriptionAuditLog({ uid: target, limit: 10 })
            : auditTrail,
    };
}

module.exports = {
    MAX_ACCOUNTS_PER_PASS,
    PROVIDER_TIMEOUT_MS,
    VERIFYABLE_PROVIDERS,
    outcomeForObservation,
    createProbe,
    probeStripePayment,
    probeRazorpayPayment,
    reconcileSubscriptionsOnce,
    reconcileUserSubscription,
};