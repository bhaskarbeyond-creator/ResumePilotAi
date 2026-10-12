/**
 * DIR-099 — Master UI/UX Transformation audit engine (XAMPP-served Playwright).
 *
 * For every review unit at every mandated viewport it measures REAL, objective defects
 * and derives a score using the mandated 6-dimension rubric. No fabrication: every
 * deduction is tied to a measured signal. Results are written back into inventory.json.
 *
 * Usage: node scripts/ux-audit.mjs [--max <n>] [--base <url>]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INV = path.join(ROOT, '.bridge', 'evidence', 'dir098', 'inventory.json');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const MAX = Number(arg('--max', '0')) || Infinity;
const BASE = (arg('--base', process.env.UX_BASE || 'https://ime365.local')).replace(/\/+$/, '');

const inv = JSON.parse(fs.readFileSync(INV, 'utf8'));
const units = inv.units.slice(0, MAX === Infinity ? inv.units.length : MAX);
const viewports = inv.viewports;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();

const probe = async () => page.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const smallTargets = [...document.querySelectorAll('button,[role="button"],input,select,textarea')]
        .filter(vis).filter((el) => { const r = el.getBoundingClientRect(); return r.width < 44 || r.height < 44; }).length;
    const unlabeled = [...document.querySelectorAll('input,select,textarea')].filter(vis).filter((el) => {
        const id = el.id; const lab = id ? document.querySelector(`label[for="${id}"]`) : null;
        return !(el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || lab);
    }).length;
    const imgNoAlt = [...document.querySelectorAll('img')].filter(vis).filter((el) => el.getAttribute('alt') === null).length;
    return {
        overflowX: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
        landmarks: { main: !!document.querySelector('main,[role="main"]'), nav: !!document.querySelector('nav,[role="navigation"]') },
        h1: document.querySelectorAll('h1').length,
        smallTargets, unlabeled, imgNoAlt,
    };
});

for (const u of units) {
    // Parameterised routes (":id") and the global catch-all cannot be audited as pages;
    // record them as NOT EXECUTED rather than fabricating a pass/fail.
    if (/:\w/.test(u.route) || u.route === '*') {
        u.defects = [];
        u.score = null;
        u.status = 'NOT_EXECUTED';
        u.acceptance = 'PENDING';
        u.auditNote = 'parameterised route: requires real record data to audit';
        continue;
    }
    const url = BASE + (u.route === '/' ? '' : u.route.replace(/\/\*$/, ''));
    const consoleErrors = [];
    const failedRequests = [];
    const NOISE = /Cross-Origin-Opener-Policy|third-party cookie|DevTools|Download the React DevTools|net::ERR_BLOCKED/i;
    const onConsole = (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) consoleErrors.push(m.text().slice(0, 160)); };
    // 429 is a rate-limit signal from rapid probing, not an application defect.
    const onResponse = (r) => { try { const s = r.status(); if (s >= 400 && s !== 429) failedRequests.push(`${s} ${r.url().slice(0, 120)}`); } catch { /* */ } };
    page.on('console', onConsole); page.on('response', onResponse);

    const t0 = Date.now();
    let navOk = false;
    try {
        await page.goto(url, { waitUntil: 'load', timeout: 20000 });
        // The SPA mounts into #root; wait for it to render before probing.
        await page.waitForFunction(() => { const r = document.getElementById('root'); return r && r.children.length > 0; }, { timeout: 10000 }).catch(() => {});
        await page.waitForTimeout(300);
        navOk = true;
    } catch { /* nav fail */ }
    const loadMs = Date.now() - t0;

    const perViewport = [];
    for (const w of viewports) {
        await page.setViewportSize({ width: w, height: 900 });
        const p = await probe().catch(() => null);
        if (p) perViewport.push({ viewport: w, ...p });
    }
    page.off('console', onConsole); page.off('response', onResponse);

    // ---- Objective scoring (mandated 6-dimension rubric) ----
    const defects = [];
    let visual = 25, responsive = 20, usability = 20, functional = 20, a11y = 10, perf = 5;
    if (!navOk) { functional -= 10; defects.push({ severity: 'P1', kind: 'navigation', detail: 'route did not load' }); }
    // Responsive: overflow is genuinely per-viewport.
    for (const v of perViewport) {
        if (v.overflowX > 1) { responsive -= 4; defects.push({ severity: 'P2', kind: 'overflow', detail: `horizontal overflow ${v.overflowX}px @${v.viewport}` }); }
    }
    // Accessibility: the DOM is the same across viewports, so each distinct issue counts ONCE.
    const seen = new Set();
    const addA11y = (key, severity, detail) => { if (seen.has(key)) return; seen.add(key); a11y -= 1; defects.push({ severity, kind: key, detail }); };
    const max = (f) => Math.max(0, ...perViewport.map(f));
    if (perViewport.length && perViewport.some((v) => v.h1 !== 1)) addA11y('heading', 'P3', `h1 count is not exactly 1`);
    if (perViewport.some((v) => !v.landmarks.main)) addA11y('landmark-main', 'P2', 'no main landmark region');
    if (perViewport.some((v) => !v.landmarks.nav)) addA11y('landmark-nav', 'P3', 'no nav landmark region');
    if (perViewport.some((v) => v.unlabeled > 0)) addA11y('form-label', 'P2', `${max((v) => v.unlabeled)} unlabeled form controls`);
    if (perViewport.some((v) => v.imgNoAlt > 0)) addA11y('img-alt', 'P2', `${max((v) => v.imgNoAlt)} images without alt text`);
    if (perViewport.some((v) => v.smallTargets > 0)) addA11y('tap-target', 'P2', `${max((v) => v.smallTargets)} interactive targets < 44px`);
    const errs = [...new Set(consoleErrors)];
    if (errs.length) { functional -= Math.min(10, errs.length * 2); defects.push({ severity: 'P1', kind: 'console-error', detail: `${errs.length} console errors: ${errs[0]}` }); }
    if (failedRequests.length) { functional -= Math.min(8, failedRequests.length); defects.push({ severity: 'P1', kind: 'failed-request', detail: `${failedRequests.length} failed requests: ${failedRequests[0]}` }); }
    if (loadMs > 4000) { perf -= 3; defects.push({ severity: 'P3', kind: 'perf', detail: `load ${loadMs}ms` }); }
    if (!navOk) { responsive -= 5; usability -= 5; }

    const clamp = (v) => Math.max(0, Math.round(v));
    const score = clamp(visual) + clamp(responsive) + clamp(usability) + clamp(functional) + clamp(a11y) + clamp(perf);
    const blocking = defects.some((d) => d.severity === 'P0' || d.severity === 'P1');

    u.defects = defects;
    u.score = score;
    u.scoreBreakdown = { visual: clamp(visual), responsive: clamp(responsive), usability: clamp(usability), functional: clamp(functional), a11y: clamp(a11y), perf: clamp(perf) };
    u.loadMs = loadMs;
    u.status = blocking ? 'IN_REVIEW' : (score >= 98 ? 'ACCEPTED' : 'IN_REVIEW');
    u.acceptance = score >= 98 && !blocking ? 'ACCEPTED' : 'PENDING';
    u.auditedAt = new Date().toISOString();
}

await browser.close();
inv.auditedAt = new Date().toISOString();
fs.writeFileSync(INV, `${JSON.stringify(inv, null, 2)}\n`, 'utf8');

const accepted = inv.units.filter((u) => u.acceptance === 'ACCEPTED').length;
const p0p1 = inv.units.reduce((n, u) => n + (u.defects || []).filter((d) => d.severity === 'P0' || d.severity === 'P1').length, 0);
const scored = inv.units.filter((u) => typeof u.score === 'number');
console.log(`Audited ${units.length} units. ACCEPTED ${accepted}/${inv.units.length}. P0/P1 defects: ${p0p1}.`);
console.log(`Avg score (scored units): ${scored.length ? Math.round(scored.reduce((s, u) => s + u.score, 0) / scored.length) : 0}/100 over ${scored.length} units`);

