/**
 * TEST 6-CERT SCENARIO (FROM 2ND USER SCREENSHOT)
 */

import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import express from 'express';
import { chromium } from 'playwright';

const sixCertResume = {
  firstname: 'Bhaskar Babu',
  lastname: 'Madala',
  occupation: 'Account Manager · Display',
  email: 'bhaskar.madala@example.com',
  phone: '+91 98765 43210',
  city: 'Hyderabad, India',
  summary: '',
  employments: [
    {
      jobTitle: 'Full Stack Developer',
      employer: 'Digital Solutions Group',
      startDate: '2018',
      endDate: '2021',
      description: 'Engineered RESTful backend services, resulting in a 30% surge in user engagement and consistently high client satisfaction through streamlined development and optimized performance.'
    },
    {
      jobTitle: 'Junior Interns',
      employer: 'Tata Consultancy Services',
      startDate: 'Jan 2026',
      endDate: 'Mar 2026',
      description: 'Designed and implemented a billing software project, achieving a 30% reduction in financial processing time and a 25% decrease in errors.'
    }
  ],
  educations: [
    {
      school: 'Chaitanya Engineering College',
      degree: 'B.Tech in Electronics and Communication Engineering',
      startDate: '',
      endDate: 'Jun 2013'
    },
    {
      school: 'Andhra University',
      degree: 'Master of Business Administration',
      startDate: '',
      endDate: 'Jun 2023'
    }
  ],
  skills: [
    { name: 'Telugu' },
    { name: 'English' },
    { name: 'Hindi' }
  ],
  languages: [
    { name: 'Telugu', level: 'Native / Bilingual' },
    { name: 'English', level: 'Full Professional (Fluent)' },
    { name: 'Hindi', level: 'Professional Working (Advanced)' }
  ],
  certifications: [
    { name: 'Google Analytics 4 Certification', issuer: 'Google', date: '2026' },
    { name: 'Certified Digital Marketing Professional (CDMP)', issuer: 'American Marketing Association', date: '2026' },
    { name: 'HubSpot Inbound Sales and Marketing Certification', issuer: 'HubSpot', date: '2026' },
    { name: 'Google Ads Certification – Display', issuer: 'Google', date: '2026' },
    { name: 'Certified Data Scientist (CDS)', issuer: 'Data Science Council of America (DASCA)', date: '2026' },
    { name: 'Certified Cloud Security Professional (CCSP)', issuer: 'International Information Systems Security Certification', date: '2026' }
  ]
};

async function testSixCerts() {
  const app = express();
  app.use(express.static(path.resolve('dist')));
  const activeTokens = new Map();
  app.get('/api/export-render-data', (req, res) => {
    const token = req.query.token;
    if (!token || !activeTokens.has(token)) return res.status(404).json({ error: 'not found' });
    const data = activeTokens.get(token);
    activeTokens.delete(token);
    return res.json({ success: true, data });
  });
  app.get('/export/*', (req, res) => res.sendFile(path.resolve('dist/index.html')));

  const server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const port = server.address().port;
  const browser = await chromium.launch({ headless: true });

  const token = crypto.randomBytes(32).toString('base64url');
  activeTokens.set(token, { ...sixCertResume, template: 'Cv51' });

  const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
  const url = `http://127.0.0.1:${port}/export/Cv51/user-six-certs/en#renderToken=${token}`;

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForFunction(
    () => document.documentElement.getAttribute('data-export-ready') === 'true',
    { timeout: 15000 }
  );

  const pages = page.locator('.smart-resume-page');
  const count = await pages.count();
  console.log(`Rendered ${count} pages for 6-cert scenario.`);

  for (let i = 0; i < count; i++) {
    await pages.nth(i).screenshot({ path: `scratch/six_certs_page_${i + 1}.png` });
    console.log(`Saved scratch/six_certs_page_${i + 1}.png`);
  }

  await browser.close();
  server.close();
}

testSixCerts().catch(console.error);
