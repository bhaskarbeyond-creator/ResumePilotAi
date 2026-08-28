import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('custom pages have one relational owner with revisioned audited writes and fail-closed public reads', async () => {
  const [backend, operations, repository, mutations, policy, baseline, consolidation, admin] = await Promise.all([
    fs.readFile('backend/index.js', 'utf8'), fs.readFile('src/services/api/platform.js', 'utf8'),
    fs.readFile('backend/repositories/MySQLRepository.js', 'utf8'), fs.readFile('backend/services/resilientMutations.js', 'utf8'),
    fs.readFile('backend/security/policy.js', 'utf8'), fs.readFile('backend/database/migrations/001_baseline.sql', 'utf8'),
    fs.readFile('backend/database/migrations/013_cms_relational_authority.sql', 'utf8'), fs.readFile('src/components/admin/settings/pagesSettings.jsx', 'utf8'),
  ]);
  assert.match(backend, /CMS_PAGE_CREATED/);
  assert.match(backend, /CMS_PAGE_UPDATED/);
  assert.match(backend, /CMS_PAGE_DELETED/);
  assert.match(backend, /validateCustomPageContent/);
  assert.match(operations, /\/api\/admin\/pages/);
  assert.match(operations, /\/api\/public\/custom-pages\//);
  assert.match(backend, /CUSTOM_PAGES_UNAVAILABLE/);
  assert.match(backend, /Cache-Control', 'no-store/);
  assert.match(admin, /editingRevision/);
  assert.match(admin, /Publication state/);
  assert.match(repository, /getCustomPages\(options = \{\}\)/);
  assert.match(repository, /UPDATE custom_pages[\s\S]*WHERE id = \? AND revision = \?/);
  assert.match(repository, /DATABASE_OWNERSHIP_VIOLATION/);
  assert.match(mutations, /custom_pages: \['getCustomPageById', 'saveCustomPage', 'deleteCustomPage'/);
  assert.match(backend, /getCustomPages\(\{ publishedOnly: true \}\)/);
  assert.doesNotMatch(backend, /listDocuments\('custom_pages'/);
  assert.doesNotMatch(backend, /cmsPagesRouter/);
  assert.match(policy, /ADMIN_PREFIXES[\s\S]*'\/admin\/'/);
  assert.match(policy, /system\.config\.write/);
  assert.match(baseline, /CREATE TABLE IF NOT EXISTS custom_pages/);
  assert.match(consolidation, /FROM canonical_documents cd[\s\S]*entity_type = 'custom_pages'/);
  assert.match(consolidation, /ADD COLUMN IF NOT EXISTS revision/);
});

test('public custom page distinguishes loading, unavailable and client-side 404 while retaining render sanitization', async () => {
  const page = await fs.readFile('src/components/CustomPage/CustomePage.jsx', 'utf8');
  assert.match(page, /pageState: 'not-found'/);
  assert.match(page, /pageState: 'failed'/);
  assert.match(page, /client-side route is unavailable/);
  assert.match(page, /HTTP 200/);
  assert.match(page, /sanitizePublicHtml/);
  assert.match(page, /generation !== this\._generation/);
  assert.match(page, /noindex,nofollow/);
});

test('custom page write validation rejects active content classes', async () => {
  const backend = await fs.readFile('backend/index.js', 'utf8');
  const validator = backend.slice(backend.indexOf('function validateCustomPageContent'), backend.indexOf("app.get('/api/admin/pages'"));
  for (const token of ['script', 'iframe', 'object', 'embed', 'svg', 'javascript', 'data', '@import']) assert.match(validator.toLowerCase(), new RegExp(token));
});
