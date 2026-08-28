import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('super admin shell mounts control-plane modules without dropping consumer admin routes', async () => {
  const [admin, sidebar, palette] = await Promise.all([
    fs.readFile('src/components/admin/Admin.jsx', 'utf8'),
    fs.readFile('src/components/admin/sidebar/sidebar.jsx', 'utf8'),
    fs.readFile('src/components/admin/command/AdminCommandPalette.jsx', 'utf8'),
  ]);
  for (const route of ['dashboard', 'audit-logs', 'queues', 'tenants', 'security', 'operations', 'attention', 'operators', 'users', 'settings', 'reviews', 'trustedby', 'messages', 'phrases']) {
    assert.match(admin, new RegExp(`path="${route}"`));
  }
  assert.match(sidebar, /Control Plane/);
  assert.match(sidebar, /Consumer Product/);
  assert.match(sidebar, /Security Events/);
  assert.match(sidebar, /Phrases/);
  assert.match(palette, /\/adm\/security/);
  assert.match(palette, /\/adm\/operations/);
  assert.match(palette, /\/adm\/phrases/);
});

test('tenant registry calls the real Enterprise suspend/reactivate endpoints', async () => {
  const tenants = await fs.readFile('src/components/admin/tenants/PlatformTenants.jsx', 'utf8');
  assert.match(tenants, /\/api\/enterprise\/platform\/tenants\/\$\{encodeURIComponent\(tenant\.id\)\}\/\$\{actionPath\}/);
  assert.match(tenants, /actionPath = nextState === 'SUSPENDED' \? 'suspend' : 'reactivate'/);
  assert.doesNotMatch(tenants, /\/\$\{nextState\.toLowerCase\(\)\}/);
  assert.match(tenants, /decommissionTenant/);
  assert.match(tenants, /isSuperAdmin/);
});

test('command center consumes real platform intelligence and refuses fake trends', async () => {
  const [dashboard, platform] = await Promise.all([
    fs.readFile('src/components/admin/dashboard/dashboard.jsx', 'utf8'),
    fs.readFile('backend/routes/platform.js', 'utf8'),
  ]);
  assert.match(dashboard, /getCommandCenter/);
  assert.match(dashboard, /no trend inferred/);
  assert.match(dashboard, /recommendations/);
  assert.match(platform, /router\.get\('\/command-center'/);
  assert.match(platform, /requireSuperAdmin/);
  assert.match(platform, /nextState: 'DELETING'/);
  assert.doesNotMatch(dashboard, /\+12%|\+15%|Live metrics/);
});

test('platform operations and security modules wire to existing data planes', async () => {
  const [ops, security, api] = await Promise.all([
    fs.readFile('src/components/admin/operations/PlatformOperations.jsx', 'utf8'),
    fs.readFile('src/components/admin/security/PlatformSecurity.jsx', 'utf8'),
    fs.readFile('src/services/platformApi.js', 'utf8'),
  ]);
  assert.match(ops, /getEncryptionStatus/);
  assert.match(ops, /getBackupStatus/);
  assert.match(ops, /setMaintenance/);
  assert.match(ops, /deleteAnnouncement/);
  assert.match(ops, /getEnterpriseQueue/);
  assert.match(ops, /setConfirmAction/);
  assert.match(security, /getSecurityEvents/);
  assert.match(security, /security_audit_logs/);
  assert.match(api, /\/api\/platform\/command-center/);
  assert.match(api, /\/api\/platform\/attention/);
  assert.match(api, /\/api\/platform\/operators/);
  assert.match(ops, /Save changes/);
});

test('users PATCH cannot change SUPER_ADMIN claims', async () => {
  const source = await fs.readFile('backend/index.js', 'utf8');
  assert.match(source, /SUPER_ADMIN_PROTECTED/);
  assert.match(source, /SUPER_ADMIN claims cannot be changed from this API/);
});

test('admin user mutation surface is wired to the authoritative PATCH endpoint', async () => {
  const [route, drawer, ops] = await Promise.all([
    fs.readFile('backend/routes/adminUsers.js', 'utf8'),
    fs.readFile('src/components/admin/usersManager/User360Drawer.jsx', 'utf8'),
    fs.readFile('src/services/api/platform.js', 'utf8'),
  ]);
  // The server owns suspend / role / membership mutations.
  assert.match(route, /router\.patch\('\/:uid'/);
  assert.match(route, /SUPER_ADMIN_PROTECTED/);
  assert.match(route, /SELF_DEMOTION_PROHIBITED/);
  assert.match(route, /revokeRefreshTokens/);
  assert.match(route, /recordAdminAuditLog/);
  // Role assignment must not collapse non-admin roles into ADMIN.
  assert.match(drawer, /setUserRole\(uid, selectedRole/);
  assert.doesNotMatch(drawer, /setUserAdminStatus\(uid, selectedRole/);
  // Suspension stale-target check must honor the caller-provided prior state.
  assert.match(ops, /expectedSuspended/);
  assert.match(ops, /\/api\/admin\/users\/\$\{encodeURIComponent\(userId\)\}/);
});

test('Super Admin destructive routes require MFA in production', async () => {
  const auth = await fs.readFile('backend/security/auth.js', 'utf8');
  const admin = await fs.readFile('src/components/admin/Admin.jsx', 'utf8');
  assert.match(auth, /SUPER_ADMIN_MFA_REQUIRED/);
  assert.match(auth, /sign_in_second_factor/);
  assert.match(admin, /account settings/);
});
