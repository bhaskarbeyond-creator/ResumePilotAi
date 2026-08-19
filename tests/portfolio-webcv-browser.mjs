import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'node:fs';
import { PORTFOLIO_TEMPLATE_IDS, createRichPortfolioFixture } from '../src/utils/portfolioData.js';

const VIEWPORTS = [
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'desktop-1280', width: 1280, height: 800 },
  { name: 'laptop-1024', width: 1024, height: 768 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'mobile-375', width: 375, height: 667 },
];

const NEEDLES = [
  'Priya Raman',
  'Principal Software Engineer',
  'Northwind Labs',
  'Atlas Inference Mesh',
  'Stanford University',
  'TypeScript',
  'Certified Kubernetes Administrator',
  'Engineering Excellence Award',
];

async function main() {
  const vite = await createServer({ server: { port: 0, host: '127.0.0.1', strictPort: false }, logLevel: 'error' });
  const server = await vite.listen();
  const port = server.config.server.port;
  const base = `http://127.0.0.1:${port}`;
  const launchArgs = ['--no-sandbox', '--no-zygote', '--disable-gpu', '--disable-dev-shm-usage'];
  const executablePath = process.env.CHROMIUM_PATH;
  const env = { ...process.env, LD_LIBRARY_PATH: `/tmp/chromium/lib:${process.env.LD_LIBRARY_PATH || ''}` };
  const launchOptions = executablePath && fs.existsSync(executablePath)
    ? { executablePath, env, args: launchArgs }
    : { args: launchArgs };
  const browser = await chromium.launch(launchOptions);
  const failures = [];
  fs.mkdirSync('scratch/webcv-browser', { recursive: true });
  try {
    for (const template of PORTFOLIO_TEMPLATE_IDS) {
      for (const viewport of VIEWPORTS) {
        const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
        const problems = [];
        page.on('pageerror', (error) => problems.push(`pageerror:${error.message}`));
        await page.goto(`${base}/template-lab/webcv.html?template=${template}&fixture=rich`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await page.waitForFunction(() => document.documentElement.getAttribute('data-lab-state') === 'ready', null, { timeout: 20_000 });
        const audit = await page.evaluate(() => {
          const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 2;
          const root = document.querySelector('[data-webcv-template]');
          return {
            overflow,
            template: root?.getAttribute('data-webcv-template') || '',
            text: (document.body.innerText || '').replace(/\s+/g, ' '),
          };
        });
        if (audit.template !== template) problems.push(`template-mismatch:${audit.template}`);
        if (audit.overflow) problems.push('horizontal-overflow');
        for (const needle of NEEDLES) {
          if (!audit.text.includes(needle)) problems.push(`missing:${needle}`);
        }
        if (/Alex Cyber|Sofia Martinez|dev@terminal/i.test(audit.text)) problems.push('placeholder-persona');
        await page.screenshot({ path: `scratch/webcv-browser/${template}-${viewport.name}.png`, fullPage: true });
        if (problems.length) {
          failures.push({ template, viewport: viewport.name, problems });
          console.log(`FAIL ${template}/${viewport.name}: ${problems.join(' | ')}`);
        } else {
          console.log(`PASS ${template}/${viewport.name}`);
        }
        await page.close();
      }
    }
    const switchPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const fixture = createRichPortfolioFixture();
    const counts = [];
    for (const template of PORTFOLIO_TEMPLATE_IDS) {
      await switchPage.goto(`${base}/template-lab/webcv.html?template=${template}&fixture=rich`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await switchPage.waitForFunction(() => document.documentElement.getAttribute('data-lab-state') === 'ready', null, { timeout: 20_000 });
      const text = await switchPage.evaluate(() => document.body.innerText);
      counts.push({
        template,
        experiences: (text.match(/Northwind Labs|Harbor Cloud|Lumen Analytics/g) || []).length,
        hasName: text.includes(fixture.heading.fullName),
        hasProject: text.includes('Atlas Inference Mesh'),
      });
    }
    await switchPage.close();
    for (const entry of counts) {
      if (!entry.hasName || !entry.hasProject || entry.experiences < 3) {
        failures.push({ template: entry.template, viewport: 'switch', problems: ['data-loss-on-switch'] });
      }
    }
  } finally {
    await browser.close().catch(() => {});
    await server.close().catch(() => {});
    await vite.close().catch(() => {});
  }
  if (failures.length) {
    console.error(`WEB CV BROWSER GATE FAILED (${failures.length})`);
    process.exit(1);
  }
  console.log('WEB CV BROWSER GATE PASSED');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
