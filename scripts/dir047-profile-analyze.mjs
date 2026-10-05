// @ts-check
// DIR-047 (temporary analysis helper): aggregate a Vite CPU profile by self time.
import fs from 'node:fs';

const prof = JSON.parse(fs.readFileSync(process.argv[2] || 'vite-profile-0.cpuprofile', 'utf8'));
const byId = new Map(prof.nodes.map((n) => [n.id, n]));
const self = new Map();
for (let i = 0; i < prof.samples.length; i += 1) {
    const id = prof.samples[i];
    const d = prof.timeDeltas[i] || 0;
    self.set(id, (self.get(id) || 0) + d);
}
const agg = new Map();
for (const [id, t] of self) {
    const n = byId.get(id);
    if (!n) continue;
    const f = n.callFrame;
    const file = (f.url || '').split(/[\\/]/).pop() || '(native)';
    const key = `${f.functionName || '(anon)'} @ ${file}:${f.lineNumber}`;
    agg.set(key, (agg.get(key) || 0) + t);
}
const total = [...agg.values()].reduce((a, b) => a + b, 0);
console.log('total sampled ms:', Math.round(total / 1000));
console.log('--- top self-time consumers ---');
[...agg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).forEach(([k, v]) => {
    console.log(String(Math.round(v / 1000)).padStart(6), 'ms', `${((100 * v) / total).toFixed(1)}%`, k);
});

// Aggregate by URL bucket to see which libraries dominate.
const byUrl = new Map();
for (const [id, t] of self) {
    const n = byId.get(id);
    if (!n) continue;
    const url = n.callFrame.url || '(native)';
    const m = url.match(/node_modules[\\/]((?:@[^\/]+[\\/])?[^\/]+)/);
    const key = m ? m[1] : (url.includes('node_modules') ? 'node_modules/other' : (url || '(native)'));
    byUrl.set(key, (byUrl.get(key) || 0) + t);
}
console.log('--- top modules ---');
[...byUrl.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).forEach(([k, v]) => {
    console.log(String(Math.round(v / 1000)).padStart(6), 'ms', `${((100 * v) / total).toFixed(1)}%`, k);
});