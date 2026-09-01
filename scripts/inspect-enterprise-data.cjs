require('dotenv').config({ path: './backend/.env' });
const mysql = require('mysql2/promise');

(async () => {
  const db = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'root',
    database: 'ai_resume_builder'
  });

  console.log('=== ENTERPRISE DATA CENSUS ===');
  const [tenants] = await db.query('SELECT id, displayName, slug, isolationTier, lifecycleState, created_at FROM enterprise_tenants');
  console.log('\nTenants (' + tenants.length + '):', tenants);

  const [workspaces] = await db.query('SELECT id, tenantId, name, isDefault, lifecycleState FROM enterprise_workspaces');
  console.log('\nWorkspaces (' + workspaces.length + '):', workspaces);

  const [memberships] = await db.query('SELECT id, tenantId, principalId, roles, status, created_at FROM enterprise_memberships');
  console.log('\nMemberships (' + memberships.length + '):', memberships);

  const [principalTenants] = await db.query('SELECT * FROM enterprise_principal_tenants');
  console.log('\nPrincipal Tenants (' + principalTenants.length + '):', principalTenants);

  const saUid = 'OhZdiSIFL7ePA1TMkfu9bnR935D3';
  const [saMemberships] = await db.query('SELECT * FROM enterprise_memberships WHERE principalId = ?', [saUid]);
  console.log('\nSuper Admin Memberships:', saMemberships);

  await db.end();
})();
