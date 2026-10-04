// DIR-010 EVIDENCE FORENSICS PROBE (read-only; touches no product source).
//
// PURPOSE: DIR-010 was submitted EVIDENCE_SUBMITTED claiming 8/8 PASS. This probe
// independently re-derives the three claims the submitted evidence does NOT
// actually support, so the gatekeeper gets facts instead of a green summary.
//
//   F1  STAGE 1 "exactly one Cuba chrome / sidebar" is VACUOUS.
//       The spec counts sidebars with `.cubaSidebar, .cuba-sidebar`, but the real
//       chrome (CubaAppShell.jsx:242) exposes `data-testid="cuba-sidebar"` and NO
//       such class. The census returns 0 on every route and the assertion
//       `toBeLessThanOrEqual(1)` is satisfied by 0 -> it can never fail.
//
//   F2  STAGE 3 "ATS stage pills use cuba-pill-* tokens" is VACUOUS.
//       EmployerApplicantPipeline.jsx maps every stage through `stageClass()` onto
//       real `.cuba-pill-*` tokens, but the census selector only accepts an element
//       whose ENTIRE text is exactly one bare stage word. The live DOM renders
//       `<span class="capitalize cuba-pill-*">rejected</span>` inside a table cell,
//       and the stage summary renders "rejected: 1" -> census = 0 -> 0 pills
//       inspected, yet the stage reports PASS.
//
//   F3  STAGE 4 "in-modal candidate resume review renders unclipped" measures the
//       WRONG MODAL. It opens JobApplicationsModal (from /employer/jobs), whose
//       expanded body renders only a cover letter + Experience/Applied/Resume
//       metadata. The real in-modal RESUME review -- the one that renders the CV
//       through TemplateRenderer -- is EmployerApplicantPipeline's "View Resume"
//       dialog on /employer/applicants, which DIR-010 never measured.
//
// Drives the LIVE app with a REAL identity and REAL MariaDB data.
import path from 'node:path';
import process from 'node:process';
import fs from 'node:fs';
import dotenv from 'dotenv';
import { chromium } from '@playwright/test';
import { mintFirebaseSession } from '../../tests/e2e/dir006-session.mjs';

dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });
dotenv.config({ path: path.join(process.cwd(), 'backend', '.env'), quiet: true });

const WEB_ORIGIN = process.env.DIR010_WEB_ORIGIN || 'http://localhost:3000';
const OUT = path.join(process.cwd(), '.bridge', 'evidence', 'dir010-forensics.json');

const email = process.env.DIR010_RECRUITER_EMAIL
    || process.env.DIR007_EMPLOYER_EMAIL
    || process.env.DIR006_EMAIL
    || process.env.ADMIN_EMAIL;
const session = await mintFirebaseSession({ email });
if (!session) throw new Error(`no live identity for ${email}`);
console.log('identity =', session.email, session.uid);

const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 720 } });

await page.addInitScript(({ uid, email, token, refreshToken, apiKey }) => {
    const authUser = {
        uid, email, emailVerified: true, displayName: email.split('@')[0], isAnonymous: false,
        stsTokenManager: { apiKey, refreshToken, accessToken: token, expirationTime: Date.now() + 3600_000 },
        createdAt: String(Date.now()), lastLoginAt: String(Date.now()),
        apiKey, appName: '[DEFAULT]',
    };
    localStorage.setItem(`firebase:authUser:${apiKey}:[DEFAULT]`, JSON.stringify(authUser));
    localStorage.setItem('user', uid);
    localStorage.setItem('preferredLanguage', 'en');
    localStorage.setItem('ime365_cuba_shell_v2', 'cuba');
    localStorage.setItem('resumepilot_privacy_consent_v1', 'denied');
    localStorage.setItem('ime365_privacy_consent_v1', 'denied');
}, {
    uid: session.uid, email: session.email,
    token: session.idToken, refreshToken: session.refreshToken, apiKey: session.apiKey,
});

const findings = {};
const NAV = page.getByRole('navigation', { name: 'Employer navigation' });


// ---------------------------------------------------------------- F1 + F2
await page.goto(`${WEB_ORIGIN}/employer/applicants`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
await NAV.waitFor({ state: 'visible', timeout: 60_000 });
// Let the pipeline's loading -> ready transition settle, which is MORE generous to
// the submitted suite than the unsettled DOM it actually sampled.
await page.waitForTimeout(4000);

findings.F1_chrome = await page.evaluate(() => ({
    submittedSelectorCount: document.querySelectorAll('.cubaSidebar, .cuba-sidebar').length,
    testIdSidebarCount: document.querySelectorAll('[data-testid="cuba-sidebar"]').length,
    asideCount: document.querySelectorAll('aside').length,
    shellVariant: document.querySelector('[data-testid="employer-portal-shell"]')?.getAttribute('data-shell-variant') ?? null,
}));

findings.F2_pills = await page.evaluate(() => {
    const tone = (el) => [...el.classList].find((c) => c.startsWith('cuba-pill-')) || null;
    const STAGE = /^(pending|shortlisted|interview|offer|accepted|hired|rejected|withdrawn)$/i;

    // (a) EXACTLY what the submitted stage 3 census looked for.
    const submitted = [...document.querySelectorAll('span, li')]
        .filter((el) => {
            const r = el.getBoundingClientRect();
            if (!(r.width > 0 && r.height > 0)) return false;
            return STAGE.test((el.textContent || '').trim());
        })
        .map((el) => ({ text: (el.textContent || '').trim(), tone: tone(el) }));

    // (b) The census that WOULD find them: any visible element carrying cuba-pill-*.
    const real = [...document.querySelectorAll('*')]
        .filter((el) => tone(el))
        .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
        .map((el) => ({
            tag: el.tagName.toLowerCase(),
            tone: tone(el),
            text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60),
        }));

    return { submittedCensusCount: submitted.length, submitted, realPillCount: real.length, real };
});
// ---------------------------------------------------------------- F3
// (a) The modal stage 4 actually measured.
await page.goto(`${WEB_ORIGIN}/employer/jobs`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
await NAV.waitFor({ state: 'visible', timeout: 60_000 });
await page.waitForTimeout(3000);

const jobCardCta = page.locator('[data-job-id]').getByRole('button', { name: /applications?|candidatures?/i }).first();
findings.F3_stage4Modal = { ctaCount: await jobCardCta.count() };

if (await jobCardCta.count()) {
    await jobCardCta.click({ timeout: 20_000 });
    const dlg = page.getByRole('dialog');
    await dlg.waitFor({ state: 'visible', timeout: 30_000 });
    const exp = dlg.getByRole('button', { name: /^Expand application from /i });
    if (await exp.count()) {
        await exp.first().click();
        await page.waitForTimeout(1500);
    }
    findings.F3_stage4Modal = await page.evaluate(() => {
        const panel = document.querySelector('[role="dialog"]');
        const text = (panel?.textContent || '').replace(/\s+/g, ' ').trim();
        return {
            dialogPresent: Boolean(panel),
            textLength: text.length,
            textSample: text.slice(0, 260),
            hasTemplateCanvas: Boolean(document.querySelector('[data-testid="employer-resume-canvas"]')),
            hasResumePage: Boolean(document.querySelector('[data-testid="employer-resume-page"]')),
            mentionsCoverLetter: /cover letter/i.test(text),
        };
    });
    await page.keyboard.press('Escape').catch(() => {});
}

// (b) The REAL in-modal resume review that DIR-010 never measured.
await page.goto(`${WEB_ORIGIN}/employer/applicants`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
await NAV.waitFor({ state: 'visible', timeout: 60_000 });
await page.waitForTimeout(4000);

const viewResume = page.getByRole('button', { name: /view resume/i }).first();
findings.F3_realResumeDialog = { viewResumeButtons: await page.getByRole('button', { name: /view resume/i }).count() };

if (await viewResume.count()) {
    await viewResume.click({ timeout: 20_000 });
    await page.waitForTimeout(6000);
    findings.F3_realResumeDialog = await page.evaluate(() => {
        const panel = document.querySelector('[role="dialog"]');
        if (!panel) return { dialogPresent: false };
        const pr = panel.getBoundingClientRect();
        const scrollable = [...panel.querySelectorAll('*')].find((el) => {
            const s = getComputedStyle(el);
            return /(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1;
        }) || null;
        const canvas = document.querySelector('[data-testid="employer-resume-canvas"]');
        const pageEl = document.querySelector('[data-testid="employer-resume-page"]');
        const cr = canvas?.getBoundingClientRect();
        const pgr = pageEl?.getBoundingClientRect();
        const text = (panel.textContent || '').replace(/\s+/g, ' ').trim();
        return {
            dialogPresent: true,
            labelledBy: panel.getAttribute('aria-labelledby'),
            panelHeight: Math.round(pr.height),
            viewportHeight: window.innerHeight,
            panelCapped: pr.height <= window.innerHeight,
            hasTemplateCanvas: Boolean(canvas),
            hasResumePage: Boolean(pageEl),
            canvasHeight: cr ? Math.round(cr.height) : null,
            resumePageHeight: pgr ? Math.round(pgr.height) : null,
            resumePageWidth: pgr ? Math.round(pgr.width) : null,
            textLength: text.length,
            textSample: text.slice(0, 300),
            scrollsInside: Boolean(scrollable),
        };
    });
}

console.log(JSON.stringify(findings, null, 2));
fs.writeFileSync(OUT, `${JSON.stringify(findings, null, 2)}\n`);
console.log('wrote', OUT);

await browser.close();
