import { useCallback, useEffect, useRef, useState } from 'react';
import { authenticatedJsonRequest } from '../services/aiService';

/**
 * The signed-in user's OWN daily AI allowance, for the menubar meter.
 *
 * Source of truth: `GET /api/ai-usage` (see `backend/routes/ai.js`). That route
 * delegates to the SAME MariaDB-backed `getUserAiEntitlement` resolver the
 * admin console already trusts, so the number shown in the menubar and the
 * number that actually gates the user's next AI request cannot disagree
 * (INV-3 — quota is never reimplemented client-side).
 *
 * This hook deliberately does NOT:
 *   - invent a limit, a percentage, or a "tokens" figure the backend never
 *     returned (§46 — no fabricated telemetry);
 *   - poll anything that consumes the AI quota it is reporting, which is why
 *     the endpoint sits at `/api/ai-usage` and not under `/api/ai`.
 *
 * HONESTY NOTE: the platform meters AI allowance in REQUESTS PER DAY, not in
 * tokens. The UI says "requests" for exactly that reason.
 */
const USAGE_URL = '/api/ai-usage';
const POLL_MS = 60_000;

export const AI_USAGE_STATUS = Object.freeze({
    LOADING: 'loading',
    READY: 'ready',
    UNAVAILABLE: 'unavailable',
});

const EMPTY_USAGE = Object.freeze({
    plan: null,
    usedToday: 0,
    effectiveLimit: 0,
    remainingToday: 0,
    isExhausted: false,
    lastResetAt: null,
    // DIR-106: which budget the figure came from.
    quotaScope: 'UNKNOWN',
    orgDailyLimit: null,
});

const toCount = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
};

export function useAiTokenUsage({ enabled = true } = {}) {
    const [status, setStatus] = useState(AI_USAGE_STATUS.LOADING);
    const [usage, setUsage] = useState(EMPTY_USAGE);
    const abortRef = useRef(null);

    const load = useCallback(async (signal) => {
        if (!enabled) {
            setUsage(EMPTY_USAGE);
            setStatus(AI_USAGE_STATUS.UNAVAILABLE);
            return;
        }
        try {
            const payload = await authenticatedJsonRequest(USAGE_URL, { method: 'GET', signal });
            const raw = payload?.usage;
            if (!raw || typeof raw !== 'object') throw new Error('usage payload unusable');
            setUsage({
                plan: raw.plan || null,
                usedToday: toCount(raw.usedToday),
                effectiveLimit: toCount(raw.effectiveLimit),
                remainingToday: toCount(raw.remainingToday),
                isExhausted: raw.isExhausted === true,
                lastResetAt: raw.lastResetAt || null,
                // DIR-106: the server tells us whether this is an organization
                // allowance or a personal plan; the client never guesses.
                quotaScope: raw.quotaScope === 'ORGANIZATION' ? 'ORGANIZATION' : 'INDIVIDUAL',
                orgDailyLimit: raw.orgDailyLimit == null ? null : toCount(raw.orgDailyLimit),
            });
            if (raw.tenantId) {
                try {
                    if (typeof sessionStorage !== 'undefined' && !sessionStorage.getItem('activeTenantId')) {
                        sessionStorage.setItem('activeTenantId', raw.tenantId);
                    }
                    if (typeof localStorage !== 'undefined' && !localStorage.getItem('activeTenantId')) {
                        localStorage.setItem('activeTenantId', raw.tenantId);
                    }
                } catch (_) {}
            }
            setStatus(AI_USAGE_STATUS.READY);
        } catch (error) {
            if (error?.name === 'AbortError') return;
            // An unreadable ledger must read as "unknown", never as a
            // comfortable zero — otherwise the meter would claim unlimited
            // headroom at exactly the moment the platform cannot prove any.
            setUsage(EMPTY_USAGE);
            setStatus(AI_USAGE_STATUS.UNAVAILABLE);
        }
    }, [enabled]);

    useEffect(() => {
        if (!enabled) {
            setUsage(EMPTY_USAGE);
            setStatus(AI_USAGE_STATUS.UNAVAILABLE);
            return undefined;
        }
        const controller = new AbortController();
        abortRef.current = controller;
        load(controller.signal);
        const timer = setInterval(() => load(controller.signal), POLL_MS);
        return () => {
            clearInterval(timer);
            controller.abort();
            abortRef.current = null;
        };
    }, [load, enabled]);

    return { status, ...usage };
}

export default useAiTokenUsage;
