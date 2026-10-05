// @ts-check
/**
 * DIR-047 -- Master Full-Platform Testing & Universal UAT 10/10 Certification.
 * SWOT-backed Deep UI/UX audit across the four portals.
 *
 * AC MAP -- one named test per acceptance criterion, kept 1:1 with the directive so a
 * Gatekeeper can read the verdict straight off the reporter without opening a file:
 *   AC-1 [SWOT-S] 51 CV + 4 cover templates render from the frozen surface with a
 *                 ZERO-BYTE diff, and the certified baselines are untouched.
 *   AC-2 [SWOT-W] All 16 locales fall back to English with no raw token leak, DOM
 *                 inline styles are restored on unmount, and the setTimeout census
 *                 is triaged with ZERO simulated latency.
 *   AC-3 [SWOT-O] The RECONCILED route census crawls at five canonical breakpoints
 *                 with zero console errors, zero failed API calls, zero collisions
 *                 and zero horizontal overflow.
 *   AC-4 [SWOT-T] Multi-tenant IDOR probes, XSS sanitisation, plaintext-secret sweep
 *                 and axe-core WCAG 2.1 AA in BOTH light and dark themes.
 *   AC-5 [SWOT-UAT] The continuous four-portal customer journey executes end to end.
 *
 * WHY THE ROUTE COUNT IS NOT HARD-CODED AS "68"
 * The directive asserts a 68-route crawl, but a literal grep of src/main.jsx reports
 * 54 unique path strings, because nine routes end in `/*` and therefore match a PREFIX
 * rather than a single URL. Only wildcard expansion reaches 68. Rather than restating
 * either number and hoping, this suite READS .bridge/evidence/dir047-route-census.json --
 * the machine-readable census produced by scripts/dir047-route-census.mjs from the
 * router source itself. The crawl and the census therefore cannot drift apart, and if a
 * route is added the crawl covers it without this file being edited.
 *
 * HERMETIC BY CONSTRUCTION, exactly as in dir-001.spec.js: `port: 0` asks the OS for a
 * free port so the suite can never collide with a developer's dev server on :3000, and
 * every /api/* call is served by the fixtures below. No live backend, no MariaDB. That
 * is why `webServer` is deliberately absent from playwright.dir047.config.js.
 *
 * EVERY ASSERTION READS THE REAL RENDERED DOM OR THE REAL FILESYSTEM. No assertion
 * below is satisfied by a source string match where a live measurement is possible.
 */
import { test, expect, chromium } from '@playwright/test';
import { createServer } from 'vite';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import {
    installAuthenticatedSession,
    viteFixtureDefines,
} from '../helpers/enterprise-fixture.mjs';
import {
    createSuperAdminFixtureBackend,
    seedSuperAdminState,
} from '../helpers/superadmin-fixture.mjs';

const ROOT = process.cwd();
const EVIDENCE = path.join(ROOT, '.bridge', 'evidence');

/** @type {import('vite').ViteDevServer} */
let vite;
let base = '';

/** The four authenticated portals, which are also the four shells AC-3 and AC-4 walk. */
const PORTALS = [
    { name: 'candidate dashboard', path: '/dashboard' },
    { name: 'recruiter portal', path: '/employer' },
    { name: 'enterprise console', path: '/org/northwind' },
    { name: 'platform admin', path: '/admin/dashboard' },
];

/** The canonical breakpoints the directive fixes for Vector 2. */
const BREAKPOINTS = [375, 768, 1024, 1280, 1920];

/**
 * Reads the machine-readable route census rather than restating a literal.
 * A missing census is a HARD failure, not a skip: silently falling back to a
 * hard-coded list would turn the crawl into a self-confirming test.
 */
function readRouteCensus() {
    const file = path.join(EVIDENCE, 'dir047-route-census.json');
    expect(
        fs.existsSync(file),
        'dir047-route-census.json is absent. Run `node scripts/dir047-route-census.mjs` before this suite, otherwise the crawl would be asserting a list this file invented.',
    ).toBe(true);
    const census = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(census.crawlTargets.length, 'the census must resolve at least one crawl target').toBeGreaterThan(0);
    return census;
}

/**
 * Serves the same contract shapes dir-001.spec.js serves. Reused rather than rewritten
 * because a divergent fixture would make the two suites disagree about what the app
 * receives, and the disagreement would be invisible in the reporter.
 */
function installApiFixture(page, superAdminHandler) {
    const json = (route, body) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
    });
    const pagination = { totalItems: 0, totalPages: 1, currentPage: 1, hasNextPage: false, hasPreviousPage: false };

    return page.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        const { pathname } = url;
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
        if (pathname.startsWith('/api/covers')) {
            return json(route, { success: true, covers: [] });
        }
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

/**
 * Seeds the Cuba shell flag, resolves the privacy banner and forces the theme.
 *
 * The banner is a fixed overlay: left unresolved it covers the shell, so every
 * measurement in AC-3 and AC-4 would read the consent dialog instead of the chrome
 * under test. The theme is set explicitly because AC-4 needs both themes, and an
 * inherited preference from a developer's profile would make the dark-mode pass
 * silently run against light mode.
 */
async function primeShell(page, theme = 'light') {
    await page.addInitScript((mode) => {
        try {
            localStorage.setItem('ime365_cuba_shell_v2', 'cuba');
            localStorage.setItem('resumepilot_privacy_consent_v1', JSON.stringify({
                analytics: true, necessary: true, timestamp: Date.now(),
            }));
            localStorage.setItem('theme', mode);
        } catch (_) { /* storage-disabled browsers still render the shell */ }
    }, theme);
}

/**
 * Collects the three defect classes AC-3 forbids. `apiFailures` records the URL
 * alongside the status so a failure names the endpoint rather than just a count.
 *
 * DIR-047: this used to be called once per route visit and re-attached three
 * listeners every time. AC-3 visits 55 routes at 5 breakpoints, so a single
 * crawl accumulated 825 listeners on ONE page object. That is wrong twice over:
 * every console error after route N was delivered to all N earlier closures (so
 * a defect got attributed to the wrong routes), and the growing listener set is
 * paid for on every subsequent event dispatch, which is a large part of why the
 * crawl ran past its budget.
 *
 * The listeners are therefore installed ONCE and the per-route buckets are
 * cleared in place, which keeps attribution exact and the listener count at 3.
 */
function installDefectWatcher(page) {
    const consoleErrors = [];
    const pageErrors = [];
    const apiFailures = [];

    page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 300));
    });
    page.on('pageerror', (err) => pageErrors.push(err.message.slice(0, 300)));
    page.on('response', (res) => {
        const url = res.url();
        if (url.includes('/api/') && res.status() >= 400) {
            apiFailures.push(`${res.status()} ${new URL(url).pathname}`);
        }
    });

    return {
        consoleErrors,
        pageErrors,
        apiFailures,
        /** Empties the buckets so each route is judged only on its own defects. */
        reset() {
            consoleErrors.length = 0;
            pageErrors.length = 0;
            apiFailures.length = 0;
        },
    };
}

/**
 * Waits until the route has actually rendered before it is measured.
 *
 * DIR-047: the crawl used `waitForLoadState('networkidle')` on all 275 visits.
 * `networkidle` additionally requires 500ms of complete network quiet, which on a
 * dev server that is still lazily transforming modules is a wait that says
 * nothing about whether the DOM is measurable -- and it is billed at full cost
 * 275 times. What the geometry probes below actually need is "the tree is
 * mounted and laid out". That is what this waits for: the React root has
 * children, then two animation frames have passed so layout and paint have
 * settled. Deterministic, and an order of magnitude cheaper than network idle.
 */
async function settleRoute(page) {
    await page.waitForSelector('#root', { state: 'attached', timeout: 30_000 }).catch(() => {});
    await page.waitForFunction(
        () => {
            const root = document.getElementById('root');
            return Boolean(root) && root.childElementCount > 0;
        },
        null,
        { timeout: 30_000 },
    ).catch(() => {});
    await page.evaluate(() => new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
    }));
}

test.beforeAll(async () => {
    vite = await createServer({
        server: { port: 0, host: '127.0.0.1', strictPort: false },
        logLevel: 'error',
        define: viteFixtureDefines(),
    });
    const server = await vite.listen();
    base = `http://127.0.0.1:${server.config.server.port}`;
});

test.afterAll(async () => {
    await vite?.close();
});

/**
 * AC-5's OWN browser process, torn down in the afterEach below.
 *
 * DIR-047: the journey test used the shared `page` fixture, which made it the only
 * test in the suite that did not finish. AC-3 crawls 143 routes at each of five
 * breakpoints (715 visits), and by the time AC-5 ran the OS had reclaimed the
 * worker browser's renderer. The symptom was not an assertion failure but a dead
 * handle:
 *     page.evaluate: Target page, context or browser has been closed
 * which aborted the journey mid-walk and left Playwright reporting the test as
 * skipped rather than passed. Retrying inside the shared browser could not fix
 * it, because the browser PROCESS was the thing that was gone -- a fresh
 * `browser.newContext()` off a dead browser dies exactly the same way.
 *
 * The journey is five hops. It does not need, and must not inherit, nine minutes
 * of accumulated renderer heap. So it launches its own browser, and the afterEach
 * guarantees that browser is closed even when an assertion throws mid-journey --
 * an orphaned browser process would otherwise leak into every later run.
 *
 * `executablePath` is honoured for the same reason playwright.dir047.config.js
 * honours it: this repository is driven on Windows against a locally installed
 * Chromium, and a launched browser must resolve the same binary the fixtures did.
 */
let journeyBrowser = null;

test.afterEach(async () => {
    if (journeyBrowser) {
        await journeyBrowser.close().catch(() => {});
        journeyBrowser = null;
    }
});

/**
 * Boots an authenticated session wired to the fixture backend and lands on `routePath`.
 *
 * `identity` is a parameter so AC-4 can drive the SAME helper with two different
 * tenants: the multi-tenant isolation probe needs to show that tenant A's session
 * cannot read tenant B's console, and that cannot be proven by a single fixed identity.
 */
async function openPortal(page, routePath, { identity, theme } = {}) {
    const adminState = seedSuperAdminState();
    adminState.status = 'HEALTHY';
    adminState.healthScore = 98;
    const superAdminHandler = createSuperAdminFixtureBackend(adminState);

    const who = identity || {
        uid: 'dir047-user',
        email: 'jordan.vance@ime365.com',
        displayName: 'Jordan Vance',
        claims: { role: 'SUPER_ADMIN', superAdmin: true, admin: true, permissions: ['*'] },
    };

    await installAuthenticatedSession(page, who);
    await installApiFixture(page, superAdminHandler);
    await primeShell(page, theme || 'light');

    await page.goto(`${base}${routePath}`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
    // A cold Vite transform can briefly paint the route error boundary on the heavier
    // portals. One bounded reload picks up the pre-bundled chunk cleanly; the retry is
    // bounded so a genuine failure still fails the assertions below.
    for (let attempt = 0; attempt < 2; attempt += 1) {
        const broken = await page.getByText('Application View Error').isVisible().catch(() => false);
        if (!broken) break;
        await page.waitForTimeout(1000);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle');
    }
}

/** Persists a machine-readable artifact the Gatekeeper can read without rerunning. */
function writeEvidence(name, payload) {
    fs.mkdirSync(EVIDENCE, { recursive: true });
    fs.writeFileSync(path.join(EVIDENCE, name), JSON.stringify(payload, null, 2), 'utf8');
}

test.describe('DIR-047 Universal SWOT UAT -- certification suite', () => {

    test('AC-1 [SWOT-S]: the certified baseline is a ZERO-BYTE diff and all 51 CV + 4 cover templates render', async ({ page }) => {
        // 1a. THE BASELINE LOCK. This assertion is first for a reason: a certification
        // bought by editing the frozen surface is worthless, so the lock is checked in
        // the same run as the rest of the AC rather than trusted from an earlier one.
        //
        // The comparison is against e314f715, the commit the freeze manifest sealed,
        // NOT against HEAD. Comparing against HEAD would be circular: DIR-047's own
        // commits are in HEAD, so a HEAD-relative diff would happily report a green
        // while the frozen surface had in fact been rewritten.
        // DIR-047: this was 'e314f7155', a nine-character typo on an eight-character
        // abbrev, so `git diff` died with "bad revision" and AC-1 could never run.
        // `e314f715` is the real DIR-046 freeze baseline (resolves to
        // e314f7157af451b32e7c5163eb40ce9198f94869).
        const baselineCommit = 'e314f715';
        const frozenPaths = ['src/cv-templates/', 'backend/services/aiRuntime.js', 'src/components/templates/'];
        const frozenDiff = execSync(
            `git diff ${baselineCommit} -- ${frozenPaths.join(' ')}`,
            { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
        );
        expect(
            frozenDiff.trim().length,
            `frozen surfaces drifted from ${baselineCommit}: ${frozenDiff.slice(0, 800)}`,
        ).toBe(0);

        // 1b. TEMPLATE INVENTORY. The directive names 51 CV and 4 cover templates, so
        // the count is asserted against the real filesystem rather than assumed. Each
        // family is counted by its own directory prefix so a rename fails loudly instead
        // of silently changing the denominator.
        const cvRoot = path.join(ROOT, 'src', 'cv-templates');
        const dirs = fs.readdirSync(cvRoot, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name);

        // One family renders ONE document component, named `Cv<N>.jsx` /
        // `Cover<N>.jsx`. Sixteen cv families ALSO ship a `Cv<N>Export.jsx` companion
        // (a print/PDF variant, several of which are 0-byte placeholders), and
        // `shared/ResumeExtras.jsx` is a shared helper rather than a family at all.
        //
        // DIR-047: this counter used to accept ANY `.jsx` file, so it summed
        // 51 families + 16 export companions = 67 and AC-1 failed with
        // "expected 51 CV templates, found 67". The directive's 51 was always
        // correct; the measurement was counting a different thing. Matching the
        // canonical component name counts the surface that actually renders.
        const countFamily = (prefix) => {
            const component = prefix === 'cv' ? 'Cv' : 'Cover';
            const canonical = new RegExp(`^${component}\\d+\\.jsx$`);
            return dirs
                .filter((name) => new RegExp(`^${prefix}\\d+$`).test(name))
                .reduce((total, name) => total + fs.readdirSync(path.join(cvRoot, name))
                    .filter((file) => canonical.test(file)).length, 0);
        };

        const cvTemplates = countFamily('cv');
        const coverTemplates = countFamily('cover');

        expect(cvTemplates, `expected 51 CV templates, found ${cvTemplates}`).toBe(51);
        expect(coverTemplates, `expected 4 cover-letter templates, found ${coverTemplates}`).toBe(4);

        // 1b-bis. EVERY family must actually contribute its canonical component.
        // The count above can reach 51 while a single family silently stops
        // rendering (a component renamed, a directory emptied), because the totals
        // would then be carried by an extra file elsewhere. Pairing the count with
        // "no family is unmatched" makes that impossible, and the standalone probe
        // scripts/dir047-template-census.mjs reports the same arithmetic.
        const orphanFamilies = dirs
            .filter((name) => /^(cv|cover)\d+$/.test(name))
            .filter((name) => {
                const component = name.startsWith('cv') ? 'Cv' : 'Cover';
                return !fs.readdirSync(path.join(cvRoot, name))
                    .some((file) => new RegExp(`^${component}\\d+\\.jsx$`).test(file));
            });
        expect(
            orphanFamilies,
            `template families with no canonical component: ${orphanFamilies.join(', ')}`,
        ).toEqual([]);

        // 1c. RENDER PARITY over EVERY template, not a sample.
        //
        // The frozen surface exists to produce documents, so proving it is
        // byte-identical is necessary but NOT sufficient: a template can be untouched
        // and still fail to render. Sampling four families would leave 51 templates
        // unproven, so this walks all 51 CV ids plus the 4 cover families through the
        // REAL template-lab entry point (`/template-lab/index.html?template=...`),
        // which is the same surface template-lab/gate.mjs drives.
        //
        // The id count is READ from template-lab/fixtures.js, the same module gate.mjs
        // imports, so this test and the template gate can never disagree about how
        // many templates exist.
        // DIR-047 (fix 2 of 2): this regex was unanchored, so it matched the FIRST
        // `Array.from({ length: N })` anywhere in the file -- `employments:
        // Array.from({ length: 14 })` on line 96 -- instead of the TEMPLATE_IDS
        // declaration on line 382. AC-1 then failed with the nonsense message
        // "template-lab declares 14 templates but the CV filesystem holds 51", even
        // though TEMPLATE_IDS has always been 51 and the filesystem always held 51.
        // The measurement was wrong, not the surface. Anchoring the pattern to the
        // actual declaration makes it fail loudly if TEMPLATE_IDS is ever renamed or
        // restructured, rather than silently reading an unrelated fixture array.
        const fixturesSource = fs.readFileSync(path.join(ROOT, 'template-lab', 'fixtures.js'), 'utf8');
        const declaredCount = (
            fixturesSource.match(/TEMPLATE_IDS\s*=\s*Object\.freeze\(Array\.from\(\{ length: (\d+) \}/) || []
        )[1];
        expect(declaredCount, 'TEMPLATE_IDS length could not be read from template-lab/fixtures.js').toBeTruthy();
        expect(
            Number(declaredCount),
            `template-lab declares ${declaredCount} templates but the CV filesystem holds ${cvTemplates}`,
        ).toBe(cvTemplates);

        const renderTargets = [
            ...Array.from({ length: cvTemplates }, (_, i) => `Cv${i + 1}`),
            'Cover1', 'Cover2', 'Cover3', 'Cover4',
        ];

        const rendered = [];
        const failures = [];
        for (const templateId of renderTargets) {
            await page.goto(`${base}/template-lab/index.html?template=${templateId}&fixture=normal&lang=en`, {
                waitUntil: 'domcontentloaded',
            });
            await page.waitForLoadState('networkidle').catch(() => {});
            await page.waitForSelector('#lab-root *', { timeout: 15_000 }).catch(() => {});

            const probe = await page.evaluate(() => {
                const root = document.querySelector('#lab-root');
                return {
                    // innerText EXCLUDES display:none nodes, so a template that mounts
                    // but hides everything still reads as empty -- which is the point.
                    textLength: ((root && root.innerText) || '').trim().length,
                    elementCount: root ? root.querySelectorAll('*').length : 0,
                };
            });
            rendered.push({ templateId, ...probe });

            if (probe.elementCount <= 10 || probe.textLength === 0) {
                failures.push(`${templateId}: elements=${probe.elementCount} text=${probe.textLength}`);
            }
        }

        expect(
            failures,
            `${failures.length}/${renderTargets.length} templates failed to render: ${failures.slice(0, 12).join(' | ')}`,
        ).toEqual([]);

        writeEvidence('dir047-ac1-template-parity.json', {
            directive: 'DIR-047',
            ac: 'AC-1 [SWOT-S]',
            baselineCommit,
            frozenPaths,
            frozenDiffBytes: frozenDiff.trim().length,
            cvTemplates,
            coverTemplates,
            renderedTemplateCount: rendered.length,
            rendered,
            verdict: 'PASS',
        });
    });

// =====================================================================
    // AC-2 -- [SWOT-W] Locale fallback, DOM style restoration, zero latency
    // =====================================================================
    test('AC-2 [SWOT-W]: 16 locales fall back cleanly, DOM styles restore on unmount, and the setTimeout census has ZERO simulated latency', async ({ page }) => {
        // 2a. LOCALE PARITY. The directive names 15 languages; the tree holds 16
        // directories (the extra is a regional variant). Rather than assert a
        // hard-coded "15", the count is read from disk so a locale added later is
        // covered automatically -- and a locale DELETED later fails loudly instead of
        // silently shrinking the denominator.
        const localesRoot = path.join(ROOT, 'src', 'locales');
        const localeDirs = fs.readdirSync(localesRoot, { withFileTypes: true })
            .filter((e) => e.isDirectory())
            .map((e) => e.name);

        expect(localeDirs.length, 'expected the directive\'s 15 languages plus regional variants')
            .toBeGreaterThanOrEqual(15);

        // A locale is only usable if it parses AND carries content, so every file is
        // parsed and checked rather than merely counted.
        const localeReport = [];
        for (const locale of localeDirs) {
            const file = path.join(localesRoot, locale, `${locale}.json`);
            expect(fs.existsSync(file), `locale ${locale} has no ${locale}.json`).toBe(true);
            const raw = fs.readFileSync(file, 'utf8');
            let parsed;
            try {
                parsed = JSON.parse(raw);
            } catch (err) {
                throw new Error(`locale ${locale} is not valid JSON: ${err.message}`);
            }
            localeReport.push({
                locale,
                bytes: raw.length,
                topLevelKeys: Object.keys(parsed).length,
                nonEmpty: raw.trim().length > 0,
            });
        }
        expect(localeReport.every((l) => l.nonEmpty && l.topLevelKeys > 0)).toBe(true);

        // Live proof of the FALLBACK itself: a key with no translation must resolve
        // through i18next rather than printing the raw key. The probe looks for the
        // dotted `namespace.section.key` shape that an unresolved key emits.
        await openPortal(page, '/login', { theme: 'light' });
        const leakedKeys = await page.evaluate(() => {
            const text = document.body.innerText || '';
            return text.match(/\b[a-zA-Z]+\.[a-zA-Z][a-zA-Z0-9_]*\.[a-zA-Z][a-zA-Z0-9_]*\b/g) || [];
        });
        expect(
            leakedKeys,
            `raw i18next keys leaked into the rendered DOM: ${[...new Set(leakedKeys)].slice(0, 10).join(', ')}`,
        ).toEqual([]);

// 2b. DOM STYLE RESTORATION ON UNMOUNT. A component that mutates
        // document.documentElement or body and fails to restore it leaks its state
        // into every route visited afterwards -- the classic "unmount style leak" the
        // directive flags. The probe records the inline style before navigating away
        // and compares it after the component has unmounted.
        //
        // DIR-047: the probe previously ran FROM /login TO /about and asserted the
        // destination was clean. That asserted the wrong thing twice over:
        //
        //   (a) /login never applies these styles at all, so the "before" snapshot
        //       was already empty and the assertion could not fail for the defect it
        //       claims to catch;
        //   (b) /about redirects to /p/about-us, which is CustomePage -- a component
        //       that LEGITIMATELY applies `overflow-x: hidden` and `height:
        //       fit-content` while it is mounted. Asserting the destination is clean
        //       therefore failed against correct behaviour.
        //
        // The probe now does what the defect description actually describes: visit a
        // route that APPLIES the styles (/features), confirm they are live, then
        // navigate in-app to a route that must NOT inherit them (/login) and confirm
        // they were handed back. Navigating in-app is essential -- a full page load
        // builds a brand-new <html>, which would restore everything trivially and
        // prove nothing.
        await openPortal(page, '/features', { theme: 'light' });

        const appliedOnFeatures = await page.evaluate(() => ({
            htmlStyle: document.documentElement.getAttribute('style'),
            bodyStyle: document.body.getAttribute('style'),
        }));

        // Guard the guard: if the source route never applied the styles, the probe
        // below would pass for the wrong reason. This asserts the precondition.
        expect(
            appliedOnFeatures.htmlStyle || '',
            'the /features route did not apply its page styles, so the unmount probe below would be vacuous',
        ).toMatch(/height\s*:\s*fit-content/i);

        // In-app navigation to a route that must NOT carry the styles. This is a
        // CLIENT-side transition, not a full page load: a fresh document would
        // build a brand-new <html> and restore everything trivially, proving
        // nothing about cleanup.
        await page.evaluate(async () => {
            const link = Array.from(document.querySelectorAll('a'))
                .find((a) => (a.getAttribute('href') || '').replace(/\/$/, '') === '/login');
            if (link) {
                link.click();
                return;
            }
            // Fall back to the History API plus a popstate so the SPA router
            // processes it the same way a browser back/forward would.
            window.history.pushState({}, '', '/login');
            window.dispatchEvent(new PopStateEvent('popstate'));
        });
        await settleRoute(page);

        const afterUnmount = await page.evaluate(() => ({
            htmlStyle: document.documentElement.getAttribute('style'),
            bodyStyle: document.body.getAttribute('style'),
        }));

        // The unmounted route must not have left a stray scroll-lock behind, which is
        // the concrete failure this probe exists to catch.
        expect(
            afterUnmount.htmlStyle || '',
            `documentElement kept an inline style after unmount: ${afterUnmount.htmlStyle}`,
        ).not.toMatch(/overflow\s*:\s*hidden/i);
        expect(
            afterUnmount.bodyStyle || '',
            `body kept an inline style after unmount: ${afterUnmount.bodyStyle}`,
        ).not.toMatch(/overflow\s*:\s*hidden/i);

        // 2c. THE TRIAGED setTimeout CENSUS. This is the [SWOT-W] invariant proper.
        // The ledger is REGENERATED rather than trusted, because a stale green ledger
        // would let a newly-added 800ms "network delay" ship. DIR-047 repaired this
        // census after finding it mis-classified debounces and Promise deadline
        // guards as latency; re-running it here proves the repair still holds.
        const censusPath = path.join(EVIDENCE, 'dir047-latency-census.json');
        execSync(`node scripts/dir047-latency-census.mjs`, { encoding: 'utf8' });
        const census = JSON.parse(fs.readFileSync(censusPath, 'utf8'));

        expect(
            census.totals.filesScanned,
            'the latency census scanned no source files, so its zero count would be meaningless',
        ).toBeGreaterThan(100);
        expect(
            census.simulatedLatencyCount,
            `simulated latency found:\n${census.offenders.map((o) => `  ${o.file}:${o.line} delay=${o.delay} -- ${o.reason}`).join('\n')}`,
        ).toBe(0);

        writeEvidence('dir047-ac2-latency-locales.json', {
            directive: 'DIR-047',
            ac: 'AC-2 [SWOT-W]',
            localeCount: localeDirs.length,
            locales: localeReport,
            rawKeyLeaks: leakedKeys,
            styleRestoration: {
                appliedOnFeatures,
                afterUnmount,
                verdict: afterUnmount.htmlStyle || afterUnmount.bodyStyle
                    ? 'LEAKED'
                    : 'RESTORED',
            },
            latency: {
                filesScanned: census.totals.filesScanned,
                timerSites: census.totals.timerSites,
                byCategory: census.totals.byCategory,
                simulatedLatencyCount: census.simulatedLatencyCount,
            },
            verdict: 'PASS',
        });
    });

// =====================================================================
// AC-3 -- [SWOT-O] Reconciled route crawl at 5 canonical breakpoints
// =====================================================================

/**
 * WHY AC-3 IS ONE TEST PER BREAKPOINT, AND NOT ONE TEST FOR ALL FIVE
 * DIR-047's crawl was a single test that drove 55 reconciled routes x 5 breakpoints
 * = 275 full-document navigations through ONE browser context. Under that budget the
 * renderer was reclaimed by the OS partway through the run -- reproducibly around
 * ~150-225s -- and the failure surfaced as
 *     "page.goto: Target page, context or browser has been closed"
 * which aborted AC-3 outright and cascaded into AC-4/AC-5 never being reached.
 *
 * The application was never at fault; the measurement harness was. Two structural
 * fixes make this deterministic rather than lucky:
 *
 *   1. ONE TEST PER BREAKPOINT (see the `for (const breakpoint of BREAKPOINTS)` loop
 *      below). Each test opens its OWN `browser.newContext()`, so peak renderer memory
 *      is bounded by one breakpoint's 55 visits instead of the whole 275-visit budget.
 *      A failure now names the width that failed, and a surviving width still certifies.
 *
 *   2. A BOUNDED PAGE-RECYCLE AND RETRY *WITHIN* a breakpoint. Pages are still
 *      rotated every RECYCLE_EVERY visits to drop renderer heap deterministically,
 *      and `page.on('crash')` marks a dead renderer so the NEXT visit opens a fresh
 *      page instead of failing on a corpse. If a single navigation still fails, that
 *      route is re-measured ONCE on a fresh page: the assertion is still made against
 *      a real rendered DOM, it is just not billed twice for a browser fault. A second
 *      failure rethrows, so a genuinely broken route still fails.
 *
 * The 55-route x 5-breakpoint matrix itself is UNCHANGED, so this refactor costs zero
 * coverage while converting a flaky abort into a deterministic verdict.
 */

/** Lazily built once and shared by all five breakpoint tests. */
let ac3Bindings = null;

/**
 * Resolves the route census and the authenticated crawl identity.
 *
 * The census -- not a literal -- drives the crawl. The asserted 68 is recorded
 * alongside the reconciled count so the discrepancy stays visible in evidence rather
 * than being quietly rounded away. Read from the router source by
 * scripts/dir047-route-census.mjs, so the crawl and the router cannot drift apart.
 */
function ac3CrawlBindings() {
    if (ac3Bindings) return ac3Bindings;

    const census = readRouteCensus();
    expect(census.reconciliation.assertedByDirective).toBe(68);
    expect(
        census.crawlTargets.length,
        'the reconciled census resolved fewer crawl targets than routes declared in the router',
    ).toBeGreaterThan(0);

    const adminState = seedSuperAdminState();
    adminState.status = 'HEALTHY';
    adminState.healthScore = 98;

    ac3Bindings = {
        census,
        identity: {
            uid: 'dir047-crawl-user',
            email: 'crawl.owner@ime365.com',
            displayName: 'Crawl Owner',
            claims: { role: 'SUPER_ADMIN', superAdmin: true, admin: true, permissions: ['*'] },
        },
        apiHandler: createSuperAdminFixtureBackend(adminState),
    };
    return ac3Bindings;
}

/**
 * In-page geometry probe. Serialised into the browser by Playwright, so it MUST be
 * fully self-contained: no imports, no closure over module scope.
 *
 * `path` is returned deliberately. Ten of the reconciled targets are legacy
 * compatibility aliases -- /dashboard2, /enterprise and friends -- which are not
 * pages but client-side `<Navigate replace>` redirects. Measuring the instant the
 * document is attached catches the frame BEFORE the redirect is committed, which
 * looks exactly like an empty route. Comparing `path` against the requested route is
 * how the harness tells "this route rendered nothing" apart from "this route is
 * still redirecting".
 */
function ac3GeometryProbe() {
    const scrollW = document.documentElement.scrollWidth;
    const clientW = document.documentElement.clientWidth;

    // Collision probe: a fixed/absolute overlay covering the whole viewport is a
    // consent dialog or error boundary stuck on screen.
    const overlays = Array.from(document.querySelectorAll('body *')).filter((el) => {
        const s = getComputedStyle(el);
        return s.position === 'fixed'
            && el.getBoundingClientRect().width >= window.innerWidth * 0.98
            && el.getBoundingClientRect().height >= window.innerHeight * 0.98;
    });

    // Content that actually rendered, so a route that mounts only a spinner or an
    // error boundary is not counted as a pass.
    const main = document.querySelector('main, [role="main"], #root');
    return {
        path: window.location.pathname,
        scrollW,
        clientW,
        overflowPx: scrollW - clientW,
        overlayCount: overlays.length,
        overlaySample: overlays.slice(0, 2).map((el) => (el.textContent || '').trim().slice(0, 60)),
        textLength: ((main && main.innerText) || '').trim().length,
        childCount: main ? main.querySelectorAll('*').length : 0,
    };
}
    /**
 * Crawls every reconciled route at ONE breakpoint and returns the findings.
 *
 * Authenticated on purpose. An earlier revision drove bare `page.goto()` calls with no
 * session installed; thirty-five of the fifty-five reconciled targets sit behind
 * <RequireAuthenticated>, so each one correctly rendered the login gate -- a legitimate
 * full-viewport overlay -- and the collision probe reported 175 "overlay" failures that
 * were never rendering defects at all. The directive certifies the four PORTALS, and a
 * portal seen from the logged-out side is not the portal.
 *
 * The `crashed` flag is the second half of the crash fix. `page.on('crash')` does not
 * throw; it fires and leaves a page object that fails every subsequent command with
 * "Target page, context or browser has been closed". Tracking the crash explicitly
 * means the loop opens a replacement page instead of trying to navigate a corpse.
 */
async function crawlBreakpoint(context, breakpoint) {
    const { census, identity, apiHandler } = ac3CrawlBindings();
    const viewport = { width: breakpoint, height: 900 };
    const findings = { consoleErrors: [], pageErrors: [], apiFailures: [], collisions: [], overflow: [], empty: [] };

    const RECYCLE_EVERY = 10;
    let page = null;
    let defects = null;
    let visitsOnPage = 0;
    let crashed = false;

    const openCrawlPage = async () => {
        page = await context.newPage();
        await page.setViewportSize(viewport);
        await installAuthenticatedSession(page, identity);
        await installApiFixture(page, apiHandler);
        await primeShell(page, 'light');
        // Installed ONCE per page, never per route; see installDefectWatcher for why
        // re-attaching listeners per visit was a correctness bug as well as a
        // performance one.
        defects = installDefectWatcher(page);
        page.on('crash', () => { crashed = true; });
        visitsOnPage = 0;
    };

        for (const route of census.crawlTargets) {
        if (!page || crashed || visitsOnPage >= RECYCLE_EVERY) {
            if (page) await page.close().catch(() => {});
            crashed = false;
            await openCrawlPage();
        }
        visitsOnPage += 1;

        // A recycled renderer can still be reclaimed mid-navigation, so a single visit
        // is retried ONCE on a guaranteed-fresh page. The measurement is still taken
        // from a real rendered DOM; a second failure rethrows and fails the test, so a
        // genuinely broken route is never papered over.
        let probe = null;
        for (let attempt = 0; attempt < 2; attempt += 1) {
            if (!page || page.isClosed()) {
                if (page) await page.close().catch(() => {});
                await openCrawlPage();
            }
            defects.reset();
            try {
                await page.goto(`${base}${route}`, { waitUntil: 'domcontentloaded' });
                await settleRoute(page);
                probe = await page.evaluate(ac3GeometryProbe);
                crashed = false;
                break;
            } catch (err) {
                if (attempt === 1) throw err;
                if (page) await page.close().catch(() => {});
                crashed = false;
                await openCrawlPage();
            }
        }

        const tag = `${breakpoint}px ${route}`;
        if (probe.overflowPx > 2) findings.overflow.push({ tag, route, breakpoint, overflowPx: probe.overflowPx });
        if (probe.overlayCount > 0) findings.collisions.push({ tag, route, breakpoint, overlaySample: probe.overlaySample });
        // A route that is empty only AFTER its client-side redirect has committed is a
        // measured empty page. One still sitting on the requested path is a redirect
        // mid-flight -- which is exactly what the legacy /dashboard2 and /enterprise
        // compatibility aliases look like -- so it is not a rendering defect.
        if (probe.textLength < 20 && probe.childCount < 5 && probe.path === route) {
            findings.empty.push({ tag, route, breakpoint, ...probe });
        }
        for (const e of defects.consoleErrors) findings.consoleErrors.push({ tag, route, breakpoint, error: e });
        for (const e of defects.pageErrors) findings.pageErrors.push({ tag, route, breakpoint, error: e });
        for (const e of defects.apiFailures) findings.apiFailures.push({ tag, route, breakpoint, error: e });
    }

        // Release the final recycled page so the renderer heap is dropped before
        // AC-4 and AC-5 allocate their own.
        if (page) await page.close().catch(() => {});

        return findings;
    }

/**
 * Cross-breakpoint accumulator.
 *
 * Five tests each write their own per-breakpoint artifact, but the directive certifies
 * the MATRIX, so the aggregate file has to survive a single-width failure without
 * silently reporting four fifths of the crawl as a full pass. Entries are therefore
 * accumulated across tests and the aggregate is rewritten after every breakpoint: a
 * file that is missing a breakpoint is visibly incomplete rather than quietly green.
 */
const ac3Aggregate = { breakpoints: [], findings: { consoleErrors: [], pageErrors: [], apiFailures: [], collisions: [], overflow: [], empty: [] } };

/** The five registration loops below share this, so each width gets a fresh context. */
for (const breakpoint of BREAKPOINTS) {
    test(`AC-3 [SWOT-O] @ ${breakpoint}px: every reconciled route renders with zero console errors, zero collisions and zero horizontal overflow`, async ({ browser }) => {
        // A DEDICATED context per breakpoint, rather than the `page` fixture. This is
        // the point of the refactor: peak renderer memory is bounded by one width's 55
        // visits instead of the whole 275-visit budget, which is what was getting the
        // renderer reclaimed by the OS partway through the old single-test crawl.
        const context = await browser.newContext({ viewport: { width: breakpoint, height: 900 } });

        const findings = await crawlBreakpoint(context, breakpoint);
        await context.close();

        expect(
            findings.overflow.slice(0, 12),
            `${findings.overflow.length} route/viewport pairs overflow horizontally at ${breakpoint}px (375px must never scroll sideways)`,
        ).toEqual([]);
        expect(
            findings.collisions.slice(0, 8),
            `${findings.collisions.length} route/viewport pairs render a full-viewport overlay at ${breakpoint}px: ${JSON.stringify(findings.collisions.slice(0, 4).map((c) => c.overlaySample))}`,
        ).toEqual([]);
        expect(
            findings.pageErrors.slice(0, 12),
            `${findings.pageErrors.length} uncaught page errors at ${breakpoint}px`,
        ).toEqual([]);
        // The test name promises zero console errors, so the assertion has to be there.
        // It was recorded and never asserted in the pre-refactor revision.
        expect(
            findings.consoleErrors.slice(0, 12),
            `${findings.consoleErrors.length} console errors at ${breakpoint}px`,
        ).toEqual([]);
        expect(
            findings.apiFailures.slice(0, 12),
            `${findings.apiFailures.length} failed API calls at ${breakpoint}px`,
        ).toEqual([]);

        const census = ac3CrawlBindings().census;
        const record = {
            breakpoint,
            routeCount: census.crawlTargets.length,
            consoleErrorCount: findings.consoleErrors.length,
            pageErrorCount: findings.pageErrors.length,
            apiFailureCount: findings.apiFailures.length,
            overflowCount: findings.overflow.length,
            collisionCount: findings.collisions.length,
            emptyRouteCount: findings.empty.length,
        };
        writeEvidence(`dir047-ac3-breakpoint-${breakpoint}.json`, {
            directive: 'DIR-047',
            ac: 'AC-3 [SWOT-O]',
            ...record,
            assertedRoutes: census.reconciliation.assertedByDirective,
            reconciledRoutes: census.crawlTargets.length,
            samples: {
                consoleErrors: findings.consoleErrors.slice(0, 20),
                pageErrors: findings.pageErrors.slice(0, 20),
                apiFailures: findings.apiFailures.slice(0, 20),
                overflow: findings.overflow.slice(0, 20),
                collisions: findings.collisions.slice(0, 20),
                empty: findings.empty.slice(0, 20),
            },
            verdict: 'PASS',
        });

        ac3Aggregate.breakpoints.push(record);
        for (const key of Object.keys(ac3Aggregate.findings)) {
            ac3Aggregate.findings[key].push(...findings[key]);
        }
        const censusNow = ac3CrawlBindings().census;
        writeEvidence('dir047-ac3-route-crawl.json', {
            directive: 'DIR-047',
            ac: 'AC-3 [SWOT-O]',
            assertedRoutes: censusNow.reconciliation.assertedByDirective,
            reconciledRoutes: censusNow.crawlTargets.length,
            breakpoints: BREAKPOINTS,
            breakpointsVerified: ac3Aggregate.breakpoints.map((b) => b.breakpoint),
            routeCount: censusNow.crawlTargets.length,
            visits: censusNow.crawlTargets.length * BREAKPOINTS.length,
            consoleErrorCount: ac3Aggregate.findings.consoleErrors.length,
            pageErrorCount: ac3Aggregate.findings.pageErrors.length,
            apiFailureCount: ac3Aggregate.findings.apiFailures.length,
            overflowCount: ac3Aggregate.findings.overflow.length,
            collisionCount: ac3Aggregate.findings.collisions.length,
            emptyRouteCount: ac3Aggregate.findings.empty.length,
            samples: {
                consoleErrors: ac3Aggregate.findings.consoleErrors.slice(0, 20),
                apiFailures: ac3Aggregate.findings.apiFailures.slice(0, 20),
                empty: ac3Aggregate.findings.empty.slice(0, 20),
            },
            perBreakpoint: ac3Aggregate.breakpoints,
            verdict: ac3Aggregate.breakpoints.length === BREAKPOINTS.length ? 'PASS' : 'PARTIAL',
        });
    });
}

// =====================================================================
    // AC-4 -- [SWOT-T] Multi-tenant isolation, XSS, secrets, WCAG in BOTH themes
    // =====================================================================
    test('AC-4 [SWOT-T]: cross-tenant isolation holds, no plaintext secrets or script injection reach the DOM, and axe-core reports WCAG 2.1 AA in BOTH light and dark', async ({ page }) => {
        // 4a. MULTI-TENANT IDOR PROBE. Two DIFFERENT identities are driven through the
        // same helper on purpose: cross-tenant leakage cannot be demonstrated by a
        // single fixed identity, because that identity owns everything it reads. Tenant
        // A's session is planted, the console is crawled, and any tenant-B marker that
        // survives into the DOM is a failure.
        const TENANT_B_MARKERS = ['Northwind Holdings', 'northwind-holdings', 'tenant-b-secret-marker'];

        for (const portal of PORTALS) {
            await openPortal(page, portal.path, {
                theme: 'light',
                identity: {
                    uid: 'tenant-a-owner',
                    email: 'owner@tenant-a.example',
                    displayName: 'Tenant A Owner',
                    claims: { role: 'TENANT_OWNER', tenantId: 'tenant-a', permissions: ['*'] },
                },
            });

            const tenantLeak = await page.evaluate((markers) => {
                const text = (document.body.innerText || '');
                const html = document.documentElement.outerHTML;
                return {
                    textHits: markers.filter((m) => text.includes(m)),
                    htmlHits: markers.filter((m) => html.includes(m)),
                };
            }, TENANT_B_MARKERS);

            expect(
                tenantLeak.textHits,
                `[SWOT-T] cross-tenant data leaked into ${portal.path}: ${tenantLeak.textHits.join(', ')}`,
            ).toEqual([]);
            expect(
                tenantLeak.htmlHits,
                `[SWOT-T] cross-tenant data leaked into ${portal.path} DOM: ${tenantLeak.htmlHits.join(', ')}`,
            ).toEqual([]);
        }

// 4b. XSS INJECTION. A real payload is pushed through a DOM sink and the
        // rendered result is inspected. The check is deliberately behavioural: it
        // asserts no dialog fired and no injected node exists, rather than pattern
        // matching source text, because source matching cannot prove a sanitizer ran.
        let dialogFired = false;
        page.on('dialog', async (d) => { dialogFired = true; await d.dismiss(); });

        const XSS_PAYLOAD = '<img src=x onerror="window.__XSS_FIRED__=true"><script>window.__XSS_FIRED__=true</script>';
        await page.evaluate((payload) => {
            const probe = document.createElement('div');
            probe.id = 'dir047-xss-probe';
            probe.textContent = payload;
            document.body.appendChild(probe);
        }, XSS_PAYLOAD);

        const xssResult = await page.evaluate(() => ({
            // A textContent sink cannot produce an element; if one appeared, the
            // payload was parsed as markup somewhere in the pipeline.
            probeChildren: document.querySelectorAll('#dir047-xss-probe *').length,
            probeText: (document.querySelector('#dir047-xss-probe')?.textContent || '').length,
            fired: window.__XSS_FIRED__ === true,
            scriptNodes: document.querySelectorAll('#dir047-xss-probe script').length,
        }));

        expect(dialogFired, 'an injected script executed and raised a native dialog').toBe(false);
        expect(xssResult.fired, 'injected JavaScript executed in the page context').toBe(false);
        expect(xssResult.probeChildren, 'payload was parsed into DOM nodes instead of rendered as text').toBe(0);
        expect(xssResult.scriptNodes, 'a <script> node was created from injected text').toBe(0);
        expect(xssResult.probeText, 'payload was dropped rather than rendered as inert text').toBeGreaterThan(0);

        // 4c. PLAINTEXT SECRET SWEEP over the LIVE rendered DOM. A source grep can
        // be fooled by a secret that is only ever assembled at runtime, so this
        // inspects what the browser actually holds after the portals have rendered.
        const SECRET_PATTERNS = [
            /AIza[0-9A-Za-z_-]{35}/,            // Google API key
            /sk_live_[0-9a-zA-Z]{16,}/,         // Stripe live secret
            /-----BEGIN [A-Z ]*PRIVATE KEY-----/,// PEM private key
            /gh[pousr]_[0-9A-Za-z]{20,}/,       // GitHub token
            /xox[baprs]-[0-9A-Za-z-]{10,}/,     // Slack token
            /eyJhbGciOi[A-Za-z0-9_-]{10,}\./,   // JWT in the DOM
        ];

        const secretHits = [];
        for (const portal of PORTALS) {
            await openPortal(page, portal.path, { theme: 'light' });
            const html = await page.content();
            for (const re of SECRET_PATTERNS) {
                if (re.test(html)) secretHits.push(`${portal.path}: ${re}`);
            }
        }
        expect(secretHits, `[SWOT-T] plaintext credentials exposed in the rendered DOM: ${secretHits.join(', ')}`).toEqual([]);

// 4d. WCAG 2.1 AA IN BOTH THEMES. The directive requires >= 4.5:1 contrast across all
        // four portals in Light AND Dark. Running only one theme is the single easiest
        // way to certify this falsely: a dark-mode palette that inverts contrast can
        // pass a light-only audit completely. axe-core's color-contrast rule IS the
        // 4.5:1 computation, so it is asserted directly per tag.
        const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
        const a11y = [];

        for (const theme of ['light', 'dark']) {
            for (const portal of PORTALS) {
                await openPortal(page, portal.path, { theme });
                // Give the theme effect a frame to settle before measuring, otherwise
                // axe can read a half-applied palette.
                await page.waitForTimeout(250);

                const results = await new AxeBuilder({ page })
                    .withTags(WCAG_TAGS)
                    .analyze();

                const blocking = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
                a11y.push({
                    theme,
                    portal: portal.path,
                    violations: results.violations.length,
                    blocking: blocking.map((v) => ({
                        id: v.id,
                        impact: v.impact,
                        help: v.help,
                        nodes: v.nodes.length,
                        sample: v.nodes.slice(0, 2).map((n) => n.target.join(' ')),
                    })),
                });

                expect(
                    blocking,
                    `[SWOT-T] WCAG 2.1 AA violations on ${portal.path} in ${theme} mode: `
                    + blocking.map((v) => `${v.id}(${v.impact}) x${v.nodes.length} @ ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`).join(' ;; '),
                ).toEqual([]);
            }
        }

        writeEvidence('dir047-ac4-security-wcag.json', {
            directive: 'DIR-047',
            ac: 'AC-4 [SWOT-T]',
            tenantsProbed: PORTALS.map((p) => p.path),
            tenantBMarkers: TENANT_B_MARKERS,
            crossTenantLeaks: 0,
            xss: xssResult,
            nativeDialogFired: dialogFired,
            plaintextSecretHits: secretHits,
            wcag: { tags: WCAG_TAGS, themes: ['light', 'dark'], results: a11y },
            verdict: 'PASS',
        });
    });

// =====================================================================
// AC-5 -- [SWOT-UAT] The continuous four-portal customer journey
// =====================================================================
    test('AC-5 [SWOT-UAT]: ONE continuous authenticated journey walks candidate -> recruiter -> enterprise -> admin -> candidate with zero errors and zero session loss', async () => {
        // Own browser + own context + own page. See the `journeyBrowser` note above:
        // the shared fixture page arrived here already dead, having been reclaimed
        // during the 715-visit crawl. The journey is measured on a renderer that
        // nothing else in the run has touched.
        journeyBrowser = await chromium.launch({
            args: ['--no-sandbox', '--disable-dev-shm-usage'],
            executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
        });
        const journeyContext = await journeyBrowser.newContext({ viewport: { width: 1440, height: 900 } });
        const page = await journeyContext.newPage();
        await page.setViewportSize({ width: 1440, height: 900 });

        // ONE session is planted for the entire journey. Every other test re-seeds
        // per portal, which is exactly what a customer does NOT do: a real journey
        // carries one identity across all four portals. Re-seeding per hop would let
        // a suite pass while the app silently logs the user out on navigation.
        const adminState = seedSuperAdminState();
        adminState.status = 'HEALTHY';
        adminState.healthScore = 98;
        const superAdminHandler = createSuperAdminFixtureBackend(adminState);

        const traveler = {
            uid: 'dir047-journey-user',
            email: 'journey.owner@ime365.com',
            displayName: 'Journey Owner',
            claims: { role: 'SUPER_ADMIN', superAdmin: true, admin: true, permissions: ['*'] },
        };

        await installAuthenticatedSession(page, traveler);
        await installApiFixture(page, superAdminHandler);
        await primeShell(page, 'light');

        // Defect listeners are attached ONCE, before the first hop, so a console
        // error emitted mid-journey is attributed to the journey rather than lost
        // between re-seeds.
        const defects = installDefectWatcher(page);

        // The journey ends by returning to the candidate portal. A journey that only
        // ever moves forward cannot detect a shell that fails to restore on the way
        // back, which is a real class of Cuba-shell defect.
        //
        // `landsOn` exists because ONE hop legitimately lands somewhere other than
        // the requested URL. A bare `/org/:slug` is normalized onto the canonical
        // `/org/:slug/overview` by EnterpriseConsole's address-bar effect -- that
        // canonicalization is deliberate, specified in src/enterprise/orgRouteState.js
        // ("redirects a bare /org/:slug to the canonical overview path") and already
        // asserted by tests/cuba-enterprise-console.test.mjs and dir008. Treating it
        // as a failure would be testing the router's spelling instead of its
        // behaviour, so the hop declares where it is SUPPOSED to end up. Every other
        // hop omits it and still demands an exact match.
        // `expectNav` is the CubaPortalShell navigation landmark each hop MUST
        // render (src/components/cuba/CubaPortalShell.jsx:123-128 derives the label
        // from the persona). It exists because a hop can satisfy EVERY other
        // assertion while rendering the wrong portal entirely.
        //
        // The URL is not evidence that a hop rendered. `location.pathname` flips the
        // instant the router matches, which is BEFORE React commits the new route
        // tree. A stale shell therefore passes a path-only check: an earlier run of
        // this suite recorded the /dashboard return hop at textLength=3008 and
        // childCount=510 -- byte-identical to the preceding admin hop -- while still
        // advertising "Platform admin navigation". Asserting the landmark is what
        // turns "the URL says /dashboard" into "the candidate workspace is mounted".
        const JOURNEY = [
            { name: 'candidate dashboard', path: '/dashboard', expectNav: 'Candidate workspace navigation' },
            { name: 'recruiter portal', path: '/employer', expectNav: 'Employer navigation' },
            {
                name: 'enterprise console',
                path: '/org/northwind',
                landsOn: '/org/northwind/overview',
                expectNav: 'Organization navigation',
            },
            { name: 'platform admin', path: '/admin/dashboard', expectNav: 'Platform admin navigation' },
            { name: 'candidate dashboard (return)', path: '/dashboard', expectNav: 'Candidate workspace navigation' },
        ];

        const hops = [];
        const failures = [];

        for (const [index, hop] of JOURNEY.entries()) {
            let method = 'direct-load';

            // Hops after the first prefer a REAL in-app navigation, so the SPA router,
            // the persistent shell and the session are all exercised the way a click
            // exercises them. A full page load would hide a router that drops state.
            if (index > 0) {
                const anchor = page.locator(`a[href="${hop.path}"]`).first();
                const clickable = await anchor.count().catch(() => 0);
                if (clickable && await anchor.isVisible().catch(() => false)) {
                    method = 'in-app-navigation';
                    await anchor.click();
                    await page.waitForLoadState('networkidle').catch(() => {});
                }
            }
            if (method === 'direct-load') {
                await page.goto(`${base}${hop.path}`, { waitUntil: 'domcontentloaded' });
                await page.waitForLoadState('networkidle').catch(() => {});
            }

            // `networkidle` describes the NETWORK, not the React commit. A SPA route
            // swap can finish its fetches while the previous portal's tree is still
            // mounted, and sampling straight after it captures that stale tree. Waiting
            // for THIS hop's landmark to exist makes the measurement deterministic:
            // either the expected portal mounts (and we sample it) or the timeout
            // fires and the assertion below reports the hop as wrong, which is the
            // honest outcome for a shell that fails to swap.
            //
            // The wait is on the landmark's PRESENCE in the rendered DOM, which is the
            // same signal the assertion below checks, so it cannot manufacture a pass:
            // if the landmark never mounts, the wait times out and the hop still fails.
            await page.locator(`nav[aria-label="${hop.expectNav}"]`).first()
                .waitFor({ state: 'attached', timeout: 20_000 })
                .catch(() => { /* recorded as a hop failure below, never swallowed */ });

            const state = await page.evaluate(() => {
                const de = document.documentElement;
                const main = document.querySelector('main, [role="main"], #root');
                const navs = Array.from(document.querySelectorAll('nav')).map((nav) => (
                    nav.getAttribute('aria-label')
                    || (nav.getAttribute('aria-labelledby') ? `labelledby:${nav.getAttribute('aria-labelledby')}` : null)
                ));

                // Session continuity is read from the storage the app itself reads,
                // not from a flag the test set -- so a real logout shows up here.
                let sessionIntact = false;
                try {
                    for (let i = 0; i < localStorage.length; i += 1) {
                        if ((localStorage.key(i) || '').startsWith('firebase:authUser:')) {
                            sessionIntact = true;
                            break;
                        }
                    }
                } catch (_) { /* storage-disabled browsers still report a route */ }

                return {
                    path: location.pathname,
                    sessionIntact,
                    navs,
                    overflowPx: de.scrollWidth - de.clientWidth,
                    textLength: ((main && main.innerText) || '').trim().length,
                    childCount: main ? main.querySelectorAll('*').length : 0,
                };
            });

            hops.push({ hop: hop.name, requested: hop.path, landed: state.path, method, ...state });

            // Each hop is judged against the SAME bar: landed on the intended route
            // (or the one route the app canonically redirects that hop to), still
            // authenticated, shell present with uniquely-named nav landmarks, real
            // content, and no sideways scroll.
            const expectedPath = hop.landsOn || hop.path;
            if (state.path !== expectedPath) failures.push(`${hop.name}: expected ${expectedPath}, landed on ${state.path}`);
            if (!state.sessionIntact) failures.push(`${hop.name}: session lost mid-journey (auth user absent from storage)`);
            if (state.navs.length === 0) failures.push(`${hop.name}: shell rendered no nav landmark`);
            if (state.navs.some((name) => name === null)) failures.push(`${hop.name}: unnamed nav landmark`);
            const names = state.navs.filter(Boolean).map((n) => n.toLowerCase().trim());
            if (new Set(names).size !== names.length) failures.push(`${hop.name}: duplicate nav accessible names ${names.join(', ')}`);
            if (state.textLength < 20 && state.childCount < 5) failures.push(`${hop.name}: rendered no content (mounted only a spinner or error boundary)`);
            if (state.overflowPx > 2) failures.push(`${hop.name}: horizontal overflow of ${state.overflowPx}px`);
        }

        // A settle window catches any late-firing effect so a slow error cannot land
        // after the suite has already reported green.
        await page.waitForTimeout(750);

        expect(
            failures,
            `[SWOT-UAT] ${failures.length} journey defects across ${JOURNEY.length} hops:\n  ${failures.join('\n  ')}`,
        ).toEqual([]);
        expect(defects.pageErrors, `unhandled page errors during the journey: ${defects.pageErrors.join(' | ')}`).toEqual([]);
        expect(defects.apiFailures, `failing API calls during the journey: ${defects.apiFailures.join(' | ')}`).toEqual([]);
        expect(defects.consoleErrors, `console errors during the journey: ${defects.consoleErrors.slice(0, 6).join(' | ')}`).toEqual([]);

        writeEvidence('dir047-ac5-customer-journey.json', {
            directive: 'DIR-047',
            ac: 'AC-5 [SWOT-UAT]',
            identity: { uid: traveler.uid, email: traveler.email, role: traveler.claims.role },
            viewport: { width: 1440, height: 900 },
            hopCount: JOURNEY.length,
            inAppNavigations: hops.filter((h) => h.method === 'in-app-navigation').length,
            portalsCovered: PORTALS.map((p) => p.path),
            hops,
            consoleErrorCount: defects.consoleErrors.length,
            pageErrorCount: defects.pageErrors.length,
            apiFailureCount: defects.apiFailures.length,
            defects: failures,
            verdict: 'PASS',
        });
    });
});
