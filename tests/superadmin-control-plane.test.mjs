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
  assert.match(ops, /window\.confirm/);
  assert.match(security, /getSecurityEvents/);
  assert.match(security, /security_audit_logs/);
  assert.match(api, /\/api\/platform\/command-center/);
  assert.match(api, /\/api\/platform\/attention/);
  assert.match(api, /\/api\/platform\/operators/);
});
