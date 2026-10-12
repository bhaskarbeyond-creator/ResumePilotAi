'use strict';
// DIR-106: list organization memberships that could serve as a live Rule-A proof.
const { getPool } = require('./backend/database/mysql');

(async () => {
  const [rows] = await getPool().query(
    `SELECT m.principalId, m.tenantId, m.status, m.personalTenant, t.lifecycleState,
            c.quotaPolicy
       FROM enterprise_memberships m
       JOIN enterprise_tenants t ON t.id = m.tenantId
  LEFT JOIN enterprise_tenant_configurations c ON c.tenantId = m.tenantId
      WHERE m.personalTenant = 0`
  );
  console.log('org memberships:', rows.length);
  for (const r of rows) {
    console.log(`  ${r.principalId} @ ${r.tenantId} status=${r.status} tenant=${r.lifecycleState} quota=${String(r.quotaPolicy).slice(0, 90)}`);
  }
  const [users] = await getPool().query('SELECT id, email FROM users LIMIT 6');
  console.log('users sample:', JSON.stringify(users));
  process.exit(0);
})().catch(e => { console.log('PROBE ERROR', e.message); process.exit(1); });
