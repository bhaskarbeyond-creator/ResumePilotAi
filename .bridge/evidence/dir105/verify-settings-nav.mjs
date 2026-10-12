import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * DIR-105 — live proof that the 26+ Platform Settings operations are REACHABLE.
 *
 * The defect this closes was a reachability regression: under the Cuba shell the
 * legacy sidebar (which owned the settings surfaces) never renders, and the nav
 * exposed a single `/admin/settings` link with no `?tab=`. So the acceptance bar
 * here is DOM-level, not source-level:
 *
 *   SUPER ADMIN  -> the hub renders, offers 26+ panels, and clicking one moves
 *                   the URL to `?tab=<key>` and swaps the panel.
 *   OPERATOR     -> `superAdminOnly` panels are ABSENT from the hub (the hub must
 *                   never even advertise a panel the denial gate would refuse).
 *
 * `isSuperAdmin` is derived from Firebase custom claims (`platform.js:checkIfAdmin`),
 * so a Super Admin session is minted with `{ role: 'SUPER_ADMIN', superAdmin: true,
 * permissions: ['*'] }` — no database mutation required. The operator session is
 * minted with NO claims. Nothing is stubbed: real Firebase, real MariaDB, real
 * /api/admin/system-settings. Console errors are a hard failure.
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const require = createRequire(import.meta.url);
const BACKEND = path.resolve(import.meta.dirname, '../../../backend');
const { getPool } = require(path.join(BACKEND, 'database/mysql.js'));
const firebaseAdmin = require(path.join(BACKEND, 'services/firebaseAdmin.js'));

const BASE = (process.env.IME365_BASE_URL || 'https://ime365.local').replace(/\/+$/, '');
const EMAIL = process.argv[2] || process.env.DIR105_PROBE_EMAIL || 'bhaskar.beyond@gmail.com';
const OUT_DIR = '.bridge/evidence/dir105';
const API_KEY = process.env.VITE_FIREBASE_KEY || process.env.FIREBASE_API_KEY;

const SUPER_ADMIN_CLAIMS = { role: 'SUPER_ADMIN', superAdmin: true, permissions: ['*'] };

const VIEWPORTS = [
    { name: 'mobile-320', width: 320, height: 720 },
    { name: 'tablet-768', width: 768, height: 1024 },
    { name: 'desktop-1440', width: 1440, height: 900 },
];

/** Panels that must NEVER appear for a non-super-admin. */
const SUPER_ONLY = ['firebaseSettings', 'databaseSettings', 'aiSettings', 'storageSettings', 'twilioSmsSettings'];

const results = [];
const failures = [];
const check = (label, ok, detail) => {
    results.push(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failures.push(label);
};

let _auth = null;

/** Resolves the Admin SDK auth handle once, reusing any app we already created. */
function getAuth() {
    if (_auth) return _auth;
    try {
        _auth = firebaseAdmin.auth();
    } catch {
        const name = 'dir105-nav';
        const existing = (firebaseAdmin.getApps ? firebaseAdmin.getApps() : []).find((a) => a.name === name);
        const app = existing || firebaseAdmin.initializeApp({
            credential: firebaseAdmin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
            }),
        }, name);
        _auth = firebaseAdmin.auth(app);
    }
    return _auth;
}

async function mintSession(uid, claims) {
    const auth = getAuth();
    const customToken = await auth.createCustomToken(uid, claims || {});
    const res = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(API_KEY)}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: customToken, returnSecureToken: true }),
        },
    );
    const body = await res.json();
    if (!res.ok || !body.idToken) throw new Error(`token exchange failed: HTTP ${res.status}`);
    return { idToken: body.idToken, refreshToken: body.refreshToken, localId: body.localId || uid };
}

/** Seeds a genuine Firebase session into the browser origin. */
async function seed(context, session, localId) {
    await context.addInitScript(({ apiKey, idToken, refreshToken, uid }) => {
        localStorage.setItem(`firebase:authUser:${apiKey}:[DEFAULT]`, JSON.stringify({
            uid,
            email: '',
            emailVerified: false,
            displayName: '',
            isAnonymous: false,
            stsTokenManager: { apiKey, refreshToken, accessToken: idToken, expirationTime: Date.now() + 3600000 },
            createdAt: String(Date.now()),
            lastLoginAt: String(Date.now()),
            apiKey,
            appName: '[DEFAULT]',
        }));
        localStorage.setItem('cuba_workspace_rail', 'docked');
    }, { apiKey: API_KEY, idToken: session.idToken, refreshToken: session.refreshToken, uid: localId });
}

async function main() {
    await fs.mkdir(OUT_DIR, { recursive: true });
    const [rows] = await getPool().query('SELECT id, email FROM users WHERE email = ? LIMIT 1', [EMAIL]);
    if (!rows.length) throw new Error(`No user row for ${EMAIL}`);
    const uid = rows[0].id;

    const admin = await mintSession(uid, SUPER_ADMIN_CLAIMS);
    // A real non-super-admin operator: passes the admin-console gate (hasAdminClaim)
    // but resolves isSuperAdmin=false with ADMIN's fixed permission set.
    const operator = await mintSession(uid, { role: 'ADMIN' });
    console.log(`User: ${rows[0].email} (uid from MariaDB). Tokens never printed.`);

    const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
    try {
        // ---------- SUPER ADMIN: the hub must expose the full surface ----------
        for (const vp of VIEWPORTS) {
            const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
            await seed(context, admin, uid);
            const page = await context.newPage();
            const consoleErrors = [];
            page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

            await page.goto(`${BASE}/admin/settings`, { waitUntil: 'domcontentloaded' });
            const hub = page.locator('[data-testid="settings-navigator"]');
            const hubVisible = await hub.first().waitFor({ state: 'visible', timeout: 30000 }).then(() => true).catch(() => false);
            check(`${vp.name}: settings navigation hub renders`, hubVisible);

            const tabs = await page.locator('[data-testid^="settings-tab-"]').count();
            check(`${vp.name}: offers 26+ settings panels`, tabs >= 26, `tabs=${tabs}`);

            const pills = await page.locator('[data-testid^="settings-group-"]').count();
            check(`${vp.name}: exposes category filters`, pills >= 6, `pills=${pills}`);

            const firstTab = page.locator('[data-testid^="settings-tab-"]').first();
            const firstKey = await firstTab.getAttribute('data-testid').then((v) => v.replace('settings-tab-', ''));
            await firstTab.click();
            await page.waitForFunction(
                (k) => new URL(window.location.href).searchParams.get('tab') === k,
                firstKey, { timeout: 15000 },
            ).catch(() => {});
            const url = new URL(page.url());
            check(
                `${vp.name}: selecting a panel writes ?tab= into the URL`,
                url.searchParams.get('tab') === firstKey,
                `tab=${url.searchParams.get('tab')} expected=${firstKey}`,
            );

            // DIR-105 (CHANGES_REQUESTED): the Lead required live proof that the
            // Ctrl+K palette actually INDEXES the settings panels. Scoped to the
            // palette dialog so a matching tab label in the hub cannot fake a hit.
            await page.keyboard.press('Control+k');
            const palette = page.locator('[data-testid="cuba-command-palette"]');
            const paletteOpen = await palette.first()
                .waitFor({ state: 'visible', timeout: 15000 })
                .then(() => true).catch(() => false);
            check(`${vp.name}: Ctrl+K command palette opens`, paletteOpen);

            if (paletteOpen) {
                const searchBar = page.locator('[data-testid="cuba-command-searchbar"] input');
                // Poll rather than sleep: the palette debounces, then renders. A fixed
                // wait raced the first query on the 320px viewport.
                const awaitHit = (text) => palette.locator(`text=${text}`).first()
                    .waitFor({ state: 'visible', timeout: 10000 })
                    .then(() => true).catch(() => false);

                await searchBar.fill('firebase');
                check(
                    `${vp.name}: palette indexes the "Firebase Identity" settings panel`,
                    await awaitHit('Firebase Identity'),
                );

                await searchBar.fill('code injection');
                check(
                    `${vp.name}: palette indexes a superAdminOnly panel ("Code Injection")`,
                    await awaitHit('Code Injection'),
                );

                await page.keyboard.press('Escape');
                await page.waitForTimeout(400);
            }

            await page.screenshot({ path: path.join(OUT_DIR, `settings-nav-${vp.name}.png`) });
            check(`${vp.name}: zero console errors`, consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
            await context.close();
        }

        // ---------- OPERATOR: the hub must not advertise gated panels ----------
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        await seed(context, operator, uid);
        const page = await context.newPage();
        await page.goto(`${BASE}/admin/settings`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('main, h1, nav', { timeout: 30000 });

        const opTabs = await page.locator('[data-testid^="settings-tab-"]').count();
        const opDiag = await page.evaluate(() => ({
            url: location.href,
            hasHub: Boolean(document.querySelector('[data-testid="settings-navigator"]')),
            hubCount: document.querySelectorAll('[data-testid="settings-navigator"]').length,
            bodyText: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 320),
        }));
        console.log(`[operator diag] ${JSON.stringify(opDiag)}`);
        for (const key of SUPER_ONLY) {
            const present = await page.locator(`[data-testid="settings-tab-${key}"]`).count();
            check(`operator: gated panel "${key}" is not advertised`, present === 0, `count=${present}`);
        }
        check(
            'operator: never granted the full settings console',
            !opDiag.hasHub || opTabs < 26,
            `hub=${opDiag.hasHub} tabs=${opTabs} url=${opDiag.url}`,
        );

        // The denial gate must still refuse a hand-typed gated URL — either by
        // rendering the refusal panel or by bouncing the operator off the route.
        await page.goto(`${BASE}/admin/settings?tab=firebaseSettings`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('main, h1, nav', { timeout: 30000 });
        // The console redirects asynchronously once the session resolves; let it settle.
        await page.waitForTimeout(3000);
        const gatedOutcome = await page.evaluate(() => ({
            url: location.href,
            refused: (document.body.innerText || '').includes('Settings Access Restricted'),
            firebasePanel: Boolean(document.querySelector('[data-testid="settings-tab-firebaseSettings"]')),
            hub: Boolean(document.querySelector('[data-testid="settings-navigator"]')),
            bodyText: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 240),
        }));
        console.log(`[operator gated diag] ${JSON.stringify(gatedOutcome)}`);
        check(
            'operator: hand-typed gated URL never yields the gated panel',
            !gatedOutcome.firebasePanel && (gatedOutcome.refused || !gatedOutcome.url.includes('tab=firebaseSettings')),
            `refused=${gatedOutcome.refused} url=${gatedOutcome.url}`,
        );
        await page.screenshot({ path: path.join(OUT_DIR, 'settings-nav-operator-denied.png') });
        await context.close();
    } finally {
        await browser.close();
    }

    const report = [
        'DIR-105 — live reachability proof for the Platform Settings hub',
        `Base URL : ${BASE}`,
        `User     : ${EMAIL}`,
        'Super Admin claims: role=SUPER_ADMIN, superAdmin=true, permissions=["*"]',
        'Nothing stubbed: real Firebase tokens, real MariaDB, real settings API.',
        '',
        ...results,
        '',
        failures.length ? `RESULT: FAIL (${failures.length})` : 'RESULT: PASS',
    ].join('\n');
    console.log(report);
    await fs.writeFile(path.join(OUT_DIR, 'verify-settings-nav.log'), `${report}\n`, 'utf8');
    if (failures.length) process.exit(1);
}

main().catch((error) => { console.error('[FATAL]', error.message); process.exit(1); });

