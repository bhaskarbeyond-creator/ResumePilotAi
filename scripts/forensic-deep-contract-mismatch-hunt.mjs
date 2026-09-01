import fs from 'fs';
import path from 'path';

console.log('============================================================');
console.log('PHASE 3: FORENSIC STRUCTURAL API CONTRACT MISMATCH HUNT');
console.log('============================================================\n');

// 1. Gather all frontend source files in admin, services, and enterprise
function walk(dir) {
    let files = [];
    if (!fs.existsSync(dir)) return files;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
            if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.git') continue;
            files = files.concat(walk(full));
        } else if (/\.(jsx|js|tsx|ts)$/.test(e.name)) {
            files.push(full);
        }
    }
    return files;
}

const frontendFiles = [
    ...walk(path.resolve('src/components/admin')),
    ...walk(path.resolve('src/enterprise')),
    ...walk(path.resolve('src/services')),
];

const backendFiles = [
    path.resolve('backend/index.js'),
    ...walk(path.resolve('backend/routes')),
    ...walk(path.resolve('backend/enterprise')).filter(f => f.includes('Route') || f.includes('Service') || f.includes('Registry') || f.includes('enterprise.js')),
];

console.log(`Scanning ${frontendFiles.length} frontend files and ${backendFiles.length} backend files...\n`);

// 2. Extract frontend fetch / request calls
const apiCallPatterns = [
    // fetch('/api/admin/...', { method: 'POST', body: ... })
    /fetch\s*\(\s*([`'"]\/api\/[^`'"]+[`'"]|\`\/api\/[^\`]+\`)(?:,\s*(\{[\s\S]*?\}))?\s*\)/g,
    // request('/api/admin/...', { method: 'POST', body: ... })
    /request\s*\(\s*([`'"]\/api\/[^`'"]+[`'"]|\`\/api\/[^\`]+\`)(?:,\s*(\{[\s\S]*?\}))?\s*\)/g,
    // enterpriseApi.get('/tenants')
    /enterpriseApi\.(get|post|put|patch|delete)\s*\(\s*([`'"][^`'"]+[`'"]|\`[^\`]+\`)/g,
    // platformApi.post('/...')
    /platformApi\.(get|post|put|patch|delete)\s*\(\s*([`'"][^`'"]+[`'"]|\`[^\`]+\`)/g,
];

const frontendCalls = [];

for (const file of frontendFiles) {
    const code = fs.readFileSync(file, 'utf8');
    const relPath = path.relative('.', file);

    // Regex 1: fetch & request
    const fetchRegex = /(?:fetch|request)\s*\(\s*([`'"](?:\/api\/|\/)[^`'"]+[`'"]|`(?:\/api\/|\/)[^`]+`)(?:,\s*(\{[\s\S]*?\}))?\s*\)/g;
    let match;
    while ((match = fetchRegex.exec(code)) !== null) {
        let rawUrl = match[1].replace(/[`'"]/g, '');
        let opts = match[2] || '';
        let method = 'GET';
        if (/method:\s*['"](POST|PUT|PATCH|DELETE)['"]/i.test(opts)) {
            method = opts.match(/method:\s*['"](POST|PUT|PATCH|DELETE)['"]/i)[1].toUpperCase();
        }
        frontendCalls.push({
            file: relPath,
            rawUrl,
            method,
            snippet: match[0].slice(0, 150)
        });
    }

    // Regex 2: enterpriseApi / platformApi
    const helperRegex = /(?:enterpriseApi|platformApi)\.(get|post|put|patch|delete)\s*\(\s*([`'"][^`'"]+[`'"]|`[^`]+`)/g;
    while ((match = helperRegex.exec(code)) !== null) {
        let method = match[1].toUpperCase();
        let rawUrl = match[2].replace(/[`'"]/g, '');
        if (!rawUrl.startsWith('/api') && !rawUrl.startsWith('http')) {
            rawUrl = (file.includes('enterprise') ? '/api/enterprise' : '/api/platform') + (rawUrl.startsWith('/') ? '' : '/') + rawUrl;
        }
        frontendCalls.push({
            file: relPath,
            rawUrl,
            method,
            snippet: match[0]
        });
    }
}

console.log(`Discovered ${frontendCalls.length} frontend API invocations.`);

// 3. Extract backend route registrations
const backendRoutes = [];
const routeDefRegex = /(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"]/g;

for (const file of backendFiles) {
    const code = fs.readFileSync(file, 'utf8');
    const relPath = path.relative('.', file);
    let match;
    while ((match = routeDefRegex.exec(code)) !== null) {
        backendRoutes.push({
            file: relPath,
            method: match[1].toUpperCase(),
            path: match[2]
        });
    }
}

console.log(`Discovered ${backendRoutes.length} backend route definitions.\n`);

// 4. Normalize URL pattern matching
function normalizeUrl(url) {
    return url
        .replace(/\$\{[^}]+\}/g, ':param')
        .replace(/\/:[a-zA-Z0-9_-]+/g, '/:param')
        .replace(/\/[a-f0-9-]{36}/g, '/:param') // UUIDs
        .replace(/\/[A-Za-z0-9_-]{8,}/g, '/:param') // IDs
        .split('?')[0];
}

// 5. Match frontend calls against backend routes
const unmappedCalls = [];
const mappedCalls = [];

for (const call of frontendCalls) {
    if (call.rawUrl.startsWith('http') || call.rawUrl.startsWith('/locales') || call.rawUrl.startsWith('/static')) {
        continue;
    }
    const normFrontendUrl = normalizeUrl(call.rawUrl);
    
    // Check direct or prefix match in backend
    const found = backendRoutes.some(r => {
        if (r.method !== call.method) return false;
        const normBackend = normalizeUrl(r.path);
        
        // Exact match
        if (normBackend === normFrontendUrl) return true;
        
        // If route is in router file (mounted under prefix)
        if (normFrontendUrl.endsWith(normBackend)) return true;
        if (normFrontendUrl.includes(normBackend.replace(/^\//, ''))) return true;
        
        // Parameterized matching
        const fParts = normFrontendUrl.split('/').filter(Boolean);
        const bParts = normBackend.split('/').filter(Boolean);
        if (fParts.length === bParts.length) {
            let match = true;
            for (let i = 0; i < fParts.length; i++) {
                if (fParts[i] !== bParts[i] && bParts[i] !== ':param' && fParts[i] !== ':param') {
                    match = false;
                    break;
                }
            }
            if (match) return true;
        }
        return false;
    });

    if (found) {
        mappedCalls.push(call);
    } else {
        unmappedCalls.push(call);
    }
}

console.log(`Mapped API Calls: ${mappedCalls.length}`);
console.log(`Unmapped / Suspicious Candidate Calls: ${unmappedCalls.length}\n`);

fs.writeFileSync('test-results/UNMAPPED_API_CALLS.json', JSON.stringify(unmappedCalls, null, 2));

unmappedCalls.slice(0, 30).forEach((c, i) => {
    console.log(`[CANDIDATE ${i+1}] ${c.method} ${c.rawUrl} (${c.file})`);
});
