/**
 * IME365 — Reusable Crawler / Deep-QA Harness
 * -----------------------------------------------------------------------------
 * Deterministic, reusable, evidence-producing browser infrastructure used by the
 * autonomous engineering crawl. Output is written under crawl-artifacts/.
 *
 * Design constraints (dependency-free beyond Playwright):
 *  - Deterministic: fixed route inventory, fixed viewports, fixed seed.
 *  - Evidence-producing: console, pageerror, requestfailed, response and timing
 *    captured per page, plus optional screenshots.
 *  - Failure-aware: HTTP status, blank renders, client 404s and console errors
 *    are classified, not silently swallowed.
 *  - Reproducible: every finding records the viewport that produced it.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_BASE = process.env.CRAWL_BASE_URL || 'https://ime365.local';
export const DEFAULT_SEED = Number(process.env.CRAWL_SEED || 1337);
export const ARTIFACTS = 'crawl-artifacts';

export const VIEWPORTS = [
  { name: 'desktop-1920x1080', width: 1920, height: 1080 },
  { name: 'desktop-1600x900', width: 1600, height: 900 },
  { name: 'desktop-1440x900', width: 1440, height: 900 },
  { name: 'laptop-1366x768', width: 1366, height: 768 },
  { name: 'laptop-1280x800', width: 1280, height: 800 },
  { name: 'tablet-1024x768', width: 1024, height: 768 },
  { name: 'tablet-768x1024', width: 768, height: 1024 },
  { name: 'mobile-430x932', width: 430, height: 932 },
  { name: 'mobile-390x844', width: 390, height: 844 },
  { name: 'mobile-375x812', width: 375, height: 812 },
  { name: 'mobile-360x800', width: 360, height: 800 },
];

/**
 * Noise originating from the sandboxed local network (self-signed TLS on font
 * CDNs, blocked third-party embeds) rather than from application defects.
 * Kept explicit and narrow — everything else is reported.
 */
export const ENV_NOISE = /fonts\.googleapis\.com|fonts\.gstatic\.com|ERR_CERT_AUTHORITY_INVALID|ERR_BLOCKED_BY_CLIENT|supademo\.com|googletagmanager|google-analytics|ERR_CONNECTION_CLOSED|ERR_CONNECTION_RESET|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED/i;

export function ensureDirs(...dirs) {
  for (const d of dirs) fs.mkdirSync(d, { recursive: true });
}

export async function launchBrowser() {
  return chromium.launch({
    headless: true,
    args: [
      '--no-sandbox', '--no-zygote', '--disable-gpu', '--disable-dev-shm-usage',
      '--font-render-hinting=none', '--ignore-certificate-errors',
    ],
  });
}

export async function newContext(browser, viewport = { width: 1440, height: 900 }) {
  return browser.newContext({ viewport, ignoreHTTPSErrors: true, deviceScaleFactor: 1 });
}

/** Attach full evidence collectors to a page. */
export function instrument(page) {
  const rec = {
    consoleErrors: [], consoleWarnings: [], pageErrors: [],
    failedRequests: [], responses: [], apiCalls: [],
  };
  page.on('console', (m) => {
    const t = m.type();
    if (t === 'error') rec.consoleErrors.push(m.text());
    else if (t === 'warning') rec.consoleWarnings.push(m.text());
  });
  page.on('pageerror', (e) => rec.pageErrors.push(e.message));
  page.on('requestfailed', (r) => {
    const err = r.failure()?.errorText || 'unknown';
    if (ENV_NOISE.test(r.url()) || ENV_NOISE.test(err)) return;
    rec.failedRequests.push({ url: r.url(), error: err, method: r.method() });
  });
  page.on('response', (r) => {
    const entry = { url: r.url(), status: r.status(), method: r.request().method() };
    rec.responses.push(entry);
    if (r.url().includes('/api/')) rec.apiCalls.push(entry);
  });
  return rec;
}

export function resetCollectors(rec) {
  for (const k of Object.keys(rec)) rec[k].length = 0;
}

/** Settle the SPA: network idle plus a bounded grace period for lazy chunks. */
export async function settle(page, { idleMs = 1200, timeout = 30000 } = {}) {
  try {
    await page.waitForLoadState('networkidle', { timeout });
  } catch {
    // networkidle is best-effort: lazy chunks legitimately keep the network busy.
  }
  await page.waitForTimeout(idleMs);
}

/** Detect a blank render, a client-side 404, or structural/accessibility gaps. */
export async function inspectDom(page) {
  return page.evaluate(() => {
    const text = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
    const root = document.querySelector('#root');
    return {
      title: document.title,
      url: location.pathname,
      textLength: text.length,
      rootChildren: root ? root.children.length : -1,
      is404: /page not found|404|does not exist/i.test(text.slice(0, 400)),
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      h1Count: document.querySelectorAll('h1').length,
      h1: [...document.querySelectorAll('h1')].map((n) => n.innerText.trim()).filter(Boolean).slice(0, 3),
      hasMainLandmark: !!document.querySelector('main, [role="main"]'),
      imagesMissingAlt: [...document.querySelectorAll('img')].filter((i) => i.getAttribute('alt') === null).length,
      unlabelledButtons: [...document.querySelectorAll('button')].filter((b) => !(b.innerText || '').trim() && !b.getAttribute('aria-label') && !b.getAttribute('title')).length,
      textSample: text.slice(0, 400),
    };
  });
}

/** Classify collected evidence into stable, actionable issue codes. */
export function classify(rec, dom, httpStatus) {
  const issues = [];
  if (httpStatus >= 500) issues.push({ code: 'HTTP_5XX', detail: `HTTP ${httpStatus}` });
  else if (httpStatus >= 400) issues.push({ code: 'HTTP_4XX', detail: `HTTP ${httpStatus}` });
  if (rec.pageErrors.length) issues.push({ code: 'UNCAUGHT_EXCEPTION', detail: rec.pageErrors.join(' | ') });
  if (dom.rootChildren === 0 || dom.textLength < 50) issues.push({ code: 'BLANK_RENDER', detail: `textLength=${dom.textLength}` });
  if (dom.is404) issues.push({ code: 'CLIENT_404', detail: dom.textSample.slice(0, 120) });
  if (dom.h1Count === 0) issues.push({ code: 'NO_H1', detail: 'page has no h1 landmark' });
  if (!dom.hasMainLandmark) issues.push({ code: 'NO_MAIN_LANDMARK', detail: 'no <main>/role=main' });
  if (dom.horizontalOverflow) issues.push({ code: 'H_OVERFLOW', detail: `${dom.scrollWidth}>${dom.clientWidth}` });
  if (rec.consoleErrors.length) issues.push({ code: 'CONSOLE_ERROR', detail: rec.consoleErrors.slice(0, 3).join(' | ') });
  for (const f of rec.failedRequests.slice(0, 5)) issues.push({ code: 'NETWORK_FAILURE', detail: `${f.method} ${f.url} ${f.error}` });
  for (const s of rec.apiCalls.filter((a) => a.status >= 500)) {
    issues.push({ code: 'API_5XX', detail: `${s.method} ${s.url} -> ${s.status}` });
  }
  return issues;
}

/** Navigate + settle + inspect + classify in one deterministic step. */
export async function visit(page, base, route, { screenshot, timeout = 45000 } = {}) {
  const rec = instrument(page);
  resetCollectors(rec);
  const started = Date.now();
  let httpStatus = null;
  let navError = null;
  try {
    const resp = await page.goto(base + route, { waitUntil: 'load', timeout });
    httpStatus = resp ? resp.status() : null;
    await settle(page);
  } catch (e) {
    navError = e.message;
  }
  const loadMs = Date.now() - started;
  let dom = null;
  try { dom = await inspectDom(page); } catch (e) { navError = navError || e.message; }
  if (screenshot) {
    try {
      ensureDirs(path.dirname(screenshot));
      await page.screenshot({ path: screenshot, fullPage: false });
    } catch { /* screenshot is best-effort evidence */ }
  }
  const issues = dom ? classify(rec, dom, httpStatus ?? 0) : [{ code: 'NAVIGATION_FAILED', detail: navError }];
  if (navError) issues.push({ code: 'NAVIGATION_ERROR', detail: navError });
  return {
    route, httpStatus, loadMs, dom, issues,
    consoleErrors: [...rec.consoleErrors],
    consoleWarnings: [...rec.consoleWarnings],
    pageErrors: [...rec.pageErrors],
    failedRequests: [...rec.failedRequests],
    apiCalls: [...rec.apiCalls],
  };
}

export function writeJson(file, data) {
  ensureDirs(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  return file;
}
