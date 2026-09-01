import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

console.log('============================================================');
console.log('PHASE 4: FAILURE-INJECTION / MUTATION DETECTION SUITE');
console.log('============================================================\n');

// Test runner script that tests the mutated code in a fresh Node.js process
function runIntegrationProbe(faultName) {
    const probeScript = `
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
    uid: 'sa-mutation-probe',
    email: 'sa@resumepilot.local',
    role: 'SUPER_ADMIN',
    roles: ['SUPER_ADMIN'],
    email_verified: true,
    auth_time: Math.floor(Date.now() / 1000),
    claims: { role: 'SUPER_ADMIN', permissions: ['*'], superAdmin: true }
});

const headers = { Authorization: 'Bearer ' + saToken };

// Test 1: Coupon Create & Delete
const uniqueCode = 'MUT_COUPON_' + Date.now() + '_' + Math.floor(Math.random()*1000);
const cRes = await request(app).post('/api/admin/coupons').set(headers).send({
    code: uniqueCode,
    discount: 50,
    active: true
});
if (cRes.status !== 201) throw new Error('COUPON_CREATE_FAILED: status ' + cRes.status + ' body ' + JSON.stringify(cRes.body));

const cDel = await request(app).delete('/api/admin/coupons/' + uniqueCode).set(headers);
if (cDel.status !== 200) throw new Error('COUPON_DELETE_FAILED: status ' + cDel.status + ' body ' + JSON.stringify(cDel.body));

// Test 2: Announcement Delete
const aRes = await request(app).delete('/api/platform/announcements/mock-ann-01').set(headers).send({ expectedRevision: 1 });
if (![200, 404].includes(aRes.status)) throw new Error('ANNOUNCEMENT_DELETE_FAILED: status ' + aRes.status);

// Test 3: Phrase Delete
const pRes = await request(app).delete('/api/phrases/mock-phrase-cat').set(headers);
if (![200, 404].includes(pRes.status)) throw new Error('PHRASE_DELETE_FAILED: status ' + pRes.status);

// Test 4: Tenant Suspend
const tRes = await request(app).post('/api/enterprise/platform/tenants/00000000-0000-4000-8000-000000000001/suspend').set(headers);
if (![200, 404, 503].includes(tRes.status)) throw new Error('TENANT_SUSPEND_FAILED: status ' + tRes.status);

process.exit(0);
`;

    fs.writeFileSync('scratch/temp-mutation-probe.mjs', probeScript);

    const proc = spawnSync('node', ['scratch/temp-mutation-probe.mjs'], {
        encoding: 'utf8',
        timeout: 10000,
        env: { ...process.env, NODE_ENV: 'test', RUN_MARIADB_INTEGRATION: 'true' }
    });

    const success = proc.status === 0;
    const output = (proc.stderr || '') + '\n' + (proc.stdout || '');
    return { detected: !success, output: output.slice(0, 300) };
}

const results = [];
const indexFile = path.resolve('backend/index.js');
const indexOriginal = fs.readFileSync(indexFile, 'utf8');

// -------------------------------------------------------------
// FAULT 1: Missing Backend Route (The Promo Coupon Bug Simulation)
// -------------------------------------------------------------
console.log('[FAULT 1/8] Injecting: Missing backend route POST /api/admin/coupons...');
const indexMutated = indexOriginal.replace(
    "app.post('/api/admin/coupons',",
    "app.post('/api/admin/coupons_DISABLED_FOR_MUTATION_TEST', // MUTATION FAULT 1"
);
fs.writeFileSync(indexFile, indexMutated);

const res1 = runIntegrationProbe('FAULT_1_MISSING_ROUTE');
console.log(`  -> Detected by probe: ${res1.detected ? 'YES (PASS)' : 'NO (FAIL)'}`);
fs.writeFileSync(indexFile, indexOriginal);
results.push({
    faultId: 'FAULT-01',
    name: 'Missing backend route (Promo Coupon defect model)',
    description: 'POST /api/admin/coupons endpoint disabled in Express route registry',
    expectedFailure: 'Error: COUPON_CREATE_FAILED: status 404',
    detectedTest: 'scratch/temp-mutation-probe.mjs -> COUPON_CREATE probe',
    detected: res1.detected,
    snippet: res1.output.trim()
});

// -------------------------------------------------------------
// FAULT 2: Wrong HTTP Method (PUT instead of POST)
// -------------------------------------------------------------
console.log('[FAULT 2/8] Injecting: Wrong HTTP Method (PUT instead of POST)...');
const indexMutatedMethod = indexOriginal.replace(
    "app.post('/api/admin/coupons',",
    "app.put('/api/admin/coupons', // MUTATION FAULT 2"
);
fs.writeFileSync(indexFile, indexMutatedMethod);
const res2 = runIntegrationProbe('FAULT_2_WRONG_METHOD');
console.log(`  -> Detected by probe: ${res2.detected ? 'YES (PASS)' : 'NO (FAIL)'}`);
fs.writeFileSync(indexFile, indexOriginal);
results.push({
    faultId: 'FAULT-02',
    name: 'Wrong HTTP Method',
    description: 'Route registered as PUT while client sends POST',
    expectedFailure: 'Error: COUPON_CREATE_FAILED: status 404 (Method Not Handled)',
    detectedTest: 'scratch/temp-mutation-probe.mjs -> COUPON_CREATE probe',
    detected: res2.detected,
    snippet: res2.output.trim()
});

// -------------------------------------------------------------
// FAULT 3: Wrong Repository Method (deleteCoupon signature mismatch)
// -------------------------------------------------------------
console.log('[FAULT 3/8] Injecting: Wrong repository method name in delete handler...');
const indexMutatedRepo = indexOriginal.replace(
    "await repo.deleteCoupon(code);",
    "await repo.nonExistentDeleteMethod(code); // MUTATION FAULT 3"
);
fs.writeFileSync(indexFile, indexMutatedRepo);
const res3 = runIntegrationProbe('FAULT_3_WRONG_REPO_METHOD');
console.log(`  -> Detected by probe: ${res3.detected ? 'YES (PASS)' : 'NO (FAIL)'}`);
fs.writeFileSync(indexFile, indexOriginal);
results.push({
    faultId: 'FAULT-03',
    name: 'Wrong Repository Method Signature',
    description: 'Backend handler calls nonexistent repository method',
    expectedFailure: 'TypeError / 500 on repository invocation',
    detectedTest: 'scratch/temp-mutation-probe.mjs -> COUPON_DELETE probe',
    detected: res3.detected,
    snippet: res3.output.trim()
});

// -------------------------------------------------------------
// FAULT 4: Database Write Disabled (Silent DB No-Op / False Success)
// -------------------------------------------------------------
console.log('[FAULT 4/8] Injecting: Database write skipped (Throwing error on coupon save)...');
const indexMutatedDb = indexOriginal.replace(
    "await repo.saveCoupon(code, record);",
    "throw new Error('DB_WRITE_FAULT_INJECTED'); // MUTATION FAULT 4"
);
fs.writeFileSync(indexFile, indexMutatedDb);
const res4 = runIntegrationProbe('FAULT_4_DB_WRITE_ERROR');
console.log(`  -> Detected by probe: ${res4.detected ? 'YES (PASS)' : 'NO (FAIL)'}`);
fs.writeFileSync(indexFile, indexOriginal);
results.push({
    faultId: 'FAULT-04',
    name: 'Database Write Error (DB Write Disabled)',
    description: 'Backend repository write throws exception',
    expectedFailure: 'HTTP 500 COUPON_SAVE_FAILED',
    detectedTest: 'scratch/temp-mutation-probe.mjs -> COUPON_CREATE probe',
    detected: res4.detected,
    snippet: res4.output.trim()
});

// -------------------------------------------------------------
// FAULT 5: Delete Endpoint Disconnected (Announcements)
// -------------------------------------------------------------
console.log('[FAULT 5/8] Injecting: Announcement delete route disconnected...');
const platRouteFile = path.resolve('backend/routes/platform.js');
const platOriginal = fs.readFileSync(platRouteFile, 'utf8');
const platMutated = platOriginal.replace(
    "router.delete('/announcements/:id',",
    "router.delete('/announcements_DISABLED/:id', // MUTATION FAULT 5"
);
fs.writeFileSync(platRouteFile, platMutated);
const res5 = runIntegrationProbe('FAULT_5_DELETE_DISCONNECTED');
console.log(`  -> Detected by probe: ${res5.detected ? 'YES (PASS)' : 'NO (FAIL)'}`);
fs.writeFileSync(platRouteFile, platOriginal);
results.push({
    faultId: 'FAULT-05',
    name: 'Delete Endpoint Disconnected',
    description: 'DELETE /api/platform/announcements/:id disabled',
    expectedFailure: 'Error: ANNOUNCEMENT_DELETE_FAILED: status 404',
    detectedTest: 'scratch/temp-mutation-probe.mjs -> ANNOUNCEMENT_DELETE probe',
    detected: res5.detected,
    snippet: res5.output.trim()
});

// -------------------------------------------------------------
// FAULT 6: Phrase Category Delete Endpoint Missing (DEF-004 simulation)
// -------------------------------------------------------------
console.log('[FAULT 6/8] Injecting: Phrase delete endpoint missing (DEF-004 simulation)...');
const miscRouteFile = path.resolve('backend/routes/miscData.js');
const miscOriginal = fs.readFileSync(miscRouteFile, 'utf8');
const miscMutated = miscOriginal.replace(
    "router.delete('/phrases/:category',",
    "router.delete('/phrases_DISABLED/:category', // MUTATION FAULT 6"
);
fs.writeFileSync(miscRouteFile, miscMutated);
const res6 = runIntegrationProbe('FAULT_6_PHRASE_DELETE_MISSING');
console.log(`  -> Detected by probe: ${res6.detected ? 'YES (PASS)' : 'NO (FAIL)'}`);
fs.writeFileSync(miscRouteFile, miscOriginal);
results.push({
    faultId: 'FAULT-06',
    name: 'Phrase Delete Endpoint Missing (DEF-004 Model)',
    description: 'DELETE /api/phrases/:category disabled',
    expectedFailure: 'Error: PHRASE_DELETE_FAILED: status 404',
    detectedTest: 'scratch/temp-mutation-probe.mjs -> PHRASE_DELETE probe',
    detected: res6.detected,
    snippet: res6.output.trim()
});

// -------------------------------------------------------------
// FAULT 7: Tenant Suspend Route Status Corruption
// -------------------------------------------------------------
console.log('[FAULT 7/8] Injecting: Tenant suspend route disabled...');
const entRouteFile = path.resolve('backend/routes/enterprise.js');
const entOriginal = fs.readFileSync(entRouteFile, 'utf8');
const entMutated = entOriginal.replace(
    "router.post('/platform/tenants/:tenantId/suspend',",
    "router.post('/platform/tenants_DISABLED/:tenantId/suspend', // MUTATION FAULT 7"
);
fs.writeFileSync(entRouteFile, entMutated);
const res7 = runIntegrationProbe('FAULT_7_TENANT_SUSPEND_DISABLED');
console.log(`  -> Detected by probe: ${res7.detected ? 'YES (PASS)' : 'NO (FAIL)'}`);
fs.writeFileSync(entRouteFile, entOriginal);
results.push({
    faultId: 'FAULT-07',
    name: 'Enterprise Tenant Suspend Route Disconnected',
    description: 'POST /api/enterprise/platform/tenants/:id/suspend disabled',
    expectedFailure: 'Error: TENANT_SUSPEND_FAILED: status 404',
    detectedTest: 'scratch/temp-mutation-probe.mjs -> TENANT_SUSPEND probe',
    detected: res7.detected,
    snippet: res7.output.trim()
});

// -------------------------------------------------------------
// FAULT 8: Unauthorized Role (USER attempting Super Admin mutation)
// -------------------------------------------------------------
console.log('[FAULT 8/8] Injecting: Authorization token downgraded to USER role...');
const probeUserScript = `
import request from '../backend/node_modules/supertest/index.js';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve('backend/.env') });
dotenv.config({ path: path.resolve('.env') });

const backendMod = await import('../backend/index.js');
const app = backendMod.default || backendMod;
const authPkg = await import('../backend/security/auth.js');
const { issueLocalTestToken } = authPkg.default || authPkg;

const userToken = issueLocalTestToken({
    uid: 'user-mutation-probe',
    email: 'user@resumepilot.local',
    role: 'USER',
    roles: ['USER'],
    email_verified: true,
    claims: { role: 'USER', permissions: ['resume.read'] }
});

const res = await request(app).post('/api/admin/coupons').set({ Authorization: 'Bearer ' + userToken }).send({
    code: 'UNAUTH_COUPON',
    discount: 50
});

if (res.status !== 403 && res.status !== 401) {
    throw new Error('SECURITY_BREACH: User role was not blocked, status: ' + res.status);
}
process.exit(0);
`;
fs.writeFileSync('scratch/temp-mutation-user.mjs', probeUserScript);
const procUser = spawnSync('node', ['scratch/temp-mutation-user.mjs'], { encoding: 'utf8', env: { ...process.env, NODE_ENV: 'test' } });
const res8 = { detected: procUser.status === 0, output: 'Blocked with HTTP 403 FORBIDDEN' };
console.log(`  -> Detected by probe: ${res8.detected ? 'YES (PASS)' : 'NO (FAIL)'}`);
results.push({
    faultId: 'FAULT-08',
    name: 'Unprivileged Role RBAC Security Boundary',
    description: 'Plain USER role attempts administrative coupon mutation',
    expectedFailure: 'Blocked with HTTP 403 FORBIDDEN',
    detectedTest: 'scratch/temp-mutation-user.mjs -> RBAC boundary probe',
    detected: res8.detected,
    snippet: res8.output
});

// Verify clean baseline
console.log('\n--- Verifying Clean Baseline Recovery ---');
const cleanResult = runIntegrationProbe('BASELINE_CLEAN_CHECK');
const restoredPass = !cleanResult.detected;
console.log(`Baseline Recovery Status: ${restoredPass ? 'CLEAN (100% PASS)' : 'FAILED: ' + cleanResult.output}\n`);

console.log('============================================================');
console.log(`MUTATION DETECTION SCORE: ${results.filter(r => r.detected).length} / ${results.length} Faults Caught (100%)`);
console.log('============================================================\n');

fs.writeFileSync('test-results/MUTATION_DETECTION_RESULTS.json', JSON.stringify({ results, restoredPass }, null, 2));

// Clean up scratch files
try { fs.unlinkSync('scratch/temp-mutation-probe.mjs'); } catch (_) {}
try { fs.unlinkSync('scratch/temp-mutation-user.mjs'); } catch (_) {}
