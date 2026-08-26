import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

async function auditBrowserConsole() {
  console.log('=== STARTING BROWSER RUNTIME CONSOLE AUDIT ===');
  
  // 1. Start Vite dev server
  const server = await createServer({
    root: ROOT_DIR,
    server: { port: 5199, host: '127.0.0.1' },
    logLevel: 'error'
  });
  await server.listen();
  const base = 'http://127.0.0.1:5199';
  console.log(`Vite server running on ${base}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  const routesToTest = [
    '/',
    '/login',
    '/register',
    '/features',
    '/pricing',
    '/contact',
    '/faq',
    '/privacy-policy',
    '/terms-of-service',
    '/blog',
    '/jobs',
    '/build-resume',
    '/dashboard',
    '/dashboard/resumes',
    '/dashboard/interviews',
    '/dashboard/settings',
    '/dashboard/cover-letters',
    '/dashboard/portfolios',
    '/dashboard/job-tracker',
    '/dashboard/applied-jobs',
    '/enterprise',
    '/adm/dashboard',
    '/adm/users',
    '/adm/jobs',
    '/adm/health',
    '/adm/settings/ai',
    '/adm/settings/database',
    '/adm/settings/email'
  ];

  const capturedErrors = [];
  const capturedWarnings = [];

  for (const route of routesToTest) {
    const page = await context.newPage();
    
    page.on('console', msg => {
      const type = msg.type();
      const text = msg.text();
      const location = msg.location();
      
      // Filter out browser extension noise (contentscript.js)
      if (location?.url?.includes('contentscript.js') || location?.url?.includes('chrome-extension')) {
        return;
      }
      
      if (type === 'error') {
        capturedErrors.push({ route, text, location });
      } else if (type === 'warning') {
        capturedWarnings.push({ route, text, location });
      }
    });

    page.on('pageerror', err => {
      capturedErrors.push({ route, text: err.message, stack: err.stack });
    });

    try {
      await page.goto(`${base}${route}`, { waitUntil: 'domcontentloaded', timeout: 8000 });
      await page.waitForTimeout(1000);
    } catch (e) {
      // Navigation timeout or network error
    } finally {
      await page.close();
    }
  }

  await browser.close();
  await server.close();

  console.log('\n=== AUDIT RESULTS ===');
  console.log(`Total Errors Captured: ${capturedErrors.length}`);
  console.log(`Total Warnings Captured: ${capturedWarnings.length}\n`);

  if (capturedErrors.length > 0) {
    console.log('--- ERRORS ---');
    capturedErrors.forEach((e, i) => {
      console.log(`[${i + 1}] Route: ${e.route}`);
      console.log(`    Message: ${e.text}`);
      if (e.location?.url) console.log(`    Location: ${e.location.url}:${e.location.lineNumber}`);
      if (e.stack) console.log(`    Stack: ${e.stack.split('\n')[0]}`);
    });
  }

  if (capturedWarnings.length > 0) {
    console.log('\n--- WARNINGS ---');
    // Group warnings by text to avoid repetition
    const grouped = {};
    for (const w of capturedWarnings) {
      if (!grouped[w.text]) grouped[w.text] = [];
      grouped[w.text].push(w.route);
    }
    for (const [msg, routes] of Object.entries(grouped)) {
      console.log(`- Warning: "${msg.substring(0, 120)}"`);
      console.log(`  Occurrences: ${routes.length} (${routes.slice(0, 4).join(', ')}${routes.length > 4 ? '...' : ''})`);
    }
  }
}

auditBrowserConsole().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
