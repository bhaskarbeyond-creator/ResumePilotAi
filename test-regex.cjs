const fs = require('fs');
const src = fs.readFileSync('docs/FINAL_API_INVENTORY.md', 'utf8');
const body = src.slice(src.indexOf('## 5. Full endpoint table'));
const lines = body.split('\n');
let matches = 0;
for (const line of lines) {
    if (line.match(/^\|\s*(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\|\s*`([^`]+)`([^|]*)\|(.*)$/)) {
        matches++;
    }
}
console.log('Matches with $: ', matches);

matches = 0;
for (const line of lines) {
    if (line.match(/^\|\s*(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\|\s*`([^`]+)`([^|]*)\|/)) {
        matches++;
    }
}
console.log('Matches without $: ', matches);
