import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('Blog taxonomy and Trusted By mutations are backend-owned and public lists are published-only', async () => {
  const [backend, operations, repository, policy, migration, trusted] = await Promise.all([
    fs.readFile('backend/index.js', 'utf8'), fs.readFile('src/services/api/platform.js', 'utf8'),
    fs.readFile('backend/repositories/MySQLRepository.js', 'utf8'), fs.readFile('backend/security/policy.js', 'utf8'),
    fs.readFile('backend/database/migrations/013_cms_relational_authority.sql', 'utf8'),
    fs.readFile('src/components/Marketing/elements/HomepageTrustedBy.jsx', 'utf8'),
  ]);
  assert.match(backend, /CMS_CATEGORY_CREATED/);
  assert.match(backend, /CMS_CATEGORY_UPDATED/);
  assert.match(backend, /CATEGORY_HAS_POSTS/);
  assert.match(operations, /\/api\/admin\/blog\/categories/);
  assert.match(operations, /\/api\/public\/trusted-by/);
  assert.match(backend, /getTrustedBy\(\{ publishedOnly: true/);
  assert.match(repository, /FROM trusted_by|SELECT \* FROM trusted_by/);
  assert.doesNotMatch(backend, /listDocuments\('trusted_by'/);
  assert.match(trusted, /let active = true/);
  assert.match(trusted, /role="status"/);
  assert.match(policy, /ADMIN_PREFIXES[\s\S]*'\/admin\/'/);
  assert.match(policy, /system\.config\.write/);
  assert.match(migration, /INSERT INTO trusted_by/);
  assert.match(migration, /entity_type = 'trusted_by'/);
  assert.match(repository, /WHERE active = 1/);
});

test('missing public Portfolio metadata is noindex and private Resume shares stay noindex', async () => {
  const [portfolio, seo, resume] = await Promise.all([
    fs.readFile('src/components/PublicPortfolio/PublicPortfolio.jsx', 'utf8'),
    fs.readFile('src/components/RouteSeo.jsx', 'utf8'),
    fs.readFile('src/components/PublicResume/PublicResume.jsx', 'utf8'),
  ]);
  assert.match(portfolio, /noindex,nofollow/);
  assert.match(portfolio, /Portfolio unavailable/);
  assert.match(seo, /'\/shared'/);
  assert.doesNotMatch(resume, /index,follow/);
  assert.match(resume, /no longer published/);
});

test('public and employer media rendering uses safe image URL projections', async () => {
  const [jobCard, companies, addCompany, blogAdmin] = await Promise.all([
    fs.readFile('src/components/JobsListings/JobCard.jsx', 'utf8'),
    fs.readFile('src/components/Dashboard/EmployerDashboard/CompaniesManagement.jsx', 'utf8'),
    fs.readFile('src/components/Dashboard/EmployerDashboard/AddCompanyModal.jsx', 'utf8'),
    fs.readFile('src/components/admin/blogManagement/BlogManagement.jsx', 'utf8'),
  ]);
  for (const source of [jobCard, companies, addCompany, blogAdmin]) assert.match(source, /sanitizeImageUrl/);
});

test('static sitemap fallback stays stable while live sitemap routes add only real regional listings', async () => {
  const [sitemap, backend, service, htaccess, vite] = await Promise.all([
    fs.readFile('public/sitemap.xml', 'utf8'),
    fs.readFile('backend/index.js', 'utf8'),
    fs.readFile('backend/services/publicSitemap.js', 'utf8'),
    fs.readFile('public/.htaccess', 'utf8'),
    fs.readFile('vite.config.js', 'utf8'),
  ]);
  assert.doesNotMatch(sitemap, /dashboard|admin|editor|export|shared|portfolio\/[^<]|blog\/[^<]/);
  assert.match(sitemap, /https:\/\/(?:ai-resume-builder\.local|airesume\.projectdemo\.guru)\/blog/);
  assert.match(sitemap, /https:\/\/(?:ai-resume-builder\.local|airesume\.projectdemo\.guru)\/portfolios/);
  assert.match(backend, /app\.get\('\/sitemap\.xml'/);
  assert.match(service, /geoSeoEnabled === true/);
  assert.match(service, /getRegionalJobs\([\s\S]*?limit:\s*1/);
  assert.match(htaccess, /sitemap\\\.xml/);
  assert.match(vite, /'\/sitemap\.xml'/);
});

test('DIR-031: static sitemap URLs are exactly the backend stable public paths on one origin', async () => {
  // The static public/sitemap.xml is the build-time fallback that answers when the
  // backend is unreachable. It previously listed its own hand-copied path set and its
  // own hand-copied origin, so it could drift from the live /sitemap.xml route in both
  // dimensions without any test failing. Parity is now asserted against the backend's
  // own STABLE_PUBLIC_PATHS, which is the same list the live route renders.
  const { createRequire } = await import('node:module');
  const require = createRequire(`${process.cwd()}/parity.mjs`);
  const { STABLE_PUBLIC_PATHS } = require('./backend/services/publicSitemap.js');

  const sitemap = await fs.readFile('public/sitemap.xml', 'utf8');
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert.equal(locs.length, STABLE_PUBLIC_PATHS.length, 'static sitemap must list every stable public path exactly once');

  const origins = new Set(locs.map((loc) => new URL(loc).origin));
  assert.equal(origins.size, 1, `static sitemap must use exactly one canonical origin, found: ${[...origins].join(', ')}`);

  const expected = STABLE_PUBLIC_PATHS.map((routePath) => new URL(routePath, `${[...origins][0]}/`).href);
  assert.deepEqual(locs, expected, 'static sitemap path set/order must equal backend STABLE_PUBLIC_PATHS');
});
