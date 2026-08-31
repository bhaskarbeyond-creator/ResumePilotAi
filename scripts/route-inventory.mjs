/**
 * Enumerate every backend route from index.js and routes/*.js.
 * Outputs: METHOD\tPATH\tmiddleware hints
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const backendDir = path.join(root, 'backend');
const results = [];

function scanFile(filePath, prefix = '') {
  const src = fs.readFileSync(filePath, 'utf8');
  // app.METHOD(path, ...) or router.METHOD(path, ...)
  const re = /\b(?:app|router)\.(get|post|put|patch|delete|all)\s*\(\s*(['"`])([^'"`]+)\2/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const method = m[1].toUpperCase();
    let route = m[3];
    // Normalize
    const fullPath = (prefix + route).replace(/\/+/g, '/');
    results.push({ method, path: fullPath, file: path.relative(root, filePath) });
  }
  // router.use('/prefix', subRouter)
  const useRe = /router\.use\s*\(\s*(['"`])([^'"`]+)\1\s*,\s*(\w+)\s*\)/g;
  // Collect mounted sub-routers
  const mounts = [];
  while ((m = useRe.exec(src)) !== null) {
    mounts.push({ prefix: m[2], name: m[3] });
  }
  return mounts;
}

// Scan index.js first
const indexPath = path.join(backendDir, 'index.js');
const indexSrc = fs.readFileSync(indexPath, 'utf8');

// Find all app.use('/prefix', require('...')) and app.use('/prefix', routerX)
const globalMounts = [];
const appUseRe = /app\.use\s*\(\s*(['"`])([^'"`]+)\1\s*,\s*(?:require\(['"`]([^'"`]+)['"`]\)|(\w+))/g;
let m;
while ((m = appUseRe.exec(indexSrc)) !== null) {
  globalMounts.push({ prefix: m[2], requirePath: m[3], varName: m[4] });
}
// Also require('./routes/foo') assigned to const — scan for that pattern
const requireAssigns = {};
const reqAs = /const\s+(\w+)\s*=\s*require\(['"`](\.\/routes\/[^'"`]+)['"`]\)/g;
while ((m = reqAs.exec(indexSrc)) !== null) {
  requireAssigns[m[1]] = m[2];
}

// First pass: direct registrations on `app.`
{
  const re = /\bapp\.(get|post|put|patch|delete|all)\s*\(\s*(['"`])([^'"`]+)\2/g;
  while ((m = re.exec(indexSrc)) !== null) {
    results.push({ method: m[1].toUpperCase(), path: m[3], file: 'backend/index.js' });
  }
}

// For each global mount, either load the routes file or the var
for (const mount of globalMounts) {
  let routesFile;
  if (mount.requirePath) {
    routesFile = path.join(backendDir, mount.requirePath + '.js');
  } else if (mount.varName && requireAssigns[mount.varName]) {
    routesFile = path.join(backendDir, requireAssigns[mount.varName] + '.js');
  } else if (mount.varName) {
    // might be inline middleware, skip
    continue;
  }
  if (routesFile && fs.existsSync(routesFile)) {
    scanFile(routesFile, mount.prefix);
  }
}

// Also scan routes/ for any file not mounted
const routesDir = path.join(backendDir, 'routes');
for (const f of fs.readdirSync(routesDir)) {
  if (!f.endsWith('.js')) continue;
  const full = path.join(routesDir, f);
  const mounted = globalMounts.some(g => {
    const rp = g.requirePath || (g.varName && requireAssigns[g.varName]);
    return rp && path.join(backendDir, rp + '.js') === full;
  });
  if (!mounted) {
    // standalone helper, note but don't add routes
  }
}

results.sort((a,b) => (a.path+a.method).localeCompare(b.path+b.method));

// Print
console.log(`# Backend Route Inventory (${results.length} routes)\n`);
console.log('| Method | Path | File |');
console.log('|---|---|---|');
let last = '';
for (const r of results) {
  console.log(`| ${r.method} | \`${r.path}\` | ${r.file} |`);
}
fs.writeFileSync(path.join(root, 'docs/forensic/final/FINAL_ROUTE_MATRIX.md'),
`# Backend Route Inventory\n\nGenerated: ${new Date().toISOString()}\n\nTotal routes: **${results.length}**\n\n| Method | Path | File |\n|---|---|---|\n` +
results.map(r => `| ${r.method} | \`${r.path}\` | ${r.file} |`).join('\n') + '\n', { flag: 'w' });
console.log(`\nWrote docs/forensic/final/FINAL_ROUTE_MATRIX.md`);
