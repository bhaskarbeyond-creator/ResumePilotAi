'use strict';

/**
 * DIR-022 — Cryptographic webhook signature verification and replay defence.
 *
 * THREAT MODEL
 * ------------
 * A payment webhook is the one endpoint an attacker can reach anonymously and
 * repeatedly. If signature checking is wrong in either direction the platform
 * loses money or locks out paying customers:
 *
 *   - Accept an unsigned/forged event  -> free premium entitlements.
 *   - Reject a genuine event           -> a paying customer paid and got nothing,
 *                                        which is precisely the churn AC-4 exists
 *                                        to prevent.
 *   - Accept a REPLAY of a captured event -> the same payment credits twice unless
 *                                        the idempotency ledger is consulted first.
 *
 * INV-2 ZERO SECRET EXPOSURE
 * --------------------------
 * Every rejection reason here is a FIXED, enumerated code. Provider error strings
 * are never propagated to the caller or the HTTP response: Stripe's SDK messages
 * embed signature material, so echoing `err.message` (the pre-DIR-022 behaviour)
 * could leak information that makes forgery cheaper. Callers receive
 * `{ status, code }` only, and the sanitiser below is a second line of defence
 * for anything that reaches a log.
 */

const crypto = require('crypto');

/**
 * Replay window in seconds. AC-2 mandates < 300s. Stripe's own SDK default
 * tolerance is 300s; passing it explicitly means the bound is a decision this
 * codebase makes and tests, not an upstream default that could change.
 */
const REPLAY_WINDOW_SECONDS = 300;

/**
 * Statuses a webhook rejection may surface. Anything else is coerced to 400.
 *
 * 503 is DELIBERATELY NOT included. An absent signing secret is a server
 * misconfiguration, but returning 5xx makes Stripe treat the delivery as
 * retryable, so a deployment that forgot to configure `STRIPE_WEBHOOK_SECRET`
 * would generate an unbounded retry storm against an endpoint that can never
 * succeed. Failing closed with 400 stops the retries immediately.
 *
 * The misconfiguration is still fully diagnosable without a 5xx: the response
 * body carries the distinct `WEBHOOK_SIGNING_SECRET_UNAVAILABLE` code (never a
 * message), and every rejection is written to `security_audit_logs` with a
 * HIGH severity, which is where an operator actually looks.
 */
const REJECTION_STATUSES = new Set([400, 401]);

/**
 * Header/field names whose values must never reach a log line or an HTTP body.
 * Applied to the audit metadata this module writes, so a call site cannot
 * reintroduce the leak by logging a raw provider rejection.
 */
const SENSITIVE_KEY_PATTERN = /(secret|signature|authorization|token|key|password|credential|card|cvv|cookie|session)/i;
const SECRET_VALUE_PATTERNS = [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
    /\b(?:sk_(?:live|test)_|rk_(?:live|test)_|rzp_(?:live|test)_|whsec_[A-Za-z0-9_]{8,})[A-Za-z0-9_.-]{8,}/i,
];

/**
 * A webhook rejection. Carries ONLY the transport status and a fixed code —
 * never a provider message.
 */
class WebhookVerificationError extends Error {
    constructor(code, { status = 400, reason = null } = {}) {
        super(code);
        this.name = 'WebhookVerificationError';
        this.code = code;
        this.status = REJECTION_STATUSES.has(Number(status)) ? Number(status) : 400;
        // `reason` is an internal-only discriminator (e.g. which replay branch
        // fired) used to pick the audit action. It is never serialised outward.
        this.reason = reason;
    }
}

/**
 * Constant-time comparison over two strings of arbitrary length.
 *
 * `crypto.timingSafeEqual` throws on a length mismatch, and branching on length
 * before comparing leaks the digest length. Both sides are therefore hashed
 * with SHA-256 first: the comparison is always over two fixed-width 32-byte
 * buffers, so it is both timing-safe and length-safe. (This is the same
 * construction Stripe's own SDK uses.)
 */
function timingSafeCompare(left, right) {
    const leftHash = crypto.createHash('sha256').update(String(left ?? ''), 'utf8').digest();
    const rightHash = crypto.createHash('sha256').update(String(right ?? ''), 'utf8').digest();
    return crypto.timingSafeEqual(leftHash, rightHash);
}

/**
 * Redacts secret-bearing keys and secret-shaped values from an object so audit
 * metadata can be persisted without leaking credentials (INV-2).
 *
 * Depth- and length-capped: an unbounded walk here would let a hostile webhook
 * body turn an audit write into a memory-exhaustion vector.
 */
function sanitizeAuditMetadata(value, depth = 0) {
    if (depth > 4) return '[TRUNCATED]';
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') {
        if (SECRET_VALUE_PATTERNS.some(pattern => pattern.test(value))) return '[REDACTED]';
        return value.length > 256 ? `${value.slice(0, 256)}...[TRUNCATED]` : value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (Array.isArray(value)) return value.slice(0, 20).map(item => sanitizeAuditMetadata(item, depth + 1));
    if (typeof value !== 'object') return String(value);
    const cleaned = {};
    for (const [key, item] of Object.entries(value)) {
        cleaned[key] = SENSITIVE_KEY_PATTERN.test(key)
            ? '[REDACTED]'
            : sanitizeAuditMetadata(item, depth + 1);
    }
    return cleaned;
}
/**
 * Razorpay HMAC-SHA256 verification over the canonical `orderId|paymentId` string.
 *
 * Razorpay does not send a timestamp in this signature, so the 300s replay
 * window cannot be enforced cryptographically here. Replay is instead contained
 * by the `payment_webhook_events` idempotency ledger keyed on the provider event
 * id — a replayed delivery carries the same event id and is answered
 * `already_processed` without re-crediting. That is the correct defence for a
 * gateway whose signature carries no timestamp; inventing a timestamp check
 * would be security theatre that rejected legitimate payments.
 *
 * @returns {true} on success
 * @throws {WebhookVerificationError}
 */
function verifyRazorpaySignature({ secret, orderId, paymentId, signature }) {
    if (!secret) {
        throw new WebhookVerificationError('WEBHOOK_SIGNING_SECRET_UNAVAILABLE', { status: 503 });
    }
    if (!orderId || !paymentId || !signature) {
        throw new WebhookVerificationError('RAZORPAY_SIGNATURE_MISSING', { reason: 'incomplete_signature_input' });
    }
    const expected = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
    if (!timingSafeCompare(expected, signature)) {
        throw new WebhookVerificationError('RAZORPAY_SIGNATURE_INVALID', { reason: 'hmac_mismatch' });
    }
    return true;
}

/**
 * Parses the Stripe-Signature header into its `t=` timestamp and `v1=` HMACs.
 * Returns null for a structurally invalid header so the caller can reject it as
 * MALFORMED rather than reporting a misleading mismatch.
 */
function parseStripeSignatureHeader(header) {
    const raw = String(header || '');
    if (!raw.trim()) return null;
    let timestamp = null;
    const signatures = [];
    for (const part of raw.split(',')) {
        const [key, value] = part.split('=', 2);
        if (!key || value === undefined) continue;
const trimmedKey = key.trim();
        const trimmedValue = value.trim();
        if (trimmedKey === 't' && /^\d{1,20}$/.test(trimmedValue)) timestamp = Number(trimmedValue);
        if (trimmedKey === 'v1' && /^[a-f0-9]{64}$/i.test(trimmedValue)) signatures.push(trimmedValue.toLowerCase());
    }
    if (timestamp === null || signatures.length === 0) return null;
    return { timestamp, signatures };
}

/**
 * Stripe signature verification with an explicit, enforced replay window.
 *
 * Ordering matters and is deliberate: the timestamp window is checked BEFORE the
 * HMAC, and the timestamp is part of the signed envelope
 * (`${timestamp}.${rawBody}`), so an attacker cannot slide the window forward
 * without invalidating the signature. A stale-but-correctly-signed delivery is
 * rejected as REPLAY rather than processed, which is the required behaviour.
 *
 * @param {object} params
 * @param {Buffer|string} params.rawBody   Exact bytes Stripe signed.
 * @param {string} params.header           The `Stripe-Signature` header.
 * @param {string} params.secret          `whsec_...` signing secret (INV-2).
 * @param {number} [params.toleranceSeconds]
 * @param {number} [params.nowMs]          Injectable clock for deterministic tests.
 * @returns {{ timestamp: number }}
 */
function verifyStripeSignature({ rawBody, header, secret, toleranceSeconds = REPLAY_WINDOW_SECONDS, nowMs = Date.now() }) {
    if (!secret) {
        throw new WebhookVerificationError('WEBHOOK_SIGNING_SECRET_UNAVAILABLE', { status: 503 });
    }
    const parsed = parseStripeSignatureHeader(header);
    if (!parsed) {
        throw new WebhookVerificationError('STRIPE_SIGNATURE_MALFORMED', { reason: 'unparseable_header' });
    }

    const tolerance = Math.min(Math.max(Number(toleranceSeconds) || REPLAY_WINDOW_SECONDS, 1), REPLAY_WINDOW_SECONDS);
    const ageSeconds = Math.abs(Math.floor(nowMs / 1000) - parsed.timestamp);
    if (ageSeconds > tolerance) {
        throw new WebhookVerificationError('STRIPE_SIGNATURE_REPLAY_WINDOW', {
            reason: 'timestamp_outside_tolerance',
        });
    }

    const payload = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody ?? ''), 'utf8');
    const expected = crypto
        .createHmac('sha256', secret)
        .update(`${parsed.timestamp}.${payload.toString('utf8')}`)
        .digest('hex');

    // A valid Stripe delivery may rotate keys and therefore carry multiple v1
    // signatures; ANY match is a pass. Each comparison stays constant-time.
    const matched = parsed.signatures.some(candidate => timingSafeCompare(expected, candidate));
    if (!matched) {
        throw new WebhookVerificationError('STRIPE_SIGNATURE_INVALID', { reason: 'hmac_mismatch' });
    }
    return { timestamp: parsed.timestamp };
}

/**
 * Maps a caught error to the only two things an HTTP client may learn: a
 * transport status and a fixed code. Provider/stack detail is dropped here, not
 * at each call site, so a future call site cannot forget.
 */
function toWebhookRejection(error) {
    if (error instanceof WebhookVerificationError) {
        return { status: error.status, code: error.code, reason: error.reason };
    }
    // Anything unexpected is reported as a generic bad signature. Leaking the
    // real error (e.g. a crypto type error naming the secret) is exactly what
    // INV-2 forbids.
    return { status: 400, code: 'WEBHOOK_SIGNATURE_REJECTED', reason: 'unexpected_error' };
}

/**
 * JSON body safe to return to a webhook caller. The shape is fixed and contains
 * no provider message, no stack, and no secret.
 */
function webhookRejectionBody(code, requestId = null) {
    return { received: false, error: { code, requestId: requestId || undefined } };
}

/**
 * Persists a rejected delivery to the existing `security_audit_logs` ledger
 * (AC-2). Never throws: an audit write failing must not change the HTTP status
 * the gateway receives, and it must not mask the original rejection.
 */
async function recordWebhookRejection({
    gateway, code, reason, eventId = null, orderId = null, requestId = null, repository = null, actorUid = 'payment-gateway',
}) {
    const metadata = sanitizeAuditMetadata({
        gateway: String(gateway || '').slice(0, 64) || null,
        rejectionCode: code,
        rejectionReason: reason || null,
        eventId: eventId ? String(eventId).slice(0, 128) : null,
        orderId: orderId ? String(orderId).slice(0, 128) : null,
    });
    try {
        const repo = repository || require('../repositories').getRepository();
        if (typeof repo?.recordSecurityAuditLog !== 'function') return false;
        await repo.recordSecurityAuditLog({
            actorUid,
            action: 'PAYMENT_WEBHOOK_SIGNATURE_REJECTED',
            category: 'billing.payments',
            severity: 'HIGH',
            targetType: 'payment_webhook_event',
            targetId: eventId ? String(eventId).slice(0, 128) : null,
            metadata,
            requestId,
        });
        return true;
    } catch (_error) {
        // Deliberately swallowed. The rejection is already being enforced; an
        // unavailable audit sink must not convert a 400 into a 500 that the
        // gateway would then retry forever.
        return false;
    }
}

module.exports = {
    REPLAY_WINDOW_SECONDS,
    WebhookVerificationError,
    timingSafeCompare,
    sanitizeAuditMetadata,
    verifyRazorpaySignature,
    verifyStripeSignature,
    parseStripeSignatureHeader,
    toWebhookRejection,
    webhookRejectionBody,
    recordWebhookRejection,
};