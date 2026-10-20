#!/usr/bin/env node
/**
 * Capture before/after evidence for a candidate-dashboard surface at the five
 * directive profiles, signed in as the E2E test account (storage state written
 * by frontend/tests/candidate/auth.setup.ts). Records console errors, failed
 * requests and failed /api responses next to each screenshot. Nothing is mocked.
 * Only the Google Fonts hosts are ignored: they are unreachable from the sandbox
 * (net::ERR_CONNECTION_CLOSED) and are never an application defect.
 *
 *   node scripts/audit/capture-candidate-screens.mjs --surface cover-letters \
 *     --phase before --routes /dashboard/cover-letters,/cover-letter/new
 *
 * Optional: --click "<button name>" presses that button (by accessible name)
 * after the page loads, for states that need one real interaction.
 * Optional: --steps "click:Practice|fill:Target role=Analyst|click:Start" runs a
 * '|'-separated sequence of real interactions for multi-step states. Kinds:
 * click:<button name>, fill:<label>=<value>, press:<key>, text:<visible text to
 * wait for>, wait:<ms>. A name written as /pattern/ is a case-insensitive regex.
 * dialog-click:<button name> presses a button inside the open dialog.
 * open-tab opens a second tab of the current page with window.open, which copies
 * sessionStorage exactly as a browser does, so both tabs share the same
 * per-tab state (e.g. an in-progress interview); later steps act in that tab.
 * tab:<index> switches back (tab:0 is the first tab). The screenshot is taken of
 * the tab that is active after the last step.
 * Use --label <state> to name the captured state in the file name and report.
 * Optional: --profiles laptop-1366,mobile-390 captures only those profiles
 * (default: all five), e.g. when each capture changes server state.
 * Optional: --route-ai-to http://127.0.0.1:8081 sends ONLY the interview AI
 * endpoints (/api/generate-interview, /api/live-interview/*) to that backend,
 * e.g. the acceptance instance whose provider is scripts/dev-ai's labelled stub.
 * The report records it as aiRoutedTo so those screens are never mistaken for
 * real AI output.
 *
 * Env: E2E_BASE_URL (default http://127.0.0.1:4000),
 *      E2E_STORAGE_STATE (signed-in state to load; default: the candidate
 *      suite's account A state, which is scoped to the default origin),
 *      PLAYWRIGHT_CHROMIUM_EXECUTABLE (optional browser binary).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const frontendRequire = createRequire(path.join(repoRoot, 'frontend', 'package.json'));
const { chromium } = frontendRequire('@playwright/test');

const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 ? process.argv[index + 1] : fallback;
};
const surface = arg('surface');
const phase = arg('phase');
const routes = String(arg('routes', '')).split(',').filter(Boolean);
const click = arg('click');
const steps = String(arg('steps', '')).split('|').map((step) => step.trim()).filter(Boolean);
const label = arg('label');
const routeAiTo = arg('route-ai-to');
const onlyProfiles = String(arg('profiles', '')).split(',').filter(Boolean);
const nameMatcher = (raw) => {
  const pattern = /^\/(.+)\/$/.exec(raw);
  return pattern ? new RegExp(pattern[1], 'i') : raw;
};
/** Runs one step and returns the tab that later steps act in. */
async function runStep(page, step, session) {
  const separator = step.indexOf(':');
  const kind = separator < 0 ? step : step.slice(0, separator);
  const value = separator < 0 ? '' : step.slice(separator + 1);
  if (kind === 'open-tab') {
    const [tab] = await Promise.all([
      page.context().waitForEvent('page'),
      page.evaluate(() => { window.open(window.location.href, '_blank'); }),
    ]);
    session.watch(tab);
    session.tabs.push(tab);
    await tab.waitForLoadState('networkidle').catch(() => {});
    await tab.waitForTimeout(400);
    return tab;
  }
  if (kind === 'tab') {
    const tab = session.tabs[Number(value)];
    if (!tab) throw new Error(`no tab ${value} (open tabs: ${session.tabs.length})`);
    await tab.bringToFront();
    return tab;
  }
  if (kind === 'click') await page.getByRole('button', { name: nameMatcher(value) }).first().click();
  else if (kind === 'dialog-click') await page.getByRole('dialog').getByRole('button', { name: nameMatcher(value) }).first().click();
  else if (kind === 'fill') {
    const equals = value.indexOf('=');
    const field = nameMatcher(value.slice(0, equals));
    // Prefer the accessible label; fall back to the placeholder for unlabelled
    // fields so baseline captures can still reach states behind them.
    const labelled = page.getByLabel(field);
    const target = (await labelled.count()) ? labelled : page.getByPlaceholder(field);
    await target.first().fill(value.slice(equals + 1));
  } else if (kind === 'press') await page.keyboard.press(value);
  else if (kind === 'text') await page.getByText(nameMatcher(value)).first().waitFor({ timeout: 30_000 });
  else if (kind === 'wait') await page.waitForTimeout(Number(value));
  else throw new Error(`unknown step "${step}"`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(250);
  return page;
}
if (!surface || !['before', 'after'].includes(phase) || !routes.length) {
  console.error('usage: --surface <name> --phase before|after --routes /a,/b');
  process.exit(2);
}

const ALL_PROFILES = [
  { name: 'desktop-1920', width: 1920, height: 1080, mobile: false },
  { name: 'laptop-1366', width: 1366, height: 768, mobile: false },
  { name: 'tablet-1024', width: 1024, height: 768, mobile: false },
  { name: 'mobile-390', width: 390, height: 844, mobile: true },
  { name: 'mobile-320', width: 320, height: 568, mobile: true },
];
const unknownProfiles = onlyProfiles.filter((name) => !ALL_PROFILES.some((profile) => profile.name === name));
if (unknownProfiles.length) {
  console.error(`unknown --profiles: ${unknownProfiles.join(', ')}`);
  process.exit(2);
}
const PROFILES = onlyProfiles.length ? ALL_PROFILES.filter((profile) => onlyProfiles.includes(profile.name)) : ALL_PROFILES;
const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:4000';
const UNREACHABLE_THIRD_PARTY = /^https?:\/\/fonts\.(googleapis|gstatic)\.com\//;
const describeUrl = (raw) => {
  const url = new URL(raw);
  return url.origin === new URL(baseURL).origin ? url.pathname : url.href;
};
const storageState = process.env.E2E_STORAGE_STATE || path.join(repoRoot, 'frontend', 'test-results', '.auth', 'candidate-a.json');
const outDir = path.join(repoRoot, 'docs', 'ui-audit', 'screenshots', surface, phase);
fs.mkdirSync(outDir, { recursive: true });

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;
const browser = await chromium.launch(executablePath ? { executablePath, args: ['--no-sandbox'] } : {});
const report = { surface, phase, capturedAt: new Date().toISOString(), baseURL, pages: [] };

for (const profile of PROFILES) {
  const context = await browser.newContext({
    baseURL,
    storageState,
    viewport: { width: profile.width, height: profile.height },
    isMobile: profile.mobile,
    hasTouch: profile.mobile,
  });
  if (routeAiTo) {
    // Context-wide, so a tab opened by an open-tab step is routed the same way.
    await context.route((url) => /^\/api\/(generate-interview$|live-interview\/)/.test(url.pathname), (intercepted) => {
      const original = new URL(intercepted.request().url());
      return intercepted.continue({ url: `${routeAiTo}${original.pathname}${original.search}` });
    });
  }
  for (const route of routes) {
    const page = await context.newPage();
    const consoleErrors = [];
    const failedApi = [];
    const failedRequests = [];
    const watch = (tab) => {
      tab.on('console', (message) => {
        if (message.type() !== 'error') return;
        const text = message.text();
        // Chromium's "Failed to load resource: net::ERR_*" text omits the URL; attribute it.
        const source = message.location()?.url || '';
        if (/^Failed to load resource/.test(text)) {
          if (UNREACHABLE_THIRD_PARTY.test(source)) return;
          consoleErrors.push(source ? `${text} [${describeUrl(source)}]` : text);
          return;
        }
        consoleErrors.push(text);
      });
      tab.on('requestfailed', (request) => {
        if (UNREACHABLE_THIRD_PARTY.test(request.url())) return;
        failedRequests.push(`${request.failure()?.errorText || 'failed'} ${request.method()} ${describeUrl(request.url())}`);
      });
      tab.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
      tab.on('response', (response) => {
        const url = new URL(response.url());
        if (url.pathname.startsWith('/api/') && response.status() >= 400) failedApi.push(`${response.status()} ${response.request().method()} ${url.pathname}`);
      });
    };
    watch(page);
    const session = { tabs: [page], watch };
    await page.goto(route, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    if (click) {
      await page.getByRole('button', { name: click }).first().click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(800);
      // The shell scrolls inside its own container, so full-page captures stop at the
      // viewport. Bring the element the app focused after the action to the top.
      await page.evaluate(() => {
        const active = document.activeElement;
        if (active && active !== document.body) active.scrollIntoView({ block: 'start' });
      });
      await page.waitForTimeout(300);
    }
    let active = page;
    for (const step of steps) active = await runStep(active, step, session);
    if (steps.length) await active.waitForTimeout(500);
    const stateSuffix = label ? `__${label.replace(/[^a-z0-9-]+/gi, '_')}` : (click ? '__after_click' : '');
    const slug = (route.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '_') || 'root') + stateSuffix;
    const file = `${profile.name}__${slug}.jpg`;
    await active.screenshot({ path: path.join(outDir, file), fullPage: true, type: 'jpeg', quality: 60 });
    const overflow = await active.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    report.pages.push({ profile: profile.name, route, click: click || null, steps: steps.length ? steps : undefined, label: label || undefined, aiRoutedTo: routeAiTo || undefined, tabs: session.tabs.length > 1 ? session.tabs.length : undefined, finalUrl: new URL(active.url()).pathname, file, horizontalOverflowPx: Math.max(0, overflow), consoleErrors, failedRequests, failedApi });
    for (const tab of session.tabs) await tab.close();
  }
  await context.close();
}
await browser.close();
const reportFile = path.join(outDir, 'capture-report.json');
// Several captures of one surface and phase (e.g. with and without --click) share the report.
const previous = fs.existsSync(reportFile) ? JSON.parse(fs.readFileSync(reportFile, 'utf8')) : null;
if (previous?.pages?.length) {
  const replaced = new Set(report.pages.map((entry) => entry.file));
  report.pages = [...previous.pages.filter((entry) => !replaced.has(entry.file)), ...report.pages];
}
fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
console.log(`captured ${report.pages.length} screens -> ${path.relative(repoRoot, outDir)}`);
for (const entry of report.pages) {
  const issues = [entry.horizontalOverflowPx ? `overflow ${entry.horizontalOverflowPx}px` : '', entry.failedApi.length ? `api ${entry.failedApi.join(', ')}` : '', entry.failedRequests.length ? `requests ${entry.failedRequests.join(', ')}` : '', entry.consoleErrors.length ? `${entry.consoleErrors.length} console errors` : ''].filter(Boolean).join(' | ');
  console.log(`  ${entry.profile.padEnd(13)} ${(entry.route + (entry.label ? ` [${entry.label}]` : '')).padEnd(28)} ${issues || 'clean'}`);
}
