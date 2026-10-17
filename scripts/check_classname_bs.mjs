import fs from 'fs';
import path from 'path';

function walk(dir) {
  let res = [];
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) {
      if (f !== 'node_modules' && f !== 'cv-templates' && f !== 'dist' && f !== '.git' && f !== '.bridge') {
        res = res.concat(walk(full));
      }
    } else if (f.endsWith('.jsx')) {
      res.push(full);
    }
  }
  return res;
}

const files = walk('src');

// A file declares Bootstrap 5 classes if it has className or class containing any Bootstrap 5 component or grid class:
// btn, card, badge, form-control, form-select, container, container-fluid, row, col, table, modal, alert, nav, navbar, dropdown, accordion, spinner, offcanvas
const bsClasses = [
  'btn', 'card', 'badge', 'form-control', 'form-select', 'container', 'container-fluid',
  'row', 'col', 'table', 'modal', 'alert', 'nav', 'navbar', 'dropdown', 'accordion', 'spinner', 'offcanvas', 'breadcrumb'
];

const bsPattern = new RegExp(`className\\s*=\\s*[{'\"\`][^;>]*?\\b(${bsClasses.join('|')})(-[\\w-]+)?\\b`, 's');

let withBs = 0;
let withoutBs = [];

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  if (bsPattern.test(content)) {
    withBs++;
  } else {
    withoutBs.push(file);
  }
}

console.log('Total non-CV JSX files:', files.length);
console.log('With Bootstrap 5 in className:', withBs, '(' + ((withBs / files.length) * 100).toFixed(1) + '%)');
console.log('Without Bootstrap in className:', withoutBs.length);
if (withoutBs.length > 0) {
  console.log('Files missing:');
  for (const f of withoutBs) {
    console.log(' - ' + f);
  }
}
