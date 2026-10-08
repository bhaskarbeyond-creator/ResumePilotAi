/**
 * DIR-026 / AC-2: the live unread-message count for navigation badges.
 *
 * WHAT WAS ACTUALLY BROKEN:
 *   This hook returned a bare `number`, but every consumer destructured an
 *   object — `ProfileDisplay.jsx:34` does `const { unreadCount } = ...`, which
 *   destructures `undefined` from `0` and therefore rendered NO badge ever, on
 *   any conversation, for any user. The shell also had no polling cadence and no
 *   failure state at all. Both are fixed here.
 *
 * SHAPE (stable, object-returning):
 *   `unreadCount` — a real MariaDB count from `GET /api/messages/conversations`
 *                   (`totalUnread`), NOT a client-side guess.
 *   `error`       — a non-empty string when the last read failed.
 *   `status`      — 'loading' | 'ready' | 'error'.
 *   `enabled`     — the administrator's authoritative module flag.
 *   `refresh()`   — manual re-read, used on route focus.
 *
 * FAILURE IS VISIBLE, NOT HIDDEN (mirrors M3NotificationCenter):
 *   A transport error or a 403 MODULE_DISABLED sets `error` and leaves
 *   `unreadCount` at its last known value. It NEVER silently reports 0, because
 *   "I could not reach the server" and "you have no unread messages" are
 *   different facts and rendering the badge as though nothing is unread would be
 *   a fabricated claim about the user's own inbox.
 *
 * WHY IT NEVER POLLS A DISABLED MODULE:
 *   `getSystemSettings()` is the authoritative MariaDB read. While the flag is
 *   off the hook is inert, so a disabled module issues no messaging traffic at
 *   all — matching the AC-4 server gate rather than racing it with 403s.
 *
 * DIR-054 — WHY POLLING IS NO LONGER PER-INSTANCE:
 *   Four components mount this hook on one dashboard render, and each used to own
 *   a private `setInterval(refresh, 15000)`: 16 req/min against a 30-per-5-minute
 *   messaging budget, so the quota died in under two minutes and every later tick
 *   logged another `429 (Too Many Requests)`. The schedule, the in-flight read and
 *   the snapshot are now SHARED module singletons (see
 *   `unreadMessagesPoller.js`), so any number of consumers produce exactly one
 *   request per tick, back off exponentially when the endpoint pushes back, honour
 *   `Retry-After`, and recover to the 15s cadence on the first success.
 */
import { useState, useEffect, useCallback } from 'react';
import { apiJson, getSystemSettings } from '../services/api/platform';
import { resolveMessagesVisibility } from '../utils/moduleFlags';
import { createUnreadMessagesPoller, MAX_POLL_BACKOFF_MS } from './unreadMessagesPoller';

const POLL_INTERVAL_MS = 15000;
const MODULE_FLAG_POLL_MS = 60000;

// ── DIR-054: ONE shared poller and ONE shared module-flag read per app ───────
// These live at module scope deliberately: a module is evaluated once per bundle,
// so every mounted consumer shares the same scheduler, the same in-flight read
// and the same snapshot instead of racing four private loops at the endpoint.
const sharedUnreadPoller = createUnreadMessagesPoller({ intervalMs: POLL_INTERVAL_MS });

const moduleFlagListeners = new Set();
// `enabled: null` is "not resolved yet" — distinct from a resolved `false` — so a
// consumer can hold the module OFF until the administrator's flag is confirmed.
const moduleFlag = { enabled: null, timer: null, inflight: null };

function publishModuleFlag() {
    for (const listener of [...moduleFlagListeners]) listener(moduleFlag.enabled);
}

/**
 * The administrator's authoritative module flag, resolved once per minute for the
 * WHOLE app. Each of the four mounting components used to run its own 60-second
 * settings loop, so the same MariaDB document was re-read four times a minute.
 */
function readModuleFlag() {
    if (moduleFlag.inflight) return moduleFlag.inflight;
    moduleFlag.inflight = getSystemSettings()
        .then((settings) => { moduleFlag.enabled = resolveMessagesVisibility(settings) === true; })
        // Fail CLOSED: an unreadable settings document must not enable a module
        // the administrator may have switched off.
        .catch(() => { moduleFlag.enabled = false; })
        .finally(() => { moduleFlag.inflight = null; publishModuleFlag(); });
    return moduleFlag.inflight;
}

function subscribeModuleFlag(listener) {
    moduleFlagListeners.add(listener);
    if (moduleFlagListeners.size === 1) {
        readModuleFlag();
        moduleFlag.timer = setInterval(readModuleFlag, MODULE_FLAG_POLL_MS);
    }
    listener(moduleFlag.enabled);
    return () => {
        moduleFlagListeners.delete(listener);
        if (moduleFlagListeners.size === 0 && moduleFlag.timer !== null) {
            clearInterval(moduleFlag.timer);
            moduleFlag.timer = null;
        }
    };
}

/** The server's own back-off instruction (`Retry-After`), in milliseconds. */
function retryAfterMs(loadError) {
    const seconds = Number(loadError?.retryAfter);
    if (!Number.isFinite(seconds) || seconds <= 0) return 0;
    return Math.min(seconds * 1000, MAX_POLL_BACKOFF_MS);
}

export function useUnreadMessages({ enabled: enabledOverride } = {}) {
    const [unreadCount, setUnreadCount] = useState(0);
    const [error, setError] = useState('');
    const [status, setStatus] = useState('loading');
    const [moduleEnabled, setModuleEnabled] = useState(false);

    // `undefined` means "not resolved yet" and is distinct from a resolved
    // `false`, so the badge never polls before it knows the module is on.
    const [override, setOverride] = useState(enabledOverride);
    const enabled = override === undefined ? moduleEnabled : override === true;

    useEffect(() => { setOverride(enabledOverride); }, [enabledOverride]);

    // The one place this hook's React state is written from the shared snapshot,
    // so every consumer renders exactly the same count and state.
    const applySnapshot = useCallback((snapshot) => {
        setUnreadCount(snapshot.unreadCount);
        setError(snapshot.error);
        setStatus(snapshot.status);
    }, []);

    /**
     * The single network read, injected into the shared poller. It resolves to an
     * OUTCOME rather than throwing, because the poller needs the difference
     * between "read" and "rate-limited, retry after N seconds" to pick its delay.
     * The local setState calls keep this instance's badge immediate; the poller
     * then broadcasts the same values to every other instance.
     */
    const pollUnreadCount = useCallback(async () => {
        try {
            const data = await apiJson('/api/messages/conversations');
            // The server total is authoritative. `Number(...) || 0` is safe here
            // because a malformed value genuinely means "no readable count",
            // and unlike a transport failure it is NOT an unknown state.
            return { ok: true, unreadCount: Number(data?.totalUnread) || 0 };
        } catch (loadError) {
            setError(loadError?.message || 'Messaging is unavailable.');
            setStatus('error');
            return {
                ok: false,
                error: loadError?.message || 'Messaging is unavailable.',
                retryAfterMs: retryAfterMs(loadError),
            };
        }
    }, []);

    const refresh = useCallback(() => sharedUnreadPoller.refreshNow(), []);


    /**
     * Mirror of the shared flag. `null` means "not resolved yet": the hook holds
     * the module OFF until the flag is confirmed, and the shared resolver itself
     * fails CLOSED on a settings outage, so a disabled module is never polled.
     */
    const applyModuleFlag = useCallback((flagEnabled) => {
        if (flagEnabled === null) {
            setModuleEnabled(false);
            return;
        }
        setModuleEnabled(flagEnabled === true);
    }, []);

    useEffect(() => subscribeModuleFlag(applyModuleFlag), [applyModuleFlag]);

    useEffect(() => {
        if (!enabled) {
            setUnreadCount(0);
            setError('');
            setStatus('ready');
            return undefined;
        }
        setStatus('loading');
        // DIR-054: subscribing to the SHARED poller both performs the immediate
        // read (first subscriber only) and streams every later snapshot into this
        // instance. No instance owns a timer of its own, so N consumers still
        // issue exactly one request per tick.
        const unsubscribe = sharedUnreadPoller.subscribe(applySnapshot, pollUnreadCount);
        // Re-read on route focus so the badge is correct the moment a user
        // navigates back to a shell that was mounted earlier. Every mounted
        // instance registers this listener, and the poller coalesces them into a
        // single request.
        if (typeof window !== 'undefined') {
            window.addEventListener('focus', refresh);
        }
        return () => {
            unsubscribe();
            if (typeof window !== 'undefined') window.removeEventListener('focus', refresh);
        };
    }, [enabled, applySnapshot, pollUnreadCount, refresh]);

    return { unreadCount, error, status, enabled, refresh };
}

export default useUnreadMessages;
