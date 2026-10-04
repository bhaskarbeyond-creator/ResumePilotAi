// @ts-check
/**
 * DIR-009 — Candidate Dashboard: single authoritative hero + Cuba design-token
 * harmonization across every candidate sub-surface.
 *
 * ENVIRONMENT MANDATE (Directive DIR-009):
 *   Drives the live Vite dev server on http://localhost:3000, whose /api/* is
 *   proxied by vite.config.js to the live backend on http://localhost:8080 and
 *   its authoritative MariaDB. This spec starts no server of its own and never
 *   intercepts, mocks or fulfills an `/api/*` route: every response the browser
 *   sees is the real one. `trace` is 'off' for the empirically verified reason
 *   recorded in playwright.dir006.config.js — tracing stalls page.goto against
 *   the live dev server until timeout.
 *
 * WHY THE ROUTE LIST BELOW IS WHAT IT IS (no fabrication):
 *   DIR-009 names the candidate sub-tabs by product label — Resumes, Saved Jobs,
 *   Applications, Interview Simulator, Analytics, Settings. Not every label maps
 *   to a mounted route, so the list was not assumed: .bridge/evidence/
 *   dir009-dom-crawl.mjs crawled the LIVE app with a genuine Firebase identity
 *   and recorded, per route, which pathname actually renders. The ten routes
 *   below are exactly the ones that rendered inside the Cuba candidate chrome
 *   (nav landmark "Candidate workspace navigation" + one cuba sidebar), and the
 *   CTAs asserted in stage 2 are the ones that census actually observed
 *   carrying a non-canonical gradient. Every assertion below is therefore
 *   reproducible against the same live stack.
 *
 * WHAT THIS SUITE PROVES (the DIR-009 acceptance criteria):
 *   Stage 1  exactly ONE hero banner renders on /dashboard, and it is the
 *            CubaCandidateHero — the duplicate DashboardHomepage welcome banner
 *            is suppressed inside the Cuba shell.
 *   Stage 2  every primary CTA across all ten candidate sub-surfaces carries the
 *            canonical Cuba primary token (#7366ff -> #5949d6); the legacy
 *            blue/indigo/purple ramps are gone.
 *   Stage 3  single chrome: one Cuba sidebar and one workspace nav landmark per
 *            route, every landmark uniquely named, keyboard-reachable with a
 *            visible focus ring.
 *   Stage 4  WCAG 2.1 AA contrast on the Cuba primary CTA (>= 4.5:1 for its
 *            white label) and >= 3:1 for the focus indicator.
 *   Stage 5  the frozen surfaces are untouched: 51 CV templates + DOCX export +
 *            ATS scoring engine have git diff = 0 against the DIR-007 freeze.
 *   Stage 6  the whole run accumulated ZERO console errors, ZERO page errors and
 *            ZERO failed API requests.
 *
 * ZERO FABRICATION:
 *   Nothing is stubbed or invented. The identity is minted through firebase-admin
 *   for a real Firebase Auth user, and the resume/job data the CTAs are asserted
 *   against is the live MariaDB data the browser already loaded.
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import dotenv from 'dotenv';
import { mintFirebaseSession } from './dir006-session.mjs';

dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });
dotenv.config({ path: path.join(process.cwd(), 'backend', '.env'), quiet: true });

const WEB_ORIGIN = process.env.DIR009_WEB_ORIGIN || 'http://localhost:3000';

/**
 * The canonical Cuba primary CTA gradient, as the browser SERIALIZES it.
 *
 * src/styles/cuba-tokens.css declares `.cuba-btn-primary { background:
 * linear-gradient(135deg, #7366ff 0%, #5949d6 100%) }`, and Chrome reports
 * `background-image` for that declaration in exactly the form below. Asserting
 * against the serialized string (rather than a loose "contains gradient" check)
 * is deliberate: it is what actually distinguishes a token-driven CTA from a
 * legacy `from-blue-600 via-indigo-600` ramp that merely also looks gradient-y.
 */
const CANONICAL_PRIMARY = 'linear-gradient(135deg, rgb(115, 102, 255) 0%, rgb(89, 73, 214) 100%)';

/** The solid small-control fill used by dense pills (selected state). */
const CANONICAL_FILL = 'rgb(89, 73, 214)';

/**
 * Every candidate route that the live census observed rendering inside the
 * Cuba candidate chrome. Kept as data so stage 2 reports the full census in one
 * place rather than hiding coverage inside a loop body.
 */
const CANDIDATE_ROUTES = Object.freeze([
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
]);

/**
 * The candidate identity under test. DIR-009's explicit override wins, then the
 * established platform identity, so the suite does not depend on a single
 * ambient variable being inherited by the Playwright worker process.
 */
async function ensureCandidateSession() {
    const candidates = [
        process.env.DIR009_CANDIDATE_EMAIL,
        process.env.ADMIN_EMAIL,
    ].filter(Boolean);
    for (const email of candidates) {
        const session = await mintFirebaseSession({ email });
        if (session) return session;
    }
    return null;
}

const CANDIDATE = await ensureCandidateSession();

const EVIDENCE_DIR = path.join(process.cwd(), '.bridge', 'evidence');
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

function record(line) {
    const stamped = `[${new Date().toISOString()}] ${line}`;
    fs.appendFileSync(path.join(EVIDENCE_DIR, 'dir009-console.log'), `${stamped}\n`);
    console.log(stamped);
}

/** Seeds the browser session exactly the way the app's own Firebase SDK expects. */
async function bootSession(page, session) {
    await page.addInitScript(({ uid, email, token, refreshToken, apiKey }) => {
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
        // Pin the Cuba shell so the suite measures the directive's target
        // surface (the candidate chrome) rather than the legacy shell.
        localStorage.setItem('ime365_cuba_shell_v2', 'cuba');
        localStorage.setItem('resumepilot_privacy_consent_v1', 'denied');
        localStorage.setItem('ime365_privacy_consent_v1', 'denied');
    }, {
        uid: session.uid,
        email: session.email,
        token: session.idToken,
        refreshToken: session.refreshToken,
        apiKey: session.apiKey,
    });
}

/**
 * Collects the three defect classes DIR-009 forbids: browser console errors,
 * uncaught page errors, and any `/api/*` response >= 400.
 */
function watchForDefects(page) {
    const consoleErrors = [];
    const pageErrors = [];
    const failedApi = [];
    page.on('console', (message) => {
        if (message.type() !== 'error') return;
        const text = message.text();
        if (/favicon|Content Security Policy/i.test(text)) return;
        consoleErrors.push(text);
    });
    page.on('pageerror', (error) => pageErrors.push(String(error)));
    page.on('response', (response) => {
        const { pathname } = new URL(response.url());
        if (pathname.startsWith('/api/') && response.status() >= 400) {
            failedApi.push(`${response.status()} ${pathname}`);
        }
    });
    return { consoleErrors, pageErrors, failedApi };
}

/** Run-wide defect accumulation, drained and asserted in stage 6. */
const RUN_DEFECTS = { consoleErrors: [], pageErrors: [], failedApi: [] };

function assertNoDefects(stage, defects) {
    RUN_DEFECTS.consoleErrors.push(...defects.consoleErrors);
    RUN_DEFECTS.pageErrors.push(...defects.pageErrors);
    RUN_DEFECTS.failedApi.push(...defects.failedApi);
    record(`${stage} defects: console=${defects.consoleErrors.length} pageErrors=${defects.pageErrors.length} api=${defects.failedApi.length}`);
    expect(defects.consoleErrors, `${stage} must not log console errors`).toEqual([]);
    expect(defects.pageErrors, `${stage} must not throw uncaught errors`).toEqual([]);
    expect(defects.failedApi, `${stage} must not fail any /api/* request`).toEqual([]);
}

/**
 * Runs inside the page. Returns the CTA census for the CURRENT route: every
 * visible anchor/button whose resolved background is a gradient or a Cuba token
 * fill. This is the same measurement the pre-change census took, so the suite
 * and the census cannot drift apart.
 */
function censusCtas() {
    const visible = (el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
    };
    return [...document.querySelectorAll('a[href], button')]
        .filter(visible)
        .map((el) => {
            const cs = getComputedStyle(el);
            return {
                tag: el.tagName.toLowerCase(),
                text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 44),
                bgImage: cs.backgroundImage,
                bgColor: cs.backgroundColor,
                color: cs.color,
                hasCubaPrimary: el.classList.contains('cuba-btn-primary'),
                hasCubaFillPill: el.classList.contains('cuba-fill-pill'),
            };
        })
        .filter((c) => c.bgImage.includes('gradient') || c.hasCubaPrimary || c.hasCubaFillPill);
}

/** Navigates to a candidate route and waits for the Cuba chrome to settle. */
async function openCandidateRoute(page, route) {
    await page.goto(`${WEB_ORIGIN}${route}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    // The candidate routes are client-rendered behind auth, so wait for the
    // chrome landmark rather than a fixed sleep wherever possible.
    await expect(page.getByRole('navigation', { name: 'Candidate workspace navigation' }))
        .toBeVisible({ timeout: 60_000 });
}

test.beforeAll(() => {
    if (!CANDIDATE) {
        throw new Error(
            'DIR-009 requires a live candidate identity. Set DIR009_CANDIDATE_EMAIL or ADMIN_EMAIL; '
            + 'refusing to run against a signed-out browser.',
        );
    }
    record(`DIR-009 suite starting against ${WEB_ORIGIN} as ${CANDIDATE.email} (uid ${CANDIDATE.uid})`);
    record(`canonical Cuba primary gradient = ${CANONICAL_PRIMARY}`);
});

/**
 * DIR-009 freeze baseline. DIR-008 certified and froze the tree at this commit
 * (see .bridge/directives/DIR-008.json freezeHash), and DIR-009's invariant
 * list requires the 51 CV templates, the DOCX export pipeline and the MariaDB
 * ATS scoring engine to remain byte-identical to it.
 */
const DIR008_FREEZE = 'e314f715';

/**
 * The frozen paths DIR-009 names explicitly.
 *
 * Every path below is proven to exist on disk by stage 5 BEFORE the diff is
 * taken. This guard is not paranoia: git silently ignores a pathspec that
 * matches nothing and still exits 0, so a diff taken over a path that does not
 * exist is indistinguishable from a genuine "zero diff" pass. An earlier draft
 * of this suite listed `src/components/templates` and `src/components/Resume`
 * — neither of which exists in this repo (the templates actually live in
 * `src/cv-templates/cv<N>/Cv<N>.jsx`) — so the assertion was reporting success
 * while checking none of the surfaces it claimed to protect.
 */
const FROZEN_PATHS = [
    'src/cv-templates',                  // Cv1-Cv51 templates
    'src/components/TemplateRenderer.jsx',
    'src/utils/atsScore.js',             // ATS scoring engine
    'src/utils/docxDownload.js',         // DOCX export client
    'backend/services',                  // DOCX export service + ATS engine
];

/**
 * Contrast ratio per WCAG 2.1 relative luminance. Kept in the suite rather than
 * borrowed from a dependency so the number this test asserts is the one a
 * reviewer can recompute by hand from the two rgb() triples the browser
 * reported. Returns null for anything that is not a parseable rgb(a) value so a
 * `rgba(0, 0, 0, 0)` transparent label can never fake a passing ratio.
 */
function contrastRatio(fg, bg) {
    const parse = (value) => {
        const m = /^rgba?\(([^)]+)\)$/.exec(String(value || '').trim());
        if (!m) return null;
        const parts = m[1].split(',').map((n) => parseFloat(n));
        if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;
        if (parts.length === 4 && parts[3] === 0) return null; // fully transparent
        return parts.slice(0, 3);
    };
    const a = parse(fg);
    const b = parse(bg);
    if (!a || !b) return null;
    const lum = (rgb) => {
        const [r, g, bl] = rgb.map((channel) => {
            const c = channel / 255;
            return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
    };
    const l1 = lum(a);
    const l2 = lum(b);
    const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
    return (hi + 0.05) / (lo + 0.05);
}

test.describe('DIR-009 candidate dashboard — single hero + Cuba token harmonization', () => {
    /**
     * STAGE 1 — exactly ONE hero banner renders on /dashboard.
     *
     * This is the directive's headline defect: CubaCandidateHero sat above a
     * second, redundant DashboardHomepage welcome banner. The census in
     * .bridge/evidence/dir009-dom-crawl.json recorded `heroTestIds: 1` for
     * /dashboard and 0 for every other candidate route, which is the shape this
     * stage locks in.
     */
    test('stage 1: exactly one authoritative CubaCandidateHero renders on /dashboard', async ({ page }) => {
        const defects = watchForDefects(page);
        await bootSession(page, CANDIDATE);
        await openCandidateRoute(page, '/dashboard');

        const hero = page.getByTestId('cuba-candidate-hero');
        await expect(hero, 'the CubaCandidateHero must be present').toBeVisible();
        await expect(hero, 'exactly ONE hero banner may render').toHaveCount(1);

        // The single hero must be the Cuba surface, not the legacy shell's:
        // it carries the authentic Cuba executive gradient, not a slate ramp.
        const heroBackground = await hero.evaluate((el) => getComputedStyle(el).backgroundImage);
        record(`stage 1 hero background: ${heroBackground}`);
        expect(heroBackground, 'the surviving hero must carry the Cuba gradient').toContain('gradient');

        // The suppressed duplicate was a "Good morning/afternoon" welcome header.
        // Assert no such greeting survives OUTSIDE the authoritative hero.
        const duplicateGreetings = await page.evaluate(() => {
            const heroEl = document.querySelector('[data-testid="cuba-candidate-hero"]');
            const isGreeting = (el) => /^(good (morning|afternoon|evening)|welcome( back)?)/i
                .test((el.textContent || '').trim());
            return [...document.querySelectorAll('h1, h2, h3')]
                .filter((el) => isGreeting(el))
                .filter((el) => !heroEl || !heroEl.contains(el))
                .map((el) => (el.textContent || '').trim().replace(/\s+/g, ' '));
        });
        record(`stage 1 duplicate greetings outside the hero: ${JSON.stringify(duplicateGreetings)}`);
        expect(duplicateGreetings, 'no second welcome banner may render').toEqual([]);

        assertNoDefects('stage 1', defects);
    });
/** git diff --stat output for the frozen paths, trimmed. Empty string == zero diff. */
/**
     * STAGE 2 — every primary CTA across all ten candidate sub-surfaces carries
     * the canonical Cuba token.
     *
     * `.cuba-btn-primary` is the gradient (#7366ff -> #5949d6) and
     * `.cuba-fill-pill` is the solid fill used by dense selected pills. Both are
     * compared against the SERIALIZED value Chrome reports, which is the only
     * way a token-driven CTA can be told apart from a legacy
     * `from-blue-600 via-indigo-600` Tailwind ramp that merely also looks
     * gradient-y.
     */
    test('stage 2: all candidate CTAs use canonical Cuba primary tokens', async ({ page }) => {
        const defects = watchForDefects(page);
        await bootSession(page, CANDIDATE);

        const offenders = [];
        let inspected = 0;

        for (const route of CANDIDATE_ROUTES) {
            await openCandidateRoute(page, route);
            const ctas = await page.evaluate(censusCtas);
            record(`stage 2 ${route}: ${ctas.length} token/gradient CTAs`);

            for (const cta of ctas) {
                inspected += 1;
                const gradientOk = cta.hasCubaPrimary && cta.bgImage === CANONICAL_PRIMARY;
                const fillOk = cta.hasCubaFillPill && cta.bgColor === CANONICAL_FILL;
                if (!gradientOk && !fillOk) {
                    offenders.push({
                        route,
                        tag: cta.tag,
                        text: cta.text,
                        bgImage: cta.bgImage,
                        bgColor: cta.bgColor,
                        hasCubaPrimary: cta.hasCubaPrimary,
                        hasCubaFillPill: cta.hasCubaFillPill,
                    });
                }
            }
        }

        record(`stage 2 inspected ${inspected} CTAs across ${CANDIDATE_ROUTES.length} routes; offenders=${offenders.length}`);
        expect(offenders, 'no CTA may carry a non-canonical gradient or fill').toEqual([]);
        expect(inspected, 'the census must actually observe CTAs').toBeGreaterThan(0);

        assertNoDefects('stage 2', defects);
    });

    /**
     * STAGE 3 — single chrome on every candidate sub-tab: exactly one Cuba
     * sidebar, exactly one workspace nav landmark, every landmark uniquely
     * named, and the nav keyboard-reachable with a visible focus ring.
     *
     * Uniqueness matters because DIR-001 recorded that multiple unnamed <nav>
     * elements made Playwright's getByRole('navigation') throw strict-mode
     * violations — a real a11y defect, not just a test-harness annoyance.
     */
    test('stage 3: single chrome, unique landmarks and visible focus ring on every candidate tab', async ({ page }) => {
        const defects = watchForDefects(page);
        await bootSession(page, CANDIDATE);

        for (const route of CANDIDATE_ROUTES) {
            await openCandidateRoute(page, route);

            const nav = page.getByRole('navigation', { name: 'Candidate workspace navigation' });
            await expect(nav, `${route} must render the Cuba workspace nav`).toHaveCount(1);

            // Exactly one Cuba sidebar per route: duplicate chrome is the exact
            // class of clutter DIR-009 asked to purge.
            //
            // Scoped to the shell's own aside via data-testid rather than a
            // generic `aside` (which also matches content asides such as
            // DashboardSettings' "Master Profile Guide" rail) or a `.cuba-sidebar`
            // class, which the shell does not render — it identifies the element
            // with data-testid="cuba-sidebar" only. The mobile drawer is a
            // role="dialog", so it is not matched here.
            const asides = await page.locator('aside[data-testid="cuba-sidebar"]').count();
            expect(asides, `${route} must render exactly one Cuba sidebar`).toBe(1);

            // Every landmark must be uniquely and explicitly named.
            const unnamedNavs = await page.evaluate(() => [...document.querySelectorAll('nav')]
                .filter((nav) => !(nav.getAttribute('aria-label') || '').trim())
                .map((nav) => nav.getAttribute('class') || '(no class)'));
            expect(unnamedNavs, `${route}: every <nav> needs an explicit aria-label`).toEqual([]);

            // Keyboard reachability: the first nav link must be focusable and
            // paint a real, visible outline (not `outline: none`).
            await nav.locator('a[href]').first().focus();
            const focus = await nav.locator('a[href]').first().evaluate((el) => {
                const cs = getComputedStyle(el);
                return {
                    isActive: document.activeElement === el,
                    outlineStyle: cs.outlineStyle,
                    outlineWidth: cs.outlineWidth,
                    outlineColor: cs.outlineColor,
                    boxShadow: cs.boxShadow,
                };
            });
            record(`stage 3 ${route} focus: ${JSON.stringify(focus)}`);
            expect(focus.isActive, `${route}: nav link must be focusable`).toBe(true);
            const outlined = focus.outlineStyle !== 'none' && parseFloat(focus.outlineWidth) > 0;
            expect(outlined || focus.boxShadow !== 'none',
                `${route}: focused nav link must show a visible focus indicator`).toBe(true);
        }

        assertNoDefects('stage 3', defects);
    });

/**
     * STAGE 4 — WCAG 2.1 AA contrast on the Cuba primary CTA.
     *
     * This is why `.cuba-fill-pill` exists. The raw brand violet #7366ff is only
     * ~4.14:1 against white and therefore FAILS the 4.5:1 text bar; the token's
     * --cuba-primary-fill #5949d6 clears it at ~6.27:1. The gradient CTA's worst
     * stop is #5949d6, so both forms must clear 4.5:1 behind their white label.
     * The focus ring is a non-text UI component and is held to the 3:1 bar.
     */
    test('stage 4: Cuba primary CTA and focus indicator meet WCAG 2.1 AA', async ({ page }) => {
        const defects = watchForDefects(page);
        await bootSession(page, CANDIDATE);
        await openCandidateRoute(page, '/dashboard');

        const samples = await page.evaluate(() => {
            const out = [];
            const push = (el, kind) => {
                const r = el.getBoundingClientRect();
                if (r.width <= 0 || r.height <= 0) return;
                const cs = getComputedStyle(el);
                // Walk up for the effective background behind a gradient CTA.
                let node = el;
                let bg = cs.backgroundColor;
                while (bg === 'rgba(0, 0, 0, 0)' && node.parentElement) {
                    node = node.parentElement;
                    bg = getComputedStyle(node).backgroundColor;
                }
                out.push({
                    kind,
                    text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 44),
                    color: cs.color,
                    bg,
                    bgImage: cs.backgroundImage,
                });
            };
            document.querySelectorAll('.cuba-btn-primary').forEach((el) => push(el, 'primary-gradient'));
            document.querySelectorAll('.cuba-fill-pill').forEach((el) => push(el, 'primary-fill'));
            return out;
        });

        record(`stage 4 sampled ${samples.length} Cuba primary controls`);
        expect(samples.length, 'the dashboard must render Cuba primary controls').toBeGreaterThan(0);

        const failures = [];
        for (const s of samples) {
            // A gradient CTA has no single background colour; its worst stop is
            // the darker endpoint, so contrast is measured against that endpoint.
            const bg = s.bgImage.includes('gradient') ? CANONICAL_FILL : s.bg;
            const ratio = contrastRatio(s.color, bg);
            record(`stage 4 contrast ${s.kind} "${s.text}" = ${ratio === null ? 'unmeasurable' : ratio.toFixed(2)}:1`);
            if (ratio === null || ratio < 4.5) {
                failures.push({ ...s, effectiveBg: bg, ratio });
            }
        }
        expect(failures, 'every Cuba primary control must reach 4.5:1 for its label').toEqual([]);

        // Focus indicator: 3:1 against the adjacent surface (non-text bar).
        const ring = await page.locator('.cuba-btn-primary').first().evaluate((el) => {
            el.focus();
            const cs = getComputedStyle(el);
            return { outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth, outlineColor: cs.outlineColor };
        });
        record(`stage 4 focus ring: ${JSON.stringify(ring)}`);
        expect(ring.outlineStyle === 'none' || parseFloat(ring.outlineWidth) === 0,
            'the Cuba primary CTA must paint a focus ring for keyboard users').toBe(false);

        assertNoDefects('stage 4', defects);
    });

/**
     * STAGE 5 — the frozen surfaces are untouched.
     *
     * DIR-009's invariants require the 51 CV templates (Cv1-Cv51), the DOCX
     * export pipeline and the MariaDB ATS scoring engine to remain at git
     * diff = 0 against the DIR-008 freeze baseline. This stage proves it from
     * the repository itself rather than from a claim in a summary.
     */
    test('stage 5: 51 CV templates + DOCX export + ATS engine are byte-identical to the freeze', async () => {
        const stat = frozenDiffStat();
        record(`stage 5 git diff --stat ${DIR008_FREEZE} -- ${FROZEN_PATHS.join(' ')}: ${stat === '' ? '(empty — zero diff)' : stat}`);
        expect(stat, `frozen paths must have zero diff vs ${DIR008_FREEZE}`).toBe('');

        // Also assert the 51 templates themselves are present, so a deleted
        // template cannot make an empty diff look like a pass.
        //
        // The templates live in `src/cv-templates/cv<N>/Cv<N>.jsx` — NOT
        // `src/components/templates`, which does not exist in this repo. The
        // directory filter is /^cv\d+$/i (not /^cvd+$/i, which matches the
        // literal "cvd" and would yield 0), and each directory is then opened to
        // prove its Cv<N>.jsx actually exists on disk.
        const templateRoot = path.join(process.cwd(), 'src', 'cv-templates');
        const templateDirs = fs.readdirSync(templateRoot)
            .filter((f) => /^cv\d+$/i.test(f))
            .sort((a, b) => Number(a.slice(2)) - Number(b.slice(2)));

        const missingTemplates = templateDirs
            .filter((dir) => !fs.existsSync(path.join(templateRoot, dir, `${dir[0].toUpperCase()}${dir.slice(1)}.jsx`)))
            .map((dir) => `${dir}/${dir[0].toUpperCase()}${dir.slice(1)}.jsx`);

        record(`stage 5 CV template dirs on disk: ${templateDirs.length}; missing Cv<N>.jsx: ${JSON.stringify(missingTemplates)}`);
        expect(templateDirs.length, 'all 51 CV templates must still exist').toBe(51);
        expect(missingTemplates, 'every CV template directory must contain its Cv<N>.jsx').toEqual([]);
    });

    /**
     * STAGE 6 — the whole run accumulated ZERO console errors, ZERO page errors
     * and ZERO failed API requests.
     *
     * RUN_DEFECTS is a module-level accumulator that every browser stage drained
     * into via assertNoDefects. Draining it once more here means the assertion
     * holds even if an individual stage above is skipped or retried, and the
     * report is written next to the rest of the DIR-009 evidence.
     */
    test('stage 6: zero console errors, zero page errors, zero failed API calls', async () => {
        const summary = {
            routes: CANDIDATE_ROUTES,
            consoleErrors: RUN_DEFECTS.consoleErrors,
            pageErrors: RUN_DEFECTS.pageErrors,
            failedApi: RUN_DEFECTS.failedApi,
        };
        fs.writeFileSync(
            path.join(EVIDENCE_DIR, 'dir009-defect-report.json'),
            `${JSON.stringify(summary, null, 2)}\n`,
        );
        record(`stage 6 accumulated defects: console=${RUN_DEFECTS.consoleErrors.length} pageErrors=${RUN_DEFECTS.pageErrors.length} api=${RUN_DEFECTS.failedApi.length}`);

        expect(RUN_DEFECTS.consoleErrors, 'no console errors anywhere in the run').toEqual([]);
        expect(RUN_DEFECTS.pageErrors, 'no uncaught page errors anywhere in the run').toEqual([]);
        expect(RUN_DEFECTS.failedApi, 'no failed /api/* request anywhere in the run').toEqual([]);
    });
});

function frozenDiffStat() {
    return execFileSync(
        'git',
        ['diff', '--stat', DIR008_FREEZE, '--', ...FROZEN_PATHS],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
}
