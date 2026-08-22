import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read = path => fs.readFile(path, 'utf8');

test('Super Admin API contract keeps /adm platform modules independent of feature-gated enterprise routes', async () => {
  const [tenantView, queueView, platformRoutes, backend, main] = await Promise.all([
    read('src/components/admin/tenants/PlatformTenants.jsx'),
    read('src/components/admin/queues/PlatformQueues.jsx'),
    read('backend/routes/platform.js'),
    read('backend/index.js'),
    read('src/main.jsx'),
  ]);
  assert.match(tenantView, /\/api\/platform\/tenants/);
  assert.doesNotMatch(tenantView, /\/api\/enterprise\/platform\/tenants/);
  assert.match(queueView, /\/api\/platform\/queues/);
  assert.match(platformRoutes, /router\.get\('\/tenants', requireSuperAdmin/);
  assert.match(platformRoutes, /router\.post\('\/tenants', requireSuperAdmin/);
  assert.match(platformRoutes, /CONFIRMATION_REQUIRED/);
  assert.match(backend, /app\.use\('\/api\/platform', platformRouter\)/);
  assert.match(backend, /app\.get\('\/api\/admin\/users'/);
  assert.match(backend, /app\.post\('\/api\/admin\/users', requireSuperAdmin/);
  assert.match(main, /path="\/admin\/\*" element={<Navigate to="\/adm\/dashboard" replace/);
});

test('Super Admin destructive controls use product dialogs with typed confirmation rather than browser-native dialogs', async () => {
  const files = await Promise.all([
    read('src/components/admin/tenants/PlatformTenants.jsx'),
    read('src/components/admin/queues/PlatformQueues.jsx'),
    read('src/components/admin/phrases/Phrases.jsx'),
    read('src/components/admin/settings/AiSettings.jsx'),
    read('src/components/admin/settings/blogSettings.jsx'),
    read('src/components/admin/settings/pagesSettings.jsx'),
    read('src/components/admin/usersManager/UsersManager.jsx'),
  ]);
  const joined = files.join('\n');
  assert.doesNotMatch(joined, /window\.confirm|\balert\(/);
  assert.match(joined, /Type .*to confirm/s);
  assert.match(joined, /AdminDialog/);
});

test('user manager does not expose disabled account-merge or restore controls', async () => {
  const [users, operations] = await Promise.all([
    read('src/components/admin/usersManager/UsersManager.jsx'),
    read('src/firestore/dbOperations.js'),
  ]);
  assert.doesNotMatch(users, /Merge Duplicate|Bulk Merge|Backup History/);
  assert.doesNotMatch(operations, /mergeUserAccounts|bulkMergeDuplicateUsers|restoreMergedUserAccount/);
  assert.match(users, /\/api\/admin\/users\?/);
});

test('audit viewer retains server keyset pagination and URL-backed investigation state', async () => {
  const audit = await read('src/components/admin/audit/AdminAuditLogs.jsx');
  assert.match(audit, /startAfterDocId/);
  assert.match(audit, /useSearchParams/);
  assert.match(audit, /Load more/);
  assert.match(audit, /AdminDialog/);
});

test('SUPER_ADMIN identities cannot be changed or deleted through generic user administration', async () => {
  const [backend, users, editor] = await Promise.all([
    read('backend/index.js'),
    read('src/components/admin/usersManager/UsersManager.jsx'),
    read('src/components/admin/userEdit/UserEdit.jsx'),
  ]);
  assert.match(backend, /SUPER_ADMIN_TARGET_PROTECTED/);
  assert.match(backend, /break-glass retirement procedure/);
  assert.match(users, /role === 'SUPER_ADMIN'/);
  assert.match(editor, /Protected SUPER_ADMIN identity/);
  assert.match(editor, /Only a SUPER_ADMIN can change administrative roles/);
});

test('phrase management is routed through audited server APIs and public consumers use the curated projection', async () => {
  const [phrases, backend, operations] = await Promise.all([
    read('src/components/admin/phrases/Phrases.jsx'),
    read('backend/index.js'),
    read('src/firestore/dbOperations.js'),
  ]);
  assert.match(phrases, /\/api\/admin\/phrases/);
  assert.match(backend, /app\.get\('\/api\/admin\/phrases'/);
  assert.match(backend, /app\.post\('\/api\/admin\/phrases'/);
  assert.match(backend, /app\.get\('\/public\/phrases\.json'/);
  const categoryReader = operations.slice(operations.indexOf('export async function getAllCategories'), operations.indexOf('// ================== REALTIME', operations.indexOf('export async function getAllCategories')));
  assert.match(categoryReader, /\/public\/phrases\.json/);
  assert.doesNotMatch(categoryReader, /fire\.firestore\(\).*categories/s);
});
