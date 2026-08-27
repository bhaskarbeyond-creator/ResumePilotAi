import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const BASE_URL = process.env.BASE_URL || 'https://airesume.projectdemo.guru';

const VIEWPORTS = [
  { name: 'Mobile (375px)', width: 375, height: 812 },
  { name: 'Tablet (768px)', width: 768, height: 1024 },
  { name: 'Laptop (1024px)', width: 1024, height: 768 },
  { name: 'Desktop (1440px)', width: 1440, height: 900 },
];

const PAGES_TO_AUDIT = [
  { name: 'Landing / Home', path: '/' },
  { name: 'Features', path: '/features' },
  { name: 'Pricing / Plans', path: '/plans' },
  { name: 'Templates Gallery', path: '/templates' },
  { name: 'Blog Overview', path: '/blog' },
  { name: 'Jobs Board', path: '/jobs' },
  { name: 'Login Modal Surface', path: '/login' },
  { name: 'Register Surface', path: '/register' },
  { name: 'Enterprise Console', path: '/enterprise' },
  { name: 'Cover Letter Builder', path: '/cover-letter' },
  { name: 'Portfolio Builder', path: '/portfolio-builder' },
];

async function runDeepUiUxAudit() {
  console.log(`================================================================`);
  console.log(`  STARTING DEEP UI/UX QUALITY & RESPONSIVE AUDIT ACROSS LIVE APP`);
  console.log(`  Target: ${BASE_URL}`);
  console.log(`================================================================\n`);

  const browser = await chromium.launch({ headless: true });
  const findings = [];

  for (const vp of VIEWPORTS) {
    console.log(`\n── Auditing Viewport: ${vp.name} (${vp.width}x${vp.height}) ──`);
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();

    const consoleLogs = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleLogs.push(msg.text());
    });

    for (const p of PAGES_TO_AUDIT) {
      try {
        const response = await page.goto(`${BASE_URL}${p.path}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(600);

        // 1. Check for horizontal overflow (breaks mobile layout)
        const overflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > window.innerWidth + 2;
        });

        // 2. Check for button styling & cursor consistency
        const buttonReport = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button:not([disabled])'));
          let missingPointer = 0;
          let brokenPadding = 0;
          for (const b of buttons) {
            const style = window.getComputedStyle(b);
            if (style.cursor !== 'pointer') missingPointer++;
            if (parseFloat(style.paddingTop) === 0 && parseFloat(style.paddingBottom) === 0 && b.offsetHeight > 0 && b.innerText.trim().length > 0) {
              brokenPadding++;
            }
          }
          return { totalButtons: buttons.length, missingPointer, brokenPadding };
        });

        // 3. Check for interactive controls focusability
        const focusableCount = await page.evaluate(() => {
          return document.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])').length;
        });

        const status = response ? response.status() : 200;
        const pass = status === 200 && !overflow;

        if (overflow) {
          findings.push({ viewport: vp.name, page: p.name, defect: 'Horizontal layout overflow detected' });
        }
        if (buttonReport.missingPointer > 0) {
          findings.push({ viewport: vp.name, page: p.name, defect: `${buttonReport.missingPointer} buttons lack cursor: pointer` });
        }

        console.log(`  ${pass ? '✓' : '✗'} ${p.name.padEnd(24)}: HTTP ${status} | Overflow: ${overflow ? 'FAIL' : 'PASS'} | Buttons: ${buttonReport.totalButtons} (missingPointer: ${buttonReport.missingPointer}) | Focusable: ${focusableCount}`);
      } catch (err) {
        console.log(`  ✗ ${p.name.padEnd(24)}: Error - ${err.message}`);
        findings.push({ viewport: vp.name, page: p.name, defect: `Navigation failure: ${err.message}` });
      }
    }
    await context.close();
  }

  await browser.close();

  console.log(`\n================================================================`);
  console.log(`  UI/UX AUDIT SUMMARY`);
  console.log(`  Total Findings / Anomalies: ${findings.length}`);
  for (const f of findings) {
    console.log(`  - [${f.viewport}] ${f.page}: ${f.defect}`);
  }
  console.log(`================================================================\n`);
}

runDeepUiUxAudit().catch(err => {
  console.error('Audit execution error:', err);
  process.exit(1);
});
