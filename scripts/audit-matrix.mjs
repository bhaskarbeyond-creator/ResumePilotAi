import fs from 'fs';
const content = fs.readFileSync('developer-review/production-certification/FUNCTIONAL_CAPABILITY_MATRIX.md', 'utf8');
const lines = content.split(/\r?\n/);
const entries = [];
const counts = {};
for (const line of lines) {
  const parts = line.split('|').map(s => s.trim());
  if (parts.length >= 4 && parts[1].includes('FP-')) {
    const id = parts[1].replace(/`/g, '');
    const name = parts[2];
    const status = parts[3];
    counts[status] = (counts[status] || 0) + 1;
    entries.push({ id, name, status });
  }
}
console.log('Total entries:', entries.length);
console.log('Status breakdown:', counts);
console.log('Non-strict entries:', entries.filter(e => !e.status.includes('STRICT FULL')));
