// @ts-check
/**
 * DIR-047 build-budget phase probe (TEMPORARY -- measured, then deleted).
 *
 * The budget harness measures WALL clock of `npm run build`, but vite's own
 * "built in Xs" line only covers bundling. This probe attributes the bundling
 * phase to CSS vs JS vs minify so remediation targets the real cost rather than
 * the most suspicious-looking config knob.
 *
 * Timing model: each bucket accumulates the wall time spent inside the hook
 * calls that make it up. Buckets are measured with a re-entrancy guard so that
 * nested plugin hooks do not double-count.
 */
import base from './vite.config.js';

const buckets = { transform: 0, load: 0, renderChunk: 0, generateBundle: 0 };
let started = 0;
let cssCount = 0;
const busy = { transform: false, load: false, renderChunk: false, generateBundle: false };

function timed(bucket, fn) {
    return async function (...args) {
        if (busy[bucket]) return fn.apply(this, args);
        busy[bucket] = true;
        const t0 = performance.now();
        try {
            return await fn.apply(this, args);
        } finally {
            buckets[bucket] += performance.now() - t0;
            busy[bucket] = false;
        }
    };
}

const phaseProbe = {
    name: 'dir047-phase-probe',
    buildStart() {
        started = performance.now();
    },
    buildEnd() {
        console.log('DIR047_PHASES ' + JSON.stringify({
            totalMs: Math.round(performance.now() - started),
            cssFiles: cssCount,
            ...Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, Math.round(v)])),
        }));
    },
    transform: timed('transform', function (code, id) {
        // Attribute stylesheet compilation separately: it dominates `transform`
        // wall time and is the single most actionable bucket if it is the cost.
        if (/\.(s[ac]ss|css)(\?|$)/.test(id)) cssCount += 1;
        return null;
    }),
    load: timed('load', function () { return null; }),
    renderChunk: timed('renderChunk', function () { return null; }),
    generateBundle: timed('generateBundle', function () {}),
};

export default { ...base, plugins: [...base.plugins, phaseProbe] };