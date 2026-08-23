import { useCallback, useEffect, useState } from 'react';

/**
 * Reads the public `/api/service-availability` contract, which reports which
 * integrations the backend can actually serve right now. This is the single
 * source of truth used to stop the product from advertising a provider that
 * would fail with "API route not found", a 404, or a 502 when clicked.
 *
 * The endpoint is intentionally public and secret-free: it only reports
 * booleans derived from the same operational-status collector that powers the
 * Admin Platform Health console, so the customer-facing UI and the admin
 * console can never disagree about what is usable.
 *
 * States returned by `status`:
 *   'loading'     – no answer yet; callers should not yet make a claim.
 *   'ready'       – `availability` reflects a real backend check.
 *   'unavailable' – the check could not be made. `availability` stays null and
 *                   callers fall back to their configured flags rather than
 *                   inventing an "everything works" answer.
 */

const AVAILABILITY_URL = '/api/service-availability';

export function useServiceAvailability() {
    const [availability, setAvailability] = useState(null);
    const [status, setStatus] = useState('loading');

    const load = useCallback(async (signal) => {
        try {
            const response = await fetch(AVAILABILITY_URL, { cache: 'no-store', signal });
            if (!response.ok) throw new Error(`Availability check failed with ${response.status}`);
            const data = await response.json();
            if (!data || data.success !== true) throw new Error('Availability check returned an unusable payload');
            setAvailability({
                checkedAt: data.checkedAt || null,
                auth: data.auth || {},
                payments: data.payments || {},
                enterpriseTenancy: Boolean(data.enterpriseTenancy),
            });
            setStatus('ready');
        } catch (error) {
            if (error?.name === 'AbortError') return;
            setAvailability(null);
            setStatus('unavailable');
        }
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        load(controller.signal);
        return () => controller.abort();
    }, [load]);

    return { availability, status, reload: load };
}

/**
 * Combines a configured flag with the live backend answer.
 *
 * - Configured OFF always wins: an operator disabling a provider is respected.
 * - Configured ON plus a live "not usable" answer resolves to false, which is
 *   the fix for buttons that used to render and then fail on click.
 * - When the live answer is unknown we return the configured flag unchanged.
 *   We never upgrade an unknown into an enabled claim.
 */
export function resolveUsable(configuredEnabled, liveUsable, status) {
    if (!configuredEnabled) return false;
    if (status !== 'ready') return Boolean(configuredEnabled);
    return liveUsable === true;
}

export default useServiceAvailability;
