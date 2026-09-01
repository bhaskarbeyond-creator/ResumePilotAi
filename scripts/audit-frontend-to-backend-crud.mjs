import fs from 'fs';
import path from 'path';

// Read frontend API services
const platformJs = fs.readFileSync('src/services/api/platform.js', 'utf8');
const platformApiJs = fs.readFileSync('src/services/platformApi.js', 'utf8');
const blogApiJs = fs.readFileSync('src/services/api/blog.js', 'utf8');
const enterpriseApiJs = fs.readFileSync('src/enterprise/enterpriseApi.js', 'utf8');

// Read backend routes
const backendIndex = fs.readFileSync('backend/index.js', 'utf8');
const platformRoutes = fs.readFileSync('backend/routes/platform.js', 'utf8');
const enterpriseRoutes = fs.readFileSync('backend/routes/enterprise.js', 'utf8');
const miscRoutes = fs.readFileSync('backend/routes/miscData.js', 'utf8');
const aiRoutes = fs.readFileSync('backend/routes/ai.js', 'utf8');

console.log('=== AUDITING FRONTEND TO BACKEND CRUD ENDPOINTS ===');

// Extract all fetchAdmin and fetch calls
const allFrontend = [
    { file: 'platform.js', content: platformJs },
    { file: 'platformApi.js', content: platformApiJs },
    { file: 'blog.js', content: blogApiJs },
    { file: 'enterpriseApi.js', content: enterpriseApiJs },
];

const backendCombined = [
    { name: 'index.js', content: backendIndex, prefix: '' },
    { name: 'routes/platform.js', content: platformRoutes, prefix: '/api/platform' },
    { name: 'routes/enterprise.js', content: enterpriseRoutes, prefix: '/api/enterprise' },
    { name: 'routes/miscData.js', content: miscRoutes, prefix: '/api' },
    { name: 'routes/ai.js', content: aiRoutes, prefix: '/api' },
];

// Find all backend route declarations
const backendEndpoints = [];
for (const b of backendCombined) {
    const routeRegex = /(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
    let rMatch;
    while ((rMatch = routeRegex.exec(b.content)) !== null) {
        const method = rMatch[1].toUpperCase();
        let p = rMatch[2];
        if (b.prefix && !p.startsWith('http')) {
            // For router, if p is '/', then prefix; else prefix + p
            p = p === '/' ? b.prefix : `${b.prefix}${p.startsWith('/') ? p : '/' + p}`;
        }
        backendEndpoints.push({ method, path: p, source: b.name });
    }
}

console.log(`Discovered ${backendEndpoints.length} backend routes.`);

// Find all frontend fetchAdmin calls
const frontendCalls = [];
for (const f of allFrontend) {
    const callRegex = /fetchAdmin(?:WithReauth)?\s*\(\s*[`'"]([^`'"]+)[`'"](?:\s*,\s*\{([^}]*)\})?/g;
    let cMatch;
    while ((cMatch = callRegex.exec(f.content)) !== null) {
        const rawUrl = cMatch[1];
        const opts = cMatch[2] || '';
        let method = 'GET';
        const methodMatch = opts.match(/method\s*:\s*['"`]([A-Z]+)['"`]/i);
        if (methodMatch) method = methodMatch[1].toUpperCase();
        frontendCalls.push({ file: f.file, url: rawUrl, method });
    }
}

console.log(`Discovered ${frontendCalls.length} frontend admin fetch calls.`);

// Check coverage of frontend calls against backend endpoints
const mismatches = [];
const matches = [];

for (const fc of frontendCalls) {
    const cleanUrl = fc.url.split('?')[0];
    
    // Convert parameter syntax for comparison: /api/admin/coupons/:code vs /api/admin/coupons/${...}
    // Match either exact or pattern
    const matched = backendEndpoints.find(be => {
        if (be.method !== fc.method) return false;
        
        // Exact match
        if (be.path === cleanUrl) return true;
        
        // Pattern match with :param
        const bePattern = new RegExp('^' + be.path.replace(/:[a-zA-Z0-9_]+/g, '[^/]+') + '$');
        const fcPattern = cleanUrl.replace(/\$\{[^}]+\}/g, 'PLACEHOLDER');
        
        if (bePattern.test(cleanUrl)) return true;
        if (be.path.replace(/:[a-zA-Z0-9_]+/g, 'PLACEHOLDER') === fcPattern) return true;

        return false;
    });

    if (matched) {
        matches.push({ ...fc, backend: matched });
    } else {
        mismatches.push(fc);
    }
}

console.log(`\nMatched Endpoints: ${matches.length}`);
console.log(`Mismatches / Unrouted Frontend Calls: ${mismatches.length}`);

if (mismatches.length > 0) {
    console.log('\n--- MISMATCHED / MISSING BACKEND ENDPOINTS ---');
    for (const m of mismatches) {
        console.log(`[${m.file}] ${m.method} ${m.url}`);
    }
}

// Check for coupons endpoints specifically
console.log('\n--- COUPONS BACKEND ROUTES ---');
console.log(backendEndpoints.filter(b => b.path.includes('coupon')));
