import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import express from 'express';
import { chromium } from 'playwright';

const CV_IDS = Array.from({ length: 51 }, (_, i) => `Cv${i + 1}`);

const representativeResume = {
  firstname: 'Jonathan',
  lastname: 'Parker',
  occupation: 'Senior Technical Lead & Cloud Architect',
  email: 'jonathan.parker@example.com',
  phone: '+1 (555) 234-5678',
  address: '100 Innovation Way, Suite 400',
  city: 'San Francisco, CA',
  country: 'United States',
  website: 'https://jonathanparker.dev',
  summary: 'Results-driven Senior Technical Lead with 10+ years of expertise in architecting resilient distributed systems, modernizing cloud infrastructure, and leading high-performing cross-functional engineering teams.',
  employments: [
    {
      jobTitle: 'Principal Cloud Architect',
      employer: 'CloudScale Technologies',
      city: 'San Francisco, CA',
      startDate: '2021-03',
      endDate: '',
      currentWork: true,
      description: '• Spearheaded architectural design of global microservices handling 250M+ requests daily.\n• Reduced cloud infrastructure costs by 32% via automated resource optimization.\n• Mentored 12 staff and senior engineers across distributed development squads.'
    },
    {
      jobTitle: 'Senior Software Engineer',
      employer: 'Apex Enterprise Systems',
      city: 'Seattle, WA',
      startDate: '2017-06',
      endDate: '2021-02',
      description: '• Developed high-throughput event processing pipelines using Kafka and Go.\n• Built automated testing frameworks that increased test coverage from 65% to 94%.'
    }
  ],
  educations: [
    {
      school: 'University of Washington',
      degree: 'Bachelor of Science in Computer Science',
      city: 'Seattle, WA',
      startDate: '2013',
      endDate: '2017',
      description: 'Graduated Magna Cum Laude. Focus on Systems Architecture and Distributed Algorithms.'
    }
  ],
  skills: [
    { name: 'Cloud Architecture & AWS' },
    { name: 'Kubernetes & Docker' },
    { name: 'Go, Rust & Node.js' },
    { name: 'Distributed Systems' },
    { name: 'System Design' },
    { name: 'CI/CD Pipelines' }
  ],
  languages: [
    { name: 'English', level: 'Native / Bilingual' },
    { name: 'Spanish', level: 'Professional Working' }
  ],
  certifications: [
    { name: 'AWS Solutions Architect – Professional', issuer: 'Amazon Web Services' },
    { name: 'Certified Kubernetes Administrator (CKA)', issuer: 'CNCF' }
  ],
  projects: [
    {
      title: 'Distributed Event Broker',
      url: 'https://github.com/example/event-broker',
      description: 'High-performance publish-subscribe messaging broker built with zero memory allocations.'
    }
  ]
};

async function generateAll51Previews() {
  console.log('========================================================================');
  console.log('🖼️ GENERATING 51 AUTHENTIC TEMPLATE PREVIEWS (PRODUCTION TEMPLATE ENGINE)');
  console.log('========================================================================\n');

  const assetsDir = path.resolve('src/assets/resumesNew');
  const auditDir = path.resolve('scratch/template_preview_audit');
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });
  if (!fs.existsSync(auditDir)) fs.mkdirSync(auditDir, { recursive: true });

  const app = express();
  app.use(express.static(path.resolve('dist')));
  const activeTokens = new Map();
  app.get('/api/export-render-data', (req, res) => {
    const token = req.query.token;
    if (!token || !activeTokens.has(token)) return res.status(404).json({ error: 'Token not found' });
    const data = activeTokens.get(token);
    activeTokens.delete(token);
    res.setHeader('Cache-Control', 'no-store, private');
    return res.json({ success: true, data });
  });
  app.get('/export/*', (req, res) => res.sendFile(path.resolve('dist/index.html')));

  const server = await new Promise(r => {
    const s = app.listen(0, '127.0.0.1', () => r(s));
  });
  const port = server.address().port;
  const browser = await chromium.launch({ headless: true });

  const manifest = [];
  let successCount = 0;

  for (let i = 0; i < CV_IDS.length; i++) {
    const tId = CV_IDS[i];
    const data = { ...representativeResume, template: tId };

    const token = crypto.randomBytes(32).toString('base64url');
    activeTokens.set(token, data);

    const page = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 1.25 });
    const url = `http://127.0.0.1:${port}/export/${tId}/preview-${tId}/en#renderToken=${token}`;

    const t0 = Date.now();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForFunction(
        () => document.documentElement.getAttribute('data-export-ready') === 'true' || document.documentElement.hasAttribute('data-export-error'),
        { timeout: 15000 }
      );

      const exportError = await page.evaluate(() => document.documentElement.getAttribute('data-export-error'));
      if (exportError) throw new Error(`Export error: ${exportError}`);

      // Locate the first rendered resume page
      const firstPage = page.locator('.smart-resume-page, .resume-page, [data-page-index="0"]').first();
      if ((await firstPage.count()) === 0) {
        throw new Error('No .smart-resume-page element found');
      }

      // Capture screenshot in production assets and audit dir
      const assetPath = path.join(assetsDir, `${tId}.JPG`);
      const auditPath = path.join(auditDir, `${tId}.JPG`);

      const screenshotBuf = await firstPage.screenshot({ type: 'jpeg', quality: 86 });
      fs.writeFileSync(assetPath, screenshotBuf);
      fs.writeFileSync(auditPath, screenshotBuf);

      // Also ensure CV51.JPG is synced for any legacy uppercase imports
      if (tId === 'Cv51') {
        fs.writeFileSync(path.join(assetsDir, 'CV51.JPG'), screenshotBuf);
      }

      const elapsed = Date.now() - t0;
      const size = screenshotBuf.length;
      successCount++;
      manifest.push({ id: tId, status: 'SUCCESS', size, elapsed });
      process.stdout.write(`  ✔ [${i + 1}/51] ${tId} Preview Generated (${size} B, ${elapsed}ms)\n`);
    } catch (err) {
      manifest.push({ id: tId, status: 'FAILED', error: err.message });
      process.stderr.write(`  ✖ [${i + 1}/51] ${tId} Generation Failed: ${err.message}\n`);
    } finally {
      await page.close();
    }
  }

  await browser.close();
  server.close();

  const manifestPath = path.join(auditDir, 'preview_generation_manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log('\n========================================================================');
  console.log(`🏆 PREVIEW GENERATION COMPLETE: ${successCount}/51 SUCCESSFUL`);
  console.log(`📁 Assets updated in: ${assetsDir}`);
  console.log(`📁 Audit manifest saved in: ${manifestPath}`);
  console.log('========================================================================\n');
}

generateAll51Previews().catch(console.error);
