/**
 * QuotaRing — Phase 6 AI quota visualisation.
 *
 * HONESTY CONTRACT (§20, §46): this ring renders ONLY numbers the tenant API
 * actually returned. It has three distinct outcomes and never collapses between
 * them:
 *
 *   measured  → used and limit both known: a real percentage is shown.
 *   unknown   → the limit or usage could not be read: "—" is shown, explicitly
 *               labelled as unavailable. It is NEVER drawn as 0%, because an
 *               unreadable quota is not an unused quota.
 *   error     → the read failed: an explicit unavailable state with retry.
 *
 * A ring at 0% is a real claim ("no quota used") and is therefore only ever
 * produced from a real measured 0.
 */

export const QUOTA_RING_STATES = Object.freeze({
    MEASURED: 'measured',
    UNKNOWN: 'unknown',
    ERROR: 'error',
});

const toFinite = (value) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
};

/**
 * Derives the ring state from raw tenant payloads.
 * Exported separately so the truthfulness rules are unit-testable without
 * rendering, exactly like `briefingLogic.js` in Phase 4.
 *
 * @param {object|null} configuration response of /api/enterprise/configuration
 * @param {object|null} usage         response of /api/enterprise/usage/ai
 * @param {string|null} error         failure message, if the read failed
 */
export function deriveQuota({ configuration, usage, error } = {}) {
    if (error) {
        return { state: QUOTA_RING_STATES.ERROR, percent: null, used: null, limit: null, label: 'Quota unavailable' };
    }

    const limit = toFinite(configuration?.configuration?.quotaPolicy?.aiRequestsPerDay);
    const used = toFinite(usage?.requests ?? usage?.totalRequests ?? usage?.requestCount);

    if (limit === null || used === null) {
        // An absent or malformed figure is an absent measurement.
        return { state: QUOTA_RING_STATES.UNKNOWN, percent: null, used, limit, label: 'Quota not reported' };
    }

    if (limit === 0) {
        // A zero limit is a real configuration state, not a missing value.
        return {
            state: QUOTA_RING_STATES.MEASURED,
            percent: 100,
            used,
            limit,
            label: 'No daily AI allowance is configured for this tenant.',
        };
    }

    const percent = Math.min(100, Math.round((used / limit) * 100));
    return {
        state: QUOTA_RING_STATES.MEASURED,
        percent,
        used,
        limit,
        label: `${used} of ${limit} daily AI requests used (${percent}%).`,
    };
}

/** Maps a measured percentage onto a semantic tone. */
export function quotaTone(percent) {
    if (percent === null) return 'neutral';
    if (percent >= 90) return 'danger';
    if (percent >= 75) return 'warning';
    return 'success';
}

export default deriveQuota;
