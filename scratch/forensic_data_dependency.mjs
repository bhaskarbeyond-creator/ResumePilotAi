/**
 * DATA DEPENDENCY TEST — Does Cv1's 2-column layout survive different data conditions?
 */

import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import express from 'express';
import { chromium } from 'playwright';

const dataConditions = {
  'A_Normal': {
    firstname: 'Jonathan', lastname: 'Parker',
    occupation: 'Senior Technical Lead',
    email: 'j@test.com', phone: '555-1234',
    city: 'San Francisco, CA', country: 'US',
    summary: 'Experienced leader with 10+ years.',
    employments: [{ jobTitle: 'CTO', employer: 'Acme', city: 'SF', startDate: '2021', description: 'Led team of 50.' }],
    educations: [{ school: 'MIT', degree: 'BS CS', city: 'Boston', startDate: '2010', endDate: '2014' }],
    skills: [{ name: 'AWS' }, { name: 'Docker' }, { name: 'Node.js' }],
    languages: [{ name: 'English', level: 'Native' }],
    certifications: [{ name: 'AWS SA Pro', issuer: 'AWS' }]
  },
  'B_EmptyOptional': {
    firstname: 'Jane', lastname: 'Doe',
    email: 'jane@test.com',
    summary: 'Minimal resume.',
    employments: [{ jobTitle: 'Dev', employer: 'Corp', startDate: '2020', description: 'Coded.' }],
    educations: [],
    skills: [],
    languages: [],
    certifications: []
  },
  'C_Short': {
    firstname: 'A', lastname: 'B',
    summary: 'Short.',
    employments: [],
    educations: [],
    skills: [],
    languages: [],
    certifications: []
  },
  'D_Long': {
    firstname: 'Alexander', lastname: 'Bartholomew-Richardson',
    occupation: 'Distinguished Engineering Fellow & VP Cloud Architecture',
    email: 'alexander@long.com', phone: '+44 7700 900123', city: 'London', country: 'UK',
    website: 'https://alexanderbartholomewrichardson.dev',
    summary: 'Highly accomplished Distinguished Engineering Fellow with 25+ years of expertise spanning cloud-native architecture, distributed systems, machine learning infrastructure, real-time data pipelines, microservices, and enterprise software engineering. Published author of 15 technical papers.',
    employments: Array.from({ length: 6 }, (_, i) => ({
      jobTitle: `Role ${i + 1}`,
      employer: `Company ${i + 1}`,
      city: 'London',
      startDate: `${2020 - i * 2}`,
      endDate: i === 0 ? '' : `${2022 - i * 2}`,
      currentWork: i === 0,
      description: '• Significant achievement here.\n• Another major accomplishment.\n• Third bullet point with details.'
    })),
    educations: [{ school: 'Oxford', degree: 'PhD CS', city: 'Oxford', startDate: '2000', endDate: '2004' }],
    skills: Array.from({ length: 12 }, (_, i) => ({ name: `Skill ${i + 1}` })),
    languages: [{ name: 'English', level: 'Native' }, { name: 'French', level: 'B2' }, { name: 'German', level: 'A2' }],
    certifications: [{ name: 'Cert 1', issuer: 'Org' }, { name: 'Cert 2', issuer: 'Org' }]
  },
  'E_ManySkills': {
    firstname: 'Skills', lastname: 'Heavy',
    summary: 'Engineer with many skills.',
    employments: [{ jobTitle: 'Dev', employer: 'Co', startDate: '2020', description: 'Work.' }],
    skills: Array.from({ length: 20 }, (_, i) => ({ name: `Technology ${i + 1}` })),
    languages: [{ name: 'English', level: 'Native' }],
    certifications: []
  },
  'F_NoPhoto': {
    firstname: 'No', lastname: 'Photo',
    email: 'no@photo.com',
    summary: 'No photo resume.',
    employments: [{ jobTitle: 'PM', employer: 'Inc', startDate: '2019', description: 'Managed.' }],
    skills: [{ name: 'PM' }],
    showPhoto: false,
    photo: null
  },
  'G_NoCerts': {
    firstname: 'No', lastname: 'Certs',
    summary: 'No certifications.',
    employments: [{ jobTitle: 'Eng', employer: 'Co', startDate: '2020', description: 'Built stuff.' }],
    skills: [{ name: 'JS' }, { name: 'Python' }],
    certifications: []
  }
};

async function runDataDependencyTest() {
  console.log('========================================================================');
  console.log('🧪 DATA DEPENDENCY TEST — Cv1 2-Column Stability');
  console.log('========================================================================\n');

  const outDir = path.resolve('scratch/forensic_split_audit');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

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

  for (const [condName, resumeData] of Object.entries(dataConditions)) {
    const token = crypto.randomBytes(32).toString('base64url');
    activeTokens.set(token, { ...resumeData, template: 'Cv1' });

    const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
    const url = `http://127.0.0.1:${port}/export/Cv1/data-test/en#renderToken=${token}`;

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForFunction(
        () => document.documentElement.getAttribute('data-export-ready') === 'true' || document.documentElement.hasAttribute('data-export-error'),
        { timeout: 15000 }
      );

      const layout = await page.evaluate(() => {
        const sidebar = document.querySelector('.smart-sidebar');
        const main = document.querySelector('.smart-main-content');
        return {
          hasSidebar: Boolean(sidebar),
          hasMain: Boolean(main),
          sidebarW: sidebar ? Math.round(sidebar.getBoundingClientRect().width) : 0,
          mainW: main ? Math.round(main.getBoundingClientRect().width) : 0,
        };
      });

      const is2Col = layout.hasSidebar && layout.hasMain && layout.sidebarW > 200;
      const indicator = is2Col ? '✅ 2-COL' : '❌ 1-COL';
      console.log(`  ${indicator} ${condName.padEnd(20)} | sidebar=${(layout.sidebarW + 'px').padEnd(6)} | main=${(layout.mainW + 'px').padEnd(6)}`);
      
      const fp = page.locator('.smart-resume-page').first();
      if (await fp.count() > 0) {
        await fp.screenshot({ path: path.join(outDir, `Cv1_data_${condName}.png`) });
      }
    } catch (err) {
      console.log(`  ❌ ${condName.padEnd(20)} | ERROR: ${err.message.slice(0, 60)}`);
    } finally {
      await page.close();
    }
  }

  await browser.close();
  server.close();
  console.log('\n✅ Data dependency test complete.');
}

runDataDependencyTest().catch(console.error);
