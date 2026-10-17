import fs from 'fs';
import path from 'path';

const dirs = [
  'src/enterprise',
  'src/components/EmployerPortal',
  'src/components/Dashboard/EmployerDashboard',
  'src/components/admin'
];

function checkDir(d) {
  for (const f of fs.readdirSync(d)) {
    const full = path.join(d, f);
    if (fs.statSync(full).isDirectory()) {
      checkDir(full);
    } else if (f.endsWith('.jsx')) {
      const c = fs.readFileSync(full, 'utf8');
      const gridMatches = c.match(/className=['"][^'"]*grid-cols-[^'"]*['"]/g);
      if (gridMatches) {
        console.log(full, 'has grid-cols:', gridMatches.length);
        for (const m of gridMatches) {
          console.log('   ', m);
        }
      }
    }
  }
}

dirs.forEach(checkDir);
