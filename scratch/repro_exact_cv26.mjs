/**
 * REPRODUCE EXACT USER SCREENSHOT (Cv26 with Full Content)
 */

import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import express from 'express';
import { chromium } from 'playwright';

const exactUserResume = {
  firstname: 'Bhaskar Babu',
  lastname: 'Madala',
  occupation: 'ACCOUNT MANAGER - DISPLAY',
  email: 'bhaskar.beyond@gmail.com',
  phone: '+918555035068',
  address: 'Dwarakanagar, Visakhapatnam, Andhra Pradesh 530016, India',
  summary: 'Account Manager - Display with 9+ years of experience in Display Advertising, Data Analysis, and Cloud Computing. Proven expertise in delivering scalable advertising solutions, optimizing performance through Google Ad Manager, BigQuery, and Tableau, while driving cross-functional collaboration across engineering and marketing teams. Proficient in SQL, Python, React.js, Node.js, Docker, Kubernetes, AWS Lambda, and certified in Google Ads, Google Analytics 4, Google Cloud Professional Data Engineer, CAP, and CCSP.',
  employments: [
    {
      jobTitle: 'Senior Software Engineer',
      employer: 'Beyond Technologies',
      startDate: '2021',
      endDate: 'Present',
      description: 'Delivered comprehensive software project at Beyond Technologies, meeting all client requirements on schedule and exceeding stakeholder expectations by 25%.'
    },
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
    { name: 'Display Advertising' },
    { name: 'Google Analytics' },
    { name: 'Ad Exchange' },
    { name: 'Data Analysis' },
    { name: 'SQL' },
    { name: 'Cloud Computing' },
    { name: 'React.js' },
    { name: 'Node.js' },
    { name: 'Docker' },
    { name: 'Kubernetes' },
    { name: 'BigQuery' },
    { name: 'Tableau' },
    { name: 'Google Ad Manager' },
    { name: 'Python' },
    { name: 'Apache Airflow' },
    { name: 'AWS Lambda' },
    { name: 'Google Cloud Storage' }
  ],
  languages: [
    { name: 'Telugu', level: 'Native / Bilingual' },
    { name: 'English', level: 'Full Professional (Fluent)' },
    { name: 'Hindi', level: 'Professional Working (Advanced)' }
  ],
  certifications: [
    { name: 'Google Analytics 4 Certification', issuer: 'Google · 2026' },
    { name: 'Certified Digital Marketing Professional (CDMP)', issuer: 'American Marketing Association · 2026' },
    { name: 'HubSpot Inbound Sales and Marketing Certification', issuer: 'HubSpot · 2026' },
    { name: 'Google Ads Certification – Display', issuer: 'Google · 2026' },
    { name: 'Certified Data Scientist (CDS)', issuer: 'Data Science Council of America (DASCA) · 2026' },
    { name: 'Certified Cloud Security Professional (CCSP)', issuer: 'International Information Systems Security Certification Consortium (ISC)² · 2026' },
    { name: 'Google Ads Certification – Video', issuer: 'Google · 2026' },
    { name: 'Certified Marketing Automation Professional (CMAP)', issuer: 'Marketing Automation Institute · 2026' },
    { name: 'Certified Analytics Professional (CAP)', issuer: 'Institute for Operations Research and the Management Sciences (INFORMS) · 2026' },
    { name: 'Adobe Certified Expert – Analytics', issuer: 'Adobe · 2026' },
    { name: 'Certified Data Engineer (CDE)', issuer: 'Data Science Council of America (DASCA) · 2026' },
    { name: 'Certified Marketing Measurement Professional (CMMP)', issuer: 'American Marketing Association · 2026' }
  ]
};

async function testExactUserCv26() {
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
  activeTokens.set(token, { ...exactUserResume, template: 'Cv26' });

  const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
  const url = `http://127.0.0.1:${port}/export/Cv26/user-exact/en#renderToken=${token}`;

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForFunction(
    () => document.documentElement.getAttribute('data-export-ready') === 'true',
    { timeout: 15000 }
  );

  const pages = page.locator('.smart-resume-page');
  const count = await pages.count();
  console.log(`Rendered ${count} pages for exact user Cv26 scenario.`);

  for (let i = 0; i < count; i++) {
    await pages.nth(i).screenshot({ path: `scratch/exact_user_cv26_p${i + 1}.png` });
    console.log(`Saved scratch/exact_user_cv26_p${i + 1}.png`);
  }

  await browser.close();
  server.close();
}

testExactUserCv26().catch(console.error);
