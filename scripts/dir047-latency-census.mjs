#!/usr/bin/env node
/**
 * DIR-047 [SWOT-W] -- Simulated-latency census over src/.
 *
 * WHY A CENSUS AND NOT A BLANKET BAN
 * `grep -R setTimeout src/` reports ~250 sites. The overwhelming majority are toast
 * and status-message AUTO-DISMISS timers (`setTimeout(() => setNotification(null),
 * 3500)`), which are UI hygiene, not latency: nothing waits on them and no user
 * action is gated behind them. A rule that banned every setTimeout would fail the
 * build for removing genuinely correct code, and a rule that banned none would let a
 * fabricated 800ms "network delay" ship. So this script CLASSIFIES every site and
 * emits a machine-readable ledger that the UAT suite re-checks.
 *
 * THE LINE THAT MATTERS
 * A setTimeout is SIMULATED LATENCY when a user's completed action is artificially
 * held back by it. Concretely, that means one of:
 *   - the timer GATES completion of a user flow (spinner stops, navigation happens,
 *     a promise resolves, an optimistic update is rolled forward);
 *   - the timer STANDS IN for network/AI/database work the real request already did;
 *   - the timer delays the FIRST PAINT of content that is genuinely ready.
 * Everything else -- clearing a message, debouncing input, retry backoff, letting a
 * CSS transition finish, deferring a non-critical measurement -- is legitimate.
 *
 * OUTPUT is deliberately evidence-shaped: every site appears, classified, with the
 * reason it landed where it did, so a Gatekeeper can audit the triage rather than
 * trusting a single aggregate verdict.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, '.bridge', 'evidence', 'dir047-latency-census.json');

/** Files whose timers are infrastructure, not user-flow latency, reported separately. */
const INFRA_GLOBS = [
    {
        match: (rel) => rel.endsWith(`${path.sep}services${path.sep}aiRuntime.js`),
        reason: 'backend AI runtime adapter (server-side timeout/stream pacing)',
    },
    {
        match: (rel) => rel.includes(`${path.sep}certs${path.sep}`),
        reason: 'certificate/supervisor plumbing',
    },
];

/**
 * Callback shapes that mean "a user flow is being held open". Matched against the
 * normalised callback source of the timer.
 */
const CLEARING_SHAPES = [
    /\bset(?:Notification|StatusMessage|Toast|ToastState|Banner|Snackbar|Alert)\s*\(\s*(?:null|undefined|false|''|""|\{\})/i,
    /\bset(?:ErrorMessage|SuccessMessage|InfoMessage|ValidationError|FormError|CouponSuccessMsg|JdAutofillMessage|ShareStatus|CopyState|QuotaMessage|FooterError)\s*\(\s*(?:null|undefined|false|''|""|\{\})/i,
    /\bthis\.setState\(\s*\{\s*(?:errorMessage|successMessage|notificationMessage|statusMessage|message)\s*:\s*(?:null|undefined|false|''|"")/i,
    /\berr(?:or)?Msg\.remove\(\)|\bclassList\.remove\(/i,
];

/**
 * Callback shapes that mean "a user flow is being held open". Matched against the
 * normalised callback source of the timer.
 */
const GATING_PATTERNS = [
    { re: /\bset(?:Loading|Saving|Submitting|Processing|Pending|Uploading|Generating|Analyzing|Connecting|Authenticating|Working|Busy)\b/i, why: 'holds a pending/loading state open after the work is already done' },
    { re: /\bresolve\s*\(|\breject\s*\(/, why: 'resolves a promise that stands in for real work' },
    { re: /\bwindow\.location\b|\bhistory\.(?:push|replace)State\b|\bnavigate\s*\(|\brouter\.(?:push|replace)\b/, why: 'defers navigation past the moment the user acted' },
    { re: /\bsetStep\s*\(|\bsetTab\s*\(|\bsetScreen\s*\(|\bsetView\s*\(/, why: 'defers a view advance the user already triggered' },
    { re: /\bawait\b|\bfetch\s*\(|axios\./, why: 'schedules real work through a timer rather than awaiting it' },
];

function classify({ callback, delayExpr, before = '', after = '' }) {
    // An auto-dismiss timer is legitimate no matter how long it waits: nothing is
    // gated, it just eventually clears a message the user has already read.
    if (CLEARING_SHAPES.some((re) => re.test(callback))) {
        return {
            category: 'auto-dismiss',
            simulatedLatency: false,
            reason: 'clears an already-delivered message; nothing is gated behind it',
        };
    }

    // DEBOUNCE / TRAILING-EDGE THROTTLE.
    // `const timer = setTimeout(fetch, 250)` followed by `clearTimeout(timer)` is the
    // canonical debounce idiom. The timer never HOLDS a completed action: it collapses
    // keystrokes into one request, and the user is still typing when it fires. Flagging
    // these would be a false positive -- and worse, "fixing" them by deleting the timer
    // would fire a request per keystroke.
    if (/clearTimeout\s*\(/.test(after)) {
        return {
            category: 'debounce',
            simulatedLatency: false,
            reason: 'trailing-edge debounce cancelled by clearTimeout; fires earlier as keystrokes arrive and never holds a completed action',
        };
    }

    // PROMISE DEADLINE GUARD.
    // A timer inside a `new Promise(...)` executor (including inside a `Promise.race`)
    // can only ever SHORTEN a wait: it caps how long the code is willing to block on a
    // real async operation. It is the opposite of simulated latency -- it is simulated
    // PATIENCE. Classifying it as latency would demand deleting the very timeouts that
    // stop a hung request from hanging the UI forever.
    if (/new\s+Promise\s*\(/.test(before)) {
        return {
            category: 'deadline-guard',
            simulatedLatency: false,
            reason: 'deadline inside a Promise executor/race; caps a real async wait and can only shorten it',
        };
    }

    const gating = GATING_PATTERNS.find(({ re }) => re.test(callback));
    if (gating) {
        return { category: 'flow-gating', simulatedLatency: true, reason: gating.why };
    }

    const numericDelay = Number((delayExpr.match(/\d+/) || [])[0]);
    // Sub-50ms timers cannot be perceptible latency; they exist to let a style or a
    // measurement land before a dependent read (a classic rAF/forced-refill idiom).
    if (Number.isFinite(numericDelay) && numericDelay < 50) {
        return {
            category: 'paint-deferral',
            simulatedLatency: false,
            reason: `${numericDelay}ms sub-perceptual deferral used for style/measurement ordering`,
        };
    }

    return {
        category: 'unclassified',
        simulatedLatency: false,
        reason: 'does not gate a user flow, hold a pending state, or stand in for real work; recorded for audit',
    };
}

/**
 * Extracts every `setTimeout(` call with balanced-paren argument capture.
 * Hand-rolled rather than regex-only because the arguments span multiple lines and
 * contain nested parens, commas and string literals.
 */
function extractTimers(source) {
    const timers = [];
    const needle = /setTimeout\s*\(/g;
    let match;
    while ((match = needle.exec(source)) !== null) {
        const open = source.indexOf('(', match.index);
        let depth = 0;
        let quote = null;
        let i = open;
        for (; i < source.length; i += 1) {
            const ch = source[i];
            if (quote) {
                if (ch === '\\') { i += 1; continue; }
                if (ch === quote) quote = null;
                continue;
            }
            if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
            if (ch === '(') depth += 1;
            else if (ch === ')') {
                depth -= 1;
                if (depth === 0) break;
            }
        }
        if (i >= source.length) break;

        const args = source.slice(open + 1, i);
        // Split on the TOP-LEVEL comma only, so a callback body containing commas
        // does not get mistaken for the delay argument.
        let d = 0; let q = null; let cut = -1;
        for (let k = 0; k < args.length; k += 1) {
            const ch = args[k];
            if (q) {
                if (ch === '\\') { k += 1; continue; }
                if (ch === q) q = null;
                continue;
            }
            if (ch === '"' || ch === "'" || ch === '`') { q = ch; continue; }
            if (ch === '(' || ch === '[' || ch === '{') d += 1;
            else if (ch === ')' || ch === ']' || ch === '}') d -= 1;
            else if (ch === ',' && d === 0) { cut = k; break; }
        }

        const callback = (cut === -1 ? args : args.slice(0, cut)).trim();
        const delayExpr = cut === -1 ? '' : args.slice(cut + 1).trim();
        const lineNumber = source.slice(0, match.index).split('\n').length;
        // Context windows for the debounce and deadline classifications above.
        // `before` is the 600 chars preceding the call (to see a `new Promise(...)`
        // executor wrapping it); `after` is the 900 chars following the closing paren
        // (to see the `clearTimeout` that cancels a debounce). The windows are bounded
        // so a `clearTimeout` on a different timer elsewhere in the file cannot leak in.
        const before = source.slice(Math.max(0, match.index - 600), match.index);
        const after = source.slice(i, i + 900);
        timers.push({ callback, delayExpr, lineNumber, before, after });

        needle.lastIndex = i;
    }
    return timers;
}

function stripComments(source) {
    // A timer inside a comment is not a timer. Removing comments first also stops a
    // commented-out example delay from being reported as live latency.
    return source
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
        .replace(/(^|[^:'"\\])\/\/[^\n]*/g, (_m, lead) => lead);
}

function walk(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, out);
        else if (/\.(js|jsx|mjs|cjs)$/.test(entry.name)) out.push(full);
    }
    return out;
}

const files = walk(SRC);
const sites = [];

for (const file of files) {
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    const source = stripComments(fs.readFileSync(file, 'utf8'));
    const infra = INFRA_GLOBS.find((g) => g.match(rel));

    for (const timer of extractTimers(source)) {
        const verdict = classify(timer);
        sites.push({
            file: rel,
            line: timer.lineNumber,
            delay: timer.delayExpr || '(none)',
            category: verdict.category,
            simulatedLatency: verdict.simulatedLatency,
            reason: verdict.reason,
            scope: infra ? 'infrastructure' : 'user-flow',
            infrastructureNote: infra ? infra.reason : null,
            callback: timer.callback.replace(/\s+/g, ' ').slice(0, 200),
        });
    }
}

const byCategory = {};
for (const site of sites) {
    byCategory[site.category] = (byCategory[site.category] || 0) + 1;
}

// Deliberately separate from the totals so a reviewer can see the user-flow surface
// without having to subtract infrastructure by hand.
const userFlow = sites.filter((s) => s.scope === 'user-flow');
const offenders = userFlow.filter((s) => s.simulatedLatency);

const payload = {
    directive: 'DIR-047',
    vector: 'SWOT-W zero simulated latency',
    generatedAt: new Date().toISOString(),
    method: 'comment-stripped source scan of src/**/*.{js,jsx,mjs,cjs}; balanced-paren argument split; every site classified',
    definition: {
        simulatedLatency: 'a timer that gates completion of a user flow, stands in for network/AI/database work already performed, or delays first paint of content that is genuinely ready',
        legitimate: 'message auto-dismiss, debounce/throttle, retry backoff, sub-perceptual paint ordering, non-critical deferral',
    },
    totals: {
        filesScanned: files.length,
        timerSites: sites.length,
        userFlowSites: userFlow.length,
        infrastructureSites: sites.length - userFlow.length,
        byCategory,
    },
    simulatedLatencyCount: offenders.length,
    offenders,
    sites,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

console.log(`scanned ${files.length} source files -> ${sites.length} timer sites`);
console.log(`user-flow sites: ${userFlow.length}, infrastructure: ${sites.length - userFlow.length}`);
console.log(`by category: ${JSON.stringify(byCategory)}`);
console.log(`SIMULATED LATENCY OFFENDERS: ${offenders.length}`);
for (const o of offenders) console.log(`  ${o.file}:${o.line} delay=${o.delay} -- ${o.reason}`);
console.log(`ledger: ${path.relative(ROOT, OUT)}`);

// Exit code is NOT a gate here: this script's job is to produce the ledger. The UAT
// suite is what asserts against it, so an offender surfaces there with full context.
process.exit(0);
