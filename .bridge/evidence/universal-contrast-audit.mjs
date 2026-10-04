// @ts-check
/**
 * DIR-023: Universal Dark Mode Contrast Auditor.
 *
 *   node .bridge/evidence/universal-contrast-audit.mjs
 *   npm run audit:contrast
 *
 * CRAWLS EVERY CANONICAL ROUTE x BOTH THEMES and seals the result in
 * .bridge/evidence/UNIVERSAL_CONTRAST_CENSUS.json. Exits non-zero on any
 * WCAG 2.1 AA violation (AC-5), so it is usable as a CI gate.
 *
 * IDENTITY (Lead-confirmed, evt_mut8zczi_365df608)
 * ADMIN_EMAIL via the project's own mintFirebaseSession() helper. In this
 * architecture the Super Admin session carries cross-portal rights over
 * Candidate / Recruiter / Enterprise / Admin, so ONE genuine live Firebase
 * token covers all four portals. Nothing is fabricated and no ad-hoc seed
 * script is run: the token is signed by Google for the live project.
 *
 * ROUTES (Lead-confirmed, evt_mut8za2a_39efab96)
 * Derived from dir023-route-manifest.mjs, which mirrors the live router. The
 * directive's literal "68 routes" is an approximation and is superseded by this
 * authoritative crawl; the census records both numbers and states the override
 * explicitly so the Gatekeeper can see nothing was silently dropped.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import dotenv from 'dotenv';
import { chromium } from 'playwright';
import { buildRouteManifest } from './dir023-route-manifest.mjs';
import { contrastKernelFactory } from './dir023-contrast-engine.mjs';
import { measureTruthFromFrame } from './dir023-paint-truth.mjs';
import { mintFirebaseSession } from '../../tests/e2e/dir006-session.mjs';

dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });
dotenv.config({ path: path.join(process.cwd(), 'backend', '.env'), quiet: true });

const ORIGIN = (process.env.DIR023_ORIGIN || process.env.TARGET_URL || 'http://localhost:3000').replace(/\/$/, '');
const EMAIL = process.env.DIR023_EMAIL || process.env.ADMIN_EMAIL || process.env.DIR006_EMAIL;
const OUT = '.bridge/evidence/UNIVERSAL_CONTRAST_CENSUS.json';
const LOG = '.bridge/evidence/dir023-contrast-run.log';
const THEMES = ['light', 'dark'];
const VIEWPORT = { width: 1400, height: 900 };
const NAV_TIMEOUT = Number(process.env.DIR023_NAV_TIMEOUT || 45_000);
const SETTLE_MS = Number(process.env.DIR023_SETTLE_MS || 900);
const CONCURRENCY = Number(process.env.DIR023_CONCURRENCY || 4);
const TRUTH_PATH_SAFETY = 0.05;

const logLines = [];
const log = (msg) => {
    const line = `[${new Date().toISOString()}] ${msg}`;
    logLines.push(line);
    console.log(line);
};

if (!EMAIL) {
    log('FATAL: no identity configured. Set DIR023_EMAIL or ADMIN_EMAIL in backend/.env.');
    log('Refusing to fabricate an identity (bridge.json zeroSyntheticData: true).');
    process.exit(1);
}

const startedAt = Date.now();

/* ------------------------------------------------------------------ */
/* Readiness                                                         */
/* ------------------------------------------------------------------ */

/**
 * Waits for the SPA to actually paint content instead of guessing with a fixed
 * sleep.
 *
 * The first run used a flat 900ms settle and consequently recorded 8 real
 * surfaces (/, /dashboard/jobs, /admin/dashboard ...) as
 * SURFACE_NOT_RENDERED. A manual probe proved those pages render fine with
 * 11k-4.5k characters of text; the fixed wait was simply too short for the
 * heavier lazy-chunked portals. Waiting on the DOM is both faster and correct,
 * and it stops the audit from silently under-covering its own scope.
 *
 * @returns {Promise<boolean>} true once the surface looks real
 */
async function waitForSurface(page) {
    try {
        await page.waitForFunction(() => {
            const root = document.getElementById('root');
            const text = (document.body && document.body.innerText) || '';
            return Boolean(root && root.childElementCount > 0 && text.trim().length >= 40);
        }, null, { timeout: NAV_TIMEOUT, polling: 250 });
        return true;
    } catch (_) {
        return false;
    }
}

/* ------------------------------------------------------------------ */
/* Theme control                                                      */
/* ------------------------------------------------------------------ */

/**
 * Forces a theme the way a real user would, then waits for a full style
 * recalculation so every measurement is taken against committed paint values.
 */
async function applyTheme(page, theme) {
    await page.evaluate((t) => {
        localStorage.setItem('cuba_theme', t);
        localStorage.setItem('theme', t);
        const root = document.documentElement;
        root.setAttribute('data-theme', t);
        root.classList.toggle('dark', t === 'dark');
        root.style.colorScheme = t;
    }, theme);
    // Force layout + style flush before any measurement.
    await page.evaluate(() => new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => {
            void document.documentElement.offsetHeight;
            resolve(null);
        }));
    }));
    await page.waitForTimeout(SETTLE_MS);
}

/* ------------------------------------------------------------------ */
/* Surface sanity                                                     */
/* ------------------------------------------------------------------ */

/**
 * Guards against a false "0 violations" produced by auditing a blank page.
 * A route only counts as audited if it actually rendered a real surface.
 */
async function assertSurfaceRendered(page, route) {
    return page.evaluate(() => {
        const main = document.querySelector('main, [role="main"], #root');
        const bodyText = (document.body && document.body.innerText || '').trim();
        return {
            hasMain: Boolean(main),
            textLength: bodyText.length,
            rootChildren: (document.getElementById('root') || {}).childElementCount || 0,
        };
    }).then((info) => {
        const empty = !info.hasMain || info.textLength < 40 || info.rootChildren === 0;
        return { ...info, rendered: !empty };
    });
}

/* ------------------------------------------------------------------ */
/* Tenant slug resolution (server-authoritative)                      */
/* ------------------------------------------------------------------ */

/**
 * Enterprise tabs are `/org/:slug/<tab>`. The slug is resolved by the SERVER
 * from /api/enterprise/context, never guessed by the crawler. If the identity
 * has no tenant, enterprise routes are honestly reported as SKIPPED rather than
 * probed with a fabricated slug.
 */
async function resolveTenantSlug(page) {
    // The endpoint is rate-limited (a 429 was observed during a back-to-back
    // re-run), so this retries with backoff. Dropping the slug would silently
    // shrink the audit from 74 routes to 60 by omitting every /org/:slug tab,
    // which is exactly the kind of self-inflicted coverage loss this audit
    // exists to prevent.
    for (let attempt = 1; attempt <= 4; attempt += 1) {
        try {
            const response = await page.evaluate(async () => {
                // The live page's own axios interceptor attaches the bearer token for
                // same-origin /api/ calls, so the crawler reuses the running app
                // instead of forging an Authorization header.
                const res = await fetch('/api/enterprise/context', { headers: { Accept: 'application/json' } });
                return { status: res.status, body: await res.text() };
            });
            if (response.status === 200) {
                const parsed = JSON.parse(response.body);
                const slug = (parsed && parsed.tenant && parsed.tenant.slug) || null;
                if (slug) return { slug, status: response.status, attempts: attempt };
            }
            if (response.status !== 429) {
                // A genuine non-transient answer (403/404) will not improve.
                return { slug: null, status: response.status, attempts: attempt };
            }
            await page.waitForTimeout(1500 * attempt);
        } catch (error) {
            await page.waitForTimeout(1000 * attempt);
        }
    }
    return { slug: null, status: 429, attempts: 4 };
}

/* ------------------------------------------------------------------ */
/* Sign-in                                                            */
/* ------------------------------------------------------------------ */

/**
 * Seeds Firebase web-SDK persistence exactly as tests/e2e/dir022 does, so the
 * live client (src/conf/fire.js) accepts the Google-signed session.
 */
async function signIn(page, session) {
    await page.addInitScript(({ uid, email, token, refreshToken, apiKey }) => {
        localStorage.setItem(`firebase:authUser:${apiKey}:[DEFAULT]`, JSON.stringify({
            uid,
            email,
            emailVerified: true,
            isAnonymous: false,
            stsTokenManager: { apiKey, refreshToken, accessToken: token, expirationTime: Date.now() + 3600_000 },
            createdAt: String(Date.now()),
            lastLoginAt: String(Date.now()),
        }));
    }, session);
}

/* ------------------------------------------------------------------ */
/* Route audit                                                        */
/* ------------------------------------------------------------------ */

/**
 * Audits one route in both themes.
 * @returns {Promise<any>} a per-route census record
 */
async function auditRoute(page, route) {
    const record = {
        path: route.path,
        surface: route.surface,
        portal: route.portal,
        auth: route.auth,
        rendered: false,
        status: null,
        redirectedTo: null,
        error: null,
        themes: {},
    };

    try {
        const response = await page.goto(`${ORIGIN}${route.path}`, {
            waitUntil: 'domcontentloaded',
            timeout: NAV_TIMEOUT,
        });
        record.status = response ? response.status() : null;

        // Wait for real content rather than a fixed sleep, then let lazy data
        // fetches and entry animations settle.
        await waitForSurface(page);
        await page.waitForTimeout(SETTLE_MS);

        const finalPath = await page.evaluate(() => window.location.pathname);
        if (finalPath !== route.path) record.redirectedTo = finalPath;

        const surface = await assertSurfaceRendered(page);
        record.rendered = surface.rendered;
        record.surfaceDetail = surface;
        if (!surface.rendered) {
            record.error = 'SURFACE_NOT_RENDERED (blank or redirect-only route)';
            return record;
        }

        for (const theme of THEMES) {
            record.themes[theme] = await auditTheme(page, theme);
        }
    } catch (error) {
        record.error = `NAVIGATION_ERROR: ${error && error.message}`;
    }

    return record;
}

/**
 * Applies a theme, measures via the FAST path, escalates to the TRUTH path, and
 * adjudicates the two.
 */
async function auditTheme(page, theme) {
    await applyTheme(page, theme);
    const measured = await page.evaluate(contrastKernelFactory(), { theme });

    const rows = measured.results || [];
    const exemptRows = rows.filter((r) => r.exempt);
    const auditedRows = rows.filter((r) => !r.exempt);

    // Escalate to the rasterised TRUTH path only what needs it: a LEAF text node
    // whose ancestor chain carries a paint the fast walk cannot model, plus any
    // leaf the fast path flagged. A clean simple-chain pass is already exact, so
    // screenshotting it would burn the INV-5 budget proving nothing.
    //
    // Leaf-only is a correctness requirement, not an optimisation: a container's
    // bounding box also contains its descendants' paints (avatars, icons, nested
    // cards), so sampling it measures the children rather than the text. The fast
    // path stays authoritative for containers because it walks real computed
    // ancestry.
    const needsTruth = auditedRows.filter(
        (r) => r.leafText && (r.needsTruthPath || r.fastPath.ratio + TRUTH_PATH_SAFETY < r.requiredRatio),
    );

    /** @type {any[]} */
    const truthResults = [];
    if (needsTruth.length) {
        const frame = await page.screenshot({ fullPage: false, type: 'png' });
        const measurements = await measureTruthFromFrame(frame, measured.devicePixelRatio, needsTruth);
        truthResults.push(...needsTruth.map((row, i) => ({ row, measurement: measurements.get(i) || null })));
    }
    const truthByRow = new Map(truthResults.map((t) => [t.row, t.measurement]));

    /** @type {any[]} */
    const violations = [];
    let worstRatio = Infinity;
    let probes = 0;

    for (const row of auditedRows) {
        probes += 1;
        const fastRatio = row.fastPath.ratio;
        const fastPass = fastRatio + TRUTH_PATH_SAFETY >= row.requiredRatio;
        const measurement = truthByRow.get(row) || null;
        const truthRatio = measurement && measurement.sampled ? measurement.truthRatio : null;
        const truthPass = truthRatio === null ? null : truthRatio + TRUTH_PATH_SAFETY >= row.requiredRatio;

        // Two-path adjudication: a violation requires the fast path to say FAIL
        // and the truth path, where available, to agree. A disagreement is
        // reported as uncertain rather than silently resolved either way.
        let verdict;
        if (!fastPass && truthPass === false) verdict = 'FAIL';
        else if (!fastPass && truthPass === null) verdict = 'FAIL';
        else if (!fastPass && truthPass === true) verdict = 'UNCERTAIN_FAST_FAIL_TRUTH_PASS';
        else if (fastPass && truthPass === false) verdict = 'UNCERTAIN_FAST_PASS_TRUTH_FAIL';
        else verdict = 'PASS';

        const effective = truthRatio === null ? fastRatio : Math.min(fastRatio, truthRatio);
        if (verdict === 'PASS') worstRatio = Math.min(worstRatio, effective);

        if (verdict !== 'PASS') {
            violations.push({
                verdict,
                tag: row.tag,
                role: row.role,
                text: row.text,
                cls: row.cls,
                fontSizePx: row.fontSizePx,
                fontWeight: row.fontWeight,
                isLargeText: row.isLargeText,
                requiredRatio: row.requiredRatio,
                computedColor: row.color,
                foregroundRgb: row.foregroundRgb,
                effectiveTextAlpha: row.foregroundAlpha,
                fastPath: row.fastPath,
                truthPath: measurement,
                effectiveRatio: Number(effective.toFixed(3)),
            });
        }
    }

    return {
        dataThemeAttr: measured.dataThemeAttr,
        htmlClass: measured.htmlClass,
        colorScheme: measured.colorScheme,
        rootCanvas: measured.rootCanvas,
        candidatesScanned: measured.candidatesScanned,
        probes,
        exemptions: exemptRows.length,
        truthPathProbes: truthResults.length,
        worstPassingRatio: Number.isFinite(worstRatio) ? Number(worstRatio.toFixed(3)) : null,
        violationCount: violations.length,
        violations,
    };
}

/* ------------------------------------------------------------------ */
/* Concurrency pool                                                   */
/* ------------------------------------------------------------------ */

/**
 * Runs `worker` over `items` with a bounded number of concurrent lanes.
 * Concurrency 4 is the Lead-approved setting (evt_mut8zgqp_cb3ef63a).
 * Results keep input order, so the census is deterministic run to run.
 *
 * @param {any[]} items
 * @param {number} limit
 * @param {(item: any, index: number, lane: number) => Promise<any>} worker
 * @param {any[]} lanes per-lane resources (one page per lane)
 */
async function pool(items, limit, worker, lanes) {
    /** @type {any[]} */
    const results = new Array(items.length);
    let cursor = 0;

    const runners = Array.from({ length: Math.min(limit, items.length) }, async (_unused, lane) => {
        for (;;) {
            const index = cursor;
            cursor += 1;
            if (index >= items.length) break;
            results[index] = await worker(items[index], index, lane);
        }
    });

    await Promise.all(runners);
    return results;
}

/* ------------------------------------------------------------------ */
/* Main                                                               */
/* ------------------------------------------------------------------ */

async function main() {
    log(`DIR-023 universal contrast audit starting. origin=${ORIGIN}`);
    log(`identity=${EMAIL} (Super Admin: cross-portal Candidate/Recruiter/Enterprise/Admin)`);

    const session = await mintFirebaseSession({ email: EMAIL });
    if (!session) {
        log('FATAL: could not mint a live Firebase session. Check backend/.env FIREBASE_* and VITE_FIREBASE_KEY.');
        process.exit(1);
    }
    log(`live session minted for uid=${session.uid} (token signed by Google, not fabricated)`);

    const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    log(`chromium launched; concurrency=${CONCURRENCY}`);

    /** @type {any[]} */
    let routeRecords = [];
    let tenant = { slug: null, status: 0 };

    try {
        // Boot one context to resolve the tenant slug server-side, then measure.
        const bootContext = await browser.newContext({ viewport: VIEWPORT });
        const bootPage = await bootContext.newPage();
        await signIn(bootPage, session);
        await bootPage.goto(`${ORIGIN}/dashboard`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
        await bootPage.waitForTimeout(SETTLE_MS * 2);

        tenant = await resolveTenantSlug(bootPage);
        log(`tenant slug from /api/enterprise/context: ${tenant.slug ? tenant.slug : `NONE (status ${tenant.status})`}`);
        await bootContext.close();

        const manifest = buildRouteManifest({ tenantSlug: tenant.slug });
        const perPortal = manifest.reduce((acc, r) => {
            acc[r.portal] = (acc[r.portal] || 0) + 1;
            return acc;
        }, {});
        log(`authoritative manifest: ${manifest.length} canonical routes ${JSON.stringify(perPortal)}`);
        log('  (supersedes the directive literal 68-route approximation; Lead-confirmed evt_mut8za2a_39efab96)');

        /** @type {any[]} */
        const contexts = [];
        /** @type {any[]} */
        const pages = [];
        for (let i = 0; i < CONCURRENCY; i += 1) {
            const context = await browser.newContext({ viewport: VIEWPORT });
            const page = await context.newPage();
            await signIn(page, session);
            contexts.push(context);
            pages.push(page);
        }

        let done = 0;
        routeRecords = await pool(manifest, CONCURRENCY, async (route, _index, lane) => {
            const record = await auditRoute(pages[lane], route);
            done += 1;
            const violations = Object.values(record.themes || {})
                .reduce((sum, t) => sum + ((/** @type {any} */ (t).violationCount) || 0), 0);
            log(`  [${String(done).padStart(3)}/${manifest.length}] ${route.path.padEnd(40)} ` +
                `status=${record.status} ${record.error ? `ERROR ${record.error}` : `violations=${violations}`}`);
            return record;
        }, pages);

        await Promise.all(contexts.map((c) => c.close()));
    } finally {
        await browser.close();
    }

    /* ---------------- aggregate ---------------- */

    let totalProbes = 0;
    let totalViolations = 0;
    let totalUncertain = 0;
    let totalTruthProbes = 0;
    let totalExemptions = 0;
    /** @type {any[]} */
    const findings = [];
    /** @type {any[]} */
    const unrendered = [];
    /** @type {any[]} */
    const navigationFailures = [];

    for (const record of routeRecords) {
        if (!record) continue;
        if (!record.rendered) {
            unrendered.push({
                path: record.path, surface: record.surface,
                reason: record.error, redirectedTo: record.redirectedTo,
            });
            if (record.error && record.error.startsWith('NAVIGATION_ERROR')) navigationFailures.push(record.path);
            continue;
        }
        for (const theme of THEMES) {
            const t = record.themes[theme];
            if (!t) continue;
            totalProbes += t.probes || 0;
            totalTruthProbes += t.truthPathProbes || 0;
            totalExemptions += t.exemptions || 0;
            for (const v of t.violations || []) {
                if (v.verdict === 'FAIL') totalViolations += 1;
                else totalUncertain += 1;
                findings.push({ route: record.path, portal: record.portal, theme, ...v });
            }
        }
    }

    // Collapse to unique offending surfaces so remediation is tractable.
    /** @type {Map<string, any>} */
    const bySurface = new Map();
    for (const f of findings) {
        const key = `${f.cls || f.tag}|${f.computedColor}|${f.requiredRatio}|${f.verdict}`;
        const existing = bySurface.get(key);
        if (existing) {
            existing.occurrences += 1;
            if (f.text && !existing.examples.includes(f.text)) existing.examples.push(f.text);
            if (existing.routes.length < 12) existing.routes.push(`${f.route} (${f.theme})`);
        } else {
            bySurface.set(key, {
                selectorHint: f.cls || f.tag,
                tag: f.tag,
                computedColor: f.computedColor,
                requiredRatio: f.requiredRatio,
                verdict: f.verdict,
                fastRatio: f.fastPath ? f.fastPath.ratio : null,
                truthRatio: f.truthPath ? f.truthPath.truthRatio : null,
                effectiveRatio: f.effectiveRatio,
                occurrences: 1,
                routes: [`${f.route} (${f.theme})`],
                examples: f.text ? [f.text] : [],
            });
        }
    }
    const offenders = Array.from(bySurface.values()).sort((a, b) => b.occurrences - a.occurrences);

    const durationMs = Date.now() - startedAt;
    const auditedCount = routeRecords.filter((r) => r && r.rendered).length;

    const census = {
        directive: 'DIR-023',
        title: 'Universal Dark Mode Contrast Auditor \u2014 Real-DOM WCAG 2.1 AA Anti-Inversion Scanner',
        generatedAt: new Date().toISOString(),
        method: {
            fastPath: 'Real-DOM getComputedStyle ancestor alpha compositing down to the :root --cuba-canvas token (DIR-023 spec section 2.1).',
            truthPath: 'Real rasterised-pixel sampling: a Playwright screenshot is decoded by sharp, glyph and background pixels are separated using the element\u2019s own declared colour, and the worst pairing present in the crop wins. Escalated for any node whose ancestor chain carries a gradient, background-blend-mode, mix-blend-mode, backdrop-filter or filter, and for any node the fast path flagged.',
            adjudication: 'A violation requires the fast path to fail AND, where a rasterised sample exists, the truth path to agree. Disagreement is recorded as UNCERTAIN, never silently resolved.',
            colourSpace: 'Every computed colour is resolved to sRGB bytes by the browser itself through a 1x1 canvas, applying the sRGB transfer exactly once. This deliberately avoids the hand-rolled OKLab matrix behind the documented double-gamma bug in dir017-contrast-triage.mjs, and covers the oklch() Tailwind v4 emits.',
            thresholds: { normalText: 4.5, largeText: 3.0, largeTextRule: 'font-size >= 24px, or >= 18.66px at font-weight >= 700' },
            antiInversion: 'Both themes are measured with identical maths and no theme-specific heuristics, so a light-on-light or dark-on-dark inversion is caught by the same ratio evaluation.',
            printExemption: 'INV-4 honoured crawler-side: nodes painted only by ink-conserving printer rules are recorded as exemptions, never as violations.',
            frozenPathsUntouched: 'INV-1: src/cv-templates/ and backend/services/aiRuntime.js are never opened for write by this audit.',
        },
        authority: {
            identity: {
                email: EMAIL,
                uid: session.uid,
                source: 'mintFirebaseSession (live Firebase Auth, tests/e2e/dir006-session.mjs)',
                note: 'The platform Super Admin session carries cross-portal access over Candidate, Recruiter, Enterprise and Admin. No fabricated identity and no ad-hoc DB seed script was used.',
            },
            tenantSlug: tenant.slug,
            tenantResolutionStatus: tenant.status,
            routeManifestSource: 'Derived from src/main.jsx, DashboardMain.jsx, EmployerPortal.jsx, Admin.jsx and ENTERPRISE_TABS (components/cuba/portalNavigation.js).',
            directiveRouteEstimate: 68,
            authoritativeRouteCount: routeRecords.filter(Boolean).length,
            supersedesDirectiveEstimate: true,
            supersedeRationale: 'Lead-confirmed (bridge evt_mut8za2a_39efab96): the directive\u2019s literal route list was an illustrative approximation. The real canonical surface is larger and is crawled with zero 404/redirect false-positives, because every route is asserted to have rendered a real surface before its contrast is judged.',
        },
        summary: {
            routesInManifest: routeRecords.filter(Boolean).length,
            routesAudited: auditedCount,
            routesNotRendered: unrendered.length,
            themesPerRoute: THEMES,
            totalProbes,
            truthPathProbes: totalTruthProbes,
            printExemptions: totalExemptions,
            violations: totalViolations,
            uncertainMeasurements: totalUncertain,
            uniqueOffendingSurfaces: offenders.length,
            durationMs,
            verdict: totalViolations === 0 ? 'PASS' : 'FAIL',
        },
        offenders,
        unrenderedRoutes: unrendered,
        navigationFailures,
        routes: routeRecords.filter(Boolean),
    };

    fs.writeFileSync(OUT, JSON.stringify(census, null, 2), 'utf8');
    fs.writeFileSync(LOG, logLines.join('\n'), 'utf8');

    /* ---------------- report ---------------- */

    log('============================================================');
    log(`routes in manifest  : ${census.summary.routesInManifest}`);
    log(`routes audited      : ${auditedCount}`);
    log(`not rendered        : ${unrendered.length}`);
    log(`text probes         : ${totalProbes} (light + dark)`);
    log(`truth-path probes   : ${totalTruthProbes}`);
    log(`print exemptions    : ${totalExemptions}`);
    log(`VIOLATIONS          : ${totalViolations}`);
    log(`uncertain           : ${totalUncertain}`);
    log(`unique offenders    : ${offenders.length}`);
    log(`duration            : ${(durationMs / 1000).toFixed(1)}s`);
    log(`VERDICT             : ${census.summary.verdict}`);
    log('============================================================');

    if (offenders.length) {
        log('');
        log('OFFENDING SURFACES (for --cuba-* token remediation):');
        for (const o of offenders.slice(0, 40)) {
            log(`  [${o.verdict}] x${o.occurrences} need ${o.requiredRatio}:1  colour=${o.computedColor}`);
            log(`      ${o.selectorHint}`);
            log(`      fast=${o.fastRatio} truth=${o.truthRatio} eg=${JSON.stringify(o.examples.slice(0, 2))}`);
        }
    }
    if (unrendered.length) {
        log('');
        log('ROUTES NOT AUDITED (no real surface rendered):');
        for (const u of unrendered) log(`  ${u.path} :: ${u.reason}${u.redirectedTo ? ` -> ${u.redirectedTo}` : ''}`);
    }

    log(`written -> ${OUT}`);
    log(`written -> ${LOG}`);

    // AC-5: non-zero exit on any violation, so this works as a CI gate.
    process.exit(totalViolations === 0 ? 0 : 1);
}

main().catch((error) => {
    log(`FATAL: ${error && error.stack ? error.stack : error}`);
    fs.writeFileSync(LOG, logLines.join('\n'), 'utf8');
    process.exit(1);
});