import { readFileSync } from 'node:fs';

const raw = JSON.parse(readFileSync('.bridge/evidence/dir021-results.json', 'utf8'));
console.log('STATS:', JSON.stringify(raw.stats));
console.log('TEST_MATCH_CONFIG:', JSON.stringify(raw.config.projects.map((p) => p.testMatch)));
for (const suite of raw.suites) {
    console.log(`SUITE: ${suite.file}`);
    for (const spec of suite.specs) {
        for (const test of spec.tests) {
            const result = test.results[0] ?? {};
            console.log(`  ${test.status.toUpperCase()} | ${Math.round(result.duration ?? 0)}ms | ${spec.title.slice(0, 70)}`);
        }
    }
}
console.log('TOP_LEVEL_ERRORS:', raw.errors.length);