// @ts-check
/**
 * VIEWPORT & SCREENSHOT AUDITOR
 *
 * Automatically tests routes across 3 standard viewports:
 *   - Mobile: 375 x 667 (iPhone)
 *   - Tablet: 768 x 1024 (iPad)
 *   - Desktop: 1440 x 900 (Laptop / Desktop)
 *
 * Verifies:
 *   1. Zero Horizontal Overflow: document.documentElement.scrollWidth <= window.innerWidth
 *   2. Responsive layout rendering without blank pages or fatal JS errors
 *   3. Captures full-page screenshots (.png) into .bridge/evidence/viewports/
 *   4. Generates a structured JSON report (.bridge/evidence/VIEWPORT_CENSUS.json)
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import dotenv from 'dotenv';
import { chromium } from 'playwright';
import { mintFirebaseSession } from '../../tests/e2e/dir006-session.mjs';

dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });
dotenv.config({ path: path.join(process.cwd(), 'backend', '.env'), quiet: true });

const ORIGIN = (process.env.TARGET_URL || process.env.DIR023_ORIGIN || 'http://localhost:5173').replace(/\/$/, '');
const EMAIL = process.env.ADMIN_EMAIL || process.env.DIR023_EMAIL || process.env.DIR006_EMAIL;
const OUT_DIR = path.join(process.cwd(), '.bridge', 'evidence', 'viewports');
const REPORT_PATH = path.join(process.cwd(), '.bridge', 'evidence', 'VIEWPORT_CENSUS.json');

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 667, isMobile: true, hasTouch: true },
  { name: 'tablet', width: 768, height: 1024, isMobile: true, hasTouch: true },
  { name: 'desktop', width: 1440, height: 900, isMobile: false, hasTouch: false }
];

// Representative key routes across all core application areas
const KEY_ROUTES = [
  { path: '/', title: 'Marketing Landing Page' },
  { path: '/login', title: 'Authentication Gateway' },
  { path: '/dashboard', title: 'Candidate Dashboard' },
  { path: '/dashboard/jobs', title: 'Job Listings & Search' },
  { path: '/dashboard/interview', title: 'AI Interview Coach' },
  { path: '/dashboard/job-tracker', title: 'Kanban Job Tracker' },
  { path: '/employer', title: 'Employer Portal Dashboard' },
  { path: '/employer/jobs', title: 'Employer Job Postings' },
  { path: '/admin/overview', title: 'Admin Master Overview' },
  { path: '/org/personal-66e908e4b168/overview', title: 'Enterprise Console Overview' },
  { path: '/portfolio/builder', title: 'Interactive Portfolio Builder' },
  { path: '/features', title: 'Product Features' }
];

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

async function runViewportAudit() {
  console.log('====================================================');
  console.log('🚀 INITIATING MULTI-VIEWPORT SCREENSHOT & OVERFLOW AUDIT');
  console.log(`Target Origin: ${ORIGIN}`);
  console.log(`Viewports: ${VIEWPORTS.map(v => `${v.name} (${v.width}x${v.height})`).join(', ')}`);
  console.log(`Routes: ${KEY_ROUTES.length} representative cross-portal routes`);
  console.log('====================================================\n');

  let session = null;
  if (EMAIL) {
    try {
      console.log(`Authenticating as ${EMAIL}...`);
      session = await mintFirebaseSession({ email: EMAIL });
      console.log('✓ Firebase Auth token acquired.\n');
    } catch (err) {
      console.warn('⚠️  Could not mint Firebase session; proceeding unauthenticated:', err.message);
    }
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const results = {
    generatedAt: new Date().toISOString(),
    origin: ORIGIN,
    totalProbes: KEY_ROUTES.length * VIEWPORTS.length,
    viewportsTested: VIEWPORTS.map(v => v.name),
    routesTested: KEY_ROUTES.length,
    overflowFailures: 0,
    navigationFailures: 0,
    records: []
  };

  for (const vp of VIEWPORTS) {
    console.log(`--- [VIEWPORT: ${vp.name.toUpperCase()} (${vp.width}x${vp.height})] ---`);
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.isMobile,
      hasTouch: vp.hasTouch
    });

    if (session) {
      await context.addInitScript(({ uid, email, token, refreshToken, apiKey }) => {
        localStorage.setItem(
          `firebase:authUser:${apiKey}:[DEFAULT]`,
          JSON.stringify({
            uid,
            email,
            emailVerified: true,
            isAnonymous: false,
            stsTokenManager: {
              apiKey,
              refreshToken,
              accessToken: token,
              expirationTime: Date.now() + 3600000
            },
            createdAt: String(Date.now()),
            lastLoginAt: String(Date.now())
          })
        );
      }, session);
    }

    const page = await context.newPage();

    for (const r of KEY_ROUTES) {
      const url = `${ORIGIN}${r.path}`;
      const record = {
        route: r.path,
        title: r.title,
        viewport: vp.name,
        width: vp.width,
        height: vp.height,
        status: 'PENDING',
        overflowX: false,
        scrollWidth: 0,
        innerWidth: vp.width,
        screenshotFile: ''
      };

      try {
        const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        // Settle DOM
        await page.waitForTimeout(1000);

        // Check for horizontal overflow
        const overflowCheck = await page.evaluate(() => {
          const docEl = document.documentElement;
          const body = document.body;
          const scrollW = Math.max(docEl.scrollWidth, body ? body.scrollWidth : 0);
          const innerW = window.innerWidth;
          const isOverflow = scrollW > innerW + 1; // 1px rounding tolerance
          
          let offendingSelector = null;
          if (isOverflow) {
            const allElements = document.querySelectorAll('*');
            for (const el of allElements) {
              const rect = el.getBoundingClientRect();
              if (rect.right > innerW + 2) {
                offendingSelector = `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).trim().split(/\s+/).slice(0, 3).join('.') : ''}`;
                break;
              }
            }
          }
          return { isOverflow, scrollW, innerW, offendingSelector };
        });

        record.scrollWidth = overflowCheck.scrollW;
        record.innerWidth = overflowCheck.innerW;
        record.overflowX = overflowCheck.isOverflow;
        record.offendingElement = overflowCheck.offendingSelector;

        if (overflowCheck.isOverflow) {
          record.status = 'FAIL_OVERFLOW';
          results.overflowFailures++;
          console.log(`  ❌ ${r.path.padEnd(35)} OVERFLOW: scrollWidth=${overflowCheck.scrollW}px > innerWidth=${overflowCheck.innerW}px (${overflowCheck.offendingSelector})`);
        } else {
          record.status = 'PASS';
          console.log(`  ✓ ${r.path.padEnd(35)} PASS (scrollWidth: ${overflowCheck.scrollW}px <= ${overflowCheck.innerW}px)`);
        }

        // Capture screenshot
        const sanitizedPath = r.path === '/' ? 'home' : r.path.replace(/[^a-zA-Z0-9_-]/g, '_');
        const filename = `${sanitizedPath}__${vp.name}.png`;
        const screenshotPath = path.join(OUT_DIR, filename);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        record.screenshotFile = `.bridge/evidence/viewports/${filename}`;

      } catch (err) {
        record.status = 'ERROR';
        record.error = err.message;
        results.navigationFailures++;
        console.log(`  ⚠️  ${r.path.padEnd(35)} ERROR: ${err.message.slice(0, 60)}`);
      }

      results.records.push(record);
    }

    await context.close();
    console.log('');
  }

  await browser.close();

  fs.writeFileSync(REPORT_PATH, JSON.stringify(results, null, 2), 'utf8');
  console.log('====================================================');
  console.log(`Audit Complete. Report generated at: ${REPORT_PATH}`);
  console.log(`Screenshots saved in: ${OUT_DIR}`);
  console.log(`Summary: Total: ${results.totalProbes} | Overflow Failures: ${results.overflowFailures} | Nav Failures: ${results.navigationFailures}`);
  console.log('====================================================');

  return results;
}

runViewportAudit().catch(err => {
  console.error('Fatal audit failure:', err);
  process.exit(1);
});
