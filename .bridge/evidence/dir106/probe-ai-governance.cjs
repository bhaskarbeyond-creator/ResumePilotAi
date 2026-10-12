'use strict';
// DIR-105 audit probe: read the AI governance config rows + the admin guard source.
const fs = require('fs');
const { getPool } = require('./backend/database/mysql');

(async () => {
  const [rows] = await getPool().query(
    "SELECT category, data FROM system_settings WHERE category IN ('ai_quota','ai_providers','ai_policy','public_config')"
  );
  console.log('=== system_settings AI governance rows ===');
  for (const r of rows) {
    let parsed = r.data;
    try { parsed = typeof r.data === 'string' ? JSON.parse(r.data) : r.data; } catch { /* raw */ }
    const safe = JSON.stringify(parsed, (k, v) => /key|secret|token|password/i.test(k) ? '[REDACTED]' : v);
    console.log(`${r.category}: ${String(safe).slice(0, 400)}`);
  }
  const src = fs.readFileSync('backend/security/adminAudit.js', 'utf8');
  const i = src.indexOf('function createAdminAuditMiddleware');
  console.log('\n=== createAdminAuditMiddleware (auth guard?) ===');
  console.log(src.slice(i, i + 1400));
  process.exit(0);
})().catch(e => { console.log('PROBE ERROR', e.message); process.exit(1); });
