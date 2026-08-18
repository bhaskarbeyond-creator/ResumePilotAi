import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import { chromium } from 'playwright';

async function inspectRenderedDom() {
  const app = express();
  app.use(express.static(path.resolve('dist')));
  const activeTokens = new Map();
  app.get('/api/export-render-data', (req, res) => {
    const token = req.query.token;
    res.json({ success: true, data: activeTokens.get(token) });
  });
  app.get('/export/*', (req, res) => res.sendFile(path.resolve('dist/index.html')));

  const server = await new Promise(r => {
    const s = app.listen(0, '127.0.0.1', () => r(s));
  });
  const port = server.address().port;
  const browser = await chromium.launch();

  const sampleData = {
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

  for (const tId of ['Cv1', 'Cv17', 'Cv51', 'Cv4']) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1600 } });
    const token = crypto.randomBytes(32).toString('base64url');
    activeTokens.set(token, { ...sampleData, template: tId });

    await page.goto(`http://127.0.0.1:${port}/export/${tId}/inspect-${tId}/en#renderToken=${token}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.documentElement.getAttribute('data-export-ready') === 'true');

    const info = await page.evaluate(() => {
      const pageEl = document.querySelector('.smart-resume-page') || document.querySelector('.resume-page');
      return {
        className: pageEl ? pageEl.className : 'null',
        offsetWidth: pageEl ? pageEl.offsetWidth : 0,
        offsetHeight: pageEl ? pageEl.offsetHeight : 0,
        scrollHeight: pageEl ? pageEl.scrollHeight : 0,
        computedWidth: pageEl ? window.getComputedStyle(pageEl).width : '',
        computedHeight: pageEl ? window.getComputedStyle(pageEl).height : '',
        textLength: pageEl ? pageEl.innerText.length : 0,
        first200Chars: pageEl ? pageEl.innerText.substring(0, 200) : ''
      };
    });

    console.log(`\n--- ${tId} ---`);
    console.log(info);
    await page.close();
  }

  await browser.close();
  server.close();
}

inspectRenderedDom().catch(console.error);
