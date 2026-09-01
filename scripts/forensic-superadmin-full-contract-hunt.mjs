import fs from 'fs';
import path from 'path';

// Automated Frontend-to-Backend Full Contract & False-Success Scanner

console.log('============================================================');
console.log('ADVERSARIAL SUPER ADMIN CRUD & CONTRACT SCANNER');
console.log('============================================================\n');

// 1. Scan Frontend API calls in src/services and src/components
const frontendFiles = [];
function walkDir(dir) {
    const files = fs.readdirSync(dir);
    for (const f of files) {
        const full = path.join(dir, f);
        if (fs.statSync(full).isDirectory()) {
            if (!f.startsWith('.') && f !== 'node_modules' && f !== 'dist') walkDir(full);
        } else if (/\.(jsx?|tsx?|vue|mjs)$/.test(f)) {
            frontendFiles.push(full);
        }
    }
}
walkDir('src');

console.log(`[1] Scanning ${frontendFiles.length} frontend source files...`);

const frontendApiCalls = [];
const falseSuccessPatterns = [];
const emptyCatchBlocks = [];

for (const file of frontendFiles) {
    const code = fs.readFileSync(file, 'utf8');
    const lines = code.split('\n');

    // Detect API calls
    const fetchRegex = /(?:fetch|fetchAdminWithReauth|axios\.(get|post|put|delete|patch)|apiCall)\s*\(\s*[`'"]([^`'"]+)[`'"]\s*(?:,\s*\{([^}]*)\})?/g;
    let match;
    while ((match = fetchRegex.exec(code)) !== null) {
        const rawUrl = match[2];
        const options = match[3] || '';
        let method = 'GET';
        if (match[1]) method = match[1].toUpperCase();
        const methodMatch = /method\s*:\s*['"`](GET|POST|PUT|DELETE|PATCH)['"`]/i.exec(options);
        if (methodMatch) method = methodMatch[1].toUpperCase();

        if (rawUrl.startsWith('/api/') || rawUrl.startsWith('api/') || rawUrl.includes('/api/admin') || rawUrl.includes('/api/platform') || rawUrl.includes('/api/enterprise')) {
            frontendApiCalls.push({
                file: path.relative(process.cwd(), file).replace(/\\/g, '/'),
                url: rawUrl,
                method,
                optionsSnippet: options.trim().slice(0, 80)
            });
        }
    }

    // Detect silent catch blocks
    const catchRegex = /catch\s*\(([^)]*)\)\s*\{([^}]*)\}/g;
    let catchMatch;
    while ((catchMatch = catchRegex.exec(code)) !== null) {
        const catchBody = catchMatch[2].trim();
        if (
            catchBody === '' ||
            catchBody === 'return;' ||
            catchBody === 'return null;' ||
            catchBody === 'return false;' ||
            /^(?:console\.(?:log|warn|error)\([^)]*\);?\s*)*$/.test(catchBody)
        ) {
            // Check if inside an admin component or service
            if (file.includes('admin') || file.includes('enterprise') || file.includes('services/api')) {
                emptyCatchBlocks.push({
                    file: path.relative(process.cwd(), file).replace(/\\/g, '/'),
                    errorVar: catchMatch[1],
                    snippet: catchBody.slice(0, 100)
                });
            }
        }
    }
}

console.log(`  Found ${frontendApiCalls.length} frontend API call references.`);
console.log(`  Found ${emptyCatchBlocks.length} potentially swallowing catch blocks in admin/services.`);

// 2. Scan Backend Route Registrations
const backendFiles = [];
function walkBackend(dir) {
    const files = fs.readdirSync(dir);
    for (const f of files) {
        const full = path.join(dir, f);
        if (fs.statSync(full).isDirectory()) {
            if (!f.startsWith('.') && f !== 'node_modules' && f !== 'test' && f !== 'tests') walkBackend(full);
        } else if (/\.(jsx?|tsx?|mjs)$/.test(f)) {
            backendFiles.push(full);
        }
    }
}
walkBackend('backend');

console.log(`\n[2] Scanning ${backendFiles.length} backend source files for route declarations...`);

const backendRoutes = [];
const routeRegex = /(?:app|router)\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/g;

for (const file of backendFiles) {
    const code = fs.readFileSync(file, 'utf8');
    let rMatch;
    const relFile = path.relative(process.cwd(), file).replace(/\\/g, '/');
    let prefix = '';
    if (relFile.includes('routes/platform.js')) prefix = '/api/platform';
    if (relFile.includes('routes/enterprise.js')) prefix = '/api/enterprise';
    if (relFile.includes('routes/adminUsers.js')) prefix = '/api/admin/users';
    if (relFile.includes('routes/adminPlatformOperations.js')) prefix = '/api';
    if (relFile.includes('routes/support.js')) prefix = '/api/admin/support';
    if (relFile.includes('routes/blogData.js')) prefix = '/api/blog-data';
    if (relFile.includes('routes/notificationsData.js')) prefix = '/api/notifications-data';
    if (relFile.includes('routes/miscData.js')) prefix = '/api';

    while ((rMatch = routeRegex.exec(code)) !== null) {
        const method = rMatch[1].toUpperCase();
        let p = rMatch[2];
        if (prefix && !p.startsWith('/api')) {
            p = prefix + (p === '/' ? '' : (p.startsWith('/') ? p : '/' + p));
        }
        backendRoutes.push({
            file: relFile,
            method,
            path: p
        });
    }
}

console.log(`  Found ${backendRoutes.length} backend route declarations.`);

// 3. Normalizer helper for route matching
function normalizePath(p) {
    return p
        .replace(/\$\{[^}]+\}/g, ':param')
        .replace(/:[a-zA-Z0-9_]+/g, ':param')
        .replace(/\/\d+/g, '/:param')
        .replace(/\?.*$/, '')
        .replace(/\/$/, '')
        .toLowerCase();
}

// 4. Contract Cross-Referencing
console.log('\n[3] Cross-referencing Frontend Calls vs Backend Routes...');

const missingBackendRoutes = [];
for (const call of frontendApiCalls) {
    const normCallPath = normalizePath(call.url);
    const hasMatch = backendRoutes.some(r => {
        const normBackendPath = normalizePath(r.path);
        const methodMatch = r.method === call.method;
        const pathMatch = normBackendPath === normCallPath ||
            normCallPath.startsWith(normBackendPath + '/') ||
            normBackendPath.startsWith(normCallPath + '/');
        return methodMatch && pathMatch;
    });

    if (!hasMatch) {
        missingBackendRoutes.push(call);
    }
}

console.log(`\n============================================================`);
console.log(`POTENTIAL ROUTE CONTRACT MISMATCHES (${missingBackendRoutes.length}):`);
console.log(`============================================================`);
for (const m of missingBackendRoutes) {
    console.log(`  [MISMATCH] ${m.method} ${m.url}`);
    console.log(`    Caller: ${m.file} | Snippet: ${m.optionsSnippet}`);
}

console.log(`\n============================================================`);
console.log(`POTENTIALLY SWALLOWED CATCH BLOCKS IN ADMIN/SERVICES (${emptyCatchBlocks.length}):`);
console.log(`============================================================`);
for (const c of emptyCatchBlocks.slice(0, 20)) {
    console.log(`  [SWALLOWED] ${c.file} (catch ${c.errorVar}): ${c.snippet}`);
}

fs.writeFileSync('test-results/CONTRACT_SCAN_REPORT.json', JSON.stringify({
    frontendApiCallsCount: frontendApiCalls.length,
    backendRoutesCount: backendRoutes.length,
    missingBackendRoutes,
    emptyCatchBlocks
}, null, 2));

console.log('\n✓ Contract scan report written to test-results/CONTRACT_SCAN_REPORT.json');
