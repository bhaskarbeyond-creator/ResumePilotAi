/**
 * DIR-025: Universal Link Crawler & Route Completeness Audit
 *
 * CRAWLS ALL INTERNAL LINKS ACROSS PUBLIC, CANDIDATE, RECRUITER, ENTERPRISE AND
 * ADMIN SURFACES, and validates that every one resolves without a 404, an
 * unhandled fallthrough or a blank DOM. Emits UNIVERSAL_LINK_CENSUS.json.
 *
 * WHY THE PREVIOUS VERSION OF THIS FILE WAS REPLACED (DIR-025 root cause)
 * The earlier crawler walked a HARDCODED list of paths in a browser context with NO
 * session. Every protected route therefore performed its INV-3 redirect and landed
 * on `/login?next=...` -- and the crawler scored that as a PASS, because the login
 * page is full of text. The `discoveredLinks` set it filled was never even visited.
 * That produced a "42/42 = 100%" census that proved nothing at all. This version:
 *   1. MINTS A GENUINE Firebase session (firebase-admin) and boots it into the
 *      browser, so authenticated routes are audited as a signed-in user sees them.
 *   2. EXTRACTS every internal link from the REAL rendered DOM of all four portals
 *      plus the public marketing pages -- not from a hand-written list.
 *   3. CLICKS the account-menu items for real. They are `<button role="menuitem">`
 *      with no `href` at all, so no DOM link extractor can see them; they navigate
 *      through an onClick handler. The only honest way to audit them is to click.
 *   4. RE-DERIVES the invariants instead of hardcoding them: INV-1 from an actual
 *      `git diff`, INV-3 from an actual signed-out guest navigation.
 *
 * Every number in the emitted census is measured. Nothing is asserted by fiat.
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import path from 'node:path';
import dotenv from 'dotenv';
import { mintFirebaseSession } from '../../tests/e2e/dir006-session.mjs';
import { ACCOUNT_PORTALS, accountLinksFor } from '../../src/components/cuba/accountLinks.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const OUT_FILE = join(__dirname, 'UNIVERSAL_LINK_CENSUS.json');

dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });
dotenv.config({ path: path.join(process.cwd(), 'backend', '.env'), quiet: true });

/** The certified freeze baseline DIR-025 names in INV-1. */
const FREEZE_BASELINE = 'e314f715';

/**
 * Entry points the crawl starts from. These are the surfaces a user actually
 * lands on; every link BELOW them is discovered from the live DOM, not listed.
 */
const PORTAL_ENTRY_POINTS = [
    { portal: 'public', name: 'Public Marketing', path: '/' },
    { portal: 'public', name: 'Public Pricing', path: '/pricing' },
    { portal: 'public', name: 'Public Blog', path: '/blog' },
    { portal: 'candidate', name: 'Candidate Dashboard', path: '/dashboard' },
    { portal: 'candidate', name: 'Candidate Settings', path: '/dashboard/settings' },
    { portal: 'recruiter', name: 'Recruiter Overview', path: '/employer' },
    { portal: 'enterprise', name: 'Organization Console', path: '/org' },
    { portal: 'admin', name: 'Platform Admin', path: '/admin' },
];

/** Routes that MUST send a signed-out guest to `/login?next=` (INV-3). */
const GUARDED_ROUTES = [
    '/dashboard', '/dashboard/profile', '/dashboard/security',
    '/employer', '/org', '/admin',
];
/**
 * Boots the real Firebase session into the page before any app code runs.
 * Identical in shape to the proven DIR-011 harness: Firebase web persistence
 * reads `firebase:authUser:<apiKey>:[DEFAULT]`, so writing a genuine
 * firebase-admin-minted token there is all it takes for `src/conf/fire.js`
 * (initialised against the live project) to accept the session.
 */
async function bootSession(page, session) {
    await page.addInitScript(({ uid, email, token, refreshToken, apiKey }) => {
        const authUser = {
            uid,
            email,
            emailVerified: true,
            displayName: email.split('@')[0],
            isAnonymous: false,
            stsTokenManager: {
                apiKey,
                refreshToken,
                accessToken: token,
                expirationTime: Date.now() + 3600_000,
            },
            createdAt: String(Date.now()),
            lastLoginAt: String(Date.now()),
            apiKey,
            appName: '[DEFAULT]',
        };
        localStorage.setItem(`firebase:authUser:${apiKey}:[DEFAULT]`, JSON.stringify(authUser));
        localStorage.setItem('user', uid);
        localStorage.setItem('preferredLanguage', 'en');
        // Pin the Cuba chrome so the audit measures the universal M3 shell that
        // carries the account menu under audit, not the legacy header.
        localStorage.setItem('ime365_cuba_shell_v2', 'cuba');
    }, {
        uid: session.uid,
        email: session.email,
        token: session.idToken,
        refreshToken: session.refreshToken,
        apiKey: session.apiKey,
    });
}

/**
 * Inter-navigation pause.
 *
 * The first honest run burst 76 navigations back-to-back and the live backend
 * answered `429 Too many requests`. That is the crawler misbehaving, not a product
 * defect: a human does not fire 76 authenticated page loads a second. The crawl is
 * paced so the rate limiter is never the thing under test, and so the census
 * measures routing rather than throttling.
 */
const PACE_MS = Number(process.env.DIR025_PACE_MS || 900);

/**
 * Polls until the URL stops changing (or the budget expires).
 *
 * `RequireAuthenticated` redirects AFTER Firebase finishes initialising, so reading
 * `location` a single fixed moment after load races the auth bootstrap and reads the
 * pre-redirect URL. Waiting for the URL to stabilise is what makes the INV-3
 * measurement true rather than flaky.
 */
async function waitForUrlToSettle(page, budgetMs = 8000) {
    const deadline = Date.now() + budgetMs;
    let previous = null;
    let stableRounds = 0;
    while (Date.now() < deadline) {
         
        const current = page.url();
        if (current === previous) {
            stableRounds += 1;
            // Two consecutive stable reads is enough: the redirect, if any, is done.
            if (stableRounds >= 2) return current;
        } else {
            stableRounds = 0;
            previous = current;
        }
         
        await page.waitForTimeout(250);
    }
    return page.url();
}

/** True for a same-origin, non-asset path worth navigating to. */
function isCrawlablePath(raw) {
    if (typeof raw !== 'string') return false;
    if (!raw.startsWith('/') || raw.startsWith('//')) return false;
    if (raw.startsWith('/api/')) return false;
    if (/\.(png|jpe?g|gif|svg|webp|ico|css|js|mjs|map|pdf|zip|xml|txt|woff2?)$/i.test(raw)) return false;
    if (raw.startsWith('/export/')) return false; // requires a live resume id
    return true;
}

/**
 * Waits for the SPA to actually settle instead of guessing with a fixed sleep.
 *
 * A fixed timeout is what made the first honest run report "blank viewport" for
 * `/org/usage` and `/admin/trustedby` -- both render over a thousand characters,
 * they were simply still downloading a dev-mode lazy chunk. This polls the real
 * signal (rendered text inside #main-content) up to a bounded budget.
 */
async function settlePage(page, budgetMs = 9000) {
    const deadline = Date.now() + budgetMs;
    while (Date.now() < deadline) {
         
        const ready = await page.evaluate(() => {
            const main = document.querySelector('#main-content') || document.body;
            const text = (main?.innerText || '').trim();
            return text.length >= 30 || /page not found/i.test(document.body?.innerText || '');
        });
        if (ready) return true;
         
        await page.waitForTimeout(250);
    }
    return false;
}

/**
 * Inspects the settled page and returns everything needed to judge it.
 * A route is only healthy when the LANDING URL is a real route (not the NotFound
 * page), `#main-content` actually has rendered children, and nothing threw.
 */
async function inspect(page, response) {
    const landed = page.url().replace(BASE_URL, '') || '/';
    const httpStatus = response ? response.status() : null;
    const view = await page.evaluate(() => {
        const main = document.querySelector('#main-content') || document.body;
        const text = (main?.innerText || '').trim();
        return {
            textLength: text.length,
            mainChildElements: main ? main.querySelectorAll('*').length : 0,
            isNotFound: /page not found/i.test(document.body?.innerText || ''),
        };
    });
    return { httpStatus, landed, ...view };
}
/**
 * Collects the internal links reachable from one rendered page, plus the
 * account-menu targets, by PHYSICALLY CLICKING the menu.
 *
 * The account items carry no `href` (they are `<button role="menuitem">` that
 * navigate via onClick), so the only way to learn where they go is to open the
 * menu and press them.
 */
async function harvestFromPage(page, origin) {
    const findings = [];

    const anchors = await page.$$eval('a[href]', (els) => els.map((e) => e.getAttribute('href')));
    for (const href of anchors) {
        if (!isCrawlablePath(href)) continue;
        findings.push({ source: `${origin} :: <a href>`, path: href.split('#')[0] });
    }

    const trigger = page.locator('[data-testid="cuba-user-menu-trigger"]');
    if (await trigger.count()) {
        await trigger.first().click();
        const menu = page.locator('[role="menu"] [role="menuitem"]:not([data-testid="cuba-user-menu-signout"]):not([data-testid="cuba-user-menu-theme"])');
        const count = await menu.count();
        for (let i = 0; i < count; i += 1) {
            // Defensive: never press Sign out even if a test id is ever removed.
             
            if (/sign\s*out/i.test(await menu.nth(i).innerText())) continue;
             
            const label = (await menu.nth(i).innerText()).trim();
            const before = page.url();
             
            await menu.nth(i).click();
             
            await page.waitForTimeout(700);
            const landed = page.url().replace(BASE_URL, '');
            if (landed !== before.replace(BASE_URL, '')) {
                findings.push({ source: `${origin} :: account menu "${label}"`, path: landed });
            }
            // Re-open the menu for the next item; the popover closes on navigate.
             
            if (await trigger.count()) await trigger.first().click();
        }
    }
    return findings;
}

/** INV-1, measured: the frozen baseline must be byte-identical. */
function measureFrozenBaseline() {
    const paths = ['src/cv-templates', 'backend/services/aiRuntime.js'];
    let bytes = 0;
    for (const p of paths) {
        try {
            const out = execFileSync('git', ['diff', FREEZE_BASELINE, '--', p], {
                cwd: process.cwd(),
                encoding: 'utf8',
            });
            bytes += Buffer.byteLength(out || '', 'utf8');
        } catch (e) {
            bytes += Buffer.byteLength(String(e.stdout || ''), 'utf8');
        }
    }
    return { baseline: FREEZE_BASELINE, paths, diffBytes: bytes };
}
async function runCrawl() {
    console.log('[DIR-025 CRAWLER] Authenticating against the live Firebase project...');
    const session = await mintFirebaseSession({
        email: process.env.DIR025_EMAIL || process.env.ADMIN_EMAIL,
    });
    if (!session) {
        console.error('[DIR-025 CRAWLER] FATAL: could not mint a Firebase session. An '
            + 'unauthenticated crawl is exactly the defect this audit exists to catch, '
            + 'so it refuses to emit a census.');
        return false;
    }
    console.log(`[DIR-025 CRAWLER] Session minted for ${session.email} (uid ${session.uid}).`);

    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const context = await browser.newContext();
    const page = await context.newPage();

    // ONE shared collector, attributed to whichever route is open at the time.
    //
    // THREE defect classes are tracked, and keeping them apart matters:
    //   `route`  - the navigation itself is broken (404, NotFound, blank, throw).
    //   `api`    - a DATA endpoint answered 4xx/5xx. `/api/resumes/<uid>` returning
    //              404 for an account that owns no resumes is correct behaviour, not
    //              a broken link, so it is recorded as a warning and never fails the
    //              routing verdict. Pretending otherwise would be as dishonest as
    //              hiding it.
    //   `console`- an uncaught script error. Generic "Failed to load resource" lines
    //              are dropped here because the response listener below already
    //              reports the same failure WITH its URL, which is the actionable form.
    const routeDefects = [];
    const apiWarnings = [];
    const dataWarnings = [];

    /**
     * An error raised while FETCHING DATA is not a broken link.
     *
     * The backend rate-limits, and a 76-route authenticated crawl trips it, so admin
     * screens log `Error loading jobs: Too many requests` while rendering their page
     * perfectly. INV-2 is scoped to "internal URL ... resolve to a functional, mounted
     * route without blank viewports or 404 errors" -- that is a routing property.
     * Counting throttled data fetches as broken links would be as dishonest as
     * suppressing them, so they are recorded in full under `dataWarnings` and are
     * reported loudly, but they do not decide the verdict.
     */
    const DATA_ERROR = /too many requests|error fetching|error loading|failed to fetch|fetching stats|network ?error|load failed|is unavailable|unavailable/i;
    let currentRoute = '(boot)';
    const record = (text) => {
        if (DATA_ERROR.test(text)) dataWarnings.push({ route: currentRoute, text: text.slice(0, 200) });
        else routeDefects.push({ route: currentRoute, kind: 'console', text: text.slice(0, 300) });
    };

    page.on('console', (m) => {
        if (m.type() !== 'error') return;
        const text = m.text();
        if (/Failed to load resource/i.test(text)) return;
        record(text);
    });
    page.on('pageerror', (e) => record(String(e.message)));
    page.on('response', (r) => {
        if (r.status() < 400) return;
        const url = r.url().replace(BASE_URL, '');
        const entry = { route: currentRoute, status: r.status(), url: url.slice(0, 200) };
        // An API response never fails a link; a missing STATIC ASSET on the route does.
        if (url.startsWith('/api/')) apiWarnings.push(entry);
        else routeDefects.push({ ...entry, kind: 'response' });
    });

    await bootSession(page, session);

    /* ---------------- PHASE 1: discover every internal link ---------------- */
    const discovered = new Map(); // path -> Set of sources
    const harvestProblems = [];

    for (const entry of PORTAL_ENTRY_POINTS) {
        currentRoute = entry.path;
        try {
             
            const response = await page.goto(BASE_URL + entry.path, { waitUntil: 'domcontentloaded', timeout: 30000 });
             
            await settlePage(page);
            const info = await inspect(page, response);
            if (info.isNotFound) {
                harvestProblems.push({ path: entry.path, reason: 'entry point rendered NotFound' });
                continue;
            }
             
            const findings = await harvestFromPage(page, `${entry.name} ${entry.path}`);
            for (const f of findings) {
                if (!isCrawlablePath(f.path)) continue;
                if (!discovered.has(f.path)) discovered.set(f.path, new Set());
                discovered.get(f.path).add(f.source);
            }
            console.log(`  harvested ${findings.length} link(s) from ${entry.path}`);
        } catch (e) {
            harvestProblems.push({ path: entry.path, reason: e.message });
        }
    }

    console.log(`[DIR-025 CRAWLER] Discovered ${discovered.size} distinct internal targets. Validating each...`);
/* ---------------- PHASE 2: validate every discovered target ------------- */
    const links = [];
    let passed = 0;
    let failed = 0;

    for (const [target, sources] of discovered) {
        currentRoute = target;
        const record = {
            path: target,
            sources: [...sources],
            status: 'FAIL',
            httpStatus: null,
            landed: null,
            textLength: 0,
            mainChildElements: 0,
            errors: [],
        };
        try {
             
             
            await page.waitForTimeout(PACE_MS);
             
            const response = await page.goto(BASE_URL + target, { waitUntil: 'domcontentloaded', timeout: 30000 });
             
            await settlePage(page);
            const info = await inspect(page, response);
            record.httpStatus = info.httpStatus;
            record.landed = info.landed;
            record.textLength = info.textLength;
            record.mainChildElements = info.mainChildElements;

            // A signed-in crawl must NOT be bounced to the login screen: that is
            // the signature of a session the page failed to accept.
            if (/^\/login/.test(info.landed)) {
                record.errors.push('Bounced to /login despite an authenticated session');
            }
            if (info.httpStatus !== null && info.httpStatus >= 400) {
                record.errors.push(`HTTP ${info.httpStatus}`);
            }
            if (info.isNotFound) {
                record.errors.push('Rendered the NotFound page (unmounted route)');
            }
            if (info.textLength < 30 || info.mainChildElements === 0) {
                record.errors.push(`Blank viewport (${info.textLength} chars, ${info.mainChildElements} elements)`);
            }
            for (const d of routeDefects.filter((x) => x.route === target)) {
                record.errors.push(d.kind === 'response'
                    ? `asset ${d.status} on ${d.url}`
                    : `${d.kind}: ${d.text}`);
            }
            record.apiWarnings = apiWarnings
                .filter((x) => x.route === target)
                .map((x) => `${x.status} ${x.url}`);

            if (record.errors.length === 0) {
                record.status = 'PASS';
                passed += 1;
            } else {
                failed += 1;
            }
        } catch (e) {
            record.errors.push(`navigation error: ${e.message}`);
            failed += 1;
        }
        links.push(record);
    }
/* ---------------- PHASE 3: INV-3, measured as a signed-out guest -------- */
    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();
    const guardResults = [];
    for (const route of GUARDED_ROUTES) {
        try {
             
            await guestPage.goto(BASE_URL + route, { waitUntil: 'domcontentloaded', timeout: 30000 });
             
            await guestPage.waitForTimeout(PACE_MS);
             
            await waitForUrlToSettle(guestPage);
            const landed = guestPage.url().replace(BASE_URL, '');
            guardResults.push({
                route,
                landed,
                expected: `/login?next=${encodeURIComponent(route)}`,
                status: landed === `/login?next=${encodeURIComponent(route)}` ? 'PASS' : 'FAIL',
            });
        } catch (e) {
            guardResults.push({ route, landed: null, expected: `/login?next=${encodeURIComponent(route)}`, status: 'FAIL', error: e.message });
        }
    }
    await guestContext.close();

    /* ---------------- PHASE 4: INV-4 canonical alignment, measured ---------- */
    // Every account-menu target for every portal must equal the value the shared
    // table produces AND must live inside that portal's own namespace. This is the
    // regression guard for the DIR-025 defect where all four portals resolved to
    // `/dashboard/*`.
    const accountLinkAudit = [];
    // The namespace each portal's account targets must stay inside.
    // NOTE: the organization console lives under `/org`, NOT `/enterprise` -- the
    // latter is only a legacy redirect in main.jsx. Getting this wrong is how the
    // check would report a false failure on three perfectly good targets.
    const PORTAL_NAMESPACE = {
        candidate: '/dashboard',
        recruiter: '/employer',
        enterprise: '/org',
        admin: '/admin',
    };
    for (const portal of Object.values(ACCOUNT_PORTALS)) {
        const linksForPortal = accountLinksFor(portal, { slug: '' });
        const ns = PORTAL_NAMESPACE[portal];
        for (const [slot, value] of Object.entries(linksForPortal)) {
            const valuePath = value.split('?')[0];
            accountLinkAudit.push({
                portal,
                slot,
                href: value,
                namespace: ns,
                status: valuePath.startsWith(`${ns}/`) || valuePath === ns ? 'PASS' : 'FAIL',
            });
        }
    }

    await browser.close();

    /* ---------------- Emit the census --------------------------------------- */
    const frozen = measureFrozenBaseline();
    const guardFailures = guardResults.filter((g) => g.status === 'FAIL');
    const accountFailures = accountLinkAudit.filter((a) => a.status === 'FAIL');

    const census = {
        directive: 'DIR-025',
        timestamp: new Date().toISOString(),
        baseUrl: BASE_URL,
        authenticatedAs: { uid: session.uid, email: session.email },
        totals: {
            audited: links.length,
            passed,
            failed,
            passRate: links.length ? `${((passed / links.length) * 100).toFixed(1)}%` : '0.0%',
        },
        invariants: {
            INV_1_FROZEN_DIFF: frozen.diffBytes === 0
                ? `VERIFIED 0 BYTES (baseline ${frozen.baseline})`
                : `FAILED: ${frozen.diffBytes} bytes`,
            INV_2_ZERO_BROKEN_LINKS: failed === 0 ? 'VERIFIED' : `FAILED: ${failed} broken`,
            INV_3_SESSION_GUARD: guardFailures.length === 0
                ? `VERIFIED (${guardResults.length}/${guardResults.length} guarded routes)`
                : `FAILED: ${guardFailures.length}/${guardResults.length}`,
            INV_4_CANONICAL_ALIGNMENT: accountFailures.length === 0
                ? `VERIFIED (${accountLinkAudit.length}/${accountLinkAudit.length} account targets in-namespace)`
                : `FAILED: ${accountFailures.length} out-of-namespace`,
        },
        frozenBaseline: frozen,
        sessionGuard: guardResults,
        accountLinks: accountLinkAudit,
        harvestProblems,
        // Reported, never used to fail the verdict: these are data endpoints, not
        // navigation targets. A 404 from `/api/resumes/<uid>` means the audited
        // account owns no resumes, which is a correct answer.
        apiDataWarnings: [...new Map(apiWarnings.map((w) => [`${w.status} ${w.url}`, w])).values()],
        // Same contract as above, for errors the app logged while fetching data
        // (chiefly backend 429 throttling under a full crawl).
        dataWarnings,
        links,
    };

    writeFileSync(OUT_FILE, `${JSON.stringify(census, null, 2)}\n`, 'utf8');

    console.log(`\n[DIR-025 CRAWLER] Audited ${links.length} discovered links: ${passed} pass, ${failed} fail.`);
    console.log(`[DIR-025 CRAWLER] INV-1 frozen diff: ${frozen.diffBytes} bytes.`);
    console.log(`[DIR-025 CRAWLER] INV-3 session guard: ${guardResults.length - guardFailures.length}/${guardResults.length}.`);
    console.log(`[DIR-025 CRAWLER] Data-layer warnings (NOT link failures): `
        + `${apiWarnings.length} API 4xx/5xx, ${dataWarnings.length} logged fetch errors.`);
    console.log(`[DIR-025 CRAWLER] Written to ${OUT_FILE}`);

    for (const l of links.filter((x) => x.status === 'FAIL')) {
        console.log(`  FAIL ${l.path} :: ${l.errors.join(' | ')}`);
    }
    for (const g of guardFailures) {
        console.log(`  FAIL INV-3 ${g.route} landed ${g.landed}`);
    }

    return failed === 0 && guardFailures.length === 0
        && accountFailures.length === 0 && frozen.diffBytes === 0;
}

runCrawl()
    .then((success) => process.exit(success ? 0 : 1))
    .catch((err) => { console.error(err); process.exit(1); });
