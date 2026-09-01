import { chromium } from 'playwright';
import fs from 'fs';

const BASE_URL = 'https://ai-resume-builder.local/';

async function inspectAllRoutes() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const consoleErrors = [];
  const networkFailures = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push({ url: page.url(), text: msg.text() });
    }
  });

  page.on('requestfailed', req => {
    networkFailures.push({ url: req.url(), failure: req.failure()?.errorText });
  });

  console.log('Navigating to homepage...');
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Extract all hrefs and buttons from homepage
  const extractedLinks = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href]')).map(a => ({
      text: a.innerText.trim() || a.getAttribute('aria-label') || 'unnamed',
      href: a.getAttribute('href'),
      tag: 'a'
    }));

    const buttons = Array.from(document.querySelectorAll('button')).map(b => ({
      text: b.innerText.trim() || b.getAttribute('aria-label') || 'unnamed',
      onclick: b.getAttribute('onclick') || 'handled',
      id: b.id || '',
      tag: 'button'
    }));

    return { links, buttons };
  });

  console.log(`Found ${extractedLinks.links.length} links on homepage.`);
  console.log(JSON.stringify(extractedLinks.links, null, 2));

  // Let's test a list of common / known routes + all discovered links
  const targetRoutes = [
    '/',
    '/blog',
    '/pricing',
    '/contact',
    '/p/privacy-policy',
    '/p/terms-of-service',
    '/p/cookie-policy',
    '/features',
    '/jobs',
    '/portfolios',
    '/login',
    '/sign-up',
    '/front'
  ];

  // Add all internal links
  for (const item of extractedLinks.links) {
    if (item.href && item.href.startsWith('/') && !item.href.startsWith('//') && !targetRoutes.includes(item.href)) {
      targetRoutes.push(item.href);
    }
  }

  console.log('\n--- TESTING ROUTES ---');
  const routeResults = [];

  for (const route of targetRoutes) {
    const fullUrl = route.startsWith('http') ? route : `${BASE_URL.replace(/\/$/, '')}${route}`;
    console.log(`Testing: ${fullUrl}`);

    const testErrors = [];
    const onErr = (msg) => { if (msg.type() === 'error') testErrors.push(msg.text()); };
    page.on('console', onErr);

    try {
      const response = await page.goto(fullUrl, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(600);

      const status = response ? response.status() : 'N/A';
      const title = await page.title();
      const bodyText = await page.evaluate(() => document.body.innerText);

      const isNotFound = bodyText.includes('Page Not Found') || 
                         bodyText.includes('404') || 
                         bodyText.includes('Cannot find page') ||
                         title.includes('404') ||
                         title.includes('Not Found');

      const isBlank = bodyText.trim().length === 0;

      routeResults.push({
        route,
        fullUrl,
        httpStatus: status,
        title,
        isNotFound,
        isBlank,
        consoleErrors: [...testErrors],
        snippet: bodyText.slice(0, 150).replace(/\n/g, ' ')
      });

      console.log(`  -> Status: ${status} | Title: "${title}" | 404/NotFound: ${isNotFound} | Blank: ${isBlank}`);
    } catch (err) {
      console.log(`  -> ERROR: ${err.message}`);
      routeResults.push({
        route,
        fullUrl,
        error: err.message,
        isNotFound: true
      });
    } finally {
      page.off('console', onErr);
    }
  }

  // Also check blog posts list from API
  try {
    const blogRes = await fetch('http://127.0.0.1:8080/api/blog-data');
    if (blogRes.ok) {
      const blogData = await blogRes.json();
      console.log('\nBlog Data from API:', JSON.stringify(blogData, null, 2));
      if (Array.isArray(blogData?.posts)) {
        for (const post of blogData.posts) {
          const postRoute = `/blog/${post.slug}`;
          console.log(`Testing Blog Article: ${postRoute}`);
          const res = await page.goto(`${BASE_URL.replace(/\/$/, '')}${postRoute}`, { waitUntil: 'networkidle' });
          await page.waitForTimeout(500);
          const title = await page.title();
          const bodyText = await page.evaluate(() => document.body.innerText);
          const isNotFound = bodyText.includes('Post not found') || bodyText.includes('404') || bodyText.includes('Page Not Found');
          console.log(`  -> Blog Post [${post.slug}]: Title="${title}", NotFound=${isNotFound}`);
        }
      }
    }
  } catch (err) {
    console.log('Blog API test error:', err.message);
  }

  fs.writeFileSync('test-results/INITIAL_ROUTE_DISCOVERY.json', JSON.stringify({
    extractedLinks,
    routeResults,
    consoleErrors,
    networkFailures
  }, null, 2));

  await browser.close();
}

inspectAllRoutes().catch(console.error);
