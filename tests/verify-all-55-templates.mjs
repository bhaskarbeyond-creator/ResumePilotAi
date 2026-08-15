import assert from 'node:assert/strict';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import { chromium } from 'playwright';

const CV_IDS = Array.from({ length: 51 }, (_, i) => `Cv${i + 1}`);
const COVER_IDS = ['Cover1', 'Cover2', 'Cover3', 'Cover4'];
const ALL_IDS = [...CV_IDS, ...COVER_IDS];

async function verifyAll55Templates() {
  console.log(`\n🔍 [Template Audit] Starting exhaustive render verification for all 55 templates (${CV_IDS.length} CVs + ${COVER_IDS.length} Covers)...`);

  const app = express();
  app.use(express.json());
  app.use(express.static(path.resolve('dist')));

  const activeTokens = new Map();
  function mintToken(data) {
    const token = crypto.randomBytes(32).toString('base64url');
    activeTokens.set(token, data);
    return token;
  }

  app.get('/api/export-render-data', (req, res) => {
    const token = req.query.token;
    if (!token || !activeTokens.has(token)) {
      return res.status(404).json({ error: 'Token not found' });
    }
    const data = activeTokens.get(token);
    activeTokens.delete(token);
    res.setHeader('Cache-Control', 'no-store, private');
    return res.json({ success: true, data });
  });

  app.get('/export/*', (req, res) => {
    res.sendFile(path.resolve('dist', 'index.html'));
  });

  let port;
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => {
      port = s.address().port;
      resolve(s);
    });
  });

  const browser = await chromium.launch({ headless: true });
  console.log(`✅ [Browser] Playwright Chromium active (${browser.version()}) on port ${port}`);

  const sampleCvData = {
    firstname: 'Enterprise',
    lastname: 'Architect',
    occupation: 'Principal Systems Fellow',
    email: 'architect@enterprise.org',
    phone: '+1 555 019 2834',
    address: 'Seattle, WA, USA',
    summary: 'Executive technology leader with 15+ years delivering scalable microservices and cloud infrastructure.',
    employments: [
      { jobTitle: 'Chief Architect', employer: 'HyperScale Corp', city: 'Seattle', begin: '2019', end: 'Present', description: 'Led architecture across 50 development teams with 99.999% uptime.' }
    ],
    educations: [
      { school: 'University of Washington', degree: 'Ph.D. Computer Science', city: 'Seattle', started: '2010', finished: '2015' }
    ],
    skills: [
      { name: 'Distributed Systems', rating: 95 },
      { name: 'Cloud Architecture', rating: 90 },
      { name: 'C++ / Rust / Node', rating: 92 }
    ]
  };

  const sampleCoverData = {
    firstname: 'Enterprise',
    lastname: 'Architect',
    occupation: 'Principal Systems Fellow',
    email: 'architect@enterprise.org',
    phone: '+1 555 019 2834',
    address: 'Seattle, WA, USA',
    recipientName: 'Hiring Committee',
    recipientCompany: 'HyperScale Systems',
    recipientAddress: '100 Innovation Way',
    coverLetterContent: 'Dear Hiring Committee,\n\nI am writing to express my strong enthusiasm for the Chief Architect opportunity. My background in distributed platforms aligns directly with your mission.\n\nSincerely,\nEnterprise Architect'
  };

  let passed = 0;
  let failed = 0;
  const results = [];

  for (const templateId of ALL_IDS) {
    const isCover = templateId.startsWith('Cover');
    const data = isCover
      ? { ...sampleCoverData, template: templateId }
      : { ...sampleCvData, template: templateId };

    const token = mintToken(data);
    const page = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 1 });
    const targetUrl = `http://127.0.0.1:${port}/export/${templateId}/verify-${templateId}/en#renderToken=${token}`;

    const t0 = Date.now();
    try {
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForFunction(
        () => document.documentElement.getAttribute('data-export-ready') === 'true' || document.documentElement.hasAttribute('data-export-error'),
        { timeout: 15000 }
      );

      const exportError = await page.evaluate(() => document.documentElement.getAttribute('data-export-error'));
      if (exportError) throw new Error(`Export error attribute set: ${exportError}`);

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' }
      });

      const isPdf = pdfBuffer.length >= 5 && pdfBuffer.subarray(0, 5).toString('latin1') === '%PDF-';
      assert.equal(isPdf, true, `Output must begin with %PDF-`);
      assert.equal(pdfBuffer.length > 5000, true, `Output size must be > 5KB`);

      const elapsed = Date.now() - t0;
      passed++;
      results.push({ templateId, status: 'PASS', elapsed, bytes: pdfBuffer.length });
      process.stdout.write(`  ✔ ${templateId} (${elapsed}ms, ${pdfBuffer.length} bytes)\n`);
    } catch (err) {
      failed++;
      results.push({ templateId, status: 'FAIL', error: err.message });
      process.stderr.write(`  ✖ ${templateId}: ${err.message}\n`);
    } finally {
      await page.close();
    }
  }

  await browser.close();
  await new Promise((resolve) => server.close(resolve));

  console.log(`\n========================================`);
  console.log(`🏆 [Template Audit Results]`);
  console.log(`  Total Registered Templates: ${ALL_IDS.length}`);
  console.log(`  CV Templates Tested (Cv1–Cv51): ${CV_IDS.length} -> ${CV_IDS.every(id => results.find(r => r.templateId === id && r.status === 'PASS')) ? 'ALL PASS' : 'FAILURES PRESENT'}`);
  console.log(`  Cover Templates Tested (Cover1–Cover4): ${COVER_IDS.length} -> ${COVER_IDS.every(id => results.find(r => r.templateId === id && r.status === 'PASS')) ? 'ALL PASS' : 'FAILURES PRESENT'}`);
  console.log(`  Passed: ${passed} / ${ALL_IDS.length}`);
  console.log(`  Failed: ${failed}`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

verifyAll55Templates().catch((err) => {
  console.error('Fatal audit error:', err);
  process.exit(1);
});
