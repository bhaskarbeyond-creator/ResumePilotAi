import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('Blog taxonomy and Trusted By mutations are backend-owned and public lists are published-only', async () => {
  const [backend, operations, rules, trusted] = await Promise.all([
    fs.readFile('backend/index.js', 'utf8'), fs.readFile('src/firestore/dbOperations.js', 'utf8'),
    fs.readFile('SecurityRules.txt', 'utf8'), fs.readFile('src/components/Dashboard2/elements/HomepageTrustedBy.jsx', 'utf8'),
  ]);
  assert.match(backend, /CMS_CATEGORY_CREATED/);
  assert.match(backend, /CMS_CATEGORY_UPDATED/);
  assert.match(backend, /CATEGORY_HAS_POSTS/);
  assert.match(operations, /\/api\/admin\/blog\/categories/);
  assert.match(operations, /\/public\/trusted-by\.json/);
  assert.match(backend, /item\.published !== false/);
  assert.match(trusted, /let active = true/);
  assert.match(trusted, /role="status"/);
  const categoryRules = rules.slice(rules.indexOf('match /blog_categories'), rules.indexOf('match /pages'));
  assert.match(categoryRules, /allow write: if false/);
  const trustedRules = rules.slice(rules.indexOf('match /trustedBy'), rules.indexOf('match /contact'));
  assert.match(trustedRules, /resource\.data\.published == true/);
  assert.match(trustedRules, /allow write: if false/);
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
  assert.match(sitemap, /https:\/\/airesume\.projectdemo\.guru\/blog/);
  assert.match(sitemap, /https:\/\/airesume\.projectdemo\.guru\/portfolios/);
});
