import fs from 'fs';
import path from 'path';

function walk(dir) {
    let files = [];
    if (!fs.existsSync(dir)) return files;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
            files = files.concat(walk(full));
        } else if (/\.(test\.js|test\.mjs|spec\.js|spec\.mjs)$/.test(e.name)) {
            files.push(full);
        }
    }
    return files;
}

const rootTests = walk(path.resolve('tests'));
const backendTests = walk(path.resolve('backend/test'));
const enterpriseTests = walk(path.resolve('backend/enterprise-test'));

console.log('=== TEST SUITE INVENTORY ===');
console.log('Root tests/ count:', rootTests.length);
console.log('Backend backend/test/ count:', backendTests.length);
console.log('Enterprise backend/enterprise-test/ count:', enterpriseTests.length);
console.log('Total test files in repository:', rootTests.length + backendTests.length + enterpriseTests.length);

const inventory = {
    rootTests: rootTests.map(f => path.relative('.', f)),
    backendTests: backendTests.map(f => path.relative('.', f)),
    enterpriseTests: enterpriseTests.map(f => path.relative('.', f)),
};

fs.writeFileSync('test-results/TEST_SUITE_BREAKDOWN.json', JSON.stringify(inventory, null, 2));
