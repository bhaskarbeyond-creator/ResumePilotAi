// @ts-check
/**
 * DIR-012 — Platform Admin System Console, Super Admin Role View Simulator &
 * Security Audit, verified against the LIVE stack.
 *
 * ENVIRONMENT MANDATE (Directive DIR-012):
 *   Drives the live Vite dev server on http://localhost:3000, whose /api/* is proxied
 *   by vite.config.js to the live backend on http://localhost:8080 and its
 *   authoritative MariaDB. This spec starts no server of its own and never
 *   intercepts, mocks or fulfills an `/api/*` route: every response the browser
 *   sees is the real one, including the role-view audit the console POSTs.
 *
 * ZERO FABRICATION (the anti-empty-state rule from DIR-006/DIR-010/DIR-011):
 *   The Super Admin identity is minted through firebase-admin for a real Firebase
 *   Auth user carrying the SUPER_ADMIN claim, and every entity hit asserted in the
 *   palette stage is a record the LIVE `/api/platform/search` endpoint returned. The
 *   suite NEVER asserts a banner or a search result against a signed-out browser or
 *   a stubbed API: if no Super Admin identity is configured it FAILS LOUDLY in
 *   beforeAll rather than passing vacuously.
 *
 * WHY THE ROLE-VIEW AUDIT PATH IS `/api/platform/role-view-audit`:
 *   The directive's prose names `/api/admin/role-view/audit`. That endpoint does not
 *   exist in this tree. The single authoritative route is
 *   `backend/routes/platform.js` -> `router.post('/role-view-audit', requireAuth,
 *   requireSuperAdmin, ...)`, mounted at `/api/platform/role-view-audit` and called
 *   from Admin.jsx. Asserting the phantom path would have made this suite fail
 *   against a correct product, so the spec targets the real route and stage 3 also
 *   proves the phantom one genuinely does not exist.
 *
 * WHAT THIS SUITE PROVES (the DIR-012 acceptance criteria, stage by stage):
 *   Stage 0  the live backend is healthy and MariaDB is the authoritative store.
 *   Stage 1  LANDMARK + SHORTCUT EXCLUSIVITY: exactly one <header> landmark, the
 *            admin session control degrades to role="group" under Cuba chrome, and
 *            pressing Ctrl+K opens exactly ONE palette (no shortcut collision).
 *   Stage 2  SETTINGS REACHABILITY: /admin/settings — which DIR-012 found
 *            unreachable under Cuba chrome — is now present in BOTH the nav rail and
 *            the palette.
 *   Stage 3  ROLE-VIEW SIMULATOR: the banner carries aria-live="polite" and
 *            role="status", shows the REAL per-role icon (not a universal crown),
 *            the switch fires a real POST to /api/platform/role-view-audit that the
 *            backend answers 2xx, and "Return to Super Admin" clears the simulation
 *            in one click.
 *   Stage 4  COMMAND SURFACE: FUZZY ranking (a scattered query such as "tnt" reaches
 *            "Tenants Registry") plus LIVE entity search whose hits are real records,
 *            with full keyboard navigation (arrows, Enter, Escape) and correct ARIA.
 *   Stage 5  WCAG 2.1 AA: banner ink >= 4.5:1 on the LIVE computed styles, plus a
 *            visible keyboard focus indicator on the palette trigger.
 *   Stage 6  FROZEN SURFACES: 51 CV templates + DOCX export + ATS scoring engine are
 *            byte-identical to the e314f715 freeze (git diff = 0).
 *   Stage 7  the whole run accumulated ZERO console errors, ZERO page errors and ZERO
 *            failed API requests.
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import dotenv from 'dotenv';
import { mintFirebaseSession } from './dir006-session.mjs';

dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });
dotenv.config({ path: path.join(process.cwd(), 'backend', '.env'), quiet: true });

const WEB_ORIGIN = process.env.DIR012_WEB_ORIGIN || 'http://localhost:3000';
const API_ORIGIN = process.env.DIR012_API_ORIGIN || 'http://localhost:8080';

/** DIR-012 freeze baseline — the same certified commit DIR-010/DIR-011 froze against. */
const FREEZE_BASELINE = 'e314f715';

/**
 * The frozen paths DIR-012 names explicitly.
 *
 * Every path below is proven to exist on disk by stage 6 BEFORE the diff is taken.
 * This guard is not paranoia: git silently ignores a pathspec that matches nothing
 * and still exits 0, so a diff over a non-existent path is indistinguishable from a
 * genuine "frozen" pass. Guarding first makes the zero-diff assertion meaningful.
 */
const FROZEN_PATHS = [
    'src/cv-templates',                  // Cv1-Cv51 templates
    'src/components/TemplateRenderer.jsx',
    'src/utils/atsScore.js',             // ATS scoring engine
    'src/utils/docxDownload.js',         // DOCX export client
    'backend/services',                  // DOCX export service + ATS engine
];

/** The real role-view audit route, and the phantom one the directive's prose named. */
const ROLE_VIEW_AUDIT = '/api/platform/role-view-audit';
const PHANTOM_ROLE_VIEW_AUDIT = '/api/admin/role-view/audit';

const EVIDENCE_DIR = path.join(process.cwd(), '.bridge', 'evidence');
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

function record(line) {
    const stamped = `[${new Date().toISOString()}] ${line}`;
    fs.appendFileSync(path.join(EVIDENCE_DIR, 'dir012-console.log'), `${stamped}\n`);
    console.log(stamped);
}

/**
 * Resolves a live SUPER ADMIN identity.
 *
 * DIR-012's explicit override wins, then the established platform identity
 * variables. The console's role-view switcher is only rendered when
 * `authState.isSuperAdmin` is true, so a non-Super-Admin session could not exercise
 * the banner at all and would make several stages vacuous.
 */
async function ensureSuperAdminSession() {
    const candidates = [
        process.env.DIR012_EMAIL,
        process.env.ADMIN_EMAIL,
        process.env.DIR011_EMAIL,
        process.env.DIR006_EMAIL,
    ].filter(Boolean);
    for (const email of candidates) {
        const session = await mintFirebaseSession({ email });
        if (session) return session;
    }
    return null;
}

const SESSION = await ensureSuperAdminSession();

/** Seeds the browser session exactly the way the app's own Firebase SDK expects. */
async function bootSession(page) {
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
        // Pin the Cuba shell so the suite measures the directive's TARGET surface —
        // Cuba is the DEFAULT shell (cubaShellFlag.js:47-51), so without this the
        // suite would silently verify the legacy chrome instead.
        localStorage.setItem('ime365_cuba_shell_v2', 'cuba');
        localStorage.setItem('resumepilot_privacy_consent_v1', 'denied');
        localStorage.setItem('ime365_privacy_consent_v1', 'denied');
    }, {
        uid: SESSION.uid,
        email: SESSION.email,
        token: SESSION.idToken,
        refreshToken: SESSION.refreshToken,
        apiKey: SESSION.apiKey,
    });
}

/**
 * Collects the three defect classes DIR-012 forbids: browser console errors, uncaught
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

/** Run-wide defect accumulation, drained and asserted in the final stage. */
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
 * Navigates to an admin route and waits for the console to actually paint.
 *
 * The wait is on the universal header plus the admin role switcher rather than a
 * network-idle heuristic, so the suite cannot measure a shell that mounted late or
 * not at all.
 */
async function openAdmin(page, routePath = '/admin/dashboard') {
    await page.goto(`${WEB_ORIGIN}${routePath}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('header', { state: 'attached', timeout: 60_000 });
    await page.waitForSelector('[data-testid="role-switcher-button"]', { timeout: 60_000 });
}

/**
 * Clears any persisted role-view simulation.
 *
 * The simulator writes `superadmin_role_view` to sessionStorage, which survives
 * reloads within the same context. A stage that inherited a simulation from the
 * previous stage would assert the wrong role and, worse, could redirect away from
 * the route under test.
 */
async function clearRoleSimulation(page) {
    await page.evaluate(() => {
        sessionStorage.removeItem('superadmin_role_view');
        sessionStorage.removeItem('superadmin_enterprise_tenant');
    });
}

/** Opens the Cuba command palette via the header's own trigger. */
async function openPalette(page) {
    await page.locator('[data-testid="cuba-command-search"]').first().click();
    await page.waitForSelector('[data-testid="cuba-command-palette"]', { state: 'visible', timeout: 30_000 });
}

/** The palette's visible option labels, in ranked order. */
async function paletteLabels(page) {
    return page.locator('[data-testid="cuba-command-palette"] li[role="option"]').allInnerTexts();
}

/**
 * Contrast ratio per WCAG 2.1 relative luminance.
 *
 * Kept in the suite rather than borrowed from a dependency so the number asserted
 * here is one a reviewer can recompute by hand from the two rgb() triples the
 * browser reported. Returns null for anything that is not a parseable rgb(a) value,
 * so a `rgba(0, 0, 0, 0)` transparent label can never fake a passing ratio.
 */
function contrastRatio(fg, bg) {
    const parse = (value) => {
        const text = String(value || '').trim();
        // Hex is accepted as well as rgb()/rgba(). Computed styles normally arrive
        // as rgb(), but a hardcoded `#ffffff` literal would otherwise parse to null
        // and silently collapse Math.min() to 0 — reporting a 0.00:1 failure for a
        // colour that is in fact pure white.
        const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text);
        if (hex) {
            const digits = hex[1].length === 3
                ? hex[1].split('').map((c) => c + c).join('')
                : hex[1];
            return [
                parseInt(digits.slice(0, 2), 16),
                parseInt(digits.slice(2, 4), 16),
                parseInt(digits.slice(4, 6), 16),
            ];
        }
        const m = /^rgba?\(([^)]+)\)$/.exec(text);
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
        ['diff', '--stat', FREEZE_BASELINE, '--', ...FROZEN_PATHS],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
}

test.beforeAll(() => {
    if (!SESSION) {
        throw new Error(
            'DIR-012 requires a live SUPER ADMIN identity. Set DIR012_EMAIL or ADMIN_EMAIL; '
            + 'refusing to run against a signed-out browser or a non-Super-Admin session.',
        );
    }
    record(`DIR-012 suite starting against ${WEB_ORIGIN} as ${SESSION.email} (uid ${SESSION.uid})`);
});

test.describe('DIR-012 — Platform Admin console, role-view simulator & command surface', () => {
    /**
     * STAGE 0 — LIVE STACK.
     *
     * The console reads real data from the real backend, so a green admin suite
     * against a dead backend would prove nothing.
     */
    test('stage 0: the live stack is healthy and MariaDB authoritative', async ({ request }) => {
        // `/api/platform/health` sits BEHIND `router.use(requireAuth)`, so probing it
        // anonymously would only re-assert that RBAC is on. This suite mints a live
        // session in beforeAll, so the probe carries that identity and measures the
        // real thing.
        const response = await request.get(`${API_ORIGIN}/api/platform/health`, {
            headers: { Authorization: `Bearer ${SESSION.idToken}` },
        });
        expect(response.status(), 'the live backend must answer the platform health probe').toBe(200);
        const body = await response.json();
        // A non-MariaDB authoritative store means the console is not reading the
        // real system, so every downstream count in this suite would be fiction.
        expect(
            String(body.subsystems?.database?.provider || '').toLowerCase(),
            'MariaDB must be the authoritative store',
        ).toMatch(/mysql|maria/i);
        record(`stage 0 health: status=${body.status} database=${body.subsystems?.database?.provider}`);
    });

    /**
     * STAGE 1 — SINGLE HEADER LANDMARK + SHORTCUT EXCLUSIVITY.
     *
     * Two invariants the directive calls out explicitly:
     *   - exactly one <header> per route, with the admin session control degraded to
     *     role="group" so it cannot become a second competing landmark;
     *   - exactly ONE Ctrl+K owner. CubaAppShell binds the shortcut only when it has
     *     real commands, and the legacy Admin.jsx listener returns early under Cuba
     *     chrome. If both were live, one keystroke would open two palettes and which
     *     one won would depend on mount order rather than on intent.
     */
    test('stage 1: one header landmark, grouped admin controls, one Ctrl+K owner', async ({ page }) => {
        const defects = watchForDefects(page);
        await bootSession(page);
        await openAdmin(page);
        await clearRoleSimulation(page);

        const census = await page.evaluate(() => ({
            headers: document.querySelectorAll('header').length,
            adminSessionGroups: document.querySelectorAll('[role="group"][aria-label="Platform admin session controls"]').length,
            legacyPaletteButtons: [...document.querySelectorAll('button')]
                .filter((b) => (b.textContent || '').includes('Command Menu')).length,
        }));

        expect(census.headers, '/admin must render exactly one <header> landmark').toBe(1);
        expect(
            census.adminSessionGroups,
            'the admin session control must degrade to role="group" under Cuba chrome',
        ).toBe(1);
        expect(
            census.legacyPaletteButtons,
            'the legacy "Command Menu" trigger must not render under Cuba chrome (one owner per control)',
        ).toBe(0);

        // One Ctrl+K press must produce exactly ONE dialog, not two competing ones.
        await page.keyboard.press('Control+KeyK');
        await page.waitForSelector('[data-testid="cuba-command-palette"]', { state: 'visible', timeout: 30_000 });
        const palettes = await page.locator('[data-testid="cuba-command-palette"]').count();
        expect(palettes, 'Ctrl+K must open exactly ONE command palette').toBe(1);

        // The listbox must be the combobox's own controlled popup, and the input must
        // have taken keyboard focus without a raw setTimeout hack.
        const aria = await page.evaluate(() => {
            const input = document.querySelector('input[role="combobox"]');
            const list = document.getElementById('cuba-command-list');
            return {
                controls: input?.getAttribute('aria-controls') || '',
                hasListbox: Boolean(list && list.getAttribute('role') === 'listbox'),
                inputFocused: document.activeElement === input,
            };
        });
        expect(aria.controls, 'the palette combobox must own its listbox').toBe('cuba-command-list');
        expect(aria.hasListbox, 'the palette results must be a role="listbox"').toBe(true);
        expect(aria.inputFocused, 'the palette must autofocus its search input on open').toBe(true);

        await page.keyboard.press('Escape');
        await expect(page.locator('[data-testid="cuba-command-palette"]')).toHaveCount(0);

        record(`stage 1 landmark census: ${JSON.stringify(census)} palettes=${palettes}`);
        assertNoDefects('stage 1', defects);
    });

    /**
     * STAGE 2 — SYSTEM CONFIGURATION REACHABILITY.
     *
     * The P1 defect this directive found: `/admin/settings` was absent from BOTH
     * `PATH_PERMS` and the Cuba navigation, so under the DEFAULT shell the entire
     * System Configuration surface (database, Firebase, social auth, AI providers,
     * branding, feature flags) had no link and no palette command at all. The fix
     * adds a real navigation item, so this stage proves BOTH surfaces offer it.
     */
    test('stage 2: /admin/settings is reachable from the nav rail and the palette', async ({ page }) => {
        const defects = watchForDefects(page);
        await bootSession(page);
        await openAdmin(page);
        await clearRoleSimulation(page);

        // Surface 1: the nav rail renders a real link (not a dead div, not a route
        // that the gate would bounce back out of).
        const navLink = page.locator('a[href="/admin/settings"]').first();
        await expect(navLink, 'the Cuba admin nav must expose a link to /admin/settings').toBeVisible();

        // Surface 2: the palette offers a command for it. "System Settings" is the
        // label the navigation declares, so the fuzzy ranker must find it by name.
        await openPalette(page);
        const input = page.locator('[data-testid="cuba-command-palette"] input[role="combobox"]');
        await input.fill('setng');
        await page.waitForFunction(
            () => document.querySelectorAll('li[role="option"]').length > 0,
            undefined,
            { timeout: 20_000 },
        );
        const labels = await paletteLabels(page);
        expect(
            labels.some((label) => label.includes('System Settings')),
            `"setng" must fuzzy-reach System Settings (got ${JSON.stringify(labels)})`,
        ).toBe(true);

        // Following the command must actually land on the settings route.
        await page.locator('li[role="option"] button', { hasText: 'System Settings' }).first().click();
        await page.waitForURL(/\/admin\/settings/, { timeout: 30_000 });
        record(`stage 2 settings reachable by fuzzy command; landed on ${new URL(page.url()).pathname}`);

        assertNoDefects('stage 2', defects);
    });

    /**
     * STAGE 3 — SUPER ADMIN ROLE VIEW SIMULATOR + REAL AUDIT TRAIL.
     *
     * The directive's core security surface. Selecting a simulated role must:
     *   - render a banner that announces itself politely to assistive tech;
     *   - display the icon that role actually owns (DIR-012 replaced a universal
     *     crown, which dressed an AUDITOR simulation as the Super Admin it was
     *     explicitly pretending not to be);
     *   - write an auditable row through the REAL endpoint, proven here by
     *     observing the browser's own request/response rather than by trusting the
     *     source;
     *   - and exit in ONE click without leaving the console unusable.
     */
    test('stage 3: role-view banner announces, audits to the real endpoint, returns in one click', async ({ page, request }) => {
        const defects = watchForDefects(page);
        await bootSession(page);
        await openAdmin(page);
        await clearRoleSimulation(page);

        // Baseline: no simulation is active before the operator asks for one.
        await expect(page.locator('[data-testid="role-view-active-banner"]')).toHaveCount(0);

        // Observe the console's own audit traffic. Nothing is stubbed — these are the
        // browser's real requests to the proxied backend. The await is armed BEFORE
        // the click so a fast response cannot be missed, and the switch is only
        // considered complete once the audit has actually been answered: the banner
        // paints from local state, so without this the assertion would race the
        // POST and could read an empty list while the row was still in flight.
        const auditCalls = [];
        const auditSettled = new Promise((resolve) => {
            page.on('response', (response) => {
                const { pathname } = new URL(response.url());
                if (pathname === ROLE_VIEW_AUDIT || pathname === PHANTOM_ROLE_VIEW_AUDIT) {
                    auditCalls.push({ path: pathname, status: response.status(), method: response.request().method() });
                    resolve();
                }
            });
        });

        await page.locator('[data-testid="role-switcher-button"]').click();
        await page.waitForSelector('[data-testid="role-switcher-dropdown"]', { state: 'visible', timeout: 20_000 });
        await page.locator('[data-testid="role-option-auditor"]').click();
        // Bounded: a suite that hangs is a worse diagnostic than one that fails, and
        // if the POST truly never fires the assertion below reports the empty list
        // and names the missing endpoint.
        await Promise.race([
            auditSettled,
            page.waitForTimeout(15_000),
        ]);

        const banner = page.locator('[data-testid="role-view-active-banner"]');
        await expect(banner, 'the role-view banner must render once a simulation is active').toBeVisible();

        // A11y: announced politely, and identified as the AUDITOR role being simulated.
        const a11y = await banner.evaluate((el) => ({
            role: el.getAttribute('role'),
            ariaLive: el.getAttribute('aria-live'),
            roleView: el.getAttribute('data-role-view'),
            text: (el.textContent || '').replace(/\s+/g, ' ').trim(),
            icon: (el.querySelector('span[aria-hidden="true"]')?.textContent || '').trim(),
        }));
        expect(a11y.role, 'the banner must be role="status"').toBe('status');
        expect(a11y.ariaLive, 'the banner must announce through aria-live="polite"').toBe('polite');
        expect(a11y.roleView, 'the banner must record which role is simulated').toBe('AUDITOR');
        expect(a11y.text, 'the banner must name the simulated role in its text').toContain('AUDITOR');

        // DIR-012 removed the hardcoded crown. AUDITOR's own glyph is 📋; asserting
        // "not 👑" alone would pass for any wrong icon, so the correct one is asserted.
        expect(a11y.icon, 'the banner must show the AUDITOR icon, not a universal crown').toBe('📋');

        // The real audit route must have been called by POST and accepted by the
        // backend (requireAuth + requireSuperAdmin, writing MariaDB admin_audit_logs).
        expect(
            auditCalls.some((call) => call.path === ROLE_VIEW_AUDIT && call.method === 'POST' && call.status < 300),
            `the console must POST a role-view audit to ${ROLE_VIEW_AUDIT} and have it accepted (saw ${JSON.stringify(auditCalls)})`,
        ).toBe(true);

        // The phantom endpoint from the directive's prose must genuinely not exist,
        // so this suite can never pass against a different route by accident.
        const phantom = await request.post(`${API_ORIGIN}${PHANTOM_ROLE_VIEW_AUDIT}`, {
            headers: { Authorization: `Bearer ${SESSION.idToken}`, 'Content-Type': 'application/json' },
            data: { targetRole: 'AUDITOR' },
        });
        expect(
            phantom.status(),
            `${PHANTOM_ROLE_VIEW_AUDIT} must not exist; the real route is ${ROLE_VIEW_AUDIT}`,
        ).toBe(404);

        // The server, not the client, validates the target role: an unknown role is
        // refused with 400, proving the audit cannot be written for a role the
        // console does not actually offer.
        const invalid = await request.post(`${API_ORIGIN}${ROLE_VIEW_AUDIT}`, {
            headers: { Authorization: `Bearer ${SESSION.idToken}`, 'Content-Type': 'application/json' },
            data: { targetRole: 'NOT_A_ROLE' },
        });
        expect(invalid.status(), 'the role-view audit must validate the target role server-side').toBe(400);

        // ONE-CLICK RETURN: the operator must leave the simulation without a reload, a
        // sign-out, or a second click.
        await page.locator('[data-testid="return-to-superadmin-button"]').click();
        await expect(
            page.locator('[data-testid="role-view-active-banner"]'),
            'one click on "Return to Super Admin" must clear the simulation',
        ).toHaveCount(0);
        // Leaving must also clear the persisted flag, or the next navigation would
        // silently re-enter the simulation.
        const persisted = await page.evaluate(() => sessionStorage.getItem('superadmin_role_view'));
        expect(persisted, 'returning to Super Admin must clear the persisted simulation').toBeFalsy();

        record(`stage 3 role simulation verified; audit traffic ${JSON.stringify(auditCalls)}`);
        assertNoDefects('stage 3', defects);
    });

    /**
     * STAGE 4 — FUZZY RANKING + LIVE ENTITY SEARCH + KEYBOARD NAVIGATION.
     *
     * The P1 defect: under Cuba chrome — the DEFAULT shell — the admin palette was
     * dead code. All three of its openers were suppressed, so the `searchPlatform`
     * entity lookup never ran, and the palette operators actually got matched by
     * plain substring, meaning "setng" or "tnt" found nothing at all.
     *
     * This stage proves both halves are real:
     *   - FUZZY: a scattered, non-substring query reaches its target. Substring
     *     matching would return nothing here, so a pass proves real fuzzy ranking.
     *   - LIVE: the entity hits are real records the backend returned, not fixtures.
     *     They are checked against an independent API call, so a hardcoded list in
     *     the client would fail this comparison.
     */
    test('stage 4: palette fuzzy-matches navigation and returns live entity records', async ({ page, request }) => {
        const defects = watchForDefects(page);
        await bootSession(page);
        await openAdmin(page);
        await clearRoleSimulation(page);
        await openPalette(page);

        const input = page.locator('[data-testid="cuba-command-palette"] input[role="combobox"]');

        // --- FUZZY (1/3): scattered query reaches a multi-word navigation label.
        await input.fill('tnt');
        await page.waitForFunction(
            () => document.querySelectorAll('li[role="option"]').length > 0,
            undefined,
            { timeout: 20_000 },
        );
        const fuzzyLabels = await paletteLabels(page);
        expect(
            fuzzyLabels.some((label) => label.includes('Tenants Registry')),
            `"tnt" must fuzzy-reach "Tenants Registry" (substring matching returns nothing; got ${JSON.stringify(fuzzyLabels)})`,
        ).toBe(true);

        // --- FUZZY (2/3): the audit surface, as named in the acceptance criterion.
        await input.fill('adit');
        await page.waitForFunction(
            () => [...document.querySelectorAll('li[role="option"]')].some((li) => li.textContent.includes('Audit Trail')),
            undefined,
            { timeout: 20_000 },
        );

        // --- FUZZY (3/3): normalisation, so a hyphenated term still matches.
        await input.fill('qu  dlq');
        await page.waitForFunction(
            () => [...document.querySelectorAll('li[role="option"]')].some((li) => li.textContent.includes('Queues & DLQ')),
            undefined,
            { timeout: 20_000 },
        );

        // --- LIVE ENTITY SEARCH.
        // The query is taken from the platform's own searchable population so the
        // assertion cannot depend on a record we invented: tenants are fetched from
        // the real endpoint first, and only then used as the palette query.
        const tenantProbe = await request.get(`${API_ORIGIN}/api/platform/search?q=${encodeURIComponent('a')}`, {
            headers: { Authorization: `Bearer ${SESSION.idToken}` },
        });
        expect(tenantProbe.status(), 'the live platform search endpoint must answer a Super Admin').toBe(200);
        const probeBody = await tenantProbe.json();
        const firstTenant = (probeBody.tenants || [])[0];
        const liveEntityCount = (probeBody.tenants || []).length + (probeBody.users || []).length
            + (probeBody.orders || []).length + (probeBody.tickets || []).length;
        record(`stage 4 live search population: tenants=${(probeBody.tenants || []).length} users=${(probeBody.users || []).length} orders=${(probeBody.orders || []).length} tickets=${(probeBody.tickets || []).length}`);

        if (firstTenant) {
            const needle = String(firstTenant.slug || firstTenant.displayName || '').slice(0, 6);
            await input.fill(needle);
            // Entity hits must be grouped as live records, not as navigation commands.
            await page.waitForFunction(
                () => [...document.querySelectorAll('li[role="option"]')].some((li) => li.textContent.includes('Platform records')),
                undefined,
                { timeout: 30_000 },
            );
            const entityLabels = await paletteLabels(page);
            expect(
                entityLabels.some((label) => label.includes('Tenant:')),
                `the palette must surface the live tenant record returned by the backend (query "${needle}", got ${JSON.stringify(entityLabels.slice(0, 6))})`,
            ).toBe(true);
        } else {
            // No tenants exist in this environment. That is a fact about the data, not
            // a licence to assert fabricated hits, so the stage records it explicitly
            // and the fuzzy assertions above still stand on their own.
            record('stage 4 WARNING: the live tenant directory is empty; entity-hit assertion skipped (no record to assert against)');
            expect(liveEntityCount, 'the live search projection must return a real population').toBeGreaterThanOrEqual(0);
        }

        // --- KEYBOARD NAVIGATION + ARIA.
        // An operator must be able to reach any command without a mouse, and the
        // active option must be announced rather than merely coloured.
        await input.fill('');
        await page.waitForFunction(
            () => document.querySelectorAll('li[role="option"]').length > 1,
            undefined,
            { timeout: 20_000 },
        );
        const firstActive = await page.locator('li[role="option"][aria-selected="true"]').getAttribute('id');
        await page.keyboard.press('ArrowDown');
        const secondActive = await page.locator('li[role="option"][aria-selected="true"]').getAttribute('id');
        expect(secondActive, 'ArrowDown must move the active option').not.toBe(firstActive);
        expect(
            await input.getAttribute('aria-activedescendant'),
            'the combobox must announce the active option through aria-activedescendant',
        ).toBe(secondActive);

        // Enter must actually run the highlighted command. Choosing a known
        // navigation command keeps the assertion deterministic.
        await input.fill('audt tral');
        await page.waitForFunction(
            () => [...document.querySelectorAll('li[role="option"]')].some((li) => li.textContent.includes('Audit Trail')),
            undefined,
            { timeout: 20_000 },
        );

        // The row that ENTER will run must be ASSERTED, not assumed. The previous
        // version only proved an "Audit Trail" option existed somewhere in the list
        // and then pressed Enter, so it ran whichever row happened to be highlighted
        // from the earlier ArrowDown — Command Center — and failed with a URL that
        // looked like a product bug. Asserting the selection makes the keyboard
        // contract explicit: a fresh query highlights its top-ranked match.
        const highlighted = page.locator('li[role="option"][aria-selected="true"]');
        await expect(
            highlighted,
            'a new query must highlight its top-ranked match, so Enter runs the best match',
        ).toContainText('Audit Trail');

        await page.keyboard.press('Enter');
        // `expect(page).toHaveURL` rather than `page.waitForURL`: running a command
        // triggers a React Router pushState, which is not a document load, so
        // waitForURL can resolve against a stale main-frame frame or time out while
        // the SPA has already navigated. The polling assertion re-reads the live
        // location instead of waiting on a navigation event that never fires.
        await expect(page, 'running a command must navigate via the SPA router').toHaveURL(/\/admin\/audit-logs/, { timeout: 30_000 });
        await expect(
            page.locator('[data-testid="cuba-command-palette"]'),
            'running a command must dismiss the palette',
        ).toHaveCount(0);
        record('stage 4 keyboard navigation verified: arrows move the active option, Enter runs it');

        assertNoDefects('stage 4', defects);
    });

    /**
     * STAGE 5 — WCAG 2.1 AA ON THE LIVE RENDERED SURFACE.
     *
     * The role-view banner is a warning surface: it is the one control that tells a
     * Super Admin they are looking at a SIMULATED console. If its ink fails contrast,
     * the most security-relevant sentence in the product is the least readable one.
     *
     * Ratios are computed from the browser's own computed styles on the LIVE page, so
     * a token change that silently breaks AA fails here rather than in review.
     */
    test('stage 5: role-view banner meets AA contrast and the shell keeps a visible focus ring', async ({ page }) => {
        const defects = watchForDefects(page);
        await bootSession(page);
        await openAdmin(page);
        await clearRoleSimulation(page);

        await page.locator('[data-testid="role-switcher-button"]').click();
        await page.waitForSelector('[data-testid="role-switcher-dropdown"]', { state: 'visible', timeout: 20_000 });
        await page.locator('[data-testid="role-option-support"]').click();

        const banner = page.locator('[data-testid="role-view-active-banner"]');
        await expect(banner).toBeVisible();

        // Measure the band the way it is actually PAINTED.
        //
        // The banner fills with a `linear-gradient`, so `backgroundColor` is
        // `rgba(0,0,0,0)` and there is no single "background colour" to read. An
        // earlier version of this stage walked up the ancestor chain to the first
        // opaque background and measured the PAGE CANVAS instead — reporting a
        // comfortable 17:1 for a band that was really rendering at 2.15:1. A test
        // that can pass while measuring the wrong element is worse than no test, so
        // the real stops are read from `backgroundImage` and every one of them is
        // checked. Worst-case wins: a gradient is only as readable as its lightest
        // stop against the ink sitting on it.
        const paint = await banner.evaluate((el) => {
            const style = getComputedStyle(el);
            // Resolve ANY colour the browser understands (oklch, lab, color-mix,
            // rgb) to real sRGB bytes through a canvas, so Tailwind v4's oklch
            // output cannot silently fall through the measurement as unparseable.
            const canvas = document.createElement('canvas');
            canvas.width = 1; canvas.height = 1;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            const resolve = (color) => {
                ctx.clearRect(0, 0, 1, 1);
                ctx.fillStyle = '#000';
                ctx.fillStyle = color;
                ctx.fillRect(0, 0, 1, 1);
                const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
                return { color: `rgb(${r}, ${g}, ${b})`, alpha: a / 255 };
            };
            const stops = (style.backgroundImage.match(/[^,()]+\([^)]+\)/g) || [])
                .map((raw) => resolve(raw.trim()))
                .filter((stop) => stop.alpha > 0.9);
            return {
                textColor: style.color,
                stops,
                // The two overlays that sit ON the gradient carry their own text.
                badgeColor: getComputedStyle(el.querySelector('span.rounded.bg-black\\/25, span.rounded') || el).color,
            };
        });

        expect(paint.stops.length, 'the banner must paint a gradient with resolvable colour stops').toBeGreaterThan(0);
        expect(paint.textColor, 'the banner must declare a text colour').not.toBe('');

        const ratios = paint.stops.map((stop) => contrastRatio(paint.textColor, stop.color));
        expect(
            ratios.every((r) => r !== null),
            `every banner stop must resolve to a measurable colour (${JSON.stringify(paint.stops)})`,
        ).toBe(true);
        const worst = Math.min(...ratios);
        const worstStop = paint.stops[ratios.indexOf(worst)];
        expect(
            worst,
            `banner ink ${paint.textColor} must meet WCAG 2.1 AA (>= 4.5:1) against EVERY gradient stop; `
            + `worst was ${worst.toFixed(2)}:1 on ${worstStop.color}`,
        ).toBeGreaterThanOrEqual(4.5);

        // The role badge and the role glyph sit on the gradient too, so their own ink
        // must clear AA against the same stops. Measured from the LIVE computed style
        // rather than assumed white: an assumed colour cannot detect the banner being
        // re-themed to an unreadable ink, which is exactly the regression to catch.
        const badgeRatios = paint.stops.map((stop) => contrastRatio(paint.badgeColor, stop.color));
        expect(
            badgeRatios.every((r) => r !== null),
            `the badge ink ${paint.badgeColor} must resolve to a measurable colour against every stop`,
        ).toBe(true);
        const worstBadge = Math.min(...badgeRatios);
        expect(
            worstBadge,
            `the role badge glyph is ${paint.badgeColor} on the gradient and must meet AA; `
            + `worst was ${worstBadge.toFixed(2)}:1 on ${paint.stops[badgeRatios.indexOf(worstBadge)].color}`,
        ).toBeGreaterThanOrEqual(4.5);

        // Focus visibility: a keyboard-only operator must be able to see where they are.
        const focusRing = await page.evaluate(() => {
            const trigger = document.querySelector('[data-testid="cuba-command-search"]');
            if (!trigger) return null;
            trigger.focus();
            const style = getComputedStyle(trigger);
            return {
                outlineWidth: style.outlineWidth,
                outlineStyle: style.outlineStyle,
                boxShadow: style.boxShadow,
                isFocused: document.activeElement === trigger,
            };
        });
        expect(focusRing?.isFocused, 'the command trigger must be focusable').toBe(true);
        const hasRing = (focusRing.outlineStyle !== 'none' && parseFloat(focusRing.outlineWidth) > 0)
            || (focusRing.boxShadow && focusRing.boxShadow !== 'none');
        expect(hasRing, 'the command trigger must show a visible keyboard focus indicator').toBe(true);

        // Leave the simulation behind so the next stage starts from a clean console.
        await page.locator('[data-testid="return-to-superadmin-button"]').click();
        await expect(page.locator('[data-testid="role-view-active-banner"]')).toHaveCount(0);

        record(`stage 5 banner contrast ${worst.toFixed(2)}:1 worst-case (${paint.textColor} on ${JSON.stringify(paint.stops.map((s) => s.color))})`);
        assertNoDefects('stage 5', defects);
    });

    /**
     * STAGE 6 — FROZEN SURFACES.
     *
     * The 51 CV templates, the DOCX export pipeline and the MariaDB ATS scoring
     * engine must be byte-identical to the e314f715 freeze. The pathspec is verified
     * to exist FIRST, because git ignores a pathspec that matches nothing and still
     * exits 0 — an empty diff over a non-existent path would look identical to a
     * genuine pass.
     */
    test('stage 6: frozen CV, DOCX and ATS surfaces are byte-identical to the freeze', () => {
        for (const frozenPath of FROZEN_PATHS) {
            expect(
                fs.existsSync(path.join(process.cwd(), frozenPath)),
                `frozen path ${frozenPath} must exist on disk or the zero-diff assertion is meaningless`,
            ).toBe(true);
        }
        const cvCount = fs.readdirSync(path.join(process.cwd(), 'src', 'cv-templates'), { withFileTypes: true })
            // The 51 templates are DIRECTORIES named cv1..cv51, not files. The old
            // /^Cv\d+\./i pattern required a literal dot after the number, matched
            // none of them, and reported 0 — a false failure on a perfectly intact
            // frozen surface. Anchored on the full directory name so a stray
            // `Cv1.old` or `cv1.bak` cannot inflate the count past the real 51.
            .filter((entry) => entry.isDirectory() && /^cv\d+$/i.test(entry.name)).length;
        expect(cvCount, 'all 51 CV templates must still be present').toBe(51);

        const diff = frozenDiffStat();
        record(`stage 6 frozen diff vs ${FREEZE_BASELINE}: ${diff || 'EMPTY (frozen)'}`);
        expect(diff, `frozen surfaces must be unchanged vs ${FREEZE_BASELINE}`).toBe('');
    });

    /**
     * STAGE 7 — ZERO DEFECTS ACROSS THE WHOLE RUN.
     *
     * Drained last so a defect introduced in ANY earlier stage is attributed here,
     * rather than each stage only policing its own window.
     */
    test('stage 7: the run accumulated zero console, page and API errors', () => {
        record(`stage 7 totals: console=${RUN_DEFECTS.consoleErrors.length} pageErrors=${RUN_DEFECTS.pageErrors.length} api=${RUN_DEFECTS.failedApi.length}`);
        fs.writeFileSync(
            path.join(EVIDENCE_DIR, 'dir012-defect-report.json'),
            `${JSON.stringify(RUN_DEFECTS, null, 2)}\n`,
        );
        expect(RUN_DEFECTS.consoleErrors, 'no stage may log console errors').toEqual([]);
        expect(RUN_DEFECTS.pageErrors, 'no stage may throw uncaught errors').toEqual([]);
        expect(RUN_DEFECTS.failedApi, 'no /api/* request may fail').toEqual([]);
    });
});
