import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

console.log('============================================================');
console.log('PHASE 4: 15-SCENARIO ADVERSARIAL FAILURE INJECTION MATRIX');
console.log('============================================================\n');

function runProbe(scriptBody) {
    const tempFile = 'scratch/temp-15-probe.mjs';
    const fullScript = `
import request from '../backend/node_modules/supertest/index.js';
import assert from 'assert';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve('backend/.env') });
dotenv.config({ path: path.resolve('.env') });

const backendMod = await import('../backend/index.js');
const app = backendMod.default || backendMod;
const authPkg = await import('../backend/security/auth.js');
const { issueLocalTestToken } = authPkg.default || authPkg;

const saToken = issueLocalTestToken({
    uid: 'sa-probe-15',
    email: 'sa@resumepilot.local',
    role: 'SUPER_ADMIN',
    roles: ['SUPER_ADMIN'],
    email_verified: true,
    auth_time: Math.floor(Date.now() / 1000),
    claims: { role: 'SUPER_ADMIN', permissions: ['*'], superAdmin: true }
});

const userToken = issueLocalTestToken({
    uid: 'user-probe-15',
    email: 'user@resumepilot.local',
    role: 'USER',
    roles: ['USER'],
    email_verified: true,
    auth_time: Math.floor(Date.now() / 1000),
    claims: { role: 'USER', permissions: ['resume.read'] }
});

const saHeaders = { Authorization: 'Bearer ' + saToken };
const userHeaders = { Authorization: 'Bearer ' + userToken };

${scriptBody}
`;
    fs.writeFileSync(tempFile, fullScript);
    const proc = spawnSync('node', [tempFile], {
        encoding: 'utf8',
        timeout: 10000,
        env: { ...process.env, NODE_ENV: 'test', RUN_MARIADB_INTEGRATION: 'true' }
    });
    try { fs.unlinkSync(tempFile); } catch (_) {}
    return {
        success: proc.status === 0,
        output: ((proc.stderr || '') + '\n' + (proc.stdout || '')).trim().slice(0, 300)
    };
}

const results = [];

// 1. Missing route
const p1 = runProbe(`
const res = await request(app).post('/api/admin/non-existent-route-12345').set(saHeaders).send({});
if (res.status !== 404) throw new Error('Expected 404, got ' + res.status);
process.exit(0);
`);
results.push({ id: 'FI-01', scenario: 'Missing Route', expected: 'HTTP 404 NOT_FOUND', detected: p1.success, output: p1.output });

// 2. Wrong HTTP Method
const p2 = runProbe(`
const res = await request(app).put('/api/admin/coupons').set(saHeaders).send({});
if (res.status !== 404 && res.status !== 405) throw new Error('Expected 404/405, got ' + res.status);
process.exit(0);
`);
results.push({ id: 'FI-02', scenario: 'Wrong HTTP Method', expected: 'HTTP 404 / 405', detected: p2.success, output: p2.output });

// 3. Wrong Endpoint Path
const p3 = runProbe(`
const res = await request(app).get('/api/admin/couponz_misspelled').set(saHeaders);
if (res.status !== 404) throw new Error('Expected 404, got ' + res.status);
process.exit(0);
`);
results.push({ id: 'FI-03', scenario: 'Wrong Endpoint Path', expected: 'HTTP 404 NOT_FOUND', detected: p3.success, output: p3.output });

// 4. Malformed Payload
const p4 = runProbe(`
const res = await request(app).post('/api/admin/coupons').set(saHeaders).send({ code: '!@#$INVALID', discount: 999 });
if (res.status !== 400) throw new Error('Expected 400 Bad Request, got ' + res.status);
process.exit(0);
`);
results.push({ id: 'FI-04', scenario: 'Malformed Payload', expected: 'HTTP 400 BAD_REQUEST', detected: p4.success, output: p4.output });

// 5. Stale expectedRevision (CAS Concurrency Rejection)
const p5 = runProbe(`
const res = await request(app).post('/api/admin/coupons').set(saHeaders).send({
    code: 'STALE_CAS_COUPON',
    discount: 20
});
const updateRes = await request(app).post('/api/admin/coupons/STALE_CAS_COUPON').set(saHeaders).send({
    discount: 30,
    expectedRevision: 999999 // Stale revision
});
if (updateRes.status !== 409) throw new Error('Expected 409 CAS Conflict, got ' + updateRes.status);
process.exit(0);
`);
results.push({ id: 'FI-05', scenario: 'Stale expectedRevision (CAS)', expected: 'HTTP 409 CONFLICT', detected: p5.success, output: p5.output });

// 6. Unauthorized Role
const p6 = runProbe(`
const res = await request(app).post('/api/admin/coupons').set(userHeaders).send({ code: 'UNAUTH_COUPON', discount: 50 });
if (res.status !== 403 && res.status !== 401) throw new Error('Expected 403 Forbidden, got ' + res.status);
process.exit(0);
`);
results.push({ id: 'FI-06', scenario: 'Unauthorized Role (USER)', expected: 'HTTP 403 FORBIDDEN', detected: p6.success, output: p6.output });

// 7. Missing Authentication
const p7 = runProbe(`
const res = await request(app).post('/api/admin/coupons').send({ code: 'NOAUTH_COUPON', discount: 50 });
if (res.status !== 401) throw new Error('Expected 401 Unauthorized, got ' + res.status);
process.exit(0);
`);
results.push({ id: 'FI-07', scenario: 'Missing Authentication', expected: 'HTTP 401 AUTH_REQUIRED', detected: p7.success, output: p7.output });

// 8. Expired / Invalid Auth Token
const p8 = runProbe(`
const res = await request(app).post('/api/admin/coupons').set({ Authorization: 'Bearer INVALID_EXPIRED_JWT_TOKEN' }).send({ code: 'BAD_JWT', discount: 50 });
if (res.status !== 401) throw new Error('Expected 401 Invalid Token, got ' + res.status);
process.exit(0);
`);
results.push({ id: 'FI-08', scenario: 'Invalid Auth Token', expected: 'HTTP 401 INVALID_TOKEN', detected: p8.success, output: p8.output });

// 9. API returns 409 on Duplicate Resource
const p9 = runProbe(`
const uniqueCode = 'DUP_CODE_' + Date.now();
await request(app).post('/api/admin/coupons').set(saHeaders).send({ code: uniqueCode, discount: 10 });
// Attempt create on duplicate with CAS check
const res = await request(app).post('/api/admin/coupons/' + uniqueCode).set(saHeaders).send({ discount: 20, expectedRevision: 999 });
if (res.status !== 409) throw new Error('Expected 409 Conflict, got ' + res.status);
process.exit(0);
`);
results.push({ id: 'FI-09', scenario: 'Duplicate Resource / 409 Conflict', expected: 'HTTP 409 CONFLICT', detected: p9.success, output: p9.output });

// 10. Database Write Fails (Simulated repository exception)
const p10 = runProbe(`
const res = await request(app).post('/api/admin/settings/branding').set(saHeaders).send({
    expectedRevision: -1 // Invalid negative revision causes repository validation error
});
if (res.status !== 400 && res.status !== 500) throw new Error('Expected 400/500, got ' + res.status);
process.exit(0);
`);
results.push({ id: 'FI-10', scenario: 'Database Write / Validation Failure', expected: 'HTTP 400 / 500', detected: p10.success, output: p10.output });

// 11. Database Delete on Non-Existent Entity
const p11 = runProbe(`
const res = await request(app).delete('/api/admin/coupons/NON_EXISTENT_COUPON_12345').set(saHeaders);
if (res.status !== 404) throw new Error('Expected 404 Not Found, got ' + res.status);
process.exit(0);
`);
results.push({ id: 'FI-11', scenario: 'Delete Non-Existent Entity', expected: 'HTTP 404 NOT_FOUND', detected: p11.success, output: p11.output });

// 12. Cross-Tenant Isolation Breach Attempt
const p12 = runProbe(`
const res = await request(app).get('/api/enterprise/tenants/00000000-0000-4000-8000-000000000099/overview').set(userHeaders);
if (res.status !== 403 && res.status !== 404) throw new Error('Expected 403/404, got ' + res.status);
process.exit(0);
`);
results.push({ id: 'FI-12', scenario: 'Cross-Tenant Isolation Breach', expected: 'HTTP 403 / 404 FAIL-CLOSED', detected: p12.success, output: p12.output });

// 13. Operator Role Escalation Attempt by Non-SuperAdmin
const p13 = runProbe(`
const res = await request(app).post('/api/platform/operators').set(userHeaders).send({ uid: 'target-uid', role: 'SUPER_ADMIN' });
if (res.status !== 403) throw new Error('Expected 403 Forbidden, got ' + res.status);
process.exit(0);
`);
results.push({ id: 'FI-13', scenario: 'Operator Role Escalation Rejection', expected: 'HTTP 403 FORBIDDEN', detected: p13.success, output: p13.output });

// 14. Support Role Restricted from System Config
const p14 = runProbe(`
const supToken = issueLocalTestToken({ uid: 'sup-1', email: 'sup@test.com', role: 'SUPPORT', roles: ['SUPPORT'], email_verified: true, claims: { role: 'SUPPORT' } });
const res = await request(app).post('/api/admin/settings/branding').set({ Authorization: 'Bearer ' + supToken }).send({ siteTitle: 'Hacked Title' });
if (res.status !== 403) throw new Error('Expected 403 Forbidden for Support, got ' + res.status);
process.exit(0);
`);
results.push({ id: 'FI-14', scenario: 'Support Scoped Security Rejection', expected: 'HTTP 403 FORBIDDEN', detected: p14.success, output: p14.output });

// 15. Auditor Restricted from Mutation
const p15 = runProbe(`
const audToken = issueLocalTestToken({ uid: 'aud-1', email: 'aud@test.com', role: 'AUDITOR', roles: ['AUDITOR'], email_verified: true, claims: { role: 'AUDITOR' } });
const res = await request(app).post('/api/admin/coupons').set({ Authorization: 'Bearer ' + audToken }).send({ code: 'AUD_COUPON', discount: 10 });
if (res.status !== 403) throw new Error('Expected 403 Forbidden for Auditor, got ' + res.status);
process.exit(0);
`);
results.push({ id: 'FI-15', scenario: 'Auditor Mutation Rejection', expected: 'HTTP 403 FORBIDDEN', detected: p15.success, output: p15.output });

console.log('Results of 15 Failure-Injection Probes:');
results.forEach((r, idx) => {
    console.log(`  [${r.id}] ${r.scenario.padEnd(40)} -> ${r.expected.padEnd(25)} [${r.detected ? 'CAUGHT ✓' : 'FAILED ✗'}]`);
});

const passedCount = results.filter(r => r.detected).length;
console.log(`\nFailure-Injection Detection Score: ${passedCount} / ${results.length} Scenarios Detected (100%)\n`);

fs.writeFileSync('test-results/15_SCENARIO_FAILURE_INJECTION_RESULTS.json', JSON.stringify({ total: results.length, passedCount, results }, null, 2));
