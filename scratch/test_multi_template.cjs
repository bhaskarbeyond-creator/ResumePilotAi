const http = require('http');
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { chromium } = require('playwright');

const app = express();
app.use(express.static(path.join(__dirname, '..', 'dist')));

const tokens = new Map();

app.get('/api/export-render-data', (req, res) => {
  const token = req.query.token;
  if (!token || !tokens.has(token)) {
    return res.status(404).json({ error: 'Token not found' });
  }
  const data = tokens.get(token);
  tokens.delete(token);
  res.setHeader('Cache-Control', 'no-store, private');
  return res.json({ success: true, data });
});

app.get('/export/*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
});

const server = app.listen(0, '127.0.0.1', async () => {
  const port = server.address().port;
  console.log('Test server listening on port:', port);
  const browser = await chromium.launch({ headless: true });

  const templatesToTest = ['Cv1', 'Cv2', 'Cv3', 'Cover1'];
  for (const tpl of templatesToTest) {
    const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
    page.on('console', m => console.log(`[${tpl} BROWSER]`, m.text()));
    page.on('pageerror', e => console.error(`[${tpl} ERR]`, e.message));

    const token = crypto.randomBytes(32).toString('base64url');
    tokens.set(token, {
      firstname: 'Test',
      lastname: 'User',
      template: tpl,
      language: 'en',
      occupation: 'Software Engineer',
      email: 'test@example.com',
      summary: 'Summary text here...',
      experiences: [{ jobTitle: 'Dev', employer: 'Co', city: 'City', startDate: '2020', endDate: '2022', description: 'Desc' }],
      educations: [{ school: 'Uni', degree: 'BS', city: 'City', startDate: '2016', endDate: '2020' }],
      skills: [{ name: 'JavaScript', rating: 90 }]
    });

    const url = `http://127.0.0.1:${port}/export/${tpl}/item-01/en#renderToken=${token}`;
    console.log('Testing template:', tpl, '->', url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForFunction(
      () => document.documentElement.getAttribute('data-export-ready') === 'true' || document.documentElement.hasAttribute('data-export-error'),
      { timeout: 15000 }
    );
    const ready = await page.evaluate(() => document.documentElement.getAttribute('data-export-ready'));
    const err = await page.evaluate(() => document.documentElement.getAttribute('data-export-error'));
    console.log(`[${tpl} RESULT] ready=${ready}, error=${err}`);

    const pdf = await page.pdf({ format: 'A4', printBackground: true });
    console.log(`[${tpl} PDF] bytes=${pdf.length}, signature=${pdf.subarray(0, 5).toString('latin1')}`);
    await page.close();
  }

  await browser.close();
  server.close();
  console.log('All template tests finished cleanly!');
});
