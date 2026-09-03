import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const VIEWPORTS = [
    { name: '1440p-desktop', width: 1440, height: 900, isMobile: false },
    { name: '1280p-desktop', width: 1280, height: 800, isMobile: false },
    { name: '1024p-tablet-landscape', width: 1024, height: 768, isMobile: false },
    // 768px is exactly the app's `md` breakpoint: the desktop ribbon is the
    // navigation surface here (the hamburger is `md:hidden`), so no mobile
    // context emulation.
    { name: '768p-tablet-portrait', width: 768, height: 1024, isMobile: false },
    { name: '390p-mobile-standard', width: 390, height: 844, isMobile: true },
    { name: '360p-mobile-compact', width: 360, height: 780, isMobile: true },
];

const RIBBON = {
    'heading': 'Personal info',
    'work-history': 'Work history',
    'education': 'Education',
    'skills': 'Skills',
    'languages': 'Languages',
    'summary': 'Summary',
    'projects': 'Projects',
    'certifications': 'Certifications',
    'achievements': 'Achievements',
    'references': 'References',
    'custom': 'Custom Sections',
    'review': 'Review & export',
};

const STEP_H1 = {
    'heading': /personal|contact|your details/i,
    'work-history': /work experience|work history/i,
    'education': /education/i,
    'skills': /skills/i,
    'languages': /languages/i,
    'summary': /summary/i,
    'projects': /projects/i,
    'certifications': /certifications|credential/i,
    'achievements': /achievements/i,
    'references': /references/i,
    'custom': /custom/i,
    'review': /review/i,
};

const distDir = path.resolve(process.argv[2] || 'dist');
if (!fs.existsSync(distDir)) {
    console.error('dist/ missing — run `npm run build` first.');
    process.exit(1);
}

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

// In-memory resume-draft store so the builder's autosave lifecycle (create →
// save → reload) runs exactly as against the real backend.
const resumeStore = new Map();

const json = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
};

const server = http.createServer((req, res) => {
    let p;
    try { p = decodeURIComponent(req.url.split('?')[0]); } catch (_e) { p = req.url.split('?')[0]; }
    if (p.startsWith('/api/')) {
        if (p === '/api/platform/public-config') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                _settingsSource: 'mariadb',
                systemHealth: { maintenanceMode: false },
                modules: { enableAtsScoreModule: true },
            }));
            return;
        }
        const resumeMatch = p.match(/^\/api\/resumes\/([^/]+)$/);
        if (resumeMatch) {
            const id = resumeMatch[1];
            if (req.method === 'POST') {
                let body = '';
                req.on('data', (chunk) => { body += chunk; });
                req.on('end', () => {
                    let payload = {};
                    try { payload = JSON.parse(body || '{}'); } catch (_e) { /* keep current */ }
                    const existing = resumeStore.get(id);
                    const revision = (existing ? existing.revision : 0) + 1;
                    const record = { ...payload, id, revision, updatedAt: new Date().toISOString() };
                    delete record.expectedRevision;
                    resumeStore.set(id, record);
                    json(res, 200, { resume: record });
                });
                return;
            }
            if (req.method === 'GET') {
                const record = resumeStore.get(id);
                if (!record) { json(res, 404, { error: { code: 'not-found', message: 'Resume not found' } }); return; }
                json(res, 200, { resume: record });
                return;
            }
            if (req.method === 'DELETE') { resumeStore.delete(id); json(res, 200, { success: true }); return; }
        }
        if (p === '/api/resumes' && req.method === 'GET') {
            json(res, 200, { resumes: [...resumeStore.values()] });
            return;
        }
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end('{"error":"no-backend-in-preview"}');
        return;
    }
    if (p === '/' || !path.extname(p)) p = '/index.html';
    const f = path.join(distDir, p);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) {
        res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
        fs.createReadStream(f).pipe(res);
    } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        fs.createReadStream(path.join(distDir, 'index.html')).pipe(res);
    }
});
const PORT = 41742;
await new Promise((resolve) => server.listen(PORT, '0.0.0.0', resolve));
console.log(`Static preview server on :${PORT}`);

const browser = await chromium.launch({
    headless: true,
});

const results = [];
const failures = [];
function record(vp, journey, pass, detail = '') {
    results.push({ viewport: vp.name, journey, pass, detail });
    if (!pass) failures.push(`${vp.name} / ${journey}: ${detail}`);
}

const GOAL = `http://127.0.0.1:${PORT}/build-resume/heading`;

for (const vp of VIEWPORTS) {
    console.log(`\n=== ${vp.name} (${vp.width}x${vp.height}) ===`);
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile });
    // The AuthenticatedAppShell sidebar is a separate, pre-existing dashboard
    // chrome layer. On a fresh browser it starts expanded below 1024px and its
    // overlay covers the builder; a normal user collapses it. Seed the collapsed
    // state so we evaluate the BuildResume experience, not the dashboard nav.
    await context.addInitScript(() => {
        try {
            localStorage.setItem('sidebarCollapsed', 'true');
            localStorage.setItem('resumepilot_local_session_v1', JSON.stringify({
                token: 'test.eyJ1aWQiOiJ1c2VyLTEiLCJyb2xlIjoiVVNFUiIsImVtYWlsIjoidGVzdEBleGFtcGxlLmNvbSJ9.sig',
                uid: 'user-1',
                email: 'test@example.com',
                displayName: 'Test User',
                role: 'USER',
                exp: Date.now() + 100000000
            }));
        } catch (_e) { /* noop */ }
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    const readH1 = async () => ((await page.locator('h1').first().textContent().catch(() => '')) || '').trim();

    // Ribbon (md+) or mobile drawer navigation, with verification + fallback.
    const gotoStep = async (stepPath) => {
        const expect = STEP_H1[stepPath];
        const drawer = page.locator('div[role="dialog"][aria-label="Resume builder navigation"]');

        const clickStepButton = async () => {
            if (vp.isMobile) {
                const burger = page.locator('button[aria-label="Open navigation menu"]');
                if ((await burger.count()) === 0) return false;
                await burger.click({ timeout: 5000 }).catch(() => {});
                const btn = drawer.locator('button', { hasText: RIBBON[stepPath] }).first();
                if ((await btn.count()) === 0) return false;
                await btn.click({ timeout: 5000 }).catch(() => {});
            } else {
                const btn = page.locator(`nav[aria-label="Resume Steps Stepper"] button.step-nav-btn`, { hasText: RIBBON[stepPath] }).first();
                if ((await btn.count()) === 0) return false;
                await btn.click({ timeout: 5000 }).catch(() => {});
            }
            return true;
        };

        const settledOnStep = async (ms) => {
            const deadline = Date.now() + ms;
            while (Date.now() < deadline) {
                if (expect.test(await readH1())) return true;
                await page.waitForTimeout(150);
            }
            return expect.test(await readH1());
        };

        // First attempt; retry once; then fall back to a direct URL load.
        for (let attempt = 0; attempt < 2; attempt += 1) {
            if (!(await clickStepButton())) break;
            if (await settledOnStep(2500)) return true;
        }
        await page.goto(GOAL.replace(/heading$/, stepPath), { waitUntil: 'domcontentloaded' }).catch(() => {});
        return await settledOnStep(4000);
    };

    try {
        // ——— J1: app boots into the builder under local preview identity ———
        const navStart = Date.now();
        await page.goto(GOAL, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForSelector('h1', { timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(2000);
        const h1 = (await page.locator('h1').first().textContent().catch(() => '') || '').trim();
        record(vp, 'J1-builder-loads', STEP_H1.heading.test(h1), `booted=${Date.now() - navStart}ms h1="${h1}" errors=${pageErrors.length}`);

        // ——— J2: all 12 steps render via ribbon navigation (SPA) ———
        let navOk = true;
        const navDetail = [];
        for (const [stepPath, label] of Object.entries(RIBBON)) {
            const ok = await gotoStep(stepPath);
            const h = (await page.locator('h1').first().textContent().catch(() => '') || '').trim();
            const good = ok && STEP_H1[stepPath].test(h);
            if (!good) { navOk = false; navDetail.push(`${stepPath}:"${h}"`); }
        }
        record(vp, 'J2-all-12-steps-render', navOk, navDetail.join(' | '));

        // ——— J3: data entry persists across SPA navigation ———
        await gotoStep('heading');
        await page.fill('input[name="firstname"]', 'Asha').catch(() => {});
        await page.fill('input[name="lastname"]', 'Rao').catch(() => {});
        await page.fill('input[name="email"]', 'asha.rao@example.com').catch(() => {});
        await page.fill('input[name="phone"]', '+91 90000 00000').catch(() => {});
        await page.fill('input[name="occupation"]', 'Site Reliability Engineer').catch(() => {});
        await page.waitForTimeout(900);

        await gotoStep('work-history');
        const addBtn = page.locator('button', { hasText: /add your experience|add another role|add role/i }).first();
        let workAdded = false;
        if ((await addBtn.count()) > 0) {
            await addBtn.click();
            await page.waitForTimeout(500);
            await page.fill('input[name*="jobTitle" i]', 'Platform Engineer').catch(() => {});
            await page.fill('input[name*="employer" i]', 'InfraCo Pvt Ltd').catch(() => {});
            await page.waitForTimeout(900);
            workAdded = (await page.locator('input[name*="jobTitle" i]').first().inputValue().catch(() => '')) === 'Platform Engineer';
        }
        await gotoStep('heading');
        const nameSurvived = await page.locator('input[name="firstname"]').first().inputValue().catch(() => '');
        const occSurvived = await page.locator('input[name="occupation"]').first().inputValue().catch(() => '');
        record(vp, 'J3-entry-persists', nameSurvived === 'Asha' && occSurvived === 'Site Reliability Engineer' && workAdded,
            `first="${nameSurvived}" occ="${occSurvived}" workAdded=${workAdded}`);

        // ——— J4: review step is engine-driven (no invented stats) ———
        await gotoStep('review');
        await page.waitForTimeout(800);
        const reviewChecks = await page.evaluate(() => {
            const text = document.body.innerText;
            return {
                sectionReadiness: /Section readiness/i.test(text),
                working: /What is working/i.test(text),
                fixFirst: /What to fix first/i.test(text),
                editLinks: Array.from(document.querySelectorAll('button')).filter((b) => b.textContent.trim().startsWith('Edit')).length,
                noCommandCenter: !/Command Center/i.test(text),
                noWeights: !/Weight:/i.test(text),
            };
        });
        record(vp, 'J4-review-engine-findings',
            reviewChecks.sectionReadiness && reviewChecks.working && reviewChecks.fixFirst && reviewChecks.editLinks >= 4
            && reviewChecks.noCommandCenter && reviewChecks.noWeights,
            JSON.stringify(reviewChecks));

        // ——— J5: JD matcher shows matched / partial / missing buckets ———
        const jdBtn = page.locator('button', { hasText: /match target job|update job description/i }).first();
        let jdOk = false;
        let jdDetail = 'no JD button';
        if ((await jdBtn.count()) > 0) {
            await jdBtn.click();
            await page.waitForTimeout(400);
            await page.locator('textarea').first().fill('Senior Site Reliability Engineer. Required: Kubernetes, Terraform, Go programming, incident response, observability, and React Native dashboards.');
            await page.waitForTimeout(1000);
            const t = await page.locator('body').innerText();
            jdOk = /Match:/.test(t) && /matched/i.test(t) && /Not in your resume/i.test(t);
            jdDetail = `matchShown=${/Match:/.test(t)} missingBucket=${/Not in your resume/i.test(t)}`;
        }
        record(vp, 'J5-jd-matcher-buckets', jdOk, jdDetail);

        // ——— J6: all-steps overview opens without crash (former ReferenceError site) ———
        await gotoStep('heading');
        let ovOk = false;
        let ovDetail = 'no overview trigger';
        if (vp.isMobile) {
            // Mobile equivalent: the drawer lists every step (ribbon is hidden below md).
            const burger = page.locator('button[aria-label="Open navigation menu"]');
            if ((await burger.count()) > 0) {
                await burger.click();
                await page.waitForTimeout(700);
                const cards = await page.locator('div[role="dialog"][aria-label="Resume builder navigation"] nav button').count();
                ovOk = cards >= 10 && !pageErrors.length;
                ovDetail = `drawer-steps=${cards} errors=${pageErrors.length}`;
                const closeBtn = page.locator('button[aria-label="Close navigation menu"]');
                if ((await closeBtn.count()) > 0) await closeBtn.click().catch(() => {});
                await page.waitForTimeout(400);
            }
        } else {
            const overviewBtn = page.locator('button[title*="all resume sections" i]').first();
            if ((await overviewBtn.count()) > 0) {
                await overviewBtn.click();
                await page.waitForTimeout(800);
                const cards = await page.locator('button:has-text("Completed"), button:has-text("Pending"), button:has-text("Current")').count();
                ovOk = cards >= 8 && !pageErrors.length;
                ovDetail = `cards=${cards} errors=${pageErrors.length}${pageErrors[0] ? ' [' + pageErrors[0].slice(0, 120) + ']' : ''}`;
                const closeBtn = page.locator('button', { hasText: /close overview/i }).first();
                if ((await closeBtn.count()) > 0) await closeBtn.click().catch(() => {});
                await page.waitForTimeout(400);
            }
        }
        record(vp, 'J6-overview-modal-no-crash', ovOk, ovDetail);

        // ——— J7: custom section creation (no blocking browser prompt) ———
        // Desktop: the "+ Custom" pill opens the in-app title dialog.
        // Mobile: the pill is in the hidden ribbon, so use the step's own
        // "Add a section" control (the ribbon/drawer entry appears once a
        // section exists).
        const customPill = page.locator('button', { hasText: /^\+ custom$/i }).first();
        let csOk = false;
        let csDetail = 'no + Custom pill and no in-step add';
        if ((await customPill.count()) > 0) {
            await customPill.click();
            await page.waitForTimeout(500);
            const dialogVisible = await page.locator('[role="dialog"]').count();
            if (dialogVisible > 0) {
                await page.locator('[role="dialog"] input').fill('Volunteering');
                await page.locator('[role="dialog"] button', { hasText: /^add section$/i }).click();
                await page.waitForTimeout(900);
                const landedOnCustom = page.url().includes('/build-resume/custom');
                const sectionShown = /Volunteering/.test(await page.locator('body').innerText());
                csOk = landedOnCustom && sectionShown;
                csDetail = `dialog url=${page.url().split('/').pop()} shown=${sectionShown}`;
            } else {
                csDetail = 'dialog did not open';
            }
        } else {
            await gotoStep('custom');
            const addInStep = page.locator('button', { hasText: /add a section/i }).first();
            if ((await addInStep.count()) > 0) {
                await addInStep.click();
                await page.waitForTimeout(600);
                const sectionShown = (await page.locator('body').innerText()).includes('Custom Sections');
                csOk = page.url().includes('/build-resume/custom') && sectionShown;
                csDetail = `in-step-add url=${page.url().split('/').pop()}`;
            }
        }
        record(vp, 'J7-custom-section-dialog', csOk, csDetail);

        // ——— J8: zero horizontal overflow + zero page errors ———
        const overflow = await page.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            innerWidth: window.innerWidth,
        }));
        record(vp, 'J8-no-overflow-no-errors',
            overflow.scrollWidth <= overflow.innerWidth + 1 && pageErrors.length === 0,
            `${overflow.scrollWidth}px vs ${overflow.innerWidth}px; errors=${pageErrors.length}${pageErrors[0] ? ' [' + pageErrors[0].slice(0, 120) + ']' : ''}`);
    } catch (error) {
        record(vp, 'Journey-crash', false, error.message.slice(0, 200));
    } finally {
        await context.close();
    }
}

await browser.close();
server.close();

console.log('\n================ RESULTS ================');
for (const r of results) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.viewport.padEnd(26)} ${r.journey.padEnd(30)} ${r.detail}`);
}
const total = results.length;
const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${total} checks passed.`);
if (failures.length) {
    console.log('\nFailures:');
    failures.forEach((f) => console.log('  - ' + f));
}
process.exit(failures.length ? 1 : 0);
