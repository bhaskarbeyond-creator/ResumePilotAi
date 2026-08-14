import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('private routes are noindex and unknown routes render a real 404', async () => {
  const [seo, main, robots] = await Promise.all([
    fs.readFile('src/components/RouteSeo.jsx', 'utf8'),
    fs.readFile('src/main.jsx', 'utf8'),
    fs.readFile('public/robots.txt', 'utf8'),
  ]);
  for (const path of ['/dashboard', '/adm', '/blog-editor', '/portfolio/builder', '/export', '/shared']) {
    assert.match(seo, new RegExp(path.replace('/', '\\/')));
  }
  assert.match(seo, /noindex,nofollow/);
  assert.match(main, /path="\*" element={<NotFound \/>}/);
  assert.match(robots, /Disallow: \/adm/);
});

test('public SEO has canonical, descriptions, Open Graph, robots and sitemap inventory', async () => {
  const [seo, sitemap] = await Promise.all([
    fs.readFile('src/components/RouteSeo.jsx', 'utf8'),
    fs.readFile('public/sitemap.xml', 'utf8'),
  ]);
  assert.match(seo, /link\[rel="canonical"\]/);
  assert.match(seo, /og:title/);
  assert.match(seo, /index,follow/);
  assert.match(sitemap, /<loc>https:\/\/airesume\.projectdemo\.guru\/blog<\/loc>/);
  assert.doesNotMatch(sitemap, /dashboard|blog-editor|shared/);
});

test('non-English locale payloads are loaded on demand instead of bundled into the initial i18n chunk', async () => {
  const source = await fs.readFile('src/i18n.js', 'utf8');
  assert.match(source, /dynamicLocaleBackend/);
  assert.match(source, /import\('\.\/locales\/es\/es\.json'/);
  assert.match(source, /resources: \{ en:/);
  assert.doesNotMatch(source, /import common_es/);
});

test('i18n literal inventory is reproducible and classifies UI, accessibility, technical and brand strings', async () => {
  const inventory = JSON.parse(await fs.readFile('docs/I18N_UI_STRING_INVENTORY.json', 'utf8'));
  assert.equal(inventory.filesScanned, 280);
  assert.equal(inventory.occurrences, 2896);
  assert.equal(inventory.summary.USER_FACING_ENGLISH_CANDIDATE, 2369);
  assert.equal(inventory.summary.USER_FACING_ACCESSIBILITY, 302);
});

test('PWA remains installable but authenticated offline caching is explicitly disabled', async () => {
  const [worker, bootstrap, manifest] = await Promise.all([
    fs.readFile('src/serviceWorker.js', 'utf8'), fs.readFile('src/bootstrap.js', 'utf8'), fs.readFile('public/manifest.json', 'utf8'),
  ]);
  assert.match(worker, /intentionally disabled/);
  assert.doesNotMatch(worker, /caches\.open|indexedDB/);
  assert.match(bootstrap, /getRegistrations/);
  const parsed = JSON.parse(manifest);
  assert.equal(parsed.scope, '/');
  assert.equal(parsed.id, '/');
});

test('route transitions restore keyboard focus without redesigning page layouts', async () => {
  const [focus, main] = await Promise.all([fs.readFile('src/components/RouteFocus.jsx', 'utf8'), fs.readFile('src/main.jsx', 'utf8')]);
  assert.match(focus, /requestAnimationFrame/);
  assert.match(focus, /target\.focus/);
  assert.match(focus, /main h1/);
  assert.match(main, /<RouteFocus \/>/);
});

test('readiness reports unmeasured dependencies as NOT_CHECKED and RC runner exposes blocked work', async () => {
  const [backend, runner] = await Promise.all([
    fs.readFile('backend/index.js', 'utf8'), fs.readFile('scripts/release-candidate.mjs', 'utf8'),
  ]);
  assert.match(backend, /app\.get\('\/readyz'/);
  assert.match(backend, /aiProviders: 'NOT_CHECKED'/);
  assert.match(runner, /NOT EXECUTED \/ ENVIRONMENT BLOCKED/);
  assert.match(runner, /Production dependency audit/);
  assert.match(runner, /Firebase rules emulators/);
});
