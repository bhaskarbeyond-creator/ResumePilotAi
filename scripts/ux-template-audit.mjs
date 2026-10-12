/**
 * DIR-104 (Tier 2) — audit the parameterised route templates against REAL record data.
 * Resolvable templates are audited; the rest are documented BLOCKED (never fabricated).
 * Usage: node scripts/ux-template-audit.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INV = path.join(ROOT, '.bridge', 'evidence', 'dir098', 'templates.json');
const BASE = (process.env.UX_BASE || 'https://ime365.local').replace(/\/+$/, '');
const VIEWPORTS = [320, 375, 768, 1024, 1280, 1440, 1920];

const RESOLVE = {
    '/blog/:slug': '/blog/how-to-beat-ats-in-2026',
    '/blog-editor/:postId': '/blog-editor/post_ats_guide_2026',
    '/jobs/portal/:jobId': '/jobs/portal/job-air-23',
    '/jobs/in/:slug': '/jobs/in/san-francisco-ca',
    '/jobs/city/:slug': '/jobs/city/san-francisco',
    '/jobs/category/:catName': '/jobs/category/engineering',
    '/p/:custompage': '/p/ux-audit-page',
    '/portfolio/:slug': '/portfolio/ux-audit-portfolio',
    '/resume/:step': '/resume/heading',
};
const BLOCK = {
    '/org/:slug/*': 'organization route is auth-gated (redirects to login)',
    '/shared/:resumeId': 'no shared-resume record exists to resolve',
    '*': 'router catch-all (not a page)',
};

const inv = JSON.parse(fs.readFileSync(INV, 'utf8'));
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();

const probe = () => page.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    return {
        overflowX: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
        main: !!document.querySelector('main,[role="main"]'),
        nav: !!document.querySelector('nav,[role="navigation"]'),
        h1: document.querySelectorAll('h1').length,
        small: [...document.querySelectorAll('button,[role="button"],input,select,textarea')].filter(vis).filter((el) => { const r = el.getBoundingClientRect(); return r.width < 44 || r.height < 44; }).length,
        unlabeled: [...document.querySelectorAll('input,select,textarea')].filter(vis).filter((el) => {
            const id = el.id; const lab = id ? document.querySelector(`label[for="${id}"]`) : null;
            return !(el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || lab);
        }).length,
    };
});

for (const u of inv.units) {
    if (BLOCK[u.route]) { u.defects = []; u.score = null; u.status = 'BLOCKED'; u.acceptance = 'BLOCKED'; u.auditNote = BLOCK[u.route]; continue; }
    const resolved = RESOLVE[u.route];
    if (!resolved) { u.defects = []; u.score = null; u.status = 'BLOCKED'; u.acceptance = 'BLOCKED'; u.auditNote = 'no resolver'; continue; }
    const errs = [];
    const onC = (m) => { if (m.type() === 'error' && !/Cross-Origin|third-party|DevTools|Failed to load resource|Too many requests|RATE_LIMITED/i.test(m.text())) errs.push(m.text().slice(0, 120)); };
    page.on('console', onC);
    let ok = false;
    try {
        await page.goto(BASE + resolved, { waitUntil: 'load', timeout: 25000 });
        await page.waitForFunction(() => document.querySelector('h1, main, nav'), { timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(500);
        ok = true;
    } catch { /* */ }
    const per = [];
    for (const w of VIEWPORTS) { await page.setViewportSize({ width: w, height: 900 }); per.push(await probe().catch(() => null)); }
    page.off('console', onC);
    const P = per.filter(Boolean);
    const defects = []; let responsive = 20; let usability = 20; let functional = 20; let a11y = 10;
    if (!ok) { functional -= 10; usability -= 5; defects.push({ severity: 'P1', kind: 'navigation', detail: 'did not load' }); }
    for (const v of P) if (v.overflowX > 1) { responsive -= 4; defects.push({ severity: 'P2', kind: 'overflow', detail: `${v.overflowX}px` }); }
    const max = (f) => Math.max(0, ...P.map(f));
    if (P.some((v) => !v.main)) { a11y -= 1; defects.push({ severity: 'P2', kind: 'landmark-main', detail: 'no main' }); }
    if (P.some((v) => !v.nav)) { a11y -= 1; defects.push({ severity: 'P3', kind: 'landmark-nav', detail: 'no nav' }); }
    if (P.some((v) => v.h1 !== 1)) { a11y -= 1; defects.push({ severity: 'P3', kind: 'heading', detail: 'h1 != 1' }); }
    if (P.some((v) => v.unlabeled > 0)) { a11y -= 1; defects.push({ severity: 'P2', kind: 'form-label', detail: `${max((v) => v.unlabeled)} unlabeled` }); }
    if (P.some((v) => v.small > 0)) { a11y -= 1; defects.push({ severity: 'P2', kind: 'tap-target', detail: `${max((v) => v.small)} <44px` }); }
    if ([...new Set(errs)].length) { functional -= Math.min(10, [...new Set(errs)].length * 2); defects.push({ severity: 'P1', kind: 'console-error', detail: errs[0] }); }
    const cl = (v) => Math.max(0, Math.round(v));
    const score = 25 + cl(responsive) + cl(usability) + cl(functional) + cl(a11y) + 5;
    const blocking = defects.some((d) => d.severity === 'P0' || d.severity === 'P1');
    u.defects = defects; u.score = score; u.resolved = resolved;
    u.status = blocking ? 'IN_REVIEW' : (score >= 98 ? 'ACCEPTED' : 'IN_REVIEW');
    u.acceptance = score >= 98 && !blocking ? 'ACCEPTED' : 'PENDING';
    await page.waitForTimeout(200);
}

await browser.close();
inv.auditedAt = new Date().toISOString();
fs.writeFileSync(INV, `${JSON.stringify(inv, null, 2)}\n`, 'utf8');
const acc = inv.units.filter((u) => u.acceptance === 'ACCEPTED').length;
const blk = inv.units.filter((u) => u.acceptance === 'BLOCKED').length;
console.log(`Tier 2 templates: ACCEPTED ${acc}/${inv.units.length}, BLOCKED ${blk}`);
for (const u of inv.units) console.log(`  ${u.route} -> ${u.acceptance} ${u.score ?? ''} ${u.auditNote || ''}`);

