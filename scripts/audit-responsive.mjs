import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, '../frontend');
const screenshotsDir = path.resolve(__dirname, '../tests/screenshots');

if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

async function run() {
  const viteServer = await createServer({
    root: frontendDir,
    configFile: path.resolve(frontendDir, 'vite.config.ts'),
    server: { port: 56220, strictPort: false },
  });
  await viteServer.listen();
  const address = viteServer.httpServer?.address();
  const port = typeof address === 'object' && address ? address.port : 56220;
  const base = `http://127.0.0.1:${port}`;

  const browser = await chromium.launch({ headless: true });

  const viewports = [
    { name: 'mobile', width: 375, height: 667 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1280, height: 800 },
  ];

  const targetRoutes = [
    { id: 'employer-overview', name: 'Employer Overview', path: '/employer' },
    { id: 'employer-jobs', name: 'Employer Jobs', path: '/employer/jobs' },
    { id: 'employer-pipeline', name: 'Employer Pipeline', path: '/employer/pipeline' },
    { id: 'enterprise-overview', name: 'Enterprise Overview', path: '/org' },
    { id: 'enterprise-iam', name: 'Enterprise IAM', path: '/org?tab=iam' },
    { id: 'enterprise-sso', name: 'Enterprise SSO', path: '/org?tab=sso' },
    { id: 'admin-dashboard', name: 'Admin Dashboard', path: '/admin' },
    { id: 'admin-health', name: 'Admin Health', path: '/admin/health' },
    { id: 'admin-users', name: 'Admin Users', path: '/admin/users' },
    { id: 'admin-settings', name: 'Admin Settings', path: '/admin/settings' },
  ];

  const clippingIssues = [];

  for (const vp of viewports) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });

    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem(
        'ime_dev_user',
        JSON.stringify({
          uid: 'audit_super_admin_999',
          email: 'audit-officer@ime365.ai',
          role: 'SUPER_ADMIN',
          roles: ['SUPER_ADMIN', 'ADMIN', 'EMPLOYER', 'RECRUITER'],
          emailVerified: true,
          displayName: 'Executive Security Auditor',
        })
      );
      sessionStorage.setItem('superadmin_role_view', 'SUPER_ADMIN');
    });

    for (const route of targetRoutes) {
      await page.goto(`${base}${route.path}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);

      const shotPath = path.join(screenshotsDir, `${route.id}-${vp.name}.png`);
      await page.screenshot({ path: shotPath, fullPage: false });

      // Check for content clipping inside containers
      const clipped = await page.evaluate((vpWidth) => {
        const issues = [];
        const elements = document.querySelectorAll('main *, .cuba-glass *, table, nav');
        for (const el of elements) {
          const style = window.getComputedStyle(el);
          // If container has overflow: hidden and children overflow it without text-overflow: ellipsis
          if (
            (style.overflowX === 'hidden' || style.overflow === 'hidden') &&
            el.scrollWidth > el.clientWidth + 5 &&
            el.clientWidth > 0 &&
            el.scrollWidth > vpWidth * 0.5
          ) {
            // Is it intentionally truncating a single line of text with ellipsis?
            if (style.textOverflow !== 'ellipsis' && el.childElementCount > 1) {
              issues.push({
                tag: el.tagName,
                className: (el.className || '').toString().slice(0, 70),
                scrollWidth: el.scrollWidth,
                clientWidth: el.clientWidth,
                clippedPx: el.scrollWidth - el.clientWidth,
                sampleText: (el.textContent || '').trim().slice(0, 40),
              });
            }
          }
        }
        return issues.slice(0, 5);
      }, vp.width);

      if (clipped.length > 0) {
        clippingIssues.push({
          viewport: vp.name,
          route: route.name,
          clippedElements: clipped,
        });
      }
    }
    await page.close();
  }

  console.log('\n========================================');
  console.log('--- CONTENT CLIPPING & OVERFLOW REPORT ---');
  console.log(`Routes with potential clipping: ${clippingIssues.length}`);
  console.log('========================================\n');
  for (const c of clippingIssues) {
    console.log(`[${c.viewport}] ${c.route}:`);
    for (const item of c.clippedElements) {
      console.log(`  - <${item.tag}> class: "${item.className}" clipped ${item.clippedPx}px (scroll: ${item.scrollWidth} vs client: ${item.clientWidth}) text: "${item.sampleText}"`);
    }
  }

  await browser.close();
  await viteServer.close();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
