import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

/**
 * DIR-106 — AUTHENTICATED live proof that the menubar shows the AI allowance
 * chip AND that the stray "AI Engine Ready" beacon is suppressed.
 *
 * A REAL Firebase session is minted for a REAL multi-tenant user (the one whose
 * ambiguity caused the 400 regression) and the browser is seeded with it. The
 * `/api/ai-usage` endpoint is NEVER stubbed, so a broken route fails this run.
 * The token is never printed or persisted.
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

function loadEnv(file) {
    if (!fs.existsSync(file)) return;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line);
        if (!m) continue;
        let v = m[2].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        v = v.replace(/\\n/g, '\n');
        if (!process.env[m[1]]) process.env[m[1]] = v;
    }
}

const ROOT = path.resolve(import.meta.dirname, '../../..');
loadEnv(path.join(ROOT, '.env'));
loadEnv(path.join(ROOT, 'backend', '.env'));

const require = createRequire(import.meta.url);
const BACKEND = path.join(ROOT, 'backend');
const { getPool } = require(path.join(BACKEND, 'database', 'mysql.js'));
const firebaseAdmin = require(path.join(BACKEND, 'services', 'firebaseAdmin.js'));

const BASE = (process.env.IME365_BASE_URL || 'https://ime365.local').replace(/\/+$/, '');
const EMAIL = process.argv[2] || process.env.DIR106_PROBE_EMAIL || 'bhaskar.beyond@gmail.com';
const OUT_DIR = path.join(ROOT, '.bridge', 'evidence', 'dir106');
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

function authClient() {
    try { return firebaseAdmin.auth(); } catch {
        const app = firebaseAdmin.initializeApp({
            credential: firebaseAdmin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
            }),
        }, 'dir106-ui');
        return firebaseAdmin.auth(app);
    }
}

async function mintSession(uid) {
    const customToken = await authClient().createCustomToken(uid);
    if (!API_KEY) throw new Error('VITE_FIREBASE_KEY is required to exchange the custom token.');
    const res = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(API_KEY)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: customToken, returnSecureToken: true }) },
    );
    const body = await res.json();
    if (!res.ok || !body.idToken) throw new Error(`token exchange failed: HTTP ${res.status}`);
    return { idToken: body.idToken, refreshToken: body.refreshToken, localId: body.localId || uid };
}

async function main() {
    await fsp.mkdir(OUT_DIR, { recursive: true });
    const [rows] = await getPool().query('SELECT id, email FROM users WHERE email = ? LIMIT 1', [EMAIL]);
    if (!rows.length) throw new Error(`No user row for ${EMAIL}`);
    const uid = rows[0].id;
    const session = await mintSession(uid);
    console.log(`Authenticated as ${rows[0].email} (uid from MariaDB). Token never printed.`);

    // Direct API assertion: the regression was a 400 here.
    const api = await fetch(`${BASE}/api/ai-usage`, { headers: { Authorization: `Bearer ${session.idToken}` }, cache: 'no-store' });
    const apiBody = await api.json().catch(() => ({}));
    const usage = apiBody?.usage;
    check('GET /api/ai-usage answers HTTP 200 for a multi-tenant user', api.status === 200, `HTTP ${api.status}`);
    check('the allowance payload carries live figures', typeof usage?.usedToday === 'number' && typeof usage?.effectiveLimit === 'number', `used=${usage?.usedToday} limit=${usage?.effectiveLimit} scope=${usage?.quotaScope} ambiguous=${usage?.ambiguousTenant}`);
    check('the used/limit/remaining triple is internally consistent', (usage?.remainingToday ?? -1) === Math.max(0, (usage?.effectiveLimit || 0) - (usage?.usedToday || 0)), `remaining=${usage?.remainingToday}`);

    const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
    try {
        for (const vp of VIEWPORTS) {
            const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
            await context.addInitScript(({ key, idToken, refreshToken, localId, apiKey }) => {
                localStorage.setItem(key, JSON.stringify({
                    uid: localId, email: '', emailVerified: true, displayName: '', isAnonymous: false,
                    stsTokenManager: { apiKey, refreshToken, accessToken: idToken, expirationTime: Date.now() + 3600000 },
                    createdAt: String(Date.now()), lastLoginAt: String(Date.now()), apiKey, appName: '[DEFAULT]',
                }));
                localStorage.setItem('cuba_workspace_rail', 'docked');
            }, { key: `firebase:authUser:${API_KEY}:[DEFAULT]`, apiKey: API_KEY, idToken: session.idToken, refreshToken: session.refreshToken, localId: session.localId });

            const page = await context.newPage();
            const consoleErrors = [];
            page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
            await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
            await page.waitForSelector('main, h1, nav', { timeout: 30000 });

            // (1) THE BEACON MUST BE SUPPRESSED — the user's reported regression.
            const beacon = page.locator('[data-testid="ai-engine-status"]');
            const beaconVisible = await beacon.first().isVisible().catch(() => false);
            check(`${vp.name}: AI Engine Ready beacon is suppressed`, beaconVisible === false, `visible=${beaconVisible}`);

            // (2) THE ALLOWANCE CHIP MUST BE VISIBLE (sm and up).
            const chip = page.locator('[data-testid="ai-token-meter"]');
            await chip.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
            const visible = await chip.first().isVisible();
            check(`${vp.name}: menubar chip ${vp.expectChip ? 'visible' : 'not visible'}`, visible === vp.expectChip, `visible=${visible}`);
            if (vp.expectChip && visible) {
                const text = (await chip.first().innerText()).replace(/\s+/g, ' ').trim();
                check(`${vp.name}: renders "Usage: <used>/<limit>"`, /Usage: \d+\/\d+/.test(text), `text="${text}"`);
            }

            check(`${vp.name}: zero console errors`, consoleErrors.length === 0, `${consoleErrors.length} error(s)`);
            await page.screenshot({ path: path.join(OUT_DIR, `dir106-${vp.name}.png`) });
            await context.close();
        }
    } finally {
        await browser.close();
    }

    const report = [
        'DIR-106 — AUTHENTICATED menubar proof (real Firebase session, real MariaDB)',
        `Base URL : ${BASE}`,
        `User     : ${EMAIL}`,
        'Usage API: NOT stubbed — a broken route fails this run.',
        '',
        ...results,
        '',
        failures.length ? `RESULT: FAIL (${failures.length})` : 'RESULT: PASS',
    ].join('\n');
    console.log(report);
    await fsp.writeFile(path.join(OUT_DIR, 'verify-authenticated.log'), `${report}\n`, 'utf8');
    process.exit(failures.length ? 1 : 0);
}

main().catch((error) => { console.error('[FATAL]', error.message); process.exit(1); });

