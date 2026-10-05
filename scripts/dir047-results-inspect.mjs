// DIR-047 evidence inspector: reads the Playwright JSON reporter output and prints a
// flat, gatekeeper-readable verdict. A run in which every test is SKIPPED is reported
// explicitly as VACUOUS rather than as a pass, because a zero-exit skipped suite is the
// single easiest way to manufacture a green certification.
import fs from 'node:fs';

const file = process.argv[2] || '.bridge/evidence/dir047-results.json';
const r = JSON.parse(fs.readFileSync(file, 'utf8'));

const specs = [];
const walk = (suite) => {
    (suite.suites || []).forEach(walk);
    (suite.specs || []).forEach((spec) => specs.push(spec));
};
walk(r);

let passed = 0;
let failed = 0;
let skipped = 0;
let timedOut = 0;

console.log('FILE          :', file);
console.log('STATS         :', JSON.stringify(r.stats));
console.log('TOP-LEVEL ERR :', (r.errors || []).length);
(r.errors || []).forEach((e, i) => console.log(`  err[${i}] =`, String(e.value || e).slice(0, 600)));
console.log('---');

for (const spec of specs) {
    for (const t of spec.tests) {
        const statuses = t.results.map((x) => x.status).join('/');
        if (t.status === 'expected' || t.status === 'passed') passed += 1;
        else if (t.status === 'skipped') skipped += 1;
        else if (t.status === 'timedOut') timedOut += 1;
        else failed += 1;
        console.log(`${t.status.toUpperCase().padEnd(8)} | ${statuses.padEnd(10)} | ${spec.title}`);
        for (const res of t.results) {
            for (const err of res.errors || []) {
                console.log(`           ! ${String(err.value || err.message || err).slice(0, 700)}`);
            }
        }
    }
}

console.log('---');
console.log(JSON.stringify({ total: specs.length, passed, failed, skipped, timedOut }));
// The vacuity guard. A suite where nothing actually ran must never be mistaken for a
// green certification, no matter what the process exit code was.
console.log(specs.length > 0 && passed === 0 && failed === 0
    ? 'VERDICT: VACUOUS -- no assertion executed; this is NOT a pass'
    : (failed === 0 && passed > 0 ? 'VERDICT: GREEN' : 'VERDICT: RED'));
