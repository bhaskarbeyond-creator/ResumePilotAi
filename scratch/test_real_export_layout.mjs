import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import express from 'express';
import { chromium } from 'playwright';

const sampleResume = {
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
  ]
};

async function inspectRealExport() {
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
  const page = await browser.newPage({ viewport: { width: 1200, height: 1600 } });

  for (const cvId of ['Cv1', 'Cv51', 'Cv13']) {
    const renderToken = crypto.randomBytes(24).toString('base64url');
    activeTokens.set(renderToken, sampleResume);

    const exportUrl = `http://127.0.0.1:${port}/export/${cvId}/test-${cvId}/en#renderToken=${renderToken}`;
    console.log(`Navigating to ${cvId}...`);
    await page.goto(exportUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('html[data-export-ready="true"]', { timeout: 10000 });

    const layout = await page.evaluate(() => {
      const pageEl = document.querySelector('.smart-resume-page');
      const layoutEl = document.querySelector('.smart-layout');
      const sidebarEl = document.querySelector('.smart-sidebar');
      const mainEl = document.querySelector('.smart-main-content');
      const heroEl = document.querySelector('.smart-split-hero');
      const bottomEl = document.querySelector('.smart-fullwidth-bottom-flow');

      return {
        pageClasses: pageEl?.className,
        layoutClasses: layoutEl?.className,
        hasSidebar: Boolean(sidebarEl),
        sidebarWidth: sidebarEl ? window.getComputedStyle(sidebarEl).width : null,
        sidebarBg: sidebarEl ? window.getComputedStyle(sidebarEl).backgroundColor : null,
        sidebarText: sidebarEl ? window.getComputedStyle(sidebarEl).color : null,
        hasMain: Boolean(mainEl),
        mainWidth: mainEl ? window.getComputedStyle(mainEl).width : null,
        hasAdaptiveSplit: Boolean(heroEl),
        hasBottomFlow: Boolean(bottomEl),
      };
    });

    console.log(`[${cvId}] Layout:`, JSON.stringify(layout, null, 2));

    // Save screenshot
    await page.screenshot({ path: `scratch/debug_export_${cvId}.png` });
  }

  await browser.close();
  server.close();
}

inspectRealExport().catch(console.error);
