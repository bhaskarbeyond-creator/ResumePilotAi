// @ts-check
/**
 * DIR-009 step 1 — empirical candidate dashboard DOM census.
 *
 * WHY THIS EXISTS:
 *   The directive enumerates candidate "sub-tabs" by product label (Resumes,
 *   Saved Jobs, Applications, Interview Simulator, Analytics, Settings). Several
 *   of those labels do NOT correspond to a mounted route, so guessing would be
 *   fabrication. This script boots the live stack with a GENUINE Firebase
 *   candidate identity and dumps, per route, the facts the spec needs: hero
 *   surfaces, nav landmarks, duplicate chrome, and every CTA's computed
 *   background — so the spec asserts only what actually renders.
 *
 * It writes nothing to the database.
 */
import { chromium } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';
import { mintFirebaseSession } from '../../tests/e2e/dir006-session.mjs';

dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });
dotenv.config({ path: path.join(process.cwd(), 'backend', '.env'), quiet: true });

const WEB_ORIGIN = process.env.DIR009_WEB_ORIGIN || 'http://localhost:3000';
const OUT = path.join(process.cwd(), '.bridge', 'evidence', 'dir009-dom-crawl.json');

/** Real routes mounted under the Cuba candidate shell (DashboardMain.jsx). */
const ROUTES = [
    '/dashboard',
    '/dashboard/applied-jobs',
    '/dashboard/job-tracker',
    '/dashboard/interview',
    '/dashboard/favorites',
    '/dashboard/settings',
    '/dashboard/jobs',
    '/dashboard/cover-letters',
    '/dashboard/portfolios',
    '/dashboard/analytics',
];

const emails = [
    process.env.DIR009_CANDIDATE_EMAIL,
    process.env.ADMIN_EMAIL,
].filter(Boolean);

let session = null;
for (const email of emails) {
    session = await mintFirebaseSession({ email });
    if (session) break;
}
if (!session) {
    console.error('FAIL: no live candidate identity (set DIR009_CANDIDATE_EMAIL or ADMIN_EMAIL)');
    process.exit(1);
}

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await context.addInitScript(({ uid, email, token, refreshToken, apiKey }) => {
    const authUser = {
        uid,
        email,
        emailVerified: true,
        displayName: email.split('@')[0],
        isAnonymous: false,
        stsTokenManager: { apiKey, refreshToken, accessToken: token, expirationTime: Date.now() + 3600_000 },
        createdAt: String(Date.now()),
        lastLoginAt: String(Date.now()),
        apiKey,
        appName: '[DEFAULT]',
    };
    localStorage.setItem(`firebase:authUser:${apiKey}:[DEFAULT]`, JSON.stringify(authUser));
    localStorage.setItem('user', uid);
    localStorage.setItem('preferredLanguage', 'en');
    localStorage.setItem('ime365_cuba_shell_v2', 'cuba');
    localStorage.setItem('resumepilot_privacy_consent_v1', 'denied');
    localStorage.setItem('ime365_privacy_consent_v1', 'denied');
}, {
    uid: session.uid, email: session.email, token: session.idToken,
    refreshToken: session.refreshToken, apiKey: session.apiKey,
});

const page = await context.newPage();
const report = { identity: { uid: session.uid, email: session.email }, routes: {} };
/**
 * Runs INSIDE the page. Collects the facts the DIR-009 spec must assert:
 * hero surfaces, nav landmarks, and every CTA's computed background so the
 * suite can prove the Cuba token gradient rather than trusting class names.
 * Declared at module scope (not nested in a branch) because it is handed to
 * page.evaluate() below.
 */
const census = () => {
    const visible = (el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
    };
    const ctas = [...document.querySelectorAll('a[href], button')]
        .filter((el) => visible(el))
        .map((el) => {
            const cs = getComputedStyle(el);
            return {
                tag: el.tagName.toLowerCase(),
                testid: el.getAttribute('data-testid') || '',
                cls: (el.className || '').toString().slice(0, 160),
                text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 44),
                href: el.getAttribute('href') || '',
                bgImage: cs.backgroundImage,
                bgColor: cs.backgroundColor,
                color: cs.color,
                hasCubaPrimary: el.classList.contains('cuba-btn-primary'),
                hasCubaFillPill: el.classList.contains('cuba-fill-pill'),
            };
        })
        .filter((c) => c.bgImage.includes('gradient') || c.hasCubaPrimary || c.hasCubaFillPill);

    return {
        url: location.pathname,
        heroTestIds: [...document.querySelectorAll('[data-testid="cuba-candidate-hero"]')].length,
        h1s: [...document.querySelectorAll('h1')].map((h) => (h.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 70)).filter(Boolean),
        navLandmarks: [...document.querySelectorAll('nav')].map((n) => n.getAttribute('aria-label') || '(unlabelled)'),
        asideCount: document.querySelectorAll('aside[data-testid="cuba-sidebar"]').length,
        ctas: ctas.slice(0, 40),
        distinctCtaGradients: [...new Set(ctas.map((c) => c.bgImage))],
    };
};

for (const route of ROUTES) {
    const consoleErrors = [];
    const pageErrors = [];
    const failedApi = [];
    const onConsole = (m) => { if (m.type() === 'error' && !/favicon|CSP/i.test(m.text())) consoleErrors.push(m.text()); };
    const onPageError = (e) => pageErrors.push(String(e));
    const onResponse = (r) => {
        const { pathname } = new URL(r.url());
        if (pathname.startsWith('/api/') && r.status() >= 400) failedApi.push(`${r.status()} ${pathname}`);
    };
    page.on('console', onConsole);
    page.on('pageerror', onPageError);
    page.on('response', onResponse);

    try {
        await page.goto(`${WEB_ORIGIN}${route}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await page.waitForTimeout(6000);
        const facts = await page.evaluate(census);
        report.routes[route] = { ...facts, consoleErrors, pageErrors, failedApi };
        console.log(`\n=== ${route} -> ${facts.url}`);
        console.log(`   heroTestIds=${facts.heroTestIds} h1=${JSON.stringify(facts.h1s)}`);
        console.log(`   nav=${JSON.stringify(facts.navLandmarks)} sidebar=${facts.asideCount}`);
        console.log(`   ctaGradients=${JSON.stringify(facts.distinctCtaGradients)}`);
        console.log(`   defects: console=${consoleErrors.length} pageErrors=${pageErrors.length} api=${failedApi.length}`);
        if (failedApi.length) console.log(`   failedApi=${JSON.stringify(failedApi.slice(0, 8))}`);
        if (consoleErrors.length) console.log(`   consoleErrors=${JSON.stringify(consoleErrors.slice(0, 5))}`);
    } catch (error) {
        report.routes[route] = { error: String(error) };
        console.log(`\n=== ${route} NAVIGATION ERROR: ${error}`);
    } finally {
        page.off('console', onConsole);
        page.off('pageerror', onPageError);
        page.off('response', onResponse);
    }
}

fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(`\ncensus written to ${OUT}`);
await browser.close();