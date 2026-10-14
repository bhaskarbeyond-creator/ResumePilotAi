/**
 * DIR-003 / CAND-001 — live DOM crawl for the dedicated Resumes & Master CV
 * workspace hub (/dashboard/resumes).
 *
 * Signs in as the real seeded candidate with a REAL Firebase custom token
 * minted by the backend service account — the same flow used by
 * scripts/candidate-page-audit.mjs — against the live XAMPP vhost, then:
 *   1. loads /dashboard/resumes and asserts the hub mounts;
 *   2. cross-checks the rendered resume rows against the live /api/resumes;
 *   3. asserts the sidebar entry targets the hub and is marked active;
 *   4. asserts the legacy /resumes redirect lands on the hub;
 *   5. records console/page errors, failed requests and horizontal overflow.
 *
 * Foreground-only: no servers are spawned; the browser and page close at exit.
 */
import { chromium } from 'playwright';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', 'backend', '.env') });

const adminMod = await import('../../backend/services/firebaseAdmin.js');
const admin = adminMod.default || adminMod;
if (!admin.apps.length) {
    const pKey = String(process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: pKey,
        }),
    });
}

const TARGET_URL = process.env.TARGET_URL
    || process.env.CANDIDATE_TARGET_URL
    || 'https://ai-resume-builder.local';
const CANDIDATE_UID = process.env.DIR003_CANDIDATE_UID || 'OhZdiSIFL7ePA1TMkfu9bnR935D3';
const OUT = path.join(__dirname, 'dir003-resumes-hub-crawl.json');
const checks = [];
const record = (name, ok, detail) => {
    checks.push({ name, ok, detail: detail || '' });
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

async function settle(page) {
    for (const ms of [600, 1400, 2400, 4000]) {
        await page.waitForTimeout(ms);
        const len = await page.evaluate(() => (document.body.innerText || '').trim().length);
        if (len > 120) return len;
    }
    return page.evaluate(() => (document.body.innerText || '').trim().length);
}

const run = async () => {
    const browser = await chromium.launch({ headless: true, args: ['--ignore-certificate-errors'] });
    const results = { target: TARGET_URL, viewports: [] };
    try {
        for (const vp of [
            { name: '1440x900', width: 1440, height: 900 },
            { name: '375x812', width: 375, height: 812 },
        ]) {
            const context = await browser.newContext({
                viewport: { width: vp.width, height: vp.height },
                ignoreHTTPSErrors: true,
            });
            const page = await context.newPage();
            const consoleErrors = [];
            const pageErrors = [];
            const failedRequests = [];
            page.on('console', (msg) => {
                if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 220));
            });
            page.on('pageerror', (err) => pageErrors.push(String(err.message || err).slice(0, 220)));
            page.on('response', (res) => {
                if (res.status() >= 400 && !/\.(png|jpe?g|svg|woff2?|ico|webp|gif)$/i.test(new URL(res.url()).pathname)) {
                    failedRequests.push({ status: res.status(), url: res.url().slice(0, 160) });
                }
            });

            const customToken = await admin.auth().createCustomToken(CANDIDATE_UID, {
                email: 'bhaskar.beyond@gmail.com',
                email_verified: true,
                role: 'SUPER_ADMIN',
                superAdmin: true,
            });
            await page.goto(`${TARGET_URL}/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
            await page.evaluate(async (token) => {
                await window.fire.auth().signInWithCustomToken(token);
            }, customToken);
            await page.waitForTimeout(1800);

            // Real API read from the authenticated page context (same-origin;
            // the app's fetch interceptor attaches the Firebase bearer token).
            const apiResumes = await page.evaluate(async () => {
                const res = await fetch('/api/resumes');
                const data = await res.json();
                return Array.isArray(data.resumes) ? data.resumes : [];
            });
            const apiCount = apiResumes.length;

            await page.goto(`${TARGET_URL}/dashboard/resumes`, { waitUntil: 'domcontentloaded', timeout: 45000 });
            const bodyLen = await settle(page);
            // Deterministic wait for the data-dependent surface: either the real
            // resume list, the honest empty state, or an explicit error state.
            await page.waitForSelector(
                '[data-testid="dashboard-resumes-hub"] ul[aria-label="Saved resumes"] li, '
                + '[data-testid="dashboard-resumes-hub"] [class*="border-dashed"], '
                + '[data-testid="dashboard-resumes-hub"] [role="alert"]',
                { timeout: 20000 },
            ).catch(() => {});
            await page.waitForTimeout(500);

            const hub = await page.evaluate(() => {
                const root = document.querySelector('[data-testid="dashboard-resumes-hub"]');
                const h1 = Array.from(document.querySelectorAll('h1')).map((el) => el.textContent || '').join(' | ');
                const sidebarLink = Array.from(document.querySelectorAll('nav a[href="/dashboard/resumes"]')).pop() || null;
                const activeLink = sidebarLink
                    ? { ariaCurrent: sidebarLink.getAttribute('aria-current'), cls: sidebarLink.className }
                    : null;
                const rows = Array.from(document.querySelectorAll('ul[aria-label="Saved resumes"] li')).map((li) => li.textContent || '');
                const emptyState = Boolean(document.querySelector('[data-testid="dashboard-resumes-hub"] [class*="border-dashed"]'));
                return {
                    hubMounted: Boolean(root),
                    h1,
                    sidebarHref: sidebarLink ? sidebarLink.getAttribute('href') : null,
                    activeLink,
                    rowCount: rows.length,
                    firstRowText: rows[0] || '',
                    emptyState,
                };
            });
            record(`[${vp.name}] hub mounts at /dashboard/resumes`, hub.hubMounted && page.url().includes('/dashboard/resumes'), page.url());
            record(`[${vp.name}] h1 renders the hub title`, /Resumes & Master CV/.test(hub.h1), hub.h1.slice(0, 120));
            record(`[${vp.name}] sidebar targets the hub`, hub.sidebarHref === '/dashboard/resumes', String(hub.sidebarHref));
            record(
                `[${vp.name}] sidebar marks the hub active`,
                hub.activeLink && (hub.activeLink.ariaCurrent === 'page' || /active/i.test(hub.activeLink.cls)),
                JSON.stringify(hub.activeLink).slice(0, 160),
            );
            record(
                `[${vp.name}] resume rows match the live API (${apiCount})`,
                apiCount === 0 ? hub.emptyState : hub.rowCount === apiCount,
                `rendered=${hub.rowCount} api=${apiCount}`,
            );
            record(`[${vp.name}] page is not blank`, bodyLen > 25, `bodyLen=${bodyLen}`);
            record(`[${vp.name}] zero console errors`, consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' ;; '));
            record(`[${vp.name}] zero page errors`, pageErrors.length === 0, pageErrors.slice(0, 3).join(' ;; '));
            record(`[${vp.name}] zero failed API requests`, failedRequests.length === 0, failedRequests.slice(0, 3).map((f) => `${f.status} ${f.url}`).join(' ;; '));

            const overflow = await page.evaluate(() => {
                const doc = document.documentElement;
                const body = document.body;
                return Math.max(doc.scrollWidth - doc.clientWidth, body.scrollWidth - body.clientWidth, 0);
            });
            record(`[${vp.name}] zero horizontal overflow`, overflow <= 1, `overflowPx=${overflow}`);

            const shot = path.join(__dirname, `dir003-resumes-hub-${vp.name}.png`);
            await page.screenshot({ path: shot, fullPage: true });
            results.viewports.push({
                viewport: vp.name,
                url: page.url(),
                apiCount,
                rowCount: hub.rowCount,
                overflowPx: overflow,
                consoleErrors,
                pageErrors,
                failedRequests,
                screenshot: path.basename(shot),
            });

            // Legacy /resumes redirect must land on the hub.
            await page.goto(`${TARGET_URL}/resumes`, { waitUntil: 'domcontentloaded', timeout: 45000 });
            await settle(page);
            record(`[${vp.name}] /resumes redirects to the hub`, page.url().includes('/dashboard/resumes'), page.url());

            await context.close();
        }
    } finally {
        await browser.close();
    }
    const passed = checks.filter((c) => c.ok).length;
    results.checks = checks;
    results.summary = { total: checks.length, passed, failed: checks.length - passed };
    fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
    console.log(`\nDIR-003 crawl: ${passed}/${checks.length} checks passed. Evidence: ${OUT}`);
    process.exit(passed === checks.length ? 0 : 1);
};

run().catch((err) => {
    console.error('DIR-003 crawl crashed:', err);
    process.exit(1);
});


