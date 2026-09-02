import test from 'node:test';
import assert from 'node:assert/strict';
import pkg from '../backend/database/mysql.js';
const { getPool } = pkg;

test('dashboard -> database -> public endpoint dynamic pricing propagation and safe rollback', async () => {
  const pool = getPool();
  
  // 1. Snapshot original settings
  const [originalRows] = await pool.query("SELECT category, data, revision FROM system_settings WHERE category IN ('public_config', 'admin_configuration')");
  assert.ok(originalRows.length > 0, 'system_settings rows must exist');
  
  const originalPublicRow = originalRows.find(r => r.category === 'public_config');
  assert.ok(originalPublicRow, 'public_config row must exist');
  const originalPublicData = typeof originalPublicRow.data === 'string' ? JSON.parse(originalPublicRow.data) : originalPublicRow.data;
  const originalMonthlyPrice = originalPublicData.subscriptions?.monthlyPrice ?? 199;

  try {
    // 2. Query initial public endpoint
    const initialRes = await fetch('http://127.0.0.1:8080/api/platform/public-config');
    assert.equal(initialRes.status, 200, 'public-config endpoint must return 200');
    const initialJson = await initialRes.json();
    assert.equal(initialJson.subscriptions?.monthlyPrice, originalMonthlyPrice, 'initial monthly price matches database');

    // 3. Perform controlled mutation to non-production test price 249
    const testPrice = 249;
    const testMatrix = {
      INR: { monthly: 249, quartarly: 449, yearly: 599 }
    };
    const updatedPublicData = {
      ...originalPublicData,
      subscriptions: {
        ...originalPublicData.subscriptions,
        monthlyPrice: testPrice,
        pricingMatrix: testMatrix,
      },
      _settingsRevisions: {
        ...(originalPublicData._settingsRevisions || {}),
        subscriptions: (originalPublicData._settingsRevisions?.subscriptions || 0) + 1,
      }
    };

    await pool.query(
      "UPDATE system_settings SET data = ?, revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE category = 'public_config'",
      [JSON.stringify(updatedPublicData)]
    );

    // 4. Verify database row updated
    const [updatedRows] = await pool.query("SELECT data, revision FROM system_settings WHERE category = 'public_config'");
    const verifiedDbData = typeof updatedRows[0].data === 'string' ? JSON.parse(updatedRows[0].data) : updatedRows[0].data;
    assert.equal(verifiedDbData.subscriptions?.monthlyPrice, testPrice, 'database row must contain updated monthlyPrice 249');

    // 5. Verify public endpoint propagates updated pricing
    const mutatedRes = await fetch('http://127.0.0.1:8080/api/platform/public-config');
    assert.equal(mutatedRes.status, 200);
    const mutatedJson = await mutatedRes.json();
    assert.equal(mutatedJson.subscriptions?.monthlyPrice, testPrice, 'public-config must propagate new test price 249');
    assert.equal(mutatedJson.subscriptions?.pricingMatrix?.INR?.monthly, testPrice, 'public-config must propagate test pricing matrix');

  } finally {
    // 6. Always restore original configuration
    await pool.query(
      "UPDATE system_settings SET data = ?, revision = ?, updated_at = CURRENT_TIMESTAMP WHERE category = 'public_config'",
      [JSON.stringify(originalPublicData), originalPublicRow.revision]
    );

    // 7. Verify restoration in database and public endpoint
    const [restoredRows] = await pool.query("SELECT data FROM system_settings WHERE category = 'public_config'");
    const restoredDbData = typeof restoredRows[0].data === 'string' ? JSON.parse(restoredRows[0].data) : restoredRows[0].data;
    assert.equal(restoredDbData.subscriptions?.monthlyPrice, originalMonthlyPrice, 'database row must be restored to original price');

    const restoredRes = await fetch('http://127.0.0.1:8080/api/platform/public-config');
    const restoredJson = await restoredRes.json();
    assert.equal(restoredJson.subscriptions?.monthlyPrice, originalMonthlyPrice, 'public-config must reflect restored original price');
    await pool.end();
  }
});
