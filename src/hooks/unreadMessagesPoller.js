/**
 * DIR-054: the SHARED, COALESCED unread-message poller.
 *
 * WHY THIS MODULE EXISTS
 *   Four independent components mount `useUnreadMessages()` on a single
 *   dashboard render — `CubaCandidateShell.jsx:170`, `MessagesNavBadge.jsx:74`,
 *   `ProfileDisplay.jsx:34` and `EmployerSidebar.jsx:194`. Before this module
 *   each instance owned its own `setInterval(refresh, 15000)`, so one open tab
 *   issued 4 requests per tick = 16 req/min = 80 requests per 5-minute window
 *   against the messaging quota, exhausting it in under two minutes and then
 *   flooding the console with `429 (Too Many Requests)` on every later tick.
 *
 *   The scheduler here is a SINGLETON: however many consumers subscribe, exactly
 *   ONE network read is dispatched per interval, concurrent subscribers are
 *   coalesced onto the single in-flight promise, and one shared snapshot is
 *   broadcast to all of them.
 *
 * WHY THE BACKOFF LADDER IS HERE AND NOT IN THE HOOK
 *   A fixed 15-second interval is what produced the storm: after the quota was
 *   exhausted every tick re-attempted immediately and permanently. The ladder
 *   (15s -> 30s -> 60s -> 120s -> 240s, capped at 300s) plus a genuine
 *   `Retry-After` honour means a rate-limited or unreachable endpoint is
 *   re-probed ever more slowly instead of being hammered, and a single
 *   successful read resets the cadence to 15s.
 *
 * PURITY CONTRACT
 *   This module performs NO I/O and imports NOTHING from React. The network read
 *   is injected by the subscriber, and the clock/timers are injectable, so the
 *   whole coalescing + backoff contract is executed for real in
 *   `tests/dir054-shared-poller.test.mjs` with a virtual clock rather than being
 *   asserted as source text.
 */

/** The steady-state cadence, mirrored by `POLL_INTERVAL_MS` in the hook. */
export const DEFAULT_POLL_INTERVAL_MS = 15000;

/** No retry is ever scheduled further out than five minutes. */
export const MAX_POLL_BACKOFF_MS = 300000;

/**
 * The retry delay for the next tick.
 *
 * `failures` is the number of consecutive failed reads, so the ladder is
 * `intervalMs * 2^failures` (15s, 30s, 60s, 120s, 240s ...) clamped to
 * `maxDelayMs` (300s). A server-supplied `Retry-After` is honoured as a FLOOR —
 * never a shorter wait than the ladder chose — because backing off less than the
 * server asked is precisely what produces a 429 storm. The result is never
 * shorter than the steady-state interval.
 */
export function nextPollDelayMs({
    failures = 0,
    retryAfterMs = 0,
    intervalMs = DEFAULT_POLL_INTERVAL_MS,
    maxDelayMs = MAX_POLL_BACKOFF_MS,
} = {}) {
    const base = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : DEFAULT_POLL_INTERVAL_MS;
    const ceiling = Number.isFinite(maxDelayMs) && maxDelayMs >= base ? maxDelayMs : MAX_POLL_BACKOFF_MS;
    const steps = Math.max(0, Math.trunc(Number(failures) || 0));
    // 2**5 already exceeds the 300s ceiling for a 15s base; the clamp below is
    // what keeps the ladder finite rather than the exponent guard alone.
    const ladderMs = Math.min(base * (2 ** Math.min(steps, 5)), ceiling);
    const honouredMs = Number.isFinite(retryAfterMs) && retryAfterMs > 0
        ? Math.min(retryAfterMs, ceiling)
        : 0;
    return Math.max(base, ladderMs, honouredMs);
}

/**
 * The shared poller. One instance is created at module scope by
 * `useUnreadMessages.js`; tests create their own with a virtual clock.
 *
 * `poll()` must never reject and returns one of:
 *   `{ ok: true,  unreadCount }`                 — a real read
 *   `{ ok: false, error, retryAfterMs? }`        — a failed read
 *
 * The returned object's `getStats()` is an observability/evidence surface: it
 * reports how many reads were actually dispatched, which is how a coalescing
 * regression becomes measurable instead of theoretical.
 */
export function createUnreadMessagesPoller(options = {}) {
    const {
        intervalMs = DEFAULT_POLL_INTERVAL_MS,
        maxDelayMs = MAX_POLL_BACKOFF_MS,
        nowFn = () => Date.now(),
        setTimeoutFn = (fn, ms) => setTimeout(fn, ms),
        clearTimeoutFn = (handle) => clearTimeout(handle),
    } = options;

    const subscribers = new Set();
    // The last known values. On failure the COUNT is deliberately left untouched:
    // "I could not read your inbox" and "you have no unread messages" are
    // different facts, and rendering the second when only the first is true
    // would be a fabricated claim about the user's own mail.
    let snapshot = { unreadCount: 0, error: '', status: 'loading' };
    let poll = null;
    let failures = 0;
    let timer = null;
    let inflight = null;
    let retryNotBeforeMs = 0;
    let readsDispatched = 0;
    let lastReadAtMs = 0;

    function publish(next) {
        snapshot = { ...snapshot, ...next };
        for (const listener of [...subscribers]) listener(snapshot);
    }

    function clearScheduled() {
        if (timer !== null) {
            clearTimeoutFn(timer);
            timer = null;
        }
    }

    function scheduleNext() {
        if (subscribers.size === 0) return;
        clearScheduled();
        const pendingRetryMs = Math.max(0, retryNotBeforeMs - nowFn());
        const delayMs = nextPollDelayMs({ failures, retryAfterMs: pendingRetryMs, intervalMs, maxDelayMs });
        timer = setTimeoutFn(() => {
            timer = null;
            runOnce();
        }, delayMs);
    }

    /**
     * One coalesced read. Returns the shared in-flight promise when a read is
     * already running, so a burst of subscribers (or a focus event that every
     * mounted instance hears) produces exactly one request.
     */
    function runOnce() {
        if (subscribers.size === 0 || typeof poll !== 'function') return Promise.resolve(snapshot);
        if (inflight) return inflight;

        inflight = (async () => {
            readsDispatched += 1;
            lastReadAtMs = nowFn();
            let outcome;
            try {
                outcome = await poll();
            } catch (unexpected) {
                outcome = { ok: false, error: unexpected?.message || 'Messaging is unavailable.' };
            }

            if (outcome?.ok === true) {
                failures = 0;
                retryNotBeforeMs = 0;
                publish({ unreadCount: Number(outcome.unreadCount) || 0, error: '', status: 'ready' });
            } else {
                failures += 1;
                const honouredMs = Number(outcome?.retryAfterMs) > 0
                    ? Math.min(Number(outcome.retryAfterMs), maxDelayMs)
                    : 0;
                retryNotBeforeMs = honouredMs > 0 ? nowFn() + honouredMs : 0;
                publish({ error: outcome?.error || 'Messaging is unavailable.', status: 'error' });
            }

            scheduleNext();
            return snapshot;
        })().finally(() => { inflight = null; });

        return inflight;
    }

    /**
     * A manual re-read (route focus, or a consumer's `refresh()`). It is coalesced
     * like any other read AND it refuses to run before a server-issued
     * `Retry-After` deadline, because a user clicking around must not be turned
     * into the very 429 the deadline exists to prevent.
     */
    function refreshNow() {
        if (nowFn() < retryNotBeforeMs) return Promise.resolve(snapshot);
        return runOnce();
    }

    function unsubscribe(listener) {
        subscribers.delete(listener);
        if (subscribers.size === 0) {
            clearScheduled();
            poll = null;
            failures = 0;
            retryNotBeforeMs = 0;
        }
    }

    function subscribe(listener, pollFn) {
        if (typeof pollFn === 'function') poll = pollFn;
        subscribers.add(listener);
        // A late mount renders the current shared state immediately instead of
        // flashing an empty badge until the next tick.
        listener(snapshot);
        if (subscribers.size === 1) {
            failures = 0;
            runOnce();
        }
        return () => unsubscribe(listener);
    }

    return {
        subscribe,
        unsubscribe,
        refreshNow,
        getSnapshot: () => ({ ...snapshot }),
        getStats: () => ({
            subscriberCount: subscribers.size,
            readsDispatched,
            failures,
            inflight: inflight !== null,
            scheduled: timer !== null,
            lastReadAtMs,
            retryNotBeforeMs,
        }),
    };
}
