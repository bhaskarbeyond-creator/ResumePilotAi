import { createRequire } from 'node:module';
import https from 'node:https';
import path from 'node:path';

const require = createRequire(import.meta.url);
const admin = require('../backend/services/firebaseAdmin');
const dotenv = require('../backend/node_modules/dotenv');

dotenv.config({ path: path.resolve('.env') });
dotenv.config({ path: path.resolve('backend/.env') });

// Fail closed: the Firebase web API key must come from the environment and is
// never hardcoded in tracked sources (security-static credential scan).
const webApiKey = process.env.VITE_FIREBASE_KEY;
if (!webApiKey) {
  console.error('VITE_FIREBASE_KEY is required (backend/.env or environment) to run this live audit.');
  process.exit(2);
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

function request(urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'airesume.projectdemo.guru',
      port: 443,
      path: urlPath,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: 15000,
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        let parsed = body;
        try { parsed = JSON.parse(body); } catch {}
        resolve({ status: res.statusCode, headers: res.headers, body: parsed });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    if (options.body) req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    req.end();
  });
}

function exchangeCustomTokenForIdToken(customToken) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ token: customToken, returnSecureToken: true });
    const req = https.request({
      hostname: 'identitytoolkit.googleapis.com',
      port: 443,
      path: `/v1/accounts:signInWithCustomToken?key=${webApiKey}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout: 10000,
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (json.idToken) resolve(json.idToken);
          else reject(new Error(`Token exchange failed: ${body}`));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function runTenantIsolationAudit() {
  console.log('================================================================');
  console.log('AUDIT 2: CONTROLLED TENANT A / TENANT B ADVERSARIAL AUDIT');
  console.log('================================================================\n');

  const testUidA = 'controlled-tenant-a-lead-2026';
  const testEmailA = 'tenant-a-audit@projectdemo.guru';
  const testUidB = 'controlled-tenant-b-attacker-2026';
  const testEmailB = 'tenant-b-audit@projectdemo.guru';
  const supportUid = 'controlled-support-identity-2026';
  const supportEmail = 'support-auditor@projectdemo.guru';

  let idTokenA, idTokenB;
  const attackResults = [];

  try {
    // 1. Setup Tenant A and Tenant B users in Firebase Auth
    try { await admin.auth().deleteUser(testUidA); } catch {}
    try { await admin.auth().deleteUser(testUidB); } catch {}
    try { await admin.auth().deleteUser(supportUid); } catch {}

    await admin.auth().createUser({ uid: testUidA, email: testEmailA, emailVerified: true, displayName: 'Tenant A Director' });
    await admin.auth().createUser({ uid: testUidB, email: testEmailB, emailVerified: true, displayName: 'Tenant B Operator' });
    await admin.auth().createUser({ uid: supportUid, email: supportEmail, emailVerified: true, displayName: 'Support Auditor' });
    await admin.auth().setCustomUserClaims(supportUid, { role: 'SUPPORT' });

    const customTokenA = await admin.auth().createCustomToken(testUidA, { email: testEmailA, email_verified: true });
    idTokenA = await exchangeCustomTokenForIdToken(customTokenA);
    const authHeadersA = { Authorization: `Bearer ${idTokenA}`, 'Content-Type': 'application/json' };

    const customTokenB = await admin.auth().createCustomToken(testUidB, { email: testEmailB, email_verified: true });
    idTokenB = await exchangeCustomTokenForIdToken(customTokenB);
    const authHeadersB = { Authorization: `Bearer ${idTokenB}`, 'Content-Type': 'application/json' };

    // 2. Resolve Tenant A context and create assets
    console.log('[Setup] Resolving Tenant A context and creating assets...');
    const ctxA = await request('/api/enterprise/context', { headers: authHeadersA });
    const tenantIdA = ctxA.body?.context?.tenantId;
    const workspaceIdA = ctxA.body?.context?.workspaceId;

    const ctxB = await request('/api/enterprise/context', { headers: authHeadersB });
    const tenantIdB = ctxB.body?.context?.tenantId;
    const workspaceIdB = ctxB.body?.context?.workspaceId;

    console.log(`  Tenant A: ${tenantIdA} (WS: ${workspaceIdA})`);
    console.log(`  Tenant B: ${tenantIdB} (WS: ${workspaceIdB})\n`);

    // Tenant A creates a Confidential Resource
    const resA = await request('/api/enterprise/resources', {
      method: 'POST',
      headers: authHeadersA,
      body: { resourceType: 'DOCUMENT', classification: 'CONFIDENTIAL', name: 'Tenant A Secret Strategy', payload: { secretPlan: 'Project X', budget: 1000000 } }
    });
    const resourceIdA = resA.body?.resource?.id;
    console.log(`  Created Tenant A Confidential Resource: ${resourceIdA}`);

    // Tenant A creates a Workspace
    const wsA = await request('/api/enterprise/workspaces', {
      method: 'POST',
      headers: authHeadersA,
      body: { name: 'Tenant A Private Vault' }
    });
    const customWorkspaceIdA = wsA.body?.workspace?.id;
    console.log(`  Created Tenant A Custom Workspace: ${customWorkspaceIdA}`);

    // Tenant A creates a Team
    const teamA = await request('/api/enterprise/teams', {
      method: 'POST',
      headers: authHeadersA,
      body: { name: 'Tenant A Executive Team' }
    });
    const teamIdA = teamA.body?.team?.id;
    console.log(`  Created Tenant A Team: ${teamIdA}`);

    // Tenant A creates a Service Account
    const saA = await request('/api/enterprise/service-accounts', {
      method: 'POST',
      headers: authHeadersA,
      body: { displayName: 'Tenant A Ingestion Bot', scopes: ['resource.read', 'resource.create'] }
    });
    const apiKeyA = saA.body?.apiKey;
    const saIdA = saA.body?.serviceAccount?.id;
    console.log(`  Created Tenant A Service Account: ${saIdA}`);

    // Tenant A creates a Support Grant
    const sgA = await request('/api/enterprise/support-grants', {
      method: 'POST',
      headers: authHeadersA,
      body: { supportSubjectId: supportUid, reason: 'Tenant A Audit Session', expiresInMinutes: 30, scopes: ['resource.read'] }
    });
    const grantIdA = sgA.body?.grant?.id;
    console.log(`  Created Tenant A Support Grant: ${grantIdA}\n`);

    // -------------------------------------------------------------
    // ADVERSARIAL PROBES BY TENANT B
    // -------------------------------------------------------------
    console.log('[Adversarial Probe 1] Tenant B attempts to read Tenant A resource directly...');
    const p1 = await request(`/api/enterprise/resources/${resourceIdA}`, { headers: authHeadersB });
    attackResults.push({ probe: '1. Cross-Tenant Resource Read', status: p1.status, expected: '404/403', pass: p1.status === 404 || p1.status === 403 });
    console.log(`  Result: Status ${p1.status} (${p1.body?.error?.code || 'OK'})`);

    console.log('[Adversarial Probe 2] Tenant B attempts to modify Tenant A resource...');
    const p2 = await request(`/api/enterprise/resources/${resourceIdA}`, {
      method: 'PATCH',
      headers: authHeadersB,
      body: { expectedRevision: 1, payload: { tampered: true } }
    });
    attackResults.push({ probe: '2. Cross-Tenant Resource Modify', status: p2.status, expected: '404/403', pass: p2.status === 404 || p2.status === 403 });
    console.log(`  Result: Status ${p2.status} (${p2.body?.error?.code || 'OK'})`);

    console.log('[Adversarial Probe 3] Tenant B attempts to delete Tenant A resource...');
    const p3 = await request(`/api/enterprise/resources/${resourceIdA}`, { method: 'DELETE', headers: authHeadersB });
    attackResults.push({ probe: '3. Cross-Tenant Resource Delete', status: p3.status, expected: '404/403', pass: p3.status === 404 || p3.status === 403 });
    console.log(`  Result: Status ${p3.status} (${p3.body?.error?.code || 'OK'})`);

    console.log('[Adversarial Probe 4] Tenant B lists workspaces with spoofed X-Tenant-Id: Tenant A...');
    const p4 = await request('/api/enterprise/workspaces', {
      headers: { ...authHeadersB, 'X-Tenant-Id': tenantIdA }
    });
    const returnedWorkspaces = p4.body?.workspaces || [];
    const hasAWorkspace = returnedWorkspaces.some(w => w.id === customWorkspaceIdA);
    attackResults.push({ probe: '4. Spoofed X-Tenant-Id Workspace List', status: p4.status, expected: 'Zero Tenant A WS', pass: !hasAWorkspace });
    console.log(`  Result: Returned ${returnedWorkspaces.length} workspaces, Tenant A workspace present: ${hasAWorkspace}`);

    console.log('[Adversarial Probe 5] Tenant B lists teams with spoofed X-Tenant-Id: Tenant A...');
    const p5 = await request('/api/enterprise/teams', {
      headers: { ...authHeadersB, 'X-Tenant-Id': tenantIdA }
    });
    const returnedTeams = p5.body?.teams || [];
    const hasATeam = returnedTeams.some(t => t.id === teamIdA);
    attackResults.push({ probe: '5. Spoofed X-Tenant-Id Teams List', status: p5.status, expected: 'Zero Tenant A Team', pass: !hasATeam });
    console.log(`  Result: Returned ${returnedTeams.length} teams, Tenant A team present: ${hasATeam}`);

    console.log('[Adversarial Probe 6] Tenant B attempts to revoke Tenant A Service Account...');
    const p6 = await request(`/api/enterprise/service-accounts/${saIdA}/revoke`, {
      method: 'POST',
      headers: authHeadersB
    });
    attackResults.push({ probe: '6. Cross-Tenant Revoke Service Account', status: p6.status, expected: '404/403', pass: p6.status === 404 || p6.status === 403 });
    console.log(`  Result: Status ${p6.status} (${p6.body?.error?.code || 'OK'})`);

    console.log('[Adversarial Probe 7] Tenant B attempts to revoke Tenant A Support Grant...');
    const p7 = await request(`/api/enterprise/support-grants/${grantIdA}/revoke`, {
      method: 'POST',
      headers: authHeadersB
    });
    attackResults.push({ probe: '7. Cross-Tenant Revoke Support Grant', status: p7.status, expected: '404/403', pass: p7.status === 404 || p7.status === 403 });
    console.log(`  Result: Status ${p7.status} (${p7.body?.error?.code || 'OK'})`);

    console.log('[Adversarial Probe 8] Tenant B reads audit log with spoofed X-Tenant-Id: Tenant A...');
    const p8 = await request('/api/enterprise/audit?limit=20', {
      headers: { ...authHeadersB, 'X-Tenant-Id': tenantIdA }
    });
    const auditEvents = p8.body?.events || [];
    const hasAEvent = auditEvents.some(e => e.tenantId === tenantIdA);
    attackResults.push({ probe: '8. Cross-Tenant Audit Log Leakage', status: p8.status, expected: 'Zero Tenant A Events', pass: !hasAEvent });
    console.log(`  Result: Returned ${auditEvents.length} events, Tenant A event present: ${hasAEvent}`);

    console.log('[Adversarial Probe 9] Injected cross-tenant body { tenantId: Tenant A } on Tenant B resource create...');
    const p9 = await request('/api/enterprise/resources', {
      method: 'POST',
      headers: authHeadersB,
      body: { tenantId: tenantIdA, resourceType: 'DOCUMENT', classification: 'CONFIDENTIAL', name: 'Trojan Resource in Tenant A', payload: { malicious: true } }
    });
    const createdTenantId = p9.body?.resource?.tenantId;
    const bodyInjectionBlocked = p9.status === 404 || p9.status === 403 || (createdTenantId !== tenantIdA && createdTenantId === tenantIdB);
    attackResults.push({ probe: '9. Body tenantId Injection Rejection', status: p9.status, expected: '404/403 Rejection', pass: bodyInjectionBlocked });
    console.log(`  Result: Status ${p9.status} (${p9.body?.error?.code || 'BLOCKED'})`);

    console.log('[Adversarial Probe 10] M2M API Key A used with manipulated X-Tenant-Id: Tenant B...');
    const p10 = await request('/api/enterprise/m2m/context', {
      headers: { 'X-API-Key': apiKeyA, 'X-Tenant-Id': tenantIdB }
    });
    const m2mCrossTenantBlocked = p10.status === 404 || p10.body?.context?.tenantId === tenantIdA;
    attackResults.push({ probe: '10. M2M Cross-Tenant Header Rejection', status: p10.status, expected: '404/Bound to A', pass: m2mCrossTenantBlocked });
    console.log(`  Result: Status ${p10.status} (${p10.body?.error?.code || 'Bound to Tenant A'})`);

    console.log('\n================================================================');
    console.log('AUDIT 2 SUMMARY MATRIX (10 ADVERSARIAL ATTACKS):');
    console.table(attackResults);
    console.log('================================================================\n');

  } finally {
    try { await admin.auth().deleteUser(testUidA); } catch {}
    try { await admin.auth().deleteUser(testUidB); } catch {}
    try { await admin.auth().deleteUser(supportUid); } catch {}
  }
}

runTenantIsolationAudit().catch(console.error);
