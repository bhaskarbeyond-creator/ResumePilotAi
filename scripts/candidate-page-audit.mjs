/**
 * ULTIMATE-MED Phase 2/7 — Candidate workspace page-by-page audit engine.
 *
 * Authenticates as the real seeded candidate (SUPER_ADMIN uid) against the
 * live XAMPP site, then visits every reconciled candidate route at the 8
 * mandated viewports, capturing for each combination:
 *   - full-page screenshot -> artifacts/ui-ux-audit/<page-id>/<viewport>/loaded.png
 *   - horizontal overflow + offender elements
 *   - console errors, failed requests, page errors
 *   - content settle time
 *
 * Additionally exercises the export pipelines: /shared/:resumeId and all
 * 55 /export/<Cv|Cover>N/:resumeId/:language renderers using a real resume id
 * read from the live API.
 *
 * Output: .bridge/evidence/candidate-page-audit.json
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

const TARGET_URL = process.env.CANDIDATE_TARGET_URL || process.env.TARGET_URL || 'https://ime365.local';
const PACE_MS = Number(process.env.CANDIDATE_PACE_MS || 1200);
const ARTIFACTS_DIR = path.join(__dirname, '../artifacts/ui-ux-audit');
const EVIDENCE_DIR = path.join(__dirname, '../.bridge/evidence');
fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

const VIEWPORTS = [
    { name: '320x568', width: 320, height: 568 },
    { name: '375x812', width: 375, height: 812 },
    { name: '430x932', width: 430, height: 932 },
    { name: '768x1024', width: 768, height: 1024 },
    { name: '1024x768', width: 1024, height: 768 },
    { name: '1366x768', width: 1366, height: 768 },
    { name: '1440x900', width: 1440, height: 900 },
    { name: '1920x1080', width: 1920, height: 1080 },
];

const CANDIDATE_ROUTES = [
    { id: 'cockpit', route: '/dashboard' },
    { id: 'cover-letters', route: '/dashboard/cover-letters' },
    { id: 'portfolios', route: '/dashboard/portfolios' },
    { id: 'favorites', route: '/dashboard/favorites' },
    { id: 'notifications', route: '/dashboard/notifications' },
    { id: 'jobs', route: '/dashboard/jobs' },
    { id: 'jobs-browse', route: '/dashboard/jobs/browse' },
    { id: 'job-tracker', route: '/dashboard/job-tracker' },
    { id: 'applied-jobs', route: '/dashboard/applied-jobs' },
    { id: 'interview', route: '/dashboard/interview' },
    { id: 'messages', route: '/dashboard/messages' },
    { id: 'plans', route: '/dashboard/plans' },
    { id: 'settings', route: '/dashboard/settings' },
    { id: 'settings-security', route: '/dashboard/settings?tab=Security' },
    { id: 'support', route: '/dashboard/support' },
    { id: 'design-system', route: '/dashboard/design-system' },
    { id: 'build-heading', route: '/build-resume' },
    { id: 'build-work-history', route: '/build-resume/work-history' },
    { id: 'build-education', route: '/build-resume/education' },
    { id: 'build-skills', route: '/build-resume/skills' },
    { id: 'build-languages', route: '/build-resume/languages' },
    { id: 'build-summary', route: '/build-resume/summary' },
    { id: 'build-projects', route: '/build-resume/projects' },
    { id: 'build-certifications', route: '/build-resume/certifications' },
    { id: 'build-achievements', route: '/build-resume/achievements' },
    { id: 'build-references', route: '/build-resume/references' },
    { id: 'build-custom', route: '/build-resume/custom' },
    { id: 'build-review', route: '/build-resume/review' },
    { id: 'portfolio-builder', route: '/portfolio/builder' },
    { id: 'portfolio-gallery', route: '/portfolios' },
];

async function signedInPage(browser, vp) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, ignoreHTTPSErrors: true });
    const page = await context.newPage();
    const customToken = await admin.auth().createCustomToken('OhZdiSIFL7ePA1TMkfu9bnR935D3', {
        email: 'bhaskar.beyond@gmail.com',
        email_verified: true,
        role: 'SUPER_ADMIN',
        superAdmin: true,
    });
    await page.goto(`${TARGET_URL}/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.evaluate(async (token) => { await window.fire.auth().signInWithCustomToken(token); }, customToken);
    await page.waitForTimeout(1500);
    return { context, page };
}

async function measure(page, route, pageId, vp) {
    const entry = { pageId, route, viewport: vp.name, screenshot: null, overflowPx: 0, offenders: [], consoleErrors: [], failedRequests: [], pageErrors: [], settleMs: 0, blank: false };
    const consoleErrors = [];
    const failedRequests = [];
    const pageErrors = [];
    const onConsole = (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 250)); };
    const onResponse = (res) => {
        if (res.status() >= 400 && !/\.(png|jpg|jpeg|svg|woff2?|ico|webp|gif)$/i.test(new URL(res.url()).pathname)) {
            failedRequests.push({ status: res.status(), url: res.url().slice(0, 180) });
        }
    };
    const onPageError = (err) => pageErrors.push(String(err.message || err).slice(0, 250));
    page.on('console', onConsole);
    page.on('response', onResponse);
    page.on('pageerror', onPageError);

    try {
        await page.goto(`${TARGET_URL}${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
        let textLen = 0;
        for (const ms of [500, 1200, 2200, 3500, 6000]) {
            await page.waitForTimeout(ms - (entry.settleMs || 0));
            entry.settleMs = ms;
            textLen = await page.evaluate(() => (document.body.innerText || '').trim().length);
            if (textLen > 200) break;
        }
        entry.blank = textLen < 25;
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
                    if (r.right > vw + 1 || r.width > vw + 1 || r.left < -1) {
                        const cls = (el.className && typeof el.className === 'string') ? el.className.slice(0, 90) : '';
                        offenders.push({ tag: el.tagName.toLowerCase(), cls, left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) });
                        if (offenders.length >= 5) break;
                    }
                }
            }
            return { overflowPx, offenders };
        });
        entry.overflowPx = metrics.overflowPx;
        entry.offenders = metrics.offenders;

        const dir = path.join(ARTIFACTS_DIR, pageId, vp.name);
        fs.mkdirSync(dir, { recursive: true });
        const shotPath = path.join(dir, 'loaded.png');
        await page.screenshot({ path: shotPath, fullPage: true });
        entry.screenshot = path.relative(path.join(__dirname, '..'), shotPath).replace(/\\/g, '/');
    } catch (navErr) {
        entry.pageErrors.push(`NAV_ERROR: ${navErr.message.slice(0, 200)}`);
    }

    entry.consoleErrors = consoleErrors.slice(0, 8);
    entry.failedRequests = failedRequests.slice(0, 8);
    entry.pageErrors = pageErrors.slice(0, 8);
    page.off('console', onConsole);
    page.off('response', onResponse);
    page.off('pageerror', onPageError);
    return entry;
}

async function run() {
    console.log(`=== CANDIDATE PAGE AUDIT: ${CANDIDATE_ROUTES.length} routes x ${VIEWPORTS.length} viewports on ${TARGET_URL} ===`);
    const browser = await chromium.launch({ headless: true, args: ['--ignore-certificate-errors'] });
    const results = [];
    const exportResults = [];

    for (const vp of VIEWPORTS) {
        const { context, page } = await signedInPage(browser, vp);
        for (const { id, route } of CANDIDATE_ROUTES) {
            const entry = await measure(page, route, id, vp);
            const flag = (entry.overflowPx > 1 || entry.consoleErrors.length || entry.failedRequests.length || entry.pageErrors.length || entry.blank) ? ' [ISSUE]' : '';
            console.log(`[${vp.name}] ${route}${flag}${entry.overflowPx > 1 ? ` overflow=${entry.overflowPx}px` : ''}${entry.blank ? ' BLANK' : ''}${entry.pageErrors.length ? ` pageErr=${entry.pageErrors.length}` : ''}${entry.failedRequests.length ? ` failedReq=${entry.failedRequests.length}` : ''}`);
            results.push(entry);
            if (PACE_MS > 0) await page.waitForTimeout(PACE_MS);
        }
        await context.close();
    }

    // Export pipelines: real resume id from the live API, then all 55 export renderers.
    console.log('\n=== EXPORT PIPELINE: fetching real resume id ===');
    const { context, page } = await signedInPage(browser, { name: '1280x800-export', width: 1280, height: 800 });
    const resumeId = await page.evaluate(async () => {
        const user = window.fire.auth().currentUser;
        const token = await user.getIdToken();
        const res = await fetch('/api/resumes?page=1&itemsPerPage=5', { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        return data?.resumes?.[0]?.id || null;
    });
    console.log('resumeId:', resumeId);

    if (resumeId) {
        const sharedEntry = await measure(page, `/shared/${resumeId}`, 'shared-resume', { name: '1280x800-export' });
        console.log(`[export] /shared/${resumeId}${sharedEntry.overflowPx > 1 ? ' OVERFLOW' : ''}${sharedEntry.pageErrors.length ? ' pageErr' : ''}${sharedEntry.blank ? ' BLANK' : ''}`);
        exportResults.push(sharedEntry);

        for (let n = 1; n <= 51; n++) {
            const e = await measure(page, `/export/Cv${n}/${resumeId}/en`, `export-cv${n}`, { name: '1280x800-export' });
            const flag = (e.overflowPx > 1 || e.pageErrors.length || e.blank) ? ' [ISSUE]' : '';
            console.log(`[export] Cv${n}${flag}`);
            exportResults.push(e);
            if (PACE_MS > 0) await page.waitForTimeout(PACE_MS);
        }
        for (let n = 1; n <= 4; n++) {
            const e = await measure(page, `/export/Cover${n}/${resumeId}/en`, `export-cover${n}`, { name: '1280x800-export' });
            const flag = (e.overflowPx > 1 || e.pageErrors.length || e.blank) ? ' [ISSUE]' : '';
            console.log(`[export] Cover${n}${flag}`);
            exportResults.push(e);
            if (PACE_MS > 0) await page.waitForTimeout(PACE_MS);
        }
    }
    await context.close();
    await browser.close();

    const summary = {
        generatedAt: new Date().toISOString(),
        targetUrl: TARGET_URL,
        pageCombinations: results.length,
        exportCombinations: exportResults.length,
        overflowPages: results.filter(r => r.overflowPx > 1).map(r => ({ id: r.pageId, vp: r.viewport, px: r.overflowPx })),
        blankPages: results.filter(r => r.blank).map(r => ({ id: r.pageId, vp: r.viewport })),
        pageErrorPages: results.filter(r => r.pageErrors.length).map(r => ({ id: r.pageId, vp: r.viewport, first: r.pageErrors[0] })),
        consoleErrorPages: results.filter(r => r.consoleErrors.length).map(r => ({ id: r.pageId, vp: r.viewport, first: r.consoleErrors[0] })),
        failedRequestPages: results.filter(r => r.failedRequests.length).map(r => ({ id: r.pageId, vp: r.viewport, first: r.failedRequests[0] })),
        exportIssues: exportResults.filter(r => r.overflowPx > 1 || r.pageErrors.length || r.blank).map(r => ({ id: r.pageId, overflow: r.overflowPx, pageErr: r.pageErrors[0] || null, blank: r.blank })),
    };
    fs.writeFileSync(path.join(EVIDENCE_DIR, 'candidate-page-audit.json'), JSON.stringify({ summary, results, exportResults }, null, 2));
    console.log('\n=== CANDIDATE PAGE AUDIT SUMMARY ===');
    console.log(JSON.stringify(summary, null, 2));
}

run().catch((err) => { console.error(err); process.exit(1); });
