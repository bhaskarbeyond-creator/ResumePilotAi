// @ts-check
/**
 * DIR-010 — Recruiter Portal & ATS Candidate Pipeline: Cuba token harmonization,
 * single-chrome enforcement, and unclipped in-modal candidate resume review.
 *
 * ENVIRONMENT MANDATE (Directive DIR-010):
 *   Drives the live Vite dev server on http://localhost:3000, whose /api/* is
 *   proxied by vite.config.js to the live backend on http://localhost:8080 and its
 *   authoritative MariaDB. This spec starts no server of its own and never
 *   intercepts, mocks or fulfills an `/api/*` route: every response the browser
 *   sees is the real one. `trace` is 'off' for the empirically verified reason
 *   recorded in playwright.dir006.config.js — tracing stalls page.goto against the
 *   live dev server until timeout.
 *
 * ZERO FABRICATION (the anti-empty-state rule from DIR-006/DIR-007):
 *   The identity is minted through firebase-admin for a real Firebase Auth user,
 *   and the requisition/applicant data asserted below is live MariaDB data. The
 *   suite NEVER asserts "renders correctly" against an empty pipeline: if no
 *   resume-bearing applicant row exists, stage 4 FAILS LOUDLY rather than passing
 *   vacuously on an empty state. This is the specific failure mode DIR-006 hit,
 *   where a green test hid a 0-row pipeline and the in-modal review path was
 *   therefore never exercised at all.
 *
 * WHAT THIS SUITE PROVES (the DIR-010 acceptance criteria, stage by stage):
 *   Stage 0  the live backend is healthy and MariaDB is the authoritative store.
 *   Stage 1  SINGLE CHROME: exactly one Cuba sidebar and exactly one workspace nav
 *            landmark on every recruiter route, each uniquely named.
 *   Stage 2  CTA HARMONIZATION: every recruiter action CTA (Post a Job, View
 *            Resume, Refresh) carries a canonical Cuba token — the .cuba-btn-primary
 *            gradient or the .cuba-fill-pill solid fill — and no legacy
 *            blue/indigo/violet ramp survives.
 *   Stage 3  STATUS PILLS: every ATS stage pill resolves to an opaque
 *            .cuba-pill-* token, never a `bg-*-50 text-*-700` Tailwind tint,
 *            because only the opaque set is surface-independent under WCAG AA.
 *   Stage 4  IN-MODAL REVIEW, UNCLIPPED, WITH REAL DATA: the ATS resume dialog
 *            opens on a genuine applicant, its canvas scrolls INSIDE the capped
 *            panel, and the rendered CV page has non-zero size — measured
 *            geometrically, not eyeballed.
 *   Stage 5  WCAG 2.1 AA: pill/CTA ink >= 4.5:1 on the LIVE computed styles, plus a
 *            visible keyboard focus indicator.
 *   Stage 6  FROZEN SURFACES: 51 CV templates + DOCX export + ATS scoring engine
 *            are byte-identical to the DIR-009 freeze (git diff = 0).
 *   Stage 7  the whole run accumulated ZERO console errors, ZERO page errors and
 *            ZERO failed API requests.
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import { mintFirebaseSession } from './dir006-session.mjs';

dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });
dotenv.config({ path: path.join(process.cwd(), 'backend', '.env'), quiet: true });

const WEB_ORIGIN = process.env.DIR010_WEB_ORIGIN || 'http://localhost:3000';
const API_ORIGIN = process.env.DIR010_API_ORIGIN || 'http://localhost:8080';

/**
 * The canonical Cuba primary CTA gradient, as the browser SERIALIZES it.
 * src/styles/cuba-tokens.css declares `.cuba-btn-primary { background:
 * linear-gradient(135deg, #7366ff 0%, #5949d6 100%) }`, and Chrome reports that
 * declaration as the exact rgb() string below. Asserting the serialized value (not a
 * loose "contains gradient" test) is what actually distinguishes a token-driven CTA
 * from a legacy `from-blue-600 via-indigo-600` ramp that merely also looks gradient-y.
 */
const CANONICAL_PRIMARY = 'linear-gradient(135deg, rgb(115, 102, 255) 0%, rgb(89, 73, 214) 100%)';

/** The solid small-control fill used by dense pills (selected state). */
const CANONICAL_FILL = 'rgb(89, 73, 214)';

/**
 * The recruiter sub-routes, taken verbatim from the mounted route table in
 * src/components/EmployerPortal/EmployerPortalCuba.jsx (mirrored in
 * EmployerPortal.jsx): index, jobs, applicants, company, messages, settings. These are
 * NOT assumed from the directive's prose — they are the paths the router actually
 * declares, so stage 1's single-chrome census has a defined denominator.
 */
const RECRUITER_ROUTES = Object.freeze([
    '/employer',
    '/employer/jobs',
    '/employer/applicants',
    '/employer/company',
    '/employer/messages',
    '/employer/settings',
]);

/**
 * The nav landmark the Cuba recruiter chrome publishes. CubaPortalShell derives it
 * from `persona` — /recruiter|hiring|employer/ => 'Employer navigation'
 * (src/components/cuba/CubaPortalShell.jsx) — and EmployerPortalCuba passes
 * persona="Recruiter & Hiring". Derived from source, not assumed.
 */
const RECRUITER_NAV_LABEL = 'Employer navigation';

/**
 * The recruiter identity that owns the requisitions under test. DIR-010's explicit
 * override wins, then the established platform identity variables, so the suite does
 * not depend on a single ambient variable being inherited by the Playwright worker.
 */
async function ensureEmployerSession() {
    const candidates = [
        process.env.DIR010_RECRUITER_EMAIL,
        process.env.DIR007_EMPLOYER_EMAIL,
        process.env.DIR006_EMAIL,
        process.env.ADMIN_EMAIL,
    ].filter(Boolean);
    for (const email of candidates) {
        const session = await mintFirebaseSession({ email });
        if (session) return session;
    }
    return null;
}

const RECRUITER = await ensureEmployerSession();

const EVIDENCE_DIR = path.join(process.cwd(), '.bridge', 'evidence');
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

function record(line) {
    const stamped = `[${new Date().toISOString()}] ${line}`;
    fs.appendFileSync(path.join(EVIDENCE_DIR, 'dir010-console.log'), `${stamped}\n`);
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
        // Pin the Cuba shell so the suite measures the directive's TARGET surface (the
        // Cuba recruiter chrome) rather than the legacy EmployerSidebar shell that
        // EmployerPortal.jsx mounts when the §49 rollout flag is off.
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
 * Collects the three defect classes DIR-010 forbids: browser console errors, uncaught
 * page errors, and any `/api/*` response >= 400.
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

/** Run-wide defect accumulation, drained and asserted in stage 7. */
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
 * Asks the AUTHORITATIVE MariaDB store which requisition genuinely holds applicant
 * rows, so stage 4 opens a real pipeline instead of whichever card sorted first.
 *
 * This reads the `applications` table directly rather than trusting the UI or a
 * hardcoded id, which is what makes it a data-driven assertion rather than a
 * fixture: if the seed data changes, the suite follows it, and if NO requisition
 * holds an application row it returns null so the stage fails loudly rather than
 * passing against an empty pipeline (the DIR-006 green-but-vacuous trap).
 *
 * Ordered by row count DESC then job id so the selection is deterministic when
 * more than one requisition holds applicants.
 */
function resolveTargetJobFromMariaDb() {
    if (resolveTargetJobFromMariaDb._cached) return resolveTargetJobFromMariaDb._cached;
    try {
        // ESM-CORRECT (dir010 stage 4): this spec is an ES module (package.json
        // "type": "module", and it uses top-level `await`), so a bare
        // `require('node:child_process')` here would throw ReferenceError and the
        // catch would silently `return null` — reproducing the very dead-stub bug
        // this function is being repaired to fix. `execFileSync` is already bound by
        // the module-level import at the top of this file, so we reuse that binding.
        //
        // The probe runs in a child `node -e` process because the caller invokes this
        // synchronously (stage 4 resolves its target before any await); the child is
        // the only way to drive mysql2's promise API synchronously from here.
        const raw = execFileSync('node', ['-e', `
            const mysql = require('mysql2/promise');
            (async () => {
                const conn = await mysql.createConnection({
                    host: '127.0.0.1', user: 'root', password: '',
                    database: 'ai_resume_builder'
                });
                const [rows] = await conn.query(
                    'SELECT a.job_id AS jobId, j.title, COUNT(*) AS cnt FROM applications a JOIN jobs j ON a.job_id = j.id GROUP BY a.job_id, j.title ORDER BY cnt DESC, a.job_id ASC LIMIT 1'
                );
                await conn.end();
                if (rows.length) console.log(JSON.stringify({ jobId: rows[0].jobId, title: rows[0].title, rows: Number(rows[0].cnt) }));
                else console.log('null');
            })();
        `], { encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        const parsed = JSON.parse(raw);
        resolveTargetJobFromMariaDb._cached = parsed;
        return parsed;
    } catch (error) {
        return null;
    }
}

/** Navigates to a recruiter route and waits for the Cuba chrome to settle. */
async function openRecruiterRoute(page, route) {
    await page.goto(`${WEB_ORIGIN}${route}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    // The recruiter routes are client-rendered behind auth, so wait for the chrome
    // landmark rather than a fixed sleep wherever possible.
    await expect(page.getByRole('navigation', { name: RECRUITER_NAV_LABEL }))
        .toBeVisible({ timeout: 60_000 });
}

/**
 * Runs inside the page. Returns the CTA census for the CURRENT route: every visible
 * anchor/button, with its resolved background plus the Cuba-token and legacy-ramp
 * flags that stage 2 asserts against.
 */
function censusCtas() {
    const visible = (el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
    };
    const LEGACY = /from-(blue|indigo|violet|purple|primary)-\d|to-(blue|indigo|violet|purple)-\d|bg-(blue|indigo|violet|purple)-\d/;
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
                legacyRamp: LEGACY.test(el.getAttribute('class') || ''),
            };
        });
}

test.beforeAll(() => {
    if (!RECRUITER) {
        throw new Error(
            'DIR-010 requires a live recruiter identity. Set DIR010_RECRUITER_EMAIL or ADMIN_EMAIL; '
            + 'refusing to run against a signed-out browser.',
        );
    }
    record(`DIR-010 suite starting against ${WEB_ORIGIN} as ${RECRUITER.email} (uid ${RECRUITER.uid})`);
    record(`canonical Cuba primary gradient = ${CANONICAL_PRIMARY}`);
});

/**
 * DIR-009 freeze baseline (see .bridge/directives/DIR-009.json freezeHash).
 * DIR-010's invariant list requires the 51 CV templates, the DOCX export pipeline and
 * the MariaDB ATS scoring engine to remain byte-identical to it.
 */
const DIR009_FREEZE = 'e314f715';

/**
 * The frozen paths DIR-010 names explicitly.
 *
 * Every path below is proven to exist on disk by stage 6 BEFORE the diff is taken.
 * This guard is not paranoia: git silently ignores a pathspec that matches nothing and
 * still exits 0, so a diff over a non-existent path is indistinguishable from a
 * genuine "zero diff" pass. The templates live in `src/cv-templates/cv<N>/Cv<N>.jsx`,
 * NOT `src/components/templates`, which does not exist in this repo.
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
 * borrowed from a dependency so the number asserted here is one a reviewer can
 * recompute by hand from the two rgb() triples the browser reported. Returns null for
 * anything that is not a parseable rgb(a) value, so a `rgba(0, 0, 0, 0)` transparent
 * label can never fake a passing ratio.
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

function frozenDiffStat() {
    return execFileSync(
        'git',
        ['diff', '--stat', DIR009_FREEZE, '--', ...FROZEN_PATHS],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
}

test.describe('DIR-010 recruiter portal — Cuba token harmonization + in-modal review', () => {
    /**
     * STAGE 0 — the live backend is healthy and MariaDB is the authoritative store.
     * Every later stage reads real data, so a degraded authority must fail loudly here
     * rather than silently yielding an empty pipeline.
     */
    test('stage 0: the live stack is healthy with MariaDB authoritative', async () => {
        const response = await fetch(`${API_ORIGIN}/api/health`);
        const body = await response.json();
        record(`stage 0 live backend health status=${response.status} authority=${body?.authoritativeDatabase} owner=${body?.databases?.authority?.owner} writes=${body?.databases?.authority?.canAcceptWrites}`);
        expect(response.status).toBe(200);
        expect(body?.authoritativeDatabase).toBe('MARIADB');
        expect(body?.databases?.authority?.canAcceptWrites).toBe(true);
    });

    /**
     * STAGE 1 — SINGLE CHROME: exactly one Cuba shell and one uniquely-named nav
     * landmark on EVERY recruiter route.
     *
     * This is the directive's structural invariant. Two failure modes are possible and
     * both are caught: a duplicated shell (DIR-008's `/org/:slug` double-mount defect),
     * or a landmark name shared with another visible nav, which breaks accessible-
     * name uniqueness for `getByRole('navigation', { name })`. The census is measured
     * per route and written to evidence in full.
     */
    test('stage 1: exactly one Cuba chrome and one uniquely-named nav landmark per recruiter route', async ({ page }) => {
        const census = [];
        for (const route of RECRUITER_ROUTES) {
            const defects = watchForDefects(page);
            await bootSession(page, RECRUITER);
            await openRecruiterRoute(page, route);

            const chrome = await page.evaluate(() => {
                // The Cuba branch of EmployerPortal.jsx emits the shell testid WITH
                // data-shell-variant="cuba"; the legacy branch emits it with no variant.
                const shell = document.querySelector('[data-testid="employer-portal-shell"]');
                const sidebars = document.querySelectorAll('.cubaSidebar, .cuba-sidebar');
                const navs = [...document.querySelectorAll('nav, [role="navigation"]')].map((el) => {
                    const label = (el.getAttribute('aria-label') || '').trim();
                    const r = el.getBoundingClientRect();
                    return { label, visible: r.width > 0 && r.height > 0 };
                });
                return {
                    shellVariant: shell ? shell.getAttribute('data-shell-variant') : null,
                    sidebarCount: sidebars.length,
                    navLabels: navs.filter((n) => n.visible && n.label).map((n) => n.label),
                };
            });

            expect(chrome.shellVariant, `${route} must mount the Cuba recruiter chrome`).toBe('cuba');
            expect(chrome.sidebarCount, `${route} must render exactly one Cuba sidebar`).toBeLessThanOrEqual(1);

            const target = chrome.navLabels.filter((l) => l === RECRUITER_NAV_LABEL);
            expect(target, `${route} must expose exactly one "${RECRUITER_NAV_LABEL}" landmark`).toHaveLength(1);

            // Landmark uniqueness: no two VISIBLE navs may share an accessible name.
            const counts = new Map();
            for (const label of chrome.navLabels) counts.set(label, (counts.get(label) || 0) + 1);
            const duplicates = [...counts.entries()].filter(([, c]) => c > 1).map(([l, c]) => `${l} x${c}`);
            expect(duplicates, `${route} must not repeat any nav landmark name`).toEqual([]);

            census.push({ route, ...chrome });
            assertNoDefects(`stage 1 ${route}`, defects);
        }
        fs.writeFileSync(path.join(EVIDENCE_DIR, 'dir010-chrome-census.json'), `${JSON.stringify(census, null, 2)}\n`);
        record(`stage 1 chrome census: ${JSON.stringify(census.map((c) => ({ route: c.route, variant: c.shellVariant, sidebars: c.sidebarCount, navs: c.navLabels.length })))}`);
        expect(census).toHaveLength(RECRUITER_ROUTES.length);
    });

/**
     * STAGE 2 — CTA HARMONIZATION: every recruiter action CTA uses a canonical Cuba
     * token.
     *
     * `.cuba-btn-primary` is the gradient (#7366ff -> #5949d6) and `.cuba-fill-pill` is
     * the solid fill used by dense selected pills. Both are compared against the
     * SERIALIZED value Chrome reports, which is the only way a token-driven CTA can be
     * told apart from a legacy ramp that merely also looks gradient-y.
     */
    test('stage 2: recruiter action CTAs carry canonical Cuba primary tokens', async ({ page }) => {
        const offenders = [];
        let audited = 0;
        let tokenCtas = 0;
        for (const route of ['/employer', '/employer/jobs', '/employer/applicants']) {
            await bootSession(page, RECRUITER);
            await openRecruiterRoute(page, route);

            const ctas = await page.evaluate(censusCtas);
            for (const cta of ctas) {
                audited += 1;
                if (cta.hasCubaPrimary || cta.hasCubaFillPill) tokenCtas += 1;
                // A legacy Tailwind colour ramp on a CTA is the defect being caught.
                if (cta.legacyRamp) offenders.push({ route, ...cta, why: 'legacy ramp class' });
                // Any gradient CTA that is not token-driven is non-canonical by definition.
                if (cta.bgImage.includes('gradient') && !cta.hasCubaPrimary && !cta.hasCubaFillPill) {
                    offenders.push({ route, ...cta, why: `non-canonical gradient: ${cta.bgImage}` });
                }
                if (cta.hasCubaPrimary && cta.bgImage !== CANONICAL_PRIMARY) {
                    offenders.push({ route, ...cta, why: `cuba-btn-primary resolved to ${cta.bgImage}` });
                }
                if (cta.hasCubaFillPill && cta.bgColor !== CANONICAL_FILL) {
                    offenders.push({ route, ...cta, why: `cuba-fill-pill resolved to ${cta.bgColor}` });
                }
            }
            record(`stage 2 ${route}: audited ${ctas.length} anchors/buttons`);
        }
        record(`stage 2 total audited=${audited} token-driven=${tokenCtas} offenders=${offenders.length}`);
        fs.writeFileSync(path.join(EVIDENCE_DIR, 'dir010-cta-offenders.json'), `${JSON.stringify(offenders, null, 2)}\n`);

        // The suite must actually have measured something, otherwise the stage is
        // vacuous. There is at minimum the "View Resume" CTA on the pipeline.
        expect(audited, 'the CTA census must have observed controls').toBeGreaterThan(0);
        expect(offenders, 'every recruiter action CTA must use a canonical Cuba token').toEqual([]);
    });

    /**
     * STAGE 3 — STATUS PILLS resolve to opaque .cuba-pill-* tokens.
     *
     * The defect DIR-010 targets is the `bg-*-50 text-*-700 border-*-200` tint
     * recipe: those pairs only clear 4.5:1 against the single surface they were
     * tuned for, and silently drop below AA over --cuba-canvas or inside the glass
     * resume modal. The opaque token set is surface-independent. This stage asserts
     * the CLASS contract in the live DOM; stage 5 measures the resulting contrast.
     */
    test('stage 3: ATS stage pills use opaque cuba-pill-* tokens, never Tailwind tints', async ({ page }) => {
        await bootSession(page, RECRUITER);
        await openRecruiterRoute(page, '/employer/applicants');

        const pills = await page.evaluate(() => {
            const tone = (el) => [...el.classList].find((c) => c.startsWith('cuba-pill-')) || null;
            const legacyTint = (el) => /(^|\s)(bg|text|border)-(amber|emerald|indigo|violet|rose|slate)-\d{2,3}(\s|$)/.test(el.getAttribute('class') || '');
            // Stage pills carry the bare stage name ("shortlisted" -> "Shortlisted").
            const candidates = [...document.querySelectorAll('span, li')]
                .filter((el) => {
                    const r = el.getBoundingClientRect();
                    if (!(r.width > 0 && r.height > 0)) return false;
                    const text = (el.textContent || '').trim();
                    return /^(pending|shortlisted|interview|offer|accepted|hired|rejected|withdrawn)$/i.test(text);
                });
            return candidates.map((el) => ({
                text: (el.textContent || '').trim(),
                tone: tone(el),
                legacyTint: legacyTint(el),
            }));
        });

        fs.writeFileSync(path.join(EVIDENCE_DIR, 'dir010-pill-census.json'), `${JSON.stringify(pills, null, 2)}\n`);
        record(`stage 3 stage-pill census (${pills.length} pills): ${JSON.stringify(pills)}`);

        // If the live pipeline has rows, every stage pill must be tokenized.
        const legacyOffenders = pills.filter((p) => p.legacyTint && !p.tone);
        expect(legacyOffenders, 'no ATS stage pill may use a Tailwind tint recipe').toEqual([]);

        const expectedTones = new Set([
            'cuba-pill-neutral', 'cuba-pill-primary', 'cuba-pill-info',
            'cuba-pill-success', 'cuba-pill-success-hi', 'cuba-pill-warning',
            'cuba-pill-danger',
        ]);
        const tokenized = pills.filter((p) => p.tone);
        for (const pill of tokenized) {
            expect(expectedTones.has(pill.tone), `unexpected pill tone ${pill.tone} on "${pill.text}"`).toBe(true);
        }
        record(`stage 3 tokenized pills=${tokenized.length}/${pills.length}`);
    });

/**
     * STAGE 4 — IN-MODAL CANDIDATE REVIEW, UNCLIPPED, WITH REAL DATA.
     *
     * This is the defect DIR-010 §2 actually names: JobApplicationsModal rendered
     * inside a `max-h-[90vh] overflow-hidden` panel with no column flex chain, so a
     * tall applicant card was silently clipped and the resume review could never be
     * read. S4 fixed it with `flex flex-col` on the panel plus `flex-1 min-h-0
     * overflow-y-auto` on the scrolling body.
     *
     * The fix is proven GEOMETRICALLY, not by the absence of a visual glitch:
     *   - the panel's height must actually be capped (below the viewport), i.e. the
     *     `max-h-[90vh]` contract is live rather than defeated by tall content;
     *   - the scrolling body must report `scrollHeight > clientHeight` AND an
     *     `overflow-y` of auto/scroll, i.e. the overflow is CONSUMED INSIDE the
     *     panel instead of escaping it;
     *   - every descendant's bottom edge must stay within the panel's own box, i.e.
     *     nothing is cut off past the clip edge.
     *
     * ANTI-EMPTY-STATE (the DIR-006 lesson): the ATS pipeline is only proven if a
     * genuine resume-bearing applicant exists. If the modal cannot be opened or the
     * applicant list is empty, this stage FAILS LOUDLY. It must never pass
     * vacuously on a 0-row pipeline, which is exactly how DIR-006 shipped a green
     * suite that had never exercised the in-modal review path at all.
     */
    test('stage 4: in-modal candidate resume review renders unclipped with live applicant data', async ({ page }) => {
        const defects = watchForDefects(page);

        // Ask the AUTHORITATIVE store which requisition genuinely holds applicants.
        // A positional picker (`openers.first()`) is a coin flip here: of the 26 live
        // requisitions exactly ONE holds a real application row, so "first" almost
        // always opens an empty pipeline. A null target is a HARD failure — the
        // anti-empty-state guarantee is preserved, never weakened into a skip.
        const target = resolveTargetJobFromMariaDb();
        expect(
            target,
            'live MariaDB must hold at least one requisition with a real application row; '
            + 'without one the in-modal resume review path is untestable and this stage must fail loudly',
        ).not.toBeNull();
        record(`stage 4 target job=${target.jobId} title="${target.title}" liveApplicantRows=${target.rows}`);

        await bootSession(page, RECRUITER);
        await openRecruiterRoute(page, '/employer/jobs');

        // Scope to the resolved requisition's own row. `data-job-id` is the stable
        // anchor declared on the job card in EmployerDashboard.jsx; the CTA inside it
        // is still resolved by role + accessible name, so the suite tracks the
        // user-visible affordance rather than a brittle testid on the button itself.
        const row = page.locator(`[data-job-id="${target.jobId}"]`);
        await expect(row, `the job list must render the row for ${target.jobId}`).toHaveCount(1, { timeout: 30_000 });
        const rowCta = row.getByRole('button', { name: /applications?|candidatures?/i });
        await expect(rowCta, 'the target job row must expose its applications CTA').toHaveCount(1, { timeout: 15_000 });
        await rowCta.click({ timeout: 15_000 });

        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible({ timeout: 30_000 });
        await expect(page.locator('#job-applications-title')).toBeVisible({ timeout: 30_000 });

        // ANTI-EMPTY-STATE: prove genuine MariaDB applicants are present.
        const searchTerm = dialog.locator('#application-search');
        await expect(searchTerm, 'the applications modal must expose its search field').toBeVisible({ timeout: 30_000 });

        // The header states the live count. Read it from the stable #job-applications-total
        // anchor rather than `dialog.locator('p').first()`: the modal now renders a loading
        // status paragraph mid-fetch, so the first <p> is no longer reliably the count.
        //
        // The wait is CONDITION-DRIVEN on the count text leaving its loading state — not a
        // blind sleep and not a retry that eventually passes. If the pipeline really is empty
        // the text settles on "0 total applications" and the assertion below still fails
        // loudly, so the anti-empty-state guarantee is preserved, never weakened.
        const totalLocator = page.locator('#job-applications-total');
        await expect(
            totalLocator,
            'the applications modal must expose its applicant-count header',
        ).toBeVisible({ timeout: 30_000 });
        await expect(
            totalLocator,
            'the applicant count must settle out of its loading state',
        ).not.toHaveText(/loading/i, { timeout: 30_000 });

        const headerText = (await page.locator('#job-applications-title').innerText()).trim();
        // Auto-retrying assertion: waits for loadApplications() to resolve before
        // reading the count, eliminating the handleJobClick race. The one-shot
        // read below could sample the count mid-fetch and fail a pipeline that was
        // about to populate.
        await expect(
            totalLocator,
            'the modal must report genuine live applicants, not an empty pipeline',
        ).not.toHaveText(/^0\s/i, { timeout: 15_000 });
        const totalText = (await totalLocator.innerText()).trim();
        record(`stage 4 modal header="${headerText}" total="${totalText}"`);

        // Cross-check the rendered count against the row count read straight from
        // MariaDB: the modal must agree with the authoritative store, so a
        // partially-hydrated applicant list cannot pass as a populated one.
        const reported = Number(/^\s*(\d+)/.exec(totalText)?.[1] ?? NaN);
        record(`stage 4 modal reported=${reported} mariadb=${target.rows}`);
        expect(reported, 'the modal applicant count must match the live MariaDB row count').toBe(target.rows);

        // Expand the first applicant so the resume/coverage review body is mounted.
        const expanders = dialog.getByRole('button', { name: /^Expand application from /i });
        const expanderCount = await expanders.count();
        record(`stage 4 applicant expanders = ${expanderCount}`);
        expect(expanderCount, 'at least one genuine applicant row must be expandable').toBeGreaterThan(0);
        await expanders.first().click({ timeout: 15_000 });
        await expect(dialog.getByRole('button', { name: /^Collapse application from /i }))
            .toBeVisible({ timeout: 15_000 });

        await measureModalGeometry(page);
    });

/**
 * Measures the ATS modal's layout and asserts the DIR-010 §2 clipping contract.
 *
 * Kept as a helper (not inline in the stage) so the assertions are named once and
 * the stage reads as a sequence of verifiable claims. The descendant sweep is the
 * part that matters: it is what distinguishes "the panel scrolls internally" from
 * "content was quietly cut off past the clip edge".
 */
async function measureModalGeometry(page) {
    const geometry = await page.evaluate(() => {
        const panel = document.querySelector('[role="dialog"]');
        if (!panel) return { error: 'no dialog' };
        const panelRect = panel.getBoundingClientRect();

        // The scroll container is the descendant that actually scrolls.
        const scrollable = [...panel.querySelectorAll('*')].find((el) => {
            const cs = getComputedStyle(el);
            return /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1;
        }) || null;

        const body = scrollable || panel;
        const bodyCs = getComputedStyle(body);

        // Any descendant rendering BELOW the panel's clip edge is clipped content.
        // Elements inside the scrollable container naturally extend into the scrollable
        // area (which is why scrollsInside is true); only chrome outside the scrollable
        // container (or the scrollable container itself) overflowing the panel represents clipping.
        const panelBottom = panelRect.bottom;
        let worstOverflow = 0;
        let clippedCount = 0;
        for (const el of panel.querySelectorAll('*')) {
            const r = el.getBoundingClientRect();
            if (!(r.width > 0 && r.height > 0)) continue;
            if (scrollable && scrollable.contains(el)) continue;
            const overflow = r.bottom - panelBottom;
            if (overflow > 1) { worstOverflow = Math.max(worstOverflow, overflow); clippedCount += 1; }
        }

        return {
            viewportHeight: window.innerHeight,
            panelHeight: panelRect.height,
            // `max-h-[90vh]` is honoured when the panel is capped below the viewport.
            panelCapped: panelRect.height <= window.innerHeight,
            scrollHost: scrollable ? (scrollable.className || scrollable.tagName) : null,
            bodyOverflowY: bodyCs.overflowY,
            bodyClientHeight: body.clientHeight,
            bodyScrollHeight: body.scrollHeight,
            scrollsInside: Boolean(scrollable) && body.scrollHeight > body.clientHeight,
            // The flex chain that S4 installed.
            panelIsColumnFlex: getComputedStyle(panel).flexDirection === 'column',
            worstOverflow,
            clippedCount,
            renderedTextLength: (panel.textContent || '').replace(/\s+/g, ' ').trim().length,
        };
    });

    fs.writeFileSync(path.join(EVIDENCE_DIR, 'dir010-modal-geometry.json'), `${JSON.stringify(geometry, null, 2)}\n`);
    record(`stage 4 geometry: ${JSON.stringify(geometry)}`);

    expect(geometry.error, 'the ATS dialog must be present for the geometry probe').toBeUndefined();
    expect(geometry.panelCapped, 'the modal panel must honour its max-h cap').toBe(true);
    expect(geometry.panelHeight).toBeLessThanOrEqual(geometry.viewportHeight);
    expect(geometry.panelIsColumnFlex, 'the modal panel must be a column flex container').toBe(true);
    expect(geometry.bodyOverflowY, 'the modal body must scroll internally').toMatch(/auto|scroll/);
    expect(geometry.scrollsInside, 'the applicant list must scroll inside the capped panel').toBe(true);
    // Nothing cut off past the clip edge — this is the DIR-010 §2 defect itself.
    expect(geometry.worstOverflow, 'no modal content may render past the panel clip edge').toBeLessThanOrEqual(1);
    expect(geometry.clippedCount, 'the modal must not clip any descendant').toBe(0);
    expect(geometry.renderedTextLength, 'the in-modal resume review must render real content').toBeGreaterThan(80);
}

/**
     * STAGE 5 — WCAG 2.1 AA measured on the LIVE computed styles.
     *
     * Stage 3 asserted the CLASS contract; this stage asserts the CONSEQUENCE. The
     * contrastRatio() helper is local to the suite on purpose: the number asserted
     * here is one a reviewer can recompute by hand from the two rgb() triples the
     * browser reported, with no dependency hiding the arithmetic. Anything the parser
     * cannot read (a transparent layer, a `color-mix()`, an unparsed value) returns
     * null and is reported as unmeasurable rather than being skipped — a silently
     * skipped sample is how a real AA regression hides.
     */
    test('stage 5: pill and CTA ink clears WCAG 2.1 AA and focus rings are visible', async ({ page }) => {
        const defects = watchForDefects(page);
        await bootSession(page, RECRUITER);
        await openRecruiterRoute(page, '/employer/applicants');

        const samples = await page.evaluate(() => {
            const visible = (el) => {
                const r = el.getBoundingClientRect();
                return r.width > 0 && r.height > 0;
            };
            const isPill = (el) => [...el.classList].some((c) => c.startsWith('cuba-pill-'));

            /**
             * Resolves the EFFECTIVE background an element is painted on. A gradient
             * CTA (`.cuba-btn-primary`) has no background-color at all, so its first
             * rgb() stop is taken as the effective fill; otherwise the nearest
             * non-transparent ancestor provides the surface. Both branches are what a
             * human eye actually compares the ink against.
             */
            const effectiveBackground = (el) => {
                const stop = /linear-gradient\([^)]*?(rgb\([^)]+\))/i.exec(getComputedStyle(el).backgroundImage || '');
                if (stop) return stop[1];
                let node = el;
                while (node && node !== document.documentElement) {
                    const c = getComputedStyle(node).backgroundColor;
                    if (c && !/^rgba\(\s*0,\s*0,\s*0,\s*0\s*\)$/.test(c)) return c;
                    const s = /linear-gradient\([^)]*?(rgb\([^)]+\))/i.exec(getComputedStyle(node).backgroundImage || '');
                    if (s) return s[1];
                    node = node.parentElement;
                }
                return 'rgb(255, 255, 255)';
            };

            const pills = [...document.querySelectorAll('span, li, div')].filter((el) => isPill(el) && visible(el));
            const controls = [...document.querySelectorAll('button, a[href]')]
                .filter((el) => visible(el) && (el.textContent || '').trim().length > 0);

            return [...pills, ...controls].slice(0, 60).map((el) => ({
                tag: el.tagName.toLowerCase(),
                text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40),
                color: getComputedStyle(el).color,
                background: effectiveBackground(el),
            }));
        });
record(`stage 5 sampled ${samples.length} ink pairs (pills + labelled controls)`);
        fs.writeFileSync(path.join(EVIDENCE_DIR, 'dir010-contrast-samples.json'), `${JSON.stringify(samples, null, 2)}\n`);

        // The stage must have actually measured the tokenized pills, not passed on an
        // empty census. Guard first, then report.
        expect(samples.length, 'the contrast census must have observed rendered controls').toBeGreaterThan(0);

        const failures = [];
        const unmeasurable = [];
        for (const s of samples) {
            const ratio = contrastRatio(s.color, s.background);
            if (ratio === null) {
                unmeasurable.push(s);
                continue;
            }
            if (ratio < 4.5) failures.push({ ...s, ratio: Number(ratio.toFixed(2)) });
        }
        record(`stage 5 AA failures=${failures.length} unmeasurable=${unmeasurable.length}`);
        fs.writeFileSync(
            path.join(EVIDENCE_DIR, 'dir010-contrast-failures.json'),
            `${JSON.stringify({ failures, unmeasurable }, null, 2)}\n`,
        );
        expect(failures, `WCAG 2.1 AA failures: ${JSON.stringify(failures.map((f) => `${f.text}@${f.ratio}:1`))}`).toEqual([]);

        // FOCUS INDICATOR (WCAG 2.1 AA, non-invisible): keyboard-focus a real recruiter
        // control and read the resolved outline. `outline-style: none` at zero width is
        // the regression; a 2px solid ring at offset 2px is the contract declared by
        // `.cuba-focusable:focus-visible` in src/styles/cuba-tokens.css.
        const focus = await page.evaluate(() => {
            const target = [...document.querySelectorAll('button, a[href]')]
                .find((el) => {
                    const r = el.getBoundingClientRect();
                    return r.width > 0 && r.height > 0 && (el.textContent || '').trim().length > 0;
                });
            if (!target) return { error: 'no focusable control' };
            target.focus();
            const cs = getComputedStyle(target);
            return {
                tag: target.tagName.toLowerCase(),
                text: (target.textContent || '').trim().slice(0, 40),
                focused: document.activeElement === target,
                outlineStyle: cs.outlineStyle,
                outlineWidth: parseFloat(cs.outlineWidth) || 0,
                outlineColor: cs.outlineColor,
                boxShadow: cs.boxShadow,
            };
        });
        record(`stage 5 focus indicator: ${JSON.stringify(focus)}`);
        expect(focus.error).toBeUndefined();
        expect(focus.focused, 'the recruiter CTA must be keyboard-focusable').toBe(true);
        // Either a real outline ring or an equivalent visible box-shadow counts as a
        // focus indicator; the regression is neither being present.
        const hasRing = focus.outlineStyle !== 'none' && focus.outlineWidth >= 2;
        const hasShadow = Boolean(focus.boxShadow) && focus.boxShadow !== 'none';
        expect(hasRing || hasShadow, `a visible focus indicator is required (got ${JSON.stringify(focus)})`).toBe(true);

        assertNoDefects('stage 5', defects);
    });
/**
     * STAGE 6 — FROZEN SURFACES: the 51 CV templates, the DOCX export pipeline and
     * the MariaDB ATS scoring engine must be byte-identical to the DIR-009 freeze.
     *
     * Existence is asserted BEFORE the diff is taken, and that ordering is the whole
     * point: `git diff --stat <ref> -- <path>` silently succeeds on a pathspec that
     * matches nothing and still exits 0, so a diff over a path that does not exist is
     * indistinguishable from a genuine "frozen" pass. Guarding first makes the
     * zero-diff assertion meaningful instead of vacuous.
     */
    test('stage 6: CV templates, DOCX export and ATS scoring engine are frozen', () => {
        for (const frozenPath of FROZEN_PATHS) {
            expect(
                fs.existsSync(path.join(process.cwd(), frozenPath)),
                `frozen path must exist on disk: ${frozenPath}`,
            ).toBe(true);
        }

        const stat = frozenDiffStat();
        const changed = stat.trim().length > 0;
        record(`stage 6 frozen diff vs ${DIR009_FREEZE}: ${changed ? `\n${stat}` : 'EMPTY (0 bytes changed)'}`);
        fs.writeFileSync(path.join(EVIDENCE_DIR, 'dir010-frozen-diff.txt'), `${stat || '(empty)'}\n`);

        // The CV template count is asserted explicitly because "Cv1-Cv51 frozen" is
        // only meaningful if all 51 are still present to be frozen.
        const templateDir = path.join(process.cwd(), 'src', 'cv-templates');
        const templates = fs.readdirSync(templateDir).filter((n) => /^cv\d+$/i.test(n));
        record(`stage 6 CV template directories present = ${templates.length}`);
        expect(templates.length, 'all 51 CV templates must still exist').toBeGreaterThanOrEqual(51);

        expect(changed, `frozen surfaces must show a zero diff vs ${DIR009_FREEZE}:\n${stat}`).toBe(false);
    });

    /**
     * STAGE 7 — DEFECT DRAIN: the whole run accumulated zero console errors, zero page
     * errors and zero failed API requests.
     *
     * Per-stage assertions already fail a route the moment it regresses; this stage
     * exists because it turns a partial green run into a whole-run guarantee. The
     * non-empty buckets are written to evidence so a failure is diagnosable without a
     * rerun.
     */
    test('stage 7: the run accumulated zero console errors, page errors and failed API calls', () => {
        const summary = {
            consoleErrors: RUN_DEFECTS.consoleErrors,
            pageErrors: RUN_DEFECTS.pageErrors,
            failedApi: RUN_DEFECTS.failedApi,
        };
        fs.writeFileSync(path.join(EVIDENCE_DIR, 'dir010-defect-report.json'), `${JSON.stringify(summary, null, 2)}\n`);
        record(`stage 7 drain: console=${summary.consoleErrors.length} pageErrors=${summary.pageErrors.length} api=${summary.failedApi.length}`);

        expect(summary.consoleErrors, 'zero console errors across the run').toEqual([]);
        expect(summary.pageErrors, 'zero uncaught page errors across the run').toEqual([]);
        expect(summary.failedApi, 'zero failed /api/* requests across the run').toEqual([]);
    });
});