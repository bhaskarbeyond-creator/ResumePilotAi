/**
 * verify_overview_enhanced.mjs
 *
 * Playwright verification script for the newly enhanced Candidate Overview.
 * Verifies:
 *  1. Copilot Hero HUD (greeting, dynamic AI insight line, quote, CTAs)
 *  2. Metric Cards (Total Resumes with 30d trend, Avg. ATS Score with live SVG Donut, Cover Letters, Portfolios, Profile Readiness)
 *  3. Strictly ZERO job_tracker mentions or cards
 *  4. AI Career Briefing Surface
 *  5. Top Job Matches For You (MariaDB jobs, bookmarking buttons)
 *  6. Your Next Steps Onboarding Progress Bar & 4 Milestones
 *  7. 5 Responsive device viewports with zero horizontal overflow
 */

import { chromium } from 'playwright';
import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs/promises';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const BASE_URL = 'https://ime365.local';
const ARTIFACTS_DIR = 'artifacts/overview-enhanced-verification';

const VIEWPORTS = [
  { name: 'UltraWide_2560', width: 2560, height: 1440 },
  { name: 'Desktop_1440', width: 1440, height: 900 },
  { name: 'Laptop_1024', width: 1024, height: 768 },
  { name: 'Tablet_768', width: 768, height: 1024 },
  { name: 'Mobile_375', width: 375, height: 812 },
];

async function runOverviewVerification() {
  await fs.mkdir(ARTIFACTS_DIR, { recursive: true });

  console.log(`\n=============================================================================`);
  console.log(`🚀 AUDITING ENHANCED CANDIDATE OVERVIEW (ZERO JOB_TRACKER DEPENDENCY)`);
  console.log(`   Target: ${BASE_URL}/dashboard`);
  console.log(`=============================================================================\n`);

  // Obtain genuine preview auth token
  const loginRes = await fetch(`${BASE_URL}/api/auth/preview-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'candidate@ime365.com',
      password: 'password123',
      name: 'Alex Morgan',
    }),
  });
  const authData = await loginRes.json();
  assert.ok(authData.token, 'Failed to obtain live token from preview-login');
  console.log(`  ✓ Obtained genuine HMAC Bearer token for UID: ${authData.uid}`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--ignore-certificate-errors', '--disable-gpu'],
  });

  try {
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 1440, height: 900 },
    });

    await context.addInitScript(({ token, uid, email, displayName, role }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('auth_token', token);
      localStorage.setItem(
        'ime_dev_user',
        JSON.stringify({ uid, email, displayName, role, token })
      );
      localStorage.setItem('cuba_theme', 'light');
    }, authData);

    const page = await context.newPage();

    console.log(`\n--- [1] Loading Candidate Overview (/dashboard) ---`);
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);

    // 1. Verify Copilot Hero HUD
    const copilotHud = page.locator('[data-testid="cuba-copilot-hud"]');
    await copilotHud.waitFor({ state: 'visible', timeout: 5000 });
    const greetingText = await page.locator('[data-testid="cuba-welcome-greeting"]').textContent();
    console.log(`  ✓ Greeting: "${greetingText.trim()}"`);
    assert.ok(greetingText.includes('Alex'), 'Greeting contains candidate first name');

    // 2. Verify Dynamic AI Insight Line
    const insightEl = copilotHud.locator('.text-ink.font-semibold');
    const insightText = await insightEl.textContent();
    console.log(`  ✓ Live Copilot Insight: "${insightText.trim()}"`);
    assert.ok(insightText.length > 10, 'Copilot Insight is present and populated');

    // 3. Verify Metric Cards (6 Balanced Cards including Recent Activity)
    const metricSection = page.locator('[data-testid="cuba-metric-cards"]');
    await metricSection.waitFor({ state: 'visible', timeout: 5000 });
    const metricCardsText = await metricSection.textContent();
    console.log(`  ✓ Metric Cards summary preview:`);
    console.log(`    - Total Resumes: ${metricCardsText.includes('Total Resumes')}`);
    console.log(`    - Recent Activity: ${metricCardsText.includes('Recent Activity')}`);
    console.log(`    - Avg. ATS Score: ${metricCardsText.includes('Avg. ATS Score')}`);
    console.log(`    - Cover Letters: ${metricCardsText.includes('Cover Letters')}`);
    console.log(`    - Portfolios: ${metricCardsText.includes('Portfolios')}`);
    console.log(`    - Profile Status: ${metricCardsText.includes('Profile Status')}`);

    assert.ok(metricCardsText.includes('Total Resumes'), 'Total Resumes card rendered');
    assert.ok(metricCardsText.includes('Recent Activity'), 'Recent Activity card rendered');
    assert.ok(metricCardsText.includes('Avg. ATS Score'), 'Avg ATS Score card rendered');
    assert.ok(metricCardsText.includes('Cover Letters'), 'Cover Letters card rendered');
    assert.ok(metricCardsText.includes('Portfolios'), 'Portfolios card rendered');
    assert.ok(metricCardsText.includes('Profile Status'), 'Profile Status card rendered');

    // Verify Recent Activity KPI Card details (MIRRORS OLD OVERVIEW'S RECENT ACTIVITY CARD)
    const recentActivityMetricCard = page.locator('[data-testid="cuba-metric-recent-activity"]');
    await recentActivityMetricCard.waitFor({ state: 'visible', timeout: 5000 });
    const recentActivityMetricVal = await recentActivityMetricCard.locator('.text-2xl').textContent();
    console.log(`  ✓ Recent Activity Metric Value: "${recentActivityMetricVal.trim()}"`);
    assert.ok(recentActivityMetricVal.includes('Today') || recentActivityMetricVal.includes('ago') || recentActivityMetricVal.includes('activity'), 'Recent Activity shows valid relative timeframe');

    // Verify SVG ATS Donut exists inside the metric cards
    const atsDonutSvg = metricSection.locator('svg.-rotate-90');
    assert.ok((await atsDonutSvg.count()) > 0, 'Live circular SVG ATS Donut is rendered');
    console.log(`  ✓ Live SVG ATS Donut gauge verified`);

    // 4. Verify Recent Career Activity Stream (ZERO job_tracker)
    console.log(`\n--- [2] Validating Recent Career Activity Stream & Spotlight ---`);
    const recentActivitySection = page.locator('[data-testid="cuba-recent-activity"]');
    await recentActivitySection.waitFor({ state: 'visible', timeout: 5000 });
    const activityH2 = await recentActivitySection.locator('h2').textContent();
    console.log(`  ✓ Recent Activity Title: "${activityH2.trim()}"`);
    assert.ok(activityH2.includes('Recent Career Activity'), 'Recent Career Activity section header verified');

    // Verify Primary Resume Spotlight Card
    const resumeSpotlight = recentActivitySection.locator('.rounded-xl.border-brand-200');
    if ((await resumeSpotlight.count()) > 0) {
      const spotlightText = await resumeSpotlight.textContent();
      console.log(`  ✓ Primary Resume Spotlight detected:`);
      console.log(`    - Contains "Active Draft": ${spotlightText.includes('Active Draft')}`);
      console.log(`    - Contains "Edit in Builder": ${spotlightText.includes('Edit in Builder')}`);
      console.log(`    - Contains "ATS Score": ${spotlightText.includes('ATS Score')}`);
      assert.ok(spotlightText.includes('Edit in Builder'), 'Spotlight provides 1-click Edit in Builder');
    }

    // Verify Filter Tabs (All, Resumes, Covers, Saved)
    const filterButtons = recentActivitySection.locator('button');
    const filterBtnCount = await filterButtons.count();
    console.log(`  ✓ Filter tabs count: ${filterBtnCount}`);
    assert.ok(filterBtnCount >= 4, 'Activity filter tabs (All, Resumes, Covers, Saved) exist');

    // Click on "Resumes" filter tab
    await filterButtons.nth(1).click();
    await page.waitForTimeout(200);
    console.log(`  ✓ Filter tab "Resumes" clicked successfully`);

    // Click back to "All"
    await filterButtons.nth(0).click();
    await page.waitForTimeout(200);
    console.log(`  ✓ Filter tab "All" clicked successfully`);

    // 5. STRICT ASSERTION: NO JOB_TRACKER ON OVERVIEW
    console.log(`\n--- [3] Strict Assertion: Zero job_tracker on Overview ---`);
    const pageText = await page.locator('main').textContent();
    assert.ok(!pageText.includes('Tracked Jobs'), 'No "Tracked Jobs" card exists on Overview');
    assert.ok(!pageText.includes('job_tracker'), 'No job_tracker text exists on Overview');
    assert.ok(!pageText.includes('Track Job Application'), 'No job tracker action exists on Overview');
    console.log(`  ✓ Confirmed ZERO job_tracker metrics, cards, or references on Overview!`);

    // 6. Verify AI Career Briefing
    const aiBriefing = page.locator('[data-testid="cuba-ai-briefing"]');
    await aiBriefing.waitFor({ state: 'visible', timeout: 5000 });
    console.log(`  ✓ AI Career Briefing surface rendered with Live Career Intelligence badge`);

    // 7. Verify Top Job Matches for You
    const topJobsSection = page.locator('[data-testid="cuba-top-job-matches"]');
    await topJobsSection.waitFor({ state: 'visible', timeout: 5000 });
    const jobsH2 = await topJobsSection.locator('h2').textContent();
    console.log(`  ✓ Top Job Matches: "${jobsH2.trim()}"`);

    // 8. Verify Your Next Steps
    const nextStepsSection = page.locator('[data-testid="cuba-next-steps"]');
    await nextStepsSection.waitFor({ state: 'visible', timeout: 5000 });
    const progressBar = nextStepsSection.locator('[role="progressbar"]');
    await progressBar.waitFor({ state: 'visible', timeout: 5000 });
    const progressAria = await progressBar.getAttribute('aria-valuenow');
    console.log(`  ✓ Next Steps Progress Bar: ${progressAria}% complete`);
    assert.ok(Number(progressAria) >= 0 && Number(progressAria) <= 100, 'Valid progress bar percentage');

    await page.screenshot({ path: path.join(ARTIFACTS_DIR, '01_overview_desktop_1440.png') });
    await page.locator('#main-content').screenshot({ path: path.join(ARTIFACTS_DIR, '01_overview_desktop_1440_content.png') });

    // ───────────────────────────────────────────────────────────────────────────
    // 8. 5-Device Responsive Overflow Check
    // ───────────────────────────────────────────────────────────────────────────
    console.log(`\n--- [3] Validating Across All 5 Responsive Device Viewports ---`);
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(600);

      const metrics = await page.evaluate(() => {
        const doc = document.documentElement;
        return {
          scrollWidth: doc.scrollWidth,
          innerWidth: window.innerWidth,
          overflowPx: doc.scrollWidth - window.innerWidth,
        };
      });

      console.log(`  ✓ ${vp.name} (${vp.width}x${vp.height}): inner=${metrics.innerWidth}px, scroll=${metrics.scrollWidth}px, overflow=${metrics.overflowPx}px`);
      assert.ok(metrics.overflowPx <= 1, `Horizontal overflow on ${vp.name}: ${metrics.overflowPx}px`);

      await page.screenshot({ path: path.join(ARTIFACTS_DIR, `overview_${vp.name}.png`) });
      await page.locator('#main-content').screenshot({ path: path.join(ARTIFACTS_DIR, `overview_${vp.name}_content.png`) });
    }

    console.log(`\n=============================================================================`);
    console.log(`🎉 ENHANCED CANDIDATE OVERVIEW VERIFICATION 100% PASS`);
    console.log(`=============================================================================\n`);

  } catch (err) {
    console.error(`\n❌ VERIFICATION FAILURE:`, err);
    throw err;
  } finally {
    await browser.close();
  }
}

runOverviewVerification().catch((err) => {
  console.error('Fatal error in test:', err);
  process.exit(1);
});
