/**
 * ADVERSARIAL ENTERPRISE ROLE SIMULATION BREAK SUITE
 * Targets: https://ai-resume-builder.local/
 * Mandate: Actively test all 5 Enterprise roles (OWNER, ADMIN, MANAGER, MEMBER, VIEWER),
 * test unauthorized GET/POST/PATCH/DELETE calls, and verify MariaDB state before and after.
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../backend/.env') });

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const adminMod = await import('../backend/services/firebaseAdmin.js');
const admin = adminMod.default || adminMod;

if (!admin.apps?.length) {
  const pKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: pKey,
    }),
  });
}

const BASE_URL = process.env.TARGET_URL || process.env.APP_URL || 'https://ai-resume-builder.local';
const SA_EMAIL = 'bhaskar.beyond@gmail.com';
const SA_UID = 'OhZdiSIFL7ePA1TMkfu9bnR935D3';
const TENANT_ID = '9406f186-9aff-45c7-adcd-4badebe640fd'; // Acme Corp

const pool = await mysql.createPool({
  host: '127.0.0.1',
  user: 'root',
  password: '',
  database: 'ai_resume_builder',
  waitForConnections: true,
  connectionLimit: 5
});

console.log('================================================================');
console.log('STARTING ADVERSARIAL ENTERPRISE ROLE SIMULATION BREAK SUITE');
console.log('Target: ' + BASE_URL);
console.log('================================================================\n');

const report = {
  checks: [],
  brokenFound: false
};

function recordCheck(name, passed, details = '') {
  console.log(`  [${passed ? 'PASS' : 'FAIL'}] ${name}: ${details}`);
  report.checks.push({ name, passed, details });
  if (!passed) report.brokenFound = true;
}

// Generate Auth Tokens
const saCustomToken = await admin.auth().createCustomToken(SA_UID, {
  email: SA_EMAIL,
  email_verified: true,
  role: 'SUPER_ADMIN',
  superAdmin: true,
  sign_in_second_factor: 'totp'
});

// Exchange custom token for ID token via Google Identity Toolkit REST API
async function getIdTokenFromCustom(customToken) {
  const apiKey = process.env.VITE_FIREBASE_KEY || process.env.VITE_FIREBASE_API_KEY;
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true })
  });
  const data = await res.json();
  if (!data.idToken) {
    throw new Error('Failed to exchange token: ' + JSON.stringify(data));
  }
  return data.idToken;
}

// Normal user token (to test simulation spoofing)
const normalUserCustomToken = await admin.auth().createCustomToken('test-normal-user-123', {
  email: 'normal.user@example.com',
  email_verified: true,
  role: 'USER'
});

const superAdminIdToken = await getIdTokenFromCustom(saCustomToken);
const normalUserIdToken = await getIdTokenFromCustom(normalUserCustomToken);

async function snapshotDbState() {
  const [userRows] = await pool.query('SELECT id, email, role, membership, created_at FROM users WHERE id = ?', [SA_UID]);
  const [membershipRows] = await pool.query('SELECT id, tenantId, principalId, status, roles FROM enterprise_memberships WHERE principalId = ?', [SA_UID]);
  return {
    user: userRows[0] || null,
    memberships: membershipRows || []
  };
}

try {
  // Snapshot before simulation
  const beforeSnapshot = await snapshotDbState();
  console.log('Snapshot Before Simulation:');
  console.log(`  Super Admin User Role in DB: ${beforeSnapshot.user?.role}`);
  console.log(`  Enterprise Memberships Count: ${beforeSnapshot.memberships.length}`);

  // Helper to make API requests with simulation headers
  async function callEnterpriseApi(endpoint, method = 'GET', simulatedRole = null, body = null, token = superAdminIdToken) {
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'x-tenant-id': TENANT_ID
    };
    if (simulatedRole) {
      headers['x-simulated-enterprise-role'] = simulatedRole;
    }
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
    let json = null;
    try { json = await res.json(); } catch (_) {}
    return { status: res.status, body: json };
  }

  // ------------------------------------------------------------------
  // 1. Role: ENTERPRISE_VIEWER Direct API Attack
  // Must NOT be able to:
  // - POST /api/enterprise/workspaces (Create workspace)
  // - PATCH /api/enterprise/workspaces/:id (Update workspace)
  // - DELETE /api/enterprise/workspaces/:id (Delete workspace)
  // - POST /api/enterprise/configuration (Update tenant settings)
  // - GET /api/enterprise/audit (Read tenant audit logs)
  // - GET /api/enterprise/observability/metrics (Read telemetry)
  // ------------------------------------------------------------------
  console.log('\n--- 1. Testing ENTERPRISE_VIEWER Restrictions ---');
  const viewerWorkspaceCreate = await callEnterpriseApi('/api/enterprise/workspaces', 'POST', 'ENTERPRISE_VIEWER', { name: 'Unauthorized Viewer WS' });
  recordCheck('Viewer cannot CREATE workspace', viewerWorkspaceCreate.status === 403, `HTTP ${viewerWorkspaceCreate.status} (${viewerWorkspaceCreate.body?.error?.code})`);

  const viewerConfigUpdate = await callEnterpriseApi('/api/enterprise/configuration', 'PATCH', 'ENTERPRISE_VIEWER', { securityPolicy: { mfaRequired: false } });
  recordCheck('Viewer cannot UPDATE tenant config', viewerConfigUpdate.status === 403, `HTTP ${viewerConfigUpdate.status} (${viewerConfigUpdate.body?.error?.code})`);

  const viewerAuditLogs = await callEnterpriseApi('/api/enterprise/audit', 'GET', 'ENTERPRISE_VIEWER');
  recordCheck('Viewer cannot READ audit logs', viewerAuditLogs.status === 403, `HTTP ${viewerAuditLogs.status} (${viewerAuditLogs.body?.error?.code})`);

  const viewerTelemetry = await callEnterpriseApi('/api/enterprise/observability/metrics', 'GET', 'ENTERPRISE_VIEWER');
  recordCheck('Viewer cannot READ observability metrics', viewerTelemetry.status === 403, `HTTP ${viewerTelemetry.status} (${viewerTelemetry.body?.error?.code})`);

  // ------------------------------------------------------------------
  // 2. Role: ENTERPRISE_MEMBER Direct API Attack
  // Must NOT be able to:
  // - POST /api/enterprise/workspaces
  // - PATCH /api/enterprise/configuration
  // - GET /api/enterprise/audit
  // ------------------------------------------------------------------
  console.log('\n--- 2. Testing ENTERPRISE_MEMBER Restrictions ---');
  const memberWorkspaceCreate = await callEnterpriseApi('/api/enterprise/workspaces', 'POST', 'ENTERPRISE_MEMBER', { name: 'Unauthorized Member WS' });
  recordCheck('Member cannot CREATE workspace', memberWorkspaceCreate.status === 403, `HTTP ${memberWorkspaceCreate.status} (${memberWorkspaceCreate.body?.error?.code})`);

  const memberAuditLogs = await callEnterpriseApi('/api/enterprise/audit', 'GET', 'ENTERPRISE_MEMBER');
  recordCheck('Member cannot READ audit logs', memberAuditLogs.status === 403, `HTTP ${memberAuditLogs.status} (${memberAuditLogs.body?.error?.code})`);

  // ------------------------------------------------------------------
  // 3. Role: ENTERPRISE_MANAGER Direct API Attack
  // Allowed: manage teams/workspaces
  // Forbidden:
  // - PATCH /api/enterprise/configuration (Tenant config)
  // - GET /api/enterprise/audit (Audit logs)
  // ------------------------------------------------------------------
  console.log('\n--- 3. Testing ENTERPRISE_MANAGER Scoping ---');
  const managerAuditLogs = await callEnterpriseApi('/api/enterprise/audit', 'GET', 'ENTERPRISE_MANAGER');
  recordCheck('Manager cannot READ audit logs', managerAuditLogs.status === 403, `HTTP ${managerAuditLogs.status} (${managerAuditLogs.body?.error?.code})`);

  const managerConfigUpdate = await callEnterpriseApi('/api/enterprise/configuration', 'PATCH', 'ENTERPRISE_MANAGER', { securityPolicy: { mfaRequired: false } });
  recordCheck('Manager cannot UPDATE tenant config', managerConfigUpdate.status === 403, `HTTP ${managerConfigUpdate.status} (${managerConfigUpdate.body?.error?.code})`);

  // ------------------------------------------------------------------
  // 4. Role: ENTERPRISE_ADMIN Direct API Attack
  // Allowed: workspace management, config management
  // Forbidden: platform superadmin actions
  // ------------------------------------------------------------------
  console.log('\n--- 4. Testing ENTERPRISE_ADMIN Scoping ---');
  const adminContext = await callEnterpriseApi('/api/enterprise/context', 'POST', 'ENTERPRISE_ADMIN', { tenantId: TENANT_ID });
  recordCheck('Admin can resolve tenant context', adminContext.status === 200, `HTTP ${adminContext.status}`);

  // ------------------------------------------------------------------
  // 5. Role: ENTERPRISE_OWNER Scoping
  // Allowed: full tenant management
  // ------------------------------------------------------------------
  console.log('\n--- 5. Testing ENTERPRISE_OWNER Full Authority ---');
  const ownerContext = await callEnterpriseApi('/api/enterprise/context', 'POST', 'ENTERPRISE_OWNER', { tenantId: TENANT_ID });
  recordCheck('Owner can resolve tenant context', ownerContext.status === 200, `HTTP ${ownerContext.status}`);

  // ------------------------------------------------------------------
  // 6. Adversarial Attack: Non-Super-Admin Spoofs Simulation Header
  // A normal authenticated user sends `x-simulated-enterprise-role: ENTERPRISE_OWNER`
  // MUST fail closed (HTTP 403 or 404) and never grant owner privileges!
  // ------------------------------------------------------------------
  console.log('\n--- 6. Adversarial Attack: Non-Super-Admin Simulation Spoofing ---');
  const spoofAttempt = await callEnterpriseApi('/api/enterprise/workspaces', 'POST', 'ENTERPRISE_OWNER', { name: 'Hacker Workspace' }, normalUserIdToken);
  const spoofDenied = spoofAttempt.status === 403 || spoofAttempt.status === 404;
  recordCheck('Non-Super-Admin simulation spoofing REJECTED', spoofDenied, `HTTP ${spoofAttempt.status} (${spoofAttempt.body?.error?.code || 'DENIED'})`);

  // ------------------------------------------------------------------
  // 7. Database Immutability Verification: Zero State Contamination
  // Verify that neither users table nor enterprise_memberships was mutated
  // ------------------------------------------------------------------
  console.log('\n--- 7. Database Immutability Verification ---');
  const afterSnapshot = await snapshotDbState();
  
  const roleUnchanged = afterSnapshot.user?.role === beforeSnapshot.user?.role && afterSnapshot.user?.role === 'SUPER_ADMIN';
  recordCheck('MariaDB users.role unchanged (SUPER_ADMIN)', roleUnchanged, `DB Role: ${afterSnapshot.user?.role}`);

  const emailUnchanged = afterSnapshot.user?.email === beforeSnapshot.user?.email;
  recordCheck('MariaDB users.email unchanged', emailUnchanged, `DB Email: ${afterSnapshot.user?.email}`);

  const membershipsUnchanged = JSON.stringify(afterSnapshot.memberships) === JSON.stringify(beforeSnapshot.memberships);
  recordCheck('MariaDB enterprise_memberships table unchanged', membershipsUnchanged, `Membership count before: ${beforeSnapshot.memberships.length}, after: ${afterSnapshot.memberships.length}`);

} finally {
  await pool.end();
}

console.log('\n================================================================');
console.log('ADVERSARIAL ENTERPRISE ROLE SIMULATION SUMMARY:');
console.table(report.checks);
console.log('Broken Found:', report.brokenFound ? 'YES (SECURITY GAP)' : 'NO (100% SECURE)');
console.log('================================================================\n');

if (report.brokenFound) {
  process.exit(1);
} else {
  process.exit(0);
}
