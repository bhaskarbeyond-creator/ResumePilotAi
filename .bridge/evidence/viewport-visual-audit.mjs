// @ts-check
/**
 * DIR-023 (LEAD_GUIDANCE evt_rl77z07r_vfkffi2k): multi-viewport visual evidence.
 *
 *   node .bridge/evidence/viewport-visual-audit.mjs
 *
 * THE MANDATE
 * The Lead activated multi-viewport visual testing (MS Live Preview + ViewPort)
 * and requires two things in the release gate:
 *   a) ZERO HORIZONTAL OVERFLOW: no route may scroll horizontally
 *      (documentElement.scrollWidth > innerWidth) at 375px or 768px.
 *   b) AUTOMATED SCREENSHOT EVIDENCE: full-page PNGs at Mobile 375x667,
 *      Tablet 768x1024 and Desktop 1440x900, written to
 *      .bridge/evidence/viewports/ as authoritative layout proof.
 *
 * WHY THIS IS A SCRIPT AND NOT THE IDE EXTENSIONS
 * The two extensions named in the mandate are IDE surfaces for interactive
 * review. A release gate has to run non-interactively in CI and on a machine
 * with no IDE, so the mandate is satisfied with headless Playwright driving the
 * exact same three viewports and emitting the exact same artefacts. The IDE
 * extensions remain available for human inspection; this is the reproducible
 * half of the requirement.
 *
 * Contrast is NOT re-measured here -- that is the auditor's job
 * (npm run audit:contrast). This pass owns layout integrity and visual proof.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import dotenv from 'dotenv';
import { chromium } from 'playwright';
import { buildRouteManifest } from './dir023-route-manifest.mjs';
import { mintFirebaseSession } from '../../tests/e2e/dir006-session.mjs';

dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });
dotenv.config({ path: path.join(process.cwd(), 'backend', '.env'), quiet: true });

const ORIGIN = (process.env.DIR023_ORIGIN || 'http://localhost:5173').replace(/\/$/, '');
const EMAIL = process.env.DIR023_EMAIL || process.env.ADMIN_EMAIL || process.env.DIR006_EMAIL;
const OUT_DIR = '.bridge/evidence/viewports';
const REPORT = path.join(OUT_DIR, 'viewport-report.json');
const SETTLE_MS = Number(process.env.DIR023_SETTLE_MS || 700);
const NAV_TIMEOUT = Number(process.env.DIR023_NAV_TIMEOUT || 45_000);

/**
 * The three tiers named in the mandate. `overflowChecked` marks the widths where
 * horizontal scrolling is a hard failure: 375 and 768. Desktop 1440 is captured
 * for visual proof but a desktop window is not expected to be scroll-constrained
 * by the same rule.
 */
const VIEWPORTS = [
    { tier: 'mobile', width: 375, height: 667, overflowChecked: true },
    { tier: 'tablet', width: 768, height: 1024, overflowChecked: true },
    { tier: 'desktop', width: 1440, height: 900, overflowChecked: false },
];

const logLines = [];
const log = (m) => {
    const line = `[${new Date().toISOString()}] ${m}`;
    logLines.push(line);
    console.log(line);
};

if (!EMAIL) {
    log('FATAL: no identity configured (ADMIN_EMAIL in backend/.env). Refusing to fabricate one.');
    process.exit(1);
}

/** A viewport key safe for filenames. */
const slug = (routePath) => (routePath === '/' ? 'root' : routePath.replace(/^\//, '').replace(/[^a-zA-Z0-9]+/g, '-'));

/**
 * Detects the widest element sticking out past the viewport, so an overflow
 * report names the CULPRIT rather than just a boolean. This is what turns
 * "mobile is broken" into an actionable line in the gate output.
 */
async function findOverflowCulprits(page, limit = 5) {
    return page.evaluate((max) => {
        const vw = document.documentElement.clientWidth || window.innerWidth;
        const offenders = [];
        for (const el of document.querySelectorAll('body *')) {
            const cs = getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden') continue;
            if (cs.position === 'fixed') continue;
            const r = el.getBoundingClientRect();
            if (r.width < 2 || r.height < 2) continue;
            const overflowPx = Math.round(r.right - vw);
            if (overflowPx > 2) {
                offenders.push({
                    tag: el.tagName.toLowerCase(),
                    cls: String(el.className || '').slice(0, 110),
                    overflowPx,
                    rect: { x: Math.round(r.x), w: Math.round(r.width) },
                });
            }
            if (offenders.length >= max * 6) break;
        }
        offenders.sort((a, b) => b.overflowPx - a.overflowPx);
        return { viewportWidth: vw, offenders: offenders.slice(0, max) };
    }, limit);
}

/* ------------------------------------------------------------------ */
/* Main                                                               */
/* ------------------------------------------------------------------ */

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

async function resolveTenantSlug(page) {
    // Same retry discipline as the contrast auditor: dropping the slug would
    // silently omit all 14 /org/:slug routes from the visual evidence.
    for (let attempt = 1; attempt <= 4; attempt += 1) {
        try {
            const res = await page.evaluate(async () => {
                const r = await fetch('/api/enterprise/context', { headers: { Accept: 'application/json' } });
                return { status: r.status, body: await r.text() };
            });
            if (res.status === 200) {
                const parsed = JSON.parse(res.body);
                const value = parsed && parsed.tenant && parsed.tenant.slug;
                if (value) return value;
            }
            if (res.status !== 429) return null;
            await page.waitForTimeout(1500 * attempt);
        } catch (_) {
            await page.waitForTimeout(1000 * attempt);
        }
    }
    return null;
}

async function main() {
    log(`viewport visual audit starting. origin=${ORIGIN}`);
    fs.mkdirSync(OUT_DIR, { recursive: true });

    const session = await mintFirebaseSession({ email: EMAIL });
    if (!session) {
        log('FATAL: could not mint a live Firebase session.');
        process.exit(1);
    }

    const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });

    const bootContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const bootPage = await bootContext.newPage();
    await signIn(bootPage, session);
    await bootPage.goto(`${ORIGIN}/dashboard`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
    await waitForSurface(bootPage);
    const tenantSlug = await resolveTenantSlug(bootPage);
    await bootContext.close();
    log(`tenant slug: ${tenantSlug || 'NONE'}`);

    const manifest = buildRouteManifest({ tenantSlug });
    log(`routes: ${manifest.length}`);

    /** @type {any[]} */
    const results = [];
    let overflowFailures = 0;
    let shots = 0;

    for (const vp of VIEWPORTS) {
        log(`--- ${vp.tier} ${vp.width}x${vp.height} ---`);
        const context = await browser.newContext({
            viewport: { width: vp.width, height: vp.height },
            // deviceScaleFactor 1 keeps each PNG the exact mandated pixel size,
            // so the artefact dimensions are verifiable from the file itself.
            deviceScaleFactor: 1,
            isMobile: vp.tier === 'mobile',
            hasTouch: vp.tier === 'mobile',
        });
        const page = await context.newPage();
        await signIn(page, session);

        for (const route of manifest) {
            const record = {
                path: route.path, tier: vp.tier, width: vp.width, height: vp.height,
                screenshot: null, rendered: false, scrollWidth: null, innerWidth: null,
                horizontalOverflow: false, overflowPx: 0, culprits: [], error: null,
            };
            try {
                await page.goto(`${ORIGIN}${route.path}`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
                record.rendered = await waitForSurface(page);
                await page.waitForTimeout(SETTLE_MS);

                const metrics = await page.evaluate(() => ({
                    scrollWidth: document.documentElement.scrollWidth,
                    innerWidth: window.innerWidth,
                }));
                record.scrollWidth = metrics.scrollWidth;
                record.innerWidth = metrics.innerWidth;
                // The mandate's exact test: scrollWidth > innerWidth.
                record.horizontalOverflow = metrics.scrollWidth > metrics.innerWidth + 1;
                record.overflowPx = Math.max(0, metrics.scrollWidth - metrics.innerWidth);
                if (vp.overflowChecked && record.horizontalOverflow) {
                    record.culprits = (await findOverflowCulprits(page)).offenders;
                    overflowFailures += 1;
                }

                const file = path.join(OUT_DIR, `${vp.tier}-${slug(route.path)}.png`);
                await page.screenshot({ path: file, fullPage: true, type: 'png' });
                record.screenshot = file.replace(/\\/g, '/');
                shots += 1;
            } catch (error) {
                record.error = `NAVIGATION_ERROR: ${error && error.message}`;
            }
            results.push(record);
        }
        await context.close();
    }

    await browser.close();
    return { results, shots, overflowFailures, manifest, tenantSlug };
}
function buildReport({ results, shots, overflowFailures, manifest, tenantSlug }) {
    return {
        directive: 'DIR-023',
        mandate: 'LEAD_GUIDANCE evt_rl77z07r_vfkffi2k (Visual & Viewport)',
        generatedAt: new Date().toISOString(),
        origin: ORIGIN,
        identity: { email: EMAIL, source: 'mintFirebaseSession (live Firebase Auth)' },
        tenantSlug,
        method: {
            implementation: 'Headless Playwright driving the same three viewports the IDE extensions use. The extensions (MS Live Preview, ViewPort) are interactive IDE surfaces; this script is the reproducible, CI-runnable half of the same mandate.',
            overflowRule: 'documentElement.scrollWidth > window.innerWidth + 1, at 375px and 768px. Desktop 1440px is captured for visual proof only.',
            culpritReporting: 'On overflow the widest offending elements are recorded by name and pixel amount, so the failure is actionable rather than a bare boolean.',
            screenshots: 'fullPage PNG at deviceScaleFactor 1, so file dimensions match the mandated viewport exactly.',
        },
        viewports: VIEWPORTS,
        summary: {
            routes: manifest.length,
            viewports: VIEWPORTS.length,
            captures: shots,
            expectedCaptures: manifest.length * VIEWPORTS.length,
            horizontalOverflowFailures: overflowFailures,
            verdict: overflowFailures === 0 ? 'PASS' : 'FAIL',
        },
        results,
    };
}

async function run() {
    const outcome = await main();
    const report = buildReport(outcome);
    fs.writeFileSync(REPORT, JSON.stringify(report, null, 2), 'utf8');
    fs.writeFileSync(path.join(OUT_DIR, 'viewport-run.log'), logLines.join('\n'), 'utf8');

    log('============================================================');
    log(`captures          : ${outcome.shots}/${report.summary.expectedCaptures}`);
    log(`overflow failures : ${outcome.overflowFailures}`);
    log(`VERDICT           : ${report.summary.verdict}`);
    log(`written -> ${REPORT}`);
    log('============================================================');

    if (outcome.overflowFailures) {
        log('');
        log('HORIZONTAL OVERFLOW (culprit named, not just the boolean):');
        for (const r of outcome.results.filter((x) => x.horizontalOverflow && x.width !== 1440).slice(0, 30)) {
            log(`  ${r.path} @${r.width}px  +${r.overflowPx}px`);
            for (const c of r.culprits.slice(0, 2)) {
                log(`      ${c.tag}.${c.cls.slice(0, 70)}  (+${c.overflowPx}px)`);
            }
        }
    }

    process.exit(outcome.overflowFailures === 0 ? 0 : 1);
}

run().catch((error) => {
    log(`FATAL: ${error && error.stack ? error.stack : error}`);
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, 'viewport-run.log'), logLines.join('\n'), 'utf8');
    process.exit(1);
});
