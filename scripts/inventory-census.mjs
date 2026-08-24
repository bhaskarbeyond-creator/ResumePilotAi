import fs from 'fs';
import path from 'path';

// 1. Parse all frontend routes
function extractRoutes() {
  const routes = [];
  const filesToScan = [
    { file: 'src/main.jsx', prefix: '' },
    { file: 'src/components/admin/Admin.jsx', prefix: '/adm' },
    { file: 'src/components/Dashboard/DashboardMain/DashboardMain.jsx', prefix: '/dashboard' },
    { file: 'src/enterprise/EnterpriseConsole.jsx', prefix: '/enterprise' }
  ];

  for (const { file, prefix } of filesToScan) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, 'utf8');
    const matches = [...content.matchAll(/<Route\s+[^>]*path=["']([^"']+)["'][^>]*element=\{<([^ />]+)/g)];
    for (const match of matches) {
      const routePath = match[1];
      const component = match[2];
      const fullPath = routePath.startsWith('/') ? routePath : `${prefix}/${routePath}`;
      routes.push({ file, path: fullPath, component });
    }
  }
  return routes;
}

// 2. Parse all backend API endpoints
function extractBackendApis() {
  const apis = [];
  const filesToScan = ['backend/index.js'];
  
  if (fs.existsSync('backend/routes')) {
    const routeFiles = fs.readdirSync('backend/routes').filter(f => f.endsWith('.js'));
    for (const f of routeFiles) {
      filesToScan.push(path.join('backend/routes', f));
    }
  }

  for (const file of filesToScan) {
    const content = fs.readFileSync(file, 'utf8');
    // Match app.get, app.post, router.get, router.post, etc.
    const methodRegex = /(?:app|router)\.(get|post|put|patch|delete)\(\s*(?:\[([^\]]+)\]|["']([^"']+)["'])/g;
    let match;
    while ((match = methodRegex.exec(content)) !== null) {
      const method = match[1].toUpperCase();
      if (match[2]) {
        // Array of paths
        const paths = match[2].split(',').map(p => p.trim().replace(/^["']|["']$/g, ''));
        for (const p of paths) {
          apis.push({ file, method, path: p });
        }
      } else if (match[3]) {
        apis.push({ file, method, path: match[3] });
      }
    }
  }
  return apis;
}

// 3. Parse all client-side API calls
function extractClientApiCalls(dir = 'src') {
  const calls = [];
  function scan(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        scan(fullPath);
      } else if (/\.(jsx?|tsx?)$/.test(entry.name)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        // Match fetch('/api/...'), axios.get('/api/...'), etc.
        const apiCalls = [...content.matchAll(/["'](\/api\/[^"'`?]+)["'`?]/g)];
        for (const call of apiCalls) {
          calls.push({ file: fullPath, api: call[1] });
        }
      }
    }
  }
  scan(dir);
  return calls;
}

console.log('=== FORENSIC INVENTORY CENSUS ===');
const routes = extractRoutes();
console.log(`Discovered ${routes.length} Frontend Routes across 4 routing modules.`);

const apis = extractBackendApis();
console.log(`Discovered ${apis.length} Backend API endpoints.`);

const clientCalls = extractClientApiCalls();
console.log(`Discovered ${clientCalls.length} Client-Side API references.`);

fs.writeFileSync('test-results/inventory-census.json', JSON.stringify({ routes, apis, clientCalls }, null, 2));
console.log('Census saved to test-results/inventory-census.json');
