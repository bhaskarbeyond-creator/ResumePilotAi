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
const { createEncryptionProvider, isEncryptedEnvelope } = require('../backend/enterprise/encryptionProvider');
const { FirestoreEnterpriseRepository } = require('../backend/enterprise/firestoreEnterpriseRepository');

const crypto = require('crypto');

async function runEncryptionAudit() {
  console.log('================================================================');
  console.log('AUDIT 4: REAL SERVER-SIDE ENCRYPTION (AES-256-GCM) AUDIT');
  console.log('================================================================\n');

  const encryptionKeysRaw = process.env.ENTERPRISE_ENCRYPTION_KEYS || JSON.stringify({
    v1: crypto.randomBytes(32).toString('base64')
  });
  const encryptionProvider = createEncryptionProvider({
    ENTERPRISE_ENCRYPTION_KEYS: encryptionKeysRaw
  });
  const repository = new FirestoreEnterpriseRepository({ db, admin, encryptionProvider });

  const tenantId = '88888888-1111-4000-a000-000000000001';
  const workspaceId = '88888888-2222-4000-a000-000000000002';
  const principalId = '88888888-3333-4000-a000-000000000003';
  const resourceId = '88888888-4444-4000-a000-000000000004';

  const contextA = {
    tenantId,
    workspaceId,
    principalId,
    actorType: 'user',
    roles: ['TENANT_OWNER'],
    permissions: ['*'],
  };

  const sensitivePayload = {
    salaryTargetUsd: 285000,
    ssnLast4: '9981',
    internalClearance: 'TOP_SECRET_LEVEL_4',
    careerAchievements: [
      'Engineered multi-tenant database partitioning on Firestore with zero data leakage',
      'Designed AES-256-GCM envelope encryption runtime'
    ]
  };

  const results = [];

  try {
    // -------------------------------------------------------------
    // Test 1: Plaintext -> Encrypt -> Firestore Write
    // -------------------------------------------------------------
    console.log('[Test 1: Encrypted Resource Creation]');
    const createdResource = await repository.createResource(contextA, {
      id: resourceId,
      resourceType: 'DOCUMENT',
      classification: 'CONFIDENTIAL',
      payload: sensitivePayload,
    });
    console.log(`  Created Resource: ${createdResource.id} (Classification: ${createdResource.classification})`);

    // Verify raw document directly in Firestore collection
    const rawDoc = await db.collection(`tenants/${tenantId}/resources`).doc(resourceId).get();
    const rawData = rawDoc.data();

    // Verify plaintext is NOT stored in raw document
    const rawJson = JSON.stringify(rawData);
    const plaintextLeaked = rawJson.includes('285000') || rawJson.includes('9981') || rawJson.includes('TOP_SECRET_LEVEL_4');
    const hasEncryptedEnvelope = isEncryptedEnvelope(rawData.payloadCipher);
    const envelope = rawData.payloadCipher;

    console.log('  Raw Firestore Document Keys:', Object.keys(rawData));
    console.log('  Envelope Metadata:', { alg: envelope.alg, keyVersion: envelope.keyVersion, ivLen: envelope.iv?.length, tagLen: envelope.tag?.length });
    console.log('  Plaintext in Raw Firestore Doc:', plaintextLeaked ? 'LEAKED_ERROR' : 'ZERO_LEAKAGE_CONFIRMED');

    results.push({
      test: '1. AES-256-GCM Encryption & Zero Plaintext Leakage',
      pass: hasEncryptedEnvelope && !plaintextLeaked,
      details: `Envelope v=${envelope.keyVersion}, alg=${envelope.alg}, Ciphertext length=${envelope.ciphertext?.length}`
    });

    // -------------------------------------------------------------
    // Test 2: Authorized Decrypt
    // -------------------------------------------------------------
    console.log('\n[Test 2: Authorized Decrypt]');
    const retrievedResource = await repository.getResource(contextA, resourceId);
    const decryptedPayload = retrievedResource.payload;
    const decryptMatches = decryptedPayload.salaryTargetUsd === 285000 && decryptedPayload.ssnLast4 === '9981';

    console.log('  Decrypted Salary Target:', decryptedPayload.salaryTargetUsd);
    console.log('  Decrypted Clearance:', decryptedPayload.internalClearance);
    results.push({ test: '2. Authorized Payload Decryption', pass: decryptMatches, details: 'Plaintext restored identically from ciphertext' });

    // -------------------------------------------------------------
    // Test 3: Wrong Tenant Context Fails Closed
    // -------------------------------------------------------------
    console.log('\n[Test 3: Wrong Tenant Context Rejection]');
    const contextWrongTenant = {
      tenantId: '99999999-0000-4000-a000-000000000009',
      workspaceId: '99999999-0000-4000-a000-000000000010',
      principalId: '99999999-0000-4000-a000-000000000011',
      roles: ['TENANT_OWNER'],
      permissions: ['*'],
    };

    let wrongTenantBlocked = false;
    try {
      const foreignRes = await repository.getResource(contextWrongTenant, resourceId);
      wrongTenantBlocked = foreignRes === null;
      console.log(`  Wrong Tenant Access Result: ${foreignRes === null ? 'NULL_PARTITION_ISOLATED' : 'LEAKED'}`);
    } catch (err) {
      wrongTenantBlocked = err.status === 404 || err.code === 'TENANT_RESOURCE_NOT_FOUND';
      console.log(`  Wrong Tenant Access Blocked: ${err.message} (${err.code})`);
    }
    results.push({ test: '3. Wrong Tenant Access Fails Closed', pass: wrongTenantBlocked, details: 'Partition boundary prevents foreign tenant read (returns null)' });

    // -------------------------------------------------------------
    // Test 4: Tampered Ciphertext Fails Closed
    // -------------------------------------------------------------
    console.log('\n[Test 4: Tampered Ciphertext Rejection]');
    const tamperedCipher = {
      ...envelope,
      ciphertext: envelope.ciphertext.slice(0, -4) + 'AAAA' // flip bits at end of ciphertext
    };

    let tamperedCipherBlocked = false;
    try {
      encryptionProvider.decryptValue(tamperedCipher);
    } catch (err) {
      tamperedCipherBlocked = true;
      console.log(`  Tampered Ciphertext Rejected: ${err.message}`);
    }
    results.push({ test: '4. Tampered Ciphertext Fails Closed', pass: tamperedCipherBlocked, details: 'Authentication tag verification failed as expected' });

    // -------------------------------------------------------------
    // Test 5: Tampered Auth Tag Fails Closed
    // -------------------------------------------------------------
    console.log('\n[Test 5: Tampered Auth Tag Rejection]');
    const tamperedTag = {
      ...envelope,
      tag: 'AAAAAAAAAAAAAAAAAAAAAA' // forged 16-byte tag
    };

    let tamperedTagBlocked = false;
    try {
      encryptionProvider.decryptValue(tamperedTag);
    } catch (err) {
      tamperedTagBlocked = true;
      console.log(`  Tampered Tag Rejected: ${err.message}`);
    }
    results.push({ test: '5. Tampered Auth Tag Fails Closed', pass: tamperedTagBlocked, details: 'GCM authentication check failed closed' });

    // -------------------------------------------------------------
    // Test 6: Missing / Invalid Encryption Key Fails Closed
    // -------------------------------------------------------------
    console.log('\n[Test 6: Missing Key Provider Fails Closed]');
    const emptyProvider = createEncryptionProvider({ keysJson: null });
    let missingKeyBlocked = false;
    try {
      const repoNoKey = new FirestoreEnterpriseRepository({ db, admin, encryptionProvider: emptyProvider });
      repoNoKey.sealPayload(contextA, { secret: 'data' }, 'CONFIDENTIAL');
    } catch (err) {
      missingKeyBlocked = err.code === 'ENTERPRISE_ENCRYPTION_UNAVAILABLE' || err.status === 503;
      console.log(`  Missing Key Provider Rejected: ${err.message} (${err.code})`);
    }
    results.push({ test: '6. Missing Key Fails Closed (No plain fallback)', pass: missingKeyBlocked, details: 'Throws ENTERPRISE_ENCRYPTION_UNAVAILABLE (503)' });

    console.log('\n================================================================');
    console.log('AUDIT 4 SUMMARY MATRIX (AES-256-GCM ENCRYPTION & INTEGRITY):');
    console.table(results);
    console.log('================================================================\n');

  } finally {
    console.log('[Cleanup] Removing test resource from Firestore...');
    try { await db.collection(`tenants/${tenantId}/resources`).doc(resourceId).delete(); } catch {}
    console.log('  ✓ Cleaned up test encryption document.');
  }
}

runEncryptionAudit().catch(console.error);
