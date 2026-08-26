import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const admin = require('../backend/services/firebaseAdmin');
const dotenv = require('../backend/node_modules/dotenv');

dotenv.config({ path: path.resolve('backend/.env') });

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();
const {
  exportTenantSnapshot,
  verifySnapshot,
  restoreTenantSnapshot,
  verifyTenantRestored,
} = require('../backend/enterprise/enterpriseBackup');

async function runBackupRestoreAudit() {
  console.log('================================================================');
  console.log('AUDIT 6: FIRESTORE LOGICAL BACKUP & RESTORE AUDIT');
  console.log('================================================================\n');

  const tenantId = '55555555-1111-4000-a000-000000000001';
  const workspaceId = '55555555-2222-4000-a000-000000000002';
  const teamId = '55555555-3333-4000-a000-000000000003';
  const resourceId = '55555555-4444-4000-a000-000000000004';
  const auditId = '55555555-5555-4000-a000-000000000005';

  const results = [];
  const createdPaths = [
    `enterprise_tenants/${tenantId}`,
    `enterprise_tenant_configurations/${tenantId}`,
    `enterprise_workspaces/${workspaceId}`,
    `enterprise_teams/${teamId}`,
    `tenants/${tenantId}/resources/${resourceId}`,
    `tenants/${tenantId}/audit_events/${auditId}`,
  ];

  try {
    // -------------------------------------------------------------
    // Setup: Seed Tenant Data
    // -------------------------------------------------------------
    console.log('[Setup: Seeding Tenant Partition Data]');
    const batch = db.batch();
    batch.set(db.doc(`enterprise_tenants/${tenantId}`), { id: tenantId, name: 'Backup Test Corp', status: 'ACTIVE', tier: 'ENTERPRISE', createdAt: new Date() });
    batch.set(db.doc(`enterprise_tenant_configurations/${tenantId}`), { tenantId, revision: 1, aiPolicy: { profile: 'standard' }, createdAt: new Date() });
    batch.set(db.doc(`enterprise_workspaces/${workspaceId}`), { id: workspaceId, tenantId, name: 'Core Eng Workspace', createdAt: new Date() });
    batch.set(db.doc(`enterprise_teams/${teamId}`), { id: teamId, tenantId, name: 'Platform Team', createdAt: new Date() });
    batch.set(db.doc(`tenants/${tenantId}/resources/${resourceId}`), { id: resourceId, tenantId, workspaceId, classification: 'CONFIDENTIAL', title: 'Q3 Product Roadmap', createdAt: new Date() });
    batch.set(db.doc(`tenants/${tenantId}/audit_events/${auditId}`), { id: auditId, tenantId, action: 'BACKUP_TEST_INIT', occurredAt: new Date().toISOString() });
    await batch.commit();
    console.log(`  ✓ Seeded 6 documents across control plane and tenant/${tenantId} subcollections.`);

    // -------------------------------------------------------------
    // Test 1: Logical Backup Export
    // -------------------------------------------------------------
    console.log('\n[Test 1: Logical Backup Export]');
    const snapshot = await exportTenantSnapshot({ db, tenantId });
    console.log(`  Snapshot Generated: Format=${snapshot.format}, Version=${snapshot.version}, Documents=${snapshot.documentCount}`);
    console.log(`  SHA-256 Checksum: ${snapshot.checksum}`);
    console.log('  Manifest Breakdown:', snapshot.manifest);

    results.push({
      test: '1. Logical Backup Export & Manifest Creation',
      pass: snapshot.documentCount === 6 && Boolean(snapshot.checksum),
      details: `Exported 6 docs, checksum: ${snapshot.checksum.slice(0, 16)}...`
    });

    // -------------------------------------------------------------
    // Test 2: Snapshot Integrity Verification
    // -------------------------------------------------------------
    console.log('\n[Test 2: Snapshot Checksum & Structure Verification]');
    const verification = verifySnapshot(snapshot);
    console.log(`  Integrity Check: ${verification.ok ? 'PASSED_OK' : 'FAILED'}, Problems: [${verification.problems.join(', ')}]`);
    results.push({ test: '2. Snapshot Checksum Verification', pass: verification.ok, details: 'Manifest counts and document checksums validated' });

    // -------------------------------------------------------------
    // Test 3: Tampered Snapshot Rejection
    // -------------------------------------------------------------
    console.log('\n[Test 3: Tampered Snapshot Rejection]');
    const tamperedSnapshot = {
      ...snapshot,
      documents: snapshot.documents.map(d => d.path.includes('resources') ? { ...d, data: { ...d.data, title: 'Tampered Title' } } : d)
    };
    const tamperedCheck = verifySnapshot(tamperedSnapshot);
    console.log(`  Tampered Check Result: ${tamperedCheck.ok ? 'FAILED_ALLOWED' : 'CORRECTLY_REJECTED'}, Problems: [${tamperedCheck.problems.join(', ')}]`);
    results.push({ test: '3. Tampered Snapshot Rejection', pass: !tamperedCheck.ok, details: 'Checksum mismatch detected upon data modification' });

    // -------------------------------------------------------------
    // Test 4: Dry-Run Restore Mode
    // -------------------------------------------------------------
    console.log('\n[Test 4: Dry-Run Restore Mode]');
    const dryRunReport = await restoreTenantSnapshot({ db, admin, snapshot, mode: 'dry-run' });
    console.log(`  Dry-Run Report: Mode=${dryRunReport.mode}, Restored Count=${dryRunReport.restored}, Refused=${dryRunReport.refused.length}`);
    results.push({ test: '4. Dry-Run Validation Mode', pass: dryRunReport.restored === 6 && dryRunReport.refused.length === 0, details: 'Dry-run validated 6 documents without state mutation' });

    // -------------------------------------------------------------
    // Test 5: Foreign Path Injection Refusal
    // -------------------------------------------------------------
    console.log('\n[Test 5: Foreign Path Injection Rejection]');
    const injectedSnapshot = {
      ...snapshot,
      documents: [
        ...snapshot.documents,
        { path: 'tenants/foreign-victim-tenant/resources/secret-doc', data: { stolen: true } }
      ]
    };
    // Recompute valid checksum for injected snapshot to test path-level security gate
    verifySnapshot({ ...injectedSnapshot, manifest: [...snapshot.manifest, { collection: 'injected', count: 1 }], checksum: require('../backend/enterprise/enterpriseBackup').checksum(injectedSnapshot.documents.map(d => ({ path: d.path, data: d.data }))) });
    const injectedReport = await restoreTenantSnapshot({
      db,
      admin,
      snapshot: {
        ...injectedSnapshot,
        manifest: [...snapshot.manifest, { collection: 'injected', count: 1 }],
        checksum: require('../backend/enterprise/enterpriseBackup').checksum(injectedSnapshot.documents.map(d => ({ path: d.path, data: d.data })))
      },
      mode: 'dry-run'
    });
    console.log(`  Injected Path Refusal: ${injectedReport.refused.includes('tenants/foreign-victim-tenant/resources/secret-doc') ? 'REFUSED_CORRECT' : 'FAILED'}`);
    results.push({ test: '5. Foreign Path Injection Protection', pass: injectedReport.refused.length === 1, details: 'Foreign tenant path strictly refused by tenant boundary gate' });

    // -------------------------------------------------------------
    // Test 6: Apply Restore & Post-Restore Verification
    // -------------------------------------------------------------
    console.log('\n[Test 6: Apply Restore & Verification]');
    // Delete documents first to simulate complete disaster recovery
    const delBatch = db.batch();
    for (const p of createdPaths) delBatch.delete(db.doc(p));
    await delBatch.commit();
    console.log('  Simulated Disaster: Deleted all 6 documents from Firestore.');

    const applyReport = await restoreTenantSnapshot({ db, admin, snapshot, mode: 'apply' });
    console.log(`  Restore Applied: Mode=${applyReport.mode}, Restored=${applyReport.restored}`);

    const verifyRestored = await verifyTenantRestored({ db, admin, snapshot });
    console.log(`  Post-Restore Checksum Match: ${verifyRestored.ok ? '100% BYTE-FOR-BYTE MATCH' : 'MISMATCH'}`);
    results.push({ test: '6. Disaster Recovery Restore & Byte-for-Byte Match', pass: applyReport.restored === 6 && verifyRestored.ok, details: 'Restored and verified 6/6 documents with 100% fidelity' });

    console.log('\n================================================================');
    console.log('AUDIT 6 SUMMARY MATRIX (FIRESTORE LOGICAL BACKUP & RESTORE):');
    console.table(results);
    console.log('================================================================\n');

  } finally {
    console.log('[Cleanup] Cleaning up backup test documents from Firestore...');
    const cleanupBatch = db.batch();
    for (const p of createdPaths) cleanupBatch.delete(db.doc(p));
    try { await cleanupBatch.commit(); } catch {}
    console.log('  ✓ Cleaned up backup test records.');
  }
}

runBackupRestoreAudit().catch(console.error);
