import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { clearAccountScopedBrowserState } from '../src/utils/browserState.js';

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    clear() { values.clear(); },
    values,
  };
}

test('logout cleanup removes fixed and dynamic account data while retaining device preferences', async () => {
  const local = storage({
    user: 'user-a', currentResumeItem: '{"private":true}', currentCoverItem: '{"private":true}',
    'resume_recovery:user-a:resume-1': '{"private":true}', interviewProgress: '{"private":true}',
    preferredLanguage: 'te', resumepilot_privacy_consent_v1: 'denied', website_meta_cache: '{"public":true}',
  });
  const session = storage({ phonepe_pending: '{"user":"user-a"}', 'audit_logged_user-a': 'true' });
  const deletedCaches = [];
  const cacheStorage = { async keys() { return ['legacy-authenticated-api', 'legacy-assets']; }, async delete(key) { deletedCaches.push(key); return true; } };
  clearAccountScopedBrowserState({ local, session, cacheStorage });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(local.getItem('user'), null);
  assert.equal(local.getItem('currentResumeItem'), null);
  assert.equal(local.getItem('currentCoverItem'), null);
  assert.equal(local.getItem('resume_recovery:user-a:resume-1'), null);
  assert.equal(local.getItem('interviewProgress'), null);
  assert.equal(session.length, 0);
  assert.deepEqual(deletedCaches.sort(), ['legacy-assets', 'legacy-authenticated-api']);
  assert.equal(local.getItem('preferredLanguage'), 'te');
  assert.equal(local.getItem('resumepilot_privacy_consent_v1'), 'denied');
  assert.equal(local.getItem('website_meta_cache'), '{"public":true}');
});

test('private route and auth listeners reject guest fallbacks and stale A to B completions', async () => {
  const [main, dashboard, welcome, bootstrap, covers, board, favourites, actions, resumeCard] = await Promise.all([
    fs.readFile('src/main.jsx', 'utf8'),
    fs.readFile('src/components/Dashboard/DashboardMain/DashboardMain.jsx', 'utf8'),
    fs.readFile('src/components/welcome/Welcome.jsx', 'utf8'),
    fs.readFile('src/bootstrap.js', 'utf8'),
    fs.readFile('src/components/Dashboard/CoversList/CoversList.jsx', 'utf8'),
    fs.readFile('src/components/Boards/board-step-filling/BoardFilling.jsx', 'utf8'),
    fs.readFile('src/components/Dashboard/DashboardFavourites/DashboardFavourites.jsx', 'utf8'),
    fs.readFile('src/components/Dashboard/DasboardActions/DashboardActions.jsx', 'utf8'),
    fs.readFile('src/components/Dashboard/ResumeCard/ResumeCard.jsx', 'utf8'),
  ]);
  for (const route of ['/dashboard/*', '/dashboard2/*', '/portfolio/builder', '/adm/*', '/blog-editor']) {
    assert.match(main, new RegExp(route.replace(/[/*]/g, match => `\\${match}`) + '[^\n]+RequireAuthenticated'), route);
  }
  assert.match(main, /previousUserUid\.current !== nextUid/);
  assert.match(main, /<Dashboard key=\{user\?\.uid \|\| 'unauthenticated'\}/);
  assert.match(main, /<Welcome key=\{user\?\.uid \|\| 'guest'\}/);
  assert.match(dashboard, /generation !== this\._authGeneration/);
  assert.match(dashboard, /role: 'user', firstname: '', lastname: '', membership: '', profile: \{\}/);
  assert.doesNotMatch(dashboard, /active_user|guest_user/);
  assert.match(welcome, /this\.unsubscribeAuth\?\.\(\)/);
  assert.match(welcome, /resetAccountBuilderState/);
  assert.match(welcome, /generation !== this\._authGeneration/);
  assert.match(bootstrap, /globalThis\.caches\.delete/);
  assert.match(covers, /currentCoverItem', typeof data === 'string' \? data : JSON\.stringify\(data\)/);
  assert.doesNotMatch([welcome, dashboard, covers, board, favourites, actions, resumeCard].join('\n'), /localStorage\.getItem\(['"]user['"]\)/);
  assert.match(board, /fire\.auth\(\)\.currentUser\?\.uid !== userId/);
});
