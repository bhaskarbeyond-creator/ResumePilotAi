/**
 * DIR-022 / AC-4 — Candidate renewal-recovery banner logic.
 *
 * WHY THE LOGIC IS EXTRACTED
 * --------------------------
 * The banner's only real risk is LYING. If it renders a deadline that is not the
 * server's authoritative `paymentGraceUntil`, or claims a grace period the
 * account does not actually have, the platform is telling a customer their
 * access is safe when it is not — or warning them when nothing is wrong. So the
 * decision is a pure function, unit tested against the exact strings the server
 * sends, and the component renders only what this returns.
 *
 * RULES
 * -----
 *   visible: PAST_DUE *and* a future deadline. Nothing else shows a banner —
 *   an ACTIVE user is never nagged, and a PAST_DUE user whose window already
 *   closed must not be told they have time left.
 *
 * WHY daysLeft FLOORS RATHER THAN CEILS
 * -------------------------------------
 * This number is a deadline the customer is asked to beat. A live E2E run caught
 * the rounding bug this comment exists to prevent: with a 72-hour window the
 * browser clock sat a millisecond behind the database clock, `Math.ceil` then
 * reported 4 days remaining for a 3-day grace period. Over-promising time is the
 * dangerous direction — a candidate reads "4 days", does nothing, and loses
 * access while believing they were safe. Flooring can only ever UNDER-promise,
 * and `Math.max(1, …)` keeps a sub-day window from rendering as "0 days".
 */

/** States the server may report that mean "renewal needs attention". */
const RECOVERY_STATUSES = new Set(['PAST_DUE']);

/** Days remaining when the server deadline is closer than a whole day. */
const MIN_DAYS_LEFT = 1;

/**
 * @param {object} profile The authenticated candidate's authoritative profile.
 * @param {number} [nowMs] Injectable clock for deterministic tests.
 * @returns {{visible: boolean, daysLeft: number, graceUntil: string|null,
 *            paymentStatus: string|null, title: string, message: string}|null}
 */
export function buildGracePeriodNotice(profile, nowMs = Date.now()) {
    if (!profile || typeof profile !== 'object') return null;

    const paymentStatus = String(profile.paymentStatus || '').toUpperCase();
    if (!RECOVERY_STATUSES.has(paymentStatus)) return null;

    // A deadline we cannot parse is treated as "no window". Showing a banner
    // with no real deadline behind it would be the fabricated claim this module
    // exists to prevent.
    const deadlineMs = Date.parse(profile.paymentGraceUntil || '');
    if (!Number.isFinite(deadlineMs) || deadlineMs <= nowMs) return null;

    const remainingMs = deadlineMs - nowMs;
    const daysLeft = Math.max(MIN_DAYS_LEFT, Math.floor(remainingMs / 86_400_000));

    return {
        visible: true,
        daysLeft,
        graceUntil: new Date(deadlineMs).toISOString(),
        paymentStatus,
        title: 'Your subscription renewal failed',
        message: `Your subscription renewal failed. Please update your payment method within ${daysLeft} day${daysLeft === 1 ? '' : 's'} to maintain uninterrupted Pro features.`,
    };
}

export default buildGracePeriodNotice;