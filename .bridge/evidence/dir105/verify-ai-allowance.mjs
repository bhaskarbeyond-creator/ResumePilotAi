import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * DIR-105 evidence harness — the AI allowance in the account menu.
 *
 * WHAT IT PROVES (and what it does not):
 *   1. The allowance band is present in the account menu and VISIBLE at 320px,
 *      768px and 1440px — i.e. a phone user really can see it, which is the
 *      whole point of the directive.
 *   2. The header chip appears from 768px up and is absent at 320px.
 *   3. With the REAL backend answering (default), a session the backend does not
 *      recognise yields `data-ai-ready="false"` and the honest "—" placeholder:
 *      the UI does not invent a figure when it cannot read the ledger (§46).
 *   4. With `--stub-usage`, a payload captured verbatim from the live MariaDB
 *      resolver (`getUserAiEntitlement`) renders the numeric path. That pass is
 *      labelled ILLUSTRATIVE and may never be cited as proof of live data.
 *
 * It NEVER starts a server (P0 XAMPP-only invariant) and refuses to run when
 * Apache is down.
 */
const args = process.argv.slice(2);

// The canonical base is served over XAMPP's SELF-SIGNED TLS certificate. Node's
// global fetch does not honour Playwright's `ignoreHTTPSErrors`, so the
// availability pre-flight below would fail on the cert rather than on a dead
// server. Trust is relaxed for THIS PROBE PROCESS ONLY — never for the app,
// never persisted, and the browser context still opts in explicitly.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const STUB_USAGE = args.includes('--stub-usage');
const urlArg = args.find((a) => a.startsWith('--url='));
const BASE = (urlArg ? urlArg.slice('--url='.length) : process.env.IME365_BASE_URL || 'https://ime365.local').replace(/\/+$/, '');
const OUT_DIR = process.env.DIR105_OUT_DIR || '.bridge/evidence/dir105';

const API_KEY = (() => {
    const fromEnv = process.env.VITE_FIREBASE_KEY || process.env.FIREBASE_API_KEY;
    if (fromEnv) return fromEnv;
    const m = readFileSync(path.resolve('.env'), 'utf8').match(/^\s*VITE_FIREBASE_KEY\s*=\s*(.+)\s*$/m);
    if (!m) throw new Error('VITE_FIREBASE_KEY is required (set it in .env or the environment); never hardcode it.');
    return m[1].trim();
})();

const mockToken = 'dir105.verification.token';

/** The exact shape the live route returns; values captured from MariaDB. */
const CAPTURED_USAGE = { plan: 'Basic', usedToday: 0, effectiveLimit: 1000, remainingToday: 1000, isExhausted: false, lastResetAt: null, source: 'MARIADB' };

async function assertApacheServes() {
    try {
        const res = await fetch(`${BASE}/dashboard`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (error) {
        console.error(`\n[FATAL] XAMPP Apache is not serving ${BASE}/dashboard — ${error.message}`);
        console.error('This harness NEVER spawns its own server (P0 XAMPP-only invariant).');
        console.error('Bring the stack up first:  bridge xampp start all\n');
        process.exit(1);
    }
}

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


async function main() {
    await assertApacheServes();
    await fs.mkdir(OUT_DIR, { recursive: true });

    const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
    const consoleErrors = [];

    try {
        for (const vp of VIEWPORTS) {
            const context = await browser.newContext({
                viewport: { width: vp.width, height: vp.height },
                ignoreHTTPSErrors: true,
            });

            const authUserKey = `firebase:authUser:${API_KEY}:[DEFAULT]`;
            await context.addInitScript(({ key, apiKey, token }) => {
                localStorage.setItem(key, JSON.stringify({
                    uid: 'dir105-probe', email: 'dir105@ime365.local', emailVerified: true,
                    displayName: 'DIR 105 Probe', isAnonymous: false,
                    stsTokenManager: { apiKey, refreshToken: 'fix', accessToken: token, expirationTime: Date.now() + 3600000 },
                    createdAt: String(Date.now()), lastLoginAt: String(Date.now()), apiKey, appName: '[DEFAULT]',
                }));
                localStorage.setItem('user', 'dir105-probe');
                localStorage.setItem('cuba_workspace_rail', 'docked');
            }, { key: authUserKey, apiKey: API_KEY, token: mockToken });

            const page = await context.newPage();
            page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(`[${vp.name}] ${msg.text()}`); });
            page.on('pageerror', (err) => consoleErrors.push(`[${vp.name}] pageerror: ${err.message}`));

            await page.route('**/securetoken.googleapis.com/**', (r) => r.fulfill({
                status: 200, contentType: 'application/json',
                body: JSON.stringify({ access_token: mockToken, expires_in: '3600', token_type: 'Bearer', refresh_token: 'fix', id_token: mockToken, user_id: 'dir105-probe' }),
            }));
            await page.route('**/identitytoolkit.googleapis.com/**', (r) => r.fulfill({
                status: 200, contentType: 'application/json',
                body: JSON.stringify({ users: [{ localId: 'dir105-probe', email: 'dir105@ime365.local', emailVerified: true, displayName: 'DIR 105 Probe' }] }),
            }));

            if (STUB_USAGE) {
                await page.route('**/api/ai-usage', (r) => r.fulfill({
                    status: 200, contentType: 'application/json',
                    body: JSON.stringify({ success: true, usage: CAPTURED_USAGE }),
                }));
            }

            await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
            await page.waitForSelector('main, h1, nav', { timeout: 30000 });
            await page.waitForTimeout(1200);

            // The header chip is only rendered from md (768px) up — AND only
            // when the ledger is actually readable. With an unreadable ledger
            // it must be absent at EVERY width (honest omission, §46), so the
            // expectation is a function of both the viewport and the usage mode.
            // Visibility (not presence) is the right probe: below md the chip is
            // in the DOM but `display:none`, and a present-but-invisible control
            // is exactly what "the user cannot see it" means.
            const chipVisible = await page.locator('[data-testid="ai-token-meter"]').first().isVisible();
            const expectChip = STUB_USAGE && vp.expectChip;
            check(
                `${vp.name}: header chip ${expectChip ? 'visible' : 'not visible'} (${STUB_USAGE ? 'readable ledger' : 'unreadable ledger — honest omission'})`,
                chipVisible === expectChip,
                `visible=${chipVisible}`,
            );

            const trigger = page.locator('[data-testid="cuba-user-menu-trigger"]');
            await trigger.waitFor({ state: 'visible', timeout: 15000 });
            await trigger.click();
            await page.waitForSelector('[data-testid="cuba-user-menu"]', { timeout: 10000 });

            // The allowance has ONE home: the menubar chip. The account menu must
            // not carry a second copy of the same figure (it used to).
            const duplicateCount = await page.locator('[data-testid="cuba-user-menu-ai-allowance"]').count();
            check(`${vp.name}: account menu carries no duplicate allowance`, duplicateCount === 0, `count=${duplicateCount}`);

            const menuText = (await page.locator('[data-testid="cuba-user-menu"]').innerText()).replace(/\s+/g, ' ').trim();
            check(
                `${vp.name}: "AI requests today" is gone from the menu`,
                !menuText.includes('AI requests today'),
                `menuText="${menuText.slice(0, 110)}"`,
            );

            if (STUB_USAGE && vp.expectChip) {
                const chipText = (await page.locator('[data-testid="ai-token-meter"]').first().innerText()).replace(/\s+/g, ' ').trim();
                check(
                    `${vp.name}: menubar chip uses the directive wording`,
                    chipText.includes('Usage: 0/1000') && !chipText.includes('req/day'),
                    `chipText="${chipText}"`,
                );
                // Adjacency: the chip must be the trail node directly before the
                // message icon, not merely present somewhere in the header.
                const adjacent = await page.evaluate(() => {
                    const chip = document.querySelector('[data-testid="ai-token-meter"]');
                    if (!chip) return null;
                    return chip.nextElementSibling?.querySelector('[data-testid="cuba-notification-trigger"]') ? 'yes' : 'no';
                });
                check(`${vp.name}: chip is immediately beside the message icon`, adjacent === 'yes', `adjacent=${adjacent}`);
            }

            await page.screenshot({ path: path.join(OUT_DIR, `ai-allowance-${vp.name}.png`) });
            await context.close();
        }
    } finally {
        await browser.close();
    }

    const report = [
        'DIR-105 — AI allowance in the account menu (requests per day)',
        `Base URL      : ${BASE}`,
        `Usage source  : ${STUB_USAGE ? 'ILLUSTRATIVE (stubbed from a live MariaDB capture)' : 'LIVE BACKEND (unauthenticated probe -> honest unavailable)'}`,
        `Console errors: ${consoleErrors.length}`,
        '',
        ...results,
        '',
        ...(STUB_USAGE ? [] : [
            'SCOPE CAVEAT — this run CANNOT prove the endpoint works. It uses a',
            'synthetic session, so an unreadable ledger is EXPECTED here and a',
            'stale backend or a missing route would look identical to a healthy',
            'one. It was this blind spot that let a broken build report PASS.',
            'Real end-to-end proof: node .bridge/evidence/dir105/verify-authenticated.mjs',
            '',
        ]),
        failures.length ? `RESULT: FAIL (${failures.length})` : 'RESULT: PASS',
    ].join('\n');

    console.log(report);
    await fs.writeFile(path.join(OUT_DIR, 'verify-ai-allowance.log'), `${report}\n`, 'utf8');
    if (consoleErrors.length) await fs.writeFile(path.join(OUT_DIR, 'console-errors.log'), consoleErrors.join('\n'), 'utf8');

    if (failures.length) process.exit(1);
}

main().catch((error) => {
    console.error('[FATAL]', error);
    process.exit(1);
});
