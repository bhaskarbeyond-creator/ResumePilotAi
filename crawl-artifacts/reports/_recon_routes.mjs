// Phase 1 recon: extract the full SPA route map across all nested routers.
import fs from 'node:fs';

const files = [
  'src/main.jsx',
  'src/components/Dashboard/DashboardMain/DashboardMain.jsx',
  'src/components/BuildResume/BuildResume.jsx',
  'src/components/EmployerPortal/EmployerPortal.jsx',
  'src/components/admin/Admin.jsx',
];

const out = {};
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const entries = [];
  const re = /<Route\b([^>]*?)\/?>/gs;
  let m;
  while ((m = re.exec(src))) {
    const attrs = m[1];
    const p = attrs.match(/\bpath=["']([^"']+)["']/);
    const el = attrs.match(/element=\{<\s*([A-Za-z0-9_.]+)/);
    const idx = attrs.includes('index');
    if (idx) entries.push({ path: '(index)', element: el ? el[1] : 'inline' });
    else if (p) entries.push({ path: p[1], element: el ? el[1] : 'inline' });
  }
  out[f] = entries;
  console.log(`\n===== ${f}  (${entries.length} routes) =====`);
  for (const e of entries) console.log(`  ${e.path.padEnd(46)} -> ${e.element}`);
}
fs.writeFileSync('crawl-artifacts/reports/route-map-raw.json', JSON.stringify(out, null, 2));
console.log('\nWrote crawl-artifacts/reports/route-map-raw.json');
