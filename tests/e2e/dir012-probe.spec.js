// @ts-check
/**
 * DIR-012 forensic probe — measures what the suite could not yet resolve.
 *
 * Answers four questions against the LIVE stack:
 *   1. Does the palette input actually receive focus on open, and how long after?
 *   2. Is the role-view banner's real painted contrast AA, and which element does
 *      the naive "walk up to an opaque background" method actually measure?
 *   3. Which command wins the palette's active index for the keyboard-nav query?
 *   4. What do the 51 CV templates actually look like on disk?
 */
import { test } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';
import { mintFirebaseSession } from './dir006-session.mjs';

dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });
dotenv.config({ path: path.join(process.cwd(), 'backend', '.env'), quiet: true });

const WEB_ORIGIN = 'http://localhost:3000';
const SESSION = await mintFirebaseSession({ email: process.env.ADMIN_EMAIL });

function contrast(fg, bg) {
    const parse = (v) => {
        const m = /^rgba?\(([^)]+)\)$/.exec(String(v || '').trim());
        if (!m) return null;
        const p = m[1].split(',').map(Number);
        if (p.length < 3 || p.some(Number.isNaN)) return null;
        if (p.length === 4 && p[3] === 0) return null;
        return p.slice(0, 3);
    };
    const lum = (rgb) => {
        const [r, g, b] = rgb.map((c) => {
            const v = c / 255;
            return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const a = parse(fg); const b = parse(bg);
    if (!a || !b) return null;
    const la = lum(a); const lb = lum(b);
    const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
    return (hi + 0.05) / (lo + 0.05);
}

test('probe', async ({ page }) => {
    await page.addInitScript(({ uid, email, token, refreshToken, apiKey }) => {
        localStorage.setItem(`firebase:authUser:${apiKey}:[DEFAULT]`, JSON.stringify({
            uid, email, emailVerified: true, isAnonymous: false,
            stsTokenManager: { apiKey, refreshToken, accessToken: token, expirationTime: Date.now() + 3600000 },
            createdAt: String(Date.now()), lastLoginAt: String(Date.now()), apiKey, appName: '[DEFAULT]',
        }));
        localStorage.setItem('user', uid);
        localStorage.setItem('ime365_cuba_shell_v2', 'cuba');
    }, {
        uid: SESSION.uid, email: SESSION.email, token: SESSION.idToken,
        refreshToken: SESSION.refreshToken, apiKey: SESSION.apiKey,
    });

    await page.goto(`${WEB_ORIGIN}/admin/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="role-switcher-button"]', { timeout: 60000 });

    // (1) palette focus timing
    await page.keyboard.press('Control+KeyK');
    await page.waitForSelector('[data-testid="cuba-command-palette"]', { state: 'visible', timeout: 30000 });
    const focusSamples = [];
    for (let i = 0; i < 6; i += 1) {
        focusSamples.push(await page.evaluate(() => ({
            isInput: document.activeElement === document.querySelector('input[role="combobox"]'),
            active: document.activeElement?.tagName + '.' + (document.activeElement?.getAttribute('role') || ''),
        })));
        await page.waitForTimeout(80);
    }
    console.log('PROBE focus samples:', JSON.stringify(focusSamples));

    // (3) ranked order + active index for the keyboard-nav query
    await page.locator('input[role="combobox"]').fill('audt tral');
    await page.waitForTimeout(1500);
    console.log('PROBE ranked:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('li[role="option"]')].map((li, i) => `${i}${li.getAttribute('aria-selected') === 'true' ? '*' : ''}:${li.textContent.trim().slice(0, 40)}`))));
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2500);
    console.log('PROBE url after Enter:', page.url());

    // (2) banner contrast - real painted pixels vs naive walk
    await page.goto(`${WEB_ORIGIN}/admin/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="role-switcher-button"]', { timeout: 60000 });
    await page.evaluate(() => sessionStorage.removeItem('superadmin_role_view'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="role-switcher-button"]', { timeout: 60000 });
    await page.locator('[data-testid="role-switcher-button"]').click();
    await page.locator('[data-testid="role-option-auditor"]').click();
    await page.waitForSelector('[data-testid="role-view-active-banner"]', { timeout: 20000 });
    const banner = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="role-view-active-banner"]');
        const inner = el.querySelector('span.text-xs.font-bold');
        const cs = getComputedStyle(el);
        const cis = inner ? getComputedStyle(inner) : null;
        return {
            bannerColor: cs.color,
            bannerBg: cs.backgroundColor,
            bannerBgImage: cs.backgroundImage,
            innerColor: cis?.color || null,
            innerBg: cis?.backgroundColor || null,
            parentBg: getComputedStyle(el.parentElement).backgroundColor,
        };
    });
    console.log('PROBE banner styles:', JSON.stringify(banner, null, 2));
    const stops = (banner.bannerBgImage.match(/rgba?\([^)]+\)/g) || []);
    console.log('PROBE gradient stops:', JSON.stringify(stops));
    console.log('PROBE white vs stops:', JSON.stringify(stops.map((s) => contrast(banner.bannerColor, s)?.toFixed(2))));
    console.log('PROBE innerText vs stops:', JSON.stringify(stops.map((s) => contrast(banner.innerColor, s)?.toFixed(2))));

    // (4) CV template layout
    const entries = fs.readdirSync(path.join(process.cwd(), 'src', 'cv-templates'));
    console.log('PROBE cv-templates:', JSON.stringify({
        total: entries.length,
        cvDirs: entries.filter((n) => /^cv\d+$/i.test(n)).length,
        sample: entries.slice(0, 6),
    }));
});
