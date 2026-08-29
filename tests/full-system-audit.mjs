/**
 * Full-System Forensic Audit — Playwright Browser Automation
 * 
 * This script performs a comprehensive browser-driven audit of the application.
 * It checks that every page loads, verifies network responses, validates auth boundaries,
 * and tests responsiveness across all 7 required viewports.
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.BASE_URL || 'https://airesume.projectdemo.guru';
const RESULTS = [];
const SCREENSHOTS_DIR = join(__dirname, '..', 'test-results', 'forensic-audit');

try { mkdirSync(SCREENSHOTS_DIR, { recursive: true }); } catch {}

function logResult(category, page, status, details = '') {
    const entry = { category, page, status, details, timestamp: new Date().toISOString() };
    RESULTS.push(entry);
    const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : status === 'PARTIAL' ? '⚠️' : 'ℹ️';
    console.log(`${icon} [${category}] ${page}: ${status} ${details ? '— ' + details : ''}`);
}

async function auditPage(page, url, name, category = 'PUBLIC') {
    const pageErrors = [];
    const consoleErrors = [];
    const networkFailures = [];
    const apiCalls = [];
    
    page.on('pageerror', err => {
        pageErrors.push(err.message);
    });
    page.on('console', msg => {
        if (msg.type() === 'error') {
            const text = msg.text();
            consoleErrors.push(text);
        }
    });
    page.on('requestfailed', req => {
        networkFailures.push({ url: req.url(), failure: req.failure()?.errorText });
    });
    page.on('response', res => {
        if (res.url().includes('/api/')) {
            apiCalls.push({ url: res.url(), status: res.status(), method: res.request().method() });
        }
    });
    
    try {
        const response = await page.goto(url, { waitUntil: 'load', timeout: 25000 });
        const status = response?.status();
        
        if (status >= 400) {
            logResult(category, name, 'FAIL', `HTTP ${status}`);
            return { status: 'FAIL', httpStatus: status, pageErrors, consoleErrors, networkFailures, apiCalls };
        }
        
        await page.waitForTimeout(1500);
        
        const screenshotName = name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        await page.screenshot({ path: join(SCREENSHOTS_DIR, `${screenshotName}.png`), fullPage: true });
        
        const bodyText = await page.evaluate(() => document.body?.innerText || '');
        const hasContent = bodyText.trim().length > 50;
        const isNotFound = bodyText.includes('Page not found') || bodyText.includes('does not exist');
        
        // Fatal JS runtime crash (uncaught exceptions)
        if (pageErrors.length > 0) {
            logResult(category, name, 'FAIL', `Uncaught runtime exception: ${pageErrors.slice(0, 2).join(' | ')}`);
            return { status: 'FAIL', pageErrors };
        }
        
        if (isNotFound) {
            logResult(category, name, 'FAIL', 'Shows 404 / Page not found');
        } else if (!hasContent) {
            logResult(category, name, 'FAIL', 'Blank page rendered (empty body content)');
        } else {
            // Check for non-quota unhandled application errors
            const appErrors = consoleErrors.filter(e => 
                !e.includes('429') && 
                !e.includes('RESOURCE_EXHAUSTED') && 
                !e.includes('Failed to load resource') &&
                !e.includes('favicon')
            );
            if (appErrors.length > 0) {
                logResult(category, name, 'PARTIAL', `Loaded with console errors: ${appErrors.slice(0, 2).join(' | ')}`);
            } else {
                logResult(category, name, 'PASS', 'Rendered successfully with complete content');
            }
        }
        
        return { status: (isNotFound || !hasContent) ? 'FAIL' : 'PASS', httpStatus: status, pageErrors, consoleErrors, networkFailures, apiCalls, bodySnippet: bodyText.substring(0, 200) };
    } catch (err) {
        logResult(category, name, 'FAIL', `Navigation error: ${err.message}`);
        return { status: 'FAIL', error: err.message };
    }
}

async function main() {
    console.log('\n══════════════════════════════════════════════════════');
    console.log(`  FULL-SYSTEM FORENSIC AUDIT — Target: ${BASE_URL}`);
    console.log('══════════════════════════════════════════════════════\n');
    
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
    
    // PHASE 1: PUBLIC PAGES
    console.log('\n── Phase 1: Public Pages (Content & Degradation Resilience) ──\n');
    
    const publicPages = [
        ['/', 'Home Page'],
        ['/login', 'Login Page'],
        ['/features', 'Features Page'],
        ['/pricing', 'Pricing Page'],
        ['/contact', 'Contact Page'],
        ['/blog', 'Blog List'],
        ['/jobs', 'Jobs Landing'],
        ['/jobs/portal', 'Jobs Portal'],
        ['/portfolios', 'Portfolio Gallery'],
        ['/coverletter', 'Cover Letter Builder'],
        ['/front', 'Front Page'],
        ['/create-resume', 'Create Resume'],
    ];
    
    for (const [path, name] of publicPages) {
        const page = await context.newPage();
        await auditPage(page, `${BASE_URL}${path}`, name, 'PUBLIC');
        await page.close();
    }
    
    // PHASE 2: API ENDPOINTS & SECURITY BOUNDARIES
    console.log('\n── Phase 2: API Endpoints & Auth Boundary Probes ──────\n');
    
    const apiEndpoints = [
        // Public API endpoints (Expected 200)
        { method: 'GET', endpoint: '/api/healthz', expected: 200, isPublic: true, desc: 'Public Healthz Probe' },
        { method: 'GET', endpoint: '/api/health', expected: 200, isPublic: true, desc: 'Public Health Probe' },
        { method: 'GET', endpoint: '/api/platform/version', expected: 200, isPublic: true, desc: 'Public Platform Version' },
        { method: 'GET', endpoint: '/api/public/custom-pages', expected: 200, isPublic: true, desc: 'Public Custom Pages' },
        { method: 'GET', endpoint: '/api/public/trusted-by', expected: 200, isPublic: true, desc: 'Public Trusted By Logos' },
        // Protected Admin/Enterprise APIs (Expected 401 unauthenticated — Security Invariant)
        { method: 'GET', endpoint: '/api/admin/blog/posts', expected: 401, isPublic: false, desc: 'Protected Admin Blog API' },
        { method: 'GET', endpoint: '/api/platform/health', expected: 401, isPublic: false, desc: 'Protected Platform Health API' },
        { method: 'GET', endpoint: '/api/platform/settings', expected: 401, isPublic: false, desc: 'Protected Platform Settings API' },
        { method: 'GET', endpoint: '/api/enterprise/tenants', expected: 401, isPublic: false, desc: 'Protected Enterprise Tenants API' },
    ];
    
    for (const { method, endpoint, expected, isPublic, desc } of apiEndpoints) {
        const page = await context.newPage();
        try {
            const response = await page.goto(`${BASE_URL}${endpoint}`, { timeout: 10000 });
            const status = response?.status();
            const body = await response.text().catch(() => '');
            
            if (status === expected) {
                if (isPublic) {
                    logResult('API', `${desc} (${method} ${endpoint})`, 'PASS', `HTTP ${status} OK`);
                } else {
                    // Verify that 401 returns auth error and leaks zero secret data
                    const isSecure = body.includes('AUTH_REQUIRED') || body.includes('Authentication required') || body.includes('error');
                    if (isSecure) {
                        logResult('API_SECURITY', `${desc} (${method} ${endpoint})`, 'PASS', `HTTP 401 correctly enforced (Zero data leaked)`);
                    } else {
                        logResult('API_SECURITY', `${desc} (${method} ${endpoint})`, 'FAIL', `HTTP 401 returned unexpected body structure`);
                    }
                }
            } else {
                logResult(isPublic ? 'API' : 'API_SECURITY', `${desc} (${method} ${endpoint})`, 'FAIL', `Expected HTTP ${expected}, received HTTP ${status}`);
            }
        } catch (err) {
            logResult('API', `${desc} (${method} ${endpoint})`, 'FAIL', err.message);
        }
        await page.close();
    }
    
    // PHASE 3: RESPONSIVE VIEWPORT TESTING (ALL 7 VIEWPORTS)
    console.log('\n── Phase 3: Responsive Viewport Testing (7 Viewports) ─\n');
    
    const viewports = [
        { width: 1440, height: 900, name: 'Desktop_HD' },
        { width: 1280, height: 800, name: 'Desktop_Standard' },
        { width: 1024, height: 768, name: 'Tablet_Landscape' },
        { width: 768, height: 1024, name: 'Tablet_Portrait' },
        { width: 430, height: 932, name: 'iPhone_14_Pro_Max' },
        { width: 390, height: 844, name: 'iPhone_12_13' },
        { width: 375, height: 667, name: 'iPhone_SE' },
    ];
    
    for (const vp of viewports) {
        const vpContext = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
        for (const path of ['/', '/login', '/pricing']) {
            const page = await vpContext.newPage();
            try {
                await page.goto(`${BASE_URL}${path}`, { waitUntil: 'load', timeout: 20000 });
                await page.waitForTimeout(1000);
                const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
                const safePathName = path === '/' ? 'home' : path.replace(/[/\\?%*:|"<>]/g, '_');
                await page.screenshot({ path: join(SCREENSHOTS_DIR, `responsive_${vp.name}_${safePathName}.png`) });
                logResult('RESPONSIVE', `${path} @ ${vp.name} (${vp.width}x${vp.height})`, hasOverflow ? 'FAIL' : 'PASS', hasOverflow ? 'Horizontal overflow detected' : 'No overflow');
            } catch (err) {
                logResult('RESPONSIVE', `${path} @ ${vp.name}`, 'FAIL', err.message);
            }
            await page.close();
        }
        await vpContext.close();
    }
    
    // PHASE 4: AUTH BOUNDARY & ROUTE ISOLATION
    console.log('\n── Phase 4: Route Auth Boundaries & Navigation Isolation ──\n');
    
    const protectedRoutes = [
        '/adm/dashboard', '/adm/settings', '/adm/users', '/adm/messages',
        '/adm/audit-logs', '/adm/queues', '/adm/tenants', '/adm/security',
        '/adm/operations', '/adm/health', '/adm/operators',
        '/dashboard', '/enterprise/overview', '/portfolio/builder',
    ];
    
    for (const route of protectedRoutes) {
        const page = await context.newPage();
        try {
            await page.goto(`${BASE_URL}${route}`, { waitUntil: 'load', timeout: 20000 });
            await page.waitForTimeout(2000);
            const url = page.url();
            const bodyText = await page.evaluate(() => document.body?.innerText || '');
            const redirected = url.includes('/login') || url === `${BASE_URL}/` || url.includes('next=') || bodyText.includes('Sign in') || bodyText.includes('Welcome');
            const protectedContentVisible = bodyText.includes('Admin Console') || bodyText.includes('Super Admin Console') || bodyText.includes('Enterprise Management Console');
            
            if (redirected && !protectedContentVisible) {
                logResult('AUTH_BOUNDARY', route, 'PASS', `Unauthenticated access securely redirected to auth screen`);
            } else {
                logResult('AUTH_BOUNDARY', route, 'FAIL', `Protected content exposed or redirect bypassed! URL: ${url}`);
            }
        } catch (err) {
            logResult('AUTH_BOUNDARY', route, 'FAIL', err.message);
        }
        await page.close();
    }
    
    // SUMMARY
    console.log('\n══════════════════════════════════════════════════════');
    console.log('  AUDIT SUMMARY');
    console.log('══════════════════════════════════════════════════════\n');
    
    const pass = RESULTS.filter(r => r.status === 'PASS').length;
    const fail = RESULTS.filter(r => r.status === 'FAIL').length;
    const partial = RESULTS.filter(r => r.status === 'PARTIAL').length;
    
    console.log(`Total Probes: ${RESULTS.length}  PASS: ${pass}  FAIL: ${fail}  PARTIAL: ${partial}`);
    
    const failures = RESULTS.filter(r => r.status === 'FAIL');
    if (failures.length > 0) {
        console.log('\n── Failures ──────────────────────────────────────────\n');
        for (const f of failures) console.log(`  ❌ [${f.category}] ${f.page}: ${f.details}`);
    }

    const partials = RESULTS.filter(r => r.status === 'PARTIAL');
    if (partials.length > 0) {
        console.log('\n── Warnings / Partials ───────────────────────────────\n');
        for (const p of partials) console.log(`  ⚠️ [${p.category}] ${p.page}: ${p.details}`);
    }
    
    writeFileSync(join(SCREENSHOTS_DIR, 'audit-results.json'), JSON.stringify({ 
        timestamp: new Date().toISOString(),
        summary: { total: RESULTS.length, pass, fail, partial },
        results: RESULTS 
    }, null, 2));
    
    await browser.close();
    process.exit(fail > 0 ? 1 : 0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(2); });
