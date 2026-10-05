// Read-only inspector for the DIR-047 Playwright JSON report.
// Prints per-test status and the full message of any non-passing result so a
// skip can never masquerade as a pass in the evidence pack.
import fs from 'node:fs';

const file = process.argv[2] || '.bridge/evidence/dir047-results.json';
const j = JSON.parse(fs.readFileSync(file, 'utf8'));

const walk = (suite, depth = 0) => {
    for (const spec of suite.specs || []) {
        for (const t of spec.tests || []) {
            console.log(`[${t.status}] ${t.title}`);
            const results = t.results || [];
            for (const r of results) {
                if (r.status === 'passed') continue;
                console.log(`    -> ${r.status}`);
                const msgs = [];
                if (r.error && r.error.message) msgs.push(r.error.message);
                for (const e of r.errors || []) {
                    msgs.push(String(e.message || e.value || JSON.stringify(e)));
                }
                for (const snip of r.stdout || []) msgs.push(String(snip.text || '').slice(0, 800));
                for (const m of msgs) console.log('       ' + m.slice(0, 900).split('\n').join('\n       '));
            }
        }
    }
    for (const ss of suite.suites || []) walk(ss, depth + 1);
};

for (const s of j.suites || []) walk(s);
console.log('\nSTATS ' + JSON.stringify(j.stats, null, 2));