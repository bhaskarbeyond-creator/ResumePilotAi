// @ts-check
/** DIR-047 build-budget probe (TEMPORARY). Times each rollup hook phase. */
import base from './vite.config.js';

const t = {};
const stamp = (k) => { const now = performance.now(); if (t[k] === undefined) t[k] = now; return now - t[k]; };

const timer = {
    name: 'dir047-timer',
    buildStart() { t.start = performance.now(); },
    buildEnd() {
        console.log('DIR047_TIMING ' + JSON.stringify({
            totalMs: Math.round(performance.now() - t.start),
            ...Object.fromEntries(Object.entries(t).filter(([k]) => !['start', 'buildStart', 'buildEnd'].includes(k)).map(([k, v]) => [k, Math.round(v)])),
        }));
    },
    async transform(code, id) { stamp('transform'); return null; },
    async load(id) { stamp('load'); return null; },
    async renderChunk(code, chunk) { stamp('renderChunk'); return null; },
    async generateBundle() { stamp('generateBundle'); },
    renderStart() { stamp('renderStart'); t.renderStart = t.renderStart ?? performance.now(); },
    buildEnd2() {},
};

export default { ...base, plugins: [...base.plugins, timer] };
