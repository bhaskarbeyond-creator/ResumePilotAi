'use strict';

/**
 * Module 4 & 5 Verification Suite:
 * - Module 5: IP Access Control & Automated Fail2ban Rate-Limit Jail (FP-A07)
 * - Module 4: Operator JTI Token Blacklisting & Immediate Invalidation (FP-A06)
 *
 * Verifies live MariaDB integration against `airesume_test`.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const express = require('express');
const request = require('supertest');
const crypto = require('crypto');

process.env.NODE_ENV = 'test';
process.env.RUN_MARIADB_INTEGRATION = 'true';
process.env.MARIADB_TEST_ALLOW_RESET = 'true';
process.env.SESSION_REVOCATION_IN_TEST = 'true';
process.env.DB_NAME = process.env.DB_NAME || 'airesume_test';

const { getPool } = require('../database/mysql');
const ipAccessService = require('../services/ipAccessService');
const { ipFilter } = require('../middleware/ipFilter');
const { platformRouter } = require('../routes/platform');
const sessionRevocation = require('../security/sessionRevocation');
const { requireAuth, issueLocalTestToken } = require('../security/auth');

function createTestApp() {
  const app = express();
  app.use(express.json());

  // Attach IP Filter middleware
  app.use(ipFilter);

  // Mount platform router
  app.use('/api/platform', platformRouter);

  // Protected test route
  app.get('/api/test-protected', requireAuth, (req, res) => {
    return res.json({ success: true, user: req.user });
  });

  // Public test route
  app.get('/api/test-public', (_req, res) => {
    return res.json({ success: true, message: 'public ok' });
  });

  return app;
}

test('Module 5: IP Access Control, CIDR Range Matching & Automated Rate-Limit Jail', async (t) => {
  const pool = getPool();
  const testSubnet = '198.51.100.0/24';
  const testBlockedIp = '198.51.100.42';
  const testOutsideIp = '198.51.101.42';
  const testJailIp = '203.0.113.88';
  let createdRuleId = null;

  t.before(async () => {
    ipAccessService.resetForTests();
    sessionRevocation.resetForTests();
    await pool.query("DELETE FROM ip_access_rules WHERE ip_or_cidr LIKE '198.51.%' OR ip_or_cidr LIKE '203.0.%'");
  });

  t.after(async () => {
    await pool.query("DELETE FROM ip_access_rules WHERE ip_or_cidr LIKE '198.51.%' OR ip_or_cidr LIKE '203.0.%'");
    ipAccessService.resetForTests();
    sessionRevocation.resetForTests();
  });

  await t.test('1. Bitwise CIDR parsing and range calculation for IPv4', () => {
    const parsedSubnet = ipAccessService.parseIpOrCidr('192.168.1.0/24');
    assert.ok(parsedSubnet);
    assert.equal(parsedSubnet.type, 'v4');
    assert.equal(parsedSubnet.isCidr, true);
    assert.equal(parsedSubnet.prefixLen, 24);

    const parsedSingle = ipAccessService.parseIpOrCidr('10.20.30.40');
    assert.ok(parsedSingle);
    assert.equal(parsedSingle.isCidr, false);
    assert.equal(parsedSingle.prefixLen, 32);

    const parsedInvalid = ipAccessService.parseIpOrCidr('invalid-ip-string');
    assert.equal(parsedInvalid, null);
  });

  await t.test('2. Unauthenticated request to /api/platform/ip-rules is rejected with 401', async () => {
    const app = createTestApp();
    const res = await request(app).get('/api/platform/ip-rules');
    assert.equal(res.status, 401);
  });

  await t.test('3. Super Admin adds CIDR /24 DENY rule into MariaDB ip_access_rules', async () => {
    const app = createTestApp();
    const adminToken = issueLocalTestToken({ uid: 'superadmin_test', email: 'superadmin@test.local', role: 'SUPER_ADMIN', auth_time: Math.floor(Date.now() / 1000) });

    const res = await request(app)
      .post('/api/platform/ip-rules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        ipOrCidr: testSubnet,
        ruleType: 'DENY',
        reason: 'Automated test CIDR block',
        expiresInMinutes: 60,
      });

    assert.equal(res.status, 200);
    assert.ok(res.body.success);
    assert.ok(res.body.rule?.id);
    createdRuleId = res.body.rule.id;

    // Verify row was persisted in live MariaDB
    const [rows] = await pool.query('SELECT * FROM ip_access_rules WHERE id = ?', [createdRuleId]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].ip_or_cidr, testSubnet);
    assert.equal(rows[0].rule_type, 'DENY');
  });

  await t.test('4. Request originating from blocked subnet IP returns HTTP 403 Forbidden', async () => {
    const app = createTestApp();
    // Simulate reverse-proxy client IP via X-Forwarded-For
    const res = await request(app)
      .get('/api/test-public')
      .set('X-Forwarded-For', testBlockedIp);

    assert.equal(res.status, 403);
    assert.equal(res.body.error?.code, 'IP_ACCESS_DENIED');
    assert.equal(res.body.error?.ruleType, 'DENY');
    assert.equal(res.body.error?.clientIp, testBlockedIp);
  });

  await t.test('5. Request from outside subnet succeeds with HTTP 200 OK', async () => {
    const app = createTestApp();
    const res = await request(app)
      .get('/api/test-public')
      .set('X-Forwarded-For', testOutsideIp);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
  });

  await t.test('6. Explicit ALLOW rule takes precedence over broader DENY subnet', async () => {
    const app = createTestApp();
    const adminToken = issueLocalTestToken({ uid: 'superadmin_test', email: 'superadmin@test.local', role: 'SUPER_ADMIN', auth_time: Math.floor(Date.now() / 1000) });

    // Whitelist specific IP inside the /24 subnet
    const resAllow = await request(app)
      .post('/api/platform/ip-rules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        ipOrCidr: testBlockedIp,
        ruleType: 'ALLOW',
        reason: 'Explicit VIP whitelist exemption',
      });
    assert.equal(resAllow.status, 200);

    // Now testBlockedIp should succeed despite falling inside testSubnet
    const res = await request(app)
      .get('/api/test-public')
      .set('X-Forwarded-For', testBlockedIp);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);

    // Clean up allow rule
    await request(app)
      .delete(`/api/platform/ip-rules/${resAllow.body.rule.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
  });

  await t.test('7. Automated Fail2ban rate-limit jail triggers on 10 failed auth events in 60s', async () => {
    const app = createTestApp();

    // Generate 9 failed attempts -> should not be jailed yet
    for (let i = 1; i <= 9; i++) {
      const resFail = await ipAccessService.recordAuthFailure(testJailIp, { reason: `Bad password attempt ${i}` });
      assert.equal(resFail.jailed, false);
      assert.equal(resFail.attempts, i);
    }

    // 10th attempt triggers jail
    const resJail = await ipAccessService.recordAuthFailure(testJailIp, { reason: 'Final brute force threshold' });
    assert.equal(resJail.jailed, true);
    assert.equal(resJail.ip, testJailIp);
    assert.ok(resJail.expiresAt);

    // Verify row persisted in MariaDB
    const [jailRows] = await pool.query('SELECT * FROM ip_access_rules WHERE ip_or_cidr = ? AND rule_type = "JAIL"', [testJailIp]);
    assert.equal(jailRows.length, 1);
    assert.equal(jailRows[0].rule_type, 'JAIL');

    // Subsequent HTTP request from testJailIp must now be rejected with 403
    const resBlocked = await request(app)
      .get('/api/test-public')
      .set('X-Forwarded-For', testJailIp);

    assert.equal(resBlocked.status, 403);
    assert.equal(resBlocked.body.error?.code, 'IP_ACCESS_DENIED');
    assert.equal(resBlocked.body.error?.ruleType, 'JAIL');
  });

  await t.test('8. Admin deletes rule / unjails IP restoring normal access', async () => {
    const app = createTestApp();
    const adminToken = issueLocalTestToken({ uid: 'superadmin_test', email: 'superadmin@test.local', role: 'SUPER_ADMIN', auth_time: Math.floor(Date.now() / 1000) });

    // Find jail rule id
    const [jailRows] = await pool.query('SELECT id FROM ip_access_rules WHERE ip_or_cidr = ?', [testJailIp]);
    assert.ok(jailRows.length > 0);

    const resDel = await request(app)
      .delete(`/api/platform/ip-rules/${jailRows[0].id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(resDel.status, 200);
    assert.equal(resDel.body.success, true);

    // Now request from testJailIp succeeds immediately
    const resRestored = await request(app)
      .get('/api/test-public')
      .set('X-Forwarded-For', testJailIp);

    assert.equal(resRestored.status, 200);
  });
});

test('Module 4: JTI Token Blacklisting & Immediate Session Revocation', async (t) => {
  const pool = getPool();
  const testJti = `jti_${crypto.randomUUID()}`;
  const testUid = `op_user_${crypto.randomUUID()}`;

  t.before(async () => {
    sessionRevocation.resetForTests();
  });

  t.after(async () => {
    await pool.query('DELETE FROM revoked_sessions WHERE user_id = ?', [testJti]);
    sessionRevocation.resetForTests();
  });

  await t.test('1. Valid token with unique JTI is authorized on protected routes', async () => {
    const app = createTestApp();
    const token = issueLocalTestToken({
      uid: testUid,
      email: 'operator@test.local',
      role: 'ADMIN',
      jti: testJti,
      iat: Math.floor(Date.now() / 1000),
      auth_time: Math.floor(Date.now() / 1000),
    });

    const res = await request(app)
      .get('/api/test-protected')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.user?.uid, testUid);
  });

  await t.test('2. Revoking specific JTI persists into MariaDB and immediately invalidates token with 401', async () => {
    const app = createTestApp();
    const token = issueLocalTestToken({
      uid: testUid,
      email: 'operator@test.local',
      role: 'ADMIN',
      jti: testJti,
      iat: Math.floor(Date.now() / 1000),
      auth_time: Math.floor(Date.now() / 1000),
    });

    // Revoke token via JTI
    const revocation = await sessionRevocation.revokeTokenJti({
      jti: testJti,
      reason: 'Compromised device token revocation',
      expiresInSeconds: 3600,
    });

    assert.equal(revocation.jti, testJti);
    assert.equal(revocation.scope, 'JTI');

    // Verify row persisted in MariaDB revoked_sessions
    const [rows] = await pool.query('SELECT * FROM revoked_sessions WHERE user_id = ? AND scope = "JTI"', [testJti]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].reason, 'Compromised device token revocation');

    // Immediate next request using this token MUST return 401 SESSION_REVOKED
    const res = await request(app)
      .get('/api/test-protected')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 401);
    assert.equal(res.body.error?.code, 'SESSION_REVOKED');
  });
});
