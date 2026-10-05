import fs from 'node:fs';

const file = process.argv[2];
const raw = JSON.parse(fs.readFileSync(file, 'utf8'));

console.log('STATS ' + JSON.stringify(raw.stats));
let pass = 0, fail = 0, skip = 0;
const walk = (suite, depth) => {
    for (const spec of suite.specs || []) {
        for (const test of spec.tests || []) {
            const results = test.results || [];
            const last = results[results.length - 1] || {};
            const status = test.status === 'skipped' && !results.length ? 'skipped' : (last.status || test.status || 'unknown');
            if (status === 'passed') pass += 1;
            else if (status === 'skipped') skip += 1;
            else fail += 1;
            console.log('---');
            console.log('  '.repeat(depth) + spec.title);
            console.log('  '.repeat(depth) + '  status=' + status + '  dur=' + (last.duration ?? 'n/a') + '  line=' + spec.line);
            if (status !== 'passed' && status !== 'skipped' && last.error) {
                const msg = String(last.error.message || last.error.stack || '');
                console.log('  '.repeat(depth) + '  ERR:\n  ' + msg.split('\n').slice(0, 12).join('\n  '));
            }
        }
    }
    for (const child of suite.suites || []) walk(child, depth + 1);
};
for (const suite of raw.suites || []) walk(suite, 0);
console.log('RECOMPUTED pass=' + pass + ' fail=' + fail + ' skipped=' + skip);