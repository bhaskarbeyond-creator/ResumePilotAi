/**
 * IME365 — Deep crawl runner.
 *
 * Crawls the live application across the full route inventory, all mandated
 * viewports, and anonymous/private auth states, capturing console, pageerror,
 * network, HTTP-status, API and accessibility evidence per page.
 *
 * Usage:
 *   node crawl-artifacts/harness/run-crawl.mjs [--out <file>] [--label <name>] [--viewports a,b]
 */
import path from 'node:path';
import {
  DEFAULT_BASE, DEFAULT_SEED, VIEWPORTS, launchBrowser, newContext,
  visit, writeJson, ensureDirs,
} from './crawler-harness.mjs';
import { ALL_ROUTES } from './routes.mjs';

const args = process.argv.slice(2);
const argOf = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const BASE = argOf('--base', DEFAULT_BASE);
const OUT = argOf('--out', 'crawl-artifacts/reports/crawl-results.json');
const LABEL = argOf('--label', 'crawl');
const only = argOf('--viewports', null);
const VIEWPORT_SET = only
  ? VIEWPORTS.filter((v) => only.split(',').includes(v.name))
  : VIEWPORTS;

/** Aggregate every occurrence of an issue code with its affected routes. */
function aggregate(records) {
  const byCode = new Map();
  for (const rec of records) {
    for (const issue of rec.issues) {
      if (!byCode.has(issue.code)) {
        byCode.set(issue.code, { code: issue.code, count: 0, routes: new Set(), details: new Set() });
      }
      const e = byCode.get(issue.code);
      e.count += 1;
      e.routes.add(`${rec.route} @${rec.viewport}${rec.kind ? ` [${rec.kind}]` : ''}`);
      e.details.add(issue.detail?.slice(0, 240) || '');
    }
  }
  return [...byCode.values()].map((e) => ({
    code: e.code,
    occurrences: e.count,
    affectedRoutes: [...e.routes].slice(0, 40),
    exampleDetails: [...e.details].slice(0, 5),
  })).sort((a, b) => b.occurrences - a.occurrences);
}

const startedAll = Date.now();
const browser = await launchBrowser();
const records = [];
const consoleIndex = new Map();
const apiIndex = new Map();
let failures = 0;

console.log(`[crawl] base=${BASE} label=${LABEL} seed=${DEFAULT_SEED}`);
console.log(`[crawl] routes=${ALL_ROUTES.length} viewports=${VIEWPORT_SET.length} ` +
  `total=${ALL_ROUTES.length * VIEWPORT_SET.length}`);

for (const vp of VIEWPORT_SET) {
  const ctx = await newContext(browser, { width: vp.width, height: vp.height });
  for (const r of ALL_ROUTES) {
    const page = await ctx.newPage();
    const slug = `${r.name || r.route}__${vp.name}`.replace(/[^a-z0-9_-]/gi, '_');
    let rec;
    try {
      rec = await visit(page, BASE, r.route, {
        screenshot: path.join('crawl-artifacts/screenshots', LABEL, `${slug}.png`),
      });
    } catch (e) {
      rec = { route: r.route, httpStatus: null, loadMs: 0, dom: null,
        issues: [{ code: 'HARNESS_ERROR', detail: e.message }], consoleErrors: [],
        consoleWarnings: [], pageErrors: [e.message], failedRequests: [], apiCalls: [] };
    }
    rec.name = r.name;
    rec.kind = r.kind;
    rec.viewport = vp.name;
    rec.expectNotFound = !!r.expectNotFound;
    rec.finalPath = rec.dom ? rec.dom.url : null;

    // Auth-guard expectation: private routes must not render private content.
    if (r.kind === 'private') {
      const guarded = /\/login/.test(rec.finalPath || '');
      rec.authGuard = guarded ? 'REDIRECTED_TO_LOGIN' : 'RENDERED_WITHOUT_REDIRECT';
      if (!guarded && rec.dom && rec.dom.textLength > 200) {
        rec.issues.push({ code: 'AUTH_GUARD_BYPASS', detail: `private ${r.route} rendered ${rec.dom.textLength} chars at ${rec.finalPath}` });
      }
    }
    // The unknown route must actually resolve to a 404. On that route the
    // CLIENT_404 signal from classify() is the expected behaviour, not a defect.
    if (r.expectNotFound && rec.dom) {
      rec.issues = rec.issues.filter((i) => i.code !== 'CLIENT_404');
      if (!rec.dom.is404) {
        rec.issues.push({ code: 'MISSING_404_HANDLER', detail: `unknown route rendered as a normal page: ${rec.dom.textSample.slice(0, 120)}` });
      }
    }

    for (const c of rec.consoleErrors) {
      const key = c.slice(0, 200);
      if (!consoleIndex.has(key)) consoleIndex.set(key, { message: key, occurrences: 0, routes: new Set() });
      const e = consoleIndex.get(key);
      e.occurrences += 1;
      e.routes.add(rec.route);
    }
    for (const a of rec.apiCalls) {
      const key = `${a.method} ${a.url.replace(BASE, '').split('?')[0]} -> ${a.status}`;
      if (!apiIndex.has(key)) apiIndex.set(key, { endpoint: key, occurrences: 0, routes: new Set() });
      const e = apiIndex.get(key);
      e.occurrences += 1;
      e.routes.add(rec.route);
    }
    if (rec.issues.length) failures += 1;
    records.push(rec);

    const badge = rec.issues.length ? 'X' : '.';
    console.log(`  [${badge}] ${vp.name.padEnd(18)} ${r.route.padEnd(38)} ` +
      `${String(rec.httpStatus).padEnd(4)} ${String(rec.loadMs).padStart(6)}ms` +
      (rec.issues.length ? `  ${rec.issues.map((i) => i.code).join(',')}` : ''));
    await page.close();
  }
  await ctx.close();
}


await browser.close();

const sortedLoads = records.map((r) => r.loadMs).sort((a, b) => a - b);
const summary = {
  label: LABEL,
  base: BASE,
  seed: DEFAULT_SEED,
  startedAt: new Date(startedAll).toISOString(),
  durationMs: Date.now() - startedAll,
  routesCrawled: ALL_ROUTES.length,
  viewports: VIEWPORT_SET.map((v) => v.name),
  pageVisits: records.length,
  pageVisitsWithIssues: failures,
  cleanPageVisits: records.length - failures,
  issueAggregate: aggregate(records),
  consoleErrors: [...consoleIndex.values()]
    .map((e) => ({ ...e, routes: [...e.routes] }))
    .sort((a, b) => b.occurrences - a.occurrences),
  apiCalls: [...apiIndex.values()]
    .map((e) => ({ ...e, routes: [...e.routes] }))
    .sort((a, b) => b.occurrences - a.occurrences),
  loadMs: {
    p50: sortedLoads[Math.floor(sortedLoads.length * 0.5)],
    p95: sortedLoads[Math.floor(sortedLoads.length * 0.95)],
    max: sortedLoads[sortedLoads.length - 1],
  },
};

ensureDirs(path.dirname(OUT));
writeJson(OUT, { summary, records });
console.log(`\n[crawl] visits=${records.length} clean=${summary.cleanPageVisits} withIssues=${failures}`);
console.log(`[crawl] wrote ${OUT}`);
console.log('[crawl] top issues:');
for (const i of summary.issueAggregate.slice(0, 12)) {
  console.log(`   ${String(i.occurrences).padStart(4)}  ${i.code.padEnd(22)} ${i.affectedRoutes.slice(0, 3).join(' , ')}`);
}
