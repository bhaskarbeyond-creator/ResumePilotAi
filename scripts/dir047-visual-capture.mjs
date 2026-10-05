// @ts-check
/**
 * DIR-047 Vector 6 + plan step 7 -- 4-portal x 5-breakpoint x 2-theme PNG census.
 *
 * WHY THIS RUNNER EXISTS
 *   The certified Playwright suite proves the portals render and do not collide, but it
 *   retains no pixels: playwright.dir047.config.js sets `screenshot: 'only-on-failure'`,
 *   so a green run leaves zero image artifacts. The approved plan asks for something
 *   specific -- "crawl the live DOM across all 4 portals at all 5 breakpoints in both
 *   Light and Dark themes and retain PNG plus JSON census artifacts" -- which a reporter
 *   that only saves images when something breaks cannot satisfy.
 *
 * TWO PASSES, ON PURPOSE
 *   Every shot is captured TWICE: pass A into `baseline/`, pass B into `current/`. That is
 *   not redundancy for its own sake. A pixel-diff gate is only meaningful if the surface it
 *   judges is REPRODUCIBLE, and the cheapest way to discover that a portal paints
 *   differently on consecutive visits (an animation that never settles, a clock, a
 *   randomised id) is to capture it twice and diff. A surface that is not reproducible
 *   would make every future visual-regression report untrustworthy, so the instability is
 *   measured here rather than later mistaken for a regression. Pass A doubles as the
 *   certified baseline a future directive can diff against; pass B is what
 *   scripts/dir047-visual-gate.mjs audits.
 *
 * DETERMINISM CONTROLS
 *   `animations: 'disabled'` freezes CSS animations, CSS transitions and Web Animations at
 *   capture time, and `reducedMotion: 'reduce'` asks the application for its own
 *   reduced-motion branch. Both are applied because neither alone covers everything
 *   framer-motion emits. A JavaScript rAF loop that writes pixels directly is the one class
 *   these controls cannot freeze; if such a surface exists, the gate names the exact shot
 *   that drifted instead of averaging it away.
 *
 * THE FIXTURE IS DELIBERATELY THE SAME SHAPE AS THE CERT SUITE'S
 *   A divergent fixture would make the shell render different data from the one AC-3/AC-4
 *   certified, and the disagreement would be invisible in the report. The route table below
 *   is therefore a faithful mirror of installApiFixture() in
 *   tests/e2e/universal-swot-uat.spec.js, including the same pagination envelope and the
 *   same superadmin handler for /api/enterprise/*, /api/platform/* and /api/admin/*.
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import {
    installAuthenticatedSession,
    viteFixtureDefines,
} from '../tests/helpers/enterprise-fixture.mjs';
import {
    createSuperAdminFixtureBackend,
    seedSuperAdminState,
} from '../tests/helpers/superadmin-fixture.mjs';

const EVIDENCE = path.resolve('.bridge/evidence');
const OUT_ROOT = path.join(EVIDENCE, 'dir047-portal-visual');
const PASS_A = path.join(OUT_ROOT, 'baseline');
const PASS_B = path.join(OUT_ROOT, 'current');
const CENSUS_PATH = path.join(EVIDENCE, 'dir047-portal-visual-crawl.json');

/** The directive's four portals. Slugs are filename-safe and stable across runs. */
const PORTALS = [
    { slug: 'candidate-dashboard', path: '/dashboard', settle: 1200 },
    { slug: 'recruiter-portal', path: '/employer', settle: 1200 },
    { slug: 'enterprise-console', path: '/org/northwind', settle: 1200 },
    { slug: 'platform-admin', path: '/admin/dashboard', settle: 1200 },
];

/** Vector 2's canonical breakpoints. Height is constant so width is the only variable. */
const BREAKPOINTS = [375, 768, 1024, 1280, 1920];
const HEIGHT = 900;
const THEMES = ['light', 'dark'];

/** Seeds the Cuba shell flag, resolves the privacy banner and forces the theme. */
function shellPrimer(theme) {
    return (mode) => {
        try {
            localStorage.setItem('ime365_cuba_shell_v2', 'cuba');
            localStorage.setItem('resumepilot_privacy_consent_v1', JSON.stringify({
                analytics: true, necessary: true, timestamp: Date.now(),
            }));
            localStorage.setItem('theme', mode);
        } catch (_) { /* storage-disabled browsers still render the shell */ }
    };
}

/** Serves the same contract shapes the certified suite serves. */
function installApiFixture(page, superAdminHandler) {
    const json = (route, body) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
    });
    const pagination = { totalItems: 0, totalPages: 1, currentPage: 1, hasNextPage: false, hasPreviousPage: false };

    return page.route('**/*', async (route) => {
        const { pathname } = new URL(route.request().url());
        if (!pathname.startsWith('/api/')) return route.fallback();

        if (pathname === '/api/platform/public-config') {
            return json(route, {
                success: true,
                systemHealth: { maintenanceMode: false, maintenanceMessage: '' },
                services: { database: 'OPERATIONAL', aiRouter: 'OPERATIONAL', payments: 'OPERATIONAL' },
            });
        }
        if (pathname === '/api/service-availability') {
            return json(route, {
                success: true,
                services: { database: 'OPERATIONAL', aiRouter: 'OPERATIONAL', payments: 'OPERATIONAL' },
                auth: { github: true, linkedin: true },
                payments: { stripe: true, paypal: true, razorpay: true },
                enterpriseTenancy: true,
                aiEngine: { operational: true, provider: 'dynamic-orchestrator', latencyMs: 220 },
            });
        }
        if (pathname === '/api/system-settings' || pathname === '/api/public/system-settings') {
            return json(route, { success: true, _settingsSource: 'mariadb-authoritative', modules: {} });
        }
        if (pathname.startsWith('/api/employer/jobs')) return json(route, { jobs: [] });
        if (pathname === '/api/employer/companies') return json(route, { companies: [] });
        if (pathname === '/api/employer/settings') {
            return json(route, { companyName: 'Northwind AI Systems', industry: 'Artificial Intelligence' });
        }
        if (pathname === '/api/jobs-data') return json(route, { success: true, jobs: [], pagination });
        if (pathname.startsWith('/api/resumes')) {
            return json(route, { success: true, resumes: [], allResumes: [], pagination });
        }
        if (pathname.startsWith('/api/covers')) return json(route, { success: true, covers: [] });
        if (pathname.startsWith('/api/users-data/')) {
            return json(route, {
                id: 'dir047-user', firstname: 'Jordan', lastname: 'Vance',
                role: 'SUPER_ADMIN', isEmployer: true, employerApproved: true,
            });
        }
        if (pathname === '/api/check-if-admin' || pathname.endsWith('/check-admin')) {
            return json(route, { isAdmin: true, success: true });
        }
        if (pathname.includes('/applications')) return json(route, { applications: [] });
        if (pathname.includes('/favourites')) return json(route, { favourites: [], jobs: [] });
        if (pathname === '/api/messages/conversations') return json(route, { conversations: [] });
        if (pathname.startsWith('/api/notifications-data')) return json(route, { notifications: [], unreadCount: 0 });
        if (pathname === '/api/platform/role-view-audit') return json(route, { success: true });
        if (pathname.startsWith('/api/enterprise/')) return superAdminHandler(route);
        if (pathname.startsWith('/api/platform/') || pathname.startsWith('/api/admin/')) return superAdminHandler(route);
        return json(route, { success: true });
    });
}


/** Waits until the tree is mounted and laid out, then two frames for paint to settle. */
async function settleRoute(page) {
    await page.waitForSelector('#root', { state: 'attached', timeout: 30_000 }).catch(() => {});
    await page.waitForFunction(() => {
        const root = document.getElementById('root');
        return Boolean(root) && root.childElementCount > 0;
    }, null, { timeout: 30_000 }).catch(() => {});
    await page.evaluate(() => new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
    }));
}

/**
 * Serialised into the browser, so it must be fully self-contained. The geometry it returns
 * is stored next to every PNG: a pixel diff can say a page LOOKS different but not what
 * broke, whereas overflowPx/overlayCount/textLength say what changed.
 */
function probeGeometry() {
    const de = document.documentElement;
    const overlays = Array.from(document.querySelectorAll('body *')).filter((el) => {
        const s = getComputedStyle(el);
        return s.position === 'fixed'
            && el.getBoundingClientRect().width >= window.innerWidth * 0.98
            && el.getBoundingClientRect().height >= window.innerHeight * 0.98;
    });
    const main = document.querySelector('main, [role="main"], #root');
    return {
        path: window.location.pathname,
        overflowPx: de.scrollWidth - de.clientWidth,
        overlayCount: overlays.length,
        textLength: ((main && main.innerText) || '').trim().length,
        childCount: main ? main.querySelectorAll('*').length : 0,
        theme: de.getAttribute('data-theme') || (de.classList.contains('dark') ? 'dark' : 'light'),
    };
}

/** Captures one full sweep of 4 portals x 5 breakpoints x 2 themes into `dir`. */
async function capturePass({ label, dir, browser, base, identity, apiHandler }) {
    fs.mkdirSync(dir, { recursive: true });
    const shots = [];

    for (const theme of THEMES) {
        const context = await browser.newContext({
            viewport: { width: 1280, height: HEIGHT },
            deviceScaleFactor: 1,
            reducedMotion: 'reduce',
        });
        await context.addInitScript(shellPrimer(theme), theme);

        const page = await context.newPage();
        await installAuthenticatedSession(page, identity);
        await installApiFixture(page, apiHandler);

        for (const breakpoint of BREAKPOINTS) {
            await page.setViewportSize({ width: breakpoint, height: HEIGHT });

            for (const portal of PORTALS) {
                await page.goto(`${base}${portal.path}`, { waitUntil: 'domcontentloaded' });
                await settleRoute(page);
                await page.waitForTimeout(portal.settle);

                const file = `${portal.slug}__${breakpoint}x${HEIGHT}.png`;
                const abs = path.join(dir, theme, file);
                fs.mkdirSync(path.dirname(abs), { recursive: true });

                await page.screenshot({
                    path: abs,
                    fullPage: false,
                    animations: 'disabled',
                    caret: 'hide',
                });

                shots.push({
                    pass: label,
                    theme,
                    breakpoint,
                    portal: portal.slug,
                    requestedPath: portal.path,
                    file: path.relative(EVIDENCE, abs).replace(/\\/g, '/'),
                    bytes: fs.statSync(abs).size,
                    geometry: await page.evaluate(probeGeometry),
                });

                console.log(`  [${label}] ${theme}/${breakpoint}px ${portal.slug} -> ${shots[shots.length - 1].bytes} B`);
            }
        }

        await context.close();
    }

    return shots;
}

/** Boots Vite + Chromium, runs both passes and writes the JSON census. */
async function main() {
    const started = Date.now();
    console.log('DIR-047 Vector 6/7 -- 4-portal x 5-breakpoint x 2-theme PNG census');

    const superAdminHandler = createSuperAdminFixtureBackend(
        Object.assign(seedSuperAdminState(), { status: 'HEALTHY', healthScore: 98 }),
    );

    const vite = await createServer({
        server: { port: 0, host: '127.0.0.1', strictPort: false },
        logLevel: 'error',
        define: viteFixtureDefines(),
    });
    const server = await vite.listen();
    const base = `http://127.0.0.1:${server.config.server.port}`;
    console.log(`vite ready at ${base}`);

    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });

    try {
        const identity = {
            uid: 'dir047-visual-user',
            email: 'visual.owner@ime365.com',
            displayName: 'Visual Owner',
            claims: { role: 'SUPER_ADMIN', superAdmin: true, admin: true, permissions: ['*'] },
        };

        const shotsA = await capturePass({ label: 'A', dir: PASS_A, browser, base, identity, apiHandler: superAdminHandler });
        const shotsB = await capturePass({ label: 'B', dir: PASS_B, browser, base, identity, apiHandler: superAdminHandler });

        const census = {
            directive: 'DIR-047',
            vectors: ['Vector 2 (responsive geometry)', 'Vector 6 (pure Node visual diffing)', 'plan step 7 (PNG + JSON artifacts)'],
            generatedAt: new Date().toISOString(),
            durationMs: Date.now() - started,
            engine: 'scripts/dir047-visual-capture.mjs',
            base,
            determinismControls: ['animations:disabled', 'reducedMotion:reduce', 'deviceScaleFactor:1'],
            fixtureParity: 'mirrors installApiFixture() of tests/e2e/universal-swot-uat.spec.js',
            portals: PORTALS.map((p) => p.path),
            breakpoints: BREAKPOINTS,
            themes: THEMES,
            viewportHeight: HEIGHT,
            shotCount: shotsA.length + shotsB.length,
            shotCountPerPass: shotsA.length,
            baselineDir: path.relative(EVIDENCE, PASS_A).replace(/\\/g, '/'),
            currentDir: path.relative(EVIDENCE, PASS_B).replace(/\\/g, '/'),
            shots: [...shotsA, ...shotsB],
        };

        fs.writeFileSync(CENSUS_PATH, JSON.stringify(census, null, 2), 'utf8');
        console.log(`\ncensus -> ${path.relative(process.cwd(), CENSUS_PATH)}`);
        console.log(`shots  -> ${census.shotCount} (${census.shotCountPerPass} per pass)`);
        console.log(`elapsed: ${((Date.now() - started) / 1000).toFixed(1)}s`);
    } finally {
        await browser.close().catch(() => {});
        await vite.close().catch(() => {});
    }
}

main().catch((err) => {
    console.error('FATAL:', err);
    process.exitCode = 1;
});

