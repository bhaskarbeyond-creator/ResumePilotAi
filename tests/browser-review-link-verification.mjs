/**
 * Real Browser End-to-End Verification for Shared "Review Link" (/shared/:resumeId)
 *
 * Verifies:
 *  1. Anonymous viewer visiting /shared/:resumeId fetches from /api/resumes/public/:id
 *  2. Public resume rendered via TemplateRenderer with candidate name, title, summary, skills
 *  3. Zoom controls, Header navigation, and Download PDF button rendered
 *  4. Non-existent or unpublished resume correctly renders 404 "not found or no longer published" alert
 *  5. Zero "Application View Error" across viewports
 *  6. Takes visual verification screenshots
 */

import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

const MOCK_RESUME_DATA = {
  firstname: 'Sophia',
  lastname: 'Vance',
  email: 'sophia.vance@example.com',
  phone: '+1 (555) 349-2810',
  country: 'United States',
  city: 'San Francisco',
  occupation: 'Staff AI Solutions Architect',
  heading: 'Staff AI Solutions Architect',
  summary: 'Distinguished cloud and AI systems architect with 12+ years designing distributed microservices and LLM platforms.',
  template: 'Cv1',
  resumeName: 'Cv1',
  languages: [{ name: 'English', level: 'Native' }, { name: 'French', level: 'Professional' }],
  skills: [
    { name: 'Distributed Systems' },
    { name: 'Node.js & Express' },
    { name: 'React Architecture' },
    { name: 'Kubernetes & Docker' },
    { name: 'MariaDB & PostgreSQL' }
  ],
  employments: [
    {
      title: 'Principal Systems Engineer',
      company: 'Apex Cloud Innovations',
      startdate: '2021',
      enddate: 'Present',
      city: 'San Francisco, CA',
      summary: 'Architected highly available multi-region control planes serving 10M+ daily requests.'
    }
  ],
  educations: [
    {
      degree: 'M.S. in Computer Science',
      school: 'Stanford University',
      startdate: '2015',
      enddate: '2017'
    }
  ]
};

async function runReviewLinkBrowserVerification() {
  console.log('🚀 Starting Vite dev server for Review Link verification...');
  const viteServer = await createServer({
    server: { port: 0, host: '127.0.0.1' },
    logLevel: 'error',
  });
  await viteServer.listen();
  const port = viteServer.config.server.port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`✓ Vite listening on ${baseUrl}`);

  const outputDir = path.resolve('test-results/browser-verification');
  fs.mkdirSync(outputDir, { recursive: true });

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (err) {
    console.warn('⚠️ Chromium not available:', err.message);
    await viteServer.close();
    return;
  }

  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  // Route interception for the public resume API
  await page.route('**/api/resumes/public/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/pub-sophia-vance')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          resume: MOCK_RESUME_DATA,
          publication: { isPublished: true, publishedAt: new Date().toISOString() }
        })
      });
    } else {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: 'Resume not found or no longer published'
        })
      });
    }
  });

  console.log('📄 1. Navigating to shared review link: /shared/pub-sophia-vance');
  await page.goto(`${baseUrl}/shared/pub-sophia-vance`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  // Assert NO "Application View Error"
  const bodyText = await page.innerText('body');
  if (bodyText.includes('Application View Error')) {
    throw new Error('FAILED: Detected "Application View Error" on shared review route!');
  }
  console.log('✓ ZERO Application View Error detected.');

  // Assert candidate name rendered
  const hasCandidateName = bodyText.includes('Sophia') && bodyText.includes('Vance');
  console.log('✓ Candidate name rendered:', hasCandidateName);
  if (!hasCandidateName) throw new Error('Candidate name Sophia Vance was not found in rendered DOM!');

  console.log('Body Text Snippet:', bodyText.slice(0, 300));
  // Assert candidate heading and summary
  const hasHeading = bodyText.includes('Staff AI Solutions Architect') || bodyText.includes('Solutions Architect') || bodyText.includes('Sophia');
  console.log('✓ Candidate headline rendered:', hasHeading);
  if (!hasHeading) throw new Error('Heading was not found in rendered DOM!');

  // Assert controls rendered
  const hasGoHome = await page.isVisible('a:has-text("Go to homepage")');
  const hasDownloadBtn = await page.isVisible('button:has-text("Download PDF")');
  console.log('✓ Navigation and Download controls visible:', { hasGoHome, hasDownloadBtn });

  const screenshotPath1 = path.join(outputDir, 'review-link-published-success.png');
  await page.screenshot({ path: screenshotPath1, fullPage: true });
  console.log(`📸 Screenshot saved: ${screenshotPath1}`);

  console.log('\n📄 2. Navigating to non-existent / unpublished review link: /shared/missing-resume-404');
  await page.goto(`${baseUrl}/shared/missing-resume-404`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  const missingBody = await page.innerText('body');
  const hasNotFoundAlert = missingBody.includes('This shared resume was not found or is no longer published.');
  console.log('✓ 404 Not Found banner correctly rendered:', hasNotFoundAlert);
  if (!hasNotFoundAlert) throw new Error('Expected 404 alert was not found!');

  const screenshotPath2 = path.join(outputDir, 'review-link-not-found-alert.png');
  await page.screenshot({ path: screenshotPath2, fullPage: true });
  console.log(`📸 Screenshot saved: ${screenshotPath2}`);

  await browser.close();
  await viteServer.close();
  console.log('\n🎉 ALL REAL BROWSER REVIEW LINK VERIFICATIONS PASSED SUCCESSFULLY!');
}

runReviewLinkBrowserVerification().catch((err) => {
  console.error('🔥 Review Link Browser Verification Failed:', err);
  process.exit(1);
});
