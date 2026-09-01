import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('Blog taxonomy and Trusted By mutations are backend-owned and public lists are published-only', async () => {
  const [backend, operations, repository, policy, migration, trusted] = await Promise.all([
    fs.readFile('backend/index.js', 'utf8'), fs.readFile('src/services/api/platform.js', 'utf8'),
    fs.readFile('backend/repositories/MySQLRepository.js', 'utf8'), fs.readFile('backend/security/policy.js', 'utf8'),
    fs.readFile('backend/database/migrations/013_cms_relational_authority.sql', 'utf8'),
    fs.readFile('src/components/Dashboard2/elements/HomepageTrustedBy.jsx', 'utf8'),
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

test('static sitemap contains only stable public routes and no fabricated dynamic discovery', async () => {
  const sitemap = await fs.readFile('public/sitemap.xml', 'utf8');
  assert.doesNotMatch(sitemap, /dashboard|admin|editor|export|shared|portfolio\/[^<]|blog\/[^<]/);
  assert.match(sitemap, /https:\/\/(?:ai-resume-builder\.local|airesume\.projectdemo\.guru)\/blog/);
  assert.match(sitemap, /https:\/\/(?:ai-resume-builder\.local|airesume\.projectdemo\.guru)\/portfolios/);
});
