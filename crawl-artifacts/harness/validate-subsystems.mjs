/**
 * IME365 — Phase 5 subsystem validator: operational probes + auth boundary.
 *
 * Validates the deployed Apache surface rather than the backend in isolation:
 *  - documented public probes must return backend JSON, never the SPA shell
 *  - unknown routes must return the SPA (rewrite fallback still works)
 *  - private routes must redirect an anonymous visitor to /login
 *  - security headers must be present on the HTML response
 */
import { DEFAULT_BASE, ensureDirs, writeJson, launchBrowser, newContext } from './crawler-harness.mjs';

const BASE = process.env.CRAWL_BASE_URL || DEFAULT_BASE;
const results = { base: BASE, startedAt: new Date().toISOString(), checks: [] };

function record(name, pass, detail) {
  results.checks.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function get(url, { maxBody = 300 } = {}) {
  const res = await fetch(url, { redirect: 'manual' });
  const ct = res.headers.get('content-type') || '';
  let full = '';
  try { full = await res.text(); } catch { /* body optional */ }
  return {
    status: res.status,
    ct,
    body: full.slice(0, maxBody),
    full,
    json: (() => { try { return JSON.parse(full); } catch { return null; } })(),
    headers: res.headers,
  };
}

// Force the Node TLS check to be satisfied for the local dev certificate.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// ── 1. Documented public probes must reach the backend ──────────────────────
for (const [probe, expectJson] of [
  ['/healthz', true],
  ['/readyz', true],
  ['/public/custom-pages.json', true],
]) {
  const r = await get(BASE + probe);
  const isJson = /application\/json/i.test(r.ct);
  const notSpa = !/<!doctype html/i.test(r.body);
  record(
    `probe ${probe} returns backend response`,
    expectJson && isJson && notSpa,
    `status=${r.status} content-type=${r.ct}`,
  );
  if (r.status >= 400) {
    console.log(`      note: non-2xx is legitimate when a backend feature flag is disabled.`);
  }
}

// ── 2. /healthz must actually report database authority ─────────────────────
const health = await get(BASE + '/healthz');
const healthJson = health.json;
record(
  '/healthz reports MariaDB as the authoritative database',
  !!healthJson && healthJson.authoritativeDatabase === 'MARIADB',
  healthJson
    ? `authoritativeDatabase=${healthJson.authoritativeDatabase} commitSha=${String(healthJson.commitSha || '').slice(0, 12)}`
    : `unparseable body (content-type=${health.ct})`,
);

// ── 3. SPA fallback must still serve unknown routes ─────────────────────────
const spa = await get(BASE + '/this-route-does-not-exist-zzz');
record(
  'unknown route falls back to the SPA shell',
  /text\/html/i.test(spa.ct) && /<!doctype html/i.test(spa.body),
  `status=${spa.status} content-type=${spa.ct}`,
);

// ── 4. Security headers on the HTML entry point ─────────────────────────────
const html = await get(BASE + '/');
const h = html.headers;
const headerChecks = [
  ['x-content-type-options', h.get('x-content-type-options')],
  ['x-frame-options', h.get('x-frame-options')],
  ['referrer-policy', h.get('referrer-policy')],
  ['strict-transport-security', h.get('strict-transport-security')],
  ['content-security-policy', h.get('content-security-policy')],
];
for (const [name, value] of headerChecks) {
  record(`security header ${name} present`, !!value, value ? `${value.slice(0, 60)}…` : 'MISSING');
}

// ── 5. Private routes must not render for an anonymous visitor ──────────────
const browser = await launchBrowser();
const ctx = await newContext(browser, { width: 1440, height: 900 });
for (const route of ['/dashboard', '/build-resume', '/admin', '/employer', '/org/acme', '/blog-editor']) {
  const page = await ctx.newPage();
  try {
    await page.goto(BASE + route, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(1500);
    const finalPath = new URL(page.url()).pathname;
    const guarded = /\/login/.test(finalPath);
    record(`anonymous ${route} is auth-guarded`, guarded, `final path=${finalPath}`);
  } catch (e) {
    record(`anonymous ${route} is auth-guarded`, false, e.message.slice(0, 120));
  } finally {
    await page.close();
  }
}
await browser.close();

results.finishedAt = new Date().toISOString();
results.passed = results.checks.filter((c) => c.pass).length;
results.failed = results.checks.filter((c) => !c.pass).length;
results.total = results.checks.length;

ensureDirs('crawl-artifacts/reports');
writeJson('crawl-artifacts/reports/subsystem-operational.json', results);
console.log(`\n[subsystem] ${results.passed}/${results.total} passed, ${results.failed} failed`);
process.exit(results.failed > 0 ? 1 : 0);
