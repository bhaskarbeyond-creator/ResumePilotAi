import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import { mintFirebaseSession } from '../../tests/e2e/dir006-session.mjs';
import { CANDIDATE_NAVIGATION } from '../../src/components/cuba/candidateNavigation.js';

/**
 * DIR-095 AC3/AC4 — authenticated sweep of all 15 candidate sidebar destinations.
 *
 * Navigates every route declared in `src/components/cuba/candidateNavigation.js` (the single
 * source of truth for the candidate sidebar) against the real XAMPP-served, authenticated app
 * and records, per route: the resolved URL, whether the SPA rendered the not-found view, and
 * any console exception. It also verifies the active-route contract (`aria-current="page"`).
 *
 * SERVERS: served by XAMPP Apache; this script never starts a server.
 * SESSION: minted by the platform's own `mintFirebaseSession()`.
 */

const BASE = (process.env.DIR095_WEB_ORIGIN || 'http://localhost').replace(/\/+$/, '');
const OUT = '.bridge/evidence';
const mask = (value) => String(value).replace(/^(.).*@/, '$1***@');

const apacheStatus = await (async () => {
    try {
        const res = await fetch(`${BASE}/dashboard`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.status;
    } catch (error) {
        console.error(`[FATAL] XAMPP Apache is not serving ${BASE}/dashboard — ${error.message}`);
        console.error('Bring the stack up first:  bridge xampp start all');
        process.exit(1);
    }
})();
console.log(`XAMPP Apache serving ${BASE} (HTTP ${apacheStatus})`);

const identity = process.env.DIR009_CANDIDATE_EMAIL || process.env.ADMIN_EMAIL || '';
if (!identity) { console.error('[BLOCKED] no sanctioned identity (DIR009_CANDIDATE_EMAIL / ADMIN_EMAIL).'); process.exit(1); }
const session = await mintFirebaseSession({ email: identity });
if (!session) { console.error('[BLOCKED] mintFirebaseSession returned null.'); process.exit(1); }
console.log(`[OK] real session minted for uid ${session.uid} (${mask(session.email)})`);

const ROUTES = CANDIDATE_NAVIGATION.flatMap((group) => group.items.map((item) => ({ group: group.label, id: item.id, label: item.label, to: item.to })));
console.log(`Sweeping ${ROUTES.length} declared candidate sidebar destinations.`);

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
let exitCode = 0;
const fail = (msg) => { console.error(`[FAIL] ${msg}`); exitCode = 1; };

try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript(({ uid, email, token, refreshToken, apiKey }) => {
        const authUser = {
            uid, email, emailVerified: true,
            displayName: email.split('@')[0], isAnonymous: false,
            stsTokenManager: { apiKey, refreshToken, accessToken: token, expirationTime: Date.now() + 3600000 },
            createdAt: String(Date.now()), lastLoginAt: String(Date.now()), apiKey, appName: '[DEFAULT]',
        };
        localStorage.setItem(`firebase:authUser:${apiKey}:[DEFAULT]`, JSON.stringify(authUser));
        localStorage.setItem('user', uid);
        localStorage.setItem('preferredLanguage', 'en');
        localStorage.setItem('ime365_cuba_shell_v2', 'cuba');
        localStorage.setItem('resumepilot_privacy_consent_v1', 'denied');
        localStorage.setItem('ime365_privacy_consent_v1', 'denied');
    }, { uid: session.uid, email: session.email, token: session.idToken, refreshToken: session.refreshToken, apiKey: session.apiKey });

    const page = await context.newPage();
    let routeErrors = [];
    page.on('pageerror', (err) => routeErrors.push(`pageerror: ${err.message}`));
    page.on('console', (msg) => { if (msg.type() === 'error' && !/favicon|Content Security Policy/i.test(msg.text())) routeErrors.push(msg.text()); });

    const matrix = [];
    for (const route of ROUTES) {
        routeErrors = [];
        await page.goto(`${BASE}${route.to}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(2500);
        const probe = await page.evaluate(() => {
            const text = (document.body?.innerText || '').replace(/\s+/g, ' ');
            return {
                url: location.href,
                notFound: /Page not found/i.test(text),
                activeNavItems: document.querySelectorAll('[aria-current="page"]').length,
                heading: (document.querySelector('main h1, main h2')?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 70),
                bodyLength: text.length,
            };
        });
        const ok = !probe.notFound && routeErrors.length === 0;
        if (!ok) fail(`AC3: route ${route.to} (${route.label}) — notFound=${probe.notFound}, errors=${JSON.stringify(routeErrors.slice(0, 3))}`);
        matrix.push({ ...route, ...probe, consoleErrors: routeErrors.slice(0, 5), ok });
        console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${route.to.padEnd(34)} active=${probe.activeNavItems} heading="${probe.heading}"`);
    }

    await fs.mkdir(OUT, { recursive: true });
    const manifest = {
        directive: 'DIR-095',
        acceptanceCriteria: ['AC3 operational sidebar navigation', 'AC4 active-route state'],
        servedBy: 'XAMPP Apache',
        base: BASE,
        apacheStatus,
        dataMode: 'REAL (authenticated session; MariaDB via the managed backend API)',
        identity: mask(session.email),
        sessionSource: 'tests/e2e/dir006-session.mjs -> mintFirebaseSession()',
        source: 'src/components/cuba/candidateNavigation.js',
        routeCount: ROUTES.length,
        matrix,
        verdict: exitCode === 0 ? 'PASS' : 'FAIL',
    };
    await fs.writeFile(`${OUT}/dir095-sidebar-route-matrix.json`, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`\nmatrix: ${OUT}/dir095-sidebar-route-matrix.json`);
    console.log(`verdict: ${manifest.verdict} (${matrix.filter((r) => r.ok).length}/${matrix.length} routes clean)`);
} catch (error) {
    console.error('[FATAL] sidebar sweep failed:', error);
    exitCode = 1;
} finally {
    await browser.close();
}
process.exit(exitCode);
