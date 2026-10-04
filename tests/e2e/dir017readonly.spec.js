// @ts-check
/**
 * DIR-017 read-only ground-truth probe (supersedes the mutating dir017probe.spec.js).
 *
 * STRICTLY NON-MUTATING: it never types into a profile field, never submits a
 * password change, and never enrolls or disables MFA. It only READS the rendered
 * DOM so the AC-6 spec assertions can be written against facts rather than
 * assumptions. That matters because the previous live run went RED 5/6 and two
 * of those failures turned out to be spec bugs rather than product defects.
 *
 * It answers exactly three questions:
 *   A. Which URL does the settings surface actually GET/POST for profile data?
 *      (stage 2 asserts on `/users-data/profile`; the component's loader calls
 *      `getProfileOfUser(uid)` -> `/api/users-data/<uid>`)
 *   B. Does clicking "Enable 2FA" open the wizard, or does enrollment fail first?
 *      (`beginTotpEnrollment` throws for unverified email / OAuth providers)
 *   C. Are the stage-6 "white on white, ratio 1.0" results real, or an artifact of
 *      measuring text against a `background-image` gradient / unapplied utility?
 */
import { test } from '@playwright/test';
import path from 'node:path';
import dotenv from 'dotenv';
import { mintFirebaseSession } from './dir006-session.mjs';

dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });
dotenv.config({ path: path.join(process.cwd(), 'backend', '.env'), quiet: true });

const EMAIL = process.env.DIR017_EMAIL || process.env.ADMIN_EMAIL || process.env.DIR006_EMAIL;
const SESSION = await mintFirebaseSession({ email: EMAIL });

test('dir017 read-only ground truth', async ({ page }) => {
    await page.addInitScript(({ uid, email, token, refreshToken, apiKey }) => {
        localStorage.setItem(`firebase:authUser:${apiKey}:[DEFAULT]`, JSON.stringify({
            uid, email, emailVerified: true, isAnonymous: false,
            stsTokenManager: { apiKey, refreshToken, accessToken: token, expirationTime: Date.now() + 3600_000 },
            createdAt: String(Date.now()), lastLoginAt: String(Date.now()), apiKey, appName: '[DEFAULT]',
        }));
        localStorage.setItem('user', uid);
        localStorage.setItem('ime365_cuba_shell_v2', 'cuba');
    }, { uid: SESSION.uid, email: SESSION.email, token: SESSION.idToken, refreshToken: SESSION.refreshToken, apiKey: SESSION.apiKey });

    const traffic = [];
    page.on('request', (r) => {
        if (/\/api\/users-data\//.test(r.url())) traffic.push(`${r.method()} ${new URL(r.url()).pathname}`);
    });
    const consoleErrors = [];
    page.on('console', (m) => {
        if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(`[${m.type()}] ${m.text()}`.slice(0, 300));
    });
    page.on('pageerror', (e) => consoleErrors.push(`[pageerror] ${String(e.message || e)}`.slice(0, 300)));

    await page.goto('/dashboard/settings?tab=Profile', { waitUntil: 'domcontentloaded' });
    await page.locator('input[name="firstname"]').waitFor({ timeout: 60_000 });
    await page.waitForTimeout(4000);

    // ---- A. profile read endpoint actually used on a cold mount -------------
    console.log('PROBE-A users-data traffic on mount =', JSON.stringify(traffic));
    console.log('PROBE-A firstname hydrated =', JSON.stringify(await page.locator('input[name="firstname"]').inputValue()));

    // ---- B. TOTP enrollment: does the wizard actually open? ----------------
    traffic.length = 0;
    const toasts = [];
    await page.goto('/dashboard/settings?tab=Account', { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Account Credentials & Security' }).waitFor({ timeout: 60_000 });

    const enable = page.getByRole('button', { name: /Enable 2FA/ });
    const disable = page.getByRole('button', { name: 'Disable 2FA' });
    console.log('PROBE-B enable count =', await enable.count(), ' disable count =', await disable.count());

    if (await enable.count()) {
        // Capture WHY the wizard refuses to open. beginTotpEnrollment throws for
        // (a) unverified email and (b) linkedin/github OAuth providers, and
        // getTotpStatus() calls user.reload() which replaces the injected
        // localStorage claim with the REAL server-side value.
        const claims = await page.evaluate(async () => {
            try {
                const auth = await import('/src/conf/fire.js');
                const user = auth.default.auth().currentUser;
                if (!user) return { error: 'no currentUser' };
                await user.reload();
                const t = await user.getIdTokenResult();
                return {
                    email: user.email,
                    provider: t.claims.signInProvider,
                    emailVerified: user.emailVerified,
                };
            } catch (e) { return { error: String(e && e.message || e) }; }
        });
        console.log('PROBE-B live claims =', JSON.stringify(claims));

        consoleErrors.length = 0;
        await enable.first().click();
        // Poll fast: the toast is transient, so waiting 8s would miss it.
        for (const wait of [600, 1200, 2500, 5000]) {
            await page.waitForTimeout(wait === 600 ? 600 : wait - 600);
            const n = await page.getByRole('dialog').count();
            if (n) { console.log(`PROBE-B dialogs at ~${wait}ms =`, n); break; }
        }
        console.log('PROBE-B dialog count after click =', await page.getByRole('dialog').count());
        console.log('PROBE-B users-data traffic =', JSON.stringify(traffic));
        console.log('PROBE-B console errors =', JSON.stringify(consoleErrors.slice(0, 8), null, 2));
        // The failure toast is the real story when the wizard refuses to open.
        const body = await page.locator('body').innerText();
        const found = body.match(/.{0,200}(unable to start|verif your email|requires configuring|reauthenticate|multi-factor|operation not allowed|insufficient permission).{0,200}/gi) || [];
        console.log('PROBE-B refusal toasts =', JSON.stringify(found.slice(0, 6)));
        toasts.push(...found);
        await page.screenshot({ path: '.bridge/evidence/dir017-readonly-totp.png', fullPage: false });

        // Call the enrollment path directly to surface the thrown message the
        // component only forwards into a transient toast.
        const direct = await page.evaluate(async () => {
            try {
                const mfa = await import('/src/services/api/platform.js');
                const r = await mfa.beginUserTotp2FA();
                return { ok: true, keys: Object.keys(r || {}) };
            } catch (e) { return { ok: false, message: String(e && e.message || e), code: e && e.code }; }
        });
        console.log('PROBE-B direct beginUserTotp2FA =', JSON.stringify(direct));
    }

    // ---- C. are the utility classes actually applied? ----------------------
    const styling = await page.evaluate(() => {
        const sheetHas = (needle) => [...document.styleSheets].some((s) => {
            try { return [...s.cssRules].some((r) => (r.cssText || '').includes(needle)); } catch { return false; }
        });
        const heading = [...document.querySelectorAll('h3')].find((h) => /Subscription Tier/i.test(h.textContent || ''));
        const card = heading?.closest('div[class*="rounded-2xl"]');
        const whiteBtn = [...document.querySelectorAll('button')].find((b) => /Delete Account/i.test(b.textContent || ''));
        const cs = (el) => (el ? getComputedStyle(el) : null);
        const hc = cs(heading);
        const cc = cs(card);
        const bc = cs(whiteBtn);
        return {
            tailwindLoaded: sheetHas('--tw-') || sheetHas('.bg-slate-100') || sheetHas('.text-white'),
            cubaLoaded: sheetHas('--cuba-'),
            headingColor: hc?.color,
            cardBackgroundColor: cc?.backgroundColor,
            // This is the crux: Tailwind gradients paint via background-image,
            // so a background-COLOR-only walker sees "transparent" and climbs.
            cardBackgroundImage: cc?.backgroundImage,
            cardClass: card?.className,
            deleteBtnColor: bc?.color,
            deleteBtnBackgroundColor: bc?.backgroundColor,
            deleteBtnClass: whiteBtn?.className,
        };
    });
    console.log('PROBE-C styling =', JSON.stringify(styling, null, 2));
});