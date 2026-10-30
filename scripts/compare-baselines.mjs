import { execSync } from 'child_process';

const oldContent = execSync('git show 78bcdc1c:developer-review/production-certification/FUNCTIONAL_CAPABILITY_MATRIX.md', { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
const newContent = execSync('git show 529e51fd:developer-review/production-certification/FUNCTIONAL_CAPABILITY_MATRIX.md', { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });

function parseMatrix(content) {
  const map = new Map();
  for (const line of content.split(/\r?\n/)) {
    const parts = line.split('|').map(s => s.trim());
    if (parts.length >= 4 && parts[1].includes('FP-')) {
      const id = parts[1].replace(/`/g, '');
      const name = parts[2];
      const status = parts[3];
      const anchor = parts[4] || '';
      const notes = parts[5] || '';
      map.set(id, { id, name, status, anchor, notes });
    }
  }
  return map;
}

const oldMap = parseMatrix(oldContent);
const newMap = parseMatrix(newContent);

console.log('Old count:', oldMap.size, 'New count:', newMap.size);

const promoted = [];
for (const [id, oldEntry] of oldMap.entries()) {
  const newEntry = newMap.get(id);
  if (!newEntry) {
    console.log('Missing in new:', id);
    continue;
  }
  if (oldEntry.status !== newEntry.status) {
    promoted.push({ id, name: oldEntry.name, oldStatus: oldEntry.status, newStatus: newEntry.status, newAnchor: newEntry.anchor, newNotes: newEntry.notes });
  }
}
console.log('Total status changes:', promoted.length);
console.log(JSON.stringify(promoted, null, 2));
