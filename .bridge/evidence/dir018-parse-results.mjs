/**
 * DIR-018 — parse the Playwright JSON report and print a flat, readable
 * per-test verdict table. Written to disk instead of an inline `node -e`
 * one-liner because quoting a recursive walker through PowerShell is fragile.
 */
import fs from 'node:fs';

const FILE = process.argv[2] || '.bridge/evidence/dir018-results.json';
const report = JSON.parse(fs.readFileSync(FILE, 'utf8'));

const rows = [];

function walk(suites) {
    for (const suite of suites || []) {
        for (const spec of suite.specs || []) {
            for (const test of spec.tests || []) {
                const results = test.results || [];
                const bad = results.filter((r) => r.status !== 'passed');
                rows.push({
                    line: spec.line,
                    title: spec.title,
                    status: test.status,
                    attempts: results.length,
                    error: bad.length ? bad[bad.length - 1] : null,
                });
            }
        }
        walk(suite.suites);
    }
}

walk(report.suites);

console.log(`=== ${FILE} ===`);
console.log(`stats: expected=${report.stats?.expected} unexpected=${report.stats?.unexpected} skipped=${report.stats?.skipped} flaky=${report.stats?.flaky}`);
console.log(`duration: ${((report.stats?.duration || 0) / 1000).toFixed(1)}s`);
console.log('');

let failures = 0;
for (const row of rows) {
    const flag = row.status === 'expected' ? 'PASS' : row.status.toUpperCase();
    if (flag !== 'PASS') failures += 1;
    console.log(`[${flag}] L${row.line} ${row.title} (attempts=${row.attempts})`);
    if (row.error && row.error.error && row.error.error.message) {
        const msg = String(row.error.error.message);
        for (const l of msg.split('\n').slice(0, 22)) console.log('    | ' + l);
    }
}

console.log('');
console.log(`TOTAL ${rows.length} :: FAILED ${failures}`);
