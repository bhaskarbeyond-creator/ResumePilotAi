const fs = require('fs');
const log = fs.readFileSync(__dirname + '/.bridge/evidence/dir097-npm-test.log', 'utf8');
const lines = log.split(/\r?\n/);
const fails = [];
for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/failing tests:|^\s*not ok |^# Subtest/.test(l)) fails.push(i + ': ' + l.trim().slice(0, 160));
}
console.log('--- failure markers (' + fails.length + ') ---');
console.log(fails.slice(0, 40).join('\n'));
console.log('\n--- log tail ---');
console.log(lines.filter(Boolean).slice(-25).join('\n').slice(-1800));
