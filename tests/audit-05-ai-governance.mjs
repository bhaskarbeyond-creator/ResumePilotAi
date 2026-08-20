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
const { assertNoClientAuthority, applyTenantAiPolicy, buildTenantAiOperation } = require('../backend/enterprise/tenantAi');
const { FirestoreAtomicCounterStore, TenantQuotaGuard } = require('../backend/enterprise/tenantQuota');

async function runAiGovernanceAudit() {
  console.log('================================================================');
  console.log('AUDIT 5: REAL ENTERPRISE AI GOVERNANCE & ATOMIC QUOTA AUDIT');
  console.log('================================================================\n');

  const tenantId = '66666666-1111-4000-a000-000000000001';
  const workspaceId = '66666666-2222-4000-a000-000000000002';
  const principalId = '66666666-3333-4000-a000-000000000003';

  const contextA = {
    tenantId,
    workspaceId,
    principalId,
    actorType: 'user',
    policyVersion: 2,
    correlationId: `corr-ai-${Date.now()}`,
    dataPlane: { aiProfile: 'platform-default' },
  };

  const results = [];
  const testBucketKeys = [];

  try {
    // -------------------------------------------------------------
    // Test 1: Client Authority Spoof Rejection
    // -------------------------------------------------------------
    console.log('[Test 1: Client Authority Spoofing Prevention]');
    const spoofAttempts = [
      { role: 'Software Engineer', tenantId: 'victim-tenant-id' },
      { role: 'Software Engineer', workspace_id: 'victim-workspace-id' },
      { role: 'Software Engineer', ownerUid: 'victim-user-id' },
      { role: 'Software Engineer', vectorNamespace: 'victim-namespace' },
    ];

    let allSpoofsBlocked = true;
    for (const spoofPayload of spoofAttempts) {
      try {
        assertNoClientAuthority(spoofPayload, 'AI payload');
        allSpoofsBlocked = false;
      } catch (err) {
        allSpoofsBlocked = allSpoofsBlocked && err.code === 'CLIENT_AI_CONTEXT_REJECTED' && err.status === 400;
      }
    }
    console.log(`  Client Authority Injection Gate: ${allSpoofsBlocked ? 'ALL_ATTEMPTS_REJECTED (HTTP 400)' : 'FAILED'}`);
    results.push({ test: '1. Client Authority Injection Rejection', pass: allSpoofsBlocked, details: 'Blocked 4/4 client authority injection vectors' });

    // -------------------------------------------------------------
    // Test 2: AI Provider Policy Enforcement (Deny-by-default)
    // -------------------------------------------------------------
    console.log('\n[Test 2: AI Provider Policy Enforcement]');
    const baseConfig = {
      primary: 'openai',
      providers: {
        openai: { enabled: true, model: 'gpt-4o' },
        gemini: { enabled: true, model: 'gemini-1.5-pro' },
        anthropic: { enabled: true, model: 'claude-3-5-sonnet' },
      }
    };

    // Policy permits only Gemini
    const geminiOnlyPolicy = { version: 2, allowedProviders: ['gemini'] };
    const resolvedConfig = applyTenantAiPolicy(baseConfig, contextA, geminiOnlyPolicy);
    const geminiEnabled = resolvedConfig.providers.gemini.enabled === true;
    const openaiDisabled = resolvedConfig.providers.openai.enabled === false;
    const primarySwitchedToGemini = resolvedConfig.primary === 'gemini';

    console.log(`  Allowed Providers: [${[...Object.keys(resolvedConfig.providers)].filter(k => resolvedConfig.providers[k].enabled).join(', ')}]`);
    console.log(`  Primary Model Auto-Switched: ${resolvedConfig.primary}`);

    // Policy permits NO providers -> fails closed with 403
    const emptyPolicy = { version: 2, allowedProviders: [] };
    let emptyPolicyBlocked = false;
    try {
      applyTenantAiPolicy(baseConfig, contextA, emptyPolicy);
    } catch (err) {
      emptyPolicyBlocked = err.code === 'TENANT_AI_PROVIDER_UNAVAILABLE' && err.status === 403;
    }
    console.log(`  Zero-Allowed Policy Fail-Closed: ${emptyPolicyBlocked ? 'BLOCKED_CORRECT (403)' : 'FAILED'}`);

    results.push({
      test: '2. AI Policy Allowlist & Fail-Closed Behavior',
      pass: geminiEnabled && openaiDisabled && primarySwitchedToGemini && emptyPolicyBlocked,
      details: 'Strict tenant provider allowlist enforced; 0-provider policy blocked'
    });

    // -------------------------------------------------------------
    // Test 3: Cross-Tenant AI Source Context Leak Prevention
    // -------------------------------------------------------------
    console.log('\n[Test 3: Cross-Tenant AI Source Context Isolation]');
    const validSources = [
      { id: 'res-1', revision: 1, tenantId, workspaceId },
      { id: 'res-2', revision: 1, tenantId, workspaceId },
    ];
    const op = buildTenantAiOperation({ context: contextA, operation: 'GENERATE_SUMMARY', payload: { role: 'Architect' }, sourceResources: validSources });
    console.log(`  Valid AI Operation Built: Source Count=${op.sourceCount}, Digest=${op.sourceDigest.slice(0, 16)}...`);

    const foreignSources = [
      { id: 'res-foreign', revision: 1, tenantId: 'foreign-tenant-victim', workspaceId: 'foreign-workspace' }
    ];
    let foreignSourceBlocked = false;
    try {
      buildTenantAiOperation({ context: contextA, operation: 'GENERATE_SUMMARY', payload: { role: 'Architect' }, sourceResources: foreignSources });
    } catch (err) {
      foreignSourceBlocked = err.code === 'TENANT_AI_SOURCE_DENIED' && err.status === 404;
      console.log(`  Foreign Tenant Source Rejected: ${err.message} (${err.code})`);
    }
    results.push({ test: '3. Cross-Tenant AI Context Isolation', pass: foreignSourceBlocked && Boolean(op.sourceDigest), details: 'Foreign source documents rejected with 404' });

    // -------------------------------------------------------------
    // Test 4: Real Atomic Quota Guard with Firestore Atomic Counters
    // -------------------------------------------------------------
    console.log('\n[Test 4: Firestore Atomic Quota Bucket & Rate Limiter]');
    const counterStore = new FirestoreAtomicCounterStore({ db, admin });
    const quotaGuard = new TenantQuotaGuard({ store: counterStore });

    const quotaLimit = 3;
    const windowMs = 60000; // 1 minute window

    // Consume 1, 2, 3 -> all pass
    const consume1 = await quotaGuard.consume({ context: contextA, metric: 'ai.tokens', limit: quotaLimit, windowMs });
    testBucketKeys.push(consume1.key);
    console.log(`  Token 1 Consumed: Used ${consume1.used}/${consume1.limit}, Remaining: ${consume1.remaining}`);

    const consume2 = await quotaGuard.consume({ context: contextA, metric: 'ai.tokens', limit: quotaLimit, windowMs });
    console.log(`  Token 2 Consumed: Used ${consume2.used}/${consume2.limit}, Remaining: ${consume2.remaining}`);

    const consume3 = await quotaGuard.consume({ context: contextA, metric: 'ai.tokens', limit: quotaLimit, windowMs });
    console.log(`  Token 3 Consumed: Used ${consume3.used}/${consume3.limit}, Remaining: ${consume3.remaining}`);

    // Consume 4 -> exceeds limit of 3 -> throws 429 TENANT_QUOTA_EXCEEDED
    let quotaExceededBlocked = false;
    try {
      await quotaGuard.consume({ context: contextA, metric: 'ai.tokens', limit: quotaLimit, windowMs });
    } catch (err) {
      quotaExceededBlocked = err.code === 'TENANT_QUOTA_EXCEEDED' && err.status === 429;
      console.log(`  Token 4 Blocked: ${err.message} (${err.code}, Retry-After: ${err.retryAfterSeconds}s)`);
    }

    results.push({
      test: '4. Firestore Atomic Quota Bucketing & 429 Rejection',
      pass: consume1.remaining === 2 && consume3.remaining === 0 && quotaExceededBlocked,
      details: `Atomic increments 1..3 passed, attempt 4 throttled with HTTP 429`
    });

    console.log('\n================================================================');
    console.log('AUDIT 5 SUMMARY MATRIX (AI GOVERNANCE & FIRESTORE QUOTAS):');
    console.table(results);
    console.log('================================================================\n');

  } finally {
    console.log('[Cleanup] Cleaning up test quota buckets in Firestore...');
    const crypto = require('crypto');
    for (const key of testBucketKeys) {
      try {
        const id = crypto.createHash('sha256').update(String(key)).digest('hex');
        await db.collection('enterprise_quota_buckets').doc(id).delete();
      } catch {}
    }
    console.log('  ✓ Cleaned up test quota records.');
  }
}

runAiGovernanceAudit().catch(console.error);
