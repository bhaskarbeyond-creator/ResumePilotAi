/**
 * Full-System Forensic Audit — Playwright Browser Automation
 * 
 * This script performs a comprehensive browser-driven audit of the application.
 * It checks every page loads, captures network errors, and identifies integration gaps.
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_URL = 'http://localhost:3000';
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
    const errors = [];
    const networkFailures = [];
    const apiCalls = [];
    
    page.on('console', msg => {
        if (msg.type() === 'error') errors.push(msg.text());
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
        const response = await page.goto(url, { waitUntil: 'load', timeout: 20000 });
        const status = response?.status();
        
        if (status >= 400) {
            logResult(category, name, 'FAIL', `HTTP ${status}`);
            return { status: 'FAIL', httpStatus: status, errors, networkFailures, apiCalls };
        }
        
        await page.waitForTimeout(1000);
        
        const screenshotName = name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        await page.screenshot({ path: join(SCREENSHOTS_DIR, `${screenshotName}.png`), fullPage: true });
        
        const bodyText = await page.evaluate(() => document.body?.innerText || '');
        const isNotFound = bodyText.includes('Page not found') || bodyText.includes('does not exist');
        
        if (isNotFound) {
            logResult(category, name, 'FAIL', 'Shows 404 / Page not found');
        } else if (errors.length > 0) {
            logResult(category, name, 'PARTIAL', `Page loads but has ${errors.length} console error(s): ${errors.slice(0, 2).join(' | ')}`);
        } else if (networkFailures.length > 0) {
            logResult(category, name, 'PARTIAL', `Page loads but has ${networkFailures.length} network failure(s): ${networkFailures.map(n => n.url).slice(0, 2).join(', ')}`);
        } else {
            logResult(category, name, 'PASS', '');
        }
        
        return { status: isNotFound ? 'FAIL' : 'PASS', httpStatus: status, errors, networkFailures, apiCalls, bodySnippet: bodyText.substring(0, 300) };
    } catch (err) {
        logResult(category, name, 'FAIL', `Navigation error: ${err.message}`);
        return { status: 'FAIL', error: err.message };
    }
}

async function main() {
    console.log('\\n══════════════════════════════════════════════════════');
    console.log('  FULL-SYSTEM FORENSIC AUDIT — Browser Phase');
    console.log('══════════════════════════════════════════════════════\\n');
    
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
    
    // PHASE 1: PUBLIC PAGES
    console.log('\\n── Phase 1: Public Pages ──────────────────────────────\\n');
    
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
    
    // PHASE 2: API ENDPOINTS
    console.log('\\n── Phase 2: API Endpoint Verification ─────────────────\\n');
    
    const apiEndpoints = [
        ['GET', '/api/healthz'],
        ['GET', '/api/platform/settings/public'],
        ['GET', '/api/blog/posts'],
        ['GET', '/api/platform/health/status'],
    ];
    
    for (const [method, endpoint] of apiEndpoints) {
        const page = await context.newPage();
        try {
            const response = await page.goto(`${BASE_URL}${endpoint}`, { timeout: 10000 });
            const status = response?.status();
            if (status === 200) {
                logResult('API', `${method} ${endpoint}`, 'PASS', 'OK');
            } else if (status === 401) {
                logResult('API', `${method} ${endpoint}`, 'PARTIAL', 'Returns 401 (auth required)');
            } else {
                logResult('API', `${method} ${endpoint}`, 'FAIL', `HTTP ${status}`);
            }
        } catch (err) {
            logResult('API', `${method} ${endpoint}`, 'FAIL', err.message);
        }
        await page.close();
    }
    
    // PHASE 3: RESPONSIVE VIEWPORTS
    console.log('\n── Phase 3: Responsive Viewport Testing ───────────────\n');
    
    const viewports = [
        { width: 1440, height: 900, name: 'Desktop_HD' },
        { width: 1024, height: 768, name: 'Tablet_Landscape' },
        { width: 768, height: 1024, name: 'Tablet_Portrait' },
        { width: 430, height: 932, name: 'iPhone_14_Pro_Max' },
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
                logResult('RESPONSIVE', `${path} @ ${vp.name} (${vp.width}x${vp.height})`, hasOverflow ? 'FAIL' : 'PASS', hasOverflow ? 'Horizontal overflow' : '');
            } catch (err) {
                logResult('RESPONSIVE', `${path} @ ${vp.name}`, 'FAIL', err.message);
            }
            await page.close();
        }
        await vpContext.close();
    }
    
    // PHASE 4: AUTH BOUNDARY (Admin routes unauthenticated)
    console.log('\n── Phase 4: Auth Boundary Testing ─────────────────────\n');
    
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
            // Wait for auth verification and redirection to complete
            await page.waitForTimeout(2000);
            const url = page.url();
            const bodyText = await page.evaluate(() => document.body?.innerText || '');
            const redirected = url.includes('/login') || url === `${BASE_URL}/` || url.includes('next=') || bodyText.includes('Sign in') || bodyText.includes('Welcome');
            const protectedContentVisible = bodyText.includes('Admin Console') || bodyText.includes('Super Admin') || bodyText.includes('Enterprise Console');
            
            if (redirected && !protectedContentVisible) {
                logResult('AUTH', route, 'PASS', `Correctly redirected or blocked (URL: ${url})`);
            } else {
                logResult('AUTH', route, 'FAIL', `Protected content exposed or not redirected! URL: ${url}`);
            }
        } catch (err) {
            logResult('AUTH', route, 'FAIL', err.message);
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
    
    console.log(`Total: ${RESULTS.length}  PASS: ${pass}  FAIL: ${fail}  PARTIAL: ${partial}`);
    
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
