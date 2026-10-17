import fs from 'fs';
import path from 'path';

function checkTables(dir) {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) {
      checkTables(full);
    } else if (f.endsWith('.jsx')) {
      const c = fs.readFileSync(full, 'utf8');
      const tableMatches = c.match(/<table[^>]*class(?:Name)?=['"][^'"]*['"]/gi);
      if (tableMatches) {
        console.log(full);
        tableMatches.forEach(m => console.log('  ', m));
      }
    }
  }
}

checkTables('src/enterprise');
checkTables('src/components/admin');
checkTables('src/components/EmployerPortal');
