// @ts-check
/** DIR-017 diagnostic probe: dumps ground truth the spec assertions depend on. */
import { test } from '@playwright/test';
import path from 'node:path';
import dotenv from 'dotenv';
import { mintFirebaseSession } from './dir006-session.mjs';

dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });
dotenv.config({ path: path.join(process.cwd(), 'backend', '.env'), quiet: true });

const EMAIL = process.env.DIR017_EMAIL || process.env.ADMIN_EMAIL || process.env.DIR006_EMAIL;
const SESSION = await mintFirebaseSession({ email: EMAIL });

test('probe', async ({ page }) => {
    await page.addInitScript(({ uid, email, token, refreshToken, apiKey }) => {
        localStorage.setItem(`firebase:authUser:${apiKey}:[DEFAULT]`, JSON.stringify({
            uid, email, emailVerified: true, isAnonymous: false,
            stsTokenManager: { apiKey, refreshToken, accessToken: token, expirationTime: Date.now() + 3600_000 },
            createdAt: String(Date.now()), lastLoginAt: String(Date.now()), apiKey, appName: '[DEFAULT]',
        }));
        localStorage.setItem('user', uid);
        localStorage.setItem('ime365_cuba_shell_v2', 'cuba');
    }, { uid: SESSION.uid, email: SESSION.email, token: SESSION.idToken, refreshToken: SESSION.refreshToken, apiKey: SESSION.apiKey });

    const reqs = [];
    page.on('request', (r) => { if (r.method() !== 'GET') reqs.push(`${r.method()} ${r.url()}`); });

    await page.goto('/dashboard/settings?tab=Account', { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Account Credentials & Security' }).waitFor({ timeout: 60000 });

    // 1. Ribbon tab roles/labels
    await page.getByRole('button', { name: 'Master Profile' }).click();
    await page.getByRole('navigation', { name: 'Master Profile Steps Stepper' }).waitFor({ timeout: 30000 });
    const tabs = await page.getByRole('tab').all();
    console.log('PROBE ribbon tab count =', tabs.length);
    console.log('PROBE tab names =', JSON.stringify(await Promise.all(tabs.map((t) => t.innerText()))));

    // 2. Profile save endpoint on edit
    await page.locator('input[name="firstname"]').fill('PROBEVALUE');
    await page.locator('input[name="firstname"]').blur();
    await page.waitForTimeout(6000);
    console.log('PROBE profile-branch non-GET =', JSON.stringify(reqs));

    // 3. Password checklist gating + submit behaviour
    reqs.length = 0;
    await page.goto('/dashboard/settings?tab=Account', { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Account Credentials & Security' }).waitFor({ timeout: 60000 });
    const before = await page.getByText('At least 8 characters').count();
    await page.getByPlaceholder('Min. 8 characters').fill('Dir017Probe!9');
    await page.waitForTimeout(800);
    const after = await page.getByText('At least 8 characters').count();
    console.log('PROBE checklist before =', before, ' after =', after);
    console.log('PROBE confirm pw count =', await page.getByPlaceholder('Re-enter password').count());

    // 4. TOTP wizard: what actually happens on click?
    reqs.length = 0;
    const enable = page.getByRole('button', { name: /Enable 2FA/ });
    console.log('PROBE enable-2fa count =', await enable.count());
    if (await enable.count()) {
        await enable.first().click();
        await page.waitForTimeout(6000);
        console.log('PROBE dialog count after click =', await page.getByRole('dialog').count());
        console.log('PROBE totp non-GET =', JSON.stringify(reqs));
        const body = await page.locator('body').innerText();
        const m = body.match(/.{0,90}(verif|2FA|MFA|authenticator).{0,90}/gi) || [];
        console.log('PROBE 2FA mentions =', JSON.stringify(m.slice(0, 8)));
        await page.screenshot({ path: '.bridge/evidence/dir017-probe-totp.png', fullPage: false });
    }

    // 5b. Does the profile edit actually persist to MariaDB?
    reqs.length = 0;
    await page.goto('/dashboard/settings?tab=Profile', { waitUntil: 'domcontentloaded' });
    const fn = page.locator('input[name="firstname"]');
    await fn.waitFor({ timeout: 60000 });
    await page.waitForTimeout(4000); // let the profile hydrate before editing
    const hydrated = await fn.inputValue();
    console.log('PROBE2 hydrated firstname =', JSON.stringify(hydrated));
    console.log('PROBE2 input count =', await page.locator('input[name="firstname"]').count());
    const probeVal = 'D017Probe';
    await fn.fill(probeVal);
    console.log('PROBE2 value right after fill =', JSON.stringify(await fn.inputValue()));
    await page.waitForTimeout(12000);
    console.log('PROBE2 value at +12s =', JSON.stringify(await fn.inputValue()));
    console.log('PROBE2 non-GET during edit =', JSON.stringify(reqs));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await fn.waitFor({ timeout: 60000 });
    await page.waitForTimeout(3000);
    console.log('PROBE2 firstname after reload =', JSON.stringify(await fn.inputValue()));
    await fn.fill(hydrated);
    await page.waitForTimeout(12000);
    console.log('PROBE2 restored firstname after reload =', JSON.stringify(await fn.inputValue()));
    await page.goto('/dashboard/settings?tab=Profile', { waitUntil: 'domcontentloaded' });
    await page.locator('input[name="firstname"]').waitFor({ timeout: 60000 });
    const orig = await page.locator('input[name="firstname"]').inputValue();
    console.log('PROBE original firstname =', JSON.stringify(orig));
    const marker = `P${Date.now().toString().slice(-7)}`;
    reqs.length = 0;
    await page.locator('input[name="firstname"]').fill(marker);
    await page.locator('input[name="firstname"]').blur();
    for (const wait of [3000, 5000, 8000]) {
        await page.waitForTimeout(wait);
        console.log(`PROBE after +${wait}ms non-GET =`, JSON.stringify(reqs));
    }
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('input[name="firstname"]').waitFor({ timeout: 60000 });
    console.log('PROBE firstname after reload =', JSON.stringify(await page.locator('input[name="firstname"]').inputValue()), 'marker was', marker);
    // restore
    await page.locator('input[name="firstname"]').fill(orig);
    await page.locator('input[name="firstname"]').blur();
    await page.waitForTimeout(9000);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('input[name="firstname"]').waitFor({ timeout: 60000 });
    console.log('PROBE firstname restored =', JSON.stringify(await page.locator('input[name="firstname"]').inputValue()));

    // 6. Theme support: is there any dark surface for the account rail?
    console.log('PROBE dark-class support =', JSON.stringify(await page.evaluate(() => {
        const sheetHas = (needle) => [...document.styleSheets].some((s) => {
            try { return [...s.cssRules].some((r) => (r.cssText || '').includes(needle)); } catch { return false; }
        });
        return {
            hasDarkClassRule: sheetHas('.dark'),
            hasPrefersDark: sheetHas('prefers-color-scheme'),
            localStorageTheme: localStorage.getItem('theme') || localStorage.getItem('ime365_theme') || null,
            dataTheme: document.documentElement.getAttribute('data-theme'),
        };
    })));
    console.log('PROBE white-bg count on account rail =', await page.evaluate(async () => {
        document.querySelectorAll('[role="tab"]').forEach(() => {});
        return document.querySelectorAll('.bg-white').length;
    }));
});