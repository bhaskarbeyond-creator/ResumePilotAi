'use strict';

process.env.NODE_ENV = 'test';
process.env.ENTERPRISE_TENANCY_ENABLED = 'true';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { InMemoryTenantRegistry } = require('./helpers/inMemoryTenantRegistry');
const { InMemoryEnterpriseRepository } = require('./helpers/inMemoryEnterpriseRepository');
const { TenantService } = require('../enterprise/tenantService');
const { setTokenVerifierForTests } = require('../security/auth');
const { clearProviderConfigurationCache } = require('../services/aiRuntime');
const { setRepositoryForTests, resetRepositoryCacheForTests } = require('../repositories');
const app = require('../index');

const PLATFORM_AI_PUBLIC = {
  ai: {
    provider: 'nvidia',
    model: 'gemini-2.0-flash',
    nvidiaModel: 'meta/llama-3.2-11b-vision-instruct',
    openaiModel: 'gpt-4o',
    temperature: 0.4,
    maxTokens: 3000,
    enableFallback: true,
  },
};

const PLATFORM_AI_SECRETS = {
  nvidia: {
    apiKey: 'platform-nvidia-key-fixture',
    model: 'meta/llama-3.2-11b-vision-instruct',
  },
  gemini: {
    apiKey: 'platform-gemini-key-fixture',
    model: 'gemini-2.0-flash',
  },
  openai: {
    apiKey: 'platform-openai-key-fixture',
    model: 'gpt-4o',
  },
};

const tokens = {
  alice: { uid: 'alice-candidate', email: 'alice@example.com', email_verified: true, role: 'USER' },
  bob: { uid: 'bob-candidate', email: 'bob@example.com', email_verified: true, role: 'USER' },
  admin: { uid: 'admin-enterprise', email: 'admin@example.com', email_verified: true, role: 'ADMIN', auth_time: Math.floor(Date.now() / 1000) },
};

function bearer(name) {
  return `Bearer ${name}`;
}

let activeRegistry = null;
let activeRepository = null;
let activeService = null;
let generatedWithProvidersCalls = [];

function installTestTenantService() {
  activeRegistry = new InMemoryTenantRegistry();
  activeRepository = new InMemoryEnterpriseRepository();
  activeService = new TenantService({ registry: activeRegistry, repository: activeRepository });
  app.set('tenantService', activeService);
  return { registry: activeRegistry, repository: activeRepository, service: activeService };
}

const InMemoryRepository = require('../repositories/InMemoryRepository');

class TestAiRepository extends InMemoryRepository {
  async getSetting(category) {
    if (category === 'public_config') return PLATFORM_AI_PUBLIC;
    if (category === 'ai_providers') return PLATFORM_AI_SECRETS;
    return super.getSetting(category);
  }
}

test.beforeEach(() => {
  setRepositoryForTests(new TestAiRepository());
  clearProviderConfigurationCache();
  generatedWithProvidersCalls = [];
  setTokenVerifierForTests(async token => {
    if (!tokens[token]) throw new Error('bad token');
    return tokens[token];
  });
  installTestTenantService();
});

test.afterEach(() => {
  resetRepositoryCacheForTests();
  clearProviderConfigurationCache();
});

const BASE_INTERVIEW_INPUT = {
  occupation: 'Lead Cloud Architect',
  interviewType: 'technical',
  questionCount: 6,
  experienceLevel: 'lead',
  difficulty: 'hard',
  resumeFacts: '10 years designing resilient distributed cloud systems on AWS and Kubernetes.',
  jobDescription: 'Seeking Lead Cloud Architect for high-scale multi-region infrastructure.',
};

test('1. Standard non-tenant candidate uses platform AI configuration without tenant headers', async () => {
  // Mock global fetch to return structured interview questions
  const originalFetch = global.fetch;
  let interceptedKey = null;
  let interceptedUrl = null;

  global.fetch = async (url, options) => {
    interceptedUrl = String(url);
    interceptedKey = options?.headers?.['Authorization'] || options?.headers?.['x-api-key'] || (url.includes('key=') ? url.split('key=')[1] : null);
    const mockQuestions = Array.from({ length: 6 }, (_, i) => ({
      id: i + 1,
      question: `Lead Architect Question ${i + 1}`,
      options: ['Option A', 'Option B', 'Option C', 'Option D'],
      correctAnswer: 0,
      category: 'Cloud Architecture',
      difficulty: 'Hard',
      explanation: 'Optimal architectural decision for high resilience.',
    }));
    const mockPayload = {
      title: 'Lead Cloud Architect Assessment',
      company: 'Enterprise Evaluation',
      totalQuestions: 6,
      questions: mockQuestions,
    };
    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify(mockPayload) }] } }],
        choices: [{ message: { content: JSON.stringify(mockPayload) } }],
      }),
    };
  };

  try {
    const res = await request(app)
      .post('/api/generate-interview')
      .set('Authorization', bearer('alice'))
      .send(BASE_INTERVIEW_INPUT);

    assert.equal(res.status, 200);
    assert.equal(res.body.questions.length, 6);
    assert.equal(res.headers['x-tenant-id'], undefined, 'No tenant ID header emitted for platform candidate');
  } finally {
    global.fetch = originalFetch;
  }
});

test('2. Unauthenticated request with X-Tenant-Id fails closed with 401 AUTH_REQUIRED', async () => {
  const res = await request(app)
    .post('/api/generate-interview')
    .set('X-Tenant-Id', '11111111-1111-4111-8111-111111111111')
    .send(BASE_INTERVIEW_INPUT);

  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'AUTH_REQUIRED');
});

test('3. Unauthorized caller with another tenant X-Tenant-Id fails closed with 403 TENANT_ACCESS_DENIED', async () => {
  // Provision Tenant Contoso
  const provisioned = await request(app)
    .post('/api/enterprise/tenants')
    .set('Authorization', bearer('admin'))
    .send({ displayName: 'Contoso Aerospace', slug: 'contoso-aero' });
  assert.equal(provisioned.status, 201);
  const tenantId = provisioned.body.tenant.id;

  // Bob is NOT a member of Contoso
  const res = await request(app)
    .post('/api/generate-interview')
    .set('Authorization', bearer('bob'))
    .set('X-Tenant-Id', tenantId)
    .send(BASE_INTERVIEW_INPUT);

  assert.ok([403, 404].includes(res.status), 'Rejects unauthorized tenant access');
  assert.ok(['TENANT_ACCESS_DENIED', 'TENANT_MEMBERSHIP_NOT_FOUND'].includes(res.body.error.code));
});

test('4. Authorized tenant candidate with BYOK custom keys generates questions using tenant AI policy', async () => {
  // 1. Provision Tenant Contoso
  const provisioned = await request(app)
    .post('/api/enterprise/tenants')
    .set('Authorization', bearer('admin'))
    .send({ displayName: 'Contoso Tech', slug: 'contoso-tech' });
  assert.equal(provisioned.status, 201);
  const tenantId = provisioned.body.tenant.id;
  const workspaceId = provisioned.body.workspace.id;

  // 2. Add Alice as Member of Contoso
  const granted = await request(app)
    .post('/api/enterprise/memberships')
    .set('Authorization', bearer('admin'))
    .set('X-Tenant-Id', tenantId)
    .send({ principalId: tokens.alice.uid, workspaceId, roles: ['MEMBER'] });
  assert.equal(granted.status, 201);

  // 3. Configure Contoso AI Policy with BYOK OpenAI key and allowedProvider = openai
  const TENANT_BYOK_KEY = 'sk-contoso-custom-byok-secret-key-999';
  await activeRegistry.updateTenantConfiguration({
    tenantId,
    input: {
      aiPolicy: {
        version: 2,
        profile: 'enterprise-custom',
        allowedProviders: ['openai'],
        primaryModel: 'gpt-4o',
        customProviderKeys: {
          openai: TENANT_BYOK_KEY,
        },
      },
      quotaPolicy: {
        aiRequestsPerMinute: 50,
        aiRequestsPerDay: 500,
      },
    },
    expectedRevision: 1,
  });

  // 4. Intercept outbound HTTP call to verify that Tenant BYOK Key is passed
  const originalFetch = global.fetch;
  let interceptedAuthHeader = null;
  let interceptedUrl = null;

  global.fetch = async (url, options) => {
    interceptedUrl = String(url);
    interceptedAuthHeader = options?.headers?.['Authorization'] || options?.headers?.['authorization'];
    const mockQuestions = Array.from({ length: 6 }, (_, i) => ({
      id: i + 1,
      question: `Contoso Architecture Question ${i + 1}`,
      options: ['A', 'B', 'C', 'D'],
      correctAnswer: 0,
      category: 'Cloud',
      difficulty: 'Hard',
      explanation: 'STAR criterion trade-off explanation.',
    }));
    const mockPayload = {
      title: 'Contoso Cloud Assessment',
      questions: mockQuestions,
    };
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(mockPayload) } }],
      }),
    };
  };

  try {
    const res = await request(app)
      .post('/api/generate-interview')
      .set('Authorization', bearer('alice'))
      .set('X-Tenant-Id', tenantId)
      .send(BASE_INTERVIEW_INPUT);

    assert.equal(res.status, 200);
    assert.equal(res.headers['x-ai-provider'], 'openai', 'Respected tenant allowedProviders and primary provider');
    assert.equal(res.headers['x-tenant-id'], tenantId, 'Echoes active tenant context');
    assert.equal(interceptedAuthHeader, `Bearer ${TENANT_BYOK_KEY}`, 'Outbound LLM call strictly used Tenant BYOK custom key');

    // 5. Verify that tenant AI usage was recorded in the repository ledger
    const usage = await activeService.getAiUsageSummary({ context: { tenantId, principalId: tokens.alice.uid }, days: 1 });
    assert.equal(usage.requests >= 1, true, 'Tenant AI usage ledger recorded transaction');
  } finally {
    global.fetch = originalFetch;
  }
});

test('5. Live Interview Session propagates Tenant BYOK configuration across opening, turn, and complete', async () => {
  // 1. Provision Tenant Contoso
  const provisioned = await request(app)
    .post('/api/enterprise/tenants')
    .set('Authorization', bearer('admin'))
    .send({ displayName: 'Apex Systems', slug: 'apex-systems' });
  const tenantId = provisioned.body.tenant.id;
  const workspaceId = provisioned.body.workspace.id;

  // 2. Add Alice as Member
  await request(app)
    .post('/api/enterprise/memberships')
    .set('Authorization', bearer('admin'))
    .set('X-Tenant-Id', tenantId)
    .send({ principalId: tokens.alice.uid, workspaceId, roles: ['MEMBER'] });

  // 3. Configure BYOK key
  const TENANT_BYOK_KEY = 'sk-apex-live-interview-key-888';
  await activeRegistry.updateTenantConfiguration({
    tenantId,
    input: {
      aiPolicy: {
        allowedProviders: ['openai'],
        customProviderKeys: { openai: TENANT_BYOK_KEY },
      },
    },
    expectedRevision: 1,
  });

  const originalFetch = global.fetch;
  const observedKeys = [];

  global.fetch = async (url, options) => {
    const auth = options?.headers?.['Authorization'] || options?.headers?.['authorization'];
    observedKeys.push(auth);
    const mockOutput = {
      interviewer_message: 'Welcome to your Apex technical interview.',
      question: 'Explain your strategy for multi-region active-active database failover.',
      response_type: 'opening_question',
      interview_stage: 'opening',
      topic: 'Database Resilience',
      difficulty: 'hard',
      question_intent: 'Test distributed consensus and RPO/RTO trade-offs',
      model_answer: 'In our production deployment we leveraged CockroachDB with raft consensus across 3 regions...',
      answer_tip: 'Be specific about network partition recovery.',
      evaluation: { score: 85, observations: ['Clear trade-off reasoning'], coaching_tip: 'Quantify exact failover latency' },
      interview_complete: false,
      state_update: { topics_covered: ['Resilience'], topics_to_probe: ['Cost'], strengths: ['Architecture'], growth_areas: [], rolling_summary: 'Candidate demonstrated solid multi-region failover understanding.' },
      overall_score: 88,
      readiness: 'High',
      summary: 'Strong candidate demonstrating deep distributed systems knowledge.',
      strengths: ['High-availability system design'],
      focus_areas: [{ area: 'Cost', detail: 'Evaluate cross-region egress expense' }],
      practice_plan: ['Benchmarking partition tolerance'],
    };
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(mockOutput) } }],
      }),
    };
  };

  try {
    // A. Start Session
    const startRes = await request(app)
      .post('/api/live-interview/sessions')
      .set('Authorization', bearer('alice'))
      .set('X-Tenant-Id', tenantId)
      .send({ role: 'Cloud Architect', interviewType: 'technical', difficulty: 'hard' });

    assert.equal(startRes.status, 201);
    const session = startRes.body.session;
    assert.ok(session.sessionId);
    assert.equal(session.interviewer.question, 'Explain your strategy for multi-region active-active database failover.');

    // B. Answer Turn
    const turnRes = await request(app)
      .post(`/api/live-interview/sessions/${session.sessionId}/turns`)
      .set('Authorization', bearer('alice'))
      .set('X-Tenant-Id', tenantId)
      .send({
        turnId: session.interviewer.turnId,
        expectedRevision: session.revision,
        answer: 'We implemented multi-region Spanner instances with 99.999% SLA and automatic region drain.',
        idempotencyKey: 'idemp-test-key-turn-001',
      });

    assert.equal(turnRes.status, 200);

    // C. Complete Session
    const completeRes = await request(app)
      .post(`/api/live-interview/sessions/${session.sessionId}/complete`)
      .set('Authorization', bearer('alice'))
      .set('X-Tenant-Id', tenantId)
      .send({ expectedRevision: turnRes.body.session.revision });

    assert.equal(completeRes.status, 200);
    assert.equal(completeRes.body.session.progress.interviewComplete, true);
    assert.equal(completeRes.body.session.report.overallScore, 88);

    // Verify all 3 LLM calls used the Tenant BYOK key
    assert.equal(observedKeys.length, 3);
    for (const key of observedKeys) {
      assert.equal(key, `Bearer ${TENANT_BYOK_KEY}`, 'All live interview turns used tenant BYOK key');
    }
  } finally {
    global.fetch = originalFetch;
  }
});

test('6. Enterprise namespace /api/enterprise/ai/generate-interview executes within tenant context', async () => {
  // Provision Tenant
  const provisioned = await request(app)
    .post('/api/enterprise/tenants')
    .set('Authorization', bearer('admin'))
    .send({ displayName: 'Acme Enterprise', slug: 'acme-enterprise' });
  const tenantId = provisioned.body.tenant.id;
  const workspaceId = provisioned.body.workspace.id;

  // Add Alice as Member with ai.use permission
  await request(app)
    .post('/api/enterprise/memberships')
    .set('Authorization', bearer('admin'))
    .set('X-Tenant-Id', tenantId)
    .send({ principalId: tokens.alice.uid, workspaceId, roles: ['MEMBER'] });

  // Configure Tenant AI Policy
  await activeRegistry.updateTenantConfiguration({
    tenantId,
    input: {
      aiPolicy: {
        allowedProviders: ['openai'],
        customProviderKeys: { openai: 'sk-acme-enterprise-key-123' },
      },
    },
    expectedRevision: 1,
  });

  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{
        message: {
          content: JSON.stringify({
            title: 'Acme Enterprise Assessment',
            questions: [{ id: 1, question: 'Enterprise Kubernetes scaling question', options: ['1', '2', '3', '4'], correctAnswer: 0 }],
          }),
        },
      }],
    }),
  });

  try {
    const res = await request(app)
      .post('/api/enterprise/ai/generate-interview')
      .set('Authorization', bearer('alice'))
      .set('X-Tenant-Id', tenantId)
      .send(BASE_INTERVIEW_INPUT);

    assert.equal(res.status, 200);
    assert.equal(res.body.context.tenantId, tenantId);
    assert.equal(res.body.questions.length, 1);
  } finally {
    global.fetch = originalFetch;
  }
});

test('7. Legacy UID route /api/generate-summary continues to reject X-Tenant-Id with 400 TENANT_CONTEXT_UNSUPPORTED_FOR_LEGACY_ROUTE', async () => {
  const res = await request(app)
    .post('/api/generate-summary')
    .set('Authorization', bearer('alice'))
    .set('X-Tenant-Id', '11111111-1111-4111-8111-111111111111')
    .send({ occupation: 'Lead Architect' });

  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'TENANT_CONTEXT_UNSUPPORTED_FOR_LEGACY_ROUTE');
});
