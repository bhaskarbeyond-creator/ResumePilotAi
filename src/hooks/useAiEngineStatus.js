import { useCallback, useEffect, useRef, useState } from 'react';
import { AI_STATUS } from '../components/cuba/aiStatus';

/**
 * AI capability status, sourced from REAL telemetry only (§20, §46).
 *
 * Source of truth: `GET /api/service-availability` — the existing public,
 * secret-free, boolean-only projection produced by the same health collector
 * that powers the Admin Platform Health console. This hook adds no new endpoint,
 * sends no new credentials, and cannot become a second, disagreeing opinion
 * about platform health.
 *
 * IMPORTANT HONESTY CONSTRAINT:
 *   `ai-providers` is collected as an OPERATIONAL / UNKNOWN / NOT_CONFIGURED /
 *   DISABLED state. It carries NO latency and NO success percentage, and none is
 *   synthesised here. If the check cannot complete, the answer is
 *   AI_STATUS.UNKNOWN — never "ready".
 */
const AVAILABILITY_URL = '/api/service-availability';
const POLL_MS = 120000;

const readAiSignal = (payload) => {
    const ai = payload?.ai;
    if (typeof ai === 'boolean') return ai ? AI_STATUS.READY : AI_STATUS.UNAVAILABLE;
    if (ai && typeof ai === 'object') {
        if (typeof ai.providers === 'boolean') return ai.providers ? AI_STATUS.READY : AI_STATUS.UNAVAILABLE;
        if (typeof ai.available === 'boolean') return ai.available ? AI_STATUS.READY : AI_STATUS.UNAVAILABLE;
        if (typeof ai.degraded === 'boolean' && ai.degraded) return AI_STATUS.DEGRADED;
    }
    // The contract does not (yet) carry an AI signal. That is an absent
    // measurement, so it maps to UNKNOWN rather than to a guess.
    return AI_STATUS.UNKNOWN;
};

export function useAiEngineStatus({ enabled = true } = {}) {
    const [status, setStatus] = useState(AI_STATUS.CHECKING);
    const abortRef = useRef(null);

    const check = useCallback(async (signal) => {
        if (!enabled) {
            setStatus(AI_STATUS.UNKNOWN);
            return;
        }
        try {
            const response = await fetch(AVAILABILITY_URL, { cache: 'no-store', signal });
            if (!response.ok) throw new Error(`availability ${response.status}`);
            const payload = await response.json();
            if (!payload || payload.success !== true) throw new Error('availability payload unusable');
            setStatus(readAiSignal(payload));
        } catch (error) {
            if (error?.name === 'AbortError') return;
            // Unknown is not "fine". A failed check must never read as healthy.
            setStatus(AI_STATUS.UNKNOWN);
        }
    }, [enabled]);

    useEffect(() => {
        if (!enabled) {
            setStatus(AI_STATUS.UNKNOWN);
            return undefined;
        }
        const controller = new AbortController();
        abortRef.current = controller;
        check(controller.signal);
        const timer = setInterval(() => check(controller.signal), POLL_MS);
        return () => {
            clearInterval(timer);
            controller.abort();
            abortRef.current = null;
        };
    }, [check, enabled]);

    return status;
}

export default useAiEngineStatus;
