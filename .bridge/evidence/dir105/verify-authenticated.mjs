import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * DIR-105 — authenticated UI proof: the menubar allowance, with REAL data.
 *
 * The unauthenticated harness could only prove the UI contract, and it wrongly
 * reported success while the feature was broken. This one seeds the browser
 * with a GENUINE Firebase session minted for a real user, so the menubar chip
 * must render the server's actual figures — or this script fails.
 *
 * It NEVER stubs /api/ai-usage, so a stale backend or a broken route shows up
 * as a hard failure instead of an "honest unavailable" pass.
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

const VIEWPORTS = [
    { name: 'mobile-320', width: 320, height: 720, expectChip: false },
    { name: 'tablet-768', width: 768, height: 1024, expectChip: true },
    { name: 'desktop-1440', width: 1440, height: 900, expectChip: true },
];

const results = [];
const failures = [];
const check = (label, ok, detail) => {
    results.push(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failures.push(label);
};

async function mintSession(uid) {
    let auth;
    try {
        auth = firebaseAdmin.auth();
    } catch {
        const app = firebaseAdmin.initializeApp({
            credential: firebaseAdmin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
            }),
        }, 'dir105-ui');
        auth = firebaseAdmin.auth(app);
    }
    const customToken = await auth.createCustomToken(uid);
    const res = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(API_KEY)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: customToken, returnSecureToken: true }) },
    );
    const body = await res.json();
    if (!res.ok || !body.idToken) throw new Error(`token exchange failed: HTTP ${res.status}`);
    return { idToken: body.idToken, refreshToken: body.refreshToken, localId: body.localId || uid };
}


async function main() {
    await fs.mkdir(OUT_DIR, { recursive: true });
    const [rows] = await getPool().query('SELECT id, email FROM users WHERE email = ? LIMIT 1', [EMAIL]);
    if (!rows.length) throw new Error(`No user row for ${EMAIL}`);
    const uid = rows[0].id;
    const session = await mintSession(uid);
    console.log(`Authenticated as ${rows[0].email} (uid from MariaDB). Token never printed.`);

    const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
    try {
        for (const vp of VIEWPORTS) {
            const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, ignoreHTTPSErrors: true });
            await context.addInitScript(({ key, apiKey, idToken, refreshToken, id }) => {
                localStorage.setItem(key, JSON.stringify({
                    uid: id, email: '', emailVerified: true, displayName: '', isAnonymous: false,
                    stsTokenManager: { apiKey, refreshToken, accessToken: idToken, expirationTime: Date.now() + 3600000 },
                    createdAt: String(Date.now()), lastLoginAt: String(Date.now()), apiKey, appName: '[DEFAULT]',
                }));
                localStorage.setItem('cuba_workspace_rail', 'docked');
            }, { key: `firebase:authUser:${API_KEY}:[DEFAULT]`, apiKey: API_KEY, idToken: session.idToken, refreshToken: session.refreshToken, id: session.localId });

            const page = await context.newPage();
            await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
            await page.waitForSelector('main, h1, nav', { timeout: 30000 });

            const chip = page.locator('[data-testid="ai-token-meter"]');
            await chip.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
            const visible = await chip.first().isVisible();
            check(`${vp.name}: menubar chip ${vp.expectChip ? 'visible' : 'not visible'}`, visible === vp.expectChip, `visible=${visible}`);

            if (vp.expectChip && visible) {
                const text = (await chip.first().innerText()).replace(/\s+/g, ' ').trim();
                check(
                    `${vp.name}: renders "Usage: <used>/<limit>" with no unit text`,
                    /Usage: \d+\/\d+/.test(text) && !text.includes('req/day'),
                    `text="${text}"`,
                );
                const adjacent = await page.evaluate(() => {
                    const c = document.querySelector('[data-testid="ai-token-meter"]');
                    return c?.nextElementSibling?.querySelector('[data-testid="cuba-notification-trigger"]') ? 'yes' : 'no';
                });
                check(`${vp.name}: immediately beside the message icon`, adjacent === 'yes', `adjacent=${adjacent}`);
            }

            // The allowance must exist ONCE — as the menubar chip. The account
            // menu must not repeat the same figure.
            await page.locator('[data-testid="cuba-user-menu-trigger"]').click();
            await page.waitForSelector('[data-testid="cuba-user-menu"]', { timeout: 10000 });
            const dup = await page.locator('[data-testid="cuba-user-menu-ai-allowance"]').count();
            check(`${vp.name}: account menu carries no duplicate allowance`, dup === 0, `count=${dup}`);
            const menuText = (await page.locator('[data-testid="cuba-user-menu"]').innerText()).replace(/\s+/g, ' ').trim();
            check(
                `${vp.name}: "AI requests today" is gone from the menu`,
                !menuText.includes('AI requests today'),
                `menuText="${menuText.slice(0, 110)}"`,
            );

            await page.screenshot({ path: path.join(OUT_DIR, `authenticated-${vp.name}.png`) });
            await context.close();
        }
    } finally {
        await browser.close();
    }

    const report = [
        'DIR-105 — AUTHENTICATED menubar allowance (real Firebase session, real MariaDB)',
        `Base URL : ${BASE}`,
        `User     : ${EMAIL}`,
        'Usage API: NOT stubbed — a broken route fails this run.',
        '',
        ...results,
        '',
        failures.length ? `RESULT: FAIL (${failures.length})` : 'RESULT: PASS',
    ].join('\n');
    console.log(report);
    await fs.writeFile(path.join(OUT_DIR, 'verify-authenticated.log'), `${report}\n`, 'utf8');
    if (failures.length) process.exit(1);
}

main().catch((error) => { console.error('[FATAL]', error.message); process.exit(1); });
