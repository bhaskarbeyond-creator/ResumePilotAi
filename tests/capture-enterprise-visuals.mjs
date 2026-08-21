/**
 * Visual capture harness: screenshots every Enterprise module at desktop,
 * tablet and mobile against the shared stateful fixture backend, and records
 * console errors / failed requests for the network audit.
 *
 * Usage: node tests/capture-enterprise-visuals.mjs [--tabs=overview,members] [--viewports=desktop]
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'node:fs';
import { createEnterpriseFixtureBackend, installAuthenticatedSession, viteFixtureDefines, seedEnterpriseState } from './helpers/enterprise-fixture.mjs';

const args = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--')).map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));

const ALL_TABS = ['overview', 'resumes', 'members', 'teams', 'workspaces', 'access', 'ai', 'security', 'usage', 'audit', 'support', 'settings', 'platform'];
const TABS = args.tabs ? String(args.tabs).split(',') : ALL_TABS;
const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 390, height: 844 },
};
const SELECTED_VIEWPORTS = args.viewports ? String(args.viewports).split(',') : Object.keys(VIEWPORTS);

const OUT = 'test-results/enterprise-visuals';
fs.mkdirSync(OUT, { recursive: true });

const vite = await createServer({ server: { port: 0, host: '127.0.0.1', strictPort: false }, logLevel: 'error', define: viteFixtureDefines() });
const server = await vite.listen();
const base = `http://127.0.0.1:${server.config.server.port}`;

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined, args: ['--no-sandbox', '--no-zygote', '--disable-gpu', '--disable-dev-shm-usage'] });

const consoleIssues = [];
for (const vpName of SELECTED_VIEWPORTS) {
  const viewport = VIEWPORTS[vpName];
  const page = await browser.newPage({ viewport });
  page.on('console', m => { if (m.type() === 'error') consoleIssues.push(`[${vpName}] console.error: ${m.text().slice(0, 200)}`); });
  page.on('pageerror', e => consoleIssues.push(`[${vpName}] pageerror: ${String(e).slice(0, 200)}`));
  page.on('response', r => { if (r.status() >= 400 && r.url().includes('/api/')) consoleIssues.push(`[${vpName}] HTTP ${r.status()} ${r.url().slice(0, 140)}`); });
  await installAuthenticatedSession(page);
  const backend = createEnterpriseFixtureBackend(seedEnterpriseState());
  await page.route('**/api/**', backend);

  for (const tab of TABS) {
    await page.goto(`${base}/enterprise?tab=${tab}`, { waitUntil: 'domcontentloaded' });
    try {
      await page.waitForSelector('.enterprise-shell', { timeout: 20_000 });
      await page.waitForTimeout(1800);
    } catch {
      consoleIssues.push(`[${vpName}] shell did not render for tab=${tab}`);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 2) consoleIssues.push(`[${vpName}] horizontal overflow ${overflow}px on tab=${tab}`);
    await page.screenshot({ path: `${OUT}/${tab}-${vpName}.png`, fullPage: vpName !== 'mobile' });
  }
  await page.close();
}

fs.writeFileSync(`${OUT}/issues.txt`, consoleIssues.join('\n') || 'none');
console.log('Captured. Issues:');
console.log(consoleIssues.join('\n') || '  none');
await browser.close();
await server.close();
process.exit(0);
