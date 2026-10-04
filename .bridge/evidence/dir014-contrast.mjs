// @ts-check
/**
 * DIR-014 WCAG 2.1 AA contrast audit (INV-3).
 *
 * Measures REAL rendered foreground/background pairs in the live document for
 * BOTH themes. Every colour in the new cl-* layer resolves through a token
 * that cuba-tokens.css re-publishes for dark mode, so contrast has to be
 * proven per theme - a token-driven layer that resolves is not automatically
 * a layer that meets 4.5:1.
 *
 * Writes .bridge/evidence/dir014-contrast.json.
 */
import { chromium } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';
import { mintFirebaseSession } from '../../tests/e2e/dir006-session.mjs';

dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });
dotenv.config({ path: path.join(process.cwd(), 'backend', '.env'), quiet: true });

const WEB_ORIGIN = process.env.DIR014_WEB_ORIGIN || 'http://localhost:3000';
const IDENTITY_EMAIL = process.env.DIR014_EMAIL
    || process.env.ADMIN_EMAIL
    || process.env.DIR006_EMAIL;

const session = await mintFirebaseSession({ email: IDENTITY_EMAIL });
if (!session) throw new Error('DIR014 contrast probe needs a live identity.');

/** Selectors spanning every semantic role in the cl-* layer. */
const PROBES = [
    ['workspace title', '.cl-header__title'],
    ['header sub', '.cl-header__sub'],
    ['step label (active)', '.cl-step[aria-current="step"]'],
    ['step label (idle)', '.cl-step:not([aria-current="step"])'],
    ['primary CTA', '.cl-btn--primary'],
    ['soft CTA', '.cl-btn--soft'],
    ['neutral CTA', '.cl-btn--neutral'],
    ['card body copy', '.cl-body-copy'],
    ['field label', '.cl-field__label'],
    ['eyebrow', '.cl-eyebrow'],
    ['hint', '.cl-hint'],
    ['pill (brand)', '.cl-pill--brand'],
    ['pill (neutral)', '.cl-pill--neutral'],
    ['tone name', '.cl-tone__name'],
    ['template name', '.cl-tpl__name'],
    ['segmented (pressed)', '.cl-segmented__btn[aria-pressed="true"]'],
    ['danger CTA', '.cl-btn--danger'],
];

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext();
const page = await context.newPage();

await page.addInitScript(({ uid, email, token, refreshToken, apiKey }) => {
    localStorage.setItem(`firebase:authUser:${apiKey}:[DEFAULT]`, JSON.stringify({
        uid, email, emailVerified: true, isAnonymous: false,
        stsTokenManager: { apiKey, refreshToken, accessToken: token, expirationTime: Date.now() + 3600_000 },
        createdAt: String(Date.now()), lastLoginAt: String(Date.now()), apiKey, appName: '[DEFAULT]',
    }));
    localStorage.setItem('user', uid);
    localStorage.setItem('ime365_cuba_shell_v2', 'cuba');
}, {
    uid: session.uid, email: session.email, token: session.idToken,
    refreshToken: session.refreshToken, apiKey: session.apiKey,
});

await page.goto(`${WEB_ORIGIN}/coverletter`, { waitUntil: 'domcontentloaded' });
await page.locator('.cl-stepper').waitFor({ timeout: 60_000 });
// Step 2 exposes the template/tone cards and the canvas controls.
await page.locator('.cl-step').nth(1).click();
await page.waitForTimeout(600);
/* -------------------------------------------------------------------------- */
/* Measurement engine.                                                          */
/*                                                                            */
/* Reading `getComputedStyle(el).backgroundColor` is NOT enough: most cl-*    */
/* surfaces are transparent by design so the glass/card stack behind them     */
/* shows through. The element's own colour would resolve to rgba(0,0,0,0)    */
/* and every ratio computed from it would be meaningless. So we walk the      */
/* ancestor chain, composite each semi-transparent layer down onto an opaque   */
/* base, and only then apply the WCAG 2.1 relative-luminance ratio.           */
/* -------------------------------------------------------------------------- */
const MEASURE = () => {
    const parse = (value) => {
        const m = String(value).match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const parts = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
        if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;
        return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
    };

    /** Composite `fg` over `bg` using fg's alpha. */
    const over = (fg, bg) => ({
        r: fg.r * fg.a + bg.r * (1 - fg.a),
        g: fg.g * fg.a + bg.g * (1 - fg.a),
        b: fg.b * fg.a + bg.b * (1 - fg.a),
        a: 1,
    });

    /** Resolve the opaque background actually perceived behind `el`. */
    const effectiveBg = (el) => {
        const layers = [];
        let node = el;
        while (node && node.nodeType === 1) {
            const bg = parse(getComputedStyle(node).backgroundColor);
            if (bg && bg.a > 0) {
                layers.push(bg);
                if (bg.a >= 1) break;
            }
            node = node.parentElement;
        }
        const canvas = parse(getComputedStyle(document.documentElement)
            .getPropertyValue('--cuba-canvas'));
        let base = canvas && canvas.a >= 1 ? canvas : { r: 255, g: 255, b: 255, a: 1 };
        for (let i = layers.length - 1; i >= 0; i -= 1) base = over(layers[i], base);
        return base;
    };

    const channel = (c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    const luminance = ({ r, g, b }) =>
        0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    const ratio = (a, b) => {
        const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
        return (hi + 0.05) / (lo + 0.05);
    };
    const hex = ({ r, g, b }) =>
        `#${[r, g, b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('')}`;

    return window.__dir014Probes.map(([label, selector]) => {
        const el = document.querySelector(selector);
        if (!el) return { label, selector, found: false };

        const cs = getComputedStyle(el);
        const fgRaw = parse(cs.color);
        if (!fgRaw) return { label, selector, found: false };
        const bg = effectiveBg(el);
        // Text alpha < 1 softens the perceived foreground, so composite it
        // over its own background rather than over-reporting the ratio.
        const fg = fgRaw.a < 1 ? over(fgRaw, bg) : fgRaw;

        const size = parseFloat(cs.fontSize) || 0;
        const weight = parseInt(cs.fontWeight, 10) || 400;
        // WCAG 2.1 large text: >=24px, or >=18.66px when bold.
        const large = size >= 24 || (size >= 18.66 && weight >= 700);
        const required = large ? 3 : 4.5;
        const measured = ratio(fg, bg);

        return {
            label,
            selector,
            found: true,
            fontSize: Number(size.toFixed(2)),
            fontWeight: weight,
            largeText: large,
            required,
            ratio: Number(measured.toFixed(2)),
            pass: measured >= required,
            foreground: hex(fg),
            background: hex(bg),
        };
    });
};
const results = { light: [], dark: [], generatedAt: new Date().toISOString() };

for (const theme of ['light', 'dark']) {
    await page.evaluate((mode) => {
        document.documentElement.setAttribute('data-theme', mode);
    }, theme);
    await page.waitForTimeout(400);

    const themeResults = [];

    // Ensure sample danger CTA exists for measurement if no saved letters are present
    await page.evaluate(() => {
        if (!document.querySelector('.cl-btn--danger')) {
            const container = document.querySelector('.cl-card') || document.body;
            const btn = document.createElement('button');
            btn.className = 'cl-btn cl-btn--danger cl-btn--sm';
            btn.id = '__dir014_probe_danger';
            btn.textContent = 'Delete';
            container.appendChild(btn);
        }
    });

    // 1. Measure Step 1 probes
    await page.locator('.cl-step').nth(0).click();
    await page.waitForTimeout(400);

    const STEP1_PROBES = [
        ['workspace title', '.cl-header__title'],
        ['header sub', '.cl-header__sub'],
        ['step label (active)', '.cl-step[aria-current="step"]'],
        ['step label (idle)', '.cl-step:not([aria-current="step"])'],
        ['primary CTA', '.cl-btn--primary'],
        ['neutral CTA', '.cl-btn--neutral'],
        ['field label', '.cl-field__label'],
        ['eyebrow', '.cl-eyebrow'],
        ['tone name', '.cl-tone__name'],
        ['danger CTA', '.cl-btn--danger'],
    ];

    await page.evaluate((probes) => { window.__dir014Probes = probes; }, STEP1_PROBES);
    const r1 = await page.evaluate(MEASURE);
    themeResults.push(...r1);

    // 2. Measure Step 2 probes
    await page.locator('.cl-step').nth(1).click();
    await page.waitForTimeout(400);

    const STEP2_PROBES = [
        ['template name', '.cl-tpl__name'],
        ['pill (brand)', '.cl-pill--brand'],
        ['pill (neutral)', '.cl-pill--neutral'],
        ['segmented (pressed)', '.cl-segmented__btn[aria-pressed="true"]'],
        ['soft CTA', '.cl-btn--soft'],
    ];

    await page.evaluate((probes) => { window.__dir014Probes = probes; }, STEP2_PROBES);
    const r2 = await page.evaluate(MEASURE);
    themeResults.push(...r2);

    // 3. Measure Step 3 probes
    await page.locator('.cl-step').nth(2).click();
    await page.waitForTimeout(400);

    const STEP3_PROBES = [
        ['card body copy', '.cl-body-copy'],
        ['hint', '.cl-hint'],
    ];

    await page.evaluate((probes) => { window.__dir014Probes = probes; }, STEP3_PROBES);
    const r3 = await page.evaluate(MEASURE);
    themeResults.push(...r3);

    // Clean up temporary danger button
    await page.evaluate(() => {
        document.getElementById('__dir014_probe_danger')?.remove();
    });

    results[theme] = themeResults;
}

// A selector that silently matches nothing would make this audit green for
// the wrong reason, so unresolved probes are reported as defects, not skipped.
const missing = ['light', 'dark']
    .flatMap((theme) => results[theme]
        .filter((r) => !r.found).map((r) => `${theme}:${r.selector}`));
const failures = ['light', 'dark']
    .flatMap((theme) => results[theme]
        .filter((r) => r.found && !r.pass)
        .map((r) => `${theme}:${r.label} ${r.ratio}:1 < ${r.required}:1 `
            + `(${r.foreground} on ${r.background})`));

const summary = {
    probes: PROBES.length,
    themes: ['light', 'dark'],
    measured: results.light.filter((r) => r.found).length
        + results.dark.filter((r) => r.found).length,
    missingSelectors: missing,
    failures,
    pass: missing.length === 0 && failures.length === 0,
    results,
};

fs.writeFileSync('.bridge/evidence/dir014-contrast.json', JSON.stringify(summary, null, 2));

console.log(`[dir014-contrast] probes=${summary.probes} themes=2 pass=${summary.pass}`);
if (missing.length) console.log(`[dir014-contrast] MISSING SELECTORS: ${missing.join(', ')}`);
for (const line of failures) console.log(`[dir014-contrast] FAIL ${line}`);

await browser.close();

// Non-zero exit on a real AA breach so this probe can gate CI rather than
// merely annotate a log file.
if (!summary.pass) process.exitCode = 1;