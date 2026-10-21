import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import fire from '../src/conf/fire.js';

const read = path => readFile(path, 'utf8');

test('no-Firebase public boot resolves as unauthenticated instead of stalling public routes', async () => {
  const auth = fire.auth();
  assert.equal(auth.currentUser, null);
  assert.equal(await auth.getRedirectResult(), null);
  const user = await new Promise(resolve => auth.onAuthStateChanged(resolve));
  assert.equal(user, null);
});

test('DIR-024 browser suite uses the live same-origin stack without API mocks', async () => {
  const [config, spec] = await Promise.all([
    // The DIR-024 config was moved into archive/probes/ with the other one-off
    // probe configs; this assertion kept reading the old root path and failed
    // with ENOENT on every branch.
    read('archive/probes/playwright.dir024.config.js'),
    read('tests/e2e/dir024-geo-seo.spec.js'),
  ]);
  assert.match(config, /testMatch: \/dir024-geo-seo/);
  assert.match(config, /DIR024_WEB_ORIGIN \|\| 'http:\/\/localhost:3000'/);
  assert.doesNotMatch(config, /webServer\s*:/);
  assert.match(spec, /_settingsSource[\s\S]*?mariadb/);
  assert.match(spec, /\/api\/public\/geo\/regions/);
  assert.match(spec, /\/llms-full\.txt/);
  assert.match(spec, /\/sitemap\.xml/);
  assert.match(spec, /AxeBuilder/);
  assert.doesNotMatch(spec, /page\.route\s*\(|route\.fulfill\s*\(|page\.setInputFiles\s*\(/);
});

test('DIR-024 public regional URLs and discovery documents are inventoried as read-only public routes', async () => {
  const [health, generator, certifier, inventory, backend] = await Promise.all([
    read('backend/services/platformHealth.js'),
    read('scripts/generate-api-inventory.mjs'),
    read('scripts/certify-all-286-endpoints-live.mjs'),
    read('docs/FINAL_API_INVENTORY.md'),
    read('backend/index.js'),
  ]);
  assert.match(health, /routes\/publicDiscovery/);
  assert.match(health, /authRequirementFor\(endpoint\.path, endpoint\.method\)/);
  assert.match(generator, /path === '\/api\/jobs-data\/:id'/);
  assert.match(generator, /authFor\(route\.method, route\.path\)/);
  assert.match(certifier, /PUBLIC_READ_ONLY_PATHS|PUBLIC_EXPLICIT_PATHS/);
  assert.match(certifier, /isPublicEndpoint\(route\.path, route\.method\)/);
  for (const route of [
    '/api/public/geo/regions',
    '/api/public/geo/regions/:kind/:slug',
    '/api/public/jobs/:jobId/og.png',
    '/api/public/blog/:slug/og.png',
  ]) assert.match(inventory, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(inventory, /`\/llms-full\.txt` \| PUBLIC \| PUBLIC/);
  assert.match(inventory, /`\/sitemap\.xml` \| PUBLIC \| PUBLIC/);
  assert.match(backend, /app\.get\('\/llms-full\.txt'/);
  assert.match(backend, /app\.get\('\/sitemap\.xml'/);
});

test('DIR-024 sitemap proxies to the MariaDB-backed generator and filters empty regional hubs', async () => {
  const [service, htaccess, vite, staticSitemap, page] = await Promise.all([
    read('backend/services/publicSitemap.js'),
    read('public/.htaccess'),
    read('vite.config.js'),
    read('public/sitemap.xml'),
    read('src/components/JobsListings/RegionalJobsPage.jsx'),
  ]);
  assert.match(service, /STABLE_PUBLIC_PATHS/);
  assert.match(service, /getRegionalJobs\([\s\S]*?limit:\s*1/);
  assert.match(service, /geoSeoEnabled === true/);
  assert.match(service, /if \(!Array\.isArray\(rows\) \|\| rows\.length === 0\) return null/);
  assert.match(htaccess, /llms-full\\\.txt/);
  assert.match(htaccess, /sitemap\\\.xml/);
  assert.match(vite, /'\/llms-full\.txt'/);
  assert.match(vite, /'\/sitemap\.xml'/);
  assert.doesNotMatch(staticSitemap, /jobs\/(?:city|in)\//, 'static fallback must not invent regional coverage');
  assert.match(page, /No active listings in/);
  assert.match(page, /bg-cuba-canvas/);
});
