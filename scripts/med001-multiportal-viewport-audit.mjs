/**
 * MED-001-FINAL Phase D â€” Multi-Portal 8-Viewport UI/UX Audit (DIR-112)
 * Authenticates as SUPER_ADMIN via Firebase custom token against the live
 * XAMPP-served application and crawls every portal's critical routes at the
 * 8 mandated viewports (320/375/390/768/1024/1280/1440/1920), measuring
 * horizontal overflow, console errors, failed requests, page errors, blanks.
 * Output: .bridge/evidence/med001-viewport-audit.json + console table.
 */
import { chromium } from 'playwright';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../backend/.env') });

const adminMod = await import('../backend/services/firebaseAdmin.js');
const admin = adminMod.default || adminMod;

if (!admin.apps.length) {
    const pKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: pKey,
        }),
    });
}

const TARGET_URL = (process.env.TARGET_URL || process.env.APP_URL);
const PACE_MS = Number(process.env.MED001_PACE_MS || 0);
const VIEWPORT_FILTER = (process.env.MED001_VIEWPORT_FILTER || '').split(',').map(s => s.trim()).filter(Boolean);
const EVIDENCE_DIR = path.join(__dirname, '../.bridge/evidence');
if (!fs.existsSync(EVIDENCE_DIR)) fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

const VIEWPORTS = [
    { name: '320-mobile-min', width: 320, height: 640 },
    { name: '375-mobile-std', width: 375, height: 667 },
    { name: '390-mobile-lg', width: 390, height: 844 },
    { name: '768-tablet-portrait', width: 768, height: 1024 },
    { name: '1024-tablet-landscape', width: 1024, height: 768 },
    { name: '1280-laptop', width: 1280, height: 800 },
    { name: '1440-desktop', width: 1440, height: 900 },
    { name: '1920-fhd', width: 1920, height: 1080 },
];

const ROUTES = [
    { portal: 'public', route: '/' },
    { portal: 'public', route: '/login' },
    { portal: 'public', route: '/jobs' },
    { portal: 'public', route: '/blog' },
    { portal: 'candidate', route: '/dashboard' },
    { portal: 'candidate', route: '/dashboard/settings' },
    { portal: 'candidate', route: '/dashboard/interview' },
    { portal: 'candidate', route: '/dashboard/job-tracker' },
    { portal: 'candidate', route: '/dashboard/applied-jobs' },
    { portal: 'candidate', route: '/dashboard/portfolios' },
    { portal: 'candidate', route: '/dashboard/cover-letters' },
    { portal: 'candidate', route: '/dashboard/messages' },
    { portal: 'candidate', route: '/dashboard/plans' },
    { portal: 'candidate', route: '/build-resume' },
    { portal: 'employer', route: '/employer' },
    { portal: 'employer', route: '/employer/jobs' },
    { portal: 'employer', route: '/employer/applicants' },
    { portal: 'employer', route: '/employer/messages' },
    { portal: 'employer', route: '/employer/company' },
    { portal: 'employer', route: '/employer/settings' },
    { portal: 'admin', route: '/admin/dashboard' },
    { portal: 'admin', route: '/admin/users' },
    { portal: 'admin', route: '/admin/audit-logs' },
    { portal: 'admin', route: '/admin/security' },
    { portal: 'admin', route: '/admin/health' },
    { portal: 'admin', route: '/admin/settings' },
    { portal: 'admin', route: '/admin/jobs-manager' },
    { portal: 'admin', route: '/admin/messages' },
];

async function run() {
    console.log(`=== MED-001 MULTI-PORTAL ${VIEWPORTS.length}-VIEWPORT UI/UX AUDIT ===`);
    console.log(`Target: ${TARGET_URL} | Routes: ${ROUTES.length} | Combinations: ${VIEWPORTS.length * ROUTES.length}\n`);

    const customToken = await admin.auth().createCustomToken('OhZdiSIFL7ePA1TMkfu9bnR935D3', {
        email: 'bhaskar.beyond@gmail.com',
        email_verified: true,
        role: 'SUPER_ADMIN',
        superAdmin: true,
    });

    const browser = await chromium.launch({ headless: true, args: ['--ignore-certificate-errors'] });
    const results = [];
    let totalOverflow = 0;
    let totalConsoleErrors = 0;
    let totalFailedRequests = 0;
    let totalPageErrors = 0;

    for (const vp of VIEWPORTS) {
        if (VIEWPORT_FILTER.length && !VIEWPORT_FILTER.some(f => vp.name.includes(f) || String(vp.width) === f)) continue;
        const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, ignoreHTTPSErrors: true });
        const page = await context.newPage();

        await page.goto(`${TARGET_URL}/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.evaluate(async (token) => {
            await window.fire.auth().signInWithCustomToken(token);
        }, customToken);
        await page.waitForTimeout(800);

        for (const { portal, route } of ROUTES) {
            const entry = { viewport: vp.name, width: vp.width, portal, route, finalUrl: null, overflowPx: 0, offenders: [], consoleErrors: [], failedRequests: [], pageErrors: [], blank: false };
            const consoleErrors = [];
            const failedRequests = [];
            const pageErrors = [];
            const onConsole = (msg) => {
                if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 300));
            };
            const onResponse = (res) => {
                if (res.status() >= 400 && !/\.(png|jpg|jpeg|svg|woff2?|ico|webp|gif)$/i.test(new URL(res.url()).pathname)) {
                    failedRequests.push({ status: res.status(), url: res.url().slice(0, 200) });
                }
            };
            const onPageError = (err) => pageErrors.push(String(err.message || err).slice(0, 300));
            page.on('console', onConsole);
            page.on('response', onResponse);
            page.on('pageerror', onPageError);

            try {
                await page.goto(`${TARGET_URL}${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 });

                // Poll until content stabilizes (auth bootstrap + maintenance gate
                // render a spinner first; pages settle within ~0.4s-4s on reload).
                let settleMs = 0;
                let textLen = 0;
                for (const ms of [400, 1000, 2000, 3500, 6000]) {
                    await page.waitForTimeout(ms - settleMs);
                    settleMs = ms;
                    textLen = await page.evaluate(() => (document.body.innerText || '').trim().length);
                    if (textLen > 200) break;
                }
                const settled = textLen > 200;

                entry.finalUrl = page.url();
                entry.settleMs = settleMs;
                const metrics = await page.evaluate(() => {
                    const doc = document.documentElement;
                    const body = document.body;
                    const overflowPx = Math.max(doc.scrollWidth - doc.clientWidth, body.scrollWidth - body.clientWidth, 0);
                    const vw = doc.clientWidth;
                    const offenders = [];
                    if (overflowPx > 1) {
                        const all = body.querySelectorAll('*');
                        for (const el of all) {
                            const r = el.getBoundingClientRect();
                            if (r.width > vw + 1 || r.right > vw + 1 || r.left < -1) {
                                const cls = (el.className && typeof el.className === 'string') ? el.className.slice(0, 90) : '';
                                const tag = el.tagName.toLowerCase();
                                offenders.push({ tag, cls, left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) });
                                if (offenders.length >= 6) break;
                            }
                        }
                    }
                    const textLen = (body.innerText || '').trim().length;
                    return { overflowPx, offenders, textLen };
                });
                entry.overflowPx = metrics.overflowPx;
                entry.offenders = metrics.offenders;
                entry.blank = metrics.textLen < 25;
                if (metrics.overflowPx > 1) totalOverflow++;
            } catch (navErr) {
                entry.pageErrors.push(`NAV_ERROR: ${navErr.message.slice(0, 200)}`);
            }

            entry.consoleErrors = consoleErrors.slice(0, 10);
            entry.failedRequests = failedRequests.slice(0, 10);
            entry.pageErrors = pageErrors.slice(0, 10);
            totalConsoleErrors += consoleErrors.length;
            totalFailedRequests += failedRequests.length;
            totalPageErrors += pageErrors.length;

            const flag = (entry.overflowPx > 1 || entry.consoleErrors.length || entry.failedRequests.length || entry.pageErrors.length || entry.blank) ? ' [ISSUE]' : '';
            console.log(`[${vp.width}px] ${route}${flag}${entry.overflowPx > 1 ? ` overflow=${entry.overflowPx}px` : ''}${entry.failedRequests.length ? ` failedReq=${entry.failedRequests.length}` : ''}${entry.consoleErrors.length ? ` consoleErr=${entry.consoleErrors.length}` : ''}${entry.blank ? ' BLANK' : ''}`);
            results.push(entry);

            page.off('console', onConsole);
            page.off('response', onResponse);
            page.off('pageerror', onPageError);
            if (PACE_MS > 0) await page.waitForTimeout(PACE_MS);
        }
        await context.close();
    }

    await browser.close();

    const summary = {
        generatedAt: new Date().toISOString(),
        targetUrl: TARGET_URL,
        viewports: VIEWPORTS.length,
        routes: ROUTES.length,
        combinations: VIEWPORTS.length * ROUTES.length,
        totalOverflow: { pages: totalOverflow, details: results.filter(r => r.overflowPx > 1).map(r => ({ vp: r.viewport, route: r.route, px: r.overflowPx, offenders: r.offenders.slice(0, 2) })) },
        totalConsoleErrorPages: results.filter(r => r.consoleErrors.length).length,
        consoleErrorSamples: results.filter(r => r.consoleErrors.length).slice(0, 15).map(r => ({ vp: r.viewport, route: r.route, first: r.consoleErrors[0] })),
        totalFailedRequestPages: results.filter(r => r.failedRequests.length).length,
        failedRequestSamples: results.filter(r => r.failedRequests.length).slice(0, 15).map(r => ({ vp: r.viewport, route: r.route, first: r.failedRequests[0] })),
        totalPageErrorPages: results.filter(r => r.pageErrors.length).length,
        pageErrorSamples: results.filter(r => r.pageErrors.length).slice(0, 15).map(r => ({ vp: r.viewport, route: r.route, first: r.pageErrors[0] })),
        blankPages: results.filter(r => r.blank).map(r => ({ vp: r.viewport, route: r.route, finalUrl: r.finalUrl })),
    };

    fs.writeFileSync(path.join(EVIDENCE_DIR, 'med001-viewport-audit.json'), JSON.stringify({ summary, results }, null, 2));
    console.log('\n=== MED-001 VIEWPORT AUDIT SUMMARY ===');
    console.log(JSON.stringify(summary, null, 2));
}

run().catch((err) => { console.error(err); process.exit(1); });
