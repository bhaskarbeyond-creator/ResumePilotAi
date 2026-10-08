// @ts-check
/**
 * DIR-054 regression battery: the shared poller, its backoff ladder, the
 * `Retry-After` circuit breaker, and the read/mutation limiter split.
 *
 * WHY THESE ARE EXECUTED RATHER THAN GREPPED
 *   The defect this directive closes was a *cadence* defect: four components each
 *   polling every 15 seconds. A source assertion cannot see a cadence, so the
 *   poller takes an injectable clock and these tests drive it with a virtual one:
 *   the read count per interval is measured, not asserted from prose.
 *
 * The last group pins the wire contract (limiter namespaces, the method-aware
 * mount, the attached `Retry-After`), because those are the parts a future edit
 * could silently undo without any behavioural test noticing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
    createUnreadMessagesPoller,
    nextPollDelayMs,
    DEFAULT_POLL_INTERVAL_MS,
    MAX_POLL_BACKOFF_MS,
} from '../src/hooks/unreadMessagesPoller.js';

/** Drains the microtask/macrotask queue so a resolved poll has published. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

/**
 * A deterministic clock. No real timers are created and no test waits: `advance`
 * fires every due timer in chronological order, flushing between each so the
 * poller can schedule its next tick exactly as it would in a browser.
 */
function createVirtualClock() {
    let now = 0;
    let seq = 0;
    const timers = new Map();
    return {
        nowFn: () => now,
        setTimeoutFn: (fn, ms) => {
            const id = ++seq;
            timers.set(id, { at: now + ms, fn });
            return id;
        },
        clearTimeoutFn: (id) => { timers.delete(id); },
        scheduledCount: () => timers.size,
        nextDelayMs: () => {
            let best = Infinity;
            for (const timer of timers.values()) best = Math.min(best, timer.at - now);
            return best === Infinity ? null : best;
        },
        nextAtMs: () => {
            let best = Infinity;
            for (const timer of timers.values()) best = Math.min(best, timer.at);
            return best === Infinity ? null : best;
        },
        async advance(ms) {
            const target = now + ms;
            for (;;) {
                let nextId = null;
                let nextAt = Infinity;
                for (const [id, timer] of timers) {
                    if (timer.at <= target && timer.at < nextAt) {
                        nextAt = timer.at;
                        nextId = id;
                    }
                }
                if (nextId === null) break;
                const timer = timers.get(nextId);
                timers.delete(nextId);
                now = timer.at;
                timer.fn();
                await flush();
            }
            now = target;
            await flush();
        },
    };
}

/**
 * A poller wired to a virtual clock that records when each read was dispatched.
 * `respond` decides the outcome of read N, so a test can script a failure run.
 */
function createHarness(respond) {
    const clock = createVirtualClock();
    const readAtMs = [];
    const poller = createUnreadMessagesPoller({
        intervalMs: DEFAULT_POLL_INTERVAL_MS,
        maxDelayMs: MAX_POLL_BACKOFF_MS,
        nowFn: clock.nowFn,
        setTimeoutFn: clock.setTimeoutFn,
        clearTimeoutFn: clock.clearTimeoutFn,
    });
    const poll = async () => {
        readAtMs.push(clock.nowFn());
        return respond(readAtMs.length);
    };
    return { clock, poller, poll, readAtMs };
}


/* ───────────────────────── backoff ladder maths ──────────────────────────── */

test('DIR-054: the retry ladder is 15s -> 30s -> 60s -> 120s -> 240s, capped at 300s', () => {
    const observed = [0, 1, 2, 3, 4, 5, 6].map((failures) => nextPollDelayMs({ failures }));
    assert.deepEqual(observed, [15000, 30000, 60000, 120000, 240000, 300000, 300000]);
});

test('DIR-054: a server Retry-After is a floor, never a shorter wait than the ladder', () => {
    // Retry-After is longer than the ladder: the server wins.
    assert.equal(nextPollDelayMs({ failures: 0, retryAfterMs: 45000 }), 45000);
    // Retry-After is shorter than the ladder: the ladder wins, so a rate-limited
    // endpoint is never re-probed faster than the client's own escalation.
    assert.equal(nextPollDelayMs({ failures: 3, retryAfterMs: 1000 }), 120000);
    // A nonsensical Retry-After cannot push the poller past its ceiling.
    assert.equal(nextPollDelayMs({ failures: 0, retryAfterMs: 900000 }), MAX_POLL_BACKOFF_MS);
    // The steady state is never shortened, whatever the caller passes.
    assert.equal(nextPollDelayMs({ failures: 0, retryAfterMs: 0 }), DEFAULT_POLL_INTERVAL_MS);
});

/* ─────────────────────────── coalescing / cadence ────────────────────────── */

test('DIR-054: four consumers produce ONE read per tick, not four (the 429 root cause)', async () => {
    const { clock, poller, poll, readAtMs } = createHarness(() => ({ ok: true, unreadCount: 3 }));

    // The four components that mount the hook on a dashboard render.
    const seen = [];
    const unsubscribes = [0, 1, 2, 3].map((index) => poller.subscribe((snapshot) => seen.push([index, snapshot.unreadCount, snapshot.status]), poll));

    assert.equal(poller.getStats().readsDispatched, 1, 'the first subscriber performs the immediate read');
    await flush();
    assert.equal(poller.getStats().readsDispatched, 1, 'the other three subscribers reuse it');

    // Six minutes of polling, ticked in one pass.
    await clock.advance(360000);

    // 24 ticks in 6 minutes = 24 reads for the whole app. The pre-DIR-054 design
    // (four private 15s intervals) would have issued 96.
    assert.equal(readAtMs.length, 25, `expected one read per 15s tick, got ${readAtMs.length} in 6 minutes`);
    for (let index = 1; index < readAtMs.length; index += 1) {
        assert.equal(readAtMs[index] - readAtMs[index - 1], 15000, 'the steady-state cadence must stay at 15s');
    }

    // Every subscriber was told the same truth: each of the four saw every
    // completed read, and no subscriber ever saw a divergent count. (The
    // subscribe-time sync is filtered out — it legitimately carries the
    // 'loading' snapshot that the immediate read then replaces.)
    const ready = seen.filter((entry) => entry[2] === 'ready');
    assert.ok(ready.length >= 4 * 24, `every consumer must receive every tick, saw ${ready.length} ready snapshots`);
    assert.ok(ready.every(([, count]) => count === 3), 'all consumers must render the same server count');
    assert.ok(seen.every(([, count, status]) => status === 'ready' || count === 0), 'a loading snapshot may only carry the initial 0');
    poller.subscribe(() => {}, poll);
    assert.equal(poller.getStats().readsDispatched, readAtMs.length, 'a late subscriber must not trigger an extra read');

    unsubscribes.forEach((unsubscribe) => unsubscribe());
});

test('DIR-054: concurrent refreshes (a focus event heard by every instance) collapse to one request', async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const { poller, poll, readAtMs } = createHarness(() => gate.then(() => ({ ok: true, unreadCount: 0 })));

    poller.subscribe(() => {}, poll);
    assert.equal(readAtMs.length, 1, 'the in-flight read was dispatched once');

    // Four instances hear the same focus event and all call refresh(). The gate is
    // released only after all four have asked, so the assertion below proves the
    // second, third and fourth calls joined the first request rather than opening
    // new ones.
    const refreshes = Promise.all([
        poller.refreshNow(),
        poller.refreshNow(),
        poller.refreshNow(),
        poller.refreshNow(),
    ]);
    assert.equal(readAtMs.length, 1, 'a refresh during an in-flight read must not open a second request');

    release();
    await refreshes;
    await flush();
    assert.equal(readAtMs.length, 1);
    assert.equal(poller.getStats().inflight, false);
});

/* ───────────────────────── backoff / recovery behaviour ──────────────────── */

test('DIR-054: consecutive failures escalate 30s -> 60s -> 120s -> 240s -> 300s and never hammer', async () => {
    const { clock, poller, poll, readAtMs } = createHarness(() => ({ ok: false, error: 'HTTP 429' }));

    poller.subscribe(() => {}, poll);
    await flush();
    // Twenty minutes against a persistently failing endpoint: long enough for the
    // ladder to reach its ceiling and prove the cap holds for a second rung.
    await clock.advance(1200000);

    const gaps = readAtMs.slice(1).map((at, index) => at - readAtMs[index]);
    // Read 1 is the immediate mount read; the first retry already backs off to 30s
    // rather than retrying at 15s, and the ladder then escalates to the 300s cap.
    assert.deepEqual(gaps.slice(0, 6), [30000, 60000, 120000, 240000, 300000, 300000]);
    // Twenty minutes of an outage costs at most seven requests. The pre-DIR-054
    // fixed interval would have produced eighty attempts and eighty console errors.
    assert.ok(readAtMs.length <= 7, `an outage must not be hammered, saw ${readAtMs.length} reads`);
});

test('DIR-054: a 429 Retry-After is honoured exactly, and refresh() cannot jump the queue', async () => {
    const { clock, poller, poll, readAtMs } = createHarness(() => ({ ok: false, error: 'HTTP 429', retryAfterMs: 45000 }));

    poller.subscribe(() => {}, poll);
    await flush();
    assert.equal(readAtMs.length, 1);

    // 44s later the deadline has not passed: neither the timer nor a manual
    // refresh may produce a request.
    await clock.advance(44000);
    assert.equal(readAtMs.length, 1, 'the poller must not retry before the Retry-After deadline');
    await poller.refreshNow();
    await flush();
    assert.equal(readAtMs.length, 1, 'refresh() must respect the server-issued deadline');

    // Past the deadline the retry happens.
    await clock.advance(2000);
    assert.equal(readAtMs.length, 2);
    assert.equal(readAtMs[1], 45000);
});

test('DIR-054: one successful read resets the cadence to 15s and clears the error', async () => {
    const { clock, poller, poll, readAtMs } = createHarness((readIndex) => (
        readIndex <= 2
            ? { ok: false, error: 'HTTP 429', retryAfterMs: 0 }
            : { ok: true, unreadCount: 7 }
    ));
    const snapshots = [];
    poller.subscribe((snapshot) => snapshots.push({ ...snapshot }), poll);
    await flush();

    await clock.advance(95000);   // 0s fails, 30s fails, 60s succeeds
    assert.equal(poller.getStats().failures, 0, 'a success must clear the failure counter');
    // The next tick is exactly one steady-state interval after the successful read.
    assert.equal(clock.nextAtMs() - readAtMs[readAtMs.length - 1], 15000, 'the cadence must return to the steady state');
    assert.deepEqual(
        { unreadCount: poller.getSnapshot().unreadCount, status: poller.getSnapshot().status, error: poller.getSnapshot().error },
        { unreadCount: 7, status: 'ready', error: '' },
    );
    assert.ok(snapshots.some((snapshot) => snapshot.status === 'error'));
});

test('DIR-054: a failed read keeps the last known count — it never fabricates a zero inbox', async () => {
    const { clock, poller, poll } = createHarness((readIndex) => (
        readIndex === 1 ? { ok: true, unreadCount: 5 } : { ok: false, error: 'HTTP 503' }
    ));

    poller.subscribe(() => {}, poll);
    await flush();
    assert.equal(poller.getSnapshot().unreadCount, 5);

    await clock.advance(60000);
    assert.equal(poller.getSnapshot().status, 'error');
    assert.equal(poller.getSnapshot().unreadCount, 5, '"could not read" must not be rendered as "nothing unread"');
    assert.equal(poller.getSnapshot().error, 'HTTP 503');
});

test('DIR-054: the last unsubscribe stops the schedule — a closed tab issues no traffic', async () => {
    const { clock, poller, poll, readAtMs } = createHarness(() => ({ ok: true, unreadCount: 1 }));

    const unsubscribes = [0, 1, 2, 3].map(() => poller.subscribe(() => {}, poll));
    await flush();
    await clock.advance(15000);
    assert.equal(readAtMs.length, 2);

    // Unmount three of the four shells; polling must continue for the survivor.
    unsubscribes.slice(0, 3).forEach((unsubscribe) => unsubscribe());
    assert.equal(clock.scheduledCount(), 1);
    await clock.advance(15000);
    assert.equal(readAtMs.length, 3);

    // Unmount the last one: the timer is cleared and nothing else is dispatched.
    unsubscribes[3]();
    assert.equal(poller.getStats().subscriberCount, 0);
    assert.equal(clock.scheduledCount(), 0, 'the shared timer must be cleared with the last subscriber');
    await clock.advance(300000);
    assert.equal(readAtMs.length, 3);
});

/* ─────────────────────────────── wire contract ───────────────────────────── */

const readSource = (file) => fs.readFile(file, 'utf8');

test('DIR-054: messaging READS and MUTATIONS draw on separate server budgets', async () => {
    const source = await readSource('backend/security/abuse.js');

    const readAt = source.indexOf('const messagingReadAccountLimiter = accountRateLimit({');
    assert.notEqual(readAt, -1, 'the read-only messaging limiter must exist');
    const readLimiter = source.slice(readAt, readAt + 300);
    assert.match(readLimiter, /namespace: 'messaging-read'/);
    assert.match(readLimiter, /MESSAGING_READ_FIVE_MINUTE_LIMIT \|\| 300/);
    assert.match(readLimiter, /windowMs: 5 \* 60 \* 1000/);
    // A passive badge read must never be turned into a 503 by a MariaDB blip.
    assert.match(readLimiter, /failClosed: false/);

    const mutationAt = source.indexOf("namespace: 'messaging',");
    assert.notEqual(mutationAt, -1, 'the mutation limiter must still exist');
    const mutationLimiter = source.slice(mutationAt, mutationAt + 200);
    assert.match(mutationLimiter, /MESSAGING_FIVE_MINUTE_LIMIT \|\| 150/);
    // The mutation budget stays fail-closed: it is a spend/abuse ceiling.
    assert.doesNotMatch(mutationLimiter, /failClosed: false/);

    // Both must be exported, or index.js cannot mount them.
    assert.match(source, /^ {2}messagingAccountLimiter,$/m);
    assert.match(source, /^ {2}messagingReadAccountLimiter,$/m);
});

test('DIR-054: /api/messages is mounted method-aware, and the module gate still follows', async () => {
    const source = await readSource('backend/index.js');

    const mountAt = source.indexOf("app.use('/api/messages', (req, res, next) => {");
    assert.notEqual(mountAt, -1, 'the method-aware dispatcher must exist');
    const dispatcher = source.slice(mountAt, mountAt + 300);
    assert.match(dispatcher, /req\.method === 'GET' \|\| req\.method === 'HEAD'/);
    assert.match(dispatcher, /messagingReadAccountLimiter\(req, res, next\)/);
    assert.match(dispatcher, /messagingAccountLimiter\(req, res, next\)/);

    // The blanket mount that charged reads to the mutation budget is gone.
    assert.doesNotMatch(source, /app\.use\('\/api\/messages', messagingAccountLimiter\);/);

    // DIR-026's fail-closed module gate is untouched and still mounted after it
    // (and still after requireAuth — messaging-module-gate.test.mjs pins polarity).
    const gateAt = source.indexOf("app.use('/api/messages', async (req, res, next)");
    assert.ok(gateAt > mountAt, 'the module gate must remain mounted after the limiter');
    assert.ok(gateAt > source.indexOf('return requireAuth(req, res, next);'), 'the module gate must stay after requireAuth');
});

test('DIR-054: both messaging budgets are tunable from the admin configuration registry', async () => {
    const source = await readSource('backend/services/platformConfiguration.js');
    assert.match(source, /\['MESSAGING_FIVE_MINUTE_LIMIT', 'Messaging five-minute limit', 'security', false, true\]/);
    assert.match(source, /\['MESSAGING_READ_FIVE_MINUTE_LIMIT', 'Messaging read five-minute limit', 'security', false, true\]/);
});

test('DIR-054: apiJson surfaces the server Retry-After without changing the error contract', async () => {
    const source = await readSource('src/services/api/platform.js');
    assert.match(source, /function readRetryAfterSeconds\(headers\)/);
    // Absence must stay distinguishable from a genuine "retry immediately".
    assert.match(source, /if \(retryAfterSeconds !== null\) err\.retryAfter = retryAfterSeconds;/);
    // The pre-existing error fields every caller already relies on are intact.
    assert.match(source, /err\.status = response\.status;/);
    assert.match(source, /err\.code = data\?\.error\?\.code \|\| data\?\.code;/);
});

test('DIR-054: the unread hook polls through the shared singleton, never a private interval', async () => {
    // Comments are stripped first: the hook's own docblock NAMES the old
    // `setInterval(refresh, 15000)` defect to explain it, and documentation of a
    // removed defect must never be mistaken for live code.
    const hook = (await readSource('src/hooks/useUnreadMessages.js'))
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/^\s*\/\/.*$/gm, ' ');
    assert.match(hook, /const sharedUnreadPoller = createUnreadMessagesPoller\(\{ intervalMs: POLL_INTERVAL_MS \}\);/);
    assert.match(hook, /sharedUnreadPoller\.subscribe\(applySnapshot, pollUnreadCount\)/);
    // THE REGRESSION: a per-instance interval multiplied the traffic by the number
    // of mounted consumers, which is what exhausted the messaging quota.
    assert.doesNotMatch(hook, /setInterval\(refresh/);
    assert.doesNotMatch(hook, /setInterval\(pollUnreadCount/);
    // The DIR-026 contract that had to survive the refactor.
    assert.match(hook, /POLL_INTERVAL_MS = 15000/);
    assert.match(hook, /addEventListener\('focus', refresh\)/);
    assert.match(hook, /return \{ unreadCount, error, status, enabled, refresh \};/);
});

test('DIR-054 S4: the reconnect banner carries only MAPPED Cuba opacity classes', async () => {
    const source = await readSource('src/components/Candidate/CubaCandidateHero.jsx');
    // The three classes that failed tests/dir023-contrast-tokens.test.mjs are gone.
    assert.doesNotMatch(source, /bg-amber-50\/95|border-amber-300\/70|dark:text-amber-100\/80/);
    // Replaced with values the dark-theme harmonisation block actually maps.
    assert.match(source, /border-amber-300\/80 bg-amber-50\/90/);
    assert.match(source, /dark:text-amber-100"/);
});
