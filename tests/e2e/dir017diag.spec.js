// @ts-check
/**
 * DIR-017 diagnostic probe #3 - read-only ground truth for the 3 red stages.
 *
 * REPLACES the truncated probe #2, which ended in an unterminated
 * `// PLACEHOLDER_COLLECT` token and could never have run. No /api/* route is
 * intercepted, mocked or fulfilled: everything observed is live backend + MariaDB.
 *
 *   Q1 (stage 2) typing + blur produced ZERO POST /api/users-data/profile.
 *      Is the autosave effect suppressed (isFirstProfileLoadRef /
 *      skipNextAutosaveRef), latched off by PROFILE_CONFLICT, short-circuited
 *      by profileFitsPersistenceLimit, or is the edit not reaching React state?
 */
import { test } from '@playwright/test';
import path from 'node:path';
import dotenv from 'dotenv';
import { mintFirebaseSession } from './dir006-session.mjs';

dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });
dotenv.config({ path: path.join(process.cwd(), 'backend', '.env'), quiet: true });

const EMAIL = process.env.DIR017_EMAIL || process.env.ADMIN_EMAIL || process.env.DIR006_EMAIL;
const SESSION = EMAIL ? await mintFirebaseSession({ email: EMAIL }) : null;

test('dir017 diagnostics #3', async ({ page }) => {
    test.setTimeout(420_000);

    await page.addInitScript(({ uid, email, token, refreshToken, apiKey }) => {
        localStorage.setItem(`firebase:authUser:${apiKey}:[DEFAULT]`, JSON.stringify({
            uid, email, emailVerified: true, isAnonymous: false,
            stsTokenManager: { apiKey, refreshToken, accessToken: token, expirationTime: Date.now() + 3_600_000 },
            createdAt: String(Date.now()), lastLoginAt: String(Date.now()),
            apiKey, appName: '[DEFAULT]',
        }));
        localStorage.setItem('user', uid);
        localStorage.setItem('ime365_cuba_shell_v2', 'cuba');
    }, {
        uid: SESSION.uid, email: SESSION.email,
        token: SESSION.idToken, refreshToken: SESSION.refreshToken, apiKey: SESSION.apiKey,
    });

    const traffic = [];
    const problems = [];
    page.on('request', (r) => {
        const u = new URL(r.url());
        if (u.pathname.startsWith('/api/')) traffic.push(`${r.method()} ${u.pathname}`);
    });
    page.on('console', (m) => { if (m.type() === 'error') problems.push(`[console] ${m.text()}`.slice(0, 200)); });
    page.on('pageerror', (e) => problems.push(`[pageerror] ${String(e.message || e)}`.slice(0, 200)));
    page.on('response', async (r) => {
        if (!/users-data/.test(r.url()) || r.status() < 400) return;
        const body = await r.text().catch(() => '');
        problems.push(`[http ${r.status()}] ${r.request().method()} ${new URL(r.url()).pathname} :: ${body.slice(0, 250)}`);
    });

    // ===================== Q1: profile autosave round-trip =====================
    console.log('==== Q1 profile autosave ====');
    await page.goto('/dashboard/settings?tab=Profile', { waitUntil: 'domcontentloaded' });
    const firstname = page.locator('input[name="firstname"]');
    await firstname.waitFor({ timeout: 60_000 });
    await page.waitForTimeout(5000);

    const original = await firstname.inputValue();
    console.log('Q1 hydrated firstname =', JSON.stringify(original));
    console.log('Q1 traffic on mount   =', JSON.stringify(traffic));
    console.log('Q1 conflict banner   =', await page.getByText(/Discard local changes and load latest/i).count());

    const marker = `${(original || 'ime').slice(0, 24)}dir017`;
    const before = traffic.length;
    await firstname.fill(marker);
    await firstname.blur();
    for (const wait of [2500, 4000, 6000]) {
        await page.waitForTimeout(wait);
        console.log(`Q1 traffic +${wait}ms =`, JSON.stringify(traffic.slice(before)));
        console.log('Q1 conflict banner now =', await page.getByText(/Discard local changes and load latest/i).count());
        console.log('Q1 save region =', JSON.stringify(
            (await page.locator('text=/Profile save:/i').first().innerText().catch(() => '(not rendered)')).trim(),
        ));
    }

    await page.reload({ waitUntil: 'domcontentloaded' });
    await firstname.waitFor({ timeout: 60_000 });
    console.log('Q1 firstname after reload =', JSON.stringify(await firstname.inputValue()), '| marker was', JSON.stringify(marker));

    // Restore the shared row exactly as found.
    await firstname.fill(original);
    await firstname.blur();
    await page.waitForTimeout(9000);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await firstname.waitFor({ timeout: 60_000 });
    console.log('Q1 firstname restored =', JSON.stringify(await firstname.inputValue()));

    console.log('Q1-PROBLEMS', JSON.stringify(problems, null, 2));
// ============ Q2: contrast offenders, re-measured with ONE correct transfer ============
    // The stage-6 auditor parses oklch() to LINEAR sRGB and then hands those
    // linear bytes to a luminance function that applies the sRGB->linear
    // transfer AGAIN. That double-gamma is why oklch(0.554 0.046 257.417)
    // measured 1.39 against #0d0f16 instead of its true ~4.6. Here oklch is
    // ENCODED to sRGB bytes so parse() returns the same kind of value rgb()
    // already returns, and luminance() applies the transfer exactly once.
    console.log('==== Q2 contrast (corrected transfer) ====');
    await page.goto('/dashboard/settings?tab=Account', { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Account Credentials & Security' }).waitFor({ timeout: 60_000 });

    const offenders = await page.evaluate(() => {
        const toLinear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
        const toSrgb = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);

        const oklchToSrgb = (L, C, hDeg) => {
            const h = (hDeg * Math.PI) / 180;
            const a = C * Math.cos(h);
            const b = C * Math.sin(h);
            const l3 = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
            const m3 = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
            const s3 = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
            const enc = (x) => Math.round(255 * toSrgb(Math.min(1, Math.max(0, x))));
            return {
                r: enc(4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3),
                g: enc(-1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3),
                b: enc(-0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3),
                a: 1,
            };
        };

        const parse = (value) => {
            if (!value) return null;
            const rgb = value.match(/rgba?\(([^)]+)\)/);
            if (rgb) {
                const p = rgb[1].split(/[\s,/]+/).filter(Boolean).map(Number);
                return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
            }
            const ok = value.match(/oklch\(([^)]+)\)/);
            if (ok) {
                const [L, C, h] = ok[1].split(/[\s/]+/).map(Number);
                if ([L, C, h].every(Number.isFinite)) return oklchToSrgb(L, C, h);
            }
            return null;
        };

        const luminance = ({ r, g, b }) => (
            0.2126 * toLinear(r / 255) + 0.7152 * toLinear(g / 255) + 0.0722 * toLinear(b / 255)
        );
        const ratio = (f, b) => {
            const a = luminance(f), c = luminance(b);
            const [hi, lo] = a > c ? [a, c] : [c, a];
            return (hi + 0.05) / (lo + 0.05);
        };

        const stopsOf = (value) => {
            if (!value || !/gradient/.test(value)) return [];
            const out = [];
            for (const m of value.matchAll(/(?:rgba?\([^)]+\)|oklch\([^)]+\)|#[0-9a-f]{6}|[\w-]+)\s+([\d.]+)%/gi)) {
                const token = m[0].replace(/\s+[\d.]+%$/, '').trim();
                const hex = token.match(/^#([0-9a-f]{6})$/i);
                const n = hex ? parseInt(hex[1], 16) : null;
                const c = parse(token) || (n !== null
                    ? { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 }
                    : null);
                if (c) out.push({ ...c, at: Number(m[1]) / 100 });
            }
            return out;
        };

        const effectiveBg = (el) => {
            let node = el;
            while (node && node !== document.documentElement) {
                const cs = getComputedStyle(node);
                const stops = stopsOf(cs.backgroundImage);
                if (stops.length) return stops.map((s) => ({ ...s, fromGradient: true }));
                const bg = parse(cs.backgroundColor);
                if (bg && bg.a > 0.95) return [{ ...bg, fromGradient: false }];
                node = node.parentElement;
            }
            return [{ r: 255, g: 255, b: 255, a: 1, fromGradient: false }];
        };

        const out = [];
        for (const selector of ['h2', 'h3', 'label', 'p', 'span', 'button', 'li']) {
            for (const el of document.querySelectorAll(selector)) {
                const text = (el.textContent || '').trim();
                if (!text) continue;
                const cs = getComputedStyle(el);
                const fg = parse(cs.color);
                if (!fg) continue;
                const size = parseFloat(cs.fontSize);
                const weight = parseInt(cs.fontWeight, 10) || 400;
                const required = (size >= 24 || (size >= 18.66 && weight >= 700)) ? 3 : 4.5;
                const cands = effectiveBg(el);
                const value = Math.min(...cands.map((b) => ratio(fg, b)));
                if (value >= required) continue;
                const chain = [];
                let n = el;
                for (let i = 0; i < 6 && n && n !== document.documentElement; i += 1) {
                    const c = getComputedStyle(n);
                    chain.push({
                        tag: n.tagName.toLowerCase(),
                        cls: (n.getAttribute('class') || '').slice(0, 70),
                        bg: c.backgroundColor,
                        bgi: c.backgroundImage === 'none' ? 'none' : c.backgroundImage.slice(0, 60),
                    });
                    n = n.parentElement;
                }
                out.push({
                    selector, text: text.slice(0, 40),
                    ratio: Math.round(value * 100) / 100, required,
                    color: cs.color,
                    bg: cands.map((b) => `rgb(${b.r}, ${b.g}, ${b.b})${b.fromGradient ? ' [gradient]' : ''}`).join(' | '),
                    insideSettings: Boolean(el.closest('main')),
                    chain,
                });
            }
        }
        return out;
    });
console.log('Q2 offender count =', offenders.length);
    for (const o of offenders) {
        console.log('---', JSON.stringify({
            selector: o.selector, text: o.text, ratio: o.ratio, required: o.required,
            color: o.color, bg: o.bg, insideSettings: o.insideSettings,
        }));
        for (const c of o.chain) console.log('       ', JSON.stringify(c));
    }
    console.log('Q2-PROBLEMS', JSON.stringify(problems, null, 2));
});
