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
  enqueueOutboxJob,
  claimNextOutboxJob,
  completeOutboxJob,
  failOutboxJob,
  rejectOutboxJob,
  replayDeadLetterJob,
  getOutboxJobStatus,
  listTenantJobs,
} = require('../backend/enterprise/enterpriseOutbox');
const { createTenantJobEnvelope, validateTenantJobEnvelope } = require('../backend/enterprise/tenantJobs');

async function runQueueDlqAudit() {
  console.log('================================================================');
  console.log('AUDIT 3: CONTROLLED FIRESTORE QUEUE / DLQ / WORKER RECOVERY AUDIT');
  console.log('================================================================\n');

  const signingSecret = process.env.TENANT_JOB_SIGNING_SECRET || 'a-very-secure-32-byte-job-signing-secret-key-2026';
  const tenantId = '77777777-1111-4000-a000-000000000001';
  const workspaceId = '77777777-2222-4000-a000-000000000002';
  const principalId = '77777777-3333-4000-a000-000000000003';
  const worker1 = 'worker-hostinger-instance-01';
  const worker2 = 'worker-hostinger-instance-02';

  const dummyContext = {
    tenantId,
    workspaceId,
    principalId,
    subjectId: principalId,
    actorType: 'user',
    identityIssuer: 'firebase',
    policyVersion: 1,
    correlationId: `corr-${Date.now()}`,
    requestId: `req-${Date.now()}`,
    dataPlane: {
      id: 'firestore-primary',
      type: 'FIRESTORE',
      region: 'default',
      routingVersion: 1,
      storageProfile: 'shared',
      cacheProfile: 'shared',
      queueProfile: 'firestore-durable-outbox',
      aiProfile: 'platform-default',
      securityProfile: 'standard'
    },
  };

  const testJobIds = [];
  const results = [];

  try {
    // -------------------------------------------------------------
    // Test 1: Happy Path (Enqueue -> Claim -> Process -> Complete)
    // -------------------------------------------------------------
    console.log('[Test 1: Happy Path Job Execution]');
    const env1 = createTenantJobEnvelope({
      context: dummyContext,
      jobType: 'EXPORT_PDF',
      resource: { type: 'RESUME', id: 'resume-audit-001' },
      idempotencyKey: `audit-job-happy-${Date.now()}`,
      classification: 'CONFIDENTIAL',
      signingSecret,
    });

    const enqResult1 = await enqueueOutboxJob({ db, admin, envelope: env1 });
    testJobIds.push(enqResult1.jobId);
    console.log(`  Enqueued Job: ${enqResult1.jobId} (Status: ${enqResult1.status})`);

    // Verify record in Firestore
    const doc1 = await db.collection('enterprise_outbox').doc(enqResult1.jobId).get();
    const docData1 = doc1.data();
    console.log(`  Firestore Document Status: ${docData1.status}, Tenant: ${docData1.tenantId}, JobType: ${docData1.jobType}`);

    // Worker 1 claims job
    const claim1 = await claimNextOutboxJob({ db, admin, workerId: worker1, now: Date.now() });
    console.log(`  Worker 1 Claimed: ${claim1?.jobId}, Status: ${claim1 ? 'PROCESSING' : 'NONE'}, Lease: ${claim1?.leaseOwner}`);

    // Worker 1 completes job
    const comp1 = await completeOutboxJob({ db, admin, job: claim1, workerId: worker1, result: { pdfUrl: 'gs://vault/export.pdf', bytes: 48200 } });
    console.log(`  Worker 1 Completed Job: Status ${comp1.status}`);

    const verifyDoc1 = await db.collection('enterprise_outbox').doc(enqResult1.jobId).get();
    const isCompleted = verifyDoc1.data()?.status === 'COMPLETED';
    results.push({ test: '1. Happy Path Enqueue -> Claim -> Complete', pass: isCompleted, details: `Final State: ${verifyDoc1.data()?.status}` });

    // -------------------------------------------------------------
    // Test 2: Retry Backoff -> Terminal Failure -> DEAD_LETTER
    // -------------------------------------------------------------
    console.log('\n[Test 2: Failure Retry Backoff -> DEAD_LETTER]');
    const env2 = createTenantJobEnvelope({
      context: dummyContext,
      jobType: 'AI_GENERATE',
      resource: { type: 'RESUME', id: 'res-audit-fail' },
      idempotencyKey: `audit-job-fail-${Date.now()}`,
      classification: 'PRIVATE',
      signingSecret,
    });

    const enqResult2 = await enqueueOutboxJob({ db, admin, envelope: env2, maxAttempts: 2 });
    testJobIds.push(enqResult2.jobId);

    // Attempt 1: Claim and Fail
    const claim2_1 = await claimNextOutboxJob({ db, admin, workerId: worker1, now: Date.now() });
    const fail1 = await failOutboxJob({ db, admin, job: claim2_1, workerId: worker1, error: new Error('Upstream provider timeout'), now: Date.now(), backoffBaseMs: 50 });
    console.log(`  Attempt 1 Failed: Status ${fail1.status}, Next Run Delay: ${fail1.backoffMs}ms`);

    // Fast-forward time past backoff and Claim Attempt 2
    const claim2_2 = await claimNextOutboxJob({ db, admin, workerId: worker1, now: Date.now() + 500 });
    console.log(`  Attempt 2 Claimed: ${claim2_2?.jobId}, Attempt Count: ${claim2_2?.attemptCount}`);

    // Attempt 2: Final Fail (Terminal -> DEAD_LETTER)
    const fail2 = await failOutboxJob({ db, admin, job: claim2_2, workerId: worker1, error: new Error('Fatal schema unrecoverable'), now: Date.now() + 500 });
    console.log(`  Attempt 2 Failed: Status ${fail2.status} (Max attempts reached)`);

    const verifyDoc2 = await db.collection('enterprise_outbox').doc(enqResult2.jobId).get();
    const isDeadLetter = verifyDoc2.data()?.status === 'DEAD_LETTER';
    results.push({ test: '2. Bounded Retry -> Dead Letter Queue', pass: isDeadLetter, details: `Final State: ${verifyDoc2.data()?.status}, Last Error: ${verifyDoc2.data()?.lastError}` });

    // -------------------------------------------------------------
    // Test 3: Dead Letter Queue Replay -> Completion
    // -------------------------------------------------------------
    console.log('\n[Test 3: DLQ Replay -> Reprocess -> Complete]');
    const replayResult = await replayDeadLetterJob({
      db, admin, jobId: enqResult2.jobId, context: { tenantId, principalId, roles: ['TENANT_OWNER'] }, now: Date.now()
    });
    console.log(`  Replayed Job ${enqResult2.jobId}: Status ${replayResult?.status || 'QUEUED'}`);

    const claim2_replayed = await claimNextOutboxJob({ db, admin, workerId: worker2, now: Date.now() });
    console.log(`  Worker 2 Claimed Replayed Job: ${claim2_replayed?.jobId}, Attempt Count: ${claim2_replayed?.attemptCount}`);

    await completeOutboxJob({ db, admin, job: claim2_replayed, workerId: worker2, result: { recovered: true } });
    const verifyDoc2Replayed = await db.collection('enterprise_outbox').doc(enqResult2.jobId).get();
    const isReplayedCompleted = verifyDoc2Replayed.data()?.status === 'COMPLETED';
    results.push({ test: '3. DLQ Replay -> Successful Execution', pass: isReplayedCompleted, details: `Final State: ${verifyDoc2Replayed.data()?.status}` });

    // -------------------------------------------------------------
    // Test 4: Worker Crash & Lease Expiry Recovery
    // -------------------------------------------------------------
    console.log('\n[Test 4: Worker Crash & Lease Recovery Simulation]');
    const env4 = createTenantJobEnvelope({
      context: dummyContext,
      jobType: 'EXPORT_DOCX',
      resource: { type: 'RESUME', id: 'resume-docx-crash' },
      idempotencyKey: `audit-job-lease-${Date.now()}`,
      classification: 'INTERNAL',
      signingSecret,
    });

    const enqResult4 = await enqueueOutboxJob({ db, admin, envelope: env4 });
    testJobIds.push(enqResult4.jobId);

    const startTime = Date.now();
    // Worker 1 claims with 5s lease, then "crashes" (disappears)
    const crashedClaim = await claimNextOutboxJob({ db, admin, workerId: 'crashed-worker-pid-999', now: startTime, leaseMs: 5000 });
    console.log(`  Crashed Worker Claimed Job: ${crashedClaim?.jobId}, Lease Owner: ${crashedClaim?.leaseOwner}`);

    // Immediately Worker 2 tries to claim at same time -> must be blocked (lease active for 5s)
    const blockedClaim = await claimNextOutboxJob({ db, admin, workerId: worker2, now: startTime + 100 });
    console.log(`  Worker 2 Immediate Claim Attempt (while lease active): ${blockedClaim ? 'CLAIMED_ERROR' : 'BLOCKED_CORRECT'}`);

    // Forward time by 6000ms past the 5000ms lease expiry -> Worker 2 claims expired lease
    const recoveredClaim = await claimNextOutboxJob({ db, admin, workerId: worker2, now: startTime + 6000, leaseMs: 60000 });
    console.log(`  Worker 2 Reclaimed Expired Job: ${recoveredClaim?.jobId}, New Lease: ${recoveredClaim?.leaseOwner}`);

    await completeOutboxJob({ db, admin, job: recoveredClaim, workerId: worker2, result: { recoveredAfterCrash: true } });
    const verifyDoc4 = await db.collection('enterprise_outbox').doc(enqResult4.jobId).get();
    const isRecovered = verifyDoc4.data()?.status === 'COMPLETED';
    results.push({ test: '4. Worker Crash / Expired Lease Auto-Recovery', pass: isRecovered && !blockedClaim, details: `Recovered by: ${recoveredClaim?.leaseOwner}` });

    // -------------------------------------------------------------
    // Test 5: Reauthorization & Signature Tamper Rejection
    // -------------------------------------------------------------
    console.log('\n[Test 5: Envelope Signature Tamper Rejection]');
    const env5 = createTenantJobEnvelope({
      context: dummyContext,
      jobType: 'TENANT_EXPORT',
      resource: { type: 'TENANT', id: tenantId },
      idempotencyKey: `audit-job-tamper-${Date.now()}`,
      classification: 'PRIVATE',
      signingSecret,
    });

    // Tamper with payload resource without updating HMAC signature
    const tamperedEnv = { ...env5, resource: { type: 'TENANT', id: 'foreign-victim-tenant' } };
    let tamperDetected = false;
    try {
      validateTenantJobEnvelope(tamperedEnv, signingSecret);
    } catch (err) {
      tamperDetected = err.code === 'INVALID_TENANT_JOB_SIGNATURE' || err.status === 401;
      console.log(`  Tampered Envelope Rejected: ${err.message} (${err.code})`);
    }

    results.push({ test: '5. Envelope Signature Tamper Rejection', pass: tamperDetected, details: 'Tampered envelope rejected at verification gate' });

    console.log('\n================================================================');
    console.log('AUDIT 3 SUMMARY MATRIX (FIRESTORE OUTBOX & DLQ):');
    console.table(results);
    console.log('================================================================\n');

  } finally {
    console.log('[Cleanup] Removing test jobs from enterprise_outbox...');
    for (const jobId of testJobIds) {
      try { await db.collection('enterprise_outbox').doc(jobId).delete(); } catch {}
    }
    console.log('  ✓ Cleaned up test outbox records.');
  }
}

runQueueDlqAudit().catch(console.error);
