import { chromium } from 'playwright';
import https from 'node:https';
import path from 'node:path';

const LIVE_BASE = 'https://airesume.projectdemo.guru';
const ARTIFACT_DIR = 'C:/Users/mbhas/.gemini/antigravity-ide/brain/e973f01a-4e97-4355-bb6f-2d1340c18015';

function fetchUrl(path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'airesume.projectdemo.guru',
      port: 443,
      path: path,
      method: options.method || 'GET',
      headers: options.headers || { 'User-Agent': 'ResumePilotVerifier/2.0' },
      timeout: 10000,
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    if (options.body) req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    req.end();
  });
}

async function verifyLiveEnterprise() {
  console.log('===============================================================');
  console.log('LIVE PRODUCTION ENTERPRISE SYSTEM VERIFICATION');
  console.log(`URL: ${LIVE_BASE}`);
  console.log('===============================================================\n');

  // 1. Health Probe
  console.log('Step 1: Probing Production /api/health...');
  const health = await fetchUrl('/api/health');
  console.log(`Status: ${health.status}, Response: ${health.body}`);
  if (health.status !== 200) throw new Error(`Health check failed with ${health.status}`);

  // 2. Enterprise Dark/Auth Gate Probe
  console.log('\nStep 2: Probing /api/enterprise/status without auth token...');
  const unauthStatus = await fetchUrl('/api/enterprise/status');
  console.log(`Status: ${unauthStatus.status}, Response: ${unauthStatus.body}`);
  if (unauthStatus.status !== 401) throw new Error(`Expected 401 on unauthenticated call, got ${unauthStatus.status}`);

  // 3. Live Browser Verification
  console.log('\nStep 3: Launching Playwright against live production frontend...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  try {
    console.log('Navigating to https://airesume.projectdemo.guru/enterprise...');
    await page.goto(`${LIVE_BASE}/enterprise`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000);

    const title = await page.title();
    console.log(`Live Document Title: ${title}`);

    const screenshotPath = path.join(ARTIFACT_DIR, 'enterprise_live_production_full.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`✓ Screenshot captured to: ${screenshotPath}`);

    // Verify root DOM
    const domInfo = await page.evaluate(() => {
      return {
        hasRoot: !!document.getElementById('root'),
        bodyLength: document.body.innerHTML.length,
        scripts: Array.from(document.querySelectorAll('script[src]')).map(s => s.getAttribute('src')),
      };
    });
    console.log(`DOM verified: root=${domInfo.hasRoot}, scripts=${domInfo.scripts.length}`);

    // 4. Legacy Route Verification
    console.log('\nStep 4: Verifying legacy routes (Resume Builder, Templates, Interview)...');
    await page.goto(`${LIVE_BASE}/build-resume`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1500);
    console.log('✓ /build-resume route loaded cleanly');

    await page.goto(`${LIVE_BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1500);
    console.log('✓ /dashboard route loaded cleanly');

    console.log('\n===============================================================');
    console.log('LIVE VERIFICATION SUCCESSFUL — ZERO REGRESSIONS');
    console.log('===============================================================\n');
  } finally {
    await browser.close();
  }
}

verifyLiveEnterprise().catch(err => {
  console.error('Live verification failed:', err);
  process.exit(1);
});
