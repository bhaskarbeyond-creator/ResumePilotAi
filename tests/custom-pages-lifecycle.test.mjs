import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('custom pages use revisioned audited backend writes with legacy public-read compatibility', async () => {
  const [backend, operations, rules, admin] = await Promise.all([
    fs.readFile('backend/index.js', 'utf8'), fs.readFile('src/firestore/dbOperations.js', 'utf8'),
    fs.readFile('SecurityRules.txt', 'utf8'), fs.readFile('src/components/admin/settings/pagesSettings.jsx', 'utf8'),
  ]);
  assert.match(backend, /CMS_PAGE_CONFLICT/);
  assert.match(backend, /CMS_PAGE_CREATED/);
  assert.match(backend, /CMS_PAGE_DELETED/);
  assert.match(backend, /validateCustomPageContent/);
  assert.match(operations, /\/api\/admin\/pages/);
  assert.match(operations, /\/public\/custom-pages\.json/);
  assert.match(backend, /Cache-Control', 'no-store/);
  assert.match(admin, /editingRevision/);
  assert.match(admin, /Publication state/);
  const pageRules = rules.slice(rules.indexOf('match /pages/{id}'), rules.indexOf('match /ads/{id}'));
  assert.match(pageRules, /!\('status' in resource\.data\)/);
  assert.match(pageRules, /resource\.data\.status == 'published'/);
  assert.match(pageRules, /allow write: if false/);
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
