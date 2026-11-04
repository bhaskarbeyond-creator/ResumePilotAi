const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const legacySrcDir = path.resolve(rootDir, 'src');
const frontendSrcDir = path.resolve(rootDir, 'frontend', 'src');

function scan(dir) {
  let matches = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (['node_modules', '.git', 'dist', 'build', '.bridge', 'src'].includes(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      matches.push(...scan(full));
    } else if (/\.(js|ts|tsx|jsx|json)$/.test(e.name)) {
      const content = fs.readFileSync(full, 'utf8');
      const importRegex = /(?:from|require\()\s*['"]([^'"]+)['"]/g;
      let m;
      while ((m = importRegex.exec(content)) !== null) {
        const target = m[1];
        if (target.startsWith('.')) {
          const resolved = path.resolve(path.dirname(full), target);
          if (resolved.startsWith(legacySrcDir) && !resolved.startsWith(frontendSrcDir)) {
            matches.push(`${full} -> ${target} (resolves to ${resolved})`);
          }
        }
      }
    }
  }
  return matches;
}

const found = scan(rootDir);
console.log('Total files importing from legacy root src/:', found.length);
found.forEach(f => console.log('  ' + f));
if (found.length === 0) {
  console.log('SUCCESS: ZERO references to legacy root src/ found anywhere in the repository!');
  process.exit(0);
} else {
  process.exit(1);
}
