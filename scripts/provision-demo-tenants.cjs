require('dotenv').config({ path: './backend/.env' });
const path = require('path');
const { getPool } = require(path.resolve(__dirname, '../backend/database/mysql.js'));
const admin = require(path.resolve(__dirname, '../backend/services/firebaseAdmin.js'));
const { createTenantService } = require(path.resolve(__dirname, '../backend/enterprise/tenantService.js'));
const { getRepository } = require(path.resolve(__dirname, '../backend/repositories/index.js'));

(async () => {
  const pool = getPool();
  const repo = getRepository();
  const tenantService = createTenantService({ pool, admin, repository: repo });

  const saUser = {
    uid: 'OhZdiSIFL7ePA1TMkfu9bnR935D3',
    email: 'bhaskar.beyond@gmail.com',
    emailVerified: true,
    claims: { role: 'SUPER_ADMIN', superAdmin: true, permissions: ['*'] }
  };

  const demoOrgs = [
    { displayName: 'Acme Corporation', slug: 'acme-corp', isolationTier: 'ENTERPRISE' },
    { displayName: 'Global Tech Industries', slug: 'global-tech', isolationTier: 'STANDARD' }
  ];

  for (const org of demoOrgs) {
    try {
      const result = await tenantService.provisionTenant({
        user: saUser,
        input: org,
        requestId: 'script-provision-' + Date.now()
      });
      console.log(`Provisioned ${org.displayName}:`, result.tenant.id, result.tenant.slug);
    } catch (e) {
      if (e.code === 'TENANT_SLUG_CONFLICT') {
        console.log(`Tenant ${org.displayName} (${org.slug}) already exists.`);
      } else {
        console.error(`Failed to provision ${org.displayName}:`, e.message);
      }
    }
  }

  const [tenants] = await pool.query('SELECT id, displayName, slug, isolationTier, lifecycleState FROM enterprise_tenants');
  console.log('\nCurrent Active Tenants in MariaDB:');
  console.table(tenants);

  process.exit(0);
})();
