// @ts-check
/**
 * DIR-018 contrast DIAGNOSTIC probe.
 *
 * PURPOSE
 * The AC-7 gate reported 7 breaches on /pricing. Several had `ratio: 1` and
 * `ratio: 1.48`, the signature of a probe bug rather than a real defect: the
 * gate's bgOf() walks ancestors reading ONLY `backgroundColor`. Elements painted
 * with a `background-image` linear-gradient report `backgroundColor:
 * rgba(0,0,0,0)`, so the walk skips them and inherits the page/card background
 * underneath -- producing white-on-white (ratio 1).
 *
 * This probe reports the FULL resolved painting context per offending node so we
 * can separate REAL WCAG failures from PROBE ARTIFACTS. It asserts nothing; it is
 * pure evidence for the fix/escalation decision.
 *
 * Zero fabrication: every number below is read from the live DOM.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { mintFirebaseSession } from '../../tests/e2e/dir006-session.mjs';

dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });
dotenv.config({ path: path.join(process.cwd(), 'backend', '.env'), quiet: true });

const EMAIL = process.env.DIR018_EMAIL || process.env.ADMIN_EMAIL || process.env.DIR006_EMAIL;
const ORIGIN = process.env.DIR018_WEB_ORIGIN || 'http://localhost:3000';
const OUT = '.bridge/evidence/dir018-contrast-diagnostic.json';

if (!EMAIL) {
    console.error('DIR018_EMAIL / ADMIN_EMAIL / DIR006_EMAIL required (no fabricated identity).');
    process.exit(1);
}

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await context.newPage();

const session = await mintFirebaseSession({ email: EMAIL });
if (!session) {
    console.error('Could not mint a live identity.');
    process.exit(1);
}
const report = await page.evaluate(() => {
    const parse = (s) => {
        if (!s) return null;
        const m = String(s).match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const p = m[1].split(',').map((x) => parseFloat(x));
        if (p.length < 3 || p.slice(0, 3).some((n) => Number.isNaN(n))) return null;
        return { rgb: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 };
    };
    const lum = (c) => {
        const a = c.map((v) => {
            const s = v / 255;
            return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
    };
    const over = (fg, bg, alpha) => fg.map((c, i) => c * alpha + bg[i] * (1 - alpha));
    const ratioOf = (f, b) => {
        const l1 = lum(f); const l2 = lum(b);
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    };
    // Naive walk (mirrors the AC-7 gate): backgroundColor only, no gradients.
    const naiveBg = (el) => {
        let acc = null;
        let n = el;
        while (n) {
            const c = parse(getComputedStyle(n).backgroundColor);
            if (c && c.a > 0) {
                acc = acc === null ? c.rgb.slice() : over(acc, c.rgb, c.a);
                if (c.a === 1) return acc;
            }
            n = n.parentElement;
        }
        return acc || [255, 255, 255];
    };

    const rows = [];
    for (const el of document.querySelectorAll('body *')) {
        if (el.children.length) continue;
        const text = (el.textContent || '').trim();
        if (!text) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        if (parseFloat(cs.opacity) === 0) continue;
        const rect = el.getBoundingClientRect();
        if (!rect.width || !rect.height) continue;
        const fg = parse(cs.color);
        if (!fg) continue;

        const size = parseFloat(cs.fontSize);
        const weight = parseInt(cs.fontWeight, 10) || 400;
        const need = (size >= 24 || (size >= 18.66 && weight >= 700)) ? 3.0 : 4.5;

        const bgNaive = naiveBg(el);
        const fgFlat = fg.a === 1 ? fg.rgb : over(fg.rgb, bgNaive, fg.a);
        const naive = ratioOf(fgFlat, bgNaive);
        if (naive + 0.02 >= need) continue; // only report what the gate flags

        const chain = [];
        let n = el;
        let depth = 0;
        while (n && depth < 14) {
            const s = getComputedStyle(n);
            if (s.backgroundColor !== 'rgba(0, 0, 0, 0)' || s.backgroundImage !== 'none') {
                const cn = n.className && n.className.baseVal !== undefined
                    ? n.className.baseVal : String(n.className || '');
                chain.push({
                    tag: n.tagName.toLowerCase(),
                    cls: cn.slice(0, 70),
                    backgroundColor: s.backgroundColor,
                    backgroundImage: s.backgroundImage.slice(0, 160),
                });
            }
            n = n.parentElement;
            depth += 1;
        }
        const gradientStops = [];
        for (const c of chain) {
            if (!c.backgroundImage.includes('gradient')) continue;
            const m = c.backgroundImage.match(/rgba?\([^)]+\)/g);
            if (m) gradientStops.push(...m);
        }
        const stopRatios = gradientStops.map((g) => {
            const p = parse(g);
            if (!p) return null;
            const fl = fg.a === 1 ? fg.rgb : over(fg.rgb, p.rgb, fg.a);
            return Number(ratioOf(fl, p.rgb).toFixed(2));
        }).filter((x) => x !== null);

        rows.push({
            text: text.slice(0, 60),
            naiveRatio: Number(naive.toFixed(2)),
            need,
            size,
            color: cs.color,
            opacity: cs.opacity,
            gradientStopRatios: stopRatios,
            gradientAncestor: chain.some((c) => c.backgroundImage.includes('gradient')),
            ancestry: chain,
        });
    }
    return rows;
});

fs.writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8');
console.log(`=== DIR-018 CONTRAST DIAGNOSTIC (${report.length} gate-flagged nodes) ===`);
for (const r of report) {
    const worst = r.gradientStopRatios.length ? Math.min(...r.gradientStopRatios) : r.naiveRatio;
    console.log(`\n"${r.text}"`);
    console.log(`  size=${r.size}px need=${r.need} color=${r.color} opacity=${r.opacity}`);
    console.log(`  naiveRatio=${r.naiveRatio}  gradientAncestor=${r.gradientAncestor}`);
    console.log(`  gradientStopRatios=[${r.gradientStopRatios.join(', ')}]  worstAgainstRealPaint=${worst}`);
    console.log(`  VERDICT=${r.gradientAncestor && worst + 0.02 >= r.need ? 'PROBE_ARTIFACT' : 'REAL_BREACH'}`);
}
console.log(`\nwritten -> ${OUT}`);

await browser.close();
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
if (session.storageState) await context.addCookies(session.storageState.cookies || []);

await page.goto(`${ORIGIN}/pricing`, { waitUntil: 'domcontentloaded' });
await page.getByRole('button', { name: /Monthly/i }).first().waitFor({ timeout: 30_000 });
await page.waitForTimeout(1500);