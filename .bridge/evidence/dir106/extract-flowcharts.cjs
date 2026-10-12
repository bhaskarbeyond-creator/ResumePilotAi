'use strict';
// DIR-106: extract the Mermaid sources from AUDIT.md into maintainable .mmd files.
const fs = require('fs');
const path = require('path');
const SRC = '.bridge/evidence/dir106/AUDIT.md';
const OUT = '.bridge/evidence/dir106/flowcharts';
const FENCE = String.fromCharCode(96).repeat(3);

const md = fs.readFileSync(SRC, 'utf8');
const blocks = [];
let cursor = 0;
for (;;) {
  const start = md.indexOf(`${FENCE}mermaid`, cursor);
  if (start === -1) break;
  const bodyStart = md.indexOf('\n', start) + 1;
  const end = md.indexOf(FENCE, bodyStart);
  if (end === -1) break;
  blocks.push(md.slice(bodyStart, end).replace(/\r\n/g, '\n'));
  cursor = end + FENCE.length;
}

const names = [
  'flowchart-a-entitlement-quota-resolution.mmd',
  'flowchart-b-provider-key-selection.mmd',
  'flowchart-c-superadmin-config-lifecycle.mmd',
];

fs.mkdirSync(OUT, { recursive: true });
blocks.forEach((body, i) => {
  if (!names[i]) return;
  fs.writeFileSync(path.join(OUT, names[i]), body, 'utf8');
});
console.log(`extracted ${blocks.length} mermaid diagram(s)`);
