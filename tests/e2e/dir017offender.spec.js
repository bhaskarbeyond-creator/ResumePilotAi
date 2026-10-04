// @ts-check
/**
 * DIR-017 read-only offender probe.
 *
 * For each of the 6 contrast offenders recorded in dir017-results.json, dumps the
 * EXACT rendered node (tag, class, testid, ancestry) so the fix targets the real
 * element instead of a guessed one.
 *
 * STRICTLY NON-MUTATING: it only reads the DOM and computed styles.
 */
import { test, expect } from '@playwright/test';
import path from 'node:path';
import dotenv from 'dotenv';
import { mintFirebaseSession } from './dir006-session.mjs';

dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });
dotenv.config({ path: path.join(process.cwd(), 'backend', '.env'), quiet: true });

const IDENTITY_EMAIL = process.env.DIR017_EMAIL
    || process.env.ADMIN_EMAIL
    || process.env.DIR006_EMAIL;

const SESSION = IDENTITY_EMAIL ? await mintFirebaseSession({ email: IDENTITY_EMAIL }) : null;

async function signIn(page) {
    await page.addInitScript(({ uid, email, token, refreshToken, apiKey }) => {
        localStorage.setItem(`firebase:authUser:${apiKey}:[DEFAULT]`, JSON.stringify({
            uid, email, emailVerified: true, isAnonymous: false,
            stsTokenManager: { apiKey, refreshToken, accessToken: token, expirationTime: Date.now() + 3600_000 },
            createdAt: String(Date.now()), lastLoginAt: String(Date.now()),
            apiKey, appName: '[DEFAULT]',
        }));
        localStorage.setItem('user', uid);
        localStorage.setItem('ime365_cuba_shell_v2', 'cuba');
    }, {
        uid: SESSION.uid, email: SESSION.email, token: SESSION.idToken,
        refreshToken: SESSION.refreshToken, apiKey: SESSION.apiKey,
    });
}

/** The 6 offenders verbatim from dir017-results.json, keyed by theme+sample. */
const WANTED = [
    { theme: 'light', sample: 'BB' },
    { theme: 'light', sample: 'AI' },
    { theme: 'dark', sample: 'Workspace' },
    { theme: 'dark', sample: 'Job Intelligence' },
    { theme: 'dark', sample: 'Account & Security' },
    { theme: 'dark', sample: '8' },
];

test('dump exact DOM for each contrast offender', async ({ page }) => {
    await signIn(page);
    await page.goto('/dashboard/settings?tab=Account', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Account Credentials & Security' }))
        .toBeVisible({ timeout: 60_000 });

    const report = {};

    for (const theme of ['light', 'dark']) {
        await page.evaluate((mode) => {
            const root = document.documentElement;
            root.classList.toggle('dark', mode === 'dark');
            root.setAttribute('data-theme', mode);
            root.style.colorScheme = mode;
        }, theme);
        await page.waitForTimeout(500);

        report[theme] = await page.evaluate((wanted) => {
            const out = {};
            for (const sample of wanted) {
                const hits = [];
                for (const el of document.querySelectorAll('h2, h3, span, p, li, button, label')) {
                    const text = (el.textContent || '').trim();
                    if (text !== sample) continue;
                    const cs = getComputedStyle(el);
                    // Walk ancestors for the first opaque paint.
                    const chain = [];
                    let node = el;
                    while (node && node !== document.documentElement) {
                        const s = getComputedStyle(node);
                        chain.push({
                            tag: node.tagName,
                            testid: node.getAttribute('data-testid') || null,
                            cls: (node.getAttribute('class') || '').slice(0, 220),
                            bgColor: s.backgroundColor,
                            bgImage: s.backgroundImage === 'none' ? 'none' : s.backgroundImage.slice(0, 160),
                        });
                        if (/gradient/.test(s.backgroundImage) || !/rgba\(0, 0, 0, 0\)|transparent/.test(s.backgroundColor)) break;
                        node = node.parentElement;
                    }
                    hits.push({
                        tag: el.tagName,
                        testid: el.getAttribute('data-testid') || null,
                        cls: (el.getAttribute('class') || '').slice(0, 260),
                        color: cs.color,
                        fontSize: cs.fontSize,
                        fontWeight: cs.fontWeight,
                        inlineStyle: el.getAttribute('style') || null,
                        chain,
                        outer: el.outerHTML.slice(0, 300),
                    });
                    if (hits.length >= 4) break;
                }
                out[sample] = hits;
            }
            return out;
        }, WANTED.filter((w) => w.theme === theme).map((w) => w.sample));
    }

    console.log('DIR017_OFFENDER_DOM_START');
    console.log(JSON.stringify(report, null, 2));
    console.log('DIR017_OFFENDER_DOM_END');
});