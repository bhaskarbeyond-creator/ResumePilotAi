process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const supertest = require('supertest');
const {
  generateWithProviders,
  loadProviderConfiguration,
} = require('../services/aiRuntime');
const {
  loadAiAdminSettings,
  saveAiAdminSettings,
} = require('../services/aiAdmin');
const { requireAuth, setTokenVerifierForTests } = require('../security/auth');
const { enforceApiPolicy } = require('../security/policy');
const aiRoutes = require('../routes/ai');
const { installAiSettingsContract } = require('./helpers/aiSettingsContract');

const settingsContract = installAiSettingsContract();
function seedMariaDbSettingsContract(secrets, publicConfig) {
  settingsContract.reset({ ai_providers: secrets, public_config: publicConfig });
}

const mockAdmin = {};

function createMockApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  setTokenVerifierForTests(async (token) => {
    if (token === 'admin-token') {
      return { uid: 'admin-1', email: 'admin@example.com', email_verified: true, role: 'SUPER_ADMIN', superAdmin: true, auth_time: Math.floor(Date.now() / 1000) };
    }
    if (token === 'user-a-token') {
      return { uid: 'user-a', email: 'user.a@example.com', email_verified: true, role: 'USER' };
    }
    if (token === 'user-b-token') {
      return { uid: 'user-b', email: 'user.b@example.com', email_verified: true, role: 'USER' };
    }
    if (token === 'unverified-token') {
      return { uid: 'unverified-user', email: 'unverified@example.com', email_verified: false, role: 'USER' };
    }
    throw new Error('invalid token');
  });

  app.use((req, res, next) => {
    res.locals.requestId = `req-${Math.random().toString(36).slice(2)}`;
    next();
  });

  app.use('/api', requireAuth, enforceApiPolicy);
  app.use('/api', aiRoutes);

  app.post('/api/admin/ai-settings', async (req, res) => {
    try {
      const result = await saveAiAdminSettings({
        admin: mockAdmin,
        input: req.body,
        expectedRevision: req.body.expectedRevision,
        actorUid: req.user.uid,
        requestId: res.locals.requestId
      });
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(err.status || 500).json({ error: { code: err.code || 'AI_SETTINGS_ERROR', message: err.message } });
    }
  });

  return app;
}

test('Acceptance Gate 1: 50 concurrent provider calls preserve per-request results without shared-state corruption', async () => {
  seedMariaDbSettingsContract({
    nvidia: { apiKey: 'nvapi-test', model: 'meta/llama-3.2-11b-vision-instruct' },
    _revision: 1
  }, {
    ai: { provider: 'nvidia', enableNvidia: true, enableFallback: false, maxTokens: 2048 },
    aiRevision: 1
  });

  let activeRequests = 0;
  let peakActive = 0;
  const mockFetch = async () => {
    activeRequests++;
    peakActive = Math.max(peakActive, activeRequests);
    await new Promise(r => setTimeout(r, 10)); // 10ms network simulation
    activeRequests--;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: '{"summary": "Experienced Full Stack Engineer with expertise in high throughput systems."}' } }]
      })
    };
  };

  const configuration = await loadProviderConfiguration({});
  const CONCURRENCY = 50;
  const tasks = Array.from({ length: CONCURRENCY }, async (_, idx) => {
    const prompt = `Generate summary for candidate user-${idx} with occupation Engineer`;
    const res = await generateWithProviders({
      prompt,
      configuration,
      operation: 'generate-summary',
      fetchImpl: mockFetch
    });
    return { idx, res };
  });

  const results = await Promise.all(tasks);

  assert.equal(results.length, CONCURRENCY, 'All 50 concurrent requests must complete');
  for (const r of results) {
    assert.equal(r.res.provider, 'nvidia');
    assert.ok(r.res.raw.includes('Full Stack Engineer'), 'Content must be preserved per request');
  }

  assert.ok(peakActive > 1, 'The contract must exercise overlapping provider calls');
});

test('Acceptance Gate 2: Concurrent Admin settings update + User AI generation race test', async () => {
  seedMariaDbSettingsContract({
    nvidia: { apiKey: 'nvapi-old', model: 'meta/llama-3.2-11b-vision-instruct' },
    gemini: { apiKey: 'gemini-key', model: 'gemini-2.0-flash' },
    _revision: 1
  }, {
    ai: { provider: 'nvidia', enableNvidia: true, enableGemini: true, enableFallback: true, maxTokens: 2048 },
    aiRevision: 1
  });

  const app = createMockApp();

  // Trigger 10 simultaneous user AI requests while an admin updates settings.
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    await new Promise(r => setTimeout(r, 15));
    if (url.includes('nvidia.com')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: '{"summary":"Generated with NVIDIA.","sourceExcerpts":["Generated with NVIDIA"]}' } }]
        })
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: '{"summary":"Generated with Gemini.","sourceExcerpts":["Generated with Gemini"]}' }] } }]
      })
    };
  };

  try {
    const userReqs = Array.from({ length: 10 }, () =>
      supertest(app)
      .post('/api/generate-content')
      .set('Authorization', 'Bearer user-a-token')
      .send({
        operation: 'generate-summary',
        payload: { jobTitle: 'Engineer', sourceFacts: 'Generated with NVIDIA. Generated with Gemini.' },
      })
  );

  const adminUpdate = supertest(app)
    .post('/api/admin/ai-settings')
    .set('Authorization', 'Bearer admin-token')
    .send({
      provider: 'gemini',
      enableGemini: true,
      enableNvidia: true,
      expectedRevision: 1
    });

  const allOutcomes = await Promise.all([...userReqs, adminUpdate]);
  const adminRes = allOutcomes[10];

  assert.equal(adminRes.status, 200, 'Admin settings update must succeed');
  assert.equal(adminRes.body.revision, 2, 'Revision must be incremented to 2');

  // Verify that all 10 user requests returned 200 without throwing 500 or corrupting state
    for (let i = 0; i < 10; i++) {
      const uRes = allOutcomes[i];
      assert.equal(uRes.status, 200, `User request ${i} must succeed with 200`);
      assert.ok(uRes.body.summary, 'Summary must be returned');
    }
  } finally {
    global.fetch = originalFetch;
  }
});

test('Acceptance Gate 3: 12 provider failure contracts fail over once without retry storms', async () => {
  const failureScenarios = [
    { name: '1. Timeout (AbortError)', mock: () => { const e = new Error('Timeout'); e.name = 'AbortError'; throw e; } },
    { name: '2. HTTP 401 Unauthorized', mock: () => ({ ok: false, status: 401, text: async () => 'Invalid Key' }) },
    { name: '3. HTTP 403 Forbidden', mock: () => ({ ok: false, status: 403, text: async () => 'Access Denied' }) },
    { name: '4. HTTP 429 Rate Limit', mock: () => ({ ok: false, status: 429, text: async () => 'Rate limit exceeded' }) },
    { name: '5. HTTP 500 Server Error', mock: () => ({ ok: false, status: 500, text: async () => 'Internal Server Error' }) },
    { name: '6. HTTP 502 Bad Gateway', mock: () => ({ ok: false, status: 502, text: async () => 'Bad Gateway' }) },
    { name: '7. HTTP 503 Service Unavailable', mock: () => ({ ok: false, status: 503, text: async () => 'Service Unavailable' }) },
    { name: '8. Malformed JSON Response', mock: () => ({ ok: true, status: 200, json: async () => { throw new Error('Bad JSON'); }, text: async () => '<<<NOT_JSON>>>' }) },
    { name: '9. Empty Response Payload', mock: () => ({ ok: true, status: 200, json: async () => ({}) }) },
    { name: '10. Invalid Structure / Missing choices', mock: () => ({ ok: true, status: 200, json: async () => ({ choices: [] }) }) },
    { name: '11. Connection Reset (ECONNRESET)', mock: () => { const e = new Error('read ECONNRESET'); e.code = 'ECONNRESET'; throw e; } },
    { name: '12. DNS Resolution Failure (ENOTFOUND)', mock: () => { const e = new Error('getaddrinfo ENOTFOUND api.nvidia.com'); e.code = 'ENOTFOUND'; throw e; } },
  ];

  for (const scenario of failureScenarios) {
    seedMariaDbSettingsContract({
      nvidia: { apiKey: 'nvapi-failing', model: 'meta/llama-3.2-11b-vision-instruct' },
      gemini: { apiKey: 'gemini-backup', model: 'gemini-2.0-flash' },
      _revision: 1
    }, {
      ai: { provider: 'nvidia', enableNvidia: true, enableGemini: true, enableFallback: true, maxTokens: 2048 },
      aiRevision: 1
    });

    let primaryAttempts = 0;
    let fallbackAttempts = 0;

    const hybridFetch = async (url) => {
      if (url.includes('nvidia.com')) {
        primaryAttempts++;
        return await scenario.mock();
      }
      if (url.includes('googleapis.com')) {
        fallbackAttempts++;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: '{"summary": "Fallback Recovery Succeeded"}' }] } }]
          })
        };
      }
      throw new Error(`Unexpected provider call to ${url}`);
    };

    const configuration = await loadProviderConfiguration({});
    const res = await generateWithProviders({
      prompt: 'Test prompt',
      configuration,
      operation: 'generate-summary',
      fetchImpl: hybridFetch
    });

    assert.equal(primaryAttempts, 1, `${scenario.name}: Primary must be attempted exactly once (no retry storms)`);
    assert.equal(fallbackAttempts, 1, `${scenario.name}: Fallback must be called exactly once`);
    assert.equal(res.provider, 'gemini', `${scenario.name}: Must successfully recover on Gemini`);
    assert.ok(res.raw.includes('Fallback Recovery Succeeded'), `${scenario.name}: Must return valid recovered payload`);
  }
});

test('Acceptance Gate 4: AI settings RBAC and secret-redaction boundaries are enforced', async () => {
  seedMariaDbSettingsContract({
    nvidia: { apiKey: 'fixture-nvidia-vault-key', model: 'meta/llama-3.2-11b-vision-instruct' },
    openai: { apiKey: 'fixture-openai-vault-key', model: 'gpt-4o-mini' },
    _revision: 5
  }, {
    ai: { provider: 'nvidia', enableNvidia: true, maxTokens: 2048 },
    aiRevision: 5
  });

  const app = createMockApp();

  // 1. Normal user cannot read admin settings
  const userReadSettings = await supertest(app)
    .get('/api/admin/ai-settings')
    .set('Authorization', 'Bearer user-a-token');
  assert.ok([403, 404].includes(userReadSettings.status), 'Direct GET to admin ai-settings by normal user must be blocked (403/404)');

  // 2. Normal user cannot post to admin settings
  const userWriteSettings = await supertest(app)
    .post('/api/admin/ai-settings')
    .set('Authorization', 'Bearer user-a-token')
    .send({ provider: 'openai', expectedRevision: 5 });
  assert.equal(userWriteSettings.status, 403, 'Mutating AI settings by normal user must return 403 FORBIDDEN');

  // 3. Unverified email user cannot generate AI
  const unverifiedGen = await supertest(app)
    .post('/api/generate-content')
    .set('Authorization', 'Bearer unverified-token')
    .send({ operation: 'generate-summary', payload: { jobTitle: 'DevOps', sourceFacts: 'Maintained verified deployment runbooks.' } });
  assert.equal(unverifiedGen.status, 403, 'Unverified email user must be rejected with 403');
  assert.equal(unverifiedGen.body.error.code, 'EMAIL_VERIFICATION_REQUIRED');

  // 4. Admin loading settings receives masked status with ZERO plain-text secret keys
  const adminLoaded = await loadAiAdminSettings();
  assert.equal(adminLoaded.configuredProviders.nvidia, true);
  assert.equal(adminLoaded.configuredProviders.openai, true);
  assert.equal(adminLoaded.credentialSources.nvidia, 'mariadb-secret-store');
  assert.equal(adminLoaded.credentialSources.openai, 'mariadb-secret-store');
  assert.equal(adminLoaded.settings.nvidiaApiKey, undefined, 'Secret key must never appear in admin settings response');
  assert.equal(adminLoaded.settings.openaiApiKey, undefined, 'Secret key must never appear in admin settings response');

  // 5. Normal user AI response headers contain provider info but ZERO secret tokens
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: '{"summary":"Staff Engineer. Maintained service runbooks.","sourceExcerpts":["Maintained service runbooks"]}' } }]
    })
  });
  try {
    const userGen = await supertest(app)
      .post('/api/generate-content')
      .set('Authorization', 'Bearer user-a-token')
      .send({
        operation: 'generate-summary',
        payload: { jobTitle: 'Staff Engineer', sourceFacts: 'Maintained service runbooks' },
      });
    assert.equal(userGen.status, 200);
    assert.equal(userGen.headers['x-ai-provider'], 'nvidia');
    assert.equal(userGen.headers['x-ai-model'], 'meta/llama-3.2-11b-vision-instruct');
    assert.equal(userGen.headers['x-ai-grounding'], 'source-validated');
    assert.equal(userGen.headers['authorization'], undefined);
  } finally {
    global.fetch = originalFetch;
  }
});

test('Acceptance Gate 5: Behavioral Cache Invalidation & Dynamic Model Switch Verification', async () => {
  seedMariaDbSettingsContract({
    nvidia: { apiKey: 'nvapi-test', model: 'meta/llama-3.2-11b-vision-instruct' },
    openai: { apiKey: 'sk-test', model: 'gpt-4o-mini' },
    _revision: 1
  }, {
    ai: { provider: 'nvidia', nvidiaModel: 'meta/llama-3.2-11b-vision-instruct', enableNvidia: true, enableOpenai: true, enableFallback: true, maxTokens: 2048 },
    aiRevision: 1
  });

  let calledModel = '';
  const trackingFetch = async (url, options) => {
    const body = JSON.parse(options.body);
    calledModel = body.model;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: '{"summary": "Model test output"}' } }]
      })
    };
  };

  // Step 1: Initial AI generation reads cached config (model = llama-3.1-8b)
  let config1 = await loadProviderConfiguration({});
  await generateWithProviders({ prompt: 'p', configuration: config1, operation: 'generate-summary', fetchImpl: trackingFetch });
  assert.equal(calledModel, 'meta/llama-3.2-11b-vision-instruct');

  // Step 2: Admin updates the authoritative MariaDB setting to a custom model.
  await saveAiAdminSettings({
    admin: mockAdmin,
    input: {
      provider: 'nvidia',
      nvidiaModel: 'meta/llama-3.3-70b-instruct',
      enableNvidia: true,
      enableFallback: true
    },
    expectedRevision: 1,
    actorUid: 'admin-1',
    requestId: 'req-cache-purge-test'
  });

  // Step 3: Subsequent loadProviderConfiguration immediately reads new model from flushed cache
  let config2 = await loadProviderConfiguration({});
  await generateWithProviders({ prompt: 'p', configuration: config2, operation: 'generate-summary', fetchImpl: trackingFetch });
  assert.equal(calledModel, 'meta/llama-3.3-70b-instruct', 'Subsequent AI request must immediately use the newly updated model');
});
