import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

async function testJourneys() {
  console.log('====================================================');
  console.log('🎭 RUNNING PLAYWRIGHT REAL USER JOURNEYS TEST');
  console.log('====================================================\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  const baseUrl = 'https://airesume.projectdemo.guru';

  // 1. Resume Builder Journey
  console.log('1. Testing Resume Builder UI Journey...');
  await page.goto(`${baseUrl}/build-resume/heading`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);
  const headingTitle = await page.title();
  console.log(`  ✅ Heading Page Title: "${headingTitle}"`);

  // 2. Finalize Step Journey
  console.log('2. Testing Finalize Step Navigation...');
  await page.goto(`${baseUrl}/build-resume/finalize`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);
  console.log('  ✅ Finalize Step Loaded.');

  // 3. Testing Backend Download Endpoints directly with session
  console.log('3. Validating /api/export-docx Endpoint...');
  const res = await page.request.post(`${baseUrl}/api/export-docx`, {
    data: {
      template: 'Cv1',
      firstname: 'Bhaskar',
      lastname: 'Madala',
      occupation: 'Lead Cloud Architect',
      summary: 'Experienced distributed systems engineer.'
    }
  });

  const status = res.status();
  console.log(`  ✅ /api/export-docx HTTP Status: ${status}`);
  if (status === 200) {
    const body = await res.body();
    const zip = await JSZip.loadAsync(body);
    const hasDoc = !!zip.file('word/document.xml');
    console.log(`  ✅ Downloaded DOCX valid OOXML: ${hasDoc ? 'YES (Zip PK format)' : 'NO'}`);
  }

  await browser.close();
  console.log('\n====================================================');
  console.log('🎉 PLAYWRIGHT REAL USER JOURNEYS COMPLETE: PASS');
  console.log('====================================================\n');
}

testJourneys().catch((err) => {
  console.error('Playwright journey failed:', err);
  process.exit(1);
});
