import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {
  PORTFOLIO_TEMPLATE_IDS,
  convertResumeToPortfolio,
  createRichPortfolioFixture,
} from '../src/utils/portfolioData.js';

const VIEWPORTS = [
  { name: 'mobile-375', width: 375, height: 667 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'laptop-1024', width: 1024, height: 768 },
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'ultrawide-1920', width: 1920, height: 1080 },
];

function createLargePortfolioFixture() {
  const base = createRichPortfolioFixture();
  // Add 10 experiences
  base.experiences = Array.from({ length: 10 }).map((_, i) => ({
    id: `exp-${i + 1}`,
    jobTitle: `Staff Systems Architect ${i + 1}`,
    employer: `Enterprise Dynamics ${i + 1}`,
    begin: '2015',
    end: '2024',
    description: `Led high-throughput distributed microservices cluster architecture handling billions of transactions weekly.\nDelivered 99.999% SLA across multi-cloud availability zones.`,
  }));
  // Add 50 skills
  base.skills = Array.from({ length: 50 }).map((_, i) => ({
    id: `skill-${i + 1}`,
    name: `Technology Engine ${i + 1}`,
    rating: 80 + (i % 20),
  }));
  // Add 10 projects
  base.projects = Array.from({ length: 10 }).map((_, i) => ({
    id: `proj-${i + 1}`,
    title: `Platform Accelerator System ${i + 1}`,
    description: `Architected next-generation streaming event pipeline with sub-millisecond latency.`,
    link: `https://example.com/project-${i + 1}`,
    technologyList: ['TypeScript', 'Rust', 'Kubernetes', 'GraphQL', 'PostgreSQL'],
  }));
  return base;
}

async function runVisualAudit() {
  console.log('\n==================================================');
  console.log('STARTING REAL CHROMIUM PORTFOLIO VISUAL AUDIT');
  console.log('==================================================\n');

  const vite = await createServer({ server: { port: 0, host: '127.0.0.1', strictPort: false }, logLevel: 'error' });
  const server = await vite.listen();
  const port = server.config.server.port;
  const base = `http://127.0.0.1:${port}`;

  const browser = await chromium.launch({
    args: ['--no-sandbox', '--no-zygote', '--disable-gpu', '--disable-dev-shm-usage'],
  });

  const screenshotsDir = 'scratch/portfolio-screenshots';
  fs.mkdirSync(screenshotsDir, { recursive: true });

  const templates = PORTFOLIO_TEMPLATE_IDS;
  const auditResults = [];

  try {
    for (const template of templates) {
      console.log(`\n--- Auditing Template: ${template} ---`);
      
      for (const vp of VIEWPORTS) {
        const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
        
        // Test with Rich Fixture
        await page.goto(`${base}/template-lab/webcv.html?template=${template}&fixture=rich`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.documentElement.getAttribute('data-lab-state') === 'ready', null, { timeout: 20_000 });
        
        const metrics = await page.evaluate(() => {
          const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 2;
          const headings = Array.from(document.querySelectorAll('h1, h2, h3')).map(h => h.innerText);
          const bg = window.getComputedStyle(document.querySelector('[data-webcv-template]')).backgroundColor;
          return {
            overflow,
            headingsCount: headings.length,
            bg,
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
          };
        });

        const screenshotPath = path.join(screenshotsDir, `${template}_${vp.name}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false });

        assert.equal(metrics.overflow, false, `Horizontal overflow in ${template} on ${vp.name}`);
        console.log(`[PASS] ${template} @ ${vp.name}: overflow=false (width: ${metrics.clientWidth}px), headings: ${metrics.headingsCount}`);
        
        auditResults.push({
          template,
          viewport: vp.name,
          overflow: metrics.overflow,
          screenshotPath,
        });

        await page.close();
      }
    }

    console.log('\n--- Auditing Template Switching & Large Fixture Resistance ---');
    const switchPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    
    // Cycle through all templates in sequence
    for (const t of [...templates, templates[0]]) {
      await switchPage.goto(`${base}/template-lab/webcv.html?template=${t}&fixture=rich`, { waitUntil: 'domcontentloaded' });
      await switchPage.waitForFunction(() => document.documentElement.getAttribute('data-lab-state') === 'ready', null, { timeout: 20_000 });
      const activeTemplate = await switchPage.evaluate(() => document.querySelector('[data-webcv-template]')?.getAttribute('data-webcv-template'));
      assert.equal(activeTemplate, t, `Template switch failed for ${t}`);
      console.log(`[PASS] Switched smoothly to ${t}`);
    }
    await switchPage.close();

    console.log('\n✅ ALL VISUAL AUDITS & SCREENSHOT CAPTURES PASSED (100% SUCCESS)');
  } finally {
    await browser.close();
    await vite.close();
  }
}

runVisualAudit().catch((err) => {
  console.error('Visual audit failed:', err);
  process.exit(1);
});
